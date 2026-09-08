import type { GenerateOptions } from '../hooks/useImageGeneration'
import { useGalleryStore, type GalleryImage } from '../stores/gallery-store'
import { useSettingsStore } from '../stores/settings-store'
import { useCropStore } from '../stores/crop-store'
import { AVAILABLE_MODELS, estimateImageCost, normalizeModelId } from '../types/api'
import {
  EDIT_ASPECT_RATIOS, ZOOM_LEVELS, prepareImageTransform, readEditingImage,
  cropReference, loadEditingImage, createInpaintOverlay, prepareInpaintReferences,
  buildInpaintPrompt, upscaleTargets,
} from '../lib/image-editing'
import { convertImage, renderThumbnailExport, type ExportFormat } from '../lib/image-export'
import { object, str, choice, integer, array, bool, type Schema } from './schema'
import { imageData, mcpImage, prepareGeneration, requireItem, requireKey, type GenerationArgs, type RegisterTool } from './tools'

const imageIdSchema = str('Completed gallery image ID; use list_images to discover IDs')
const modelsSchema = choice(AVAILABLE_MODELS.map(m => m.id))
const coordinate: Schema = { type: 'number', minimum: 0, maximum: 65536 }
const positiveDimension: Schema = { type: 'number', minimum: 1, maximum: 65536 }
const pointSchema = object({ x: coordinate, y: coordinate }, ['x', 'y'])
const strokeSchema = object({
  brushSize: { type: 'number', minimum: 1, maximum: 4096, description: 'Round brush diameter in source image pixels. UI brush size is converted from displayed pixels.' },
  points: { ...array(pointSchema, 10000), minItems: 1 },
}, ['brushSize', 'points'])

function sourceImage(imageId: string): GalleryImage {
  const image = requireItem(useGalleryStore.getState().images, imageId, 'Image')
  if (image.type === 'video' || image.isLoading || image.error || !image.filePath) throw new Error('A completed image is required')
  return image
}
function started(generate: (options: GenerateOptions) => string[], options: GenerateOptions) {
  requireKey()
  const jobIds = generate(options)
  if (!jobIds.length) throw new Error('Image generation did not start')
  return { jobIds, status: 'running', currency: 'USD', estimateOnly: true, estimatedCostUsd: options.models.reduce((sum, modelId) => sum + estimateImageCost(modelId, { resolution: options.resolution, aspectRatio: options.aspectRatio, quality: options.quality, count: options.imageCount }), 0), message: 'Generation runs in the app. Poll get_status for duration, progress, completion and locally estimated cost; read_image displays a finished result.' }
}

async function saveDerived(dataUrl: string, extension: string): Promise<string> {
  const result = await window.api.saveImage(dataUrl, `edit-${crypto.randomUUID()}.${extension}`)
  if (!result.success || !result.filePath) throw new Error(result.error || 'Failed to save prepared image')
  return result.filePath
}

export function registerImageEditingTools(register: RegisterTool, generate: (options: GenerateOptions) => string[]): void {
  register<{ imageId: string }>('image_edit_options', 'Inspect source dimensions and the exact ImageViewer transformation options. All generation edits share the UI generation pipeline, status, costs and destination folder.', object({ imageId: imageIdSchema }, ['imageId']), async ({ imageId }) => {
    const source = sourceImage(imageId)
    const image = await loadEditingImage(await readEditingImage(source.filePath))
    return { imageId, width: image.naturalWidth, height: image.naturalHeight, zoomFactors: ZOOM_LEVELS, upscaleTargets: upscaleTargets(source), upscaleModels: AVAILABLE_MODELS.filter(m => m.uiResolutions.some(r => r === '2K' || r === '4K')).map(m => ({ id: m.id, resolutions: m.uiResolutions })), aspectRatios: EDIT_ASPECT_RATIOS.filter(r => r !== source.aspectRatio), aspectRatioModels: AVAILABLE_MODELS.map(m => m.id), crop: { coordinates: 'source pixels', maxOutputDimension: 1000, format: 'jpeg', quality: 75 }, inpaint: { mask: 'Transparent PNG alpha marks editable pixels; alternatively source-pixel brush strokes. Every unpainted region is preserved by the same prompt as UI inpaint.' }, export: { formats: ['png', 'jpeg', 'webp'], qualityRange: [10, 100], defaultQuality: 92, metadataEnabled: !useSettingsStore.getState().antiDetection }, thumbnailExport: { width: 1920, height: 1080, format: 'jpeg', targetMaxBytes: 2_000_000 } }
  }, true)

  register<{ imageId: string; factor: number }>('image_zoom_out', 'Outpaint an existing image at 1.5×, 2×, 3× or 4× using the exact ImageViewer canvas and prompt. Starts a paid generation and returns gallery IDs.', object({ imageId: imageIdSchema, factor: { type: 'number', enum: ZOOM_LEVELS } }, ['imageId', 'factor']), async ({ imageId, factor }) => {
    requireKey()
    return started(generate, await prepareImageTransform(sourceImage(imageId), { operation: 'zoom_out', factor }))
  })
  register<{ imageId: string; resolution: string; model?: string }>('image_upscale', 'AI upscale using the ImageViewer preservation prompt and pre-upscale logic. Choose a supported target from image_edit_options. Starts a paid generation.', object({ imageId: imageIdSchema, resolution: choice(['2K', '4K']), model: modelsSchema }, ['imageId', 'resolution']), async ({ imageId, resolution, model }) => {
    requireKey()
    return started(generate, await prepareImageTransform(sourceImage(imageId), { operation: 'upscale', resolution, model }))
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

  type InpaintArgs = GenerationArgs & { imageId: string; maskSource?: string; strokes?: { brushSize: number; points: { x: number; y: number }[] }[] }
  register<InpaintArgs>('image_inpaint', 'Edit painted regions with the exact UI green-overlay, reference packing and inpaint prompt. Supply exactly one of maskSource (transparent PNG; nontransparent alpha = edit) or strokes (source image pixel coordinates). Additional references, collections, presets and normal generation options work as in the inpaint PromptBar. Starts paid generations and returns gallery IDs.', object({
    imageId: imageIdSchema, prompt: { ...str(), minLength: 1 },
    maskSource: str('Transparent mask image as gallery ID or data:image/png;base64 URL. Painted alpha selects pixels; opaque backgrounds select the entire image.'),
    strokes: { ...array(strokeSchema, 200), minItems: 1 },
    models: { ...array(modelsSchema, 8), minItems: 1 },
    aspectRatio: { type: 'string', pattern: '^(auto|[1-9][0-9]{0,3}:[1-9][0-9]{0,3})$' },
    resolution: choice(['0.5K', '1K', '2K', '4K']), imageCount: integer(1, Math.max(...AVAILABLE_MODELS.map(model => model.maxImagesPerRequest))),
    quality: choice(['auto', 'low', 'medium', 'high']), seed: integer(0, 2147483647),
    references: array(str('Gallery image ID, data URL, or HTTPS URL'), 32), collectionIds: array(str(), 32),
    presetId: str('Omitted uses the active preset; empty disables'), workspaceId: str('Omitted uses the active folder, matching the inpaint UI; empty means unfiled'),
    background: choice(['auto', 'opaque', 'transparent']), outputFormat: choice(['png', 'jpeg', 'webp']), inputFidelity: choice(['low', 'high']),
  }, ['imageId', 'prompt']), async args => {
    requireKey()
    if (!!args.maskSource === !!args.strokes) throw new Error('Supply exactly one of maskSource or strokes')
    const source = sourceImage(args.imageId)
    const original = await readEditingImage(source.filePath)
    const image = await loadEditingImage(original)
    let mask: CanvasImageSource, width: number, height: number
    if (args.maskSource) {
      const maskImage = await loadEditingImage(await imageData(args.maskSource))
      mask = maskImage; width = maskImage.naturalWidth; height = maskImage.naturalHeight
      if (width !== image.naturalWidth || height !== image.naturalHeight) throw new Error('Mask dimensions must equal the source dimensions (see image_edit_options)')
    } else {
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas not supported')
      ctx.strokeStyle = 'rgba(255, 60, 60, 0.45)'; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      for (const stroke of args.strokes!) {
        ctx.lineWidth = stroke.brushSize
        ctx.beginPath()
        for (const [index, point] of stroke.points.entries()) {
          if (point.x > canvas.width || point.y > canvas.height) throw new Error('Brush points must be inside the source image')
          if (index === 0) ctx.moveTo(point.x, point.y)
          ctx.lineTo(point.x, point.y)
        }
        ctx.stroke()
      }
      mask = canvas; width = canvas.width; height = canvas.height
    }
    const overlay = createInpaintOverlay(image, mask, width, height)
    const options = await prepareGeneration({ ...args, mode: 'image', models: args.models ?? [normalizeModelId(source.model)] })
    const userGroups = options.labeledAttachments ?? []
    const groups = await prepareInpaintReferences(original, overlay)
    options.apiPrompt = buildInpaintPrompt(options.prompt, source.prompt, userGroups.length > 0)
    options.prompt = `Inpaint: ${args.prompt}`
    options.labeledAttachments = [...groups, ...userGroups]
    options.attachments = options.labeledAttachments.flatMap(group => group.images)
    options.inpaintSourceId = source.id
    return started(generate, options)
  })

  register<{ imageId: string; format?: ExportFormat; quality?: number; embedMetadata?: boolean; thumbnail?: boolean; destination?: string; overwrite?: boolean }>('image_export', 'Export an image with the same PNG/JPEG/WebP conversion, JPEG white background, quality and metadata controls as the UI. thumbnail=true uses the exact 1920×1080 YouTube render and adaptive quality. With destination saves there; without it returns a prepared file path for later export_media/read_media. Anti-detection disables metadata just as in the UI.', object({ imageId: imageIdSchema, format: choice(['png', 'jpeg', 'webp']), quality: integer(10, 100), embedMetadata: bool, thumbnail: bool, destination: str('Absolute output file path with extension matching selected format'), overwrite: bool }, ['imageId']), async args => {
    const source = sourceImage(args.imageId)
    const original = await readEditingImage(source.filePath)
    const format = args.thumbnail ? 'jpeg' : args.format ?? 'png'
    if (args.thumbnail && (args.format || args.quality !== undefined || args.embedMetadata)) throw new Error('Thumbnail export uses its own JPEG quality and no metadata; omit format, quality and embedMetadata')
    const rendered = args.thumbnail ? await renderThumbnailExport(original) : null
    const converted = rendered ? { dataUrl: rendered.dataUrl, sizeBytes: rendered.bytes } : await convertImage(original, format, args.quality ?? 92)
    const extension = format === 'jpeg' ? 'jpg' : format
    if (args.destination) {
      const supplied = args.destination.split('.').pop()?.toLowerCase()
      if (!(format === 'jpeg' ? ['jpg', 'jpeg'] : [format]).includes(supplied ?? '')) throw new Error(`Destination extension must match ${format}`)
    }
    const filePath = await saveDerived(converted.dataUrl, extension)
    const metadata = !args.thumbnail && args.embedMetadata !== false && !useSettingsStore.getState().antiDetection ? {
      prompt: source.prompt, model: source.model, aspectRatio: source.aspectRatio, resolution: source.resolution,
      ...(source.seed != null ? { seed: String(source.seed) } : {}), ...(source.negativePrompt ? { negativePrompt: source.negativePrompt } : {}), timestamp: new Date(source.timestamp).toISOString(),
    } : undefined
    const exported = args.destination ? await window.api.automationExportMedia({ filePath, destination: args.destination, overwrite: args.overwrite, metadata }) : undefined
    return { filePath: exported?.filePath ?? filePath, sizeBytes: exported?.size ?? converted.sizeBytes, format, mimeType: `image/${format}`, metadata: metadata ?? null, metadataEmbedded: !!exported && !!metadata && format === 'png', ...(rendered ? { width: 1920, height: 1080, sourceWidth: rendered.sourceWidth, sourceHeight: rendered.sourceHeight, withinTargetSize: rendered.bytes <= 2_000_000 } : {}), ...(!args.destination && metadata ? { note: 'Prepared image has no metadata yet. Pass the returned metadata to export_media when writing the destination (PNG only, matching the UI).' } : {}) }
  })
}
