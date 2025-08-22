export interface Message {
  id: string
  text: string
  sender: 'user' | 'gemini'
  timestamp: Date
  type?: 'text' | 'audio'
  isTranscription?: boolean
  turnComplete?: boolean
  isDebug?: boolean
}

export interface WebSocketMessage {
  type: 'text' | 'audio' | 'transcription' | 'error' | 'status'
  data?: any
  text?: string
  sender?: 'user' | 'gemini'
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'