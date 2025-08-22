import { CommunicationService } from './CommunicationService';
import type { Message } from './types';
import { ConnectionState } from './types';
import { GeminiLiveAPI, type GeminiMessage } from '../gemini-api';
import { AudioProcessor, AudioRecorder } from '../../utils/audio';
import { TicketDialogFlowManager } from '../dialog/TicketDialogFlowManager';
import { ConversationContextGenerator, type ConversationHooks } from '../conversation/ConversationHooks';
import { ConfigManager } from '../../config/ConfigManager';

export class GeminiWebSocketService extends CommunicationService {
  private geminiAPI: GeminiLiveAPI | null = null;
  private audioProcessor: AudioProcessor | null = null;
  private audioRecorder: AudioRecorder | null = null;
  private proxyUrl: string = this.getWebSocketUrl();
  private projectId: string = '';
  // private currentTranscriptionBuffer: string = '';
  // private currentMessageId: string | null = null;
  private userTranscriptionId: string | null = null;
  private assistantTranscriptionId: string | null = null;
  private messageBuffers: Map<string, { role: 'user' | 'assistant', content: string }> = new Map();
  private lastProcessedMessageId: string | null = null;
  private lastProcessedRole: 'user' | 'assistant' | null = null;
  private conversationHooks: ConversationHooks = {};
  private conversationHistory: { role: string; content: string; }[] = [];
  constructor(config?: { proxyUrl?: string }) {
    super();
    if (config?.proxyUrl) {
      this.proxyUrl = config.proxyUrl;
    }
    
    // ConfigManagerから設定を取得
    const googleConfig = ConfigManager.getInstance().getGoogleConfig();
    if (googleConfig) {
      this.projectId = googleConfig.projectId || 'formal-hybrid-424011-t0';
    } else {
      this.projectId = 'formal-hybrid-424011-t0';
    }
    
    // フェーズ変更時の処理は基底クラスで統一的に処理される
    
    // 会話フックを設定
    this.conversationHooks = {
      beforeAIResponse: ConversationContextGenerator.generateBeforeAIResponseMessage.bind(ConversationContextGenerator)
    };
  }

  private getWebSocketUrl(): string {
    // ConfigManagerから設定を取得
    // const config = ConfigManager.getInstance().getConfig();
    const googleConfig = ConfigManager.getInstance().getGoogleConfig();
    const appConfig = ConfigManager.getInstance().getAppConfig();
    
    // 優先順位: google.websocketUrl > app.wsUrl > デフォルト
    if (googleConfig?.websocketUrl) {
      return googleConfig.websocketUrl;
    }
    
    if (appConfig?.wsUrl) {
      return appConfig.wsUrl;
    }
    
    // デフォルト: 現在のホストを使用
    if (import.meta.env.DEV) {
      return 'ws://localhost:8080/ws';
    }
    // 本番環境では同じドメインのWebSocketエンドポイントに接続
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }

  setEventHandlers(handlers: {
    onMessage?: (message: Message) => void;
    onMessageComplete?: (message: Message) => void;
    onError?: (error: Error) => void;
    onStateChange?: (state: ConnectionState) => void;
  }): void {
    console.log('[GeminiWebSocketService] Setting event handlers');
    console.log('onMessageComplete provided:', !!handlers.onMessageComplete);
    
    if (handlers.onMessage) {
      this.onMessage(handlers.onMessage);
    }
    if (handlers.onMessageComplete) {
      this.onMessageComplete(handlers.onMessageComplete);
      console.log('[GeminiWebSocketService] onMessageComplete handler set');
    }
    if (handlers.onError) {
      this.onError(handlers.onError);
    }
    if (handlers.onStateChange) {
      this.onStateChange(handlers.onStateChange);
    }
  }

  async initialize(): Promise<void> {
    try {
      this.notifyStateChange(ConnectionState.CONNECTING);

      // Initialize Gemini API with existing implementation
      this.geminiAPI = new GeminiLiveAPI(this.proxyUrl, this.projectId);
      this.audioProcessor = new AudioProcessor();
      this.audioRecorder = new AudioRecorder();

      // Configure Gemini API
      const initialPrompt = this.getCurrentSystemPrompt();
      console.log(`[GeminiWebSocketService] Initial system prompt:`, initialPrompt);
      this.geminiAPI.setConfig({
        responseModalities: ['AUDIO'],
        systemInstructions: initialPrompt
      });

      // Set up event handlers
      this.setupEventHandlers();

      // Connect to the service
      this.geminiAPI.connect();
    } catch (error) {
      this.notifyStateChange(ConnectionState.ERROR);
      this.notifyError(error as Error);
      throw error;
    }
  }

  startRecording(): void {
    if (!this.audioRecorder || !this.geminiAPI) {
      throw new Error('Service not initialized');
    }

    this.recording = true;
    
    // Start audio input with callback to send data to Gemini
    this.audioRecorder.start((audioData: string) => {
      if (this.geminiAPI && this.recording) {
        this.geminiAPI.sendAudio(audioData);
      }
    }).catch((error) => {
      this.notifyError(error);
      this.recording = false;
    });
  }

  stopRecording(): void {
    if (this.audioRecorder) {
      this.audioRecorder.stop();
    }
    this.recording = false;
  }

  async sendText(text: string): Promise<void> {
    if (!this.geminiAPI) {
      throw new Error('Service not initialized');
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

      // 会話履歴に追加
      this.conversationHistory.push({ role: 'user', content: text });

      // AI応答前のコンテキスト差し込み（ユーザー発話後、AI応答前）
      let contextInjected = false;
      if (this.conversationHooks.beforeAIResponse && this.dialogFlowManager instanceof TicketDialogFlowManager) {
        const ticketSystem = this.dialogFlowManager.getTicketSystemManager();
        if (ticketSystem) {
          const ticketState = ticketSystem.getState();
          const injectionMessage = await this.conversationHooks.beforeAIResponse(text, ticketState);
          if (injectionMessage) {
            console.log('[GeminiWebSocketService] Injecting context before AI response:', injectionMessage.content);
            // Geminiにはコンテキストを含めたメッセージを送信
            const combinedText = `${injectionMessage.content}\n${text}`;
            this.geminiAPI.sendText(combinedText);
            contextInjected = true;
          }
        }
      }

      // コンテキストが注入されなかった場合のみ送信
      if (!contextInjected) {
        this.geminiAPI.sendText(text);
      }
    } catch (error) {
      this.notifyError(error as Error);
      throw error;
    }
  }

  private triggerInitialAIResponse(): void {
    if (!this.geminiAPI) {
      console.error('[GeminiWebSocketService] Cannot trigger initial AI response - API not initialized');
      return;
    }
    
    console.log('[GeminiWebSocketService] Triggering initial AI response');
    
    // 初回発話前のコンテキストを生成
    let contextMessage = '';
    if (this.dialogFlowManager instanceof TicketDialogFlowManager) {
      const ticketSystem = this.dialogFlowManager.getTicketSystemManager();
      if (ticketSystem) {
        const ticketState = ticketSystem.getState();
        contextMessage = ConversationContextGenerator.generateContextMessage(ticketState, true, true);
      }
    }
    
    // コンテキストがある場合はそれを送信、ない場合は空のメッセージ
    this.geminiAPI.sendText(contextMessage || '');
  }

  disconnect(): void {
    if (this.audioRecorder) {
      this.audioRecorder.stop();
    }

    if (this.audioProcessor) {
      // AudioProcessor doesn't have a stop method in current implementation
      this.audioProcessor = null;
    }

    if (this.geminiAPI) {
      this.geminiAPI.disconnect();
      this.geminiAPI = null;
    }

    this.notifyStateChange(ConnectionState.DISCONNECTED);
  }

  private setupEventHandlers(): void {
    if (!this.geminiAPI) return;

    this.geminiAPI.setCallbacks({
      onConnected: () => {
        this.notifyStateChange(ConnectionState.CONNECTED);
        
        // フェーズ2以降の場合、AI側から初回発話を開始
        if (this.dialogFlowManager instanceof TicketDialogFlowManager) {
          const ticketSystemManager = this.dialogFlowManager.getTicketSystemManager();
          if (ticketSystemManager) {
            const state = ticketSystemManager.getState();
            // フェーズ2以降の場合
            if (state.ticketInfo.currentPhase !== 'basic_info') {
              console.log('[GeminiWebSocketService] Starting AI-first conversation for phase:', state.ticketInfo.currentPhase);
              // 少し待機してから初回発話をトリガー（Geminiに空のプロンプトを送信）
              setTimeout(() => {
                this.triggerInitialAIResponse();
              }, 500);
            }
          }
        }
      },
      onError: (error: string) => {
        this.notifyError(new Error(error));
        this.notifyStateChange(ConnectionState.ERROR);
      },
      onMessage: async (message: GeminiMessage) => {
        // console.log('[GeminiWebSocketService] Received message:', {
        //   type: message.type,
        //   sender: message.sender,
        //   data: message.data?.substring(0, 50) + '...',
        //   endOfTurn: message.endOfTurn
        // });
        
        switch (message.type) {
          case 'TRANSCRIPTION': {
            // Handle transcription messages
            const sender = message.sender || 'gemini';
            const transcriptionText = message.data || '';
            
            // console.log('[GeminiWebSocketService] Processing TRANSCRIPTION:', {
            //   sender,
            //   text: transcriptionText,
            //   endOfTurn: message.endOfTurn
            // });
            
            if (transcriptionText) {
              // 送信者ごとにメッセージIDを管理
              let messageId: string;
              if (sender === 'user') {
                if (!this.userTranscriptionId) {
                  this.userTranscriptionId = this.generateMessageId();
                }
                messageId = this.userTranscriptionId;
              } else {
                // AIの発話開始時に、ユーザーの発話が完了したとみなす
                if (!this.assistantTranscriptionId && this.userTranscriptionId && this.messageBuffers.has(this.userTranscriptionId)) {
                  const userMessageData = this.messageBuffers.get(this.userTranscriptionId);
                  if (userMessageData) {
                    console.log('[GeminiWebSocketService] Completing user utterance on AI response start');
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
                    // this.notifyDialogProgress('user');
                    
                    // ユーザー発話から即座に情報抽出
                    if (this.dialogFlowManager instanceof TicketDialogFlowManager) {
                      const ticketSystem = this.dialogFlowManager.getTicketSystemManager();
                      if (ticketSystem) {
                        await ticketSystem.extractFromUserMessage(userMessageData.content);
                        
                        // AI応答前のコンテキスト差し込み
                        const ticketState = ticketSystem.getState();
                        const injectionMessage = await this.conversationHooks.beforeAIResponse?.(userMessageData.content, ticketState);
                        if (injectionMessage) {
                          console.log('[GeminiWebSocketService] Injecting context before AI response (voice):', injectionMessage.content);
                          // コンテキストメッセージをGeminiに送信
                          this.geminiAPI?.sendText(injectionMessage.content);
                        }
                      }
                    } else {
                      // 通常の通知処理
                      this.notifyTicketSystem(completeMessage);
                    }
                    
                    // メッセージバッファから削除
                    this.messageBuffers.delete(this.userTranscriptionId);
                    this.userTranscriptionId = null;
                  }
                }
                
                if (!this.assistantTranscriptionId) {
                  this.assistantTranscriptionId = this.generateMessageId();
                }
                messageId = this.assistantTranscriptionId;
              }
              
              // メッセージバッファに保存/更新
              const role = sender === 'user' ? 'user' : 'assistant';
              const existingBuffer = this.messageBuffers.get(messageId);
              let finalContent = transcriptionText;
              
              if (role === 'assistant' && existingBuffer) {
                // AIの場合は累積的にテキストを結合
                const currentContent = existingBuffer.content || '';
                
                // 新しいテキストが既存のコンテンツを含んでいる場合（増分更新）
                if (transcriptionText.startsWith(currentContent)) {
                  existingBuffer.content = transcriptionText;
                } else {
                  // 新しいテキストは常に追加（Geminiは分割して送信するため）
                  existingBuffer.content = currentContent + transcriptionText;
                }
                finalContent = existingBuffer.content;
              } else {
                // ユーザーまたは新規のAIメッセージ
                this.messageBuffers.set(messageId, {
                  role,
                  content: transcriptionText
                });
              }
              
              // 累積されたコンテンツを通知
              const transcriptionMessage: Message = {
                id: messageId,
                role: sender === 'user' ? 'user' : 'assistant',
                content: finalContent,
                timestamp: new Date(),
                isTranscription: true,
                turnComplete: message.endOfTurn || false
              };
              this.notifyMessage(transcriptionMessage);
              
              this.lastProcessedMessageId = messageId;
              this.lastProcessedRole = role;
              
              // TODO: ここで、ユーザーの発言に対する個別処理を実装（Gemini WebSocket版）
              // ユーザーの発話が完了したタイミング（sender === 'user' && endOfTurn）
              if (sender === 'user' && message.endOfTurn) {
                console.log('----------------------------------------');
                console.log('[GeminiWebSocketService] ユーザー発話完了（転写）');
                console.log('全文:', transcriptionText);
                console.log('文字数:', transcriptionText.length);
                console.log('----------------------------------------');
                this.userTranscriptionId = null; // リセット
              }
              // AI発話完了時
              if (sender === 'gemini' && message.endOfTurn) {
                console.log('----------------------------------------');
                console.log('[GeminiWebSocketService] AI発話完了（転写）');
                console.log('全文:', finalContent);
                console.log('文字数:', finalContent.length);
                console.log('----------------------------------------');
                this.assistantTranscriptionId = null; // リセット
                
                // 会話履歴に追加
                this.conversationHistory.push({ role: 'assistant', content: finalContent });
              }
            }
            break;
          }
          
          case 'AUDIO':
            // Play audio response
            if (message.data && this.audioProcessor) {
              await this.audioProcessor.playAudioChunk(message.data);
            }
            break;
          
          case 'TEXT':
            // Handle text response
            if (message.data) {
              const textMessage: Message = {
                id: this.generateMessageId(),
                role: 'assistant',
                content: message.data,
                timestamp: new Date(),
                turnComplete: message.endOfTurn || false
              };
              this.notifyMessage(textMessage);
              
              if (message.endOfTurn) {
                console.log('----------------------------------------');
                console.log('[GeminiWebSocketService] AI発話完了（TEXT）');
                console.log('全文:', message.data);
                console.log('文字数:', message.data?.length || 0);
                console.log('----------------------------------------');
                
                // 会話履歴に追加
                this.conversationHistory.push({ role: 'assistant', content: message.data });
              }
            }
            break;
            
          case 'TURN_COMPLETE':
            console.log('[GeminiWebSocketService] Processing TURN_COMPLETE message');
            console.log('Last processed message ID:', this.lastProcessedMessageId);
            console.log('Last processed role:', this.lastProcessedRole);
            
                          // 最後に処理したメッセージの完了を通知
              if (this.lastProcessedMessageId && this.lastProcessedRole) {
                const messageData = this.messageBuffers.get(this.lastProcessedMessageId);
                const content = messageData?.content || '';
                  
                console.log(`[GeminiWebSocketService] Completing ${this.lastProcessedRole} utterance via TURN_COMPLETE`);
                console.log('Message ID:', this.lastProcessedMessageId);
                console.log('Full accumulated text:', content);
                console.log('onMessageComplete handler exists:', this.messageCompleteCallbacks.length > 0);
                
                if (this.messageCompleteCallbacks.length > 0) {
                  console.log('[GeminiWebSocketService] Calling onMessageComplete');
                  const completeMessage = {
                    id: this.lastProcessedMessageId,
                    role: this.lastProcessedRole,
                    content: content,
                    timestamp: new Date(),
                    turnComplete: true
                  };
                  this.notifyMessageComplete(completeMessage);
                  if (this.lastProcessedRole === 'assistant') {
                    // this.notifyDialogProgress('ai');
                    this.notifyTicketSystem(completeMessage);
                  } else if (this.lastProcessedRole === 'user') {
                    // ユーザー発話から即座に情報抽出
                    if (this.dialogFlowManager instanceof TicketDialogFlowManager) {
                      const ticketSystem = this.dialogFlowManager.getTicketSystemManager();
                      if (ticketSystem) {
                        await ticketSystem.extractFromUserMessage(content);
                        
                        // AI応答前のコンテキスト差し込み
                        const ticketState = ticketSystem.getState();
                        const injectionMessage = await this.conversationHooks.beforeAIResponse?.(content, ticketState);
                        if (injectionMessage) {
                          console.log('[GeminiWebSocketService] Injecting context before AI response (TURN_COMPLETE):', injectionMessage.content);
                          // コンテキストメッセージをGeminiに送信
                          this.geminiAPI?.sendText(injectionMessage.content);
                        }
                      }
                    } else {
                      // 通常の通知処理
                      this.notifyTicketSystem(completeMessage);
                    }
                  }
                } else {
                  console.log('[GeminiWebSocketService] WARNING: onMessageComplete handler not set!');
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
            break;
        }
      }
    });
  }
}