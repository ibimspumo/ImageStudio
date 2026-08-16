import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../lib/constants'
import {
  generateImage,
  downloadImageAsBase64,
  type GenerateRequest,
  type GenerateResult,
} from '../services/fal-image'

const activeControllers = new Map<string, AbortController>()

type ItemResult =
  | { status: 'complete'; result: GenerateResult }
  | { status: 'error'; error: string }
  | { status: 'cancelled'; error: string }

export function registerImageGenerationHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.IMAGE_GENERATE,
    async (event, request: GenerateRequest & { count: number; requestId: string }) => {
      const { count, requestId, ...genRequest } = request
      const window = BrowserWindow.fromWebContents(event.sender)

      const send = (index: number, payload: Record<string, unknown>): void => {
        window?.webContents.send(IPC_CHANNELS.IMAGE_GENERATE_PROGRESS, {
          requestId,
          index,
          ...payload,
        })
      }

      try {
        // One request per image: fal.ai's num_images returns variations of a
        // single generation, while the gallery expects independent results.
        const promises = Array.from({ length: count }, async (_, i): Promise<ItemResult> => {
          const controller = new AbortController()
          const itemId = `${requestId}-${i}`
          activeControllers.set(itemId, controller)

          try {
            const results = await generateImage(genRequest, controller.signal, (status) =>
              send(i, { status: 'progress', message: status })
            )

            const first = results[0]
            if (!first?.imageUrl) throw new Error('No image returned')

            // The renderer stores images on disk as base64, so fetch the CDN file here.
            const imageBase64 = await downloadImageAsBase64(first.imageUrl)
            const result: GenerateResult = { ...first, imageBase64 }

            send(i, { status: 'complete', result })
            return { status: 'complete', result }
          } catch (error) {
            const err = error as Error
            if (err.name === 'AbortError' || controller.signal.aborted) {
              return { status: 'cancelled', error: 'Cancelled' }
            }
            send(i, { status: 'error', error: err.message })
            return { status: 'error', error: err.message }
          } finally {
            activeControllers.delete(itemId)
          }
        })

        const settled = await Promise.allSettled(promises)
        return {
          success: true,
          results: settled.map((r) =>
            r.status === 'fulfilled' ? r.value : { status: 'error', error: 'Unknown error' }
          ),
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.IMAGE_GENERATE_CANCEL, (_event, { requestId }: { requestId: string }) => {
    let cancelled = 0
    for (const [id, controller] of activeControllers) {
      if (id.startsWith(`${requestId}-`)) {
        controller.abort()
        activeControllers.delete(id)
        cancelled++
      }
    }
    return { success: true, cancelled }
  })
}
