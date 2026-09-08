import type { BillingRequest, BillingResult, BillingCost } from '../../shared/billing'

/** Read-only, request-level billing. Never extrapolate charges from list prices or other jobs. */
export async function fetchBillingCosts(apiKey: string, requests: BillingRequest[], fetcher: typeof fetch = fetch): Promise<BillingResult> {
  const costs: BillingCost[] = []
  if (!apiKey.trim()) return { success: false, costs, status: 'missing-key', message: 'Für den Kostenabgleich einen fal.ai Admin-Schlüssel in den Einstellungen hinterlegen.' }
  if (!Array.isArray(requests) || requests.length > 10000 || requests.some(r => !r || typeof r.requestId !== 'string' || !r.requestId || r.requestId.length > 200 || !Number.isFinite(r.timestamp) || r.timestamp < 0)) {
    return { success: false, costs, status: 'unavailable', message: 'Ungültige Request-IDs oder Zeitstempel für den Kostenabgleich.' }
  }
  // Each query remains below fal's 90-day range limit, including historical jobs.
  const groups = new Map<number, BillingRequest[]>()
  for (const r of new Map(requests.map(r => [r.requestId, r])).values()) {
    const day = Math.floor(r.timestamp / 86400000)
    groups.set(day, [...(groups.get(day) ?? []), r])
  }
  try {
    for (const [day, entries] of groups) for (let offset = 0; offset < entries.length; offset += 50) {
      const batch = entries.slice(offset, offset + 50)
      const accepted = new Set(batch.map(r => r.requestId))
      const totals = new Map<string, number>()
      let cursor: string | undefined
      const cursors = new Set<string>()
      do {
        const url = new URL('https://api.fal.ai/v1/models/billing-events')
        url.searchParams.set('request_id', batch.map(r => r.requestId).join(','))
        url.searchParams.set('start', new Date((day - 1) * 86400000).toISOString())
        url.searchParams.set('end', new Date(Math.min(Date.now() + 1000, (day + 3) * 86400000)).toISOString())
        url.searchParams.set('limit', '1000')
        if (cursor) url.searchParams.set('cursor', cursor)
        const response = await fetcher(url, { headers: { Authorization: `Key ${apiKey.trim()}` }, signal: AbortSignal.timeout(15000) })
        if (!response.ok) return { success: false, costs, status: response.status === 401 || response.status === 403 ? 'access-denied' : 'unavailable', message: response.status === 401 || response.status === 403 ? 'fal.ai erlaubt den Kostenabgleich nur mit einem gültigen Admin-Schlüssel. Unter Einstellungen → Anbieter eintragen.' : `fal.ai-Kostenabgleich derzeit nicht verfügbar (HTTP ${response.status}). Schätzungen bleiben gekennzeichnet.` }
        const body = await response.json() as { billing_events?: { request_id: string; cost_total?: number; cost_estimate_nano_usd?: number }[]; has_more?: boolean; next_cursor?: string }
        if (!Array.isArray(body.billing_events)) throw new Error('Invalid response')
        for (const event of body.billing_events) {
          // cost_total already includes discounts. The nano field represents the same total.
          const amount = event.cost_total ?? (typeof event.cost_estimate_nano_usd === 'number' ? event.cost_estimate_nano_usd / 1e9 : undefined)
          if (accepted.has(event.request_id) && typeof amount === 'number' && Number.isFinite(amount) && amount >= 0) totals.set(event.request_id, (totals.get(event.request_id) ?? 0) + amount)
        }
        cursor = body.has_more ? body.next_cursor : undefined
        if (body.has_more && (!cursor || cursors.has(cursor) || cursors.size >= 100)) throw new Error('Incomplete pagination')
        if (cursor) cursors.add(cursor)
      } while (cursor)
      for (const [requestId, cost] of totals) costs.push({ requestId, cost: Math.round(cost * 1e9) / 1e9, currency: 'USD', source: 'provider-reported', checkedAt: Date.now() })
    }
    return { success: true, costs, status: 'synced', message: 'Kosten mit fal.ai abgeglichen. Noch nicht gemeldete Kosten bleiben als Schätzung sichtbar.' }
  } catch {
    return { success: false, costs, status: 'unavailable', message: 'Kostenabgleich momentan nicht verfügbar. Bereits bestätigte Kosten bleiben erhalten; fehlende Angaben bleiben Schätzungen.' }
  }
}
