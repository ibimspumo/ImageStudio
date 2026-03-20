import { useEffect, useRef } from 'react'
import { ChatMessage } from './ChatMessage'
import type { ChatMessage as ChatMessageType } from '../../types/chat'

interface ChatContainerProps {
  messages: ChatMessageType[]
  onImageClick: (src: string) => void
}

export function ChatContainer({ messages, onImageClick }: ChatContainerProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-8 py-6 space-y-8">
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} onImageClick={onImageClick} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
