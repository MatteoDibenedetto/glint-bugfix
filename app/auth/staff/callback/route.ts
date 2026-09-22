import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isStaffEmail } from '@/lib/auth/staff-domains'

/**
 * Completes the Google sign-in for Glint staff.
 *
 * Supabase redirects here with `?code=…` (PKCE); we exchange it for a session
 * server-side so the tokens land in httpOnly cookies rather than the URL.
 *
 * The domain allowlist is enforced in Postgres by handle_new_user, which aborts
 * account creation for a disallowed domain. The check repeated here covers an
 * account that already existed when the allowlist changed, and turns a raw
 * database error into a readable message.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)

  const code = searchParams.get('code')
  const oauthError = searchParams.get('error')
  const oauthErrorDescription = searchParams.get('error_description')

  if (oauthError) {
    // Google itself refused or the user cancelled on the consent screen.
    return NextResponse.redirect(
      `${origin}/?error=oauth_failed&detail=${encodeURIComponent(
        oauthErrorDescription ?? oauthError
      )}`
    )
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/?error=oauth_failed&detail=missing_code`)
  }

  const supabase = await createClient()

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
  if (exchangeError) {
    // A domain rejected by the trigger surfaces here as a database error.
    const isDomainRejection = /staff domains|check_violation|Database error/i.test(
      exchangeError.message
    )

    // The PKCE verifier is a cookie on the origin the user clicked from. If it
    // is missing, the flow started somewhere else: Supabase falls back to the
    // Site URL when `redirect_to` is not in the Redirect URLs allowlist, so a
    // sign-in begun on e.g. localhost lands here on the production origin.
    const isVerifierMissing =
      exchangeError.name === 'AuthPKCECodeVerifierMissingError' ||
      /code verifier not found/i.test(exchangeError.message)

    if (isVerifierMissing) {
      console.error(
        `[auth/staff] no PKCE verifier cookie at ${origin}. The sign-in most likely ` +
          'started on another origin: add that origin to Supabase > Authentication > ' +
          'URL Configuration > Redirect URLs.'
      )
    } else {
      console.error('[auth/staff] code exchange failed:', exchangeError.message)
    }

    const errorCode = isDomainRejection
      ? 'staff_domain'
      : isVerifierMissing
        ? 'oauth_origin'
        : 'oauth_failed'

    return NextResponse.redirect(
      `${origin}/?error=${errorCode}&detail=${encodeURIComponent(exchangeError.message)}`
    )
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!isStaffEmail(user?.email)) {
    console.warn(
      `[auth/staff] rejecting non-staff domain for ${user?.email ?? 'unknown user'}`
    )
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/?error=staff_domain`)
  }

  // Staff land in the admin area; the dashboard layout would bounce them here
  // anyway based on role.
  return NextResponse.redirect(`${origin}/admin`)
}
