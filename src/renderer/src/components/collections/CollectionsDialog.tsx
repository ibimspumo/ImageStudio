import { useState, useRef, useCallback } from 'react'
import { X, Plus, Trash2, Pencil, ImagePlus, FolderOpen, Check } from 'lucide-react'
import { useCollectionsStore, type AssetCollection } from '../../stores/collections-store'
import { cn } from '../../lib/utils'
import { compressImage } from '../../lib/image-utils'
import { toDisplayUrl } from '../../stores/gallery-store'

interface CollectionsDialogProps {
  onClose: () => void
  embedded?: boolean
  onUseCollection?: (id: string) => void
}

type View = 'list' | 'create' | 'edit'

export function CollectionsDialog({ onClose, embedded = false, onUseCollection }: CollectionsDialogProps) {
  const { collections, addCollection, updateCollection, removeCollection } = useCollectionsStore()
  const [search, setSearch] = useState('')
  const [view, setView] = useState<View>('list')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [pendingImages, setPendingImages] = useState<string[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCountRef = useRef(0)


  const readFileAsBase64 = async (file: File): Promise<string> => {
    const raw = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.readAsDataURL(file)
    })
    return compressImage(raw)
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
    setPendingImages((prev) => [...prev, ...newImages])
    e.target.value = ''
  }, [])

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
    setPendingImages((prev) => [...prev, ...newImages])
  }, [])

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
    setPendingImages([...collection.images])
    setView('edit')
  }

  const handleSaveEdit = () => {
    if (!editingId || !name.trim()) return
    updateCollection(editingId, { name: name.trim(), images: pendingImages })
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

  const displayImages = pendingImages

  return (
    <div
      className={embedded ? "h-full min-h-0 flex flex-col" : "absolute inset-0 z-50 bg-black/70 flex items-center justify-center animate-overlay-in"}
      onClick={embedded ? undefined : onClose}
    >
      <div
        className={embedded ? "flex flex-col h-full min-h-0" : "bg-surface-1 border border-border-base rounded-2xl w-full max-w-2xl mx-4 animate-scale-in max-h-[85vh] flex flex-col"}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-7 py-5 border-b border-border-dim shrink-0">
          <div className="flex items-center gap-2">
            {view !== 'list' && (
              <button
                onClick={() => { setView('list'); setEditingId(null); setPendingImages([]) }}
                className="text-[13px] text-text-muted hover:text-text-primary transition-colors"
              >
                Sammlungen
              </button>
            )}
            {view !== 'list' && <span className="text-text-muted text-[13px]">/</span>}
            <h2 className="text-2xl font-semibold text-text-primary">
              {view === 'list' ? 'Sammlungen' : view === 'create' ? 'Neue Sammlung' : 'Sammlung bearbeiten'}
            </h2>
          </div>
          <button
            hidden={embedded}
            aria-label="Schließen"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-3 text-text-muted hover:text-text-primary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {view === 'list' && <div className="px-7 pt-5 space-y-4"><p className="text-[13px] leading-relaxed text-text-secondary max-w-2xl">Personen, Produkte und Markenbilder als wiederverwendbare Referenzen. Füge eine Sammlung im Prompt über @ hinzu.</p><input aria-label="Sammlungen suchen" value={search} onChange={event => setSearch(event.target.value)} placeholder="Sammlungen suchen…" className="w-full max-w-md bg-surface-2 border border-border-base rounded-lg px-3 py-2.5 text-[13px] text-text-primary placeholder:text-text-secondary outline-none focus:border-accent-main" /></div>}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-7 py-5">
          {view === 'list' && (
            <div className="space-y-3">
              {search && !collections.some(item => item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())) && <p className="py-6 text-[13px] text-text-secondary">Keine Sammlungen gefunden.</p>}
              {collections.length === 0 ? (
                <div className="text-center py-8">
                  <FolderOpen className="w-8 h-8 text-text-muted mx-auto mb-3" />
                  <p className="text-[13px] text-text-muted">Deine Referenzen an einem Ort</p>
                  <p className="text-[13px] text-text-muted mt-1">Erstelle eine Sammlung für Personen, Produkte oder deinen Markenstil.</p>
                </div>
              ) : (
                collections.filter(item => item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map((collection) => (
                  <div
                    key={collection.id}
                    className="group flex items-start gap-3 p-4 rounded-xl bg-surface-2 border border-border-dim hover:border-border-base transition-colors"
                  >
                    {/* Thumbnail grid */}
                    <div className="shrink-0 w-20 h-20 rounded-lg bg-surface-3 border border-border-dim overflow-hidden grid grid-cols-2 gap-px">
                      {collection.images.slice(0, 4).map((img, i) => (
                        <img key={i} src={toDisplayUrl(img)} alt="" className="w-full h-full object-cover" />
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
                      <p className="text-[13px] text-text-muted mt-0.5">
                        {collection.images.length} {collection.images.length === 1 ? 'Bild' : 'Bilder'}
                      </p>
                    </div>
                    <div className="flex gap-1 opacity-100 transition-opacity">
                      {onUseCollection && <button onClick={() => onUseCollection(collection.id)} className="px-3 py-2 rounded-lg text-[12px] font-medium text-accent-main hover:bg-surface-4">Verwenden</button>}
                      <button
                        aria-label={`Sammlung ${collection.name} bearbeiten`}
                        onClick={() => handleStartEdit(collection)}
                        className="p-1.5 rounded-lg hover:bg-surface-4 text-text-muted hover:text-text-primary transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        aria-label={`Sammlung ${collection.name} löschen`}
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
                    placeholder="z. B. Axel"
                    className="flex-1 bg-surface-2 border border-border-base rounded-xl px-4 py-2.5 text-[13px] text-text-primary placeholder:text-text-muted outline-none focus:border-accent-main/40 focus:ring-1 focus:ring-accent-main/20 transition-all"
                    autoFocus
                  />
                </div>
              </div>

              {/* Images */}
              <div>
                <label className="block text-[13px] font-medium text-text-secondary mb-2">
                  Bilder ({displayImages.length})
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
                        Bilder hier ablegen oder unten hinzufügen
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-5 gap-2">
                      {displayImages.map((img, i) => (
                        <div key={i} className="relative group/img aspect-square">
                          <img src={toDisplayUrl(img)} alt="" className="w-full h-full object-cover rounded-lg border border-border-dim" />
                          <button
                            onClick={() => {
                              setPendingImages((prev) => prev.filter((_, idx) => idx !== i))
                            }}
                            aria-label={`Bild ${i + 1} entfernen`}
                            className="absolute top-1 right-1 w-7 h-7 rounded-full bg-surface-0 border border-border-base flex items-center justify-center opacity-100 transition-opacity hover:bg-danger hover:border-danger hover:text-white text-text-muted"
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
                  <span>Bilder hinzufügen</span>
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-7 py-5 border-t border-border-dim flex justify-end gap-2 shrink-0">
          {view === 'list' && (
            <button
              onClick={handleStartCreate}
              className="btn-interactive px-4 py-2 rounded-xl text-[13px] font-medium bg-accent-main text-surface-0 hover:bg-accent-bright transition-all flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Neue Sammlung
            </button>
          )}
          {view === 'create' && (
            <>
              <button
                onClick={() => { setView('list'); setPendingImages([]) }}
                className="px-4 py-2 rounded-xl text-[13px] text-text-secondary hover:text-text-primary hover:bg-surface-3 transition-colors"
              >
                Verwerfen
              </button>
              <button
                onClick={handleCreate}
                disabled={!name.trim() || pendingImages.length === 0}
                className="px-4 py-2 rounded-xl text-[13px] font-medium bg-text-primary text-surface-0 hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                Erstellen
              </button>
            </>
          )}
          {view === 'edit' && (
            <>
              <button
                onClick={() => { setView('list'); setEditingId(null) }}
                className="px-4 py-2 rounded-xl text-[13px] text-text-secondary hover:text-text-primary hover:bg-surface-3 transition-colors"
              >
                Verwerfen
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={!name.trim()}
                className="px-4 py-2 rounded-xl text-[13px] font-medium bg-text-primary text-surface-0 hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                Speichern
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
