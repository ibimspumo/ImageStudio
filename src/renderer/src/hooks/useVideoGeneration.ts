import { useCallback } from 'react'
import { useGalleryStore } from '../stores/gallery-store'
import { useSettingsStore } from '../stores/settings-store'
import { useWorkspaceStore } from '../stores/workspace-store'
import { AVAILABLE_VIDEO_MODELS, estimateVideoCost } from '../types/api'
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
  /** Explicit destination for automation; null means unfiled. */
  workspaceId?: string | null
}

// No pre-upload needed — fal-client.ts handles uploading to fal.ai storage

export function useVideoGeneration() {
  const { addVideoPlaceholder, completeVideo, failImage, updateStatus, updateMetadata } = useGalleryStore()

  const generateVideo = useCallback(
    (options: VideoGenerateOptions) => {
      const { falApiKey } = useSettingsStore.getState()
      if (!falApiKey) {
        logger.error('useVideoGeneration', 'No fal.ai API key set')
        return
      }

      const modelSpec = AVAILABLE_VIDEO_MODELS.find((model) => model.id === options.model)
      const resolution = options.resolution ?? modelSpec?.defaultResolution ?? '720p'
      const generateAudio = options.generateAudio ?? false
      const activeWorkspaceId = options.workspaceId === undefined
        ? useWorkspaceStore.getState().activeWorkspaceId ?? undefined
        : options.workspaceId ?? undefined
      const id = addVideoPlaceholder(
        options.prompt,
        options.aspectRatio,
        options.model,
        [options.startFrameBase64],
        activeWorkspaceId,
        {
          resolution, seed: options.seed, negativePrompt: options.negativePrompt,
          generationOptions: structuredClone({ ...options, resolution, generateAudio }),
          videoDuration: options.duration, costCurrency: 'USD', costSource: 'list-price-estimate',
        }
      )

      updateMetadata(id, { requestId: id })

      // Listen for progress updates
      const unsub = window.api.onVideoProgress((data) => {
        if (data.requestId === id) {
          updateStatus(id, data.status)
          if (data.progress !== undefined) updateMetadata(id, { progressPercent: data.progress })
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
            resolution,
            negativePrompt: options.negativePrompt,
            generateAudio,
            cameraFixed: options.cameraFixed,
            seed: options.seed,
            apiKey: falApiKey,
            requestId: id,
          })

          if (response.success && response.filePath) {
            const durationMs = Date.now() - startTime
            const cost = estimateVideoCost(options.model, options.duration, generateAudio)
            updateMetadata(id, {
              falRequestId: response.requestId,
              generationRequest: response.generationRequest,
              ...(response.seed !== undefined ? { seed: response.seed } : {}),
            })
            completeVideo(id, response.filePath, durationMs, response.duration ?? options.duration, undefined, cost)
          } else {
            failImage(id, response.error || 'Video generation failed')
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Video generation failed'
          failImage(id, message)
        } finally {
          unsub()
        }
      })()
      return id
    },
    [addVideoPlaceholder, completeVideo, failImage, updateStatus, updateMetadata]
  )

  return { generateVideo }
}
