import { assertSeparateExportDestination } from '../services/media-export'
import { ipcMain, BrowserWindow, dialog } from 'electron'
import { copyFile, readFile, writeFile } from 'node:fs/promises'
import { embedPngTextChunks } from '../services/png-metadata'
import { extname, basename } from 'node:path'
import { IPC_CHANNELS } from '../lib/constants'
import {
  generateImage,
  downloadImageAsBase64,
  type GenerateRequest,
  type GenerateResult,
} from '../services/fal-image'

import { randomUUID } from 'node:crypto'
import { inspectProcessingFile, persistProcessingResult, prepareImageFileExport, type ImageFileExportRequest } from '../services/image-processing-files'
import { processImage } from '../services/fal-image-processing'
import type { ImageProcessingRequest } from '../../shared/image-processing'

const activeControllers = new Map<string, AbortController>()

type ItemResult =
  | { status: 'complete'; result: GenerateResult }
  | { status: 'error'; error: string }
  | { status: 'cancelled'; error: string }

export function registerImageGenerationHandlers(): void {
  ipcMain.handle('image:prepare-file-export', (_event, request: ImageFileExportRequest) => prepareImageFileExport(request))
  ipcMain.handle('image:export-file', async (event, { filePath, defaultName, metadata }: { filePath: string; defaultName: string; metadata?: Record<string, string> }) => {
    try {
      const extension = extname(filePath).slice(1).toLowerCase()
      if (!['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(extension)) throw new Error('Unsupported image export format.')
      const options = { defaultPath: `${basename(defaultName).replace(/\.[^.]+$/, '')}.${extension}`, filters: [{ name: 'Images', extensions: [extension] }] }
      const window = BrowserWindow.fromWebContents(event.sender)
      const chosen = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options)
      if (chosen.canceled || !chosen.filePath) return { success: false, cancelled: true }
      await assertSeparateExportDestination(filePath, chosen.filePath)
      if (metadata && extension === 'png') {
        await writeFile(chosen.filePath, embedPngTextChunks(await readFile(filePath), metadata))
      } else await copyFile(filePath, chosen.filePath)
      return { success: true, filePath: chosen.filePath }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Image export failed' }
    }
  })
  ipcMain.handle('image:inspect-processing', (_event, filePath: string) => inspectProcessingFile(filePath))
  ipcMain.handle(
    IPC_CHANNELS.IMAGE_GENERATE,
    async (event, request: GenerateRequest & { count: number; requestId: string; imageProcessing?: ImageProcessingRequest }) => {
      const { count, requestId, imageProcessing, ...genRequest } = request
      const window = BrowserWindow.fromWebContents(event.sender)

      const send = (index: number, payload: Record<string, unknown>): void => {
        window?.webContents.send(IPC_CHANNELS.IMAGE_GENERATE_PROGRESS, {
          requestId,
          index,
          ...payload,
        })
      }

      try {
        if (imageProcessing && count !== 1) throw new Error('Image processing requires count: 1.')
        // One request per image: fal.ai's num_images returns variations of a
        // single generation, while the gallery expects independent results.
        const promises = Array.from({ length: count }, async (_, i): Promise<ItemResult> => {
          const controller = new AbortController()
          const itemId = `${requestId}-${i}`
          activeControllers.set(itemId, controller)

          try {
            const progress = (status: string, falRequestId?: string): void => send(i, { status: 'progress', message: status, falRequestId })
            const results = imageProcessing
              ? await processImage(imageProcessing, genRequest.apiKey, controller.signal, progress)
              : await generateImage(genRequest, controller.signal, progress)

            const first = results[0]
            if (!first?.imageUrl) throw new Error('No image returned')

            // The renderer stores images on disk as base64, so fetch the CDN file here.
            const result: GenerateResult = imageProcessing
              ? { ...first, ...await persistProcessingResult(first.imageUrl, `processed-${randomUUID()}.${imageProcessing.options?.outputFormat === 'jpeg' ? 'jpg' : 'png'}`) }
              : { ...first, imageBase64: await downloadImageAsBase64(first.imageUrl) }

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
