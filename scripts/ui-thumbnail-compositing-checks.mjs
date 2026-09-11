import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Real shared state and UI/MCP submissions; provider IPC remains mocked. */
export async function runThumbnailCompositingUiChecks(page, { app, call, client, temp, imageId }) {
  const marker = 'PHOTOSHOP COMPOSITING — DISTINCT VISUAL LAYERS'
  await call('navigate', { target: 'thumbnail' })
  const toggle = page.getByRole('switch', { name: 'Photoshop-Look', exact: true })
  assert.equal((await call('get_settings')).thumbnailCompositing, true, 'Existing profile with no option defaults on')
  assert.equal((await call('get_draft', { mode: 'thumbnail' })).thumbnailCompositing, true)
  assert.equal(await toggle.getAttribute('aria-checked'), 'true')
  await call('update_draft', { mode: 'thumbnail', patch: { prompt: 'Two coworkers. Exact text: FEIERABEND', models: ['openai/gpt-image-2.5/sunburst/text-to-image'], thumbnailStyle: 'balanced', references: [imageId], collectionIds: [], imageCount: 1 } })
  await toggle.click()
  const off = await call('get_draft', { mode: 'thumbnail' })
  assert.equal(off.thumbnailCompositing, false)
  assert.ok(!off.systemPrompt.includes(marker))
  assert.equal((await call('get_settings')).thumbnailCompositing, false)
  const preview = await call('preview_generation', { mode: 'thumbnail', prompt: off.prompt, references: [imageId], presetId: '' })
  assert.equal(preview.request.thumbnailCompositing, false)
  assert.ok(!preview.request.systemPrompt.includes(marker))
  const explicitOn = await call('preview_generation', { mode: 'thumbnail', prompt: off.prompt, thumbnailCompositing: true })
  assert.ok(explicitOn.request.systemPrompt.includes(marker))
  assert.equal((await call('get_settings')).thumbnailCompositing, false, 'Direct override does not change saved default')
  await call('navigate', { target: 'image' })
  await call('navigate', { target: 'thumbnail' })
  assert.equal(await toggle.getAttribute('aria-checked'), 'false')
  await page.waitForFunction(async () => (await window.api.getSettings()).thumbnailCompositing === false)
  assert.equal(JSON.parse(await readFile(join(temp, 'imagestudio-settings.json'), 'utf8')).thumbnailCompositing, false)

  const submitted = await call('generate', { mode: 'thumbnail', prompt: off.prompt, thumbnailCompositing: false, references: [imageId], models: ['openai/gpt-image-2.5/sunburst/text-to-image'], imageCount: 1 })
  await call('wait_for_jobs', { ids: submitted.jobIds, timeoutMs: 20000 })
  const offDetails = await call('generation_details', { id: submitted.jobIds[0] })
  assert.equal(offDetails.generationOptions.thumbnailCompositing, false)
  assert.ok(!offDetails.generationOptions.systemPrompt.includes(marker))

  await call('update_settings', { thumbnailCompositing: true })
  assert.equal(await toggle.getAttribute('aria-checked'), 'true')
  assert.ok((await call('get_draft', { mode: 'thumbnail' })).systemPrompt.includes(marker))
  await call('update_draft', { mode: 'thumbnail', patch: { prompt: off.prompt, references: [imageId], imageCount: 1 } })
  assert.equal((await call('get_draft', { mode: 'thumbnail' })).ready, true)
  const before = new Set((await call('list_images', { limit: 100 })).images.map(image => image.id))
  await page.getByRole('button', { name: 'Generieren', exact: true }).click()
  let humanJob
  for (let attempt = 0; attempt < 50; attempt++) {
    humanJob = (await call('list_images', { limit: 100 })).images.find(image => !before.has(image.id))
    if (humanJob) break
    await page.waitForTimeout(50)
  }
  assert.ok(humanJob, 'Human submission produces a shared gallery job')
  await call('wait_for_jobs', { ids: [humanJob.id], timeoutMs: 20000 })
  const onDetails = await call('generation_details', { id: humanJob.id })
  assert.equal(onDetails.generationOptions.thumbnailCompositing, true)
  assert.ok(onDetails.generationOptions.systemPrompt.includes(marker))
  const sent = await app.evaluate(() => globalThis.__automationTestCalls.at(-1))
  assert.ok(sent.prompt.includes(marker), 'Actual provider prompt receives compositing direction')
  for (const mode of ['image', 'logo', 'print']) {
    assert.equal((await client.callTool({ name: 'preview_generation', arguments: { mode, prompt: 'Invalid scope', thumbnailCompositing: true } })).isError, true)
    assert.equal((await client.callTool({ name: 'update_draft', arguments: { mode, patch: { thumbnailCompositing: false } } })).isError, true)
  }
  assert.equal((await client.callTool({ name: 'update_settings', arguments: { thumbnailCompositing: 'false' } })).isError, true)
  await page.screenshot({ path: 'screenshots/thumbnail-compositing-parity.png', animations: 'disabled' })
  console.log('PASS thumbnail compositing defaults, UI/MCP toggle, persistence, direct overrides, mocked submissions and scope validation')
}
