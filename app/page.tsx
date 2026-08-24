'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Zap, ShieldCheck, Clock } from 'lucide-react'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'

const errorMessages: Record<string, string> = {
  invalid_shop: 'Dominio store non valido.',
  invalid_state: 'Sessione scaduta. Riprova.',
  invalid_hmac: 'Errore di sicurezza. Riprova.',
  missing_params: 'Parametri mancanti. Riprova.',
  auth_failed: 'Autenticazione fallita. Verifica il dominio e riprova.',
  oauth_failed: 'Accesso con Google non riuscito. Riprova.',
  staff_domain:
    'Questo accesso è riservato al team Glint. Usa un indirizzo @glintcompany.com o @tngp.it.',
}

export default function LandingPage() {
  const [shop, setShop] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const urlParams = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search)
    : null
  const urlError = urlParams?.get('error') ?? null
  const urlDetail = urlParams?.get('detail') ?? null

  function normalizeDomain(input: string): string {
    let s = input.trim().toLowerCase()
    if (!s.includes('.myshopify.com')) s = `${s}.myshopify.com`
    return s
  }

  function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!shop.trim()) { setError('Inserisci il dominio del tuo store.'); return }
    setLoading(true)
    router.push(`/api/shopify/auth?shop=${encodeURIComponent(normalizeDomain(shop))}`)
  }

  async function handleStaffLogin() {
    setError('')
    setGoogleLoading(true)

    const supabase = createClient()
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/staff/callback`,
        // Always show the account chooser: staff often have a personal Google
        // account signed in already, and silently reusing it just produces a
        // rejected domain.
        queryParams: { prompt: 'select_account' },
      },
    })

    if (oauthError) {
      setError(oauthError.message)
      setGoogleLoading(false)
    }
    // On success the browser is redirected to Google, so nothing to reset.
  }

  return (
    <div className="min-h-screen bg-glint-green flex flex-col">
      <header className="px-8 py-6">
        <span className="text-2xl font-bold text-glint-yellow">glint.</span>
      </header>

      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Copy */}
          <div>
            <div className="inline-flex items-center gap-2 bg-glint-yellow/10 border border-glint-yellow/20 rounded-full px-3 py-1 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-glint-yellow" />
              <span className="text-xs text-glint-yellow font-medium">Bug Fix Portal</span>
            </div>
            <h1 className="text-4xl lg:text-5xl font-bold leading-tight mb-4">
              Fix al tuo store<br />
              <span className="text-glint-yellow">veloci e precisi.</span>
            </h1>
            <p className="text-glint-grey text-lg leading-relaxed mb-8">
              Descrivi il problema. L'AI analizza il tema e genera il fix.
              Il team Glint revisiona e carica su un tema di staging.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { icon: Zap, title: 'Fix automatico', desc: 'AI analizza e corregge il codice' },
                { icon: ShieldCheck, title: 'Revisione umana', desc: 'Il team approva prima del deploy' },
                { icon: Clock, title: 'Staging theme', desc: 'Testa prima di pubblicare live' },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="bg-white/5 rounded-xl p-4 border border-white/8">
                  <Icon size={18} className="text-glint-yellow mb-2" />
                  <p className="text-sm font-medium text-white mb-1">{title}</p>
                  <p className="text-xs text-glint-grey">{desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Login card */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
            <h2 className="text-xl font-bold mb-1">Accedi con Shopify</h2>
            <p className="text-glint-grey text-sm mb-6">
              Inserisci il dominio del tuo store Shopify per continuare.
            </p>

            {(urlError || error) && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 mb-5">
                <p className="text-sm text-red-400">
                  {error || errorMessages[urlError as string] || 'Errore. Riprova.'}
                </p>
                {urlDetail && (
                  <p className="mt-1.5 text-xs text-red-400/70 break-all font-mono">
                    {urlDetail}
                  </p>
                )}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-glint-grey mb-1.5">
                  Dominio Shopify
                </label>
                <div className="flex">
                  <input
                    type="text"
                    value={shop}
                    onChange={(e) => setShop(e.target.value)}
                    placeholder="mio-store"
                    className="flex-1 bg-white/5 border border-white/10 rounded-l-lg px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-glint-yellow/60 transition-colors"
                    required
                  />
                  <span className="flex items-center bg-white/8 border border-l-0 border-white/10 rounded-r-lg px-3 text-sm text-glint-grey">
                    .myshopify.com
                  </span>
                </div>
              </div>
              <Button type="submit" loading={loading} className="w-full" size="lg">
                Accedi <ArrowRight size={16} />
              </Button>
            </form>

            <p className="text-xs text-glint-grey/50 mt-4 text-center">
              Accedendo autorizzi glint. ad accedere al tema del tuo store.
            </p>

            {/* Staff sign-in */}
            <div className="flex items-center gap-3 my-6">
              <span className="flex-1 h-px bg-white/10" />
              <span className="text-xs text-glint-grey/50 uppercase tracking-wider">
                Team Glint
              </span>
              <span className="flex-1 h-px bg-white/10" />
            </div>

            <button
              type="button"
              onClick={handleStaffLogin}
              disabled={googleLoading}
              className="w-full flex items-center justify-center gap-2.5 bg-white/8 hover:bg-white/12 disabled:opacity-50 disabled:cursor-not-allowed border border-white/10 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18A10.98 10.98 0 001 12c0 1.78.43 3.45 1.18 4.93l3.66-2.83z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z" />
              </svg>
              {googleLoading ? 'Reindirizzamento…' : 'Accedi con Google'}
            </button>

            <p className="text-xs text-glint-grey/50 mt-3 text-center">
              Solo indirizzi @glintcompany.com e @tngp.it.
            </p>
          </div>
        </div>
      </div>

      <footer className="px-8 py-5 border-t border-white/8">
        <p className="text-xs text-glint-grey/40 text-center">
          © {new Date().getFullYear()} glint. · parte del gruppo TNGP
        </p>
      </footer>
    </div>
  )
}
