import { useState, useEffect } from 'react'
import { useCanvasStore } from '../../stores/canvas-store'
import { CanvasRendererProvider, useSharedCanvasRenderer } from './CanvasRendererContext'
import { CanvasToolbar } from './CanvasToolbar'
import { CanvasWorkspace } from './CanvasWorkspace'
import { LayerPanel } from './LayerPanel'
import { ExpertModePanel } from './ExpertModePanel'
import { CanvasPromptArea } from './CanvasPromptArea'

export function CanvasModal() {
  return (
    <CanvasRendererProvider>
      <CanvasModalInner />
    </CanvasRendererProvider>
  )
}

function CanvasModalInner() {
  const close = useCanvasStore((s) => s.close)
  const undoStackSize = useCanvasStore((s) => s.undoStackSize)
  const redoStackSize = useCanvasStore((s) => s.redoStackSize)
  const mode = useCanvasStore((s) => s.mode)

  const [showLayerPanel, setShowLayerPanel] = useState(true)
  const { undo, redo, clearAll, exportComposite } = useSharedCanvasRenderer()

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in an input/contenteditable
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        // Only handle Escape in inputs
        if (e.key === 'Escape') { e.preventDefault(); close() }
        return
      }

      if (e.key === 'Escape') { e.preventDefault(); close() }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo() }
      if (e.key === 'b' || e.key === 'B') { useCanvasStore.getState().setTool('brush') }
      if (e.key === 'e' || e.key === 'E') { useCanvasStore.getState().setTool('eraser') }
      if (e.key === 'r' || e.key === 'R') { useCanvasStore.getState().setTool('rectangle') }
      if (e.key === 'c' || e.key === 'C') { useCanvasStore.getState().setTool('circle') }
      if (e.key === 'l' || e.key === 'L') { useCanvasStore.getState().setTool('line') }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [close, undo, redo])

  const canvasContext = {
    getCanvasBase64: exportComposite,
    onClose: close,
  }

  return (
    <div className="absolute inset-0 z-[70] bg-surface-0 flex flex-col">
      <CanvasToolbar
        canUndo={undoStackSize > 0}
        canRedo={redoStackSize > 0}
        onUndo={undo}
        onRedo={redo}
        onClearAll={clearAll}
        showLayerPanel={showLayerPanel}
        onToggleLayerPanel={() => setShowLayerPanel(!showLayerPanel)}
      />

      <div className="flex-1 flex min-h-0">
        {showLayerPanel && <LayerPanel />}
        <div className="flex-1 flex flex-col min-w-0">
          <CanvasWorkspace />
          <CanvasPromptArea canvasContext={canvasContext} />
        </div>
        {mode === 'expert' && <ExpertModePanel />}
      </div>
    </div>
  )
}
