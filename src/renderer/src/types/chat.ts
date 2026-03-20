export interface GeneratedImage {
  id: string
  base64DataUrl: string
  filePath?: string
  aspectRatio: string
  resolution: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: string[] // base64 data URLs
  images?: GeneratedImage[]
  config?: {
    model: string
    aspectRatio: string
    resolution: string
    count: number
  }
  timestamp: number
  isLoading?: boolean
  loadingCount?: number
  error?: string
}

export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}
