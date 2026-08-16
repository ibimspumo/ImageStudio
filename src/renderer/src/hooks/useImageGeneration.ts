import { useCallback } from 'react'
import { useGalleryStore } from '../stores/gallery-store'
import { useSettingsStore } from '../stores/settings-store'
import { useWorkspaceStore } from '../stores/workspace-store'
import { logger } from '../lib/logger'
import { getResolutionLabel } from '../lib/image-utils'
import { prepareForStorage } from '../lib/anti-detection'
import { packReferencesForModel } from '../lib/reference-packing'
import { getModel, DEFAULT_MODEL, type LabeledAttachment } from '../types/api'

interface GenerateOptions {
  prompt: string
  apiPrompt?: string  // if different from prompt, send this to the API
  aspectRatio: string
  resolution: string
  imageCount: number
  attachments?: string[]
  labeledAttachments?: LabeledAttachment[]
  models: string[]
  seed?: number
  quality?: string
  inpaintSourceId?: string  // links generated image to inpaint source
  canvasSketchPath?: string // file path of canvas sketch for compare
  /**
   * Rules that come from the app rather than the user (thumbnail mode).
   * Delivered as `system_prompt` where the model has that field, and prepended
   * to the prompt where it does not (GPT Image 2).
   */
  systemPrompt?: string
  /** Exact output size for models that take pixels — thumbnail mode only. */
  imageSize?: { width: number; height: number }
  /** Thumbnail mode metadata, stored on the image so it survives a reuse. */
  projectId?: string
  thumbnailStyle?: string
  faceFidelity?: boolean
}

/**
 * Upload every base64 reference to fal.ai storage once, then swap the URLs in.
 *
 * fal.ai only accepts URLs for reference images, and the upload is content-hash
 * cached in the main process, so the same image shared across models or across
 * a multi-image batch is transferred exactly once.
 */
async function uploadReferences(
  groups: LabeledAttachment[]
): Promise<LabeledAttachment[]> {
  const unique = Array.from(
    new Set(groups.flatMap((g) => g.images).filter((img) => img.startsWith('data:')))
  )
  if (unique.length === 0) return groups

  const result = await window.api.uploadToUrls(unique)
  if (!result.success) {
    throw new Error(result.error || 'Failed to upload reference images to fal.ai')
  }

  const urlMap = new Map<string, string>()
  unique.forEach((img, i) => urlMap.set(img, result.urls[i]))

  return groups.map((g) => ({
    label: g.label,
    images: g.images.map((img) => urlMap.get(img) ?? img),
  }))
}

export function useImageGeneration() {
  const { addPlaceholder, updateStatus, completeImage, failImage, updateResolution } = useGalleryStore()
  const falApiKey = useSettingsStore((s) => s.falApiKey)
  const antiDetection = useSettingsStore((s) => s.antiDetection)

  const generate = useCallback(
    (options: GenerateOptions) => {
      if (!falApiKey) return

      const models = options.models.length > 0 ? options.models : [DEFAULT_MODEL]
      const activeWorkspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? undefined

      // Create ALL placeholders upfront (across all models)
      const modelPlaceholders: { model: string; ids: string[] }[] = []

      for (const model of models) {
        const ids: string[] = []
        for (let i = 0; i < options.imageCount; i++) {
          const id = addPlaceholder(options.prompt, options.aspectRatio, options.resolution, model, options.attachments, activeWorkspaceId, { seed: options.seed, inpaintSourceId: options.inpaintSourceId, canvasSketchPath: options.canvasSketchPath, projectId: options.projectId, thumbnailStyle: options.thumbnailStyle, faceFidelity: options.faceFidelity })
          ids.push(id)
        }
        modelPlaceholders.push({ model, ids })
      }

      const batchUpdateStatus = (ids: string[], text: string | undefined) => {
        for (const id of ids) updateStatus(id, text)
      }

      // Labelled groups are the canonical form; a flat attachment list becomes
      // one single-image group each so it can be packed and labelled the same way.
      const baseGroups: LabeledAttachment[] =
        options.labeledAttachments && options.labeledAttachments.length > 0
          ? options.labeledAttachments
          : (options.attachments ?? []).map((img, i) => ({ label: `Image ${i + 1}`, images: [img] }))

      // Each model runs independently — a slow or failing one must not hold up
      // the others.
      for (const { model, ids: placeholderIds } of modelPlaceholders) {
        void (async () => {
          const requestId = crypto.randomUUID()
          const startTime = Date.now()
          const modelSpec = getModel(model)

          try {
            let groups = baseGroups

            // Reference limits differ per model, so pack per model.
            if (groups.length > 0) {
              batchUpdateStatus(placeholderIds, 'Preparing references...')
              const packed = await packReferencesForModel(groups, modelSpec.maxReferenceImages)
              groups = packed.groups
              if (packed.collapsed) {
                logger.info(
                  'useImageGeneration',
                  `Packed references into ${groups.length} slots for ${modelSpec.name}` +
                    (packed.dropped > 0 ? ` (${packed.dropped} images did not fit)` : '')
                )
              }

              batchUpdateStatus(placeholderIds, 'Uploading references...')
              groups = await uploadReferences(groups)
              batchUpdateStatus(placeholderIds, undefined)
            }

            const flatAttachments = groups.flatMap((g) => g.images)

            // Only the Gemini endpoints have a system_prompt field. GPT Image 2
            // gets the same rules prepended to the prompt instead — dropping
            // them would silently produce a thumbnail without any of them.
            const basePrompt = options.apiPrompt || options.prompt
            const useSystemField = modelSpec.supportsSystemPrompt && !!options.systemPrompt
            const promptText =
              !useSystemField && options.systemPrompt
                ? `${options.systemPrompt}\n\n---\n\n${basePrompt}`
                : basePrompt

            const response = await window.api.generateImage({
              prompt: promptText,
              systemPrompt: useSystemField ? options.systemPrompt : undefined,
              imageSize: options.imageSize,
              model,
              apiKey: falApiKey,
              aspectRatio: options.aspectRatio,
              resolution: options.resolution,
              count: options.imageCount,
              requestId,
              attachments: flatAttachments.length > 0 ? flatAttachments : undefined,
              labeledAttachments: groups.length > 0 ? groups : undefined,
              seed: options.seed,
              quality: options.quality,
            })

            if (!response.success) {
              for (const id of placeholderIds) failImage(id, response.error || 'Generation failed')
              return
            }

            const durationMs = Date.now() - startTime
            const results = response.results || []

            for (let i = 0; i < placeholderIds.length; i++) {
              const result = results[i]
              if (result?.status === 'complete' && result.result?.imageBase64) {
                try {
                  // Strip the generator's pixel signature before the image ever
                  // reaches disk, so gallery, export, copy and drag all hand out
                  // the same processed file.
                  const stored = await prepareForStorage(result.result.imageBase64, antiDetection)
                  const filename = `${placeholderIds[i]}.${stored.extension}`
                  const saveResult = await window.api.saveImage(stored.dataUrl, filename)
                  if (saveResult.success && saveResult.filePath) {
                    completeImage(placeholderIds[i], saveResult.filePath, durationMs, result.result.cost)

                    // Detect actual resolution from saved image
                    try {
                      const img = new window.Image()
                      const id = placeholderIds[i]
                      img.onload = () => {
                        const actualRes = getResolutionLabel(img.naturalWidth, img.naturalHeight)
                        if (actualRes !== options.resolution) {
                          updateResolution(id, actualRes)
                        }
                      }
                      img.src = `file://${encodeURI(saveResult.filePath)}`
                    } catch { /* dimension detection is cosmetic */ }
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
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Generation failed'
            logger.error('useImageGeneration', `Generation failed for ${model}`, err)
            for (const id of placeholderIds) failImage(id, message)
          }
        })()
      }
    },
    [falApiKey, antiDetection, addPlaceholder, updateStatus, completeImage, failImage, updateResolution]
  )

  return { generate }
}
