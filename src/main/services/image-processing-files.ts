import sharp from 'sharp'
import { stat, mkdir, rename, rm } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { basename, join, isAbsolute } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export interface ProcessingFileInfo {
  width: number
  height: number
  hasAlpha: boolean
  mimeType: string
  sizeBytes: number
}
const inspectionCache = new Map<string, { signature: string; value: ProcessingFileInfo }>()
/** Native decode avoids Canvas limits and checks actual transparency, not just an alpha-capable format. */
export async function inspectProcessingFile(filePath: string): Promise<ProcessingFileInfo> {
  if (typeof filePath !== 'string' || !isAbsolute(filePath)) throw new Error('An absolute original image file path is required.')
  const file = await stat(filePath)
  if (!file.isFile()) throw new Error('The source must be an image file.')
  const signature = `${file.size}:${file.mtimeMs}:${file.ctimeMs}`
  const cached = inspectionCache.get(filePath)
  if (cached?.signature === signature) return cached.value
  const image = sharp(filePath, { limitInputPixels: false })
  const metadata = await image.metadata()
  const mimeType = ({ png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' } as Record<string, string>)[metadata.format ?? '']
  if (!mimeType || !metadata.width || !metadata.height) throw new Error('Image processing requires an original PNG, JPEG or WebP image.')
  if ((metadata.pages ?? 1) > 1) throw new Error('Image processing supports still images; export a single frame first.')
  const hasAlpha = metadata.hasAlpha ? !(await image.stats()).isOpaque : false
  const value = { width: metadata.width, height: metadata.height, hasAlpha, mimeType, sizeBytes: file.size }
  if (inspectionCache.size >= 128) inspectionCache.delete(inspectionCache.keys().next().value!)
  inspectionCache.set(filePath, { signature, value })
  return value
}
/** Stream provider bytes to disk unchanged. A small display preview never becomes the processing source. */
export async function persistProcessingResult(url: string, filename: string): Promise<ProcessingFileInfo & { filePath: string; previewPath?: string }> {
  if (basename(filename) !== filename || !/\.(png|jpg)$/.test(filename)) throw new Error('A plain PNG or JPEG output filename is required.')
  const { getImagesDir } = await import('./image-store')
  const directory = getImagesDir()
  await mkdir(directory, { recursive: true })
  const filePath = join(directory, filename)
  const temporaryPath = `${filePath}.${randomUUID()}.download`
  try {
    const response = await fetch(url)
    if (!response.ok || !response.body) throw new Error(`Failed to download processed image: HTTP ${response.status}.`)
    await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream), createWriteStream(temporaryPath, { flags: 'wx' }))
    const info = await inspectProcessingFile(temporaryPath)
    const expectedMime = filename.endsWith('.png') ? 'image/png' : 'image/jpeg'
    if (info.mimeType !== expectedMime) throw new Error(`The processing provider returned ${info.mimeType}, expected ${expectedMime}.`)
    await rename(temporaryPath, filePath)
    let previewPath: string | undefined
    if (info.width * info.height > 16_000_000 || Math.max(info.width, info.height) > 4096) {
      const previewDirectory = join(directory, 'previews')
      await mkdir(previewDirectory, { recursive: true })
      const preview = join(previewDirectory, `${filename}.png`)
      try {
        await sharp(filePath, { limitInputPixels: false }).resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).png().toFile(preview)
        previewPath = preview
      } catch (error) {
        await rm(preview, { force: true })
        console.warn('[ImageProcessing] Preview unavailable; original retained:', filePath, error instanceof Error ? error.message : String(error))
      }
    }
    return { ...info, filePath, ...(previewPath ? { previewPath } : {}) }
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(cleanupError => console.warn('[ImageProcessing] Download cleanup failed:', cleanupError))
    throw new Error(`Could not save processed image. The provider result remains available at ${url}. ${error instanceof Error ? error.message : String(error)}`)
  }
}

export interface ImageFileExportRequest {
  filePath: string
  format: 'png' | 'jpeg' | 'webp'
  quality: number
}
/** Export from original pixels using native codecs, without browser dimension limits. */
export async function prepareImageFileExport(request: ImageFileExportRequest): Promise<{ filePath: string; sizeBytes: number; format: ImageFileExportRequest['format']; mimeType: string }> {
  if (!request || typeof request.filePath !== 'string' || !isAbsolute(request.filePath)) throw new Error('An absolute original image file path is required.')
  if (!['png', 'jpeg', 'webp'].includes(request.format)) throw new Error('Export format must be png, jpeg or webp.')
  if (!Number.isFinite(request.quality) || request.quality < 1 || request.quality > 100) throw new Error('Export quality must be between 1 and 100.')
  const source = await stat(request.filePath)
  if (!source.isFile()) throw new Error('Export source must be an image file.')
  const image = sharp(request.filePath, { limitInputPixels: false })
  const metadata = await image.metadata()
  if (!metadata.width || !metadata.height) throw new Error('The source contains no readable image.')
  const mimeType = `image/${request.format}`
  if (metadata.format === 'png' && request.format === 'png') return { filePath: request.filePath, sizeBytes: source.size, format: request.format, mimeType }
  const { getImagesDir } = await import('./image-store')
  const directory = join(getImagesDir(), 'exports')
  await mkdir(directory, { recursive: true })
  const cacheKey = createHash('sha256').update(JSON.stringify([request.filePath, source.size, source.mtimeMs, source.ctimeMs, request.format, Math.round(request.quality)])).digest('hex')
  const output = join(directory, `export-${cacheKey}.${request.format === 'jpeg' ? 'jpg' : request.format}`)
  try {
    const cached = await stat(output)
    return { filePath: output, sizeBytes: cached.size, format: request.format, mimeType }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const pendingOutput = `${output}.${randomUUID()}.pending`
  try {
    let pipeline = image.autoOrient()
    if (request.format === 'jpeg') pipeline = pipeline.flatten({ background: '#ffffff' }).jpeg({ quality: Math.round(request.quality) })
    else if (request.format === 'webp') pipeline = pipeline.webp({ quality: Math.round(request.quality) })
    else pipeline = pipeline.png()
    const result = await pipeline.toFile(pendingOutput)
    await rename(pendingOutput, output)
    return { filePath: output, sizeBytes: result.size, format: request.format, mimeType }
  } catch (error) {
    await rm(pendingOutput, { force: true }).catch(cleanupError => console.warn('[ImageExport] Cleanup failed:', cleanupError))
    throw new Error(`Native image export failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}
