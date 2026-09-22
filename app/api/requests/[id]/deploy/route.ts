import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { applyFixToLiveTheme, deleteTheme } from '@/lib/shopify/theme'
import { notifyClientDeployed, notifyStoreManager } from '@/lib/email/sender'
import type { Profile, BugRequest, FileFix } from '@/types'
import { decryptToken } from '@/lib/crypto/tokens'

// Verifying, backing up and writing several theme files over the network.
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
    return NextResponse.json({ error: 'Il fix va approvato prima di applicarlo al tema live' }, { status: 409 })
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

  // Writing to the published theme is the point of no return for the
  // storefront, so the reviewer has to have looked at the preview first.
  if (!bugRequest.staging_theme_id) {
    return NextResponse.json(
      {
        error:
          "Crea prima l'anteprima: il fix non può essere applicato al tema live " +
          'senza che qualcuno lo abbia visto funzionare.',
      },
      { status: 409 }
    )
  }

  try {
    // Verifies each file against the live theme and returns what was there
    // before, which is the only rollback we have.
    const { theme, backup } = await applyFixToLiveTheme(
      store.shop_domain,
      accessToken,
      fixesToApply
    )

    await supabaseAdmin
      .from('bug_requests')
      .update({
        status: 'deployed',
        live_backup: backup,
        applied_at: new Date().toISOString(),
        restored_at: null,
      })
      .eq('id', id)

    // The preview has served its purpose; leaving it behind is the theme
    // clutter this flow exists to avoid. A failure here is not worth failing
    // the deploy over — the fix is already live.
    try {
      await deleteTheme(store.shop_domain, accessToken, bugRequest.staging_theme_id)
      await supabaseAdmin
        .from('bug_requests')
        .update({ staging_theme_id: null, staging_theme_name: null, preview_url: null })
        .eq('id', id)
    } catch (cleanupError) {
      console.warn(
        `[deploy] ${id}: fix applied but the preview theme could not be deleted:`,
        cleanupError instanceof Error ? cleanupError.message : cleanupError
      )
    }

    // Notify client
    const clientEmail = bugRequest.contact_email
    await notifyClientDeployed(clientEmail, bugRequest as BugRequest, theme.name)
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
      applied_to: theme.name,
      files: fixesToApply.map((f) => f.file),
    })
  } catch (err) {
    console.error(`[deploy] ${id} failed:`, err)
    return NextResponse.json(
      {
        error: 'Applicazione al tema live fallita.',
        detail: err instanceof Error ? err.message : 'unknown',
      },
      { status: 500 }
    )
  }
}
