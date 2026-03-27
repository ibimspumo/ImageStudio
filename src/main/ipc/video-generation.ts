import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../lib/constants'
import { generateVideo, downloadVideoFromUrl } from '../services/fal-client'
import { saveVideoFile } from '../services/image-store'

interface VideoGenerateIpcRequest {
  model: string
  prompt: string
  imageUrl: string
  duration: number
  aspectRatio?: string
  resolution?: string
  negativePrompt?: string
  generateAudio?: boolean
  cameraFixed?: boolean
  seed?: number
  apiKey: string
  requestId: string
}

export function registerVideoGenerationHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.VIDEO_GENERATE,
    async (event, request: VideoGenerateIpcRequest) => {
      const { requestId, apiKey, ...genRequest } = request
      const window = BrowserWindow.fromWebContents(event.sender)

      const sendProgress = (status: string, progress?: number) => {
        window?.webContents.send(IPC_CHANNELS.VIDEO_GENERATE_PROGRESS, {
          requestId,
          status,
          progress,
        })
      }

      try {
        // Generate video via fal.ai (queue + poll)
        const result = await generateVideo(apiKey, genRequest, sendProgress)

        // Download MP4 from CDN to local disk
        sendProgress('Downloading...', 90)
        const videoBuffer = await downloadVideoFromUrl(result.videoUrl)
        const filename = `${requestId}.mp4`
        const filePath = await saveVideoFile(videoBuffer, filename)

        return {
          success: true,
          filePath,
          duration: result.duration,
          seed: result.seed,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Video generation failed'
        sendProgress('Failed', 0)
        return {
          success: false,
          error: message,
        }
      }
    }
  )
}
