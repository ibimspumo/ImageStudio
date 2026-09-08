import { app, ipcMain, type WebContents } from 'electron'
import { randomBytes } from 'node:crypto'
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Server } from 'node:http'
import type { AutomationStatus } from '../../shared/automation'
import { AutomationBridge } from './bridge'
import { closeAutomationServer, createAutomationHttpServer, listenAutomationServer } from './server'
import { createSetupPrompt } from './setup'
import { createAutomationMedia } from './media'

type Configuration = { enabled: boolean; port: number; token: string }
const DEFAULT_PORT = 48765
const validPort = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1024 && value <= 65535

export class AutomationService {
  private config: Configuration = { enabled: false, port: DEFAULT_PORT, token: randomBytes(32).toString('hex') }
  private server?: Server
  private error?: string
  private configurationQueue: Promise<unknown> = Promise.resolve()
  readonly bridge = new AutomationBridge()

  constructor(private userDataPath: string, private version: string) {}

  async initialize(): Promise<void> {
    try {
      const raw = JSON.parse(await readFile(join(this.userDataPath, 'automation.json'), 'utf8'))
      if (typeof raw.enabled !== 'boolean' || !validPort(raw.port) || typeof raw.token !== 'string' || !/^[a-f0-9]{64}$/.test(raw.token)) throw new Error('Invalid saved AI connection settings.')
      this.config = { enabled: raw.enabled, port: raw.port, token: raw.token }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.error = 'Saved AI connection settings were invalid; the connection has been disabled.'
    }
    try { await this.persist() } catch { this.config.enabled = false; this.error = 'AI connection settings could not be saved. Check application storage permissions.' }
    if (this.config.enabled) await this.start()
  }

  private async persist(): Promise<void> {
    await mkdir(this.userDataPath, { recursive: true })
    const destination = join(this.userDataPath, 'automation.json')
    const temporary = `${destination}.tmp`
    await writeFile(temporary, JSON.stringify(this.config, null, 2), { mode: 0o600 })
    await chmod(temporary, 0o600)
    await rename(temporary, destination)
  }

  get status(): AutomationStatus {
    return { enabled: this.config.enabled, running: !!this.server?.listening, port: this.config.port, url: `http://127.0.0.1:${this.config.port}/mcp`, token: this.config.token, setupPrompt: createSetupPrompt(this.config.port, this.config.token), rendererReady: this.bridge.rendererReady, ...(this.error ? { error: this.error } : {}) }
  }

  attach(contents: WebContents, expectedUrl: string): void { this.bridge.attach(contents, expectedUrl) }

  private async start(): Promise<void> {
    const server = createAutomationHttpServer({ port: this.config.port, version: this.version, token: () => this.config.token, rendererReady: () => this.bridge.rendererReady, dispatch: this.bridge.dispatch })
    try {
      await listenAutomationServer(server, this.config.port)
      this.server = server
      this.error = undefined
      server.on('error', () => { this.error = 'The local AI connection encountered a network error. Toggle the connection to retry.' })
    } catch (error) {
      this.error = (error as NodeJS.ErrnoException).code === 'EADDRINUSE' ? `Port ${this.config.port} is already in use. Select another port in AI connection settings.` : 'The local AI server could not start. Check the port and try again.'
      await closeAutomationServer(server)
    }
  }

  async stop(): Promise<void> {
    this.bridge.cancelPending('AI connection settings changed. The action may still be running; inspect job status before retrying.')
    const server = this.server
    this.server = undefined
    if (server) await closeAutomationServer(server)
  }

  configure(input: unknown, rotateToken = false): Promise<AutomationStatus> {
    const change = async () => {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected AI connection settings.')
      const update = input as Record<string, unknown>
      if (Object.keys(update).some((key) => !['enabled', 'port'].includes(key))) throw new Error('Unknown AI connection setting.')
      if (update.enabled !== undefined && typeof update.enabled !== 'boolean') throw new Error('enabled must be a boolean.')
      if (update.port !== undefined && !validPort(update.port)) throw new Error('Port must be an integer between 1024 and 65535.')
      const previous = this.config
      this.config = { enabled: typeof update.enabled === 'boolean' ? update.enabled : previous.enabled, port: validPort(update.port) ? update.port : previous.port, token: rotateToken ? randomBytes(32).toString('hex') : previous.token }
      try { await this.persist() } catch (error) { this.config = previous; throw error }
      await this.stop()
      this.error = undefined
      if (this.config.enabled) await this.start()
      return this.status
    }
    const result = this.configurationQueue.then(change, change)
    this.configurationQueue = result.catch(() => {})
    return result
  }

  registerIpc(): void {
    const trusted = (event: Parameters<AutomationBridge['isTrusted']>[0]) => {
      if (!this.bridge.isTrusted(event)) throw new Error('AI connection settings are only available to the ImageStudio main window.')
    }
    ipcMain.handle('automation:get-status', (event) => { trusted(event); return this.status })
    ipcMain.handle('automation:configure', (event, input) => { trusted(event); return this.configure(input) })
    ipcMain.handle('automation:rotate-token', (event) => { trusted(event); return this.configure({}, true) })
    ipcMain.on('automation:ready', (event) => this.bridge.markReady(event))
    ipcMain.on('automation:reply', (event, payload) => this.bridge.reply(event, payload))
    const media = createAutomationMedia(this.userDataPath)
    ipcMain.handle('automation:import-media', (event, input) => { trusted(event); return media.importMedia(input) })
    ipcMain.handle('automation:read-media', (event, input) => { trusted(event); return media.readMedia(input) })
    ipcMain.handle('automation:export-media', (event, input) => { trusted(event); return media.exportMedia(input) })
  }
}

let service: AutomationService | undefined
export async function initializeAutomation(version: string): Promise<AutomationService> {
  service = new AutomationService(app.getPath('userData'), version)
  await service.initialize()
  service.registerIpc()
  app.on('before-quit', () => {
    service?.bridge.invalidate('ImageStudio is shutting down.')
    void service?.stop()
  })
  return service
}
