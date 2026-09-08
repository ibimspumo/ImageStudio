import iconUrl from '../../../../../resources/icon.png'
import sidebarIconUrl from '../../../../../resources/icon-sidebar-light.png'

/** App artwork and its approved light variant for the dark sidebar. */
export function BrandIcon({ className = 'w-10 h-10', variant = 'app' }: { className?: string; variant?: 'app' | 'sidebar' }) {
  return <img src={variant === 'sidebar' ? sidebarIconUrl : iconUrl} alt="" aria-hidden="true" draggable={false} className={`shrink-0 object-contain ${className}`} />
}
