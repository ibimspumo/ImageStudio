import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Lock, Unlock } from 'lucide-react'
import { GPT_IMAGE_SIZE_CONSTRAINTS, normalizeGptImageSize, toGptImageSize } from '../../../../shared/image-models'
import { TuneGroup, TuneOption } from './TunePanel'

export interface PixelSizeProps {
  imageSize?: { width: number; height: number }
  onImageSizeChange?: (size: { width: number; height: number } | undefined) => void
  onSizeErrorChange?: (error: string | undefined) => void
}

/** Pixel drafts remain local until committed; invalid drafts block the shared composer. */
export function PixelSizeControls({ imageSize, onImageSizeChange, onSizeErrorChange, ratio, resolution, children }: PixelSizeProps & {
  ratio: string
  resolution: string
  children: ReactNode
}) {
  const ratioId = useId()
  const reportErrorRef = useRef(onSizeErrorChange)
  reportErrorRef.current = onSizeErrorChange
  useEffect(() => () => reportErrorRef.current?.(undefined), [])
  const [width, setWidth] = useState(String(imageSize?.width ?? 1024))
  const [height, setHeight] = useState(String(imageSize?.height ?? 1024))
  const [locked, setLocked] = useState(true)
  const [ratioChoice, setRatioChoice] = useState(imageSize ? imageSize.width * 297 === imageSize.height * 210 ? '210:297' : `${imageSize.width}:${imageSize.height}` : ratio === 'auto' ? '1:1' : ratio)
  const [customRatio, setCustomRatio] = useState('4:3')
  const [error, setError] = useState<string>()
  const [rounded, setRounded] = useState(false)
  useEffect(() => {
    if (imageSize) { setWidth(String(imageSize.width)); setHeight(String(imageSize.height)) }
  }, [imageSize?.width, imageSize?.height])
  const report = (message?: string) => { setError(message); onSizeErrorChange?.(message) }
  const targetRatio = (choice = ratioChoice, custom = customRatio) => {
    const parts = (choice === 'custom' ? custom : choice).split(':').map(Number)
    return parts.length === 2 && parts.every((n) => Number.isFinite(n) && n > 0) ? parts[0] / parts[1] : NaN
  }
  const apply = (w: string, h: string, commit: boolean) => {
    try {
      const size = normalizeGptImageSize({ width: Number(w), height: Number(h) })
      report(commit ? undefined : 'Pixelgröße mit Enter oder durch Verlassen des Feldes übernehmen.')
      if (commit) {
        setRounded(size.width !== Number(w) || size.height !== Number(h))
        setWidth(String(size.width)); setHeight(String(size.height)); onImageSizeChange?.(size)
      }
    } catch (err) { report(err instanceof Error ? err.message : 'Ungültige Bildgröße.') }
  }
  const edit = (axis: 'width' | 'height', value: string, commit = false) => {
    let w = axis === 'width' ? value : width
    let h = axis === 'height' ? value : height
    if (locked && Number(value) > 0 && Number.isFinite(targetRatio())) {
      // Normalize the driving edge first, then derive the companion edge.
      const driving = Math.ceil(Number(value) / 16) * 16
      if (axis === 'width') h = String(Math.ceil(driving / targetRatio() / 16) * 16)
      else w = String(Math.ceil(driving * targetRatio() / 16) * 16)
    }
    setWidth(w); setHeight(h); apply(w, h, commit)
  }
  const selectRatio = (value: string) => {
    setRatioChoice(value); setLocked(true)
    if (value === '210:297') {
      setWidth('2240'); setHeight('3168'); report(); setRounded(false)
      onImageSizeChange?.({ width: 2240, height: 3168 })
    } else {
      const r = targetRatio(value)
      if (Number.isFinite(r)) {
        const h = String(Math.ceil(Number(width) / r / 16) * 16)
        setHeight(h); apply(width, h, true)
      } else report('Bitte ein gültiges Verhältnis wie 4:3 eingeben.')
    }
  }
  const c = GPT_IMAGE_SIZE_CONSTRAINTS
  const inputClass = 'w-full min-w-0 h-9 rounded-lg bg-surface-4 border border-border-base px-2 text-[13px] text-text-primary tabular-nums outline-none focus:border-accent-main'
  return <>
    <TuneGroup label="Bildgröße">
      <TuneOption selected={!imageSize} onClick={() => { report(); onImageSizeChange?.(undefined) }}>Format & Auflösung</TuneOption>
      <TuneOption selected={!!imageSize} onClick={() => {
        const derived = toGptImageSize(ratio, resolution)
        const size = derived === 'auto' ? { width: 1024, height: 1024 } : derived
        report(); setRounded(false); onImageSizeChange?.(size)
      }}>Exakte Pixel</TuneOption>
    </TuneGroup>
    {!imageSize ? children : <TuneGroup label="Pixelmaß">
      <div className="w-full space-y-2.5">
        <div className="flex items-end gap-2">
          <label className="flex-1 min-w-0 text-[12px] text-text-secondary">Breite · px
            <input aria-label="Bildbreite in Pixeln" inputMode="numeric" value={width} aria-invalid={!!error} className={`${inputClass} mt-1`} onChange={(e) => edit('width', e.target.value)} onBlur={(e) => edit('width', e.target.value, true)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); edit('width', e.currentTarget.value, true) } }} />
          </label>
          <button type="button" aria-label={locked ? 'Seitenverhältnis entsperren' : 'Seitenverhältnis sperren'} aria-pressed={locked} title={locked ? 'Seitenverhältnis gekoppelt' : 'Beide Maße unabhängig'} className="h-9 w-8 shrink-0 flex items-center justify-center rounded-lg text-text-secondary hover:bg-surface-4 focus-visible:outline-accent-main" onClick={() => setLocked(!locked)}>{locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}</button>
          <label className="flex-1 min-w-0 text-[12px] text-text-secondary">Höhe · px
            <input aria-label="Bildhöhe in Pixeln" inputMode="numeric" value={height} aria-invalid={!!error} className={`${inputClass} mt-1`} onChange={(e) => edit('height', e.target.value)} onBlur={(e) => edit('height', e.target.value, true)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); edit('height', e.currentTarget.value, true) } }} />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[12px] text-text-secondary shrink-0" htmlFor={ratioId}>Verhältnis</label>
          <select id={ratioId} aria-label="Pixel-Seitenverhältnis" className={inputClass} value={ratioChoice} onChange={(e) => selectRatio(e.target.value)}>
            {[...new Set(['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', ratioChoice])].filter((r) => r !== '210:297' && r !== 'custom').map((r) => <option key={r} value={r}>{r}</option>)}
            <option value="210:297">A4 · 210:297</option><option value="custom">Eigenes Verhältnis</option>
          </select>
          {ratioChoice === 'custom' && <input aria-label="Eigenes Pixel-Seitenverhältnis" className={`${inputClass} max-w-20`} value={customRatio} onChange={(e) => { setCustomRatio(e.target.value); report('Verhältnis mit Enter oder durch Verlassen des Feldes übernehmen.') }} onBlur={() => selectRatio('custom')} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); selectRatio('custom') } }} />}
        </div>
        <div className="flex items-center justify-between text-[12px] text-text-secondary tabular-nums"><span>{imageSize.width} × {imageSize.height} px</span><span>{(imageSize.width * imageSize.height / 1e6).toFixed(2)} MP</span></div>
        {error && <p role="alert" className="text-[12px] leading-relaxed text-red-300">{error}</p>}
        <p className="text-[12px] leading-relaxed text-text-secondary">{rounded ? 'Aufgerundet. ' : ''}16er-Schritte; das Verhältnis kann dabei leicht abweichen. Max. {c.maxEdge} px je Seite, {c.minPixels.toLocaleString('de-DE')}–{c.maxPixels.toLocaleString('de-DE')} Pixel gesamt; höchstens {c.maxAspectRatio}:1.</p>
      </div>
    </TuneGroup>}
  </>
}
