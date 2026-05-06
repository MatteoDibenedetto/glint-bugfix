import { NextRequest, NextResponse } from 'next/server'
import { buildLoginAuthUrl, validateShopDomain } from '@/lib/shopify/auth'
import { cookies } from 'next/headers'
import crypto from 'crypto'

export async function GET(request: NextRequest) {
  const shop = request.nextUrl.searchParams.get('shop')

  if (!shop || !validateShopDomain(shop)) {
    return NextResponse.redirect(new URL('/?error=invalid_shop', request.url))
  }

  const state = crypto.randomBytes(16).toString('hex')
  const cookieStore = await cookies()
  const opts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600,
    path: '/',
  }
  cookieStore.set('shopify_oauth_state', state, opts)
  cookieStore.set('shopify_shop', shop, opts)

  return NextResponse.redirect(buildLoginAuthUrl(shop, state))
}
