import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const directory = await mkdtemp(join(process.cwd(), 'node_modules', '.gpt25-tests-'))
after(() => rm(directory, { recursive: true, force: true }))
for (const [name, entry] of [['registry', 'src/shared/image-models.ts'], ['provider', 'src/main/services/fal-image.ts']]) {
  await build({ entryPoints: [entry], outfile: join(directory, name + '.mjs'), bundle: true, packages: 'external', platform: 'node', format: 'esm', logLevel: 'silent' })
}
const r = await import(pathToFileURL(join(directory, 'registry.mjs')).href)
const { buildInput } = await import(pathToFileURL(join(directory, 'provider.mjs')).href)
const flare = r.getModel(r.DEFAULT_MODEL)
const request = { prompt: 'A transparent logo', model: flare.id, apiKey: 'unused', aspectRatio: '1:1', resolution: '1K' }

test('new defaults expose both variants while historical labels retain provenance', () => {
  assert.match(r.DEFAULT_MODEL, /flare/)
  assert.match(r.DEFAULT_THUMBNAIL_MODEL, /sunburst/)
  assert.equal(r.DEFAULT_LOGO_MODEL, r.DEFAULT_MODEL)
  assert.equal(r.getLogoModels().length, 2)
  assert.equal(r.normalizeModelId('openai/gpt-image-2'), r.DEFAULT_MODEL)
  assert.equal(r.getModelName('openai/gpt-image-2'), 'GPT Image 2')
  assert.equal(r.getModelName('fal-ai/gpt-image-1.5'), 'GPT Image 1.5')
  assert.deepEqual(flare.qualities, ['auto', 'low', 'medium', 'high', 'xhigh', 'max'])
})

test('custom pixels round upward, preserve valid exact values and reject every provider bound', () => {
  assert.deepEqual(r.normalizeGptImageSize({width: 1920, height: 1080}), {width: 1920, height: 1088})
  assert.deepEqual(r.normalizeGptImageSize({width: 2400, height: 3394}), {width: 2400, height: 3408})
  assert.throws(() => r.normalizeGptImageSize({width: 2480, height: 3508}), /total pixels/)
})

test('pixel constraints and derived presets are safe without silent custom shrinking', () => {
  for (const imageSize of [{width: 4000,height: 2000}, {width: 3840,height: 3840}, {width: 100,height: 100}, {width: 3000,height: 700}, {width: NaN,height: 1000}]) assert.throws(() => r.normalizeGptImageSize(imageSize))
  for (const ratio of ['1:1','16:9','9:16','3:1','1:3','8:1']) for (const resolution of ['1K','2K','4K']) {
    const size = r.toGptImageSize(ratio,resolution)
    assert.deepEqual(r.normalizeGptImageSize(size), size)
  }
})

test('provider accepts high/xhigh/max, alpha and compression with the exact shared dimensions', () => {
  const input = buildInput(flare, {...request, quality:'max',background:'transparent',outputFormat:'webp',outputCompression:90,imageSize:{width:1920,height:1080}}, ['https://example.invalid/reference.png'], request.prompt, 10)
  assert.equal(input.quality,'max')
  assert.equal(input.background,'transparent')
  assert.equal(input.output_compression,90)
  assert.equal(input.num_images,10)
  assert.deepEqual(input.image_size,{width:1920,height:1088})
  assert.equal('input_fidelity' in input,false)
  const png = buildInput(flare, {...request, background:'transparent',outputFormat:'jpeg',outputCompression:70}, [], request.prompt,1)
  assert.equal(png.output_format,'png')
  assert.equal('output_compression' in png,false)
  assert.equal(png.quality,'high')
  assert.throws(() => buildInput(flare,request,[], 'x'.repeat(32001),1),/composed prompt/)
  assert.throws(() => buildInput(flare,{...request,outputCompression:101},[],request.prompt,1),/compression/)
})

test('quality pricing uses all published tiers and both variants share list estimates', () => {
  for (const id of [r.DEFAULT_MODEL,r.DEFAULT_THUMBNAIL_MODEL]) {
    assert.equal(r.estimateImageCost(id,{imageSize:{width:1024,height:1024},quality:'high'}),.05268)
    assert.equal(r.estimateImageCost(id,{imageSize:{width:1024,height:1024},quality:'xhigh'}),.09366)
    assert.equal(r.estimateImageCost(id,{imageSize:{width:1024,height:1024},quality:'max'}),.21072)
  }
})
