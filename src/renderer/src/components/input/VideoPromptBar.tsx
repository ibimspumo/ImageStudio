import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Plus, Send, XCircle, Settings, ImageIcon, Volume2, VolumeX, Lock, Unlock } from 'lucide-react'
import { useVideoGeneration } from '../../hooks/useVideoGeneration'
import { useSettingsStore } from '../../stores/settings-store'
import { AVAILABLE_VIDEO_MODELS, DEFAULT_VIDEO_MODEL, estimateVideoCost } from '../../types/api'
import type { AspectRatio, FalAspectRatio } from '../../types/api'
import { cn } from '../../lib/utils'
import { logger } from '../../lib/logger'
import { compressImage } from '../../lib/image-utils'
import { VideoModelSelector } from './VideoModelSelector'
import { DurationSelector } from './DurationSelector'
import { VideoResolutionSelector } from './VideoResolutionSelector'
import { AspectRatioSelector } from './AspectRatioSelector'

interface VideoPromptBarProps {
  onSettingsClick?: () => void
  initialStartFrame?: { base64: string; name: string } | null
}

export function VideoPromptBar({ onSettingsClick, initialStartFrame }: VideoPromptBarProps) {
  const [selectedModel, setSelectedModel] = useState(DEFAULT_VIDEO_MODEL)
  const [duration, setDuration] = useState(5)
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9')
  const [customRatio, setCustomRatio] = useState('4:3')
  const [resolution, setResolution] = useState('720p')
  const [generateAudio, setGenerateAudio] = useState(true)
  const [cameraFixed, setCameraFixed] = useState(false)
  const [startFrame, setStartFrame] = useState<{ base64: string; name: string } | null>(initialStartFrame ?? null)
  const editorRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { generateVideo } = useVideoGeneration()
  const falApiKey = useSettingsStore((s) => s.falApiKey)

  // Get model config for dynamic options
  const modelConfig = AVAILABLE_VIDEO_MODELS.find((m) => m.id === selectedModel)
  const durationOptions = modelConfig?.durations ?? [5, 10]

  const resolutionOptions = modelConfig?.resolutions ?? ['720p']
  // Video models accept a narrower set of ratios than the image models do
  const aspectRatioOptions = (modelConfig?.aspectRatios ?? ['16:9', '9:16', '1:1']) as FalAspectRatio[]

  // Clamp duration and resolution if model changes
  useEffect(() => {
    if (!durationOptions.includes(duration)) {
      setDuration(modelConfig?.defaultDuration ?? durationOptions[0])
    }
    if (!resolutionOptions.includes(resolution)) {
      setResolution(modelConfig?.defaultResolution ?? resolutionOptions[0])
    }
  }, [selectedModel, duration, durationOptions, resolution, resolutionOptions, modelConfig])

  // Accept initial start frame from parent
  useEffect(() => {
    if (initialStartFrame) {
      setStartFrame(initialStartFrame)
    }
  }, [initialStartFrame])

  // ── Prompt text extraction ────────────────────────────────────────

  const getPromptText = useCallback((): string => {
    const editor = editorRef.current
    if (!editor) return ''
    let text = ''
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent || ''
      } else if (node instanceof HTMLElement) {
        if (node.tagName === 'BR') {
          text += '\n'
        } else {
          for (const child of Array.from(node.childNodes)) walk(child)
        }
      }
    }
    for (const child of Array.from(editor.childNodes)) walk(child)
    return text.trim()
  }, [])

  // ── Editor keyboard handling ──────────────────────────────────────

  const handleSubmit = useCallback(() => {
    const prompt = getPromptText()
    if (!prompt || !startFrame || !falApiKey) return

    generateVideo({
      prompt,
      model: selectedModel,
      duration,
      aspectRatio: aspectRatio === 'custom' ? customRatio : aspectRatio,
      resolution,
      startFrameBase64: startFrame.base64,
      generateAudio,
      cameraFixed: cameraFixed || undefined,
    })

    // Keep prompt text (same behavior as image PromptBar)
  }, [getPromptText, startFrame, falApiKey, generateVideo, selectedModel, duration, aspectRatio, customRatio])

  const handleEditorKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault()
      document.execCommand('insertLineBreak')
    }
  }, [handleSubmit])

  // ── File handling ─────────────────────────────────────────────────

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const reader = new FileReader()
      reader.onload = async () => {
        const base64 = reader.result as string
        const compressed = await compressImage(base64, 1024)
        setStartFrame({ base64: compressed, name: file.name })
      }
      reader.readAsDataURL(file)
    } catch (err) {
      logger.error('VideoPromptBar', 'Failed to read file', err)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    const filePath = e.dataTransfer.getData('text/plain')
    if (filePath && (filePath.endsWith('.png') || filePath.endsWith('.jpg') || filePath.endsWith('.jpeg') || filePath.endsWith('.webp'))) {
      try {
        const result = await window.api.readImage(filePath)
        if (result.success && result.base64DataUrl) {
          const compressed = await compressImage(result.base64DataUrl, 1024)
          setStartFrame({ base64: compressed, name: 'Start Frame' })
          return
        }
      } catch (err) {
        logger.error('VideoPromptBar', 'Failed to read dropped file', err)
      }
    }
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = async () => {
        const base64 = reader.result as string
        const compressed = await compressImage(base64, 1024)
        setStartFrame({ base64: compressed, name: file.name })
      }
      reader.readAsDataURL(file)
    }
  }, [])

  const promptText = getPromptText()
  const canSend = !!promptText && !!startFrame && !!falApiKey
  const hasContent = !!promptText || !!startFrame

  // Live cost estimate
  const estimatedCost = useMemo(
    () => estimateVideoCost(selectedModel, duration, generateAudio),
    [selectedModel, duration, generateAudio]
  )

  return (
    <div className="shrink-0 flex flex-col items-center px-6 pb-6 pt-3">
    <div
      className="w-full max-w-[800px] relative bg-surface-1 border border-border-base rounded-2xl shadow-lg"
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      {/* Start frame preview */}
      {startFrame && (
        <div className="flex items-center gap-2 px-4 pt-3">
          <div className="relative w-16 h-10 rounded-lg overflow-hidden border border-border-dim shrink-0">
            <img src={startFrame.base64} alt="Start frame" className="w-full h-full object-cover" />
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-[11px] font-medium text-text-secondary">Start Frame</span>
          </div>
          <button
            onClick={() => setStartFrame(null)}
            className="p-1 text-text-muted hover:text-text-primary transition-colors"
          >
            <XCircle className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* No start frame hint */}
      {!startFrame && (
        <div className="flex items-center gap-2 px-4 pt-3">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-dashed border-border-base bg-surface-2 hover:bg-surface-3 cursor-pointer transition-colors"
          >
            <ImageIcon className="w-3.5 h-3.5 text-text-muted" />
            <span className="text-[11px] text-text-muted">Add start frame image (required)</span>
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Prompt editor */}
      <div className="px-4 py-3">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          className="min-h-[48px] max-h-[120px] overflow-y-auto text-[14px] text-text-primary outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-text-muted"
          data-placeholder="Describe the motion, action, or camera movement..."
          onKeyDown={handleEditorKeyDown}
        />
      </div>

      {/* Separator */}
      <div className="mx-4 h-px bg-border-dim/60" />

      {/* Controls */}
      <div className="flex items-center gap-1 px-4 py-3">
        <VideoModelSelector selectedModel={selectedModel} onChange={setSelectedModel} />
        <div className="w-px h-4 bg-border-dim/40 mx-0.5" />
        <DurationSelector value={duration} options={durationOptions} onChange={setDuration} />
        <div className="w-px h-4 bg-border-dim/40 mx-0.5" />
        <VideoResolutionSelector value={resolution} options={resolutionOptions} onChange={setResolution} />
        <div className="w-px h-4 bg-border-dim/40 mx-0.5" />
        <AspectRatioSelector
          value={aspectRatio}
          onChange={setAspectRatio}
          customRatio={customRatio}
          onCustomRatioChange={setCustomRatio}
          available={aspectRatioOptions}
        />

        <div className="w-px h-4 bg-border-dim/40 mx-0.5" />

        {/* Audio toggle */}
        {modelConfig?.supportsAudio && (
          <button
            onClick={() => setGenerateAudio(!generateAudio)}
            className={cn(
              'no-drag flex items-center justify-center w-8 h-8 rounded-lg border transition-all',
              generateAudio
                ? 'bg-accent-main/20 border-accent-main/30 text-accent-bright'
                : 'bg-surface-3 hover:bg-surface-4 border-border-base text-text-secondary hover:text-text-primary'
            )}
            title={generateAudio ? 'Audio enabled — click to disable' : 'Audio disabled — click to enable'}
          >
            {generateAudio ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>
        )}

        {/* Camera fixed toggle */}
        {modelConfig?.supportsCameraFixed && (
          <button
            onClick={() => setCameraFixed(!cameraFixed)}
            className={cn(
              'no-drag flex items-center justify-center w-8 h-8 rounded-lg border transition-all',
              cameraFixed
                ? 'bg-accent-main/20 border-accent-main/30 text-accent-bright'
                : 'bg-surface-3 hover:bg-surface-4 border-border-base text-text-secondary hover:text-text-primary'
            )}
            title={cameraFixed ? 'Camera locked (tripod) — click to unlock' : 'Camera free — click to lock (tripod shot)'}
          >
            {cameraFixed ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
          </button>
        )}

        <div className="w-px h-4 bg-border-dim/40 mx-0.5" />

        <button
          onClick={() => fileInputRef.current?.click()}
          className="no-drag flex items-center justify-center w-8 h-8 rounded-lg bg-surface-3 hover:bg-surface-4 border border-border-base text-text-secondary hover:text-text-primary transition-all"
          title="Add start frame"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>

        {onSettingsClick && (
          <button
            onClick={onSettingsClick}
            className="no-drag flex items-center justify-center w-8 h-8 rounded-lg bg-surface-3 hover:bg-surface-4 border border-border-base text-text-secondary hover:text-text-primary transition-all"
            title="Settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        )}

        <div className="flex-1" />

        {hasContent && (
          <button
            onClick={() => {
              if (editorRef.current) editorRef.current.innerHTML = ''
              setStartFrame(null)
            }}
            className="no-drag flex items-center justify-center w-8 h-8 rounded-lg text-text-muted hover:text-text-secondary hover:bg-surface-3 transition-all"
            title="Clear"
          >
            <XCircle className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Cost estimate */}
        <span className="text-[10px] text-text-muted font-medium tabular-nums mr-1">
          ~${estimatedCost.toFixed(2)}
        </span>

        <button
          onClick={handleSubmit}
          disabled={!canSend}
          className={cn(
            'no-drag btn-interactive flex items-center justify-center h-9 rounded-xl transition-all',
            canSend
              ? 'bg-accent-main hover:bg-accent-bright text-white px-4 gap-2 glow-accent shadow-lg'
              : 'bg-surface-3 text-text-muted cursor-not-allowed w-9'
          )}
        >
          <Send className="w-4 h-4" />
          {canSend && <span className="text-[12px] font-semibold tracking-wide">Generate</span>}
        </button>
      </div>
    </div>
    </div>
  )
}
