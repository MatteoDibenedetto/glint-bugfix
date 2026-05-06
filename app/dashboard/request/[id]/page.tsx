import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { StatusBadge, FixTypeBadge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, Clock, Wrench, ExternalLink } from 'lucide-react'
import type { BugRequest } from '@/types'

const statusSteps = [
  { key: 'pending', label: 'Ricevuta', icon: Clock },
  { key: 'ai_processing', label: 'AI in lavoro', icon: Wrench },
  { key: 'ai_completed', label: 'Fix generato', icon: CheckCircle2 },
  { key: 'in_review', label: 'In revisione', icon: Clock },
  { key: 'approved', label: 'Approvato', icon: CheckCircle2 },
  { key: 'deployed', label: 'Pronto', icon: CheckCircle2 },
]

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data } = await supabase
    .from('bug_requests')
    .select(`*, store:stores(shop_domain, shop_name), assigned_dev:profiles!assigned_dev_id(first_name, last_name)`)
    .eq('id', id)
    .eq('client_id', user!.id)
    .single()

  if (!data) notFound()

  const req = data as BugRequest
  const store = req.store as { shop_domain: string; shop_name: string }
  const statusOrder = statusSteps.map((s) => s.key)
  const currentStep = statusOrder.indexOf(req.status)

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-glint-grey hover:text-white transition-colors mb-4">
          <ArrowLeft size={14} /> Dashboard
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <StatusBadge status={req.status} />
              <FixTypeBadge type={req.fix_type} />
            </div>
            <h1 className="text-2xl font-bold">{req.title}</h1>
            <p className="text-glint-grey text-sm mt-1">
              {store?.shop_name || store?.shop_domain} ·{' '}
              {new Date(req.created_at).toLocaleDateString('it-IT', {
                day: '2-digit', month: 'long', year: 'numeric',
              })}
            </p>
          </div>
        </div>
      </div>

      {/* Progress tracker */}
      {req.status !== 'rejected' && (
        <Card className="mb-6">
          <div className="flex items-center">
            {statusSteps.map((step, i) => {
              const done = i < currentStep
              const active = i === currentStep
              const Icon = step.icon
              return (
                <div key={step.key} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center gap-1.5">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors ${
                      done ? 'bg-glint-yellow border-glint-yellow' :
                      active ? 'border-glint-yellow bg-glint-yellow/10' :
                      'border-white/20 bg-white/5'
                    }`}>
                      <Icon size={14} className={done ? 'text-glint-green' : active ? 'text-glint-yellow' : 'text-white/30'} />
                    </div>
                    <span className={`text-xs text-center leading-tight ${active ? 'text-glint-yellow font-medium' : done ? 'text-white/60' : 'text-white/30'}`}>
                      {step.label}
                    </span>
                  </div>
                  {i < statusSteps.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-1 mb-5 ${i < currentStep ? 'bg-glint-yellow/50' : 'bg-white/10'}`} />
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Deployed: staging theme info */}
      {req.status === 'deployed' && req.staging_theme_name && (
        <div className="bg-glint-yellow/5 border border-glint-yellow/30 rounded-xl p-5 mb-6">
          <p className="text-glint-yellow font-medium text-sm mb-1">Fix pronto per il test</p>
          <p className="text-white font-bold">{req.staging_theme_name}</p>
          <p className="text-glint-grey text-sm mt-2">
            Vai su Shopify Admin → Online Store → Themes per trovare il tema di staging e testarlo.
            Quando sei soddisfatto, pubblicalo per mandarlo live.
          </p>
          <a
            href={`https://${store?.shop_domain}/admin/themes`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 mt-3 text-sm text-glint-orange hover:underline"
          >
            Vai a Shopify Admin <ExternalLink size={12} />
          </a>
        </div>
      )}

      {/* Changes requested */}
      {req.status === 'changes_requested' && req.reviewer_notes && (
        <div className="bg-glint-orange/5 border border-glint-orange/30 rounded-xl p-5 mb-6">
          <p className="text-glint-orange font-medium text-sm mb-2">Chiarimento richiesto</p>
          <p className="text-glint-grey text-sm">{req.reviewer_notes}</p>
          <p className="text-white/50 text-xs mt-3">
            Rispondi via email a <strong>{req.contact_email}</strong> con le informazioni richieste.
          </p>
        </div>
      )}

      {/* Description */}
      <Card className="mb-4">
        <p className="text-xs font-medium text-glint-grey uppercase tracking-wider mb-3">Descrizione richiesta</p>
        <p className="text-sm text-white/80 whitespace-pre-line">{req.description}</p>
      </Card>

      {/* AI classification */}
      {req.ai_classification_reason && (
        <Card className="mb-4">
          <p className="text-xs font-medium text-glint-grey uppercase tracking-wider mb-2">Classificazione AI</p>
          <div className="flex items-center gap-2 mb-2">
            <FixTypeBadge type={req.fix_type} />
          </div>
          <p className="text-sm text-glint-grey">{req.ai_classification_reason}</p>
        </Card>
      )}

      {/* Assigned dev */}
      {req.assigned_dev && (
        <Card>
          <p className="text-xs font-medium text-glint-grey uppercase tracking-wider mb-2">Developer assegnato</p>
          <p className="text-sm text-white">
            {(req.assigned_dev as { first_name?: string; last_name?: string })?.first_name}{' '}
            {(req.assigned_dev as { first_name?: string; last_name?: string })?.last_name}
          </p>
        </Card>
      )}
    </div>
  )
}
