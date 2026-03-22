import { useState, useRef, useCallback, useEffect } from 'react'
import { Plus, X } from 'lucide-react'
import { useCollectionsStore, type AssetCollection } from '../../stores/collections-store'
import { MentionPopup, type MentionItem } from '../input/MentionPopup'
import { compressImage } from '../../lib/image-utils'
import { toDisplayUrl } from '../../stores/gallery-store'
import { cn } from '../../lib/utils'

/** A referenced collection in a color field */
export interface CollectionMention {
  collectionId: string
  name: string
  images: string[]  // file paths
}

interface ColorFieldEditorProps {
  colorHex?: string
  placeholder?: string
  value: string
  onChange: (value: string) => void
  attachments: string[]
  onAttachmentsChange: (attachments: string[]) => void
  /** Called whenever the set of mentioned collections changes */
  onCollectionsChange?: (collections: CollectionMention[]) => void
}

export function ColorFieldEditor({ colorHex, placeholder, value, onChange, attachments, onAttachmentsChange, onCollectionsChange }: ColorFieldEditorProps) {
  const [showMentionPopup, setShowMentionPopup] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const [collectionMentions, setCollectionMentions] = useState<CollectionMention[]>([])
  const editorRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const collections = useCollectionsStore((s) => s.collections)

  // Notify parent when collections change
  useEffect(() => {
    onCollectionsChange?.(collectionMentions)
  }, [collectionMentions, onCollectionsChange])

  const getTextContent = useCallback((): string => {
    const editor = editorRef.current
    if (!editor) return ''
    return editor.textContent?.trim() || ''
  }, [])

  const handleInput = useCallback(() => {
    const text = getTextContent()
    onChange(text)

    // Sync collection mentions with DOM chips
    const editor = editorRef.current
    if (editor) {
      const chipIds = new Set(
        Array.from(editor.querySelectorAll('[data-collection-id]'))
          .map((el) => (el as HTMLElement).dataset.collectionId)
      )
      setCollectionMentions((prev) => {
        const filtered = prev.filter((m) => chipIds.has(m.collectionId))
        return filtered.length !== prev.length ? filtered : prev
      })
    }

    // Check for @mention trigger
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    const textNode = range.startContainer
    if (textNode.nodeType !== Node.TEXT_NODE) {
      if (showMentionPopup) setShowMentionPopup(false)
      return
    }
    const nodeText = textNode.textContent || ''
    const cursorPos = range.startOffset
    const atIdx = nodeText.lastIndexOf('@', cursorPos - 1)
    if (atIdx >= 0 && collections.length > 0) {
      const charBefore = atIdx > 0 ? nodeText[atIdx - 1] : ' '
      if (charBefore === ' ' || charBefore === '\u00A0' || atIdx === 0) {
        setMentionFilter(nodeText.substring(atIdx + 1, cursorPos).toLowerCase())
        setShowMentionPopup(true)
        return
      }
    }
    if (showMentionPopup) setShowMentionPopup(false)
  }, [getTextContent, onChange, collections, showMentionPopup])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (showMentionPopup && e.key === 'Escape') {
      e.preventDefault()
      setShowMentionPopup(false)
    }
  }, [showMentionPopup])

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
      onAttachmentsChange([...attachments, compressed])
    }
    e.target.value = ''
  }, [attachments, onAttachmentsChange])

  const removeAttachment = useCallback((index: number) => {
    onAttachmentsChange(attachments.filter((_, i) => i !== index))
  }, [attachments, onAttachmentsChange])

  const mentionItems: MentionItem[] = collections
    .filter((c) => c.name.toLowerCase().includes(mentionFilter.toLowerCase()))
    .map((collection): MentionItem => ({ type: 'collection', collection }))

  const insertCollectionMention = useCallback((collection: AssetCollection) => {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    const textNode = range.startContainer

    // Remove the @filter text
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

    // Track the collection reference
    setCollectionMentions((prev) => {
      // Don't duplicate if same collection already mentioned in this field
      if (prev.some((m) => m.collectionId === collection.id)) return prev
      return [...prev, { collectionId: collection.id, name: collection.name, images: collection.images }]
    })

    // Create styled chip (same pattern as PromptBar)
    const chip = document.createElement('span')
    chip.contentEditable = 'false'
    chip.dataset.collectionId = collection.id
    chip.className = 'inline-flex items-center gap-1 align-middle mx-0.5 px-1.5 py-0.5 rounded-md bg-accent-dim border border-accent-main/30 text-[12px] font-medium text-text-primary cursor-default select-none'
    const thumbnail = collection.images[0] || ''
    const thumbnailHtml = thumbnail
      ? `<img src="${toDisplayUrl(thumbnail)}" class="w-4 h-4 rounded object-cover inline-block align-middle" />`
      : '<span class="inline-flex w-4 h-4 items-center justify-center"><svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg></span>'
    chip.innerHTML = `${thumbnailHtml}<span class="align-middle">@${collection.name}</span>`

    range.deleteContents()
    range.insertNode(chip)

    // Add space after chip and move cursor there
    const space = document.createTextNode('\u00A0')
    chip.after(space)
    range.setStartAfter(space)
    range.setEndAfter(space)
    sel.removeAllRanges()
    sel.addRange(range)

    onChange(getTextContent())
    setShowMentionPopup(false)
    setMentionFilter('')
  }, [getTextContent, onChange])

  return (
    <div className="flex items-start gap-2 relative">
      {colorHex && (
        <div
          className="w-6 h-6 rounded-md border border-white/20 shrink-0 mt-1.5 shadow-sm"
          style={{ backgroundColor: colorHex }}
          title={colorHex}
        />
      )}

      <div className="flex-1 min-w-0">
        <div className="bg-surface-3 border border-border-dim rounded-lg overflow-hidden focus-within:border-border-base transition-colors">
          {/* Attachment thumbnails */}
          {attachments.length > 0 && (
            <div className="flex gap-1.5 px-2.5 pt-2.5 flex-wrap">
              {attachments.map((att, i) => (
                <div key={i} className="relative w-10 h-10 rounded-md overflow-hidden group">
                  <img src={att} className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeAttachment(i)}
                    className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-surface-0 text-text-muted flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-start gap-1.5 px-2.5 py-2">
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={handleInput}
              onKeyDown={handleKeyDown}
              data-placeholder={placeholder || 'Describe this color region...'}
              className={cn(
                'flex-1 min-h-[28px] max-h-[60px] overflow-y-auto text-[13px] text-text-primary leading-relaxed outline-none',
                'empty:before:content-[attr(data-placeholder)] empty:before:text-text-muted/50'
              )}
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              className="shrink-0 w-6 h-6 rounded flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-4 transition-all"
              title="Attach image"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
        </div>
      </div>

      {/* MentionPopup rendered outside the overflow-hidden container */}
      {showMentionPopup && mentionItems.length > 0 && (
        <div className="absolute left-8 bottom-full mb-1 z-50">
          <MentionPopup
            items={mentionItems}
            onSelectImage={() => {}}
            onSelectCollection={insertCollectionMention}
          />
        </div>
      )}
    </div>
  )
}
