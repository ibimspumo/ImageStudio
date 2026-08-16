import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { debounce } from '../lib/debounce'
import { logger } from '../lib/logger'

/**
 * A thumbnail project is one video: its title, optionally its angle, and the
 * thumbnails made for it. It is a second axis next to workspaces — workspaces
 * filter globally across every mode, projects only exist inside thumbnail mode,
 * so eight videos in progress never leak into normal image work.
 */
export interface ThumbnailProject {
  id: string
  /** The video title — goes into the prompt as context. */
  title: string
  /** The angle or hook of the video, optional. */
  angle?: string
  color: string
  /** The thumbnail the user settled on. */
  heroImageId?: string
  archived?: boolean
  createdAt: number
}

// Same palette as workspaces so the two bars read as one family.
const PROJECT_COLORS = [
  '#f87171', // red
  '#fb923c', // orange
  '#fbbf24', // amber
  '#34d399', // emerald
  '#60a5fa', // blue
  '#a78bfa', // purple
  '#e879f9', // fuchsia
  '#2dd4bf', // teal
]

interface ThumbnailProjectsStore {
  projects: ThumbnailProject[]
  /** null = "All thumbnails" */
  activeProjectId: string | null

  createProject: (title: string, angle?: string) => string
  updateProject: (id: string, patch: Partial<Omit<ThumbnailProject, 'id' | 'createdAt'>>) => void
  deleteProject: (id: string) => void
  setActiveProject: (id: string | null) => void
  getActiveProject: () => ThumbnailProject | null
  getNextColor: () => string
  loadFromDisk: () => Promise<void>
  persistToDisk: () => Promise<void>
}

const debouncedPersist = debounce((persist: () => Promise<void>) => {
  persist().catch((err) => logger.error('ThumbnailProjectsStore', 'Persist failed', err))
}, 500)

export const useThumbnailProjectsStore = create<ThumbnailProjectsStore>((set, get) => ({
  projects: [],
  activeProjectId: null,

  createProject: (title, angle) => {
    const id = nanoid()
    const project: ThumbnailProject = {
      id,
      title,
      angle: angle?.trim() || undefined,
      color: get().getNextColor(),
      createdAt: Date.now(),
    }
    set((state) => ({
      projects: [...state.projects, project],
      activeProjectId: id,
    }))
    debouncedPersist(get().persistToDisk)
    return id
  },

  updateProject: (id, patch) => {
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }))
    debouncedPersist(get().persistToDisk)
  },

  deleteProject: (id) => {
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
    }))
    debouncedPersist(get().persistToDisk)
  },

  setActiveProject: (id) => set({ activeProjectId: id }),

  getActiveProject: () => {
    const { projects, activeProjectId } = get()
    if (!activeProjectId) return null
    return projects.find((p) => p.id === activeProjectId) ?? null
  },

  getNextColor: () => {
    const used = get().projects.map((p) => p.color)
    const available = PROJECT_COLORS.filter((c) => !used.includes(c))
    if (available.length > 0) return available[0]
    return PROJECT_COLORS[get().projects.length % PROJECT_COLORS.length]
  },

  loadFromDisk: async () => {
    try {
      const result = await window.api.listHistory()
      if (result.success && result.sessions) {
        const session = result.sessions.find((s) => s.id === 'thumbnail-projects')
        if (session) {
          const data = JSON.parse(session.data) as ThumbnailProject[]
          set({ projects: data })
        }
      }
    } catch (err) {
      logger.warn('ThumbnailProjectsStore', 'Failed to load from disk (may be first launch)', err)
    }
  },

  persistToDisk: async () => {
    await window.api.saveHistory('thumbnail-projects', JSON.stringify(get().projects))
  },
}))
