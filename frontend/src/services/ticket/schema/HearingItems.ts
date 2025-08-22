import type { TicketInformation } from '../types';
import type { HearingItemDefinition } from './SchemaTypes';

// 既存の挙動に合わせた最小セット（段階1では参照のみ）
export const HearingItems: HearingItemDefinition[] = [
  {
    field: { stateKey: 'canExtractFromLastUserMessage', llmKey: 'canExtractFromLastUserMessage', 
      name: '抽出可能な情報があるかどうか', 
      description: `過去の会話内容から今何を行っているかを判断したうえで、「★評価対象の利用客の発言★」に基づき、抽出可能な情報があるかどうかを判断するフラグ。`, 
      valueType: 'boolean' },
  },
  // 基本情報
  {
    field: { stateKey: 'destination', llmKey: 'destination', name: '行先', description: '利用者が向かいたい駅名。利用客が「XX駅」といった場合は、存在するかどうかをあなたの知識で勝手に判断せずに抽出対象とすること。', valueType: 'string' },
  },
  {
    field: { stateKey: 'travelDate', llmKey: 'travelDate', name: '利用日', description: '切符を利用する日付（YYYY-MM-DD）', valueType: 'date' },
  },
  {
    field: { stateKey: 'adultCount', llmKey: 'adultCount', name: '大人の人数', description: '大人の乗車人数', valueType: 'number', defaultValue: 0 },
  },
  {
    field: { stateKey: 'childCount', llmKey: 'childCount', name: '子供の人数', description: '子供の乗車人数', valueType: 'number', defaultValue: 0 },
  },
  {
    field: { stateKey: 'basicInfoConfirmed', llmKey: 'basicInfoConfirmed', name: '基本情報の確認完了', description: '基本情報の口頭確認', valueType: 'boolean' },
  },
  // 常磐線フェーズ1
  {
    field: { stateKey: 'phase2_jobanExpressUse', llmKey: 'phase2_jobanExpressUse', name: '常磐線特急の利用', description: '常磐線特急（ひたち・ときわ）を利用するか', valueType: 'boolean' },
  },
  // 出発時刻指定（在来特急関連）
  {
    field: { stateKey: 'phase2_useZairaiExpress', llmKey: 'phase2_useZairaiExpress', name: '在来特急を利用するか', description: '在来特急（常磐線以外の特急）を利用するか', valueType: 'boolean' },
  },
  {
    field: { stateKey: 'phase2_timeSpecification', llmKey: 'phase2_timeSpecification', name: '顧客が出発したいと明示的に伝えた時間指定の有無', description: '顧客が出発したいと明示的に伝えた時間指定があるか', valueType: 'boolean' },
  },
  {
    field: { stateKey: 'phase2_timeSpecificationType', llmKey: 'phase2_timeSpecificationType', name: '顧客が出発または、到着したいと明示的に伝えた時間指定の種別', description: '顧客が出発または到着したいと明示的に伝えた時間指定の種別。出発の場合は"start"、到着の場合は"stop"。わからないときはこの項目を出力しないこと。', valueType: 'string' },
  },
  {
    field: { stateKey: 'phase2_specificTime', llmKey: 'phase2_specificTime', name: '顧客が出発したいと明示的に伝えた具体的な時刻', 
      description: `顧客が出発/到着したい時刻を明示した場合に設定する。24時間表記のため、5時は朝5時です。ユーザーの発言をそのまま採用してください。
たとえアシスタント側が「利用できません」等と回答していても、ユーザーの直近発話に含まれる時刻を優先的に反映する。
確定の有無に関わらず、最新に言及された時刻を設定する。
今すぐ、といった場合は、プロンプトに含まれる「現在時刻」を使用してください。
24時間表記の時刻を使用してください。出力フォーマットは「HH:MM」です。朝5時であれば「05:00」と出力してください。`, valueType: 'string' },
  },
  {
    field: { stateKey: 'phase2_confirmUnspecifiedSeat', llmKey: 'phase2_confirmUnspecifiedSeat', name: '座席未指定利用の確認', description: '時間指定なし時の座席未指定受諾', valueType: 'boolean' },
  },
  

  // 提案経路承認/最終確認はAzure抽出結果に含めるため定義（必要時のみ）
  {
    field: { stateKey: 'proposedRouteOK', llmKey: 'proposedRouteOK', name: '提案経路の承認', description: '常磐線特急及び、在来特急の具体的な経路（時間と乗車駅・降車駅）を提案しており、その提案経路提案利用経路でよいかに対する返答。承認しない場合はfalseを返答してください。null二は原則なりませんので、nullにしたい場合は、この項目を返さないでください。', valueType: 'boolean' },
  },
  {
    field: { stateKey: 'proposedRouteRequest', llmKey: 'proposedRouteRequest', name: '提案経路への要望', description: '提案経路に対する、時間的な変更要望（出発と、到着時刻両方に関して正確に出すこと。（明確に出発、到着に対する希望がなければ、憶測せずそのまま話した内容にすること）。「ちょっと」なども正確に出力すること）', valueType: 'string' },
  },

  //最終確認直前処理
  {
    field: { stateKey: 'jobanExpressSeatInfo', llmKey: 'jobanExpressSeatInfo', name: '常磐線特急の座席情報', description: '常磐線特急の座席情報（窓側、横並びなど発言から分かることを単に要約。聞き取れなかった場合は「聞き取れず」を出力）', valueType: 'string' },
  },
  {
    field: { stateKey: 'zairaiExpressSeatInfo', llmKey: 'zairaiExpressSeatInfo', name: '在来特急の座席情報', description: '在来特急の座席情報（窓側、横並びなど発言から分かることを単に要約。聞き取れなかった場合は「聞き取れず」を出力）', valueType: 'string' },
  },
  {
    field: { stateKey: 'ticketConfirmed', llmKey: 'ticketConfirmed', name: '発券内容の最終確認', 
      description: '最終確認の了承（確認しますがが含まれるメッセージに対するユーザーの返答はこれに該当。確認に対して了承されなければ、false。了承ならtrue。そうでなければ返却に含めないこと。）', valueType: 'boolean' },
  },
  
  // 常磐線フェーズ2（在来特急あり＋利用する で遷移後）
  {
    field: { stateKey: 'phase2_timeReConfirmed', llmKey: 'phase2_timeReConfirmed', name: '時間指定の再確認', 
      description: '水戸からの出発時刻を改めて再確認して、OKの場合true、NGの場合false。それ以外の場合はこの項目は出力しないこと。', valueType: 'boolean' },
  },
  {
    field: { stateKey: 'phase2_jobanDropOffStation', llmKey: 'phase2_jobanDropOffStation', name: '常磐線の降車駅', description: '常磐線の降車駅（上野／東京）', valueType: 'string' },
  },
  {
    field: { stateKey: 'phase2_transferTimeIsNormal', llmKey: 'phase2_transferTimeIsNormal', name: '新宿駅での乗り換え時間は通常か', description: '新宿駅での乗り換え時間は通常でよいか', valueType: 'boolean' },
  },
  // 在来特殊ケース（中央線で乗換時間NG時）
  {
    field: { stateKey: 'zairaiSpecial_transferMinutes', llmKey: 'zairaiSpecial_transferMinutes', name: '新宿乗換所要時間（分）', description: '新宿駅での乗換に必要な分数（数字のみ）', valueType: 'number' },
  },
  {
    field: { stateKey: 'zairaiSpecial_proposedRouteOK', llmKey: 'zairaiSpecial_proposedRouteOK', name: '新宿発の目的地まで経路に対する承認', description: '新宿発の目的地まで経路に対する承認', valueType: 'boolean' },
  },
  {
    field: { stateKey: 'zairaiSpecial_proposedRouteRequest', llmKey: 'zairaiSpecial_proposedRouteRequest', name: '新宿発の目的地まで経路に対する要望', description: '新宿発の目的地まで経路に対する要望', valueType: 'string' },
  },
];

// 構造体参照用ユーティリティ（外部からは構造的に参照できる）
function findItemByStateKey<K extends keyof TicketInformation>(key: K): HearingItemDefinition {
  const item = HearingItems.find((it) => it.field.stateKey === key);
  if (!item) {
    throw new Error(`Hearing item not found for stateKey: ${String(key)}`);
  }
  return item;
}

export const Hearing = {
  canExtractFromLastUserMessage: {
    canExtractFromLastUserMessage: findItemByStateKey('canExtractFromLastUserMessage'),
  },
  basic: {
    destination: findItemByStateKey('destination'),
    travelDate: findItemByStateKey('travelDate'),
    adultCount: findItemByStateKey('adultCount'),
    childCount: findItemByStateKey('childCount'),
    basicInfoConfirmed: findItemByStateKey('basicInfoConfirmed'),
  },
  joban1: {
    phase2_jobanExpressUse: findItemByStateKey('phase2_jobanExpressUse'),
    phase2_timeSpecification: findItemByStateKey('phase2_timeSpecification'),
    phase2_timeSpecificationType: findItemByStateKey('phase2_timeSpecificationType'),
    phase2_specificTime: findItemByStateKey('phase2_specificTime'),
    phase2_confirmUnspecifiedSeat: findItemByStateKey('phase2_confirmUnspecifiedSeat'),
    phase2_useZairaiExpress: findItemByStateKey('phase2_useZairaiExpress'),
    proposedRouteOK: findItemByStateKey('proposedRouteOK'),
    proposedRouteRequest: findItemByStateKey('proposedRouteRequest'),
    // phase2_ticketConfirmed: findItemByStateKey('phase2_ticketConfirmed'),
  },
  confirmation: {
    jobanExpressSeatInfo: findItemByStateKey('jobanExpressSeatInfo'),
    zairaiExpressSeatInfo: findItemByStateKey('zairaiExpressSeatInfo'),
    ticketConfirmed: findItemByStateKey('ticketConfirmed'),
  },
  jobanPhase2: {
    phase2_timeReConfirmed: findItemByStateKey('phase2_timeReConfirmed'),
    phase2_jobanDropOffStation: findItemByStateKey('phase2_jobanDropOffStation'),
    phase2_transferTimeIsNormal: findItemByStateKey('phase2_transferTimeIsNormal'),
    zairaiSpecial_transferMinutes: findItemByStateKey('zairaiSpecial_transferMinutes'),
    zairaiSpecial_proposedRouteOK: findItemByStateKey('zairaiSpecial_proposedRouteOK'),
    zairaiSpecial_proposedRouteRequest: findItemByStateKey('zairaiSpecial_proposedRouteRequest'),
  },
  // zairaiSpecial: {
    
  // },
} as const;

export type HearingStructure = typeof Hearing;
