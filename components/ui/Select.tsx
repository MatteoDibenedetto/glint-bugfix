'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { clsx } from 'clsx'

interface SelectOption<T extends string = string> {
  value: T
  label: string
}

interface SelectProps<T extends string = string> {
  value: T
  options: SelectOption<T>[]
  onChange: (value: T) => void
  className?: string
}

export function Select<T extends string = string>({
  value,
  options,
  onChange,
  className,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.value === value)

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className={clsx('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          'flex items-center justify-between gap-2 min-w-[140px] px-3 py-1.5 rounded-lg text-sm',
          'bg-white/5 border border-white/10 text-white',
          'hover:border-white/20 transition-colors',
          open && 'border-glint-yellow/40'
        )}
      >
        <span>{selected?.label ?? value}</span>
        <ChevronDown
          size={14}
          className={clsx('text-glint-grey transition-transform shrink-0', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[140px] bg-[#0f2621] border border-white/10 rounded-lg shadow-xl overflow-hidden">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value)
                setOpen(false)
              }}
              className={clsx(
                'w-full flex items-center justify-between px-3 py-2 text-sm text-left transition-colors',
                o.value === value
                  ? 'text-glint-yellow bg-glint-yellow/10'
                  : 'text-white hover:bg-white/8'
              )}
            >
              {o.label}
              {o.value === value && <Check size={13} className="text-glint-yellow shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
