import { Layers } from 'lucide-react'
import { cn } from '../../lib/utils'

interface ImageCountSelectorProps {
  value: number
  onChange: (value: number) => void
  /** Upper bound of the selected model(s) — 4 for every current fal.ai model */
  max?: number
}

export function ImageCountSelector({ value, onChange, max = 4 }: ImageCountSelectorProps) {
  const decrement = () => onChange(Math.max(1, value - 1))
  const increment = () => onChange(Math.min(max, value + 1))

  return (
    <div className="no-drag shrink-0 flex items-center h-8 rounded-lg bg-surface-3 border border-border-base overflow-hidden">
      <button
        onClick={decrement}
        disabled={value <= 1}
        className={cn(
          'flex items-center justify-center w-7 h-full text-[14px] font-medium transition-all',
          value <= 1 ? 'text-text-muted cursor-not-allowed' : 'text-text-secondary hover:text-text-primary hover:bg-surface-4'
        )}
      >
        −
      </button>
      <span className="flex items-center gap-1 px-1.5 text-[12px] font-medium text-text-secondary">
        <Layers className="w-3.5 h-3.5" />
        {value}x
      </span>
      <button
        onClick={increment}
        disabled={value >= max}
        className={cn(
          'flex items-center justify-center w-7 h-full text-[14px] font-medium transition-all',
          value >= max ? 'text-text-muted cursor-not-allowed' : 'text-text-secondary hover:text-text-primary hover:bg-surface-4'
        )}
      >
        +
      </button>
    </div>
  )
}
