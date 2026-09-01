import { useCallback } from 'react'
import { Youtube } from 'lucide-react'
import { useThumbnailProjectsStore } from '../../stores/thumbnail-projects-store'
import { useGalleryStore, isThumbnailImage } from '../../stores/gallery-store'
import { useUiRecentsStore } from '../../stores/ui-recents-store'
import { SwitcherBar } from '../shared/SwitcherBar'

/**
 * The video axis of thumbnail mode, rendered through the shared switcher:
 * active video + recents as pills, everything else searchable behind ⌘P.
 * Thumbnails can still be dropped straight onto any pill or panel row.
 */
export function ProjectBar() {
  const projects = useThumbnailProjectsStore((s) => s.projects)
  const activeId = useThumbnailProjectsStore((s) => s.activeProjectId)
  const setActive = useThumbnailProjectsStore((s) => s.setActiveProject)
  const createProject = useThumbnailProjectsStore((s) => s.createProject)
  const updateProject = useThumbnailProjectsStore((s) => s.updateProject)
  const deleteProject = useThumbnailProjectsStore((s) => s.deleteProject)
  const images = useGalleryStore((s) => s.images)
  const moveToProject = useGalleryStore((s) => s.moveToProject)
  const recentIds = useUiRecentsStore((s) => s.recentProjectIds)
  const bumpProject = useUiRecentsStore((s) => s.bumpProject)

  // Only thumbnails count here — the rest of the gallery is a different mode.
  const done = images.filter((i) => !i.isLoading && !i.error && i.filePath && isThumbnailImage(i))
  const items = projects.map((p) => ({
    id: p.id,
    name: p.title,
    color: p.color,
    count: done.filter((i) => i.projectId === p.id).length,
  }))

  const handleSelect = useCallback(
    (id: string | null) => {
      setActive(id)
      if (id) bumpProject(id)
    },
    [setActive, bumpProject]
  )

  const handleDelete = useCallback(
    (id: string) => {
      // Thumbnails outlive their project — they fall back to "Alle Thumbnails".
      const store = useGalleryStore.getState()
      store.images.forEach((img) => {
        if (img.projectId === id) store.moveToProject(img.id, undefined)
      })
      deleteProject(id)
    },
    [deleteProject]
  )

  const handleDropImage = useCallback(
    (filePath: string, targetId: string | undefined) => {
      const img = useGalleryStore.getState().images.find((i) => i.filePath === filePath)
      if (img) {
        moveToProject(img.id, targetId)
        if (targetId) bumpProject(targetId)
      }
    },
    [moveToProject, bumpProject]
  )

  return (
    <SwitcherBar
      items={items}
      activeId={activeId}
      recentIds={recentIds}
      allLabel="Alle Thumbnails"
      allIcon={<Youtube className="w-3 h-3" />}
      allCount={done.length}
      entityLabel="Video"
      searchPlaceholder="Video suchen…"
      onSelect={handleSelect}
      onCreate={(title) => {
        const id = createProject(title)
        bumpProject(id)
      }}
      onRename={(id, title) => updateProject(id, { title })}
      onDelete={handleDelete}
      onDropImage={handleDropImage}
    />
  )
}
