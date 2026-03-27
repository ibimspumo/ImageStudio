import { app } from 'electron'
import { join } from 'path'
import { writeFile, mkdir, readdir, readFile, unlink } from 'fs/promises'
import { existsSync } from 'fs'

function getBasePath(): string {
  const base = join(app.getPath('userData'), 'ImageStudio')
  console.log('[ImageStore] basePath:', base, '| userData:', app.getPath('userData'))
  return base
}

function getImagesPath(): string {
  return join(getBasePath(), 'images')
}

function getHistoryPath(): string {
  return join(getBasePath(), 'history')
}

export async function ensureDirectories(): Promise<void> {
  const dirs = [getBasePath(), getImagesPath(), getHistoryPath()]
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true })
    }
  }
}

export async function saveImage(base64DataUrl: string, filename: string): Promise<string> {
  await ensureDirectories()
  const match = base64DataUrl.match(/^data:image\/(\w+);base64,(.+)$/)
  if (!match) throw new Error('Invalid base64 data URL')

  const buffer = Buffer.from(match[2], 'base64')
  const filePath = join(getImagesPath(), filename)
  await writeFile(filePath, buffer)
  return filePath
}

export async function saveImageBuffer(buffer: Buffer, filename: string): Promise<string> {
  await ensureDirectories()
  const filePath = join(getImagesPath(), filename)
  await writeFile(filePath, buffer)
  return filePath
}

function getVideosPath(): string {
  return join(getBasePath(), 'videos')
}

export async function saveVideoFile(buffer: Buffer, filename: string): Promise<string> {
  const videosDir = getVideosPath()
  if (!existsSync(videosDir)) {
    await mkdir(videosDir, { recursive: true })
  }
  const filePath = join(videosDir, filename)
  await writeFile(filePath, buffer)
  return filePath
}

export async function loadHistory(): Promise<Array<{ id: string; data: string }>> {
  await ensureDirectories()
  const historyDir = getHistoryPath()
  const files = await readdir(historyDir)
  console.log('[ImageStore] loadHistory from:', historyDir, '| files:', files)
  const sessions: Array<{ id: string; data: string }> = []

  for (const file of files) {
    if (file.endsWith('.json')) {
      const data = await readFile(join(historyDir, file), 'utf-8')
      sessions.push({ id: file.replace('.json', ''), data })
    }
  }

  console.log('[ImageStore] loaded sessions:', sessions.map(s => `${s.id} (${s.data.length} chars)`))
  return sessions
}

export async function saveSession(id: string, data: string): Promise<void> {
  await ensureDirectories()
  await writeFile(join(getHistoryPath(), `${id}.json`), data, 'utf-8')
}

export async function deleteSession(id: string): Promise<void> {
  const filePath = join(getHistoryPath(), `${id}.json`)
  if (existsSync(filePath)) {
    await unlink(filePath)
  }
}

export function getImagesDir(): string {
  return getImagesPath()
}

export async function readImageAsBase64(filePath: string): Promise<string> {
  const buffer = await readFile(filePath)
  const ext = filePath.split('.').pop()?.toLowerCase() || 'png'
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif'
  }
  const mime = mimeMap[ext] || 'image/png'
  return `data:${mime};base64,${buffer.toString('base64')}`
}

export async function deleteImage(filePath: string): Promise<void> {
  if (existsSync(filePath)) {
    await unlink(filePath)
  }
}

export async function migrateGalleryHistory(): Promise<void> {
  await ensureDirectories()
  const galleryPath = join(getHistoryPath(), 'gallery.json')
  if (!existsSync(galleryPath)) return

  const raw = await readFile(galleryPath, 'utf-8')
  const images = JSON.parse(raw)
  let changed = false

  for (const img of images) {
    // Migrate main image base64 → filePath
    if (img.base64DataUrl && !img.filePath) {
      const match = img.base64DataUrl.match(/^data:image\/(\w+);base64,(.+)$/)
      if (!match) continue
      const ext = match[1] === 'jpeg' ? 'jpg' : match[1]
      const filename = `${img.id || Date.now()}.${ext}`
      const filePath = await saveImage(img.base64DataUrl, filename)
      img.filePath = filePath
      delete img.base64DataUrl
      changed = true
    }

    // Migrate base64 attachments → file paths
    if (Array.isArray(img.attachments)) {
      for (let i = 0; i < img.attachments.length; i++) {
        const att = img.attachments[i]
        if (typeof att === 'string' && att.startsWith('data:')) {
          const match = att.match(/^data:image\/(\w+);base64,(.+)$/)
          if (!match) continue
          const ext = match[1] === 'jpeg' ? 'jpg' : match[1]
          const filename = `att-${img.id}-${i}.${ext}`
          const filePath = await saveImage(att, filename)
          img.attachments[i] = filePath
          changed = true
        }
      }
    }
  }

  if (changed) {
    await writeFile(galleryPath, JSON.stringify(images), 'utf-8')
  }
}

export async function migrateChatHistory(): Promise<void> {
  await ensureDirectories()
  const chatPath = join(getHistoryPath(), 'image-chats.json')
  if (!existsSync(chatPath)) return

  const raw = await readFile(chatPath, 'utf-8')
  const chats = JSON.parse(raw)
  let changed = false

  for (const chat of chats) {
    // Migrate sourceImageBase64 → sourceImageFilePath
    if (chat.sourceImageBase64 && !chat.sourceImageFilePath) {
      const filename = `chat-source-${chat.id || Date.now()}.png`
      const filePath = await saveImage(chat.sourceImageBase64, filename)
      chat.sourceImageFilePath = filePath
      delete chat.sourceImageBase64
      changed = true
    }

    // Migrate message imageBase64 → imageFilePath
    if (Array.isArray(chat.messages)) {
      for (const msg of chat.messages) {
        if (msg.imageBase64 && !msg.imageFilePath) {
          const filename = `chat-msg-${msg.id || Date.now()}.png`
          const filePath = await saveImage(msg.imageBase64, filename)
          msg.imageFilePath = filePath
          delete msg.imageBase64
          changed = true
        }
        // Migrate base64 attachments in messages
        if (Array.isArray(msg.attachments)) {
          for (let i = 0; i < msg.attachments.length; i++) {
            const att = msg.attachments[i]
            if (typeof att === 'string' && att.startsWith('data:')) {
              const match = att.match(/^data:image\/(\w+);base64,(.+)$/)
              if (!match) continue
              const ext = match[1] === 'jpeg' ? 'jpg' : match[1]
              const filename = `chat-att-${msg.id}-${i}.${ext}`
              const filePath = await saveImage(att, filename)
              msg.attachments[i] = filePath
              changed = true
            }
          }
        }
      }
    }
  }

  if (changed) {
    await writeFile(chatPath, JSON.stringify(chats), 'utf-8')
  }
}

export async function migrateCollectionsHistory(): Promise<void> {
  await ensureDirectories()
  const collectionsPath = join(getHistoryPath(), 'collections.json')
  if (!existsSync(collectionsPath)) return

  const raw = await readFile(collectionsPath, 'utf-8')
  const collections = JSON.parse(raw)
  let changed = false

  for (const collection of collections) {
    if (Array.isArray(collection.images)) {
      for (let i = 0; i < collection.images.length; i++) {
        const img = collection.images[i]
        if (typeof img === 'string' && img.startsWith('data:')) {
          const match = img.match(/^data:image\/(\w+);base64,(.+)$/)
          if (!match) continue
          const ext = match[1] === 'jpeg' ? 'jpg' : match[1]
          const filename = `col-${collection.id}-${i}.${ext}`
          const filePath = await saveImage(img, filename)
          collection.images[i] = filePath
          changed = true
        }
      }
    }
  }

  if (changed) {
    await writeFile(collectionsPath, JSON.stringify(collections), 'utf-8')
  }
}
