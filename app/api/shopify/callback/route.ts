import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
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

    // Exchange the magic link server-side: follow it with redirect:manual,
    // parse the tokens from the Location header, set session cookies directly
    // in the response so the middleware sees them immediately.
    const verifyRes = await fetch(linkData.properties.action_link, {
      redirect: 'manual',
    })

    const location = verifyRes.headers.get('location') ?? ''
    let accessToken: string | null = null
    let refreshToken: string | null = null

    try {
      const redirectUrl = new URL(location)
      // Tokens come in the hash fragment (implicit flow)
      const hashParams = new URLSearchParams(redirectUrl.hash.substring(1))
      accessToken = hashParams.get('access_token')
      refreshToken = hashParams.get('refresh_token')
      // Fallback: some Supabase versions put them in query params
      if (!accessToken) accessToken = redirectUrl.searchParams.get('access_token')
      if (!refreshToken) refreshToken = redirectUrl.searchParams.get('refresh_token')
    } catch {
      // location header was unparseable — fall through to error
    }

    if (!accessToken || !refreshToken) {
      throw new Error('Could not extract tokens from magic link redirect')
    }

    cookieStore.delete('shopify_oauth_state')
    cookieStore.delete('shopify_shop')

    // Build redirect to /dashboard and stamp the session cookies on it
    const response = NextResponse.redirect(new URL('/dashboard', request.url))

    const supabaseSSR = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => [],
          setAll: (cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) => {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options ?? {})
            })
          },
        },
      }
    )

    await supabaseSSR.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })

    return response
  } catch (err) {
    console.error('Shopify OAuth error:', err)
    return NextResponse.redirect(new URL('/?error=auth_failed', request.url))
  }
}
