/** Canonical print composition, shared by the live UI and MCP. Outputs are raster artwork, not a prepress document. */
import { getModel, normalizeGptImageSize, normalizeModelId, DEFAULT_MODEL } from './image-models'

export type PrintFormat = 'a4-portrait' | 'a4-landscape' | 'a5-portrait' | 'a5-landscape' | 'a3-portrait' | 'a3-landscape' | 'business-card' | 'business-card-portrait' | 'square' | 'dl-portrait' | 'dl-landscape' | 'dl-105-landscape' | 'dl-105-portrait' | 'square-105' | 'custom'
export type PrintStyle = 'auto' | 'swiss' | 'editorial' | 'bold' | 'elegant'
export const DEFAULT_PRINT_FORMAT: PrintFormat = 'a4-portrait'
export const DEFAULT_PRINT_STYLE: PrintStyle = 'auto'
export interface PrintFormatOption { id: PrintFormat; name: string; hint: string; widthMm?: number; heightMm?: number; aspectRatio?: string; imageSize?: { width: number; height: number }; legacy?: boolean }
export const PRINT_FORMATS: PrintFormatOption[] = [
  { id: 'a4-portrait', name: 'DIN A Hochformat', hint: 'A-Reihe · Referenz A4 210 × 297 mm', widthMm: 210, heightMm: 297, aspectRatio: '210:297', imageSize: { width: 2240, height: 3168 } },
  { id: 'a4-landscape', name: 'DIN A Querformat', hint: 'A-Reihe · Referenz A4 297 × 210 mm', widthMm: 297, heightMm: 210, aspectRatio: '297:210', imageSize: { width: 3168, height: 2240 } },
  { id: 'a5-portrait', legacy: true, name: 'A5 Hochformat', hint: 'Flyer · 148 × 210 mm', widthMm: 148, heightMm: 210, aspectRatio: '148:210', imageSize: { width: 1744, height: 2480 } },
  { id: 'a5-landscape', legacy: true, name: 'A5 Querformat', hint: '210 × 148 mm', widthMm: 210, heightMm: 148, aspectRatio: '210:148', imageSize: { width: 2480, height: 1744 } },
  { id: 'a3-portrait', legacy: true, name: 'A3 Plakat', hint: '297 × 420 mm · Rasterentwurf', widthMm: 297, heightMm: 420, aspectRatio: '297:420', imageSize: { width: 2416, height: 3424 } },
  { id: 'a3-landscape', legacy: true, name: 'A3 Plakat quer', hint: '420 × 297 mm · Rasterentwurf', widthMm: 420, heightMm: 297, aspectRatio: '420:297', imageSize: { width: 3424, height: 2416 } },
  { id: 'business-card', name: 'Visitenkarte quer', hint: '85 × 55 mm · eine Seite', widthMm: 85, heightMm: 55, aspectRatio: '85:55', imageSize: { width: 1536, height: 992 } },
  { id: 'business-card-portrait', name: 'Visitenkarte hoch', hint: '55 × 85 mm · eine Seite', widthMm: 55, heightMm: 85, aspectRatio: '55:85', imageSize: { width: 992, height: 1536 } },
  { id: 'square', legacy: true, name: 'Quadratischer Flyer', hint: '148 × 148 mm', widthMm: 148, heightMm: 148, aspectRatio: '1:1', imageSize: { width: 2048, height: 2048 } },
  { id: 'dl-portrait', name: 'DIN lang hoch', hint: 'Flyer · 99 × 210 mm', widthMm: 99, heightMm: 210, aspectRatio: '99:210', imageSize: { width: 1488, height: 3152 } },
  { id: 'dl-landscape', name: 'DIN lang quer', hint: 'Flyer · 210 × 99 mm', widthMm: 210, heightMm: 99, aspectRatio: '210:99', imageSize: { width: 3152, height: 1488 } },
  { id: 'dl-105-landscape', name: 'DIN lang 105 quer', hint: 'Flyer / Karte · 210 × 105 mm', widthMm: 210, heightMm: 105, aspectRatio: '210:105', imageSize: { width: 3168, height: 1584 } },
  { id: 'dl-105-portrait', name: 'DIN lang 105 hoch', hint: 'Flyer / Karte · 105 × 210 mm', widthMm: 105, heightMm: 210, aspectRatio: '105:210', imageSize: { width: 1584, height: 3168 } },
  { id: 'square-105', name: 'Quadrat', hint: 'Karte / Flyer · 105 × 105 mm', widthMm: 105, heightMm: 105, aspectRatio: '1:1', imageSize: { width: 2048, height: 2048 } },
  { id: 'custom', name: 'Freies Format', hint: 'Seitenverhältnis und Pixel selbst wählen' },
]
/** The compact catalog omits redundant old physical sizes, but preserves saved
 * selections and historical output metadata without silently changing trim size. */
export function getPrintFormatOptions(current?: string): PrintFormatOption[] {
  return PRINT_FORMATS.filter(format => !format.legacy || format.id === current)
}
export const PRINT_STYLES: { id: PrintStyle; name: string; hint: string }[] = [
  { id: 'auto', name: 'Passend zum Briefing', hint: 'Eigenständige Art Direction für dein Thema' },
  { id: 'swiss', name: 'Klar & grafisch', hint: 'Raster, starke Typografie und geometrische Flächen' },
  { id: 'editorial', name: 'Editorial', hint: 'Magazinartige Typografie mit einer kuratierten Bildfläche' },
  { id: 'bold', name: 'Plakativ', hint: 'Große Schrift, klare Kontraste und selbstbewusste Farben' },
  { id: 'elegant', name: 'Elegant', hint: 'Feine typografische Hierarchie und großzügige Abstände' },
]
export const PRINT_OUTPUT_NOTICE = 'Rastergrafik, keine editierbare Satzdatei. Millimeter beschreiben das Zielformat; effektive Auflösung hängt von den tatsächlichen Pixeln ab. Kein automatisches CMYK, Beschnitt, PDF/X oder garantierte Druckfreigabe. Schrift und Druckvorgaben vor Produktion prüfen. Modelle ohne freie Pixelmaße nutzen ihr nächstes unterstütztes Seitenverhältnis.'

export function getPrintFormat(format: string): PrintFormatOption {
  const result = PRINT_FORMATS.find(item => item.id === format)
  if (!result) throw new Error(`Unknown print format "${format}". Choose: ${PRINT_FORMATS.map(item => item.id).join(', ')}.`)
  return result
}
export function preparePrintFormat(format: PrintFormat, modelIds: string[], custom: { aspectRatio?: string; resolution?: string; imageSize?: { width: number; height: number } } = {}): { aspectRatio: string; resolution: string; imageSize?: { width: number; height: number } } {
  const preset = getPrintFormat(format)
  const models = (modelIds.length ? modelIds : [DEFAULT_MODEL]).map(id => getModel(normalizeModelId(id)))
  if (format === 'custom') {
    if (custom.imageSize && models.some(model => model.imageSizeMode !== 'pixels')) throw new Error('Custom print pixel sizes require pixel-capable models only. Choose a format preset or use GPT Image 2.5.')
    const imageSize = custom.imageSize ? normalizeGptImageSize(custom.imageSize) : undefined
    return { aspectRatio: imageSize ? `${imageSize.width}:${imageSize.height}` : custom.aspectRatio ?? '1:1', resolution: custom.resolution ?? '2K', ...(imageSize ? { imageSize } : {}) }
  }
  // Mixed-model batches keep the preset pixels for capable models and let each
  // ratio-based provider resolve the physical ratio through the canonical registry.
  return { aspectRatio: preset.aspectRatio!, resolution: custom.resolution ?? '2K', ...(models.some(model => model.imageSizeMode === 'pixels') ? { imageSize: normalizeGptImageSize(preset.imageSize!) } : {}) }
}

const BASE_RULES = `Create a single finished flat graphic-design layout for print, deliberately typeset and art-directed as in a professional layout application.
First resolve the reading order and layout grid: headline, supporting information and fine details must have clearly different scales. Choose one coherent visual concept suited to the brief.
Use strong alignment, consistent margins, purposeful negative space, usually no more than two type families and a restrained palette of two to four flat colors. Compose with distinct solid color fields, typography and geometric forms. If imagery serves the brief, choose one strong image, clearly framed/cropped or cleanly cut out. Keep copy on quiet contrasting areas. Do not merge every requested subject into one decorative scene or collage. No default AI glow, plastic 3D letters, lens flares or indiscriminate ornaments.
Choose the visual metaphor, then stop: a location name, seasonal theme or list of activities is information, not a request to illustrate every noun. If one abstract star carries the concept, do not also add a station, cabins, trees, snow and string lights. A deliberate typographic composition with a single shape is a complete design. Use genuinely solid, smooth color fields: no simulated paper grain, mottling, vignette, lighting gradient or distressed texture unless explicitly requested. Avoid stock-template calendar/pin/cursor icon rows and decorative separators; organize practical information with typography and alignment instead.
Check the layout as a small printed proof before rendering. All informational text must contrast strongly with its own background, especially small copy. Use dark ink on bright yellow or other light saturated fields; do not set white informational text on yellow. Keep small copy simple and substantial enough to read at the target physical size. Leave deliberate space between headline, motif and information; never let a headline accidentally collide with an image or touch the trim.
Typography is a designed element: consistent baseline, spacing, clean letterforms and unmistakable hierarchy. Keep words whole, or use correct language-specific hyphenation when a word must wrap. Preserve supplied wording, punctuation, numbers and umlauts exactly. Do not render the instructions themselves. Do not invent contact data, dates, prices, slogans, logos or QR/barcodes. When only a theme is supplied, use its short descriptive title and resolve the concept visually; omit missing factual details instead of filling with fake copy.
Render one side as a single flat artwork filling the canvas, without a perspective mockup, photographed paper, desk, paper stack, fold, cast shadow, watermark, guides, color swatches or simulated crop marks. Keep essential copy comfortably inside the edges. Follow explicit copy and art direction in the user brief; these defaults do not force every brand into the same aesthetic.`
const STYLE_RULES: Record<Exclude<PrintStyle, 'auto'>, string> = {
  swiss: 'Use a rigorous typographic grid, asymmetric balance, crisp geometric color areas and a confident sans-serif hierarchy. The layout feels precise and purposeful.',
  editorial: 'Use an editorial magazine sensibility: beautifully paired headline and body typography, measured whitespace and one carefully art-directed image if useful. Keep distinct text and image zones.',
  bold: 'Use a bold typographic poster concept: oversized readable headline, striking flat color contrasts and one memorable geometric or visual gesture. Energy comes from scale and spacing, not clutter.',
  elegant: 'Use refined typography, generous breathing room and a restrained sophisticated palette. Contrast a distinctive headline with very legible small details. Avoid generic gold gradients and ornamental luxury clichés.',
}
export function buildPrintSystemPrompt(options: { format: PrintFormat; style: PrintStyle; hasReferences: boolean; customMetaPrompt?: string }): string {
  const format = getPrintFormat(options.format)
  if (!PRINT_STYLES.some(style => style.id === options.style)) throw new Error(`Unknown print style "${options.style}".`)
  const blocks = [BASE_RULES, `FORMAT: ${format.name}${format.widthMm ? `, target trim proportions ${format.widthMm} × ${format.heightMm} mm` : ', follow the requested aspect ratio'}. This describes the intended design surface, not a physical object in a photograph.`]
  if (options.style !== 'auto') blocks.push(STYLE_RULES[options.style])
  if (options.hasReferences) blocks.push('REFERENCES: Follow attached brand assets and the exact inline reference markers in the user brief. Preserve supplied logo identity and recognizable people/products when requested. Design around references as distinct layout elements; do not flatten them into a collage. Reference layout inspiration informs hierarchy and composition, not copied third-party names or claims.')
  if (options.customMetaPrompt?.trim()) blocks.push(`CUSTOM ART DIRECTION\nThese user-defined rules override aesthetic defaults above.\n${options.customMetaPrompt.trim()}`)
  return blocks.join('\n\n')
}

/** Keep the production contract next to the brief on every provider, including
 * models whose separate system instruction mainly influences overall style. */
export function buildPrintArtworkPrompt(brief: string): string {
  return `DESIGN BRIEF\n${brief}\n\nFINAL ARTWORK REQUIREMENTS\nThe entire output canvas IS the flat finished design. Its outer edges ARE the edges of the artwork. Fill it edge to edge in the requested orientation. Deliver the artwork itself, never a photograph of a card or poster sitting on a background. Alignment grids are invisible planning tools: the finished output has no visible grid, guides, rulers, construction lines or crop marks.\nTypeset information with strong light-dark contrast. On yellow or other light backgrounds, ALL text is dark ink, including large headlines. Separate information using aligned type and whitespace.\nRender only the copy provided in the brief. When the brief gives just a theme and no copy, the only visible words are that theme's short title; use the remaining space for the visual concept. Leave out invented slogans, feature lists, dates and contacts. Choose one visual concept and keep the remaining areas visually quiet. Explicit user art direction takes priority over aesthetic defaults.`
}

/** Based only on observed pixels and selected physical trim, never an invented DPI tag. */
export function getPrintResolutionInfo(format: PrintFormat, width: number, height: number) {
  const preset = getPrintFormat(format)
  if (!preset.widthMm || !preset.heightMm) return null
  return { widthMm: preset.widthMm, heightMm: preset.heightMm, effectivePpi: Math.round(Math.min(width / preset.widthMm, height / preset.heightMm) * 25.4), rasterWidth: width, rasterHeight: height }
}
