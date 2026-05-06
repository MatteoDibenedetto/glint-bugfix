'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import DiffViewer from '@/components/requests/DiffViewer'
import Button from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import type { BugRequest, FileFix } from '@/types'

interface StaffMember {
  id: string
  email: string
  first_name?: string
  last_name?: string
  role: string
}

interface Props {
  request: BugRequest
  fixes: FileFix[]
  approvedFix: FileFix[]
  staff: StaffMember[]
  currentRole: string
}

export default function RequestActions({ request, fixes, approvedFix, staff, currentRole }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [notes, setNotes] = useState(request.reviewer_notes || '')
  const [assignedDevId, setAssignedDevId] = useState(request.assigned_dev_id || '')
  const [editedFixes, setEditedFixes] = useState<FileFix[]>(
    approvedFix.length > 0 ? approvedFix : fixes
  )
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function call(path: string, body: object) {
    const res = await fetch(path, {
      method: body ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Errore')
    }
    return res.json()
  }

  async function patch(body: object) {
    const res = await fetch(`/api/requests/${request.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Errore')
    }
    return res.json()
  }

  async function handleGenerateFix() {
    setLoading('generate')
    setError('')
    try {
      await call(`/api/requests/${request.id}/generate-fix`, {})
      setSuccess('Fix generato con successo.')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore')
    } finally {
      setLoading(null)
    }
  }

  async function handleAssign() {
    setLoading('assign')
    setError('')
    try {
      await patch({ assigned_dev_id: assignedDevId, status: 'in_review' })
      setSuccess('Developer assegnato.')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore')
    } finally {
      setLoading(null)
    }
  }

  async function handleApprove() {
    setLoading('approve')
    setError('')
    try {
      await patch({ status: 'approved', approved_fix: editedFixes, reviewer_notes: notes })
      setSuccess('Fix approvato. Ora puoi deployarlo.')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore')
    } finally {
      setLoading(null)
    }
  }

  async function handleRequestChanges() {
    setLoading('changes')
    setError('')
    if (!notes.trim()) {
      setError('Inserisci le note prima di richiedere modifiche.')
      setLoading(null)
      return
    }
    try {
      await patch({ status: 'changes_requested', reviewer_notes: notes })
      setSuccess('Chiarimento richiesto al cliente.')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore')
    } finally {
      setLoading(null)
    }
  }

  async function handleDeploy() {
    setLoading('deploy')
    setError('')
    try {
      await call(`/api/requests/${request.id}/deploy`, {})
      setSuccess('Fix deployato sul tema di staging.')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore')
    } finally {
      setLoading(null)
    }
  }

  async function handleReject() {
    if (!confirm('Sei sicuro di voler rifiutare questa richiesta?')) return
    setLoading('reject')
    try {
      await patch({ status: 'rejected', reviewer_notes: notes })
      setSuccess('Richiesta rifiutata.')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore')
    } finally {
      setLoading(null)
    }
  }

  const isReadOnly = ['deployed', 'rejected'].includes(request.status)

  return (
    <div className="space-y-5">
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}
      {success && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-3">
          <p className="text-sm text-green-400">{success}</p>
        </div>
      )}

      {/* Step 1: Generate fix */}
      {request.status === 'pending' && !isReadOnly && (
        <Card>
          <p className="text-xs font-medium text-glint-grey uppercase tracking-wider mb-3">Genera fix AI</p>
          <p className="text-sm text-glint-grey mb-4">
            Claude analizzerà i file del tema e genererà una proposta di fix. L'operazione può richiedere 30–60 secondi.
          </p>
          {assignedDevId && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-glint-grey mb-1.5">Assegna developer</label>
              <select
                value={assignedDevId}
                onChange={(e) => setAssignedDevId(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-glint-yellow/60"
              >
                <option value="" className="bg-glint-green">Auto (basato su tipo fix)</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id} className="bg-glint-green">
                    {s.first_name || s.email} ({s.role})
                  </option>
                ))}
              </select>
            </div>
          )}
          <Button onClick={handleGenerateFix} loading={loading === 'generate'}>
            Genera fix con Claude
          </Button>
        </Card>
      )}

      {/* AI processing */}
      {request.status === 'ai_processing' && (
        <Card>
          <div className="flex items-center gap-3">
            <svg className="animate-spin h-5 w-5 text-glint-yellow" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
            </svg>
            <p className="text-sm text-glint-yellow">Claude sta generando il fix…</p>
          </div>
        </Card>
      )}

      {/* Step 2: Review fix */}
      {['ai_completed', 'in_review'].includes(request.status) && fixes.length > 0 && (
        <Card>
          <p className="text-xs font-medium text-glint-grey uppercase tracking-wider mb-4">Fix proposto da Claude</p>
          <DiffViewer
            fixes={editedFixes}
            editable={!isReadOnly}
            onChange={setEditedFixes}
          />
        </Card>
      )}

      {/* Approved fix */}
      {['approved', 'deployed'].includes(request.status) && approvedFix.length > 0 && (
        <Card>
          <p className="text-xs font-medium text-glint-grey uppercase tracking-wider mb-4">Fix approvato</p>
          <DiffViewer fixes={approvedFix} editable={false} />
        </Card>
      )}

      {/* Reviewer notes + actions */}
      {['ai_completed', 'in_review'].includes(request.status) && !isReadOnly && (
        <Card>
          <p className="text-xs font-medium text-glint-grey uppercase tracking-wider mb-3">Azioni</p>

          {/* Reassign */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-glint-grey mb-1.5">Riassegna developer</label>
            <div className="flex gap-2">
              <select
                value={assignedDevId}
                onChange={(e) => setAssignedDevId(e.target.value)}
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-glint-yellow/60"
              >
                {staff.map((s) => (
                  <option key={s.id} value={s.id} className="bg-glint-green">
                    {s.first_name || s.email} ({s.role})
                  </option>
                ))}
              </select>
              <Button variant="secondary" size="sm" onClick={handleAssign} loading={loading === 'assign'}>
                Assegna
              </Button>
            </div>
          </div>

          <Textarea
            label="Note per il cliente (opzionale)"
            placeholder="Spiega cosa hai modificato o cosa serve di ulteriore..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />

          <div className="flex flex-wrap gap-3 mt-4">
            <Button onClick={handleApprove} loading={loading === 'approve'}>
              Approva fix
            </Button>
            <Button variant="secondary" onClick={handleRequestChanges} loading={loading === 'changes'}>
              Richiedi chiarimento
            </Button>
            <Button variant="danger" onClick={handleReject} loading={loading === 'reject'}>
              Rifiuta
            </Button>
          </div>
        </Card>
      )}

      {/* Step 3: Deploy */}
      {request.status === 'approved' && !isReadOnly && (
        <Card highlight>
          <p className="text-xs font-medium text-glint-yellow uppercase tracking-wider mb-2">Deploy su staging theme</p>
          <p className="text-sm text-glint-grey mb-4">
            Il fix verrà applicato a una copia del tema live. Il cliente riceverà una notifica via email.
          </p>
          <Button onClick={handleDeploy} loading={loading === 'deploy'} size="lg">
            Deploy su staging theme
          </Button>
        </Card>
      )}

      {request.status === 'deployed' && (
        <Card highlight>
          <p className="text-xs font-medium text-glint-yellow uppercase tracking-wider mb-1">Deployato</p>
          <p className="text-sm text-glint-grey">
            Il fix è stato caricato sul tema di staging. Il cliente è stato notificato.
          </p>
        </Card>
      )}
    </div>
  )
}
