// Real Electron + MCP smoke test. Uses a disposable profile; never calls fal.ai.
import assert from 'node:assert/strict'
import { runGpt25UiChecks } from './ui-gpt25-checks.mjs'
import { runThumbnailCompositingUiChecks } from './ui-thumbnail-compositing-checks.mjs'
import { runPrintUiChecks } from './ui-print-checks.mjs'
import { runCreationUiChecks } from './ui-creation-checks.mjs'
import { runProcessingUiChecks } from './ui-processing-checks.mjs'
import { mkdir, mkdtemp, writeFile, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer } from 'node:http'
import { _electron as electron } from 'playwright'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const temp = await mkdtemp(join(tmpdir(), 'imagestudio-mcp-app-'))
const bootstrap = resolve('scripts/.automation-test-launch.cjs')
const fixture = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5l8AAAAASUVORK5CYII=', 'base64')
const mediaServer = createServer((_req, res) => { res.setHeader('Content-Type', 'image/png'); res.end(fixture) })
await new Promise(resolve => mediaServer.listen(0, '127.0.0.1', resolve))
await writeFile(join(temp, 'imagestudio-settings.json'), JSON.stringify({ defaultModel: 'fal-ai/nano-banana-2', autoCheckUpdates: false, antiDetection: false }))
await writeFile(bootstrap, "const {app}=require('electron'); app.setPath('userData',process.env.IMAGESTUDIO_TEST_PROFILE); require('../out/main/index.js');\n")
let app
let client
try {
  app = await electron.launch({ args: [bootstrap], env: { ...process.env, IMAGESTUDIO_TEST_PROFILE: temp } })
  const page = await app.firstWindow()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.waitForFunction(async () => (await window.api.getAutomationStatus()).rendererReady)
  const initial = await page.evaluate(() => window.api.getAutomationStatus())
  assert.equal(initial.enabled, false)
  // Use an ephemeral available port without modifying a running user instance.
  const reservation = createServer()
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve))
  const port = reservation.address().port
  await new Promise(resolve => reservation.close(resolve))
  const connection = await page.evaluate(port => window.api.configureAutomation({ enabled: true, port }), port)
  assert.equal(connection.running, true)
  const transport = new StreamableHTTPClientTransport(new URL(connection.url), { requestInit: { headers: { Authorization: `Bearer ${connection.token}` } } })
  client = new Client({ name: 'imagestudio-app-test', version: '1.0.0' })
  await client.connect(transport)
  const { tools } = await client.listTools()
  for (const name of ['get_capabilities', 'get_status', 'generate', 'generate_video', 'collections', 'import_media', 'read_image', 'get_draft', 'update_draft']) assert.ok(tools.some(tool => tool.name === name), name)
  for (const name of ['chats', 'chat_generate', 'image_inpaint']) {
    assert.ok(!tools.some(tool => tool.name === name), `${name} is absent from discovery`)
    assert.equal((await client.callTool({ name, arguments: {} })).isError, true)
  }
  for (const mode of ['chat', 'inpaint']) {
    for (const name of ['get_draft', 'generate_draft']) assert.equal((await client.callTool({ name, arguments: { mode } })).isError, true)
    assert.equal((await client.callTool({ name: 'navigate', arguments: { target: mode } })).isError, true)
  }
  async function call(name, args = {}) {
    const result = await client.callTool({ name, arguments: args })
    assert.ok(!result.isError, `${name}: ${JSON.stringify(result.content)}`)
    const text = result.content.find(item => item.type === 'text')?.text
    return text ? JSON.parse(text) : result
  }
  // Both directions observe one route state: agent navigation highlights the UI,
  // and human sidebar clicks are immediately visible in MCP status.
  for (const section of ['library', 'references', 'styles', 'projects', 'activity', 'settings']) {
    await call('navigate', { target: section })
    await page.locator(`[data-studio-section="${section}"][aria-current="page"]`).waitFor()
    assert.equal((await call('get_status')).view.section, section)
    await page.locator('[data-studio-section="image"]').click()
    assert.equal((await call('get_status')).view.section, 'image')
  }
  for (const [target, section] of [['collections', 'references'], ['presets', 'styles'], ['queue', 'activity']]) {
    await call('navigate', { target })
    await page.locator(`[data-studio-section="${section}"][aria-current="page"]`).waitFor()
    assert.equal((await call('get_status')).view.section, section)
  }
  await call('navigate', { target: 'image' })
  const settings = await call('get_settings')
  assert.equal(settings.apiKeyConfigured, false)
  assert.equal(settings.defaultModel, 'openai/gpt-image-2.5/sunburst/text-to-image', 'Existing Nano Banana default migrates for all users')
  assert.deepEqual((await call('get_draft', { mode: 'image' })).models, [settings.defaultModel])
  const persistedSettings = JSON.parse(await readFile(join(temp, 'imagestudio-settings.json'), 'utf8'))
  assert.equal(persistedSettings.defaultModel, settings.defaultModel)
  assert.equal(persistedSettings.imageDefaultsRevision, 1)
  const folder = await call('workspaces', { action: 'create', name: 'MCP smoke folder' })
  await call('workspaces', { action: 'select', id: folder.id })
  const imported = await call('import_media', { source: `http://127.0.0.1:${mediaServer.address().port}/reference.png`, name: 'Smoke reference' })
  const imageId = imported.id ?? imported.image?.id
  assert.ok(imageId, 'Imported media returns reusable gallery ID')
  const listed = await call('list_images', { workspaceId: folder.id })
  assert.ok(listed.images.some(image => image.id === imageId))
  const imageResult = await client.callTool({ name: 'read_image', arguments: { id: imageId } })
  assert.ok(imageResult.content.some(item => item.type === 'image'))
  const collection = await call('collections', { action: 'create', name: 'Smoke references', images: [imageId] })
  const collectionPreview = await client.callTool({ name: 'collections', arguments: { action: 'view_image', id: collection.id, imageIndex: 0 } })
  assert.ok(collectionPreview.content.some(item => item.type === 'image'))
  const project = await call('projects', { action: 'create', title: 'Smoke thumbnail' })
  // Regression: leave a selected thumbnail project through breadcrumbs and sidebar.
  // A working folder must never silently constrain the thumbnail overview or library.
  const otherProject = await call('projects', { action: 'create', title: 'Other thumbnail' })
  const otherImport = await call('import_media', { source: `http://127.0.0.1:${mediaServer.address().port}/other.png`, name: 'Other reference' })
  const otherImageId = otherImport.id ?? otherImport.image?.id
  await call('update_image', { id: imageId, projectId: project.id })
  await call('update_image', { id: otherImageId, projectId: otherProject.id, workspaceId: '' })
  await call('navigate', { target: 'thumbnail' })
  await call('workspaces', { action: 'select', id: folder.id })
  await call('projects', { action: 'select', id: project.id })
  await page.getByRole('heading', { name: 'Smoke thumbnail', exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Öffnen', exact: true }).count(), 1)
  await page.getByRole('button', { name: 'Alle Thumbnails anzeigen', exact: true }).click()
  await page.getByRole('heading', { name: 'Deine Thumbnails', exact: true }).waitFor()
  assert.equal((await call('get_status')).activeProjectId, null)
  assert.equal(await page.getByRole('button', { name: 'Öffnen', exact: true }).count(), 2)
  await page.getByRole('button', { name: 'Smoke thumbnail', exact: true }).click()
  await page.getByRole('heading', { name: 'Smoke thumbnail', exact: true }).waitFor()
  await page.locator('[data-studio-section="thumbnail"]').click()
  await page.getByRole('heading', { name: 'Deine Thumbnails', exact: true }).waitFor()
  assert.equal((await call('get_status')).activeProjectId, null)
  await call('projects', { action: 'select', id: project.id })
  await call('navigate', { target: 'thumbnail' })
  assert.equal((await call('get_status')).activeProjectId, null)
  await page.getByRole('button', { name: 'Studio', exact: true }).click()
  await page.getByRole('heading', { name: 'Deine Mediathek', exact: true }).waitFor()
  assert.equal((await call('get_status')).activeWorkspaceId, null)
  assert.equal(await page.getByRole('button', { name: 'Öffnen', exact: true }).count(), 2)
  await call('navigate', { target: 'image' })
  await call('workspaces', { action: 'select', id: folder.id })
  await page.getByRole('heading', { name: 'MCP smoke folder', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Alle Bilder anzeigen', exact: true }).click()
  await page.getByRole('heading', { name: 'Deine Bilder', exact: true }).waitFor()
  assert.equal((await call('get_status')).activeWorkspaceId, null)
  await call('update_image', { id: imageId, projectId: '' })
  await call('delete_images', { ids: [otherImageId] })
  await call('projects', { action: 'delete', id: otherProject.id })
  const meta = await call('meta_prompts', { action: 'create', name: 'Smoke rules', text: 'Keep the headline readable.' })
  const preview = await call('preview_generation', { prompt: 'A studio portrait', mode: 'thumbnail', projectId: project.id, metaPromptId: meta.id, collectionIds: [collection.id] })
  assert.ok(JSON.stringify(preview).includes('Keep the headline readable.'))
  await call('navigate', { target: 'image' })
  // Clipboard text restores real collections; unknown references stay plain text.
  await call('update_draft', { mode: 'image', patch: { prompt: 'Before AFTER', references: [], collectionIds: [] } })
  const pasteEditor = page.getByRole('textbox', { name: 'Bildbeschreibung', exact: true }).last()
  const pastedPrompt = '[@Smoke references] and [@Smoke references]\n[@Missing] [Image 9] <b>plain</b>'
  await pasteEditor.evaluate((node, text) => {
    node.focus()
    const range = document.createRange()
    range.setStart(node.firstChild, 7); range.setEnd(node.firstChild, 12)
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range)
    const data = new DataTransfer(); data.setData('text/plain', text)
    node.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }))
  }, pastedPrompt)
  await page.waitForFunction(() => document.querySelectorAll('[contenteditable="true"] [data-collection-ref-id]').length === 2)
  let pastedDraft = await call('get_draft', { mode: 'image' })
  assert.equal(pastedDraft.prompt, `Before ${pastedPrompt}`)
  assert.equal(pastedDraft.collections.length, 1)
  assert.equal(pastedDraft.collections[0].collectionId, collection.id)
  assert.equal(await pasteEditor.locator('b').count(), 0)
  await page.keyboard.type(' End.')
  assert.equal((await call('get_draft', { mode: 'image' })).prompt, `Before ${pastedPrompt} End.`)
  // A prompt-only MCP edit uses the same name resolution as human paste.
  await call('update_draft', { mode: 'image', patch: { prompt: '', references: [], collectionIds: [] } })
  await call('update_draft', { mode: 'image', patch: { prompt: 'Again [@Smoke references]' } })
  pastedDraft = await call('get_draft', { mode: 'image' })
  assert.equal(pastedDraft.collections.length, 1)
  assert.equal(pastedDraft.prompt, 'Again [@Smoke references]')
  const inlinePrompt = 'Portrait of [@Smoke references] wearing the outfit from [Image 1], holding the prop from [Image 2], in the room from [Image 3]. Preserve [@Smoke references].'
  await call('update_draft', { mode: 'image', patch: { prompt: inlinePrompt, references: [imageId, imageId, imageId], collectionIds: [collection.id] } })
  const draft = await call('get_draft', { mode: 'image' })
  assert.equal(draft.prompt, inlinePrompt)
  assert.deepEqual(draft.references.map(ref => ref.promptReference), ['[Image 1]', '[Image 2]', '[Image 3]'])
  assert.equal(draft.collections[0].promptReference, '[@Smoke references]')
  const editor = page.locator('[contenteditable="true"]').last()
  assert.deepEqual(await editor.locator('[data-image-ref-id], [data-collection-ref-id]').allTextContents(), ['@Smoke references', 'Image 1', 'Image 2', 'Image 3', '@Smoke references'])
  assert.equal(await editor.evaluate(node => node.firstChild.textContent), 'Portrait of ')
  // A human edit is immediately readable through MCP, with all inline chips intact.
  await page.evaluate(() => {
    const node = [...document.querySelectorAll('[contenteditable="true"]')].at(-1)
    node.focus()
    const range = document.createRange(); range.selectNodeContents(node); range.collapse(false)
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range)
  })
  await page.keyboard.type(' Soft lighting.')
  assert.equal((await call('get_draft', { mode: 'image' })).prompt, `${inlinePrompt} Soft lighting.`)
  const invalid = await client.callTool({ name: 'generate', arguments: { prompt: 'No provider call', models: ['invalid-model'] } })
  assert.equal(invalid.isError, true)
  assert.equal((await call('get_status')).runningCount, 0)
  // Run the user's full chained workflow with provider boundaries mocked in
  // this disposable app only. Storage, hooks, references and MCP remain real.
  const videoData = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 16; canvas.height = 16
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#a78bfa'; ctx.fillRect(0, 0, 16, 16)
    const stream = canvas.captureStream(10)
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' })
    const chunks = []
    const done = new Promise(resolve => {
      recorder.ondataavailable = event => chunks.push(event.data)
      recorder.onstop = async () => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1])
        reader.readAsDataURL(new Blob(chunks, { type: 'video/webm' }))
      }
    })
    recorder.start()
    await new Promise(resolve => setTimeout(resolve, 250))
    recorder.stop(); stream.getTracks().forEach(track => track.stop())
    return done
  })
  const mockVideoPath = join(temp, 'ImageStudio', 'videos', 'mock.webm')
  await mkdir(join(temp, 'ImageStudio', 'videos'), { recursive: true })
  await writeFile(mockVideoPath, Buffer.from(videoData, 'base64'))
  await app.evaluate(({ ipcMain }, { png, videoPath }) => {
    globalThis.__automationTestCalls = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input))
      if (url.hostname === 'api.fal.ai' && url.pathname === '/v1/models/billing-events') {
        const ids = (url.searchParams.get('request_id') || '').split(',')
        return new Response(JSON.stringify({ billing_events: ids.filter(id => id.startsWith('mock-image-1-')).map(id => ({ request_id: id, cost_total: 0.017 })), has_more: false, next_cursor: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return originalFetch(input, init)
    }
    ipcMain.removeHandler('image:upload-urls')
    ipcMain.handle('image:upload-urls', (_event, { images }) => ({ success: true, urls: images.map((_, index) => `https://test.invalid/reference-${index}.png`) }))
    ipcMain.removeHandler('image:generate')
    ipcMain.handle('image:generate', (_event, request) => {
      globalThis.__automationTestCalls.push({ kind: 'image', hasReferences: !!request.attachments?.length, prompt: request.prompt, referenceLabels: request.labeledAttachments?.map(group => group.label), model: request.model, imageSize: request.imageSize, quality: request.quality, background: request.background, outputFormat: request.outputFormat, outputCompression: request.outputCompression })
      return { success: true, results: Array.from({ length: request.count }, (_, index) => ({ status: 'complete', result: { id: `mock-image-${globalThis.__automationTestCalls.length}-${index}`, imageBase64: `data:image/png;base64,${png}`, cost: 0.1 } })) }
    })
    ipcMain.removeHandler('video:generate')
    ipcMain.handle('video:generate', (_event, request) => {
      globalThis.__automationTestCalls.push({ kind: 'video', hasStartFrame: request.imageUrl.startsWith('data:image/') })
      return { success: true, filePath: videoPath, duration: request.duration }
    })
  }, { png: fixture.toString('base64'), videoPath: mockVideoPath })
  await call('update_settings', { falApiKey: 'test-key-never-sent-to-provider' })
  const first = await call('generate_draft', { mode: 'image' })
  await call('wait_for_jobs', { ids: first.jobIds, timeoutMs: 20000 })
  assert.equal((await call('get_status', { ids: first.jobIds })).jobs[0].status, 'completed')
  const second = await call('generate', { prompt: 'Use the person from [Image 1] in a new scene', references: [first.jobIds[0]] })
  await call('wait_for_jobs', { ids: second.jobIds, timeoutMs: 20000 })
  const video = await call('generate_video', { prompt: 'Animate the result', startImageId: second.jobIds[0] })
  const videoId = video.jobId ?? video.jobIds?.[0] ?? video.id
  assert.ok(videoId)
  await call('wait_for_jobs', { ids: [videoId], timeoutMs: 20000 })
  const mediaResult = await client.callTool({ name: 'read_media', arguments: { id: videoId } })
  assert.ok(mediaResult.content.some(item => item.type === 'resource_link' && item.mimeType === 'video/webm'))
  const providerCalls = await app.evaluate(() => globalThis.__automationTestCalls)
  assert.deepEqual(providerCalls.map(item => item.kind), ['image', 'image', 'video'])
  assert.ok(providerCalls[0].hasReferences && providerCalls[1].hasReferences && providerCalls[2].hasStartFrame)
  assert.equal(providerCalls[0].prompt, `${inlinePrompt} Soft lighting.`)
  assert.deepEqual(providerCalls[0].referenceLabels, ['Image 1', 'Image 2', 'Image 3', 'Collection "@Smoke references" (1 image)'])
  assert.equal(providerCalls[1].prompt, 'Use the person from [Image 1] in a new scene')
  // Same-session reuse used to read embedded image data as a filesystem path.
  // Exercise the human button and MCP against the exact same generated result.
  await call('navigate', { target: 'viewer', id: second.jobIds[0] })
  await page.getByRole('button', { name: 'Prompt übernehmen', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('[contenteditable="true"] [data-image-ref-id]'), undefined, { timeout: 5000 })
  let reused = await call('get_draft', { mode: 'image' })
  assert.equal(reused.referenceLoadStatus, 'ready')
  assert.equal(reused.references.length, 1)
  assert.equal(reused.prompt, 'Use the person from [Image 1] in a new scene')
  await call('navigate', { target: 'reuse_prompt', id: second.jobIds[0] })
  await page.waitForFunction(() => document.querySelector('[contenteditable="true"] [data-image-ref-id]'))
  reused = await call('get_draft', { mode: 'image' })
  assert.equal(reused.referenceLoadStatus, 'ready')
  assert.equal(reused.references.length, 1)
  await call('navigate', { target: 'create_variant', id: second.jobIds[0] })
  await page.waitForFunction(() => [...document.querySelectorAll('[contenteditable="true"]')].some(node => node.textContent.includes('als Ausgangsbild verwenden') && node.querySelectorAll('[data-image-ref-id]').length === 1))
  const variant = await call('get_draft', { mode: 'image' })
  assert.equal(variant.references.length, 1)
  assert.equal(variant.references[0].promptReference, '[Image 1]')
  const variantSource = (await call('list_images')).images.find(image => image.id === second.jobIds[0])
  assert.deepEqual(variant.models, [variantSource.model])
  assert.equal(variant.aspectRatio, variantSource.aspectRatio)
  assert.equal(variant.resolution, variantSource.resolution)
  assert.equal((await app.evaluate(() => globalThis.__automationTestCalls)).length, 3, 'Preparing a variant never calls a paid provider')
  await call('navigate', { target: 'close_panels' })
  const billingSecret = 'billing-admin-test-never-sent'
  await call('update_settings', { falBillingApiKey: billingSecret })
  assert.ok(!JSON.stringify(await call('get_settings')).includes(billingSecret), 'Ordinary settings never reveal billing secret')
  const billing = await call('refresh_costs', { ids: [...first.jobIds, ...second.jobIds] })
  assert.equal(billing.success, true)
  const billedImages = (await call('list_images')).images
  const confirmed = billedImages.find(image => image.id === first.jobIds[0])
  const estimated = billedImages.find(image => image.id === second.jobIds[0])
  assert.equal(confirmed.cost, 0.017)
  assert.equal(confirmed.costSource, 'provider-reported')
  assert.equal(confirmed.estimatedCost, 0.1, 'Original list estimate retained')
  assert.equal(estimated.costSource, 'list-price-estimate', 'Absent event remains an estimate')
  const billingStatus = await call('get_status')
  assert.equal(billingStatus.costs.confirmedSpendUsd, 0.017)
  assert.ok(!JSON.stringify(billingStatus).includes(billingSecret), 'Status never reveals billing secret')
  await call('navigate', { target: 'activity' })
  await page.getByText(/0\.017 USD von fal\.ai bestätigt/).waitFor()
  await page.getByRole('button', { name: 'Kosten mit fal.ai abgleichen', exact: true }).click()
  await page.getByText(/0\.017 USD von fal\.ai bestätigt/).waitFor()
  await runGpt25UiChecks(page, { app, call, client })
  await runPrintUiChecks(page, { app, call, client, imageId })
  await runThumbnailCompositingUiChecks(page, { app, call, client, temp, imageId })
  await runProcessingUiChecks(page, { app, call, client, temp, projectId: project.id, workspaceId: folder.id })
  await call('update_settings', { falApiKey: '', falBillingApiKey: '' })
  await runCreationUiChecks(page, { call, imageId })
  // UI sees the same imported media and project/collection changes.
  await call('navigate', { target: 'settings' })
  await page.getByRole('button', { name: 'KI-Verbindung', exact: true }).click()
  await page.getByRole('heading', { name: 'KI-Verbindung' }).scrollIntoViewIfNeeded()
  await page.getByRole('button', { name: 'Einrichtung kopieren' }).waitFor({ state: 'visible' })
  await page.screenshot({ path: join(temp, 'settings.png') })
  if (process.env.IMAGESTUDIO_TEST_SCREENSHOT) await writeFile(process.env.IMAGESTUDIO_TEST_SCREENSHOT, await readFile(join(temp, 'settings.png')))
  // Sidebar deletion retains image/video bytes and the independent grouping.
  const sidebarFolder = await call('workspaces', { action: 'create', name: 'Sidebar retention folder' })
  const sidebarProject = await call('projects', { action: 'create', title: 'Sidebar retention project' })
  for (const id of [imageId, videoId]) await call('update_image', { id, workspaceId: sidebarFolder.id, projectId: sidebarProject.id })
  await call('navigate', { target: 'image' })
  await call('workspaces', { action: 'select', id: sidebarFolder.id })
  const deleteFolder = page.getByRole('button', { name: 'Arbeitsordner Sidebar retention folder löschen', exact: true })
  await deleteFolder.click()
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click()
  assert.ok((await call('workspaces', { action: 'list' })).workspaces.some(item => item.id === sidebarFolder.id))
  await deleteFolder.click()
  if (process.env.IMAGESTUDIO_SIDEBAR_SCREENSHOT) await page.screenshot({ path: process.env.IMAGESTUDIO_SIDEBAR_SCREENSHOT })
  await page.getByRole('alertdialog').getByRole('button', { name: 'Löschen', exact: true }).click()
  await deleteFolder.waitFor({ state: 'detached' })
  assert.equal((await call('workspaces', { action: 'list' })).activeId, null)
  for (const id of [imageId, videoId]) {
    const retained = (await call('list_images')).images.find(item => item.id === id)
    assert.ok(retained, 'Media remains after sidebar folder deletion')
    assert.equal(retained.workspaceId, undefined)
    assert.equal(retained.projectId, sidebarProject.id)
  }
  await call('navigate', { target: 'thumbnail' })
  await call('projects', { action: 'select', id: sidebarProject.id })
  await call('update_image', { id: imageId, workspaceId: folder.id })
  const deleteProject = page.getByRole('button', { name: 'Videoprojekt Sidebar retention project löschen', exact: true })
  await deleteProject.click()
  await page.keyboard.press('Escape')
  assert.equal(await deleteProject.getAttribute('aria-expanded'), 'false')
  await deleteProject.click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Löschen', exact: true }).click()
  await deleteProject.waitFor({ state: 'detached' })
  assert.equal((await call('projects', { action: 'list' })).activeId, null)
  const retainedImage = (await call('list_images')).images.find(item => item.id === imageId)
  assert.equal(retainedImage.projectId, undefined)
  assert.equal(retainedImage.workspaceId, folder.id)
  assert.ok((await client.callTool({ name: 'read_image', arguments: { id: imageId } })).content.some(item => item.type === 'image'))
  // MCP deletion removes the same sidebar row and retains the same media.
  await call('workspaces', { action: 'delete', id: folder.id })
  await page.getByRole('button', { name: 'Arbeitsordner MCP smoke folder löschen', exact: true }).waitFor({ state: 'detached' })
  assert.equal((await call('list_images')).images.find(item => item.id === imageId).workspaceId, undefined)
  const history = await page.evaluate(() => window.api.listHistory())
  const persistedGallery = history.sessions.find(item => item.id === 'gallery')
  assert.ok(persistedGallery, 'Gallery persistence exists')
  assert.ok(!persistedGallery.data.includes(sidebarFolder.id) && !persistedGallery.data.includes(sidebarProject.id), 'Deleted group IDs are removed from persisted media')
  console.log('PASS sidebar folder/project cancellation, deletion, retained media, persistence and MCP parity')
  await call('collections', { action: 'delete', id: collection.id })
  await call('projects', { action: 'delete', id: project.id })
  await call('meta_prompts', { action: 'delete', id: meta.id })
  await call('delete_images', { ids: [imageId, ...first.jobIds, ...second.jobIds, videoId] })

  assert.deepEqual(errors, [])
  await page.evaluate(() => window.api.configureAutomation({ enabled: false }))
  console.log(`Electron/MCP smoke passed: ${tools.length} tools, SDK, URL import, collections, live UI, and image → image → video workflow with mocked provider responses. No paid calls.`)
} finally {
  await client?.close().catch(() => {})
  await app?.close().catch(() => {})
  await new Promise(resolve => mediaServer.close(resolve))
  await rm(bootstrap, { force: true })
  await rm(temp, { recursive: true, force: true })
}
