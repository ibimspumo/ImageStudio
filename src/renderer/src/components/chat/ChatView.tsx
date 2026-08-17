import { useState, useRef, useEffect, useCallback, memo } from 'react'
import {
  ArrowLeft,
  X,
  Send,
  ImagePlus,
  AlertCircle,
  Clock,
  Link2,
  Cpu
} from 'lucide-react'
import { useChatStore, type ChatMessage } from '../../stores/chat-store'
import { toDisplayUrl } from '../../stores/gallery-store'
import { useChatGeneration } from '../../hooks/useChatGeneration'
import { useMentionEditor } from '../../hooks/useMentionEditor'
import { SimpleLightbox } from '../shared/SimpleLightbox'
import { useSettingsStore } from '../../stores/settings-store'
import { AspectRatioSelector } from '../input/AspectRatioSelector'
import { QualitySelector } from '../input/QualitySelector'
import { ResolutionSelector } from '../input/ResolutionSelector'
import { ModelSelector } from '../input/ModelSelector'
import { AttachmentStrip } from '../input/AttachmentStrip'
import { MentionPopup } from '../input/MentionPopup'
import { CostEstimate } from '../input/CostEstimate'
import type { AspectRatio, Resolution, GptImageQuality } from '../../types/api'
import { getModelName, getCombinedCapabilities, normalizeModelId, DEFAULT_MODEL } from '../../types/api'
import { cn } from '../../lib/utils'
import { formatDuration, formatTime } from '../../lib/date-utils'

interface ChatViewProps {
  chatId: string
  onClose: () => void
  initialModel?: string
  /**
   * Format of the image the chat started from. An edit of a 9:16 image should
   * stay 9:16 unless the user says otherwise — defaulting to 1:1 silently
   * reframed every vertical source.
   */
  initialAspectRatio?: string
  initialResolution?: string
}

const ASPECT_RATIOS: AspectRatio[] = [
  'auto', '1:1', '16:9', '9:16', '4:3', '3:4', '2:3', '3:2', '5:4', '4:5',
  '21:9', '4:1', '1:4', '8:1', '1:8',
]
const RESOLUTIONS: Resolution[] = ['0.5K', '1K', '2K', '4K']

const MessageBubble = memo(function MessageBubble({ message, allImages, onImageClick }: { message: ChatMessage; allImages: string[]; onImageClick?: (images: string[], index: number) => void }) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex flex-col items-end gap-2 animate-fade-up">
        {/* User attachments (small thumbnails) */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex gap-1.5 flex-wrap justify-end">
            {message.attachments.map((att, i) => (
              <img
                key={i}
                src={toDisplayUrl(att)}
                alt="Reference"
                className="w-12 h-12 rounded-lg object-cover border border-border-dim"
              />
            ))}
          </div>
        )}

        {message.content && (
          <div className="max-w-[75%] bg-surface-3 rounded-2xl rounded-br-md px-4 py-2.5">
            <p className="text-[14px] text-text-primary leading-relaxed">{message.content}</p>
          </div>
        )}

        <span className="text-[10px] text-text-muted px-1">{formatTime(message.timestamp)}</span>
      </div>
    )
  }

  // Assistant message
  return (
    <div className="flex flex-col items-start gap-2 animate-fade-up">
      {message.isLoading && (
        <div className="w-full max-w-md">
          <div className="skeleton aspect-square rounded-2xl" />
        </div>
      )}

      {message.imageFilePath && (() => {
        const filePath = message.imageFilePath
        const displayUrl = toDisplayUrl(filePath)
        return (
        <div
          className="w-full max-w-md cursor-pointer"
          onClick={() => {
            if (onImageClick) {
              const idx = allImages.indexOf(displayUrl)
              onImageClick(allImages, idx >= 0 ? idx : 0)
            }
          }}
        >
          <img
            src={displayUrl}
            alt="Generated"
            className="w-full rounded-2xl border border-border-dim hover:border-border-base transition-colors"
          />
        </div>
        )
      })()}

      {message.error && (
        <div className="inline-flex items-center gap-2 text-danger text-[13px] bg-danger/8 rounded-xl px-4 py-2.5 border border-danger/15">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {message.error}
        </div>
      )}

      {message.content && !message.isLoading && (
        <p className="text-[13px] text-text-muted leading-relaxed max-w-md px-1">
          {message.content}
        </p>
      )}

      <div className="flex items-center gap-2 px-1">
        <span className="text-[10px] text-text-muted">{formatTime(message.timestamp)}</span>
        {message.durationMs != null && (
          <span className="flex items-center gap-1 text-[10px] text-text-muted">
            <Clock className="w-2.5 h-2.5" />
            {formatDuration(message.durationMs)}
          </span>
        )}
        {message.model && (
          <span className="flex items-center gap-1 text-[10px] text-text-muted">
            <Cpu className="w-2.5 h-2.5" />
            {getModelName(message.model)}
          </span>
        )}
      </div>
    </div>
  )
})

export function ChatView({
  chatId,
  onClose,
  initialModel,
  initialAspectRatio,
  initialResolution,
}: ChatViewProps) {
  const [lightboxState, setLightboxState] = useState<{ images: string[]; index: number } | null>(null)

  const onImageClick = useCallback((images: string[], index: number) => {
    setLightboxState({ images, index })
  }, [])
  const chat = useChatStore((s) => s.chats.find((c) => c.id === chatId))

  // The source image's format is the starting point. A ratio the selector does
  // not list (an old custom one) is kept as a custom ratio rather than dropped.
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(() => {
    if (!initialAspectRatio) return '1:1'
    if (ASPECT_RATIOS.includes(initialAspectRatio as AspectRatio)) return initialAspectRatio as AspectRatio
    return initialAspectRatio.includes(':') ? 'custom' : '1:1'
  })
  const [customRatio, setCustomRatio] = useState<string>(
    initialAspectRatio && !ASPECT_RATIOS.includes(initialAspectRatio as AspectRatio) && initialAspectRatio.includes(':')
      ? initialAspectRatio
      : '4:3'
  )
  const [resolution, setResolution] = useState<Resolution>(
    RESOLUTIONS.includes(initialResolution as Resolution) ? (initialResolution as Resolution) : '2K'
  )
  const [selectedModels, setSelectedModels] = useState<string[]>([normalizeModelId(initialModel) || DEFAULT_MODEL])
  const [quality, setQuality] = useState<GptImageQuality>('high')

  const {
    editorRef,
    fileInputRef,
    imageRefs,
    collectionRefs,
    collections,
    removeImageRef,
    removeCollectionRef,
    clearRefs,
    insertChipAtCursor,
    insertCollectionChipAtCursor,
    getPromptText,
    promptText,
    buildAttachments,
    mentionItems,
    showMentionPopup,
    handleMentionKeyDown,
    handleEditorInput,
    handleFileSelect,
    handleImageDrop,
  } = useMentionEditor()

  const scrollRef = useRef<HTMLDivElement>(null)

  const { generate } = useChatGeneration()
  const falApiKey = useSettingsStore((s) => s.falApiKey)

  // Scroll to bottom when messages change (new message or loading completes)
  const messageCount = chat?.messages.length ?? 0
  const lastMessageLoading = chat?.messages[messageCount - 1]?.isLoading
  const lastMessageImage = chat?.messages[messageCount - 1]?.imageFilePath

  useEffect(() => {
    if (scrollRef.current) {
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
      }, 50)
    }
  }, [messageCount, lastMessageLoading, lastMessageImage])

  // Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleSubmit = useCallback(async () => {
    const text = getPromptText()
    if (!text || !falApiKey || !chat) return

    const { attachments, labeledAttachments } = await buildAttachments()
    const resolvedAspectRatio = aspectRatio === 'custom' ? customRatio : aspectRatio

    generate({
      chatId: chat.id,
      prompt: text,
      aspectRatio: resolvedAspectRatio,
      resolution,
      model: selectedModels[0],
      extraAttachments: attachments.length > 0 ? attachments : undefined,
      extraLabeledAttachments: labeledAttachments.length > 0 ? labeledAttachments : undefined,
      quality,
    })

    clearRefs()
  }, [getPromptText, falApiKey, chat, buildAttachments, generate, aspectRatio, customRatio, resolution, selectedModels, quality, clearRefs])

  const handleEditorKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleSubmit()
        return
      }
      if (handleMentionKeyDown(e)) return
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        document.execCommand('insertLineBreak')
      }
    },
    [handleSubmit, handleMentionKeyDown]
  )

  if (!chat) return null

  // Get last assistant image for auto-reference display
  const lastAssistantFilePath = [...chat.messages]
    .reverse()
    .find((m) => m.role === 'assistant' && m.imageFilePath)?.imageFilePath
  const lastAssistantDisplayUrl = lastAssistantFilePath ? toDisplayUrl(lastAssistantFilePath) : undefined

  const canSend = !!promptText && !!falApiKey
  const caps = getCombinedCapabilities(selectedModels)
  const isGenerating = chat.messages.some((m) => m.isLoading)

  return (
    <div className="absolute inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center animate-overlay-in" onClick={onClose}>
      <div className="bg-surface-1 border border-border-base rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.6)] w-full max-w-2xl h-[80vh] flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
      {/* Top bar */}
      <div className="h-11 shrink-0 flex items-center px-4 border-b border-border-dim rounded-t-2xl">
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors"
          title="Close"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div className="flex-1 min-w-0 px-3">
          <h1 className="text-[13px] font-medium text-text-secondary truncate text-center">
            {chat.title}
          </h1>
        </div>

        <button
          onClick={onClose}
          className="no-drag p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors z-50"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-6 space-y-6">
          {chat.messages.map((message) => {
            const allChatImages = chat.messages
              .filter((m): m is typeof m & { imageFilePath: string } => !!m.imageFilePath)
              .map((m) => toDisplayUrl(m.imageFilePath))
            return (
              <MessageBubble
                key={message.id}
                message={message}
                allImages={allChatImages}
                onImageClick={onImageClick}
              />
            )
          })}
        </div>
      </div>

      {/* Bottom input area */}
      <div className="shrink-0 flex flex-col items-center px-6 pb-6 pt-3">
        <div className="w-full max-w-2xl">
          {/* Auto-reference indicator */}
          {lastAssistantDisplayUrl && (
            <div className="flex items-center gap-2 mb-2 px-1">
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-2 border border-border-dim">
                <img
                  src={lastAssistantDisplayUrl}
                  alt="Auto-reference"
                  className="w-8 h-8 rounded-md object-cover border border-border-dim"
                />
                <div className="flex items-center gap-1.5">
                  <Link2 className="w-3 h-3 text-accent-main" />
                  <span className="text-[11px] font-medium text-text-muted">Auto-reference</span>
                </div>
              </div>
            </div>
          )}

          <div
            className="grain relative bg-surface-2 border border-border-base rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.4)]"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); handleImageDrop(e) }}
          >
            {/* Attached images and collections */}
            <AttachmentStrip
              imageRefs={imageRefs}
              collectionRefs={collectionRefs}
              onRemoveImage={removeImageRef}
              onRemoveCollection={removeCollectionRef}
              onAddMore={() => fileInputRef.current?.click()}
            />

            {/* Editor */}
            <div className="px-5 pt-3 pb-3">
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onKeyDown={handleEditorKeyDown}
                onInput={handleEditorInput}
                data-placeholder="Describe how to edit this image..."
                className="prompt-editor min-h-[40px] max-h-[140px] overflow-y-auto text-[14px] text-text-primary leading-relaxed outline-none"
              />
            </div>

            {/* @-mention popup */}
            {showMentionPopup && (
              <MentionPopup
                items={mentionItems}
                onSelectImage={insertChipAtCursor}
                onSelectCollection={insertCollectionChipAtCursor}
              />
            )}


            {/* Controls row */}
            <div className="flex items-center gap-1.5 px-4 pb-4">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="no-drag flex items-center gap-1.5 h-8 px-3 rounded-lg bg-surface-3 hover:bg-surface-4 border border-border-base text-text-secondary hover:text-text-primary transition-all text-[12px] font-medium"
              >
                <ImagePlus className="w-3.5 h-3.5" />
                <span>Images</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />

              <div className="w-px h-4 bg-border-dim mx-0.5" />
              <ModelSelector selectedModels={selectedModels} onChange={setSelectedModels} compact />
              <div className="w-px h-4 bg-border-dim mx-0.5" />
              <AspectRatioSelector value={aspectRatio} onChange={setAspectRatio} customRatio={customRatio} onCustomRatioChange={setCustomRatio} available={caps.aspectRatios} />
              <div className="w-px h-4 bg-border-dim mx-0.5" />
              <ResolutionSelector value={resolution} onChange={setResolution} available={caps.resolutions} notes={caps.notes} />

              {caps.qualities && (
                <>
                  <div className="w-px h-4 bg-border-dim mx-0.5" />
                  <QualitySelector value={quality} onChange={setQuality} available={caps.qualities} />
                </>
              )}

              <div className="flex-1" />

              <button
                onClick={handleSubmit}
                disabled={!canSend || isGenerating}
                className={cn(
                  'no-drag flex items-center justify-center w-9 h-9 rounded-xl transition-all',
                  canSend && !isGenerating
                    ? 'bg-text-primary text-surface-0 hover:opacity-90 shadow-[0_2px_12px_rgba(250,250,250,0.15)]'
                    : 'bg-surface-3 text-text-muted cursor-not-allowed'
                )}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Hint */}
          <div className="flex justify-center mt-2.5">
            <p className="text-[11px] text-text-muted">
              <kbd className="inline-flex items-center justify-center px-1 py-0.5 rounded bg-surface-3 text-text-muted border border-border-dim text-[10px] font-medium mr-0.5">&#x2318;</kbd>
              {' + '}
              <kbd className="inline-flex items-center justify-center px-1 py-0.5 rounded bg-surface-3 text-text-muted border border-border-dim text-[10px] font-medium mx-0.5">Enter</kbd>
              {' to generate'}
              {(imageRefs.length > 0 || collections.length > 0) && (
                <>
                  {'  ·  '}
                  <kbd className="inline-flex items-center justify-center px-1 py-0.5 rounded bg-surface-3 text-text-muted border border-border-dim text-[10px] font-medium mx-0.5">@</kbd>
                  {' references'}
                </>
              )}
              {'  ·  '}
              <CostEstimate
                models={selectedModels}
                aspectRatio={aspectRatio === 'custom' ? customRatio : aspectRatio}
                resolution={resolution}
                imageCount={1}
                quality={quality}
              />
            </p>
          </div>
        </div>
      </div>
      </div>

      {/* Simple lightbox for chat images */}
      {lightboxState && (
        <SimpleLightbox
          images={lightboxState.images}
          currentIndex={lightboxState.index}
          onClose={() => setLightboxState(null)}
          onNavigate={(index) => setLightboxState((prev) => prev ? { ...prev, index } : null)}
        />
      )}
    </div>
  )
}
