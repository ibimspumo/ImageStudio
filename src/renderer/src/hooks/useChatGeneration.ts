import { useCallback } from 'react'
import { useChatStore } from '../stores/chat-store'
import { useGalleryStore } from '../stores/gallery-store'
import { useSettingsStore } from '../stores/settings-store'
import type { AspectRatio, Resolution } from '../types/api'

interface ChatGenerateOptions {
  chatId: string
  prompt: string
  aspectRatio: AspectRatio
  resolution: Resolution
  extraAttachments?: string[]
}

export function useChatGeneration() {
  const apiKey = useSettingsStore((s) => s.apiKey)
  const addUserMessage = useChatStore((s) => s.addUserMessage)
  const addAssistantPlaceholder = useChatStore((s) => s.addAssistantPlaceholder)
  const completeAssistantMessage = useChatStore((s) => s.completeAssistantMessage)
  const failAssistantMessage = useChatStore((s) => s.failAssistantMessage)

  const generate = useCallback(
    (options: ChatGenerateOptions) => {
      if (!apiKey) return

      const { chatId, prompt, aspectRatio, resolution, extraAttachments } = options

      // Get the last assistant image from the chat to use as auto-reference
      const chat = useChatStore.getState().chats.find((c) => c.id === chatId)
      if (!chat) return

      const lastAssistantImage = [...chat.messages]
        .reverse()
        .find((m) => m.role === 'assistant' && m.imageBase64)?.imageBase64

      // Build attachments: auto-reference first, then any extras
      const attachments: string[] = []
      if (lastAssistantImage) {
        attachments.push(lastAssistantImage)
      }
      if (extraAttachments) {
        attachments.push(...extraAttachments)
      }

      // Add user message to chat
      addUserMessage(chatId, prompt, attachments.length > 0 ? attachments : undefined)

      // Add assistant placeholder
      const assistantMsgId = addAssistantPlaceholder(chatId)

      const model = 'google/gemini-3-pro-image-preview'
      const requestId = crypto.randomUUID()
      const startTime = Date.now()

      window.api
        .generateImage({
          prompt,
          model,
          apiKey,
          aspectRatio,
          resolution,
          count: 1,
          requestId,
          attachments: attachments.length > 0 ? attachments : undefined
        })
        .then((response) => {
          if (!response.success) {
            failAssistantMessage(chatId, assistantMsgId, response.error || 'Generation failed')
            return
          }

          const durationMs = Date.now() - startTime
          const results = response.results || []
          const result = results[0]

          if (result?.status === 'complete' && result.result?.imageBase64) {
            completeAssistantMessage(chatId, assistantMsgId, result.result.imageBase64, durationMs)

            // Also add to gallery so it shows in the grid
            const galleryStore = useGalleryStore.getState()
            const placeholderId = galleryStore.addPlaceholder(prompt, aspectRatio, resolution, model, attachments.length > 0 ? attachments : undefined)
            galleryStore.completeImage(placeholderId, result.result.imageBase64, durationMs)
            // Tag it with the chatId so we can reopen the chat
            const img = galleryStore.images.find((i) => i.id === placeholderId)
            if (img) {
              useGalleryStore.setState((state) => ({
                images: state.images.map((i) =>
                  i.id === placeholderId ? { ...i, chatId } : i
                )
              }))
            }

            // Save to disk in background
            const filename = `chat-${assistantMsgId}.png`
            window.api.saveImage(result.result.imageBase64, filename)
          } else {
            failAssistantMessage(
              chatId,
              assistantMsgId,
              result?.error || 'No image returned'
            )
          }
        })
        .catch((err: Error) => {
          failAssistantMessage(chatId, assistantMsgId, err.message)
        })
    },
    [apiKey, addUserMessage, addAssistantPlaceholder, completeAssistantMessage, failAssistantMessage]
  )

  return { generate }
}
