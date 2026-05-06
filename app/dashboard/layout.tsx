import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppShell from '@/components/layout/AppShell'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, email')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/')

  // Staff should be in /admin, not /dashboard
  if (['admin', 'frontend_dev', 'backend_dev', 'store_manager'].includes(profile.role)) {
    redirect('/admin')
  }

  return (
    <AppShell role={profile.role} email={profile.email || user.email || ''}>
      {children}
    </AppShell>
  )
}
