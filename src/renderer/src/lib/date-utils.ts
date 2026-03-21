/** Shared date/time formatting utilities */

export function formatDuration(ms: number): string {
  return (ms / 1000).toFixed(1) + 's'
}

export function formatTime(timestamp: number): string {
  const d = new Date(timestamp)
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function formatDate(timestamp: number): string {
  const d = new Date(timestamp)
  return (
    d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }) +
    ' at ' +
    d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    })
  )
}
