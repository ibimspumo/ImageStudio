import { useState } from 'react'
import { cn } from '../../lib/utils'

export interface LogoSizeOption {
  /** The aspect ratio the app speaks in. */
  ratio: string
  /** The exact `image_size` the endpoint will receive, e.g. "1024x1024". */
  size: string
}

interface LogoSizeSelectorProps {
  value: string
  onChange: (ratio: string) => void
  options: LogoSizeOption[]
}

function SizeBox({ ratio, active }: { ratio: string; active?: boolean }) {
  const [w, h] = ratio.split(':').map(Number)
  const max = Math.max(w || 1, h || 1)
  return (
    <div
      className={cn(
        'rounded-[3px] border-[1.5px] transition-colors shrink-0',
        active ? 'border-accent-main bg-accent-main/15' : 'border-text-muted/50'
      )}
      style={{ width: Math.round(((w || 1) / max) * 16), height: Math.round(((h || 1) / max) * 16) }}
    />
  )
}

/**
 * GPT Image 1.5 has three output sizes and no resolution axis, so this shows
 * the actual pixels rather than a ratio the model would only approximate.
 */
export function LogoSizeSelector({ value, onChange, options }: LogoSizeSelectorProps) {
  const [open, setOpen] = useState(false)
  const active = options.find((o) => o.ratio === value) ?? options[0]

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="no-drag flex items-center gap-1.5 h-8 px-3 rounded-lg bg-surface-3 hover:bg-surface-4 border border-border-base text-text-secondary hover:text-text-primary transition-all text-[12px] font-medium"
        title={active ? `${active.size} px` : undefined}
      >
        {active && <SizeBox ratio={active.ratio} active />}
        <span>{active?.ratio ?? value}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 mb-2 bg-surface-3 border border-border-base rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] p-2 z-30 animate-scale-in min-w-[190px]">
            <div className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">
              Format
            </div>
            {options.map((option) => {
              const isSelected = option.ratio === value
              return (
                <button
                  key={option.ratio}
                  onClick={() => {
                    onChange(option.ratio)
                    setOpen(false)
                  }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all',
                    isSelected
                      ? 'bg-accent-dim text-accent-main'
                      : 'text-text-secondary hover:bg-surface-4 hover:text-text-primary'
                  )}
                >
                  <SizeBox ratio={option.ratio} active={isSelected} />
                  <span className="text-[12px] font-medium">{option.ratio}</span>
                  <span className="ml-auto text-[10px] text-text-muted tabular-nums">
                    {option.size.replace('x', ' × ')}
                  </span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
