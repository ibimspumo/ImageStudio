import { Layers } from 'lucide-react'
import { cn } from '../../lib/utils'

interface ImageCountSelectorProps {
  value: number
  onChange: (value: number) => void
}

export function ImageCountSelector({ value, onChange }: ImageCountSelectorProps) {
  const decrement = () => onChange(Math.max(1, value - 1))
  const increment = () => onChange(Math.min(4, value + 1))

  return (
    <div className="no-drag flex items-center h-8 rounded-lg bg-surface-3 border border-border-base overflow-hidden">
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
        disabled={value >= 4}
        className={cn(
          'flex items-center justify-center w-7 h-full text-[14px] font-medium transition-all',
          value >= 4 ? 'text-text-muted cursor-not-allowed' : 'text-text-secondary hover:text-text-primary hover:bg-surface-4'
        )}
      >
        +
      </button>
    </div>
  )
}
