import { useState } from 'react'
import { Clock } from 'lucide-react'
import { cn } from '../../lib/utils'

interface DurationSelectorProps {
  value: number
  options: number[]
  onChange: (duration: number) => void
}

export function DurationSelector({ value, options, onChange }: DurationSelectorProps) {
  const [open, setOpen] = useState(false)

  const min = Math.min(...options)
  const max = Math.max(...options)
  const useSlider = options.length > 4

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="no-drag flex items-center gap-1.5 h-8 px-3 rounded-lg bg-surface-3 hover:bg-surface-4 border border-border-base text-text-secondary hover:text-text-primary transition-all text-[12px] font-medium"
      >
        <Clock className="w-3.5 h-3.5" />
        <span>{value}s</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 mb-2 bg-surface-3 border border-border-base rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] p-2 z-30 animate-scale-in min-w-[180px]">
            <div className="px-2 pb-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Duration</span>
            </div>

            {useSlider ? (
              <div className="px-2 py-2 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-text-muted">{min}s</span>
                  <span className="text-[13px] font-semibold text-text-primary tabular-nums">{value}s</span>
                  <span className="text-[11px] text-text-muted">{max}s</span>
                </div>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={1}
                  value={value}
                  onChange={(e) => {
                    const v = parseInt(e.target.value)
                    if (options.includes(v)) onChange(v)
                  }}
                  className="w-full h-1 rounded-full appearance-none bg-surface-4 accent-accent-main cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-main [&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(167,139,250,0.4)]"
                />
              </div>
            ) : (
              options.map((d) => (
                <button
                  key={d}
                  onClick={() => {
                    onChange(d)
                    setOpen(false)
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-all text-[12px]',
                    value === d
                      ? 'bg-accent-dim text-accent-main font-medium'
                      : 'text-text-secondary hover:bg-surface-4 hover:text-text-primary'
                  )}
                >
                  {d} seconds
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
