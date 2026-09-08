import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const directory = await mkdtemp(join(process.cwd(), 'node_modules', '.settings-costs-'))
const output = join(directory, 'fixture.mjs')
await build({ stdin: { contents: "export * from './src/renderer/src/stores/settings-store'; export * from './src/renderer/src/lib/gallery-costs'", resolveDir: process.cwd(), loader: 'ts' }, outfile: output, bundle: true, packages: 'external', platform: 'node', format: 'esm', logLevel: 'silent' })
const { useSettingsStore, getGalleryCosts } = await import(pathToFileURL(output).href)
after(() => rm(directory, { recursive: true, force: true }))

test('rejected setting persistence preserves live state and returns an actionable error', async () => {
  useSettingsStore.setState({ falApiKey: 'original', antiDetection: false })
  global.window = { api: { setSetting: async () => ({ success: false }) } }
  await assert.rejects(useSettingsStore.getState().setFalApiKey('replacement'), /nicht gespeichert/)
  assert.equal(useSettingsStore.getState().falApiKey, 'original')
  await assert.rejects(useSettingsStore.getState().setSetting('antiDetection', true), /nicht gespeichert/)
  assert.equal(useSettingsStore.getState().antiDetection, false)
  global.window.api.setSetting = async () => ({ success: true })
  await useSettingsStore.getState().setFalApiKey('')
  assert.equal(useSettingsStore.getState().falApiKey, '')
})

test('retained-media costs distinguish local today, historical estimates, zero and unknown', () => {
  const now = new Date(2026, 8, 8, 14).getTime()
  const today = new Date(2026, 8, 8).getTime()
  const costs = getGalleryCosts([
    { timestamp: today - 1, cost: 0.5 },
    { timestamp: today, cost: 0.25 },
    { timestamp: now, cost: 0 },
    { timestamp: now },
    { timestamp: now, isLoading: true },
  ], now)
  assert.equal(costs.galleryEstimatedSpendUsd, 0.75)
  assert.equal(costs.todayEstimatedSpendUsd, 0.25)
  assert.equal(costs.todayStartMs, today)
  assert.equal(costs.missingCostCount, 1)
  assert.equal(costs.estimateOnly, true)
})
