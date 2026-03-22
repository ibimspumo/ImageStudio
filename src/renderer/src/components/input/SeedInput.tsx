import { useState } from 'react'
import { Dices, X } from 'lucide-react'
import { cn } from '../../lib/utils'

interface SeedInputProps {
  seed: number | undefined
  onChange: (seed: number | undefined) => void
}

export function SeedInput({ seed, onChange }: SeedInputProps) {
  const [expanded, setExpanded] = useState(false)
  const isActive = seed != null

  if (!expanded && !isActive) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="no-drag flex items-center justify-center h-8 w-8 rounded-lg bg-surface-3 hover:bg-surface-4 border border-border-base text-text-secondary hover:text-text-primary transition-all"
        title="Set seed for reproducibility"
      >
        <Dices className="w-3.5 h-3.5" />
      </button>
    )
  }

  return (
    <div className="no-drag flex items-center gap-1 h-8 px-2 rounded-lg bg-surface-3 border border-border-base">
      <Dices className={cn('w-3.5 h-3.5 shrink-0', isActive ? 'text-accent-main' : 'text-text-secondary')} />
      <input
        type="number"
        value={seed ?? ''}
        onChange={(e) => {
          const v = e.target.value
          onChange(v ? parseInt(v, 10) : undefined)
        }}
        placeholder="Seed"
        className="w-16 bg-transparent text-[11px] text-text-primary outline-none placeholder:text-text-muted [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        autoFocus
      />
      <button
        onClick={() => { onChange(undefined); setExpanded(false) }}
        className="p-0.5 rounded text-text-muted hover:text-text-secondary transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}
