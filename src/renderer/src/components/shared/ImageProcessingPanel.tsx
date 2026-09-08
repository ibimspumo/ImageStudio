import { useEffect, useMemo, useState } from 'react'
import { ArrowUpCircle, Scissors, Loader2 } from 'lucide-react'
import type { GalleryImage } from '../../stores/gallery-store'
import type { GenerateOptions } from '../../hooks/useImageGeneration'
import { inspectProcessingSource, prepareImageProcessing } from '../../lib/image-processing'
import { IMAGE_PROCESSING_MODELS, normalizeImageProcessing, type ImageProcessingOptions, type ImageProcessingOperation } from '../../../../shared/image-processing'

interface Props {
  image: GalleryImage
  generate: (options: GenerateOptions) => string[]
  onStarted: () => void
  disabled?: boolean
}

interface OptionDefinition {
  type: string
  enum?: readonly (string | number)[]
  minimum?: number
  maximum?: number
  default?: string | number | boolean
  onlyFor?: readonly string[]
  unavailableFor?: readonly string[]
}
const optionLabels: Record<string, string> = {
  outputFormat: 'Ausgabeformat', cropToFill: 'Auf Zielformat zuschneiden',
  scale: 'Vergrößerung', precisionModel: 'Bildtyp', subjectDetection: 'Motiverkennung',
  faceEnhancement: 'Gesichter verbessern', faceEnhancementCreativity: 'Gesichts-Kreativität',
  faceEnhancementStrength: 'Gesichts-Stärke', sharpen: 'Schärfen', denoise: 'Entrauschen',
  fixCompression: 'Kompression korrigieren', strength: 'Text-Stärke',
}
const valueLabels: Record<string, string> = { png: 'PNG', jpeg: 'JPEG', All: 'Gesamtes Bild', Foreground: 'Vordergrund', Background: 'Hintergrund' }

const controlClass = 'min-w-0 w-full rounded-lg bg-surface-3 border border-border-dim px-2.5 py-2 text-[12px] text-text-primary disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-main'
const actionClass = 'flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-colors bg-accent-main text-surface-0 hover:bg-accent-bright disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-main'

/** Provider processing shares its registry, validation and price calculation with MCP. */
export function ImageProcessingPanel({ image, generate, onStarted, disabled }: Props) {
  const [source, setSource] = useState<{ width: number; height: number; hasAlpha: boolean } | null>(null)
  const [options, setOptions] = useState<ImageProcessingOptions>({})
  const [error, setError] = useState('')
  const [sourceError, setSourceError] = useState('')
  const [inspectionAttempt, setInspectionAttempt] = useState(0)
  const [preparing, setPreparing] = useState<ImageProcessingOperation | null>(null)
  useEffect(() => {
    let active = true
    setSourceError('')
    setSource(null)
    inspectProcessingSource(image).then((value) => { if (active) setSource(value) }).catch((cause) => {
      if (active) setSourceError(cause instanceof Error ? cause.message : 'Bild konnte nicht gelesen werden.')
    })
    return () => { active = false }
  }, [image.id, image.filePath, inspectionAttempt])

  const previews = useMemo(() => {
    if (!source) return null
    const preview = (operation: ImageProcessingOperation) => {
      try {
        return { result: normalizeImageProcessing({ operation, sourceWidth: source.width, sourceHeight: source.height, sourceHasAlpha: source.hasAlpha, options: operation === 'upscale' ? options : {} }), error: '' }
      } catch (cause) {
        return { result: null, error: cause instanceof Error ? cause.message : 'Diese Einstellungen sind nicht möglich.' }
      }
    }
    return { upscale: preview('upscale'), remove_background: preview('remove_background') }
  }, [source, options])

  const selectedModel = options.model ?? (source?.hasAlpha ? 'transparent' : 'precision')
  const registryEntry = IMAGE_PROCESSING_MODELS.find((entry) => entry.key === selectedModel)!
  const definitions = registryEntry.options as Record<string, OptionDefinition>
  const precisionModel = options.precisionModel ?? String(definitions.precisionModel?.default ?? '')
  const updateOption = (key: string, value: unknown) => {
    setOptions((previous) => {
      const next = { ...previous, [key]: value }
      if (value === undefined) delete next[key as keyof ImageProcessingOptions]
      if (key === 'precisionModel') {
        if (value === 'CGI') delete next.fixCompression
        if (value !== 'Text Refine') delete next.strength
      }
      return next
    })
  }
  const renderOption = ([key, definition]: [string, OptionDefinition]) => {
    if (definition.onlyFor && !definition.onlyFor.includes(precisionModel)) return null
    if (definition.unavailableFor?.includes(precisionModel)) return null
    const value = options[key as keyof ImageProcessingOptions] ?? definition.default
    const label = optionLabels[key] ?? key
    const inactive = disabled || !!preparing || (key.startsWith('faceEnhancement') && key !== 'faceEnhancement' && options.faceEnhancement === false)
    if (definition.type === 'boolean') return <label key={key} className="flex items-center justify-between gap-3 text-[12px] text-text-secondary">
      {label}<input type="checkbox" checked={Boolean(value)} disabled={inactive} onChange={(event) => updateOption(key, event.target.checked)} className="h-4 w-4 accent-accent-main" />
    </label>
    return <label key={key} className="flex flex-col gap-1.5 text-[12px] text-text-secondary">
      <span>{label}{definition.minimum !== undefined && <span className="ml-1 text-text-secondary">({definition.minimum}–{definition.maximum}{key === 'scale' ? '×' : ''})</span>}</span>
      {definition.enum ? <select aria-label={label} className={controlClass} value={String(value ?? '')} disabled={inactive || definition.enum.length === 1} onChange={(event) => updateOption(key, definition.type === 'number' ? Number(event.target.value) : event.target.value)}>
        {definition.enum.map((entry) => <option key={entry} value={entry}>{valueLabels[entry] ?? entry}{key === 'scale' ? '×' : ''}</option>)}
      </select> : <input aria-label={label} className={controlClass} type="number" value={value === undefined ? '' : Number(value)} min={definition.minimum} max={definition.maximum} step="any" placeholder="Automatisch" disabled={inactive} onChange={(event) => updateOption(key, event.target.value === '' ? undefined : Number(event.target.value))} />}
    </label>
  }

  const start = async (operation: ImageProcessingOperation) => {
    if (disabled || preparing || !previews?.[operation].result) return
    setPreparing(operation)
    setError('')
    try {
      const prepared = await prepareImageProcessing(image, { operation, ...(operation === 'upscale' ? options : {}) })
      const ids = generate(prepared)
      if (!ids.length) throw new Error('Die Bearbeitung konnte nicht starten. Prüfe deinen fal.ai-Schlüssel.')
      onStarted()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bildbearbeitung konnte nicht gestartet werden.')
    } finally { setPreparing(null) }
  }

  const estimate = (operation: ImageProcessingOperation) => {
    const preview = previews?.[operation]
    if (sourceError) return null
    if (!source) return <p className="text-[12px] text-text-secondary" role="status">Bildgröße und Transparenz werden geprüft…</p>
    if (preview?.error) return <p className="text-[12px] text-danger" role="alert">{preview.error}</p>
    if (!preview?.result) return null
    const { width, height, estimatedCost, outputFormat } = preview.result
    return <p className="text-[12px] text-text-secondary tabular-nums">{operation === 'remove_background' ? 'Ausgangsgröße: ' : ''}{width.toLocaleString('de-DE')} × {height.toLocaleString('de-DE')} px · {outputFormat.toUpperCase()}<br /><span>Listenpreis-Schätzung: ${estimatedCost.toFixed(3)} USD</span></p>
  }

  return <section className="border-t border-border-dim pt-4 flex flex-col gap-5" aria-label="Bild optimieren">
    <div className="flex flex-col gap-3">
      <h3 className="text-[13px] font-semibold text-text-primary">Auflösung erhöhen</h3>
      <p className="text-[12px] leading-relaxed text-text-secondary">Topaz vergrößert dein Bild mit einem spezialisierten Upscale-Modell.</p>
      {source && <p className="text-[12px] text-text-secondary tabular-nums">Original: {source.width.toLocaleString('de-DE')} × {source.height.toLocaleString('de-DE')} px{source.hasAlpha ? ' · transparent' : ''}</p>}
      {source?.hasAlpha && <p className="text-[12px] leading-relaxed text-text-secondary">Topaz Transparent vergrößert auf 4× und erhält den transparenten Hintergrund als PNG.</p>}
      {source && <>
        <label className="flex flex-col gap-1.5 text-[12px] text-text-secondary">Upscale-Modell
          <select aria-label="Upscale-Modell" className={controlClass} value={selectedModel} disabled={disabled || !!preparing || source.hasAlpha} onChange={(event) => setOptions({ model: event.target.value as ImageProcessingOptions['model'] })}>
            {IMAGE_PROCESSING_MODELS.filter((entry) => entry.operation === 'upscale').map((entry) => <option key={entry.id} value={entry.key}>{entry.name}</option>)}
          </select>
        </label>
        {selectedModel === 'precision' && Object.entries(definitions).filter(([key]) => key === 'scale' || key === 'precisionModel' || key === 'outputFormat').map(renderOption)}
        {selectedModel === 'precision' && <details>
          <summary className="cursor-pointer text-[12px] text-text-secondary">Feineinstellungen</summary>
          <div className="mt-3 flex flex-col gap-3">{Object.entries(definitions).filter(([key]) => key !== 'scale' && key !== 'precisionModel' && key !== 'outputFormat').map(renderOption)}</div>
          <p className="mt-2 text-[12px] leading-relaxed text-text-secondary">Leere Werte werden automatisch vom Modell bestimmt.</p>
        </details>}
        {selectedModel === 'transparent' && !source.hasAlpha && <p className="text-[12px] text-text-secondary">Feste Vergrößerung auf 4×. Vorhandene Transparenz bleibt erhalten.</p>}
      </>}
      <p className="text-[12px] leading-relaxed text-text-secondary">Erneutes Upscaling möglich. Pro Durchlauf: Precision 1–4×, Transparent 4×. Keine zusätzliche 4K-Grenze.</p>
      {estimate('upscale')}
      <button type="button" onClick={() => start('upscale')} disabled={disabled || !!preparing || !previews?.upscale.result} className={actionClass}>
        {preparing === 'upscale' ? <Loader2 className="w-4 h-4 motion-safe:animate-spin" /> : <ArrowUpCircle className="w-4 h-4" />}
        {preparing === 'upscale' ? 'Wird vorbereitet…' : 'Kostenpflichtig hochskalieren'}
      </button>
    </div>
    <div className="border-t border-border-dim pt-4 flex flex-col gap-3">
      <h3 className="text-[13px] font-semibold text-text-primary">Hintergrund entfernen</h3>
      <p className="text-[12px] leading-relaxed text-text-secondary">BRIA RMBG 2.0 stellt dein Motiv frei und speichert es als PNG mit transparentem Hintergrund.</p>
      {estimate('remove_background')}
      <p className="text-[12px] text-text-secondary">Die Ergebnisgröße bestimmt der Anbieter.</p>
      <button type="button" onClick={() => start('remove_background')} disabled={disabled || !!preparing || !previews?.remove_background.result} className={actionClass}>
        {preparing === 'remove_background' ? <Loader2 className="w-4 h-4 motion-safe:animate-spin" /> : <Scissors className="w-4 h-4" />}
        {preparing === 'remove_background' ? 'Wird vorbereitet…' : 'Kostenpflichtig freistellen'}
      </button>
    </div>
    {sourceError && <div className="flex flex-col gap-2"><p role="alert" className="text-[12px] text-danger">{sourceError}</p><button type="button" onClick={() => setInspectionAttempt((attempt) => attempt + 1)} className="text-[12px] text-accent-main text-left hover:underline">Bild erneut prüfen</button></div>}
    {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
    {disabled && <p className="text-[12px] text-text-secondary">Zum Starten muss ein fal.ai-Schlüssel eingerichtet und die laufende Vorbereitung abgeschlossen sein.</p>}
    <p className="text-[12px] leading-relaxed text-text-secondary">Das Original bleibt erhalten. Fortschritt und Ergebnis erscheinen in der Galerie. Die endgültigen Kosten können von der Schätzung abweichen.</p>
  </section>
}
