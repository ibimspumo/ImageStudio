import { useState } from 'react'
import { Cpu, Check, Layers } from 'lucide-react'
import { AVAILABLE_MODELS, getModelName } from '../../types/api'
import { cn } from '../../lib/utils'

interface ModelSelectorProps {
  selectedModels: string[]
  onChange: (models: string[]) => void
  compact?: boolean
}

export function ModelSelector({ selectedModels, onChange, compact }: ModelSelectorProps) {
  const [open, setOpen] = useState(false)

  const toggleModel = (modelId: string) => {
    if (selectedModels.includes(modelId)) {
      // Don't allow deselecting the last model
      if (selectedModels.length <= 1) return
      onChange(selectedModels.filter((m) => m !== modelId))
    } else {
      onChange([...selectedModels, modelId])
    }
  }

  const primaryModel = selectedModels[0]
  const multiCount = selectedModels.length

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'no-drag flex items-center gap-1.5 h-8 px-3 rounded-lg bg-surface-3 hover:bg-surface-4 border border-border-base text-text-secondary hover:text-text-primary transition-all text-[12px] font-medium',
          multiCount > 1 && 'border-accent-main/30 text-accent-main'
        )}
      >
        {multiCount > 1 ? (
          <>
            <Layers className="w-3.5 h-3.5" />
            <span>{multiCount} Models</span>
          </>
        ) : (
          <>
            <Cpu className="w-3.5 h-3.5" />
            {!compact && <span className="max-w-[100px] truncate">{getModelName(primaryModel)}</span>}
            {compact && <span className="max-w-[80px] truncate">{getModelName(primaryModel)}</span>}
          </>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 mb-2 bg-surface-3 border border-border-base rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] p-2 z-30 animate-scale-in min-w-[240px]">
            <div className="flex items-center justify-between px-2 pb-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Models</span>
              <span className="text-[10px] text-text-muted">select multiple to compare</span>
            </div>

            {AVAILABLE_MODELS.map((model) => {
              const isSelected = selectedModels.includes(model.id)
              return (
                <button
                  key={model.id}
                  onClick={() => toggleModel(model.id)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all',
                    isSelected
                      ? 'bg-accent-dim text-accent-main'
                      : 'text-text-secondary hover:bg-surface-4 hover:text-text-primary'
                  )}
                >
                  <div className={cn(
                    'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                    isSelected
                      ? 'border-accent-main bg-accent-main/20'
                      : 'border-text-muted/40'
                  )}>
                    {isSelected && <Check className="w-2.5 h-2.5" />}
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[12px] font-medium truncate">{model.name}</span>
                    <span className="text-[10px] text-text-muted">{model.provider}</span>
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
