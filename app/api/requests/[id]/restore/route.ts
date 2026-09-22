import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { restoreLiveFiles, type FileBackup } from '@/lib/shopify/theme'
import { decryptToken } from '@/lib/crypto/tokens'

export const maxDuration = 300

const STAFF_ROLES = ['admin', 'frontend_dev', 'backend_dev']

/**
 * Puts the published theme back the way it was before a fix was applied.
 *
 * The backup is the contents captured immediately before the write, so this
 * undoes our own change and nothing else. Anything the merchant edited on the
 * theme afterwards would be overwritten too, which is why the UI says when the
 * fix was applied.
 */
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

  if (!profile || !STAFF_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: bugRequest, error } = await supabase
    .from('bug_requests')
    .select('*, store:stores(*)')
    .eq('id', id)
    .single()

  if (error || !bugRequest) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  const backup = bugRequest.live_backup as FileBackup[] | null
  if (!backup?.length) {
    return NextResponse.json(
      { error: 'Nessun backup disponibile per questa richiesta' },
      { status: 409 }
    )
  }

  const store = bugRequest.store
  if (!store?.shopify_access_token) {
    return NextResponse.json({ error: 'Store not connected' }, { status: 400 })
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

  try {
    const { restored, needsManualRemoval } = await restoreLiveFiles(
      store.shop_domain,
      accessToken,
      backup
    )

    const supabaseAdmin = await createAdminClient()
    await supabaseAdmin
      .from('bug_requests')
      .update({ restored_at: new Date().toISOString(), status: 'in_review' })
      .eq('id', id)

    return NextResponse.json({ restored, needs_manual_removal: needsManualRemoval })
  } catch (err) {
    console.error(`[restore] ${id} failed:`, err)
    return NextResponse.json(
      {
        error: 'Ripristino fallito.',
        detail: err instanceof Error ? err.message : 'unknown',
      },
      { status: 500 }
    )
  }
}
