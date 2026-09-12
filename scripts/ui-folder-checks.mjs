import assert from 'node:assert/strict'

// Run only with the disposable profile and mocked providers from the app suite.
export async function runFolderUiChecks(page, { call }) {
  await call('update_settings', { falApiKey: 'test-key-never-sent-to-provider' })
  const folder = await call('workspaces', { action: 'create', name: 'Mixed media folder' })
  const ids = []
  for (const mode of ['image', 'thumbnail', 'logo', 'print']) {
    const result = await call('generate', { mode, prompt: `Folder regression ${mode}`, workspaceId: folder.id, projectId: '', metaPromptId: '', presetId: '', imageCount: 1 })
    await call('wait_for_jobs', { ids: result.jobIds, timeoutMs: 20000 })
    assert.ok((await call('get_status', { ids: result.jobIds })).jobs.every(j => j.status === 'completed'), `${mode} fixture completes`)
    ids.push(...result.jobIds)
  }
  const video = await call('generate_video', { prompt: 'Folder regression video', startImageId: ids[0], model: 'fal-ai/kling-video/v3/standard/image-to-video', duration: 5 })
  const videoId = video.jobIds?.[0] ?? video.id ?? video.jobId
  assert.ok(videoId)
  await call('wait_for_jobs', { ids: [videoId], timeoutMs: 20000 })
  await call('update_image', { id: videoId, workspaceId: folder.id })
  ids.push(videoId)
  const listed = await call('list_images', { workspaceId: folder.id })
  assert.deepEqual(new Set(listed.images.map(i => i.id)), new Set(ids))
  assert.equal(listed.images.find(i => i.id === ids[1]).projectId, undefined, 'Standalone thumbnails belong in folders too')
  const visible = page.getByRole('button', { name: 'Öffnen', exact: true })
  const waitForCount = count => page.waitForFunction(expected => document.querySelectorAll('button[title="Öffnen"]').length === expected, count)
  // Selecting from a different mode must open and reset the same folder UI.
  await call('navigate', { target: 'thumbnail' })
  await page.getByRole('textbox', { name: 'Mediathek durchsuchen', exact: true }).fill('no matches')
  await call('workspaces', { action: 'select', id: folder.id })
  await page.getByRole('heading', { name: 'Mixed media folder', exact: true }).waitFor()
  await waitForCount(5)
  assert.equal(await visible.count(), 5)
  assert.equal((await call('get_status')).activeWorkspaceId, folder.id)
  await call('navigate', { target: 'library' })
  await page.getByRole('button', { name: 'Mixed media folder', exact: true }).click()
  await page.getByRole('heading', { name: 'Mixed media folder', exact: true }).waitFor()
  await waitForCount(5)
  assert.equal(await visible.count(), 5, 'Sidebar shows all five media modes')
  for (const mode of ['image', 'thumbnail', 'logo', 'print', 'video']) {
    await page.locator(`[data-studio-section="${mode}"]`).click()
    const overview = await call('list_images', { mode, status: 'completed', limit: 200 })
    await waitForCount(overview.images.length)
    assert.equal(await visible.count(), overview.images.length, `${mode} overview remains scoped to its mode`)
  }
  await call('workspaces', { action: 'select', id: folder.id })
  await page.getByRole('button', { name: 'Alle Bilder anzeigen', exact: true }).click()
  assert.equal((await call('get_status')).activeWorkspaceId, null)
  await call('delete_images', { ids })
  await call('workspaces', { action: 'delete', id: folder.id })
  console.log('PASS mixed folder UI/MCP: image, standalone thumbnail, logo, print, video, filter reset and mode overviews')
}
