import { Send, XCircle, Settings, ListOrdered } from 'lucide-react'
import { ModelSelector } from '../input/ModelSelector'
import { ImageCountSelector } from '../input/ImageCountSelector'
import { TuneMenu, TuneGroup, TuneOption, TuneRow, RatioBox } from '../input/TunePanel'
import { QueueButton } from '../queue/QueueButton'
import { useQueueStore } from '../../stores/queue-store'
import {
  getCombinedCapabilities,
  getLogoModels,
  getModel,
  toFixedImageSize,
  LOGO_ASPECT_RATIOS,
  LOGO_DEFAULT_ASPECT_RATIO,
  LOGO_STYLES,
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

const BACKGROUND_OPTIONS: { id: FalBackground; label: string; hint: string }[] = [
  { id: 'auto', label: 'Auto', hint: 'Das Modell entscheidet' },
  { id: 'transparent', label: 'Transparent', hint: 'PNG mit echtem Alphakanal' },
  { id: 'opaque', label: 'Deckend', hint: 'Immer ein gefüllter Hintergrund' },
]

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
  const queuePending = useQueueStore(
    (s) => s.items.filter((i) => i.status === 'pending' || i.status === 'active').length
  )

  // The sizes come from the model itself, so the menu shows the pixels the
  // request will actually carry rather than a ratio it only approximates.
  const primary = getModel(selectedModels[0] ?? '')
  const sizeOptions = LOGO_ASPECT_RATIOS.map((ratio) => ({
    ratio,
    size: toFixedImageSize(primary, ratio),
  }))

  const tuneBadge = [
    style !== 'auto',
    aspectRatio !== LOGO_DEFAULT_ASPECT_RATIO,
    background !== 'transparent',
    !!caps.qualities && quality !== 'high',
    caps.supportsInputFidelity && hasReferences && inputFidelity !== 'high',
  ].filter(Boolean).length

  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-2 px-4 py-3">
      <ModelSelector
        selectedModels={selectedModels}
        onChange={onModelsChange}
        available={getLogoModels()}
      />

      <div className="w-px h-4 bg-border-dim/40 mx-0.5 shrink-0" />

      <ImageCountSelector
        value={imageCount}
        onChange={onImageCountChange}
        max={caps.maxImagesPerRequest}
      />

      <TuneMenu badge={tuneBadge} width={340}>
        {(close) => (
          <>
            <TuneGroup label="Logo-Typ">
              {LOGO_STYLES.map((option) => (
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

            <TuneGroup label="Größe">
              {sizeOptions.map((opt) => (
                <TuneOption
                  key={opt.ratio}
                  selected={aspectRatio === opt.ratio}
                  onClick={() => onAspectRatioChange(opt.ratio)}
                  title={`Ausgabe exakt ${opt.size} px`}
                >
                  <RatioBox ratio={opt.ratio} size={14} active={aspectRatio === opt.ratio} />
                  {opt.size}
                </TuneOption>
              ))}
            </TuneGroup>

            {/* Background — transparent is the default and the reason this mode exists. */}
            <TuneGroup label="Hintergrund">
              {BACKGROUND_OPTIONS.map((opt) => (
                <TuneOption
                  key={opt.id}
                  selected={background === opt.id}
                  onClick={() => onBackgroundChange(opt.id)}
                  title={opt.hint}
                >
                  {opt.label}
                </TuneOption>
              ))}
            </TuneGroup>

            {(caps.qualities || caps.supportsInputFidelity) && (
              <TuneGroup label="Qualität">
                {caps.qualities?.map((q) => (
                  <TuneOption
                    key={q}
                    selected={quality === q}
                    onClick={() => onQualityChange(q)}
                    title="Quality-Stufe — beeinflusst den Preis"
                  >
                    <span className="capitalize">{q}</span>
                  </TuneOption>
                ))}
                {caps.supportsInputFidelity && (
                  <>
                    <div className="w-px h-4 bg-border-dim mx-1 shrink-0" />
                    <TuneOption
                      selected={inputFidelity === 'high'}
                      disabled={!hasReferences}
                      onClick={() => onInputFidelityChange('high')}
                      title={hasReferences ? 'Referenz wird detailgetreu übernommen' : 'Erst Referenzbilder anhängen'}
                    >
                      Referenz treu
                    </TuneOption>
                    <TuneOption
                      selected={inputFidelity === 'low'}
                      disabled={!hasReferences}
                      onClick={() => onInputFidelityChange('low')}
                      title={hasReferences ? 'Modell interpretiert die Referenz frei' : 'Erst Referenzbilder anhängen'}
                    >
                      Referenz frei
                    </TuneOption>
                  </>
                )}
              </TuneGroup>
            )}

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
