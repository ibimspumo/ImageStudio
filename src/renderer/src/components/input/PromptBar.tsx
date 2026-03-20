import { useState, useRef, useCallback, useEffect } from 'react'
import { Send, Plus, X, FolderOpen, Settings } from 'lucide-react'
import { useImageGeneration } from '../../hooks/useImageGeneration'
import { useSettingsStore } from '../../stores/settings-store'
import { useCollectionsStore, type AssetCollection } from '../../stores/collections-store'
import { AspectRatioSelector } from './AspectRatioSelector'
import { ResolutionSelector } from './ResolutionSelector'
import { ImageCountSelector } from './ImageCountSelector'
import { ModelSelector } from './ModelSelector'
import type { AspectRatio, Resolution } from '../../types/api'
import { cn } from '../../lib/utils'
import { prepareCollectionImages, compressImage } from '../../lib/image-utils'

interface ImageRef {
  id: string
  name: string
  base64: string
}

interface CollectionRef {
  id: string
  collectionId: string
  name: string
  thumbnail: string
  images: string[]
}

type MentionItem =
  | { type: 'image'; ref: ImageRef }
  | { type: 'collection'; collection: AssetCollection }

interface PromptBarProps {
  onSettingsClick?: () => void
  onCollectionsClick?: () => void
}

export function PromptBar({ onSettingsClick, onCollectionsClick }: PromptBarProps = {}) {
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1')
  const [customRatio, setCustomRatio] = useState<string>('4:3')
  const [resolution, setResolution] = useState<Resolution>('2K')
  const [imageCount, setImageCount] = useState(1)
  const [selectedModels, setSelectedModels] = useState<string[]>(['google/gemini-3-pro-image-preview'])
  const [imageRefs, setImageRefs] = useState<ImageRef[]>([])
  const [collectionRefs, setCollectionRefs] = useState<CollectionRef[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [showMentionPopup, setShowMentionPopup] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')

  const editorRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCountRef = useRef(0)
  const nextImageNum = useRef(1)

  const { generate } = useImageGeneration()
  const apiKey = useSettingsStore((s) => s.apiKey)
  const collections = useCollectionsStore((s) => s.collections)

  const addImageRef = useCallback((base64: string): ImageRef => {
    const existing = imageRefs.find((r) => r.base64 === base64)
    if (existing) return existing
    const name = `Image ${nextImageNum.current++}`
    const ref: ImageRef = { id: crypto.randomUUID(), name, base64 }
    setImageRefs((prev) => [...prev, ref])
    return ref
  }, [imageRefs])

  const removeImageRef = useCallback((id: string) => {
    setImageRefs((prev) => prev.filter((r) => r.id !== id))
    const editor = editorRef.current
    if (editor) {
      const chips = editor.querySelectorAll(`[data-image-ref-id="${id}"]`)
      chips.forEach((chip) => chip.remove())
    }
  }, [])

  const removeCollectionRef = useCallback((id: string) => {
    setCollectionRefs((prev) => prev.filter((r) => r.id !== id))
    const editor = editorRef.current
    if (editor) {
      const chips = editor.querySelectorAll(`[data-collection-ref-id="${id}"]`)
      chips.forEach((chip) => chip.remove())
    }
  }, [])

  const insertChipAtCursor = useCallback((ref: ImageRef) => {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    const textNode = range.startContainer
    if (textNode.nodeType === Node.TEXT_NODE) {
      const text = textNode.textContent || ''
      const cursorPos = range.startOffset
      const atIdx = text.lastIndexOf('@', cursorPos - 1)
      if (atIdx >= 0) {
        const before = text.substring(0, atIdx)
        const after = text.substring(cursorPos)
        textNode.textContent = before + after
        range.setStart(textNode, atIdx)
        range.setEnd(textNode, atIdx)
      }
    }
    const chip = document.createElement('span')
    chip.contentEditable = 'false'
    chip.dataset.imageRefId = ref.id
    chip.className = 'inline-flex items-center gap-1 align-middle mx-0.5 px-1.5 py-0.5 rounded-md bg-surface-3 border border-border-base text-[12px] font-medium text-text-primary cursor-default select-none'
    chip.innerHTML = `<img src="${ref.base64}" class="w-4 h-4 rounded object-cover inline-block align-middle" /><span class="align-middle">${ref.name}</span>`
    range.deleteContents()
    range.insertNode(chip)
    const space = document.createTextNode('\u00A0')
    chip.after(space)
    range.setStartAfter(space)
    range.setEndAfter(space)
    sel.removeAllRanges()
    sel.addRange(range)
    setShowMentionPopup(false)
    setMentionFilter('')
  }, [])

  const insertCollectionChipAtCursor = useCallback((collection: AssetCollection) => {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    const textNode = range.startContainer
    if (textNode.nodeType === Node.TEXT_NODE) {
      const text = textNode.textContent || ''
      const cursorPos = range.startOffset
      const atIdx = text.lastIndexOf('@', cursorPos - 1)
      if (atIdx >= 0) {
        const before = text.substring(0, atIdx)
        const after = text.substring(cursorPos)
        textNode.textContent = before + after
        range.setStart(textNode, atIdx)
        range.setEnd(textNode, atIdx)
      }
    }
    const cRef: CollectionRef = {
      id: crypto.randomUUID(),
      collectionId: collection.id,
      name: collection.name,
      thumbnail: collection.images[0] || '',
      images: collection.images,
    }
    setCollectionRefs((prev) => [...prev, cRef])
    const chip = document.createElement('span')
    chip.contentEditable = 'false'
    chip.dataset.collectionRefId = cRef.id
    chip.className = 'inline-flex items-center gap-1 align-middle mx-0.5 px-1.5 py-0.5 rounded-md bg-accent-dim border border-accent-main/30 text-[12px] font-medium text-text-primary cursor-default select-none'
    const thumbnailHtml = cRef.thumbnail
      ? `<img src="${cRef.thumbnail}" class="w-4 h-4 rounded object-cover inline-block align-middle" />`
      : '<span class="inline-flex w-4 h-4 items-center justify-center"><svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg></span>'
    chip.innerHTML = `${thumbnailHtml}<span class="align-middle">@${collection.name}</span>`
    range.deleteContents()
    range.insertNode(chip)
    const space = document.createTextNode('\u00A0')
    chip.after(space)
    range.setStartAfter(space)
    range.setEndAfter(space)
    sel.removeAllRanges()
    sel.addRange(range)
    setShowMentionPopup(false)
    setMentionFilter('')
  }, [])

  const getPromptText = useCallback((): string => {
    const editor = editorRef.current
    if (!editor) return ''
    let text = ''
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent || ''
      } else if (node instanceof HTMLElement) {
        if (node.dataset.imageRefId) {
          const ref = imageRefs.find((r) => r.id === node.dataset.imageRefId)
          if (ref) text += `[${ref.name}]`
        } else if (node.dataset.collectionRefId) {
          const cRef = collectionRefs.find((r) => r.id === node.dataset.collectionRefId)
          if (cRef) text += `[@${cRef.name}]`
        } else if (node.tagName === 'BR') {
          text += '\n'
        } else {
          for (const child of node.childNodes) walk(child)
        }
      }
    }
    for (const child of editor.childNodes) walk(child)
    return text.trim()
  }, [imageRefs, collectionRefs])

  const handleSubmit = useCallback(async () => {
    const text = getPromptText()
    if (!text || !apiKey) return
    const attachments = imageRefs.map((r) => r.base64)
    for (const cRef of collectionRefs) {
      const processed = await prepareCollectionImages(cRef.images)
      attachments.push(...processed)
    }
    const resolvedAspectRatio = aspectRatio === 'custom' ? customRatio : aspectRatio
    generate({
      prompt: text,
      aspectRatio: resolvedAspectRatio,
      resolution,
      imageCount,
      attachments: attachments.length > 0 ? attachments : undefined,
      models: selectedModels,
    })
  }, [getPromptText, apiKey, imageRefs, collectionRefs, generate, aspectRatio, customRatio, resolution, imageCount, selectedModels])

  const mentionItems: MentionItem[] = [
    ...imageRefs
      .filter((r) => r.name.toLowerCase().includes(mentionFilter.toLowerCase()))
      .map((ref): MentionItem => ({ type: 'image', ref })),
    ...collections
      .filter((c) => c.name.toLowerCase().includes(mentionFilter.toLowerCase()))
      .map((collection): MentionItem => ({ type: 'collection', collection })),
  ]

  const handleEditorKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
      return
    }
    if (showMentionPopup) {
      if (e.key === 'Escape') { e.preventDefault(); setShowMentionPopup(false); return }
      if (e.key === 'Enter' && mentionItems.length > 0) {
        e.preventDefault()
        const first = mentionItems[0]
        if (first.type === 'image') {
          insertChipAtCursor(first.ref)
        } else {
          insertCollectionChipAtCursor(first.collection)
        }
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault()
      document.execCommand('insertLineBreak')
    }
  }, [handleSubmit, showMentionPopup, mentionItems, insertChipAtCursor, insertCollectionChipAtCursor])

  const handleEditorInput = useCallback(() => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    const textNode = range.startContainer
    if (textNode.nodeType !== Node.TEXT_NODE) {
      if (showMentionPopup) setShowMentionPopup(false)
      return
    }
    const text = textNode.textContent || ''
    const cursorPos = range.startOffset
    const atIdx = text.lastIndexOf('@', cursorPos - 1)
    const hasImageRefs = imageRefs.length > 0
    const hasCollections = collections.length > 0
    if (atIdx >= 0 && (hasImageRefs || hasCollections)) {
      const charBefore = atIdx > 0 ? text[atIdx - 1] : ' '
      if (charBefore === ' ' || charBefore === '\u00A0' || atIdx === 0) {
        setMentionFilter(text.substring(atIdx + 1, cursorPos).toLowerCase())
        setShowMentionPopup(true)
        return
      }
    }
    if (showMentionPopup) setShowMentionPopup(false)
  }, [imageRefs, collections, showMentionPopup])

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue
      const raw = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(file)
      })
      const compressed = await compressImage(raw)
      addImageRef(compressed)
    }
    e.target.value = ''
  }, [addImageRef])

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy' }, [])
  const handleDragEnter = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCountRef.current++; setIsDragOver(true) }, [])
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCountRef.current--; if (dragCountRef.current === 0) setIsDragOver(false) }, [])
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    dragCountRef.current = 0
    const internalData = e.dataTransfer.getData('application/x-imagestudio')
    if (internalData) {
      addImageRef(internalData)
      return
    }
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
    for (const file of files) {
      const raw = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(file)
      })
      const compressed = await compressImage(raw)
      addImageRef(compressed)
    }
  }, [addImageRef])

  useEffect(() => {
    const prevent = (e: DragEvent) => { e.preventDefault() }
    document.addEventListener('dragover', prevent)
    document.addEventListener('drop', prevent)
    return () => {
      document.removeEventListener('dragover', prevent)
      document.removeEventListener('drop', prevent)
    }
  }, [])

  const promptText = getPromptText()
  const canSend = promptText && apiKey

  return (
    <div className="shrink-0 flex flex-col items-center px-6 pb-6 pt-3">
      <div className="w-full max-w-[800px] relative">
        <div
          className={cn(
            'prompt-card grain relative border rounded-2xl transition-all',
            isDragOver ? 'border-accent-main/60 glow-accent-strong' : 'border-border-base'
          )}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Top luminous edge */}
          <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

          {/* Drag overlay */}
          {isDragOver && (
            <div className="absolute inset-0 z-10 rounded-2xl bg-accent-main/8 backdrop-blur-sm flex items-center justify-center pointer-events-none border-2 border-dashed border-accent-main/40">
              <div className="flex flex-col items-center gap-2">
                <Plus className="w-6 h-6 text-accent-main" />
                <span className="text-[13px] font-medium text-accent-main">Drop as reference</span>
              </div>
            </div>
          )}

          {/* Attached images — thumbnail strip */}
          {imageRefs.length > 0 && (
            <div className="flex items-center gap-2.5 px-5 pt-4 overflow-x-auto">
              {imageRefs.map((ref) => (
                <div key={ref.id} className="relative shrink-0 group animate-scale-in">
                  <div className="w-14 h-14 rounded-xl overflow-hidden border border-border-base/80 shadow-[0_2px_8px_rgba(0,0,0,0.3)]">
                    <img src={ref.base64} alt={ref.name} className="w-full h-full object-cover" />
                  </div>
                  <button
                    onClick={() => removeImageRef(ref.id)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-surface-1 border border-border-base flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-danger hover:border-danger hover:text-white text-text-muted shadow-lg"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent rounded-b-xl px-1.5 py-0.5">
                    <span className="text-[9px] text-white/90 font-medium">{ref.name}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Attached collection refs */}
          {collectionRefs.length > 0 && (
            <div className="flex items-center gap-2 px-5 pt-2.5 overflow-x-auto">
              {collectionRefs.map((cRef) => (
                <div key={cRef.id} className="shrink-0 group animate-scale-in flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-accent-main/8 border border-accent-main/20">
                  {cRef.thumbnail ? (
                    <img src={cRef.thumbnail} alt="" className="w-5 h-5 rounded object-cover" />
                  ) : (
                    <FolderOpen className="w-4 h-4 text-accent-main" />
                  )}
                  <span className="text-[11px] font-medium text-accent-bright">@{cRef.name}</span>
                  <span className="text-[10px] text-text-muted">{cRef.images.length}</span>
                  <button
                    onClick={() => removeCollectionRef(cRef.id)}
                    className="w-4 h-4 rounded-full flex items-center justify-center text-text-muted hover:text-danger transition-colors"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ContentEditable editor with inline + button */}
          <div className="flex items-start gap-2 px-4 pt-4 pb-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="no-drag shrink-0 mt-0.5 w-8 h-8 rounded-full flex items-center justify-center border border-border-base text-text-secondary hover:text-text-primary hover:bg-surface-4 hover:border-border-bright transition-all"
              title="Attach images"
            >
              <Plus className="w-4 h-4" />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />

            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={handleEditorInput}
              onKeyDown={handleEditorKeyDown}
              data-placeholder="Describe your image..."
              className="prompt-editor flex-1 min-h-[44px] max-h-[140px] overflow-y-auto text-[14px] text-text-primary leading-relaxed outline-none pt-1"
            />
          </div>

          {/* Separator */}
          <div className="mx-4 h-px bg-border-dim/60" />

          {/* @-mention popup */}
          {showMentionPopup && mentionItems.length > 0 && (
            <div className="absolute bottom-full left-4 mb-2 modal-glass border border-border-base rounded-xl p-1.5 z-30 animate-scale-in min-w-[220px] max-h-[240px] overflow-y-auto">
              {mentionItems.map((item) =>
                item.type === 'image' ? (
                  <button
                    key={`img-${item.ref.id}`}
                    onMouseDown={(e) => { e.preventDefault(); insertChipAtCursor(item.ref) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left hover:bg-surface-hover transition-colors"
                  >
                    <img src={item.ref.base64} className="w-7 h-7 rounded-lg object-cover border border-border-dim" alt="" />
                    <span className="text-[13px] font-medium text-text-primary">{item.ref.name}</span>
                  </button>
                ) : (
                  <button
                    key={`col-${item.collection.id}`}
                    onMouseDown={(e) => { e.preventDefault(); insertCollectionChipAtCursor(item.collection) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left hover:bg-surface-hover transition-colors"
                  >
                    <div className="w-7 h-7 rounded-lg bg-accent-dim flex items-center justify-center shrink-0 border border-accent-main/15">
                      {item.collection.images[0] ? (
                        <img src={item.collection.images[0]} className="w-7 h-7 rounded-lg object-cover" alt="" />
                      ) : (
                        <FolderOpen className="w-3.5 h-3.5 text-accent-main" />
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[13px] font-medium text-text-primary truncate">@{item.collection.name}</span>
                      <span className="text-[10px] text-text-muted">{item.collection.images.length} images</span>
                    </div>
                  </button>
                )
              )}
            </div>
          )}

          {/* Controls row */}
          <div className="flex items-center gap-1 px-4 py-3">
            <ModelSelector selectedModels={selectedModels} onChange={setSelectedModels} />
            <div className="w-px h-4 bg-border-dim/40 mx-0.5" />
            <AspectRatioSelector value={aspectRatio} onChange={setAspectRatio} customRatio={customRatio} onCustomRatioChange={setCustomRatio} />
            <div className="w-px h-4 bg-border-dim/40 mx-0.5" />
            <ResolutionSelector value={resolution} onChange={setResolution} />
            <div className="w-px h-4 bg-border-dim/40 mx-0.5" />
            <ImageCountSelector value={imageCount} onChange={setImageCount} />
            <div className="w-px h-4 bg-border-dim/40 mx-0.5" />

            {onCollectionsClick && (
              <button
                onClick={onCollectionsClick}
                className="no-drag flex items-center justify-center h-8 w-8 rounded-lg bg-surface-3 hover:bg-surface-4 border border-border-base text-text-secondary hover:text-text-primary transition-all text-[14px] font-semibold"
                title="Collections (@)"
              >
                @
              </button>
            )}
            {onSettingsClick && (
              <button
                onClick={onSettingsClick}
                className="no-drag flex items-center justify-center w-8 h-8 rounded-lg bg-surface-3 hover:bg-surface-4 border border-border-base text-text-secondary hover:text-text-primary transition-all"
                title="Settings"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            )}

            <div className="flex-1" />

            <button
              onClick={handleSubmit}
              disabled={!canSend}
              className={cn(
                'no-drag btn-interactive flex items-center justify-center h-9 rounded-xl transition-all',
                canSend
                  ? 'bg-accent-main hover:bg-accent-bright text-white px-4 gap-2 glow-accent shadow-lg'
                  : 'bg-surface-3 text-text-muted cursor-not-allowed w-9'
              )}
            >
              <Send className="w-4 h-4" />
              {canSend && <span className="text-[12px] font-semibold tracking-wide">Generate</span>}
            </button>
          </div>
        </div>

        {/* Hint */}
        <div className="flex justify-center mt-2.5">
          <p className="text-[11px] text-text-muted/70">
            {!apiKey ? (
              <span className="text-danger/80">API key missing — open Settings</span>
            ) : (
              <>
                <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-surface-2 text-text-muted border border-border-dim text-[10px] mr-0.5">&#x2318;</kbd>
                <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-surface-2 text-text-muted border border-border-dim text-[10px] mx-0.5">&#x23CE;</kbd>
                {(imageRefs.length > 0 || collections.length > 0) && (
                  <>
                    {'  \u00B7  '}
                    <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-surface-2 text-text-muted border border-border-dim text-[10px] mx-0.5">@</kbd>
                    {' references'}
                  </>
                )}
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
