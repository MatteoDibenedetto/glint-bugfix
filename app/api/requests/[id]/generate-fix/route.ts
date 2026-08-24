import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getMainTheme } from '@/lib/shopify/theme'
import { selectRelevantFiles } from '@/lib/shopify/file-selection'
import { generateThemeFix } from '@/lib/anthropic/fix-generator'
import { notifyDevAssigned, notifyStoreManager } from '@/lib/email/sender'
import type { Profile, BugRequest } from '@/types'
import { decryptToken } from '@/lib/crypto/tokens'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isStaff = profile && ['admin', 'frontend_dev', 'backend_dev'].includes(profile.role)
  if (!isStaff) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Fetch request with store info
  const { data: bugRequest, error: reqError } = await supabase
    .from('bug_requests')
    .select(`*, store:stores(*)`)
    .eq('id', id)
    .single()

  if (reqError || !bugRequest) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  const store = bugRequest.store
  if (!store?.shopify_access_token) {
    return NextResponse.json({ error: 'Store not connected to Shopify' }, { status: 400 })
  }

  // Decrypt before claiming: a key/config failure here must not leave the
  // request stranded in ai_processing with nothing to reset it.
  let accessToken: string
  try {
    accessToken = decryptToken(store.shopify_access_token)
  } catch (err) {
    return NextResponse.json(
      { error: 'Could not read the stored Shopify token', detail: err instanceof Error ? err.message : 'unknown' },
      { status: 500 }
    )
  }

  // Claim the request atomically: the status check and the transition have to be
  // one operation, or two devs clicking at the same moment both generate a fix
  // (and both bill an Opus call).
  const { data: claimed, error: claimError } = await supabase
    .from('bug_requests')
    .update({ status: 'ai_processing' })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id')

  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 500 })
  }
  if (!claimed?.length) {
    return NextResponse.json(
      { error: 'Fix already generated or in progress' },
      { status: 409 }
    )
  }

  try {
    // Fetch theme files
    const mainTheme = await getMainTheme(store.shop_domain, accessToken)
    const selection = await selectRelevantFiles(
      store.shop_domain,
      accessToken,
      mainTheme.id,
      bugRequest.description
    )

    console.log(
      `[generate-fix] ${id}: ${selection.strategy} picked ` +
        `${selection.files.length} file(s)` +
        (selection.reason ? ` — ${selection.reason}` : '')
    )

    if (selection.excluded.length) {
      console.warn(
        `[generate-fix] ${id}: excluded oversized files from context: ` +
          selection.excluded.join(', ')
      )
    }

    // Generate fix with Claude
    const { fixes, fix_type, classification_reason } = await generateThemeFix(
      bugRequest.description,
      selection.files
    )

    // Determine which devs to notify based on fix type
    const supabaseAdmin = await createAdminClient()
    const devRole = fix_type === 'backend' ? 'backend_dev' : 'frontend_dev'

    const { data: devs } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('role', devRole)

    // Auto-assign to first available dev (admin can reassign later)
    const assignedDev = devs && devs.length > 0 ? devs[0] : null

    // Update request
    await supabaseAdmin
      .from('bug_requests')
      .update({
        status: 'ai_completed',
        fix_type,
        ai_classification_reason: classification_reason,
        ai_fix_suggestion: fixes,
        assigned_dev_id: assignedDev?.id || null,
      })
      .eq('id', id)

    // Fetch full request for email context
    const { data: updatedRequest } = await supabaseAdmin
      .from('bug_requests')
      .select('*')
      .eq('id', id)
      .single()

    // Notify assigned dev
    if (assignedDev && updatedRequest) {
      await notifyDevAssigned(assignedDev as Profile, updatedRequest as BugRequest)
      await supabaseAdmin.from('notification_logs').insert({
        bug_request_id: id,
        user_id: assignedDev.id,
        email_to: assignedDev.email,
        notification_type: 'dev_assigned',
      })
    }

    // Notify store manager
    if (store.store_manager_id && updatedRequest) {
      const { data: manager } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', store.store_manager_id)
        .single()

      if (manager) {
        await notifyStoreManager(manager as Profile, updatedRequest as BugRequest)
        await supabaseAdmin.from('notification_logs').insert({
          bug_request_id: id,
          user_id: manager.id,
          email_to: manager.email,
          notification_type: 'store_manager_notified',
        })
      }
    }

    return NextResponse.json({
      fix_type,
      classification_reason,
      fixes_count: fixes.length,
      assigned_dev: assignedDev?.email || null,
    })
  } catch (err) {
    console.error('Fix generation error:', err)
    // Reset status on failure
    await supabase
      .from('bug_requests')
      .update({ status: 'pending' })
      .eq('id', id)
    return NextResponse.json(
      {
        error: 'Fix generation failed.',
        detail: err instanceof Error ? err.message : 'unknown',
      },
      { status: 500 }
    )
  }
}
