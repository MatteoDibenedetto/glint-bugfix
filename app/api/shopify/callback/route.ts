import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { exchangeAccountCode } from '@/lib/shopify/auth'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const cookieStore = await cookies()

  const storedState = cookieStore.get('shopify_oauth_state')?.value
  const codeVerifier = cookieStore.get('shopify_code_verifier')?.value
  const returnedState = searchParams.get('state')
  const code = searchParams.get('code')

  if (!storedState || storedState !== returnedState || !codeVerifier || !code) {
    return NextResponse.redirect(new URL('/?error=invalid_state', request.url))
  }

  try {
    const { email, firstName, lastName } = await exchangeAccountCode(code, codeVerifier)

    if (!email) throw new Error('No email returned from Shopify')

    const supabaseAdmin = await createAdminClient()

    // Find or create user
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
    const existing = existingUsers.users.find((u) => u.email === email)

    let userId: string
    if (existing) {
      userId = existing.id
    } else {
      const { data: newUser, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { first_name: firstName, last_name: lastName },
      })
      if (error || !newUser.user) throw new Error(error?.message)
      userId = newUser.user.id
    }

    // Upsert profile
    await supabaseAdmin.from('profiles').upsert({
      id: userId,
      email,
      first_name: firstName || null,
      last_name: lastName || null,
    }, { onConflict: 'id' })

    // Generate magic link to sign the user in
    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard` },
      })

    if (linkError || !linkData.properties?.action_link) {
      throw new Error(linkError?.message)
    }

    cookieStore.delete('shopify_oauth_state')
    cookieStore.delete('shopify_code_verifier')

    return NextResponse.redirect(linkData.properties.action_link)
  } catch (err) {
    console.error('Account OAuth error:', err)
    return NextResponse.redirect(new URL('/?error=auth_failed', request.url))
  }
}
