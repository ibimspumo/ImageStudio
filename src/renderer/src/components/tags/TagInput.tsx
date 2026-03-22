import { useState, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

interface TagInputProps {
  tags: string[]
  onTagsChange: (tags: string[]) => void
  suggestions: string[]
}

export function TagInput({ tags, onTagsChange, suggestions }: TagInputProps) {
  const [input, setInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = suggestions.filter(
    (s) => s.toLowerCase().includes(input.toLowerCase()) && !tags.includes(s)
  )

  const addTag = (tag: string) => {
    const trimmed = tag.trim().toLowerCase().replace(/[,\s]+/g, '-')
    if (trimmed && !tags.includes(trimmed)) {
      onTagsChange([...tags, trimmed])
    }
    setInput('')
    setShowSuggestions(false)
  }

  const removeTag = (tag: string) => {
    onTagsChange(tags.filter((t) => t !== tag))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (filtered.length > 0 && input) {
        addTag(filtered[0])
      } else if (input) {
        addTag(input)
      }
    }
    if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1])
    }
    if (e.key === 'Escape') {
      setShowSuggestions(false)
      inputRef.current?.blur()
    }
  }

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-1.5 min-h-[32px]">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent-dim border border-accent-main/20 text-[11px] font-medium text-accent-main"
          >
            #{tag}
            <button
              onClick={() => removeTag(tag)}
              className="p-0.5 rounded hover:bg-accent-main/20 transition-colors"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            setShowSuggestions(true)
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? 'Add tags...' : '+'}
          className="flex-1 min-w-[60px] bg-transparent text-[11px] text-text-primary outline-none placeholder:text-text-muted"
        />
      </div>

      {showSuggestions && input && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-surface-3 border border-border-base rounded-lg shadow-[0_8px_30px_rgba(0,0,0,0.5)] p-1 z-30 max-h-[120px] overflow-y-auto">
          {filtered.slice(0, 8).map((s) => (
            <button
              key={s}
              onMouseDown={(e) => { e.preventDefault(); addTag(s) }}
              className="w-full flex items-center px-2.5 py-1.5 rounded-md text-[11px] text-text-secondary hover:bg-surface-4 hover:text-text-primary transition-colors text-left"
            >
              #{s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
