import type { GalleryImage } from '../stores/gallery-store'
import type { GenerateOptions } from '../hooks/useImageGeneration'
import { IMAGE_PROCESSING_INPUT_FORMATS, normalizeImageProcessing, type ImageProcessingOperation, type ImageProcessingOptions } from '../../../shared/image-processing'
import { loadEditingImage, readEditingImage } from './image-editing'
import { getResolutionLabel } from './image-utils'

export type ImageProcessingEdit = ImageProcessingOptions & { operation: ImageProcessingOperation }
export interface ProcessingSourceInfo { width: number; height: number; hasAlpha: boolean }

/** Inspect real pixels, including imported PNG/WebP files with no gallery alpha metadata.
 * Tiles avoid allocating a second full-resolution RGBA buffer or missing tiny transparent edges.
 * The original image is never resampled or converted for the provider.
 */
export async function inspectProcessingPixels(dataUrl: string): Promise<ProcessingSourceInfo> {
  const image = await loadEditingImage(dataUrl)
  const width = image.naturalWidth, height = image.naturalHeight
  if (!width || !height) throw new Error('Das Bild hat keine lesbaren Abmessungen.')
  if (/^data:image\/jpe?g[;,]/i.test(dataUrl)) return { width, height, hasAlpha: false }
  const canvas = document.createElement('canvas')
  const tileSize = 512
  canvas.width = Math.min(tileSize, width)
  canvas.height = Math.min(tileSize, height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Bildtransparenz konnte nicht geprüft werden.')
  for (let y = 0; y < height; y += tileSize) {
    for (let x = 0; x < width; x += tileSize) {
      const w = Math.min(tileSize, width - x), h = Math.min(tileSize, height - y)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(image, x, y, w, h, 0, 0, w, h)
      const pixels = ctx.getImageData(0, 0, w, h).data
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] < 255) return { width, height, hasAlpha: true }
      }
    }
  }
  return { width, height, hasAlpha: false }
}

export async function inspectProcessingSource(image: GalleryImage): Promise<ProcessingSourceInfo> {
  if (image.type === 'video' || image.isLoading || image.error || !image.filePath) {
    throw new Error('Wähle ein fertig erstelltes oder importiertes Bild.')
  }
  if (!image.filePath.startsWith('data:')) return window.api.inspectProcessingImage(image.filePath)
  const dataUrl = await readEditingImage(image.filePath)
  const mime = dataUrl.slice(5, dataUrl.indexOf(';'))
  if (!(IMAGE_PROCESSING_INPUT_FORMATS as readonly string[]).includes(mime)) throw new Error('Upscale und Freistellen unterstützen PNG, JPEG und WebP. Exportiere andere Bildformate zuerst als PNG und importiere die Datei.')
  return inspectProcessingPixels(dataUrl)
}

/** UI and MCP share this read-only preparation; only generate() submits a paid job. */
export async function prepareImageProcessing(image: GalleryImage, edit: ImageProcessingEdit): Promise<GenerateOptions> {
  const source = await inspectProcessingSource(image)
  const { operation, ...options } = edit
  const spec = { operation, sourceWidth: source.width, sourceHeight: source.height, sourceHasAlpha: source.hasAlpha, options }
  const normalized = normalizeImageProcessing(spec)
  return {
    prompt: operation === 'upscale' ? `Upscale ${normalized.options.scale}× · ${image.prompt}` : `Hintergrund entfernt · ${image.prompt}`,
    models: [normalized.modelId], imageCount: 1,
    aspectRatio: `${source.width}:${source.height}`,
    resolution: getResolutionLabel(normalized.width, normalized.height),
    attachments: [image.filePath], parentImageId: image.id,
    workspaceId: image.workspaceId ?? null,
    projectId: image.projectId, thumbnailStyle: image.thumbnailStyle, thumbnailCompositing: image.thumbnailCompositing,
    isPrint: image.isPrint, printFormat: image.printFormat, printStyle: image.printStyle, printMetaPrompt: image.printMetaPrompt,
    faceFidelity: image.faceFidelity, isLogo: image.isLogo, logoStyle: image.logoStyle,
    outputFormat: normalized.outputFormat,
    imageProcessing: { ...spec, options: normalized.options },
  }
}
