import { app } from 'electron'
import { join } from 'path'
import { writeFile, mkdir, readdir, readFile, unlink } from 'fs/promises'
import { existsSync } from 'fs'

function getBasePath(): string {
  return join(app.getPath('userData'), 'ImageStudio')
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

export async function loadHistory(): Promise<Array<{ id: string; data: string }>> {
  await ensureDirectories()
  const historyDir = getHistoryPath()
  const files = await readdir(historyDir)
  const sessions: Array<{ id: string; data: string }> = []

  for (const file of files) {
    if (file.endsWith('.json')) {
      const data = await readFile(join(historyDir, file), 'utf-8')
      sessions.push({ id: file.replace('.json', ''), data })
    }
  }

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
