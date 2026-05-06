'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Zap, ShieldCheck, Clock } from 'lucide-react'
import Button from '@/components/ui/Button'

export default function LandingPage() {
  const [shop, setShop] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  function normalizeDomain(input: string): string {
    let s = input.trim().toLowerCase()
    if (!s.includes('.myshopify.com')) s = `${s}.myshopify.com`
    return s
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!shop.trim()) {
      setError('Inserisci il dominio del tuo store.')
      return
    }
    setLoading(true)
    const domain = normalizeDomain(shop)
    router.push(`/api/shopify/auth?shop=${encodeURIComponent(domain)}`)
  }

  const searchParams = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search)
    : null
  const authError = searchParams?.get('error')

  return (
    <div className="min-h-screen bg-glint-green flex flex-col">
      {/* Header */}
      <header className="px-8 py-6">
        <span className="text-2xl font-bold text-glint-yellow">glint.</span>
      </header>

      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left: copy */}
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
              Il team Glint revisiona e carica direttamente su un tema di staging.
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

          {/* Right: login card */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
            <h2 className="text-xl font-bold mb-1">Accedi con Shopify</h2>
            <p className="text-glint-grey text-sm mb-6">
              Inserisci il dominio del tuo store Shopify per continuare.
            </p>

            {(authError || error) && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 mb-5">
                <p className="text-sm text-red-400">
                  {error || errorMessages[authError as keyof typeof errorMessages] || 'Autenticazione fallita. Riprova.'}
                </p>
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
                Accedi
                <ArrowRight size={16} />
              </Button>
            </form>

            <p className="text-xs text-glint-grey/50 mt-4 text-center">
              Accedendo autorizzi glint. ad accedere al tema del tuo store per generare fix.
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

const errorMessages = {
  invalid_state: 'Sessione scaduta. Riprova.',
  invalid_shop: 'Store non valido.',
  invalid_hmac: 'Errore di sicurezza. Riprova.',
  missing_params: 'Parametri mancanti. Riprova.',
  auth_failed: 'Autenticazione fallita. Verifica il dominio e riprova.',
}
