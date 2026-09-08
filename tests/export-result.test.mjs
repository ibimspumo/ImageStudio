import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const directory = await mkdtemp(join(process.cwd(), 'node_modules', '.export-result-'))
const output = join(directory, 'fixture.mjs')
await build({ entryPoints: ['src/renderer/src/lib/export-result.ts'], outfile: output, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' })
const { requireExportSuccess } = await import(pathToFileURL(output).href)
after(() => rm(directory, { recursive: true, force: true }))

test('export IPC results distinguish saved files, cancelled dialogs and resolved failures', () => {
  assert.equal(requireExportSuccess({ success: true }), true)
  assert.equal(requireExportSuccess({ success: false, cancelled: true }), false)
  assert.throws(() => requireExportSuccess({ success: false, error: 'Disk is full' }), /Disk is full/)
  assert.throws(() => requireExportSuccess({ success: false }), /Export fehlgeschlagen/)
})
