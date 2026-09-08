import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import sharp from 'sharp'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const directory = await mkdtemp(join(process.cwd(), 'node_modules', '.processing-tests-'))
const output = join(directory, 'registry.mjs')
await build({ entryPoints: ['src/shared/image-processing.ts'], outfile: output, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' })
const { normalizeImageProcessing: normalize, buildImageProcessingInput: input } = await import(pathToFileURL(output).href)
after(() => rm(directory, { recursive: true, force: true }))
const source = { operation: 'upscale', sourceWidth: 1200, sourceHeight: 800, sourceHasAlpha: false }

test('alpha selects fixed 4x transparent endpoint, precision has exact prompt-free provider input', () => {
  const precision = input({ ...source, options: { scale: 3, sharpen: 0.2, denoise: 0.4, fixCompression: 0.1, faceEnhancement: false } }, 'https://fixture.invalid/original.png')
  assert.equal(precision.endpoint, 'topaz/upscale/image/precision')
  assert.deepEqual(precision.input, { image_url: 'https://fixture.invalid/original.png', output_format: 'png', upscale_factor: 3, model: 'High Fidelity V3', subject_detection: 'All', face_enhancement: false, face_enhancement_creativity: 0, face_enhancement_strength: 0.8, sharpen: 0.2, denoise: 0.4, fix_compression: 0.1, crop_to_fill: false })
  assert.deepEqual([precision.normalized.width, precision.normalized.height], [3600, 2400])
  const transparent = input({ ...source, sourceHasAlpha: true }, 'https://fixture.invalid/rgba.png')
  assert.equal(transparent.endpoint, 'topaz/upscale/image/transparent')
  assert.deepEqual(transparent.input, { image_url: 'https://fixture.invalid/rgba.png', output_format: 'png' })
  assert.deepEqual([transparent.normalized.width, transparent.normalized.height, transparent.normalized.hasAlpha], [4800, 3200, true])
  const removal = input({ ...source, operation: 'remove_background' }, 'https://fixture.invalid/original.png')
  assert.equal(removal.endpoint, 'fal-ai/bria/background/remove')
  assert.deepEqual(removal.input, { image_url: 'https://fixture.invalid/original.png', sync_mode: false })
  assert.equal(removal.normalized.hasAlpha, true)
  assert.equal(removal.normalized.estimatedCost, 0.018)
})

test('list estimates charge started 24 output MP, including exact boundary and fractional scale', () => {
  assert.equal(normalize({ ...source, sourceWidth: 3000, sourceHeight: 2000 }).estimatedCost, 0.08)
  assert.equal(normalize({ ...source, sourceWidth: 3001, sourceHeight: 2000 }).estimatedCost, 0.16)
  const fractional = normalize({ ...source, options: { scale: 1.5 } })
  assert.deepEqual([fractional.width, fractional.height], [1800, 1200])
  assert.equal(fractional.estimatedCost, 0.08)
})

test('invalid inputs cannot silently flatten alpha or forward unsupported provider options', () => {
  for (const options of [{ scale: 0 }, { scale: 5 }, { scale: NaN }, { model: 'other' }, { resolution: '4K' }, { prompt: 'fake upscale' }, { precisionModel: 'CGI', fixCompression: 0.2 }, { strength: 0.4 }, { faceEnhancement: 'yes' }, { sharpen: 2 }, { precisionModel: 'unknown' }, { subjectDetection: 'Person' }]) {
    assert.throws(() => normalize({ ...source, options }), undefined, JSON.stringify(options))
  }
  assert.throws(() => normalize({ ...source, sourceHasAlpha: true, options: { model: 'precision' } }), /alpha|transparency/)
  assert.throws(() => normalize({ ...source, sourceHasAlpha: true, options: { scale: 2 } }), /4x/)
  assert.throws(() => normalize({ ...source, sourceHasAlpha: true, options: { sharpen: 0.2 } }), /only/)
  assert.throws(() => normalize({ ...source, operation: 'remove_background', options: { scale: 2 } }), /does not accept/)
  for (const sourceWidth of [0, -1, 1.5, Infinity]) assert.throws(() => normalize({ ...source, sourceWidth }), /positive integer/)
})

const serviceOutput = join(directory, 'service.mjs')
await build({ entryPoints: ['src/main/services/fal-image-processing.ts'], outfile: serviceOutput, bundle: true, packages: 'external', platform: 'node', format: 'esm', logLevel: 'silent', plugins: [{ name: 'no-paid-provider', setup(builder) {
  builder.onResolve({ filter: /\/image-store$/ }, () => ({ path: 'store', namespace: 'store-mock' }))
  builder.onLoad({ filter: /.*/, namespace: 'store-mock' }, () => ({ contents: 'export function getImagesDir() { throw new Error("Provider tests must not persist") }' }))
  builder.onResolve({ filter: /^@fal-ai\/client$/ }, () => ({ path: 'fal', namespace: 'mock' }))
  builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const fal = { config() {}, storage: { upload(blob) { return globalThis.processingUpload(blob) } }, subscribe(...args) { return globalThis.processingSubscribe(...args) }, queue: { cancel(...args) { return globalThis.processingCancel(...args) } } }' }))
} }] })
const { processImage } = await import(pathToFileURL(serviceOutput).href)
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==', 'base64')
const original = `data:image/png;base64,${png.toString('base64')}`

test('real service uploads original PNG bytes, consumes singular image and preserves request provenance', async () => {
  let uploads = 0
  globalThis.processingUpload = async blob => {
    uploads++
    assert.equal(blob.type, 'image/png')
    assert.deepEqual(Buffer.from(await blob.arrayBuffer()), png)
    return 'https://fixture.invalid/original.png'
  }
  const progress = []
  for (const [operation, alpha, endpoint] of [['upscale', false, 'topaz/upscale/image/precision'], ['upscale', true, 'topaz/upscale/image/transparent'], ['remove_background', false, 'fal-ai/bria/background/remove']]) {
    globalThis.processingSubscribe = async (actual, options) => {
      assert.equal(actual, endpoint)
      assert.equal(options.input.prompt, undefined)
      options.onEnqueue('fal-request')
      options.onQueueUpdate({ status: 'IN_PROGRESS' })
      return { requestId: 'fal-request', data: { image: { url: 'https://fixture.invalid/result.png' } } }
    }
    const [result] = await processImage({ ...source, operation, sourceHasAlpha: alpha, sourceImage: original }, 'mock-key', undefined, (...event) => progress.push(event))
    assert.equal(result.id, 'fal-request')
    assert.equal(result.imageUrl, 'https://fixture.invalid/result.png')
    assert.equal(result.generationRequest.endpoint, endpoint)
    assert.equal(result.cost, operation === 'upscale' ? 0.08 : 0.018)
    assert.ok(!JSON.stringify(result).includes('mock-key'))
  }
  assert.equal(uploads, 1, 'Original-byte upload cache shared across operations')
  assert.ok(progress.some(([, id]) => id === 'fal-request'))
})

test('service surfaces provider field errors and missing singular image without fake success', async () => {
  globalThis.processingSubscribe = async () => { throw { body: { detail: [{ loc: ['body', 'upscale_factor'], msg: 'too large' }] } } }
  await assert.rejects(processImage({ ...source, sourceImage: original }, 'mock-key'), /upscale_factor: too large/)
  globalThis.processingSubscribe = async () => ({ requestId: 'empty', data: { images: [{ url: 'wrong-shape' }] } })
  await assert.rejects(processImage({ ...source, sourceImage: original }, 'mock-key'), /returned no image/)
  await assert.rejects(processImage({ ...source, sourceImage: 'https://fixture.invalid/thumb.jpg' }, 'mock-key'), /original/)
  await assert.rejects(processImage({ ...source, sourceImage: original }, ''), /API key/)
})

test('cancellation before submission avoids paid call; enqueue race cancels the exact provider request', async () => {
  const preAborted = new AbortController(); preAborted.abort()
  globalThis.processingSubscribe = () => { assert.fail('Pre-aborted request must not submit') }
  await assert.rejects(processImage({ ...source, sourceImage: original }, 'mock-key', preAborted.signal), { name: 'AbortError' })
  const controller = new AbortController()
  const cancellations = []
  globalThis.processingCancel = async (...args) => { cancellations.push(args) }
  globalThis.processingSubscribe = async (_endpoint, options) => {
    controller.abort()
    options.onEnqueue('race-request')
    return { requestId: 'race-request', data: { image: { url: 'https://fixture.invalid/result.png' } } }
  }
  await assert.rejects(processImage({ ...source, sourceImage: original }, 'mock-key', controller.signal), { name: 'AbortError' })
  assert.deepEqual(cancellations, [['topaz/upscale/image/precision', { requestId: 'race-request' }]])
})

 test('upscale has no artificial 100MP or resolution-tag cap and supports repeated actual-size operations', () => {
  const large = normalize({ ...source, sourceWidth: 6000, sourceHeight: 5000, options: { scale: 2 } })
  assert.deepEqual([large.width, large.height, large.estimatedCost], [12000, 10000, 0.4])
  const wide = normalize({ ...source, sourceWidth: 17000, sourceHeight: 1 })
  assert.equal(wide.width, 34000)
  let spec = { ...source, sourceWidth: 2000, sourceHeight: 1500 }
  for (let pass = 0; pass < 3; pass++) {
    const next = normalize(spec)
    spec = { ...spec, sourceWidth: next.width, sourceHeight: next.height }
  }
  assert.deepEqual([spec.sourceWidth, spec.sourceHeight], [16000, 12000])
})

test('precision exposes JPEG and crop_to_fill while transparent cannot flatten alpha', () => {
  const jpeg = input({ ...source, options: { outputFormat: 'jpeg', cropToFill: true } }, 'https://fixture.invalid/source.png')
  assert.equal(jpeg.input.output_format, 'jpeg')
  assert.equal(jpeg.input.crop_to_fill, true)
  assert.equal(jpeg.normalized.outputFormat, 'jpeg')
  assert.throws(() => normalize({ ...source, sourceHasAlpha: true, options: { outputFormat: 'jpeg' } }), /PNG/)
  assert.throws(() => normalize({ ...source, options: { outputFormat: 'webp' } }), /png or jpeg/)
  assert.throws(() => normalize({ ...source, options: { cropToFill: 'true' } }), /boolean/)
})

test('native original file upload validates dimensions and alpha before submission without a renderer base64 copy', async () => {
  const sourceFilePath = join(directory, 'native-source.png')
  await sharp({ create: { width: 12, height: 8, channels: 4, background: { r: 9, g: 34, b: 80, alpha: 0.5 } } }).png().toFile(sourceFilePath)
  const bytes = await readFile(sourceFilePath)
  globalThis.processingUpload = async blob => {
    assert.equal(blob.type, 'image/png')
    assert.deepEqual(Buffer.from(await blob.arrayBuffer()), bytes)
    return 'https://fixture.invalid/native-source.png'
  }
  globalThis.processingSubscribe = async (endpoint, options) => {
    assert.equal(endpoint, 'topaz/upscale/image/transparent')
    assert.equal(options.input.image_url, 'https://fixture.invalid/native-source.png')
    return { requestId: 'native-request', data: { image: { url: 'https://fixture.invalid/result.png' } } }
  }
  const request = { ...source, sourceFilePath, sourceWidth: 12, sourceHeight: 8, sourceHasAlpha: true }
  assert.equal((await processImage(request, 'mock-key'))[0].id, 'native-request')
  await assert.rejects(processImage({ ...request, sourceWidth: 13 }, 'mock-key'), /metadata changed/)
  await assert.rejects(processImage({ ...request, sourceHasAlpha: false }, 'mock-key'), /metadata changed/)
  await assert.rejects(processImage({ ...request, sourceImage: original }, 'mock-key'), /exactly one/)
})
