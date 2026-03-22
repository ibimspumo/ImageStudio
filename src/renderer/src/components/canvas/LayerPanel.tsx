import { useRef, useState } from 'react'
import { Eye, EyeOff, Trash2, Plus, GripVertical } from 'lucide-react'
import { useCanvasStore } from '../../stores/canvas-store'
import { cn } from '../../lib/utils'

export function LayerPanel() {
  const layers = useCanvasStore((s) => s.layers)
  const activeLayerId = useCanvasStore((s) => s.activeLayerId)
  const setActiveLayer = useCanvasStore((s) => s.setActiveLayer)
  const toggleLayerVisibility = useCanvasStore((s) => s.toggleLayerVisibility)
  const setLayerOpacity = useCanvasStore((s) => s.setLayerOpacity)
  const removeLayer = useCanvasStore((s) => s.removeLayer)
  const addLayer = useCanvasStore((s) => s.addLayer)
  const reorderLayers = useCanvasStore((s) => s.reorderLayers)

  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const dragRef = useRef<number | null>(null)

  const handleDragStart = (index: number) => {
    dragRef.current = index
    setDragIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDropIndex(index)
  }

  const handleDrop = (index: number) => {
    if (dragRef.current !== null && dragRef.current !== index) {
      reorderLayers(dragRef.current, index)
    }
    dragRef.current = null
    setDragIndex(null)
    setDropIndex(null)
  }

  const handleDragEnd = () => {
    dragRef.current = null
    setDragIndex(null)
    setDropIndex(null)
  }

  // Display layers in reverse order (top layer first visually)
  const displayLayers = [...layers].reverse()

  return (
    <div className="w-[200px] bg-surface-1 border-r border-border-dim flex flex-col shrink-0">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border-dim">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Layers</span>
        <button
          onClick={addLayer}
          disabled={layers.length >= 8}
          className="flex items-center justify-center w-6 h-6 rounded-md bg-surface-3 hover:bg-surface-4 border border-border-dim text-text-secondary hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          title={layers.length >= 8 ? 'Max 8 layers' : 'Add layer'}
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {displayLayers.map((layer) => {
          const realIndex = layers.findIndex((l) => l.id === layer.id)
          const isActive = layer.id === activeLayerId
          const isDragging = dragIndex !== null && layers[dragIndex]?.id === layer.id
          const isDropTarget = dropIndex !== null && layers[dropIndex]?.id === layer.id

          return (
            <div
              key={layer.id}
              draggable
              onDragStart={() => handleDragStart(realIndex)}
              onDragOver={(e) => handleDragOver(e, realIndex)}
              onDrop={() => handleDrop(realIndex)}
              onDragEnd={handleDragEnd}
              onClick={() => setActiveLayer(layer.id)}
              className={cn(
                'flex items-center gap-1.5 px-2 py-1.5 mx-1 rounded-lg cursor-pointer transition-all',
                isActive ? 'bg-accent-dim border border-accent-main/20' : 'border border-transparent hover:bg-surface-2',
                isDragging && 'opacity-50',
                isDropTarget && 'border-accent-main/40'
              )}
            >
              <GripVertical className="w-3 h-3 text-text-muted/50 shrink-0 cursor-grab" />

              <button
                onClick={(e) => { e.stopPropagation(); toggleLayerVisibility(layer.id) }}
                className="shrink-0 w-5 h-5 flex items-center justify-center text-text-muted hover:text-text-primary transition-colors"
              >
                {layer.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3 opacity-50" />}
              </button>

              <span className={cn(
                'flex-1 text-[11px] font-medium truncate',
                isActive ? 'text-text-primary' : 'text-text-secondary'
              )}>
                {layer.name}
              </span>

              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(layer.opacity * 100)}
                onChange={(e) => { e.stopPropagation(); setLayerOpacity(layer.id, parseInt(e.target.value) / 100) }}
                onClick={(e) => e.stopPropagation()}
                className="w-12 h-0.5 rounded-full appearance-none bg-surface-4 accent-accent-main cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-main"
                title={`Opacity: ${Math.round(layer.opacity * 100)}%`}
              />

              {layers.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); removeLayer(layer.id) }}
                  className="shrink-0 w-5 h-5 flex items-center justify-center text-text-muted hover:text-danger transition-colors"
                  title="Delete layer"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
