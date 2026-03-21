/**
 * Compresses a base64 image to JPEG 75% quality, max 1000x1000px.
 * Used for all image uploads (collections, references, etc.)
 */
export async function compressImage(base64DataUrl: string): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = base64DataUrl
  })

  const maxSize = 1000
  let { width, height } = img

  if (width > maxSize || height > maxSize) {
    const ratio = Math.min(maxSize / width, maxSize / height)
    width = Math.round(width * ratio)
    height = Math.round(height * ratio)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', 0.75)
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
