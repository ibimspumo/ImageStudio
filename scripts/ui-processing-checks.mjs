import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Real renderer/storage/MCP parity; only the paid IPC provider boundary is mocked. */
export async function runProcessingUiChecks(page, { app, call, client, temp, projectId, workspaceId }) {
  const rgba = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 24
    const context = canvas.getContext('2d'); context.fillStyle = '#e93278'; context.fillRect(8, 6, 16, 12)
    return canvas.toDataURL('image/png')
  })
  const saved = await page.evaluate(data => window.api.saveImage(data, 'transparent-processing-source.png'), rgba)
  assert.ok(saved.success && saved.filePath)
  const imported = await call('import_media', { source: saved.filePath, name: 'Transparent processing source' })
  const imageId = imported.id ?? imported.image?.id
  await call('update_image', { id: imageId, projectId, workspaceId })
  await call('update_settings', { antiDetection: true })
  await app.evaluate(async ({ ipcMain, nativeImage }, directory) => {
    const { writeFile } = process.getBuiltinModule('fs/promises')
    const { join } = process.getBuiltinModule('path')
    globalThis.__processingCalls = []
    ipcMain.removeHandler('image:generate')
    ipcMain.handle('image:generate', async (_event, request) => {
      globalThis.__processingCalls.push(request)
      const index = globalThis.__processingCalls.length
      const processing = request.imageProcessing
      const source = nativeImage.createFromPath(processing.sourceFilePath)
      const resultImage = processing.operation === 'upscale' ? source.resize({ width: processing.sourceWidth * 4, height: processing.sourceHeight * 4 }) : source
      const filePath = join(directory, 'ImageStudio', 'images', `processing-native-${index}.png`)
      await writeFile(filePath, resultImage.toPNG())
      const size = resultImage.getSize()
      let previewPath
      if (size.width > 512) {
        previewPath = join(directory, 'ImageStudio', 'images', `processing-preview-${index}.png`)
        await writeFile(previewPath, resultImage.resize({ width: 128 }).toPNG())
      }
      return { success: true, results: [{ status: 'complete', result: { id: `processing-fal-${index}`, filePath, previewPath, ...size, hasAlpha: true, mimeType: 'image/png', cost: processing.operation === 'upscale' ? 0.08 : 0.018 } }] }
    })
  }, temp)
  const before = (await call('list_images')).images
  await call('image_edit_options', { imageId })
  const preview = await call('preview_image_processing', { imageId, operation: 'upscale' })
  assert.equal(preview.estimatedCost, 0.08)
  assert.equal(preview.modelId, 'topaz/upscale/image/transparent')
  await call('navigate', { target: 'viewer', id: imageId })
  const panel = page.getByRole('region', { name: 'Bild optimieren' })
  await panel.getByText('Topaz Transparent vergrößert auf 4×', { exact: false }).waitFor()
  assert.equal(await panel.getByLabel('Upscale-Modell', { exact: true }).inputValue(), 'transparent')
  assert.equal((await app.evaluate(() => globalThis.__processingCalls)).length, 0, 'Discovery and UI cost previews never submit')
  const legacy = await client.callTool({ name: 'image_upscale', arguments: { imageId, resolution: '4K' } })
  assert.equal(legacy.isError, true, 'Old prompt-upscale resolution cannot silently select a new operation')
  await panel.getByRole('button', { name: 'Kostenpflichtig hochskalieren', exact: true }).click()
  await panel.waitFor({ state: 'hidden' })
  const afterUi = (await call('list_images')).images
  const uiResult = afterUi.find(image => !before.some(old => old.id === image.id))
  assert.ok(uiResult, 'UI starts a new gallery job')
  await call('wait_for_jobs', { ids: [uiResult.id], timeoutMs: 20000 })
  const agent = await call('image_upscale', { imageId })
  await call('wait_for_jobs', { ids: agent.jobIds, timeoutMs: 20000 })
  const removed = await call('image_remove_background', { imageId })
  await call('wait_for_jobs', { ids: removed.jobIds, timeoutMs: 20000 })
  const beforeRemovalUi = (await call('list_images')).images
  await call('navigate', { target: 'viewer', id: imageId })
  await panel.getByRole('button', { name: 'Kostenpflichtig freistellen', exact: true }).click()
  await panel.waitFor({ state: 'hidden' })
  const removalUi = (await call('list_images')).images.find(image => !beforeRemovalUi.some(old => old.id === image.id))
  assert.ok(removalUi, 'UI removal starts a gallery job')
  await call('wait_for_jobs', { ids: [removalUi.id], timeoutMs: 20000 })
  // Repeated operations use the completed output's actual pixel dimensions.
  const secondPass = await call('image_upscale', { imageId: uiResult.id })
  await call('wait_for_jobs', { ids: secondPass.jobIds, timeoutMs: 20000 })
  const thirdPreview = await call('preview_image_processing', { imageId: secondPass.jobIds[0], operation: 'upscale' })
  assert.deepEqual([thirdPreview.width, thirdPreview.height], [2048, 1536])
  const thirdPass = await call('image_upscale', { imageId: secondPass.jobIds[0] })
  await call('wait_for_jobs', { ids: thirdPass.jobIds, timeoutMs: 20000 })
  const requests = await app.evaluate(() => globalThis.__processingCalls)
  assert.equal(requests.length, 6)
  assert.deepEqual(requests[0].imageProcessing, requests[1].imageProcessing, 'Human and MCP submit identical normalized processing requests')
  const originalImage = before.find(image => image.id === imageId)
  assert.equal(requests[0].imageProcessing.sourceFilePath, originalImage.filePath, 'Provider reads original source file, never display preview')
  assert.equal(requests[0].imageProcessing.sourceImage, undefined, 'Full source pixels do not cross renderer IPC as base64')
  assert.deepEqual(await readFile(originalImage.filePath), Buffer.from(rgba.split(',')[1], 'base64'), 'Original RGBA bytes survive import')
  assert.equal(requests[2].imageProcessing.operation, 'remove_background')
  assert.deepEqual(requests[2].imageProcessing, requests[3].imageProcessing, 'Human and MCP background removal match')
  assert.deepEqual(requests.slice(4).map(request => [request.imageProcessing.sourceWidth, request.imageProcessing.sourceHeight]), [[128, 96], [512, 384]])
  const ids = [uiResult.id, ...agent.jobIds, ...removed.jobIds, removalUi.id, ...secondPass.jobIds, ...thirdPass.jobIds]
  const expectedParents = [imageId, imageId, imageId, imageId, uiResult.id, secondPass.jobIds[0]]
  const expectedSizes = [[128, 96], [128, 96], [32, 24], [32, 24], [512, 384], [2048, 1536]]
  const results = (await call('list_images')).images
  assert.ok(results.some(image => image.id === imageId), 'Original retained')
  for (const id of ids) {
    const result = results.find(image => image.id === id)
    assert.equal(result.parentImageId, expectedParents[ids.indexOf(id)])
    assert.equal(result.projectId, projectId)
    assert.equal(result.workspaceId, workspaceId)
    assert.equal(result.hasAlpha, true)
    assert.ok(result.falRequestId.startsWith('processing-fal-'))
    assert.equal(result.costSource, 'list-price-estimate')
    const media = await client.callTool({ name: 'read_image', arguments: { id } })
    assert.ok(media.content.some(item => item.type === 'image' && item.mimeType === 'image/png'))
    const destination = join(temp, `${id}.png`)
    await call('export_media', { id, destination })
    const exportedBytes = await readFile(destination)
    assert.deepEqual(exportedBytes, await readFile(result.filePath), 'Export preserves stored original bytes')
    const pixels = await page.evaluate(async dataUrl => {
      const image = new Image(); image.src = dataUrl; await image.decode()
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0)
      return { width: image.width, height: image.height, corner: [...context.getImageData(0, 0, 1, 1).data], subject: [...context.getImageData(Math.floor(image.width / 2), Math.floor(image.height / 2), 1, 1).data] }
    }, `data:image/png;base64,${exportedBytes.toString('base64')}`)
    const [width, height] = expectedSizes[ids.indexOf(id)]
    assert.deepEqual(pixels, { width, height, corner: [0, 0, 0, 0], subject: [233, 50, 120, 255] }, 'Anti-detection keeps actual PNG pixels and alpha')
  }
  await call('navigate', { target: 'viewer', id: imageId })
  if (process.env.IMAGESTUDIO_PROCESSING_SCREENSHOT) {
    await page.getByRole('dialog', { name: 'Mediendetails' }).evaluate(async node => { await Promise.all(node.getAnimations({ subtree: true }).filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))) })
    await panel.getByRole('heading', { name: 'Auflösung erhöhen', exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: process.env.IMAGESTUDIO_PROCESSING_SCREENSHOT })
  }
  await call('navigate', { target: 'close_panels' })
  await call('delete_images', { ids: [imageId, ...ids] })
  await call('update_settings', { antiDetection: false })
}
