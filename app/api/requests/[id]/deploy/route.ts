import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { applyFixToStagingTheme } from '@/lib/shopify/theme'
import { notifyClientDeployed, notifyStoreManager } from '@/lib/email/sender'
import type { Profile, BugRequest, FileFix } from '@/types'
import { decryptToken } from '@/lib/crypto/tokens'

// Duplicating a theme is server-side but not instant; allow room to poll.
export const maxDuration = 300

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

  const { data: bugRequest, error } = await supabase
    .from('bug_requests')
    .select(`*, store:stores(*), client:profiles!client_id(*)`)
    .eq('id', id)
    .single()

  if (error || !bugRequest) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  if (bugRequest.status !== 'approved') {
    return NextResponse.json({ error: 'Request must be approved before deploying' }, { status: 409 })
  }

  const store = bugRequest.store
  if (!store?.shopify_access_token) {
    return NextResponse.json({ error: 'Store not connected' }, { status: 400 })
  }

  const fixesToApply = (bugRequest.approved_fix ||
    bugRequest.ai_fix_suggestion) as FileFix[]

  if (!fixesToApply || fixesToApply.length === 0) {
    return NextResponse.json({ error: 'No fix to deploy' }, { status: 400 })
  }

  let accessToken: string
  try {
    accessToken = decryptToken(store.shopify_access_token)
  } catch (err) {
    return NextResponse.json(
      { error: 'Could not read the stored Shopify token', detail: err instanceof Error ? err.message : 'unknown' },
      { status: 500 }
    )
  }

  const supabaseAdmin = await createAdminClient()

  try {
    const stagingTheme = await applyFixToStagingTheme(
      store.shop_domain,
      accessToken,
      fixesToApply,
      {
        // Resume onto the theme created by a previous attempt that timed out,
        // instead of leaving an orphaned duplicate behind on every retry.
        existingThemeId: bugRequest.staging_theme_id,
        onThemeCreated: async (theme) => {
          await supabaseAdmin
            .from('bug_requests')
            .update({ staging_theme_id: theme.id, staging_theme_name: theme.name })
            .eq('id', id)
        },
      }
    )

    await supabaseAdmin
      .from('bug_requests')
      .update({
        status: 'deployed',
        staging_theme_id: stagingTheme.id,
        staging_theme_name: stagingTheme.name,
      })
      .eq('id', id)

    // Notify client
    const clientEmail = bugRequest.contact_email
    await notifyClientDeployed(
      clientEmail,
      bugRequest as BugRequest,
      stagingTheme.name
    )
    await supabaseAdmin.from('notification_logs').insert({
      bug_request_id: id,
      email_to: clientEmail,
      notification_type: 'client_deployed',
    })

    // Notify store manager
    if (store.store_manager_id) {
      const { data: manager } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', store.store_manager_id)
        .single()

      if (manager) {
        await notifyStoreManager(manager as Profile, { ...bugRequest, status: 'deployed' } as BugRequest)
      }
    }

    return NextResponse.json({
      staging_theme_id: stagingTheme.id,
      staging_theme_name: stagingTheme.name,
    })
  } catch (err) {
    console.error('Deploy error:', err)
    return NextResponse.json(
      {
        error: 'Deploy failed.',
        detail: err instanceof Error ? err.message : 'unknown',
      },
      { status: 500 }
    )
  }
}
