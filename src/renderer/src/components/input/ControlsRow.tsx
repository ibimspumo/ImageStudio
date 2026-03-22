import { Send, XCircle, Settings, MinusCircle } from 'lucide-react'
import { AspectRatioSelector } from './AspectRatioSelector'
import { ResolutionSelector } from './ResolutionSelector'
import { ImageCountSelector } from './ImageCountSelector'
import { ModelSelector } from './ModelSelector'
import { SeedInput } from './SeedInput'
import { PresetSelector } from './PresetSelector'
import { QueueButton } from '../queue/QueueButton'
import type { AspectRatio, Resolution } from '../../types/api'
import { cn } from '../../lib/utils'

interface ControlsRowProps {
  selectedModels: string[]
  onModelsChange: (models: string[]) => void
  aspectRatio: AspectRatio
  onAspectRatioChange: (v: AspectRatio) => void
  customRatio: string
  onCustomRatioChange: (v: string) => void
  resolution: Resolution
  onResolutionChange: (v: Resolution) => void
  imageCount: number
  onImageCountChange: (v: number) => void
  canSend: boolean
  hasContent: boolean
  onSubmit: () => void
  onClear: () => void
  onSettingsClick?: () => void
  onCollectionsClick?: () => void
  negativePromptActive?: boolean
  onNegativePromptToggle?: () => void
  seed?: number | undefined
  onSeedChange?: (seed: number | undefined) => void
  activePresetId?: string | null
  onPresetChange?: (presetId: string | null) => void
  onPresetsManage?: () => void
  onQueueClick?: () => void
  queuePendingCount?: number
}

export function ControlsRow({
  selectedModels,
  onModelsChange,
  aspectRatio,
  onAspectRatioChange,
  customRatio,
  onCustomRatioChange,
  resolution,
  onResolutionChange,
  imageCount,
  onImageCountChange,
  canSend,
  hasContent,
  onSubmit,
  onClear,
  onSettingsClick,
  onCollectionsClick,
  negativePromptActive,
  onNegativePromptToggle,
  seed,
  onSeedChange,
  activePresetId = null,
  onPresetChange,
  onPresetsManage,
  onQueueClick,
  queuePendingCount = 0,
}: ControlsRowProps) {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      <ModelSelector selectedModels={selectedModels} onChange={onModelsChange} />
      <div className="w-px h-4 bg-border-dim/40 mx-0.5" />
      <AspectRatioSelector value={aspectRatio} onChange={onAspectRatioChange} customRatio={customRatio} onCustomRatioChange={onCustomRatioChange} />
      <div className="w-px h-4 bg-border-dim/40 mx-0.5" />
      <ResolutionSelector value={resolution} onChange={onResolutionChange} />
      <div className="w-px h-4 bg-border-dim/40 mx-0.5" />
      <ImageCountSelector value={imageCount} onChange={onImageCountChange} />
      <div className="w-px h-4 bg-border-dim/40 mx-0.5" />

      {onSeedChange && (
        <SeedInput value={seed} onChange={onSeedChange} />
      )}
      <div className="w-px h-4 bg-border-dim/40 mx-0.5" />

      {onNegativePromptToggle && (
        <button
          onClick={onNegativePromptToggle}
          className={cn(
            'no-drag flex items-center justify-center w-8 h-8 rounded-lg border transition-all',
            negativePromptActive
              ? 'bg-accent-main/20 border-accent-main/30 text-accent-bright'
              : 'bg-surface-3 hover:bg-surface-4 border-border-base text-text-secondary hover:text-text-primary'
          )}
          title="Negative prompt"
        >
          <MinusCircle className="w-3.5 h-3.5" />
        </button>
      )}
      <div className="w-px h-4 bg-border-dim/40 mx-0.5" />

      {onPresetChange && (
        <PresetSelector activePresetId={activePresetId} onPresetChange={onPresetChange} onManage={onPresetsManage} />
      )}

      {onCollectionsClick && (
        <button
          onClick={onCollectionsClick}
          className="no-drag flex items-center justify-center h-8 w-8 rounded-lg bg-surface-3 hover:bg-surface-4 border border-border-base text-text-secondary hover:text-text-primary transition-all text-[14px] font-semibold"
          title="Collections (@)"
        >
          @
        </button>
      )}
      {onSettingsClick && (
        <button
          onClick={onSettingsClick}
          className="no-drag flex items-center justify-center w-8 h-8 rounded-lg bg-surface-3 hover:bg-surface-4 border border-border-base text-text-secondary hover:text-text-primary transition-all"
          title="Settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      )}

      {onQueueClick && <QueueButton pendingCount={queuePendingCount ?? 0} onClick={onQueueClick} />}

      <div className="flex-1" />

      {hasContent && (
        <button
          onClick={onClear}
          className="no-drag flex items-center justify-center w-8 h-8 rounded-lg text-text-muted hover:text-text-secondary hover:bg-surface-3 transition-all"
          title="Clear prompt"
        >
          <XCircle className="w-3.5 h-3.5" />
        </button>
      )}

      <button
        onClick={onSubmit}
        disabled={!canSend}
        className={cn(
          'no-drag btn-interactive flex items-center justify-center h-9 rounded-xl transition-all',
          canSend
            ? 'bg-accent-main hover:bg-accent-bright text-white px-4 gap-2 glow-accent shadow-lg'
            : 'bg-surface-3 text-text-muted cursor-not-allowed w-9'
        )}
      >
        <Send className="w-4 h-4" />
        {canSend && <span className="text-[12px] font-semibold tracking-wide">Generate</span>}
      </button>
    </div>
  )
}
