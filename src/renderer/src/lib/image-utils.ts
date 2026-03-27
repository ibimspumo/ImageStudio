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
 * Creates a grid composite from multiple base64 images.
 * @param images - Array of base64 data URL images
 * @param gridSize - Number of images per row/column (default 2 = 2x2 grid)
 * @returns A base64 data URL of the composited grid image
 */
export async function createGridComposite(
  images: string[],
  gridSize: number = 2
): Promise<string> {
  const cellCount = gridSize * gridSize
  const subset = images.slice(0, cellCount)

  // Load all images
  const loaded = await Promise.all(
    subset.map(
      (src) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image()
          img.onload = () => resolve(img)
          img.onerror = reject
          img.src = src
        })
    )
  )

  // Determine cell size: use the max dimension among all images, capped at 512
  const maxDim = Math.min(
    512,
    Math.max(...loaded.map((img) => Math.max(img.width, img.height)))
  )
  const cellSize = maxDim
  const canvasSize = cellSize * gridSize

  const canvas = document.createElement('canvas')
  canvas.width = canvasSize
  canvas.height = canvasSize
  const ctx = canvas.getContext('2d')!

  // Fill background
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvasSize, canvasSize)

  // Draw each image in its grid cell, centered/cropped
  loaded.forEach((img, i) => {
    const col = i % gridSize
    const row = Math.floor(i / gridSize)
    const x = col * cellSize
    const y = row * cellSize

    // Cover-fit: scale image to fill the cell
    const scale = Math.max(cellSize / img.width, cellSize / img.height)
    const sw = cellSize / scale
    const sh = cellSize / scale
    const sx = (img.width - sw) / 2
    const sy = (img.height - sh) / 2

    ctx.drawImage(img, sx, sy, sw, sh, x, y, cellSize, cellSize)
  })

  return canvas.toDataURL('image/png')
}

/**
 * Prepares collection images for API submission.
 * - <=5 images: send all individually
 * - >5 images: create 2x2 grid composites (max 5 composites = 20 images)
 */
/**
 * Determines resolution label (1K/2K/4K) from actual image dimensions.
 * Based on the max dimension of the image.
 */
export function getResolutionLabel(width: number, height: number): string {
  const maxDim = Math.max(width, height)
  if (maxDim >= 3072) return '4K'   // 4K threshold
  if (maxDim >= 1536) return '2K'   // 2K threshold
  return '1K'
}

export async function prepareCollectionImages(images: string[]): Promise<string[]> {
  // Convert file paths to base64 for API submission
  const asBase64 = await Promise.all(images.map(async (img) => {
    if (img.startsWith('data:')) return img // already base64
    try {
      const result = await window.api.readImage(img)
      return result.success ? result.base64DataUrl : img
    } catch {
      // File path that can't be read — return as-is for graceful degradation
      return img
    }
  }))

  if (asBase64.length <= 5) {
    return asBase64
  }

  // Create 2x2 grid composites
  const gridSize = 2
  const imagesPerGrid = gridSize * gridSize
  const maxComposites = 5
  const maxImages = maxComposites * imagesPerGrid

  const toProcess = asBase64.slice(0, maxImages)
  const composites: string[] = []

  for (let i = 0; i < toProcess.length; i += imagesPerGrid) {
    const chunk = toProcess.slice(i, i + imagesPerGrid)
    if (chunk.length > 0) {
      const composite = await createGridComposite(chunk, gridSize)
      composites.push(composite)
    }
  }

  return composites
}
