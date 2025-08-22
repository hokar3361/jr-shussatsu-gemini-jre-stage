import { DialogFlowManager } from './DialogFlowManager';
import { TicketSystemManager } from '../ticket/TicketSystemManager';

export class TicketDialogFlowManager extends DialogFlowManager {
  private ticketSystemManager: TicketSystemManager;
  declare protected onPhaseChanged?: (newPhase: string) => void;
  private onInitialUserMessageRequest?: (message: string) => void;
  // CommunicationServiceへのコールバック
  private onSystemMessageRequest?: (message: string) => void;

  setOnSystemMessageRequest(callback: (message: string) => void): void {
    this.onSystemMessageRequest = callback;
  }
  constructor() {
    super();
    // console.log('[TicketDialogFlowManager] Constructor called');
    this.ticketSystemManager = new TicketSystemManager();
    
    // Conversation Recordingを開始
    this.ticketSystemManager.startConversationRecording().catch(error => {
      console.error('[TicketDialogFlowManager] Failed to start conversation recording:', error);
    });
    
    // console.log('[TicketDialogFlowManager] Setting up onStateChange handler');
    // 発券システムの状態変更を監視
    this.ticketSystemManager.setOnStateChange((state) => {
      // console.log('[TicketDialogFlowManager] onStateChange called, current phase:', this.currentPhase?.id, 'new phase:', state.currentPhase);
      
      // フェーズが変更された場合
      if (state.ticketInfo.currentPhase !== this.currentPhase?.id) {
        // console.log(`[TicketDialogFlowManager] Phase changed from ${this.currentPhase?.id} to ${state.currentPhase}`);
        
        // currentPhaseを更新
        this.currentPhase = {
          id: state.ticketInfo.currentPhase,
          name: this.getPhaseNameById(state.ticketInfo.currentPhase),
          systemPrompt: this.ticketSystemManager.getCurrentSystemPrompt(),
          transitionMessage: ''
        };
        
        // フェーズ変更のコールバックは使用しない（再接続を避けるため）
      }
    });
    
    // 初回ユーザーメッセージリクエストを監視
    this.ticketSystemManager.setOnInitialUserMessageRequest((message) => {
      // console.log(`[TicketDialogFlowManager] Initial user message requested: ${message}`);
      if (this.onInitialUserMessageRequest) {
        this.onInitialUserMessageRequest(message);
      }
    });

    // TicketSystemManagerからのシステムメッセージリクエストを処理
    this.ticketSystemManager.setOnSystemMessageRequest((message) => {
      // console.log('[TicketDialogFlowManager] System message requested:', message);

      // CommunicationServiceに転送
      if (this.onSystemMessageRequest) {
        this.onSystemMessageRequest(message);
      }
    });
    
    // 発券システムのフェーズで初期化
    this.initializeTicketPhases();
  }

  private initializeTicketPhases(): void {
    // 既存のフェーズをクリア
    this.phases.clear();
    
    // 発券システムのフェーズを設定
    // 注：実際のシステムプロンプトはTicketSystemManagerから取得
    this.phases.set('basic_info', {
      id: 'basic_info',
      name: '基本情報ヒアリング',
      systemPrompt: '', // TicketSystemManagerから動的に取得
      transitionMessage: '基本情報のヒアリングを開始します。',
    });

    // 初期フェーズを設定
    this.currentPhase = this.phases.get('basic_info')!;
  }

  // システムプロンプトを動的に取得
  getCurrentPrompt(): string {
    return this.ticketSystemManager.getCurrentSystemPrompt();
  }

  // TicketSystemManagerを取得
  getTicketSystemManager(): TicketSystemManager {
    return this.ticketSystemManager;
  }

  // メッセージ追加時にTicketSystemManagerにも通知
  addMessage(type: 'transition' | 'completion' | 'error', content: string): void {
    super.addMessage(type, content);
  }
  
  // フィードバックを追加
  async addFeedback(feedback: string): Promise<void> {
    await this.ticketSystemManager.addFeedback(feedback);
  }
  
  // 発券システム用のメッセージ追加
  addTicketMessage(type: 'user' | 'ai', content: string): void {
    
    // ユーザーまたはAIのメッセージの場合、TicketSystemManagerに通知
    if (type === 'user') {
      this.ticketSystemManager.processUserMessage(content);
    } else if (type === 'ai') {
      // AI応答の処理は非同期だが、エラーハンドリングは呼び出し側で行う
      this.ticketSystemManager.processAIResponse(content).catch(error => {
        console.error('[TicketDialogFlowManager] Failed to process AI response:', error);
      });
    }
  }

  // // フェーズ遷移メッセージを生成（オーバーライド）
  // generateCompletionMessage(messageType: 'user' | 'ai'): string {
  //   if (messageType === 'ai') {
  //     const state = this.ticketSystemManager.getState();
      
  //     // フェーズ完了トリガーが検出された場合
  //     if (state.conversationHistory.length > 0) {
  //       const lastMessage = state.conversationHistory[state.conversationHistory.length - 1];
  //       if (lastMessage.role === 'assistant' && 
  //           lastMessage.content.includes('次の確認に移らせていただきます')) {
  //         return 'フェーズ2に移行しました（Phase2は未実装です）';
  //       }
  //     }
  //   }
    
  //   return super.generateCompletionMessage(messageType);
  // }

  // フェーズ変更時のコールバックを設定
  setOnPhaseChanged(callback: (newPhase: string) => void): void {
    this.onPhaseChanged = callback;
  }

  // 初回ユーザーメッセージリクエストのコールバックを設定
  setOnInitialUserMessageRequest(callback: (message: string) => void): void {
    this.onInitialUserMessageRequest = callback;
  }

  // システムリセット時の処理
  reset(): void {
    super.reset();
    this.ticketSystemManager.reset();
    this.initializeTicketPhases();
  }

  // フェーズIDから名前を取得
  private getPhaseNameById(phaseId: string): string {
    const phaseNames: Record<string, string> = {
      'basic_info': '基本情報ヒアリング',
      'joban_express_inquiry': '常磐線特急関連ヒアリング',
      'seat_unspecified': '座席未指定利用ヒアリング',
      'arrival_time_specified': '常磐線 - 到着時刻指定ケース',
      'departure_time_specified': '常磐線 + 在来ヒアリングケース',
      'ticket_confirmation': '発券内容確認',
      'route_search': '経路検索',
      'seat_selection': '座席選択',
      'payment': '決済',
      'confirmation': '確認'
    };
    return phaseNames[phaseId] || phaseId;
  }
}