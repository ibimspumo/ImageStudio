import { useState, useRef, useCallback } from 'react'
import { compressImage } from '../lib/image-utils'
import { logger } from '../lib/logger'
import type { ImageRef } from '../types/api'

let nextImageNum = 1

export function useImageRefs() {
  const [imageRefs, setImageRefs] = useState<ImageRef[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const addImageRef = useCallback((base64: string, customName?: string): ImageRef => {
    let found: ImageRef | undefined
    setImageRefs((prev) => {
      found = prev.find((r) => r.base64 === base64)
      if (found) return prev
      const ref: ImageRef = {
        id: crypto.randomUUID(),
        name: customName || `Image ${nextImageNum++}`,
        base64,
      }
      found = ref
      return [...prev, ref]
    })
    return found!
  }, [])

  const removeImageRef = useCallback((id: string) => {
    setImageRefs((prev) => prev.filter((r) => r.id !== id))
  }, [])

  const clearImageRefs = useCallback(() => {
    setImageRefs([])
  }, [])

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue
      try {
        const raw = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.readAsDataURL(file)
        })
        const compressed = await compressImage(raw)
        addImageRef(compressed)
      } catch (err) {
        logger.error('useImageRefs', 'Failed to read/compress file', err)
      }
    }
    e.target.value = ''
  }, [addImageRef])

  const handleImageDrop = useCallback(async (e: React.DragEvent) => {
    // Check for internal drag (gallery image file path)
    const internalData = e.dataTransfer.getData('application/x-imagestudio')
    if (internalData) {
      try {
        const result = await window.api.readImage(internalData)
        if (result.success) {
          const compressed = await compressImage(result.base64DataUrl)
          addImageRef(compressed)
        }
      } catch (err) {
        logger.error('useImageRefs', 'Failed to load internal drag image', err)
      }
      return
    }
    // External file drop
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
    for (const file of files) {
      try {
        const raw = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.readAsDataURL(file)
        })
        const compressed = await compressImage(raw)
        addImageRef(compressed)
      } catch (err) {
        logger.error('useImageRefs', 'Failed to read/compress dropped file', err)
      }
    }
  }, [addImageRef])

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  return {
    imageRefs,
    setImageRefs,
    fileInputRef,
    addImageRef,
    removeImageRef,
    clearImageRefs,
    handleFileSelect,
    handleImageDrop,
    openFilePicker,
  }
}
