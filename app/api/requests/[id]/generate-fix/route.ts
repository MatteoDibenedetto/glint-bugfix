import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getMainTheme, getRelevantThemeFiles } from '@/lib/shopify/theme'
import { generateThemeFix } from '@/lib/anthropic/fix-generator'
import { notifyDevAssigned, notifyStoreManager } from '@/lib/email/sender'
import type { Profile, BugRequest } from '@/types'

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

  if (bugRequest.status !== 'pending') {
    return NextResponse.json({ error: 'Fix already generated or in progress' }, { status: 409 })
  }

  const store = bugRequest.store
  if (!store?.shopify_access_token) {
    return NextResponse.json({ error: 'Store not connected to Shopify' }, { status: 400 })
  }

  // Mark as processing
  await supabase
    .from('bug_requests')
    .update({ status: 'ai_processing' })
    .eq('id', id)

  try {
    // Fetch theme files
    const mainTheme = await getMainTheme(store.shop_domain, store.shopify_access_token)
    const themeFiles = await getRelevantThemeFiles(
      store.shop_domain,
      store.shopify_access_token,
      mainTheme.id,
      bugRequest.description
    )

    // Generate fix with Claude
    const { fixes, fix_type, classification_reason } = await generateThemeFix(
      bugRequest.description,
      themeFiles
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
      { error: 'Fix generation failed. Try again.' },
      { status: 500 }
    )
  }
}
