'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Input, Textarea } from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import type { Store } from '@/types'

export default function NewRequestPage() {
  const router = useRouter()
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchingStores, setFetchingStores] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    contact_email: '',
    store_id: '',
    title: '',
    description: '',
  })

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [{ data: profile }, { data: userStores }] = await Promise.all([
        supabase.from('profiles').select('first_name, last_name, email').eq('id', user.id).single(),
        supabase.from('stores').select('*').eq('owner_id', user.id),
      ])

      if (profile) {
        setForm((f) => ({
          ...f,
          first_name: profile.first_name || '',
          last_name: profile.last_name || '',
          contact_email: profile.email || user.email || '',
        }))
      }
      setStores(userStores || [])
      if (userStores?.length === 1) {
        setForm((f) => ({ ...f, store_id: userStores[0].id }))
      }
      setFetchingStores(false)
    }
    load()
  }, [])

  function validate() {
    const e: Record<string, string> = {}
    if (!form.first_name) e.first_name = 'Campo obbligatorio'
    if (!form.last_name) e.last_name = 'Campo obbligatorio'
    if (!form.contact_email) e.contact_email = 'Campo obbligatorio'
    if (!form.store_id) e.store_id = 'Seleziona uno store'
    if (!form.title) e.title = 'Campo obbligatorio'
    if (!form.description || form.description.length < 20) {
      e.description = 'Descrizione troppo breve (min. 20 caratteri)'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      // Update profile with name
      await supabase.from('profiles').update({
        first_name: form.first_name,
        last_name: form.last_name,
      }).eq('id', user!.id)

      // Create request
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          store_id: form.store_id,
          contact_email: form.contact_email,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Errore nella creazione della richiesta')
      }

      const data = await res.json()
      router.push(`/dashboard/request/${data.id}`)
    } catch (err) {
      setErrors({ submit: err instanceof Error ? err.message : 'Errore imprevisto' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-glint-grey hover:text-white transition-colors mb-4">
          <ArrowLeft size={14} /> Dashboard
        </Link>
        <h1 className="text-2xl font-bold">Nuova richiesta</h1>
        <p className="text-glint-grey text-sm mt-1">
          Descrivi il problema nel tema del tuo store. Più dettagli fornisci, più preciso sarà il fix.
        </p>
      </div>

      {errors.submit && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 mb-6">
          <p className="text-sm text-red-400">{errors.submit}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Personal info */}
        <section className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-medium text-glint-grey uppercase tracking-wider">Informazioni di contatto</h2>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Nome"
              value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              error={errors.first_name}
              required
            />
            <Input
              label="Cognome"
              value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              error={errors.last_name}
              required
            />
          </div>
          <Input
            label="Email di contatto"
            type="email"
            value={form.contact_email}
            onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
            error={errors.contact_email}
            required
          />
        </section>

        {/* Store selection */}
        <section className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-medium text-glint-grey uppercase tracking-wider">Store</h2>
          {fetchingStores ? (
            <p className="text-sm text-glint-grey">Caricamento store...</p>
          ) : stores.length === 0 ? (
            <p className="text-sm text-red-400">Nessuno store trovato. Esci e rientra con il tuo account Shopify.</p>
          ) : (
            <div>
              <label className="block text-sm font-medium text-glint-grey mb-1.5">
                Seleziona store <span className="text-glint-orange">*</span>
              </label>
              <select
                value={form.store_id}
                onChange={(e) => setForm({ ...form, store_id: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-glint-yellow/60 transition-colors"
              >
                <option value="" className="bg-glint-green">Scegli uno store</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id} className="bg-glint-green">
                    {s.shop_name || s.shop_domain}
                  </option>
                ))}
              </select>
              {errors.store_id && <p className="text-xs text-red-400 mt-1">{errors.store_id}</p>}
            </div>
          )}
        </section>

        {/* Fix description */}
        <section className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-medium text-glint-grey uppercase tracking-wider">Descrizione del fix</h2>
          <Input
            label="Titolo breve"
            placeholder="es. Il menu mobile non si apre correttamente"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            error={errors.title}
            required
          />
          <Textarea
            label="Descrizione dettagliata"
            placeholder={`Descrivi il problema in dettaglio:\n- Cosa succede?\n- In quale pagina/sezione?\n- Come dovrebbe funzionare?\n- Hai già provato qualcosa?`}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            error={errors.description}
            rows={8}
            required
          />
        </section>

        <Button type="submit" loading={loading} size="lg" className="w-full">
          Invia richiesta
        </Button>
      </form>
    </div>
  )
}
