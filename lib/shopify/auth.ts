import crypto from 'crypto'
import type { AppCredentials } from './apps'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!

/**
 * Scopes a connector app is provisioned with. Each app also records its own
 * scopes in the registry, because they are deployed per app and can drift;
 * this constant is only the default used when creating a new one.
 */
export const STORE_SCOPES = 'read_themes,write_themes'

// ─── PKCE helpers ────────────────────────────────────────────────────────────

export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url')
}

export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

// ─── Account OAuth (accounts.shopify.com) ────────────────────────────────────
//
// Identity only — it says WHO is signing in, not which store they own, and it
// is currently unused (nothing imports these two functions).
//
// It deliberately stays outside the per-store registry: this flow starts
// before any shop domain is known, so there is no way to pick a connector app
// from it. Switching it on requires ONE dedicated login app in Glint's own
// organization, separate from the N per-client connector apps — hence the
// dedicated env vars below, which fall back to the old names so that nothing
// breaks before that app exists.

function loginAppCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.SHOPIFY_LOGIN_APP_KEY ?? process.env.SHOPIFY_API_KEY
  const clientSecret =
    process.env.SHOPIFY_LOGIN_APP_SECRET ?? process.env.SHOPIFY_API_SECRET
  if (!clientId || !clientSecret) {
    throw new Error(
      'Account OAuth needs SHOPIFY_LOGIN_APP_KEY / SHOPIFY_LOGIN_APP_SECRET ' +
        '(a single login app, not a per-client connector app)'
    )
  }
  return { clientId, clientSecret }
}

export function buildAccountAuthUrl(state: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    client_id: loginAppCredentials().clientId,
    scope: 'openid email profile',
    redirect_uri: `${APP_URL}/api/shopify/callback`,
    state,
    response_type: 'code',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })
  return `https://accounts.shopify.com/oauth/authorize?${params}`
}

export async function exchangeAccountCode(
  code: string,
  codeVerifier: string
): Promise<{ email: string; firstName: string; lastName: string }> {
  const loginApp = loginAppCredentials()

  const res = await fetch('https://accounts.shopify.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: loginApp.clientId,
      client_secret: loginApp.clientSecret,
      code,
      redirect_uri: `${APP_URL}/api/shopify/callback`,
      code_verifier: codeVerifier,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Account token exchange failed: ${text}`)
  }

  const data = await res.json()

  // Decode id_token (JWT) payload — no signature verification needed here,
  // the token came directly from Shopify over HTTPS
  const payload = JSON.parse(
    Buffer.from(data.id_token.split('.')[1], 'base64url').toString('utf-8')
  )

  return {
    email: payload.email ?? '',
    firstName: payload.given_name ?? '',
    lastName: payload.family_name ?? '',
  }
}

// ─── Store OAuth ({shop}.myshopify.com) ──────────────────────────────────────
//
// Credentials are passed in rather than read from the environment: which app
// they belong to depends on the shop, because custom distribution means one
// app per client. Resolve them with getCredentialsForShop() from ./apps.

// Used for initial login
export function buildLoginAuthUrl(
  shop: string,
  state: string,
  creds: AppCredentials
): string {
  const params = new URLSearchParams({
    client_id: creds.clientId,
    scope: creds.scopes,
    redirect_uri: `${APP_URL}/api/shopify/callback`,
    state,
  })
  return `https://${shop}/admin/oauth/authorize?${params}`
}

// Used to connect an additional store from the dashboard
export function buildStoreAuthUrl(
  shop: string,
  state: string,
  creds: AppCredentials
): string {
  const params = new URLSearchParams({
    client_id: creds.clientId,
    scope: creds.scopes,
    redirect_uri: `${APP_URL}/api/shopify/store-callback`,
    state,
  })
  return `https://${shop}/admin/oauth/authorize?${params}`
}

export async function exchangeStoreCode(
  shop: string,
  code: string,
  creds: AppCredentials
): Promise<string> {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      code,
    }),
  })
  if (!res.ok) throw new Error(`Store token exchange failed: ${res.statusText}`)
  const data = await res.json()
  return data.access_token as string
}

export async function getShopInfo(shop: string, accessToken: string) {
  const res = await fetch(`https://${shop}/admin/api/2024-10/shop.json`, {
    headers: { 'X-Shopify-Access-Token': accessToken },
  })
  if (!res.ok) throw new Error('Failed to fetch shop info')
  const data = await res.json()
  return data.shop as { id: number; name: string; email: string; myshopify_domain: string }
}

export function validateShopDomain(shop: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop)
}

/**
 * Constant-time string compare. crypto.timingSafeEqual throws when the two
 * buffers differ in length, so the length check must come first.
 */
function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

/**
 * Validates the `hmac` query parameter on an OAuth callback.
 *
 * Shopify's algorithm: drop `hmac`, sort the remaining parameters by key, join
 * them as `key=value` with `&`, then HMAC-SHA256 and compare as hex.
 * URLSearchParams.toString() cannot be used to build the message — it keeps
 * insertion order rather than sorting, and re-encodes values.
 */
export function verifyHmac(params: URLSearchParams, secret: string): boolean {
  const provided = params.get('hmac')
  if (!provided) return false

  const message = [...params.entries()]
    .filter(([key]) => key !== 'hmac')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('&')

  const digest = crypto.createHmac('sha256', secret).update(message).digest('hex')
  return timingSafeEqualStrings(digest, provided)
}

/**
 * Validates the `X-Shopify-Hmac-Sha256` header on an incoming webhook.
 * Digest is base64 over the RAW request body — the body must not be parsed
 * and re-serialized before this runs.
 */
export function verifyWebhookHmac(
  rawBody: string,
  providedHmac: string | null,
  secret: string
): boolean {
  if (!providedHmac) return false
  const digest = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64')
  return timingSafeEqualStrings(digest, providedHmac)
}
