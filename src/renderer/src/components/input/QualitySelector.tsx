import { useState } from 'react'
import { Gauge } from 'lucide-react'
import type { GptImageQuality } from '../../types/api'
import { cn } from '../../lib/utils'

interface QualitySelectorProps {
  value: GptImageQuality
  onChange: (value: GptImageQuality) => void
  available: GptImageQuality[]
}

/** GPT Image 2's quality tier — it has no resolution parameter of its own. */
export function QualitySelector({ value, onChange, available }: QualitySelectorProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen(!open)}
        className="no-drag flex items-center gap-1.5 h-8 px-3 rounded-lg bg-surface-3 hover:bg-surface-4 border border-border-base text-text-secondary hover:text-text-primary transition-all text-[12px] font-medium capitalize"
        title="Quality tier — affects cost"
      >
        <Gauge className="w-3.5 h-3.5" />
        <span>{value}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 mb-2 bg-surface-3 border border-border-base rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] p-1.5 z-30 animate-scale-in min-w-[130px]">
            <div className="text-[10px] font-medium uppercase tracking-wider text-text-muted px-2 pb-1">Quality</div>
            {available.map((q) => (
              <button
                key={q}
                onClick={() => { onChange(q); setOpen(false) }}
                className={cn(
                  'w-full text-left px-3 py-1.5 rounded-lg text-[12px] font-medium capitalize transition-all',
                  q === value
                    ? 'bg-accent-dim text-accent-main'
                    : 'text-text-secondary hover:bg-surface-4 hover:text-text-primary'
                )}
              >
                {q}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
