import { randomUUID } from 'node:crypto'
import type { IpcMainEvent, IpcMainInvokeEvent, WebContents } from 'electron'
import type { AutomationDispatch } from './server'

type Pending = { resolve: (result: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }

/** Keep UI actions on the same hydrated store instances as the human interface. */
export class AutomationBridge {
  private contents?: WebContents
  private expectedUrl = ''
  private ready = false
  private pending = new Map<string, Pending>()

  constructor(private timeoutMs = 120_000) {}

  attach(contents: WebContents, expectedUrl: string): void {
    this.invalidate('ImageStudio window changed. Check job status before retrying a mutation.')
    this.contents = contents
    this.expectedUrl = expectedUrl
    contents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
      if (this.contents === contents && isMainFrame && !isInPlace) this.invalidate('ImageStudio is reloading. Check job status before retrying a mutation.')
    })
    contents.on('render-process-gone', () => {
      if (this.contents === contents) this.invalidate('ImageStudio renderer stopped.')
    })
    contents.on('destroyed', () => {
      if (this.contents === contents) {
        this.invalidate('ImageStudio window closed.')
        this.contents = undefined
      }
    })
  }

  isTrusted(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
    if (!this.contents || this.contents.isDestroyed() || event.sender !== this.contents || event.senderFrame !== this.contents.mainFrame) return false
    try {
      const actual = new URL(event.senderFrame.url)
      const expected = new URL(this.expectedUrl)
      return actual.protocol === expected.protocol && actual.host === expected.host && actual.pathname === expected.pathname
    } catch { return false }
  }

  markReady(event: IpcMainEvent): void {
    if (this.isTrusted(event)) this.ready = true
  }

  get rendererReady(): boolean { return this.ready && !!this.contents && !this.contents.isDestroyed() }

  reply(event: IpcMainEvent, payload: unknown): void {
    if (!this.isTrusted(event) || !payload || typeof payload !== 'object' || !('id' in payload) || typeof payload.id !== 'string') return
    const entry = this.pending.get(payload.id)
    if (!entry) return
    clearTimeout(entry.timer)
    this.pending.delete(payload.id)
    if ('error' in payload && payload.error != null) {
      const error = payload.error
      entry.reject(new Error(typeof error === 'string' ? error : typeof error === 'object' && 'message' in error ? String(error.message) : 'ImageStudio tool failed.'))
    } else entry.resolve('result' in payload ? payload.result : undefined)
  }

  invalidate(message: string): void {
    this.ready = false
    this.cancelPending(message)
  }

  cancelPending(message: string): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer)
      entry.reject(new Error(message))
    }
    this.pending.clear()
  }

  dispatch: AutomationDispatch = (method, params) => {
    if (!this.rendererReady) return Promise.reject(new Error('ImageStudio is not ready. Open its main window and wait for it to load.'))
    if (this.pending.size >= 64) return Promise.reject(new Error('Too many active ImageStudio requests. Wait for current requests to complete.'))
    const id = randomUUID()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('ImageStudio request timed out. The action may still be running; inspect job status before retrying.'))
      }, this.timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      try { this.contents!.send('automation:request', { id, method, params }) } catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(error)
      }
    })
  }
}
