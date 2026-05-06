import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { PlusCircle, Clock } from 'lucide-react'
import { StatusBadge, FixTypeBadge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import type { BugRequest } from '@/types'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: requests } = await supabase
    .from('bug_requests')
    .select(`*, store:stores(shop_domain, shop_name)`)
    .eq('client_id', user!.id)
    .order('created_at', { ascending: false })

  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name')
    .eq('id', user!.id)
    .single()

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">
            {profile?.first_name ? `Ciao, ${profile.first_name}.` : 'Le tue richieste.'}
          </h1>
          <p className="text-glint-grey text-sm mt-1">
            {requests?.length ?? 0} richieste totali
          </p>
        </div>
        <Link href="/dashboard/new">
          <Button>
            <PlusCircle size={15} />
            Nuova richiesta
          </Button>
        </Link>
      </div>

      {!requests || requests.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-white/10 rounded-2xl">
          <Clock size={40} className="mx-auto text-glint-grey/30 mb-4" />
          <p className="text-glint-grey font-medium mb-1">Nessuna richiesta ancora</p>
          <p className="text-glint-grey/50 text-sm mb-6">Apri la tua prima richiesta di fix.</p>
          <Link href="/dashboard/new">
            <Button>
              <PlusCircle size={15} />
              Nuova richiesta
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {(requests as BugRequest[]).map((req) => (
            <Link
              key={req.id}
              href={`/dashboard/request/${req.id}`}
              className="block bg-white/5 border border-white/10 rounded-xl p-5 hover:border-white/20 hover:bg-white/8 transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <StatusBadge status={req.status} />
                    <FixTypeBadge type={req.fix_type} />
                  </div>
                  <h3 className="font-medium text-white truncate">{req.title}</h3>
                  <p className="text-sm text-glint-grey mt-1 line-clamp-2">{req.description}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-glint-grey/60">
                    {new Date(req.created_at).toLocaleDateString('it-IT', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                  {(req.store as { shop_name?: string; shop_domain?: string })?.shop_name && (
                    <p className="text-xs text-glint-grey mt-1">
                      {(req.store as { shop_name?: string })?.shop_name}
                    </p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
