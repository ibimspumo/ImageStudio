import { Send, XCircle, Settings, ListOrdered } from 'lucide-react'
import { ModelSelector } from '../input/ModelSelector'
import { ImageCountSelector } from '../input/ImageCountSelector'
import { TuneMenu, TuneGroup, TuneOption, TuneRow } from '../input/TunePanel'
import { MetaPromptSelector } from './MetaPromptSelector'
import { QueueButton } from '../queue/QueueButton'
import { useQueueStore } from '../../stores/queue-store'
import { useThumbnailMetaPromptsStore } from '../../stores/thumbnail-meta-prompts-store'
import { getCombinedCapabilities, getThumbnailModels, THUMBNAIL_STYLES, type ThumbnailStyle } from '../../types/api'
import { cn } from '../../lib/utils'

interface ThumbnailControlsProps {
  selectedModels: string[]
  onModelsChange: (models: string[]) => void
  style: ThumbnailStyle
  onStyleChange: (style: ThumbnailStyle) => void
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
  const activeMetaPromptId = useThumbnailMetaPromptsStore((s) => s.activeId)
  const queuePending = useQueueStore(
    (s) => s.items.filter((i) => i.status === 'pending' || i.status === 'active').length
  )

  // Format is fixed in this mode (16:9, 2K in, 1920×1080 out), and face
  // fidelity rides along automatically whenever references are attached — so
  // the panel holds only what actually varies: style and meta prompt.
  const tuneBadge = [style !== 'auto', !!activeMetaPromptId].filter(Boolean).length

  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-2 px-4 py-3">
      <ModelSelector
        selectedModels={selectedModels}
        onChange={onModelsChange}
        available={getThumbnailModels()}
      />

      <div className="w-px h-4 bg-border-dim/40 mx-0.5 shrink-0" />

      <ImageCountSelector
        value={imageCount}
        onChange={onImageCountChange}
        max={caps.maxImagesPerRequest}
      />

      <TuneMenu badge={tuneBadge} width={330}>
        {(close) => (
          <>
            <TuneGroup label="Stil">
              {THUMBNAIL_STYLES.map((option) => (
                <TuneOption
                  key={option.id}
                  selected={style === option.id}
                  onClick={() => onStyleChange(option.id)}
                  title={option.hint}
                >
                  {option.name}
                </TuneOption>
              ))}
            </TuneGroup>

            <TuneGroup label="Meta-Prompt">
              <MetaPromptSelector />
            </TuneGroup>

            {(onQueueClick || onSettingsClick) && (
              <TuneGroup label="Werkzeuge">
                <div className="flex flex-col w-full -mx-0.5">
                  {onQueueClick && (
                    <TuneRow
                      icon={<ListOrdered className="w-3.5 h-3.5" />}
                      onClick={() => { onQueueClick(); close() }}
                      trailing={queuePending > 0 ? <span className="text-[10px] tabular-nums text-accent-main">{queuePending}</span> : undefined}
                    >
                      Generation Queue
                    </TuneRow>
                  )}
                  {onSettingsClick && (
                    <TuneRow icon={<Settings className="w-3.5 h-3.5" />} onClick={() => { onSettingsClick(); close() }}>
                      Settings
                    </TuneRow>
                  )}
                </div>
              </TuneGroup>
            )}
          </>
        )}
      </TuneMenu>

      {onCollectionsClick && (
        <button
          onClick={onCollectionsClick}
          className="no-drag shrink-0 flex items-center justify-center h-8 w-8 rounded-lg bg-surface-3 hover:bg-surface-4 border border-border-base text-text-secondary hover:text-text-primary transition-all text-[14px] font-semibold"
          title="Collections (@)"
        >
          @
        </button>
      )}

      {onQueueClick && queuePending > 0 && <QueueButton onClick={onQueueClick} />}

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
