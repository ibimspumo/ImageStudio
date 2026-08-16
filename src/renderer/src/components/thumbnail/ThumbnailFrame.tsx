import { cn } from '../../lib/utils'

export interface FrameChecks {
  /** 5% edge margin + the duration-badge corner. */
  safeZones?: boolean
  /** Strip the colour — does the image still separate by value alone? */
  grayscale?: boolean
  /** The squint test: if it survives this, it survives the feed. */
  squint?: boolean
  /** Rule-of-thirds guides. */
  thirds?: boolean
}

interface ThumbnailFrameProps {
  src: string
  alt?: string
  /** Duration badge, exactly where the player draws it. */
  duration?: string
  /** Red "already watched" bar some surfaces draw across the bottom. */
  watched?: boolean
  checks?: FrameChecks
  className?: string
  rounded?: string
}

/**
 * One 16:9 thumbnail with the overlays that decide whether it works:
 * the crop-safe area, the corner the duration badge covers, and the two
 * legibility tests (value-only and out-of-focus).
 */
export function ThumbnailFrame({
  src,
  alt = '',
  duration,
  watched,
  checks,
  className,
  rounded = 'rounded-[6px]',
}: ThumbnailFrameProps) {
  const filters = [
    checks?.grayscale ? 'grayscale(1)' : '',
    checks?.squint ? 'blur(2.5px)' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={cn('relative overflow-hidden bg-black aspect-video', rounded, className)}>
      <img
        src={src}
        alt={alt}
        className="w-full h-full object-cover block"
        style={filters ? { filter: filters } : undefined}
        draggable={false}
      />

      {checks?.thirds && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/25" />
          <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/25" />
          <div className="absolute top-1/3 left-0 right-0 h-px bg-white/25" />
          <div className="absolute top-2/3 left-0 right-0 h-px bg-white/25" />
        </div>
      )}

      {checks?.safeZones && (
        <div className="absolute inset-0 pointer-events-none">
          {/* Outer 5%: some surfaces crop into this. */}
          <div className="absolute inset-[5%] border border-dashed border-white/70 rounded-[2px]" />
          {/* The player's duration badge sits here. */}
          <div
            className="absolute right-0 bottom-0 border-l border-t border-[#ff3b2f]"
            style={{
              width: '22%',
              height: '24%',
              background:
                'repeating-linear-gradient(-45deg, rgba(255,59,47,.45) 0 5px, rgba(255,59,47,.12) 5px 10px)',
            }}
          />
        </div>
      )}

      {watched && (
        <div className="absolute left-0 right-0 bottom-0 h-[3px] bg-white/30">
          <div className="h-full w-[42%] bg-[#ff0000]" />
        </div>
      )}

      {duration && (
        <div className="absolute right-1 bottom-1 px-1 py-px rounded-[3px] bg-black/80 text-white text-[10px] font-medium leading-tight tabular-nums">
          {duration}
        </div>
      )}
    </div>
  )
}
