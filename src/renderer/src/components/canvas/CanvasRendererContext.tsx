import { createContext, useContext, useLayoutEffect } from 'react'
import { registerCanvasRenderer } from '../../lib/canvas-automation'
import { useCanvasRenderer } from '../../hooks/useCanvasRenderer'

type CanvasRendererValue = ReturnType<typeof useCanvasRenderer>

const CanvasRendererContext = createContext<CanvasRendererValue | null>(null)

export function CanvasRendererProvider({ children }: { children: React.ReactNode }) {
  const renderer = useCanvasRenderer()
  useLayoutEffect(() => registerCanvasRenderer(renderer), [renderer])
  return (
    <CanvasRendererContext.Provider value={renderer}>
      {children}
    </CanvasRendererContext.Provider>
  )
}

export function useSharedCanvasRenderer(): CanvasRendererValue {
  const ctx = useContext(CanvasRendererContext)
  if (!ctx) throw new Error('useSharedCanvasRenderer must be used within CanvasRendererProvider')
  return ctx
}
