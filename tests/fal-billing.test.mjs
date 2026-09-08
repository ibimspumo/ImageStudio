import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const directory = await mkdtemp(join(process.cwd(), 'node_modules', '.billing-tests-'))
const output = join(directory, 'fixture.mjs')
await build({ stdin: { contents: "export * from './src/main/services/fal-billing'; export * from './src/renderer/src/lib/billing-sync'; export * from './src/renderer/src/stores/gallery-store'; export * from './src/renderer/src/lib/gallery-costs'", resolveDir: process.cwd(), loader: 'ts' }, outfile: output, bundle: true, packages: 'external', platform: 'node', format: 'esm', logLevel: 'silent' })
const { fetchBillingCosts, refreshGalleryBilling, useGalleryStore, getGalleryCosts } = await import(pathToFileURL(output).href)
after(() => rm(directory, { recursive: true, force: true }))
const request = { requestId: 'fal-one', timestamp: Date.now() - 400 * 86400000 }
test('billing paginates exact matching request totals with discounts and historical ranges', async () => {
  const urls = []
  const result = await fetchBillingCosts('secret', [request], async (url, options) => {
    urls.push(new URL(url))
    assert.equal(options.headers.Authorization, 'Key secret')
    return new Response(JSON.stringify(urls.length === 1 ? { billing_events: [{ request_id: 'fal-one', cost_total: 0.045, cost_subtotal: 0.05 }, { request_id: 'unrelated', cost_total: 20 }], has_more: true, next_cursor: 'next' } : { billing_events: [{ request_id: 'fal-one', cost_total: 0.005 }], has_more: false }))
  })
  assert.equal(result.costs[0].cost, 0.05)
  assert.equal(urls[1].searchParams.get('cursor'), 'next')
  assert.equal(urls[0].searchParams.get('request_id'), request.requestId)
  assert.ok(new Date(urls[0].searchParams.get('start')).getTime() < request.timestamp)
  assert.equal(result.status, 'synced')
  assert.ok(!JSON.stringify(result).includes('secret'))
})
test('missing admin permission and absent billing events never become zero charges', async () => {
  const denied = await fetchBillingCosts('secret', [request], async () => new Response('', { status: 403 }))
  assert.equal(denied.status, 'access-denied'); assert.deepEqual(denied.costs, [])
  const pending = await fetchBillingCosts('secret', [request], async () => new Response(JSON.stringify({ billing_events: [], has_more: false })))
  assert.deepEqual(pending.costs, [])
  const zero = await fetchBillingCosts('secret', [request], async () => new Response(JSON.stringify({ billing_events: [{ request_id: request.requestId, cost_total: 0 }], has_more: false })))
  assert.equal(zero.costs[0].cost, 0)
})
test('shared reconciliation preserves estimate, avoids double-counting and separates confirmed from estimated totals', async () => {
  useGalleryStore.setState({ images: [{ id: 'a', falRequestId: 'batch', timestamp: Date.now(), cost: 0.1 }, { id: 'b', falRequestId: 'batch', timestamp: Date.now(), cost: 0.1 }, { id: 'old', timestamp: Date.now(), cost: 0.3 }] })
  global.window = { api: { saveHistory: async () => ({ success: true }), refreshBilling: async () => ({ success: true, status: 'synced', message: 'ok', costs: [{ requestId: 'batch', cost: 0.08, checkedAt: Date.now() }] }) } }
  await refreshGalleryBilling()
  await refreshGalleryBilling()
  const images = useGalleryStore.getState().images
  assert.equal(images[0].cost, 0.04); assert.equal(images[0].estimatedCost, 0.1)
  const totals = getGalleryCosts(images)
  assert.equal(totals.confirmedSpendUsd, 0.08); assert.equal(totals.estimatedSpendUsd, 0.3); assert.equal(totals.gallerySpendUsd, 0.38)
})
