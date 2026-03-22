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

/**
 * Embed metadata as PNG tEXt chunks.
 * PNG format: 8-byte signature, then chunks (length + type + data + CRC).
 * We insert tEXt chunks before the IEND chunk.
 */
function embedPngTextChunks(pngBuffer: Buffer, metadata: Record<string, string>): Buffer {
  // Verify PNG signature
  const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  if (pngBuffer.subarray(0, 8).compare(PNG_SIGNATURE) !== 0) {
    return pngBuffer // Not a valid PNG, return as-is
  }

  // Find IEND chunk position
  let pos = 8
  let iendPos = -1
  while (pos < pngBuffer.length - 4) {
    const length = pngBuffer.readUInt32BE(pos)
    const type = pngBuffer.subarray(pos + 4, pos + 8).toString('ascii')
    if (type === 'IEND') {
      iendPos = pos
      break
    }
    pos += 12 + length // 4 (length) + 4 (type) + data + 4 (CRC)
  }

  if (iendPos === -1) return pngBuffer

  // Build tEXt chunks
  const textChunks: Buffer[] = []
  for (const [key, value] of Object.entries(metadata)) {
    const keyword = `ImageStudio:${key}`
    const keyBuf = Buffer.from(keyword, 'latin1')
    const nullSep = Buffer.from([0])
    const valBuf = Buffer.from(value, 'latin1')
    const chunkData = Buffer.concat([keyBuf, nullSep, valBuf])

    const chunkType = Buffer.from('tEXt', 'ascii')
    const lengthBuf = Buffer.alloc(4)
    lengthBuf.writeUInt32BE(chunkData.length)

    // CRC over type + data
    const crc = crc32(Buffer.concat([chunkType, chunkData]))
    const crcBuf = Buffer.alloc(4)
    crcBuf.writeUInt32BE(crc >>> 0)

    textChunks.push(Buffer.concat([lengthBuf, chunkType, chunkData, crcBuf]))
  }

  // Reassemble: everything before IEND + new chunks + IEND chunk
  const beforeIend = pngBuffer.subarray(0, iendPos)
  const iendChunk = pngBuffer.subarray(iendPos)
  return Buffer.concat([beforeIend, ...textChunks, iendChunk])
}

/** CRC-32 implementation for PNG chunks */
function crc32(buf: Buffer): number {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0)
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

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

        let buffer = Buffer.from(match[1], 'base64')

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
