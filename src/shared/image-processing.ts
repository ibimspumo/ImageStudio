/** Dedicated fal.ai restoration services. Prices are list estimates, never billed totals. */
export type ImageProcessingOperation = 'upscale' | 'remove_background'
export const PRECISION_MODELS = ['Standard V2', 'High Fidelity V3', 'High Fidelity V2', 'Low Resolution V2', 'CGI', 'Text Refine'] as const
export const SUBJECT_DETECTIONS = ['All', 'Foreground', 'Background'] as const
export interface ImageProcessingOptions {
  model?: 'precision' | 'transparent'
  scale?: number
  outputFormat?: 'png' | 'jpeg'
  cropToFill?: boolean
  precisionModel?: (typeof PRECISION_MODELS)[number]
  subjectDetection?: (typeof SUBJECT_DETECTIONS)[number]
  faceEnhancement?: boolean
  faceEnhancementCreativity?: number
  faceEnhancementStrength?: number
  sharpen?: number
  denoise?: number
  fixCompression?: number
  strength?: number
}
export interface ImageProcessingSpec {
  operation: ImageProcessingOperation
  sourceWidth: number
  sourceHeight: number
  sourceHasAlpha?: boolean
  options?: ImageProcessingOptions
}
export interface ImageProcessingRequest extends ImageProcessingSpec {
  /** Original, full-resolution image. Never pass a JPEG reference thumbnail. */
  sourceImage?: string
  /** Original file path for native streaming without base64 IPC or Canvas limits. */
  sourceFilePath?: string
}
export const IMAGE_PROCESSING_INPUT_FORMATS = ['image/png', 'image/jpeg', 'image/webp'] as const
export const IMAGE_PROCESSING_LIMITS = { maxOutputPixels: null, maxOutputEdge: null, repeatedUpscale: true, source: 'No additional ImageStudio pixel limit. fal publishes only per-pass scale limits, not an unlimited output guarantee. Provider resource limits may still apply.', providerDocumentation: 'https://fal.ai/models/topaz/upscale/image/precision/api' } as const
export const IMAGE_PROCESSING_MODELS = [
  {
    id: 'topaz/upscale/image/precision', key: 'precision', operation: 'upscale', name: 'Topaz Precision',
    description: 'Faithful restoration. App default High Fidelity V3; provider default Standard V2. Does not preserve alpha.',
    preservesAlpha: false, outputFormat: 'png',
    options: {
      scale: { type: 'number', minimum: 1, maximum: 4, default: 2 },
      outputFormat: { type: 'string', enum: ['png', 'jpeg'], default: 'png' },
      cropToFill: { type: 'boolean', default: false },
      precisionModel: { type: 'string', enum: PRECISION_MODELS, default: 'High Fidelity V3' },
      subjectDetection: { type: 'string', enum: SUBJECT_DETECTIONS, default: 'All' },
      faceEnhancement: { type: 'boolean', default: true },
      faceEnhancementCreativity: { type: 'number', minimum: 0, maximum: 1, default: 0 },
      faceEnhancementStrength: { type: 'number', minimum: 0, maximum: 1, default: 0.8 },
      sharpen: { type: 'number', minimum: 0, maximum: 1 },
      denoise: { type: 'number', minimum: 0, maximum: 1 },
      fixCompression: { type: 'number', minimum: 0, maximum: 1, unavailableFor: ['CGI'] },
      strength: { type: 'number', minimum: 0.01, maximum: 1, onlyFor: ['Text Refine'] },
    },
    pricing: { amount: 0.08, currency: 'USD', unit: 'started 24 output megapixels', outputMegapixelsPerUnit: 24, source: 'https://fal.ai/models/topaz/upscale/image/precision', checkedAt: '2026-09-08' },
  },
  {
    id: 'topaz/upscale/image/transparent', key: 'transparent', operation: 'upscale', name: 'Topaz Transparent',
    description: 'Preserves PNG alpha. Fixed 4x enlargement; no adjustable restoration options.',
    preservesAlpha: true, outputFormat: 'png', options: { scale: { type: 'number', enum: [4], default: 4 }, outputFormat: { type: 'string', enum: ['png'], default: 'png' } },
    pricing: { amount: 0.08, currency: 'USD', unit: 'started 24 output megapixels', outputMegapixelsPerUnit: 24, source: 'https://fal.ai/models/topaz/upscale/image/transparent', checkedAt: '2026-09-08' },
  },
  {
    id: 'fal-ai/bria/background/remove', key: 'bria', operation: 'remove_background', name: 'BRIA RMBG 2.0',
    description: 'Transparent PNG foreground cutout. Provider may resize output (documentation describes up to 1024x1024); actual returned dimensions are measured after download.',
    preservesAlpha: true, outputFormat: 'png', options: {},
    pricing: { amount: 0.018, currency: 'USD', unit: 'image', source: 'https://fal.ai/models/fal-ai/bria/background/remove', checkedAt: '2026-09-08' },
  },
] as const
export interface NormalizedImageProcessing {
  operation: ImageProcessingOperation
  modelId: string
  name: string
  options: ImageProcessingOptions
  width: number
  height: number
  hasAlpha: boolean
  estimatedCost: number
  outputFormat: 'png' | 'jpeg'
}
const precisionKeys = new Set(['model', ...Object.keys(IMAGE_PROCESSING_MODELS[0].options)])
function numberInRange(value: unknown, name: string, min: number, max: number): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${name} must be a number between ${min} and ${max}.`)
}
export function normalizeImageProcessing(spec: ImageProcessingSpec): NormalizedImageProcessing {
  if (!spec || !['upscale', 'remove_background'].includes(spec.operation)) throw new Error('operation must be upscale or remove_background.')
  for (const key of ['sourceWidth', 'sourceHeight'] as const) {
    if (!Number.isSafeInteger(spec[key]) || spec[key] < 1) throw new Error(`${key} must be a positive integer from the original image.`)
  }
  if (spec.sourceHasAlpha !== undefined && typeof spec.sourceHasAlpha !== 'boolean') throw new Error('sourceHasAlpha must be boolean.')
  if (spec.options != null && (typeof spec.options !== 'object' || Array.isArray(spec.options))) throw new Error('options must be an object.')
  const options = { ...spec.options }
  if (spec.operation === 'remove_background') {
    if (Object.keys(options).length) throw new Error('BRIA background removal does not accept upscale options.')
    return { operation: spec.operation, modelId: IMAGE_PROCESSING_MODELS[2].id, name: IMAGE_PROCESSING_MODELS[2].name, options: {}, outputFormat: 'png', width: spec.sourceWidth, height: spec.sourceHeight, hasAlpha: true, estimatedCost: IMAGE_PROCESSING_MODELS[2].pricing.amount }
  }
  const model = options.model ?? (spec.sourceHasAlpha ? 'transparent' : 'precision')
  if (model !== 'precision' && model !== 'transparent') throw new Error('model must be precision or transparent.')
  if (spec.sourceHasAlpha && model !== 'transparent') throw new Error('Use Topaz Transparent for images with alpha; Precision cannot preserve transparency.')
  options.model = model
  options.scale ??= IMAGE_PROCESSING_MODELS[model === 'transparent' ? 1 : 0].options.scale.default
  options.outputFormat ??= 'png'
  if (model === 'transparent') {
    if (Object.keys(options).some(key => !['model', 'scale', 'outputFormat'].includes(key))) throw new Error('Topaz Transparent accepts only model, fixed scale 4 and outputFormat png.')
    if (options.outputFormat !== 'png') throw new Error('Topaz Transparent requires PNG output to preserve alpha.')
    if (options.scale !== 4) throw new Error('Topaz Transparent supports only 4x upscaling.')
  } else {
    if (Object.keys(options).some(key => !precisionKeys.has(key))) throw new Error('Unsupported Topaz Precision option.')
    numberInRange(options.scale, 'scale', 1, 4)
    const defaults = IMAGE_PROCESSING_MODELS[0].options
    options.cropToFill ??= defaults.cropToFill.default
    if (typeof options.cropToFill !== 'boolean') throw new Error('cropToFill must be boolean.')
    if (!['png', 'jpeg'].includes(options.outputFormat)) throw new Error('outputFormat must be png or jpeg.')
    options.precisionModel ??= defaults.precisionModel.default
    options.subjectDetection ??= defaults.subjectDetection.default
    options.faceEnhancement ??= defaults.faceEnhancement.default
    options.faceEnhancementCreativity ??= defaults.faceEnhancementCreativity.default
    options.faceEnhancementStrength ??= defaults.faceEnhancementStrength.default
    if (!(PRECISION_MODELS as readonly string[]).includes(options.precisionModel)) throw new Error('Unsupported precisionModel.')
    if (!(SUBJECT_DETECTIONS as readonly string[]).includes(options.subjectDetection)) throw new Error('Unsupported subjectDetection.')
    if (typeof options.faceEnhancement !== 'boolean') throw new Error('faceEnhancement must be boolean.')
    for (const key of ['faceEnhancementCreativity', 'faceEnhancementStrength', 'sharpen', 'denoise', 'fixCompression', 'strength'] as const) {
      if (options[key] !== undefined) numberInRange(options[key], key, key === 'strength' ? 0.01 : 0, 1)
    }
    if (options.precisionModel === 'CGI' && options.fixCompression !== undefined) throw new Error('CGI does not support fixCompression.')
    if (options.precisionModel !== 'Text Refine' && options.strength !== undefined) throw new Error('strength is supported only by Text Refine.')
  }
  const width = Math.round(spec.sourceWidth * options.scale)
  const height = Math.round(spec.sourceHeight * options.scale)
  if (!Number.isSafeInteger(width * height)) throw new Error('Output dimensions exceed numeric precision. Choose a smaller scale.')
  const entry = IMAGE_PROCESSING_MODELS[model === 'transparent' ? 1 : 0]
  return { operation: spec.operation, modelId: entry.id, name: entry.name, options, outputFormat: options.outputFormat, width, height, hasAlpha: model === 'transparent', estimatedCost: Math.ceil(width * height / (entry.pricing.outputMegapixelsPerUnit * 1_000_000)) * entry.pricing.amount }
}
export function buildImageProcessingInput(spec: ImageProcessingSpec, imageUrl: string): { endpoint: string; input: Record<string, unknown>; normalized: NormalizedImageProcessing } {
  const normalized = normalizeImageProcessing(spec)
  const input: Record<string, unknown> = { image_url: imageUrl }
  if (spec.operation === 'remove_background') input.sync_mode = false
  else {
    input.output_format = normalized.outputFormat
    if (normalized.options.model === 'precision') {
      const map = { scale: 'upscale_factor', precisionModel: 'model', subjectDetection: 'subject_detection', faceEnhancement: 'face_enhancement', faceEnhancementCreativity: 'face_enhancement_creativity', faceEnhancementStrength: 'face_enhancement_strength', sharpen: 'sharpen', denoise: 'denoise', fixCompression: 'fix_compression', strength: 'strength' } as const
      for (const [key, field] of Object.entries(map)) {
        const value = normalized.options[key as keyof typeof map]
        if (value !== undefined) input[field] = value
      }
      input.crop_to_fill = normalized.options.cropToFill
    }
  }
  return { endpoint: normalized.modelId, input, normalized }
}
