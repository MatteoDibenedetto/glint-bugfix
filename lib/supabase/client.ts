import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // PKCE (the default) rather than implicit: the OAuth code is exchanged
    // server-side in /auth/staff/callback, so tokens never touch the URL and
    // the session cookies are httpOnly. @supabase/ssr keeps the code verifier
    // in a cookie, which is what lets the route handler complete the exchange.
    { auth: { detectSessionInUrl: true } }
  )
}
