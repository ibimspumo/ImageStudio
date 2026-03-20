import { Plus, MessageSquare, Trash2, Settings } from 'lucide-react'
import { useChatStore } from '../../stores/chat-store'
import { cn } from '../../lib/utils'

interface SidebarProps {
  onSettingsClick: () => void
}

export function Sidebar({ onSettingsClick }: SidebarProps) {
  const { sessions, activeSessionId, createSession, setActiveSession, deleteSession } =
    useChatStore()

  return (
    <aside className="w-[240px] h-full flex flex-col bg-surface-1 border-r border-border-dim shrink-0 relative">
      {/* Top spacer for macOS traffic lights */}
      <div className="h-12 shrink-0" />

      {/* New session button */}
      <div className="px-3 pb-3">
        <button
          onClick={() => createSession()}
          className="no-drag w-full flex items-center justify-center gap-2 h-9 rounded-lg bg-surface-3 hover:bg-surface-4 border border-border-base text-text-secondary hover:text-text-primary transition-all text-[13px] font-medium"
        >
          <Plus className="w-3.5 h-3.5" />
          New Chat
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {sessions.length === 0 && (
          <p className="text-text-muted text-[12px] text-center py-10 px-4 leading-relaxed">
            Start a new chat to generate images
          </p>
        )}
        {sessions.map((session) => (
          <button
            key={session.id}
            onClick={() => setActiveSession(session.id)}
            className={cn(
              'no-drag w-full group flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-[13px] transition-all',
              session.id === activeSessionId
                ? 'bg-surface-3 text-text-primary'
                : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'
            )}
          >
            <MessageSquare className="w-4 h-4 shrink-0 opacity-40" />
            <span className="truncate flex-1">{session.title}</span>
            <span
              onClick={(e) => {
                e.stopPropagation()
                deleteSession(session.id)
              }}
              className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-danger/15 text-text-muted hover:text-danger transition-all cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
            </span>
          </button>
        ))}
      </div>

      {/* Bottom settings */}
      <div className="px-3 pt-3 pb-5 border-t border-border-dim shrink-0">
        <button
          onClick={onSettingsClick}
          className="no-drag w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-surface-2 transition-all text-[13px]"
        >
          <Settings className="w-4 h-4" />
          Settings
        </button>
      </div>
    </aside>
  )
}
