import { create } from 'zustand'
import type { ProjectsSort } from '../../../shared/organization'
export type { ProjectsSort } from '../../../shared/organization'

export type ProjectsLayout = 'grid' | 'list'

interface ProjectsViewState {
  layout: ProjectsLayout
  sort: ProjectsSort
  setSort: (sort: ProjectsSort) => void
  setLayout: (layout: ProjectsLayout) => void
}

/** Shared UI/MCP presentation state, retained while navigating during this session. */
export const useProjectsViewStore = create<ProjectsViewState>((set) => ({
  layout: 'grid',
  sort: 'created-desc',
  setSort: (sort) => set({ sort }),
  setLayout: (layout) => set({ layout }),
}))
