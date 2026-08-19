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

/** GPT Image 2 has no aspect_ratio/resolution — it takes image_size + quality. */
export type GptImageQuality = 'auto' | 'low' | 'medium' | 'high'

export type OutputFormat = 'png' | 'jpeg' | 'webp'

/**
 * `background` — GPT Image 1.5 only. `transparent` is the single route in the
 * whole registry to an image with a real alpha channel, and it only survives
 * when `output_format` is `png` or `webp`.
 */
export type FalBackground = 'auto' | 'transparent' | 'opaque'

/** `input_fidelity` — how literally the edit endpoint keeps the reference. */
export type FalInputFidelity = 'low' | 'high'

/**
 * How a model takes its output size.
 * - `aspect-ratio` — an `aspect_ratio` string plus a `resolution` tier (Gemini)
 * - `pixels` — an explicit `{ width, height }` object (GPT Image 2)
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
   * Models priced by exact output size and quality tier (GPT Image 2). The
   * nearest row by pixel count wins — fal snaps sizes to multiples of 16, so an
   * exact match is the exception.
   */
  sizeTiers?: { pixels: number; low: number; medium: number; high: number }[]
  /** Added once per request when web search runs. */
  webSearchSurcharge?: number
  /** Added once per request at `thinking_level: 'high'`. */
  highThinkingSurcharge?: number
  /** Shown next to the estimate so the number can be judged. */
  note: string
}

export interface ImageModelOption {
  /** Canonical model id — identical to the text-to-image endpoint id on fal.ai */
  id: string
  name: string
  provider: string
  /** Endpoint used when no reference images are attached */
  endpoint: string
  /** Endpoint used when reference images are attached */
  editEndpoint: string
  /**
   * Aspect ratios the endpoint accepts, or null when the model has no
   * `aspect_ratio` field (GPT Image 2 — it uses explicit pixel sizes).
   */
  aspectRatios: FalAspectRatio[] | null
  /** Output resolutions, or null when the model has a fixed output size. */
  resolutions: FalResolution[] | null
  /** Quality tiers (the two OpenAI models; GPT Image 1.5 has no `auto`). */
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
   * `background` — transparency. Only GPT Image 1.5 has it, which is the whole
   * reason logo mode exists.
   */
  supportsBackground: boolean
  /** `input_fidelity` — GPT Image 1.5 edit only. */
  supportsInputFidelity: boolean
  /**
   * Field name of the inpaint mask, or null when the model has none. The two
   * OpenAI endpoints disagree: GPT Image 2 takes `mask_url`, GPT Image 1.5
   * takes `mask_image_url`.
   */
  maskField: 'mask_url' | 'mask_image_url' | null
  defaultAspectRatio: FalAspectRatio | null
  defaultResolution: FalResolution | null
  defaultQuality: GptImageQuality | null
  /**
   * Aspect ratios the user can pick for this model. Usually identical to
   * `aspectRatios`, but GPT Image 2 has no `aspect_ratio` field and still
   * honours a ratio through an explicit `image_size` — so it offers the ratios
   * its pixel-size rules allow (up to 3:1).
   */
  uiAspectRatios: FalAspectRatio[]
  /**
   * Resolutions the user can pick. GPT Image 2 has no `resolution` field but
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

/**
 * The only three `image_size` values GPT Image 1.5 accepts, in the endpoint's
 * own spelling. They are 1:1, 3:2 and 2:3 — there is no resolution axis at all.
 */
const GPT_IMAGE_15_SIZES = ['1024x1024', '1536x1024', '1024x1536']

export const AVAILABLE_MODELS: ImageModelOption[] = [
  {
    id: 'openai/gpt-image-2',
    name: 'GPT Image 2',
    provider: 'OpenAI',
    endpoint: 'openai/gpt-image-2',
    editEndpoint: 'openai/gpt-image-2/edit',
    aspectRatios: null,
    resolutions: null,
    qualities: ['auto', 'low', 'medium', 'high'],
    imageSizeMode: 'pixels',
    fixedImageSizes: null,
    defaultImageSize: null,
    maxReferenceImages: 16,
    maxImagesPerRequest: 4,
    supportsSeed: false,
    supportsSystemPrompt: false,
    supportsWebSearch: false,
    supportsThinkingLevel: false,
    supportsSafetyTolerance: false,
    supportsNegativePrompt: false,
    supportsBackground: false,
    supportsInputFidelity: false,
    maskField: 'mask_url',
    defaultAspectRatio: null,
    defaultResolution: null,
    defaultQuality: 'high',
    // No aspect_ratio field — ratios become explicit pixel sizes, capped at 3:1.
    uiAspectRatios: GEMINI_RATIOS_STANDARD,
    uiResolutions: ['1K', '2K', '4K'],
    fixedOutputNote: 'Size derived from the aspect ratio; quality is tiered',
    pricing: {
      // fal's published table of canonical sizes; `auto` bills as `high`.
      sizeTiers: [
        { pixels: 1024 * 768, low: 0.005, medium: 0.037, high: 0.145 },
        { pixels: 1024 * 1024, low: 0.006, medium: 0.053, high: 0.211 },
        { pixels: 1024 * 1536, low: 0.005, medium: 0.042, high: 0.165 },
        { pixels: 1920 * 1080, low: 0.005, medium: 0.040, high: 0.158 },
        { pixels: 2560 * 1440, low: 0.007, medium: 0.056, high: 0.222 },
        { pixels: 3840 * 2160, low: 0.012, medium: 0.101, high: 0.401 },
      ],
      note: 'Token-based — depends on output size and quality tier',
    },
  },
  {
    id: 'fal-ai/gpt-image-1.5',
    name: 'GPT Image 1.5',
    provider: 'OpenAI',
    endpoint: 'fal-ai/gpt-image-1.5',
    editEndpoint: 'fal-ai/gpt-image-1.5/edit',
    // No aspect_ratio and no resolution field — three fixed sizes, nothing else.
    aspectRatios: null,
    resolutions: null,
    // `auto` is absent here; the endpoint only takes low / medium / high.
    qualities: ['low', 'medium', 'high'],
    imageSizeMode: 'size-enum',
    fixedImageSizes: GPT_IMAGE_15_SIZES,
    defaultImageSize: '1024x1024',
    // The schema states no upper bound on image_urls; OpenAI's own limit for
    // this model is 16, so that is what we enforce rather than letting the
    // request fail at the endpoint.
    maxReferenceImages: 16,
    maxImagesPerRequest: 4,
    supportsSeed: false,
    supportsSystemPrompt: false,
    supportsWebSearch: false,
    supportsThinkingLevel: false,
    supportsSafetyTolerance: false,
    supportsNegativePrompt: false,
    // The one model in the registry that can return a real alpha channel.
    supportsBackground: true,
    supportsInputFidelity: true,
    maskField: 'mask_image_url',
    defaultAspectRatio: null,
    defaultResolution: null,
    defaultQuality: 'high',
    // The three sizes expressed as ratios — anything else is mapped onto the
    // nearest of them, since the endpoint accepts nothing else.
    uiAspectRatios: ['1:1', '3:2', '2:3'],
    uiResolutions: [],
    fixedOutputNote: 'Fixed sizes: 1024x1024, 1536x1024, 1024x1536',
    pricing: {
      // Both non-square sizes have the same pixel count (1,572,864) and are
      // priced within $0.001 of each other, so one row covers them; the higher
      // (portrait) figures are used so the estimate never reads low.
      sizeTiers: [
        { pixels: 1024 * 1024, low: 0.009, medium: 0.034, high: 0.133 },
        { pixels: 1536 * 1024, low: 0.013, medium: 0.051, high: 0.200 },
      ],
      note: 'Token-based - $0.133 square / $0.20 landscape+portrait at high',
    },
  },
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
    maskField: null,
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
    maskField: null,
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
    maskField: null,
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

export const DEFAULT_MODEL = 'openai/gpt-image-2'

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

export const DEFAULT_THUMBNAIL_MODEL = 'openai/gpt-image-2'

/**
 * Models usable in logo mode.
 *
 * A logo without a transparent background is a picture of a logo, not a logo —
 * so the mode is defined by the capability, not by a hand-kept list. Today that
 * is GPT Image 1.5 alone; a future model with a `background` field joins on its
 * own.
 */
export function getLogoModels(): ImageModelOption[] {
  return AVAILABLE_MODELS.filter((m) => m.supportsBackground)
}

export function isLogoModel(modelId: string): boolean {
  return getLogoModels().some((m) => m.id === modelId)
}

export const DEFAULT_LOGO_MODEL = 'fal-ai/gpt-image-1.5'

/** Models the app used before it moved to fal.ai, mapped onto their replacement. */
const LEGACY_MODEL_IDS: Record<string, string> = {
  'google/gemini-3.1-flash-image-preview': 'fal-ai/nano-banana-2',
  'google/gemini-3.1-flash-lite-image': 'google/nano-banana-2-lite',
  'google/gemini-3-pro-image-preview': 'fal-ai/nano-banana-pro',
  'openai/gpt-5.4-image-2': 'openai/gpt-image-2',
  'openai/gpt-image-2 ': 'openai/gpt-image-2',
  'openai/gpt-5-image': 'openai/gpt-image-2',
  'openai/gpt-5-image-mini': 'openai/gpt-image-2',
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
  const known = AVAILABLE_MODELS.find((m) => m.id === modelId)
  if (known) return known.name
  // Historical images keep their original model id — show it rather than lying
  // about which model produced them.
  return modelId
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
  // only for the tiers all of them accept — GPT Image 2 has an `auto` tier
  // that GPT Image 1.5 would reject.
  const qualityModels = models.filter((m) => m.qualities)
  const allTiers: GptImageQuality[] = ['auto', 'low', 'medium', 'high']
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
    qualities,
    notes,
  }
}

export interface CostEstimateInput {
  /** Requested resolution tier; clamped to what the model offers. */
  resolution?: string
  /** GPT Image 2 quality tier. `auto` bills like `high`, which is fal's default. */
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
      opts.imageSize ??
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

    const quality = opts.quality === 'low' || opts.quality === 'medium' ? opts.quality : 'high'
    perImage = tier[quality]
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
  const [w, h] = ratio.split(':').map(Number)
  if (!w || !h) return null
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
 * Translate an aspect ratio + resolution into a GPT Image 2 `image_size`.
 * fal.ai requires both dimensions to be multiples of 16, max edge 3840,
 * aspect ratio <= 3:1, and 655,360–8,294,400 total pixels.
 */
export function toGptImageSize(
  aspectRatio: string,
  resolution: string
): { width: number; height: number } | 'auto' {
  const ratio = parseRatio(aspectRatio)
  if (ratio == null) return 'auto'

  // GPT Image 2 rejects anything past 3:1 in either direction.
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

  return { width: w, height: h }
}
