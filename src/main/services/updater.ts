/**
 * App updates from GitHub Releases.
 *
 * Two install paths, because macOS and Windows genuinely differ:
 *
 * - **Windows** uses electron-updater end to end: check → download with
 *   progress → install on quit. NSIS accepts unsigned installers.
 * - **macOS** uses Squirrel for Developer ID builds. Ad-hoc builds use a
 *   verified ZIP and a same-user staged replacement helper for writable apps.
 *   Read-only/translocated installations keep the manual DMG fallback.
 *
 * An unpackaged (dev) build can check but never install.
 */

import { app, BrowserWindow, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { execFile } from 'child_process'
import { createWriteStream } from 'fs'
import { mkdir, stat, unlink, readFile } from 'fs/promises'
import { join } from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { IPC_CHANNELS } from '../lib/constants'
import { writableMacBundle, prepareMacUpdate, launchMacInstaller, type PreparedMacUpdate } from './mac-update'
import { isNewerVersion } from '../../shared/version'

declare const __APP_VERSION__: string

/** Baked in at build time — app.getVersion() returns Electron's version in dev. */
const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : app.getVersion()

export const GITHUB_OWNER = 'ibimspumo'
export const GITHUB_REPO = 'ImageStudio'

const IS_MAC = process.platform === 'darwin'

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error'

/** How the downloaded update gets applied on this platform. */
export type InstallMode =
  /** electron-updater restarts the app and installs it */
  | 'restart'
  | 'replace-app'
  /** the disk image is opened and the user drags the app across */
  | 'open-installer'
  /** dev build — nothing can be installed */
  | 'none'

export interface UpdateStatus {
  state: UpdateState
  currentVersion: string
  /** Version found on GitHub, when newer than the running one. */
  version?: string
  releaseNotes?: string
  releaseUrl?: string
  /** 0–100 while downloading */
  progress?: number
  bytesPerSecond?: number
  transferred?: number
  total?: number
  error?: string
  /** Whether this build can download and apply an update at all. */
  canInstall: boolean
  installMode: InstallMode
  /** Where the downloaded installer landed (macOS). */
  downloadPath?: string
  installReason?: string
}

/**
 * True only when the running app carries a real Developer ID signature.
 * An ad-hoc signature pins the designated requirement to this exact binary's
 * cdhash, so Squirrel can never accept a different build as an update.
 */
let macSelfInstall: boolean | null = null

function macCanSelfInstall(): Promise<boolean> {
  if (macSelfInstall !== null) return Promise.resolve(macSelfInstall)

  return new Promise((resolve) => {
    execFile('codesign', ['-dv', '--verbose=2', app.getAppPath().replace(/\/Contents\/Resources\/app\.asar$/, '')], (err, _stdout, stderr) => {
      // codesign writes its report to stderr.
      const report = stderr || ''
      const hasTeam = /TeamIdentifier=(?!not set)/.test(report)
      const adhoc = /Signature=adhoc/.test(report)
      macSelfInstall = !err && hasTeam && !adhoc
      resolve(macSelfInstall)
    })
  })
}

function initialInstallMode(): InstallMode {
  if (!app.isPackaged) return 'none'
  return IS_MAC ? 'open-installer' : 'restart'
}

let status: UpdateStatus = {
  state: 'idle',
  currentVersion: APP_VERSION,
  canInstall: app.isPackaged,
  installMode: initialInstallMode(),
}

let wired = false
/** GitHub asset chosen for this platform, kept between check and download. */
let pendingAssetUrl: string | undefined
let pendingAssetName: string | undefined
let pendingAssetDigest: string | undefined
let replacementBundle: string | undefined
let preparedMacUpdate: PreparedMacUpdate | undefined

function broadcast(patch: Partial<UpdateStatus>): void {
  status = { ...status, ...patch }
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.UPDATE_STATUS, status)
  }
}

export function getUpdateStatus(): UpdateStatus {
  return status
}

function wireAutoUpdater(): void {
  if (wired) return
  wired = true

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    broadcast({ state: 'checking', error: undefined })
  })

  autoUpdater.on('update-available', (info) => {
    broadcast({
      state: 'available',
      version: info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
      releaseUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tag/v${info.version}`,
      error: undefined,
    })
  })

  autoUpdater.on('update-not-available', () => {
    broadcast({ state: 'not-available', version: undefined, error: undefined })
  })

  autoUpdater.on('download-progress', (progress) => {
    broadcast({
      state: 'downloading',
      progress: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    broadcast({ state: 'downloaded', version: info.version, progress: 100 })
  })

  autoUpdater.on('error', (err) => {
    broadcast({ state: 'error', error: err?.message || 'Update failed' })
  })
}

interface GitHubAsset {
  name: string
  browser_download_url: string
  size: number
  digest?: string
}

/** Pick the installer for this platform and architecture. */
function pickAsset(assets: GitHubAsset[]): GitHubAsset | undefined {
  if (IS_MAC) {
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
    if (replacementBundle) {
      const zip = assets.find((a) => a.name.endsWith('.zip') && !/win/i.test(a.name) && a.name.includes(arch) && /^sha256:[a-f0-9]{64}$/i.test(a.digest ?? ''))
      if (zip) return zip
    }
    return (
      assets.find((a) => a.name.endsWith('.dmg') && a.name.includes(arch)) ??
      assets.find((a) => a.name.endsWith('.dmg') && !/(arm64|x64)/.test(a.name))
    )
  }
  return (
    assets.find((a) => a.name.endsWith('.exe')) ??
    assets.find((a) => a.name.endsWith('.zip') && a.name.includes('win'))
  )
}

/**
 * Query the GitHub Releases API directly.
 * Used for dev builds and for macOS, where the download is handled here rather
 * than by electron-updater.
 */
async function checkViaGitHub(): Promise<UpdateStatus> {
  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
    { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ImageStudio' } }
  )

  if (response.status === 404) {
    broadcast({ state: 'not-available', error: undefined })
    return status
  }
  if (!response.ok) {
    throw new Error(`GitHub API error ${response.status}`)
  }

  const release = (await response.json()) as {
    tag_name?: string
    body?: string
    html_url?: string
    draft?: boolean
    assets?: GitHubAsset[]
  }

  const tag = (release.tag_name || '').replace(/^v/, '')
  if (!tag || release.draft) {
    broadcast({ state: 'not-available', error: undefined })
    return status
  }

  if (!isNewerVersion(tag, status.currentVersion)) {
    broadcast({ state: 'not-available', version: undefined, error: undefined })
    return status
  }

  const asset = pickAsset(release.assets ?? [])
  pendingAssetUrl = asset?.browser_download_url
  pendingAssetName = asset?.name
  pendingAssetDigest = asset?.digest
  if (IS_MAC && replacementBundle) {
    broadcast({ installMode: asset?.name.endsWith('.zip') ? 'replace-app' : 'open-installer', installReason: asset?.name.endsWith('.zip') ? undefined : 'Dieses Release enthält kein passendes ZIP mit SHA-256-Prüfsumme. Bitte verwende den manuellen Installer.' })
  }

  broadcast({
    state: 'available',
    version: tag,
    releaseNotes: release.body || undefined,
    releaseUrl: release.html_url,
    error: undefined,
  })

  return status
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  // A download in flight — or one already finished and waiting to be installed —
  // outranks a re-check. Without this the startup check would wipe the
  // "Restart & install" state a few seconds after the download completed.
  if (status.state === 'downloading' || status.state === 'downloaded' || status.state === 'installing') {
    return status
  }

  broadcast({ state: 'checking', error: undefined })

  // A signed macOS build can use the native path; an unsigned one cannot.
  const nativePath = app.isPackaged && (!IS_MAC || (await macCanSelfInstall()))

  try {
    if (nativePath) {
      broadcast({ installMode: 'restart' })
      wireAutoUpdater()

      let nativeFailed = false
      try {
        await autoUpdater.checkForUpdates()
        // The error event can fire without the promise rejecting.
        nativeFailed = status.state === 'error'
      } catch {
        nativeFailed = true
      }

      // Releases published without latest.yml/latest-mac.yml cannot be read by
      // electron-updater. Rather than dead-ending, fetch the installer directly
      // and let the user run it.
      if (nativeFailed) {
        console.warn('[Updater] No update manifest in the release, falling back to a direct download')
        broadcast({ state: 'checking', installMode: 'open-installer', error: undefined })
        await checkViaGitHub()
      }
    } else {
      replacementBundle = app.isPackaged && IS_MAC ? await writableMacBundle(process.execPath) : undefined
      broadcast({ installMode: app.isPackaged ? 'open-installer' : 'none', installReason: app.isPackaged && IS_MAC && !replacementBundle ? 'Die App liegt auf einem schreibgeschützten Volume oder der Installationsordner ist nicht beschreibbar. Bitte verwende den manuellen Installer.' : undefined })
      await checkViaGitHub()
    }
  } catch (err) {
    broadcast({ state: 'error', error: err instanceof Error ? err.message : 'Update check failed' })
  }

  return status
}

/** Download the release asset ourselves, reporting progress as it streams in. */
async function downloadAssetToDisk(): Promise<string> {
  if (!pendingAssetUrl || !pendingAssetName) {
    throw new Error('No downloadable installer found in the latest release.')
  }

  const targetDir = join(app.getPath('downloads'), 'ImageStudio Updates')
  if (pendingAssetName.includes('/') || pendingAssetName.includes('\\') || pendingAssetName === '..') throw new Error('Invalid release filename.')
  await mkdir(targetDir, { recursive: true })
  const targetPath = join(targetDir, pendingAssetName)

  const response = await fetch(pendingAssetUrl, {
    headers: { 'User-Agent': 'ImageStudio' },
    redirect: 'follow',
  })
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`)
  }

  const total = Number(response.headers.get('content-length')) || 0
  let transferred = 0
  const startedAt = Date.now()

  // Re-downloading over a partial file would corrupt it.
  await unlink(targetPath).catch(() => { /* not there yet */ })

  const source = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0])
  source.on('data', (chunk: Buffer) => {
    transferred += chunk.length
    const elapsed = (Date.now() - startedAt) / 1000
    broadcast({
      state: 'downloading',
      progress: total ? Math.round((transferred / total) * 100) : 0,
      transferred,
      total,
      bytesPerSecond: elapsed > 0 ? Math.round(transferred / elapsed) : 0,
    })
  })

  await pipeline(source, createWriteStream(targetPath))

  const written = await stat(targetPath)
  if (total && written.size !== total) {
    await unlink(targetPath).catch(() => { /* best effort */ })
    throw new Error(`Download incomplete: got ${written.size} of ${total} bytes`)
  }

  return targetPath
}

export async function downloadUpdate(): Promise<UpdateStatus> {
  if (!app.isPackaged) {
    broadcast({
      state: 'error',
      error: 'Updates can only be installed from a packaged build.',
    })
    return status
  }

  if (status.state === 'downloading' || status.state === 'downloaded' || status.state === 'installing') return status

  try {
    broadcast({ state: 'downloading', progress: 0, error: undefined })

    if (status.installMode === 'restart') {
      wireAutoUpdater()
      await autoUpdater.downloadUpdate()
    } else {
      const path = await downloadAssetToDisk()
      if (status.installMode === 'replace-app') {
        if (!replacementBundle || !pendingAssetDigest || !status.version) throw new Error('Check for updates again before downloading.')
        preparedMacUpdate = await prepareMacUpdate(path, pendingAssetDigest, replacementBundle, status.version)
      }
      broadcast({ state: 'downloaded', progress: 100, downloadPath: path })
    }
  } catch (err) {
    broadcast({ state: 'error', error: err instanceof Error ? err.message : 'Download failed' })
  }

  return status
}

export async function installUpdate(): Promise<{ success: boolean; error?: string }> {
  if (!app.isPackaged) {
    return { success: false, error: 'Updates can only be installed from a packaged build.' }
  }
  if (status.state !== 'downloaded') {
    return { success: false, error: 'No downloaded update to install.' }
  }

  if (status.installMode === 'replace-app') {
    broadcast({ state: 'installing', error: undefined })
    try {
      if (!preparedMacUpdate) throw new Error('Prepared update missing. Download it again.')
      await launchMacInstaller(preparedMacUpdate, join(app.getPath('userData'), 'update-result.txt'))
      broadcast({ state: 'installing', error: undefined })
      setTimeout(() => app.quit(), 250)
      // If a future quit handler cancels shutdown, surface the helper timeout
      // in the still-running app as well as on the next launch.
      setTimeout(() => { void recoverUpdateResult() }, 123_000).unref()
      return { success: true }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Update installation failed.'
      broadcast({ state: 'error', error })
      return { success: false, error }
    }
  }

  if (status.installMode === 'restart') {
    // Give the renderer a tick to close its dialog before the app restarts.
    setImmediate(() => autoUpdater.quitAndInstall(false, true))
    return { success: true }
  }

  // macOS: open the disk image so the user can replace the app.
  if (!status.downloadPath) {
    return { success: false, error: 'The downloaded installer could not be located.' }
  }

  const openError = await shell.openPath(status.downloadPath)
  if (openError) {
    // Opening failed — at least reveal the file so it is not lost.
    shell.showItemInFolder(status.downloadPath)
    return { success: false, error: openError }
  }

  return { success: true }
}

/** Reveal the downloaded installer in Finder/Explorer. */
export function revealUpdate(): { success: boolean; error?: string } {
  if (!status.downloadPath) return { success: false, error: 'Nothing has been downloaded yet.' }
  shell.showItemInFolder(status.downloadPath)
  return { success: true }
}

/** Recover helper failures even when automatic network update checks are disabled. */
export async function recoverUpdateResult(): Promise<boolean> {
  const resultPath = join(app.getPath('userData'), 'update-result.txt')
  const result = await readFile(resultPath, 'utf8').catch(() => '')
  if (!result) return false
  await unlink(resultPath).catch(() => {})
  if (result === 'success') return false
  broadcast({ state: 'error', error: result })
  return true
}

/** Silent check shortly after launch, so the settings dialog opens pre-populated. */
export function checkForUpdatesOnStartup(): void {
  setTimeout(() => {
    checkForUpdates().catch(() => {
      /* startup check is best-effort */
    })
  }, 8000)
}
