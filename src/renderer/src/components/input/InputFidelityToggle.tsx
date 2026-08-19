import { Focus } from 'lucide-react'
import type { FalInputFidelity } from '../../types/api'
import { cn } from '../../lib/utils'

interface InputFidelityToggleProps {
  value: FalInputFidelity
  onChange: (value: FalInputFidelity) => void
  /** The field only exists on the edit endpoint, so it needs references. */
  hasReferences: boolean
}

/**
 * `input_fidelity` — GPT Image 1.5 edit only. `high` is the endpoint's own
 * default and keeps faces, logos and fine detail of the reference intact;
 * `low` gives the model room to reinterpret it.
 */
export function InputFidelityToggle({ value, onChange, hasReferences }: InputFidelityToggleProps) {
  return (
    <button
      onClick={() => onChange(value === 'high' ? 'low' : 'high')}
      disabled={!hasReferences}
      title={
        !hasReferences
          ? 'Erst Referenzbilder anhängen'
          : value === 'high'
            ? 'Referenz wird detailgetreu übernommen — klicken für frei'
            : 'Modell interpretiert die Referenz frei — klicken für treu'
      }
      className={cn(
        'no-drag shrink-0 flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-[11px] font-medium transition-all',
        !hasReferences
          ? 'border-border-dim text-text-muted/40 cursor-not-allowed'
          : value === 'high'
            ? 'border-accent-main/30 bg-accent-dim text-accent-main'
            : 'border-border-base bg-surface-3 text-text-secondary hover:text-text-primary'
      )}
    >
      <Focus className="w-3.5 h-3.5" />
      {value === 'high' ? 'Referenz treu' : 'Referenz frei'}
    </button>
  )
}
