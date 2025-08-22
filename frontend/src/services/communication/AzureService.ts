import { CommunicationService } from './CommunicationService';
import type { Message } from './types';
import { ConnectionState } from './types';
import { AzureSpeechService } from '../azure/azureSpeechService';
import { AzureOpenAIService } from '../azure/azureOpenAIService';
import type { AzureConfig, ChatMessage } from '../azure/types';
import { TicketDialogFlowManager } from '../dialog/TicketDialogFlowManager';
import { ConversationContextGenerator, type ConversationHooks } from '../conversation/ConversationHooks';
import type { ISpeechSynthesisService } from './ISpeechSynthesisService';
import type { ITTSProvider } from '../tts/ITTSProvider';
import { TTSServiceFactory } from '../tts/TTSServiceFactory';
import { AzureTTSProvider } from '../tts/AzureTTSProvider';
import { AudioRecordingService } from '../recording/AudioRecordingService';

export class AzureService extends CommunicationService implements ISpeechSynthesisService {
  private speechService: AzureSpeechService | null = null;
  private ttsProvider: ITTSProvider | null = null;
  private openAIService: AzureOpenAIService | null = null;
  private openAIServiceEastUs: AzureOpenAIService | null = null;
  private conversationHistory: ChatMessage[] = [];
  private systemPrompt: string = '';
  private currentRecognizingMessageId: string | null = null;
  private lastRecognizingText: string = '';
  private isProcessingResponse: boolean = false;
  private synthesizingMessageIds: Set<string> = new Set();
  private currentAudioSource: AudioBufferSourceNode | null = null;
  private audioContext: AudioContext | null = null;
  private conversationHooks: ConversationHooks = {};
  private transactionCompleted: boolean = false; // 発券完了後の固定音声再生・切断制御
  private audioRecordingService: AudioRecordingService | null = null; // 音声録音サービス

  constructor(private config: AzureConfig) {
    super();
    // フェーズ変更時の処理は基底クラスで統一的に処理される

    // 会話フックを設定
    this.conversationHooks = {
      beforeAIResponse: ConversationContextGenerator.generateBeforeAIResponseMessage.bind(ConversationContextGenerator)
    };

    // ConversationContextGeneratorに音声合成サービスとして自身を設定
    ConversationContextGenerator.setSpeechSynthesisService(this);

    // TicketSystemManagerに音声合成サービスとして自身を設定
    if (this.dialogFlowManager instanceof TicketDialogFlowManager) {
      const ticketSystemManager = this.dialogFlowManager.getTicketSystemManager();
      if (ticketSystemManager) {
        ticketSystemManager.setSpeechSynthesisService(this);
      }
    }
    
    // AudioContextを事前に初期化（ユーザー操作後）
    this.initAudioContext();
  }
  
  private initAudioContext(): void {
    // ユーザーの最初のインタラクション後にAudioContextを初期化
    const initOnInteraction = () => {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        console.log('[AzureService] AudioContext initialized on user interaction');
        
        // サスペンド状態の場合は再開
        if (this.audioContext.state === 'suspended') {
          this.audioContext.resume().then(() => {
            console.log('[AzureService] AudioContext resumed');
          });
        }
      }
      // イベントリスナーを削除
      document.removeEventListener('click', initOnInteraction);
      document.removeEventListener('keydown', initOnInteraction);
    };
    
    // クリックまたはキー入力でAudioContextを初期化
    document.addEventListener('click', initOnInteraction);
    document.addEventListener('keydown', initOnInteraction);
  }


  async initialize(): Promise<void> {
    try {
      this.notifyStateChange(ConnectionState.CONNECTING);

      // DialogFlowManagerから現在のシステムプロンプトを取得
      this.systemPrompt = this.getCurrentSystemPrompt();

      // Initialize TTS Provider based on user settings
      await this.initializeTTSProvider();

      // If using Azure TTS, extract the speech service for recognition
      if (this.ttsProvider instanceof AzureTTSProvider) {
        this.speechService = this.ttsProvider.getSpeechService();
      } else {
        // For non-Azure TTS, still need Azure Speech for recognition
        this.speechService = new AzureSpeechService({
          subscriptionKey: this.config.speechSubscriptionKey,
          region: this.config.speechRegion,
          language: 'ja-JP',
          voiceName: this.config.voiceName
        });
        await this.speechService.initialize();
      }

      // Initialize Azure OpenAI Service
      this.openAIService = new AzureOpenAIService({
        endpoint: this.config.openAIEndpoint,
        apiKey: this.config.openAIApiKey,
        deployment: this.config.openAIDeployment,
        apiVersion: "2024-12-01-preview",
        openAIEastUsEndpoint: this.config.openAIEastUsEndpoint,
        openAIEastUsApiKey: this.config.openAIEastUsApiKey,
        openAIEastUsDeployment: this.config.openAIEastUsDeployment,
        openAIEastUsDeploymentGpt5: this.config.openAIEastUsDeploymentGpt5
      });
      await this.openAIService.initialize();

      this.openAIServiceEastUs = new AzureOpenAIService({
        endpoint: this.config.openAIEastUsEndpoint,
        apiKey: this.config.openAIEastUsApiKey,
        deployment: this.config.openAIEastUsDeployment,
        apiVersion: "2025-01-01-preview",
        openAIEastUsEndpoint: this.config.openAIEastUsEndpoint,
        openAIEastUsApiKey: this.config.openAIEastUsApiKey,
        openAIEastUsDeployment: this.config.openAIEastUsDeployment,
        openAIEastUsDeploymentGpt5: this.config.openAIEastUsDeploymentGpt5
      });
      await this.openAIServiceEastUs.initialize();

      // Set up event handlers
      this.setupEventHandlers();

      // Initialize conversation with system prompt
      // 既存の会話履歴をクリアしてから新しいシステムプロンプトを設定
      this.conversationHistory = [];
      this.conversationHistory.push({ role: 'system', content: this.systemPrompt });
      // console.log('[AzureService] Initialized conversation history with system prompt');
      // console.log('[AzureService] System prompt content:', this.systemPrompt);

      this.notifyStateChange(ConnectionState.CONNECTED);

      // フェーズ2以降の場合、AI側から直接初回発話を開始
      if (this.dialogFlowManager instanceof TicketDialogFlowManager) {
        const ticketSystemManager = this.dialogFlowManager.getTicketSystemManager();
        if (ticketSystemManager) {
          const state = ticketSystemManager.getState();
          // フェーズ2以降の場合
          if (state.ticketInfo.currentPhase !== 'basic_info') {
            // console.log('[AzureService] Starting AI-first conversation for phase:', state.ticketInfo.currentPhase);
            // 少し待機してから、AIに空の入力を送信して初回発話を促す
            setTimeout(async () => {
              try {
                // 空の会話履歴でAIに発話させる
                const assistantResponse = await this.getInitialAIResponse();
                if (assistantResponse) {
                  // AIメッセージとして通知
                  const assistantMessageId = this.generateMessageId();
                  const assistantMessage: Message = {
                    id: assistantMessageId,
                    role: 'assistant',
                    content: assistantResponse,
                    timestamp: new Date(),
                    turnComplete: true
                  };
                  this.notifyMessage(assistantMessage);
                  this.notifyMessageComplete(assistantMessage);

                  // 会話履歴に追加
                  this.conversationHistory.push({
                    role: 'assistant',
                    content: assistantResponse
                  });

                  // 音声合成
                  if (this.ttsProvider) {
                    const audioData = await this.ttsProvider.synthesizeSpeech(assistantResponse);
                    this.playAudio(audioData);
                  }
                }
              } catch (error) {
                console.error('[AzureService] Failed to get initial AI response:', error);
              }
            }, 500);
          }
        }
      }
    } catch (error) {
      this.notifyStateChange(ConnectionState.ERROR);
      this.notifyError(error as Error);
      throw error;
    }
  }

  startRecording(): void {
    // console.log("startRecording*****************")
    if (!this.speechService) {
      throw new Error('Service not initialized');
    }

    // Prevent duplicate recognition sessions
    if (this.recording) {
      console.warn('[AzureService] Already recording, skipping start');
      return;
    }

    this.recording = true;
    this.speechService.startContinuousRecognition();
    
    // 音声録音を開始
    if (!this.audioRecordingService) {
      this.audioRecordingService = new AudioRecordingService();
    }
    this.audioRecordingService.startRecording().catch(error => {
      console.error('[AzureService] Failed to start audio recording:', error);
    });

    // フェーズ1の場合、AIから会話を開始するため、内部的にダミーメッセージを処理
    if (this.dialogFlowManager instanceof TicketDialogFlowManager) {
      const ticketSystemManager = this.dialogFlowManager.getTicketSystemManager();
      if (ticketSystemManager) {
        const state = ticketSystemManager.getState();
        // フェーズ1の場合のみ（フェーズ2以降は初期化時に既に処理済み）
        if (state.ticketInfo.currentPhase === 'basic_info') {
          setTimeout(async () => {
            try {
              // console.log('[AzureService] Triggering AI-first conversation for phase 1');
              // 画面に表示せずに内部的に処理
              await this.processUserInput('こんにちは(JRの切符の話です)');
            } catch (error) {
              console.error('[AzureService] Failed to trigger AI-first conversation:', error);
            }
          }, 500); // 少し遅延を入れて、録音が開始されてから送信
        }
      }
    }
  }

  async stopRecording(): Promise<void> {
    if (!this.speechService) {
      return;
    }

    this.recording = false;
    this.speechService.stopContinuousRecognition();
    
    // // 音声録音を停止して保存
    // if (this.audioRecordingService && this.audioRecordingService.isCurrentlyRecording()) {
    //   try {
    //     const audioBlob = await this.audioRecordingService.stopRecording();
    //     if (audioBlob && audioBlob.size > 0) {
    //       // Azure Storageにアップロード（エラーが発生しても継続）
    //       await this.uploadRecordingToStorage(audioBlob).catch(error => {
    //         console.warn('[AzureService] Audio upload failed (non-critical):', error);
    //         // Azure Storageが設定されていない場合でも、録音停止は正常に完了
    //       });
    //     }
    //   } catch (error) {
    //     console.error('[AzureService] Failed to stop audio recording:', error);
    //   }
    // }
  }
  
  // 録音データをAzure Storageにアップロード
  // private async uploadRecordingToStorage(audioBlob: Blob): Promise<void> {
  //   try {
  //     // ConversationRecorderから現在の会話IDを取得
  //     if (this.dialogFlowManager instanceof TicketDialogFlowManager) {
  //       // const ticketSystem = this.dialogFlowManager.getTicketSystemManager();
  //       // const conversationRecorder = ticketSystem?.getConversationRecorder();
  //       // const conversationId = conversationRecorder?.getCurrentConversationId();
        
  //       // if (conversationId) {
  //       //   // BlobをArrayBufferに変換
  //       //   // const arrayBuffer = await audioBlob.arrayBuffer();
          
  //       //   // Azure Storageにアップロード
  //       //   // const result = await uploadAudioToStorage(conversationId, arrayBuffer);
          
  //       //   // if (result.storageUrl && result.sasToken) {
  //       //   //   // ConversationRecorderに録音情報を更新
  //       //   //   await conversationRecorder?.updateRecordingInfo(result.storageUrl, result.sasToken);
  //       //   //   console.log('[AzureService] Audio recording uploaded successfully:', result.storageUrl);
  //       //   // }
  //       // } else {
  //       //   console.warn('[AzureService] No active conversation ID for audio upload');
  //       // }
  //     }
  //   } catch (error) {
  //     console.error('[AzureService] Failed to upload recording to storage:', error);
  //     // Azure Storageが設定されていない場合のエラーは無視（録音機能は必須ではない）
  //     throw error;
  //   }
  // }

  async sendText(text: string): Promise<void> {
    if (!this.openAIService || !this.speechService) {
      throw new Error('Service not initialized');
    }

    try {
      // Create and notify user message
      const userMessage: Message = {
        id: this.generateMessageId(),
        role: 'user',
        content: text,
        timestamp: new Date()
      };
      this.notifyMessage(userMessage);

      // Process the user input
      await this.processUserInput(text + "(JRの切符の話です)");
    } catch (error) {
      this.notifyError(error as Error);
      throw error;
    }
  }

  private async processUserInput(text: string): Promise<void> {
    if (!this.openAIService || !this.speechService) {
      throw new Error('Service not initialized');
    }

    // console.log('[AzureService] processUserInput called with:', text);

    // システムメッセージの場合は特別な処理
    const isSystemMessage = text.startsWith('システム：') || text.startsWith('システム通知：');
    if (isSystemMessage) {
      // console.log('[AzureService] System message detected, skipping OpenAI processing');
      return;
    }

    // Add to conversation history
    this.conversationHistory.push({
      role: 'user',
      content: text
    });

    // ユーザーメッセージをTicketSystemに通知
    const userMessage: Message = {
      id: this.generateMessageId(),
      role: 'user',
      content: text.replace("(JRの切符の話です)", ""),
      timestamp: new Date()
    };
    this.notifyTicketSystem(userMessage);

    // ユーザー発話から即座に情報抽出（AI応答前のコンテキスト差し込みより先に実行）
    if (this.dialogFlowManager instanceof TicketDialogFlowManager) {
      const ticketSystem = this.dialogFlowManager.getTicketSystemManager();
      if (ticketSystem) {
        // まず情報を抽出
        await ticketSystem.extractFromUserMessage(text.replace("(JRの切符の話です)", ""));

        // 発券完了後の固定音声再生と切断（以降のAI応答は行わない）
        const ticketState = ticketSystem.getState();
        if (ticketState?.ticketInfo?.ticketIssued === true || this.transactionCompleted) {
          if (!this.transactionCompleted) {
            this.transactionCompleted = true;
            const thankYou = 'ありがとうございました。切符を発券いたしました。';
            try {
              if (this.ttsProvider) {
                const audioData = await this.ttsProvider.synthesizeSpeech(thankYou);
                this.playAudio(audioData, () => {
                  // 音声再生後に通信を切断
                  try { this.disconnect(); } catch { /* noop */ }
                });
              }
            } catch (e) {
              console.error('[AzureService] Failed to synthesize/play thank you audio:', e);
              // 失敗時も切断は実施
              try { this.disconnect(); } catch { /* noop */ }
            }
          }
          return; // ここで終了（NextAction注入・OpenAI送信を行わない）
        }

        // 抽出完了後、AI応答前のコンテキスト差し込み
        if (this.conversationHooks.beforeAIResponse) {
          const injectionMessage = await this.conversationHooks.beforeAIResponse(text, ticketState);
          if (injectionMessage) {
            // console.log('[AzureService] Injecting context before AI response:', injectionMessage.content);
            // console.log('[AzureService] Injection message role:', injectionMessage.role);
            // システムメッセージの追加は避ける（既に初期化時に追加済み）
            if (injectionMessage.role === 'system') {
              console.warn('[AzureService] WARNING: Attempted to inject system message, skipping to avoid duplication');
            } else {
              this.conversationHistory.push({
                role: injectionMessage.role as 'assistant' | 'user',
                content: injectionMessage.content
              });
            }
          }
        }
      }
    }

    // Send to Azure OpenAI with streaming
    let assistantResponse = '';
    const assistantMessageId = this.generateMessageId();
    // console.log('[AzureService] Created assistant message ID:', assistantMessageId);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let chunkCount = 0;
    // 履歴を制限（システムメッセージ + 最新5往復 = 最大11メッセージ）
    // システムメッセージの重複を避ける
    const systemMessage = this.conversationHistory[0];
    let limitedHistory: ChatMessage[];

    // 会話履歴が11メッセージ以下の場合は、全履歴をそのまま使用
    if (this.conversationHistory.length <= 11) {
      limitedHistory = [...this.conversationHistory];
    } else {
      // 11メッセージを超える場合は、システムメッセージ + 最新10メッセージ
      const recentMessages = this.conversationHistory.slice(-10);

      // 最新メッセージの中にシステムメッセージが含まれている場合は除外
      const filteredRecentMessages = recentMessages.filter((msg, index) => {
        // 最初のメッセージ（index 0）かつシステムメッセージの場合は除外
        if (index === 0 && msg.role === 'system' && msg.content === systemMessage.content) {
          return false;
        }
        return true;
      });

      limitedHistory = [
        systemMessage, // システムメッセージは必ず保持
        ...filteredRecentMessages
      ];
    }

    // デバッグ用: システムメッセージの重複チェック
    const systemMessageCount = limitedHistory.filter(msg => msg.role === 'system').length;
    if (systemMessageCount > 1) {
      console.warn(`[AzureService] Multiple system messages detected: ${systemMessageCount}`);
      console.warn('[AzureService] Limited history:', limitedHistory);
    }

    // 会話履歴の現在の状態をログ
    console.log('[AzureService] Limited history:', limitedHistory);

    await this.openAIService.sendMessageStream(
      limitedHistory,
      (chunk: string) => {
        assistantResponse += chunk;
        chunkCount++;
        // console.log(`[AzureService] Streaming chunk #${chunkCount}, total length: ${assistantResponse.length}`);

        const assistantMessage: Message = {
          id: assistantMessageId,
          role: 'assistant',
          content: assistantResponse,
          timestamp: new Date()
        };
        this.notifyMessage(assistantMessage);
      }
    );

    // アシスタントの応答が空の場合、再度取得を試みる
    if (!assistantResponse || assistantResponse.trim() === '') {
      console.warn('[AzureService] Assistant response is empty, retrying...');

      // 最大3回まで再試行
      let retryCount = 0;
      const maxRetries = 3;

      while ((!assistantResponse || assistantResponse.trim() === '') && retryCount < maxRetries) {
        retryCount++;
        // console.log(`[AzureService] Retry attempt ${retryCount}/${maxRetries}`);

        // 少し待機してから再試行
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 再度ストリーミングリクエストを送信
        assistantResponse = '';
        await this.openAIService.sendMessageStream(
          limitedHistory,
          (chunk: string) => {
            assistantResponse += chunk;
            const assistantMessage: Message = {
              id: assistantMessageId,
              role: 'assistant',
              content: assistantResponse,
              timestamp: new Date()
            };
            this.notifyMessage(assistantMessage);
          }
        );
      }

      // それでも空の場合はエラーメッセージを設定
      if (!assistantResponse || assistantResponse.trim() === '') {
        console.error('[AzureService] Failed to get assistant response after retries');
        assistantResponse = '申し訳ございません。OpenAI からの 応答の取得に失敗しました。もう一度最初からやり直してください。';
        
      }
    }

    // Add assistant response to history
    this.conversationHistory.push({
      role: 'assistant',
      content: assistantResponse
    });

    // AI応答完了を通知
    const completeMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: assistantResponse,
      timestamp: new Date(),
      turnComplete: true
    };
    this.notifyMessage(completeMessage);
    this.notifyMessageComplete(completeMessage);

    // 対話進行をDialogFlowManagerに通知
    // this.notifyDialogProgress('ai');
    this.notifyTicketSystem(completeMessage);

    // フェーズ完了判定を確認
    const isPhaseComplete = this.checkPhaseCompletion();

    // Synthesize speech (always play audio, even if phase complete)
    if (assistantResponse && !this.synthesizingMessageIds.has(assistantMessageId)) {
      try {
        // Mark this message as being synthesized
        this.synthesizingMessageIds.add(assistantMessageId);
        // console.log('[AzureService] Synthesizing speech for message:', assistantMessageId);

        const audioData = await this.ttsProvider!.synthesizeSpeech(assistantResponse);

        // Play the audio directly (don't send audioData to avoid double playback)
        // フェーズ完了時は音声再生後に処理を実行
        if (isPhaseComplete) {
          // console.log('[AzureService] Phase complete - will handle after audio playback');
          this.playAudio(audioData, () => {
            // 音声再生完了後の処理はCommunicationService側で自動的に行われる
            // console.log('[AzureService] Audio playback completed for phase transition');
          });
        } else {
          this.playAudio(audioData);
        }

        // Clean up old message IDs to prevent memory leak
        if (this.synthesizingMessageIds.size > 10) {
          const firstId = this.synthesizingMessageIds.values().next().value;
          if (firstId !== undefined) {
            this.synthesizingMessageIds.delete(firstId);
          }
        }
      } catch (error) {
        console.error('[AzureService] Speech synthesis error:', error);
      }
    }
  }

  disconnect(): void {
    // Stop any ongoing audio playback
    this.stopCurrentAudio();

    if (this.ttsProvider) {
      this.ttsProvider.dispose();
      this.ttsProvider = null;
    }

    try {
      if (this.speechService) {
        // Only dispose speechService if it's not managed by AzureTTSProvider
        this.speechService.dispose();
        this.speechService = null;
      } else {
        this.speechService = null;
      }
    } catch (error) {
      console.error('[AzureService] Error disposing speech service:', error);
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    // ConversationContextGeneratorから音声合成サービスの参照をクリア
    ConversationContextGenerator.setSpeechSynthesisService(null);

    // TicketSystemManagerから音声合成サービスの参照をクリア
    if (this.dialogFlowManager instanceof TicketDialogFlowManager) {
      const ticketSystemManager = this.dialogFlowManager.getTicketSystemManager();
      if (ticketSystemManager) {
        ticketSystemManager.setSpeechSynthesisService(null);
      }
    }

    this.openAIService = null;
    this.conversationHistory = [];
    this.currentAudioSource = null;
    this.synthesizingMessageIds.clear();
    this.currentRecognizingMessageId = null;
    this.lastRecognizingText = '';
    this.isProcessingResponse = false;
    this.notifyStateChange(ConnectionState.DISCONNECTED);
  }

  private setupEventHandlers(): void {
    if (!this.speechService) return;

    // Handle recognizing (interim results)
    this.speechService.onRecognizing(async (text: string) => {
      if (text.trim() && text !== this.lastRecognizingText) {
        if (!this.currentRecognizingMessageId) {
          this.currentRecognizingMessageId = this.generateMessageId();
          // console.log('[AzureService] Created new recognizing message ID:', this.currentRecognizingMessageId);
        }

        // console.log('[AzureService] Recognizing text:', text, 'ID:', this.currentRecognizingMessageId);

        // Check if AI is speaking and interrupt if user starts speaking
        if (this.ttsProvider?.getIsSpeaking() || this.currentAudioSource) {
          // console.log('[AzureService] User speaking detected while AI is speaking - interrupting audio');
          await this.stopCurrentAudio();
        }

        // Send the complete text (App.tsx will handle deduplication)
        const message: Message = {
          id: this.currentRecognizingMessageId,
          role: 'user',
          content: text,
          timestamp: new Date(),
          isTranscription: true
        };
        this.notifyMessage(message);
        this.lastRecognizingText = text;
      }
    });

    // Handle recognized speech (final result)
    this.speechService.onRecognized(async (text: string) => {
      // console.log('[AzureService] onRecognized:', text);
      if (text.trim() && !this.isProcessingResponse) {
        // Prevent duplicate processing
        this.isProcessingResponse = true;

        // Final recognition - update the existing message with final text
        const finalMessageId = this.currentRecognizingMessageId || this.generateMessageId();
        // console.log('[AzureService] Final message ID:', finalMessageId, 'Current ID:', this.currentRecognizingMessageId);

        const message: Message = {
          id: finalMessageId,
          role: 'user',
          content: text,
          timestamp: new Date(),
          isTranscription: true,
          turnComplete: true  // 音声認識が完了
        };
        this.notifyMessage(message);
        this.notifyMessageComplete(message);

        // Reset recognizing state
        this.currentRecognizingMessageId = null;
        this.lastRecognizingText = '';

        // ユーザーの発話が完了したタイミング（recognizedイベント）
        // console.log('----------------------------------------');
        // console.log('[AzureService] ユーザー発話完了（音声認識）');
        // console.log('全文:', text);
        // console.log('文字数:', text.length);
        // console.log('----------------------------------------');

        // 対話進行をDialogFlowManagerに通知
        // this.notifyDialogProgress('user');

        // ユーザー発話から即座に情報抽出（processUserInputに統合）
        if (this.dialogFlowManager instanceof TicketDialogFlowManager) {
          // 通常の通知処理は不要（processUserInput内で処理）
        } else {
          // 通常の通知処理
          this.notifyTicketSystem(message);
        }

        try {
          // Process the text with Azure OpenAI (without creating duplicate user message)
          await this.processUserInput(text + "(JRの切符の話です)");
        } finally {
          this.isProcessingResponse = false;
        }
      }
    });

    // Handle speech errors
    this.speechService.onError((error: Error) => {
      this.notifyError(error);
    });
  }

  private async stopCurrentAudio(): Promise<void> {
    if (this.currentAudioSource) {
      try {
        this.currentAudioSource.stop();
        this.currentAudioSource.disconnect();
        this.currentAudioSource = null;
        // console.log('[AzureService] Audio playback stopped');
      } catch (error) {
        console.error('[AzureService] Error stopping audio:', error);
      }
    }

    // Also stop any ongoing speech synthesis
    if (this.speechService) {

      // await this.speechService.stopSpeaking();
    }
  }

  private async getInitialAIResponse(): Promise<string> {
    if (!this.openAIService) {
      throw new Error('OpenAI service not initialized');
    }

    // console.log('[AzureService] Getting initial AI response');

    // システムプロンプトのみで初回発話を取得
    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt }
    ];

    // 初回発話前のコンテキスト差し込み（フェーズ情報など）
    if (this.dialogFlowManager instanceof TicketDialogFlowManager) {
      const ticketSystem = this.dialogFlowManager.getTicketSystemManager();
      if (ticketSystem) {
        const ticketState = ticketSystem.getState();
        const contextMessage = ConversationContextGenerator.generateContextMessage(ticketState, true, true);
        if (contextMessage) {
          console.log('[AzureService] Adding initial context:', contextMessage);
          messages.push({
            role: 'assistant',
            content: contextMessage
          });
        }
      }
    }

    // OpenAIに初回発話を要求
    let response = '';
    await this.openAIService.sendMessageStream(
      messages,
      (chunk: string) => {
        response += chunk;
      }
    );

    return response;
  }

  /**
   * 外部から音声合成と再生を行うためのパブリックメソッド
   * 使用例:
   * ```typescript
   * const service = communicationService;
   * if (service instanceof AzureService) {
   *   await service.synthesizeAndPlaySpeech('こんにちは');
   * }
   * ```
   * @param text 音声合成するテキスト
   * @param onEnded 音声再生完了時のコールバック
   * @returns Promise<void>
   */
  public async synthesizeAndPlaySpeech(text: string, onEnded?: () => void): Promise<void> {
    if (!this.ttsProvider) {
      throw new Error('TTS provider is not initialized');
    }

    try {
      const audioData = await this.ttsProvider.synthesizeSpeech(text);
      this.playAudio(audioData, onEnded);
    } catch (error) {
      console.error('[AzureService] Failed to synthesize and play speech:', error);
      throw error;
    }
  }

  /**
   * 外部から音声合成のみを行うためのパブリックメソッド
   * @param text 音声合成するテキスト
   * @returns Promise<ArrayBuffer> 合成された音声データ
   */
  public async synthesizeSpeech(text: string): Promise<ArrayBuffer> {
    if (!this.ttsProvider) {
      throw new Error('TTS provider is not initialized');
    }

    try {
      return await this.ttsProvider.synthesizeSpeech(text);
    } catch (error) {
      console.error('[AzureService] Failed to synthesize speech:', error);
      throw error;
    }
  }

  /**
   * 外部から音声データの再生のみを行うためのパブリックメソッド
   * @param audioData 再生する音声データ
   * @param onEnded 音声再生完了時のコールバック
   */
  public playSynthesizedAudio(audioData: ArrayBuffer, onEnded?: () => void): void {
    this.playAudio(audioData, onEnded);
  }

  /**
   * TTSプロバイダーを再初期化する（設定変更時の即時反映用）
   */
  public async reinitializeTTSProvider(): Promise<void> {
    try {
      // 現在のTTSプロバイダーを破棄
      if (this.ttsProvider) {
        this.ttsProvider.dispose();
        this.ttsProvider = null;
      }

      // 新しいTTSプロバイダーを初期化
      await this.initializeTTSProvider();
      
      console.log('[AzureService] TTS provider reinitialized successfully');
    } catch (error) {
      console.error('[AzureService] Failed to reinitialize TTS provider:', error);
      throw error;
    }
  }

  /**
   * TTSプロバイダーを初期化
   */
  private async initializeTTSProvider(): Promise<void> {
    try {
      this.ttsProvider = await TTSServiceFactory.createFromCurrentConfig();
    } catch (error) {
      console.warn('[AzureService] Failed to create TTS provider from settings, using Azure default:', error);
      // Fallback to Azure TTS
      this.ttsProvider = await TTSServiceFactory.create({
        provider: 'azure',
        azure: {
          subscriptionKey: this.config.speechSubscriptionKey,
          region: this.config.speechRegion,
          language: 'ja-JP',
          voiceName: this.config.voiceName
        }
      });
    }
  }

  private playAudio(audioData: ArrayBuffer, onEnded?: () => void): void {
    try {
      // console.log('[AzureService] Playing audio, size:', audioData.byteLength);

      // Create audio context if not exists (fallback for cases where user interaction hasn't occurred)
      if (!this.audioContext) {
        console.warn('[AzureService] AudioContext not initialized by user interaction, creating now');
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      // AudioContextがサスペンド状態の場合は再開
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().then(() => {
          console.log('[AzureService] AudioContext resumed for playback');
        });
      }

      // Clone the audioData to avoid issues with multiple decoding
      const audioDataCopy = audioData.slice(0);

      // Azure Speech SDK returns WAV format, we need to decode it
      this.audioContext.decodeAudioData(audioDataCopy, async (audioBuffer) => {
        // Stop any currently playing audio
        if (this.currentAudioSource) {
          this.currentAudioSource.stop();
          this.currentAudioSource.disconnect();
          // 前の音声の停止を待つ
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        // Create gain node for fade in/out (ポップノイズ対策)
        const gainNode = this.audioContext!.createGain();
        gainNode.connect(this.audioContext!.destination);
        
        // Start with volume at 0 for fade-in
        gainNode.gain.setValueAtTime(0, this.audioContext!.currentTime);
        
        // Create new source and connect through gain node
        this.currentAudioSource = this.audioContext!.createBufferSource();
        this.currentAudioSource.buffer = audioBuffer;
        this.currentAudioSource.connect(gainNode);

        // Fade in over 50ms
        gainNode.gain.linearRampToValueAtTime(1, this.audioContext!.currentTime + 0.05);
        
        // Fade out before end (if duration is known)
        const fadeOutTime = audioBuffer.duration - 0.05;
        if (fadeOutTime > 0.05) {
          gainNode.gain.setValueAtTime(1, this.audioContext!.currentTime + fadeOutTime);
          gainNode.gain.linearRampToValueAtTime(0, this.audioContext!.currentTime + audioBuffer.duration);
        }

        // Clean up when playback ends
        this.currentAudioSource.onended = () => {
          this.currentAudioSource = null;
          gainNode.disconnect();
          // console.log('[AzureService] Audio playback ended');
          if (onEnded) {
            onEnded();
          }
        };

        // Add small delay before starting playback (ポップノイズ対策)
        setTimeout(() => {
          if (this.currentAudioSource) {
            this.currentAudioSource.start();
            // console.log('[AzureService] Playing audio, duration:', audioBuffer.duration);
          }
        }, 10);
      }, (error) => {
        console.error('[AzureService] Error decoding audio:', error);
      });
    } catch (error) {
      console.error('[AzureService] Error playing audio:', error);
    }
  }
}