import { clsx } from 'clsx'
import type { RequestStatus, FixType } from '@/types'

const statusConfig: Record<RequestStatus, { label: string; labelIt: string; color: string }> = {
  pending:            { label: 'Pending',            labelIt: 'In attesa',          color: 'bg-white/10 text-glint-grey' },
  ai_processing:      { label: 'AI Processing',      labelIt: 'AI in elaborazione', color: 'bg-glint-yellow/20 text-glint-yellow' },
  ai_completed:       { label: 'Fix Ready',          labelIt: 'Fix pronto',         color: 'bg-blue-500/20 text-blue-400' },
  in_review:          { label: 'In Review',          labelIt: 'In revisione',       color: 'bg-purple-500/20 text-purple-400' },
  changes_requested:  { label: 'Changes Requested',  labelIt: 'Chiarimenti richiesti', color: 'bg-glint-orange/20 text-glint-orange' },
  approved:           { label: 'Approved',           labelIt: 'Approvato',          color: 'bg-green-500/20 text-green-400' },
  deployed:           { label: 'Deployed',           labelIt: 'Deployato',          color: 'bg-glint-yellow/20 text-glint-yellow' },
  rejected:           { label: 'Rejected',           labelIt: 'Rifiutato',          color: 'bg-red-500/20 text-red-400' },
}

const fixTypeConfig: Record<FixType, { label: string; color: string }> = {
  frontend: { label: 'Frontend', color: 'bg-blue-500/20 text-blue-400' },
  backend:  { label: 'Backend',  color: 'bg-purple-500/20 text-purple-400' },
  unknown:  { label: '—',        color: 'bg-white/10 text-glint-grey' },
}

interface StatusBadgeProps {
  status: RequestStatus
  lang?: 'it' | 'en'
}

export function StatusBadge({ status, lang = 'it' }: StatusBadgeProps) {
  const config = statusConfig[status]
  return (
    <span className={clsx('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', config.color)}>
      {lang === 'it' ? config.labelIt : config.label}
    </span>
  )
}

interface FixTypeBadgeProps {
  type: FixType
}

export function FixTypeBadge({ type }: FixTypeBadgeProps) {
  const config = fixTypeConfig[type]
  return (
    <span className={clsx('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', config.color)}>
      {config.label}
    </span>
  )
}
