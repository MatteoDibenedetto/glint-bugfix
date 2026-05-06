'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export const dynamic = 'force-dynamic'

export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    // Parse the hash fragment manually — @supabase/ssr doesn't auto-process it
    const hash = window.location.hash.substring(1)
    const params = new URLSearchParams(hash)
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')

    if (accessToken && refreshToken) {
      supabase.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ data, error }) => {
          if (data.session && !error) {
            // Hard navigation so middleware sees the updated session cookie
            window.location.href = '/dashboard'
          } else {
            window.location.href = '/?error=auth_failed'
          }
        })
    } else {
      router.replace('/?error=auth_failed')
    }
  }, [router])

  return (
    <div className="min-h-screen bg-glint-green flex items-center justify-center">
      <div className="text-center">
        <span className="text-2xl font-bold text-glint-yellow block mb-4">glint.</span>
        <div className="flex items-center gap-3 text-glint-grey">
          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
          </svg>
          <span className="text-sm">Accesso in corso…</span>
        </div>
      </div>
    </div>
  )
}
