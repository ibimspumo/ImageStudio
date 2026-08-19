import { Send, XCircle, Settings, Palette } from 'lucide-react'
import { AspectRatioSelector } from './AspectRatioSelector'
import { ResolutionSelector } from './ResolutionSelector'
import { ImageCountSelector } from './ImageCountSelector'
import { QualitySelector } from './QualitySelector'
import { BackgroundSelector } from './BackgroundSelector'
import { InputFidelityToggle } from './InputFidelityToggle'
import { ModelSelector } from './ModelSelector'
import { SeedInput } from './SeedInput'
import { PresetSelector } from './PresetSelector'
import { QueueButton } from '../queue/QueueButton'
import { getCombinedCapabilities } from '../../types/api'
import type {
  AspectRatio,
  Resolution,
  GptImageQuality,
  FalBackground,
  FalInputFidelity,
} from '../../types/api'
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
  quality?: GptImageQuality
  onQualityChange?: (v: GptImageQuality) => void
  background?: FalBackground
  onBackgroundChange?: (v: FalBackground) => void
  inputFidelity?: FalInputFidelity
  onInputFidelityChange?: (v: FalInputFidelity) => void
  /** input_fidelity only exists on the edit endpoint. */
  hasReferences?: boolean
  canSend: boolean
  hasContent: boolean
  onSubmit: () => void
  onClear: () => void
  onSettingsClick?: () => void
  onCollectionsClick?: () => void
  seed?: number | undefined
  onSeedChange?: (seed: number | undefined) => void
  onPresetsManage?: () => void
  onQueueClick?: () => void
  onCanvasClick?: () => void
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
  quality,
  onQualityChange,
  background,
  onBackgroundChange,
  inputFidelity,
  onInputFidelityChange,
  hasReferences,
  canSend,
  hasContent,
  onSubmit,
  onClear,
  onSettingsClick,
  onCollectionsClick,
  seed,
  onSeedChange,
  onPresetsManage,
  onQueueClick,
  onCanvasClick,
}: ControlsRowProps) {
  // Every control below reflects what the selected model(s) actually accept.
  const caps = getCombinedCapabilities(selectedModels)

  return (
    <div className="flex items-center gap-1 px-4 py-3">
      <ModelSelector selectedModels={selectedModels} onChange={onModelsChange} />
      <div className="w-px h-4 bg-border-dim/40 mx-0.5" />
      <AspectRatioSelector
        value={aspectRatio}
        onChange={onAspectRatioChange}
        customRatio={customRatio}
        onCustomRatioChange={onCustomRatioChange}
        available={caps.aspectRatios}
      />
      <div className="w-px h-4 bg-border-dim/40 mx-0.5" />
      <ResolutionSelector
        value={resolution}
        onChange={onResolutionChange}
        available={caps.resolutions}
        notes={caps.notes}
      />
      <div className="w-px h-4 bg-border-dim/40 mx-0.5" />
      <ImageCountSelector value={imageCount} onChange={onImageCountChange} max={caps.maxImagesPerRequest} />

      {/* Quality only exists on GPT Image 2 */}
      {caps.qualities && onQualityChange && (
        <>
          <div className="w-px h-4 bg-border-dim/40 mx-0.5" />
          <QualitySelector
            value={quality ?? 'high'}
            onChange={onQualityChange}
            available={caps.qualities}
          />
        </>
      )}

      {/* Background: the transparency field, GPT Image 1.5 only */}
      {caps.supportsBackground && onBackgroundChange && (
        <>
          <div className="w-px h-4 bg-border-dim/40 mx-0.5" />
          <BackgroundSelector value={background ?? 'auto'} onChange={onBackgroundChange} />
        </>
      )}

      {/* input_fidelity: GPT Image 1.5 edit only */}
      {caps.supportsInputFidelity && onInputFidelityChange && (
        <>
          <div className="w-px h-4 bg-border-dim/40 mx-0.5" />
          <InputFidelityToggle
            value={inputFidelity ?? 'high'}
            onChange={onInputFidelityChange}
            hasReferences={!!hasReferences}
          />
        </>
      )}

      {/* Seed: GPT Image 2 has no seed parameter */}
      {onSeedChange && caps.supportsSeed && (
        <>
          <div className="w-px h-4 bg-border-dim/40 mx-0.5" />
          <SeedInput seed={seed} onChange={onSeedChange} />
        </>
      )}

      <div className="w-px h-4 bg-border-dim/40 mx-0.5" />

      <PresetSelector onManageClick={onPresetsManage} />

      {onCollectionsClick && (
        <button
          onClick={onCollectionsClick}
          className="no-drag flex items-center justify-center h-8 w-8 rounded-lg bg-surface-3 hover:bg-surface-4 border border-border-base text-text-secondary hover:text-text-primary transition-all text-[14px] font-semibold"
          title="Collections (@)"
        >
          @
        </button>
      )}
      {onCanvasClick && (
        <button
          onClick={onCanvasClick}
          className="no-drag flex items-center justify-center w-8 h-8 rounded-lg bg-surface-3 hover:bg-surface-4 border border-border-base text-text-secondary hover:text-text-primary transition-all"
          title="Canvas — sketch to generate"
        >
          <Palette className="w-3.5 h-3.5" />
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

      {onQueueClick && <QueueButton onClick={onQueueClick} />}

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
