import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { exchangeStoreCode, getShopInfo, verifyHmac } from '@/lib/shopify/auth'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const cookieStore = await cookies()

  const storedState = cookieStore.get('shopify_store_state')?.value
  const returnedState = searchParams.get('state')
  const code = searchParams.get('code')
  const shop = searchParams.get('shop')

  if (!storedState || storedState !== returnedState || !code || !shop) {
    return NextResponse.redirect(new URL('/dashboard?error=store_auth_failed', request.url))
  }

  if (!verifyHmac(searchParams, process.env.SHOPIFY_API_SECRET!)) {
    return NextResponse.redirect(new URL('/dashboard?error=store_auth_failed', request.url))
  }

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.redirect(new URL('/', request.url))

    const accessToken = await exchangeStoreCode(shop, code)
    const shopInfo = await getShopInfo(shop, accessToken)

    const supabaseAdmin = await createAdminClient()
    await supabaseAdmin.from('stores').upsert({
      shop_domain: shop,
      shop_name: shopInfo.name,
      owner_id: user.id,
      shopify_access_token: accessToken,
    }, { onConflict: 'shop_domain' })

    cookieStore.delete('shopify_store_state')

    return NextResponse.redirect(new URL('/dashboard?store_connected=1', request.url))
  } catch (err) {
    console.error('Store OAuth error:', err)
    return NextResponse.redirect(new URL('/dashboard?error=store_auth_failed', request.url))
  }
}
