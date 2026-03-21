/**
 * Temporary image upload service using litterbox.catbox.moe.
 * Uploads base64 images and returns short-lived HTTPS URLs (auto-deleted after 1h).
 * Free, no API key required, anonymous.
 *
 * Includes a content-hash cache so the same image is only uploaded once
 * (important for multi-model generation with shared references).
 */

import { createHash } from 'crypto'

const LITTERBOX_API = 'https://litterbox.catbox.moe/resources/internals/api.php'
const EXPIRY = '1h' // 1h | 12h | 24h | 72h
const CACHE_TTL_MS = 50 * 60 * 1000 // 50 minutes (just under 1h expiry)
const MAX_CACHE_SIZE = 50 // evict oldest entries when exceeded

interface CacheEntry {
  url: string
  uploadedAt: number
}

const cache = new Map<string, CacheEntry>()

/** Create a short hash key from base64 content (avoids storing huge keys) */
function hashBase64(base64DataUrl: string): string {
  return createHash('sha256').update(base64DataUrl).digest('hex').slice(0, 24)
}

/** Prune expired cache entries + enforce max size (LRU eviction) */
function pruneCache(): void {
  const now = Date.now()
  for (const [key, entry] of cache) {
    if (now - entry.uploadedAt > CACHE_TTL_MS) {
      cache.delete(key)
    }
  }
  // Evict oldest if over max size
  if (cache.size > MAX_CACHE_SIZE) {
    const sorted = [...cache.entries()].sort((a, b) => a[1].uploadedAt - b[1].uploadedAt)
    const toRemove = sorted.slice(0, cache.size - MAX_CACHE_SIZE)
    for (const [key] of toRemove) cache.delete(key)
  }
}

/**
 * Upload a base64 data URL to Litterbox and return the HTTPS URL.
 * Uses cache — identical images are not re-uploaded within the TTL.
 * Falls back to returning the original base64 if upload fails.
 */
export async function uploadImageToUrl(base64DataUrl: string): Promise<string> {
  // Skip non-base64 (already a URL)
  if (!base64DataUrl.startsWith('data:')) return base64DataUrl

  // Check cache first
  pruneCache()
  const cacheKey = hashBase64(base64DataUrl)
  const cached = cache.get(cacheKey)
  if (cached) {
    console.log('[ImageUpload] Cache hit, reusing URL:', cached.url)
    return cached.url
  }

  // Parse the data URL
  const match = base64DataUrl.match(/^data:(image\/\w+);base64,(.+)$/)
  if (!match) return base64DataUrl

  const mimeType = match[1]
  const base64Data = match[2]
  const ext = mimeType.split('/')[1] === 'jpeg' ? 'jpg' : mimeType.split('/')[1]

  // Convert base64 to Buffer
  const buffer = Buffer.from(base64Data, 'base64')

  // Build multipart form data manually (no external deps)
  const boundary = '----ImageStudio' + Date.now().toString(36)
  const filename = `img_${Date.now().toString(36)}.${ext}`

  const parts: Buffer[] = []

  // reqtype field
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="reqtype"\r\n\r\nfileupload\r\n`
  ))

  // time field
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="time"\r\n\r\n${EXPIRY}\r\n`
  ))

  // file field
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="fileToUpload"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`
  ))
  parts.push(buffer)
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`))

  const body = Buffer.concat(parts)

  try {
    const response = await fetch(LITTERBOX_API, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    })

    if (!response.ok) {
      console.error('[ImageUpload] Litterbox upload failed:', response.status)
      return base64DataUrl
    }

    const url = (await response.text()).trim()

    if (url.startsWith('https://')) {
      // Store in cache
      cache.set(cacheKey, { url, uploadedAt: Date.now() })
      console.log('[ImageUpload] Uploaded:', url, `(${(buffer.length / 1024).toFixed(0)} KB)`)
      return url
    }

    console.error('[ImageUpload] Unexpected response:', url)
    return base64DataUrl
  } catch (err) {
    console.error('[ImageUpload] Upload error:', err)
    return base64DataUrl
  }
}

/**
 * Upload multiple base64 images concurrently.
 * Identical images share the same upload via cache.
 * Returns array of URLs (or original base64 on per-image failure).
 */
export async function uploadImagesToUrls(base64DataUrls: string[]): Promise<string[]> {
  // Deduplicate: group by content hash to avoid concurrent uploads of the same image
  const hashToBase64 = new Map<string, string>()
  const indexToHash: string[] = []

  for (const b64 of base64DataUrls) {
    if (!b64.startsWith('data:')) {
      indexToHash.push('') // not a base64, skip
      continue
    }
    const hash = hashBase64(b64)
    hashToBase64.set(hash, b64)
    indexToHash.push(hash)
  }

  // Upload unique images concurrently
  const uploadResults = new Map<string, string>()
  await Promise.all(
    Array.from(hashToBase64.entries()).map(async ([hash, b64]) => {
      const url = await uploadImageToUrl(b64)
      uploadResults.set(hash, url)
    })
  )

  // Map back to original order
  return base64DataUrls.map((b64, i) => {
    const hash = indexToHash[i]
    if (!hash) return b64 // was already a URL
    return uploadResults.get(hash) ?? b64
  })
}
