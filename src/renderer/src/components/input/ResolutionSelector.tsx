import { useState } from 'react'
import { Diamond } from 'lucide-react'
import type { Resolution, FalResolution } from '../../types/api'
import { cn } from '../../lib/utils'

interface ResolutionSelectorProps {
  value: Resolution
  onChange: (value: Resolution) => void
  /** Resolutions the currently selected model(s) can produce */
  available: FalResolution[]
  /** Shown under the list, e.g. "Nano Banana 2 Lite: Fixed 1K output" */
  notes?: string[]
}

export function ResolutionSelector({ value, onChange, available, notes }: ResolutionSelectorProps) {
  const [open, setOpen] = useState(false)

  // Every selected model has a fixed output size — nothing to choose.
  if (available.length === 0) {
    return (
      <div
        className="no-drag shrink-0 flex items-center gap-1.5 h-8 px-3 rounded-lg bg-surface-3 border border-border-dim text-text-muted text-[12px] font-medium"
        title={notes?.join('\n') || 'This model has a fixed output size'}
      >
        <Diamond className="w-3.5 h-3.5" />
        <span>1K</span>
      </div>
    )
  }

  return (
    <div className="relative shrink-0">
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
          <div className="absolute bottom-full left-0 mb-2 bg-surface-3 border border-border-base rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] p-1.5 z-30 animate-scale-in min-w-[120px]">
            {available.map((res) => (
              <button
                key={res}
                onClick={() => { onChange(res as Resolution); setOpen(false) }}
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

            {notes && notes.length > 0 && (
              <div className="border-t border-border-dim mt-1.5 pt-1.5 px-2 pb-0.5 space-y-0.5">
                {notes.map((note) => (
                  <p key={note} className="text-[10px] text-text-muted/70 leading-snug">{note}</p>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
