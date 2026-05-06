import { clsx } from 'clsx'
import { type InputHTMLAttributes, type TextareaHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label className="block text-sm font-medium text-glint-grey">
            {label}
            {props.required && <span className="text-glint-orange ml-1">*</span>}
          </label>
        )}
        <input
          ref={ref}
          className={clsx(
            'w-full bg-white/5 border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder:text-white/30',
            'focus:outline-none focus:border-glint-yellow/60 focus:bg-white/8 transition-colors',
            error && 'border-red-500/60 focus:border-red-500',
            className
          )}
          {...props}
        />
        {hint && !error && <p className="text-xs text-white/40">{hint}</p>}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    )
  }
)
Input.displayName = 'Input'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  hint?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className, ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label className="block text-sm font-medium text-glint-grey">
            {label}
            {props.required && <span className="text-glint-orange ml-1">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          className={clsx(
            'w-full bg-white/5 border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 resize-none',
            'focus:outline-none focus:border-glint-yellow/60 focus:bg-white/8 transition-colors',
            error && 'border-red-500/60 focus:border-red-500',
            className
          )}
          {...props}
        />
        {hint && !error && <p className="text-xs text-white/40">{hint}</p>}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    )
  }
)
Textarea.displayName = 'Textarea'
