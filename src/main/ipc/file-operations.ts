import { ipcMain, dialog, nativeImage } from 'electron'
import { writeFile } from 'fs/promises'
import { join } from 'path'
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
