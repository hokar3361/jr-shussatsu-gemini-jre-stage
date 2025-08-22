import type { ICommunicationService, Message } from './types';
import { ConnectionState } from './types';
import { DialogFlowManager } from '../dialog/DialogFlowManager';
import { TicketDialogFlowManager } from '../dialog/TicketDialogFlowManager';

export abstract class CommunicationService implements ICommunicationService {
  protected messageCallbacks: ((message: Message) => void)[] = [];
  protected messageCompleteCallbacks: ((message: Message) => void)[] = [];
  protected errorCallbacks: ((error: Error) => void)[] = [];
  protected stateChangeCallbacks: ((state: ConnectionState) => void)[] = [];
  protected connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  protected recording: boolean = false;
  protected dialogFlowManager: DialogFlowManager | any; // TicketDialogFlowManagerも受け入れる
  protected onPhaseChanged?: (newPhase: string) => void;

  constructor() {
    // 発券システムを使用する場合はTicketDialogFlowManagerを使用
    // TODO: 設定から取得する必要があるが、コンストラクタでは非同期処理ができないため、
    // 現在はデフォルトでTicketDialogFlowManagerを使用
    const useTicketSystem = true; // デフォルトで有効
    this.dialogFlowManager = useTicketSystem 
      ? new TicketDialogFlowManager() 
      : new DialogFlowManager();
      
    // TicketDialogFlowManagerの場合、システムメッセージリクエストを監視
    if (this.dialogFlowManager instanceof TicketDialogFlowManager) {
      this.dialogFlowManager.setOnSystemMessageRequest((message) => {
        // console.log('[CommunicationService] System message requested:', message);
        // sendTextメソッドを使って送信
        this.sendText(message);
      });
      
      // 初回ユーザーメッセージリクエストを監視
      this.dialogFlowManager.setOnInitialUserMessageRequest((message) => {
        // console.log(`[CommunicationService] Initial user message requested: ${message}`);
        // 自動的にメッセージを送信（ただし再接続中は無視）
        setTimeout(() => {
          if (this.isConnected() && this.connectionState !== ConnectionState.CONNECTING) {
            this.sendText(message).catch(error => {
              console.error('[CommunicationService] Failed to send initial user message:', error);
            });
          } else {
            // console.log('[CommunicationService] Skipping initial user message - not connected or reconnecting');
            // 再接続が完了するまで待機して再試行
            const retryInterval = setInterval(() => {
              if (this.isConnected() && this.connectionState !== ConnectionState.CONNECTING) {
                clearInterval(retryInterval);
                // console.log('[CommunicationService] Connection restored, sending initial user message');
                this.sendText(message).catch(error => {
                  console.error('[CommunicationService] Failed to send initial user message:', error);
                });
              }
            }, 100);
            // 最大5秒で諦める
            setTimeout(() => clearInterval(retryInterval), 5000);
          }
        }, 500); // 少し遅延を入れて、UI更新が完了してから送信
      });
      
      // システムメッセージリクエストのハンドラを設定
      const ticketSystemManager = this.dialogFlowManager.getTicketSystemManager();
      if (ticketSystemManager) {
        ticketSystemManager.setOnSystemMessageRequest((message) => {
          // console.log(`[CommunicationService] System message requested: ${message}`);
          // システムメッセージとして送信
          if (this.isConnected()) {
            this.sendText(message).catch(error => {
              console.error('[CommunicationService] Failed to send system message:', error);
            });
          }
        });
      }
    }
    
  }

  abstract initialize(): Promise<void>;
  abstract startRecording(): void;
  abstract stopRecording(): void;
  abstract sendText(text: string): Promise<void>;
  abstract disconnect(): void;
  

  onMessage(callback: (message: Message) => void): void {
    this.messageCallbacks.push(callback);
  }

  onMessageComplete(callback: (message: Message) => void): void {
    this.messageCompleteCallbacks.push(callback);
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallbacks.push(callback);
  }

  onStateChange(callback: (state: ConnectionState) => void): void {
    this.stateChangeCallbacks.push(callback);
  }

  isConnected(): boolean {
    return this.connectionState === ConnectionState.CONNECTED;
  }

  isRecording(): boolean {
    return this.recording;
  }

  protected notifyMessage(message: Message): void {
    this.messageCallbacks.forEach(callback => callback(message));
  }

  protected notifyMessageComplete(message: Message): void {
    this.messageCompleteCallbacks.forEach(callback => callback(message));
  }

  protected notifyError(error: Error): void {
    this.errorCallbacks.forEach(callback => callback(error));
  }

  protected notifyStateChange(state: ConnectionState): void {
    this.connectionState = state;
    this.stateChangeCallbacks.forEach(callback => callback(state));
  }

  protected generateMessageId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  getDialogFlowManager(): DialogFlowManager {
    return this.dialogFlowManager;
  }

  protected getCurrentSystemPrompt(): string {
    return this.dialogFlowManager.getCurrentPrompt();
  }

  // protected notifyDialogProgress(): void {
  //   // const completionMessage = this.dialogFlowManager.generateCompletionMessage(messageType);
  //   const progressMessage = this.dialogFlowManager.generateProgressMessage();
    
  //   // this.dialogFlowManager.addMessage('completion', completionMessage);
  //   this.dialogFlowManager.addMessage('completion', progressMessage);
  // }
  
  // フェーズ完了判定をチェック（必須項目が完了しているかどうか）
  protected checkPhaseCompletion(): boolean {
    if (this.dialogFlowManager instanceof TicketDialogFlowManager) {
      const ticketSystemManager = this.dialogFlowManager.getTicketSystemManager();
      if (ticketSystemManager) {
        const state = ticketSystemManager.getState();
        const currentPhase = state.ticketInfo.currentPhase;
        const ticketInfo = state.ticketInfo;
        
        // フェーズ1の場合
        if (currentPhase === 'basic_info') {
          return ticketInfo.basicInfoConfirmed === true;
        }
        // フェーズ2の場合
        else if (currentPhase === 'joban_express_inquiry') {
          // フェーズ1完了の派生条件（単一フラグ廃止）
          const useJoban = ticketInfo.phase2_jobanExpressUse;
          const timeSpec = ticketInfo.phase2_timeSpecification;
          const timeType = ticketInfo.phase2_timeSpecificationType;
          const unspecifiedOk = ticketInfo.phase2_confirmUnspecifiedSeat !== null && ticketInfo.phase2_confirmUnspecifiedSeat !== undefined;
          const proposedOk = ticketInfo.proposedRouteOK === true;
          const zairaiUse = ticketInfo.phase2_useZairaiExpress;

          // 完了条件:
          // 1) 常磐線を利用しない
          if (useJoban === false) return true;
          // 2) 時間指定なし + 座席未指定の可否が確定
          if (useJoban === true && timeSpec === false && unspecifiedOk) return true;
          // 3) 到着時刻指定(stop) で提案経路OK
          if (useJoban === true && timeSpec === true && timeType === 'stop' && proposedOk) return true;
          // 4) 出発時刻指定(start) で在来特急なし かつ 提案経路OK
          if (useJoban === true && timeSpec === true && timeType === 'start' && zairaiUse === false && proposedOk) return true;
          // 5) 出発時刻指定(start) ＋在来特急ありはフェーズ2へ進むため、ここでは未完了

          return false;
        }
        // その他のフェーズの確認フラグをチェック
        else if (currentPhase === 'ticket_confirmation') {
          return ticketInfo.ticketConfirmed === true;
        }
      }
    }
    return false;
  }

  // メッセージ完了時に発券システムに通知
  protected notifyTicketSystem(message: Message): void {
    if (this.dialogFlowManager instanceof TicketDialogFlowManager) {
      const messageType = message.role === 'user' ? 'user' : 'ai';
      this.dialogFlowManager.addTicketMessage(messageType, message.content);
    }
  }
}