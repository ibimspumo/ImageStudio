/** The exact text representation of the UI's inline reference chips. */
export const collectionMention = (name: string): string => `[@${name}]`
export const imageMention = (name: string): string => `[${name}]`
export const collectionReferenceLabel = (name: string, count: number): string =>
  `Collection "@${name}" (${count} image${count === 1 ? '' : 's'})`

export const REFERENCE_PROMPT_GUIDANCE = {
  instruction: 'Place reference mentions inside the prompt exactly where you describe the referenced person, object, style or background, just as a human places an inline mention chip in the app. Prefer explicit mentions to vague wording such as "from the reference collection", especially with multiple references.',
  collections: 'First list collections and copy their exact promptReference (case and spaces included). Include the collection ID in collectionIds AND its [@Collection name] mention in the relevant prompt sentence. collectionIds attaches images; it does not insert text. A mention alone does not attach a collection.',
  images: 'The first entry of references is [Image 1], the second [Image 2], and so on. Use these mentions at the relevant positions in the prompt AND attach the matching references. Collections do not change this numbering. For live drafts use the exact promptReference returned by get_draft, since existing image names can differ.',
  example: 'Create a portrait of [@Timo] wearing the jacket from [Image 1], against the background from [Image 2]. Preserve the facial identity of [@Timo].',
  multipleImagesExample: 'Use the person from [Image 1], wearing the outfit from [Image 2], in the room from [Image 3]. Preserve the face from [Image 1].',
  sources: 'The same inline image references apply to imported local images, images downloaded from URLs, previous generation results, and additional images used for variations. Attach each image through the tool input as well as mentioning it. Assign each reference a clear role; mention it again when needed.',
  video: 'Video generation currently takes one start image, supplied through generate_video.startImageId or the video draft startFrame. Describe its subjects and their motion inline in natural language, e.g. "The person in the start image waves while the camera moves closer." Video prompts do not resolve collection/image chips, and the app currently has no end-frame or video/audio-reference input. To combine several images into a video, first compose an image using explicit image/collection mentions, then use that result as the start image.',
  transport: 'Mentions are textual anchors linked to labeled image attachments. Images are sent separately with an ordered reference preamble; they are not physically embedded midway through the text. The same convention is used by the UI and MCP.',
}

export const REFERENCE_PROMPT_DESCRIPTION = `${REFERENCE_PROMPT_GUIDANCE.instruction} ${REFERENCE_PROMPT_GUIDANCE.collections} ${REFERENCE_PROMPT_GUIDANCE.images}`

export type PromptMentionPart = { kind: 'text'; raw: string } | { kind: 'collection' | 'image'; raw: string; label: string }

/** Recognize explicit reference markers only; ordinary @text and brackets stay plain text. */
export function splitPromptMentions(prompt: string): PromptMentionPart[] {
  const parts: PromptMentionPart[] = []
  const pattern = /\[@[^\[\]\r\n]+\]|\[Image [1-9]\d*\]/g
  let offset = 0
  for (const match of prompt.matchAll(pattern)) {
    const start = match.index!
    if (start > offset) parts.push({ kind: 'text', raw: prompt.slice(offset, start) })
    const raw = match[0]
    parts.push({ kind: raw.startsWith('[@') ? 'collection' : 'image', raw, label: raw.slice(1, -1) })
    offset = start + raw.length
  }
  if (offset < prompt.length) parts.push({ kind: 'text', raw: prompt.slice(offset) })
  return parts
}
