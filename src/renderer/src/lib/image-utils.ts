/**
 * Compresses a base64 image to JPEG quality, with configurable max dimension.
 * Default: max 1000px, 75% quality. Used for all image uploads (collections, references, etc.)
 * For upscale, use a higher maxDimension to preserve source resolution.
 */
export async function compressImage(
  base64DataUrl: string,
  maxDimension: number = 1000,
  quality: number = 0.75
): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = base64DataUrl
  })

  let { width, height } = img

  if (width > maxDimension || height > maxDimension) {
    const ratio = Math.min(maxDimension / width, maxDimension / height)
    width = Math.round(width * ratio)
    height = Math.round(height * ratio)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', quality)
}

/**
 * Upscales an image to a minimum dimension using canvas (simple bilinear).
 * Used to pre-scale small images before sending to the API, because
 * Gemini tends to match output resolution to input resolution.
 *
 * @param base64DataUrl - Source image
 * @param minDimension - Minimum width/height the result should have
 * @returns Upscaled image as JPEG base64 (or original if already large enough)
 */
export async function upscaleForApi(
  base64DataUrl: string,
  minDimension: number
): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = base64DataUrl
  })

  // Already large enough
  if (img.width >= minDimension && img.height >= minDimension) {
    return base64DataUrl
  }

  // Scale up so the smallest side reaches minDimension
  const scale = Math.max(minDimension / img.width, minDimension / img.height)
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  // Enable image smoothing for better upscale quality
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)

  return canvas.toDataURL('image/jpeg', 0.92)
}

/**
 * Creates a zoom-out canvas: larger canvas with the original image centered,
 * surrounded by black. Both the canvas and a compressed reference of the
 * original are returned (both max 1000px, JPEG 75%).
 *
 * @param base64DataUrl - The original image as base64
 * @param factor - Zoom-out factor (e.g. 2 = canvas is 2x the image size)
 * @returns { canvas, reference } - canvas with image centered, reference = compressed original
 */
export async function createZoomOutCanvas(
  base64DataUrl: string,
  factor: number
): Promise<{ canvas: string; reference: string }> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = base64DataUrl
  })

  // Canvas at the zoomed-out size
  const canvasW = Math.round(img.width * factor)
  const canvasH = Math.round(img.height * factor)

  const canvas = document.createElement('canvas')
  canvas.width = canvasW
  canvas.height = canvasH
  const ctx = canvas.getContext('2d')!

  // Black background (the "empty" area the AI should fill)
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, canvasW, canvasH)

  // Center the original image
  const offsetX = Math.round((canvasW - img.width) / 2)
  const offsetY = Math.round((canvasH - img.height) / 2)
  ctx.drawImage(img, offsetX, offsetY)

  // Compress both to max 1000px JPEG
  const canvasCompressed = await compressImage(canvas.toDataURL('image/png'))
  const reference = await compressImage(base64DataUrl)

  return { canvas: canvasCompressed, reference }
}

/**
 * Creates an aspect-ratio-change canvas: a canvas with the target aspect ratio,
 * with the original image centered and fitted inside (preserving its content).
 * Empty areas are filled with black for the AI to extend.
 *
 * @param base64DataUrl - The original image as base64
 * @param targetRatio - Target aspect ratio string (e.g. "16:9", "1:1")
 * @returns { canvas, reference } - canvas with image centered in new ratio, reference = compressed original
 */
export async function createAspectRatioCanvas(
  base64DataUrl: string,
  targetRatio: string
): Promise<{ canvas: string; reference: string }> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = base64DataUrl
  })

  // Parse target ratio
  const [rw, rh] = targetRatio.split(':').map(Number)
  const targetAR = rw / rh
  const sourceAR = img.width / img.height

  let canvasW: number
  let canvasH: number

  if (targetAR > sourceAR) {
    // Target is wider — keep height, expand width
    canvasH = img.height
    canvasW = Math.round(img.height * targetAR)
  } else {
    // Target is taller — keep width, expand height
    canvasW = img.width
    canvasH = Math.round(img.width / targetAR)
  }

  const canvas = document.createElement('canvas')
  canvas.width = canvasW
  canvas.height = canvasH
  const ctx = canvas.getContext('2d')!

  // Black background (empty areas for AI to fill)
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, canvasW, canvasH)

  // Center the original image
  const offsetX = Math.round((canvasW - img.width) / 2)
  const offsetY = Math.round((canvasH - img.height) / 2)
  ctx.drawImage(img, offsetX, offsetY)

  // Compress both to max 1000px JPEG
  const canvasCompressed = await compressImage(canvas.toDataURL('image/png'))
  const reference = await compressImage(base64DataUrl)

  return { canvas: canvasCompressed, reference }
}

/**
 * Render an image to exactly 1920 x 1080 — the format YouTube ingests.
 *
 * No model hits that exactly: the Gemini endpoints return 2752 x 1536 (ratio
 * 1.792) and GPT Image 2 snaps to multiples of 16. So the source is centre-
 * cropped to 16:9 and scaled down, which keeps the composition and never
 * upscales.
 *
 * @returns JPEG data URL plus its byte size (YouTube rejects files over 2 MB).
 */
export async function renderYouTubeThumbnail(
  base64DataUrl: string,
  quality: number = 0.92
): Promise<{ dataUrl: string; bytes: number; sourceWidth: number; sourceHeight: number }> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = base64DataUrl
  })

  const W = 1920
  const H = 1080
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // Cover fit: fill the frame, crop the surplus edge evenly.
  const scale = Math.max(W / img.width, H / img.height)
  const drawW = img.width * scale
  const drawH = img.height * scale
  ctx.drawImage(img, (W - drawW) / 2, (H - drawH) / 2, drawW, drawH)

  const dataUrl = canvas.toDataURL('image/jpeg', quality)
  // base64 payload → bytes, minus padding
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const bytes = Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0)

  return { dataUrl, bytes, sourceWidth: img.width, sourceHeight: img.height }
}

/** Determines resolution label (1K/2K/4K) from actual image dimensions. */
export function getResolutionLabel(width: number, height: number): string {
  const maxDim = Math.max(width, height)
  if (maxDim >= 3072) return '4K'   // 4K threshold
  if (maxDim >= 1536) return '2K'   // 2K threshold
  return '1K'
}

/**
 * Read a collection's stored images (file paths or base64) as base64 data URLs.
 *
 * No size reduction happens here: how many references a model accepts differs
 * per model, so collaging is done later, per model, in `reference-packing.ts`.
 */
export async function collectionImagesAsBase64(images: string[]): Promise<string[]> {
  const results = await Promise.all(images.map(async (img) => {
    if (img.startsWith('data:')) return img
    try {
      const result = await window.api.readImage(img)
      return result.success && result.base64DataUrl ? result.base64DataUrl : null
    } catch {
      return null
    }
  }))
  return results.filter((img): img is string => img !== null)
}
