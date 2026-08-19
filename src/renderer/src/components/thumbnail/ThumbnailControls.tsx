import { Send, XCircle, Settings, ScanFace } from 'lucide-react'
import { ModelSelector } from '../input/ModelSelector'
import { ImageCountSelector } from '../input/ImageCountSelector'
import { QueueButton } from '../queue/QueueButton'
import { StyleSelector } from './StyleSelector'
import { getCombinedCapabilities, getThumbnailModels, type ThumbnailStyle } from '../../types/api'
import { cn } from '../../lib/utils'

interface ThumbnailControlsProps {
  selectedModels: string[]
  onModelsChange: (models: string[]) => void
  style: ThumbnailStyle
  onStyleChange: (style: ThumbnailStyle) => void
  faceFidelity: boolean
  onFaceFidelityChange: (value: boolean) => void
  hasReferences: boolean
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

export function ThumbnailControls({
  selectedModels,
  onModelsChange,
  style,
  onStyleChange,
  faceFidelity,
  onFaceFidelityChange,
  hasReferences,
  imageCount,
  onImageCountChange,
  canSend,
  hasContent,
  onSubmit,
  onClear,
  onSettingsClick,
  onCollectionsClick,
  onQueueClick,
}: ThumbnailControlsProps) {
  const caps = getCombinedCapabilities(selectedModels)

  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-2 px-4 py-3">
        {/* Format is fixed in this mode, so it is not a control — 16:9, 2K in,
            1920 x 1080 out. Nothing here can change it, so nothing shows it. */}
        <ModelSelector
          selectedModels={selectedModels}
          onChange={onModelsChange}
          available={getThumbnailModels()}
        />

        <div className="w-px h-4 bg-border-dim/40 mx-0.5 shrink-0" />

        <StyleSelector value={style} onChange={onStyleChange} />

        <div className="w-px h-4 bg-border-dim/40 mx-0.5 shrink-0" />

        {/* Face fidelity — pointless without references */}
        <button
          onClick={() => onFaceFidelityChange(!faceFidelity)}
          disabled={!hasReferences}
          title={
            hasReferences
              ? 'Gesichter aus den Referenzen exakt erhalten'
              : 'Erst Referenzbilder anhängen'
          }
          className={cn(
            'no-drag shrink-0 flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-[11px] font-medium transition-all',
            !hasReferences
              ? 'border-border-dim text-text-muted/40 cursor-not-allowed'
              : faceFidelity
                ? 'border-accent-main/30 bg-accent-dim text-accent-main'
                : 'border-border-base bg-surface-3 text-text-secondary hover:text-text-primary'
          )}
        >
          <ScanFace className="w-3.5 h-3.5" />
          Gesichter treu
        </button>

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
