import { OPENROUTER_API_URL, NEGATIVE_PROMPT_MODELS } from '../lib/constants'

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
  negativePrompt?: string  // A2: negative prompts (only sent to supported models)
  seed?: number            // A3: seed for reproducibility
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

  // Some models reject the image_config parameter (e.g. GPT-5.4 Image 2) — aspect/size must be expressed in the prompt
  const supportsImageConfig = !request.model.includes('gpt-5.4-image')

  const body: Record<string, unknown> = {
    model: request.model,
    messages: [
      {
        role: 'user',
        content
      }
    ]
  }

  if (supportsImageConfig) {
    body.image_config = {
      aspect_ratio: request.aspectRatio,
      image_size: request.resolution
    }
  }

  if (needsModalities) {
    body.modalities = ['image', 'text']
  }

  // Add seed for reproducibility (OpenRouter top-level parameter)
  if (request.seed != null) {
    body.seed = request.seed
  }

  // Add negative prompt for models that support it
  if (request.negativePrompt) {
    const supportsNegative = Array.from(NEGATIVE_PROMPT_MODELS).some(m => request.model.includes(m))
    if (supportsNegative) {
      body.negative_prompt = request.negativePrompt
    }
  }

  // Log full message structure for debugging
  const contentSummary = content.map(c => {
    if (c.type === 'text') return { type: 'text', text: (c.text || '').slice(0, 80) }
    if (c.type === 'image_url') {
      const url = c.image_url?.url || ''
      const isBase64 = url.startsWith('data:')
      return { type: 'image_url', format: isBase64 ? 'base64' : 'url', size: isBase64 ? Math.round(url.length * 0.75 / 1024) + 'KB' : url.slice(0, 60) }
    }
    return c
  })
  console.log('[OpenRouter] Request:', {
    model: request.model,
    image_config: body.image_config,
    hasModalities: !!body.modalities,
    content: contentSummary,
  })

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

  console.log('[OpenRouter] Raw response keys:', JSON.stringify({
    id: data.id,
    model: data.model,
    choicesCount: data.choices?.length,
    firstChoice: data.choices?.[0] ? {
      finishReason: data.choices[0].finish_reason,
      messageKeys: Object.keys(data.choices[0].message || {}),
      contentType: typeof data.choices[0].message?.content,
      imagesCount: data.choices[0].message?.images?.length,
    } : 'none',
  }))

  const choice = data.choices?.[0]
  if (!choice) {
    throw new Error('No response from model')
  }

  const message = choice.message
  let text: string | undefined
  let imageBase64: string | undefined

  // Check for model refusal
  if (message?.refusal) {
    throw new Error(message.refusal)
  }

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

  // Decode and check actual image dimensions
  let imageDims = ''
  if (imageBase64) {
    try {
      const raw = imageBase64.replace(/^data:image\/\w+;base64,/, '')
      const buf = Buffer.from(raw, 'base64')
      // JPEG: scan for SOF0 marker (FF C0) to get dimensions
      if (buf[0] === 0xFF && buf[1] === 0xD8) {
        for (let i = 0; i < buf.length - 8; i++) {
          if (buf[i] === 0xFF && (buf[i+1] === 0xC0 || buf[i+1] === 0xC2)) {
            const h = buf.readUInt16BE(i + 5)
            const w = buf.readUInt16BE(i + 7)
            imageDims = `${w}x${h}`
            break
          }
        }
      }
      // PNG
      if (buf[0] === 0x89 && buf[1] === 0x50) {
        imageDims = `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`
      }
    } catch { /* ignore */ }
  }

  console.log('[OpenRouter] Response:', {
    model: data.model,
    imageTokens: data.usage?.completion_tokens_details?.image_tokens,
    cost: data.usage?.cost,
    hasImage: !!imageBase64,
    imageSize: imageBase64 ? Math.round(imageBase64.length * 0.75 / 1024) + 'KB' : 'none',
    imageDims,
  })

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

  // Validate output dimensions match requested resolution
  let dimensionWarning: string | undefined
  if (imageBase64 && imageDims) {
    const expectedMin: Record<string, number> = { '2K': 1400, '4K': 2800 }
    const minExpected = expectedMin[request.resolution]
    if (minExpected) {
      const [wStr] = imageDims.split('x')
      const actualW = parseInt(wStr, 10)
      if (actualW < minExpected) {
        dimensionWarning = `Resolution mismatch: requested ${request.resolution} but got ${imageDims}. This is an API-side issue — try again.`
        console.warn('[OpenRouter]', dimensionWarning)
      }
    }
  }

  // If no image was returned, surface model text as an error
  if (!imageBase64 && text) {
    return {
      id: generationId || crypto.randomUUID(),
      error: text,
      cost
    }
  }

  return {
    id: generationId || crypto.randomUUID(),
    text: dimensionWarning ? (text ? `${text}\n\n⚠️ ${dimensionWarning}` : `⚠️ ${dimensionWarning}`) : text,
    imageBase64,
    cost
  }
}

/**
 * C8: Enhance/improve a prompt using a text LLM via OpenRouter.
 */
export async function enhancePrompt(request: {
  prompt: string
  apiKey: string
  model?: string
}): Promise<{ enhanced: string; error?: string }> {
  const model = request.model || 'google/gemini-2.0-flash-001'

  const body = {
    model,
    messages: [
      {
        role: 'system',
        content: 'You are a prompt engineer for AI image generation. Take the user\'s rough prompt and improve it by adding specific visual details, lighting, composition, style, and artistic direction. Keep the core intent intact. Return ONLY the improved prompt text, nothing else. Do not include any explanations, prefixes, or formatting — just the improved prompt.'
      },
      {
        role: 'user',
        content: request.prompt
      }
    ]
  }

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${request.apiKey}`,
      'HTTP-Referer': 'https://imagestudio.local',
      'X-OpenRouter-Title': 'ImageStudio'
    },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const errorBody = await response.text()
    let message = `API error ${response.status}`
    try {
      const parsed = JSON.parse(errorBody)
      message = parsed.error?.message || message
    } catch { /* use default */ }
    return { enhanced: request.prompt, error: message }
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  if (typeof content === 'string' && content.trim()) {
    return { enhanced: content.trim() }
  }

  return { enhanced: request.prompt, error: 'No enhanced prompt returned' }
}
