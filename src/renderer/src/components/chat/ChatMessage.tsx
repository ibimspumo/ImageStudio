import { AlertCircle } from 'lucide-react'
import { ImageGrid } from './ImageGrid'
import type { ChatMessage as ChatMessageType } from '../../types/chat'
import { cn } from '../../lib/utils'

interface ChatMessageProps {
  message: ChatMessageType
  onImageClick: (src: string) => void
}

export function ChatMessage({ message, onImageClick }: ChatMessageProps) {
  const isUser = message.role === 'user'

  return (
    <div className="animate-fade-up">
      {isUser ? (
        /* User message — right-aligned bubble */
        <div className="flex flex-col items-end gap-2">
          {/* Attached references */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex gap-2">
              {message.attachments.map((att, i) => (
                <img
                  key={i}
                  src={att}
                  alt="Reference"
                  className="w-16 h-16 rounded-xl object-cover border border-border-base"
                />
              ))}
            </div>
          )}

          {message.content && (
            <div className="max-w-[70%] bg-surface-3 rounded-2xl rounded-br-md px-4 py-2.5 text-[14px] text-text-primary leading-relaxed">
              {message.content}
            </div>
          )}

          {/* Config pills */}
          {message.config && (
            <div className="flex gap-1.5">
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-surface-2 text-text-muted border border-border-dim">
                {message.config.aspectRatio}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-surface-2 text-text-muted border border-border-dim">
                {message.config.resolution}
              </span>
              {message.config.count > 1 && (
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-surface-2 text-text-muted border border-border-dim">
                  {message.config.count}x
                </span>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Assistant message — full width images */
        <div className="space-y-3">
          {message.content && (
            <p className="text-[14px] text-text-secondary leading-relaxed">{message.content}</p>
          )}

          {message.isLoading && (
            <ImageGrid
              images={[]}
              isLoading
              loadingCount={message.loadingCount || 1}
              onImageClick={onImageClick}
            />
          )}

          {message.images && message.images.length > 0 && (
            <ImageGrid images={message.images} onImageClick={onImageClick} />
          )}

          {message.error && (
            <div className="inline-flex items-center gap-2 text-danger text-[13px] bg-danger/8 rounded-xl px-4 py-2.5 border border-danger/15">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {message.error}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
