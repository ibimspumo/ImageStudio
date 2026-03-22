import { useState, useRef, useEffect } from 'react'
import { cn } from '../../lib/utils'

const PALETTE = [
  '#FF0000', '#FF6600', '#FFCC00', '#00CC00', '#0066FF', '#9933FF',
  '#FF3399', '#FFFFFF', '#CCCCCC', '#999999', '#666666', '#333333',
  '#000000', '#804000', '#FF9999', '#FFCC99', '#FFFFCC', '#CCFFCC',
  '#CCCCFF', '#FF99CC', '#00CCCC', '#FF6666', '#66CC66', '#6699FF',
]

interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const [open, setOpen] = useState(false)
  const [hexInput, setHexInput] = useState(value)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setHexInput(value)
  }, [value])

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const handleHexChange = (hex: string) => {
    setHexInput(hex)
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      onChange(hex)
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className="no-drag flex items-center gap-1.5 h-8 px-2 rounded-lg bg-surface-3 hover:bg-surface-4 border border-border-base transition-all"
        title="Color"
      >
        <div
          className="w-5 h-5 rounded-md border border-white/20 shadow-sm"
          style={{ backgroundColor: value }}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-2 bg-surface-3 border border-border-base rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] p-3 z-30 animate-scale-in min-w-[220px]">
          <div className="text-[10px] font-medium uppercase tracking-wider text-text-muted px-0.5 pb-2">Color</div>

          <div className="grid grid-cols-6 gap-1.5 mb-3">
            {PALETTE.map((color) => (
              <button
                key={color}
                onClick={() => { onChange(color); setOpen(false) }}
                className={cn(
                  'w-7 h-7 rounded-md border-2 transition-all hover:scale-110',
                  value === color ? 'border-accent-main scale-110' : 'border-transparent'
                )}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-border-dim">
            <div
              className="w-8 h-8 rounded-lg border border-border-base shadow-inner shrink-0"
              style={{ backgroundColor: value }}
            />
            <input
              type="text"
              value={hexInput}
              onChange={(e) => handleHexChange(e.target.value)}
              placeholder="#FF0000"
              className="flex-1 h-8 rounded-lg bg-surface-4 border border-border-base px-2.5 text-[12px] text-text-primary outline-none focus:border-accent-main transition-colors font-mono"
            />
          </div>
        </div>
      )}
    </div>
  )
}
