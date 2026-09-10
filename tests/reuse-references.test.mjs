import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const directory = await mkdtemp(join(process.cwd(), 'node_modules', '.reuse-references-'))
after(() => rm(directory, { recursive: true, force: true }))
await build({ entryPoints: ['src/shared/reuse-references.ts'], outfile: join(directory, 'references.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' })
const { getReuseImageReferences } = await import(pathToFileURL(join(directory, 'references.mjs')).href)

test('MCP image numbers preserve submitted order and unmentioned attachments', () => {
  assert.deepEqual(getReuseImageReferences({ prompt: '[Image 2] behind [Image 1]', attachments: ['first', 'second', 'third'] }), [
    { name: 'Image 1', source: 'first' }, { name: 'Image 2', source: 'second' }, { name: 'Image 3', source: 'third' },
  ])
})

test('saved labels preserve custom UI names and skip collection attachment slots', () => {
  assert.deepEqual(getReuseImageReferences({
    prompt: '[Image 2] and [Crop abc] with [@Team]', attachments: ['owned-crop', 'owned-team-1', 'owned-team-2', 'owned-second'],
    labeledAttachments: [
      { label: 'Crop abc', images: ['inline-crop'] },
      { label: 'Collection "@Team" (2 images)', images: ['inline-team-1', 'inline-team-2'] },
      { label: 'Image 2', images: ['inline-second'] },
    ],
  }), [{ name: 'Crop abc', source: 'owned-crop' }, { name: 'Image 2', source: 'owned-second' }])
})

test('labeled snapshots work without a separate flat list and without prompt mentions', () => {
  assert.deepEqual(getReuseImageReferences({ prompt: 'Make this wide', labeledAttachments: [{ label: 'Image 1', images: ['data:image/png;base64,AAAA'] }] }), [
    { name: 'Image 1', source: 'data:image/png;base64,AAAA' },
  ])
})
