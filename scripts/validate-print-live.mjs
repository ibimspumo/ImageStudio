// Opt-in paid acceptance run. Uses an isolated profile and the existing local key;
// never logs credentials, never overwrites the user's gallery or settings.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir, homedir } from 'node:os'
import { join, resolve, extname } from 'node:path'
import { createServer } from 'node:http'
import { _electron as electron } from 'playwright'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import sharp from 'sharp'

if (process.env.IMAGESTUDIO_RUN_PAID_PRINT !== '1') throw new Error('Paid provider requests require IMAGESTUDIO_RUN_PAID_PRINT=1 after explicit user authorization.')
const output = resolve(process.env.IMAGESTUDIO_PRINT_OUTPUT || 'screenshots/print-validation')
await mkdir(output, { recursive: true })
const profile = await mkdtemp(join(tmpdir(), 'imagestudio-print-paid-'))
const bootstrap = resolve('scripts/.print-paid-launch.cjs')
const settings = JSON.parse(await readFile(process.env.IMAGESTUDIO_SETTINGS_PATH || join(homedir(), 'Library/Application Support/imagestudio/imagestudio-settings.json'), 'utf8'))
assert.ok(settings.falApiKey, 'An existing provider key is required')
await writeFile(join(profile, 'imagestudio-settings.json'), JSON.stringify({ falApiKey: settings.falApiKey, autoCheckUpdates: false, antiDetection: true }), { mode: 0o600 })
await writeFile(bootstrap, "const {app}=require('electron'); app.setPath('userData',process.env.IMAGESTUDIO_TEST_PROFILE); require('../out/main/index.js');\n")
let app, client
const manifest = { generatedAt: new Date().toISOString(), paid: true, results: [] }
try {
  app = await electron.launch({ args: [bootstrap], env: { ...process.env, IMAGESTUDIO_TEST_PROFILE: profile } })
  const page = await app.firstWindow()
  await page.waitForFunction(async () => (await window.api.getAutomationStatus()).rendererReady)
  const reservation = createServer()
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve))
  const port = reservation.address().port
  await new Promise(resolve => reservation.close(resolve))
  const connection = await page.evaluate(port => window.api.configureAutomation({ enabled: true, port }), port)
  client = new Client({ name: 'print-paid-acceptance', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(connection.url), { requestInit: { headers: { Authorization: `Bearer ${connection.token}` } } }))
  async function call(name, args = {}) {
    const result = await client.callTool({ name, arguments: args })
    assert.ok(!result.isError, `${name}: ${JSON.stringify(result.content)}`)
    return JSON.parse(result.content.find(item => item.type === 'text').text)
  }
  const capabilities = await call('get_capabilities')
  assert.ok(capabilities.modes.includes('print'))
  manifest.capabilities = capabilities
  const poster = 'Gestalte ein Plakat für einen Weihnachtsmarkt. Exakter Text: WINTERLICHT / Weihnachtsmarkt am alten Bahnhof / 12.–14. Dezember 2026 / Fr 16–21 Uhr · Sa & So 12–21 Uhr / Kunsthandwerk · Punsch · Live-Musik / Eintritt frei. Zeitgenössisch, warm, dunkelgrün und Zinnoberrot; ein abstrahierter Stern als zentrales Formelement.'
  const cases = JSON.parse(process.env.IMAGESTUDIO_PRINT_CASES_FILE ? await readFile(process.env.IMAGESTUDIO_PRINT_CASES_FILE, 'utf8') : process.env.IMAGESTUDIO_PRINT_CASES || 'null') || [
    { name: 'poster-baseline', mode: 'image', imageSize: { width: 2240, height: 3168 }, prompt: poster },
    { name: 'poster-print', mode: 'print', printFormat: 'a4-portrait', printStyle: 'auto', prompt: poster, ui: true },
    { name: 'business-card', mode: 'print', printFormat: 'business-card', printStyle: 'swiss', prompt: 'Eine einzelne Vorderseite für das Architekturbüro RAUMWERK. Exakter Text: RAUMWERK / Architektur & Innenräume / Lea Sommer / Architektin / hallo@raumwerk.example / +49 30 555 0123. Präzise Schwarz-Weiß-Typografie mit einem kleinen kobaltblauen Quadrat. Name und Kontakt müssen auch verkleinert gut lesbar sein.' },
    { name: 'flyer-dl', mode: 'print', printFormat: 'dl-portrait', printStyle: 'editorial', prompt: 'Ein Flyer für eine Fahrradwerkstatt, klar und lebendig. Exakter Text: DEIN RAD. / WIEDER BEREIT. / Frühjahrs-Check bei VELO / Bremsen · Schaltung · Licht / Samstag, 21. März / 10–16 Uhr / Marktstraße 12 / Termin: velo.example. Sonnengelb, Schwarz und Weiß, eine einzelne freigestellte Fahrradkurbel als Bildmotiv, klar getrennte Informationsblöcke.' },
    { name: 'culture-square', mode: 'print', printFormat: 'square', printStyle: 'bold', prompt: 'Experimentelles typografisches Kulturplakat, keine zurückhaltende Beige-Ästhetik. Exakter Text: NACHT / TAKT / Elektronische Musik & Live-Visuals / 24.10.2026 / 22 UHR / HALLE 04. Schwarz, Elektroblau und Signalorange, übergroße kondensierte Buchstaben, ein angeschnittener Kreis, mutige asymmetrische Hierarchie. Inhalt bleibt vollständig lesbar.' },
  ]
  for (const entry of cases) {
    if (entry.referenceFile) {
      const reference = await call('import_media', { source: resolve(entry.referenceFile), name: 'Print acceptance reference' })
      entry.references = [reference.id]
      delete entry.referenceFile
    }
  }
  // Resolve and validate the entire matrix before starting any paid job.
  for (const { name, ui, ...brief } of cases) await call('preview_generation', { ...brief, quality: 'high', outputFormat: 'png', imageCount: 1 })
  for (const { name, ui, ...brief } of cases) {
    const args = { ...brief, quality: 'high', outputFormat: 'png', imageCount: 1 }
    const preview = await call('preview_generation', args)
    console.log(JSON.stringify({ event: 'preview', name, estimatedCostUsd: preview.estimatedCostUsd, request: { models: preview.request.models, imageSize: preview.request.imageSize } }))
    let jobIds
    if (ui) {
      await call('navigate', { target: 'print' })
      await call('update_draft', { mode: 'print', patch: { prompt: brief.prompt, printFormat: brief.printFormat, printStyle: brief.printStyle, quality: 'high', outputFormat: 'png' } })
      await page.screenshot({ path: join(output, 'print-composer.png'), animations: 'disabled' })
      const before = new Set((await call('list_images')).images.map(image => image.id))
      await page.getByRole('button', { name: 'Generieren', exact: true }).click()
      for (let attempt = 0; attempt < 50; attempt++) {
        jobIds = (await call('list_images')).images.filter(image => !before.has(image.id)).map(image => image.id)
        if (jobIds.length) break
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      assert.equal(jobIds.length, 1)
    } else jobIds = (await call('generate', args)).jobIds
    manifest.results.push({ name, brief, preview, jobIds })
    await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2))
    console.log(JSON.stringify({ event: 'submitted', name, jobIds }))
  }
  for (const result of manifest.results) {
    let jobs
    for (let attempt = 0; attempt < 45; attempt++) {
      const status = await call('wait_for_jobs', { ids: result.jobIds, timeoutMs: 20000 })
      jobs = status.jobs
      if (status.completed) break
      console.log(JSON.stringify({ event: 'waiting', name: result.name, status: jobs.map(j => j.status) }))
    }
    result.jobs = jobs
    const job = jobs[0]
    if (job.status !== 'completed') { console.log(JSON.stringify({ event: 'failed', name: result.name, error: job.error })); continue }
    result.generationDetails = await call('generation_details', { id: job.id })
    const destination = join(output, result.name + extname(job.filePath))
    await call('export_media', { id: job.id, destination, overwrite: true })
    const metadata = await sharp(destination).metadata()
    result.output = destination
    result.actual = { width: metadata.width, height: metadata.height, format: metadata.format, bytes: (await readFile(destination)).length }
    await sharp(destination).resize({ width: 900, height: 1100, fit: 'inside' }).png().toFile(join(output, result.name + '-preview.png'))
    console.log(JSON.stringify({ event: 'exported', name: result.name, ...result.actual, path: destination }))
    await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2))
  }
  await call('navigate', { target: 'print' })
  await page.screenshot({ path: join(output, 'print-gallery.png'), animations: 'disabled' })
  await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2))
} finally {
  await client?.close().catch(() => {})
  await app?.close().catch(() => {})
  await rm(bootstrap, { force: true })
  // Keep rendered evidence, remove the disposable profile including its key.
  await rm(profile, { recursive: true, force: true })
}
