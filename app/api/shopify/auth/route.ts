import { NextRequest, NextResponse } from 'next/server'
import { buildShopifyAuthUrl, validateShopDomain } from '@/lib/shopify/auth'
import { cookies } from 'next/headers'
import crypto from 'crypto'

export async function GET(request: NextRequest) {
  const shop = request.nextUrl.searchParams.get('shop')

  if (!shop || !validateShopDomain(shop)) {
    return NextResponse.json({ error: 'Invalid shop domain' }, { status: 400 })
  }

  const state = crypto.randomBytes(16).toString('hex')
  const cookieStore = await cookies()
  cookieStore.set('shopify_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600,
    path: '/',
  })
  cookieStore.set('shopify_shop', shop, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600,
    path: '/',
  })

  const authUrl = buildShopifyAuthUrl(shop, state)
  return NextResponse.redirect(authUrl)
}
