import { Send, XCircle, Settings, Brush, ListOrdered, Dices } from 'lucide-react'
import { ImageCountSelector } from './ImageCountSelector'
import { ModelSelector } from './ModelSelector'
import { PresetSelector } from './PresetSelector'
import { TuneMenu, TuneGroup, TuneOption, TuneRow, TuneRatioOptions } from './TunePanel'
import { QueueButton } from '../queue/QueueButton'
import { useQueueStore } from '../../stores/queue-store'
import { usePresetsStore } from '../../stores/presets-store'
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

const BACKGROUND_OPTIONS: { id: FalBackground; label: string; hint: string }[] = [
  { id: 'auto', label: 'Auto', hint: 'Das Modell entscheidet' },
  { id: 'transparent', label: 'Transparent', hint: 'PNG mit echtem Alphakanal' },
  { id: 'opaque', label: 'Deckend', hint: 'Immer ein gefüllter Hintergrund' },
]

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
  const activePresetId = usePresetsStore((s) => s.activePresetId)
  const queuePending = useQueueStore(
    (s) => s.items.filter((i) => i.status === 'pending' || i.status === 'active').length
  )

  // The badge counts everything in the panel that deviates from its default —
  // the bar stays readable without opening the panel.
  const tuneBadge = [
    aspectRatio !== '1:1',
    resolution !== '2K' && caps.resolutions.length > 0,
    !!caps.qualities && quality !== 'high',
    caps.supportsBackground && background !== 'auto',
    caps.supportsInputFidelity && !!hasReferences && inputFidelity !== 'high',
    caps.supportsSeed && seed != null,
    !!activePresetId,
  ].filter(Boolean).length

  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-2 px-4 py-3">
      <ModelSelector selectedModels={selectedModels} onChange={onModelsChange} />

      <div className="w-px h-4 bg-border-dim/40 mx-0.5 shrink-0" />

      <ImageCountSelector value={imageCount} onChange={onImageCountChange} max={caps.maxImagesPerRequest} />

      <TuneMenu badge={tuneBadge} width={360}>
        {(close) => (
          <>
            <TuneGroup label="Format">
              <TuneRatioOptions
                ratios={caps.aspectRatios}
                value={aspectRatio}
                onChange={(r) => onAspectRatioChange(r as AspectRatio)}
                customRatio={customRatio}
                onCustomRatioChange={onCustomRatioChange}
              />
            </TuneGroup>

            <TuneGroup label="Auflösung">
              {caps.resolutions.length === 0 ? (
                <TuneOption disabled title={caps.notes?.join('\n') || 'Dieses Modell hat eine feste Ausgabegröße'}>
                  1K · fixiert
                </TuneOption>
              ) : (
                caps.resolutions.map((res) => (
                  <TuneOption
                    key={res}
                    selected={resolution === res}
                    onClick={() => onResolutionChange(res as Resolution)}
                  >
                    {res}
                  </TuneOption>
                ))
              )}
              {caps.qualities && onQualityChange && (
                <>
                  <div className="w-px h-4 bg-border-dim mx-1 shrink-0" />
                  {caps.qualities.map((q) => (
                    <TuneOption
                      key={q}
                      selected={quality === q}
                      onClick={() => onQualityChange(q)}
                      title="Quality-Stufe — beeinflusst den Preis"
                    >
                      <span className="capitalize">{q}</span>
                    </TuneOption>
                  ))}
                </>
              )}
            </TuneGroup>

            {caps.supportsBackground && onBackgroundChange && (
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
            )}

            {caps.supportsInputFidelity && onInputFidelityChange && (
              <TuneGroup label="Referenz">
                <TuneOption
                  selected={inputFidelity === 'high'}
                  disabled={!hasReferences}
                  onClick={() => onInputFidelityChange('high')}
                  title={hasReferences ? 'Referenz wird detailgetreu übernommen' : 'Erst Referenzbilder anhängen'}
                >
                  Treu
                </TuneOption>
                <TuneOption
                  selected={inputFidelity === 'low'}
                  disabled={!hasReferences}
                  onClick={() => onInputFidelityChange('low')}
                  title={hasReferences ? 'Modell interpretiert die Referenz frei' : 'Erst Referenzbilder anhängen'}
                >
                  Frei
                </TuneOption>
              </TuneGroup>
            )}

            {(
              <TuneGroup label="Stil & Seed">
                <PresetSelector onManageClick={onPresetsManage} />
                {caps.supportsSeed && onSeedChange && (
                  <div className="flex items-center gap-1 h-7 px-2 rounded-lg bg-surface-4/60 border border-border-base">
                    <Dices className={cn('w-3.5 h-3.5 shrink-0', seed != null ? 'text-accent-main' : 'text-text-muted')} />
                    <input
                      type="number"
                      value={seed ?? ''}
                      onChange={(e) => onSeedChange(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                      placeholder="Seed"
                      className="w-16 bg-transparent text-[11px] text-text-primary outline-none placeholder:text-text-muted [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </div>
                )}
              </TuneGroup>
            )}

            {(onCanvasClick || onQueueClick || onSettingsClick) && (
              <TuneGroup label="Werkzeuge">
                <div className="flex flex-col w-full -mx-0.5">
                  {onCanvasClick && (
                    <TuneRow icon={<Brush className="w-3.5 h-3.5" />} onClick={() => { onCanvasClick(); close() }}>
                      Canvas — Skizze zeichnen
                    </TuneRow>
                  )}
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

      {/* The queue surfaces in the bar only while it actually holds work. */}
      {onQueueClick && queuePending > 0 && <QueueButton onClick={onQueueClick} />}

      <div className="flex items-center gap-1 ml-auto shrink-0">
        {hasContent && (
          <button
            onClick={onClear}
            className="no-drag shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-text-muted hover:text-text-secondary hover:bg-surface-3 transition-all"
            title="Clear prompt"
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
