import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, rm, readFile, writeFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const temporary = await mkdtemp(join(process.cwd(), 'node_modules', '.generation-references-'))
after(() => rm(temporary, { recursive: true, force: true }))
await build({ entryPoints: ['src/main/services/generation-references.ts'], outfile: join(temporary, 'references.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' })
const { retainGenerationReferences, externalizeGalleryReferences, replaceMigratedGallery } = await import(pathToFileURL(join(temporary, 'references.mjs')))
const bytes = Buffer.from('original image bytes with alpha metadata\0')
const data = `data:image/png;base64,${bytes.toString('base64')}`
const directory = join(temporary, 'images')

test('references preserve bytes, group labels and ordering while sharing identical files', async () => {
  const result = await retainGenerationReferences(directory, {
    attachments: [data, '/existing/reference.jpg', data],
    labeledAttachments: [{ label: 'Timo', images: [data, '/existing/reference.jpg'] }, { label: 'Axel', images: [data] }]
  })
  assert.deepEqual(await readFile(result.attachments[0]), bytes)
  assert.equal(result.attachments[0], result.attachments[2])
  assert.equal(result.attachments[1], '/existing/reference.jpg')
  assert.equal(result.labeledAttachments[0].images[0], result.attachments[0])
  assert.deepEqual(result.labeledAttachments.map(group => group.label), ['Timo', 'Axel'])
  assert.equal((await readdir(directory)).length, 1)
  assert.deepEqual(await retainGenerationReferences(directory, {}), {})
  await assert.rejects(retainGenerationReferences(directory, { attachments: ['data:image/png;base64,bad!'] }), /Invalid/)
})

test('gallery migration removes nested inline duplicates with exact original backup and is idempotent', async () => {
  const path = join(temporary, 'gallery.json')
  const images = [{ id: 'old', prompt: 'keep', attachments: [data], generationOptions: { attachments: [data], labeledAttachments: [{ label: 'Original label', images: [data] }], quality: 'high' } }, { id: 'video', generationOptions: { startFrameBase64: data } }]
  const raw = JSON.stringify(images, null, 2)
  await writeFile(path, raw)
  assert.equal(await externalizeGalleryReferences(images, directory), true)
  await replaceMigratedGallery(path, images)
  assert.equal(await readFile(`${path}.pre-reference-files.backup`, 'utf8'), raw)
  const saved = JSON.parse(await readFile(path, 'utf8'))
  assert.equal(saved[0].attachments[0], saved[0].generationOptions.labeledAttachments[0].images[0])
  assert.equal(saved[1].generationOptions.startFrameBase64, saved[0].attachments[0])
  assert.equal(saved[0].generationOptions.labeledAttachments[0].label, 'Original label')
  assert.equal(saved[0].generationOptions.quality, 'high')
  assert.equal(await externalizeGalleryReferences(saved, directory), false)
  await replaceMigratedGallery(path, saved)
  assert.equal(await readFile(`${path}.pre-reference-files.backup`, 'utf8'), raw)
  assert.equal((await readdir(temporary)).some(name => name.endsWith('.tmp')), false)
})

test('failed reference retention leaves the history untouched', async () => {
  const path = join(temporary, 'failed.json')
  const raw = JSON.stringify([{ attachments: ['data:image/png;base64,not-valid'] }])
  await writeFile(path, raw)
  await assert.rejects(externalizeGalleryReferences(JSON.parse(raw), directory), /Invalid/)
  assert.equal(await readFile(path, 'utf8'), raw)
})
