export const PROJECTS_SORT_OPTIONS = ['created-desc', 'created-asc', 'updated-desc', 'name-asc'] as const
export type ProjectsSort = typeof PROJECTS_SORT_OPTIONS[number]

type Organization = { id: string; createdAt: number; name?: string; title?: string }
type OrganizationMedia = { timestamp: number; workspaceId?: string; projectId?: string }

/** Activity derives from retained media creation times, not billing or rename events. */
export function sortOrganizations<T extends Organization>(
  items: readonly T[], sort: ProjectsSort, images: readonly OrganizationMedia[], grouping: 'workspaceId' | 'projectId',
): T[] {
  const latest = new Map(items.map(item => [item.id, item.createdAt]))
  if (sort === 'updated-desc') {
    for (const image of images) {
      const id = image[grouping]
      if (id && latest.has(id)) latest.set(id, Math.max(latest.get(id)!, image.timestamp))
    }
  }
  return [...items].sort((a, b) => {
    const difference = sort === 'created-asc' ? a.createdAt - b.createdAt
      : sort === 'updated-desc' ? latest.get(b.id)! - latest.get(a.id)!
      : sort === 'name-asc' ? (a.name ?? a.title ?? '').localeCompare(b.name ?? b.title ?? '', 'de', { numeric: true, sensitivity: 'base' })
      : b.createdAt - a.createdAt
    return difference || b.createdAt - a.createdAt
  })
}
