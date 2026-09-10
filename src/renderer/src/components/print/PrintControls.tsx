import { PrintFormatSelect } from './PrintFormatSelect'
import { useState } from 'react'
import { Printer, ChevronDown } from 'lucide-react'
import { PRINT_FORMATS, PRINT_STYLES, buildPrintSystemPrompt, buildPrintArtworkPrompt, type PrintFormat, type PrintStyle } from '../../../../shared/print-prompt'

interface Props {
  format: PrintFormat
  style: PrintStyle
  metaPrompt: string
  onFormatChange: (format: PrintFormat) => void
  onStyleChange: (style: PrintStyle) => void
  onMetaPromptChange: (text: string) => void
  imageSize?: { width: number; height: number }
  aspectRatio: string
  error?: string
  hasReferences: boolean
}

/** Print-specific intent stays above the shared image model and output controls. */
export function PrintControls({ format, style, metaPrompt, onFormatChange, onStyleChange, onMetaPromptChange, imageSize, aspectRatio, error, hasReferences }: Props) {
  const [showRules, setShowRules] = useState(false)
  const selected = PRINT_FORMATS.find(item => item.id === format)
  const ppi = imageSize && selected?.widthMm && selected?.heightMm
    ? Math.round(Math.min(imageSize.width / selected.widthMm, imageSize.height / selected.heightMm) * 25.4) : undefined
  const selectClass = 'h-8 max-w-full rounded-lg border border-border-base bg-surface-3 px-2 text-[13px] text-text-primary focus:outline-accent-main'
  return <div className="px-5 pt-4 pb-3 border-b border-border-dim">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <Printer className="w-4 h-4 text-text-secondary shrink-0" aria-hidden="true" />
      <label className="flex items-center gap-2 text-[12px] text-text-secondary">Printformat
        <PrintFormatSelect format={format} onChange={onFormatChange} />
      </label>
      <label className="flex items-center gap-2 text-[12px] text-text-secondary">Gestaltung
        <select aria-label="Print-Gestaltung" className={selectClass} value={style} onChange={event => onStyleChange(event.target.value as PrintStyle)}>
          {PRINT_STYLES.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <button type="button" className="ml-auto flex items-center gap-1 text-[12px] text-text-secondary hover:text-text-primary py-1" aria-expanded={showRules} onClick={() => setShowRules(!showRules)}>Gestaltungsregeln<ChevronDown className={`w-3.5 h-3.5 transition-transform ${showRules ? 'rotate-180' : ''}`} /></button>
    </div>
    <p className="mt-2 text-[12px] text-text-secondary leading-relaxed">
      {selected?.widthMm && selected?.heightMm ? `${selected.widthMm} × ${selected.heightMm} mm · ` : ''}
      {imageSize ? `${imageSize.width} × ${imageSize.height} px` : `${aspectRatio} · Größe modellabhängig`}
      {ppi ? ` · ca. ${ppi} ppi im Zielformat` : ''}
      {' · Rasterbild; Texte und Druckdaten vor Druck prüfen.'}
    </p>
    {error && <p role="alert" className="mt-2 text-[12px] text-danger">{error}</p>}
    {showRules && <div className="mt-4 space-y-3">
      <p className="text-[13px] text-text-secondary max-w-[70ch]">Klare Typografie, ein geordnetes Raster, gezielte Flächen und ein starkes Hauptmotiv. Exakte Texte in Anführungszeichen angeben. Referenzen wie gewohnt anhängen und im Text erwähnen.</p>
      <label className="block text-[13px] text-text-primary">Eigene Gestaltungsregeln
        <textarea aria-label="Eigene Print-Gestaltungsregeln" value={metaPrompt} onChange={event => onMetaPromptChange(event.target.value)} rows={3} placeholder="Zum Beispiel: Unsere Hausfarbe ist Dunkelblau. Headlines immer in einer kräftigen Grotesk."
          className="block mt-2 w-full resize-y min-h-[72px] max-h-[180px] rounded-lg border border-border-base bg-surface-3 p-3 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-accent-main" />
      </label>
      <details className="text-[12px] text-text-secondary"><summary className="cursor-pointer py-1">Vollständige Gestaltungsregeln ansehen</summary><pre className="mt-2 max-h-[180px] overflow-auto whitespace-pre-wrap font-sans leading-relaxed">{buildPrintSystemPrompt({ format, style, hasReferences, customMetaPrompt: metaPrompt }) + '\n\n' + buildPrintArtworkPrompt('[Dein Briefing]')}</pre></details>
    </div>}
  </div>
}
