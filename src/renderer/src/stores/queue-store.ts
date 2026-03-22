import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { debounce } from '../lib/debounce'
import { logger } from '../lib/logger'

export interface QueueItem {
  id: string
  prompt: string
  negativePrompt?: string
  seed?: number
  aspectRatio: string
  resolution: string
  models: string[]
  imageCount: number
  attachments?: string[]
  labeledAttachments?: { label: string; images: string[] }[]
  presetSuffix?: string
  status: 'pending' | 'active' | 'completed' | 'failed' | 'cancelled'
  completedCount: number
  totalCount: number
  createdAt: number
  error?: string
  resultImageIds: string[]
}

interface QueueStore {
  items: QueueItem[]
  isProcessing: boolean

  addToQueue: (item: Omit<QueueItem, 'id' | 'status' | 'completedCount' | 'totalCount' | 'createdAt' | 'resultImageIds'>) => string
  removeFromQueue: (id: string) => void
  cancelItem: (id: string) => void
  clearCompleted: () => void
  updateItem: (id: string, updates: Partial<QueueItem>) => void
  startProcessing: () => void
  pauseProcessing: () => void
  loadFromDisk: () => Promise<void>
  persistToDisk: () => Promise<void>
}

const debouncedPersist = debounce((persist: () => Promise<void>) => {
  persist().catch((err) => logger.error('QueueStore', 'Persist failed', err))
}, 500)

export const useQueueStore = create<QueueStore>((set, get) => ({
  items: [],
  isProcessing: false,

  addToQueue: (item) => {
    const id = nanoid()
    const totalCount = item.models.length * item.imageCount
    set((state) => ({
      items: [...state.items, {
        ...item,
        id,
        status: 'pending',
        completedCount: 0,
        totalCount,
        createdAt: Date.now(),
        resultImageIds: [],
      }],
    }))
    debouncedPersist(get().persistToDisk)
    return id
  },

  removeFromQueue: (id) => {
    set((state) => ({
      items: state.items.filter((i) => i.id !== id),
    }))
    debouncedPersist(get().persistToDisk)
  },

  cancelItem: (id) => {
    set((state) => ({
      items: state.items.map((i) => i.id === id ? { ...i, status: 'cancelled' as const } : i),
    }))
    debouncedPersist(get().persistToDisk)
  },

  clearCompleted: () => {
    set((state) => ({
      items: state.items.filter((i) => i.status !== 'completed' && i.status !== 'failed' && i.status !== 'cancelled'),
    }))
    debouncedPersist(get().persistToDisk)
  },

  updateItem: (id, updates) => {
    set((state) => ({
      items: state.items.map((i) => i.id === id ? { ...i, ...updates } : i),
    }))
    debouncedPersist(get().persistToDisk)
  },

  startProcessing: () => set({ isProcessing: true }),
  pauseProcessing: () => set({ isProcessing: false }),

  loadFromDisk: async () => {
    try {
      const result = await window.api.listHistory()
      if (result.success && result.sessions) {
        const session = result.sessions.find((s) => s.id === 'queue')
        if (session) {
          const data = JSON.parse(session.data) as QueueItem[]
          // Reset any active items to pending on reload
          const items = data.map((i) => i.status === 'active' ? { ...i, status: 'pending' as const } : i)
          set({ items })
        }
      }
    } catch (err) {
      logger.warn('QueueStore', 'Failed to load queue from disk', err)
    }
  },

  persistToDisk: async () => {
    const items = get().items
    await window.api.saveHistory('queue', JSON.stringify(items))
  },
}))
