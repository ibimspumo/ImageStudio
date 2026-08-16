import { useState, useRef, useEffect } from 'react'
import type { AspectRatio, FalAspectRatio } from '../../types/api'
import { cn } from '../../lib/utils'

const RATIO_DIMS: Record<string, { w: number; h: number }> = {
  '1:1': { w: 1, h: 1 },
  '3:4': { w: 3, h: 4 },
  '4:3': { w: 4, h: 3 },
  '2:3': { w: 2, h: 3 },
  '3:2': { w: 3, h: 2 },
  '9:16': { w: 9, h: 16 },
  '16:9': { w: 16, h: 9 },
  '5:4': { w: 5, h: 4 },
  '4:5': { w: 4, h: 5 },
  '21:9': { w: 21, h: 9 },
  '4:1': { w: 4, h: 1 },
  '1:4': { w: 1, h: 4 },
  '8:1': { w: 8, h: 1 },
  '1:8': { w: 1, h: 8 },
}

function RatioBox({ w, h, size = 20, active }: { w: number; h: number; size?: number; active?: boolean }) {
  const maxDim = Math.max(w, h)
  const bw = Math.max(3, Math.round((w / maxDim) * size))
  const bh = Math.max(3, Math.round((h / maxDim) * size))
  return (
    <div
      className={cn(
        'rounded-[3px] border-[1.5px] transition-colors shrink-0',
        active ? 'border-accent-main bg-accent-main/15' : 'border-text-muted/50'
      )}
      style={{ width: bw, height: bh }}
    />
  )
}

interface AspectRatioSelectorProps {
  value: AspectRatio
  onChange: (value: AspectRatio) => void
  customRatio?: string
  onCustomRatioChange?: (ratio: string) => void
  /** Ratios the currently selected model(s) can produce */
  available: FalAspectRatio[]
}

export function AspectRatioSelector({ value, onChange, customRatio, onCustomRatioChange, available }: AspectRatioSelectorProps) {
  const [open, setOpen] = useState(false)
  const [customW, setCustomW] = useState('4')
  const [customH, setCustomH] = useState('3')
  const wInputRef = useRef<HTMLInputElement>(null)

  // Parse custom ratio when opening
  useEffect(() => {
    if (open && value === 'custom' && customRatio) {
      const parts = customRatio.split(':')
      if (parts.length === 2) {
        setCustomW(parts[0])
        setCustomH(parts[1])
      }
    }
  }, [open, value, customRatio])

  const customValid = !!(parseInt(customW) >= 1 && parseInt(customH) >= 1)

  const handleCustomApply = () => {
    if (!customValid) return
    const w = parseInt(customW)
    const h = parseInt(customH)
    onChange('custom')
    onCustomRatioChange?.(`${w}:${h}`)
    setOpen(false)
  }

  const displayLabel = value === 'custom' && customRatio ? customRatio : value
  const currentDims = value === 'custom'
    ? { w: parseInt(customW) || 4, h: parseInt(customH) || 3 }
    : RATIO_DIMS[value]

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="no-drag flex items-center gap-1.5 h-8 px-3 rounded-lg bg-surface-3 hover:bg-surface-4 border border-border-base text-text-secondary hover:text-text-primary transition-all text-[12px] font-medium"
      >
        {currentDims ? <RatioBox w={currentDims.w} h={currentDims.h} size={14} active /> : null}
        <span>{displayLabel}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 mb-2 bg-surface-3 border border-border-base rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] p-2 z-30 animate-scale-in min-w-[220px]">
            <div className="text-[10px] font-medium uppercase tracking-wider text-text-muted px-2 pb-1.5">Aspect Ratio</div>

            <div className="grid grid-cols-2 gap-1">
              {available.map((ratio) => {
                const dims = RATIO_DIMS[ratio]
                return (
                  <button
                    key={ratio}
                    onClick={() => { onChange(ratio as AspectRatio); setOpen(false) }}
                    className={cn(
                      'flex items-center gap-2 px-2.5 py-2 rounded-lg text-[12px] font-medium transition-all',
                      ratio === value
                        ? 'bg-accent-dim text-accent-main'
                        : 'text-text-secondary hover:bg-surface-4 hover:text-text-primary'
                    )}
                  >
                    {dims
                      ? <RatioBox w={dims.w} h={dims.h} size={18} active={ratio === value} />
                      : <span className="w-[18px] text-center text-text-muted">◇</span>}
                    <span>{ratio}</span>
                  </button>
                )
              })}
            </div>

            {/* Custom ratio — mapped to the closest ratio each model supports */}
            <div className="border-t border-border-dim mt-2 pt-2">
              <div className="flex items-center gap-2 px-1">
                <span className="text-[11px] text-text-muted font-medium shrink-0">Custom</span>
                <div className="flex items-center gap-1.5 flex-1">
                  <input
                    ref={wInputRef}
                    type="number"
                    min="1"
                    max="32"
                    value={customW}
                    onChange={(e) => setCustomW(e.target.value)}
                    className="w-10 h-7 rounded-md bg-surface-4 border border-border-base text-center text-[12px] text-text-primary outline-none focus:border-accent-main transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="text-[11px] text-text-muted">:</span>
                  <input
                    type="number"
                    min="1"
                    max="32"
                    value={customH}
                    onChange={(e) => setCustomH(e.target.value)}
                    className="w-10 h-7 rounded-md bg-surface-4 border border-border-base text-center text-[12px] text-text-primary outline-none focus:border-accent-main transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <RatioBox w={parseInt(customW) || 1} h={parseInt(customH) || 1} size={18} active={value === 'custom'} />
                  <button
                    onClick={handleCustomApply}
                    disabled={!customValid}
                    className={cn(
                      'ml-auto px-2.5 h-7 rounded-md text-[11px] font-medium transition-colors',
                      customValid
                        ? 'bg-accent-dim text-accent-main hover:bg-accent-main/20'
                        : 'bg-surface-4 text-text-muted cursor-not-allowed'
                    )}
                  >
                    Apply
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-text-muted/70 px-1 pt-1.5 leading-snug">
                A ratio a model cannot produce is mapped to its closest supported one.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
