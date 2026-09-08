import test from 'node:test'
import assert from 'node:assert/strict'
import { createAutomationTools } from '../src/renderer/src/automation/tools'
import { useSettingsStore } from '../src/renderer/src/stores/settings-store'
import { useGalleryStore } from '../src/renderer/src/stores/gallery-store'
import { useQueueStore } from '../src/renderer/src/stores/queue-store'
import { useCollectionsStore } from '../src/renderer/src/stores/collections-store'
import { useThumbnailProjectsStore } from '../src/renderer/src/stores/thumbnail-projects-store'
import { useThumbnailMetaPromptsStore } from '../src/renderer/src/stores/thumbnail-meta-prompts-store'
import { DEFAULT_THUMBNAIL_MODEL, DEFAULT_LOGO_MODEL } from '../src/renderer/src/types/api'
import type { GenerateOptions } from '../src/renderer/src/hooks/useImageGeneration'

// Store calls are in-memory; no provider, personal data, disk or network access.
const writes: string[] = []
const fixture = 'data:image/png;base64,aGVsbG8='
Object.assign(globalThis, { window: { api: {
  saveHistory: async (id: string) => { writes.push(id); return { success: true } },
  setSetting: async () => ({ success: true }),
  readImage: async (path: string) => ({ success: true, base64DataUrl: path === '/missing' ? undefined : fixture }),
} } })
let generated: GenerateOptions | undefined
const registry = createAutomationTools({
  generate: options => { generated = options; return ['new-job'] },
  generateVideo: () => 'video-job', generateChat: () => ({ chatId: 'chat', messageId: 'message' }),
  navigate: () => {}, getView: () => ({ mode: 'image' }),
})
async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await registry.call(name, args) as { isError?: boolean; content: { type: string; text: string }[] }
  return { error: !!result.isError, text: result.content[0].text, data: result.isError ? undefined : JSON.parse(result.content[0].text) }
}

test('renderer automation boundary and generation contracts', async () => {
  const names = registry.definitions.map(d => d.name)
  assert.equal(new Set(names).size, names.length, 'tool names are unique')
  for (const name of ['get_capabilities', 'get_draft', 'canvas_draw', 'image_inpaint', 'import_media', 'generate_video', 'wait_for_jobs']) assert.ok(names.includes(name), name)
  assert.equal((await call('update_settings', { imaginaryField: true })).error, true)
  assert.equal((await call('update_settings', { defaultImageCount: 100000 })).error, true)
  assert.equal((await call('generate', { prompt: 'test', extraCode: 'alert(1)' })).error, true)
  assert.equal((await call('generate', { prompt: 'test' })).error, true, 'no key means no paid call')
  assert.equal(generated, undefined)

  await call('update_settings', { falApiKey: 'secret-fixture', defaultImageCount: 1 })
  const settings = await call('get_settings')
  assert.equal(settings.data.apiKeyConfigured, true)
  assert.ok(!settings.text.includes('secret-fixture'))
  assert.equal((await call('get_api_key')).data.apiKey, 'secret-fixture')

  const workspace = await call('workspaces', { action: 'create', name: 'Test folder' })
  assert.equal(typeof workspace.data.id, 'string')
  const project = await call('projects', { action: 'create', title: 'Test video', angle: 'Clear visual contrast' })
  const meta = await call('meta_prompts', { action: 'create', name: 'Channel format', text: 'Use a yellow border' })
  useCollectionsStore.setState({ collections: [{ id: 'collection', name: 'Host', images: ['/known-image.png'], createdAt: 0 }] })
  const preview = await call('preview_generation', { prompt: 'Show the host reacting', mode: 'thumbnail', models: [DEFAULT_THUMBNAIL_MODEL], collectionIds: ['collection'], projectId: project.data.id, metaPromptId: meta.data.id })
  assert.equal(preview.error, false)
  assert.equal(preview.data.request.aspectRatio, '16:9')
  assert.equal(preview.data.request.resolution, '2K')
  assert.equal(preview.data.request.quality, 'high')
  assert.ok(preview.data.request.systemPrompt.includes('Test video'))
  assert.ok(preview.data.request.systemPrompt.includes('Use a yellow border'))
  assert.deepEqual(preview.data.referenceGroups, [{ label: 'Collection "@Host" (1 images)', imageCount: 1 }])
  assert.equal(preview.data.estimateOnly, true)
  assert.equal(generated, undefined, 'preview never invokes paid generation')

  const output = await call('generate', { prompt: 'A wordmark', mode: 'logo', models: [DEFAULT_LOGO_MODEL], style: 'wordmark' })
  assert.deepEqual(output.data.jobIds, ['new-job'])
  assert.equal(generated?.background, 'transparent')
  assert.equal(generated?.outputFormat, 'png')
  assert.equal(generated?.isLogo, true)
  assert.equal((await call('generate', { prompt: 'bad count', imageCount: 5 })).error, true)
  const queued = await call('enqueue', { prompt: 'Queued only', quality: 'medium' })
  assert.equal(queued.error, false)
  assert.equal(useQueueStore.getState().isProcessing, false)
  assert.equal(useQueueStore.getState().items[0].quality, 'medium')

  useGalleryStore.setState({ images: [{ id: 'known', prompt: 'test', filePath: '/known-image.png', timestamp: 1, aspectRatio: '1:1', resolution: '1K', model: DEFAULT_THUMBNAIL_MODEL, generationOptions: { ...generated!, attachments: ['data:image/png;base64,SHOULD_NOT_LEAK'] }, generationRequest: { endpoint: 'test', input: { prompt: 'exact prompt', image_urls: ['data:image/png;base64,SHOULD_NOT_LEAK'] } } }] })
  assert.ok(!(await call('list_images')).text.includes('SHOULD_NOT_LEAK'))
  assert.ok(!(await call('wait_for_jobs', { ids: ['known'], timeoutMs: 0 })).text.includes('SHOULD_NOT_LEAK'))
  const details = await call('generation_details', { id: 'known' })
  assert.ok(details.text.includes('exact prompt'))
  assert.ok(!details.text.includes('SHOULD_NOT_LEAK'))
  assert.equal((await call('wait_for_jobs', { ids: ['absent'], timeoutMs: 0 })).error, true)
  assert.equal((await call('projects', { action: 'update', id: 'absent', title: 'X' })).error, true)
  assert.equal(useThumbnailProjectsStore.getState().projects.length, 1)
  assert.equal(useThumbnailMetaPromptsStore.getState().prompts.length, 1)
  assert.ok(writes.includes('workspaces'))
})
