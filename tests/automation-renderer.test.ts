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
  generateVideo: () => 'video-job',
  navigate: () => {}, getView: () => ({ mode: 'image' }),
})
async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await registry.call(name, args) as { isError?: boolean; content: { type: string; text: string }[] }
  return { error: !!result.isError, text: result.content[0].text, data: result.isError ? undefined : JSON.parse(result.content[0].text) }
}

test('renderer automation boundary and generation contracts', async () => {
  const names = registry.definitions.map(d => d.name)
  assert.equal(new Set(names).size, names.length, 'tool names are unique')
  for (const name of ['get_capabilities', 'get_draft', 'canvas_draw', 'image_crop', 'import_media', 'generate_video', 'wait_for_jobs']) assert.ok(names.includes(name), name)
  for (const name of ['chats', 'chat_generate', 'image_inpaint']) {
    assert.ok(!names.includes(name), `${name} is removed from discovery`)
    assert.equal((await call(name)).error, true, `${name} cannot execute`)
  }
  for (const mode of ['chat', 'inpaint']) {
    assert.equal((await call('get_draft', { mode })).error, true)
    assert.equal((await call('update_draft', { mode, patch: { prompt: 'removed' } })).error, true)
    assert.equal((await call('generate_draft', { mode })).error, true)
    assert.equal((await call('navigate', { target: mode })).error, true)
  }
  for (const target of ['library', 'references', 'styles', 'projects', 'activity']) assert.equal((await call('navigate', { target })).error, false)
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
  assert.deepEqual(preview.data.referenceGroups, [{ label: 'Collection "@Host" (1 image)', imageCount: 1 }])
  assert.equal(preview.data.estimateOnly, true)
  assert.equal(generated, undefined, 'preview never invokes paid generation')

  const output = await call('generate', { prompt: 'A wordmark', mode: 'logo', models: [DEFAULT_LOGO_MODEL], style: 'wordmark' })
  assert.deepEqual(output.data.jobIds, ['new-job'])
  assert.equal(generated?.background, 'transparent')
  assert.equal(generated?.outputFormat, 'png')
  assert.equal(generated?.isLogo, true)
  assert.equal((await call('generate', { prompt: 'bad count', imageCount: 11 })).error, true)
  const queued = await call('enqueue', { prompt: 'Queued only', quality: 'medium' })
  assert.equal(queued.error, false)
  assert.equal(useQueueStore.getState().isProcessing, false)
  assert.equal(useQueueStore.getState().items[0].quality, 'medium')

  useGalleryStore.setState({ images: [{ id: 'known', prompt: 'test', filePath: '/known-image.png', timestamp: 1, aspectRatio: '1:1', resolution: '1K', model: DEFAULT_THUMBNAIL_MODEL, generationOptions: { ...generated!, attachments: ['data:image/png;base64,SHOULD_NOT_LEAK'] }, generationRequest: { endpoint: 'test', input: { prompt: 'exact prompt', image_urls: ['data:image/png;base64,SHOULD_NOT_LEAK'] } } }] })
  assert.equal((await call('navigate', { target: 'create_variant', id: 'known' })).error, false)
  assert.equal((await call('navigate', { target: 'create_variant', id: 'missing' })).error, true)
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

test('inline collection and image references remain bound at their prompt positions', async () => {
  useCollectionsStore.setState({ collections: [
    { id: 'person', name: 'Timo', images: ['/person.png'], createdAt: 0 },
    { id: 'background', name: 'Studio Wall', images: ['/wall.png'], createdAt: 0 },
  ] })
  const listed = (await call('collections', { action: 'list' })).data
  assert.deepEqual(listed.map((c: { promptReference: string }) => c.promptReference), ['[@Timo]', '[@Studio Wall]'])
  const prompt = 'Portrait of [@Timo] wearing the jacket from [Image 1], in [@Studio Wall], holding the prop from [Image 2], lit as in [Image 3]. Preserve the identity of [@Timo].'
  const args = { prompt, references: [fixture, fixture, fixture], collectionIds: ['person', 'background', 'person'], presetId: '' }
  const preview = await call('preview_generation', args)
  assert.equal(preview.error, false)
  assert.equal(preview.data.request.prompt, prompt)
  assert.deepEqual(preview.data.referenceMentions, [
    { referenceIndex: 0, promptReference: '[Image 1]', mentionedInPrompt: true },
    { referenceIndex: 1, promptReference: '[Image 2]', mentionedInPrompt: true },
    { referenceIndex: 2, promptReference: '[Image 3]', mentionedInPrompt: true },
    { collectionId: 'person', promptReference: '[@Timo]', mentionedInPrompt: true },
    { collectionId: 'background', promptReference: '[@Studio Wall]', mentionedInPrompt: true },
  ])
  assert.equal((await call('generate', args)).error, false)
  assert.equal(generated?.prompt, prompt)
  assert.deepEqual(generated?.labeledAttachments?.map(group => group.label), ['Image 1', 'Image 2', 'Image 3', 'Collection "@Timo" (1 image)', 'Collection "@Studio Wall" (1 image)'])
  const vague = await call('preview_generation', { ...args, prompt: 'A portrait of Timo from the reference collection' })
  assert.ok(vague.data.referenceMentions.every((ref: { mentionedInPrompt: boolean }) => !ref.mentionedInPrompt))
  const capabilities = (await call('get_capabilities')).data
  assert.ok(capabilities.models.every((model: Record<string, unknown>) => !('maskField' in model)))
  assert.ok(capabilities.referencePrompting.example.includes('[@Timo]'))
  assert.ok(registry.definitions.find(tool => tool.name === 'generate')?.inputSchema.properties?.prompt.description?.includes('inline'))
})


test('GPT 2.5 discovery, exact pixels, formats and queue retain shared options', async () => {
  const capabilities = (await call('get_capabilities')).data
  const models = capabilities.models.filter((model: { id: string }) => model.id.includes('gpt-image'))
  assert.equal(models.length, 2)
  assert.ok(models.every((model: { id: string; qualities: string[]; description: string }) => model.id.includes('2.5') && model.qualities.includes('max') && model.description.length > 20))
  assert.equal(capabilities.defaults.quality, 'high')
  const base = { prompt: 'An A4 poster', models: [DEFAULT_LOGO_MODEL], presetId: '', imageSize: { width: 1001, height: 1415 }, outputFormat: 'webp', outputCompression: 87, background: 'transparent', quality: 'xhigh', imageCount: 10 }
  const preview = await call('preview_generation', base)
  assert.equal(preview.error, false, preview.text)
  assert.deepEqual(preview.data.request.imageSize, { width: 1008, height: 1424 })
  assert.deepEqual(preview.data.models[0].imageSize, { width: 1008, height: 1424 })
  assert.equal(preview.data.request.outputFormat, 'webp')
  assert.equal(preview.data.request.outputCompression, 87)
  const queued = await call('enqueue', base)
  assert.equal(queued.error, false, queued.text)
  const item = useQueueStore.getState().items.find(item => item.id === queued.data.id)!
  assert.deepEqual(item.imageSize, { width: 1008, height: 1424 })
  assert.equal(item.outputCompression, 87)
  assert.equal(item.outputFormat, 'webp')
  assert.equal(item.background, 'transparent')
  for (const patch of [
    { imageSize: { width: 16, height: 16 } },
    { imageSize: { width: 3840, height: 3840 } },
    { imageSize: { width: 3840, height: 1008 } },
    { imageSize: { width: 1001.5, height: 1415 } },
    { outputFormat: 'png' }, { outputFormat: 'jpeg' },
    { outputCompression: 101 }, { quality: 'ultra' },
    { mode: 'thumbnail' }, { mode: 'logo' },
    { models: ['fal-ai/nano-banana-2'] },
    { inputFidelity: 'high' }, { models: ['fal-ai/gpt-image-2'] },
  ]) {
    const rejected = await call('preview_generation', { ...base, ...patch })
    assert.equal(rejected.error, true, JSON.stringify(patch))
  }
  const format = await call('preview_generation', { ...base, outputFormat: 'jpeg', background: 'opaque', quality: 'max', outputCompression: 0 })
  assert.equal(format.error, false, format.text)
  assert.equal(format.data.request.outputCompression, 0)
})
