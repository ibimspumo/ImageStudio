/** IPC failures resolve normally. Cancellation is expected, other failures must be visible. */
export function requireExportSuccess(result: { success: boolean; cancelled?: boolean; error?: string }): boolean {
  if (!result.success && !result.cancelled) throw new Error(result.error || 'Export fehlgeschlagen')
  return result.success
}
