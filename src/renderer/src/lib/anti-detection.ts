/**
 * Post-processing that runs on every generated image before it lands on disk.
 *
 * Detectors for synthetic images key on the low-level statistics a generator
 * leaves behind: the periodic residue of the upsampling stack, a too-clean
 * frequency spectrum, PNG output that was never through a lossy encoder. The
 * three steps below touch every pixel of the image without visibly altering it:
 *
 *   1. JPEG at 95 % — quantises every 8x8 block, so no pixel keeps its exact
 *      generator value. Also drops any metadata the encoder would carry.
 *   2. Squeeze by 1 % on the X axis, then on the Y axis — each pass resamples
 *      along one axis, which redistributes the per-axis periodicity.
 *   3. Scale back to the original dimensions and re-encode as JPEG, so the
 *      result has the exact size that was generated.
 *
 * Videos never pass through here — this is images and thumbnails only.
 *
 * Images with a real alpha channel (logo mode) take the alternate route in
 * `reencodePreservingAlpha` — see the note there for why the pipeline above
 * cannot run on them.
 */
import { logger } from './logger'

/** How far the intermediate step squeezes each axis. */
const SQUEEZE = 0.99
/** Quality of both JPEG rounds — high enough to stay visually identical. */
const JPEG_QUALITY = 0.95
/** Below this the resample would cost real detail, so the geometry step is skipped. */
const MIN_DIMENSION = 64

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to decode image'))
    img.src = src
  })
}

/**
 * Draws a source onto a fresh canvas of the given size, resampling as needed.
 *
 * `opaque` fills white first, which every step of the JPEG pipeline needs —
 * JPEG has no alpha channel, so transparency would otherwise turn black. The
 * alpha-preserving path passes `false` and keeps the channel intact.
 */
function drawTo(
  source: CanvasImageSource,
  width: number,
  height: number,
  opaque = true
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  if (opaque) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
  }
  ctx.drawImage(source, 0, 0, width, height)
  return canvas
}

/**
 * Runs the full pipeline on a base64 image.
 *
 * @returns JPEG data URL with the same dimensions as the input.
 */
export async function scrubGeneratedImage(base64DataUrl: string): Promise<string> {
  const source = await loadImage(base64DataUrl)
  const width = source.naturalWidth
  const height = source.naturalHeight
  if (!width || !height) throw new Error('Image has no dimensions')

  // Step 1 — the JPEG round has to be decoded again, otherwise the
  // quantisation would never reach the pixels the later steps resample.
  const recompressed = await loadImage(drawTo(source, width, height).toDataURL('image/jpeg', JPEG_QUALITY))

  if (width < MIN_DIMENSION || height < MIN_DIMENSION) {
    return recompressed.src
  }

  // Step 2 — one axis at a time, so each pass is a genuine 1D resample.
  const squeezedX = drawTo(recompressed, Math.max(1, Math.round(width * SQUEEZE)), height)
  const squeezedY = drawTo(squeezedX, squeezedX.width, Math.max(1, Math.round(height * SQUEEZE)))

  // Step 3 — back to the generated size, then the closing JPEG round.
  return drawTo(squeezedY, width, height).toDataURL('image/jpeg', JPEG_QUALITY)
}

/**
 * Re-encodes a transparent image as PNG through a canvas, alpha intact.
 *
 * The pipeline above cannot run here. Its first and last step is JPEG, which
 * has no alpha channel at all, and its middle step resamples the image twice —
 * on a logo that is a sub-pixel blur along exactly the hard edges the mark
 * lives on. So the transparent path keeps only what costs nothing: a decode
 * and a re-encode, which drops whatever metadata the generator's PNG carried
 * and rewrites the file through the browser's own encoder. Every pixel value
 * survives; the statistical scrub does not happen.
 */
export async function reencodePreservingAlpha(base64DataUrl: string): Promise<string> {
  const source = await loadImage(base64DataUrl)
  const width = source.naturalWidth
  const height = source.naturalHeight
  if (!width || !height) throw new Error('Image has no dimensions')
  return drawTo(source, width, height, false).toDataURL('image/png')
}

/**
 * Prepares a freshly generated image for storage.
 *
 * Falls back to the untouched image if anything goes wrong — a failed scrub
 * must never cost the user the generation itself.
 *
 * @param preserveAlpha the generation was requested with a transparent
 * background, so the result has to stay PNG with its alpha channel.
 */
export async function prepareForStorage(
  base64DataUrl: string,
  enabled: boolean,
  preserveAlpha = false
): Promise<{ dataUrl: string; extension: string }> {
  if (!enabled) return { dataUrl: base64DataUrl, extension: 'png' }

  if (preserveAlpha) {
    try {
      return { dataUrl: await reencodePreservingAlpha(base64DataUrl), extension: 'png' }
    } catch (err) {
      logger.warn('anti-detection', 'PNG re-encode failed, storing the original image', err)
      return { dataUrl: base64DataUrl, extension: 'png' }
    }
  }

  try {
    return { dataUrl: await scrubGeneratedImage(base64DataUrl), extension: 'jpg' }
  } catch (err) {
    logger.warn('anti-detection', 'Scrub failed, storing the original image', err)
    return { dataUrl: base64DataUrl, extension: 'png' }
  }
}

/**
 * A file name that says nothing about where the image came from.
 *
 * The prompt is unusable (long, and it is exactly the thing that should not
 * travel with the file), and fal.ai returns no name of its own — so this is a
 * camera-style name, which is what an exported image is expected to look like.
 */
export function neutralImageName(extension: string = 'jpg'): string {
  const n = 1000 + Math.floor(Math.random() * 9000)
  return `IMG_${n}.${extension}`
}
