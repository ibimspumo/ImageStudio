import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const directory = await mkdtemp(join(process.cwd(), 'node_modules', '.print-tests-'))
after(() => rm(directory, { recursive: true, force: true }))
for (const [name, entry] of [['print', 'src/shared/print-prompt.ts'], ['registry', 'src/shared/image-models.ts']]) {
  await build({ entryPoints: [entry], outfile: join(directory, `${name}.mjs`), bundle: true, packages: 'external', platform: 'node', format: 'esm', logLevel: 'silent' })
}
const p = await import(pathToFileURL(join(directory, 'print.mjs')).href)
const r = await import(pathToFileURL(join(directory, 'registry.mjs')).href)

test('print presets remain within actual GPT constraints and report measured raster density', () => {
  for (const format of p.PRINT_FORMATS.filter(item => item.id !== 'custom')) {
    const result = p.preparePrintFormat(format.id, [r.DEFAULT_MODEL])
    assert.deepEqual(r.normalizeGptImageSize(result.imageSize), result.imageSize)
    const density = p.getPrintResolutionInfo(format.id, result.imageSize.width, result.imageSize.height)
    assert.ok(density.effectivePpi > 0)
  }
  assert.equal(p.getPrintResolutionInfo('a4-portrait', 2240, 3168).effectivePpi, 271)
  assert.equal(p.getPrintResolutionInfo('a3-portrait', 2416, 3424).effectivePpi, 207)
  assert.equal(p.getPrintResolutionInfo('custom', 2240, 3168), null)
})

test('nonpixel and mixed model presets preserve physical intent without fake custom support', () => {
  const ratioModel = r.AVAILABLE_MODELS.find(model => model.imageSizeMode !== 'pixels')
  assert.ok(ratioModel)
  const ratioOnly = p.preparePrintFormat('business-card', [ratioModel.id])
  assert.equal(ratioOnly.imageSize, undefined)
  assert.equal(ratioOnly.aspectRatio, '85:55')
  assert.ok(r.resolveAspectRatio(ratioModel, ratioOnly.aspectRatio))
  const mixed = p.preparePrintFormat('business-card', [ratioModel.id, r.DEFAULT_MODEL])
  assert.deepEqual(mixed.imageSize, { width: 1536, height: 992 })
  assert.throws(() => p.preparePrintFormat('custom', [ratioModel.id], { imageSize: { width: 1024, height: 1024 } }), /pixel-capable/)
  assert.throws(() => p.preparePrintFormat('invalid', [r.DEFAULT_MODEL]), /Unknown print format/)
})

test('custom print sizing uses canonical rounding and rejects impossible output', () => {
  const result = p.preparePrintFormat('custom', [r.DEFAULT_MODEL], { imageSize: { width: 1920, height: 1080 } })
  assert.deepEqual(result.imageSize, { width: 1920, height: 1088 })
  assert.equal(result.aspectRatio, '1920:1088')
  assert.throws(() => p.preparePrintFormat('custom', [r.DEFAULT_MODEL], { imageSize: { width: 4000, height: 4000 } }))
})

test('custom art direction and references are explicit, while invented facts are forbidden', () => {
  const prompt = p.buildPrintSystemPrompt({ format: 'a5-portrait', style: 'editorial', hasReferences: true, customMetaPrompt: 'Use blue and coral.' })
  assert.match(prompt, /Do not invent contact data, dates, prices/)
  assert.match(prompt, /Preserve supplied wording/)
  assert.match(prompt, /REFERENCE/)
  assert.ok(prompt.endsWith('Use blue and coral.'))
  assert.throws(() => p.buildPrintSystemPrompt({ format: 'a4-portrait', style: 'invalid', hasReferences: false }), /Unknown print style/)
})


test('compact catalog exposes standard proportions in both orientations and preserves legacy selections', () => {
  const visible = p.getPrintFormatOptions()
  assert.equal(visible.length, 10)
  assert.ok(visible.every(format => !format.legacy))
  for (const [portrait, landscape] of [['a4-portrait', 'a4-landscape'], ['dl-portrait', 'dl-landscape'], ['dl-105-portrait', 'dl-105-landscape'], ['business-card-portrait', 'business-card']]) {
    const tall = p.getPrintFormat(portrait)
    const wide = p.getPrintFormat(landscape)
    assert.equal(tall.widthMm, wide.heightMm)
    assert.equal(tall.heightMm, wide.widthMm)
    assert.equal(tall.imageSize.width, wide.imageSize.height)
    assert.equal(tall.imageSize.height, wide.imageSize.width)
  }
  assert.deepEqual(p.preparePrintFormat('dl-landscape', [r.DEFAULT_MODEL]).imageSize, { width: 3152, height: 1488 })
  assert.equal(p.getPrintFormat('square-105').widthMm, 105)
  assert.equal(p.getPrintFormat('square-105').heightMm, 105)
  for (const legacy of ['a5-portrait', 'a5-landscape', 'a3-portrait', 'a3-landscape', 'square']) {
    assert.equal(p.getPrintFormatOptions(legacy).length, 11)
    assert.ok(p.getPrintFormatOptions(legacy).some(format => format.id === legacy))
    assert.ok(p.getPrintFormat(legacy).legacy)
  }
  assert.equal(p.getPrintFormat('square').widthMm, 148)
})
