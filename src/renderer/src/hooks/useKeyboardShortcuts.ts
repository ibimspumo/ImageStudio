import { useEffect, useCallback } from 'react'

interface ShortcutActions {
  focusPromptBar?: () => void
  focusSearch?: () => void
  toggleFavoritesFilter?: () => void
  showShortcutsHelp?: () => void
}

function isTextInputFocused(): boolean {
  const el = document.activeElement
  if (!el) return false
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return true
  if ((el as HTMLElement).contentEditable === 'true') return true
  return false
}

export function useKeyboardShortcuts(actions: ShortcutActions) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Cmd+F -> focus search
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault()
      actions.focusSearch?.()
      return
    }

    // Don't trigger single-key shortcuts when typing
    if (isTextInputFocused()) return

    switch (e.key) {
      case 'g':
      case 'G':
        e.preventDefault()
        actions.focusPromptBar?.()
        break
      case '?':
        e.preventDefault()
        actions.showShortcutsHelp?.()
        break
      case 's':
      case 'S':
        if (!e.metaKey && !e.ctrlKey) {
          e.preventDefault()
          actions.toggleFavoritesFilter?.()
        }
        break
    }
  }, [actions])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
