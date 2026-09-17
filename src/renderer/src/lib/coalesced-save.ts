/** Serialize transfers, coalescing all intervening mutations into the latest save. */
export function createCoalescedSave(saveLatest: () => Promise<void>): () => Promise<void> {
  let active: Promise<void> | undefined
  let pending = false
  return () => {
    pending = true
    if (!active) {
      active = Promise.resolve().then(async () => {
        try {
          do {
            pending = false
            await saveLatest()
          } while (pending)
        } finally {
          active = undefined
        }
      })
    }
    return active
  }
}
