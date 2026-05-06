import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppShell from '@/components/layout/AppShell'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  console.log(`[dashboard layout] getUser: id=${user?.id ?? 'null'} email=${user?.email ?? 'null'} error=${userError?.message ?? 'none'}`)

  if (!user) {
    console.log('[dashboard layout] no user, redirecting to /')
    redirect('/')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, email')
    .eq('id', user.id)
    .single()
  console.log(`[dashboard layout] profile fetch: profile=${JSON.stringify(profile)} error=${profileError?.message ?? 'none'} code=${profileError?.code ?? 'none'}`)

  if (!profile) {
    console.log('[dashboard layout] no profile, redirecting to /')
    redirect('/')
  }

  // Staff should be in /admin, not /dashboard
  if (['admin', 'frontend_dev', 'backend_dev', 'store_manager'].includes(profile.role)) {
    console.log(`[dashboard layout] staff role ${profile.role}, redirecting to /admin`)
    redirect('/admin')
  }

  return (
    <AppShell role={profile.role} email={profile.email || user.email || ''}>
      {children}
    </AppShell>
  )
}
