import { useCallback } from 'react'
import { useChatStore } from '../stores/chat-store'
import { useGalleryStore } from '../stores/gallery-store'
import { useSettingsStore } from '../stores/settings-store'
import { logger } from '../lib/logger'
import { packReferencesForModel } from '../lib/reference-packing'
import { prepareForStorage } from '../lib/anti-detection'
import { getModel, type LabeledAttachment } from '../types/api'

export interface ChatGenerateOptions {
  chatId: string
  prompt: string
  aspectRatio: string
  resolution: string
  model: string
  extraAttachments?: string[]
  extraLabeledAttachments?: LabeledAttachment[]
  seed?: number
  quality?: string
}

export interface ChatGenerationJob { chatId: string; messageId: string }

/** Upload every base64 reference to fal.ai storage (content-hash cached). */
async function uploadReferences(groups: LabeledAttachment[]): Promise<LabeledAttachment[]> {
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

export function useChatGeneration() {
  const addUserMessage = useChatStore((s) => s.addUserMessage)
  const addAssistantPlaceholder = useChatStore((s) => s.addAssistantPlaceholder)
  const completeAssistantMessage = useChatStore((s) => s.completeAssistantMessage)
  const failAssistantMessage = useChatStore((s) => s.failAssistantMessage)

  const generate = useCallback(
    (options: ChatGenerateOptions): ChatGenerationJob => {
      const { falApiKey, antiDetection } = useSettingsStore.getState()
      if (!falApiKey) throw new Error('No fal.ai API key configured. Add it in settings before generating.')

      const { chatId, prompt, aspectRatio, resolution, model, extraAttachments, extraLabeledAttachments, seed, quality } = options

      const chat = useChatStore.getState().chats.find((c) => c.id === chatId)
      if (!chat) throw new Error(`Chat not found: ${chatId}`)
      if (chat.messages.some((message) => message.isLoading)) throw new Error('This chat is already generating. Wait for its current response before sending another message.')

      // A chat opened from a transparent logo keeps its alpha. Without this the
      // edit endpoint defaults back to `auto` and the mark quietly gains a
      // background halfway through the conversation.
      const sourceImage = useGalleryStore
        .getState()
        .images.find((i) => i.id === chat.sourceImageId)
      const transparent = sourceImage?.hasAlpha === true && getModel(model).supportsBackground

      // Load last assistant image from disk as base64 for API auto-reference
      const lastAssistantMsg = [...chat.messages]
        .reverse()
        .find((m) => m.role === 'assistant' && m.imageFilePath)

      // Reserve both messages before the first await so concurrent callers see
      // the busy state and UI/MCP receive the exact same stable response ID.
      addUserMessage(chatId, prompt, extraAttachments ?? extraLabeledAttachments?.flatMap((group) => group.images))
      const assistantMsgId = addAssistantPlaceholder(chatId)
      const requestId = crypto.randomUUID()
      const startTime = Date.now()

      void (async () => {
        let lastAssistantBase64: string | undefined
        if (lastAssistantMsg?.imageFilePath) {
          try {
            const readResult = await window.api.readImage(lastAssistantMsg.imageFilePath)
            if (readResult.success) {
              lastAssistantBase64 = readResult.base64DataUrl
            }
          } catch (err) {
            logger.warn('useChatGeneration', 'Failed to read last assistant image for auto-reference', err)
          }
        }

        let groups: LabeledAttachment[] = []
        if (lastAssistantBase64) {
          groups.push({ label: 'Previous image (current version) — the image being edited', images: [lastAssistantBase64] })
        }
        if (extraLabeledAttachments) {
          groups.push(...extraLabeledAttachments)
        } else if (extraAttachments) {
          groups.push(...extraAttachments.map((img, i) => ({ label: `Image ${i + 1}`, images: [img] })))
        }

        const referenceSnapshot = structuredClone(groups)
        try {
          if (groups.length > 0) {
            const modelSpec = getModel(model)
            const packed = await packReferencesForModel(groups, modelSpec.maxReferenceImages)
            groups = await uploadReferences(packed.groups)
          }

          const flatAttachments = groups.flatMap((g) => g.images)

          const response = await window.api.generateImage({
            prompt,
            model,
            apiKey: falApiKey,
            aspectRatio,
            resolution,
            count: 1,
            requestId,
            attachments: flatAttachments.length > 0 ? flatAttachments : undefined,
            labeledAttachments: groups.length > 0 ? groups : undefined,
            seed,
            quality,
            background: transparent ? 'transparent' : undefined,
            outputFormat: transparent ? 'png' : undefined,
          })

          if (!response.success) {
            failAssistantMessage(chatId, assistantMsgId, response.error || 'Generation failed')
            return
          }

          const durationMs = Date.now() - startTime
          const result = (response.results || [])[0]

          if (result?.status === 'complete' && result.result?.imageBase64) {
            const stored = await prepareForStorage(result.result.imageBase64, antiDetection, transparent)
            const filename = `chat-${assistantMsgId}.${stored.extension}`
            const saveResult = await window.api.saveImage(stored.dataUrl, filename)

            if (saveResult.success && saveResult.filePath) {
              completeAssistantMessage(chatId, assistantMsgId, saveResult.filePath, durationMs, model)

              // Also add to gallery
              const galleryStore = useGalleryStore.getState()
              const placeholderId = galleryStore.addPlaceholder(prompt, aspectRatio, resolution, model, referenceSnapshot.flatMap((group) => group.images), sourceImage?.workspaceId, {
                chatId,
                chatMessageId: assistantMsgId,
                parentImageId: sourceImage?.id,
                projectId: sourceImage?.projectId,
                thumbnailStyle: sourceImage?.thumbnailStyle,
                faceFidelity: sourceImage?.faceFidelity,
                requestId,
                falRequestId: result.result.id,
                seed: result.result.seed ?? seed,
                costCurrency: 'USD',
                costSource: 'list-price-estimate',
                generationRequest: result.result.generationRequest,
                generationOptions: {
                  prompt, aspectRatio, resolution, models: [model], imageCount: 1, seed, quality,
                  attachments: referenceSnapshot.flatMap((group) => group.images),
                  labeledAttachments: referenceSnapshot,
                  background: transparent ? 'transparent' : undefined,
                  outputFormat: transparent ? 'png' : undefined,
                },
                hasAlpha: transparent,
                isLogo: sourceImage?.isLogo,
                logoStyle: sourceImage?.logoStyle,
              })
              galleryStore.completeImage(placeholderId, saveResult.filePath, durationMs, result.result.cost)
            } else {
              failAssistantMessage(chatId, assistantMsgId, 'Failed to save image to disk')
            }
          } else {
            failAssistantMessage(chatId, assistantMsgId, result?.error || 'No image returned')
          }
        } catch (err: unknown) {
          failAssistantMessage(chatId, assistantMsgId, err instanceof Error ? err.message : 'Unknown error')
        }
      })()
      return { chatId, messageId: assistantMsgId }
    },
    [addUserMessage, addAssistantPlaceholder, completeAssistantMessage, failAssistantMessage]
  )

  return { generate }
}
