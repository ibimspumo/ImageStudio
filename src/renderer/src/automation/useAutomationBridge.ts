import { startBillingSync } from '../lib/billing-sync'
import { useEffect, useRef } from 'react'
import { useImageGeneration } from '../hooks/useImageGeneration'
import { useVideoGeneration } from '../hooks/useVideoGeneration'
import { useGalleryStore } from '../stores/gallery-store'
import { useQueueStore } from '../stores/queue-store'
import { useSettingsStore } from '../stores/settings-store'
import { createAutomationTools, type AutomationContext } from './tools'

/** Runs one explicit queue at a time, regardless of which app panel is visible. */
function startQueueRunner(context: AutomationContext): () => void {
  let disposed = false
  let advancing = false
  const tick = () => {
    if (disposed || advancing) return
    const queue = useQueueStore.getState()
    const active = queue.items.find(item => item.status === 'active')
    if (active) {
      const results = active.resultImageIds.map(id => useGalleryStore.getState().images.find(image => image.id === id))
      if (!active.resultImageIds.length || results.some(image => image?.isLoading)) return
      advancing = true
      const failed = results.some(image => !image || image.error)
      queue.updateItem(active.id, { status: failed ? 'failed' : 'completed', completedCount: results.filter(image => image && !image.error).length, error: failed ? results.find(image => image?.error)?.error ?? 'A generated image was removed' : undefined })
      advancing = false
    }
    const current = useQueueStore.getState()
    if (!current.isProcessing || current.items.some(item => item.status === 'active')) return
    const next = current.items.find(item => item.status === 'pending')
    if (!next) { current.pauseProcessing(); return }
    if (!useSettingsStore.getState().falApiKey) { current.pauseProcessing(); return }
    advancing = true
    try {
      const ids = context.generate({ prompt: next.presetSuffix ? `${next.prompt}, ${next.presetSuffix}` : next.prompt, models: next.models, aspectRatio: next.aspectRatio, resolution: next.resolution, imageCount: next.imageCount, attachments: next.attachments, labeledAttachments: next.labeledAttachments, seed: next.seed, quality: next.quality ?? 'high', imageSize: next.imageSize, outputFormat: next.outputFormat, outputCompression: next.outputCompression, background: next.background })
      if (!ids.length) throw new Error('No generation jobs were started')
      current.updateItem(next.id, { status: 'active', resultImageIds: ids })
    } catch (error) {
      current.updateItem(next.id, { status: 'failed', error: error instanceof Error ? error.message : 'Queue generation failed' })
      current.pauseProcessing()
    } finally { advancing = false }
  }
  const unsubQueue = useQueueStore.subscribe(tick)
  const unsubGallery = useGalleryStore.subscribe(tick)
  tick()
  return () => { disposed = true; unsubQueue(); unsubGallery() }
}

export function useAutomationBridge(ready: boolean, ui: Pick<AutomationContext, 'navigate' | 'getView'>): void {
  useEffect(() => { if (ready) return startBillingSync() }, [ready])
  const { generate } = useImageGeneration()
  const { generateVideo } = useVideoGeneration()
  const live = useRef<AutomationContext>({ ...ui, generate, generateVideo })
  live.current = { ...ui, generate, generateVideo }
  useEffect(() => {
    if (!ready) return
    const context: AutomationContext = {
      generate: options => live.current.generate(options),
      generateVideo: options => live.current.generateVideo(options),
      navigate: (target, id) => live.current.navigate(target, id),
      getView: () => live.current.getView(),
    }
    const registry = createAutomationTools(context)
    const unsubscribe = window.api.onAutomationRequest(request => {
      void (async () => {
        try {
          const result = request.method === 'tools/list'
            ? { tools: registry.definitions }
            : await registry.call(request.params?.name ?? '', request.params?.arguments ?? {})
          window.api.automationReply({ id: request.id, result })
        } catch (error) {
          window.api.automationReply({ id: request.id, error: error instanceof Error ? error.message : 'Automation request failed' })
        }
      })()
    })
    const stopQueue = startQueueRunner(context)
    window.api.automationReady()
    return () => { unsubscribe(); stopQueue() }
  }, [ready])
}
