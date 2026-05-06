'use client'

import { useRouter } from 'next/navigation'
import Sidebar from './Sidebar'
import type { UserRole } from '@/types'
import { createClient } from '@/lib/supabase/client'

interface AppShellProps {
  children: React.ReactNode
  role: UserRole
  email: string
}

export default function AppShell({ children, role, email }: AppShellProps) {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar role={role} email={email} onSignOut={handleSignOut} />
      <main className="flex-1 overflow-y-auto p-8">
        {children}
      </main>
    </div>
  )
}
