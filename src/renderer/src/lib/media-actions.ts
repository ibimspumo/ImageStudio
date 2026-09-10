import { getPrintFormat, type PrintFormat } from '../../../shared/print-prompt'
import { useSettingsStore } from '../stores/settings-store'
import { nanoid } from 'nanoid'
import { useGalleryStore, toDisplayUrl, type GalleryImage } from '../stores/gallery-store'
import { useWorkspaceStore } from '../stores/workspace-store'
import { useThumbnailProjectsStore } from '../stores/thumbnail-projects-store'
import { getResolutionLabel } from './image-utils'

function aspectRatio(width: number, height: number): string {
  if (!width || !height) return '1:1'
  const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a
  const divisor = gcd(width, height)
  return `${width / divisor}:${height / divisor}`
}

async function videoMetadata(filePath: string): Promise<{ width: number; height: number; duration?: number; thumbnail?: string }> {
  const video = document.createElement('video')
  video.muted = true
  video.preload = 'auto'
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { reject(new Error('Video preview timed out')) }, 15_000)
      video.onloadeddata = () => { clearTimeout(timer); resolve() }
      video.onerror = () => { clearTimeout(timer); reject(new Error('Video cannot be decoded by this app')) }
      video.src = toDisplayUrl(filePath)
    })
    const canvas = document.createElement('canvas')
    const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight))
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
    canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height)
    return { width: video.videoWidth, height: video.videoHeight, duration: Number.isFinite(video.duration) ? video.duration : undefined, thumbnail: canvas.toDataURL('image/jpeg', 0.85) }
  } finally {
    video.onloadeddata = null
    video.onerror = null
    video.removeAttribute('src')
    video.load()
  }
}

/** The single import action for the app and MCP. Imported originals are preserved. */
export async function importMediaToGallery(options: {
  source: string; name?: string; workspaceId?: string; projectId?: string; importMode?: 'print'; printFormat?: PrintFormat
}): Promise<GalleryImage> {
  if (options.importMode !== undefined && options.importMode !== 'print') throw new Error('Import mode must be print or omitted for ordinary media.')
  if (options.printFormat !== undefined && options.importMode !== 'print') throw new Error('printFormat requires importMode: print.')
  const printFormat = options.importMode === 'print' ? options.printFormat ?? useSettingsStore.getState().defaultPrintFormat : undefined
  if (printFormat) getPrintFormat(printFormat)
  const source = options.source.trim()
  if (!source) throw new Error('Enter a local media path or an HTTP(S) media URL.')
  const workspaceId = options.workspaceId === undefined ? useWorkspaceStore.getState().activeWorkspaceId ?? undefined : options.workspaceId || undefined
  const projectId = options.projectId || undefined
  if (workspaceId && !useWorkspaceStore.getState().workspaces.some(item => item.id === workspaceId)) throw new Error('Workspace not found')
  if (projectId && !useThumbnailProjectsStore.getState().projects.some(item => item.id === projectId)) throw new Error('Thumbnail project not found')
  const imported = await window.api.automationImportMedia({ source, name: options.name })
  if (options.importMode === 'print' && imported.kind !== 'image') throw new Error('Print imports require an image. Import videos from the media library or Video mode.')
  let width = imported.width ?? 0
  let height = imported.height ?? 0
  let videoDuration: number | undefined
  let videoThumbnailPath: string | undefined
  if (imported.kind === 'video') {
    // A video can still be exported if this Electron build lacks its codec.
    try {
      const metadata = await videoMetadata(imported.filePath)
      width = metadata.width
      height = metadata.height
      videoDuration = metadata.duration
      if (metadata.thumbnail) {
        const saved = await window.api.saveImage(metadata.thumbnail, `${nanoid()}-preview.jpg`)
        videoThumbnailPath = saved.filePath
      }
    } catch { /* Keep original available; clients may support additional codecs. */ }
  }
  const image: GalleryImage = {
    id: nanoid(), filePath: imported.filePath, prompt: options.name?.trim() || imported.name,
    model: 'imported', type: imported.kind, timestamp: Date.now(), workspaceId, projectId,
    width: width || undefined, height: height || undefined, mimeType: imported.mimeType,
    ...(options.importMode === 'print' ? { isPrint: true, printFormat } : {}),
    aspectRatio: aspectRatio(width, height),
    resolution: height ? imported.kind === 'video' ? `${height}p` : getResolutionLabel(width, height) : 'Original',
    videoDuration, videoThumbnailPath,
  }
  useGalleryStore.setState(state => ({ images: [image, ...state.images] }))
  await useGalleryStore.getState().persistToDisk()
  return image
}
