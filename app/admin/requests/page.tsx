import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { StatusBadge, FixTypeBadge } from '@/components/ui/Badge'
import { ArrowRight } from 'lucide-react'
import type { RequestStatus, BugRequest } from '@/types'

const statusFilters: { value: string; label: string }[] = [
  { value: '', label: 'Tutte' },
  { value: 'pending', label: 'In attesa' },
  { value: 'ai_completed', label: 'Da revisionare' },
  { value: 'in_review', label: 'In revisione' },
  { value: 'approved', label: 'Approvate' },
  { value: 'deployed', label: 'Deployate' },
  { value: 'rejected', label: 'Rifiutate' },
]

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('bug_requests')
    .select(`
      *,
      store:stores(shop_domain, shop_name),
      client:profiles!client_id(id, email, first_name, last_name),
      assigned_dev:profiles!assigned_dev_id(id, email, first_name, last_name)
    `)
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status as RequestStatus)
  }

  const { data: requests } = await query

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Richieste</h1>
        <p className="text-glint-grey text-sm mt-1">{requests?.length ?? 0} risultati</p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap mb-6">
        {statusFilters.map((f) => (
          <Link
            key={f.value}
            href={f.value ? `/admin/requests?status=${f.value}` : '/admin/requests'}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              (status || '') === f.value
                ? 'bg-glint-yellow text-glint-green font-medium'
                : 'bg-white/5 text-glint-grey hover:bg-white/10 hover:text-white'
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {/* List */}
      <div className="space-y-2">
        {(!requests || requests.length === 0) ? (
          <p className="text-center text-glint-grey/50 py-12">Nessuna richiesta.</p>
        ) : (
          (requests as BugRequest[]).map((req) => {
            const client = req.client as { first_name?: string; last_name?: string; email?: string } | undefined
            const store = req.store as { shop_name?: string; shop_domain?: string } | undefined
            const dev = req.assigned_dev as { first_name?: string; last_name?: string } | undefined
            return (
              <Link
                key={req.id}
                href={`/admin/requests/${req.id}`}
                className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-5 py-4 hover:border-white/20 hover:bg-white/8 transition-all"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <StatusBadge status={req.status} />
                    <FixTypeBadge type={req.fix_type} />
                  </div>
                  <p className="font-medium text-white truncate">{req.title}</p>
                  <p className="text-xs text-glint-grey mt-0.5">
                    {client?.first_name || client?.email} · {store?.shop_name || store?.shop_domain}
                    {dev && ` · assegnato a ${dev.first_name || 'dev'}`}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  <span className="text-xs text-glint-grey">
                    {new Date(req.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: '2-digit' })}
                  </span>
                  <ArrowRight size={14} className="text-glint-grey" />
                </div>
              </Link>
            )
          })
        )}
      </div>
    </div>
  )
}
