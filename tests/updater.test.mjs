import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const directory = await mkdtemp(join(process.cwd(), 'node_modules', '.updater-test-'))
const output = join(directory, 'updater.mjs')
const originalFetch = globalThis.fetch
await build({ entryPoints: ['src/main/services/updater.ts'], outfile: output, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent', define: { 'process.platform': '"darwin"', 'process.arch': '"arm64"', __APP_VERSION__: '"1.0.0"' }, plugins: [{ name: 'updater-fixtures', setup(builder) {
  builder.onResolve({ filter: /^(electron|electron-updater|child_process)$|^\.\/mac-update$/ }, args => ({ path: args.path, namespace: 'fixture' }))
  builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: path === 'electron' ? `
    export const app = globalThis.updaterFixture.app;
    export const shell = { openPath: async () => '', showItemInFolder: () => {} };
    export const BrowserWindow = { getAllWindows: () => [{ webContents: { send: (_, status) => globalThis.updaterFixture.events.push(status) } }] };
  ` : path === 'electron-updater' ? 'export const autoUpdater = {}' : path === 'child_process' ? `export function execFile(command, args, callback) { callback(null, '', 'Signature=adhoc\\nTeamIdentifier=not set') }` : `
    export async function writableMacBundle() { return globalThis.updaterFixture.writable ? '/Applications/ImageStudio.app' : undefined }
    export async function prepareMacUpdate(...args) { globalThis.updaterFixture.prepared.push(args); if (globalThis.updaterFixture.prepareError) throw new Error('Checksum mismatch'); return { root: '/fixture', staged: '/fixture/new.app', target: args[2] } }
    export async function launchMacInstaller() { globalThis.updaterFixture.launches++; await globalThis.updaterFixture.launch() }
  ` }))
} }] })
after(async () => { globalThis.fetch = originalFetch; delete globalThis.updaterFixture; await rm(directory, { recursive: true, force: true }) })
let sequence = 0
async function fixture({ writable = true, digest = true, packaged = true } = {}) {
  const state = { writable, events: [], prepared: [], launches: 0, quits: 0, launch: async () => {}, app: { isPackaged: packaged, getVersion: () => '1.0.0', getAppPath: () => '/Applications/ImageStudio.app/Contents/Resources/app.asar', getPath: () => directory, quit: () => state.quits++ } }
  globalThis.updaterFixture = state
  globalThis.fetch = async url => String(url).includes('api.github.com') ? new Response(JSON.stringify({ tag_name: 'v2.0.0', assets: [
    { name: 'ImageStudio-2.0.0-arm64.zip', browser_download_url: 'https://fixture.invalid/update.zip', digest: digest ? `sha256:${'a'.repeat(64)}` : null },
    { name: 'ImageStudio-2.0.0-arm64.dmg', browser_download_url: 'https://fixture.invalid/update.dmg' },
  ] })) : new Response('archive-fixture', { headers: { 'content-length': '15' } })
  return { state, updater: await import(`${pathToFileURL(output).href}?fixture=${sequence++}`) }
}

test('unsigned writable Mac selects verified ZIP, stages before readiness, and prevents simultaneous installers', async () => {
  const { state, updater } = await fixture()
  assert.equal((await updater.checkForUpdates()).installMode, 'replace-app')
  assert.equal((await updater.downloadUpdate()).state, 'downloaded')
  assert.equal(state.prepared.length, 1)
  assert.match(state.prepared[0][0], /arm64.zip$/)
  let finish
  state.launch = () => new Promise(resolve => { finish = resolve })
  const first = updater.installUpdate()
  assert.equal(updater.getUpdateStatus().state, 'installing')
  assert.equal((await updater.installUpdate()).success, false)
  finish(); assert.equal((await first).success, true)
  await new Promise(resolve => setTimeout(resolve, 280))
  assert.equal(state.launches, 1); assert.equal(state.quits, 1)
})

test('missing digest and nonwritable installs retain manual fallback; dev cannot install', async () => {
  for (const options of [{ digest: false }, { writable: false }]) {
    const { state, updater } = await fixture(options)
    const available = await updater.checkForUpdates()
    assert.equal(available.installMode, 'open-installer'); assert.ok(available.installReason)
    assert.equal((await updater.downloadUpdate()).state, 'downloaded')
    assert.equal(state.prepared.length, 0)
  }
  const { updater } = await fixture({ packaged: false })
  assert.equal((await updater.checkForUpdates()).installMode, 'none')
  assert.equal((await updater.downloadUpdate()).state, 'error')
  assert.equal((await updater.installUpdate()).success, false)
})

test('invalid staged update and helper launch failure keep the running app alive', async () => {
  const { state, updater } = await fixture()
  await updater.checkForUpdates(); state.prepareError = true
  assert.equal((await updater.downloadUpdate()).state, 'error')
  assert.match(updater.getUpdateStatus().error, /Checksum/)
  assert.equal((await updater.installUpdate()).success, false)
  state.prepareError = false; await updater.downloadUpdate()
  state.launch = async () => { throw new Error('Helper unavailable') }
  assert.equal((await updater.installUpdate()).success, false)
  assert.match(updater.getUpdateStatus().error, /Helper unavailable/)
  assert.equal(state.quits, 0)
  await writeFile(join(directory, 'update-result.txt'), 'Update failed; previous app restored.')
  assert.equal(await updater.recoverUpdateResult(), true)
  assert.match(updater.getUpdateStatus().error, /previous app restored/)
})
