'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import type { RequestMessage } from '@/types'

const STAFF_ROLES = ['admin', 'frontend_dev', 'backend_dev', 'store_manager']

interface Props {
  requestId: string
  /** Shown above the composer, e.g. to explain that the team is waiting. */
  prompt?: string
  /** Label on the send button. */
  submitLabel?: string
}

function authorName(message: RequestMessage): string {
  const a = message.author
  if (!a) return 'Utente rimosso'
  const full = [a.first_name, a.last_name].filter(Boolean).join(' ')
  return full || a.email
}

export default function MessageThread({
  requestId,
  prompt,
  submitLabel = 'Invia',
}: Props) {
  const router = useRouter()
  const [messages, setMessages] = useState<RequestMessage[] | null>(null)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch(`/api/requests/${requestId}/messages`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? 'Errore')
        return res.json()
      })
      .then((data: RequestMessage[]) => {
        if (!cancelled) setMessages(data)
      })
      .catch((e) => {
        if (!cancelled) {
          setMessages([])
          setError(e instanceof Error ? e.message : 'Errore nel caricamento')
        }
      })
    return () => {
      cancelled = true
    }
  }, [requestId])

  async function handleSend() {
    if (!body.trim()) return
    setSending(true)
    setError('')
    try {
      const res = await fetch(`/api/requests/${requestId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Errore')

      const created = (await res.json()) as RequestMessage & { new_status?: string | null }
      setMessages((prev) => [...(prev ?? []), created])
      setBody('')

      // A reply can move the request forward, so the page around this thread
      // needs to re-render with the new status.
      if (created.new_status) router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore')
    } finally {
      setSending(false)
    }
  }

  return (
    <Card>
      <p className="text-xs font-medium text-glint-grey uppercase tracking-wider mb-4">
        Conversazione
      </p>

      {messages === null ? (
        <p className="text-sm text-glint-grey/60 mb-4">Caricamento…</p>
      ) : messages.length === 0 ? (
        <p className="text-sm text-glint-grey/60 mb-4">
          Nessun messaggio. Scrivi qui per fare o rispondere a una domanda.
        </p>
      ) : (
        <div className="space-y-3 mb-5">
          {messages.map((m) => {
            const fromStaff = !!m.author && STAFF_ROLES.includes(m.author.role)
            return (
              <div
                key={m.id}
                className={`rounded-lg px-4 py-3 border ${
                  fromStaff
                    ? 'bg-glint-yellow/5 border-glint-yellow/20'
                    : 'bg-white/5 border-white/10'
                }`}
              >
                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                  <span
                    className={`text-xs font-medium ${
                      fromStaff ? 'text-glint-yellow' : 'text-white'
                    }`}
                  >
                    {fromStaff ? 'glint.' : authorName(m)}
                  </span>
                  <span className="text-xs text-glint-grey/50">
                    {new Date(m.created_at).toLocaleString('it-IT', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-sm text-glint-grey whitespace-pre-wrap">{m.body}</p>
              </div>
            )
          })}
        </div>
      )}

      {prompt && <p className="text-sm text-glint-grey mb-3">{prompt}</p>}

      <Textarea
        placeholder="Scrivi un messaggio…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
      />

      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}

      <div className="mt-3">
        <Button onClick={handleSend} loading={sending} disabled={!body.trim()} size="sm">
          {submitLabel}
        </Button>
      </div>
    </Card>
  )
}
