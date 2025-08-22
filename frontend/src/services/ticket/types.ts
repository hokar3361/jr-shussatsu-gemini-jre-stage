// 発券システムの型定義

// 発券システムの型定義
import type { Route, RouteLeg } from '../cosmos/types';

// フェーズの定義
export const TicketPhases = {
  BASIC_INFO: 'basic_info',        // 基本情報ヒアリング
  JOBAN_1: 'joban_express_inquiry', // 常磐線特急関連ヒアリング（Phase2）
  // フェーズ3の分岐
  SEAT_UNSPECIFIED: 'seat_unspecified',           // フェーズ3-1：座席未指定利用ヒアリングフェーズ
  ARRIVAL_TIME_SPECIFIED: 'arrival_time_specified', // フェーズ3-2：常磐線 - 到着時刻指定ケースフェーズ
  DEPARTURE_TIME_SPECIFIED: 'departure_time_specified', // フェーズ3-3：常磐線 + 在来ヒアリングケースフェーズ
  JOBAN_PHASE_2: 'joban_phase_2',                   // 常磐線フェーズ２：在来特急利用の詳細ヒアリング
  TICKET_CONFIRMATION: 'ticket_confirmation',       // 発券内容確認フェーズ
  ZAIRAI_SPECIAL_CASE: 'zairai_special_case',       // 在来特殊ケース（TODO）
  ROUTE_SEARCH: 'route_search',    // 経路検索（Phase3）
  SEAT_SELECTION: 'seat_selection', // 座席選択（Phase4）
  PAYMENT: 'payment',              // 決済（Phase5）
  CONFIRMATION: 'confirmation'     // 確認（Phase6）
} as const;

export type TicketPhases = typeof TicketPhases[keyof typeof TicketPhases];

// ヒアリング情報の型定義
export interface TicketInformation {

  resetProposedRoute: boolean | null; // 提案経路をリセットするかどうか(Extract側から間接的なリセット処理)

  jobanExpressSeatInfo: string | null;
  zairaiExpressSeatInfo: string | null;
  canExtractFromLastUserMessage: boolean | null;
  currentPhase: TicketPhases;
  // 基本情報（必須項目）
  iscleared: boolean | null;        // 発券内容の作成完了フラグ
  destination: string | null;      // 行先
  destination_kana: string | null; // 行先のカナ
  notFoundDestination: boolean | null; // 行先が存在しないかどうか
  convertLastUserMessage: string | null; // 発言自体の最後を差し替えたもの
  invalidDestination: boolean | null; // 行先が無効かどうか
  travelDate: string | null;       // 利用日（YYYY-MM-DD形式）
  adultCount: number | null;       // 大人の人数
  childCount: number | null;       // 子供の人数
  basicInfoConfirmed: boolean | null; // 基本情報の確認完了フラグ
  
  // 基本情報（オプション項目）
  useDateTime: string | null;      // 利用日時（N時に出たい、今すぐなど）
  useDateTimeType: string | null;  // 利用日時区分（出発 or 到着）
  jobanExpressStop: string | null;         // 常磐線特急の降車駅希望
  expressPreference: boolean | null;       // 在来特急の利用希望
  transferTimePreference: string | null;   // 乗り換え時間希望
  
  // フェーズ2: 常磐線特急関連ヒアリング項目（フェーズ接頭辞）
  phase2_jobanExpressUse: boolean | null;         // 常磐線特急を利用するかどうか
  phase2_timeSpecification: boolean | null;       // 時間の指定があるかどうか
  phase2_timeSpecificationType: string | null;    // 時間指定は出発/到着
  phase2_specificTime: string | null;             // 具体的な時刻
  phase2_confirmUnspecifiedSeat: boolean | null;  // 座席未指定利用の確認
  /** 在来特急を利用するか（フェーズ1での在来特急利用判断） */
  phase2_useZairaiExpress?: boolean | null;
  phase2_useZairaiButNotFound?: boolean | null; //在来を使うとしたが、45分以内に見つからず、利用しないコースの挙動を行っている
  transferStation: string | null;          // 乗り継ぎを行う駅名（オプション）
  phase2_confirmed: boolean | null;          // フェーズ内容の確認完了フラグ
  phase2_ticketConfirmed: boolean | null;    // フェーズ内容の確認完了フラグ
  
  // 経路情報
  routes?: Route[];                // 検索された経路リスト
  jobanExpressRoutes?: JobanExpressRoute[];      // 常磐線特急を含む経路
  jobanZairaiExpressRoutes?: JobanZairaiExpressRoute[];  // 常磐線特急＋在来線特急を含む経路
  
  // 確認フェーズ用の発券内容
  ticketConfirmation?: TicketConfirmation;
  
  // フェーズ2で統合管理する項目
  //confirmUnspecifiedSeat: boolean | null;  // 座席未指定利用の確認
  selectedRoute: string | null;            // 選択された経路の番号（到着時刻指定時）
  zairaiExpressSelection: boolean | null;  // 在来線特急の利用選択（出発時刻指定時）
  
  // 提案利用経路関連
  proposedRoute: JobanExpressRoute | null; // 現在提案中の経路
  proposedRouteOK: boolean | null;         // 提案利用経路でよいかどうか
  proposedRouteRequest: string | null;     // 提案利用経路に対する要望
  
  // 発券内容確認フェーズ
  ticketConfirmed: boolean | null;         // 発券内容の確認完了
  
  // 発券完了フラグ
  ticketIssued: boolean | null;             // 発券完了フラグ
  
  // 在来線特急関連（出発時刻指定／在来特急ありの場合）
  zairaiExpressName?: string | null;       // 初期提案在来特急名称
  zairaiExpressLeg?: RouteLeg | null;      // 初期提案在来特急区間情報
  zairaiExpressCategory?: string | null;   // 在来特急種別（中央線/東海道線/千葉方面/永野日光など）
  
  // 常磐線フェーズ２用
  phase2_timeReConfirmed: boolean | null;       // 時間指定の再確認フラグ
  phase2_jobanDropOffStation?: string;         // 常磐線降車駅（上野 or 東京）
  phase2_transferTimeIsNormal?: boolean | null;       // 新宿での乗り換え時間は通常でよいか
  
  // 初期提案在来特急区間情報
  initialProposedZairaiExpressSection?: RouteLeg | null;
  
  // 初期提案経路（在来線含む）
  initialProposedRouteWithZairai?: Route | null;

  // 在来特急特殊フェーズ（中央線向け）
  zairaiSpecial_transferMinutes?: number | null;   // 新宿での乗換所要時間（分）
  zairaiSpecial_shinjukuArrivalTime?: string | null;    // 元提案経路での新宿到着時刻（HH:MM）
  zairaiSpecial_shinjukuDepartureTime?: string | null;  // 乗換分を加味した新宿出発時刻（HH:MM）
  zairaiSpecial_shinjukuRoutes?: Route[] | null;                // 新宿→行先の再検索ルート一覧
  zairaiSpecial_selectedRoute?: Route | null;           // 最短到着の選定ルート
  zairaiSpecial_proposedRoute?: Route | null;           // 在来特急特殊フェーズの提案経路
  zairaiSpecial_proposedRouteOK: boolean | null;         // 提案利用経路でよいかどうか
  zairaiSpecial_proposedRouteRequest: string | null;     // 提案利用経路に対する要望
  
  // 今後追加予定
  // seat?: SeatInfo;              // 座席情報
  // payment?: PaymentInfo;        // 決済情報
}

// フェーズ情報
export interface PhaseInfo {
  id: TicketPhases;
  name: string;
  systemPrompt: string;
  transitionMessage?: string;
  completionTrigger?: string;      // フェーズ完了のトリガーとなる文言
}

// 発券システムの状態
export interface TicketSystemState {
  ticketInfo: TicketInformation;
  jobanExpressSeatInfo : string | null;
  zairaiExpressSeatInfo : string | null;
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  currentPhaseHistory: Array<{     // 現在のフェーズの会話履歴
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  isExtracting: boolean;           // 情報抽出中フラグ
  isSearchingRoutes: boolean;      // 経路検索中フラグ
  error: string | null;
  phaseTransitionMessage?: string; // フェーズ遷移時のメッセージ
  // 直近の抽出結果（差分）。UIでの可視化用。
  lastExtractedInfo?: Partial<TicketInformation>;
}

// LLMへの情報抽出リクエスト
export interface ExtractionRequest {
  conversationHistory: string;
  lastUserMessage: string;
  currentPhase: TicketPhases;
  currentInfo?: Partial<TicketInformation>;
}

// LLMからの情報抽出レスポンス
export interface ExtractionResponse {
  destination?: string | null;
  travelDate?: string | null;
  adultCount?: number | null;
  childCount?: number | null;
}

// 環境変数から取得する設定
export interface TicketSystemConfig {
  departureStation: string;        // 出発駅（環境変数から）
  llmApiEndpoint?: string;         // LLM APIエンドポイント
  useAzureOpenAI?: boolean;        // Azure OpenAI APIを使用するかどうか
}

// ヒアリング項目の定義
export interface HearingItem {
  key: string;                     // 項目のキー
  name: string;                    // 項目の名前
  description: string;             // 項目の説明
  type: 'string' | 'number' | 'date' | 'boolean';  // データ型
  required: boolean;               // 必須かどうか
  defaultValue?: any;              // デフォルト値
}

// フェーズ設定
export interface PhaseConfig {
  id: TicketPhases;
  name: string;
  systemPrompt: string;
  extractionPrompt: string;        // 情報抽出用のプロンプト
  requiredItems: HearingItem[];    // 必須項目
  optionalItems: HearingItem[];    // オプション項目
}

// 常磐線特急を含む経路
export interface JobanExpressRoute extends Route {
  jobanExpressLegs: RouteLeg[];          // 常磐線特急区間のlegs
  jobanExpressLegsRouteExplain: string;  // 常磐線特急区間の説明
}

// 常磐線特急＋在来線特急を含む経路
export interface JobanZairaiExpressRoute extends JobanExpressRoute {
  zairaiExpressLegsRouteExplainList: string[];  // 在来線特急区間の説明リスト（線区別）
}


// 確認フェーズ（発券内容）の項目
export interface TicketConfirmation {
  // 基本情報
  departureStation: string;        // 出発駅（水戸固定）
  destination: string;             // 行き先（ヒアリング済みの行先）
  ticketType?: string;             // 発券種類（例：「すべて普通」）
  
  // 常磐線特急券
  jobanExpressTicket?: {
    seatUnspecifiedUse: boolean;   // 座席未指定利用：あり／なし
    useExpressTrain: boolean;      // 常磐線特急：あり／なし
    trainName?: string;            // 列車名（ひたちなど）
    boardingStation: string;       // 乗車駅（水戸固定）
    alightingStation?: string;     // 降車駅
    departureTime?: string;        // 出発時刻
    arrivalTime?: string;          // 到着時刻
  };
  
  // 在来線特急券
  zairaiExpressTicket?: {
    use: boolean;                  // あり／なし
    trainName?: string;            // 列車名
    boardingStation: string;       // 乗車駅（上野固定）
    lineName?: string;             // 線区名（成田エクスプレス など）
    alightingStation?: string;     // 降車駅
    departureTime?: string;        // 出発時刻
    arrivalTime?: string;          // 到着時刻
  };
}