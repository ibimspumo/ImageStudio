import { create } from 'zustand'
import { debounce } from '../lib/debounce'
import { logger } from '../lib/logger'

/**
 * Recently used projects and workspaces — feeds the switcher's quick-access
 * pills and the "Zuletzt benutzt" section of the move menu. Bumped on
 * activation and on every move; ids of deleted entries are simply filtered
 * out by the consumers, so nothing here has to watch the other stores.
 */
interface UiRecentsStore {
  recentProjectIds: string[]
  recentWorkspaceIds: string[]
  bumpProject: (id: string) => void
  bumpWorkspace: (id: string) => void
  loadFromDisk: () => Promise<void>
  persistToDisk: () => Promise<void>
}

const MAX_RECENTS = 8

const debouncedPersist = debounce((persist: () => Promise<void>) => {
  persist().catch((err) => logger.error('UiRecentsStore', 'Persist failed', err))
}, 500)

const bump = (list: string[], id: string): string[] =>
  [id, ...list.filter((x) => x !== id)].slice(0, MAX_RECENTS)

export const useUiRecentsStore = create<UiRecentsStore>((set, get) => ({
  recentProjectIds: [],
  recentWorkspaceIds: [],

  bumpProject: (id) => {
    set((s) => ({ recentProjectIds: bump(s.recentProjectIds, id) }))
    debouncedPersist(get().persistToDisk)
  },

  bumpWorkspace: (id) => {
    set((s) => ({ recentWorkspaceIds: bump(s.recentWorkspaceIds, id) }))
    debouncedPersist(get().persistToDisk)
  },

  loadFromDisk: async () => {
    try {
      const result = await window.api.listHistory()
      if (result.success && result.sessions) {
        const session = result.sessions.find((s) => s.id === 'ui-recents')
        if (session) {
          const data = JSON.parse(session.data) as {
            recentProjectIds?: string[]
            recentWorkspaceIds?: string[]
          }
          set({
            recentProjectIds: data.recentProjectIds ?? [],
            recentWorkspaceIds: data.recentWorkspaceIds ?? [],
          })
        }
      }
    } catch (err) {
      logger.warn('UiRecentsStore', 'Failed to load from disk (may be first launch)', err)
    }
  },

  persistToDisk: async () => {
    const { recentProjectIds, recentWorkspaceIds } = get()
    await window.api.saveHistory('ui-recents', JSON.stringify({ recentProjectIds, recentWorkspaceIds }))
  },
}))
