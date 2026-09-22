'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import DiffViewer from '@/components/requests/DiffViewer'
import MessageThread from '@/components/requests/MessageThread'
import Button from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import type { BugRequest, FileFix } from '@/types'

/**
 * States where the fix is still being worked on and every action stays
 * available. `changes_requested` belongs here: asking the client a question
 * must not take the fix away from the reviewer — that used to hide the diff and
 * all the buttons, leaving no way to finish the request.
 */
const REVIEWABLE_STATUSES = ['ai_completed', 'in_review', 'changes_requested']

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

  async function handlePreview() {
    setLoading('preview')
    setError('')
    try {
      // Save the reviewer's edits first, so the preview shows what would
      // actually be applied rather than Claude's untouched proposal.
      await patch({ approved_fix: editedFixes })
      await call(`/api/requests/${request.id}/preview`, {})
      setSuccess('Anteprima pronta. Aprila e verifica il fix sullo store.')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore')
    } finally {
      setLoading(null)
    }
  }

  async function handleRestore() {
    if (
      !confirm(
        'Rimettere i file del tema live come erano prima del fix? ' +
          'Eventuali modifiche fatte al tema dopo il fix verranno sovrascritte.'
      )
    )
      return
    setLoading('restore')
    setError('')
    try {
      const res = await call(`/api/requests/${request.id}/restore`, {})
      setSuccess(
        `Ripristinati ${res.restored.length} file.` +
          (res.needs_manual_removal?.length
            ? ` Da rimuovere a mano: ${res.needs_manual_removal.join(', ')}.`
            : '')
      )
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore')
    } finally {
      setLoading(null)
    }
  }

  async function handleDeploy() {
    if (
      !confirm(
        'Applicare il fix al tema PUBBLICATO? ' +
          'La modifica sarà immediatamente visibile ai clienti dello store. ' +
          'I file attuali vengono salvati e puoi ripristinarli.'
      )
    )
      return
    setLoading('deploy')
    setError('')
    try {
      await call(`/api/requests/${request.id}/deploy`, {})
      setSuccess('Fix applicato al tema live.')
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
      {REVIEWABLE_STATUSES.includes(request.status) && fixes.length > 0 && (
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

      {/* Waiting on the client, but the fix stays actionable. */}
      {request.status === 'changes_requested' && (
        <Card>
          <p className="text-xs font-medium text-glint-yellow uppercase tracking-wider mb-1">
            In attesa del cliente
          </p>
          <p className="text-sm text-glint-grey">
            Hai chiesto un chiarimento. Il cliente è stato avvisato via email e può
            rispondere dalla sua richiesta. Puoi comunque approvare, rifiutare o
            modificare il fix nel frattempo.
          </p>
        </Card>
      )}

      {/* Reviewer notes + actions */}
      {REVIEWABLE_STATUSES.includes(request.status) && !isReadOnly && (
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

      {/* Preview on the real storefront */}
      {REVIEWABLE_STATUSES.includes(request.status) && fixes.length > 0 && !isReadOnly && (
        <Card>
          <p className="text-xs font-medium text-glint-grey uppercase tracking-wider mb-2">
            Anteprima
          </p>
          <p className="text-sm text-glint-grey mb-4">
            Crea una copia temporanea del tema live con il fix applicato e aprila
            per verificare che funzioni. Lo store pubblicato non viene toccato.
          </p>

          {request.preview_url && (
            <div className="bg-glint-yellow/5 border border-glint-yellow/20 rounded-lg px-4 py-3 mb-4">
              <a
                href={request.preview_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-glint-yellow hover:underline break-all"
              >
                Apri l&apos;anteprima →
              </a>
              <p className="text-xs text-glint-grey/60 mt-1">
                {request.staging_theme_name}
              </p>
            </div>
          )}

          <Button variant="secondary" onClick={handlePreview} loading={loading === 'preview'}>
            {request.preview_url ? 'Rigenera anteprima' : 'Crea anteprima'}
          </Button>
        </Card>
      )}

      {/* Step 3: Deploy */}
      {request.status === 'approved' && !isReadOnly && (
        <Card highlight>
          <p className="text-xs font-medium text-glint-yellow uppercase tracking-wider mb-2">
            Applica al tema live
          </p>
          <p className="text-sm text-glint-grey mb-4">
            Il fix viene scritto sul tema <strong>pubblicato</strong> ed è subito
            visibile ai clienti dello store. I file attuali vengono salvati, quindi
            è ripristinabile. L&apos;anteprima temporanea viene poi cancellata.
          </p>
          {!request.preview_url && (
            <p className="text-sm text-glint-orange mb-4">
              Crea prima l&apos;anteprima e verifica il fix.
            </p>
          )}
          <Button
            onClick={handleDeploy}
            loading={loading === 'deploy'}
            size="lg"
            disabled={!request.preview_url}
          >
            Applica al tema live
          </Button>
        </Card>
      )}

      <MessageThread
        requestId={request.id}
        prompt="Scrivi al cliente. Riceverà una notifica via email."
        submitLabel="Invia al cliente"
      />

      {request.status === 'deployed' && (
        <Card highlight>
          <p className="text-xs font-medium text-glint-yellow uppercase tracking-wider mb-1">
            Applicato al tema live
          </p>
          <p className="text-sm text-glint-grey">
            Il fix è online sullo store
            {request.applied_at &&
              ` dal ${new Date(request.applied_at).toLocaleString('it-IT', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}`}
            . Il cliente è stato notificato.
          </p>

          {request.live_backup?.length ? (
            <div className="mt-4">
              <p className="text-xs text-glint-grey/60 mb-2">
                Backup disponibile per {request.live_backup.length} file.
              </p>
              <Button variant="danger" size="sm" onClick={handleRestore} loading={loading === 'restore'}>
                Ripristina versione precedente
              </Button>
            </div>
          ) : null}
        </Card>
      )}
    </div>
  )
}
