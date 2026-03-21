export type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '2:3' | '3:2' | '5:4' | '4:5' | '21:9' | 'custom'
export type Resolution = '1K' | '2K' | '4K'

export interface ModelOption {
  id: string
  name: string
  provider: string
}

export const AVAILABLE_MODELS: ModelOption[] = [
  { id: 'google/gemini-3-pro-image-preview', name: 'Nano Banana Pro', provider: 'Google' },
  { id: 'google/gemini-3.1-flash-image-preview', name: 'Nano Banana 2', provider: 'Google' },
  { id: 'sourceful/riverflow-v2-pro', name: 'Riverflow 2 Pro', provider: 'Sourceful' },
  { id: 'bytedance-seed/seedream-4.5', name: 'Seedream 4.5', provider: 'ByteDance' },
  { id: 'openai/gpt-5-image-mini', name: 'GPT 5 Image mini', provider: 'OpenAI' },
  { id: 'openai/gpt-5-image', name: 'GPT 5 Image', provider: 'OpenAI' },
  { id: 'black-forest-labs/flux.2-max', name: 'FLUX.2 Max', provider: 'Black Forest Labs' },
]

export function getModelName(modelId: string): string {
  return AVAILABLE_MODELS.find((m) => m.id === modelId)?.name || modelId
}

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
