import assert from 'node:assert/strict'

/** Runs inside the disposable Electron smoke, never clicks a generation/export button. */
export async function runCreationUiChecks(page, { call, imageId }) {
  for (const mode of ['image', 'thumbnail', 'logo', 'video']) {
    await call('navigate', { target: mode })
    const model = page.getByRole('button', { name: mode === 'video' ? 'Videomodell auswählen' : 'Bildmodell auswählen', exact: true })
    await model.click()
    assert.equal(await model.getAttribute('aria-expanded'), 'true', `${mode}: model opens`)
    await page.keyboard.press('Escape')
    assert.equal(await model.getAttribute('aria-expanded'), 'false', `${mode}: Escape closes model`)
    const options = page.getByTitle('Alle weiteren Einstellungen', { exact: true })
    await options.click()
    assert.equal(await options.getAttribute('aria-expanded'), 'true', `${mode}: options open`)
    await page.keyboard.press('Escape')
    assert.equal(await options.getAttribute('aria-expanded'), 'false', `${mode}: Escape closes options`)
  }
  await call('navigate', { target: 'image' })
  await call('navigate', { target: 'viewer', id: imageId })
  let viewer = page.getByRole('dialog', { name: 'Mediendetails', exact: true })
  await viewer.waitFor()
  await viewer.getByRole('button', { name: 'Exportoptionen', exact: true }).click()
  await viewer.getByRole('button', { name: 'JPEG', exact: true }).click()
  await viewer.getByRole('slider', { name: 'Exportqualität' }).fill('80')
  assert.equal(await viewer.getByRole('slider', { name: 'Exportqualität' }).inputValue(), '80')
  assert.equal(await viewer.getByLabel('Metadaten einbetten (Prompt, Modell …)').count(), 0, 'JPEG does not promise unsupported PNG metadata')
  await viewer.getByRole('button', { name: 'PNG', exact: true }).click()
  await viewer.locator('summary').filter({ hasText: 'Bild bearbeiten' }).click()
  await viewer.getByRole('button', { name: 'Ausschnitt als Referenz', exact: true }).click()
  const crop = page.getByRole('dialog', { name: 'Ausschnitt als Referenz', exact: true })
  await crop.waitFor()
  assert.equal(await crop.getByRole('button', { name: 'Als Referenz verwenden', exact: true }).isDisabled(), true, 'Crop needs a selection')
  await crop.getByRole('button', { name: 'Abbrechen', exact: true }).click()
  await crop.waitFor({ state: 'hidden' })
  // Preview controls are local inspection only, with no render/provider request.
  await call('navigate', { target: 'thumbnail_preview', id: imageId })
  await page.getByRole('button', { name: 'Hell', exact: true }).click()
  await page.getByRole('button', { name: 'Dunkel', exact: true }).click()
  for (const name of ['Safe Zones', 'Drittel', 'Graustufen', 'Schneller Blick']) {
    await page.getByRole('button', { name, exact: true }).click()
  }
  await page.getByRole('button', { name: 'Vorschau schließen', exact: true }).click()
  await call('navigate', { target: 'image' })
  const source = (await call('list_images', { limit: 100 })).images.find(item => item.id === imageId)
  assert.ok(source?.filePath, 'Disposable source exists')
  const disposable = await call('import_media', { source: source.filePath, name: 'UI deletion regression' })
  const disposableId = disposable.id ?? disposable.image?.id
  await call('navigate', { target: 'viewer', id: disposableId })
  viewer = page.getByRole('dialog', { name: 'Mediendetails', exact: true })
  assert.equal(await viewer.getAttribute('data-media-id'), disposableId)
  page.once('dialog', dialog => dialog.accept())
  await viewer.getByRole('button', { name: 'Löschen', exact: true }).click()
  await page.waitForFunction(id => document.querySelector('[aria-label="Mediendetails"]')?.getAttribute('data-media-id') !== id, disposableId)
  assert.ok(!(await call('list_images', { limit: 100 })).images.some(item => item.id === disposableId), 'UI deletion removes live MCP media')
  if (await viewer.isVisible()) await viewer.getByRole('button', { name: 'Schließen', exact: true }).click()
  await call('navigate', { target: 'image' })
  console.log('Creation UI: four model/options menus, Escape, viewer export options, crop cancellation, thumbnail preview controls passed')
}
