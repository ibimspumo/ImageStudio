import { useCallback } from 'react'
import { useWorkspaceStore } from '../../stores/workspace-store'
import { useGalleryStore } from '../../stores/gallery-store'
import { useUiRecentsStore } from '../../stores/ui-recents-store'
import { SwitcherBar } from '../shared/SwitcherBar'

/**
 * The workspace axis of image and logo mode — the same switcher as the
 * thumbnail projects, so both organisation layers behave identically.
 */
export function WorkspaceBar() {
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const setActive = useWorkspaceStore((s) => s.setActiveWorkspace)
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace)
  const renameWorkspace = useWorkspaceStore((s) => s.renameWorkspace)
  const deleteWorkspace = useWorkspaceStore((s) => s.deleteWorkspace)
  const images = useGalleryStore((s) => s.images)
  const moveToWorkspace = useGalleryStore((s) => s.moveToWorkspace)
  const recentIds = useUiRecentsStore((s) => s.recentWorkspaceIds)
  const bumpWorkspace = useUiRecentsStore((s) => s.bumpWorkspace)

  const done = images.filter((i) => !i.isLoading && !i.error && i.filePath)
  const items = workspaces.map((w) => ({
    id: w.id,
    name: w.name,
    color: w.color,
    count: done.filter((i) => i.workspaceId === w.id).length,
  }))

  const handleSelect = useCallback(
    (id: string | null) => {
      setActive(id)
      if (id) bumpWorkspace(id)
    },
    [setActive, bumpWorkspace]
  )

  const handleDelete = useCallback(
    (id: string) => {
      // Images outlive their workspace — they fall back to "All".
      const store = useGalleryStore.getState()
      store.images.forEach((img) => {
        if (img.workspaceId === id) store.moveToWorkspace(img.id, undefined)
      })
      deleteWorkspace(id)
    },
    [deleteWorkspace]
  )

  const handleDropImage = useCallback(
    (filePath: string, targetId: string | undefined) => {
      const img = useGalleryStore.getState().images.find((i) => i.filePath === filePath)
      if (img) {
        moveToWorkspace(img.id, targetId)
        if (targetId) bumpWorkspace(targetId)
      }
    },
    [moveToWorkspace, bumpWorkspace]
  )

  return (
    <SwitcherBar
      items={items}
      activeId={activeId}
      recentIds={recentIds}
      allLabel="All"
      allCount={done.length}
      entityLabel="Workspace"
      searchPlaceholder="Workspace suchen…"
      onSelect={handleSelect}
      onCreate={(name) => {
        const id = createWorkspace(name)
        bumpWorkspace(id)
      }}
      onRename={renameWorkspace}
      onDelete={handleDelete}
      onDropImage={handleDropImage}
    />
  )
}
