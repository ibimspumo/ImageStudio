import { useState } from 'react'
import { RectangleHorizontal } from 'lucide-react'
import type { AspectRatio } from '../../types/api'
import { cn } from '../../lib/utils'

const RATIOS: AspectRatio[] = ['1:1', '16:9', '9:16', '4:3', '3:4']

interface AspectRatioSelectorProps {
  value: AspectRatio
  onChange: (value: AspectRatio) => void
}

export function AspectRatioSelector({ value, onChange }: AspectRatioSelectorProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="no-drag flex items-center gap-1.5 h-8 px-3 rounded-lg bg-surface-3 hover:bg-surface-4 border border-border-base text-text-secondary hover:text-text-primary transition-all text-[12px] font-medium"
      >
        <RectangleHorizontal className="w-3.5 h-3.5" />
        <span>{value}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 mb-2 bg-surface-3 border border-border-base rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] p-1.5 z-30 animate-scale-in">
            {RATIOS.map((ratio) => (
              <button
                key={ratio}
                onClick={() => { onChange(ratio); setOpen(false) }}
                className={cn(
                  'w-full text-left px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all',
                  ratio === value
                    ? 'bg-accent-dim text-accent-main'
                    : 'text-text-secondary hover:bg-surface-4 hover:text-text-primary'
                )}
              >
                {ratio}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
