import { useState, useCallback, type ReactNode } from 'react'
import { ImagePlus } from 'lucide-react'

interface DropZoneProps {
  children: ReactNode
  onFilesDrop: (base64Files: string[]) => void
}

export function DropZone({ children, onFilesDrop }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [dragCount, setDragCount] = useState(0)

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragCount((c) => {
      if (c === 0) setIsDragging(true)
      return c + 1
    })
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragCount((c) => {
      if (c === 1) setIsDragging(false)
      return c - 1
    })
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      setDragCount(0)

      const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
      if (files.length === 0) return

      const base64Files: string[] = []
      for (const file of files) {
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.readAsDataURL(file)
        })
        base64Files.push(base64)
      }

      onFilesDrop(base64Files)
    },
    [onFilesDrop]
  )

  return (
    <div
      className="relative w-full h-full"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}

      {isDragging && (
        <div className="absolute inset-0 z-50 bg-surface-0/90 backdrop-blur-sm flex items-center justify-center animate-overlay-in">
          <div className="drop-active border-2 border-dashed border-accent-main rounded-2xl px-16 py-14 flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-accent-dim flex items-center justify-center">
              <ImagePlus className="w-6 h-6 text-accent-main" />
            </div>
            <div className="text-center">
              <p className="text-[16px] font-medium text-text-primary">Drop images here</p>
              <p className="text-[13px] text-text-muted mt-1">
                Attach as reference for your next generation
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
