import { useState } from 'react'
import { Monitor } from 'lucide-react'
import { cn } from '../../lib/utils'

interface VideoResolutionSelectorProps {
  value: string
  options: string[]
  onChange: (resolution: string) => void
}

export function VideoResolutionSelector({ value, options, onChange }: VideoResolutionSelectorProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="no-drag flex items-center gap-1.5 h-8 px-3 rounded-lg bg-surface-3 hover:bg-surface-4 border border-border-base text-text-secondary hover:text-text-primary transition-all text-[12px] font-medium"
      >
        <Monitor className="w-3.5 h-3.5" />
        <span>{value}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 mb-2 bg-surface-3 border border-border-base rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] p-2 z-30 animate-scale-in min-w-[120px]">
            <div className="px-2 pb-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Resolution</span>
            </div>

            {options.map((res) => (
              <button
                key={res}
                onClick={() => {
                  onChange(res)
                  setOpen(false)
                }}
                className={cn(
                  'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-all text-[12px]',
                  value === res
                    ? 'bg-accent-dim text-accent-main font-medium'
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
