import { IMAGE_PROCESSING_MODELS } from './image-processing'
/**
 * fal.ai image model registry.
 *
 * Every field here mirrors what the fal.ai endpoint actually accepts — verified
 * against the live OpenAPI schemas at
 * `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=<id>`.
 * Do not add capabilities a model does not have; the UI hides controls based on
 * these flags and the request builder only sends supported fields.
 *
 * Shared by main and renderer — keep it free of Node and DOM APIs.
 */

/** Aspect ratios accepted by the Gemini-family endpoints. */
export type FalAspectRatio =
  | 'auto'
  | '21:9'
  | '16:9'
  | '3:2'
  | '4:3'
  | '5:4'
  | '1:1'
  | '4:5'
  | '3:4'
  | '2:3'
  | '9:16'
  | '4:1'
  | '1:4'
  | '8:1'
  | '1:8'

export type FalResolution = '0.5K' | '1K' | '2K' | '4K'

/** GPT Image 2.5 has no aspect_ratio/resolution — it takes image_size + quality. */
export type GptImageQuality = 'auto' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type OutputFormat = 'png' | 'jpeg' | 'webp'

/**
 * `background` — GPT Image 2.5. `transparent` is the generation route in the
 * whole registry to an image with a real alpha channel, and it only survives
 * when `output_format` is `png` or `webp`.
 */
export type FalBackground = 'auto' | 'transparent' | 'opaque'

/** `input_fidelity` — how literally the edit endpoint keeps the reference. */
export type FalInputFidelity = 'low' | 'high'

/**
 * How a model takes its output size.
 * - `aspect-ratio` — an `aspect_ratio` string plus a `resolution` tier (Gemini)
 * - `pixels` — an explicit `{ width, height }` object (GPT Image 2.5)
 * - `size-enum` — one of a handful of fixed `WxH` strings (GPT Image 1.5)
 */
export type ImageSizeMode = 'aspect-ratio' | 'pixels' | 'size-enum'

/**
 * What a generation costs, in USD.
 *
 * fal.ai reports no per-request price: neither the queue response nor the
 * client exposes billable units, and the OpenAPI schema carries no pricing
 * block. Everything the app shows is therefore derived from the published list
 * prices below — an estimate, never an invoice. Keep it in sync with the
 * `fal.ai/models/<id>` pages.
 */
export interface ImagePricing {
  /** Price of one image at the model's base resolution (1K unless noted). */
  perImage?: number
  /** Multiplier applied on top of `perImage` per resolution tier. */
  resolutionMultiplier?: Partial<Record<FalResolution, number>>
  /**
   * Models priced by exact output size and quality tier (GPT Image 2.5). The
   * nearest row by pixel count wins — fal snaps sizes to multiples of 16, so an
   * exact match is the exception.
   */
  sizeTiers?: { pixels: number; low: number; medium: number; high: number; xhigh?: number; max?: number }[]
  /** Added once per request when web search runs. */
  webSearchSurcharge?: number
  /** Added once per request at `thinking_level: 'high'`. */
  highThinkingSurcharge?: number
  /** Official price pages and verification date for discovery. */
  sources?: string[]
  checkedAt?: string
  /** Shown next to the estimate so the number can be judged. */
  note: string
}

export interface ImageModelOption {
  /** Canonical model id — identical to the text-to-image endpoint id on fal.ai */
  id: string
  name: string
  outputFormats?: OutputFormat[]
  description?: string
  maxPromptLength?: number
  supportsOutputCompression?: boolean
  pixelConstraints?: typeof GPT_IMAGE_SIZE_CONSTRAINTS
  providerSizePresets?: readonly string[]
  providerDefaultImageSize?: string
  provider: string
  /** Endpoint used when no reference images are attached */
  endpoint: string
  /** Endpoint used when reference images are attached */
  editEndpoint: string
  /**
   * Aspect ratios the endpoint accepts, or null when the model has no
   * `aspect_ratio` field (GPT Image 2.5 — it uses explicit pixel sizes).
   */
  aspectRatios: FalAspectRatio[] | null
  /** Output resolutions, or null when the model has a fixed output size. */
  resolutions: FalResolution[] | null
  /** Quality tiers exposed by the model endpoint. */
  qualities: GptImageQuality[] | null
  /** How `image_size` is expressed for this endpoint. */
  imageSizeMode: ImageSizeMode
  /**
   * The exact `image_size` strings a `size-enum` model accepts, spelled the way
   * the endpoint spells them. Null for every other mode.
   */
  fixedImageSizes: string[] | null
  /** The one used when the requested ratio matches nothing. */
  defaultImageSize: string | null
  /** Hard limit the endpoint enforces on `image_urls`. */
  maxReferenceImages: number
  /** Upper bound of `num_images`. */
  maxImagesPerRequest: number
  supportsSeed: boolean
  supportsSystemPrompt: boolean
  supportsWebSearch: boolean
  supportsThinkingLevel: boolean
  supportsSafetyTolerance: boolean
  /**
   * None of the models expose a negative_prompt field on fal.ai. Kept explicit
   * so the UI can say why the control is hidden.
   */
  supportsNegativePrompt: false
  /**
   * `background` — explicit transparency support, required for logo mode.
   */
  supportsBackground: boolean
  /** `input_fidelity` — GPT Image 1.5 edit only. */
  supportsInputFidelity: boolean
  defaultAspectRatio: FalAspectRatio | null
  defaultResolution: FalResolution | null
  defaultQuality: GptImageQuality | null
  /**
   * Aspect ratios the user can pick for this model. Usually identical to
   * `aspectRatios`, but GPT Image 2.5 has no `aspect_ratio` field and still
   * honours a ratio through an explicit `image_size` — so it offers the ratios
   * its pixel-size rules allow (up to 3:1).
   */
  uiAspectRatios: FalAspectRatio[]
  /**
   * Resolutions the user can pick. GPT Image 2.5 has no `resolution` field but
   * reaches these through `image_size`; Nano Banana 2 Lite genuinely cannot.
   */
  uiResolutions: FalResolution[]
  /** Fixed output size note shown in the UI, when the model has one. */
  fixedOutputNote?: string
  /** fal.ai list price — see `ImagePricing`. */
  pricing: ImagePricing
}

const GEMINI_RATIOS_FULL: FalAspectRatio[] = [
  'auto', '21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16',
  '4:1', '1:4', '8:1', '1:8',
]

/** Nano Banana Pro rejects the extreme ratios the other Gemini models allow. */
const GEMINI_RATIOS_STANDARD: FalAspectRatio[] = [
  'auto', '21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16',
]

export const GPT_IMAGE_SIZE_CONSTRAINTS = {
  multipleOf: 16,
  maxEdge: 3840,
  minPixels: 655_360,
  maxPixels: 8_294_400,
  maxAspectRatio: 3,
} as const

/** Round user dimensions upward, then reject invalid sizes instead of silently resizing. */
export function normalizeGptImageSize(size: { width: number; height: number }): { width: number; height: number } {
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) {
    throw new Error('Image width and height must be positive finite pixel values.')
  }
  const width = Math.ceil(size.width / 16) * 16
  const height = Math.ceil(size.height / 16) * 16
  const pixels = width * height
  const prefix = `Rounded image size ${width} × ${height}: `
  if (Math.max(width, height) > GPT_IMAGE_SIZE_CONSTRAINTS.maxEdge) {
    throw new Error(prefix + 'each edge must be at most 3840 pixels. Reduce the larger dimension.')
  }
  if (Math.max(width / height, height / width) > GPT_IMAGE_SIZE_CONSTRAINTS.maxAspectRatio) {
    throw new Error(prefix + 'aspect ratio must be between 1:3 and 3:1. Increase the shorter dimension or reduce the longer one.')
  }
  if (pixels < GPT_IMAGE_SIZE_CONSTRAINTS.minPixels || pixels > GPT_IMAGE_SIZE_CONSTRAINTS.maxPixels) {
    throw new Error(prefix + `total pixels must be between 655,360 and 8,294,400 (currently ${pixels.toLocaleString('en-US')}). Adjust both dimensions.`)
  }
  return { width, height }
}

export const GPT_IMAGE_FLARE_MODEL = 'openai/gpt-image-2.5/flare/text-to-image'
export const GPT_IMAGE_SUNBURST_MODEL = 'openai/gpt-image-2.5/sunburst/text-to-image'

function gptImage25Model(variant: 'flare' | 'sunburst'): ImageModelOption {
  return {
    id: `openai/gpt-image-2.5/${variant}/text-to-image`,
    name: `GPT Image 2.5 ${variant === 'flare' ? 'Flare' : 'Sunburst'}`,
    description: variant === 'flare'
      ? 'Fast, high-quality GPT Image 2.5 default for everyday images and transparent logos. Published fal.ai list prices currently match Sunburst; actual token usage and latency vary.'
      : 'Precision-focused premium GPT Image 2.5 variant for intricate details, with longer generation times; recommended for thumbnails. Published fal.ai list prices currently match Flare; actual token usage varies.',
    provider: 'OpenAI',
    outputFormats: ['png', 'jpeg', 'webp'],
    endpoint: `openai/gpt-image-2.5/${variant}/text-to-image`,
    editEndpoint: `openai/gpt-image-2.5/${variant}/edit`,
    aspectRatios: null,
    resolutions: null,
    qualities: ['auto', 'low', 'medium', 'high', 'xhigh', 'max'],
    imageSizeMode: 'pixels',
    fixedImageSizes: null,
    defaultImageSize: null,
    maxReferenceImages: 16,
    maxImagesPerRequest: 10,
    maxPromptLength: 32000,
    supportsSeed: false,
    supportsSystemPrompt: false,
    supportsWebSearch: false,
    supportsThinkingLevel: false,
    supportsSafetyTolerance: false,
    supportsNegativePrompt: false,
    supportsBackground: true,
    supportsInputFidelity: false,
    supportsOutputCompression: true,
    pixelConstraints: GPT_IMAGE_SIZE_CONSTRAINTS,
    providerSizePresets: ['square_hd', 'square', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9', 'auto'],
    providerDefaultImageSize: 'landscape_4_3',
    defaultAspectRatio: null,
    defaultResolution: null,
    defaultQuality: 'high',
    uiAspectRatios: GEMINI_RATIOS_STANDARD,
    uiResolutions: ['1K', '2K', '4K'],
    fixedOutputNote: 'Custom pixels round up to multiples of 16; max edge 3840, 0.655–8.294 MP, max ratio 3:1',
    pricing: {
      sources: [`https://fal.ai/models/openai/gpt-image-2.5/${variant}/text-to-image`, `https://fal.ai/models/openai/gpt-image-2.5/${variant}/edit`],
      checkedAt: '2026-09-09',
      sizeTiers: [
        { pixels: 1024 * 768, low: 0.00402, medium: 0.00903, high: 0.03612, xhigh: 0.06420, max: 0.14445 },
        { pixels: 1024 * 1024, low: 0.00588, medium: 0.01317, high: 0.05268, xhigh: 0.09366, max: 0.21072 },
        { pixels: 1024 * 1536, low: 0.00474, medium: 0.01029, high: 0.04116, xhigh: 0.07377, max: 0.16464 },
        { pixels: 1920 * 1080, low: 0.00441, medium: 0.01029, high: 0.03960, xhigh: 0.07041, max: 0.15840 },
        { pixels: 2560 * 1440, low: 0.00615, medium: 0.01434, high: 0.05529, xhigh: 0.09828, max: 0.22110 },
        { pixels: 3840 * 2160, low: 0.01113, medium: 0.02595, high: 0.10008, xhigh: 0.17790, max: 0.40026 },
      ],
      note: 'fal.ai list prices checked 2026-09-09; both variants currently share the same table. Nearest published pixel-count example; auto estimated at high, not guaranteed. Prompt/reference tokens add variability. USD per 1M tokens: text input 5/cached 1.25/output 10; image input 8/cached 2/output 30.',
    },
  }
}

export const AVAILABLE_MODELS: ImageModelOption[] = [
  gptImage25Model('flare'),
  gptImage25Model('sunburst'),
  {
    id: 'fal-ai/nano-banana-2',
    name: 'Nano Banana 2',
    provider: 'Google',
    endpoint: 'fal-ai/nano-banana-2',
    editEndpoint: 'fal-ai/nano-banana-2/edit',
    aspectRatios: GEMINI_RATIOS_FULL,
    resolutions: ['0.5K', '1K', '2K', '4K'],
    qualities: null,
    imageSizeMode: 'aspect-ratio',
    fixedImageSizes: null,
    defaultImageSize: null,
    maxReferenceImages: 14,
    maxImagesPerRequest: 4,
    supportsSeed: true,
    supportsSystemPrompt: true,
    supportsWebSearch: true,
    supportsThinkingLevel: true,
    supportsSafetyTolerance: true,
    supportsNegativePrompt: false,
    supportsBackground: false,
    supportsInputFidelity: false,
    defaultAspectRatio: '1:1',
    defaultResolution: '2K',
    defaultQuality: null,
    uiAspectRatios: GEMINI_RATIOS_FULL,
    uiResolutions: ['0.5K', '1K', '2K', '4K'],
    pricing: {
      perImage: 0.08,
      resolutionMultiplier: { '0.5K': 0.75, '1K': 1, '2K': 1.5, '4K': 2 },
      webSearchSurcharge: 0.015,
      highThinkingSurcharge: 0.002,
      note: '$0.08 per image at 1K; 2K x1.5, 4K x2, 0.5K x0.75',
    },
  },
  {
    id: 'google/nano-banana-2-lite',
    name: 'Nano Banana 2 Lite',
    provider: 'Google',
    endpoint: 'google/nano-banana-2-lite',
    editEndpoint: 'google/nano-banana-2-lite/edit',
    aspectRatios: GEMINI_RATIOS_FULL,
    resolutions: null,
    qualities: null,
    imageSizeMode: 'aspect-ratio',
    fixedImageSizes: null,
    defaultImageSize: null,
    maxReferenceImages: 14,
    maxImagesPerRequest: 4,
    supportsSeed: true,
    supportsSystemPrompt: true,
    supportsWebSearch: false,
    supportsThinkingLevel: true,
    supportsSafetyTolerance: true,
    supportsNegativePrompt: false,
    supportsBackground: false,
    supportsInputFidelity: false,
    defaultAspectRatio: '1:1',
    defaultResolution: null,
    defaultQuality: null,
    uiAspectRatios: GEMINI_RATIOS_FULL,
    uiResolutions: [],
    fixedOutputNote: 'Fixed 1K output',
    pricing: {
      // Billed per token ($37.50 / 1M output image tokens). A 1024x1024 Gemini
      // image is 1290 output tokens, and the output size here is fixed at 1K —
      // so the per-image price is effectively constant.
      perImage: 1290 * (37.5 / 1_000_000),
      note: 'Token-based, fixed 1K output — about $0.048 per image',
    },
  },
  {
    id: 'fal-ai/nano-banana-pro',
    name: 'Nano Banana Pro',
    provider: 'Google',
    endpoint: 'fal-ai/nano-banana-pro',
    editEndpoint: 'fal-ai/nano-banana-pro/edit',
    aspectRatios: GEMINI_RATIOS_STANDARD,
    resolutions: ['1K', '2K', '4K'],
    qualities: null,
    imageSizeMode: 'aspect-ratio',
    fixedImageSizes: null,
    defaultImageSize: null,
    maxReferenceImages: 14,
    maxImagesPerRequest: 4,
    supportsSeed: true,
    supportsSystemPrompt: true,
    supportsWebSearch: true,
    supportsThinkingLevel: false,
    supportsSafetyTolerance: true,
    supportsNegativePrompt: false,
    supportsBackground: false,
    supportsInputFidelity: false,
    defaultAspectRatio: '1:1',
    defaultResolution: '2K',
    defaultQuality: null,
    uiAspectRatios: GEMINI_RATIOS_STANDARD,
    uiResolutions: ['1K', '2K', '4K'],
    pricing: {
      perImage: 0.15,
      resolutionMultiplier: { '1K': 1, '2K': 1, '4K': 2 },
      webSearchSurcharge: 0.015,
      note: '$0.15 per image; 4K x2',
    },
  },
]

export const DEFAULT_MODEL = GPT_IMAGE_FLARE_MODEL

/**
 * Models usable in thumbnail mode.
 *
 * A YouTube thumbnail is delivered at 1920 x 1080, so a model that cannot
 * produce a 2K-class 16:9 frame has nothing to offer here — Nano Banana 2 Lite
 * is fixed at 1K and drops out. Derived from the registry rather than a
 * hand-kept list, so a future 2K model joins automatically.
 */
export function getThumbnailModels(): ImageModelOption[] {
  return AVAILABLE_MODELS.filter((m) => m.uiResolutions.includes('2K'))
}

export function isThumbnailModel(modelId: string): boolean {
  return getThumbnailModels().some((m) => m.id === modelId)
}

export const DEFAULT_THUMBNAIL_MODEL = GPT_IMAGE_SUNBURST_MODEL

/**
 * Models usable in logo mode.
 *
 * A logo without a transparent background is a picture of a logo, not a logo —
 * so the mode is defined by the capability, not by a hand-kept list. Both GPT Image 2.5 variants support it; a future model with a `background` field joins on its
 * own.
 */
export function getLogoModels(): ImageModelOption[] {
  return AVAILABLE_MODELS.filter((m) => m.supportsBackground)
}

export function isLogoModel(modelId: string): boolean {
  return getLogoModels().some((m) => m.id === modelId)
}

export const DEFAULT_LOGO_MODEL = GPT_IMAGE_FLARE_MODEL

/** Models the app used before it moved to fal.ai, mapped onto their replacement. */
const LEGACY_MODEL_IDS: Record<string, string> = {
  'openai/gpt-image-2': GPT_IMAGE_FLARE_MODEL,
  'fal-ai/gpt-image-1.5': GPT_IMAGE_FLARE_MODEL,
  'google/gemini-3.1-flash-image-preview': 'fal-ai/nano-banana-2',
  'google/gemini-3.1-flash-lite-image': 'google/nano-banana-2-lite',
  'google/gemini-3-pro-image-preview': 'fal-ai/nano-banana-pro',
  'openai/gpt-5.4-image-2': GPT_IMAGE_FLARE_MODEL,
  'openai/gpt-image-2 ': GPT_IMAGE_FLARE_MODEL,
  'openai/gpt-5-image': GPT_IMAGE_FLARE_MODEL,
  'openai/gpt-5-image-mini': GPT_IMAGE_FLARE_MODEL,
  'sourceful/riverflow-v2-pro': 'fal-ai/nano-banana-2',
  'bytedance-seed/seedream-4.5': 'fal-ai/nano-banana-2',
  'black-forest-labs/flux.2-max': 'fal-ai/nano-banana-2',
}

/** Map any stored model id (including OpenRouter-era ones) onto a supported model. */
export function normalizeModelId(modelId: string | undefined | null): string {
  if (!modelId) return DEFAULT_MODEL
  if (AVAILABLE_MODELS.some((m) => m.id === modelId)) return modelId
  return LEGACY_MODEL_IDS[modelId] ?? DEFAULT_MODEL
}

export function getModel(modelId: string): ImageModelOption {
  const id = normalizeModelId(modelId)
  return AVAILABLE_MODELS.find((m) => m.id === id) ?? AVAILABLE_MODELS[0]
}

export function getModelName(modelId: string): string {
  const known = [...AVAILABLE_MODELS, ...IMAGE_PROCESSING_MODELS].find((m) => m.id === modelId)
  if (known) return known.name
  // Historical images keep their original model id — show it rather than lying
  // about which model produced them.
  return ({ 'openai/gpt-image-2': 'GPT Image 2', 'fal-ai/gpt-image-1.5': 'GPT Image 1.5' } as Record<string, string>)[modelId] ?? modelId
}

/**
 * Pick the aspect ratio a model will actually accept.
 * Ratios the model does not support are mapped onto the closest one it does.
 */
export function resolveAspectRatio(model: ImageModelOption, requested: string): string | null {
  if (!model.aspectRatios) return null
  if (model.aspectRatios.includes(requested as FalAspectRatio)) return requested

  const target = parseRatio(requested)
  if (target == null) return model.defaultAspectRatio

  let best = model.aspectRatios[0]
  let bestDelta = Infinity
  for (const candidate of model.aspectRatios) {
    if (candidate === 'auto') continue
    const value = parseRatio(candidate)
    if (value == null) continue
    const delta = Math.abs(Math.log(value) - Math.log(target))
    if (delta < bestDelta) {
      bestDelta = delta
      best = candidate
    }
  }
  return best
}

/** Clamp a resolution to what the model offers (null when it has no such field). */
export function resolveResolution(model: ImageModelOption, requested: string): string | null {
  if (!model.resolutions) return null
  if (model.resolutions.includes(requested as FalResolution)) return requested
  const order: FalResolution[] = ['0.5K', '1K', '2K', '4K']
  const wantedIdx = order.indexOf(requested as FalResolution)
  if (wantedIdx < 0) return model.defaultResolution

  // Step down to the highest supported resolution at or below the request…
  for (let i = wantedIdx; i >= 0; i--) {
    if (model.resolutions.includes(order[i])) return order[i]
  }
  // …and when the request is below everything the model offers, step up to its
  // lowest rather than jumping to its highest.
  for (let i = wantedIdx + 1; i < order.length; i++) {
    if (model.resolutions.includes(order[i])) return order[i]
  }
  return model.defaultResolution
}

/**
 * The controls to show when several models are selected at once.
 *
 * Aspect ratios and resolutions are unioned rather than intersected: a value one
 * model cannot produce is mapped to its nearest supported one at request time
 * (see `resolveAspectRatio` / `resolveResolution`), so offering it costs nothing
 * and hiding it would needlessly restrict the models that do support it.
 * Per-model switches (seed, quality, …) are only offered when every selected
 * model honours them, since there is no sensible fallback for those.
 */
export function getCombinedCapabilities(modelIds: string[]): {
  aspectRatios: FalAspectRatio[]
  resolutions: FalResolution[]
  maxImagesPerRequest: number
  minReferenceLimit: number
  supportsSeed: boolean
  supportsBackground: boolean
  supportsInputFidelity: boolean
  supportsCustomImageSize: boolean
  supportsOutputCompression: boolean
  qualities: GptImageQuality[] | null
  notes: string[]
} {
  const models = (modelIds.length > 0 ? modelIds : [DEFAULT_MODEL]).map(getModel)

  const ratioOrder = GEMINI_RATIOS_FULL
  const resOrder: FalResolution[] = ['0.5K', '1K', '2K', '4K']

  const ratios = new Set<FalAspectRatio>()
  const resolutions = new Set<FalResolution>()
  for (const model of models) {
    for (const r of model.uiAspectRatios) ratios.add(r)
    for (const r of model.uiResolutions) resolutions.add(r)
  }

  const notes: string[] = []
  for (const model of models) {
    if (model.fixedOutputNote) notes.push(`${model.name}: ${model.fixedOutputNote}`)
  }

  // Quality only applies when every selected model has the field, and then
  // only for the tiers all selected models accept.
  const qualityModels = models.filter((m) => m.qualities)
  const allTiers: GptImageQuality[] = ['auto', 'low', 'medium', 'high', 'xhigh', 'max']
  const qualities =
    qualityModels.length === models.length && qualityModels.length > 0
      ? allTiers.filter((q) => qualityModels.every((m) => m.qualities!.includes(q)))
      : null

  return {
    aspectRatios: ratioOrder.filter((r) => ratios.has(r)),
    resolutions: resOrder.filter((r) => resolutions.has(r)),
    maxImagesPerRequest: Math.min(...models.map((m) => m.maxImagesPerRequest)),
    minReferenceLimit: Math.min(...models.map((m) => m.maxReferenceImages)),
    supportsSeed: models.every((m) => m.supportsSeed),
    supportsBackground: models.every((m) => m.supportsBackground),
    supportsInputFidelity: models.every((m) => m.supportsInputFidelity),
    supportsCustomImageSize: models.every((m) => m.imageSizeMode === 'pixels'),
    supportsOutputCompression: models.every((m) => m.supportsOutputCompression === true),
    qualities,
    notes,
  }
}

export interface CostEstimateInput {
  /** Requested resolution tier; clamped to what the model offers. */
  resolution?: string
  /** GPT Image 2.5 quality tier. `auto` is estimated using high; actual usage can differ. */
  quality?: string
  /** Explicit output size, when the caller already resolved one. */
  imageSize?: { width: number; height: number }
  aspectRatio?: string
  webSearch?: boolean
  thinkingLevel?: string
  /** Number of images; the per-image price is simply multiplied. */
  count?: number
}

/**
 * Estimate what a request costs, in USD.
 *
 * This is arithmetic over the published list prices in `AVAILABLE_MODELS` —
 * fal.ai returns no billing data with a generation, so there is nothing to read
 * back. Treat every number it produces as an estimate.
 */
export function estimateImageCost(modelId: string, opts: CostEstimateInput = {}): number {
  const model = getModel(modelId)
  const pricing = model.pricing
  const count = opts.count ?? 1

  let perImage = 0

  if (pricing.sizeTiers) {
    const size =
      (opts.imageSize ? normalizeGptImageSize(opts.imageSize) : undefined) ??
      (() => {
        // A size-enum model bills by the fixed size the ratio maps onto — it
        // has no resolution axis, so deriving pixels from one would be wrong.
        if (model.imageSizeMode === 'size-enum') {
          return parseImageSizeLabel(toFixedImageSize(model, opts.aspectRatio ?? '1:1'))
        }
        const derived = toGptImageSize(
          opts.aspectRatio ?? '1:1',
          opts.resolution ?? model.defaultResolution ?? '1K'
        )
        return derived === 'auto' ? { width: 1024, height: 1024 } : derived
      })() ?? { width: 1024, height: 1024 }
    const pixels = size.width * size.height

    let tier = pricing.sizeTiers[0]
    let bestDelta = Infinity
    for (const candidate of pricing.sizeTiers) {
      const delta = Math.abs(candidate.pixels - pixels)
      if (delta < bestDelta) {
        bestDelta = delta
        tier = candidate
      }
    }

    const quality = ['low', 'medium', 'high', 'xhigh', 'max'].includes(opts.quality ?? '') ? opts.quality as Exclude<GptImageQuality, 'auto'> : 'high'
    perImage = tier[quality] ?? tier.high
  } else {
    const base = pricing.perImage ?? 0
    const tier = resolveResolution(model, opts.resolution ?? model.defaultResolution ?? '1K')
    const multiplier = tier ? (pricing.resolutionMultiplier?.[tier as FalResolution] ?? 1) : 1
    perImage = base * multiplier
  }

  let total = perImage * count

  // Surcharges are billed per request, not per image.
  if (opts.webSearch && pricing.webSearchSurcharge) total += pricing.webSearchSurcharge
  if (opts.thinkingLevel === 'high' && pricing.highThinkingSurcharge) {
    total += pricing.highThinkingSurcharge
  }

  return total
}

/** "$0.0483" below a cent, "$0.158" above — enough digits to stay meaningful. */
export function formatCost(usd: number): string {
  if (usd <= 0) return '$0'
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(3)}`
}

/** "16:9" → 1.777…; returns null for `auto` and unparseable input. */
export function parseRatio(ratio: string): number | null {
  if (!ratio || ratio === 'auto') return null
  const parts = ratio.split(':').map(Number)
  if (parts.length !== 2) return null
  const [w, h] = parts
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null
  return w / h
}

/** "1536x1024" -> { width: 1536, height: 1024 }; null when unparseable. */
export function parseImageSizeLabel(label: string): { width: number; height: number } | null {
  const [w, h] = label.split('x').map(Number)
  if (!w || !h) return null
  return { width: w, height: h }
}

/**
 * Pick the `image_size` string a `size-enum` model will accept.
 *
 * GPT Image 1.5 offers three sizes and rejects everything else, so a requested
 * ratio is mapped onto the closest one it has rather than refused — the same
 * rule `resolveAspectRatio` follows for the models that do take a ratio.
 */
export function toFixedImageSize(model: ImageModelOption, requestedRatio: string): string {
  const sizes = model.fixedImageSizes
  if (!sizes || sizes.length === 0) return model.defaultImageSize ?? '1024x1024'

  const target = parseRatio(requestedRatio)
  if (target == null) return model.defaultImageSize ?? sizes[0]

  let best = model.defaultImageSize ?? sizes[0]
  let bestDelta = Infinity
  for (const label of sizes) {
    const size = parseImageSizeLabel(label)
    if (!size) continue
    const delta = Math.abs(Math.log(size.width / size.height) - Math.log(target))
    if (delta < bestDelta) {
      bestDelta = delta
      best = label
    }
  }
  return best
}

/**
 * Translate an aspect ratio + resolution into a GPT Image 2.5 `image_size`.
 * fal.ai requires both dimensions to be multiples of 16, max edge 3840,
 * aspect ratio <= 3:1, and 655,360–8,294,400 total pixels.
 */
export function toGptImageSize(
  aspectRatio: string,
  resolution: string
): { width: number; height: number } | 'auto' {
  const ratio = parseRatio(aspectRatio)
  if (ratio == null) return 'auto'

  // GPT Image 2.5 rejects anything past 3:1 in either direction.
  const clamped = Math.min(3, Math.max(1 / 3, ratio))

  const targetPixels =
    resolution === '4K' ? 8_100_000 : resolution === '2K' ? 3_500_000 : 1_100_000

  let height = Math.sqrt(targetPixels / clamped)
  let width = height * clamped

  const scaleDown = Math.min(1, 3840 / Math.max(width, height))
  width *= scaleDown
  height *= scaleDown

  const round16 = (n: number) => Math.max(16, Math.round(n / 16) * 16)
  let w = round16(width)
  let h = round16(height)

  // Rounding can push the total outside the accepted pixel window.
  const total = w * h
  if (total < 655_360) {
    const scale = Math.sqrt(700_000 / total)
    w = round16(w * scale)
    h = round16(h * scale)
  } else if (total > 8_294_400) {
    const scale = Math.sqrt(8_000_000 / total)
    w = round16(w * scale)
    h = round16(h * scale)
  }

  // Keep extreme ratios valid after rounding either edge.
  if (w > h * 3) h = Math.ceil(w / 3 / 16) * 16
  if (h > w * 3) w = Math.ceil(h / 3 / 16) * 16
  return normalizeGptImageSize({ width: w, height: h })
}
