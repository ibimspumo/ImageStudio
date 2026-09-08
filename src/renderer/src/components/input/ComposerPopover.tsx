import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Menus escape composer/modal overflow and stay inside the visible window. */
export function ComposerPopover({ children, className, style }: {
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  const anchor = useRef<HTMLSpanElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' })
  useLayoutEffect(() => {
    const update = () => {
      const rect = anchor.current?.parentElement?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(panel.current?.offsetWidth || 340, window.innerWidth - 24)
      const above = rect.top - 16
      const below = window.innerHeight - rect.bottom - 16
      const opensAbove = above >= below
      setPosition({
        position: 'fixed',
        left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        ...(opensAbove ? { bottom: window.innerHeight - rect.top + 8 } : { top: rect.bottom + 8 }),
        maxHeight: Math.max(100, opensAbove ? above : below),
        maxWidth: window.innerWidth - 24,
        overflowY: 'auto',
        zIndex: 80,
      })
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return <>
    <span ref={anchor} className="hidden" />
    {createPortal(<div ref={panel} className={className} style={{ ...style, ...position }}>{children}</div>, document.body)}
  </>
}
