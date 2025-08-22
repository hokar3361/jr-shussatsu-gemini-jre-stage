export interface GeminiMessage {
  type: 'SETUP_COMPLETE' | 'TEXT' | 'AUDIO' | 'TRANSCRIPTION' | 'TURN_COMPLETE'
  data?: string
  endOfTurn?: boolean
  sender?: 'user' | 'gemini'
}

export class GeminiLiveAPI {
  private ws: WebSocket | null = null
  private projectId: string
  private model: string = 'gemini-live-2.5-flash-preview-native-audio'
  private responseModalities: string[] = ['AUDIO']
  private systemInstructions: string = ''
  private onMessage?: (message: GeminiMessage) => void
  private onError?: (error: string) => void
  private onConnected?: () => void
  private wsUrl: string

  constructor(wsUrl: string, projectId: string) {
    this.wsUrl = wsUrl
    this.projectId = projectId
  }

  setCallbacks(callbacks: {
    onMessage?: (message: GeminiMessage) => void
    onError?: (error: string) => void
    onConnected?: () => void
  }) {
    this.onMessage = callbacks.onMessage
    this.onError = callbacks.onError
    this.onConnected = callbacks.onConnected
  }

  setConfig(config: {
    responseModalities?: string[]
    systemInstructions?: string
  }) {
    if (config.responseModalities) {
      this.responseModalities = config.responseModalities
    }
    if (config.systemInstructions) {
      this.systemInstructions = config.systemInstructions
    }
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return

    this.ws = new WebSocket(this.wsUrl)

    this.ws.onopen = () => {
      console.log('WebSocket connected to Gemini proxy')
      this.sendSetupMessage()
      this.onConnected?.()
    }

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        
        // デバッグ: 生のレスポンスデータを確認
        if (data.serverContent?.turnComplete) {
          console.log('[GeminiAPI] Raw response with turnComplete:', data)
        }
        
        const message = this.parseGeminiResponse(data)
        if (message) {
          this.onMessage?.(message)
        }
      } catch (error) {
        console.error('Error parsing message:', error)
      }
    }

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error)
      this.onError?.('Connection error')
    }

    this.ws.onclose = () => {
      console.log('WebSocket closed')
      this.onError?.('Connection closed')
    }
  }

  private sendSetupMessage(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return

    const modelUri = `projects/${this.projectId}/locations/us-central1/publishers/google/models/${this.model}`
    
    const setupMessage = {
      setup: {
        model: modelUri,
        proactivity: {
          proactiveAudio: true
        },
        realtimeInputConfig: {
          automaticActivityDetection: {
            startOfSpeechSensitivity: "START_SENSITIVITY_LOW",
          }
        },
        generation_config: {
          response_modalities: this.responseModalities,
          speech_config: {
            voice_config: {
              prebuilt_voice_config: {
                voice_name: 'Zephyr'
              }
            }
          }
        },
        system_instruction: {
          parts: [{ text: this.systemInstructions }]
        },
        input_audio_transcription: {},
        output_audio_transcription: {},
        realtime_input_config: {
          automatic_activity_detection: {
            start_of_speech_sensitivity: 'START_SENSITIVITY_HIGH',
            end_of_speech_sensitivity: 'END_SENSITIVITY_HIGH',
          }
        }
      }
    }

    this.ws.send(JSON.stringify(setupMessage))
  }

  private parseGeminiResponse(data: any): GeminiMessage | null {
    // デバッグ: turnCompleteフラグの存在を確認
    if (data?.serverContent?.turnComplete !== undefined) {
      console.log('[GeminiAPI] turnComplete detected:', data.serverContent.turnComplete);
    }
    
    // Setup complete
    if (data.setupComplete) {
      return { type: 'SETUP_COMPLETE' }
    }

    // Model response
    const parts = data?.serverContent?.modelTurn?.parts
    if (parts?.length) {
      if (parts[0].text) {
        return {
          type: 'TEXT',
          data: parts[0].text,
          endOfTurn: data?.serverContent?.turnComplete
        }
      } else if (parts[0].inlineData) {
        return {
          type: 'AUDIO',
          data: parts[0].inlineData.data,
          endOfTurn: data?.serverContent?.turnComplete
        }
      }
    }

    // Transcriptions
    if (data?.serverContent?.inputTranscription?.text) {
      return {
        type: 'TRANSCRIPTION',
        data: data.serverContent.inputTranscription.text,
        sender: 'user',
        endOfTurn: data?.serverContent?.turnComplete  // ユーザー転写でもturnCompleteをチェック
      }
    }

    if (data?.serverContent?.outputTranscription?.text) {
      return {
        type: 'TRANSCRIPTION',
        data: data.serverContent.outputTranscription.text,
        sender: 'gemini',
        endOfTurn: data?.serverContent?.turnComplete
      }
    }

    // turnCompleteのみのメッセージ（コンテンツなし）
    if (data?.serverContent?.turnComplete === true && !data?.serverContent?.modelTurn && !data?.serverContent?.inputTranscription && !data?.serverContent?.outputTranscription) {
      console.log('[GeminiAPI] Standalone turnComplete message detected');
      return {
        type: 'TURN_COMPLETE',
        data: '',
        endOfTurn: true
      }
    }

    return null
  }

  sendText(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return

    const message = {
      client_content: {
        turns: [
          {
            role: 'user',
            parts: [{ text }]
          }
        ],
        turn_complete: true
      }
    }

    this.ws.send(JSON.stringify(message))
  }

  sendAudio(base64PCM: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return

    const message = {
      realtime_input: {
        media_chunks: [
          {
            mime_type: 'audio/pcm',
            data: base64PCM
          }
        ]
      }
    }

    this.ws.send(JSON.stringify(message))
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }
}