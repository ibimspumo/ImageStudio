import { useState } from 'react'
import { Check, Flame, Palette, Sparkles } from 'lucide-react'
import { THUMBNAIL_STYLES, type ThumbnailStyle } from '../../types/api'
import { cn } from '../../lib/utils'

interface StyleSelectorProps {
  value: ThumbnailStyle
  onChange: (style: ThumbnailStyle) => void
}

const ICONS = { auto: Sparkles, clean: Palette, balanced: Palette, bold: Flame } as const

/**
 * How hard the thumbnail should shout. `Automatisch` is the default and adds
 * nothing — the prompt alone decides. The three explicit steps exist because
 * two would make the jump from restrained to loud a cliff.
 */
export function StyleSelector({ value, onChange }: StyleSelectorProps) {
  const [open, setOpen] = useState(false)
  const active = THUMBNAIL_STYLES.find((s) => s.id === value) ?? THUMBNAIL_STYLES[0]
  const ActiveIcon = ICONS[active.id]

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'no-drag flex items-center gap-1.5 h-8 px-3 rounded-lg border transition-all text-[12px] font-medium',
          value === 'bold'
            ? 'bg-danger/10 border-danger/30 text-danger'
            : 'bg-surface-3 hover:bg-surface-4 border-border-base text-text-secondary hover:text-text-primary'
        )}
        title={active.hint}
      >
        <ActiveIcon className="w-3.5 h-3.5" />
        <span>{active.name}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 mb-2 bg-surface-3 border border-border-base rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] p-2 z-30 animate-scale-in min-w-[260px]">
            <div className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">
              Stil
            </div>
            {THUMBNAIL_STYLES.map((option) => {
              const isSelected = option.id === value
              return (
                <div key={option.id}>
                {/* "Automatisch" is the absence of a style, not one of them. */}
                {option.id === 'clean' && <div className="h-px bg-border-dim/60 my-1 mx-2" />}
                <button
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
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[12px] font-medium">{option.name}</span>
                    <span className="text-[10px] text-text-muted">{option.hint}</span>
                  </div>
                </button>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
