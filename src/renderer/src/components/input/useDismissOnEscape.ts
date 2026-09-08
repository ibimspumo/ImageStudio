import { useEffect, useRef } from 'react'

const openMenus: symbol[] = []

/** Escape closes the most recently opened composer menu first. */
export function useDismissOnEscape(open: boolean, close: () => void) {
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => {
    if (!open) return
    const token = Symbol('composer-menu')
    openMenus.push(token)
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || openMenus.at(-1) !== token) return
      event.preventDefault()
      event.stopImmediatePropagation()
      closeRef.current()
    }
    window.addEventListener('keydown', handler)
    return () => {
      const index = openMenus.indexOf(token)
      if (index >= 0) openMenus.splice(index, 1)
      window.removeEventListener('keydown', handler)
    }
  }, [open])
}
