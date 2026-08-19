/**
 * The logo system prompt.
 *
 * Shared by main and renderer — keep it free of Node and DOM APIs.
 *
 * The text is English on purpose: the image models follow English directives
 * noticeably more reliably than German ones, while the user's own prompt stays
 * in whatever language they typed it.
 *
 * GPT Image 1.5 has no `system_prompt` field, so this block is prepended to the
 * prompt (see `useImageGeneration`). It is the only model in the registry with
 * a `background` field, which is what the whole mode is built on.
 */

/** `auto` adds no style block at all — the base rules alone, model decides. */
export type LogoStyle = 'auto' | 'minimal' | 'wordmark' | 'emblem' | 'mascot'

/** The background value logo mode locks in — the point of the mode. */
export const LOGO_BACKGROUND = 'transparent' as const

/**
 * JPEG has no alpha channel, so it is not an option here. The file is stored as
 * PNG and stays PNG through export.
 */
export const LOGO_OUTPUT_FORMAT = 'png' as const

/** A logo is square unless the user says otherwise. */
export const LOGO_DEFAULT_ASPECT_RATIO = '1:1'

/** The three ratios GPT Image 1.5 offers, as logo mode labels them. */
export const LOGO_ASPECT_RATIOS = ['1:1', '3:2', '2:3'] as const

export interface LogoStyleOption {
  id: LogoStyle
  name: string
  /** One line for the UI. */
  hint: string
}

export const LOGO_STYLES: LogoStyleOption[] = [
  { id: 'auto', name: 'Automatisch', hint: 'Keine Stilvorgabe — der Prompt entscheidet' },
  { id: 'minimal', name: 'Minimal', hint: 'Geometrische Flat-Marke, eine Farbe' },
  { id: 'wordmark', name: 'Wortmarke', hint: 'Der Name selbst als Logo' },
  { id: 'emblem', name: 'Emblem', hint: 'Badge, Wappen, geschlossene Form' },
  { id: 'mascot', name: 'Maskottchen', hint: 'Figur als Markenzeichen' },
]

/** The rules that apply to every logo regardless of style. */
const BASE_RULES = `You design logos. A logo is not an illustration — it is a mark that has to
survive being stamped on a business card, an app icon, a hoodie and a browser
tab, in one colour, at 16 px, for twenty years.

THE MARK ITSELF
- One single idea. One shape a person could redraw from memory after seeing it
  once. If it needs a second look to be understood, it is too complex.
- Flat vector language: clean geometry, closed shapes, even stroke weights,
  deliberate negative space. No 3D bevels, no plastic gloss, no drop shadows,
  no lens flare, no gradients meshes, no photographic texture.
- It must still read when filled in solid black on white. Detail that dies at
  one colour does not belong in the mark.
- Perfectly centred in the frame, generous even margin on all four sides, so it
  can be placed without recropping. Nothing touching or bleeding off the edge.

COLOR
- Two colours at most, three only if one of them carries no meaning. A strong
  single colour beats a palette.
- Colours are flat and fully saturated areas, not blends. Where two colours
  meet, the edge is crisp.

TYPE
- Only put words in the mark if the request names them. Then set exactly those
  characters, spelled precisely as written, including umlauts and accents —
  no translation, no tagline, no extra words, no invented company name.
- One typeface, clean sans-serif unless the brief says otherwise, generous
  tracking, optically aligned to the symbol. Letterforms stay legible and
  unbroken — no distortion, no fake ligature accidents.
- Never render lorem ipsum, placeholder text or a slogan nobody asked for.

WHAT THE OUTPUT IS
- A single logo, rendered once. Not a grid of variants, not a presentation
  board, not a mockup on a card, sign, wall, screen or product shot.
- No frame, no border, no background panel, no drop shadow, no reflection,
  no watermark, no signature, no colour swatches, no annotation.

IF THE BRIEF IS VAGUE
- Several ideas at once: pick the strongest and drop the rest.
- No industry given: choose a neutral, abstract geometric mark.
- No colours given: use one confident colour on transparency.`

/**
 * `auto` is absent on purpose: no entry means no style block, so the base rules
 * run alone and nothing overrides what the user wrote in the prompt.
 */
const STYLE_RULES: Record<Exclude<LogoStyle, 'auto'>, string> = {
  minimal: `STYLE: GEOMETRIC MINIMAL
- Built from primitives — circles, arcs, triangles, rectangles — on an implied
  grid. Consistent stroke weight throughout, or solid filled shapes only.
- One colour, or one colour plus a single neutral. Nothing decorative survives
  that does not carry the idea.
- Negative space does real work: the counter-form should be half the concept.
- Think a modern software or fintech mark: quiet, exact, timeless.`,

  wordmark: `STYLE: WORDMARK
- The name itself is the logo. Set the exact characters from the request and
  nothing else — no symbol beside them unless the request asks for one.
- Custom-feeling letterforms: consistent weight, deliberate tracking, one or
  two considered details (a cut terminal, a joined pair, a modified counter).
  The word stays instantly readable — legibility outranks cleverness.
- One colour. Baseline horizontal, no arc, no perspective, no outline stroke.`,

  emblem: `STYLE: EMBLEM / BADGE
- One closed, self-contained outer form — circle, shield, hexagon, seal — with
  the symbol and, if named, the text locked inside it.
- Symmetrical and balanced. Any lettering follows the form cleanly, correctly
  spaced, fully legible; curved text stays readable, never cramped.
- Two colours maximum, flat. Weight thick enough that the whole badge still
  reads as one silhouette when small.
- Crest and heritage energy, but drawn with modern flat precision — no engraved
  shading, no distressed texture, no faux-vintage grain.`,

  mascot: `STYLE: MASCOT
- One character, front-facing or three-quarter, from the shoulders up unless
  the request says otherwise. Bold, simplified, flat-vector cartoon shapes.
- Strong readable silhouette, big clear features, one obvious expression. No
  fine linework, no airbrush shading, no rendered fur or scales.
- Limited flat palette, crisp edges, optional single uniform outline weight.
- Charming and confident, still a logo: it must survive being shrunk to an app
  icon, so nothing depends on small detail.`,
}

/** Appended whenever the request runs with a transparent background. */
const TRANSPARENCY_RULES = `TRANSPARENT BACKGROUND — NON-NEGOTIABLE
- The image is delivered with a real alpha channel. Everything that is not the
  mark itself must be fully transparent.
- Do not paint a background of any kind: no white or coloured fill, no card, no
  circle behind the mark, no gradient, no checkerboard pattern, no soft glow or
  halo bleeding into the empty area.
- Edges of the mark are crisp against nothing — no drop shadow, no outer glow,
  no feathered fade, no anti-aliased fringe of a background colour.
- The mark must stay legible on a white page and on a black page alike, so it
  cannot rely on a light or dark ground to be visible.`

/** Appended whenever reference images are attached. */
const REFERENCE_RULES = `REFERENCE IMAGES
- The attached references define the visual direction: shapes, colours, weight
  or an existing brand. Follow what they establish rather than inventing a new
  language beside it.
- If a reference is an existing logo of the same brand, stay consistent with
  its construction — same stroke weight logic, same colour, same proportions —
  unless the instruction explicitly asks for a redesign.
- Never copy a third-party trademark into the result.`

export interface LogoPromptOptions {
  style: LogoStyle
  /** The background the request runs with — adds the transparency block. */
  transparent: boolean
  /** Reference images are attached. */
  hasReferences: boolean
  /** The brand this logo is for — context only. */
  brandName?: string
}

/**
 * Assemble the full system prompt: base rules, style block, the transparency
 * block, and the reference block.
 */
export function buildLogoSystemPrompt(options: LogoPromptOptions): string {
  const blocks: string[] = [BASE_RULES]

  if (options.style !== 'auto') blocks.push(STYLE_RULES[options.style])
  if (options.transparent) blocks.push(TRANSPARENCY_RULES)
  if (options.hasReferences) blocks.push(REFERENCE_RULES)

  const brand = options.brandName?.trim()
  if (brand) {
    blocks.push(
      `BRAND\n- The logo is for: "${brand}". Use this spelling exactly wherever the mark
  carries the name. If the instruction does not ask for lettering, this is
  context only and no text goes into the image.`
    )
  }

  return blocks.join('\n\n')
}
