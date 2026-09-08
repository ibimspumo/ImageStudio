import type { GenerateOptions } from '../hooks/useImageGeneration'
import type { GalleryImage } from '../stores/gallery-store'
import { AVAILABLE_MODELS, normalizeModelId, type LabeledAttachment } from '../types/api'
import { createAspectRatioCanvas, createZoomOutCanvas } from './image-utils'

export const ZOOM_LEVELS = [1.5, 2, 3, 4] as const
export const EDIT_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9'] as const
export async function readEditingImage(filePath: string): Promise<string> {
  if (filePath.startsWith('data:image/')) return filePath
  const result = await window.api.readImage(filePath)
  if (!result.success || !result.base64DataUrl) throw new Error(result.error || 'Failed to read image')
  return result.base64DataUrl
}

export type ImageTransform =
  | { operation: 'zoom_out'; factor: number }
  | { operation: 'aspect_ratio'; aspectRatio: string; model?: string }

/** Canonical edit request builder used by ImageViewer and the automation tool. */
export async function prepareImageTransform(image: GalleryImage, edit: ImageTransform): Promise<GenerateOptions> {
  if (image.type === 'video' || image.isLoading || image.error || !image.filePath) throw new Error('A completed image is required')
  const model = edit.operation === 'zoom_out' ? normalizeModelId(image.model)
    : edit.model ?? normalizeModelId(image.model)
  const spec = AVAILABLE_MODELS.find((m) => m.id === model)
  if (!spec) throw new Error(`Unknown model: ${model}`)
  if (edit.operation === 'zoom_out' && !ZOOM_LEVELS.includes(edit.factor as typeof ZOOM_LEVELS[number])) throw new Error('Zoom factor must be 1.5, 2, 3 or 4')
  if (edit.operation === 'aspect_ratio' && (!EDIT_ASPECT_RATIOS.includes(edit.aspectRatio as typeof EDIT_ASPECT_RATIOS[number]) || edit.aspectRatio === image.aspectRatio)) throw new Error('Choose a different supported aspect ratio')
  const original = await readEditingImage(image.filePath)
  let apiPrompt: string
  let prompt: string
  let groups: LabeledAttachment[]
  if (edit.operation === 'zoom_out') {
    const { canvas, reference } = await createZoomOutCanvas(original, edit.factor)
    apiPrompt = `I have placed the original image centered on a larger black canvas. Fill in the black/empty areas naturally, seamlessly extending the scene outward in all directions. Keep the original center image exactly as-is — do not alter, crop, or re-interpret it. Continue the environment, lighting, colors, perspective, and composition from the edges outward. Original description: "${image.prompt}"`
    prompt = `Zoom ${edit.factor}x: ${image.prompt}`
    groups = [
      { label: 'Canvas layout — fill the black areas around the centered image', images: [canvas] },
      { label: 'Original image (high quality reference)', images: [reference] },
    ]
  } else {
    const { canvas, reference } = await createAspectRatioCanvas(original, edit.aspectRatio)
    apiPrompt = `I have placed the original image centered on a larger canvas with ${edit.aspectRatio} aspect ratio. Fill in the black/empty areas naturally, seamlessly extending the scene outward. Keep the original image exactly as-is — do not alter, crop, or re-interpret it. Continue the environment, lighting, colors, perspective, and composition from the edges outward. Original description: "${image.prompt}"`
    prompt = `Aspect ${edit.aspectRatio}: ${image.prompt}`
    groups = [
      { label: `Canvas layout (${edit.aspectRatio}) — fill the black areas around the centered image`, images: [canvas] },
      { label: 'Original image (high quality reference)', images: [reference] },
    ]
  }
  return {
    prompt, apiPrompt, imageCount: 1, models: [model],
    aspectRatio: edit.operation === 'aspect_ratio' ? edit.aspectRatio : image.aspectRatio,
    resolution: image.resolution,
    attachments: [image.filePath], labeledAttachments: groups, workspaceId: image.workspaceId ?? null,
  }
}

export function cropReference(image: HTMLImageElement, rect: { x: number; y: number; width: number; height: number }): string {
  const { x, y, width, height } = rect
  if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width < 1 || height < 1 || x + width > image.naturalWidth || y + height > image.naturalHeight) throw new Error('Crop must fit inside the source image (coordinates are source pixels)')
  const outputScale = Math.min(1, 1000 / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * outputScale))
  canvas.height = Math.max(1, Math.round(height * outputScale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.drawImage(image, x, y, width, height, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.75)
}

export function loadEditingImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Failed to load image'))
    image.src = src
  })
}
