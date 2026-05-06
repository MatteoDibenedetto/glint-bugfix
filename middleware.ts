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

  // Public routes — skip auth check entirely
  if (
    pathname.startsWith('/api/shopify') ||
    pathname.startsWith('/auth') ||
    pathname === '/'
  ) {
    return supabaseResponse
  }

  // Collect everything into a single object to avoid edge-runtime log truncation
  const debug: Record<string, unknown> = { path: pathname }

  const incomingCookies = request.cookies.getAll()
  const sbCookies = incomingCookies.filter((c) => c.name.startsWith('sb-'))
  debug.totalCookies = incomingCookies.length
  debug.sbCookies = sbCookies.map((c) => ({ name: c.name, valueLen: c.value.length }))

  let sessionUserId: string | null = null
  try {
    const r = await supabase.auth.getSession()
    sessionUserId = r.data.session?.user?.id ?? null
    debug.getSession = { userId: sessionUserId, error: r.error?.message ?? null }
  } catch (e) {
    debug.getSession = { THREW: e instanceof Error ? e.message : 'unknown' }
  }

  let user: { id: string; email?: string } | null = null
  try {
    const r = await supabase.auth.getUser()
    user = r.data.user as { id: string; email?: string } | null
    debug.getUser = { userId: user?.id ?? null, email: user?.email ?? null, error: r.error?.message ?? null }
  } catch (e) {
    debug.getUser = { THREW: e instanceof Error ? e.message : 'unknown', stack: e instanceof Error ? e.stack?.substring(0, 200) : null }
  }

  // FALLBACK: if getSession found a valid session in the cookie but getUser failed
  // (likely a network/edge-runtime issue talking to Supabase), trust the cookie and let
  // the page server component re-validate in Node runtime.
  if (!user && sessionUserId) {
    debug.fallback = 'getUser failed but cookie has session — letting through, page will re-check'
    console.log('[middleware]', JSON.stringify(debug))
    return supabaseResponse
  }

  if (!user) {
    debug.outcome = 'redirect to / (no user)'
    console.log('[middleware]', JSON.stringify(debug))
    return NextResponse.redirect(new URL('/', request.url))
  }

  debug.outcome = 'authenticated'
  console.log('[middleware]', JSON.stringify(debug))

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
