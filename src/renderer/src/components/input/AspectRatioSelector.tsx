import { useState, useRef, useEffect } from 'react'
import type { AspectRatio } from '../../types/api'
import { cn } from '../../lib/utils'

const RATIOS: { value: AspectRatio; label: string; w: number; h: number }[] = [
  { value: '1:1', label: '1:1', w: 1, h: 1 },
  { value: '3:4', label: '3:4', w: 3, h: 4 },
  { value: '4:3', label: '4:3', w: 4, h: 3 },
  { value: '2:3', label: '2:3', w: 2, h: 3 },
  { value: '3:2', label: '3:2', w: 3, h: 2 },
  { value: '9:16', label: '9:16', w: 9, h: 16 },
  { value: '16:9', label: '16:9', w: 16, h: 9 },
  { value: '5:4', label: '5:4', w: 5, h: 4 },
  { value: '4:5', label: '4:5', w: 4, h: 5 },
  { value: '21:9', label: '21:9', w: 21, h: 9 },
]

function RatioBox({ w, h, size = 20, active }: { w: number; h: number; size?: number; active?: boolean }) {
  const maxDim = Math.max(w, h)
  const bw = Math.round((w / maxDim) * size)
  const bh = Math.round((h / maxDim) * size)
  return (
    <div
      className={cn(
        'rounded-[3px] border-[1.5px] transition-colors',
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
}

export function AspectRatioSelector({ value, onChange, customRatio, onCustomRatioChange }: AspectRatioSelectorProps) {
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
  const currentPreset = RATIOS.find((r) => r.value === value)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="no-drag flex items-center gap-1.5 h-8 px-3 rounded-lg bg-surface-3 hover:bg-surface-4 border border-border-base text-text-secondary hover:text-text-primary transition-all text-[12px] font-medium"
      >
        {currentPreset ? (
          <RatioBox w={currentPreset.w} h={currentPreset.h} size={14} active />
        ) : (
          <RatioBox w={parseInt(customW) || 4} h={parseInt(customH) || 3} size={14} active />
        )}
        <span>{displayLabel}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 mb-2 bg-surface-3 border border-border-base rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] p-2 z-30 animate-scale-in min-w-[200px]">
            <div className="text-[10px] font-medium uppercase tracking-wider text-text-muted px-2 pb-1.5">Aspect Ratio</div>

            <div className="grid grid-cols-2 gap-1">
              {RATIOS.map((ratio) => (
                <button
                  key={ratio.value}
                  onClick={() => { onChange(ratio.value); setOpen(false) }}
                  className={cn(
                    'flex items-center gap-2 px-2.5 py-2 rounded-lg text-[12px] font-medium transition-all',
                    ratio.value === value
                      ? 'bg-accent-dim text-accent-main'
                      : 'text-text-secondary hover:bg-surface-4 hover:text-text-primary'
                  )}
                >
                  <RatioBox w={ratio.w} h={ratio.h} size={18} active={ratio.value === value} />
                  <span>{ratio.label}</span>
                </button>
              ))}
            </div>

            {/* Custom ratio */}
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
                  {/* Live preview */}
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
            </div>
          </div>
        </>
      )}
    </div>
  )
}
