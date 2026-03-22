import { useState } from 'react'
import { Palette, Check, ChevronDown, Settings2 } from 'lucide-react'
import { usePresetsStore } from '../../stores/presets-store'
import { cn } from '../../lib/utils'

interface PresetSelectorProps {
  onManageClick?: () => void
}

export function PresetSelector({ onManageClick }: PresetSelectorProps) {
  const [open, setOpen] = useState(false)
  const { presets, activePresetId, setActivePreset } = usePresetsStore()
  const activePreset = presets.find((p) => p.id === activePresetId)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'no-drag flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-[11px] font-medium transition-all',
          activePreset
            ? 'bg-accent-dim border-accent-main/30 text-accent-main'
            : 'bg-surface-3 border-border-base text-text-secondary hover:text-text-primary hover:bg-surface-4'
        )}
      >
        <Palette className="w-3.5 h-3.5" />
        <span className="max-w-[80px] truncate">{activePreset ? activePreset.name : 'Style'}</span>
        <ChevronDown className={cn('w-3 h-3 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 mb-2 w-[240px] bg-surface-3 border border-border-base rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] p-1.5 z-30 animate-scale-in max-h-[320px] overflow-y-auto">
            {/* None option */}
            <button
              onClick={() => { setActivePreset(null); setOpen(false) }}
              className={cn(
                'w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[11px] text-left transition-colors',
                !activePresetId
                  ? 'bg-surface-4 text-text-primary font-medium'
                  : 'text-text-secondary hover:bg-surface-4 hover:text-text-primary'
              )}
            >
              <span className="w-5 text-center text-[13px]">—</span>
              <span className="flex-1">No style</span>
              {!activePresetId && <Check className="w-3.5 h-3.5 text-accent-main" />}
            </button>

            <div className="h-px bg-border-dim my-1" />

            {presets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => { setActivePreset(preset.id); setOpen(false) }}
                className={cn(
                  'w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[11px] text-left transition-colors',
                  activePresetId === preset.id
                    ? 'bg-surface-4 text-text-primary font-medium'
                    : 'text-text-secondary hover:bg-surface-4 hover:text-text-primary'
                )}
              >
                <span className="w-5 text-center text-[13px]">{preset.icon || '✦'}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[11px]">{preset.name}</div>
                  <div className="text-[9px] text-text-muted truncate">{preset.suffix.slice(0, 50)}...</div>
                </div>
                {activePresetId === preset.id && <Check className="w-3.5 h-3.5 text-accent-main shrink-0" />}
              </button>
            ))}

            {onManageClick && (
              <>
                <div className="h-px bg-border-dim my-1" />
                <button
                  onClick={() => { onManageClick(); setOpen(false) }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[11px] text-text-muted hover:text-text-secondary hover:bg-surface-4 transition-colors"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                  Manage Presets...
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
