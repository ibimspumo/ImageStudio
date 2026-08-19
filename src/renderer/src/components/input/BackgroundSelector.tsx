import { useState } from 'react'
import { Grid2x2, Square, Sparkle, Check } from 'lucide-react'
import type { FalBackground } from '../../types/api'
import { cn } from '../../lib/utils'

interface BackgroundSelectorProps {
  value: FalBackground
  onChange: (value: FalBackground) => void
}

const OPTIONS: { id: FalBackground; label: string; hint: string; icon: typeof Grid2x2 }[] = [
  { id: 'auto', label: 'Auto', hint: 'Das Modell entscheidet', icon: Sparkle },
  {
    id: 'transparent',
    label: 'Transparent',
    hint: 'PNG mit echtem Alphakanal',
    icon: Grid2x2,
  },
  { id: 'opaque', label: 'Deckend', hint: 'Immer ein gefüllter Hintergrund', icon: Square },
]

/**
 * The `background` field — GPT Image 1.5 only, and the only route in the app to
 * an image with a real alpha channel. Hidden for every other model, because
 * they have no such parameter.
 */
export function BackgroundSelector({ value, onChange }: BackgroundSelectorProps) {
  const [open, setOpen] = useState(false)
  const active = OPTIONS.find((o) => o.id === value) ?? OPTIONS[0]
  const ActiveIcon = active.icon

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        title={active.hint}
        className={cn(
          'no-drag flex items-center gap-1.5 h-8 px-3 rounded-lg border transition-all text-[12px] font-medium',
          value === 'transparent'
            ? 'border-accent-main/30 bg-accent-dim text-accent-main'
            : 'bg-surface-3 hover:bg-surface-4 border-border-base text-text-secondary hover:text-text-primary'
        )}
      >
        <ActiveIcon className="w-3.5 h-3.5" />
        <span>{active.label}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 mb-2 bg-surface-3 border border-border-base rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] p-2 z-30 animate-scale-in min-w-[230px]">
            <div className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">
              Hintergrund
            </div>
            {OPTIONS.map((option) => {
              const isSelected = option.id === value
              const Icon = option.icon
              return (
                <button
                  key={option.id}
                  onClick={() => {
                    onChange(option.id)
                    setOpen(false)
                  }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all',
                    isSelected
                      ? 'bg-accent-dim text-accent-main'
                      : 'text-text-secondary hover:bg-surface-4 hover:text-text-primary'
                  )}
                >
                  <div
                    className={cn(
                      'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                      isSelected ? 'border-accent-main bg-accent-main/20' : 'border-text-muted/40'
                    )}
                  >
                    {isSelected && <Check className="w-2.5 h-2.5" />}
                  </div>
                  <Icon className="w-3.5 h-3.5 shrink-0 opacity-70" />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[12px] font-medium">{option.label}</span>
                    <span className="text-[10px] text-text-muted">{option.hint}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
