'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function ConnectStorePage() {
  const [domain, setDomain] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  function normalizeDomain(input: string): string {
    let s = input.trim().toLowerCase()
    if (!s.includes('.myshopify.com')) s = `${s}.myshopify.com`
    return s
  }

  function handleSubmit(e: React.FormEvent) {
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
    <div className="max-w-md">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-glint-grey hover:text-white transition-colors mb-6">
        <ArrowLeft size={14} /> Dashboard
      </Link>

      <h1 className="text-2xl font-bold mb-1">Connetti store</h1>
      <p className="text-glint-grey text-sm mb-8">
        Inserisci il dominio Shopify del tuo store. Lo trovi su Shopify Admin → Settings → Domains.
      </p>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 mb-5">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5 bg-white/5 border border-white/10 rounded-xl p-6">
        <div>
          <label className="block text-sm font-medium text-glint-grey mb-1.5">
            Dominio Shopify <span className="text-glint-orange">*</span>
          </label>
          <div className="flex">
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="mio-store"
              className="flex-1 bg-white/5 border border-white/10 rounded-l-lg px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-glint-yellow/60 transition-colors"
              required
            />
            <span className="flex items-center bg-white/8 border border-l-0 border-white/10 rounded-r-lg px-3 text-sm text-glint-grey">
              .myshopify.com
            </span>
          </div>
        </div>

        <Button type="submit" className="w-full" size="lg">
          Connetti store
        </Button>
      </form>

      <p className="text-xs text-glint-grey/40 mt-4 text-center">
        Verrai reindirizzato su Shopify per autorizzare l'accesso al tema.
      </p>
    </div>
  )
}
