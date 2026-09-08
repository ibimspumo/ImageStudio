import { nativeImage } from 'electron'
import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { embedPngTextChunks } from '../services/png-metadata'

const MAX_MEDIA_BYTES = 250 * 1024 * 1024
type MediaFormat = { kind: 'image' | 'video'; mimeType: string; extension: string }

function detectFormat(data: Buffer): MediaFormat {
  if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { kind: 'image', mimeType: 'image/png', extension: 'png' }
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return { kind: 'image', mimeType: 'image/jpeg', extension: 'jpg' }
  if (/^GIF8[79]a$/.test(data.toString('ascii', 0, 6))) return { kind: 'image', mimeType: 'image/gif', extension: 'gif' }
  if (data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') return { kind: 'image', mimeType: 'image/webp', extension: 'webp' }
  if (data.toString('ascii', 4, 8) === 'ftyp') {
    const brands = data.toString('ascii', 8, Math.min(data.length, 40))
    if (/avif|avis/.test(brands)) throw new Error('AVIF import is not supported. Convert it to PNG or JPEG first.')
    if (/heic|heix|hevc|hevx|mif1/.test(brands)) throw new Error('HEIC is not supported. Convert it to PNG or JPEG first.')
    return { kind: 'video', mimeType: /qt  /.test(brands) ? 'video/quicktime' : 'video/mp4', extension: /qt  /.test(brands) ? 'mov' : 'mp4' }
  }
  if (data.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) && data.subarray(0, 4096).includes(Buffer.from('webm'))) return { kind: 'video', mimeType: 'video/webm', extension: 'webm' }
  throw new Error('Unsupported media. Use PNG, JPEG, GIF, WebP, MP4, MOV, or WebM.')
}

async function downloadMedia(source: string): Promise<Buffer> {
  const url = new URL(source)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP(S) URL without embedded credentials.')
  const response = await fetch(url, { signal: AbortSignal.timeout(90_000) })
  if (!response.ok || !response.body) throw new Error(`Media download failed (${response.status}).`)
  if (Number(response.headers.get('content-length')) > MAX_MEDIA_BYTES) { await response.body.cancel(); throw new Error('Media exceeds 250 MB.') }
  const chunks: Buffer[] = []
  let size = 0
  const reader = response.body.getReader()
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > MAX_MEDIA_BYTES) { await reader.cancel(); throw new Error('Media exceeds 250 MB.') }
      chunks.push(Buffer.from(part.value))
    }
  } finally { reader.releaseLock() }
  return Buffer.concat(chunks)
}

export function createAutomationMedia(userDataPath: string) {
  const basePath = join(userDataPath, 'ImageStudio')
  async function ownedFile(filePath: unknown): Promise<string> {
    if (typeof filePath !== 'string' || !isAbsolute(filePath)) throw new Error('An absolute media filePath is required.')
    const resolved = await realpath(filePath)
    const roots = await Promise.all(['images', 'videos'].map(async (folder) => {
      const root = join(basePath, folder)
      await mkdir(root, { recursive: true })
      return realpath(root)
    }))
    if (!roots.some((root) => { const rel = relative(root, resolved); return rel !== '' && !rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel) })) throw new Error('Only media in the ImageStudio library can be read or exported. Import external files first.')
    return resolved
  }

  return {
    async importMedia(input: { source: string; name?: string }) {
      if (!input || typeof input.source !== 'string' || !input.source.trim()) throw new Error('A media source (absolute path or HTTP(S) URL) is required.')
      const source = input.source.trim()
      let data: Buffer
      if (/^https?:\/\//i.test(source)) data = await downloadMedia(source)
      else {
        const filePath = source.startsWith('file:') ? fileURLToPath(source) : source
        if (!isAbsolute(filePath)) throw new Error('Use an absolute local path or HTTP(S) URL.')
        const info = await stat(filePath)
        if (!info.isFile() || info.size > MAX_MEDIA_BYTES) throw new Error('Source must be a file of at most 250 MB.')
        data = await readFile(filePath)
      }
      const format = detectFormat(data)
      const directory = join(basePath, format.kind === 'video' ? 'videos' : 'images')
      await mkdir(directory, { recursive: true })
      const filePath = join(directory, `import-${randomUUID()}.${format.extension}`)
      await writeFile(filePath, data, { flag: 'wx' })
      const dimensions = format.kind === 'image' ? nativeImage.createFromBuffer(data).getSize() : undefined
      return { success: true as const, filePath, kind: format.kind, mimeType: format.mimeType, size: data.length, name: typeof input.name === 'string' ? input.name : basename(new URL(source, 'file:///').pathname), ...(dimensions?.width ? dimensions : {}) }
    },
    async readMedia(input: { filePath: string }) {
      const filePath = await ownedFile(input?.filePath)
      const info = await stat(filePath)
      const handle = await import('node:fs/promises').then(({ open }) => open(filePath, 'r'))
      let format: MediaFormat
      try { const header = Buffer.alloc(4096); const { bytesRead } = await handle.read(header, 0, header.length, 0); format = detectFormat(header.subarray(0, bytesRead)) } finally { await handle.close() }
      return { success: true as const, filePath, uri: pathToFileURL(filePath).href, kind: format.kind, mimeType: format.mimeType, size: info.size }
    },
    async exportMedia(input: { filePath: string; destination: string; overwrite?: boolean; metadata?: Record<string, string> }) {
      const filePath = await ownedFile(input?.filePath)
      if (typeof input.destination !== 'string' || !isAbsolute(input.destination)) throw new Error('An absolute destination file path is required.')
      if (input.overwrite !== undefined && typeof input.overwrite !== 'boolean') throw new Error('overwrite must be a boolean.')
      // Validate the source before permitting export from the media directory.
      const media = await this.readMedia({ filePath })
      if (input.metadata && (typeof input.metadata !== 'object' || Array.isArray(input.metadata) || Object.values(input.metadata).some((value) => typeof value !== 'string'))) throw new Error('metadata must map string keys to string values.')
      await mkdir(dirname(input.destination), { recursive: true })
      if (input.metadata && media.mimeType === 'image/png') {
        const data = embedPngTextChunks(await readFile(filePath), input.metadata)
        await writeFile(input.destination, data, { flag: input.overwrite ? 'w' : 'wx' })
      } else await copyFile(filePath, input.destination, input.overwrite ? 0 : constants.COPYFILE_EXCL)
      return { success: true as const, filePath: input.destination, size: (await stat(input.destination)).size }
    }
  }
}
