import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/Card'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { RequestStatus } from '@/types'

const statusGroups: { status: RequestStatus; label: string; color: string }[] = [
  { status: 'pending', label: 'In attesa', color: 'text-glint-grey' },
  { status: 'ai_processing', label: 'AI in lavoro', color: 'text-glint-yellow' },
  { status: 'ai_completed', label: 'Da revisionare', color: 'text-blue-400' },
  { status: 'in_review', label: 'In revisione', color: 'text-purple-400' },
  { status: 'approved', label: 'Approvate', color: 'text-green-400' },
  { status: 'deployed', label: 'Deployate', color: 'text-glint-yellow' },
]

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, first_name')
    .eq('id', user!.id)
    .single()

  // Count by status
  const { data: counts } = await supabase
    .from('bug_requests')
    .select('status')

  const countMap: Record<string, number> = {}
  for (const row of counts || []) {
    countMap[row.status] = (countMap[row.status] || 0) + 1
  }

  // Recent requests
  const { data: recent } = await supabase
    .from('bug_requests')
    .select(`
      id, title, status, fix_type, created_at,
      store:stores(shop_name, shop_domain),
      client:profiles!client_id(first_name, last_name, email)
    `)
    .in('status', ['ai_completed', 'in_review', 'pending'])
    .order('created_at', { ascending: false })
    .limit(5)

  const totalOpen = (counts || []).filter((r) =>
    !['deployed', 'rejected'].includes(r.status)
  ).length

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">
          {profile?.first_name ? `Ciao, ${profile.first_name}.` : 'Overview.'}
        </h1>
        <p className="text-glint-grey text-sm mt-1">
          {totalOpen} richieste aperte
        </p>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        {statusGroups.map(({ status, label, color }) => (
          <Link key={status} href={`/admin/requests?status=${status}`}>
            <Card className="text-center hover:border-white/20 transition-colors cursor-pointer">
              <p className={`text-3xl font-bold ${color}`}>
                {countMap[status] || 0}
              </p>
              <p className="text-xs text-glint-grey mt-1">{label}</p>
            </Card>
          </Link>
        ))}
      </div>

      {/* Urgent: needs review */}
      {(countMap['ai_completed'] || 0) > 0 && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-6">
          <p className="text-blue-400 font-medium text-sm">
            {countMap['ai_completed']} richieste con fix pronto da revisionare.
          </p>
          <Link href="/admin/requests?status=ai_completed" className="text-xs text-blue-400/70 hover:text-blue-400 mt-1 inline-flex items-center gap-1">
            Vai alle richieste <ArrowRight size={12} />
          </Link>
        </div>
      )}

      {/* Recent */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold">Richieste recenti da gestire</h2>
          <Link href="/admin/requests" className="text-sm text-glint-grey hover:text-white flex items-center gap-1">
            Vedi tutte <ArrowRight size={13} />
          </Link>
        </div>
        <div className="space-y-2">
          {(recent || []).map((req) => {
            const client = req.client as { first_name?: string; last_name?: string; email?: string }
            const store = req.store as { shop_name?: string; shop_domain?: string }
            return (
              <Link
                key={req.id}
                href={`/admin/requests/${req.id}`}
                className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-5 py-3.5 hover:border-white/20 hover:bg-white/8 transition-all"
              >
                <div>
                  <p className="text-sm font-medium text-white">{req.title}</p>
                  <p className="text-xs text-glint-grey mt-0.5">
                    {client?.first_name || client?.email} · {store?.shop_name || store?.shop_domain}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-glint-grey">
                    {new Date(req.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}
                  </span>
                  <ArrowRight size={14} className="text-glint-grey" />
                </div>
              </Link>
            )
          })}
          {(!recent || recent.length === 0) && (
            <p className="text-sm text-glint-grey/50 text-center py-8">Nessuna richiesta da gestire.</p>
          )}
        </div>
      </div>
    </div>
  )
}
