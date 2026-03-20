import { create } from 'zustand'
import { nanoid } from 'nanoid'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  imageBase64?: string
  attachments?: string[]
  timestamp: number
  isLoading?: boolean
  error?: string
  durationMs?: number
  aspectRatio?: string
  resolution?: string
  model?: string
}

export interface ImageChat {
  id: string
  title: string
  sourceImageId: string
  sourceImageBase64: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

interface ChatStore {
  chats: ImageChat[]
  activeChatId: string | null

  startChat: (sourceImageId: string, sourceImageBase64: string, sourcePrompt: string) => string
  addUserMessage: (chatId: string, content: string, attachments?: string[]) => string
  addAssistantPlaceholder: (chatId: string) => string
  completeAssistantMessage: (chatId: string, messageId: string, imageBase64: string, durationMs?: number) => void
  failAssistantMessage: (chatId: string, messageId: string, error: string) => void
  setActiveChat: (chatId: string | null) => void
  deleteChat: (chatId: string) => void
  loadFromDisk: () => Promise<void>
  persistToDisk: () => Promise<void>
}

export const useChatStore = create<ChatStore>((set, get) => ({
  chats: [],
  activeChatId: null,

  startChat: (sourceImageId, sourceImageBase64, sourcePrompt) => {
    const chatId = nanoid()
    const firstMessage: ChatMessage = {
      id: nanoid(),
      role: 'assistant',
      content: sourcePrompt,
      imageBase64: sourceImageBase64,
      timestamp: Date.now()
    }
    const chat: ImageChat = {
      id: chatId,
      title: sourcePrompt.slice(0, 60) || 'Image Chat',
      sourceImageId,
      sourceImageBase64,
      messages: [firstMessage],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    set((state) => ({
      chats: [chat, ...state.chats],
      activeChatId: chatId
    }))
    setTimeout(() => get().persistToDisk(), 100)
    return chatId
  },

  addUserMessage: (chatId, content, attachments) => {
    const msgId = nanoid()
    const message: ChatMessage = {
      id: msgId,
      role: 'user',
      content,
      attachments,
      timestamp: Date.now()
    }
    set((state) => ({
      chats: state.chats.map((c) =>
        c.id === chatId
          ? { ...c, messages: [...c.messages, message], updatedAt: Date.now() }
          : c
      )
    }))
    return msgId
  },

  addAssistantPlaceholder: (chatId) => {
    const msgId = nanoid()
    const message: ChatMessage = {
      id: msgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isLoading: true
    }
    set((state) => ({
      chats: state.chats.map((c) =>
        c.id === chatId
          ? { ...c, messages: [...c.messages, message], updatedAt: Date.now() }
          : c
      )
    }))
    return msgId
  },

  completeAssistantMessage: (chatId, messageId, imageBase64, durationMs) => {
    set((state) => ({
      chats: state.chats.map((c) =>
        c.id === chatId
          ? {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId
                  ? { ...m, imageBase64, isLoading: false, durationMs }
                  : m
              ),
              updatedAt: Date.now()
            }
          : c
      )
    }))
    setTimeout(() => get().persistToDisk(), 100)
  },

  failAssistantMessage: (chatId, messageId, error) => {
    set((state) => ({
      chats: state.chats.map((c) =>
        c.id === chatId
          ? {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId ? { ...m, isLoading: false, error } : m
              ),
              updatedAt: Date.now()
            }
          : c
      )
    }))
    setTimeout(() => get().persistToDisk(), 100)
  },

  setActiveChat: (chatId) => {
    set({ activeChatId: chatId })
  },

  deleteChat: (chatId) => {
    set((state) => ({
      chats: state.chats.filter((c) => c.id !== chatId),
      activeChatId: state.activeChatId === chatId ? null : state.activeChatId
    }))
    setTimeout(() => get().persistToDisk(), 100)
  },

  loadFromDisk: async () => {
    try {
      const result = await window.api.listHistory()
      if (result.success && result.sessions) {
        const chatSession = result.sessions.find((s) => s.id === 'image-chats')
        if (chatSession) {
          const data = JSON.parse(chatSession.data) as ImageChat[]
          set({ chats: data })
        }
      }
    } catch {
      // silent — first launch
    }
  },

  persistToDisk: async () => {
    const chats = get().chats
    await window.api.saveHistory('image-chats', JSON.stringify(chats))
  }
}))
