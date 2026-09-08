import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, rm, readFile, writeFile, stat, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { request } from 'node:http'
import { build } from 'esbuild'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

// Compile just the backend seam; no Electron process or paid generation needed.
const temporary = await mkdtemp(join(process.cwd(), 'node_modules', '.automation-tests-'))
const fixture = join(temporary, 'fixture.cjs')
await build({
  stdin: { contents: "export * from './src/main/automation/server'; export * from './src/main/automation/bridge'; export * from './src/main/automation/setup'; export * from './src/main/automation/index'; export * from './src/main/automation/media'", resolveDir: process.cwd(), loader: 'ts' },
  outfile: fixture, bundle: true, packages: 'external', platform: 'node', format: 'cjs', logLevel: 'silent',
  plugins: [{ name: 'electron-test-seam', setup(builder) {
    builder.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'fake-electron' }))
    builder.onLoad({ filter: /.*/, namespace: 'fake-electron' }, () => ({ contents: 'export const app = {}; export const ipcMain = {}; export const nativeImage = { createFromBuffer: () => ({getSize: () => ({width:1,height:1})}) };', loader: 'js' }))
  } }]
})
const { createAutomationHttpServer, listenAutomationServer, closeAutomationServer, AutomationBridge, createSetupPrompt, AutomationService, createAutomationMedia } = createRequire(import.meta.url)(fixture)
after(() => rm(temporary, { recursive: true, force: true }))

const tools = [{ name: 'echo', description: 'Test renderer action', inputSchema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] } }]
const token = 'a'.repeat(64)
const auth = { Authorization: `Bearer ${token}` }
function rawStatus(url, headers) {
  return new Promise((resolve, reject) => {
    const req = request(url, { headers }, (response) => { response.resume(); resolve(response.statusCode) })
    req.on('error', reject)
    req.end()
  })
}

async function serverFixture(t, dispatch) {
  let activeToken = token
  const server = createAutomationHttpServer({ port: 0, version: 'test', token: () => activeToken, rendererReady: () => true, dispatch: dispatch || (async (method, params) => method === 'tools/list' ? { tools } : { content: [{ type: 'text', text: String(params.arguments.message) }] }) })
  await listenAutomationServer(server, 0)
  t.after(() => closeAutomationServer(server))
  return { server, url: `http://127.0.0.1:${server.address().port}`, rotate: () => { activeToken = 'b'.repeat(64) } }
}

test('official SDK initialize, discovery, parallel calls, and REST fallback share results', async (t) => {
  const { url } = await serverFixture(t)
  const client = new Client({ name: 'integration-test', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(`${url}/mcp`), { requestInit: { headers: auth } })
  t.after(() => client.close())
  await client.connect(transport)
  assert.equal(client.getServerVersion().name, 'imagestudio')
  assert.deepEqual(await client.listTools(), { tools })
  const results = await Promise.all(['one', 'two'].map((message) => client.callTool({ name: 'echo', arguments: { message } })))
  assert.deepEqual(results.map((result) => result.content[0].text), ['one', 'two'])
  const health = await fetch(`${url}/health`, { headers: auth }).then((response) => response.json())
  assert.equal(health.rendererReady, true)
  assert.equal(health.token, undefined)
  assert.equal(JSON.stringify(health).includes(token), false)
  assert.deepEqual(await fetch(`${url}/api/tools`, { headers: auth }).then((response) => response.json()), { tools })
  const result = await fetch(`${url}/api/call`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'echo', arguments: { message: 'one' } }) }).then((response) => response.json())
  assert.deepEqual(result, results[0])
})

test('all routes require bearer auth and exact host/origin; token rotation invalidates old clients', async (t) => {
  let calls = 0
  const { url, rotate } = await serverFixture(t, async () => { calls++; return { tools } })
  for (const path of ['/health', '/api/tools', '/api/call', '/mcp']) {
    assert.equal((await fetch(`${url}${path}`)).status, 401)
    assert.equal((await fetch(`${url}${path}`, { headers: { ...auth, Origin: 'https://untrusted.example' } })).status, 403)
    assert.equal(await rawStatus(`${url}${path}`, { ...auth, Host: 'untrusted.example' }), 403)
  }
  assert.equal(calls, 0)
  assert.equal((await fetch(`${url}/health`, { headers: { ...auth, Origin: 'null' } })).status, 403)
  assert.equal((await fetch(`${url}/health`, { headers: { ...auth, Origin: url } })).status, 200)
  rotate()
  assert.equal((await fetch(`${url}/health`, { headers: auth })).status, 401)
  assert.equal((await fetch(`${url}/health`, { headers: { Authorization: `Bearer ${'b'.repeat(64)}` } })).status, 200)
})

test('fallback validates request shape and reports renderer unavailability', async (t) => {
  const { url } = await serverFixture(t, async () => { throw new Error('ImageStudio is not ready.') })
  assert.equal((await fetch(`${url}/api/call`, { method: 'POST', headers: auth, body: '{}' })).status, 415)
  assert.equal((await fetch(`${url}/api/call`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: '{' })).status, 400)
  assert.equal((await fetch(`${url}/api/call`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: '{}' })).status, 400)
  const response = await fetch(`${url}/api/tools`, { headers: auth })
  assert.equal(response.status, 503)
  assert.match((await response.json()).error, /not ready/)
  assert.equal((await fetch(`${url}/automation/configure`, { method: 'POST', headers: auth })).status, 404)
  assert.equal((await fetch(`${url}/mcp`, { headers: auth })).status, 405)
})

test('port conflicts reject cleanly without terminating the app', async (t) => {
  const { server } = await serverFixture(t)
  const conflict = createAutomationHttpServer({ port: 0, version: 'test', token: () => token, rendererReady: () => false, dispatch: async () => ({ tools }) })
  await assert.rejects(listenAutomationServer(conflict, server.address().port), { code: 'EADDRINUSE' })
  await closeAutomationServer(conflict)
})

function bridgeFixture(timeout = 500) {
  const contents = new EventEmitter()
  contents.mainFrame = { url: 'file:///app/index.html' }
  contents.isDestroyed = () => false
  contents.sent = []
  contents.send = (channel, payload) => contents.sent.push({ channel, payload })
  const bridge = new AutomationBridge(timeout)
  bridge.attach(contents, 'file:///app/index.html')
  return { bridge, contents, event: { sender: contents, senderFrame: contents.mainFrame } }
}

test('bridge accepts only the registered main frame and correlates concurrent replies', async () => {
  const { bridge, contents, event } = bridgeFixture()
  await assert.rejects(bridge.dispatch('tools/list'), /not ready/)
  bridge.markReady({ ...event, senderFrame: { url: event.senderFrame.url } })
  assert.equal(bridge.rendererReady, false)
  bridge.markReady(event)
  const first = bridge.dispatch('tools/list')
  const second = bridge.dispatch('tools/call', { name: 'echo', arguments: { message: 'second' } })
  assert.equal(contents.sent[0].channel, 'automation:request')
  bridge.reply({ ...event, sender: {} }, { id: contents.sent[0].payload.id, result: 'spoofed' })
  bridge.reply(event, { id: contents.sent[1].payload.id, result: 'second' })
  bridge.reply(event, { id: contents.sent[0].payload.id, result: { tools } })
  assert.deepEqual(await first, { tools })
  assert.equal(await second, 'second')
  event.senderFrame.url = 'https://evil.example/'
  assert.equal(bridge.isTrusted(event), false)
})

test('bridge rejects pending requests on navigation, renderer crash, destruction, and timeout', async () => {
  for (const lifecycle of ['navigation', 'render-process-gone', 'destroyed']) {
    const { bridge, contents, event } = bridgeFixture()
    bridge.markReady(event)
    const result = bridge.dispatch('tools/list')
    if (lifecycle === 'navigation') contents.emit('did-start-navigation', {}, 'file:///app/index.html', false, true)
    else contents.emit(lifecycle)
    await assert.rejects(result)
    assert.equal(bridge.rendererReady, false)
  }
  const { bridge, event } = bridgeFixture(10)
  bridge.markReady(event)
  await assert.rejects(bridge.dispatch('tools/call', { name: 'echo' }), /timed out.*may still be running/)
})

test('setup prompt includes verified client configuration and immediate authenticated API discovery', () => {
  const prompt = createSetupPrompt(48765, token)
  assert.match(prompt, /\[mcp_servers\.imagestudio\]/)
  assert.match(prompt, /http_headers = \{ Authorization = "Bearer /)
  assert.match(prompt, /claude mcp add --transport http --scope user --header/)
  assert.match(prompt, /GET http:\/\/127\.0\.0\.1:48765\/api\/tools/)
  assert.match(prompt, /POST http:\/\/127\.0\.0\.1:48765\/api\/call/)
  assert.match(prompt, /Cloud-Runner/)
})

test('service defaults disabled, persists its secret privately, validates configuration and recovers from occupied port', async (t) => {
  const storage = await mkdtemp(join(temporary, 'service-'))
  const first = new AutomationService(storage, 'test')
  await first.initialize()
  t.after(() => first.stop())
  assert.equal(first.status.enabled, false)
  assert.equal(first.status.running, false)
  assert.match(first.status.token, /^[a-f0-9]{64}$/)
  if (process.platform !== 'win32') assert.equal((await stat(join(storage, 'automation.json'))).mode & 0o777, 0o600)
  const second = new AutomationService(storage, 'test')
  await second.initialize()
  t.after(() => second.stop())
  assert.equal(second.status.token, first.status.token)
  await assert.rejects(first.configure({ port: 80 }), /1024/)
  await assert.rejects(first.configure({ enabled: 'true' }), /boolean/)
  await assert.rejects(first.configure({ token: 'injected' }), /Unknown/)
  const { server } = await serverFixture(t)
  const status = await first.configure({ enabled: true, port: server.address().port })
  assert.equal(status.enabled, true)
  assert.equal(status.running, false)
  assert.match(status.error, /already in use/)
  await closeAutomationServer(server)
  const recovered = await first.configure({ enabled: true })
  assert.equal(recovered.running, true)
  const previousToken = recovered.token
  const rotated = await first.configure({}, true)
  assert.notEqual(rotated.token, previousToken)
  assert.equal(rotated.running, true)
  assert.equal((await fetch(rotated.url.replace('/mcp', '/health'), { headers: { Authorization: `Bearer ${previousToken}` } })).status, 401)
  const stopped = await first.configure({ enabled: false })
  assert.equal(stopped.running, false)
  assert.equal(JSON.parse(await readFile(join(storage, 'automation.json'), 'utf8')).enabled, false)
})

test('media import copies recognized files; export is noninteractive, exclusive, metadata-aware, and library bounded', async () => {
  const storage = await mkdtemp(join(temporary, 'media-'))
  const media = createAutomationMedia(storage)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX2kAAAAASUVORK5CYII=', 'base64')
  const source = join(storage, 'original.png')
  await writeFile(source, png)
  const imported = await media.importMedia({ source, name: 'Reference image' })
  assert.equal(imported.kind, 'image')
  assert.notEqual(imported.filePath, source)
  assert.deepEqual(await readFile(imported.filePath), png)
  const read = await media.readMedia({ filePath: imported.filePath })
  assert.equal(read.mimeType, 'image/png')
  assert.match(read.uri, /^file:\/\//)
  const destination = join(storage, 'output', 'export.png')
  await media.exportMedia({ filePath: imported.filePath, destination, metadata: { Prompt: 'Test prompt' } })
  assert.ok((await readFile(destination)).includes(Buffer.from('ImageStudio:Prompt\0Test prompt')))
  await assert.rejects(media.exportMedia({ filePath: imported.filePath, destination }), { code: 'EEXIST' })
  await media.exportMedia({ filePath: imported.filePath, destination, overwrite: true })
  assert.deepEqual(await readFile(destination), png)
  await assert.rejects(media.readMedia({ filePath: source }), /Only media in/)
  const disguised = join(storage, 'secret.png')
  await writeFile(disguised, 'not image data')
  await assert.rejects(media.importMedia({ source: disguised }), /Unsupported media/)
  const escape = join(imported.filePath, '..', 'escape.png')
  await symlink(source, escape)
  await assert.rejects(media.readMedia({ filePath: escape }), /Only media in/)
})
