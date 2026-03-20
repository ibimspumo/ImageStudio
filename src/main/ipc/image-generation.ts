import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../lib/constants'
import { generateImage, type GenerateRequest } from '../services/openrouter'

const activeControllers = new Map<string, AbortController>()

export function registerImageGenerationHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.IMAGE_GENERATE,
    async (event, request: GenerateRequest & { count: number; requestId: string }) => {
      const { count, requestId, ...genRequest } = request
      const window = BrowserWindow.fromWebContents(event.sender)

      try {
        const controllers: AbortController[] = []
        const promises = Array.from({ length: count }, (_, i) => {
          const controller = new AbortController()
          controllers.push(controller)
          const itemId = `${requestId}-${i}`
          activeControllers.set(itemId, controller)

          return generateImage(genRequest, controller.signal)
            .then((result) => {
              window?.webContents.send(IPC_CHANNELS.IMAGE_GENERATE_PROGRESS, {
                requestId,
                index: i,
                status: 'complete',
                result
              })
              activeControllers.delete(itemId)
              return { status: 'complete' as const, result }
            })
            .catch((error: Error) => {
              activeControllers.delete(itemId)
              if (error.name === 'AbortError') {
                return { status: 'cancelled' as const, error: 'Cancelled' }
              }
              window?.webContents.send(IPC_CHANNELS.IMAGE_GENERATE_PROGRESS, {
                requestId,
                index: i,
                status: 'error',
                error: error.message
              })
              return { status: 'error' as const, error: error.message }
            })
        })

        const results = await Promise.allSettled(promises)
        return {
          success: true,
          results: results.map((r) => (r.status === 'fulfilled' ? r.value : { status: 'error', error: 'Unknown error' }))
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  )
}
