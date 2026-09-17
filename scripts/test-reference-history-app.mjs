// Regression for startup OOM with a 253+ MiB gallery; synthetic data only.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, open, rm, stat, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'

const temp = await mkdtemp(join(tmpdir(), 'imagestudio-reference-history-'))
const bootstrap = resolve('scripts/.reference-history-test-launch.cjs')
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
  const snapshot = 'data:image/png;base64,' + Buffer.concat([await readFile(png), Buffer.alloc(768 * 1024)]).toString('base64')
  for (let i = 0; i < 130; i++) {
    await file.write((i ? ',' : '') + JSON.stringify({ id: `large-${i}`, filePath: png, prompt: `History fixture ${i}`, model: 'fal-ai/nano-banana-2', aspectRatio: '1:1', resolution: '1K', width: 1, height: 1, timestamp: 1, generationOptions: { attachments: [snapshot], labeledAttachments: [{label: 'Image 1', images: [snapshot]}] } }))
  }
  await file.write(']')
  await file.close()
  await writeFile(join(history, 'workspaces.json'), '[]')
  await writeFile(bootstrap, "const {app}=require('electron'); app.setPath('userData',process.env.IMAGESTUDIO_TEST_PROFILE); require('../out/main/index.js');\n")
  app = await electron.launch({ args: [bootstrap], env: { ...process.env, IMAGESTUDIO_TEST_PROFILE: temp }, timeout: 60000 })
  const page = await app.firstWindow()
  await page.waitForFunction(async () => (await window.api.getAutomationStatus()).rendererReady, { timeout: 60000 })
  await page.locator('[data-studio-section="library"]').waitFor({timeout:60000})
  const result = await page.evaluate(async () => {
    const loaded = await window.api.listHistory('gallery')
    if (!loaded.success) throw new Error(loaded.error)
    const images = JSON.parse(loaded.sessions[0].data)
    const saved = await window.api.saveHistory('large-roundtrip', loaded.sessions[0].data)
    if (!saved.success) throw new Error(saved.error)
    const roundtrip = await window.api.listHistory('large-roundtrip')
    return { count: images.length, size: loaded.sessions[0].data.length, equal: roundtrip.sessions[0].data === loaded.sessions[0].data }
  })
  assert.equal(result.count, 130)
  assert.ok(result.size < 1024 * 1024, 'Migration removes inline snapshots from renderer state')
  const migrated = JSON.parse(await readFile(join(history, 'gallery.json'), 'utf8'))
  const storedReference = migrated[0].generationOptions.attachments[0]
  assert.deepEqual(await readFile(storedReference), Buffer.from(snapshot.split(',')[1], 'base64'))
  assert.ok(migrated.every(image => image.generationOptions.labeledAttachments[0].images[0] === storedReference))
  assert.equal(result.equal, true)
  // Enable the real local interface on a disposable available port.
  const { createServer } = await import('node:net')
  const reservation = createServer()
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve))
  const port = reservation.address().port
  await new Promise(resolve => reservation.close(resolve))
  const connection = await page.evaluate(port => window.api.configureAutomation({ enabled: true, port }), port)
  async function call(name, args = {}) {
    const response = await fetch(`http://127.0.0.1:${port}/api/call`, { method: 'POST', headers: { Authorization: `Bearer ${connection.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name, arguments: args }) })
    const reply = await response.json()
    assert.ok(!reply.isError, JSON.stringify(reply))
    return JSON.parse(reply.content.find(item => item.type === 'text').text)
  }
  assert.equal((await call('list_images', { limit: 1 })).total, 130)
  await app.evaluate(({ ipcMain }, png) => {
    globalThis.__paidCalls = 0
    ipcMain.removeHandler('image:upload-urls')
    ipcMain.handle('image:upload-urls', (_event, {images}) => ({success: true, urls: images.map(() => 'https://test.invalid/ref.png')}))
    ipcMain.removeHandler('image:generate')
    ipcMain.handle('image:generate', (_event, request) => {
      globalThis.__paidCalls++
      return {success:true, results: Array.from({length: request.count}, () => ({status:'complete',result:{imageBase64: png, cost:0}}))}
    })
  }, 'data:image/png;base64,' + (await readFile(png)).toString('base64'))
  await call('update_settings', { falApiKey: 'mock-only', antiDetection: false })
  for (let batch = 0; batch < 3; batch++) {
    const generated = await call('generate', {prompt: 'Preserve [Image 1]', references: ['large-0'], imageCount: 4})
    assert.equal(generated.jobIds.length, 4)
    await call('wait_for_jobs', {ids: generated.jobIds, timeoutMs: 20000})
    const status = await call('get_status', {ids: generated.jobIds})
    assert.ok(status.jobs.every(job => job.status === 'completed'), JSON.stringify(status.jobs))
    await call('update_image', {id:generated.jobIds[0], tags: ['persist-check']})
    const saved = JSON.parse(await readFile(join(history, 'gallery.json'), 'utf8'))
    assert.ok(saved.every(image => !JSON.stringify(image).includes('data:image/')), 'Completed jobs retain paths, never base64 snapshots')
    assert.ok((await stat(join(history, 'gallery.json'))).size < 1024 * 1024)
    await call('navigate', {target:'reuse_prompt',id:generated.jobIds[0]})
  }
  assert.equal((await call('list_images', {limit:1})).total, 142)
  assert.equal(await app.evaluate(() => globalThis.__paidCalls), 3)
  // Recovery notice comes from main even when React cannot render anything.
  await app.evaluate(({ dialog, BrowserWindow }) => {
    dialog.showMessageBox = async (_window, options) => {globalThis.__recoveryNotice = options; return {response:1,checkboxChecked:false}}
    BrowserWindow.getAllWindows()[0].webContents.emit('render-process-gone', {}, {reason:'oom',exitCode:5})
  })
  assert.equal(await app.evaluate(() => globalThis.__recoveryNotice.buttons[0]), 'Oberfläche neu laden')
  assert.equal(await app.evaluate(() => globalThis.__paidCalls), 3, 'Crash handler never resubmits paid requests')
  await page.locator('[data-studio-section="library"]').click()
  await page.screenshot({ path: join(temp, 'large-history.png') })
  console.log('260 MiB snapshot migration + exact reference bytes + 12 mocked outputs + persistence/reuse + recovery notice: passed')
} finally {
  await app?.close()
  await rm(bootstrap, { force: true })
  await rm(temp, { recursive: true, force: true })
}
