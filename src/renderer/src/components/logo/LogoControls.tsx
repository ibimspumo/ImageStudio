import { Send, XCircle, Settings } from 'lucide-react'
import { ModelSelector } from '../input/ModelSelector'
import { ImageCountSelector } from '../input/ImageCountSelector'
import { QualitySelector } from '../input/QualitySelector'
import { BackgroundSelector } from '../input/BackgroundSelector'
import { InputFidelityToggle } from '../input/InputFidelityToggle'
import { QueueButton } from '../queue/QueueButton'
import { LogoStyleSelector } from './LogoStyleSelector'
import { LogoSizeSelector, type LogoSizeOption } from './LogoSizeSelector'
import {
  getCombinedCapabilities,
  getLogoModels,
  getModel,
  toFixedImageSize,
  LOGO_ASPECT_RATIOS,
  type FalBackground,
  type FalInputFidelity,
  type GptImageQuality,
  type LogoStyle,
} from '../../types/api'
import { cn } from '../../lib/utils'

interface LogoControlsProps {
  selectedModels: string[]
  onModelsChange: (models: string[]) => void
  style: LogoStyle
  onStyleChange: (style: LogoStyle) => void
  aspectRatio: string
  onAspectRatioChange: (ratio: string) => void
  background: FalBackground
  onBackgroundChange: (background: FalBackground) => void
  inputFidelity: FalInputFidelity
  onInputFidelityChange: (value: FalInputFidelity) => void
  /** input_fidelity only exists on the edit endpoint. */
  hasReferences: boolean
  quality: GptImageQuality
  onQualityChange: (quality: GptImageQuality) => void
  imageCount: number
  onImageCountChange: (value: number) => void
  canSend: boolean
  hasContent: boolean
  onSubmit: () => void
  onClear: () => void
  onSettingsClick?: () => void
  onCollectionsClick?: () => void
  onQueueClick?: () => void
}

export function LogoControls({
  selectedModels,
  onModelsChange,
  style,
  onStyleChange,
  aspectRatio,
  onAspectRatioChange,
  background,
  onBackgroundChange,
  inputFidelity,
  onInputFidelityChange,
  hasReferences,
  quality,
  onQualityChange,
  imageCount,
  onImageCountChange,
  canSend,
  hasContent,
  onSubmit,
  onClear,
  onSettingsClick,
  onCollectionsClick,
  onQueueClick,
}: LogoControlsProps) {
  const caps = getCombinedCapabilities(selectedModels)

  // The sizes come from the model itself, so the menu shows the pixels the
  // request will actually carry rather than a ratio it only approximates.
  const primary = getModel(selectedModels[0] ?? '')
  const sizeOptions: LogoSizeOption[] = LOGO_ASPECT_RATIOS.map((ratio) => ({
    ratio,
    size: toFixedImageSize(primary, ratio),
  }))

  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-2 px-4 py-3">
      <ModelSelector
        selectedModels={selectedModels}
        onChange={onModelsChange}
        available={getLogoModels()}
      />

      <div className="w-px h-4 bg-border-dim/40 mx-0.5 shrink-0" />

      <LogoStyleSelector value={style} onChange={onStyleChange} />

      <div className="w-px h-4 bg-border-dim/40 mx-0.5 shrink-0" />

      <LogoSizeSelector value={aspectRatio} onChange={onAspectRatioChange} options={sizeOptions} />

      <div className="w-px h-4 bg-border-dim/40 mx-0.5 shrink-0" />

      {/* Background — transparent is the default and the reason this mode exists. */}
      <BackgroundSelector value={background} onChange={onBackgroundChange} />

      {caps.supportsInputFidelity && (
        <>
          <div className="w-px h-4 bg-border-dim/40 mx-0.5 shrink-0" />
          <InputFidelityToggle
            value={inputFidelity}
            onChange={onInputFidelityChange}
            hasReferences={hasReferences}
          />
        </>
      )}

      {caps.qualities && (
        <>
          <div className="w-px h-4 bg-border-dim/40 mx-0.5 shrink-0" />
          <QualitySelector value={quality} onChange={onQualityChange} available={caps.qualities} />
        </>
      )}

      <div className="w-px h-4 bg-border-dim/40 mx-0.5 shrink-0" />

      <ImageCountSelector
        value={imageCount}
        onChange={onImageCountChange}
        max={caps.maxImagesPerRequest}
      />

      {onCollectionsClick && (
        <button
          onClick={onCollectionsClick}
          className="no-drag shrink-0 flex items-center justify-center h-8 w-8 rounded-lg bg-surface-3 hover:bg-surface-4 border border-border-base text-text-secondary hover:text-text-primary transition-all text-[14px] font-semibold"
          title="Collections (@)"
        >
          @
        </button>
      )}
      {onSettingsClick && (
        <button
          onClick={onSettingsClick}
          className="no-drag shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-surface-3 hover:bg-surface-4 border border-border-base text-text-secondary hover:text-text-primary transition-all"
          title="Settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      )}
      {onQueueClick && <QueueButton onClick={onQueueClick} />}

      <div className="flex items-center gap-1 ml-auto shrink-0">
        {hasContent && (
          <button
            onClick={onClear}
            className="no-drag shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-text-muted hover:text-text-secondary hover:bg-surface-3 transition-all"
            title="Prompt leeren"
          >
            <XCircle className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          onClick={onSubmit}
          disabled={!canSend}
          className={cn(
            'no-drag btn-interactive shrink-0 flex items-center justify-center h-9 rounded-xl transition-all',
            canSend
              ? 'bg-accent-main hover:bg-accent-bright text-white px-4 gap-2 glow-accent shadow-lg'
              : 'bg-surface-3 text-text-muted cursor-not-allowed w-9'
          )}
        >
          <Send className="w-4 h-4" />
          {canSend && <span className="text-[12px] font-semibold tracking-wide">Generate</span>}
        </button>
      </div>
    </div>
  )
}
