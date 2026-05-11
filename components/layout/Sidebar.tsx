'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { clsx } from 'clsx'
import type { UserRole } from '@/types'
import {
  LayoutDashboard, PlusCircle, Users, Store, ChevronRight, LogOut,
} from 'lucide-react'

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  roles: UserRole[]
  exact?: boolean
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Le mie richieste', icon: LayoutDashboard, roles: ['client'] },
  { href: '/dashboard/new', label: 'Nuova richiesta', icon: PlusCircle, roles: ['client'] },
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, roles: ['admin', 'frontend_dev', 'backend_dev', 'store_manager'], exact: true },
  { href: '/admin/requests', label: 'Richieste', icon: ChevronRight, roles: ['admin', 'frontend_dev', 'backend_dev', 'store_manager'] },
  { href: '/admin/staff', label: 'Staff', icon: Users, roles: ['admin'] },
  { href: '/admin/stores', label: 'Store', icon: Store, roles: ['admin'] },
]

interface SidebarProps {
  role: UserRole
  email: string
  onSignOut: () => void
}

export default function Sidebar({ role, email, onSignOut }: SidebarProps) {
  const pathname = usePathname()
  const visibleItems = navItems.filter((item) => item.roles.includes(role))

  return (
    <aside className="flex flex-col w-60 min-h-screen bg-black/20 border-r border-white/8 px-3 py-5">
      {/* Logo */}
      <Link href={role === 'client' ? '/dashboard' : '/admin'} className="px-3 mb-8">
        <span className="text-2xl font-bold text-glint-yellow tracking-tight">glint.</span>
      </Link>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5">
        {visibleItems.map((item) => {
          const Icon = item.icon
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'bg-glint-yellow/15 text-glint-yellow'
                  : 'text-glint-grey hover:text-white hover:bg-white/8'
              )}
            >
              <Icon size={16} strokeWidth={active ? 2.5 : 2} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Role badge */}
      <div className="px-3 mb-3">
        <span className="inline-block text-xs font-medium uppercase tracking-wider text-glint-grey/60">
          {role.replace('_', ' ')}
        </span>
      </div>

      {/* User */}
      <div className="border-t border-white/8 pt-3 px-1">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="w-7 h-7 rounded-full bg-glint-orange/20 flex items-center justify-center text-xs font-bold text-glint-orange">
            {email.charAt(0).toUpperCase()}
          </div>
          <span className="flex-1 text-xs text-glint-grey truncate">{email}</span>
          <button
            onClick={onSignOut}
            className="text-glint-grey/50 hover:text-white transition-colors"
            title="Esci"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  )
}
