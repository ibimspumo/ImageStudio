import { create } from 'zustand'
import { nanoid } from 'nanoid'

export interface Workspace {
  id: string
  name: string
  color: string
  createdAt: number
}

// Curated palette — muted tones that feel at home in the dark UI
const WORKSPACE_COLORS = [
  '#a78bfa', // purple (accent)
  '#60a5fa', // blue
  '#34d399', // emerald
  '#fbbf24', // amber
  '#f87171', // red
  '#fb923c', // orange
  '#e879f9', // fuchsia
  '#2dd4bf', // teal
]

interface WorkspaceStore {
  workspaces: Workspace[]
  activeWorkspaceId: string | null // null = "All"

  createWorkspace: (name: string) => string
  renameWorkspace: (id: string, name: string) => void
  deleteWorkspace: (id: string) => void
  setActiveWorkspace: (id: string | null) => void
  getNextColor: () => string
  loadFromDisk: () => Promise<void>
  persistToDisk: () => Promise<void>
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,

  createWorkspace: (name) => {
    const id = nanoid()
    const color = get().getNextColor()
    const workspace: Workspace = {
      id,
      name,
      color,
      createdAt: Date.now(),
    }
    set((state) => ({
      workspaces: [...state.workspaces, workspace],
      activeWorkspaceId: id,
    }))
    setTimeout(() => get().persistToDisk(), 100)
    return id
  },

  renameWorkspace: (id, name) => {
    set((state) => ({
      workspaces: state.workspaces.map((w) =>
        w.id === id ? { ...w, name } : w
      ),
    }))
    setTimeout(() => get().persistToDisk(), 100)
  },

  deleteWorkspace: (id) => {
    set((state) => ({
      workspaces: state.workspaces.filter((w) => w.id !== id),
      activeWorkspaceId: state.activeWorkspaceId === id ? null : state.activeWorkspaceId,
    }))
    setTimeout(() => get().persistToDisk(), 100)
  },

  setActiveWorkspace: (id) => {
    set({ activeWorkspaceId: id })
  },

  getNextColor: () => {
    const used = get().workspaces.map((w) => w.color)
    const available = WORKSPACE_COLORS.filter((c) => !used.includes(c))
    if (available.length > 0) return available[0]
    return WORKSPACE_COLORS[get().workspaces.length % WORKSPACE_COLORS.length]
  },

  loadFromDisk: async () => {
    try {
      const result = await window.api.listHistory()
      if (result.success && result.sessions) {
        const session = result.sessions.find((s) => s.id === 'workspaces')
        if (session) {
          const data = JSON.parse(session.data) as Workspace[]
          set({ workspaces: data })
        }
      }
    } catch {
      // silent
    }
  },

  persistToDisk: async () => {
    const workspaces = get().workspaces
    await window.api.saveHistory('workspaces', JSON.stringify(workspaces))
  },
}))
