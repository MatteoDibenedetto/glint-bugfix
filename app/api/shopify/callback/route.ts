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

    // Generate a magiclink — we use the OTP token from the response, NOT the
    // action_link, so we never have to follow an HTTP redirect server-side.
    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: shopInfo.email,
      })

    if (linkError || !linkData.properties?.email_otp) {
      console.error('[shopify/callback] generateLink failed:', linkError, linkData)
      throw new Error('generateLink: ' + (linkError?.message ?? 'no email_otp'))
    }

    // Verify the OTP server-side using the public anon client. This returns a
    // session directly (access_token + refresh_token) — no redirect chasing.
    const { createClient: createPublicClient } = await import('@supabase/supabase-js')
    const supabasePublic = createPublicClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: otpData, error: otpError } = await supabasePublic.auth.verifyOtp({
      email: shopInfo.email,
      token: linkData.properties.email_otp,
      type: 'magiclink',
    })

    if (otpError || !otpData.session) {
      console.error('[shopify/callback] verifyOtp failed:', otpError, otpData)
      throw new Error('verifyOtp: ' + (otpError?.message ?? 'no session'))
    }

    cookieStore.delete('shopify_oauth_state')
    cookieStore.delete('shopify_shop')

    // Build redirect to /dashboard and stamp the session cookies on it via @supabase/ssr
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

    await supabaseSSR.auth.setSession({
      access_token: otpData.session.access_token,
      refresh_token: otpData.session.refresh_token,
    })

    console.log('[shopify/callback] session set, redirecting to /dashboard')
    return response
  } catch (err) {
    console.error('[shopify/callback] fatal error:', err)
    const msg = err instanceof Error ? err.message : 'unknown'
    return NextResponse.redirect(new URL(`/?error=auth_failed&detail=${encodeURIComponent(msg)}`, request.url))
  }
}
