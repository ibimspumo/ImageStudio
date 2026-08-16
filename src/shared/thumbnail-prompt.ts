/**
 * The YouTube thumbnail system prompt.
 *
 * Shared by main and renderer — keep it free of Node and DOM APIs.
 *
 * The text is English on purpose: the image models follow English directives
 * noticeably more reliably than German ones, while the user's own prompt stays
 * in whatever language they typed it.
 *
 * Delivery differs per model. The Gemini endpoints take a real `system_prompt`
 * field; GPT Image 2 has none, so the same block is prepended to the prompt
 * (see `useImageGeneration`).
 */

/** `auto` adds no style block at all — the base rules alone, model decides. */
export type ThumbnailStyle = 'auto' | 'clean' | 'balanced' | 'bold'

/** Everything in thumbnail mode is 16:9 — YouTube accepts nothing else. */
export const THUMBNAIL_ASPECT_RATIO = '16:9'

/** Requested resolution for the models that have a `resolution` field. */
export const THUMBNAIL_RESOLUTION = '2K'

/** The format YouTube actually wants. Every export is normalised to this. */
export const THUMBNAIL_EXPORT_SIZE = { width: 1920, height: 1080 } as const

/**
 * GPT Image 2 takes explicit pixels instead of an aspect ratio, but fal.ai
 * snaps both edges to multiples of 16 — a requested 1920 x 1080 comes back as
 * 1920 x 1072 (verified against the live endpoint). So we ask for one step up
 * and crop the 8 surplus pixels away on export, rather than upscaling.
 */
export const THUMBNAIL_GPT_IMAGE_SIZE = { width: 1920, height: 1088 } as const

export interface ThumbnailStyleOption {
  id: ThumbnailStyle
  name: string
  /** One line for the UI. */
  hint: string
}

export const THUMBNAIL_STYLES: ThumbnailStyleOption[] = [
  { id: 'auto', name: 'Automatisch', hint: 'Keine Stilvorgabe — der Prompt entscheidet' },
  { id: 'clean', name: 'Clean', hint: 'Editorial, typografiegeführt, ruhig' },
  { id: 'balanced', name: 'Balanced', hint: 'Klare Emotion ohne Karikatur' },
  { id: 'bold', name: 'MrBeast', hint: 'Pfeile, Outline-Schrift, Anschlag' },
]

/** The rules that apply to every thumbnail regardless of style. */
const BASE_RULES = `You design YouTube thumbnails. A thumbnail is not a nice picture — it is a
billboard the size of a postage stamp, seen for a fraction of a second while
someone scrolls on a phone. Its only job is the click.

FORMAT
- Exactly 16:9. Design so it still reads when scaled down to 120x68 px.
- Nothing important in the outer 5% of the frame, and nothing important in the
  bottom-right corner — the player puts the duration badge there.
- Razor-sharp main subject. No noise, no mush, no heavy filter grunge.

ONE IDEA
- One single idea per image. 2-3 elements maximum (face + object + text).
- One obvious focal point. Everything else subordinates to it.
- The background serves the subject: blurred, darkened or deliberately plain.
  Never a detailed background competing with the foreground.
- Crop generously. A large near face beats a small full-body figure.

FACES
- Faces large, close, with clearly readable emotion (shock, joy, confusion,
  scepticism, outrage). Bored, blank or absent-minded faces are forbidden.
- Eyes visible and sharp. No sunglasses, no shadowed eye sockets.
- Gaze is a tool: into the lens for connection, at an object to point the
  viewer's eye at it.

COLOR
- Contrast beats palette: bright saturated subject on a dark or plain ground,
  or the reverse. It must pop on white (light mode) and on near-black (dark mode).
- Roughly 60/30/10 — ground, subject, accent.
- Prefer complementary contrast (orange/blue, yellow/navy, red/black).
- Push saturation, keep the punch local. No full-frame neon.
- Never a dominantly white or mid-grey background: it melts into the interface.

TEXT
- Text is optional. Only put words in the image when the request asks for them
  or the idea genuinely needs them.
- If there is text: 4 words maximum, huge, fat, sans-serif, legible at phone
  size. Spell any words from the request exactly as written, including umlauts
  and accents — no translation, no extra words, no subtitle underneath.
- High contrast against whatever is behind it — outline, hard shadow or a solid
  colour block. Never across a face, never inside the outer 5%.
- No captions, no watermarks, no logos, no decorative frames, no borders.

CLICK PSYCHOLOGY
- Open a curiosity gap: show enough to raise a question, never the answer.
  A before without an after, a reaction without its cause.
- Exaggerate, never lie. The video has to pay off what the image promises.
- At most 1-2 pointing devices (arrow, circle, glow), and only towards the one idea.

IF THE BRIEF IS VAGUE
- Several ideas: pick the strongest one, drop the rest.
- No emotion given: choose the one with the biggest drop.
- No colours given: build a two-colour world by the rules above.
- Compose so the image would still work with all text removed.`

/**
 * `auto` is absent on purpose: no entry means no style block, so the base rules
 * run alone and nothing overrides what the user wrote in the prompt.
 */
const STYLE_RULES: Record<Exclude<ThumbnailStyle, 'auto'>, string> = {
  clean: `STYLE: RESTRAINED / EDITORIAL
- Premium documentary look, not a shouting match. Think a well-art-directed
  tech or essay channel.
- Overrides the emotion rule above: a composed, controlled, confident
  expression is allowed here — focused, wry, concerned. Never blank or bored.
- Typography leads. Generous negative space. No arrows, no circles, no glow,
  no thick outlines, no stickers.
- Muted but high-contrast palette, one accent colour only. Natural, motivated
  lighting. Colour grading over colour explosion.
- The image should look expensive and deliberate rather than loud.`,

  balanced: `STYLE: PUNCHY BUT CREDIBLE
- Strong, unmistakable emotion without caricature. A real person having a real
  reaction, captured at its peak.
- Clean subject separation from the background — rim light or a defocused,
  darkened ground.
- One accent colour used decisively. Saturation lifted, not blown out.
- At most one pointing device (arrow or circle), and only if it genuinely
  clarifies the idea.
- If there is text: fat sans-serif with a hard shadow or a thin outline.`,

  bold: `STYLE: MAXIMUM INTENSITY (MrBeast school)
- Facial expression pushed to the absolute limit: eyes wide, mouth open, brows
  up. Theatrical, borderline absurd — but never a distorted, melted face.
- Subject cut out crisply and pushed forward against a punchy gradient or glow
  background. Strong rim light, high micro-contrast, slight vignette.
- One thick, saturated pointing device: a red arrow, a red circle or a glowing
  outline around the one thing that matters.
- Hyper-saturated complementary colours. Big, blocky, high-impact shapes.
- If there is text: enormous fat sans-serif, thick dark outline plus drop
  shadow, occupying a whole corner of the frame.
- Loud is correct here. Subtlety is a failure mode.`,
}

/** Appended whenever reference images of real people are attached. */
const FACE_FIDELITY_RULES = `REFERENCE PEOPLE — IDENTITY IS NON-NEGOTIABLE
- The attached reference images show real people. Their identity must survive
  into the result: keep facial geometry, proportions, skin tone, hairline, hair,
  facial hair, glasses and every other distinguishing feature exactly as in the
  reference. The result must be recognisable as that person at a glance.
- Do not beautify, slim, smooth, age, de-age or restyle anyone. No generic
  model face. Expression, lighting, angle, framing and clothing may change —
  the identity may not.
- Render every referenced face large, unobstructed and fully inside the frame,
  sharply focused, with both eyes visible and never covered by text, graphics
  or another element.
- With several referenced people: each one stays recognisably themselves. Never
  blend two references into one face.`

export interface ThumbnailPromptOptions {
  style: ThumbnailStyle
  /** Add the identity-preservation block (auto-on when references are attached). */
  faceFidelity: boolean
  /** Title of the video this thumbnail belongs to — context only. */
  videoTitle?: string
  /** The angle/hook of the video, if the project has one. */
  videoAngle?: string
}

/**
 * Assemble the full system prompt: base rules, style block, optional face
 * block, and the project context.
 */
export function buildThumbnailSystemPrompt(options: ThumbnailPromptOptions): string {
  const blocks: string[] = [BASE_RULES]

  if (options.style !== 'auto') blocks.push(STYLE_RULES[options.style])

  if (options.faceFidelity) blocks.push(FACE_FIDELITY_RULES)

  const context: string[] = []
  const title = options.videoTitle?.trim()
  if (title) {
    context.push(
      `- The video is titled: "${title}". This is context for the idea only. Any text
  in the image must NOT repeat or paraphrase the title — thumbnail and title are
  read together, so the image adds what the title does not say.`
    )
  }
  const angle = options.videoAngle?.trim()
  if (angle) context.push(`- The angle of the video: ${angle}`)
  if (context.length > 0) blocks.push(`VIDEO CONTEXT\n${context.join('\n')}`)

  return blocks.join('\n\n')
}
