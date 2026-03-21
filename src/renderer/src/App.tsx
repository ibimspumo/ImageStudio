import { useEffect, useState } from 'react'
import { useSettingsStore } from './stores/settings-store'
import { useGalleryStore, type GalleryImage, toDisplayUrl } from './stores/gallery-store'
import { useCollectionsStore } from './stores/collections-store'
import { useChatStore } from './stores/chat-store'
import { useWorkspaceStore } from './stores/workspace-store'
import { useCropStore } from './stores/crop-store'
import { ErrorBoundary } from './components/shared/ErrorBoundary'
import { TitleBar } from './components/layout/TitleBar'
import { MainContent } from './components/layout/MainContent'
import { SettingsDialog } from './components/shared/SettingsDialog'
import { ImageViewer } from './components/shared/ImageViewer'
import { CropModal } from './components/shared/CropModal'
import { CollectionsDialog } from './components/collections/CollectionsDialog'
import { ChatView } from './components/chat/ChatView'

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
  const apiKey = useSettingsStore((s) => s.apiKey)
  const [showSettings, setShowSettings] = useState(false)
  const [showCollections, setShowCollections] = useState(false)
  const [viewerState, setViewerState] = useState<ViewerState | null>(null)
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [chatInitialModel, setChatInitialModel] = useState<string | undefined>(undefined)
  const [cropState, setCropState] = useState<CropState | null>(null)

  const startChat = useChatStore((s) => s.startChat)
  const addPendingRef = useCropStore((s) => s.addPendingRef)
  const setPendingReuse = useCropStore((s) => s.setPendingReuse)

  useEffect(() => {
    // Run migration first, then load stores
    window.api.migrate().catch(() => {}).finally(() => {
      hydrate()
      loadGallery()
      loadCollections()
      loadChats()
      loadWorkspaces()
    })
  }, [hydrate, loadGallery, loadCollections, loadChats, loadWorkspaces])

  useEffect(() => {
    if (useSettingsStore.getState().hydrated && !apiKey) {
      setShowSettings(true)
    }
  }, [apiKey])

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
    setActiveChatId(chatId)
    setViewerState(null)
  }

  const handleOpenChat = (chatId: string) => {
    const chat = useChatStore.getState().chats.find((c) => c.id === chatId)
    if (chat) {
      const sourceImage = useGalleryStore.getState().images.find((i) => i.id === chat.sourceImageId)
      setChatInitialModel(sourceImage?.model)
    }
    setActiveChatId(chatId)
    setViewerState(null)
  }

  const handleReusePrompt = (image: GalleryImage) => {
    setPendingReuse(image.prompt, image.attachments)
    setViewerState(null)
  }

  const handleCropImage = (imageId: string, filePath: string) => {
    setCropState({ imageId, filePath })
    setViewerState(null)
  }

  const handleCropConfirm = (croppedBase64: string, sourceImageId: string) => {
    addPendingRef(croppedBase64, sourceImageId)
    setCropState(null)
  }

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
          />
        )}
        {activeChatId && (
          <ChatView
            chatId={activeChatId}
            onClose={() => setActiveChatId(null)}
            initialModel={chatInitialModel}
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
      </div>
    </div>
    </ErrorBoundary>
  )
}
