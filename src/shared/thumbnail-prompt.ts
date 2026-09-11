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

/** Designed mode has its own coherent base; the legacy photographic base stays untouched. */
const DESIGNED_BASE_RULES = `You are a thumbnail graphic designer assembling a PHOTO + VECTOR montage.
Your deliverable should visibly look designed in Photoshop from separate photographic
assets, typography and graphic layers, with clear hierarchy and intentional empty space.
It is a finished YouTube thumbnail, not one continuous photographed or painted scene.

LAYOUT FIRST
- Exactly 16:9. One immediately readable idea, one focal point, roughly 2-3 main
  content elements. It must still read at 120x68 px on a phone.
- Reserve intentional negative space for the visual hierarchy. Make faces large
  enough to recognise and read, but do not let extreme close-ups fill the entire
  canvas or squeeze out the graphic layout. As a starting point, leave about a
  quarter of the composition as quiet colour space; adapt this to the actual brief.
- Keep important content inside the outer 5%, and keep the duration-badge area
  at bottom right free. Deliver artwork edge to edge, no external frame or mockup.

BACKGROUND = ITS OWN DESIGNED LAYER
- Default to a calm graphic background: a smooth flat colour field with at most
  one or two crisp solid panels or simple vector-like shapes, controlled contrast
  and intentional quiet space. This restrained designed look is the normal choice.
- Use a photographic scene, supplied background image or screenshot when the user
  explicitly asks for it, supplies it for that role, or the concrete visual idea
  clearly depends on seeing that location/event. General topic words such as
  "office comedy" do not by themselves request an office background. When both
  approaches tell the story equally well, prefer the calm graphic background.
- Photo backgrounds remain fully supported: do not replace a requested or clearly
  story-essential scene with flat panels. Keep it as a distinct compositing layer.
- Honour a requested location, scene or background reference. Treat that image
  as a separate background plate: crop it deliberately, control its detail and
  contrast, and use blur or darkening only where helpful for readability.
- Mount the foreground photographs and typography clearly over that plate with
  masks, scale, overlap and layer shadows. The result may show people composited
  onto a scenario; it must not melt every layer into one uniform painted scene.
- With a photo plate, make the montage visibly intentional: foreground cutouts
  can be larger than the background scene's natural scale, with a crisp silhouette
  and a controlled visible offset shadow or fine contour. Do not automatically
  seat the people behind the photographed furniture or invent a shared desk that
  turns them back into one candid office photograph. Keep hero props as distinct
  foreground assets unless the brief asks for natural interaction with the scene.
- Avoid irrelevant scenery and decorative texture added just to fill space.
  Do not default to brush strokes, grain, paper texture or cloudy paint. Natural
  detail inside a photographic background is welcome; keep it out of the type
  and graphic shapes. Do not force flat panels over an explicit or clearly necessary photo background.

PEOPLE AND OBJECTS = INDEPENDENT PHOTOGRAPHIC CUTOUTS
- Treat each person and hero object as a separately masked photograph placed and
  scaled deliberately on the layout. Their outer silhouette should read against
  the graphic background. Preserve fine hair edges and photographic skin detail.
- Use intentional overlap and a readable offset cast/drop shadow to communicate
  the order of layers. A shadow belongs to the silhouette, not a vague cinematic
  haze. Keep direction consistent. An outline is optional and follows the style.
- Faces remain real photographic people: recognisable proportions, visible eyes,
  natural skin, believable local detail. No plastic airbrush, face blending or
  painting over features. Emotion should support the idea; intensity follows style.
- Colour-correct photo assets individually. Do not spread one texture, dramatic
  light treatment or colour wash over photos, type and graphic background alike.

TYPE = PRECISE INDEPENDENT TYPESETTING
- Text is optional: include it only when requested or genuinely needed by the idea.
  At most four words, bold clean sans-serif, high contrast, clear hierarchy and
  breathing room. Keep it separate from faces and other competing elements.
- Spell requested text exactly, including umlauts and accents. No translations,
  additional slogans, small captions, subtitles or invented wording on props,
  cups, clothing or background signs. Existing reference logos may remain accurate;
  do not add new brands, watermarks or logos.
- Default letters are clean solid fills with crisp edges, like vector typography.
  No brush lettering, grain, distressed texture, embossed scenery or 3D extrusion
  unless the user explicitly requests that treatment. A deliberate solid text
  panel, controlled shadow or outline may provide contrast when the style needs it.

THE IDEA
- Create a truthful curiosity gap the video can pay off. Use gaze, scale and
  placement to guide attention. At most one or two pointing devices, only when
  useful to the one idea and allowed by the style. Never invent extra story props.
- When the brief is vague, choose the strongest idea and a clean graphic layout.
  When the user specifies a scene, treatment, text or layout, honour those concrete
  instructions instead of these defaults. Custom format rules below take precedence.`

const DESIGNED_STYLE_RULES: Record<Exclude<ThumbnailStyle, 'auto'>, string> = {
  clean: `STYLE: RESTRAINED / EDITORIAL
- Build a deliberate editorial block layout: photographic cutouts aligned against
  one or two flat colour panels, precise typesetting and generous negative space.
- Use subtle but readable mask boundaries and a small clean offset shadow only
  where it helps layer order. No thick outlines, stickers, glow, arrows or circles.
- Natural photographic faces, composed or wry expressions, muted high contrast
  and one accent colour. Premium art direction without scenic cinematic blur.`,
  balanced: `STYLE: PUNCHY BUT CREDIBLE
- Make the montage obvious: separately positioned photographic cutouts over solid
  graphic fields, with clearly readable offset subject shadows. A thin clean
  silhouette outline is optional if it improves separation.
- Strong believable reaction, natural photographic faces and local contrast.
  Keep quiet graphic space around the focal group; do not fill it with texture.
- One decisive accent colour, at most one helpful arrow or circle. Type stays
  clean and solid, with a controlled hard shadow or thin outline when useful.`,
  bold: `STYLE: MAXIMUM INTENSITY (MrBeast school)
- Push scale, theatrical emotion, local retouching and contrast to the limit while
  keeping identity recognisable. Crisp independent photo cutouts, bold graphic
  shapes, clear layer overlap and strong readable shadows.
- Saturated complementary colours; purposeful outlines, rim light and a local
  glow are welcome. A punchy gradient may replace the flat field in this style.
- At most one large saturated pointing device. If there is text: enormous clean
  block lettering with a thick dark outline and drop shadow. Avoid accidental
  brush/grain texture. Loud and heavily edited is correct; melted layers are not.`,
}

/** A visual compositing treatment, not an editable Photoshop file. */
export const THUMBNAIL_COMPOSITING_DESCRIPTION = 'Photoshop-style visual layers: photographic cutouts, independent typography and graphic shapes; strength follows the selected style. Defaults to the saved thumbnailCompositing setting (initially true). Custom format rules win. Raster output only.'

function compositingRules(style: ThumbnailStyle): string {
  const strength = {
    auto: 'Choose the separation strength to match the brief; keep it deliberate and visible without forcing a sticker aesthetic.',
    clean: 'Use restrained editorial compositing: precise masks, generous negative space, clean type and subtle contact shadows only when useful. No thick outlines, stickers or glow.',
    balanced: 'Use visibly separated photographic cutouts, a clearly readable offset directional drop shadow and, only when useful for contrast, a thin outline. Keep faces natural and grading local.',
    bold: 'Push the MrBeast treatment: exaggerated scale, crisp cutouts, strong graphic contrast, bolder shadows and optional outlines or glow. Heavy retouching is welcome, but each element must remain distinct and faces recognisable.',
  }[style]
  return `PHOTOSHOP COMPOSITING — DISTINCT VISUAL LAYERS
- Preserve the difference between PHOTO and VECTOR: separate foreground layers through masks and layout, not only through simulated lighting. Optional subject outlines are not an external frame.
- Art-direct this as a skilled thumbnail designer combining separate layers in Photoshop: a background plate, carefully masked photographic people/objects, independent typesetting and simple graphic shapes.
- Make the assembly readable through intentional overlaps, crisp controlled silhouette edges and differences in scale, depth and contrast. Preserve believable fine hair edges; no sloppy halos or accidental mask fringes.
- Keep photographic skin, hair and clothing photographic. Keep type and solid colour shapes clean and graphic. Never dissolve everything into one painted surface, one shared texture or an all-over cinematic colour wash.
- Use shadows to establish layer order, with consistent direction and deliberate offsets. Outlines are optional contrast tools, not a mandatory sticker border around every person. Do not draw a frame around the whole image.
- If text is needed, place it as precisely typeset, high-contrast typography with clear hierarchy and breathing room, independent of the photo surface. No embossed scenery-text or texture leaking into letters. Preserve the requested spelling and the existing text limits.
- Avoid plastic skin and airbrushed faces. Photo assets may share a coherent light direction; distinguish their masked edges against the chosen background plate through placement, local contrast and layer shadows, not through incompatible lighting. Keep identity and photographic detail while making deliberate local retouching decisions.
- ${strength}
- Final layout check: photo-background detail stays behind the foreground silhouettes. Text is clean digital typesetting; any supporting text panel has precise straight or deliberately geometric edges, never painted or frayed brush edges unless explicitly requested.
- These are visual construction instructions only: do not depict Photoshop, a software interface, a layer panel or a mockup. Deliver the finished thumbnail.`
}

export interface ThumbnailPromptOptions {
  /** Default-on visual compositing; false retains the original thumbnail rules. */
  thumbnailCompositing?: boolean
  style: ThumbnailStyle
  /** Add the identity-preservation block (auto-on when references are attached). */
  faceFidelity: boolean
  /** Title of the video this thumbnail belongs to — context only. */
  videoTitle?: string
  /** The angle/hook of the video, if the project has one. */
  videoAngle?: string
  /**
   * A user-saved meta prompt (e.g. a channel format). Appended as the last
   * block, so it sits below all built-in rules and directly above the user's
   * own prompt — and wins where the two disagree.
   */
  customMetaPrompt?: string
}

/**
 * Assemble the full system prompt: base rules, style block, optional face
 * block, and the project context.
 */
export function buildThumbnailSystemPrompt(options: ThumbnailPromptOptions): string {
  const compositing = options.thumbnailCompositing !== false
  const blocks: string[] = [compositing ? DESIGNED_BASE_RULES : BASE_RULES]

  if (options.style !== 'auto') blocks.push((compositing ? DESIGNED_STYLE_RULES : STYLE_RULES)[options.style])

  if (options.thumbnailCompositing !== false) blocks.push(compositingRules(options.style))

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

  const custom = options.customMetaPrompt?.trim()
  if (custom) {
    blocks.push(`CUSTOM FORMAT RULES
The following rules were set by the user for this channel/format. Where they
conflict with anything above, these rules win.

${custom}`)
  }

  return blocks.join('\n\n')
}
