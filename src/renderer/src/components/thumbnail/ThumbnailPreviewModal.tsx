import { useState, useEffect, useMemo, useCallback } from 'react'
import { X, Sun, Moon, Download, ChevronLeft, ChevronRight, Ruler, Contrast, Eye, Grid3x3, Check } from 'lucide-react'
import { useGalleryStore, type GalleryImage, toDisplayUrl } from '../../stores/gallery-store'
import { useThumbnailProjectsStore } from '../../stores/thumbnail-projects-store'
import { ThumbnailFrame, type FrameChecks } from './ThumbnailFrame'
import { useSettingsStore } from '../../stores/settings-store'
import { renderYouTubeThumbnail } from '../../lib/image-utils'
import { neutralImageName } from '../../lib/anti-detection'
import { logger } from '../../lib/logger'
import { cn } from '../../lib/utils'

interface ThumbnailPreviewModalProps {
  images: GalleryImage[]
  index: number
  onNavigate: (index: number) => void
  onClose: () => void
}

/** YouTube's own surface colours — deliberately not the app's tokens. */
const YT = {
  light: { bg: '#ffffff', text: '#0f0f0f', sub: '#606060', chip: '#f2f2f2', line: '#e5e5e5' },
  dark: { bg: '#0f0f0f', text: '#f1f1f1', sub: '#aaaaaa', chip: '#272727', line: '#272727' },
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

export function ThumbnailPreviewModal({ images, index, onNavigate, onClose }: ThumbnailPreviewModalProps) {
  const image = images[index]
  const allImages = useGalleryStore((s) => s.images)
  const projects = useThumbnailProjectsStore((s) => s.projects)
  const antiDetection = useSettingsStore((s) => s.antiDetection)

  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  const [checks, setChecks] = useState<FrameChecks>({ safeZones: true })
  const [exportState, setExportState] = useState<{ busy: boolean; note?: string }>({ busy: false })

  const project = image?.projectId ? projects.find((p) => p.id === image.projectId) : undefined
  const [title, setTitle] = useState(() => project?.title || truncate(image?.prompt ?? '', 70))

  // Follow the image when navigating, but never overwrite a title being typed.
  useEffect(() => {
    setTitle(project?.title || truncate(image?.prompt ?? '', 70))
    setExportState({ busy: false })
  }, [image?.id, project?.title, image?.prompt])

  const src = image ? toDisplayUrl(image.filePath) : ''
  const c = YT[theme]

  /** Two other finished thumbnails, so the feed shows real competition. */
  const competitors = useMemo(() => {
    const pool = allImages.filter(
      (i) => i.id !== image?.id && !i.isLoading && !i.error && i.filePath && i.type !== 'video'
    )
    const sameProject = pool.filter((i) => i.projectId && i.projectId === image?.projectId)
    const others = pool.filter((i) => !sameProject.includes(i))
    return [...sameProject, ...others].slice(0, 2)
  }, [allImages, image?.id, image?.projectId])

  const toggle = useCallback((key: keyof FrameChecks) => {
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const handleExport = useCallback(async () => {
    if (!image?.filePath) return
    setExportState({ busy: true })
    try {
      const read = await window.api.readImage(image.filePath)
      if (!read.success || !read.base64DataUrl) throw new Error('Bild konnte nicht gelesen werden')

      // YouTube rejects files over 2 MB, so step the quality down until it fits.
      let rendered = await renderYouTubeThumbnail(read.base64DataUrl, 0.92)
      for (const q of [0.85, 0.78, 0.7]) {
        if (rendered.bytes <= 2_000_000) break
        rendered = await renderYouTubeThumbnail(read.base64DataUrl, q)
      }

      // The project title is the user's own wording and gives nothing away; the
      // generic fallback does, so with anti-detection on it becomes a neutral name.
      const slug = (project?.title || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40)
      const name = slug
        ? `${slug}-1920x1080.jpg`
        : antiDetection
          ? neutralImageName('jpg')
          : 'thumbnail-1920x1080.jpg'
      await window.api.exportImage(rendered.dataUrl, name)

      setExportState({
        busy: false,
        note: `1920 × 1080 · ${(rendered.bytes / 1024 / 1024).toFixed(2)} MB · Quelle ${rendered.sourceWidth} × ${rendered.sourceHeight}`,
      })
    } catch (err) {
      logger.error('ThumbnailPreview', 'Export failed', err)
      setExportState({ busy: false, note: 'Export fehlgeschlagen' })
    }
  }, [image?.filePath, project?.title, antiDetection])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && index > 0) onNavigate(index - 1)
      if (e.key === 'ArrowRight' && index < images.length - 1) onNavigate(index + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onNavigate, index, images.length])

  if (!image) return null

  const checkButtons: { key: keyof FrameChecks; label: string; icon: typeof Ruler; title: string }[] = [
    { key: 'safeZones', label: 'Safe Zones', icon: Ruler, title: '5 %-Rand und Zeitstempel-Ecke einblenden' },
    { key: 'thirds', label: 'Drittel', icon: Grid3x3, title: 'Drittel-Raster' },
    { key: 'grayscale', label: 'Graustufen', icon: Contrast, title: 'Trägt das Bild ohne Farbe?' },
    { key: 'squint', label: 'Squint', icon: Eye, title: 'Unscharf — überlebt es den schnellen Blick?' },
  ]

  return (
    <div className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-sm flex flex-col animate-fade-in">
      {/* Header */}
      <div className="no-drag shrink-0 flex items-center gap-2 px-4 py-3 border-b border-border-dim/60">
        <span className="text-[13px] font-semibold text-text-primary">YouTube-Vorschau</span>
        <span className="text-[11px] text-text-muted">
          {index + 1} / {images.length}
        </span>

        <div className="w-px h-4 bg-border-dim mx-1" />

        {/* Surface theme */}
        <div className="flex gap-0.5 bg-surface-2 rounded-lg p-0.5 border border-border-dim">
          {(['light', 'dark'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all',
                theme === t ? 'bg-surface-4 text-text-primary' : 'text-text-muted hover:text-text-secondary'
              )}
            >
              {t === 'light' ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
              {t === 'light' ? 'Light' : 'Dark'}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-border-dim mx-1" />

        {checkButtons.map(({ key, label, icon: Icon, title: t }) => (
          <button
            key={key}
            onClick={() => toggle(key)}
            title={t}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all',
              checks[key]
                ? 'bg-accent-dim border-accent-main/30 text-accent-main'
                : 'bg-surface-2 border-border-dim text-text-muted hover:text-text-secondary'
            )}
          >
            <Icon className="w-3 h-3" />
            {label}
          </button>
        ))}

        <div className="flex-1" />

        <button
          onClick={handleExport}
          disabled={exportState.busy}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-accent-main hover:bg-accent-bright disabled:opacity-50 text-white text-[12px] font-semibold transition-all"
        >
          <Download className="w-3.5 h-3.5" />
          {exportState.busy ? 'Rendert…' : '1920 × 1080 exportieren'}
        </button>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-3 transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex">
        {/* Left: the image itself, large */}
        <div className="flex-1 min-w-0 flex flex-col items-center justify-center gap-4 p-6 relative">
          <button
            onClick={() => onNavigate(index - 1)}
            disabled={index === 0}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-surface-2/80 border border-border-dim flex items-center justify-center text-text-secondary hover:text-text-primary disabled:opacity-25 transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => onNavigate(index + 1)}
            disabled={index >= images.length - 1}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-surface-2/80 border border-border-dim flex items-center justify-center text-text-secondary hover:text-text-primary disabled:opacity-25 transition-all"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <div className="w-full max-w-[760px]">
            <ThumbnailFrame src={src} alt={image.prompt} checks={checks} rounded="rounded-xl" />
            <div className="flex items-center gap-4 mt-3 text-[11px] text-text-muted">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 border border-dashed border-text-secondary rounded-[2px]" />
                5 %-Rand — außerhalb wird beschnitten
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-[2px] bg-[#ff3b2f]/60" />
                Zeitstempel des Players
              </span>
              <span className="ml-auto tabular-nums">
                {image.resolution} · {image.aspectRatio}
              </span>
            </div>
            {exportState.note && (
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-accent-main">
                <Check className="w-3 h-3" />
                {exportState.note}
              </div>
            )}
          </div>

          {/* Smallest sizes — the real acid test */}
          <div className="w-full max-w-[760px] flex items-end gap-5 pt-2 border-t border-border-dim/50">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">120 × 68</div>
              <ThumbnailFrame src={src} checks={checks} className="w-[120px]" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">88 × 50</div>
              <ThumbnailFrame src={src} checks={checks} className="w-[88px]" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">64 × 36</div>
              <ThumbnailFrame src={src} checks={checks} className="w-[64px]" />
            </div>
            <p className="text-[11px] text-text-muted/80 leading-snug max-w-[240px] pb-1">
              Was hier nicht mehr lesbar ist, existiert im Feed nicht.
            </p>
          </div>
        </div>

        {/* Right: the surfaces */}
        <div
          className="w-[440px] shrink-0 border-l border-border-dim/60 overflow-y-auto"
          style={{ backgroundColor: c.bg }}
        >
          {/* Editable video title — thumbnail and title are read together */}
          <div className="px-4 pt-4 pb-3" style={{ borderBottom: `1px solid ${c.line}` }}>
            <label className="block text-[10px] uppercase tracking-wider mb-1.5" style={{ color: c.sub }}>
              Videotitel
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titel eingeben…"
              className="w-full bg-transparent text-[13px] font-medium outline-none"
              style={{ color: c.text }}
            />
          </div>

          {/* Suchergebnis */}
          <Surface label="Suchergebnis" c={c}>
            <div className="flex gap-3">
              <div className="w-[200px] shrink-0">
                <ThumbnailFrame src={src} duration="12:04" checks={checks} />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-medium leading-tight" style={{ color: c.text }}>
                  {title || 'Ohne Titel'}
                </div>
                <div className="text-[11px] mt-1" style={{ color: c.sub }}>
                  84 Tsd. Aufrufe · vor 2 Tagen
                </div>
                <div className="text-[11px] mt-1.5" style={{ color: c.sub }}>
                  Dein Kanal
                </div>
              </div>
            </div>
          </Surface>

          {/* Im Feed zwischen anderen */}
          <Surface label="Im Feed, zwischen anderen" c={c}>
            <div className="flex flex-col gap-3">
              {competitors[0] && <FeedRow c={c} src={toDisplayUrl(competitors[0].filePath)} title={truncate(competitors[0].prompt, 46)} dim />}
              <FeedRow c={c} src={src} title={title || 'Ohne Titel'} checks={checks} highlight />
              {competitors[1] && <FeedRow c={c} src={toDisplayUrl(competitors[1].filePath)} title={truncate(competitors[1].prompt, 46)} dim />}
            </div>
          </Surface>

          {/* Startseite */}
          <Surface label="Startseite (Grid)" c={c}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <ThumbnailFrame src={src} duration="12:04" checks={checks} watched />
                <div className="text-[11px] font-medium leading-tight mt-1.5" style={{ color: c.text }}>
                  {truncate(title || 'Ohne Titel', 52)}
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: c.sub }}>
                  Dein Kanal · 84 Tsd.
                </div>
              </div>
              {competitors[0] && (
                <div style={{ opacity: 0.55 }}>
                  <ThumbnailFrame src={toDisplayUrl(competitors[0].filePath)} duration="8:31" />
                  <div className="text-[11px] font-medium leading-tight mt-1.5" style={{ color: c.text }}>
                    {truncate(competitors[0].prompt, 52)}
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: c.sub }}>
                    Anderer Kanal · 12 Tsd.
                  </div>
                </div>
              )}
            </div>
          </Surface>

          {/* Als Nächstes */}
          <Surface label="Als Nächstes (Sidebar)" c={c}>
            <div className="flex gap-2">
              <div className="w-[168px] shrink-0">
                <ThumbnailFrame src={src} duration="12:04" checks={checks} />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-medium leading-tight" style={{ color: c.text }}>
                  {truncate(title || 'Ohne Titel', 60)}
                </div>
                <div className="text-[10px] mt-1" style={{ color: c.sub }}>
                  Dein Kanal
                </div>
              </div>
            </div>
          </Surface>

          {/* Mobil */}
          <Surface label="Mobil" c={c} last>
            <div>
              <ThumbnailFrame src={src} duration="12:04" checks={checks} rounded="rounded-lg" />
              <div className="flex gap-2.5 mt-2">
                <div
                  className="w-8 h-8 rounded-full shrink-0"
                  style={{ backgroundColor: c.chip }}
                />
                <div className="min-w-0">
                  <div className="text-[13px] font-medium leading-tight" style={{ color: c.text }}>
                    {title || 'Ohne Titel'}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: c.sub }}>
                    Dein Kanal · 84 Tsd. Aufrufe · vor 2 Tagen
                  </div>
                </div>
              </div>
            </div>
          </Surface>
        </div>
      </div>
    </div>
  )
}

function Surface({
  label,
  c,
  children,
  last,
}: {
  label: string
  c: typeof YT.light
  children: React.ReactNode
  last?: boolean
}) {
  return (
    <div className="px-4 py-4" style={{ borderBottom: last ? undefined : `1px solid ${c.line}` }}>
      <div className="text-[10px] uppercase tracking-wider mb-2.5" style={{ color: c.sub }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function FeedRow({
  c,
  src,
  title,
  checks,
  dim,
  highlight,
}: {
  c: typeof YT.light
  src: string
  title: string
  checks?: FrameChecks
  dim?: boolean
  highlight?: boolean
}) {
  return (
    <div
      className={cn('flex gap-2.5 rounded-lg', highlight && 'ring-1 ring-accent-main/40 p-1.5 -m-1.5')}
      style={{ opacity: dim ? 0.5 : 1 }}
    >
      <div className="w-[160px] shrink-0">
        <ThumbnailFrame src={src} duration="12:04" checks={checks} />
      </div>
      <div className="min-w-0">
        <div className="text-[12px] font-medium leading-tight" style={{ color: c.text }}>
          {title}
        </div>
        <div className="text-[10px] mt-1" style={{ color: c.sub }}>
          {dim ? 'Anderer Kanal' : 'Dein Kanal'} · 84 Tsd.
        </div>
      </div>
    </div>
  )
}
