import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import sharp from 'sharp'
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const directory = await mkdtemp(join(process.cwd(), 'node_modules', '.processing-files-tests-'))
globalThis.processingTestDirectory = directory
const output = join(directory, 'files.mjs')
await build({ entryPoints: ['src/main/services/image-processing-files.ts'], outfile: output, bundle: true, packages: 'external', platform: 'node', format: 'esm', logLevel: 'silent', plugins: [{ name: 'disposable-gallery', setup(builder) {
  builder.onResolve({ filter: /\/image-store$/ }, () => ({ path: 'store', namespace: 'mock' }))
  builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export function getImagesDir() { return globalThis.processingTestDirectory }' }))
} }] })
const { inspectProcessingFile, persistProcessingResult, prepareImageFileExport } = await import(pathToFileURL(output).href)
const originalFetch = globalThis.fetch
after(async () => { globalThis.fetch = originalFetch; await rm(directory, { recursive: true, force: true }) })

test('native inspection measures real pixels and actual alpha, invalidates modified files', async () => {
  const filePath = join(directory, 'source.png')
  await sharp({ create: { width: 32, height: 24, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } } }).png().toFile(filePath)
  const opaque = await inspectProcessingFile(filePath)
  assert.deepEqual([opaque.width, opaque.height, opaque.hasAlpha, opaque.mimeType], [32, 24, false, 'image/png'])
  await sharp({ create: { width: 64, height: 48, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 0 } } }).png().toFile(filePath)
  const transparent = await inspectProcessingFile(filePath)
  assert.deepEqual([transparent.width, transparent.height, transparent.hasAlpha], [64, 48, true])
  await assert.rejects(inspectProcessingFile('relative.png'), /absolute/)
})

test('streamed output preserves provider PNG bytes above browser edge limits and uses a separate preview', async () => {
  const bytes = await sharp({ create: { width: 34000, height: 2, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 0.5 } } }).png().toBuffer()
  globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(bytes.subarray(0, 40)); controller.enqueue(bytes.subarray(40)); controller.close()
  } }), { status: 200 })
  const result = await persistProcessingResult('https://fixture.invalid/result.png', 'large.png')
  assert.deepEqual([result.width, result.height, result.hasAlpha, result.mimeType], [34000, 2, true, 'image/png'])
  assert.deepEqual(await readFile(result.filePath), bytes)
  assert.ok(result.previewPath && result.previewPath !== result.filePath)
  const preview = await sharp(result.previewPath).metadata()
  assert.ok(preview.width <= 2048 && preview.height <= 2048)
  assert.equal((await inspectProcessingFile(result.filePath)).width, 34000, 'Original remains next-pass processing source')
})

test('JPEG provider bytes stay original and failed downloads never leave partial gallery images', async () => {
  const bytes = await sharp({ create: { width: 13, height: 7, channels: 3, background: '#ac3478' } }).jpeg().toBuffer()
  globalThis.fetch = async () => new Response(bytes)
  const result = await persistProcessingResult('https://fixture.invalid/output.jpg', 'opaque.jpg')
  assert.equal(result.mimeType, 'image/jpeg'); assert.equal(result.hasAlpha, false)
  assert.deepEqual(await readFile(result.filePath), bytes)
  await assert.rejects(persistProcessingResult('https://fixture.invalid/wrong.png', 'wrong.png'), /expected image\/png/)
  globalThis.fetch = async () => new Response('', { status: 502 })
  await assert.rejects(persistProcessingResult('https://fixture.invalid/fail.png', 'failed.png'), /HTTP 502/)
  const files = await readdir(directory)
  assert.ok(!files.some(file => file.endsWith('.download') || file === 'wrong.png' || file === 'failed.png'))
})


test('native export shares original PNG, caches conversions and flattens JPEG onto white without changing source', async () => {
  const filePath = join(directory, 'export-source.png')
  const bytes = await sharp({ create: { width: 34000, height: 2, channels: 4, background: { r: 20, g: 30, b: 40, alpha: 0 } } }).png().toBuffer()
  await writeFile(filePath, bytes)
  const original = await prepareImageFileExport({ filePath, format: 'png', quality: 92 })
  assert.equal(original.filePath, filePath)
  assert.equal(original.sizeBytes, bytes.length)
  const converted = await prepareImageFileExport({ filePath, format: 'jpeg', quality: 92 })
  const cached = await prepareImageFileExport({ filePath, format: 'jpeg', quality: 92 })
  assert.equal(converted.filePath, cached.filePath)
  assert.notEqual(converted.filePath, filePath)
  const { data, info } = await sharp(converted.filePath).raw().toBuffer({ resolveWithObject: true })
  assert.equal(info.width, 34000)
  assert.deepEqual([...data.subarray(0, 3)], [255, 255, 255])
  assert.deepEqual(await readFile(filePath), bytes)
})
