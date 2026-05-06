import { clsx } from 'clsx'
import type { HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  highlight?: boolean
}

export function Card({ children, className, highlight, ...props }: CardProps) {
  return (
    <div
      className={clsx(
        'rounded-xl border bg-white/5 backdrop-blur-sm p-5',
        highlight ? 'border-glint-yellow/40' : 'border-white/10',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('mb-4', className)} {...props}>
      {children}
    </div>
  )
}

export function CardTitle({ children, className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={clsx('text-base font-700 text-white', className)} {...props}>
      {children}
    </h3>
  )
}
