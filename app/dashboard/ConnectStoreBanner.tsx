'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Store } from 'lucide-react'
import Button from '@/components/ui/Button'

export default function ConnectStoreBanner() {
  const [domain, setDomain] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  function normalizeDomain(input: string): string {
    let s = input.trim().toLowerCase()
    if (!s.includes('.myshopify.com')) s = `${s}.myshopify.com`
    return s
  }

  function handleConnect(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!domain.trim()) {
      setError('Inserisci il dominio del tuo store.')
      return
    }
    const normalized = normalizeDomain(domain)
    router.push(`/api/shopify/store-auth?shop=${encodeURIComponent(normalized)}`)
  }

  return (
    <div className="bg-glint-yellow/5 border border-glint-yellow/30 rounded-2xl p-6 mb-8">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-glint-yellow/10 flex items-center justify-center shrink-0">
          <Store size={18} className="text-glint-yellow" />
        </div>
        <div className="flex-1">
          <p className="font-bold text-white mb-1">Connetti il tuo store Shopify</p>
          <p className="text-sm text-glint-grey mb-4">
            Per aprire richieste di fix devi connettere il tuo store. Serve solo una volta.
          </p>
          <form onSubmit={handleConnect} className="flex gap-2 max-w-md">
            <div className="flex flex-1">
              <input
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="mio-store"
                className="flex-1 bg-white/5 border border-white/10 rounded-l-lg px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-glint-yellow/60 transition-colors"
              />
              <span className="flex items-center bg-white/8 border border-l-0 border-white/10 rounded-r-lg px-3 text-xs text-glint-grey whitespace-nowrap">
                .myshopify.com
              </span>
            </div>
            <Button type="submit" size="sm">
              Connetti
            </Button>
          </form>
          {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
        </div>
      </div>
    </div>
  )
}
