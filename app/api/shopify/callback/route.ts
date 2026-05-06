import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  exchangeCodeForToken,
  getShopInfo,
  verifyHmac,
} from '@/lib/shopify/auth'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const cookieStore = await cookies()

  const storedState = cookieStore.get('shopify_oauth_state')?.value
  const storedShop = cookieStore.get('shopify_shop')?.value
  const returnedState = searchParams.get('state')
  const code = searchParams.get('code')
  const shop = searchParams.get('shop')

  // Validate state
  if (!storedState || storedState !== returnedState) {
    return NextResponse.redirect(new URL('/?error=invalid_state', request.url))
  }

  // Validate shop matches
  if (!storedShop || storedShop !== shop) {
    return NextResponse.redirect(new URL('/?error=invalid_shop', request.url))
  }

  // Verify HMAC
  if (!verifyHmac(searchParams, process.env.SHOPIFY_API_SECRET!)) {
    return NextResponse.redirect(new URL('/?error=invalid_hmac', request.url))
  }

  if (!code || !shop) {
    return NextResponse.redirect(new URL('/?error=missing_params', request.url))
  }

  try {
    // Exchange code for access token
    const accessToken = await exchangeCodeForToken(shop, code)

    // Get shop details
    const shopInfo = await getShopInfo(shop, accessToken)

    const supabaseAdmin = await createAdminClient()

    // Create or find user by email
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
    const existingUser = existingUsers.users.find(
      (u) => u.email === shopInfo.email
    )

    let userId: string

    if (existingUser) {
      userId = existingUser.id
    } else {
      const { data: newUser, error } = await supabaseAdmin.auth.admin.createUser({
        email: shopInfo.email,
        email_confirm: true,
        user_metadata: { shop_domain: shop, shop_name: shopInfo.name },
      })
      if (error || !newUser.user) {
        throw new Error(`Failed to create user: ${error?.message}`)
      }
      userId = newUser.user.id
    }

    // Upsert profile
    await supabaseAdmin.from('profiles').upsert({
      id: userId,
      email: shopInfo.email,
    }, { onConflict: 'id', ignoreDuplicates: true })

    // Upsert store
    await supabaseAdmin.from('stores').upsert({
      shop_domain: shop,
      shop_name: shopInfo.name,
      owner_id: userId,
      shopify_access_token: accessToken,
    }, { onConflict: 'shop_domain' })

    // Generate magic link to sign user in (no email sent)
    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: shopInfo.email,
        options: {
          redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
        },
      })

    if (linkError || !linkData.properties?.action_link) {
      throw new Error(`Failed to generate login link: ${linkError?.message}`)
    }

    // Clean up OAuth cookies
    cookieStore.delete('shopify_oauth_state')
    cookieStore.delete('shopify_shop')

    // Redirect user to the magic link (auto-signs them in)
    return NextResponse.redirect(linkData.properties.action_link)
  } catch (err) {
    console.error('Shopify OAuth error:', err)
    return NextResponse.redirect(new URL('/?error=auth_failed', request.url))
  }
}
