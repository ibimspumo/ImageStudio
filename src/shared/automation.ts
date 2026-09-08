/** IPC boundary between the local automation server and the live application. */
export interface AutomationStatus {
  enabled: boolean
  running: boolean
  port: number
  url: string
  token: string
  setupPrompt: string
  rendererReady: boolean
  error?: string
}

export interface AutomationRequest {
  id: string
  method: 'tools/list' | 'tools/call'
  params?: { name: string; arguments?: Record<string, unknown> }
}

export interface AutomationReply {
  id: string
  result?: unknown
  error?: string
}
