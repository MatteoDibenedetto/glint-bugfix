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

  const {
    data: { user },
    error: getUserError,
  } = await supabase.auth.getUser()

  console.log(
    `[middleware] path=${pathname} getUser:` +
    ` userId=${user?.id ?? 'null'}` +
    ` email=${user?.email ?? 'null'}` +
    ` error=${getUserError?.message ?? 'none'}`
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
