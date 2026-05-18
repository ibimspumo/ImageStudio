import { useCallback } from 'react'
import { useGalleryStore } from '../stores/gallery-store'
import { useSettingsStore } from '../stores/settings-store'
import { useWorkspaceStore } from '../stores/workspace-store'
import { logger } from '../lib/logger'
import { getResolutionLabel } from '../lib/image-utils'

interface GenerateOptions {
  prompt: string
  apiPrompt?: string  // if different from prompt, send this to the API
  aspectRatio: string
  resolution: string
  imageCount: number
  attachments?: string[]
  labeledAttachments?: { label: string; images: string[] }[]
  models: string[]
  negativePrompt?: string
  seed?: number
  inpaintSourceId?: string  // links generated image to inpaint source
  canvasSketchPath?: string // file path of canvas sketch for compare
}

/**
 * Collect all unique base64 images from attachments + labeledAttachments,
 * upload them once, then return updated options with URLs replacing base64.
 */
async function uploadAttachments(
  options: GenerateOptions,
  updateStatus: (ids: string[], text: string | undefined) => void,
  allPlaceholderIds: string[]
): Promise<GenerateOptions> {
  // Collect all unique base64 images
  const allBase64 = new Set<string>()
  if (options.attachments) {
    for (const a of options.attachments) {
      if (a.startsWith('data:')) allBase64.add(a)
    }
  }
  if (options.labeledAttachments) {
    for (const group of options.labeledAttachments) {
      for (const img of group.images) {
        if (img.startsWith('data:')) allBase64.add(img)
      }
    }
  }

  if (allBase64.size === 0) return options

  // Show upload status on all placeholders
  updateStatus(allPlaceholderIds, 'Uploading images...')

  // Upload all unique images in one batch (cache deduplicates internally)
  const uniqueList = Array.from(allBase64)
  const result = await window.api.uploadToUrls(uniqueList)
  if (!result.success) {
    logger.warn('useImageGeneration', 'URL upload failed, falling back to base64')
    updateStatus(allPlaceholderIds, undefined)
    return options
  }

  // Build base64→URL map
  const urlMap = new Map<string, string>()
  for (let i = 0; i < uniqueList.length; i++) {
    urlMap.set(uniqueList[i], result.urls[i])
  }

  // Replace base64 with URLs in options
  const resolve = (img: string) => urlMap.get(img) ?? img

  const newOptions = { ...options }
  if (newOptions.attachments) {
    newOptions.attachments = newOptions.attachments.map(resolve)
  }
  if (newOptions.labeledAttachments) {
    newOptions.labeledAttachments = newOptions.labeledAttachments.map((g) => ({
      label: g.label,
      images: g.images.map(resolve),
    }))
  }

  // Clear upload status
  updateStatus(allPlaceholderIds, undefined)

  return newOptions
}

export function useImageGeneration() {
  const { addPlaceholder, updateStatus, completeImage, failImage, updateResolution } = useGalleryStore()
  const apiKey = useSettingsStore((s) => s.apiKey)
  const useImageUrls = useSettingsStore((s) => s.useImageUrls)

  const generate = useCallback(
    (options: GenerateOptions) => {
      if (!apiKey) return

      const models = options.models.length > 0 ? options.models : ['openai/gpt-5.4-image-2']
      const activeWorkspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? undefined

      // Create ALL placeholders upfront (across all models)
      const allPlaceholderIds: string[] = []
      const modelPlaceholders: { model: string; ids: string[] }[] = []

      for (const model of models) {
        const ids: string[] = []
        for (let i = 0; i < options.imageCount; i++) {
          const id = addPlaceholder(options.prompt, options.aspectRatio, options.resolution, model, options.attachments, activeWorkspaceId, { negativePrompt: options.negativePrompt, seed: options.seed, inpaintSourceId: options.inpaintSourceId, canvasSketchPath: options.canvasSketchPath })
          ids.push(id)
          allPlaceholderIds.push(id)
        }
        modelPlaceholders.push({ model, ids })
      }

      // Helper to batch-update status on multiple placeholders
      const batchUpdateStatus = (ids: string[], text: string | undefined) => {
        for (const id of ids) updateStatus(id, text)
      }

      // Async flow: optionally upload images, then generate for each model
      ;(async () => {
        let resolvedOptions = options

        // Upload images once (shared across all models)
        if (useImageUrls && (options.attachments?.length || options.labeledAttachments?.length)) {
          try {
            resolvedOptions = await uploadAttachments(options, batchUpdateStatus, allPlaceholderIds)
          } catch (err) {
            logger.warn('useImageGeneration', 'Upload failed, falling back to base64', err)
          }
        }

        // Fire generation for each model (concurrently)
        for (const { model, ids: placeholderIds } of modelPlaceholders) {
          const requestId = crypto.randomUUID()
          const startTime = Date.now()

          window.api
            .generateImage({
              prompt: resolvedOptions.apiPrompt || resolvedOptions.prompt,
              model,
              apiKey,
              aspectRatio: resolvedOptions.aspectRatio,
              resolution: resolvedOptions.resolution,
              count: resolvedOptions.imageCount,
              requestId,
              attachments: resolvedOptions.attachments,
              labeledAttachments: resolvedOptions.labeledAttachments,
              negativePrompt: resolvedOptions.negativePrompt,
              seed: resolvedOptions.seed,
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
                  const filename = `${placeholderIds[i]}.png`
                  try {
                    const saveResult = await window.api.saveImage(result.result.imageBase64, filename)
                    if (saveResult.success && saveResult.filePath) {
                      completeImage(placeholderIds[i], saveResult.filePath, durationMs, result.result.cost)

                      // Detect actual resolution from saved image
                      try {
                        const img = new window.Image()
                        img.onload = () => {
                          const actualRes = getResolutionLabel(img.naturalWidth, img.naturalHeight)
                          if (actualRes !== options.resolution) {
                            updateResolution(placeholderIds[i], actualRes)
                          }
                        }
                        img.src = `file://${encodeURI(saveResult.filePath)}`
                      } catch {}
                    } else {
                      failImage(placeholderIds[i], 'Failed to save image to disk')
                    }
                  } catch (err) {
                    logger.error('useImageGeneration', 'Failed to save image to disk', err)
                    failImage(placeholderIds[i], 'Failed to save image to disk')
                  }
                } else {
                  failImage(placeholderIds[i], result?.error || 'No image returned')
                }
              }
            })
            .catch((err: Error) => {
              for (const id of placeholderIds) {
                failImage(id, err.message)
              }
            })
        }
      })()
    },
    [apiKey, useImageUrls, addPlaceholder, updateStatus, completeImage, failImage, updateResolution]
  )

  return { generate }
}
