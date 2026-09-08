import type { GenerateOptions } from '../hooks/useImageGeneration'
import { useGalleryStore, type GalleryImage } from '../stores/gallery-store'
import { useSettingsStore } from '../stores/settings-store'
import { useCropStore } from '../stores/crop-store'
import { AVAILABLE_MODELS, estimateImageCost } from '../types/api'
import {
  EDIT_ASPECT_RATIOS, ZOOM_LEVELS, prepareImageTransform, readEditingImage,
  cropReference, loadEditingImage,
} from '../lib/image-editing'
import { prepareImageProcessing, inspectProcessingSource, type ImageProcessingEdit } from '../lib/image-processing'
import { IMAGE_PROCESSING_MODELS, IMAGE_PROCESSING_INPUT_FORMATS, IMAGE_PROCESSING_LIMITS, normalizeImageProcessing, type ImageProcessingOptions } from '../../../shared/image-processing'
import { convertImage, renderThumbnailExport, type ExportFormat } from '../lib/image-export'
import { object, str, choice, integer, bool, type Schema } from './schema'
import { mcpImage, requireItem, requireKey, type RegisterTool } from './tools'

const imageIdSchema = str('Completed gallery image ID; use list_images to discover IDs')
const modelsSchema = choice(AVAILABLE_MODELS.map(m => m.id))
const processingFields: Record<string, Schema> = {
  model: choice(IMAGE_PROCESSING_MODELS.filter(model => model.operation === 'upscale').map(model => model.key), 'Omit for automatic selection: Precision for opaque images, Transparent for alpha. Never use a generative image model here.'),
  ...IMAGE_PROCESSING_MODELS[0].options,
}
const coordinate: Schema = { type: 'number', minimum: 0, maximum: 65536 }
const positiveDimension: Schema = { type: 'number', minimum: 1, maximum: 65536 }

function sourceImage(imageId: string): GalleryImage {
  const image = requireItem(useGalleryStore.getState().images, imageId, 'Image')
  if (image.type === 'video' || image.isLoading || image.error || !image.filePath) throw new Error('A completed image is required')
  return image
}
function started(generate: (options: GenerateOptions) => string[], options: GenerateOptions) {
  requireKey()
  const jobIds = generate(options)
  if (!jobIds.length) throw new Error('Image generation did not start')
  return { jobIds, status: 'running', currency: 'USD', estimateOnly: true, estimatedCostUsd: options.imageProcessing ? normalizeImageProcessing(options.imageProcessing).estimatedCost : options.models.reduce((sum, modelId) => sum + estimateImageCost(modelId, { resolution: options.resolution, aspectRatio: options.aspectRatio, quality: options.quality, count: options.imageCount }), 0), message: 'Generation runs in the app. Poll get_status for duration, progress, completion and cost provenance; read_image displays the finished result, image_export exports PNG. Source media is retained.' }
}

async function saveDerived(dataUrl: string, extension: string): Promise<string> {
  const result = await window.api.saveImage(dataUrl, `edit-${crypto.randomUUID()}.${extension}`)
  if (!result.success || !result.filePath) throw new Error(result.error || 'Failed to save prepared image')
  return result.filePath
}

export function registerImageEditingTools(register: RegisterTool, generate: (options: GenerateOptions) => string[]): void {
  register<{ imageId: string }>('image_edit_options', 'Inspect source dimensions and the exact ImageViewer transformation options. Edits share the UI job pipeline, status, costs and destination folder. Dedicated processing models/defaults/constraints are included.', object({ imageId: imageIdSchema }, ['imageId']), async ({ imageId }) => {
    const source = sourceImage(imageId)
    const info = await inspectProcessingSource(source)
    let upscaleDefault: ReturnType<typeof normalizeImageProcessing> | null = null
    let upscaleUnavailableReason: string | undefined
    try { upscaleDefault = normalizeImageProcessing({ operation: 'upscale', sourceWidth: info.width, sourceHeight: info.height, sourceHasAlpha: info.hasAlpha }) }
    catch (error) { upscaleUnavailableReason = error instanceof Error ? error.message : 'Output exceeds app limits; choose a smaller scale.' }
    return { imageId, ...info, zoomFactors: ZOOM_LEVELS,
      imageProcessing: { models: IMAGE_PROCESSING_MODELS, inputMimeTypes: IMAGE_PROCESSING_INPUT_FORMATS, limits: IMAGE_PROCESSING_LIMITS, upscaleDefault, upscaleUnavailableReason, currency: 'USD', estimateOnly: true,
        previewTool: 'preview_image_processing', note: 'All processing uploads the original file without prompt, reference compression or browser upscaling. Default PNG remains lossless, including when anti-detection is enabled; Precision optionally outputs JPEG. No additional app pixel cap; repeated upscaling is allowed. Removal output dimensions are read from the actual result.' },
      aspectRatios: EDIT_ASPECT_RATIOS.filter(r => r !== source.aspectRatio), aspectRatioModels: AVAILABLE_MODELS.map(m => m.id), crop: { coordinates: 'source pixels', maxOutputDimension: 1000, format: 'jpeg', quality: 75 }, export: { formats: ['png', 'jpeg', 'webp'], qualityRange: [10, 100], defaultQuality: 92, metadataEnabled: !useSettingsStore.getState().antiDetection }, thumbnailExport: { width: 1920, height: 1080, format: 'jpeg', targetMaxBytes: 2_000_000 } }
  }, true)

  register<{ imageId: string; factor: number }>('image_zoom_out', 'Outpaint an existing image at 1.5×, 2×, 3× or 4× using the exact ImageViewer canvas and prompt. Starts a paid generation and returns gallery IDs.', object({ imageId: imageIdSchema, factor: { type: 'number', enum: ZOOM_LEVELS } }, ['imageId', 'factor']), async ({ imageId, factor }) => {
    requireKey()
    return started(generate, await prepareImageTransform(sourceImage(imageId), { operation: 'zoom_out', factor }))
  })
  register<{ imageId: string } & ImageProcessingEdit>('preview_image_processing', 'Read-only preview of dedicated Upscale or Background Remove using original source pixels: resolved model/defaults, alpha, expected dimensions and USD list estimate. No paid call or upload. Options are the same as image_upscale; for remove_background omit all upscale options. BRIA output dimensions can differ; completed metadata uses actual pixels.', object({ imageId: imageIdSchema, operation: choice(['upscale', 'remove_background']), ...processingFields }, ['imageId', 'operation']), async ({ imageId, ...edit }) => {
    const options = await prepareImageProcessing(sourceImage(imageId), edit)
    return { imageId, ...normalizeImageProcessing(options.imageProcessing!), source: { width: options.imageProcessing!.sourceWidth, height: options.imageProcessing!.sourceHeight, hasAlpha: options.imageProcessing!.sourceHasAlpha }, currency: 'USD', estimateOnly: true, outputFormat: options.outputFormat }
  }, true)
  register<{ imageId: string } & ImageProcessingOptions>('image_upscale', 'Upscale a completed/imported image with dedicated Topaz models, without a prompt. Starts one paid job and immediately returns its gallery job ID. Omit model for automatic Precision (opaque, 2x High Fidelity V3) or Transparent (alpha, fixed 4x). Precision options/ranges come from image_edit_options; CGI disallows fixCompression, strength requires Text Refine. Default PNG (Precision optionally JPEG), original retained, folder/project/logo context preserved. Use preview_image_processing for cost/dimensions first; get_status/read_image/image_export for results. Former resolution and generative-model arguments are retired.', object({ imageId: imageIdSchema, ...processingFields }, ['imageId']), async ({ imageId, ...options }) => {
    requireKey()
    return started(generate, await prepareImageProcessing(sourceImage(imageId), { operation: 'upscale', ...options }))
  })
  register<{ imageId: string }>('image_remove_background', `Remove the background from a completed/imported image with BRIA RMBG 2.0 on fal.ai. Starts one paid job ($${IMAGE_PROCESSING_MODELS[2].pricing.amount}/image list estimate) and immediately returns its gallery job ID. No prompt or quality options. Saves a new transparent PNG alongside the original in the same folder/project. Poll get_status, view read_image, export image_export. Preview dimensions/cost with preview_image_processing; actual result dimensions are recorded on completion.`, object({ imageId: imageIdSchema }, ['imageId']), async ({ imageId }) => {
    requireKey()
    return started(generate, await prepareImageProcessing(sourceImage(imageId), { operation: 'remove_background' }))
  })
  register<{ imageId: string; aspectRatio: string; model?: string }>('image_change_aspect_ratio', 'Extend a source image to a different aspect ratio using the exact ImageViewer canvas and outpainting prompt. Starts a paid generation.', object({ imageId: imageIdSchema, aspectRatio: choice(EDIT_ASPECT_RATIOS), model: modelsSchema }, ['imageId', 'aspectRatio']), async ({ imageId, aspectRatio, model }) => {
    requireKey()
    return started(generate, await prepareImageTransform(sourceImage(imageId), { operation: 'aspect_ratio', aspectRatio, model }))
  })

  register<{ imageId: string; x: number; y: number; width: number; height: number; useAsReference?: boolean }>('image_crop', 'Crop in original image pixels using the UI Crop as Reference implementation (JPEG 75%, longest side up to 1000px). Returns the crop as native MCP image plus a saved path; optionally attaches it to the UI prompt. To use its saved path in a new automated generation, import_media first and use that ID as a reference.', object({ imageId: imageIdSchema, x: coordinate, y: coordinate, width: positiveDimension, height: positiveDimension, useAsReference: bool }, ['imageId', 'x', 'y', 'width', 'height']), async args => {
    const source = sourceImage(args.imageId)
    const image = await loadEditingImage(await readEditingImage(source.filePath))
    const dataUrl = cropReference(image, args)
    const filePath = await saveDerived(dataUrl, 'jpg')
    if (args.useAsReference) useCropStore.getState().addPendingRef(dataUrl, source.id)
    return mcpImage(dataUrl, { sourceImageId: source.id, filePath, attachedToPrompt: !!args.useAsReference, mimeType: 'image/jpeg' })
  })

  register<{ imageId: string; format?: ExportFormat; quality?: number; embedMetadata?: boolean; thumbnail?: boolean; destination?: string; overwrite?: boolean }>('image_export', 'Export an image with the same PNG/JPEG/WebP conversion, JPEG white background, quality and metadata controls as the UI. thumbnail=true uses the exact 1920×1080 YouTube render and adaptive quality. With destination saves there; without it returns a prepared file path for later export_media/read_media. Anti-detection disables metadata just as in the UI.', object({ imageId: imageIdSchema, format: choice(['png', 'jpeg', 'webp']), quality: integer(10, 100), embedMetadata: bool, thumbnail: bool, destination: str('Absolute output file path with extension matching selected format'), overwrite: bool }, ['imageId']), async args => {
    const source = sourceImage(args.imageId)
    const format = args.thumbnail ? 'jpeg' : args.format ?? 'png'
    if (args.thumbnail && (args.format || args.quality !== undefined || args.embedMetadata)) throw new Error('Thumbnail export uses its own JPEG quality and no metadata; omit format, quality and embedMetadata')
    const native = !args.thumbnail && !source.filePath.startsWith('data:')
      ? await window.api.prepareImageFileExport({ filePath: source.filePath, format, quality: args.quality ?? 92 }) : null
    const original = native ? undefined : await readEditingImage(source.filePath)
    const rendered = args.thumbnail ? await renderThumbnailExport(original!) : null
    const converted = native ? null : rendered ? { dataUrl: rendered.dataUrl, sizeBytes: rendered.bytes } : await convertImage(original!, format, args.quality ?? 92)
    const extension = format === 'jpeg' ? 'jpg' : format
    if (args.destination) {
      const supplied = args.destination.split('.').pop()?.toLowerCase()
      if (!(format === 'jpeg' ? ['jpg', 'jpeg'] : [format]).includes(supplied ?? '')) throw new Error(`Destination extension must match ${format}`)
    }
    const filePath = native?.filePath ?? await saveDerived(converted!.dataUrl, extension)
    const metadata = !args.thumbnail && args.embedMetadata !== false && !useSettingsStore.getState().antiDetection ? {
      prompt: source.prompt, model: source.model, aspectRatio: source.aspectRatio, resolution: source.resolution,
      ...(source.seed != null ? { seed: String(source.seed) } : {}), ...(source.negativePrompt ? { negativePrompt: source.negativePrompt } : {}), timestamp: new Date(source.timestamp).toISOString(),
    } : undefined
    const exported = args.destination ? await window.api.automationExportMedia({ filePath, destination: args.destination, overwrite: args.overwrite, metadata }) : undefined
    return { filePath: exported?.filePath ?? filePath, sizeBytes: exported?.size ?? native?.sizeBytes ?? converted!.sizeBytes, format, mimeType: `image/${format}`, metadata: metadata ?? null, metadataEmbedded: !!exported && !!metadata && format === 'png', ...(rendered ? { width: 1920, height: 1080, sourceWidth: rendered.sourceWidth, sourceHeight: rendered.sourceHeight, withinTargetSize: rendered.bytes <= 2_000_000 } : {}), ...(!args.destination && metadata ? { note: 'Requested metadata has not been embedded by this export preparation. Pass the returned metadata to export_media when writing the destination (PNG only, matching the UI).' } : {}) }
  })
}
