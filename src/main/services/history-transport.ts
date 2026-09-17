import { open, mkdir, readdir, rename, unlink } from 'fs/promises'
import type { FileHandle } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { HISTORY_CHUNK_SIZE } from '../../shared/history-transport'

interface Transfer {
  owner: number
  handle: FileHandle
  mode: 'read' | 'write'
  path: string
  destination?: string
  position: number
  timer: ReturnType<typeof setTimeout>
}

/** Disk-backed transfers keep entire histories out of main-process IPC buffers. */
export function createHistoryTransport(directory: () => string) {
  const transfers = new Map<string, Transfer>()
  const validId = (id: unknown): string => {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid history ID')
    return id
  }
  async function dispose(token: string) {
    const transfer = transfers.get(token)
    if (!transfer) return
    transfers.delete(token)
    clearTimeout(transfer.timer)
    await transfer.handle.close()
    if (transfer.mode === 'write') await unlink(transfer.path).catch(() => {})
  }
  function touch(token: string, transfer: Transfer) {
    clearTimeout(transfer.timer)
    transfer.timer = setTimeout(() => { void dispose(token).catch(() => {}) }, 60_000)
    transfer.timer.unref()
  }
  return {
    async closeOwner(owner: number) {
      await Promise.all([...transfers].filter(([, value]) => value.owner === owner).map(([token]) => dispose(token)))
    },
    async invoke(owner: number, request: { action: string; id?: string; token?: string; data?: string }) {
      try {
        if (request.action === 'list') {
          await mkdir(directory(), { recursive: true })
          const ids = (await readdir(directory())).filter(name => name.endsWith('.json')).map(name => name.slice(0, -5))
          return { success: true, ids: request.id === undefined ? ids : ids.filter(id => id === validId(request.id)) }
        }
        if (request.action === 'open-read' || request.action === 'open-write') {
          const id = validId(request.id)
          const token = randomUUID()
          await mkdir(directory(), { recursive: true })
          const destination = join(directory(), `${id}.json`)
          const writing = request.action === 'open-write'
          const path = writing ? join(directory(), `.${id}-${token}.tmp`) : destination
          const handle = await open(path, writing ? 'wx' : 'r')
          const transfer = { owner, handle, mode: writing ? 'write' : 'read', path, destination, position: 0 } as Transfer
          transfers.set(token, transfer)
          touch(token, transfer)
          return { success: true, token }
        }
        const token = request.token || ''
        const transfer = transfers.get(token)
        if (!transfer || transfer.owner !== owner) throw new Error('History transfer expired or unavailable; retry the operation')
        touch(token, transfer)
        if (request.action === 'close') {
          await dispose(token)
        } else if (request.action === 'read' && transfer.mode === 'read') {
          const buffer = Buffer.allocUnsafe(HISTORY_CHUNK_SIZE)
          const { bytesRead } = await transfer.handle.read(buffer, 0, buffer.length, transfer.position)
          transfer.position += bytesRead
          return { success: true, data: buffer.subarray(0, bytesRead), done: bytesRead === 0 }
        } else if (request.action === 'append' && transfer.mode === 'write') {
          if (typeof request.data !== 'string' || request.data.length > HISTORY_CHUNK_SIZE) throw new Error('Invalid history chunk')
          const buffer = Buffer.from(request.data, 'utf8')
          let offset = 0
          while (offset < buffer.length) {
            const { bytesWritten } = await transfer.handle.write(buffer, offset, buffer.length - offset)
            if (!bytesWritten) throw new Error('Could not write history chunk')
            offset += bytesWritten
          }
        } else if (request.action === 'commit' && transfer.mode === 'write') {
          await transfer.handle.sync()
          await transfer.handle.close()
          await rename(transfer.path, transfer.destination!)
          clearTimeout(transfer.timer)
          transfers.delete(token)
        } else {
          throw new Error('Invalid history transfer action')
        }
        return { success: true }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'History transfer failed' }
      }
    },
  }
}
