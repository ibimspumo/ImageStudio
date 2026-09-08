import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

// Run the shared UI/MCP hooks with actual Zustand vanilla stores and mocked IPC.
// No React render lifecycle, filesystem media transformation, or provider charges.
const directory = await mkdtemp(join(process.cwd(), 'node_modules', '.generation-tests-'))
const fixture = join(directory, 'fixture.cjs')
await build({
  stdin: { contents: `export * from './src/renderer/src/hooks/useImageGeneration'; export * from './src/renderer/src/hooks/useVideoGeneration'; export * from './src/renderer/src/hooks/useChatGeneration'; export * from './src/renderer/src/stores/chat-store'; export * from './src/renderer/src/stores/gallery-store'; export * from './src/renderer/src/stores/settings-store'; export * from './src/renderer/src/stores/workspace-store'; export { AVAILABLE_MODELS, AVAILABLE_VIDEO_MODELS } from './src/renderer/src/types/api'`, resolveDir: process.cwd(), loader: 'ts' },
  outfile: fixture, bundle: true, packages: 'external', platform: 'node', format: 'cjs', logLevel: 'silent',
  plugins: [{ name: 'renderer-boundaries', setup(build) {
    build.onResolve({ filter: /^(react|zustand)$/ }, args => ({ path: args.path, namespace: 'mock' }))
    build.onResolve({ filter: /\/anti-detection$/ }, () => ({ path: 'anti-detection', namespace: 'mock' }))
    build.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: args.path === 'react'
      ? 'export const useCallback = fn => fn;'
      : args.path === 'zustand'
        ? "import { createStore } from 'zustand/vanilla'; export function create(init) { const store = createStore(init); return Object.assign((selector = state => state) => selector(store.getState()), store) }"
        : "export async function prepareForStorage(dataUrl) { return { dataUrl, extension: 'png' } }", resolveDir: process.cwd() }))
  } }],
})
const providerFixture = join(directory, 'provider.cjs')
await build({
  entryPoints: ['src/main/services/fal-image.ts'], outfile: providerFixture, bundle: true,
  packages: 'external', platform: 'node', format: 'cjs', logLevel: 'silent',
  plugins: [{ name: 'fake-provider', setup(build) {
    build.onResolve({ filter: /^@fal-ai\/client$/ }, () => ({ path: 'fal', namespace: 'mock' }))
    build.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const fal = { config() {}, queue: { cancel(...args) { return globalThis.testProviderCancel(...args) } }, subscribe(...args) { return globalThis.testProviderSubscribe(...args) } };' }))
  } }],
})
const provider = createRequire(import.meta.url)(providerFixture)
const app = createRequire(import.meta.url)(fixture)
after(() => rm(directory, { recursive: true, force: true }))
const tick = () => new Promise(resolve => setImmediate(resolve))
let progress, videoProgress, resolveImage, resolveVideo, sentImage, sentVideo, unsubscribed
beforeEach(() => {
  progress = videoProgress = resolveImage = resolveVideo = sentImage = sentVideo = undefined
  unsubscribed = 0
  app.useGalleryStore.setState({ images: [] })
  app.useChatStore.setState({ chats: [], activeChatId: null })
  app.useSettingsStore.setState({ falApiKey: 'test-key-never-persist', antiDetection: false })
  app.useWorkspaceStore.setState({ activeWorkspaceId: 'active-folder' })
  global.window = { api: {
    onGenerateProgress(callback) { progress = callback; return () => { unsubscribed++ } },
    onVideoProgress(callback) { videoProgress = callback; return () => { unsubscribed++ } },
    generateImage(request) { sentImage = request; return new Promise(resolve => { resolveImage = resolve }) },
    generateVideo(request) { sentVideo = request; return new Promise(resolve => { resolveVideo = resolve }) },
    cancelImageGeneration: async () => ({ success: true, cancelled: 1 }),
    saveImage: async (_, name) => ({ success: true, filePath: `/gallery/${name}` }),
    saveHistory: async () => ({ success: true }),
  } }
})

const imageOptions = () => ({ prompt: 'visible prompt', apiPrompt: 'composed prompt', systemPrompt: 'custom meta rules', aspectRatio: '1:1', resolution: '2K', imageCount: 2, models: [app.AVAILABLE_MODELS[0].id], quality: 'high', background: 'opaque', inputFidelity: 'high' })

test('image jobs stream only their own progress; completion wins a late batch cancellation and snapshots contain no key', async () => {
  const options = imageOptions()
  const ids = app.useImageGeneration().generate(options)
  assert.equal(ids.length, 2)
  options.prompt = 'later draft edit'
  assert.equal(app.useGalleryStore.getState().images.find(i => i.id === ids[0]).generationOptions.prompt, 'visible prompt')
  progress({ requestId: 'another-batch', index: 0, status: 'progress', message: 'wrong status' })
  assert.equal(app.useGalleryStore.getState().images.find(i => i.id === ids[0]).statusText, undefined)
  progress({ requestId: sentImage.requestId, index: 0, status: 'progress', message: 'Queued…' })
  assert.equal(app.useGalleryStore.getState().images.find(i => i.id === ids[0]).statusText, 'Queued…')
  const cancelled = await app.cancelImageJob(ids[0])
  assert.deepEqual(new Set(cancelled.affectedIds), new Set(ids))
  const generationRequest = { endpoint: 'provider/model', input: { prompt: 'Reference preamble + exact composed prompt', quality: 'high' } }
  resolveImage({ success: true, results: [{ status: 'complete', result: { id: 'fal-job', imageBase64: 'data:image/png;base64,AAAA', seed: 42, cost: 0.1, generationRequest } }, { status: 'cancelled', error: 'Cancelled' }] })
  await tick()
  const [complete, stopped] = ids.map(id => app.useGalleryStore.getState().images.find(i => i.id === id))
  assert.equal(complete.isLoading, false)
  assert.equal(complete.error, undefined)
  assert.equal(complete.cancelled, false)
  assert.equal(complete.falRequestId, 'fal-job')
  assert.equal(complete.seed, 42)
  assert.deepEqual(complete.generationRequest, generationRequest)
  assert.equal(complete.costSource, 'list-price-estimate')
  assert.equal(stopped.cancelled, true)
  app.useGalleryStore.getState().failImage(complete.id, 'late failure')
  progress({ requestId: sentImage.requestId, index: 0, status: 'progress', message: 'late progress' })
  assert.equal(app.useGalleryStore.getState().images.find(i => i.id === complete.id).error, undefined)
  assert.equal(app.useGalleryStore.getState().images.find(i => i.id === complete.id).statusText, undefined)
  assert.equal(JSON.stringify(app.useGalleryStore.getState().images).includes('test-key-never-persist'), false)
  assert.equal(unsubscribed, 1)
})

test('video returns immediate ID, stores effective options and returned seed, and rejects unsupported cancellation', async () => {
  const model = app.AVAILABLE_VIDEO_MODELS[0]
  const id = app.useVideoGeneration().generateVideo({ prompt: 'move camera', model: model.id, duration: 5, aspectRatio: '16:9', resolution: '1080p', seed: 7, cameraFixed: true, startFrameBase64: 'data:image/png;base64,AAAA', workspaceId: null })
  assert.equal(typeof id, 'string')
  let image = app.useGalleryStore.getState().images.find(i => i.id === id)
  assert.equal(image.resolution, '1080p')
  assert.equal(image.workspaceId, undefined)
  assert.equal(image.generationOptions.generateAudio, false)
  assert.equal(image.generationOptions.cameraFixed, true)
  assert.equal(sentVideo.generateAudio, false)
  videoProgress({ requestId: id, status: 'Generating…', progress: 50 })
  assert.equal(app.useGalleryStore.getState().images[0].progressPercent, 50)
  await assert.rejects(app.cancelImageJob(id), /Video cancellation is not supported/)
  resolveVideo({ success: true, filePath: '/gallery/video.mp4', duration: 5, seed: 99 })
  await tick()
  image = app.useGalleryStore.getState().images.find(i => i.id === id)
  assert.equal(image.seed, 99)
  assert.equal(image.costCurrency, 'USD')
  assert.equal(image.costSource, 'list-price-estimate')
  assert.equal(image.cost, model.costPerSecond * 5)
  assert.equal(image.isLoading, false)
  assert.equal(unsubscribed, 1)
  assert.equal(app.AVAILABLE_VIDEO_MODELS.some(model => model.supportsEndFrame), false)
})


test('aborting an enqueued image requests provider cancellation rather than only stopping local polling', async () => {
  const calls = []
  global.testProviderCancel = async (...args) => { calls.push(args) }
  global.testProviderSubscribe = async (_endpoint, options) => {
    options.onEnqueue('provider-queue-id')
    return new Promise((_, reject) => options.abortSignal.addEventListener('abort', () => reject(new Error('aborted'))))
  }
  const controller = new AbortController()
  const progressEvents = []
  const pending = provider.generateImage({ apiKey: 'mock-provider-key', model: app.AVAILABLE_MODELS[0].id, prompt: 'test', aspectRatio: '1:1', resolution: '2K' }, controller.signal, (...args) => progressEvents.push(args))
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError', message: 'Cancelled' })
  assert.equal(calls.length, 1)
  assert.equal(calls[0][1].requestId, 'provider-queue-id')
  assert.ok(progressEvents.some(([, requestId]) => requestId === 'provider-queue-id'))
})


test('chat returns stable IDs before reference reads, locks concurrent requests, uses live settings and preserves source metadata', async () => {
  const model = app.AVAILABLE_MODELS.find(model => model.supportsBackground)
  const store = app.useGalleryStore.getState()
  const sourceId = store.addPlaceholder('source logo', '1:1', '2K', model.id, undefined, 'source-folder', { hasAlpha: true, isLogo: true, logoStyle: 'minimal', projectId: 'source-project', thumbnailStyle: 'bold', faceFidelity: true })
  store.completeImage(sourceId, '/gallery/source.png')
  const chatId = app.useChatStore.getState().startChat(sourceId, '/gallery/source.png', 'source logo')
  const { generate } = app.useChatGeneration()
  app.useSettingsStore.setState({ falApiKey: 'updated-key-never-persist' })
  let readReference
  window.api.readImage = () => new Promise(resolve => { readReference = resolve })
  window.api.uploadToUrls = async images => ({ success: true, urls: images.map((_, index) => `https://fal.example/reference-${index}.png`) })
  const options = { chatId, prompt: 'Change the logo color', aspectRatio: '1:1', resolution: '2K', model: model.id, quality: 'high', seed: 5 }
  const job = generate(options)
  assert.equal(job.chatId, chatId)
  assert.equal(typeof job.messageId, 'string')
  assert.equal(sentImage, undefined)
  const messages = app.useChatStore.getState().chats[0].messages
  assert.equal(messages.length, 3)
  assert.equal(messages.at(-1).id, job.messageId)
  assert.equal(messages.at(-1).isLoading, true)
  assert.throws(() => generate(options), /already generating/)
  assert.equal(app.useChatStore.getState().chats[0].messages.length, 3)
  readReference({ success: true, base64DataUrl: 'data:image/png;base64,AAAA' })
  await tick()
  assert.equal(sentImage.apiKey, 'updated-key-never-persist')
  assert.equal(sentImage.background, 'transparent')
  assert.equal(sentImage.labeledAttachments[0].images[0], 'https://fal.example/reference-0.png')
  const generationRequest = { endpoint: model.editEndpoint, input: { prompt: 'actual reference preamble and prompt', background: 'transparent' } }
  resolveImage({ success: true, results: [{ status: 'complete', result: { id: 'provider-chat-job', imageBase64: 'data:image/png;base64,AAAA', seed: 88, cost: 0.25, generationRequest } }] })
  await tick()
  const result = app.useGalleryStore.getState().images.find(image => image.chatMessageId === job.messageId)
  assert.ok(result)
  assert.equal(result.chatId, chatId)
  assert.equal(result.parentImageId, sourceId)
  assert.equal(result.workspaceId, 'source-folder')
  assert.equal(result.projectId, 'source-project')
  assert.equal(result.thumbnailStyle, 'bold')
  assert.equal(result.hasAlpha, true)
  assert.equal(result.isLogo, true)
  assert.equal(result.seed, 88)
  assert.equal(result.costSource, 'list-price-estimate')
  assert.equal(result.requestId, sentImage.requestId)
  assert.deepEqual(result.generationRequest, generationRequest)
  assert.equal(app.useChatStore.getState().chats[0].messages.at(-1).imageFilePath, result.filePath)
  assert.equal(app.useChatStore.getState().chats[0].messages.at(-1).isLoading, false)
  assert.equal(JSON.stringify(app.useGalleryStore.getState().images).includes('updated-key-never-persist'), false)
})
