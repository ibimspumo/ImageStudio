import { useCallback } from 'react'
import { useGalleryStore } from '../stores/gallery-store'
import { useSettingsStore } from '../stores/settings-store'
import { useWorkspaceStore } from '../stores/workspace-store'
import { estimateVideoCost } from '../types/api'
import { logger } from '../lib/logger'

export interface VideoGenerateOptions {
  prompt: string
  model: string
  duration: number
  aspectRatio: string
  resolution?: string
  startFrameBase64: string   // base64 data URL of start frame image
  negativePrompt?: string
  generateAudio?: boolean
  cameraFixed?: boolean
  seed?: number
}

// No pre-upload needed — fal-client.ts handles uploading to fal.ai storage

export function useVideoGeneration() {
  const { addVideoPlaceholder, completeVideo, failImage, updateStatus } = useGalleryStore()
  const falApiKey = useSettingsStore((s) => s.falApiKey)

  const generateVideo = useCallback(
    (options: VideoGenerateOptions) => {
      if (!falApiKey) {
        logger.error('useVideoGeneration', 'No fal.ai API key set')
        return
      }

      const activeWorkspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? undefined
      const id = addVideoPlaceholder(
        options.prompt,
        options.aspectRatio,
        options.model,
        undefined, // attachments stored separately
        activeWorkspaceId
      )

      // Listen for progress updates
      const unsub = window.api.onVideoProgress((data) => {
        if (data.requestId === id) {
          updateStatus(id, data.status)
        }
      })

      const startTime = Date.now()

      // Async flow: upload image, then generate
      ;(async () => {
        try {
          // Send base64 directly — fal-client.ts uploads to fal.ai storage
          updateStatus(id, 'Uploading image...')

          const response = await window.api.generateVideo({
            model: options.model,
            prompt: options.prompt,
            imageUrl: options.startFrameBase64,
            duration: options.duration,
            aspectRatio: options.aspectRatio,
            resolution: options.resolution,
            negativePrompt: options.negativePrompt,
            generateAudio: options.generateAudio,
            cameraFixed: options.cameraFixed,
            seed: options.seed,
            apiKey: falApiKey,
            requestId: id,
          })

          unsub()

          if (response.success && response.filePath) {
            const durationMs = Date.now() - startTime
            const cost = estimateVideoCost(options.model, options.duration, options.generateAudio ?? false)
            completeVideo(id, response.filePath, durationMs, options.duration, undefined, cost)
          } else {
            failImage(id, response.error || 'Video generation failed')
          }
        } catch (err) {
          unsub()
          const message = err instanceof Error ? err.message : 'Video generation failed'
          failImage(id, message)
        }
      })()
    },
    [falApiKey, addVideoPlaceholder, completeVideo, failImage, updateStatus]
  )

  return { generateVideo }
}
