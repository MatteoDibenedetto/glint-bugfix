import { NextRequest, NextResponse } from 'next/server'
import { buildStoreAuthUrl, validateShopDomain } from '@/lib/shopify/auth'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import crypto from 'crypto'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/', request.url))

  const shop = request.nextUrl.searchParams.get('shop')
  if (!shop || !validateShopDomain(shop)) {
    return NextResponse.redirect(new URL('/dashboard?error=invalid_shop', request.url))
  }

  const state = crypto.randomBytes(16).toString('hex')
  const cookieStore = await cookies()
  cookieStore.set('shopify_store_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600,
    path: '/',
  })

  return NextResponse.redirect(buildStoreAuthUrl(shop, state))
}
