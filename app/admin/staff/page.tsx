'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import type { Profile, UserRole } from '@/types'

const roles: { value: UserRole; label: string; description: string }[] = [
  { value: 'client', label: 'Client', description: 'Solo accesso al proprio dashboard' },
  { value: 'frontend_dev', label: 'Frontend Dev', description: 'Revisiona fix frontend (Liquid, CSS, JS)' },
  { value: 'backend_dev', label: 'Backend Dev', description: 'Revisiona fix backend (API, integrazioni)' },
  { value: 'store_manager', label: 'Store Manager', description: 'Gestisce uno o più store, riceve notifiche' },
  { value: 'admin', label: 'Admin', description: 'Accesso completo, gestione staff e store' },
]

const roleBadgeColors: Record<UserRole, string> = {
  client: 'bg-white/10 text-glint-grey',
  frontend_dev: 'bg-blue-500/20 text-blue-400',
  backend_dev: 'bg-purple-500/20 text-purple-400',
  store_manager: 'bg-green-500/20 text-green-400',
  admin: 'bg-glint-yellow/20 text-glint-yellow',
}

export default function StaffPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [pendingRoles, setPendingRoles] = useState<Record<string, UserRole>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [success, setSuccess] = useState('')

  async function fetchProfiles() {
    const res = await fetch('/api/admin/staff')
    const data = await res.json()
    setProfiles(data)
    const initial: Record<string, UserRole> = {}
    data.forEach((p: Profile) => { initial[p.id] = p.role })
    setPendingRoles(initial)
    setLoading(false)
  }

  useEffect(() => { fetchProfiles() }, [])

  async function handleSave(userId: string) {
    const role = pendingRoles[userId]
    if (!role) return
    setSaving(userId)
    setSuccess('')
    const res = await fetch('/api/admin/staff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, role }),
    })
    if (res.ok) {
      setProfiles((prev) => prev.map((p) => p.id === userId ? { ...p, role } : p))
      setSuccess('Ruolo aggiornato.')
    }
    setSaving(null)
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Staff</h1>
        <p className="text-glint-grey text-sm mt-1">Gestisci i ruoli di tutti gli utenti registrati.</p>
      </div>

      {/* Role legend */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        {roles.map((r) => (
          <div key={r.value} className="bg-white/5 border border-white/8 rounded-xl p-3">
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mb-2 ${roleBadgeColors[r.value]}`}>
              {r.label}
            </span>
            <p className="text-xs text-glint-grey">{r.description}</p>
          </div>
        ))}
      </div>

      {success && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-3 mb-5">
          <p className="text-sm text-green-400">{success}</p>
        </div>
      )}

      {loading ? (
        <p className="text-glint-grey text-sm">Caricamento...</p>
      ) : (
        <Card>
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/8">
                <th className="text-left text-xs font-medium text-glint-grey uppercase tracking-wider pb-3">Utente</th>
                <th className="text-left text-xs font-medium text-glint-grey uppercase tracking-wider pb-3">Ruolo corrente</th>
                <th className="text-left text-xs font-medium text-glint-grey uppercase tracking-wider pb-3">Cambia ruolo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {profiles.map((p) => (
                <tr key={p.id}>
                  <td className="py-3 pr-4">
                    <p className="text-sm font-medium">
                      {p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : p.email}
                    </p>
                    {(p.first_name || p.last_name) && (
                      <p className="text-xs text-glint-grey">{p.email}</p>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${roleBadgeColors[p.role]}`}>
                      {roles.find((r) => r.value === p.role)?.label || p.role}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <Select<UserRole>
                        value={pendingRoles[p.id] ?? p.role}
                        options={roles.map((r) => ({ value: r.value, label: r.label }))}
                        onChange={(val) => setPendingRoles((prev) => ({ ...prev, [p.id]: val }))}
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={saving === p.id}
                        onClick={() => handleSave(p.id)}
                      >
                        Salva
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
