// Regression for startup OOM with a 253+ MiB gallery; synthetic data only.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, open, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'

const temp = await mkdtemp(join(tmpdir(), 'imagestudio-large-history-'))
const bootstrap = resolve('scripts/.large-history-test-launch.cjs')
let app
try {
  const history = join(temp, 'ImageStudio', 'history')
  await mkdir(history, { recursive: true })
  await writeFile(join(temp, 'imagestudio-settings.json'), JSON.stringify({ autoCheckUpdates: false }))
  const png = join(temp, 'fixture.png')
  await writeFile(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5l8AAAAASUVORK5CYII=', 'base64'))
  const file = await open(join(history, 'gallery.json'), 'w')
  await file.write('[')
  // Many saved snapshots reproduce real history growth without giant test-runner IPC.
  const snapshot = 'A'.repeat(1024 * 1024)
  for (let i = 0; i < 260; i++) {
    await file.write((i ? ',' : '') + JSON.stringify({ id: `large-${i}`, filePath: png, prompt: `History fixture ${i}`, model: 'fal-ai/nano-banana-2', aspectRatio: '1:1', resolution: '1K', width: 1, height: 1, timestamp: 1, generationOptions: { attachments: [snapshot] } }))
  }
  await file.write(']')
  await file.close()
  await writeFile(join(history, 'workspaces.json'), '[]')
  await writeFile(bootstrap, "const {app}=require('electron'); app.setPath('userData',process.env.IMAGESTUDIO_TEST_PROFILE); require('../out/main/index.js');\n")
  app = await electron.launch({ args: [bootstrap], env: { ...process.env, IMAGESTUDIO_TEST_PROFILE: temp }, timeout: 60000 })
  const page = await app.firstWindow()
  await page.waitForFunction(async () => (await window.api.getAutomationStatus()).rendererReady, { timeout: 60000 })
  const result = await page.evaluate(async () => {
    const loaded = await window.api.listHistory('gallery')
    if (!loaded.success) throw new Error(loaded.error)
    const images = JSON.parse(loaded.sessions[0].data)
    const saved = await window.api.saveHistory('large-roundtrip', loaded.sessions[0].data)
    if (!saved.success) throw new Error(saved.error)
    const roundtrip = await window.api.listHistory('large-roundtrip')
    return { count: images.length, size: loaded.sessions[0].data.length, equal: roundtrip.sessions[0].data === loaded.sessions[0].data }
  })
  assert.equal(result.count, 260)
  assert.ok(result.size > 253 * 1024 * 1024)
  assert.equal(result.equal, true)
  // Enable the real local interface on a disposable available port.
  const { createServer } = await import('node:net')
  const reservation = createServer()
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve))
  const port = reservation.address().port
  await new Promise(resolve => reservation.close(resolve))
  const connection = await page.evaluate(port => window.api.configureAutomation({ enabled: true, port }), port)
  const response = await fetch(`http://127.0.0.1:${port}/api/call`, { method: 'POST', headers: { Authorization: `Bearer ${connection.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'list_images', arguments: { limit: 1 } }) })
  const reply = await response.json()
  assert.ok(!reply.isError, JSON.stringify(reply))
  const listed = JSON.parse(reply.content.find(item => item.type === 'text').text)
  assert.equal(listed.total, 260)
  await page.locator('[data-studio-section="library"]').click()
  await page.screenshot({ path: join(temp, 'large-history.png') })
  console.log('Large-history startup + 260 MiB exact save/read + live UI/MCP gallery: passed')
} finally {
  await app?.close()
  await rm(bootstrap, { force: true })
  await rm(temp, { recursive: true, force: true })
}
