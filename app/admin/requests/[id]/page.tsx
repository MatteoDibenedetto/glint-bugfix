import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { StatusBadge, FixTypeBadge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { BugRequest, FileFix } from '@/types'
import RequestActions from './RequestActions'

export default async function AdminRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data } = await supabase
    .from('bug_requests')
    .select(`
      *,
      store:stores(id, shop_domain, shop_name, store_manager_id),
      client:profiles!client_id(id, email, first_name, last_name),
      assigned_dev:profiles!assigned_dev_id(id, email, first_name, last_name)
    `)
    .eq('id', id)
    .single()

  if (!data) notFound()

  const req = data as BugRequest
  const client = req.client as { email: string; first_name?: string; last_name?: string } | undefined
  const store = req.store as { shop_domain: string; shop_name?: string } | undefined
  const dev = req.assigned_dev as { first_name?: string; last_name?: string; email: string } | undefined

  // Get all staff for reassignment dropdown
  const { data: staff } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name, role')
    .in('role', ['frontend_dev', 'backend_dev', 'admin'])

  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <Link href="/admin/requests" className="inline-flex items-center gap-1.5 text-sm text-glint-grey hover:text-white transition-colors mb-4">
          <ArrowLeft size={14} /> Richieste
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
              {new Date(req.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: main content */}
        <div className="lg:col-span-2 space-y-5">
          {/* Description */}
          <Card>
            <p className="text-xs font-medium text-glint-grey uppercase tracking-wider mb-3">Descrizione</p>
            <p className="text-sm text-white/80 whitespace-pre-line">{req.description}</p>
          </Card>

          {/* AI classification reason */}
          {req.ai_classification_reason && (
            <Card>
              <p className="text-xs font-medium text-glint-grey uppercase tracking-wider mb-2">Classificazione AI</p>
              <div className="flex items-center gap-2 mb-2">
                <FixTypeBadge type={req.fix_type} />
              </div>
              <p className="text-sm text-glint-grey">{req.ai_classification_reason}</p>
            </Card>
          )}

          {/* AI Fix + actions */}
          <RequestActions
            request={req}
            fixes={(req.ai_fix_suggestion || []) as FileFix[]}
            approvedFix={(req.approved_fix || []) as FileFix[]}
            staff={staff || []}
            currentRole={currentProfile?.role || 'frontend_dev'}
          />
        </div>

        {/* Right: metadata */}
        <div className="space-y-4">
          <Card>
            <p className="text-xs font-medium text-glint-grey uppercase tracking-wider mb-3">Cliente</p>
            <p className="text-sm font-medium">
              {client?.first_name} {client?.last_name}
            </p>
            <p className="text-xs text-glint-grey mt-0.5">{client?.email}</p>
            <p className="text-xs text-glint-grey mt-0.5">{req.contact_email}</p>
          </Card>

          <Card>
            <p className="text-xs font-medium text-glint-grey uppercase tracking-wider mb-3">Store</p>
            <p className="text-sm font-medium">{store?.shop_name || store?.shop_domain}</p>
            <p className="text-xs text-glint-grey mt-0.5">{store?.shop_domain}</p>
          </Card>

          {dev && (
            <Card>
              <p className="text-xs font-medium text-glint-grey uppercase tracking-wider mb-3">Developer assegnato</p>
              <p className="text-sm font-medium">
                {dev.first_name} {dev.last_name}
              </p>
              <p className="text-xs text-glint-grey mt-0.5">{dev.email}</p>
            </Card>
          )}

          {req.reviewer_notes && (
            <Card>
              <p className="text-xs font-medium text-glint-grey uppercase tracking-wider mb-2">Note revisione</p>
              <p className="text-sm text-glint-grey">{req.reviewer_notes}</p>
            </Card>
          )}

          {req.staging_theme_name && (
            <Card highlight>
              <p className="text-xs font-medium text-glint-yellow uppercase tracking-wider mb-2">Staging theme</p>
              <p className="text-sm font-medium">{req.staging_theme_name}</p>
              <a
                href={`https://${store?.shop_domain}/admin/themes`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-glint-orange hover:underline mt-2 inline-block"
              >
                Shopify Admin →
              </a>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
