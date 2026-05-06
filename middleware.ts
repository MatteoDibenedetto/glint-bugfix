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

  // Public routes & all non-admin protected routes: skip auth check in middleware.
  // Auth is enforced inside the page server components (Node runtime), which is
  // more reliable than getUser() in Edge runtime (which has been silently failing).
  if (!pathname.startsWith('/admin')) {
    return supabaseResponse
  }

  // Admin-only branch — uses getUser() to validate, but if it fails for any reason
  // we let through and the admin page will re-check + redirect appropriately.
  let user: { id: string; email?: string } | null = null
  try {
    const r = await supabase.auth.getUser()
    user = r.data.user as { id: string; email?: string } | null
  } catch {
    // network failure in edge runtime — let through; admin page enforces auth
    return supabaseResponse
  }

  if (!user) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'frontend_dev', 'backend_dev', 'store_manager'].includes(profile.role)) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
