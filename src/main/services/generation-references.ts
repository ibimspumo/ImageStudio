import { createHash, randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join } from 'node:path'

export interface GenerationReferences {
  attachments?: string[]
  labeledAttachments?: { label: string; images: string[] }[]
}

/** Retain original bytes once. Paths and URLs are already references and stay unchanged. */
export async function retainGenerationReferences(directory: string, input: GenerationReferences): Promise<GenerationReferences> {
  const retain = async (value: string): Promise<string> => {
    if (typeof value !== 'string') throw new Error('Reference must be an image data URL or path')
    if (!value.startsWith('data:')) return value
    const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(value)
    if (!match) throw new Error('Invalid reference image data URL')
    const encoded = match[2].replace(/\s/g, '')
    const bytes = Buffer.from(encoded, 'base64')
    if (!bytes.length || bytes.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '')) {
      throw new Error('Invalid reference image base64')
    }
    const mime = match[1].toLowerCase()
    const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/svg+xml': 'svg', 'image/x-icon': 'ico' }
    const extension = extensions[mime] || mime.slice(6)
    const digest = createHash('sha256').update(mime).update('\0').update(bytes).digest('hex')
    const path = join(directory, `reference-${digest}.${extension}`)
    await mkdir(directory, { recursive: true })
    try {
      // Verify content before reuse, including recovery from an interrupted old write.
      const existing = await readFile(path)
      if (existing.equals(bytes)) return path
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const staging = `${path}.${randomUUID()}.tmp`
    try {
      await writeFile(staging, bytes, { flag: 'wx' })
      await rename(staging, path)
    } finally {
      await unlink(staging).catch(() => {})
    }
    return path
  }
  const result: GenerationReferences = {}
  if (input.attachments !== undefined) {
    result.attachments = []
    for (const value of input.attachments) result.attachments.push(await retain(value))
  }
  if (input.labeledAttachments !== undefined) {
    result.labeledAttachments = []
    for (const group of input.labeledAttachments) {
      const images: string[] = []
      for (const value of group.images) images.push(await retain(value))
      result.labeledAttachments.push({ ...group, images })
    }
  }
  return result
}

/** Mutates only known inline image fields; order, labels and unrelated metadata survive. */
export async function externalizeGalleryReferences(images: any[], directory: string): Promise<boolean> {
  let changed = false
  for (const image of images) {
    for (const target of [image, image.generationOptions]) {
      if (!target || typeof target !== 'object') continue
      const hasInline = (Array.isArray(target.attachments) && target.attachments.some((value: unknown) => typeof value === 'string' && value.startsWith('data:')))
        || (Array.isArray(target.labeledAttachments) && target.labeledAttachments.some((group: any) => Array.isArray(group?.images) && group.images.some((value: unknown) => typeof value === 'string' && value.startsWith('data:'))))
      if (hasInline) {
        Object.assign(target, await retainGenerationReferences(directory, {
          ...(Array.isArray(target.attachments) ? { attachments: target.attachments } : {}),
          ...(Array.isArray(target.labeledAttachments) ? { labeledAttachments: target.labeledAttachments } : {})
        }))
        changed = true
      }
      if (typeof target.startFrameBase64 === 'string' && target.startFrameBase64.startsWith('data:')) {
        target.startFrameBase64 = (await retainGenerationReferences(directory, { attachments: [target.startFrameBase64] })).attachments![0]
        changed = true
      }
    }
  }
  return changed
}

/** Preserve the byte-exact original once; replacement becomes visible only after a full write. */
export async function replaceMigratedGallery(path: string, images: unknown[]): Promise<void> {
  const backup = `${path}.pre-reference-files.backup`
  try {
    await copyFile(path, backup, constants.COPYFILE_EXCL)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
  const staging = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(staging, JSON.stringify(images), { flag: 'wx' })
    await rename(staging, path)
  } finally {
    await unlink(staging).catch(() => {})
  }
}
