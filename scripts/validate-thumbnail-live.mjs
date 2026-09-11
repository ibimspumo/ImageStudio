// Explicitly authorized paid visual acceptance, through the real Electron/MCP pipeline.
// Copies reference collections into a temporary profile; never logs provider credentials.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir, homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer } from 'node:http'
import { _electron as electron } from 'playwright'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import sharp from 'sharp'

if (process.env.IMAGESTUDIO_RUN_PAID_THUMBNAIL !== '1') throw new Error('Requires explicit generation authorization and IMAGESTUDIO_RUN_PAID_THUMBNAIL=1.')
const output = resolve(process.env.IMAGESTUDIO_THUMBNAIL_OUTPUT || 'screenshots/thumbnail-compositing')
await mkdir(output, { recursive: true })
const sourceProfile = process.env.IMAGESTUDIO_SOURCE_PROFILE || join(homedir(), 'Library/Application Support/imagestudio')
const settings = JSON.parse(await readFile(join(sourceProfile, 'imagestudio-settings.json'), 'utf8'))
assert.ok(settings.falApiKey, 'Existing provider key required')
const collections = JSON.parse(await readFile(join(sourceProfile, 'ImageStudio/history/collections.json'), 'utf8')).filter(c => ['Timo', 'Axel'].includes(c.name))
assert.equal(collections.length, 2, 'Timo and Axel collections required')
const profile = await mkdtemp(join(tmpdir(), 'imagestudio-thumbnail-paid-'))
const bootstrap = resolve('scripts/.thumbnail-paid-launch.cjs')
await mkdir(join(profile, 'ImageStudio/history'), { recursive: true })
await writeFile(join(profile, 'ImageStudio/history/collections.json'), JSON.stringify(collections))
await writeFile(join(profile, 'imagestudio-settings.json'), JSON.stringify({ falApiKey: settings.falApiKey, autoCheckUpdates: false, antiDetection: false }), { mode: 0o600 })
await writeFile(bootstrap, "const {app}=require('electron');app.setPath('userData',process.env.IMAGESTUDIO_TEST_PROFILE);require('../out/main/index.js');\n")
const allBriefs = [
  { style: 'auto', prompt: 'YouTube-Thumbnail für Büro-Comedy: [@Timo] links blickt entsetzt auf einen riesigen Stapel Arbeit in der Bildmitte. [@Axel] rechts grinst selbstzufrieden und hält einen Kaffeebecher. Beide Gesichter groß und klar erkennbar. Exakter Text: ALLES AN MIR! Dunkles Petrol und Signalorange. Eine sofort verständliche Geschichte über ungerechte Arbeitsteilung.' },
  { style: 'clean', prompt: 'YouTube-Thumbnail für ein ehrliches Gespräch über Führung. [@Timo] links mit einem skeptischen, nachdenklichen Blick in die Kamera, [@Axel] rechts mit einem selbstsicheren, leicht süffisanten Blick zu Timo. Beide groß im Brustporträt. Exakter Text: CHEF HAT RECHT? Dunkelblau und warmes Gelb. Seriös, trocken-humorig, sofort verständlicher Gegensatz.' },
  { style: 'balanced', prompt: 'YouTube-Thumbnail für Büro-Comedy: [@Timo] links blickt entsetzt auf einen riesigen Stapel Arbeit in der Bildmitte. [@Axel] rechts grinst selbstzufrieden und hält einen Kaffeebecher. Beide Gesichter groß und klar erkennbar. Exakter Text: ALLES AN MIR! Dunkles Petrol und Signalorange. Eine sofort verständliche Geschichte über ungerechte Arbeitsteilung.' },
  { style: 'bold', prompt: 'YouTube-Thumbnail im maximal überdrehten MrBeast-Stil für eine Büro-Challenge. [@Timo] links schockiert mit weit geöffneten Augen. [@Axel] rechts triumphiert mit einem großen Geldbündel. Beide groß, unverwechselbar und anatomisch plausibel. Exakter Text: 1.000 € BONUS Ein roter Pfeil zeigt auf das Geld. Kräftiges Blau und Gelb. Sofort erkennbarer Konflikt: Wer kassiert den Bonus?' },
]
const selectedStyles = (process.env.IMAGESTUDIO_THUMBNAIL_STYLES || 'auto').split(',')
const briefs = allBriefs.filter(brief => selectedStyles.includes(brief.style)).map(brief => ({ ...brief, prompt: brief.prompt + (process.env.IMAGESTUDIO_THUMBNAIL_BRIEF_SUFFIX ? '\n' + process.env.IMAGESTUDIO_THUMBNAIL_BRIEF_SUFFIX : '') }))
assert.ok(briefs.length, 'Select at least one known thumbnail style')
let app, client
const manifest = { generatedAt: new Date().toISOString(), paid: true, model: 'openai/gpt-image-2.5/sunburst/text-to-image', comparison: 'Same brief, references, quality and model; only thumbnailCompositing changes. Independent stochastic generations, no seed supported.', results: [] }
try {
  app = await electron.launch({ args: [bootstrap], env: { ...process.env, IMAGESTUDIO_TEST_PROFILE: profile } })
  const page = await app.firstWindow()
  await page.waitForFunction(async () => (await window.api.getAutomationStatus()).rendererReady)
  const reservation = createServer()
  await new Promise(r => reservation.listen(0, '127.0.0.1', r))
  const port = reservation.address().port
  await new Promise(r => reservation.close(r))
  const connection = await page.evaluate(port => window.api.configureAutomation({ enabled: true, port }), port)
  client = new Client({ name: 'thumbnail-visual-acceptance', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(connection.url), { requestInit: { headers: { Authorization: `Bearer ${connection.token}` } } }))
  async function call(name, args = {}) {
    const result = await client.callTool({ name, arguments: args })
    assert.ok(!result.isError, `${name}: ${JSON.stringify(result.content)}`)
    return JSON.parse(result.content.find(c => c.type === 'text').text)
  }
  const caps = await call('get_capabilities')
  manifest.thumbnailCompositing = caps.thumbnailCompositing
  const listed = await call('collections', { action: 'list' })
  manifest.collections = listed
  const variants = process.env.IMAGESTUDIO_THUMBNAIL_ON_ONLY === '1' ? [true] : [false, true]
  const matrix = briefs.flatMap(brief => variants.map(thumbnailCompositing => ({ name: `${brief.style}-${thumbnailCompositing ? 'after' : 'before'}`, args: { ...brief, mode: 'thumbnail', thumbnailCompositing, models: [manifest.model], quality: 'high', imageCount: 1, outputFormat: 'png', collectionIds: collections.map(c => c.id), metaPromptId: '', presetId: '', projectId: '', workspaceId: '' } })))
  for (const entry of matrix) {
    entry.preview = await call('preview_generation', entry.args)
    assert.equal(entry.preview.request.thumbnailCompositing, entry.args.thumbnailCompositing)
    console.log(JSON.stringify({ event: 'preview', name: entry.name, estimatedCostUsd: entry.preview.estimatedCostUsd }))
  }
  // Two simultaneous jobs at most; await completion/export before the next pair.
  for (let pair = 0; pair < matrix.length; pair += 2) {
    for (const entry of matrix.slice(pair, pair + 2)) {
      entry.jobIds = (await call('generate', entry.args)).jobIds
      manifest.results.push(entry)
      await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2))
      console.log(JSON.stringify({ event: 'submitted', name: entry.name, jobIds: entry.jobIds }))
    }
    for (const entry of matrix.slice(pair, pair + 2)) {
      let status
      for (let attempt = 0; attempt < 60; attempt++) {
        status = await call('wait_for_jobs', { ids: entry.jobIds, timeoutMs: 20000 })
        if (status.completed) break
        console.log(JSON.stringify({ event: 'waiting', name: entry.name, jobs: status.jobs.map(j => ({status:j.status, elapsedMs:j.elapsedMs})) }))
      }
      entry.jobs = status.jobs
      assert.equal(entry.jobs[0].status, 'completed', `${entry.name}: ${entry.jobs[0].error || 'timed out'}`)
      entry.details = await call('generation_details', { id: entry.jobIds[0] })
      const original = join(output, `${entry.name}-original.png`)
      await call('export_media', { id: entry.jobIds[0], destination: original, overwrite: true })
      const metadata = await sharp(original).metadata()
      entry.actual = { width: metadata.width, height: metadata.height, format: metadata.format }
      // Same centered eight-pixel crop used for 1920x1080 thumbnail delivery.
      entry.output = join(output, `${entry.name}.png`)
      await sharp(original).resize(1920, 1080, { fit: 'cover' }).png().toFile(entry.output)
      await sharp(entry.output).resize(960, 540).toFile(join(output, `${entry.name}-preview.png`))
      await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2))
      console.log(JSON.stringify({ event: 'exported', name: entry.name, path: entry.output, actual: entry.actual }))
    }
  }
  await call('navigate', { target: 'thumbnail' })
  await call('update_draft', { mode: 'thumbnail', patch: { prompt: briefs[0].prompt, collectionIds: collections.map(c => c.id), thumbnailCompositing: true } })
  await page.screenshot({ path: join(output, 'composer.png'), animations: 'disabled' })
} finally {
  await client?.close().catch(() => {})
  await app?.close().catch(() => {})
  await rm(bootstrap, { force: true })
  await rm(profile, { recursive: true, force: true })
}
