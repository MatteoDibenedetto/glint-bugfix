const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY!
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET!
const APP_URL = process.env.NEXT_PUBLIC_APP_URL!

const SCOPES = 'read_themes,write_themes'

export function buildShopifyAuthUrl(shop: string, state: string): string {
  const redirectUri = `${APP_URL}/api/shopify/callback`
  const params = new URLSearchParams({
    client_id: SHOPIFY_API_KEY,
    scope: SCOPES,
    redirect_uri: redirectUri,
    state,
    'grant_options[]': 'per-user',
  })
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`
}

export async function exchangeCodeForToken(
  shop: string,
  code: string
): Promise<string> {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: SHOPIFY_API_KEY,
      client_secret: SHOPIFY_API_SECRET,
      code,
    }),
  })
  if (!response.ok) {
    throw new Error(`Shopify token exchange failed: ${response.statusText}`)
  }
  const data = await response.json()
  return data.access_token as string
}

export async function getShopInfo(shop: string, accessToken: string) {
  const response = await fetch(`https://${shop}/admin/api/2024-10/shop.json`, {
    headers: { 'X-Shopify-Access-Token': accessToken },
  })
  if (!response.ok) throw new Error('Failed to fetch shop info')
  const data = await response.json()
  return data.shop as {
    id: number
    name: string
    email: string
    domain: string
    myshopify_domain: string
  }
}

export function validateShopDomain(shop: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop)
}

export function verifyHmac(params: URLSearchParams, secret: string): boolean {
  const hmacParam = params.get('hmac')
  if (!hmacParam) return false

  const sortedParams = new URLSearchParams()
  params.forEach((value, key) => {
    if (key !== 'hmac') sortedParams.append(key, value)
  })

  const message = sortedParams.toString()

  // Node.js crypto — runs only on server
  const crypto = require('crypto')
  const digest = crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex')

  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacParam))
}
