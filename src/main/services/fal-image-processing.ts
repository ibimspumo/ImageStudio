import { fal } from '@fal-ai/client'
import { buildImageProcessingInput, normalizeImageProcessing, type ImageProcessingRequest } from '../../shared/image-processing'
import { uploadImageToUrl } from './image-upload'
import type { GenerateResult } from './fal-image'

function abortIfNeeded(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  const error = new Error('Cancelled')
  error.name = 'AbortError'
  throw error
}
function describeError(error: unknown): string {
  const detail = (error as { body?: { detail?: unknown } } | null)?.body?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map(item => {
    const field = Array.isArray(item.loc) ? item.loc.slice(1).join('.') : ''
    return `${field ? `${field}: ` : ''}${item.msg ?? 'Invalid input'}`
  }).join('; ')
  return error instanceof Error ? error.message : String(error)
}
/** Original image upload, queued dedicated model and the ordinary generation lifecycle. */
export async function processImage(
  request: ImageProcessingRequest,
  apiKey: string,
  signal?: AbortSignal,
  onProgress?: (status: string, requestId?: string) => void
): Promise<GenerateResult[]> {
  if (!apiKey) throw new Error('No fal.ai API key configured')
  normalizeImageProcessing(request)
  if (!!request.sourceImage === !!request.sourceFilePath) throw new Error('Provide exactly one original sourceImage or sourceFilePath.')
  if (!request.sourceFilePath && (typeof request.sourceImage !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(request.sourceImage))) {
    throw new Error('sourceImage must be the original PNG, JPEG or WebP base64 data URL.')
  }
  abortIfNeeded(signal)
  fal.config({ credentials: apiKey })
  onProgress?.('Uploading original image…')
  let imageUrl: string
  if (request.sourceFilePath) {
    const { inspectProcessingFile } = await import('./image-processing-files')
    const info = await inspectProcessingFile(request.sourceFilePath)
    if (info.width !== request.sourceWidth || info.height !== request.sourceHeight || info.hasAlpha !== !!request.sourceHasAlpha) throw new Error('Source image metadata changed. Inspect the original again and retry.')
    const { openAsBlob } = await import('node:fs')
    const original = await openAsBlob(request.sourceFilePath, { type: info.mimeType })
    abortIfNeeded(signal)
    imageUrl = await fal.storage.upload(original)
    if (!imageUrl) throw new Error('fal.ai storage returned no URL.')
  } else {
    imageUrl = await uploadImageToUrl(request.sourceImage!, apiKey)
  }
  abortIfNeeded(signal)
  const { endpoint, input, normalized } = buildImageProcessingInput(request, imageUrl)
  let providerRequestId: string | undefined
  const cancel = () => {
    if (!providerRequestId) return
    void fal.queue.cancel(endpoint, { requestId: providerRequestId }).catch(() => {
      onProgress?.('Cancellation could not be confirmed; provider charges may still apply.', providerRequestId)
    })
  }
  signal?.addEventListener('abort', cancel, { once: true })
  try {
    const result = await fal.subscribe(endpoint, {
      input,
      logs: false,
      abortSignal: signal,
      onEnqueue: id => {
        providerRequestId = id
        onProgress?.('Queued…', id)
        if (signal?.aborted) cancel()
      },
      onQueueUpdate: update => {
        if (update.status === 'IN_QUEUE') onProgress?.('Queued…', providerRequestId)
        if (update.status === 'IN_PROGRESS') onProgress?.(request.operation === 'upscale' ? 'Upscaling…' : 'Removing background…', providerRequestId)
      },
    })
    abortIfNeeded(signal)
    const data = result.data as { image?: { url?: string } }
    if (!data?.image?.url) throw new Error(`${normalized.name} returned no image. Retry the job or inspect the provider request.`)
    return [{ id: result.requestId, imageUrl: data.image.url, cost: normalized.estimatedCost, generationRequest: { endpoint, input } }]
  } catch (error) {
    abortIfNeeded(signal)
    throw new Error(describeError(error))
  } finally {
    signal?.removeEventListener('abort', cancel)
  }
}
