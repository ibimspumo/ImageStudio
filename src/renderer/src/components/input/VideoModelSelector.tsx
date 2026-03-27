import { useState } from 'react'
import { Film } from 'lucide-react'
import { AVAILABLE_VIDEO_MODELS, getVideoModelName } from '../../types/api'
import { cn } from '../../lib/utils'

interface VideoModelSelectorProps {
  selectedModel: string
  onChange: (model: string) => void
}

export function VideoModelSelector({ selectedModel, onChange }: VideoModelSelectorProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="no-drag flex items-center gap-1.5 h-8 px-3 rounded-lg bg-surface-3 hover:bg-surface-4 border border-border-base text-text-secondary hover:text-text-primary transition-all text-[12px] font-medium"
      >
        <Film className="w-3.5 h-3.5" />
        <span className="max-w-[140px] truncate">{getVideoModelName(selectedModel)}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 mb-2 bg-surface-3 border border-border-base rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] p-2 z-30 animate-scale-in min-w-[240px]">
            <div className="px-2 pb-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Video Models</span>
            </div>

            {AVAILABLE_VIDEO_MODELS.map((model) => {
              const isSelected = selectedModel === model.id
              return (
                <button
                  key={model.id}
                  onClick={() => {
                    onChange(model.id)
                    setOpen(false)
                  }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all',
                    isSelected
                      ? 'bg-accent-dim text-accent-main'
                      : 'text-text-secondary hover:bg-surface-4 hover:text-text-primary'
                  )}
                >
                  <div className={cn(
                    'w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors',
                    isSelected
                      ? 'border-accent-main bg-accent-main'
                      : 'border-text-muted/40'
                  )}>
                    {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
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
