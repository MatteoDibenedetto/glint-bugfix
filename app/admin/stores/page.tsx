'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import type { Store, Profile } from '@/types'

interface StoreWithRelations extends Store {
  owner?: Profile
  store_manager?: Profile
}

export default function StoresPage() {
  const [stores, setStores] = useState<StoreWithRelations[]>([])
  const [managers, setManagers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [success, setSuccess] = useState('')

  useEffect(() => {
    async function load() {
      const [storesRes, staffRes] = await Promise.all([
        fetch('/api/admin/stores'),
        fetch('/api/admin/staff'),
      ])
      const [storesData, staffData] = await Promise.all([storesRes.json(), staffRes.json()])
      setStores(storesData)
      setManagers(
        (staffData as Profile[]).filter((p) =>
          ['store_manager', 'admin'].includes(p.role)
        )
      )
      setLoading(false)
    }
    load()
  }, [])

  async function handleAssign(storeId: string, managerId: string) {
    setSaving(storeId)
    setSuccess('')
    const res = await fetch('/api/admin/stores', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store_id: storeId,
        store_manager_id: managerId || null,
      }),
    })
    if (res.ok) {
      const updated = await res.json()
      setStores((prev) =>
        prev.map((s) => (s.id === storeId ? { ...s, store_manager_id: updated.store_manager_id } : s))
      )
      setSuccess('Store manager aggiornato.')
    }
    setSaving(null)
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Store</h1>
        <p className="text-glint-grey text-sm mt-1">
          Assegna uno store manager ad ogni store. Lo store manager riceve notifiche per tutte le richieste del suo store.
        </p>
      </div>

      {success && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-3 mb-5">
          <p className="text-sm text-green-400">{success}</p>
        </div>
      )}

      {loading ? (
        <p className="text-glint-grey text-sm">Caricamento...</p>
      ) : stores.length === 0 ? (
        <p className="text-glint-grey/50 text-sm text-center py-12">
          Nessuno store registrato ancora.
        </p>
      ) : (
        <div className="space-y-3">
          {stores.map((store) => (
            <Card key={store.id}>
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white">
                    {store.shop_name || store.shop_domain}
                  </p>
                  <p className="text-xs text-glint-grey mt-0.5">{store.shop_domain}</p>
                  {store.owner && (
                    <p className="text-xs text-glint-grey/60 mt-0.5">
                      Proprietario: {store.owner.first_name || store.owner.email}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    defaultValue={store.store_manager_id || ''}
                    id={`manager-${store.id}`}
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-glint-yellow/60 min-w-[180px]"
                  >
                    <option value="" className="bg-glint-green">— Nessun manager</option>
                    {managers.map((m) => (
                      <option key={m.id} value={m.id} className="bg-glint-green">
                        {m.first_name ? `${m.first_name} ${m.last_name || ''}` : m.email}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={saving === store.id}
                    onClick={() => {
                      const sel = document.getElementById(`manager-${store.id}`) as HTMLSelectElement
                      handleAssign(store.id, sel.value)
                    }}
                  >
                    Assegna
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
