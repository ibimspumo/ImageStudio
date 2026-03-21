import { OPENROUTER_API_URL } from '../lib/constants'

export interface LabeledAttachment {
  label: string
  images: string[]
}

export interface GenerateRequest {
  prompt: string
  model: string
  apiKey: string
  aspectRatio: string
  resolution: string
  attachments?: string[] // base64 data URLs or HTTPS URLs
  labeledAttachments?: LabeledAttachment[] // labeled groups for contextual API requests
}

export interface GenerateResult {
  id: string
  text?: string
  imageBase64?: string // base64 data URL
  error?: string
  cost?: number // USD cost from OpenRouter
}

/**
 * Fetch generation cost from OpenRouter's generation details endpoint.
 * Retries a few times since cost data may not be immediately available.
 */
async function fetchGenerationCost(generationId: string, apiKey: string): Promise<number | undefined> {
  // Wait a moment for OpenRouter to process the cost
  await new Promise((r) => setTimeout(r, 2000))

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`https://openrouter.ai/api/v1/generation?id=${generationId}`, {
        headers: { Authorization: `Bearer ${apiKey}` }
      })
      if (!res.ok) break
      const data = await res.json()
      const cost = data.data?.total_cost ?? data.data?.usage?.total_cost
      if (typeof cost === 'number' && cost > 0) return cost
      // Cost not yet available, wait and retry
      if (attempt < 2) await new Promise((r) => setTimeout(r, 2000))
    } catch {
      break
    }
  }
  return undefined
}

export async function generateImage(
  request: GenerateRequest,
  signal?: AbortSignal
): Promise<GenerateResult> {
  const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = []

  // Add attached images with labels for context (so the AI knows which image is which)
  // Images may be base64 data URLs or HTTPS URLs (if pre-uploaded by renderer)
  if (request.labeledAttachments && request.labeledAttachments.length > 0) {
    for (const group of request.labeledAttachments) {
      content.push({ type: 'text', text: `[${group.label}]:` })
      for (const img of group.images) {
        content.push({ type: 'image_url', image_url: { url: img } })
      }
    }
  } else if (request.attachments && request.attachments.length > 0) {
    // Fallback: flat attachments without labels
    for (const attachment of request.attachments) {
      content.push({
        type: 'image_url',
        image_url: { url: attachment }
      })
    }
  }

  // Add text prompt
  content.push({ type: 'text', text: request.prompt })

  // Some models don't support modalities parameter — they use different image generation APIs
  const needsModalities = !request.model.includes('flux') &&
    !request.model.includes('seedream') &&
    !request.model.includes('riverflow')

  const body: Record<string, unknown> = {
    model: request.model,
    messages: [
      {
        role: 'user',
        content
      }
    ],
    image_config: {
      aspect_ratio: request.aspectRatio,
      image_size: request.resolution
    }
  }

  if (needsModalities) {
    body.modalities = ['image', 'text']
  }

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${request.apiKey}`,
      'HTTP-Referer': 'https://imagestudio.local',
      'X-OpenRouter-Title': 'ImageStudio'
    },
    body: JSON.stringify(body),
    signal
  })

  if (!response.ok) {
    const errorBody = await response.text()
    let message = `API error ${response.status}`
    try {
      const parsed = JSON.parse(errorBody)
      message = parsed.error?.message || message
    } catch {
      // use default message
    }
    throw new Error(message)
  }

  const data = await response.json()

  const choice = data.choices?.[0]
  if (!choice) {
    throw new Error('No response from model')
  }

  const message = choice.message
  let text: string | undefined
  let imageBase64: string | undefined

  // Text can be in message.content (string or array)
  const messageContent = message?.content
  if (typeof messageContent === 'string') {
    text = messageContent
  } else if (Array.isArray(messageContent)) {
    for (const part of messageContent) {
      if (part.type === 'text') {
        text = part.text
      } else if (part.type === 'image_url') {
        imageBase64 = part.image_url?.url
      }
    }
  }

  // Images are returned in message.images array (OpenRouter/Gemini format)
  const images = message?.images
  if (Array.isArray(images) && images.length > 0) {
    for (const img of images) {
      if (img.type === 'image_url' && img.image_url?.url) {
        imageBase64 = img.image_url.url
        break
      }
    }
  }

  // Try to get cost from inline usage first
  let cost = data.usage?.total_cost ?? data.usage?.cost
  if (typeof cost !== 'number' || cost <= 0) {
    cost = undefined
  }

  const generationId = data.id

  // If no inline cost and we have a generation ID, fetch from generation endpoint (async, non-blocking)
  if (!cost && generationId) {
    // Don't await — fetch cost in background and it won't block the image return
    // Instead, we'll return the result immediately and let the cost be fetched
    // Actually, we need to return cost with the result, so we do await
    cost = await fetchGenerationCost(generationId, request.apiKey)
  }

  return {
    id: generationId || crypto.randomUUID(),
    text,
    imageBase64,
    cost
  }
}
