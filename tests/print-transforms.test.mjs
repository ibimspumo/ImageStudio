import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const directory = await mkdtemp(join(process.cwd(), 'node_modules', '.print-transform-'))
after(() => rm(directory, { recursive: true, force: true }))
await build({ stdin: { contents: `
export { prepareImageTransform } from './src/renderer/src/lib/image-editing';
export { prepareImageVariant } from './src/renderer/src/lib/studio-actions';
export { useSettingsStore } from './src/renderer/src/stores/settings-store';
export { useGalleryStore } from './src/renderer/src/stores/gallery-store';
export { useCropStore } from './src/renderer/src/stores/crop-store';
export { preparePrintFormat } from './src/shared/print-prompt';
`, resolveDir: process.cwd() }, outfile: join(directory, 'transforms.mjs'), bundle: true, packages: 'external', platform: 'node', format: 'esm', logLevel: 'silent' })
const t = await import(pathToFileURL(join(directory, 'transforms.mjs')).href)
const source = { id: 'print-source', filePath: 'data:image/png;base64,original-provider-bytes', prompt: 'Weihnachtsmarkt · 12. Dezember', aspectRatio: '210:297', resolution: '2K', model: 'imported', timestamp: 1, isPrint: true, printFormat: 'a4-portrait', printStyle: 'swiss', printMetaPrompt: 'Brand palette: blue', workspaceId: 'brand' }
const selectedModel = 'openai/gpt-image-2.5/flare/text-to-image'

test('print aspect transforms keep lineage and use requested ratio without preset override', async () => {
  t.useSettingsStore.setState({ defaultModel: selectedModel })
  const options = await t.prepareImageTransform(source, { operation: 'aspect_ratio', aspectRatio: '16:9' })
  assert.equal(options.isPrint, true)
  assert.deepEqual(options.models, [selectedModel])
  assert.equal(options.parentImageId, source.id)
  assert.equal(options.workspaceId, 'brand')
  assert.equal(options.printFormat, 'custom')
  assert.equal(options.printStyle, 'swiss')
  assert.equal(options.printMetaPrompt, source.printMetaPrompt)
  assert.equal(t.preparePrintFormat(options.printFormat, options.models, options).aspectRatio, '16:9')
  assert.deepEqual(options.labeledAttachments, [{ label: 'Image 1', images: [source.filePath] }])
  assert.match(options.prompt, /Re-layout/)
  assert.match(options.prompt, /exact visible copy/)
  assert.equal(options.apiPrompt, undefined, 'print hook composes the artwork prompt from the descriptive user prompt')
})

test('print zoom uses graphic fields and original reference instead of photographic JPEG canvas', async () => {
  const options = await t.prepareImageTransform(source, { operation: 'zoom_out', factor: 2 })
  assert.equal(options.printFormat, 'a4-portrait')
  assert.equal(options.aspectRatio, source.aspectRatio)
  assert.equal(options.outputFormat, 'png')
  assert.match(options.prompt, /flat background and graphic fields/)
  assert.deepEqual(options.labeledAttachments[0].images, [source.filePath])
})

test('variants of imported print use the saved image model and preserve print metadata', () => {
  t.useSettingsStore.setState({ defaultModel: selectedModel })
  t.useGalleryStore.setState({ images: [source] })
  t.prepareImageVariant(source.id)
  const draft = t.useCropStore.getState().consumePendingReuse()
  assert.equal(draft.isPrint, true)
  assert.match(draft.model, /flare/)
  assert.equal(draft.printFormat, source.printFormat)
  assert.equal(draft.printMetaPrompt, source.printMetaPrompt)
})
