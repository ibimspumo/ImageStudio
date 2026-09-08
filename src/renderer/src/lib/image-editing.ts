import type { GenerateOptions } from '../hooks/useImageGeneration'
import type { GalleryImage } from '../stores/gallery-store'
import { AVAILABLE_MODELS, DEFAULT_MODEL, normalizeModelId, type LabeledAttachment } from '../types/api'
import { compressImage, createAspectRatioCanvas, createZoomOutCanvas, upscaleForApi } from './image-utils'

export const ZOOM_LEVELS = [1.5, 2, 3, 4] as const
export const EDIT_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9'] as const
export function upscaleTargets(image: Pick<GalleryImage, 'resolution'>): string[] {
  return image.resolution === '1K' ? ['2K', '4K'] : image.resolution === '2K' ? ['4K'] : []
}
export async function readEditingImage(filePath: string): Promise<string> {
  const result = await window.api.readImage(filePath)
  if (!result.success || !result.base64DataUrl) throw new Error(result.error || 'Failed to read image')
  return result.base64DataUrl
}

export type ImageTransform =
  | { operation: 'zoom_out'; factor: number }
  | { operation: 'upscale'; resolution: string; model?: string }
  | { operation: 'aspect_ratio'; aspectRatio: string; model?: string }

/** Canonical edit request builder used by ImageViewer and the automation tool. */
export async function prepareImageTransform(image: GalleryImage, edit: ImageTransform): Promise<GenerateOptions> {
  if (image.type === 'video' || image.isLoading || image.error || !image.filePath) throw new Error('A completed image is required')
  const model = edit.operation === 'zoom_out' ? normalizeModelId(image.model)
    : edit.model ?? (edit.operation === 'upscale' ? DEFAULT_MODEL : normalizeModelId(image.model))
  const spec = AVAILABLE_MODELS.find((m) => m.id === model)
  if (!spec) throw new Error(`Unknown model: ${model}`)
  if (edit.operation === 'zoom_out' && !ZOOM_LEVELS.includes(edit.factor as typeof ZOOM_LEVELS[number])) throw new Error('Zoom factor must be 1.5, 2, 3 or 4')
  if (edit.operation === 'aspect_ratio' && (!EDIT_ASPECT_RATIOS.includes(edit.aspectRatio as typeof EDIT_ASPECT_RATIOS[number]) || edit.aspectRatio === image.aspectRatio)) throw new Error('Choose a different supported aspect ratio')
  if (edit.operation === 'upscale' && (!upscaleTargets(image).includes(edit.resolution) || !spec.uiResolutions.includes(edit.resolution as never))) throw new Error('This image/model does not support the requested upscale target')
  const original = await readEditingImage(image.filePath)
  let apiPrompt: string
  let prompt: string
  let groups: LabeledAttachment[]
  if (edit.operation === 'upscale') {
    const upscaled = await upscaleForApi(original, edit.resolution === '4K' ? 2048 : 1024)
    const compressed = await compressImage(upscaled, 4096, 0.85)
    apiPrompt = `Recreate this exact image in higher resolution. Preserve every detail precisely — same composition, colors, lighting, textures, subjects, and style. Do not add, remove, or change anything. Simply produce a pixel-perfect higher-resolution version of this exact image. Original description: "${image.prompt}"`
    prompt = `Upscale to ${edit.resolution}: ${image.prompt}`
    groups = [{ label: 'Original image — recreate this exactly at higher resolution', images: [compressed] }]
  } else if (edit.operation === 'zoom_out') {
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
    resolution: edit.operation === 'upscale' ? edit.resolution : image.resolution,
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

/** Painted mask pixels (alpha > 10) become the exact green highlight used in the UI. */
export function createInpaintOverlay(image: HTMLImageElement, mask: CanvasImageSource, maskWidth: number, maskHeight: number): string {
  const w = image.naturalWidth, h = image.naturalHeight
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = w; maskCanvas.height = h
  const maskCtx = maskCanvas.getContext('2d')
  if (!ctx || !maskCtx) throw new Error('Canvas not supported')
  ctx.drawImage(image, 0, 0, w, h)
  maskCtx.drawImage(mask, 0, 0, maskWidth, maskHeight, 0, 0, w, h)
  const pixels = ctx.getImageData(0, 0, w, h)
  const md = maskCtx.getImageData(0, 0, w, h).data
  let painted = false
  for (let i = 0; i < md.length; i += 4) {
    if (md[i + 3] > 10) {
      painted = true
      pixels.data[i] = Math.round(pixels.data[i] * 0.5)
      pixels.data[i + 1] = Math.round(pixels.data[i + 1] * 0.5 + 127.5)
      pixels.data[i + 2] = Math.round(pixels.data[i + 2] * 0.5 + 50)
    }
  }
  if (!painted) throw new Error('Paint at least one region to inpaint')
  ctx.putImageData(pixels, 0, 0)
  return canvas.toDataURL('image/png')
}

export async function prepareInpaintReferences(original: string, overlay: string): Promise<LabeledAttachment[]> {
  const [compressedOriginal, compressedOverlay] = await Promise.all([compressImage(original, 2048, 0.85), compressImage(overlay, 2048, 0.85)])
  return [
    { label: 'Image with green highlight showing the region to edit — replace ONLY the green area', images: [compressedOverlay] },
    { label: 'Original image (clean, high quality reference) — preserve everything outside the highlighted region exactly', images: [compressedOriginal] },
  ]
}
export function buildInpaintPrompt(prompt: string, sourcePrompt: string, hasUserRefs: boolean): string {
  const refNote = hasUserRefs ? ' The user has also attached additional reference images — use them as visual guidance for what should appear in the edited region.' : ''
  return `Edit this image. The green-highlighted region should be replaced with: ${prompt}. Keep everything outside the green highlight exactly the same — same composition, lighting, colors, and details.${refNote} Original description of the source image: "${sourcePrompt}"`
}
