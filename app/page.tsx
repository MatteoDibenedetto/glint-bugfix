import Link from 'next/link'
import { ArrowRight, Zap, ShieldCheck, Clock } from 'lucide-react'

const errorMessages: Record<string, string> = {
  invalid_state: 'Sessione scaduta. Riprova.',
  auth_failed: 'Autenticazione fallita. Riprova.',
}

export default function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  return (
    <LandingContent searchParamsPromise={searchParams} />
  )
}

async function LandingContent({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{ error?: string }>
}) {
  const { error } = await searchParamsPromise

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
            <p className="text-glint-grey text-sm mb-8">
              Usa il tuo account Shopify per accedere al portale.
            </p>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 mb-6">
                <p className="text-sm text-red-400">
                  {errorMessages[error] ?? 'Errore di autenticazione. Riprova.'}
                </p>
              </div>
            )}

            <Link
              href="/api/shopify/auth"
              className="flex items-center justify-center gap-3 w-full bg-glint-orange hover:bg-orange-600 active:scale-95 transition-all text-white font-bold py-3.5 px-6 rounded-lg"
            >
              <ShopifyIcon />
              Accedi con Shopify
              <ArrowRight size={16} />
            </Link>

            <p className="text-xs text-glint-grey/50 mt-5 text-center">
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

function ShopifyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 109 124" fill="currentColor">
      <path d="M74.7 14.8c-.1-.7-.7-1-1.2-1.1-.5 0-10.8-.2-10.8-.2s-8.6-8.3-9.4-9.1c-.9-.9-2.6-.6-3.3-.4-.1 0-1.6.5-4.2 1.3C43.5 2.1 40.3 0 36.3 0 26.1 0 21 13.1 19.4 19.8c-4.1 1.3-7 2.2-7.4 2.3-2.3.7-2.4.8-2.7 3-.2 1.6-6 46.3-6 46.3L56.6 80 90 73.2 74.7 14.8zM52 6.9c-2 .6-4.3 1.3-6.7 2.1.1-2.4.4-5.9 1.6-8.2C48.9 2 51.1 5.3 52 6.9zm-8 2.5C37.6 11.3 31 13.4 30.3 13.6c1.6-6.2 4.7-9.2 7.4-10.3.6 1.6 1.3 3.9 1.4 6.1H44zm2.5-7.6c.4 0 .8.1 1.2.3-3.4 1.6-7 5.6-8.6 13.5L32 17.2C33.8 11.5 37.6 1.8 46.5 1.8z"/>
    </svg>
  )
}
