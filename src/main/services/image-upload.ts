/**
 * Reference-image upload via fal.ai storage.
 *
 * The fal.ai image endpoints only accept URLs, so every base64 reference has to
 * be uploaded first. Uploads are cached by content hash: the same image is sent
 * once no matter how many models or how many images of a batch reference it.
 *
 * fal CDN URLs are long-lived, but the cache is deliberately short so a stale
 * entry can never outlive the URL it points at.
 */

import { createHash } from 'crypto'
import { fal } from '@fal-ai/client'

const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes
const MAX_CACHE_SIZE = 200

interface CacheEntry {
  url: string
  uploadedAt: number
}

const cache = new Map<string, CacheEntry>()
/** In-flight uploads, so concurrent requests for one image share a single upload. */
const inFlight = new Map<string, Promise<string>>()

function hashContent(base64DataUrl: string): string {
  return createHash('sha256').update(base64DataUrl).digest('hex').slice(0, 32)
}

function pruneCache(): void {
  const now = Date.now()
  for (const [key, entry] of cache) {
    if (now - entry.uploadedAt > CACHE_TTL_MS) cache.delete(key)
  }
  if (cache.size > MAX_CACHE_SIZE) {
    const sorted = [...cache.entries()].sort((a, b) => a[1].uploadedAt - b[1].uploadedAt)
    for (const [key] of sorted.slice(0, cache.size - MAX_CACHE_SIZE)) cache.delete(key)
  }
}

/** Clear the upload cache — used when the API key changes. */
export function clearUploadCache(): void {
  cache.clear()
  inFlight.clear()
}

async function uploadOne(base64DataUrl: string): Promise<string> {
  const match = base64DataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) throw new Error('Not a base64 data URL')

  const mimeType = match[1]
  const buffer = Buffer.from(match[2], 'base64')
  const blob = new Blob([new Uint8Array(buffer)], { type: mimeType })
  const url = await fal.storage.upload(blob)
  if (!url) throw new Error('fal.ai storage returned no URL')
  return url
}

/**
 * Upload a base64 data URL to fal storage and return the CDN URL.
 * Values that are already URLs pass through untouched.
 */
export async function uploadImageToUrl(base64DataUrl: string, apiKey: string): Promise<string> {
  if (!base64DataUrl.startsWith('data:')) return base64DataUrl
  if (!apiKey) throw new Error('No fal.ai API key configured')

  fal.config({ credentials: apiKey })
  pruneCache()

  const key = hashContent(base64DataUrl)
  const cached = cache.get(key)
  if (cached) return cached.url

  const pending = inFlight.get(key)
  if (pending) return pending

  const upload = uploadOne(base64DataUrl)
    .then((url) => {
      cache.set(key, { url, uploadedAt: Date.now() })
      console.log(
        '[ImageUpload] Uploaded to fal storage:',
        url,
        `(${(base64DataUrl.length * 0.75 / 1024).toFixed(0)} KB)`
      )
      return url
    })
    .finally(() => {
      inFlight.delete(key)
    })

  inFlight.set(key, upload)
  return upload
}

/**
 * Upload several images at once, preserving order.
 * Duplicates within the batch are uploaded once.
 */
export async function uploadImagesToUrls(
  images: string[],
  apiKey: string
): Promise<string[]> {
  const unique = Array.from(new Set(images.filter((i) => i.startsWith('data:'))))
  if (unique.length === 0) return images

  const uploaded = await Promise.all(unique.map((img) => uploadImageToUrl(img, apiKey)))
  const map = new Map<string, string>()
  unique.forEach((img, i) => map.set(img, uploaded[i]))

  return images.map((img) => map.get(img) ?? img)
}
