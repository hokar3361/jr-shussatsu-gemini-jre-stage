import { ConversationService } from './ConversationService';
import { debounce } from '../../utils/debounce';

export class ConversationRecorder {
  private conversationService: ConversationService;
  private currentConversationId: string | null = null;
  private sessionId: string;
  private isRecording: boolean = false;
  private hearingItemsCache: any = {};
  private messagesQueue: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  private updateInProgress: boolean = false;

  // デバウンス処理用
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  private debouncedUpdateHearingItems: Function;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  private debouncedProcessMessageQueue: Function;

  constructor(sessionId?: string) {
    this.conversationService = new ConversationService();
    this.sessionId = sessionId || `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    
    // デバウンス設定（500ms待機）
    this.debouncedUpdateHearingItems = debounce(this.updateHearingItems.bind(this), 500);
    this.debouncedProcessMessageQueue = debounce(this.processMessageQueue.bind(this), 300);
  }

  async startRecording(): Promise<string> {
    if (this.isRecording && this.currentConversationId) {
      console.warn('Recording already in progress, using existing conversation:', this.currentConversationId);
      return this.currentConversationId;
    }

    try {
      const conversation = await this.conversationService.createConversation(this.sessionId);
      this.currentConversationId = conversation.id;
      this.isRecording = true;
      this.hearingItemsCache = {};
      this.messagesQueue = [];
      
      console.log('Started recording conversation:', this.currentConversationId);
      return this.currentConversationId;
    } catch (error) {
      console.error('Failed to start recording:', error);
      throw error;
    }
  }

  async stopRecording(): Promise<void> {
    if (!this.isRecording || !this.currentConversationId) {
      return;
    }

    try {
      // 残りのキューを処理
      await this.processMessageQueue();
      
      // 会話を完了状態に更新
      await this.conversationService.updateConversation(this.currentConversationId, {
        endTime: new Date().toISOString(),
        status: 'completed'
      });
      
      console.log('Stopped recording conversation:', this.currentConversationId);
    } catch (error) {
      console.error('Failed to stop recording:', error);
    } finally {
      this.isRecording = false;
      this.currentConversationId = null;
      this.hearingItemsCache = {};
      this.messagesQueue = [];
    }
  }

  async abortRecording(): Promise<void> {
    if (!this.isRecording || !this.currentConversationId) {
      return;
    }

    try {
      await this.conversationService.updateConversation(this.currentConversationId, {
        endTime: new Date().toISOString(),
        status: 'aborted'
      });
      
      console.log('Aborted recording conversation:', this.currentConversationId);
    } catch (error) {
      console.error('Failed to abort recording:', error);
    } finally {
      this.isRecording = false;
      this.currentConversationId = null;
      this.hearingItemsCache = {};
      this.messagesQueue = [];
    }
  }

  recordMessage(role: 'user' | 'assistant', content: string): void {
    if (!this.isRecording || !this.currentConversationId) {
      return;
    }

    this.messagesQueue.push({ role, content });
    this.debouncedProcessMessageQueue();
  }

  updateHearingItem(key: string, value: any): void {
    if (!this.isRecording || !this.currentConversationId) {
      return;
    }

    this.hearingItemsCache[key] = value;
    this.debouncedUpdateHearingItems();
  }

  updateAllHearingItems(items: any): void {
    if (!this.isRecording || !this.currentConversationId) {
      return;
    }

    this.hearingItemsCache = { ...this.hearingItemsCache, ...items };
    this.debouncedUpdateHearingItems();
  }

  async addFeedback(feedback: string): Promise<void> {
    if (!this.currentConversationId) {
      console.warn('No active conversation to add feedback');
      return;
    }

    try {
      await this.conversationService.addFeedback(this.currentConversationId, feedback);
      console.log('Feedback added to conversation:', this.currentConversationId);
    } catch (error) {
      console.error('Failed to add feedback:', error);
      throw error;
    }
  }

  async updateRecordingInfo(storageUrl: string, sasToken: string): Promise<void> {
    if (!this.currentConversationId) {
      console.warn('No active conversation to update recording info');
      return;
    }

    try {
      await this.conversationService.updateRecording(this.currentConversationId, storageUrl, sasToken);
      console.log('Recording info updated for conversation:', this.currentConversationId);
    } catch (error) {
      console.error('Failed to update recording info:', error);
      throw error;
    }
  }

  async markTicketIssued(): Promise<void> {
    if (!this.currentConversationId) {
      return;
    }

    try {
      await this.conversationService.updateConversation(this.currentConversationId, {
        ticketIssued: true
      });
      console.log('Marked ticket as issued for conversation:', this.currentConversationId);
    } catch (error) {
      console.error('Failed to mark ticket as issued:', error);
    }
  }

  private async updateHearingItems(): Promise<void> {
    if (!this.currentConversationId || Object.keys(this.hearingItemsCache).length === 0) {
      return;
    }

    try {
      await this.conversationService.updateConversation(this.currentConversationId, {
        hearingItems: this.hearingItemsCache
      });
    } catch (error) {
      console.error('Failed to update hearing items:', error);
      // リトライロジック
      setTimeout(() => this.updateHearingItems(), 2000);
    }
  }

  private async processMessageQueue(): Promise<void> {
    if (!this.currentConversationId || this.messagesQueue.length === 0 || this.updateInProgress) {
      return;
    }

    this.updateInProgress = true;
    const messagesToProcess = [...this.messagesQueue];
    this.messagesQueue = [];

    try {
      for (const message of messagesToProcess) {
        await this.conversationService.addMessage(this.currentConversationId, message);
      }
    } catch (error) {
      console.error('Failed to process message queue:', error);
      // 失敗したメッセージをキューに戻す
      this.messagesQueue.unshift(...messagesToProcess);
      // リトライ
      setTimeout(() => this.processMessageQueue(), 2000);
    } finally {
      this.updateInProgress = false;
    }
  }

  getCurrentConversationId(): string | null {
    return this.currentConversationId;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  isCurrentlyRecording(): boolean {
    return this.isRecording;
  }
}