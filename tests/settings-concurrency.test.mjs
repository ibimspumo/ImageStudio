import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const directory = await mkdtemp(join(process.cwd(), 'node_modules', '.settings-concurrency-'))
after(() => rm(directory, { recursive: true, force: true }))
await build({ entryPoints: ['src/renderer/src/stores/settings-store.ts'], outfile: join(directory, 'store.mjs'), bundle: true, packages: 'external', platform: 'node', format: 'esm', logLevel: 'silent' })
const { useSettingsStore } = await import(pathToFileURL(join(directory, 'store.mjs')).href)
const tick = () => new Promise(resolve => setImmediate(resolve))

test('concurrent UI and MCP settings retain invocation order and recover after failed persistence', async () => {
  const calls = []
  globalThis.window = { api: { setSetting: (key, value) => new Promise(resolve => calls.push({ key, value, resolve })) } }
  const store = useSettingsStore.getState()
  const first = store.setSetting('printPrompt', 'First UI text')
  const second = store.setSetting('printPrompt', 'Final UI text')
  const third = store.setSetting('defaultPrintStyle', 'editorial')
  await tick()
  assert.equal(calls.length, 1, 'later requests wait for earlier persistence')
  calls[0].resolve({ success: true })
  await first
  await tick()
  assert.equal(calls.length, 2)
  assert.equal(useSettingsStore.getState().printPrompt, 'First UI text')
  calls[1].resolve({ success: true })
  await second
  await tick()
  calls[2].resolve({ success: true })
  await third
  assert.equal(useSettingsStore.getState().printPrompt, 'Final UI text')
  assert.equal(useSettingsStore.getState().defaultPrintStyle, 'editorial')

  const failing = store.setSetting('printPrompt', 'Cannot save')
  const rejection = assert.rejects(failing, /konnte nicht gespeichert/)
  const following = store.setSetting('printPrompt', 'Recovered')
  await tick()
  calls[3].resolve({ success: false })
  await rejection
  await tick()
  assert.equal(useSettingsStore.getState().printPrompt, 'Final UI text', 'failed writes do not publish state')
  calls[4].resolve({ success: true })
  await following
  assert.equal(useSettingsStore.getState().printPrompt, 'Recovered')
})
