import { flushSync } from 'react-dom'
import { getLiveDraft, mountedDraftModes, type DraftMode, type DraftPatch } from './live-drafts'
import { object, str, array, choice, integer, bool } from './schema'
import type { RegisterTool } from './tools'
import { GPT_IMAGE_SIZE_CONSTRAINTS } from '../../../shared/image-models'
import { AVAILABLE_MODELS, AVAILABLE_VIDEO_MODELS, LOGO_STYLES, THUMBNAIL_STYLES } from '../types/api'
import { useGalleryStore } from '../stores/gallery-store'
import { REFERENCE_PROMPT_DESCRIPTION, REFERENCE_PROMPT_GUIDANCE } from '../../../shared/reference-mentions'

const modeSchema = choice(['image', 'thumbnail', 'logo', 'video', 'canvas'])
const referenceSchema = { ...str('Existing gallery image ID or image data URL. Import file/URL sources with import_media first. In references, entries become [Image 1], [Image 2], etc.; mention them inline where you describe their role. The video startFrame is a dedicated input instead.'), maxLength: 30000000 }
export const draftPatchSchema = object({
  prompt: str(`Replaces editor text. For image editors, recognized inline mentions become real UI chips at that text position. When collectionIds is omitted, exact unambiguous [@Collection name] markers automatically attach matching live collections, like human paste. Explicit collectionIds replaces that list; unknown or ambiguous names remain text. Image markers resolve only against attached references. ${REFERENCE_PROMPT_DESCRIPTION} ${REFERENCE_PROMPT_GUIDANCE.video}`),
  models: { ...array(choice(AVAILABLE_MODELS.map(m => m.id)), 8), minItems: 1 },
  aspectRatio: { type: 'string', pattern: '^(auto|[1-9][0-9]{0,3}:[1-9][0-9]{0,3})$' },
  resolution: str(), imageCount: integer(1, Math.max(...AVAILABLE_MODELS.map(model => model.maxImagesPerRequest))), quality: choice([...new Set(AVAILABLE_MODELS.flatMap(model => model.qualities ?? []))]),
  imageSize: { ...object({ width: integer(1, GPT_IMAGE_SIZE_CONSTRAINTS.maxEdge), height: integer(1, GPT_IMAGE_SIZE_CONSTRAINTS.maxEdge) }, ['width', 'height']), description: 'Custom pixels; edges round upward to multiples of 16 and shared GPT limits apply. Overrides ratio/resolution. Unavailable in thumbnail mode.' }, clearImageSize: bool,
  outputFormat: choice(['png', 'jpeg', 'webp']), outputCompression: integer(0, 100), clearOutputCompression: bool,
  seed: integer(0, 2147483647), clearSeed: bool,
  thumbnailStyle: choice(THUMBNAIL_STYLES.map(s => s.id)), logoStyle: choice(LOGO_STYLES.map(s => s.id)),
  background: choice(['auto', 'opaque', 'transparent']),
  references: array(referenceSchema, 32), collectionIds: array(str('Collection ID to attach. Place its exact promptReference from collections list, e.g. [@Timo], inside patch.prompt at the relevant sentence; otherwise the editor appends the collection chip at the end.'), 32),
  model: choice(AVAILABLE_VIDEO_MODELS.map(m => m.id)), duration: integer(1, 120),
  generateAudio: bool, cameraFixed: bool, startFrame: referenceSchema, clearStartFrame: bool,
})
export async function resolveDraftReference(source: string): Promise<string> {
  if (/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]+$/.test(source)) return source
  const image = useGalleryStore.getState().images.find(image => image.id === source)
  if (!image || image.type === 'video' || image.isLoading || image.error || !image.filePath) throw new Error(`Reference ${source.slice(0, 80)} must be a completed gallery image ID or image data URL. Import files/URLs first.`)
  const result = await window.api.readImage(image.filePath)
  if (!result.success || !result.base64DataUrl) throw new Error(result.error || 'Cannot read reference image')
  return result.base64DataUrl
}
export function rejectDraftFields(patch: DraftPatch, allowed: readonly (keyof DraftPatch)[]): void {
  for (const key of Object.keys(patch)) if (!allowed.includes(key as keyof DraftPatch)) throw new Error(`${key} is not available in this editor. Read get_draft for the active mode and supported options.`)
}
export function registerDraftTools(add: RegisterTool): void {
  add<{ mode?: DraftMode }>('get_draft', 'Read the real mounted app editors: current prompt, models, options, references, selected context and composed mode rules. Omit mode to inspect all mounted drafts. Navigate to an area before editing its draft. No generation or charge.', object({ mode: modeSchema }), args => args.mode ? getLiveDraft(args.mode).read() : { drafts: mountedDraftModes().map(mode => getLiveDraft(mode).read()) }, true)
  add<{ mode: DraftMode; patch: DraftPatch }>('update_draft', 'Update the actual visible prompt editor. Only specified fields change; references/collectionIds replace their lists (empty clears). Prompt is plain text, never HTML. Imports must be completed gallery images or image data URLs. Does not generate or charge; then call generate_draft to submit exactly as the UI button does.', object({ mode: modeSchema, patch: draftPatchSchema }, ['mode', 'patch']), async args => {
    await getLiveDraft(args.mode).update(args.patch)
    // Drain React updates before replying, so the next tool observes this edit.
    flushSync(() => {})
    return getLiveDraft(args.mode).read()
  })
  add<{ mode: DraftMode }>('generate_draft', 'PAID: submit the current live app draft using the exact UI Generate action, including references, presets, thumbnail meta prompts and open canvas context. Returns new gallery job IDs immediately after local preparation; poll get_status. Configure with update_draft first.', object({ mode: modeSchema }, ['mode']), async args => {
    const draft = getLiveDraft(args.mode)
    const result = await draft.submit()
    const jobIds = typeof result === 'string' ? [result] : Array.isArray(result) && result.every(id => typeof id === 'string') ? result as string[] : []
    if (!jobIds.length) throw new Error('Draft was not submitted. Supply a non-empty prompt and provider key; video also needs a start frame, canvas a non-empty sketch. Read get_draft and correct the missing input.')
    return { jobIds, mode: args.mode, status: 'submitted' }
  })
  add<{ mode: DraftMode; referenceId: string }>('read_draft_reference', 'View an attached draft image or video start frame as native MCP image content. Read get_draft for reference IDs; for collections use collection tools. No paid request.', object({ mode: modeSchema, referenceId: str() }, ['mode', 'referenceId']), async args => {
    const source = await getLiveDraft(args.mode).readReference(args.referenceId)
    const match = source && /^data:([^;]+);base64,(.+)$/s.exec(source)
    if (!match) throw new Error('Draft reference not found; read get_draft for current reference IDs')
    return { content: [{ type: 'image', mimeType: match[1], data: match[2] }] }
  }, true)
}
