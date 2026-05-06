import { NextResponse } from 'next/server'
import {
  buildAccountAuthUrl,
  generateCodeVerifier,
  generateCodeChallenge,
} from '@/lib/shopify/auth'
import { cookies } from 'next/headers'
import crypto from 'crypto'

export async function GET() {
  const state = crypto.randomBytes(16).toString('hex')
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)

  const cookieStore = await cookies()
  const opts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600,
    path: '/',
  }
  cookieStore.set('shopify_oauth_state', state, opts)
  cookieStore.set('shopify_code_verifier', codeVerifier, opts)

  return NextResponse.redirect(buildAccountAuthUrl(state, codeChallenge))
}
