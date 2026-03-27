import { fal } from '@fal-ai/client'

export interface VideoGenerateRequest {
  model: string
  prompt: string
  imageUrl: string          // start frame — data URL or HTTPS URL
  duration: number          // seconds
  aspectRatio?: string
  resolution?: string
  negativePrompt?: string
  generateAudio?: boolean
  cameraFixed?: boolean
  seed?: number
}

export interface VideoGenerateResult {
  videoUrl: string          // CDN URL to MP4
  duration: number
  seed?: number
}

/**
 * Generate a video via fal.ai queue API.
 * Submits the job and polls for completion, firing progress callbacks.
 */
export async function generateVideo(
  apiKey: string,
  request: VideoGenerateRequest,
  onProgress?: (status: string, progress?: number) => void,
  signal?: AbortSignal
): Promise<VideoGenerateResult> {
  fal.config({ credentials: apiKey })

  // Upload image to fal.ai storage — fal.ai needs images on their CDN
  let imageUrl = request.imageUrl
  if (imageUrl.startsWith('data:')) {
    console.log('[fal-client] Uploading start frame to fal.ai storage...')
    onProgress?.('Uploading image...', 5)
    try {
      // Convert data URL to Blob, then to File for fal.storage.upload
      const base64Match = imageUrl.match(/^data:([^;]+);base64,(.+)$/)
      if (!base64Match) throw new Error('Invalid base64 data URL')
      const mimeType = base64Match[1]
      const raw = Buffer.from(base64Match[2], 'base64')
      const ext = mimeType.includes('png') ? 'png' : 'jpg'
      // fal.storage.upload accepts a Blob in Node
      const blob = new Blob([raw], { type: mimeType })
      const uploadedUrl = await fal.storage.upload(blob)
      console.log('[fal-client] Image uploaded to fal storage:', uploadedUrl)
      imageUrl = uploadedUrl
    } catch (err) {
      console.error('[fal-client] fal.ai storage upload failed:', err)
      throw new Error(`Failed to upload image to fal.ai: ${err instanceof Error ? err.message : err}`)
    }
  } else if (!imageUrl.startsWith('https://fal.')) {
    // If it's a URL but not on fal.ai CDN (e.g. catbox), re-upload to fal storage
    console.log('[fal-client] Re-uploading external URL to fal.ai storage:', imageUrl)
    onProgress?.('Uploading image...', 5)
    try {
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      const uploadedUrl = await fal.storage.upload(blob)
      console.log('[fal-client] Image re-uploaded to fal storage:', uploadedUrl)
      imageUrl = uploadedUrl
    } catch (err) {
      console.warn('[fal-client] Re-upload failed, using original URL:', err)
      // Keep the original URL — fal.ai might be able to fetch it directly
    }
  }

  // Build input based on model
  const input: Record<string, unknown> = {
    prompt: request.prompt,
    duration: request.duration,
  }

  // Kling models use `start_image_url`, Seedance uses `image_url`
  if (request.model.includes('kling')) {
    input.start_image_url = imageUrl
  } else {
    input.image_url = imageUrl
  }

  if (request.aspectRatio) input.aspect_ratio = request.aspectRatio
  if (request.resolution) input.resolution = request.resolution
  if (request.negativePrompt) input.negative_prompt = request.negativePrompt
  if (request.generateAudio !== undefined) input.generate_audio = request.generateAudio
  if (request.cameraFixed !== undefined) input.camera_fixed = request.cameraFixed
  if (request.seed !== undefined) input.seed = request.seed

  console.log('[fal-client] Submitting to fal.ai queue:', request.model)
  console.log('[fal-client] Input:', JSON.stringify({ ...input, start_frame: input.start_frame ? '(url)' : undefined, image_url: input.image_url ? '(url)' : undefined }))
  onProgress?.('Queued...', 0)

  let result
  try {
    result = await fal.subscribe(request.model, {
      input,
      logs: true,
      onQueueUpdate: (update) => {
        if (signal?.aborted) return
        console.log('[fal-client] Queue update:', update.status)
        if (update.status === 'IN_QUEUE') {
          onProgress?.('Queued...', 10)
        } else if (update.status === 'IN_PROGRESS') {
          onProgress?.('Generating...', 50)
        }
      },
    })
  } catch (err) {
    // Log the full error from fal.ai
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('[fal-client] fal.subscribe error:', errMsg)
    // Try to extract details from the error body
    if (err && typeof err === 'object' && 'body' in err) {
      console.error('[fal-client] Error body:', JSON.stringify((err as { body: unknown }).body))
    }
    throw new Error(`fal.ai: ${errMsg}`)
  }

  console.log('[fal-client] Generation complete, extracting result...')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = result.data as any
  console.log('[fal-client] Result keys:', Object.keys(data))

  const videoUrl = data.video?.url || data.video_url || ''
  if (!videoUrl) {
    console.error('[fal-client] No video URL in response:', JSON.stringify(data).slice(0, 500))
    throw new Error('No video URL returned from fal.ai')
  }

  console.log('[fal-client] Video URL:', videoUrl)

  return {
    videoUrl,
    duration: request.duration,
    seed: data.seed,
  }
}

/**
 * Download a video from a CDN URL and return as Buffer.
 */
export async function downloadVideoFromUrl(url: string): Promise<Buffer> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.status} ${response.statusText}`)
  }
  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}
