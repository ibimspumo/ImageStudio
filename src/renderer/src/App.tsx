import { useEffect, useRef, useState } from 'react'
import { useAutomationBridge } from './automation/useAutomationBridge'
import { useSettingsStore } from './stores/settings-store'
import { useGalleryStore, type GalleryImage, toDisplayUrl } from './stores/gallery-store'
import { useCollectionsStore } from './stores/collections-store'
import { useChatStore } from './stores/chat-store'
import { useWorkspaceStore } from './stores/workspace-store'
import { useCropStore } from './stores/crop-store'
import { usePresetsStore } from './stores/presets-store'
import { useQueueStore } from './stores/queue-store'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { ErrorBoundary } from './components/shared/ErrorBoundary'
import { TitleBar } from './components/layout/TitleBar'
import { MainContent, type AppMode } from './components/layout/MainContent'
import { SettingsDialog } from './components/shared/SettingsDialog'
import { ImageViewer } from './components/shared/ImageViewer'
import { CropModal } from './components/shared/CropModal'
import { CollectionsDialog } from './components/collections/CollectionsDialog'
import { ChatView } from './components/chat/ChatView'
import { PresetsDialog } from './components/presets/PresetsDialog'
import { ShortcutsHelp } from './components/shared/ShortcutsHelp'
import { ImageCompare } from './components/shared/ImageCompare'
import { InpaintModal } from './components/shared/InpaintModal'
import { QueuePanel } from './components/queue/QueuePanel'
import { CanvasModal } from './components/canvas/CanvasModal'
import { useCanvasStore } from './stores/canvas-store'
import { ThumbnailPreviewModal } from './components/thumbnail/ThumbnailPreviewModal'
import { useThumbnailProjectsStore } from './stores/thumbnail-projects-store'
import { useThumbnailMetaPromptsStore } from './stores/thumbnail-meta-prompts-store'
import { useUiRecentsStore } from './stores/ui-recents-store'

interface ViewerState {
  images: GalleryImage[]
  index: number
}

interface CropState {
  imageId: string
  filePath: string
}

export default function App() {
  const hydrate = useSettingsStore((s) => s.hydrate)
  const loadGallery = useGalleryStore((s) => s.loadFromDisk)
  const loadCollections = useCollectionsStore((s) => s.loadFromDisk)
  const loadChats = useChatStore((s) => s.loadFromDisk)
  const loadWorkspaces = useWorkspaceStore((s) => s.loadFromDisk)
  const loadPresets = usePresetsStore((s) => s.loadFromDisk)
  const loadQueue = useQueueStore((s) => s.loadFromDisk)
  const loadThumbnailProjects = useThumbnailProjectsStore((s) => s.loadFromDisk)
  const loadThumbnailMetaPrompts = useThumbnailMetaPromptsStore((s) => s.loadFromDisk)
  const loadUiRecents = useUiRecentsStore((s) => s.loadFromDisk)
  const queuePendingCount = useQueueStore((s) => s.items.filter(i => i.status === 'pending').length)
  const hydrationPromise = useRef<Promise<void> | null>(null)
  const [automationReady, setAutomationReady] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showCollections, setShowCollections] = useState(false)
  const [viewerState, setViewerState] = useState<ViewerState | null>(null)
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [chatInitialModel, setChatInitialModel] = useState<string | undefined>(undefined)
  // Format of the image a chat was opened from — the chat starts out matching it.
  const [chatInitialFormat, setChatInitialFormat] = useState<{ aspectRatio?: string; resolution?: string }>({})
  const [cropState, setCropState] = useState<CropState | null>(null)
  const [showPresets, setShowPresets] = useState(false)
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false)
  const [showQueue, setShowQueue] = useState(false)
  const [appMode, setAppMode] = useState<AppMode>('image')
  const [videoStartFrame, setVideoStartFrame] = useState<{ base64: string; name: string } | null>(null)
  const [compareState, setCompareState] = useState<[GalleryImage, GalleryImage] | null>(null)
  const [inpaintState, setInpaintState] = useState<GalleryImage | null>(null)
  const [thumbnailPreview, setThumbnailPreview] = useState<ViewerState | null>(null)
  const showCanvas = useCanvasStore((s) => s.isOpen)
  const openCanvas = useCanvasStore((s) => s.open)

  const startChat = useChatStore((s) => s.startChat)
  const addPendingRef = useCropStore((s) => s.addPendingRef)
  const setPendingReuse = useCropStore((s) => s.setPendingReuse)

  useEffect(() => {
    let cancelled = false
    // Automation must not race startup hydration and overwrite persisted data.
    hydrationPromise.current ??= window.api.migrate().catch(() => {}).then(async () => {
      await Promise.all([hydrate(), loadGallery(), loadCollections(), loadChats(),
        loadWorkspaces(), loadPresets(), loadQueue(), loadThumbnailProjects(),
        loadThumbnailMetaPrompts(), loadUiRecents()])
    })
    void hydrationPromise.current.then(() => {
      if (!cancelled) setAutomationReady(true)
    })
    return () => { cancelled = true }
  }, [hydrate, loadGallery, loadCollections, loadChats, loadWorkspaces, loadPresets, loadQueue, loadThumbnailProjects, loadThumbnailMetaPrompts, loadUiRecents])

  const falApiKey = useSettingsStore((s) => s.falApiKey)
  const hydrated = useSettingsStore((s) => s.hydrated)

  useEffect(() => {
    if (hydrated && !falApiKey) {
      setShowSettings(true)
    }
  }, [hydrated, falApiKey])

  const handleImageClick = (images: GalleryImage[], index: number) => {
    setViewerState({ images, index })
  }

  const handleStartChat = (imageId: string) => {
    const images = useGalleryStore.getState().images
    const image = images.find((img) => img.id === imageId)
    if (!image || !image.filePath) return

    if (image.chatId) {
      const existingChat = useChatStore.getState().chats.find((c) => c.id === image.chatId)
      if (existingChat) {
        setChatInitialModel(image.model)
        setChatInitialFormat({ aspectRatio: image.aspectRatio, resolution: image.resolution })
        setActiveChatId(image.chatId)
        setViewerState(null)
        return
      }
    }

    const chatId = startChat(image.id, image.filePath, image.prompt)
    useGalleryStore.setState((state) => ({
      images: state.images.map((i) => i.id === imageId ? { ...i, chatId } : i)
    }))
    setChatInitialModel(image.model)
    setChatInitialFormat({ aspectRatio: image.aspectRatio, resolution: image.resolution })
    setActiveChatId(chatId)
    setViewerState(null)
  }

  const handleOpenChat = (chatId: string) => {
    const chat = useChatStore.getState().chats.find((c) => c.id === chatId)
    if (chat) {
      const sourceImage = useGalleryStore.getState().images.find((i) => i.id === chat.sourceImageId)
      setChatInitialModel(sourceImage?.model)
      setChatInitialFormat({
        aspectRatio: sourceImage?.aspectRatio,
        resolution: sourceImage?.resolution,
      })
    }
    setActiveChatId(chatId)
    setViewerState(null)
  }

  const handleReusePrompt = (image: GalleryImage) => {
    setPendingReuse(image.prompt, image.attachments, image.negativePrompt, image.seed)
    setViewerState(null)
  }

  const handleInpaint = (imageId: string, filePath: string) => {
    const img = useGalleryStore.getState().images.find((i) => i.id === imageId)
    if (img) {
      setInpaintState(img)
      setViewerState(null)
    }
  }

  const handleCompare = (image: GalleryImage) => {
    // Find parent image via attachments (upscale, zoom out, inpaint all store source filePath)
    const allImgs = useGalleryStore.getState().images
    let parent: GalleryImage | undefined

    // Try inpaintSourceId first
    if (image.inpaintSourceId) {
      parent = allImgs.find(i => i.id === image.inpaintSourceId)
    }

    // Fallback: first attachment file path matches a gallery image
    if (!parent && image.attachments?.length) {
      parent = allImgs.find(i => i.filePath === image.attachments![0] && i.id !== image.id)
    }

    // Canvas sketch: create a pseudo gallery image for comparison
    if (!parent && image.canvasSketchPath) {
      parent = {
        id: `canvas-sketch-${image.id}`,
        filePath: image.canvasSketchPath,
        prompt: 'Canvas Sketch',
        aspectRatio: image.aspectRatio,
        resolution: image.resolution,
        timestamp: image.timestamp,
        model: 'sketch',
      }
    }

    if (parent) {
      setCompareState([parent, image])
      setViewerState(null)
    }
  }

  const handleGenerateVideo = async (imageId: string) => {
    const images = useGalleryStore.getState().images
    const image = images.find((img) => img.id === imageId)
    if (!image?.filePath) return

    try {
      const result = await window.api.readImage(image.filePath)
      if (result.success && result.base64DataUrl) {
        const name = image.filePath.split(/[/\\]/).pop() || 'image'
        setVideoStartFrame({ base64: result.base64DataUrl, name })
        setAppMode('video')
        setViewerState(null)
      }
    } catch {
      // silently fail
    }
  }

  const handleCropImage = (imageId: string, filePath: string) => {
    setCropState({ imageId, filePath })
    setViewerState(null)
  }

  const handleCropConfirm = (croppedBase64: string, sourceImageId: string) => {
    addPendingRef(croppedBase64, sourceImageId)
    setCropState(null)
  }

  useAutomationBridge(automationReady, {
    getView: () => ({ mode: appMode, viewerImageId: viewerState?.images[viewerState.index]?.id, chatId: activeChatId, settingsOpen: showSettings, collectionsOpen: showCollections, presetsOpen: showPresets, queueOpen: showQueue, canvasOpen: showCanvas, cropImageId: cropState?.imageId, inpaintImageId: inpaintState?.id, thumbnailPreviewImageId: thumbnailPreview?.images[thumbnailPreview.index]?.id }),
    navigate: (target, id) => {
      if (['image', 'logo', 'thumbnail', 'video'].includes(target)) setAppMode(target as AppMode)
      else if (target === 'settings') setShowSettings(true)
      else if (target === 'collections') setShowCollections(true)
      else if (target === 'presets') setShowPresets(true)
      else if (target === 'queue') setShowQueue(true)
      else if (target === 'canvas') openCanvas()
      else if (target === 'close_panels') {
        setShowSettings(false); setShowCollections(false); setShowPresets(false); setShowQueue(false)
        setViewerState(null); setActiveChatId(null); setCropState(null); setInpaintState(null)
        setCompareState(null); setThumbnailPreview(null); useCanvasStore.getState().close()
      }
      else if (['crop', 'inpaint', 'compare', 'reuse_prompt'].includes(target) && id) {
        const image = useGalleryStore.getState().images.find(image => image.id === id)
        if (!image || !image.filePath || image.type === 'video') throw new Error('A completed image is required')
        if (target === 'crop') handleCropImage(image.id, image.filePath)
        if (target === 'inpaint') handleInpaint(image.id, image.filePath)
        if (target === 'compare') handleCompare(image)
        if (target === 'reuse_prompt') handleReusePrompt(image)
      }
      else if (target === 'chat' && id) handleOpenChat(id)
      else if ((target === 'viewer' || target === 'thumbnail_preview') && id) {
        const images = useGalleryStore.getState().images
        const index = images.findIndex(image => image.id === id)
        if (index >= 0) {
          if (target === 'viewer') setViewerState({ images, index })
          else setThumbnailPreview({ images, index })
        }
      }
    },
  })

  useKeyboardShortcuts({
    showShortcutsHelp: () => setShowShortcutsHelp(prev => !prev),
  })

  return (
    <ErrorBoundary>
    <div className="flex flex-col h-screen bg-surface-0 overflow-hidden">
      <TitleBar />
      <div className="flex-1 flex flex-col min-h-0 relative">
        <MainContent
          onImageClick={handleImageClick}
          onSettingsClick={() => setShowSettings(true)}
          onCollectionsClick={() => setShowCollections(true)}
          onStartChat={handleStartChat}
          onCropImage={handleCropImage}
          onPresetsManage={() => setShowPresets(true)}
          onQueueClick={() => setShowQueue(true)}
          queuePendingCount={queuePendingCount}
          onCanvasClick={openCanvas}
          mode={appMode}
          onModeChange={(m) => {
            setAppMode(m)
            if (m === 'image') setVideoStartFrame(null)
          }}
          videoStartFrame={videoStartFrame}
          onGenerateVideo={handleGenerateVideo}
          onPreviewThumbnail={(images, index) => setThumbnailPreview({ images, index })}
        />
        {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
        {showCollections && <CollectionsDialog onClose={() => setShowCollections(false)} />}
        {viewerState && (
          <ImageViewer
            images={viewerState.images}
            currentIndex={viewerState.index}
            onClose={() => setViewerState(null)}
            onNavigate={(index) => setViewerState((prev) => prev ? { ...prev, index } : null)}
            onStartChat={handleStartChat}
            onReusePrompt={handleReusePrompt}
            onOpenChat={handleOpenChat}
            onCropImage={handleCropImage}
            onInpaint={handleInpaint}
            onCompare={handleCompare}
          />
        )}
        {activeChatId && (
          <ChatView
            // Remount per chat so model and format re-derive from the new source.
            key={activeChatId}
            chatId={activeChatId}
            onClose={() => setActiveChatId(null)}
            initialModel={chatInitialModel}
            initialAspectRatio={chatInitialFormat.aspectRatio}
            initialResolution={chatInitialFormat.resolution}
          />
        )}
        {cropState && (
          <CropModal
            imageSrc={toDisplayUrl(cropState.filePath)}
            sourceImageId={cropState.imageId}
            onCrop={handleCropConfirm}
            onClose={() => setCropState(null)}
          />
        )}
        {showPresets && (
          <PresetsDialog onClose={() => setShowPresets(false)} />
        )}
        {showShortcutsHelp && (
          <ShortcutsHelp onClose={() => setShowShortcutsHelp(false)} />
        )}
        {compareState && (
          <ImageCompare
            imageA={compareState[0]}
            imageB={compareState[1]}
            onClose={() => setCompareState(null)}
          />
        )}
        {inpaintState && (
          <InpaintModal
            imageId={inpaintState.id}
            filePath={inpaintState.filePath}
            prompt={inpaintState.prompt}
            model={inpaintState.model}
            aspectRatio={inpaintState.aspectRatio}
            resolution={inpaintState.resolution}
            workspaceId={inpaintState.workspaceId}
            onClose={() => setInpaintState(null)}
          />
        )}
        {showQueue && (
          <QueuePanel onClose={() => setShowQueue(false)} />
        )}
        {thumbnailPreview && (
          <ThumbnailPreviewModal
            images={thumbnailPreview.images}
            index={thumbnailPreview.index}
            onNavigate={(index) => setThumbnailPreview((prev) => prev ? { ...prev, index } : null)}
            onClose={() => setThumbnailPreview(null)}
          />
        )}
        {showCanvas && <CanvasModal />}
      </div>
    </div>
    </ErrorBoundary>
  )
}
