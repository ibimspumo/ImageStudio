import { useEffect, useState } from 'react'
import { useSettingsStore } from './stores/settings-store'
import { useGalleryStore, type GalleryImage } from './stores/gallery-store'
import { useCollectionsStore } from './stores/collections-store'
import { useChatStore } from './stores/chat-store'
import { MainContent } from './components/layout/MainContent'
import { SettingsDialog } from './components/shared/SettingsDialog'
import { ImageViewer } from './components/shared/ImageViewer'
import { CollectionsDialog } from './components/collections/CollectionsDialog'
import { ChatView } from './components/chat/ChatView'

interface ViewerState {
  images: GalleryImage[]
  index: number
}

export default function App() {
  const hydrate = useSettingsStore((s) => s.hydrate)
  const loadGallery = useGalleryStore((s) => s.loadFromDisk)
  const loadCollections = useCollectionsStore((s) => s.loadFromDisk)
  const loadChats = useChatStore((s) => s.loadFromDisk)
  const apiKey = useSettingsStore((s) => s.apiKey)
  const [showSettings, setShowSettings] = useState(false)
  const [showCollections, setShowCollections] = useState(false)
  const [viewerState, setViewerState] = useState<ViewerState | null>(null)
  const [activeChatId, setActiveChatId] = useState<string | null>(null)

  const startChat = useChatStore((s) => s.startChat)

  useEffect(() => {
    hydrate()
    loadGallery()
    loadCollections()
    loadChats()
  }, [hydrate, loadGallery, loadCollections, loadChats])

  useEffect(() => {
    if (useSettingsStore.getState().hydrated && !apiKey) {
      setShowSettings(true)
    }
  }, [apiKey])

  const handleImageClick = (images: GalleryImage[], index: number) => {
    setViewerState({ images, index })
  }

  const handleStartChat = (imageId: string) => {
    // Find the image in gallery
    const images = useGalleryStore.getState().images
    const image = images.find((img) => img.id === imageId)
    if (!image || !image.base64DataUrl) return

    // Create a new chat from this image
    const chatId = startChat(image.id, image.base64DataUrl, image.prompt)
    setActiveChatId(chatId)
    setViewerState(null)
  }

  const handleReusePrompt = (_image: GalleryImage) => {
    setViewerState(null)
  }

  return (
    <>
      <div className="flex flex-col h-screen bg-surface-0 overflow-hidden">
        <div className="drag-region fixed top-0 left-0 right-0 h-12 z-30" />
        <MainContent
          onImageClick={handleImageClick}
          onSettingsClick={() => setShowSettings(true)}
          onCollectionsClick={() => setShowCollections(true)}
          onStartChat={handleStartChat}
        />
      </div>

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
        />
      )}
      {activeChatId && (
        <ChatView
          chatId={activeChatId}
          onClose={() => setActiveChatId(null)}
        />
      )}
    </>
  )
}
