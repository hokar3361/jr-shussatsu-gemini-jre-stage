import { TicketPhases } from './types';
import type {
  TicketSystemState,
  TicketSystemConfig,
  TicketInformation
} from './types';
import { PhaseManager } from './PhaseManager';
import { InformationExtractor } from './InformationExtractor';
import { AzureOpenAIInformationExtractor } from './AzureOpenAIInformationExtractor';
// import { PromptManager } from './PromptManager';
import { RouteSearchService } from '../cosmos/RouteSearchService';
import { ConfigManager } from '../../config/ConfigManager';
import { JobanExpressProcessor } from './JobanExpressProcessor';
import { DebugChatInjector } from '../communication/DebugChatInjector';
import type { ISpeechSynthesisService } from '../communication/ISpeechSynthesisService';
import { ConversationRecorder } from '../conversation/ConversationRecorder';

export class TicketSystemManager {
  private phaseManager: PhaseManager;
  private informationExtractor: InformationExtractor | AzureOpenAIInformationExtractor;
  private routeSearchService: RouteSearchService;
  private state: TicketSystemState;
  private config: TicketSystemConfig;
  private onStateChangeCallbacks: ((state: TicketSystemState) => void)[] = [];
  private routeSearchTimeout?: ReturnType<typeof setTimeout>;
  // private onInitialUserMessageRequest?: (message: string) => void;  // 未使用のため一時的にコメントアウト
  private pendingPhaseTransition: boolean = false;
  private lastExtractedFromUser: boolean = false;
  private speechSynthesisService: ISpeechSynthesisService | null = null;
  private conversationRecorder: ConversationRecorder | null = null;
  // 次回のフェーズ遷移時に currentPhaseHistory をクリアしない（ユーザー直近発話を失わない）
  // private skipHistoryClearOnce: boolean = false;

  // /** 直近の全体会話履歴から、最後のアシスタント→ユーザーの2発話を現在フェーズ履歴にシードする */
  // private seedCurrentPhaseHistoryFromGlobal(): void {
  //   const history = this.state.conversationHistory;
  //   if (!history || history.length === 0) return;
  //   // 直近のユーザー発話を探す
  //   const lastUserIndex = [...history].reverse().findIndex(m => m.role === 'user');
  //   if (lastUserIndex === -1) return;
  //   const idxFromEnd = lastUserIndex;
  //   const absoluteUserIndex = history.length - 1 - idxFromEnd;
  //   const seed: typeof history = [];
  //   // 直前のアシスタント発話（あれば）
  //   if (absoluteUserIndex - 1 >= 0 && history[absoluteUserIndex - 1].role === 'assistant') {
  //     seed.push(history[absoluteUserIndex - 1]);
  //   }
  //   // 最新ユーザー発話
  //   seed.push(history[absoluteUserIndex]);
  //   // シードを現在フェーズ履歴に反映
  //   this.state.currentPhaseHistory.push(...seed);
  // }

  constructor(config?: Partial<TicketSystemConfig>) {
    // 設定の初期化
    const appConfig = ConfigManager.getInstance().getAppConfig();
    this.config = {
      departureStation: config?.departureStation || appConfig?.departureStation || '水戸',
      llmApiEndpoint: config?.llmApiEndpoint,
      useAzureOpenAI: config?.useAzureOpenAI ?? true  // デフォルトでAzure OpenAIを使用
    };

    // 各マネージャーの初期化
    this.phaseManager = new PhaseManager(this.config.departureStation);

    // ConversationRecorderの初期化
    this.conversationRecorder = new ConversationRecorder();

    // Azure OpenAIまたはGemini APIのExtractorを選択
    this.informationExtractor = this.config.useAzureOpenAI
      ? new AzureOpenAIInformationExtractor()
      : new InformationExtractor();

    // 経路検索サービスの初期化
    this.routeSearchService = new RouteSearchService();

    // 初期状態の設定
    this.state = {
      ticketInfo: ({
        currentPhase: TicketPhases.BASIC_INFO,
        // 必須項目
        destination: null,
        travelDate: null,
        adultCount: null,
        childCount: null,
        basicInfoConfirmed: null,
        // オプション項目
        useDateTime: null,
        useDateTimeType: null,
        phase2_jobanExpressUse: null,
        jobanExpressStop: null,
        expressPreference: null,
        transferTimePreference: null,
        routes: undefined,
        jobanExpressRoutes: undefined,
        jobanZairaiExpressRoutes: undefined,
        // フェーズ2の確認フラグ
        phase2_confirmed: null,
        // フェーズ3以降の項目
        phase2_confirmUnspecifiedSeat: null,
        selectedRoute: null,
        zairaiExpressSelection: null,
        ticketConfirmed: null,
        phase2_timeSpecification: null,
        phase2_timeSpecificationType: null,
        phase2_specificTime: null,
        phase2_useZairaiExpress: null,
        transferStation: null,
        proposedRoute: null,
        proposedRouteOK: null,
        proposedRouteRequest: null,
        ticketIssued: null,
        // confirmUnspecifiedSeat: null,
        // phase2_ticketConfirmed: null,
        zairaiSpecial_proposedRouteOK: null,
        zairaiSpecial_proposedRouteRequest: null
      } as TicketInformation),
      conversationHistory: [],
      currentPhaseHistory: [],
      isExtracting: false,
      isSearchingRoutes: false,
      error: null,
      jobanExpressSeatInfo: null,
      zairaiExpressSeatInfo: null
    };
  }

  // 状態変更のリスナーを設定
  setOnStateChange(callback: (state: TicketSystemState) => void): void {
    // console.log('[TicketSystemManager] Adding onStateChange callback');
    this.onStateChangeCallbacks.push(callback);
  }

  // 初回ユーザーメッセージリクエストのリスナーを設定
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setOnInitialUserMessageRequest(_callback: (message: string) => void): void {
    // this.onInitialUserMessageRequest = callback;  // 未使用のため一時的にコメントアウト
    console.warn('[TicketSystemManager] setOnInitialUserMessageRequest called but not implemented');
  }

  // 現在のシステムプロンプトを取得
  getCurrentSystemPrompt(): string {
    return this.phaseManager.getUnifiedPrompt();
  }

  // 現在の状態を取得
  getState(): TicketSystemState {
    return { ...this.state };
  }

  /**
   * 音声合成サービスを設定
   * @param service 音声合成サービス
   */
  setSpeechSynthesisService(service: ISpeechSynthesisService | null): void {
    this.speechSynthesisService = service;

    // AzureOpenAIInformationExtractorにも設定を伝播
    if (this.informationExtractor instanceof AzureOpenAIInformationExtractor) {
      this.informationExtractor.setSpeechSynthesisService(service);
    }
  }

  /**
   * 音声合成サービスを取得
   * @returns 音声合成サービス（設定されていない場合はnull）
   */
  getSpeechSynthesisService(): ISpeechSynthesisService | null {
    return this.speechSynthesisService;
  }

  // ConversationRecorderの開始
  async startConversationRecording(): Promise<void> {
    if (this.conversationRecorder) {
      const conversationId = await this.conversationRecorder.startRecording();
      console.log('[TicketSystemManager] Started conversation recording:', conversationId);

      // 初期状態を記録
      if (this.state.ticketInfo) {
        this.conversationRecorder.updateAllHearingItems(this.state.ticketInfo);
      }
    }
  }

  // ConversationRecorderの停止
  async stopConversationRecording(): Promise<void> {
    if (this.conversationRecorder) {
      await this.conversationRecorder.stopRecording();
      console.log('[TicketSystemManager] Stopped conversation recording');
    }
  }

  // フィードバックの追加
  async addFeedback(feedback: string): Promise<void> {
    if (this.conversationRecorder) {
      await this.conversationRecorder.addFeedback(feedback);
      console.log('[TicketSystemManager] Feedback added');
    }
  }

  // 録音情報の更新
  async updateRecordingInfo(storageUrl: string, sasToken: string): Promise<void> {
    if (this.conversationRecorder) {
      await this.conversationRecorder.updateRecordingInfo(storageUrl, sasToken);
      console.log('[TicketSystemManager] Recording info updated');
    }
  }

  /**
   * テキストを音声合成して再生（音声合成サービスが設定されている場合のみ）
   * @param text 音声合成するテキスト
   * @param onEnded 音声再生完了時のコールバック
   */
  async synthesizeAndPlaySpeech(text: string, onEnded?: () => void): Promise<void> {
    if (this.speechSynthesisService) {
      await this.speechSynthesisService.synthesizeAndPlaySpeech(text, onEnded);
    } else {
      console.warn('[TicketSystemManager] Speech synthesis service not available');
    }
  }

  // 発券完了状態を取得
  isTicketIssued(): boolean {
    return this.state.ticketInfo.ticketIssued === true;
  }

  // 会話履歴に追加
  addToConversationHistory(role: 'user' | 'assistant', content: string): void {
    // デバッグ差し込み（任意）
    // DebugChatInjector.post(`[TicketSystemManager] ${role}: ${content.substring(0, 80)}${content.length > 80 ? '…' : ''}`);

    const message = {
      role,
      content,
      timestamp: new Date()
    };
    // 重複チェック：同じ内容とロールのメッセージが直前にある場合は追加しない
    const lastMessage = this.state.conversationHistory[this.state.conversationHistory.length - 1];
    const isDuplicate = lastMessage &&
      lastMessage.role === message.role &&
      lastMessage.content === message.content;

    if (!isDuplicate) {
      // 全体の会話履歴に追加
      this.state.conversationHistory.push(message);

      // 現在のフェーズの会話履歴にも追加
      this.state.currentPhaseHistory.push(message);
    }

    // console.log(`[TicketSystemManager] Added to history - ${role}: ${content.substring(0, 50)}...`);
    this.notifyStateChange();
  }

  // AI応答を処理（情報抽出とフェーズ遷移チェック）
  async processAIResponse(content: string): Promise<void> {
    // 会話履歴に追加
    this.addToConversationHistory('assistant', content);

    // ConversationRecorderにメッセージを記録
    if (this.conversationRecorder) {
      this.conversationRecorder.recordMessage('assistant', content);
    }

    // ユーザー発話時に既に抽出済みの場合はスキップ
    if (this.lastExtractedFromUser) {
      // console.log('[TicketSystemManager] Already extracted from user message, skipping AI response extraction');
      this.lastExtractedFromUser = false; // リセット
      return;
    }

    // 情報抽出を実行（フェーズ遷移の判定も含む）
    // await this.extractInformation();
  }

  // ユーザー発話を処理
  processUserMessage(content: string): void {
    this.addToConversationHistory('user', content);

    // ConversationRecorderにメッセージを記録
    if (this.conversationRecorder) {
      this.conversationRecorder.recordMessage('user', content);
    }
  }

  // ユーザー発話から即座に情報を抽出
  async extractFromUserMessage(content: string): Promise<void> {
    // console.log('[TicketSystemManager] Extracting from user message:', content);

    // 会話履歴に追加
    this.addToConversationHistory('user', content);

    // 即座に情報抽出を実行
    await this.extractInformation();

    // 抽出完了をマーク（AI応答時の重複抽出を防ぐ）
    this.lastExtractedFromUser = true;
  }


  // システムメッセージリクエストのリスナーを設定
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setOnSystemMessageRequest(_callback: (message: string) => void): void {
    // this.onSystemMessageRequest = callback;  // 未使用のため一時的にコメントアウト
    console.warn('[TicketSystemManager] setOnSystemMessageRequest called but not implemented');
  }

  private executeChangeTimengSincronize(extractedInfo: Partial<TicketInformation>): void {



    //時刻指定の一つでも変更された場合
    if ((extractedInfo.phase2_specificTime && extractedInfo.phase2_specificTime != this.state.ticketInfo.phase2_specificTime)
      || (extractedInfo.phase2_timeSpecificationType && extractedInfo.phase2_timeSpecificationType != this.state.ticketInfo.phase2_timeSpecificationType)) {

      //在来特急の利用は、在来特急の有無に合わせて設定する
      if (this.state.ticketInfo.jobanZairaiExpressRoutes && this.state.ticketInfo.jobanZairaiExpressRoutes.length === 0) {
        this.state.ticketInfo.phase2_useZairaiExpress = false;
      } else {
        this.state.ticketInfo.phase2_useZairaiExpress = null;
      }
      this.state.ticketInfo.proposedRoute = null;
      this.state.ticketInfo.proposedRouteOK = null;
      this.state.ticketInfo.proposedRouteRequest = null;
      //リセット
      DebugChatInjector.post('[TicketSystemManager] 時刻指定が変更されたため、在来特急利用がクリアされました。');

    }
  }

  // 会話履歴から情報を抽出
  private async extractInformation(): Promise<void> {
    DebugChatInjector.post('[TicketSystemManager] 情報抽出開始');
    if (this.state.isExtracting) {
      DebugChatInjector.post('[TicketSystemManager] 情報抽出中のためスキップされます。');
      // console.log('[TicketSystemManager] Already extracting, skipping...');
      return;
    }


    if (this.state.ticketInfo.currentPhase === TicketPhases.BASIC_INFO) {
      console.log('[TicketSystemManager] 情報抽出 - 基本情報フェーズです***********************************');
    }

    if (this.state.ticketInfo.currentPhase === TicketPhases.JOBAN_1) {
      console.log('[TicketSystemManager] 情報抽出 - 常磐線フェーズ１です***********************************');
    }

    if (this.state.ticketInfo.currentPhase === TicketPhases.JOBAN_PHASE_2) {
      console.log('[TicketSystemManager] 情報抽出 - 常磐線フェーズ２です***********************************');
    }


    this.state.isExtracting = true;
    this.state.error = null;
    this.notifyStateChange();

    try {
      // 先にフェーズ遷移条件を評価して、抽出に使うスキーマ（フェーズ）を最新化
      // 例：出発時刻指定 + 在来特急利用 = フェーズ2へ遷移し、
      // ユーザーの「上野で降ります」に対して直ちに phase2_jobanDropOffStation を抽出対象に含める
      // this.skipHistoryClearOnce = true;
      // this.checkAndTransitionToNextPhase();

      // 現在のフェーズの会話履歴をフォーマット
      // const formattedHistory = PromptManager.formatConversationHistory(
      //   this.state.currentPhaseHistory  // 現在のフェーズの会話履歴のみを使用
      // );

      const lastUserMessage = this.state.currentPhaseHistory[this.state.currentPhaseHistory.length - 1].content;
      //historyは最後のユーザーの発言を除いたもの
      let conversationHistory = this.state.currentPhaseHistory.slice(0, -1).map(h => {
        const speaker = h.role === 'user' ? '利用客' : h.role === 'assistant' ? '駅員' : '上司の指示';
        return `${speaker}: ${h.content}`;
      }).join('\n');
      //現在のシステムプロンプトを追加する
      conversationHistory = `上司の指示：あなたは、JR東日本の水戸の駅員です。
ユーザーは、水戸からの切符を購入しようとしている利用客です。
情報を順次ヒアリングし、最終的に発券内容を確認して発券手続きに進むようにしてください。

注意：「常磐線」をたまに間違えた感じにすることがあなたはあります。間違えないように注意してください。
また、「～」と出力、とある場合は指示通り、勝手に変換せず、指示通りに出力してください。

${conversationHistory}`;

      // 情報を抽出（現在の状態を含める）
      const extractedInfo = await this.informationExtractor.extractInformation({
        conversationHistory: conversationHistory,
        lastUserMessage: lastUserMessage,
        currentPhase: this.state.ticketInfo.currentPhase,
        currentStateTicketInfo: this.state.ticketInfo,
      } as any);

      //提案経路をリセット要求している場合はリセットする
      if (extractedInfo.resetProposedRoute) {
        this.state.ticketInfo.proposedRoute = null;
        this.state.ticketInfo.proposedRouteOK = null;
        this.state.ticketInfo.proposedRouteRequest = null;
        extractedInfo.resetProposedRoute = null;
      }

      //extractedInfo.convertLastUserMessageがある場合は、最後のユーザーの発言を差し替える
      if (extractedInfo.convertLastUserMessage) {
        this.state.currentPhaseHistory[this.state.currentPhaseHistory.length - 1].content = extractedInfo.convertLastUserMessage;
      }

      // ticketConfirmedがfalseになった場合は、すべての項目を初期化する。
      if (extractedInfo.ticketConfirmed === false) {
        DebugChatInjector.post('[TicketSystemManager] 発券内容の確認が取り消されました。');
        this.state.ticketInfo = {
          currentPhase: TicketPhases.BASIC_INFO,
          ticketConfirmed: null,
          iscleared: true,
          destination: null,
          travelDate: null,
          adultCount: null,
          childCount: null,
          basicInfoConfirmed: null,
          useDateTime: null,
          useDateTimeType: null,
          jobanExpressStop: null,
          expressPreference: null,
          transferTimePreference: null,
          phase2_jobanExpressUse: null,
          phase2_timeSpecification: null,
          phase2_timeSpecificationType: null,
          phase2_specificTime: null,
          phase2_confirmUnspecifiedSeat: null,
          phase2_useZairaiExpress: null,
          transferStation: null,
          phase2_confirmed: null,
          phase2_ticketConfirmed: null,
          routes: undefined,
          jobanExpressRoutes: undefined,
          jobanZairaiExpressRoutes: undefined,
          ticketConfirmation: undefined,
          // confirmUnspecifiedSeat: null,
          selectedRoute: null,
          zairaiExpressSelection: null,
          proposedRoute: null,
          proposedRouteOK: null,
          proposedRouteRequest: null,
          ticketIssued: null,
          zairaiExpressName: null,
          zairaiExpressLeg: null,
          zairaiExpressCategory: null,
          phase2_jobanDropOffStation: undefined,
          phase2_transferTimeIsNormal: undefined,
          initialProposedZairaiExpressSection: null,
          initialProposedRouteWithZairai: null,
          zairaiSpecial_transferMinutes: null,
          zairaiSpecial_shinjukuArrivalTime: null,
          zairaiSpecial_shinjukuDepartureTime: null,
          zairaiSpecial_shinjukuRoutes: null,
          zairaiSpecial_selectedRoute: null,
          zairaiSpecial_proposedRoute: null,
          zairaiSpecial_proposedRouteOK: null,
          zairaiSpecial_proposedRouteRequest: null
        } as TicketInformation;
        return;
      }

      console.log('[TicketSystemManager] Extracted information:', extractedInfo);

      //上位項目変更時に回項目を連動させる
      this.executeChangeTimengSincronize(extractedInfo);

      // 抽出された情報で状態を更新（部分更新をサポート）
      const previousDestination = this.state.ticketInfo.destination;

      // 既存の値を保持しつつ、新しい値で更新
      // undefinedの項目は上書きされない
      const appliedDiff: Partial<TicketInformation> = {};
      Object.entries(extractedInfo).forEach(([key, value]) => {
        if (value !== undefined) {
          (this.state.ticketInfo as any)[key] = value;
          (appliedDiff as any)[key] = value;
        }
      });

      // ConversationRecorderにヒアリング項目を記録
      if (this.conversationRecorder && Object.keys(appliedDiff).length > 0) {
        this.conversationRecorder.updateAllHearingItems(this.state.ticketInfo);
      }
      // 直近の抽出差分を保存（UIで表示）
      (this.state as any).lastExtractedInfo = appliedDiff;

      // ヒューリスティック補強：直前の確認に対する肯定で確定フラグを自動設定
      try {
        const phase = this.state.ticketInfo.currentPhase;
        const history = this.state.currentPhaseHistory;
        const lastUser = [...history].reverse().find(m => m.role === 'user');
        const lastAssistant = [...history].reverse().find(m => m.role === 'assistant');
        const affirmative = (text?: string) => !!text && /(はい|ok|オーケー|お願いします|ええ)/i.test(text);
        const isConfirmQuestion = (text?: string) => !!text && /(よろしいでしょうか|問題ないでしょうか|よろしいですか)/.test(text);

        // 基本情報の最終確認
        const basicInfoCompleteNow = !!(this.state.ticketInfo.destination && this.state.ticketInfo.travelDate && this.state.ticketInfo.adultCount !== null && this.state.ticketInfo.childCount !== null);
        if (phase === TicketPhases.BASIC_INFO && basicInfoCompleteNow) {
          if ((this.state.ticketInfo.basicInfoConfirmed !== true) && affirmative(lastUser?.content) && isConfirmQuestion(lastAssistant?.content)) {
            this.state.ticketInfo.basicInfoConfirmed = true;
          }
        }

        // 時間指定なし→座席未指定の確認
        if (this.state.ticketInfo.phase2_jobanExpressUse === true && (this.state.ticketInfo.phase2_timeSpecification === false || this.state.ticketInfo.phase2_timeSpecification == null)) {
          const askedUnspecified = !!(lastAssistant?.content && /座席未指定/.test(lastAssistant.content));
          if (askedUnspecified && affirmative(lastUser?.content) && this.state.ticketInfo.phase2_confirmUnspecifiedSeat == null) {
            this.state.ticketInfo.phase2_confirmUnspecifiedSeat = true;
          }
        }

        // 提案経路の最終合意はLLM抽出に委譲（ヒューリスティックは使用しない）
      } catch (e) {
        console.warn('[TicketSystemManager] Heuristic confirmation failed:', e);
      }

      // 座席未指定券了承時の自動設定は廃止（ケース別完了判定へ移行）
      if (extractedInfo.phase2_confirmUnspecifiedSeat === true && !this.state.ticketInfo.phase2_confirmed) {
        this.state.ticketInfo.phase2_confirmed = true;
      }

      // destinationは、"末尾の「駅」を削除"
      if (this.state.ticketInfo.destination) {
        this.state.ticketInfo.destination = this.state.ticketInfo.destination.replace(/駅$/, '');
      }

      // デフォルト値の適用（子供の人数）
      if (this.state.ticketInfo.currentPhase === TicketPhases.BASIC_INFO) {
        // 大人の人数が設定されていて、子供の人数が未設定の場合、デフォルト値0を適用
        if (this.state.ticketInfo.adultCount !== null &&
          this.state.ticketInfo.adultCount !== undefined &&
          this.state.ticketInfo.childCount === null) {
          this.state.ticketInfo.childCount = 0;
        }
      }

      // 最終確認が完了したら発券完了をマーク（UIが切符表示を開く）
      if (this.state.ticketInfo.ticketConfirmed === true && this.state.ticketInfo.ticketIssued !== true) {
        this.state.ticketInfo.ticketIssued = true;

        // ConversationRecorderに発券完了を記録
        if (this.conversationRecorder) {
          this.conversationRecorder.markTicketIssued();
        }
      }

      // デバッグ用ログ
      InformationExtractor.logCurrentInfo(this.state.ticketInfo);

      // 行先が変更された場合、経路検索を実行
      if (this.state.ticketInfo.destination &&
        this.state.ticketInfo.destination !== previousDestination) {
        // await this.searchRoutesWithDebounce(this.state.ticketInfo.destination);
        await this.searchRoutes(this.state.ticketInfo.destination);

      }

      // 在来特急初期提案と種別の導出（出発時刻指定が確定し、在来を含む経路がある場合）
      try {
        const infoNow = this.state.ticketInfo;
        if (
          infoNow.phase2_timeSpecification === true &&
          infoNow.phase2_timeSpecificationType === 'start' &&
          !!infoNow.phase2_specificTime &&
          Array.isArray(infoNow.jobanZairaiExpressRoutes) &&
          infoNow.jobanZairaiExpressRoutes.length > 0 &&
          !infoNow.initialProposedRouteWithZairai
        ) {
          this.deriveInitialProposedZairaiExpress(infoNow.phase2_specificTime);
        }
      } catch (e) {
        console.warn('[TicketSystemManager] Failed to derive initial Zairai express data:', e);
      }

    } catch (error) {
      console.error('[TicketSystemManager] Extraction error:', error);
      this.state.error = error instanceof Error ? error.message : 'Unknown error';
    } finally {
      this.state.isExtracting = false;
      this.notifyStateChange();
    }
  }

  // システムをリセット
  reset(): void {
    // ConversationRecorderの現在の録音を停止
    if (this.conversationRecorder?.isCurrentlyRecording()) {
      this.conversationRecorder.stopRecording();
    }

    // フェーズに応じた初期値を設定
    const initialItems = {
      destination: null,
      travelDate: null,
      adultCount: null,
      childCount: null
    };

    this.state = {
      ticketInfo: {
        ...(initialItems as TicketInformation),
        currentPhase: TicketPhases.BASIC_INFO
      } as TicketInformation,
      conversationHistory: [],
      currentPhaseHistory: [],
      isExtracting: false,
      isSearchingRoutes: false,
      error: null,
      jobanExpressSeatInfo: null,
      zairaiExpressSeatInfo: null
    };

    this.pendingPhaseTransition = false;

    // タイムアウトをクリア
    if (this.routeSearchTimeout) {
      clearTimeout(this.routeSearchTimeout);
      this.routeSearchTimeout = undefined;
    }
    // console.log('[TicketSystemManager] System reset');
    this.notifyStateChange();
  }

  // 状態変更を通知
  private notifyStateChange(): void {
    const state = this.getState();

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    this.onStateChangeCallbacks.forEach((callback, _index) => {
      callback(state);
    });
  }
  
  // 経路検索の実行
  public static async hasRoute(destination: string): Promise<boolean> {

    try {
      // 出発駅は「水戸」固定
      const originStation = '水戸';
      // console.log(`[TicketSystemManager] Searching routes from ${originStation} to ${destination}`);
      const result = await new RouteSearchService().searchRoutes(originStation, destination);

      return result.routes.length > 0
    } catch (error) {
      console.error('[TicketSystemManager] Route search error:', error);
      return false;
    }
  }

  // 経路検索の実行
  public async searchRoutes(destination: string): Promise<void> {
    if (this.state.isSearchingRoutes) {
      // console.log('[TicketSystemManager] Already searching routes, skipping...');
      return;
    }

    this.state.isSearchingRoutes = true;
    this.notifyStateChange();

    try {
      // 出発駅は「水戸」固定
      const originStation = '水戸';
      // console.log(`[TicketSystemManager] Searching routes from ${originStation} to ${destination}`);
      const result = await this.routeSearchService.searchRoutes(originStation, destination);

      this.state.ticketInfo.routes = result.routes;
      // console.log(`[TicketSystemManager] Found ${result.routes.length} routes from ${originStation} to ${destination} in ${result.searchTime}ms`);

      // 常磐線特急関連のデータを処理（フェーズ１でも事前に処理）
      this.processJobanExpressData();

      // 経路検索完了後、保留中のフェーズ遷移をチェック
      if (this.pendingPhaseTransition && this.state.ticketInfo.currentPhase === TicketPhases.BASIC_INFO) {
        // console.log('[TicketSystemManager] Route search complete, checking pending phase transition');
        this.pendingPhaseTransition = false;
        // this.checkAndTransitionToNextPhase();
      }

    } catch (error) {
      console.error('[TicketSystemManager] Route search error:', error);
      this.state.error = error instanceof Error ? error.message : 'Route search failed';
      this.pendingPhaseTransition = false;
    } finally {
      this.state.isSearchingRoutes = false;
      this.notifyStateChange();
    }
  }

  // 常磐線特急関連データの処理
  private processJobanExpressData(): void {
    if (!this.state.ticketInfo.routes || this.state.ticketInfo.routes.length === 0) {
      // console.log('[TicketSystemManager] No routes available for Joban Express processing');
      return;
    }

    // 常磐線特急を含む経路を抽出
    const jobanExpressRoutes = JobanExpressProcessor.extractJobanExpressRoutes(
      this.state.ticketInfo.routes
    );
    this.state.ticketInfo.jobanExpressRoutes = jobanExpressRoutes;

    // 在来線特急も含む経路を抽出
    if (jobanExpressRoutes.length > 0) {
      const jobanZairaiExpressRoutes = JobanExpressProcessor.extractJobanZairaiExpressRoutes(
        jobanExpressRoutes
      );
      this.state.ticketInfo.jobanZairaiExpressRoutes = jobanZairaiExpressRoutes;

      //在来特急を含む経路がなければ強制的に、在来特急は利用しないに変更
      if (jobanZairaiExpressRoutes.length === 0) {
        this.state.ticketInfo.phase2_useZairaiExpress = false;
      } else {
        this.state.ticketInfo.phase2_useZairaiExpress = null;
      }
    }

    // console.log(`[TicketSystemManager] Processed Joban Express data:
    //   - Joban Express routes: ${this.state.ticketInfo.jobanExpressRoutes?.length || 0}
    //   - Joban + Zairai Express routes: ${this.state.ticketInfo.jobanZairaiExpressRoutes?.length || 0}`);
  }

  // 初期提案在来特急名称の導出
  deriveInitialProposedZairaiExpress(phase2_specificTime: string): void {
    if (!this.state.ticketInfo.jobanZairaiExpressRoutes || this.state.ticketInfo.jobanZairaiExpressRoutes.length === 0) {
      // console.log('[TicketSystemManager] No jobanZairaiExpressRoutes available');
      return;
    }

    try {
      // 1. 指定時間に合う在来線特急経路リストを抽出
      const matchingRoutes = this.state.ticketInfo.jobanZairaiExpressRoutes.filter(route => {
        const [depHour, depMin] = route.departureTime.split(':').map(Number);
        const [specHour, specMin] = phase2_specificTime.split(':').map(Number);
        const depMinutes = depHour * 60 + depMin;
        const specMinutes = specHour * 60 + specMin;
        return depMinutes >= specMinutes;
      });

      // console.log(`[TicketSystemManager] Found ${matchingRoutes.length} routes after ${phase2_specificTime}`);

      if (matchingRoutes.length === 0) {
        // 指定時間に合う在来線特急経路リストが存在しない（０件）
        // console.log('[TicketSystemManager] No matching routes found');
        return;
      }

      // 2. 顧客が指定している時刻から45分以内のルートを検索
      const [specHour, specMin] = phase2_specificTime.split(':').map(Number);
      const specMinutes = specHour * 60 + specMin;

      const within45MinRoutes = matchingRoutes.filter(route => {
        const [depHour, depMin] = route.departureTime.split(':').map(Number);
        const depMinutes = depHour * 60 + depMin;
        return depMinutes - specMinutes <= 45;
      });

      // 3. 最も早く目的地に到着するルートを抽出
      let targetRoute;
      if (within45MinRoutes.length > 0) {
        targetRoute = within45MinRoutes.reduce((earliest, route) => {
          const [earlyHour, earlyMin] = earliest.arrivalTime.split(':').map(Number);
          const [routeHour, routeMin] = route.arrivalTime.split(':').map(Number);
          const earlyMinutes = earlyHour * 60 + earlyMin;
          const routeMinutes = routeHour * 60 + routeMin;
          return routeMinutes < earlyMinutes ? route : earliest;
        });
      } else {
        // 45分以内の経路がない場合は、最も近い出発時刻の経路を選択
        targetRoute = matchingRoutes[0];
      }

      // 初期提案経路として保存
      this.state.ticketInfo.initialProposedRouteWithZairai = targetRoute;

      // 4. 最後の在来特急区間を特定
      const expressLegs = targetRoute.legs
        .map((leg, index) => ({ leg, index }))
        .filter(({ leg }) => leg.isExpress && leg.nickname !== 'ひたち' && leg.nickname !== 'ときわ')
        .sort((a, b) => b.leg.seq - a.leg.seq);

      if (expressLegs.length === 0) {
        throw new Error('初期提案経路に在来特急が含まれていません（想定外）');
      }

      // 最も最後に登場する在来特急leg要素を「初期提案在来特急区間情報」とする
      const lastExpressLeg = expressLegs[0].leg;
      this.state.ticketInfo.initialProposedZairaiExpressSection = lastExpressLeg;
      this.state.ticketInfo.zairaiExpressName = lastExpressLeg.nickname;
      // 在来特急種別の導出
      this.state.ticketInfo.zairaiExpressCategory = this.deriveZairaiExpressCategory(
        lastExpressLeg.nickname || lastExpressLeg.senkuName || ''
      );

      // console.log(`[TicketSystemManager] Initial proposed Zairai Express: ${lastExpressLeg.nickname}`);
      // console.log(`  Route: ${targetRoute.departureTime} departure, ${targetRoute.arrivalTime} arrival`);
      // console.log(`  Express section: ${lastExpressLeg.from.name} to ${lastExpressLeg.to.name}`);

    } catch (error) {
      console.error('[TicketSystemManager] Error deriving initial proposed Zairai Express:', error);
      throw error;
    }
  }

  /** 在来特急種別を導出（表示・分岐用） */
  private deriveZairaiExpressCategory(trainNameRaw: string): string | null {
    const name = (trainNameRaw || '').toLowerCase();
    const includesAny = (arr: string[]) => arr.some(k => name.includes(k.toLowerCase()));
    if (includesAny(['あずさ', 'かいじ'])) return '中央線';
    if (includesAny(['踊り子', '湘南', 'サフィール踊り子'])) return '東海道線';
    if (includesAny(['成田エクスプレス', 'しおさい', 'わかしお', 'さざなみ'])) return '千葉方面';
    if (includesAny(['草津・四万', 'きぬがわ', 'スペーシア日光'])) return '永野日光';
    return null;
  }

  // ペンディングユーザーメッセージをトリガー（外部から呼び出し可能）
  triggerPendingUserMessage(): void {
    // フェーズ遷移後のペンディングメッセージがある場合は送信
    if (this.pendingPhaseTransition) {
      // console.log('[TicketSystemManager] No pending user message to trigger');
      return;
    }

    // 現在のフェーズに応じたメッセージを送信
    // console.log('[TicketSystemManager] Triggering pending user message for current phase:', this.state.ticketInfo.currentPhase);
    // システム通知は不要（フェーズに応じた初回発話が自動的に行われる）
  }

  // ConversationRecorderを取得
  getConversationRecorder(): ConversationRecorder | null {
    return this.conversationRecorder;
  }

  // デバッグ用：現在の状態をログ出力
  logCurrentState(): void {
    console.log('[TicketSystemManager] Current state:');
    console.log(`  Phase: ${this.state.ticketInfo.currentPhase}`);
    console.log(`  History length: ${this.state.conversationHistory.length}`);
    console.log(`  Extracting: ${this.state.isExtracting}`);
    console.log(`  Searching routes: ${this.state.isSearchingRoutes}`);
    console.log(`  Routes count: ${this.state.ticketInfo.routes?.length || 0}`);
    console.log(`  Error: ${this.state.error || 'None'}`);
    InformationExtractor.logCurrentInfo(this.state.ticketInfo);
  }
}