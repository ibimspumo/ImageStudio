import { Paintbrush, Eraser, Square, Circle, Minus, Undo2, Redo2, Trash2, X, Layers } from 'lucide-react'
import { useCanvasStore, type CanvasTool } from '../../stores/canvas-store'
import { AspectRatioSelector } from '../input/AspectRatioSelector'
import { ColorPicker } from './ColorPicker'
import { cn } from '../../lib/utils'

interface CanvasToolbarProps {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onClearAll: () => void
  showLayerPanel: boolean
  onToggleLayerPanel: () => void
}

const TOOLS: { tool: CanvasTool; icon: typeof Paintbrush; label: string }[] = [
  { tool: 'brush', icon: Paintbrush, label: 'Brush (B)' },
  { tool: 'eraser', icon: Eraser, label: 'Eraser (E)' },
  { tool: 'rectangle', icon: Square, label: 'Rectangle (R)' },
  { tool: 'circle', icon: Circle, label: 'Circle (C)' },
  { tool: 'line', icon: Minus, label: 'Line (L)' },
]

export function CanvasToolbar({ canUndo, canRedo, onUndo, onRedo, onClearAll, showLayerPanel, onToggleLayerPanel }: CanvasToolbarProps) {
  const activeTool = useCanvasStore((s) => s.activeTool)
  const setTool = useCanvasStore((s) => s.setTool)
  const brushSize = useCanvasStore((s) => s.brushSize)
  const setBrushSize = useCanvasStore((s) => s.setBrushSize)
  const brushColor = useCanvasStore((s) => s.brushColor)
  const setBrushColor = useCanvasStore((s) => s.setBrushColor)
  const eraserSize = useCanvasStore((s) => s.eraserSize)
  const setEraserSize = useCanvasStore((s) => s.setEraserSize)
  const shapeFill = useCanvasStore((s) => s.shapeFill)
  const setShapeFill = useCanvasStore((s) => s.setShapeFill)
  const aspectRatio = useCanvasStore((s) => s.aspectRatio)
  const setAspectRatio = useCanvasStore((s) => s.setAspectRatio)
  const customRatio = useCanvasStore((s) => s.customRatio)
  const close = useCanvasStore((s) => s.close)

  const isShapeTool = activeTool === 'rectangle' || activeTool === 'circle' || activeTool === 'line'
  const currentSize = activeTool === 'eraser' ? eraserSize : brushSize
  const setCurrentSize = activeTool === 'eraser' ? setEraserSize : setBrushSize

  return (
    <div className="shrink-0 flex items-center gap-2 px-5 py-3 border-b border-border-dim" style={{ paddingLeft: '80px' }}>
      <h2 className="text-[14px] font-semibold text-text-primary mr-2">Canvas</h2>

      {/* Tool buttons */}
      <div className="flex items-center gap-1">
        {TOOLS.map(({ tool, icon: Icon, label }) => (
          <button
            key={tool}
            onClick={() => setTool(tool)}
            className={cn(
              'flex items-center justify-center w-8 h-8 rounded-lg border transition-all',
              activeTool === tool
                ? 'bg-accent-main/20 border-accent-main/30 text-accent-bright'
                : 'bg-surface-3 hover:bg-surface-4 border-border-base text-text-secondary hover:text-text-primary'
            )}
            title={label}
          >
            <Icon className="w-3.5 h-3.5" />
          </button>
        ))}
      </div>

      <div className="w-px h-4 bg-border-dim/40 mx-1" />

      {/* Color picker — not for eraser */}
      {activeTool !== 'eraser' && (
        <ColorPicker value={brushColor} onChange={setBrushColor} />
      )}

      {/* Size slider */}
      <div className="flex items-center gap-2 ml-1">
        <span className="text-[11px] text-text-muted">Size</span>
        <input
          type="range"
          min="1"
          max="100"
          value={currentSize}
          onChange={(e) => setCurrentSize(parseInt(e.target.value))}
          className="w-20 h-1 rounded-full appearance-none bg-surface-4 accent-accent-main cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-main"
        />
        <span className="text-[10px] text-text-muted w-7">{currentSize}px</span>
      </div>

      {/* Shape fill toggle */}
      {isShapeTool && (
        <>
          <div className="w-px h-4 bg-border-dim/40 mx-1" />
          <button
            onClick={() => setShapeFill(!shapeFill)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-all',
              shapeFill
                ? 'bg-accent-main/20 border-accent-main/30 text-accent-bright'
                : 'bg-surface-3 hover:bg-surface-4 border-border-base text-text-secondary hover:text-text-primary'
            )}
            title="Fill shape"
          >
            {shapeFill ? 'Filled' : 'Stroke'}
          </button>
        </>
      )}

      <div className="w-px h-4 bg-border-dim/40 mx-1" />

      {/* Undo/Redo */}
      <button
        onClick={onUndo}
        disabled={!canUndo}
        className="flex items-center justify-center w-8 h-8 rounded-lg bg-surface-3 border border-border-dim text-text-secondary hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        title="Undo (⌘Z)"
      >
        <Undo2 className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={onRedo}
        disabled={!canRedo}
        className="flex items-center justify-center w-8 h-8 rounded-lg bg-surface-3 border border-border-dim text-text-secondary hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        title="Redo (⌘⇧Z)"
      >
        <Redo2 className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={onClearAll}
        className="flex items-center justify-center w-8 h-8 rounded-lg bg-surface-3 border border-border-dim text-text-secondary hover:text-text-primary transition-all"
        title="Clear all"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>

      <div className="w-px h-4 bg-border-dim/40 mx-1" />

      {/* Aspect ratio */}
      <AspectRatioSelector
        value={aspectRatio}
        onChange={(v) => setAspectRatio(v)}
        customRatio={customRatio}
        onCustomRatioChange={(v) => setAspectRatio('custom', v)}
      />

      {/* Layer panel toggle */}
      <button
        onClick={onToggleLayerPanel}
        className={cn(
          'flex items-center justify-center w-8 h-8 rounded-lg border transition-all',
          showLayerPanel
            ? 'bg-accent-main/20 border-accent-main/30 text-accent-bright'
            : 'bg-surface-3 hover:bg-surface-4 border-border-base text-text-secondary hover:text-text-primary'
        )}
        title="Layers"
      >
        <Layers className="w-3.5 h-3.5" />
      </button>

      <div className="flex-1" />

      {/* Close */}
      <button
        onClick={close}
        className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  )
}
