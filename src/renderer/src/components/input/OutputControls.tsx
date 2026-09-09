import type { OutputFormat } from '../../types/api'
import { useSettingsStore } from '../../stores/settings-store'
import { TuneGroup, TuneOption } from './TunePanel'

export interface OutputControlProps {
  outputFormat?: OutputFormat
  onOutputFormatChange?: (format: OutputFormat) => void
  outputCompression?: number
  onOutputCompressionChange?: (compression: number | undefined) => void
}
export function OutputControls({ outputFormat = 'png', onOutputFormatChange, outputCompression, onOutputCompressionChange, supportsCompression, transparent }: OutputControlProps & { supportsCompression: boolean; transparent?: boolean }) {
  const antiDetection = useSettingsStore((s) => s.antiDetection)
  if (!onOutputFormatChange) return null
  return <TuneGroup label="Provider-Format">
    {(['png', 'jpeg', 'webp'] as const).map((format) => <TuneOption key={format} selected={outputFormat === format} disabled={transparent && format === 'jpeg'} onClick={() => onOutputFormatChange(format)} title={transparent && format === 'jpeg' ? 'JPEG unterstützt keine Transparenz' : undefined}>{format.toUpperCase()}</TuneOption>)}
    {supportsCompression && outputFormat !== 'png' && onOutputCompressionChange && <div className="w-full mt-2 text-[12px] text-text-secondary">
      <span className="flex justify-between"><span>Provider-Kompression · Bildqualität</span><span className="tabular-nums">{outputCompression == null ? 'Provider-Standard' : `${outputCompression}%`}</span></span>
      <input aria-label="Provider-Kompression Bildqualität" type="range" min={0} max={100} step={1} value={outputCompression ?? 100} onChange={(e) => onOutputCompressionChange(Number(e.target.value))} className="w-full mt-2 accent-accent-main" />
      <span className="flex justify-between text-text-secondary"><span>Kleinere Datei</span><span>Höchste Qualität</span></span>
      {outputCompression != null && <button type="button" className="mt-2 rounded-md text-[12px] text-text-secondary hover:text-text-primary underline underline-offset-2 focus-visible:outline-accent-main" onClick={() => onOutputCompressionChange(undefined)}>Provider-Standard wiederherstellen</button>}
    </div>}
    {antiDetection && <p className="w-full mt-1 text-[12px] leading-relaxed text-text-secondary">JPEG-Nachbearbeitung ist aktiv; die gespeicherte Datei kann vom Provider-Format abweichen.</p>}
  </TuneGroup>
}
