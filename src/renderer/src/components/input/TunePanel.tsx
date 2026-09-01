import { useEffect, useState, type ReactNode } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { cn } from '../../lib/utils'

/**
 * The one door to everything secondary in the prompt bar. The bar itself keeps
 * only the per-generation decisions (model, count, generate); every other
 * option lives in this panel, grouped, so a new model capability costs a row
 * in here instead of a button in the bar. The badge counts settings that
 * deviate from their defaults — the state stays readable without opening it.
 */
export function TuneMenu({
  badge,
  width = 340,
  children,
}: {
  badge: number
  width?: number
  /** Render prop — `close` lets tool rows shut the panel after acting. */
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'no-drag flex items-center gap-1.5 h-8 px-3 rounded-lg border transition-all text-[12px] font-medium',
          open
            ? 'bg-surface-4 border-border-bright text-text-primary'
            : badge > 0
              ? 'bg-surface-3 border-accent-main/30 text-text-secondary hover:text-text-primary hover:bg-surface-4'
              : 'bg-surface-3 border-border-base text-text-secondary hover:text-text-primary hover:bg-surface-4'
        )}
        title="Alle weiteren Einstellungen"
      >
        <SlidersHorizontal
          className={cn('w-3.5 h-3.5 transition-transform duration-200', open && 'rotate-90')}
        />
        Tune
        {badge > 0 && (
          <span
            key={badge}
            className="animate-scale-in min-w-4 h-4 px-1 rounded-full bg-accent-main/25 text-accent-bright text-[10px] font-semibold flex items-center justify-center tabular-nums"
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={close} />
          <div
            className="absolute bottom-full left-0 mb-2 bg-surface-3 border border-border-base rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] p-2.5 z-30 animate-scale-in max-w-[min(92vw,480px)]"
            style={{ width }}
          >
            {children(close)}
          </div>
        </>
      )}
    </div>
  )
}

/** A labelled group inside the panel — options wrap as chips. */
export function TuneGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="pt-2 first:pt-0 pb-2.5 last:pb-0 border-t border-border-dim first:border-t-0">
      <div className="px-0.5 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">
        {label}
      </div>
      <div className="flex flex-wrap items-center gap-1">{children}</div>
    </div>
  )
}

/** One selectable chip inside a group. */
export function TuneOption({
  selected,
  onClick,
  disabled,
  title,
  children,
}: {
  selected?: boolean
  onClick?: () => void
  disabled?: boolean
  title?: string
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'flex items-center gap-1.5 h-7 px-2.5 rounded-lg border text-[11px] font-medium transition-all',
        disabled
          ? 'border-border-dim text-text-muted/40 cursor-not-allowed'
          : selected
            ? 'bg-accent-dim border-accent-main/40 text-accent-main'
            : 'bg-surface-4/60 border-border-base text-text-secondary hover:text-text-primary hover:bg-surface-4'
      )}
    >
      {children}
    </button>
  )
}

/** A full-width action row — for tools that open something else. */
export function TuneRow({
  icon,
  onClick,
  children,
  trailing,
}: {
  icon?: ReactNode
  onClick?: () => void
  children: ReactNode
  trailing?: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-[11.5px] font-medium text-text-secondary hover:bg-surface-4 hover:text-text-primary transition-all text-left"
    >
      {icon && <span className="shrink-0 opacity-80 flex items-center">{icon}</span>}
      <span className="flex-1 min-w-0 truncate">{children}</span>
      {trailing && <span className="shrink-0 text-text-muted">{trailing}</span>}
    </button>
  )
}

/**
 * Aspect-ratio chips plus a live custom `W:H` input — the same Format group
 * in the image bar, the chat and the video bar. Omit `onCustomRatioChange`
 * to drop the custom row (video models take fixed ratios only).
 */
export function TuneRatioOptions({
  ratios,
  value,
  onChange,
  customRatio,
  onCustomRatioChange,
}: {
  ratios: string[]
  value: string
  onChange: (ratio: string) => void
  customRatio?: string
  onCustomRatioChange?: (ratio: string) => void
}) {
  const [customW, setCustomW] = useState(customRatio?.split(':')[0] || '4')
  const [customH, setCustomH] = useState(customRatio?.split(':')[1] || '3')
  useEffect(() => {
    const parts = (customRatio ?? '').split(':')
    if (parts.length === 2) {
      setCustomW(parts[0])
      setCustomH(parts[1])
    }
  }, [customRatio])

  const applyCustom = (w: string, h: string) => {
    const wi = parseInt(w)
    const hi = parseInt(h)
    if (wi >= 1 && hi >= 1 && onCustomRatioChange) {
      onCustomRatioChange(`${wi}:${hi}`)
      onChange('custom')
    }
  }

  const inputClass =
    'w-9 h-7 rounded-md bg-surface-4 border border-border-base text-center text-[11px] text-text-primary outline-none focus:border-accent-main transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'

  return (
    <>
      {ratios.map((ratio) => (
        <TuneOption key={ratio} selected={value === ratio} onClick={() => onChange(ratio)}>
          {ratio !== 'auto' && <RatioBox ratio={ratio} active={value === ratio} />}
          {ratio}
        </TuneOption>
      ))}
      {onCustomRatioChange && (
        <div
          className="flex items-center gap-1.5 pl-1.5"
          title="Eigenes Verhältnis — wird auf das nächste unterstützte gemappt"
        >
          <span className={cn('text-[10px] font-medium', value === 'custom' ? 'text-accent-main' : 'text-text-muted')}>
            Custom
          </span>
          <input
            type="number"
            min="1"
            max="32"
            value={customW}
            onChange={(e) => {
              setCustomW(e.target.value)
              applyCustom(e.target.value, customH)
            }}
            className={inputClass}
          />
          <span className="text-[11px] text-text-muted">:</span>
          <input
            type="number"
            min="1"
            max="32"
            value={customH}
            onChange={(e) => {
              setCustomH(e.target.value)
              applyCustom(customW, e.target.value)
            }}
            className={inputClass}
          />
        </div>
      )}
    </>
  )
}

/** Miniature aspect-ratio rectangle, same visual as the old selector. */
export function RatioBox({ ratio, size = 14, active }: { ratio: string; size?: number; active?: boolean }) {
  const [w, h] = ratio.split(':').map(Number)
  const maxDim = Math.max(w || 1, h || 1)
  return (
    <div
      className={cn(
        'rounded-[3px] border-[1.5px] transition-colors shrink-0',
        active ? 'border-accent-main bg-accent-main/15' : 'border-text-muted/50'
      )}
      style={{
        width: Math.max(3, Math.round(((w || 1) / maxDim) * size)),
        height: Math.max(3, Math.round(((h || 1) / maxDim) * size)),
      }}
    />
  )
}
