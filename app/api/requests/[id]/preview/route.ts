import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { createPreviewTheme, themePreviewUrl } from '@/lib/shopify/theme'
import { decryptToken } from '@/lib/crypto/tokens'
import type { FileFix } from '@/types'

// Duplicating a theme is server-side but not instant; allow room to poll.
export const maxDuration = 300

const STAFF_ROLES = ['admin', 'frontend_dev', 'backend_dev']

const REVIEWABLE = ['ai_completed', 'in_review', 'changes_requested', 'approved']

/**
 * Builds a preview of the proposed fix so a reviewer can see it running on the
 * real storefront before it touches the published theme.
 *
 * The preview is a copy of the live theme with the fix applied. It is temporary:
 * the deploy route deletes it once the fix has been applied for real.
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

  if (!REVIEWABLE.includes(bugRequest.status)) {
    return NextResponse.json(
      { error: `Non si può creare un'anteprima nello stato ${bugRequest.status}` },
      { status: 409 }
    )
  }

  const store = bugRequest.store
  if (!store?.shopify_access_token) {
    return NextResponse.json({ error: 'Store not connected' }, { status: 400 })
  }

  // Preview whatever the reviewer would deploy: their edits if they made any.
  const fixes = (bugRequest.approved_fix ?? bugRequest.ai_fix_suggestion) as FileFix[] | null
  if (!fixes?.length) {
    return NextResponse.json({ error: 'No fix to preview' }, { status: 400 })
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
    const theme = await createPreviewTheme(store.shop_domain, accessToken, fixes, {
      // Reuse a preview theme from an earlier attempt instead of piling up
      // copies on the merchant's store.
      existingThemeId: bugRequest.staging_theme_id,
      onThemeCreated: async (created) => {
        await supabaseAdmin
          .from('bug_requests')
          .update({ staging_theme_id: created.id, staging_theme_name: created.name })
          .eq('id', id)
      },
    })

    const previewUrl = themePreviewUrl(store.shop_domain, theme.id)

    await supabaseAdmin
      .from('bug_requests')
      .update({
        staging_theme_id: theme.id,
        staging_theme_name: theme.name,
        preview_url: previewUrl,
      })
      .eq('id', id)

    return NextResponse.json({
      preview_url: previewUrl,
      theme_id: theme.id,
      theme_name: theme.name,
    })
  } catch (err) {
    console.error(`[preview] ${id} failed:`, err)
    return NextResponse.json(
      {
        error: "Creazione anteprima fallita.",
        detail: err instanceof Error ? err.message : 'unknown',
      },
      { status: 500 }
    )
  }
}
