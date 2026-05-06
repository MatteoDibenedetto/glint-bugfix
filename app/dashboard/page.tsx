import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { PlusCircle, Clock, Store } from 'lucide-react'
import { StatusBadge, FixTypeBadge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import ConnectStoreBanner from './ConnectStoreBanner'
import type { BugRequest } from '@/types'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ store_connected?: string; error?: string }>
}) {
  const { store_connected, error } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: requests }, { data: stores }, { data: profile }] = await Promise.all([
    supabase
      .from('bug_requests')
      .select('*, store:stores(shop_domain, shop_name)')
      .eq('client_id', user!.id)
      .order('created_at', { ascending: false }),
    supabase.from('stores').select('id, shop_domain, shop_name').eq('owner_id', user!.id),
    supabase.from('profiles').select('first_name').eq('id', user!.id).single(),
  ])

  const hasStores = stores && stores.length > 0

  return (
    <div className="max-w-4xl">
      {/* Notifications */}
      {store_connected === '1' && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 mb-6">
          <p className="text-sm text-green-400 font-medium">Store connesso con successo.</p>
        </div>
      )}
      {error === 'store_auth_failed' && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-6">
          <p className="text-sm text-red-400">Connessione store fallita. Riprova.</p>
        </div>
      )}

      {/* Connect store banner */}
      {!hasStores && <ConnectStoreBanner />}

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">
            {profile?.first_name ? `Ciao, ${profile.first_name}.` : 'Le tue richieste.'}
          </h1>
          <p className="text-glint-grey text-sm mt-1">
            {requests?.length ?? 0} richieste totali
          </p>
        </div>
        {hasStores && (
          <Link href="/dashboard/new">
            <Button>
              <PlusCircle size={15} />
              Nuova richiesta
            </Button>
          </Link>
        )}
      </div>

      {!requests || requests.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-white/10 rounded-2xl">
          <Clock size={40} className="mx-auto text-glint-grey/30 mb-4" />
          <p className="text-glint-grey font-medium mb-1">Nessuna richiesta ancora</p>
          <p className="text-glint-grey/50 text-sm mb-6">
            {hasStores ? 'Apri la tua prima richiesta di fix.' : 'Connetti prima il tuo store.'}
          </p>
          {hasStores && (
            <Link href="/dashboard/new">
              <Button><PlusCircle size={15} />Nuova richiesta</Button>
            </Link>
          )}
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
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                  </p>
                  {(req.store as { shop_name?: string })?.shop_name && (
                    <p className="text-xs text-glint-grey mt-1">
                      {(req.store as { shop_name?: string }).shop_name}
                    </p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Add another store */}
      {hasStores && (
        <div className="mt-8 pt-6 border-t border-white/8">
          <div className="flex items-center gap-2">
            <Store size={14} className="text-glint-grey/50" />
            <span className="text-xs text-glint-grey/50">
              Hai {stores.length} store connesso{stores.length > 1 ? 'i' : ''}.
            </span>
            <Link href="/dashboard/connect-store" className="text-xs text-glint-orange hover:underline ml-1">
              Aggiungi altro store
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
