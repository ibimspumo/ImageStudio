import { useState, useRef, useCallback } from 'react'
import { X, Plus, Trash2, Pencil, ImagePlus, FolderOpen, Check } from 'lucide-react'
import { useCollectionsStore, type AssetCollection } from '../../stores/collections-store'
import { cn } from '../../lib/utils'

interface CollectionsDialogProps {
  onClose: () => void
}

type View = 'list' | 'create' | 'edit'

export function CollectionsDialog({ onClose }: CollectionsDialogProps) {
  const { collections, addCollection, updateCollection, removeCollection, removeImageFromCollection, addImagesToCollection } = useCollectionsStore()
  const [view, setView] = useState<View>('list')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [pendingImages, setPendingImages] = useState<string[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCountRef = useRef(0)

  const editingCollection = editingId ? collections.find((c) => c.id === editingId) : null

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.readAsDataURL(file)
    })
  }

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    const newImages: string[] = []
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue
      const base64 = await readFileAsBase64(file)
      newImages.push(base64)
    }
    if (view === 'edit' && editingId) {
      addImagesToCollection(editingId, newImages)
    } else {
      setPendingImages((prev) => [...prev, ...newImages])
    }
    e.target.value = ''
  }, [view, editingId, addImagesToCollection])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    dragCountRef.current = 0
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
    const newImages: string[] = []
    for (const file of files) {
      const base64 = await readFileAsBase64(file)
      newImages.push(base64)
    }
    if (view === 'edit' && editingId) {
      addImagesToCollection(editingId, newImages)
    } else {
      setPendingImages((prev) => [...prev, ...newImages])
    }
  }, [view, editingId, addImagesToCollection])

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy' }, [])
  const handleDragEnter = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCountRef.current++; setIsDragOver(true) }, [])
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCountRef.current--; if (dragCountRef.current === 0) setIsDragOver(false) }, [])

  const handleCreate = () => {
    if (!name.trim() || pendingImages.length === 0) return
    addCollection(name.trim(), pendingImages)
    setName('')
    setPendingImages([])
    setView('list')
  }

  const handleStartEdit = (collection: AssetCollection) => {
    setEditingId(collection.id)
    setName(collection.name)
    setView('edit')
  }

  const handleSaveEdit = () => {
    if (!editingId || !name.trim()) return
    updateCollection(editingId, { name: name.trim() })
    setEditingId(null)
    setName('')
    setView('list')
  }

  const handleDelete = (id: string) => {
    removeCollection(id)
    if (editingId === id) {
      setEditingId(null)
      setView('list')
    }
  }

  const handleStartCreate = () => {
    setName('')
    setPendingImages([])
    setView('create')
  }

  const displayImages = view === 'edit' && editingCollection ? editingCollection.images : pendingImages

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center animate-overlay-in"
      onClick={onClose}
    >
      <div
        className="bg-surface-1 border border-border-base rounded-2xl w-full max-w-lg mx-4 shadow-[0_24px_80px_rgba(0,0,0,0.6)] animate-scale-in max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-dim shrink-0">
          <div className="flex items-center gap-2">
            {view !== 'list' && (
              <button
                onClick={() => { setView('list'); setEditingId(null); setPendingImages([]) }}
                className="text-[13px] text-text-muted hover:text-text-primary transition-colors"
              >
                Collections
              </button>
            )}
            {view !== 'list' && <span className="text-text-muted text-[13px]">/</span>}
            <h2 className="text-[15px] font-semibold text-text-primary">
              {view === 'list' ? 'Collections' : view === 'create' ? 'New Collection' : 'Edit Collection'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-3 text-text-muted hover:text-text-primary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {view === 'list' && (
            <div className="space-y-3">
              {collections.length === 0 ? (
                <div className="text-center py-8">
                  <FolderOpen className="w-8 h-8 text-text-muted mx-auto mb-3" />
                  <p className="text-[13px] text-text-muted">No collections yet</p>
                  <p className="text-[11px] text-text-muted mt-1">Create one to group reference images</p>
                </div>
              ) : (
                collections.map((collection) => (
                  <div
                    key={collection.id}
                    className="group flex items-start gap-3 p-3 rounded-xl bg-surface-2 border border-border-dim hover:border-border-base transition-colors"
                  >
                    {/* Thumbnail grid */}
                    <div className="shrink-0 w-14 h-14 rounded-lg bg-surface-3 border border-border-dim overflow-hidden grid grid-cols-2 gap-px">
                      {collection.images.slice(0, 4).map((img, i) => (
                        <img key={i} src={img} alt="" className="w-full h-full object-cover" />
                      ))}
                      {collection.images.length === 0 && (
                        <div className="col-span-2 row-span-2 flex items-center justify-center">
                          <FolderOpen className="w-5 h-5 text-text-muted" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-text-primary truncate">
                        @{collection.name}
                      </p>
                      <p className="text-[11px] text-text-muted mt-0.5">
                        {collection.images.length} image{collection.images.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleStartEdit(collection)}
                        className="p-1.5 rounded-lg hover:bg-surface-4 text-text-muted hover:text-text-primary transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(collection.id)}
                        className="p-1.5 rounded-lg hover:bg-surface-4 text-text-muted hover:text-danger transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {(view === 'create' || view === 'edit') && (
            <div className="space-y-4">
              {/* Name input */}
              <div>
                <label className="block text-[13px] font-medium text-text-secondary mb-2">
                  Name
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[14px] text-text-muted">@</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value.replace(/\s/g, '-'))}
                    placeholder="e.g. Axel"
                    className="flex-1 bg-surface-2 border border-border-base rounded-xl px-4 py-2.5 text-[13px] text-text-primary placeholder:text-text-muted outline-none focus:border-accent-main/40 focus:ring-1 focus:ring-accent-main/20 transition-all"
                    autoFocus
                  />
                </div>
              </div>

              {/* Images */}
              <div>
                <label className="block text-[13px] font-medium text-text-secondary mb-2">
                  Images ({displayImages.length})
                </label>
                <div
                  className={cn(
                    'min-h-[120px] rounded-xl border-2 border-dashed transition-colors p-3',
                    isDragOver ? 'border-accent-main bg-accent-dim/20' : 'border-border-dim'
                  )}
                  onDragOver={handleDragOver}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  {displayImages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-6">
                      <ImagePlus className="w-6 h-6 text-text-muted mb-2" />
                      <p className="text-[12px] text-text-muted">
                        Drop images here or click to add
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-5 gap-2">
                      {displayImages.map((img, i) => (
                        <div key={i} className="relative group/img aspect-square">
                          <img src={img} alt="" className="w-full h-full object-cover rounded-lg border border-border-dim" />
                          <button
                            onClick={() => {
                              if (view === 'edit' && editingId) {
                                removeImageFromCollection(editingId, i)
                              } else {
                                setPendingImages((prev) => prev.filter((_, idx) => idx !== i))
                              }
                            }}
                            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-surface-0 border border-border-base flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity hover:bg-danger hover:border-danger hover:text-white text-text-muted"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 flex items-center gap-1.5 h-8 px-3 rounded-lg bg-surface-3 hover:bg-surface-4 border border-border-base text-text-secondary hover:text-text-primary transition-all text-[12px] font-medium"
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                  <span>Add images</span>
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border-dim flex justify-end gap-2 shrink-0">
          {view === 'list' && (
            <button
              onClick={handleStartCreate}
              className="px-4 py-2 rounded-xl text-[13px] font-medium bg-text-primary text-surface-0 hover:opacity-90 transition-all flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              New Collection
            </button>
          )}
          {view === 'create' && (
            <>
              <button
                onClick={() => { setView('list'); setPendingImages([]) }}
                className="px-4 py-2 rounded-xl text-[13px] text-text-secondary hover:text-text-primary hover:bg-surface-3 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!name.trim() || pendingImages.length === 0}
                className="px-4 py-2 rounded-xl text-[13px] font-medium bg-text-primary text-surface-0 hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                Create
              </button>
            </>
          )}
          {view === 'edit' && (
            <>
              <button
                onClick={() => { setView('list'); setEditingId(null) }}
                className="px-4 py-2 rounded-xl text-[13px] text-text-secondary hover:text-text-primary hover:bg-surface-3 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={!name.trim()}
                className="px-4 py-2 rounded-xl text-[13px] font-medium bg-text-primary text-surface-0 hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                Save
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
