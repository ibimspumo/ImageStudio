import { fal } from '@fal-ai/client'
import {
  estimateImageCost,
  getModel,
  resolveAspectRatio,
  resolveResolution,
  toFixedImageSize,
  toGptImageSize,
  type FalBackground,
  type FalInputFidelity,
  type ImageModelOption,
} from '../../shared/image-models'
import { uploadImagesToUrls } from './image-upload'

/** A group of reference images the user labelled (an @-collection, a crop, …). */
export interface LabeledAttachment {
  label: string
  images: string[]
}

export interface GenerateRequest {
  prompt: string
  model: string
  apiKey: string
  aspectRatio: string
  resolution: string
  /** Reference images — data URLs or https URLs. Uploaded to fal storage before use. */
  attachments?: string[]
  labeledAttachments?: LabeledAttachment[]
  seed?: number
  /** Both OpenAI models */
  quality?: string
  /**
   * GPT Image 1.5 only — `transparent` is what logo mode is built on. It only
   * survives if `outputFormat` is png or webp.
   */
  background?: FalBackground
  /** GPT Image 1.5 edit only — how literally the reference is preserved. */
  inputFidelity?: FalInputFidelity
  /**
   * Explicit output size for models that take pixels instead of a ratio
   * (GPT Image 2). Set by thumbnail mode, which needs one exact format;
   * otherwise the size is derived from aspect ratio + resolution.
   */
  imageSize?: { width: number; height: number }
  /** Gemini models only */
  systemPrompt?: string
  enableWebSearch?: boolean
  thinkingLevel?: 'minimal' | 'high'
  safetyTolerance?: string
  outputFormat?: 'png' | 'jpeg' | 'webp'
  /** Inpaint mask, for the models that take one (see `maskField`). */
  maskUrl?: string
}

export interface GenerateResult {
  id: string
  text?: string
  imageBase64?: string
  imageUrl?: string
  error?: string
  cost?: number
  seed?: number
}

/**
 * Build the reference-image preamble.
 *
 * fal.ai takes a flat `image_urls` array and a single prompt string — unlike a
 * chat API there is no way to interleave labels between images. So the labels
 * are stated up front, numbered in the exact order the URLs are sent, which is
 * what lets `@collection` mentions in the prompt resolve to specific images.
 */
export function buildReferencePreamble(groups: LabeledAttachment[]): string {
  if (groups.length === 0) return ''

  const lines: string[] = []
  let index = 1
  for (const group of groups) {
    if (group.images.length === 1) {
      lines.push(`${index}. ${group.label}`)
      index++
    } else {
      for (let i = 0; i < group.images.length; i++) {
        lines.push(`${index}. ${group.label} — image ${i + 1} of ${group.images.length}`)
        index++
      }
    }
  }

  return `Reference images attached, in order:\n${lines.join('\n')}\n\nWhen the instruction below refers to a reference by name (for example [Image 1] or [@Logos]), it means the matching entry in this list.\n\n`
}

/** Flatten labelled groups into the image_urls order the preamble describes. */
function flattenGroups(groups: LabeledAttachment[]): string[] {
  return groups.flatMap((g) => g.images)
}

function buildInput(
  model: ImageModelOption,
  request: GenerateRequest,
  imageUrls: string[],
  prompt: string,
  numImages: number
): Record<string, unknown> {
  const input: Record<string, unknown> = {
    prompt,
    num_images: numImages,
    output_format: request.outputFormat ?? 'png',
  }

  if (imageUrls.length > 0) {
    input.image_urls = imageUrls
  }

  if (model.aspectRatios) {
    const ratio = resolveAspectRatio(model, request.aspectRatio)
    if (ratio) input.aspect_ratio = ratio
  }

  if (model.resolutions) {
    const res = resolveResolution(model, request.resolution)
    if (res) input.resolution = res
  }

  if (model.qualities) {
    input.quality = model.qualities.includes((request.quality ?? '') as never)
      ? request.quality
      : model.defaultQuality
  }

  if (model.imageSizeMode === 'pixels') {
    // GPT Image 2 has no aspect_ratio field — the ratio becomes an explicit size.
    // fal snaps both edges to multiples of 16, so a caller-supplied size has to
    // already be valid (thumbnail mode passes 1920 x 1088 for exactly that reason).
    input.image_size =
      request.imageSize ?? toGptImageSize(request.aspectRatio, request.resolution)
  } else if (model.imageSizeMode === 'size-enum') {
    // GPT Image 1.5 takes one of three fixed strings. An explicit pixel size
    // from the caller means nothing here, so the ratio decides.
    input.image_size = toFixedImageSize(model, request.aspectRatio)
  }

  if (model.supportsBackground && request.background) {
    input.background = request.background
    // A transparent background exists only in a format that has an alpha
    // channel — JPEG would silently come back flattened.
    if (request.background === 'transparent' && input.output_format === 'jpeg') {
      input.output_format = 'png'
    }
  }

  // input_fidelity only exists on the edit endpoint.
  if (model.supportsInputFidelity && request.inputFidelity && imageUrls.length > 0) {
    input.input_fidelity = request.inputFidelity
  }

  if (model.supportsSeed && request.seed != null) {
    input.seed = request.seed
  }

  if (model.supportsSystemPrompt && request.systemPrompt) {
    input.system_prompt = request.systemPrompt
  }

  if (model.supportsWebSearch && request.enableWebSearch) {
    input.enable_web_search = true
  }

  if (model.supportsThinkingLevel && request.thinkingLevel) {
    input.thinking_level = request.thinkingLevel
  }

  if (model.supportsSafetyTolerance && request.safetyTolerance) {
    input.safety_tolerance = request.safetyTolerance
  }

  if (model.maskField && request.maskUrl && imageUrls.length > 0) {
    input[model.maskField] = request.maskUrl
  }

  return input
}

/** fal errors carry the useful detail in `body.detail`, not in `message`. */
function describeFalError(err: unknown): string {
  if (err && typeof err === 'object') {
    const body = (err as { body?: { detail?: unknown } }).body
    const detail = body?.detail
    if (Array.isArray(detail)) {
      const msgs = detail
        .map((d: { msg?: string; loc?: unknown[] }) => {
          const field = Array.isArray(d.loc) ? d.loc.slice(1).join('.') : ''
          return field ? `${field}: ${d.msg}` : d.msg
        })
        .filter(Boolean)
      if (msgs.length) return msgs.join('; ')
    }
    if (typeof detail === 'string') return detail
  }
  return err instanceof Error ? err.message : String(err)
}

/**
 * Generate one or more images through fal.ai.
 *
 * Reference images are uploaded to fal storage first (the endpoints only accept
 * URLs), then the request goes to the model's edit endpoint; without references
 * it goes to the text-to-image endpoint.
 */
export async function generateImage(
  request: GenerateRequest,
  signal?: AbortSignal,
  onProgress?: (status: string) => void
): Promise<GenerateResult[]> {
  if (!request.apiKey) throw new Error('No fal.ai API key configured')
  fal.config({ credentials: request.apiKey })

  const model = getModel(request.model)

  // Prefer labelled groups; fall back to the flat list when there are no labels.
  const groups: LabeledAttachment[] =
    request.labeledAttachments && request.labeledAttachments.length > 0
      ? request.labeledAttachments
      : (request.attachments ?? []).map((img, i) => ({ label: `Image ${i + 1}`, images: [img] }))

  let imageUrls = flattenGroups(groups)

  if (imageUrls.length > model.maxReferenceImages) {
    throw new Error(
      `${model.name} accepts at most ${model.maxReferenceImages} reference images, got ${imageUrls.length}.`
    )
  }

  if (imageUrls.length > 0) {
    onProgress?.('Uploading references…')
    imageUrls = await uploadImagesToUrls(imageUrls, request.apiKey)
  }

  let maskUrl = request.maskUrl
  if (maskUrl && model.maskField) {
    const [uploaded] = await uploadImagesToUrls([maskUrl], request.apiKey)
    maskUrl = uploaded
  }

  const prompt = buildReferencePreamble(groups) + request.prompt
  const endpoint = imageUrls.length > 0 ? model.editEndpoint : model.endpoint
  const input = buildInput(model, { ...request, maskUrl }, imageUrls, prompt, 1)

  onProgress?.('Generating…')

  let result: { data: unknown; requestId: string }
  try {
    result = await fal.subscribe(endpoint, {
      input,
      logs: false,
      abortSignal: signal,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_QUEUE') onProgress?.('Queued…')
        else if (update.status === 'IN_PROGRESS') onProgress?.('Generating…')
      },
    })
  } catch (err) {
    if (signal?.aborted) {
      const abortError = new Error('Cancelled')
      abortError.name = 'AbortError'
      throw abortError
    }
    throw new Error(describeFalError(err))
  }

  const data = result.data as {
    images?: { url?: string; width?: number; height?: number }[]
    description?: string
    seed?: number
  }

  const images = data.images ?? []
  if (images.length === 0) {
    throw new Error(data.description || 'No image returned by the model')
  }

  // Priced off what was actually sent, not what was asked for — a resolution
  // the model does not offer was clamped in `buildInput` and bills accordingly.
  const cost = estimateImageCost(model.id, {
    resolution: typeof input.resolution === 'string' ? input.resolution : undefined,
    quality: typeof input.quality === 'string' ? input.quality : undefined,
    imageSize:
      input.image_size && typeof input.image_size === 'object'
        ? (input.image_size as { width: number; height: number })
        : undefined,
    aspectRatio: request.aspectRatio,
    webSearch: input.enable_web_search === true,
    thinkingLevel: typeof input.thinking_level === 'string' ? input.thinking_level : undefined,
  })

  return images.map((img) => ({
    id: result.requestId,
    imageUrl: img.url,
    text: data.description || undefined,
    seed: data.seed,
    cost,
  }))
}

/** Download a generated image and return it as a base64 data URL. */
export async function downloadImageAsBase64(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status} ${response.statusText}`)
  }
  const contentType = response.headers.get('content-type') || 'image/png'
  const buffer = Buffer.from(await response.arrayBuffer())
  return `data:${contentType};base64,${buffer.toString('base64')}`
}
