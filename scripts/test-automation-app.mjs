// Real Electron + MCP smoke test. Uses a disposable profile; never calls fal.ai.
import assert from 'node:assert/strict'
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
await writeFile(join(temp, 'imagestudio-settings.json'), JSON.stringify({ autoCheckUpdates: false, antiDetection: false }))
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
  async function call(name, args = {}) {
    const result = await client.callTool({ name, arguments: args })
    assert.ok(!result.isError, `${name}: ${JSON.stringify(result.content)}`)
    const text = result.content.find(item => item.type === 'text')?.text
    return text ? JSON.parse(text) : result
  }
  const settings = await call('get_settings')
  assert.equal(settings.apiKeyConfigured, false)
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
  const meta = await call('meta_prompts', { action: 'create', name: 'Smoke rules', text: 'Keep the headline readable.' })
  const preview = await call('preview_generation', { prompt: 'A studio portrait', mode: 'thumbnail', projectId: project.id, metaPromptId: meta.id, collectionIds: [collection.id] })
  assert.ok(JSON.stringify(preview).includes('Keep the headline readable.'))
  await call('navigate', { target: 'image' })
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await call('update_draft', { mode: 'image', patch: { prompt: 'Edited through MCP', collectionIds: [collection.id] } })
  const draft = await call('get_draft', { mode: 'image' })
  assert.ok(JSON.stringify(draft).includes('Edited through MCP'))
  assert.ok(await page.getByText('Edited through MCP', { exact: false }).count())
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
    ipcMain.removeHandler('image:upload-urls')
    ipcMain.handle('image:upload-urls', (_event, { images }) => ({ success: true, urls: images.map((_, index) => `https://test.invalid/reference-${index}.png`) }))
    ipcMain.removeHandler('image:generate')
    ipcMain.handle('image:generate', (_event, request) => {
      globalThis.__automationTestCalls.push({ kind: 'image', hasReferences: !!request.attachments?.length, prompt: request.prompt })
      return { success: true, results: Array.from({ length: request.count }, (_, index) => ({ status: 'complete', result: { id: `mock-${index}`, imageBase64: `data:image/png;base64,${png}`, cost: 0.1 } })) }
    })
    ipcMain.removeHandler('video:generate')
    ipcMain.handle('video:generate', (_event, request) => {
      globalThis.__automationTestCalls.push({ kind: 'video', hasStartFrame: request.imageUrl.startsWith('data:image/') })
      return { success: true, filePath: videoPath, duration: request.duration }
    })
  }, { png: fixture.toString('base64'), videoPath: mockVideoPath })
  await call('update_settings', { falApiKey: 'test-key-never-sent-to-provider' })
  const first = await call('generate', { prompt: 'First workflow step', collectionIds: [collection.id] })
  await call('wait_for_jobs', { ids: first.jobIds, timeoutMs: 20000 })
  assert.equal((await call('get_status', { ids: first.jobIds })).jobs[0].status, 'completed')
  const second = await call('generate', { prompt: 'Use the first result', references: [first.jobIds[0]] })
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
  const chat = await call('chats', { action: 'create', imageId })
  const chatId = chat.chatId ?? chat.id
  await call('chats', { action: 'open', id: chatId })
  await page.locator('[contenteditable="true"]').last().waitFor()
  await call('update_draft', { mode: 'chat', patch: { prompt: 'Edit with collection references', collectionIds: [collection.id] } })
  assert.equal((await call('get_draft', { mode: 'chat' })).chatId, chatId)
  const automaticReference = await client.callTool({ name: 'read_draft_reference', arguments: { mode: 'chat', referenceId: 'automaticReference' } })
  assert.ok(automaticReference.content.some(item => item.type === 'image'))
  const chatJob = await call('generate_draft', { mode: 'chat' })
  assert.ok(chatJob.messageId)
  let completedChat
  for (let attempt = 0; attempt < 50; attempt++) {
    completedChat = await call('chats', { action: 'read', id: chatId })
    if (!completedChat.messages.some(message => message.isLoading)) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.ok(completedChat.messages.find(message => message.id === chatJob.messageId)?.imageFilePath)
  await call('navigate', { target: 'close_panels' })
  await call('update_settings', { falApiKey: '' })
  // UI sees the same imported media and project/collection changes.
  await call('navigate', { target: 'settings' })
  await page.getByRole('heading', { name: 'AI connection' }).scrollIntoViewIfNeeded()
  await page.getByRole('button', { name: 'Copy setup prompt' }).waitFor({ state: 'visible' })
  await page.screenshot({ path: join(temp, 'settings.png') })
  if (process.env.IMAGESTUDIO_TEST_SCREENSHOT) await writeFile(process.env.IMAGESTUDIO_TEST_SCREENSHOT, await readFile(join(temp, 'settings.png')))
  await call('collections', { action: 'delete', id: collection.id })
  await call('projects', { action: 'delete', id: project.id })
  await call('meta_prompts', { action: 'delete', id: meta.id })
  await call('chats', { action: 'delete', id: chatId })
  await call('delete_images', { ids: [imageId, ...first.jobIds, ...second.jobIds, videoId] })
  await call('workspaces', { action: 'delete', id: folder.id })
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
