import { OPENROUTER_API_URL } from '../lib/constants'

export interface GenerateRequest {
  prompt: string
  model: string
  apiKey: string
  aspectRatio: string
  resolution: string
  attachments?: string[] // base64 data URLs
}

export interface GenerateResult {
  id: string
  text?: string
  imageBase64?: string // base64 data URL
  error?: string
}

export async function generateImage(
  request: GenerateRequest,
  signal?: AbortSignal
): Promise<GenerateResult> {
  const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = []

  // Add attached images first
  if (request.attachments && request.attachments.length > 0) {
    for (const attachment of request.attachments) {
      content.push({
        type: 'image_url',
        image_url: { url: attachment }
      })
    }
  }

  // Add text prompt
  content.push({ type: 'text', text: request.prompt })

  const body = {
    model: request.model,
    messages: [
      {
        role: 'user',
        content
      }
    ],
    modalities: ['image', 'text'],
    image_config: {
      aspect_ratio: request.aspectRatio,
      image_size: request.resolution
    }
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

  // Debug logging
  console.log('[OpenRouter] Response keys:', Object.keys(data))
  console.log('[OpenRouter] Usage:', JSON.stringify(data.usage))

  const choice = data.choices?.[0]
  if (!choice) {
    console.log('[OpenRouter] No choices in response:', JSON.stringify(data).substring(0, 500))
    throw new Error('No response from model')
  }

  const message = choice.message
  console.log('[OpenRouter] Message keys:', Object.keys(message || {}))
  console.log('[OpenRouter] Has images:', Array.isArray(message?.images), 'count:', message?.images?.length)
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

  return {
    id: data.id || crypto.randomUUID(),
    text,
    imageBase64
  }
}
