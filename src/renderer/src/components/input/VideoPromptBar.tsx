import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Plus, Send, XCircle, Settings, ImageIcon, Volume2, VolumeX, Lock } from 'lucide-react'
import { useVideoGeneration } from '../../hooks/useVideoGeneration'
import { useSettingsStore } from '../../stores/settings-store'
import { AVAILABLE_VIDEO_MODELS, DEFAULT_VIDEO_MODEL, estimateVideoCost, getVideoModelName } from '../../types/api'
import type { AspectRatio, FalAspectRatio } from '../../types/api'
import { cn } from '../../lib/utils'
import { logger } from '../../lib/logger'
import { compressImage } from '../../lib/image-utils'
import { VideoModelSelector } from './VideoModelSelector'
import { DurationSelector } from './DurationSelector'
import { TuneMenu, TuneGroup, TuneOption, TuneRow, TuneRatioOptions } from './TunePanel'

interface VideoPromptBarProps {
  onSettingsClick?: () => void
  initialStartFrame?: { base64: string; name: string } | null
}

/**
 * The video prompt bar — same shell as the image bar: prompt card, slim
 * controls (model · duration · Tune · Generate), collapse to a summary row.
 * No @-mentions or collections, the video API takes exactly one start frame.
 */
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

  // The editor is a contenteditable — its text lives in the DOM, so it is
  // mirrored into state on input, same as the image bar, to keep the Generate
  // button and the collapsed preview in sync.
  const [promptText, setPromptText] = useState('')
  const handleEditorInput = useCallback(() => setPromptText(getPromptText()), [getPromptText])

  // ── Collapse (same mechanics as PromptBar) ────────────────────────

  const [expanded, setExpanded] = useState(true)
  const cardWrapRef = useRef<HTMLDivElement>(null)

  const expandAndFocus = useCallback(() => {
    setExpanded(true)
    requestAnimationFrame(() => editorRef.current?.focus())
  }, [])

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!cardWrapRef.current) return
      if (!cardWrapRef.current.contains(e.target as Node)) setExpanded(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  const [contentOverflow, setContentOverflow] = useState<'hidden' | 'visible'>('visible')
  useEffect(() => {
    if (!expanded) {
      setContentOverflow('hidden')
      return
    }
    const t = setTimeout(() => setContentOverflow('visible'), 400)
    return () => clearTimeout(t)
  }, [expanded])

  // ── Submit ────────────────────────────────────────────────────────

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
  }, [getPromptText, startFrame, falApiKey, generateVideo, selectedModel, duration, aspectRatio, customRatio, resolution, generateAudio, cameraFixed])

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
    setExpanded(true)
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

  const canSend = !!promptText && !!startFrame && !!falApiKey
  const hasContent = !!promptText || !!startFrame

  // Live cost estimate
  const estimatedCost = useMemo(
    () => estimateVideoCost(selectedModel, duration, generateAudio),
    [selectedModel, duration, generateAudio]
  )

  const defaultResolution = modelConfig?.defaultResolution ?? resolutionOptions[0]
  const tuneBadge = [
    resolution !== defaultResolution,
    aspectRatio !== '16:9',
    !!modelConfig?.supportsAudio && !generateAudio,
    cameraFixed,
  ].filter(Boolean).length

  const collapsedSummary = [
    getVideoModelName(selectedModel),
    `${duration}s`,
    resolution,
    startFrame ? 'Frame ✓' : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="shrink-0 flex flex-col items-center px-6 pb-6 pt-3">
      <div ref={cardWrapRef} className="w-full max-w-[800px] relative">
        <div
          className={cn(
            'prompt-card grain relative border border-border-base rounded-2xl transition-all',
            !expanded && 'cursor-text hover:border-border-bright'
          )}
          onClick={!expanded ? expandAndFocus : undefined}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          {/* Top luminous edge */}
          <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

          {/* Collapsed summary row */}
          <div
            className="collapse-seg"
            style={{ gridTemplateRows: expanded ? '0fr' : '1fr', opacity: expanded ? 0 : 1 }}
            aria-hidden={expanded}
          >
            <div>
              <div className="flex items-center gap-3 pl-4 pr-2.5 h-[52px]">
                <span
                  className={cn(
                    'flex-1 min-w-0 truncate text-[13.5px]',
                    promptText ? 'text-text-primary' : 'text-text-muted'
                  )}
                >
                  {promptText || 'Describe the motion, action, or camera movement...'}
                </span>
                <span className="shrink-0 text-[11px] text-text-muted whitespace-nowrap">
                  {collapsedSummary}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleSubmit()
                  }}
                  disabled={!canSend}
                  tabIndex={expanded ? -1 : 0}
                  className={cn(
                    'no-drag btn-interactive shrink-0 w-8 h-8 rounded-[10px] flex items-center justify-center transition-all',
                    canSend
                      ? 'bg-accent-main hover:bg-accent-bright text-white glow-accent'
                      : 'bg-surface-3 text-text-muted cursor-not-allowed'
                  )}
                  title="Generate"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Full content */}
          <div
            className="collapse-seg"
            style={{ gridTemplateRows: expanded ? '1fr' : '0fr', opacity: expanded ? 1 : 0 }}
            aria-hidden={!expanded}
            onTransitionEnd={() => {
              if (expanded) setContentOverflow('visible')
            }}
          >
            <div style={{ overflow: contentOverflow }}>
              {/* Start frame preview */}
              {startFrame ? (
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
              ) : (
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
                  className="prompt-editor min-h-[48px] max-h-[120px] overflow-y-auto text-[14px] text-text-primary leading-relaxed outline-none"
                  data-placeholder="Describe the motion, action, or camera movement..."
                  onInput={handleEditorInput}
                  onKeyDown={handleEditorKeyDown}
                />
              </div>

              {/* Separator */}
              <div className="mx-4 h-px bg-border-dim/60" />

              {/* Controls — model · duration · Tune, same shape as the image bar */}
              <div className="flex flex-wrap items-center gap-x-1 gap-y-2 px-4 py-3">
                <VideoModelSelector selectedModel={selectedModel} onChange={setSelectedModel} />

                <div className="w-px h-4 bg-border-dim/40 mx-0.5 shrink-0" />

                <DurationSelector value={duration} options={durationOptions} onChange={setDuration} />

                <TuneMenu badge={tuneBadge} width={340}>
                  {(close) => (
                    <>
                      <TuneGroup label="Auflösung">
                        {resolutionOptions.map((res) => (
                          <TuneOption key={res} selected={resolution === res} onClick={() => setResolution(res)}>
                            {res}
                          </TuneOption>
                        ))}
                      </TuneGroup>

                      <TuneGroup label="Format">
                        <TuneRatioOptions
                          ratios={aspectRatioOptions}
                          value={aspectRatio}
                          onChange={(r) => setAspectRatio(r as AspectRatio)}
                          customRatio={customRatio}
                          onCustomRatioChange={setCustomRatio}
                        />
                      </TuneGroup>

                      {(modelConfig?.supportsAudio || modelConfig?.supportsCameraFixed) && (
                        <TuneGroup label="Optionen">
                          {modelConfig?.supportsAudio && (
                            <TuneOption
                              selected={generateAudio}
                              onClick={() => setGenerateAudio(!generateAudio)}
                              title={generateAudio ? 'Audio wird generiert — klicken zum Deaktivieren' : 'Ohne Audio — klicken zum Aktivieren'}
                            >
                              {generateAudio ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                              Audio
                            </TuneOption>
                          )}
                          {modelConfig?.supportsCameraFixed && (
                            <TuneOption
                              selected={cameraFixed}
                              onClick={() => setCameraFixed(!cameraFixed)}
                              title={cameraFixed ? 'Kamera fixiert (Stativ) — klicken zum Lösen' : 'Kamera frei — klicken für Stativ-Shot'}
                            >
                              <Lock className="w-3.5 h-3.5" />
                              Kamera fixiert
                            </TuneOption>
                          )}
                        </TuneGroup>
                      )}

                      {onSettingsClick && (
                        <TuneGroup label="Werkzeuge">
                          <div className="flex flex-col w-full -mx-0.5">
                            <TuneRow icon={<Settings className="w-3.5 h-3.5" />} onClick={() => { onSettingsClick(); close() }}>
                              Settings
                            </TuneRow>
                          </div>
                        </TuneGroup>
                      )}
                    </>
                  )}
                </TuneMenu>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="no-drag shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-surface-3 hover:bg-surface-4 border border-border-base text-text-secondary hover:text-text-primary transition-all"
                  title="Add start frame"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>

                <div className="flex items-center gap-1 ml-auto shrink-0">
                  {hasContent && (
                    <button
                      onClick={() => {
                        if (editorRef.current) editorRef.current.innerHTML = ''
                        setPromptText('')
                        setStartFrame(null)
                      }}
                      className="no-drag shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-text-muted hover:text-text-secondary hover:bg-surface-3 transition-all"
                      title="Clear"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    onClick={handleSubmit}
                    disabled={!canSend}
                    className={cn(
                      'no-drag btn-interactive shrink-0 flex items-center justify-center h-9 rounded-xl transition-all',
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
          </div>
        </div>

        {/* Hint — same row as the image bar, cost included */}
        <div
          className={cn(
            'flex justify-center mt-2.5 transition-opacity duration-200',
            !expanded && 'opacity-0 pointer-events-none'
          )}
        >
          <p className="text-[11px] text-text-muted/70">
            <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-surface-2 text-text-muted border border-border-dim text-[10px] mr-0.5">&#x2318;</kbd>
            <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-surface-2 text-text-muted border border-border-dim text-[10px] mx-0.5">&#x23CE;</kbd>
            {'  ·  '}
            <span className="tabular-nums">~${estimatedCost.toFixed(2)}</span>
            {!startFrame && (
              <>
                {'  ·  '}
                <span className="text-accent-main/80">Start-Frame erforderlich</span>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
