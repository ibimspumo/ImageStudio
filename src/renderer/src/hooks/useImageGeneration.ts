import { useCallback } from 'react'
import { useGalleryStore } from '../stores/gallery-store'
import { useSettingsStore } from '../stores/settings-store'
import { useWorkspaceStore } from '../stores/workspace-store'

interface GenerateOptions {
  prompt: string
  aspectRatio: string
  resolution: string
  imageCount: number
  attachments?: string[]
  models: string[]
}

export function useImageGeneration() {
  const { addPlaceholder, completeImage, failImage } = useGalleryStore()
  const apiKey = useSettingsStore((s) => s.apiKey)

  const generate = useCallback(
    (options: GenerateOptions) => {
      if (!apiKey) return

      const models = options.models.length > 0 ? options.models : ['google/gemini-3-pro-image-preview']

      // Tag new images with the active workspace (if any)
      const activeWorkspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? undefined

      // For each model × imageCount, create a placeholder and fire a request
      for (const model of models) {
        const placeholderIds: string[] = []
        for (let i = 0; i < options.imageCount; i++) {
          const id = addPlaceholder(options.prompt, options.aspectRatio, options.resolution, model, options.attachments, activeWorkspaceId)
          placeholderIds.push(id)
        }

        const requestId = crypto.randomUUID()
        const startTime = Date.now()
        window.api
          .generateImage({
            prompt: options.prompt,
            model,
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
      }
    },
    [apiKey, addPlaceholder, completeImage, failImage]
  )

  return { generate }
}
