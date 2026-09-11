import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'

const directory = await mkdtemp(join(process.cwd(), 'node_modules', '.thumbnail-tests-'))
after(() => rm(directory, { recursive: true, force: true }))
await build({ entryPoints: ['src/shared/thumbnail-prompt.ts'], outfile: join(directory, 'thumbnail.mjs'), bundle: true, packages: 'external', platform: 'node', format: 'esm', logLevel: 'silent' })
const { buildThumbnailSystemPrompt, THUMBNAIL_STYLES } = await import(pathToFileURL(join(directory, 'thumbnail.mjs')).href)
const marker = 'PHOTOSHOP COMPOSITING — DISTINCT VISUAL LAYERS'

test('switching off preserves every pre-compositing style prompt byte for byte', () => {
  // Captured from the pre-feature HEAD builder with { style, faceFidelity: true }.
  const baseline = {
    auto: '2a9f7ea55590a0c7b9aeb4c6f89accd53ba857850fc666aacf3043b192c06e47',
    clean: '7ebb8cd0114742d9dd1b37344ff7a1cb95da3a4f237aa8d44e675b267affa94b',
    balanced: '2842fbe737c1db9cedadcb86e609416a4666c0f69e200620068d485ac74b46a1',
    bold: 'e31da765727caa323f86d312db8ff2bf3301440fb4c14781ab02ef154840af78',
  }
  for (const [style, expected] of Object.entries(baseline)) {
    const prompt = buildThumbnailSystemPrompt({ style, faceFidelity: true, thumbnailCompositing: false })
    assert.equal(createHash('sha256').update(prompt).digest('hex'), expected, style)
  }
})

test('compositing defaults on and explicit off removes only the additional direction', () => {
  for (const { id: style } of THUMBNAIL_STYLES) {
    const options = { style, faceFidelity: true, videoTitle: 'Two people at work', customMetaPrompt: 'Retain our channel typography.' }
    const omitted = buildThumbnailSystemPrompt(options)
    const enabled = buildThumbnailSystemPrompt({ ...options, thumbnailCompositing: true })
    const disabled = buildThumbnailSystemPrompt({ ...options, thumbnailCompositing: false })
    assert.equal(omitted, enabled)
    assert.ok(enabled.includes(marker), style)
    assert.ok(!disabled.includes(marker), style)
    for (const prompt of [enabled, disabled]) {
      assert.match(prompt, /REFERENCE PEOPLE — IDENTITY IS NON-NEGOTIABLE/)
      assert.match(prompt, /Two people at work/)
      assert.ok(prompt.endsWith('Retain our channel typography.'))
    }
  }
})

test('compositing respects the selected intensity and preserves optional identity rules', () => {
  const clean = buildThumbnailSystemPrompt({ style: 'clean', faceFidelity: false })
  const bold = buildThumbnailSystemPrompt({ style: 'bold', faceFidelity: false })
  assert.notEqual(clean.slice(clean.indexOf(marker)), bold.slice(bold.indexOf(marker)), 'Compositing must adapt to clean versus MrBeast')
  assert.ok(!clean.includes('REFERENCE PEOPLE — IDENTITY IS NON-NEGOTIABLE'))
  assert.match(clean, /negative space/i)
})
