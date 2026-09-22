import { createAdminClient } from '@/lib/supabase/server'
import { decryptToken } from '@/lib/crypto/tokens'

/**
 * Resolves which Shopify connector app serves a given shop.
 *
 * Custom distribution caps an app at one store (or one Plus organization), so
 * every client gets its own app with its own credentials. Nothing can be read
 * from the environment any more: the caller has to say which shop it is acting
 * for, and we look the credentials up.
 *
 * The lookup goes through app_store_assignments rather than `stores` on
 * purpose — during the very first OAuth the store row does not exist yet, but
 * the assignment does, because a dev created it together with the app.
 */

export type AppCredentials = {
  appId: string
  clientId: string
  clientSecret: string
  scopes: string
}

/** Reads the secret for an app id. Service role only — never call from the client. */
async function loadSecret(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  appId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('shopify_app_secrets')
    .select('client_secret_encrypted')
    .eq('app_id', appId)
    .maybeSingle()

  if (error || !data) return null
  return decryptToken(data.client_secret_encrypted)
}

/**
 * Credentials for the app assigned to `shop`, or null if no app is assigned.
 *
 * A null here during OAuth means a dev never assigned the store, which is a
 * configuration mistake rather than an attack — but it is also exactly what an
 * unsolicited OAuth callback for an unknown shop looks like, so callers must
 * treat it as a hard failure either way.
 */
export async function getCredentialsForShop(
  shop: string
): Promise<AppCredentials | null> {
  const supabase = await createAdminClient()

  const { data, error } = await supabase
    .from('app_store_assignments')
    .select('app_id, shopify_apps!inner(client_id, scopes)')
    .eq('shop_domain', shop)
    .maybeSingle()

  if (error || !data) return null

  // PostgREST types an !inner embed as an array even when the FK makes it a
  // single row, so normalise before reading.
  const app = Array.isArray(data.shopify_apps) ? data.shopify_apps[0] : data.shopify_apps
  if (!app) return null

  const clientSecret = await loadSecret(supabase, data.app_id)
  if (!clientSecret) return null

  return {
    appId: data.app_id,
    clientId: app.client_id,
    clientSecret,
    scopes: app.scopes,
  }
}

/** Same, keyed by client_id — for callbacks that carry the app rather than the shop. */
export async function getCredentialsByClientId(
  clientId: string
): Promise<AppCredentials | null> {
  const supabase = await createAdminClient()

  const { data, error } = await supabase
    .from('shopify_apps')
    .select('id, client_id, scopes')
    .eq('client_id', clientId)
    .maybeSingle()

  if (error || !data) return null

  const clientSecret = await loadSecret(supabase, data.id)
  if (!clientSecret) return null

  return { appId: data.id, clientId: data.client_id, clientSecret, scopes: data.scopes }
}

/**
 * Marks an app as installed and links the store row to the registry. Called
 * once OAuth has completed. Best-effort: bookkeeping must never be the reason
 * a merchant fails to connect.
 */
export async function markAppInstalled(appId: string, shop: string): Promise<void> {
  try {
    const supabase = await createAdminClient()

    const { data: app } = await supabase
      .from('shopify_apps')
      .select('org_id')
      .eq('id', appId)
      .maybeSingle()

    await supabase
      .from('shopify_apps')
      .update({
        status: 'installed',
        install_link: null,
        install_link_generated_at: null,
        install_link_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', appId)

    await supabase
      .from('stores')
      .update({ app_id: appId, org_id: app?.org_id ?? null })
      .eq('shop_domain', shop)
  } catch (err) {
    console.error('[apps] markAppInstalled failed:', err)
  }
}
