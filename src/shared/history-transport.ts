// Bound each IPC payload well below Electron's message and heap limits.
export const HISTORY_CHUNK_SIZE = 1024 * 1024

type Reply = { success: boolean; error?: string; ids?: string[]; token?: string; data?: Uint8Array; done?: boolean }
type Invoke = (request: { action: string; id?: string; token?: string; data?: string }) => Promise<Reply>

/** Preserve the renderer API while transporting each history separately in chunks. */
export function createHistoryClient(invoke: Invoke) {
  const writes = new Map<string, Promise<{ success: boolean; error?: string }>>()
  async function checked(request: Parameters<Invoke>[0]) {
    const reply = await invoke(request)
    if (!reply.success) throw new Error(reply.error || 'History transfer failed')
    return reply
  }
  return {
    async listHistory(id?: string) {
      try {
        const listing = await checked({ action: 'list', id })
        const sessions: Array<{ id: string; data: string }> = []
        for (const sessionId of listing.ids || []) {
          const { token } = await checked({ action: 'open-read', id: sessionId })
          try {
            const decoder = new TextDecoder()
            const chunks: string[] = []
            for (;;) {
              const reply = await checked({ action: 'read', token })
              if (reply.done) break
              chunks.push(decoder.decode(reply.data, { stream: true }))
            }
            chunks.push(decoder.decode())
            sessions.push({ id: sessionId, data: chunks.join('') })
          } finally {
            await invoke({ action: 'close', token })
          }
        }
        return { success: true, sessions }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to load history' }
      }
    },
    saveHistory(id: string, data: string) {
      // A later small save must never overtake an earlier large save of this ID.
      const operation = (writes.get(id) || Promise.resolve()).then(async () => {
        let token: string | undefined
        try {
          token = (await checked({ action: 'open-write', id })).token
          for (let offset = 0; offset < data.length;) {
            let end = Math.min(offset + HISTORY_CHUNK_SIZE, data.length)
            // Do not split an astral Unicode character before UTF-8 encoding.
            const last = data.charCodeAt(end - 1)
            if (end < data.length && last >= 0xd800 && last <= 0xdbff) end--
            await checked({ action: 'append', token, data: data.slice(offset, end) })
            offset = end
          }
          await checked({ action: 'commit', token })
          return { success: true }
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Failed to save history' }
        } finally {
          if (token) await invoke({ action: 'close', token }).catch(() => {})
        }
      })
      writes.set(id, operation)
      void operation.then(() => { if (writes.get(id) === operation) writes.delete(id) })
      return operation
    },
  }
}
