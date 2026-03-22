import { createContext, useContext } from 'react'
import { useCanvasRenderer } from '../../hooks/useCanvasRenderer'

type CanvasRendererValue = ReturnType<typeof useCanvasRenderer>

const CanvasRendererContext = createContext<CanvasRendererValue | null>(null)

export function CanvasRendererProvider({ children }: { children: React.ReactNode }) {
  const renderer = useCanvasRenderer()
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
