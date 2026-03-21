import { useCallback } from 'react'
import { useChatStore } from '../stores/chat-store'
import { useGalleryStore } from '../stores/gallery-store'
import { useSettingsStore } from '../stores/settings-store'
import { logger } from '../lib/logger'

interface ChatGenerateOptions {
  chatId: string
  prompt: string
  aspectRatio: string
  resolution: string
  model: string
  extraAttachments?: string[]
  extraLabeledAttachments?: { label: string; images: string[] }[]
}

/**
 * Upload all base64 images to temp URLs. Returns updated attachments/labeled arrays.
 */
async function uploadChatImages(
  attachments: string[],
  labeledAttachments: { label: string; images: string[] }[]
): Promise<{ attachments: string[]; labeledAttachments: { label: string; images: string[] }[] }> {
  // Collect all unique base64 images
  const allBase64 = new Set<string>()
  for (const a of attachments) {
    if (a.startsWith('data:')) allBase64.add(a)
  }
  for (const group of labeledAttachments) {
    for (const img of group.images) {
      if (img.startsWith('data:')) allBase64.add(img)
    }
  }

  if (allBase64.size === 0) return { attachments, labeledAttachments }

  const uniqueList = Array.from(allBase64)
  const result = await window.api.uploadToUrls(uniqueList)
  if (!result.success) return { attachments, labeledAttachments }

  const urlMap = new Map<string, string>()
  for (let i = 0; i < uniqueList.length; i++) {
    urlMap.set(uniqueList[i], result.urls[i])
  }

  const resolve = (img: string) => urlMap.get(img) ?? img

  return {
    attachments: attachments.map(resolve),
    labeledAttachments: labeledAttachments.map((g) => ({
      label: g.label,
      images: g.images.map(resolve),
    })),
  }
}

export function useChatGeneration() {
  const apiKey = useSettingsStore((s) => s.apiKey)
  const useImageUrls = useSettingsStore((s) => s.useImageUrls)
  const addUserMessage = useChatStore((s) => s.addUserMessage)
  const addAssistantPlaceholder = useChatStore((s) => s.addAssistantPlaceholder)
  const completeAssistantMessage = useChatStore((s) => s.completeAssistantMessage)
  const failAssistantMessage = useChatStore((s) => s.failAssistantMessage)

  const generate = useCallback(
    async (options: ChatGenerateOptions) => {
      if (!apiKey) return

      const { chatId, prompt, aspectRatio, resolution, model, extraAttachments, extraLabeledAttachments } = options

      const chat = useChatStore.getState().chats.find((c) => c.id === chatId)
      if (!chat) return

      // Load last assistant image from disk as base64 for API auto-reference
      const lastAssistantMsg = [...chat.messages]
        .reverse()
        .find((m) => m.role === 'assistant' && m.imageFilePath)

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

      // Build attachments for API (base64 strings)
      let attachments: string[] = []
      let labeledAttachments: { label: string; images: string[] }[] = []
      if (lastAssistantBase64) {
        attachments.push(lastAssistantBase64)
        labeledAttachments.push({ label: 'Previous image (current version)', images: [lastAssistantBase64] })
      }
      if (extraAttachments) {
        attachments.push(...extraAttachments)
      }
      if (extraLabeledAttachments) {
        labeledAttachments.push(...extraLabeledAttachments)
      }

      // Add user message
      addUserMessage(chatId, prompt, undefined)

      const assistantMsgId = addAssistantPlaceholder(chatId)

      // Upload images to temp URLs if enabled
      if (useImageUrls && attachments.length > 0) {
        try {
          // Update chat message status (reuse loading message)
          const uploaded = await uploadChatImages(attachments, labeledAttachments)
          attachments = uploaded.attachments
          labeledAttachments = uploaded.labeledAttachments
        } catch (err) {
          logger.warn('useChatGeneration', 'Upload failed, falling back to base64', err)
        }
      }

      const requestId = crypto.randomUUID()
      const startTime = Date.now()

      try {
        const response = await window.api.generateImage({
          prompt,
          model,
          apiKey,
          aspectRatio,
          resolution,
          count: 1,
          requestId,
          attachments: attachments.length > 0 ? attachments : undefined,
          labeledAttachments: labeledAttachments.length > 0 ? labeledAttachments : undefined,
        })

        if (!response.success) {
          failAssistantMessage(chatId, assistantMsgId, response.error || 'Generation failed')
          return
        }

        const durationMs = Date.now() - startTime
        const results = response.results || []
        const result = results[0]

        if (result?.status === 'complete' && result.result?.imageBase64) {
          const filename = `chat-${assistantMsgId}.png`
          const saveResult = await window.api.saveImage(result.result.imageBase64, filename)

          if (saveResult.success && saveResult.filePath) {
            completeAssistantMessage(chatId, assistantMsgId, saveResult.filePath, durationMs, model)

            // Also add to gallery
            const galleryStore = useGalleryStore.getState()
            const placeholderId = galleryStore.addPlaceholder(prompt, aspectRatio, resolution, model)
            galleryStore.completeImage(placeholderId, saveResult.filePath, durationMs, result.result.cost)
            useGalleryStore.setState((state) => ({
              images: state.images.map((i) =>
                i.id === placeholderId ? { ...i, chatId } : i
              )
            }))
          } else {
            failAssistantMessage(chatId, assistantMsgId, 'Failed to save image to disk')
          }
        } else {
          failAssistantMessage(chatId, assistantMsgId, result?.error || 'No image returned')
        }
      } catch (err: unknown) {
        failAssistantMessage(chatId, assistantMsgId, err instanceof Error ? err.message : 'Unknown error')
      }
    },
    [apiKey, useImageUrls, addUserMessage, addAssistantPlaceholder, completeAssistantMessage, failAssistantMessage]
  )

  return { generate }
}
