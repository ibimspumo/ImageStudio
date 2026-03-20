import { useState } from 'react'
import { Diamond } from 'lucide-react'
import type { Resolution } from '../../types/api'
import { cn } from '../../lib/utils'

const RESOLUTIONS: Resolution[] = ['1K', '2K', '4K']

interface ResolutionSelectorProps {
  value: Resolution
  onChange: (value: Resolution) => void
}

export function ResolutionSelector({ value, onChange }: ResolutionSelectorProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="no-drag flex items-center gap-1.5 h-8 px-3 rounded-lg bg-surface-3 hover:bg-surface-4 border border-border-base text-text-secondary hover:text-text-primary transition-all text-[12px] font-medium"
      >
        <Diamond className="w-3.5 h-3.5" />
        <span>{value}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 mb-2 bg-surface-3 border border-border-base rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] p-1.5 z-30 animate-scale-in">
            {RESOLUTIONS.map((res) => (
              <button
                key={res}
                onClick={() => { onChange(res); setOpen(false) }}
                className={cn(
                  'w-full text-left px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all',
                  res === value
                    ? 'bg-accent-dim text-accent-main'
                    : 'text-text-secondary hover:bg-surface-4 hover:text-text-primary'
                )}
              >
                {res}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
