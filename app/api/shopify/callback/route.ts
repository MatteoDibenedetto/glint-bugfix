import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { exchangeStoreCode, getShopInfo, verifyHmac } from '@/lib/shopify/auth'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const cookieStore = await cookies()

  const storedState = cookieStore.get('shopify_oauth_state')?.value
  const storedShop = cookieStore.get('shopify_shop')?.value
  const returnedState = searchParams.get('state')
  const code = searchParams.get('code')
  const shop = searchParams.get('shop')

  if (!storedState || storedState !== returnedState) {
    return NextResponse.redirect(new URL('/?error=invalid_state', request.url))
  }
  if (!storedShop || storedShop !== shop) {
    return NextResponse.redirect(new URL('/?error=invalid_shop', request.url))
  }
  if (!verifyHmac(searchParams, process.env.SHOPIFY_API_SECRET!)) {
    return NextResponse.redirect(new URL('/?error=invalid_hmac', request.url))
  }
  if (!code || !shop) {
    return NextResponse.redirect(new URL('/?error=missing_params', request.url))
  }

  try {
    const accessToken = await exchangeStoreCode(shop, code)
    const shopInfo = await getShopInfo(shop, accessToken)

    const supabaseAdmin = await createAdminClient()

    // Find or create user by shop email
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
    const existing = existingUsers.users.find((u) => u.email === shopInfo.email)

    let userId: string
    if (existing) {
      userId = existing.id
    } else {
      const { data: newUser, error } = await supabaseAdmin.auth.admin.createUser({
        email: shopInfo.email,
        email_confirm: true,
        user_metadata: { shop_domain: shop, shop_name: shopInfo.name },
      })
      if (error || !newUser.user) throw new Error(error?.message)
      userId = newUser.user.id
    }

    // Upsert profile
    await supabaseAdmin.from('profiles').upsert(
      { id: userId, email: shopInfo.email },
      { onConflict: 'id', ignoreDuplicates: true }
    )

    // Upsert store with access token
    await supabaseAdmin.from('stores').upsert(
      {
        shop_domain: shop,
        shop_name: shopInfo.name,
        owner_id: userId,
        shopify_access_token: accessToken,
      },
      { onConflict: 'shop_domain' }
    )

    // Generate magic link (signs user in without sending email)
    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: shopInfo.email,
        options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback` },
      })

    if (linkError || !linkData.properties?.action_link) {
      throw new Error(linkError?.message)
    }

    cookieStore.delete('shopify_oauth_state')
    cookieStore.delete('shopify_shop')

    return NextResponse.redirect(linkData.properties.action_link)
  } catch (err) {
    console.error('Shopify OAuth error:', err)
    return NextResponse.redirect(new URL('/?error=auth_failed', request.url))
  }
}
