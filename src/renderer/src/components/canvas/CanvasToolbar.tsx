import { useRef, useState } from 'react'
import { useSharedCanvasRenderer } from './CanvasRendererContext'
import { Paintbrush, Eraser, Square, Circle, Minus, Undo2, Redo2, Trash2, X, Layers, Upload, Download } from 'lucide-react'
import { useCanvasStore, type CanvasTool } from '../../stores/canvas-store'
import { getCombinedCapabilities } from '../../types/api'
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
  { tool: 'brush', icon: Paintbrush, label: 'Pinsel (B)' },
  { tool: 'eraser', icon: Eraser, label: 'Radierer (E)' },
  { tool: 'rectangle', icon: Square, label: 'Rechteck (R)' },
  { tool: 'circle', icon: Circle, label: 'Kreis (C)' },
  { tool: 'line', icon: Minus, label: 'Linie (L)' },
]

export function CanvasToolbar({ canUndo, canRedo, onUndo, onRedo, onClearAll, showLayerPanel, onToggleLayerPanel }: CanvasToolbarProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [mediaMessage, setMediaMessage] = useState('')
  const { importImage, exportComposite } = useSharedCanvasRenderer()
  const importFile = async (file?: File) => {
    if (!file) return
    try {
      const layerId = useCanvasStore.getState().activeLayerId
      if (!layerId) throw new Error('Wähle zuerst eine Ebene.')
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error('Das Bild konnte nicht gelesen werden.'))
        reader.readAsDataURL(file)
      })
      await importImage(layerId, dataUrl)
      setMediaMessage('Bild importiert')
    } catch (error) { setMediaMessage(error instanceof Error ? error.message : String(error)) }
  }
  const exportFile = async () => {
    try {
      const data = exportComposite()
      if (!data) throw new Error('Die Zeichenfläche ist noch nicht bereit.')
      const result = await window.api.saveImage(data, `canvas-export-${crypto.randomUUID()}.png`)
      if (!result.success) throw new Error(result.error || 'Die Skizze konnte nicht exportiert werden.')
      setMediaMessage(`Gespeichert: ${result.filePath}`)
    } catch (error) { setMediaMessage(error instanceof Error ? error.message : String(error)) }
  }
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
    <div className="shrink-0 flex flex-wrap items-center gap-2 px-5 py-3 border-b border-border-dim" style={{ paddingLeft: '80px' }}>
      <h2 className="text-[14px] font-semibold text-text-primary mr-2">Referenzskizze</h2>

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
            title={label} aria-label={label}
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
        <span className="text-[12px] text-text-muted">Größe</span>
        <input
          type="range"
          min="1"
          max="100"
          value={currentSize}
          onChange={(e) => setCurrentSize(parseInt(e.target.value))}
          className="w-20 h-1 rounded-full appearance-none bg-surface-4 accent-accent-main cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-main"
        />
        <span className="text-[12px] text-text-muted w-7">{currentSize}px</span>
      </div>

      {/* Shape fill toggle */}
      {isShapeTool && (
        <>
          <div className="w-px h-4 bg-border-dim/40 mx-1" />
          <button
            onClick={() => setShapeFill(!shapeFill)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[12px] font-medium transition-all',
              shapeFill
                ? 'bg-accent-main/20 border-accent-main/30 text-accent-bright'
                : 'bg-surface-3 hover:bg-surface-4 border-border-base text-text-secondary hover:text-text-primary'
            )}
            title="Form füllen"
          >
            {shapeFill ? 'Gefüllt' : 'Kontur'}
          </button>
        </>
      )}

      <div className="w-px h-4 bg-border-dim/40 mx-1" />

      {/* Undo/Redo */}
      <button
        onClick={onUndo}
        disabled={!canUndo}
        className="flex items-center justify-center w-8 h-8 rounded-lg bg-surface-3 border border-border-dim text-text-secondary hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        title="Rückgängig (⌘Z)"
      >
        <Undo2 className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={onRedo}
        disabled={!canRedo}
        className="flex items-center justify-center w-8 h-8 rounded-lg bg-surface-3 border border-border-dim text-text-secondary hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        title="Wiederholen (⌘⇧Z)"
      >
        <Redo2 className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={onClearAll}
        className="flex items-center justify-center w-8 h-8 rounded-lg bg-surface-3 border border-border-dim text-text-secondary hover:text-text-primary transition-all"
        title="Zeichenfläche leeren"
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
        available={getCombinedCapabilities([]).aspectRatios}
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
        title="Ebenen"
      >
        <Layers className="w-3.5 h-3.5" />
      </button>

      <input ref={fileInput} type="file" accept="image/*" className="hidden"
        onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = '' }} />
      <button onClick={() => fileInput.current?.click()} title="Bild in aktive Ebene importieren" aria-label="Bild importieren"
        className="flex items-center justify-center w-8 h-8 rounded-lg bg-surface-3 border border-border-dim text-text-secondary hover:text-text-primary">
        <Upload className="w-3.5 h-3.5" />
      </button>
      <button onClick={() => void exportFile()} title="Skizze als PNG exportieren" aria-label="Skizze als PNG exportieren"
        className="flex items-center justify-center w-8 h-8 rounded-lg bg-surface-3 border border-border-dim text-text-secondary hover:text-text-primary">
        <Download className="w-3.5 h-3.5" />
      </button>
      {mediaMessage && <span role="status" title={mediaMessage} className="max-w-32 truncate text-[12px] text-text-muted">{mediaMessage}</span>}

      <div className="flex-1" />

      {/* Close */}
      <button
        aria-label="Referenzskizze schließen"
        onClick={close}
        className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  )
}
