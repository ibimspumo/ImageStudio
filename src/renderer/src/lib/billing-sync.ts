import { create } from 'zustand'
import { useGalleryStore } from '../stores/gallery-store'
import { useSettingsStore } from '../stores/settings-store'
import type { BillingResult } from '../../../shared/billing'

export const useBillingSyncStore = create<{ running: boolean; status: string; message: string; checkedAt?: number }>(() => ({ running: false, status: 'idle', message: 'fal.ai-Kosten wurden noch nicht abgeglichen.' }))
let pending: Promise<BillingResult> | undefined
export function refreshGalleryBilling(ids?: string[]): Promise<BillingResult> {
  if (pending) return pending
  const images = useGalleryStore.getState().images.filter(i => !i.isLoading && i.falRequestId && (!ids || ids.includes(i.id)))
  if (!images.length) {
    const result: BillingResult = { success: true, costs: [], status: 'synced', message: 'Keine gespeicherten fal.ai-Request-IDs vorhanden. Ältere Medien ohne ID können nicht exakt zugeordnet werden.' }
    useBillingSyncStore.setState({ status: result.status, message: result.message })
    return Promise.resolve(result)
  }
  useBillingSyncStore.setState({ running: true })
  pending = (async () => {
    try {
      const result = await window.api.refreshBilling(images.map(i => ({ requestId: i.falRequestId!, timestamp: i.timestamp })))
      for (const cost of result.costs) {
        const matches = useGalleryStore.getState().images.filter(i => i.falRequestId === cost.requestId)
        // Requests produce one media here. If a future endpoint returns multiple, allocate the total once.
        for (const image of matches) useGalleryStore.getState().updateMetadata(image.id, { cost: cost.cost / matches.length, estimatedCost: image.estimatedCost ?? (image.costSource !== 'provider-reported' ? image.cost : undefined), costCurrency: 'USD', costSource: 'provider-reported', costCheckedAt: cost.checkedAt })
      }
      useBillingSyncStore.setState({ running: false, status: result.status, message: result.message, checkedAt: Date.now() })
      return result
    } catch {
      const result: BillingResult = { success: false, costs: [], status: 'unavailable', message: 'Kostenabgleich momentan nicht verfügbar. Schätzungen bleiben gekennzeichnet.' }
      useBillingSyncStore.setState({ running: false, status: result.status, message: result.message })
      return result
    } finally { pending = undefined }
  })()
  return pending
}

/** One debounced read after completed jobs; retry on app launch/manual action, never a polling storm. */
export function startBillingSync(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let seen = ''
  const schedule = () => {
    if (useBillingSyncStore.getState().status === 'access-denied') return
    const signature = useGalleryStore.getState().images.filter(i => !i.isLoading && i.falRequestId && i.costSource !== 'provider-reported').map(i => i.id).sort().join(',')
    if (!signature || signature === seen) return
    seen = signature
    clearTimeout(timer)
    timer = setTimeout(() => {
      const ids = useGalleryStore.getState().images.filter(i => !i.isLoading && i.falRequestId && i.costSource !== 'provider-reported').map(i => i.id)
      void refreshGalleryBilling(ids)
    }, 2500)
  }
  const unsub = useGalleryStore.subscribe(schedule)
  const unsubSettings = useSettingsStore.subscribe((state, prior) => {
    if (state.falApiKey !== prior.falApiKey || state.falBillingApiKey !== prior.falBillingApiKey) { seen = ''; useBillingSyncStore.setState({ status: 'idle' }); schedule() }
  })
  schedule()
  return () => { clearTimeout(timer); unsub(); unsubSettings() }
}
