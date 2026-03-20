import { useCallback } from 'react'
import { useGalleryStore } from '../stores/gallery-store'
import { useSettingsStore } from '../stores/settings-store'
import type { AspectRatio, Resolution } from '../types/api'

interface GenerateOptions {
  prompt: string
  aspectRatio: AspectRatio
  resolution: Resolution
  imageCount: number
  attachments?: string[]
}

export function useImageGeneration() {
  const { addPlaceholder, completeImage, failImage } = useGalleryStore()
  const apiKey = useSettingsStore((s) => s.apiKey)

  const generate = useCallback(
    (options: GenerateOptions) => {
      if (!apiKey) return

      const model = 'google/gemini-3-pro-image-preview'

      // Create placeholders for each image
      const placeholderIds: string[] = []
      for (let i = 0; i < options.imageCount; i++) {
        const id = addPlaceholder(options.prompt, options.aspectRatio, options.resolution, model, options.attachments)
        placeholderIds.push(id)
      }

      // Fire request — don't await, don't block
      const requestId = crypto.randomUUID()
      const startTime = Date.now()
      window.api
        .generateImage({
          prompt: options.prompt,
          model: 'google/gemini-3-pro-image-preview',
          apiKey,
          aspectRatio: options.aspectRatio,
          resolution: options.resolution,
          count: options.imageCount,
          requestId,
          attachments: options.attachments,
        })
        .then((response) => {
          if (!response.success) {
            for (const id of placeholderIds) {
              failImage(id, response.error || 'Generation failed')
            }
            return
          }

          const durationMs = Date.now() - startTime
          const results = response.results || []
          for (let i = 0; i < placeholderIds.length; i++) {
            const result = results[i]
            if (result?.status === 'complete' && result.result?.imageBase64) {
              completeImage(placeholderIds[i], result.result.imageBase64, durationMs)
              // Save to disk in background
              const filename = `${placeholderIds[i]}.png`
              window.api.saveImage(result.result.imageBase64, filename)
            } else {
              failImage(
                placeholderIds[i],
                result?.error || 'No image returned'
              )
            }
          }
        })
        .catch((err: Error) => {
          for (const id of placeholderIds) {
            failImage(id, err.message)
          }
        })
    },
    [apiKey, addPlaceholder, completeImage, failImage]
  )

  return { generate }
}
