import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { pathname } = request.nextUrl

  // Public routes — skip getUser() entirely to avoid extra latency
  if (
    pathname.startsWith('/api/shopify') ||
    pathname.startsWith('/auth') ||
    pathname === '/'
  ) {
    return supabaseResponse
  }

  // Log all incoming cookies for debugging /dashboard auth
  const incomingCookies = request.cookies.getAll()
  const sbCookies = incomingCookies.filter((c) => c.name.startsWith('sb-'))
  console.log(
    `[middleware] path=${pathname}` +
    ` totalCookies=${incomingCookies.length}` +
    ` sbCookies=${JSON.stringify(sbCookies.map((c) => ({ name: c.name, valueLen: c.value.length, valuePrefix: c.value.substring(0, 30) })))}`
  )

  // First, try getSession (cookie-only, no network) to see if cookie is parseable
  let sessionFromCookie: unknown = null
  let sessionFromCookieError: string | null = null
  try {
    const r = await supabase.auth.getSession()
    sessionFromCookie = r.data.session
      ? { userId: r.data.session.user?.id, email: r.data.session.user?.email, expiresAt: r.data.session.expires_at }
      : null
    sessionFromCookieError = r.error?.message ?? null
  } catch (e) {
    sessionFromCookieError = e instanceof Error ? `THREW: ${e.message}` : 'THREW: unknown'
  }
  console.log(`[middleware] path=${pathname} getSession: ${JSON.stringify(sessionFromCookie)} error=${sessionFromCookieError}`)

  // Then try getUser which does a network call to Supabase
  let user: { id: string; email?: string } | null = null
  let getUserError: string | null = null
  try {
    const r = await supabase.auth.getUser()
    user = r.data.user as { id: string; email?: string } | null
    getUserError = r.error?.message ?? null
  } catch (e) {
    getUserError = e instanceof Error ? `THREW: ${e.message} | stack: ${e.stack?.substring(0, 200)}` : 'THREW: unknown'
  }
  console.log(
    `[middleware] path=${pathname} getUser:` +
    ` userId=${user?.id ?? 'null'}` +
    ` email=${user?.email ?? 'null'}` +
    ` error=${getUserError ?? 'none'}`
  )

  // Require auth for protected routes
  if (!user) {
    console.log(`[middleware] path=${pathname} -> redirect to / (no user)`)
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Admin-only routes
  if (pathname.startsWith('/admin')) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'frontend_dev', 'backend_dev', 'store_manager'].includes(profile.role)) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
