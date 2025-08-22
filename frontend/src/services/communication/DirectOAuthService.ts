import { CommunicationService } from './CommunicationService';
import type { Message } from './types';
import { ConnectionState } from './types';
import { AudioProcessor, AudioRecorder } from '../../utils/audio';
import { ConfigManager } from '../../config/ConfigManager';

// Vertex AI endpoints
const API_HOST = 'us-central1-aiplatform.googleapis.com';
const MODEL_NAME = 'gemini-live-2.5-flash-preview-native-audio';

interface GeminiStreamResponse {
  setupComplete?: boolean;
  setup_complete?: boolean;
  serverContent?: {
    turnComplete?: boolean;
    turn_complete?: boolean;
    modelTurn?: {
      parts?: Array<{
        text?: string;
        inlineData?: {
          mimeType: string;
          data: string;
        };
      }>;
    };
    inputTranscription?: {
      text: string;
    };
    outputTranscription?: {
      text: string;
    };
  };
  server_content?: {
    turn_complete?: boolean;
    model_turn?: {
      parts?: Array<{
        text?: string;
        inline_data?: {
          mime_type: string;
          data: string;
        };
      }>;
    };
    input_transcription?: {
      text: string;
    };
    output_transcription?: {
      text: string;
    };
  };
}

/**
 * DirectOAuthService - Direct OAuth-based WebSocket connection to Gemini
 * This implementation connects directly to Gemini API without backend proxy
 */
export class DirectOAuthService extends CommunicationService {
  private ws: WebSocket | null = null;
  private accessToken: string | null = null;
  private audioProcessor: AudioProcessor | null = null;
  private audioRecorder: AudioRecorder | null = null;
  // private apiKey: string | null = null;
  private projectId: string = '';
  // private currentTranscriptionBuffer: string = '';
  // private currentMessageId: string | null = null;
  private userTranscriptionId: string | null = null;
  private assistantTranscriptionId: string | null = null;
  private messageBuffers: Map<string, { role: 'user' | 'assistant', content: string }> = new Map();
  private lastProcessedMessageId: string | null = null;
  private lastProcessedRole: 'user' | 'assistant' | null = null;

  constructor(private config?: { apiHost?: string }) {
    super();
    
    // ConfigManagerから設定を取得
    const googleConfig = ConfigManager.getInstance().getGoogleConfig();
    if (googleConfig) {
      this.projectId = googleConfig.projectId || '';
    }
    
    // フェーズ変更時の処理は基底クラスで統一的に処理される
  }

  setEventHandlers(handlers: {
    onMessage?: (message: Message) => void;
    onMessageComplete?: (message: Message) => void;
    onError?: (error: string) => void;
    onStateChange?: (state: ConnectionState) => void;
  }): void {
    if (handlers.onMessage) {
      this.onMessage(handlers.onMessage);
    }
    if (handlers.onMessageComplete) {
      this.onMessageComplete(handlers.onMessageComplete);
    }
    if (handlers.onError) {
      this.onError((error: Error) => handlers.onError?.(error.message));
    }
    if (handlers.onStateChange) {
      this.onStateChange(handlers.onStateChange);
    }
  }

  async initialize(): Promise<void> {
    // console.log('DirectOAuthService.initialize called');
    try {
      this.notifyStateChange(ConnectionState.CONNECTING);

      // Get access token from multiple sources
      this.accessToken = this.getAccessToken();
      // console.log('Access token available:', !!this.accessToken);

      if (!this.accessToken) {
        throw new Error('Google OAuth access token is required. Please set token in localStorage, .env file, or implement OAuth flow.');
      }

      // Initialize audio services
      this.audioProcessor = new AudioProcessor();
      this.audioRecorder = new AudioRecorder();
      // console.log('DirectOAuthService: Audio services initialized');

      // Connect directly to Vertex AI WebSocket API
      await this.connectWebSocket();

      this.notifyStateChange(ConnectionState.CONNECTED);
    } catch (error) {
      this.notifyStateChange(ConnectionState.ERROR);
      this.notifyError(error as Error);
      throw error;
    }
  }

  private getAccessToken(): string {
    // 1. Check localStorage
    const localStorageToken = localStorage.getItem('google_access_token');
    if (localStorageToken) {
      // console.log('Using token from localStorage');
      return localStorageToken;
    }

    // 2. Check configuration
    const googleConfig = ConfigManager.getInstance().getGoogleConfig();
    if (googleConfig?.accessToken) {
      // console.log('Using token from configuration');
      return googleConfig.accessToken;
    }

    // 3. Check window object (for external script injection)
    if ((window as any).GOOGLE_ACCESS_TOKEN) {
      // console.log('Using token from window object');
      return (window as any).GOOGLE_ACCESS_TOKEN;
    }

    return '';
  }

  startRecording(): void {
    if (!this.audioRecorder || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Service not initialized or not connected');
    }

    this.recording = true;
    // console.log('DirectOAuthService: Starting recording');

    this.audioRecorder.start((audioData: string) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN && this.recording) {
        // console.log('DirectOAuthService: Sending audio chunk, base64 length:', audioData.length);
        // audioData is already base64 encoded from AudioRecorder
        const message = {
          realtime_input: {
            media_chunks: [{
              mime_type: 'audio/pcm',
              data: audioData
            }]
          }
        };
        // console.log('DirectOAuthService: Sending message:', JSON.stringify(message).substring(0, 100) + '...');
        this.ws.send(JSON.stringify(message));
      } else {
        // console.log('DirectOAuthService: Cannot send audio - WS state:', this.ws?.readyState, 'Recording:', this.recording);
      }
    }).catch((error) => {
      this.notifyError(error);
      this.recording = false;
    });
  }

  stopRecording(): void {
    // console.log('DirectOAuthService: Stopping recording');
    if (this.audioRecorder) {
      this.audioRecorder.stop();
    }
    this.recording = false;

    // Send end of turn signal
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // console.log('DirectOAuthService: Sending end of turn signal');
      const message = {
        realtime_input: {
          media_chunks: [{
            mime_type: 'audio/pcm',
            data: ''
          }]
        },
        generation_config: {
          response_modalities: ['AUDIO']
        }
      };
      this.ws.send(JSON.stringify(message));
    }
  }

  async sendText(text: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    try {
      // Create user message
      const userMessage: Message = {
        id: this.generateMessageId(),
        role: 'user',
        content: text,
        timestamp: new Date()
      };

      // Notify listeners of user message
      this.notifyMessage(userMessage);

      // Send to Gemini with snake_case format
      const message = {
        client_content: {
          turns: [{
            role: 'user',
            parts: [{ text }]
          }],
          turn_complete: true
        }
      };

      // console.log('DirectOAuthService: Sending text message:', message);
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      this.notifyError(error as Error);
      throw error;
    }
  }

  disconnect(): void {
    if (this.audioRecorder) {
      this.audioRecorder.stop();
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.accessToken = null;
    this.audioProcessor = null;
    this.audioRecorder = null;

    this.notifyStateChange(ConnectionState.DISCONNECTED);
  }

  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Vertex AI WebSocket URL (same as backend proxy uses)
      // Try adding access token as URL parameter
      const baseUrl = `wss://${this.config?.apiHost || API_HOST}/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`;
      const wsUrl = `${baseUrl}?access_token=${encodeURIComponent(this.accessToken || '')}`;
      // console.log('DirectOAuthService connecting to:', baseUrl); // Don't log URL with token

      // Note: Browser WebSocket API doesn't support custom headers directly
      // Trying URL parameter approach
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        // console.log('DirectOAuthService WebSocket opened');

        // Send setup message with correct model URI format
        // Authentication is attempted via URL parameter
              const modelUri = this.projectId ? 
        `projects/${this.projectId}/locations/us-central1/publishers/google/models/${MODEL_NAME}` :
          `publishers/google/models/${MODEL_NAME}`;

        const setupMessage = {
          setup: {
            model: modelUri,
            generation_config: {
              response_modalities: ['AUDIO'],
              speech_config: {
                voice_config: {
                  prebuilt_voice_config: {
                    voice_name: 'Zephyr'
                  }
                }
              }
            },
            system_instruction: {
              parts: [{
                text: this.getCurrentSystemPrompt()
              }]
            },
            // Enable transcription
            input_audio_transcription: {},
            output_audio_transcription: {},
            realtime_input_config: {
              automatic_activity_detection: {
                start_of_speech_sensitivity: 'START_SENSITIVITY_HIGH',
                end_of_speech_sensitivity: 'END_SENSITIVITY_HIGH',
              }
            }
          }
        };

        this.ws!.send(JSON.stringify(setupMessage));
      };

      this.ws.onmessage = async (event) => {
        try {
          // console.log('DirectOAuthService received message:', event.data);

          // Handle both text and blob messages
          let messageData: string;
          if (event.data instanceof Blob) {
            messageData = await event.data.text();
          } else {
            messageData = event.data;
          }

          const response: GeminiStreamResponse = JSON.parse(messageData);
          // console.log('DirectOAuthService: Parsed response:', JSON.stringify(response, null, 2));

          if (response.setupComplete || response.setup_complete) {
            // console.log('DirectOAuthService setup complete');
            resolve();
            return;
          }

          // Handle server_content with snake_case
          if (response.serverContent?.modelTurn?.parts || response.server_content?.model_turn?.parts) {
            const parts = response.serverContent?.modelTurn?.parts || response.server_content?.model_turn?.parts;
            const turnComplete = response.serverContent?.turnComplete || response.server_content?.turn_complete || false;

            // console.log('DirectOAuthService: Processing model turn with', parts.length, 'parts');
            // console.log('DirectOAuthService: First part:', JSON.stringify(parts[0], null, 2));
            if (parts) {
            for (const part of parts) {
              if (part.text) {
                console.log('DirectOAuthService: Received text response:', part.text);
                // Handle text response
                const message: Message = {
                  id: this.generateMessageId(),
                  role: 'assistant',
                  content: part.text,
                  timestamp: new Date(),
                  turnComplete: turnComplete
                };
                this.notifyMessage(message);

                // AI発話完了時のログ
                if (turnComplete) {
                  console.log('----------------------------------------');
                  console.log('[DirectOAuthService] AI発話完了（TEXT）');
                  console.log('全文:', part.text);
                  console.log('文字数:', part.text.length);
                  console.log('----------------------------------------');
                  // TODO: ここで、AIの発言に対する個別処理を実装（OAuth Direct版）
                }
              } else if ((part as any).inlineData?.mimeType === 'audio/pcm' || (part as any).inline_data?.mime_type === 'audio/pcm') {
                // console.log('DirectOAuthService: Received audio response');
                // Handle audio response
                if (this.audioProcessor) {
                  const data = (part as any).inlineData?.data || (part as any).inline_data?.data;
                  // AudioProcessor expects base64 string, not ArrayBuffer
                  // console.log('DirectOAuthService: Playing audio chunk, base64 length:', data.length);
                  this.audioProcessor.playAudioChunk(data);
                } else {
                  console.error('DirectOAuthService: AudioProcessor not initialized');
                }
              } else {
                  // console.log('DirectOAuthService: Unknown part type:', part);
                }
              }
            }
          } else {
            // console.log('DirectOAuthService: No model turn in response');
          }

          // Log all possible fields to find transcription
          // console.log('DirectOAuthService: Checking for transcriptions...');
          // console.log('serverContent:', response.serverContent);
          // console.log('server_content:', response.server_content);

          // Handle transcriptions (both camelCase and snake_case)
          const inputTranscription = response.serverContent?.inputTranscription?.text || response.server_content?.input_transcription?.text;
          const outputTranscription = response.serverContent?.outputTranscription?.text || response.server_content?.output_transcription?.text;

          if (inputTranscription) {
            // ユーザーの音声転写
            if (!this.userTranscriptionId) {
              this.userTranscriptionId = this.generateMessageId();
              this.messageBuffers.set(this.userTranscriptionId, { role: 'user', content: '' });
            }

            const userBuffer = this.messageBuffers.get(this.userTranscriptionId);
            if (userBuffer) {
              userBuffer.content = inputTranscription;

              const message: Message = {
                id: this.userTranscriptionId,
                role: 'user',
                content: userBuffer.content,
                timestamp: new Date(),
                isTranscription: true
              };
              this.notifyMessage(message);

              this.lastProcessedMessageId = this.userTranscriptionId;
              this.lastProcessedRole = 'user';
            }
          }

          if (outputTranscription) {
            // AIの発話開始時に、ユーザーの発話が完了したとみなす
            if (!this.assistantTranscriptionId && this.userTranscriptionId && this.messageBuffers.has(this.userTranscriptionId)) {
              const userMessageData = this.messageBuffers.get(this.userTranscriptionId);
              if (userMessageData) {
                console.log('[DirectOAuthService] Completing user utterance on AI response start');
                console.log('User Message ID:', this.userTranscriptionId);
                console.log('User Full text:', userMessageData.content);

                const completeMessage = {
                  id: this.userTranscriptionId,
                  role: 'user' as const,
                  content: userMessageData.content,
                  timestamp: new Date(),
                  turnComplete: true
                };
                this.notifyMessageComplete(completeMessage);

                // 対話進行をDialogFlowManagerに通知
                // this.notifyDialogProgress('user');
                this.notifyTicketSystem(completeMessage);

                // メッセージバッファから削除
                this.messageBuffers.delete(this.userTranscriptionId);
                this.userTranscriptionId = null;
              }
            }

            // Assistantの音声転写
            if (!this.assistantTranscriptionId) {
              this.assistantTranscriptionId = this.generateMessageId();
              this.messageBuffers.set(this.assistantTranscriptionId, { role: 'assistant', content: '' });
            }

            const assistantBuffer = this.messageBuffers.get(this.assistantTranscriptionId);
            if (assistantBuffer) {
              // 累積的にテキストを結合
              const currentContent = assistantBuffer.content || '';

              // 新しいテキストが既存のコンテンツを含んでいる場合（増分更新）
              if (outputTranscription.startsWith(currentContent)) {
                assistantBuffer.content = outputTranscription;
              } else if (!currentContent.includes(outputTranscription) && !outputTranscription.includes(currentContent)) {
                // 完全に新しいテキストの場合は追加
                assistantBuffer.content = currentContent + outputTranscription;
              } else {
                // その他の場合は新しいテキストで置き換え
                assistantBuffer.content = outputTranscription;
              }

              const message: Message = {
                id: this.assistantTranscriptionId,
                role: 'assistant',
                content: assistantBuffer.content,
                timestamp: new Date(),
                isTranscription: true
              };
              this.notifyMessage(message);

              this.lastProcessedMessageId = this.assistantTranscriptionId;
              this.lastProcessedRole = 'assistant';
            }
          }

          // Handle turnComplete
          const turnComplete = response.serverContent?.turnComplete || response.server_content?.turn_complete || false;
          if (turnComplete && this.lastProcessedMessageId && this.lastProcessedRole) {
            const messageData = this.messageBuffers.get(this.lastProcessedMessageId);
            const content = messageData?.content || '';

            console.log(`[DirectOAuthService] Completing ${this.lastProcessedRole} utterance via turnComplete`);
            console.log('Message ID:', this.lastProcessedMessageId);
            console.log('Full accumulated text:', content);

            const completeMessage = {
              id: this.lastProcessedMessageId,
              role: this.lastProcessedRole,
              content: content,
              timestamp: new Date(),
              turnComplete: true
            };
            this.notifyMessageComplete(completeMessage);

            // 対話進行をDialogFlowManagerに通知
            if (this.lastProcessedRole === 'assistant') {
              // this.notifyDialogProgress('ai');
              this.notifyTicketSystem(completeMessage);
            } else if (this.lastProcessedRole === 'user') {
              this.notifyTicketSystem(completeMessage);
            }

            // メッセージバッファから削除
            this.messageBuffers.delete(this.lastProcessedMessageId);

            // リセット
            if (this.lastProcessedRole === 'user') {
              this.userTranscriptionId = null;
            } else {
              this.assistantTranscriptionId = null;
            }
            this.lastProcessedMessageId = null;
            this.lastProcessedRole = null;
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('DirectOAuthService WebSocket error:', error);
        this.notifyError(new Error('WebSocket connection error'));
        reject(error);
      };

      this.ws.onclose = (event) => {
        console.log('DirectOAuthService WebSocket closed:', event.code, event.reason);
        this.notifyStateChange(ConnectionState.DISCONNECTED);
      };
    });
  }

  // private arrayBufferToBase64(buffer: ArrayBuffer): string {
  //   const bytes = new Uint8Array(buffer);
  //   let binary = '';
  //   for (let i = 0; i < bytes.byteLength; i++) {
  //     binary += String.fromCharCode(bytes[i]);
  //   }
  //   return btoa(binary);
  // }

  // private base64ToArrayBuffer(base64: string): ArrayBuffer {
  //   const binary = atob(base64);
  //   const bytes = new Uint8Array(binary.length);
  //   for (let i = 0; i < binary.length; i++) {
  //     bytes[i] = binary.charCodeAt(i);
  //   }
  //   return bytes.buffer;
  // }

}