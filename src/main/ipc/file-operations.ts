import { ipcMain, dialog, nativeImage } from 'electron'
import { writeFile } from 'fs/promises'
import { join, extname } from 'path'
import { IPC_CHANNELS } from '../lib/constants'
import {
  saveImage,
  getImagesDir,
  readImageAsBase64,
  deleteImage,
  migrateGalleryHistory,
  migrateChatHistory,
  migrateCollectionsHistory
} from '../services/image-store'

import { embedPngTextChunks } from '../services/png-metadata'

export function registerFileOperationHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.IMAGE_SAVE,
    async (_event, { base64DataUrl, filename }: { base64DataUrl: string; filename: string }) => {
      try {
        const filePath = await saveImage(base64DataUrl, filename)
        return { success: true, filePath }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Save failed' }
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.IMAGE_EXPORT,
    async (_event, { base64DataUrl, defaultName }: { base64DataUrl: string; defaultName: string }) => {
      try {
        const result = await dialog.showSaveDialog({
          defaultPath: defaultName,
          filters: [{ name: 'Images', extensions: ['png', 'jpg', 'webp'] }]
        })
        if (result.canceled || !result.filePath) {
          return { success: false, cancelled: true }
        }

        const match = base64DataUrl.match(/^data:image\/\w+;base64,(.+)$/)
        if (!match) throw new Error('Invalid image data')

        const buffer = Buffer.from(match[1], 'base64')
        await writeFile(result.filePath, buffer)
        return { success: true, filePath: result.filePath }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Export failed' }
      }
    }
  )

  // C9: Export with metadata embedded in PNG tEXt chunks
  ipcMain.handle(
    'image:export-metadata',
    async (_event, { base64DataUrl, defaultName, metadata }: { base64DataUrl: string; defaultName: string; metadata?: Record<string, string> }) => {
      try {
        const result = await dialog.showSaveDialog({
          defaultPath: defaultName,
          filters: [{ name: 'Images', extensions: ['png', 'jpg', 'webp'] }]
        })
        if (result.canceled || !result.filePath) {
          return { success: false, cancelled: true }
        }

        const match = base64DataUrl.match(/^data:image\/\w+;base64,(.+)$/)
        if (!match) throw new Error('Invalid image data')

        let buffer: Buffer = Buffer.from(match[1], 'base64')

        // Embed metadata in PNG tEXt chunks if applicable
        if (metadata && result.filePath.toLowerCase().endsWith('.png')) {
          buffer = embedPngTextChunks(buffer, metadata)
        }

        await writeFile(result.filePath, buffer)
        return { success: true, filePath: result.filePath }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Export failed' }
      }
    }
  )

  // Video export: copy file directly (no Canvas conversion)
  ipcMain.handle(
    IPC_CHANNELS.VIDEO_EXPORT,
    async (_event, { filePath, defaultName }: { filePath: string; defaultName: string }) => {
      try {
        const { copyFile } = await import('fs/promises')
        const sourceExtension = extname(filePath).slice(1).toLowerCase()
        const extension = ['mp4', 'webm', 'mov'].includes(sourceExtension) ? sourceExtension : 'mp4'
        const result = await dialog.showSaveDialog({
          defaultPath: `${defaultName.replace(/\.[^.]+$/, '')}.${extension}`,
          filters: [{ name: 'Videos', extensions: [extension] }]
        })
        if (result.canceled || !result.filePath) {
          return { success: false, cancelled: true }
        }
        await copyFile(filePath, result.filePath)
        return { success: true, filePath: result.filePath }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Export failed' }
      }
    }
  )

  ipcMain.on(IPC_CHANNELS.IMAGE_START_DRAG, (event, filePath: string) => {
    try {
      const icon = nativeImage.createFromPath(filePath).resize({ width: 128 })
      event.sender.startDrag({ file: filePath, icon })
    } catch {
      // silently fail drag
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.IMAGE_READ,
    async (_event, { filePath }: { filePath: string }) => {
      try {
        const base64DataUrl = await readImageAsBase64(filePath)
        return { success: true, base64DataUrl }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Read failed' }
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.IMAGE_DELETE,
    async (_event, { filePath }: { filePath: string }) => {
      try {
        await deleteImage(filePath)
        return { success: true }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Delete failed' }
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.MIGRATE_RUN, async () => {
    try {
      await migrateGalleryHistory()
      await migrateChatHistory()
      await migrateCollectionsHistory()
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Migration failed' }
    }
  })

}
