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
  labeledAttachments?: { label: string; images: string[] }[]
  models: string[]
}

export function useImageGeneration() {
  const { addPlaceholder, completeImage, failImage } = useGalleryStore()
  const apiKey = useSettingsStore((s) => s.apiKey)

  const generate = useCallback(
    (options: GenerateOptions) => {
      if (!apiKey) return

      const models = options.models.length > 0 ? options.models : ['google/gemini-3-pro-image-preview']
      const activeWorkspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? undefined

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
            labeledAttachments: options.labeledAttachments,
          })
          .then(async (response) => {
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
                // Save to disk FIRST, get file path
                const filename = `${placeholderIds[i]}.png`
                try {
                  const saveResult = await window.api.saveImage(result.result.imageBase64, filename)
                  if (saveResult.success && saveResult.filePath) {
                    completeImage(placeholderIds[i], saveResult.filePath, durationMs, result.result.cost)
                  } else {
                    failImage(placeholderIds[i], 'Failed to save image to disk')
                  }
                } catch {
                  failImage(placeholderIds[i], 'Failed to save image to disk')
                }
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
