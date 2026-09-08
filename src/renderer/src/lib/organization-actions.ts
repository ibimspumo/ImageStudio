import { useGalleryStore } from '../stores/gallery-store'
import { useWorkspaceStore } from '../stores/workspace-store'
import { useThumbnailProjectsStore } from '../stores/thumbnail-projects-store'

/** Remove only the organization entry; all media and files remain in the gallery. */
export async function deleteWorkspaceRetainingMedia(id: string): Promise<void> {
  const store = useWorkspaceStore.getState()
  if (!store.workspaces.some((item) => item.id === id)) throw new Error('Arbeitsordner wurde nicht gefunden.')
  const gallery = useGalleryStore.getState()
  gallery.images.filter((image) => image.workspaceId === id).forEach((image) => gallery.moveToWorkspace(image.id, undefined))
  store.deleteWorkspace(id)
  await Promise.all([gallery.persistToDisk(), store.persistToDisk()])
}

export async function deleteProjectRetainingMedia(id: string): Promise<void> {
  const store = useThumbnailProjectsStore.getState()
  if (!store.projects.some((item) => item.id === id)) throw new Error('Videoprojekt wurde nicht gefunden.')
  const gallery = useGalleryStore.getState()
  gallery.images.filter((image) => image.projectId === id).forEach((image) => gallery.moveToProject(image.id, undefined))
  store.deleteProject(id)
  await Promise.all([gallery.persistToDisk(), store.persistToDisk()])
}
