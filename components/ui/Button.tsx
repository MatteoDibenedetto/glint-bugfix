'use client'

import { clsx } from 'clsx'
import { type ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, children, className, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={clsx(
          'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed',
          {
            'bg-glint-orange text-white hover:bg-orange-600 active:scale-95': variant === 'primary',
            'bg-white/10 text-white hover:bg-white/20 border border-white/10': variant === 'secondary',
            'text-glint-grey hover:text-white hover:bg-white/10': variant === 'ghost',
            'bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-600/30': variant === 'danger',
          },
          {
            'text-sm px-3 py-1.5 gap-1.5': size === 'sm',
            'text-sm px-4 py-2.5 gap-2': size === 'md',
            'text-base px-6 py-3 gap-2': size === 'lg',
          },
          className
        )}
        {...props}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
            </svg>
            {children}
          </span>
        ) : children}
      </button>
    )
  }
)
Button.displayName = 'Button'
export default Button
