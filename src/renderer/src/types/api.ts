export {
  AVAILABLE_MODELS,
  DEFAULT_MODEL,
  getModel,
  getModelName,
  normalizeModelId,
  resolveAspectRatio,
  resolveResolution,
  parseRatio,
  toGptImageSize,
  getCombinedCapabilities,
  getThumbnailModels,
  isThumbnailModel,
  DEFAULT_THUMBNAIL_MODEL,
  estimateImageCost,
  formatCost,
} from '../../../shared/image-models'

export {
  THUMBNAIL_STYLES,
  THUMBNAIL_ASPECT_RATIO,
  THUMBNAIL_RESOLUTION,
  THUMBNAIL_EXPORT_SIZE,
  THUMBNAIL_GPT_IMAGE_SIZE,
  buildThumbnailSystemPrompt,
} from '../../../shared/thumbnail-prompt'

export type { ThumbnailStyle, ThumbnailStyleOption } from '../../../shared/thumbnail-prompt'

export type {
  ImageModelOption,
  ImagePricing,
  CostEstimateInput,
  FalAspectRatio,
  FalResolution,
  GptImageQuality,
  OutputFormat,
} from '../../../shared/image-models'

/** UI-level aspect ratio; `custom` is resolved to a real ratio before the request. */
export type AspectRatio =
  | 'auto'
  | '1:1'
  | '16:9'
  | '9:16'
  | '4:3'
  | '3:4'
  | '2:3'
  | '3:2'
  | '5:4'
  | '4:5'
  | '21:9'
  | '4:1'
  | '1:4'
  | '8:1'
  | '1:8'
  | 'custom'

export type Resolution = '0.5K' | '1K' | '2K' | '4K'

export interface GenerationConfig {
  model: string
  aspectRatio: AspectRatio
  resolution: Resolution
  imageCount: number
}

/** A reference image attached by the user (crop, file upload, drag-drop) */
export interface ImageRef {
  id: string
  name: string
  base64: string
}

/** A group of labeled images sent to the AI for context */
export interface LabeledAttachment {
  label: string
  images: string[]
}

// ── Video Models (fal.ai) ──────────────────────────────────────────

export interface VideoModelOption {
  id: string
  name: string
  provider: string
  durations: number[]
  aspectRatios: string[]
  resolutions: string[]
  defaultDuration: number
  defaultResolution: string
  supportsEndFrame: boolean
  supportsAudio: boolean
  supportsNegativePrompt: boolean
  supportsCameraFixed: boolean
  /** Cost per second without audio (USD) */
  costPerSecond: number
  /** Cost per second with audio (USD) */
  costPerSecondAudio: number
}

export const AVAILABLE_VIDEO_MODELS: VideoModelOption[] = [
  {
    id: 'fal-ai/kling-video/v3/standard/image-to-video',
    name: 'Kling v3 Standard',
    provider: 'Kuaishou',
    durations: [5, 10],
    aspectRatios: ['16:9', '9:16', '1:1'],
    resolutions: ['720p', '1080p'],
    defaultDuration: 5,
    defaultResolution: '720p',
    supportsEndFrame: true,
    supportsAudio: true,
    supportsNegativePrompt: false,
    supportsCameraFixed: false,
    costPerSecond: 0.084,
    costPerSecondAudio: 0.126,
  },
  {
    id: 'fal-ai/kling-video/v3/pro/image-to-video',
    name: 'Kling v3 Pro',
    provider: 'Kuaishou',
    durations: [5, 10],
    aspectRatios: ['16:9', '9:16', '1:1'],
    resolutions: ['720p', '1080p'],
    defaultDuration: 5,
    defaultResolution: '720p',
    supportsEndFrame: true,
    supportsAudio: true,
    supportsNegativePrompt: true,
    supportsCameraFixed: false,
    costPerSecond: 0.112,
    costPerSecondAudio: 0.168,
  },
  {
    id: 'fal-ai/bytedance/seedance/v1.5/pro/image-to-video',
    name: 'Seedance 1.5 Pro',
    provider: 'ByteDance',
    durations: [4, 5, 6, 7, 8, 9, 10, 11, 12],
    aspectRatios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
    resolutions: ['480p', '720p'],
    defaultDuration: 5,
    defaultResolution: '720p',
    supportsEndFrame: true,
    supportsAudio: true,
    supportsNegativePrompt: false,
    supportsCameraFixed: true,
    costPerSecond: 0.052,
    costPerSecondAudio: 0.052,
  },
]

export const DEFAULT_VIDEO_MODEL = 'fal-ai/bytedance/seedance/v1.5/pro/image-to-video'

export function getVideoModelName(modelId: string): string {
  return AVAILABLE_VIDEO_MODELS.find((m) => m.id === modelId)?.name || modelId
}

/** Estimate video generation cost in USD */
export function estimateVideoCost(modelId: string, durationSec: number, withAudio: boolean): number {
  const model = AVAILABLE_VIDEO_MODELS.find((m) => m.id === modelId)
  if (!model) return 0
  const rate = withAudio ? model.costPerSecondAudio : model.costPerSecond
  return rate * durationSec
}
