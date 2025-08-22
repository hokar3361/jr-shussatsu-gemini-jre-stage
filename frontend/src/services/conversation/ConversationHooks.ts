import { type TicketSystemState, TicketPhases, type TicketInformation, type JobanExpressRoute } from '../ticket/types';
import { AzureOpenAIService } from '../azure/azureOpenAIService';
import type { ChatMessage } from '../azure/types';
import { ConfigManager } from '../../config/ConfigManager';
import type { Route, RouteLeg } from '../cosmos/types';
import { RouteSearchService } from '../cosmos/RouteSearchService';
import { DebugChatInjector } from '../communication/DebugChatInjector';
import type { ISpeechSynthesisService } from '../communication/ISpeechSynthesisService';
// import { PromptBuilder } from '../ticket/schema/PromptBuilder';
// import { ExtractionMapper } from '../ticket/schema/ExtractionMapper';
// import type { HearingItemDefinition } from '../ticket/schema/SchemaTypes';
// import type { HearingItem } from '../ticket/types';

/**
 * 会話に差し込むメッセージの情報
 */
export interface InjectionMessage {
  /** 会話に差し込むテキスト */
  content: string;
  /** メッセージの役割 */
  role: 'assistant' | 'user' | 'system';
  /** 差し込みタイミング */
  timing: 'before_send' | 'after_ai_response';
}

/**
 * AI応答前のコールバック（ユーザー発話後、AI応答前）
 */
export type BeforeAIResponseCallback = (
  userMessage: string,
  ticketState: TicketSystemState
) => Promise<InjectionMessage | null>;

/**
 * 会話フックの設定
 */
export interface ConversationHooks {
  /** AI応答前のコールバック（ユーザー発話後、AI応答前） */
  beforeAIResponse?: BeforeAIResponseCallback;
}

/**
 * 現在のフェーズと抽出済み項目を取得して、状況説明メッセージを生成
 */
export class ConversationContextGenerator {

  private static azureOpenAIService: AzureOpenAIService | null = null;
  private static isInitialized = false;
  private static speechSynthesisService: ISpeechSynthesisService | null = null;
  static isNotNullAndUndefined = (value: any) => value !== null && value !== undefined;

  ///後続を停止する必要があるなら、true、それ以外はfalse
  static async executeAfterProposedRoute(nextActions: string[], proposedRouteJoban: JobanExpressRoute, proposedRouteZairai: Route, info: TicketInformation): Promise<boolean> {

    //常磐線特急があるなら座席を聞く
    const hasJobanExpressLeg = ConversationContextGenerator.hasJobanExpressLeg(proposedRouteJoban!);
    if (hasJobanExpressLeg && !this.isNotNullAndUndefined(info.jobanExpressSeatInfo)) {
      const firstJobanLeg = proposedRouteJoban!.jobanExpressLegs[0];
      nextActions.push(`「常磐線特急、${firstJobanLeg.nickname}の、座席の希望はございますか？」と出力`);
      return true;
    }

    //在来特急があるなら座席を聞く - 明確に在来使うとなっている場合のみ
    const hasZairaiExpressLeg = ConversationContextGenerator.hasZairaiExpressLeg(proposedRouteZairai!);
    if (hasZairaiExpressLeg && !this.isNotNullAndUndefined(info.zairaiExpressSeatInfo) && (info.phase2_useZairaiExpress || info.phase2_timeSpecificationType === "stop")) {
      const zairaiLegs = this.getLastZairaiExpressLegs(proposedRouteZairai!);
      const firstZairaiLeg = zairaiLegs?.[0];
      nextActions.push(`「在来特急、${firstZairaiLeg?.nickname}の、座席の希望はございますか？」と出力`);
      return true;
    }
    // OKの場合、確認フェーズへ直接移行（再確認はしない）
    if (info.ticketConfirmed !== true) {

      // 確認フェーズの内容
      // heardItems.push('提案利用経路：承認済み');
      //[最終確認] 出発時刻指定あり、在来特急利用しない or 在来特急なし or 在来特急有だが中央線以外
      // 最終確認フェーズへ遷移
      const msg = this.generateTicketConfirmationMessage(info, proposedRouteJoban!, proposedRouteZairai!, false)
      nextActions.push('「' + msg + '」と出力');
    } else if (info.ticketConfirmed === true) {
      // 発券確認済み
      info.ticketIssued = true;
    } else {
      return false;
    }
    return false;
  }

  /**
   * AI応答前に差し込むメッセージを生成（ユーザー発話後、AI応答前）
   * @param userMessage ユーザー発話内容
   * @param state チケットシステムの状態（最新の抽出済み情報を含む）
   * @returns 差し込むメッセージ（不要な場合はnull）
   */
  static async generateBeforeAIResponseMessage(
    userMessage: string,
    state: TicketSystemState
  ): Promise<InjectionMessage | null> {
    // DebugChatInjector.post(`[ConversationHooks] beforeAI user="${userMessage.slice(0, 40)}${userMessage.length>40?'…':''}" phase=${state.ticketInfo.currentPhase}`);
    if (!ConversationContextGenerator.routeSearchService) {
      ConversationContextGenerator.routeSearchService = new RouteSearchService();
    }
    const info = state.ticketInfo;
    const heardItems = [] as any[];
    const unheardItems = [] as any[];
    const nextActions: string[] = [];

    // 基本情報の状態をチェック
    // const basicInfoComplete = !!(
    //   info.destination &&
    //   info.travelDate &&
    //   info.adultCount !== null &&
    //   info.childCount !== null
    // );

    // 基本情報の収集状況
    if (info.destination) heardItems.push(`行先: ${info.destination}`);
    else unheardItems.push('行先');

    if (info.travelDate) heardItems.push(`利用日: ${info.travelDate}`);
    else unheardItems.push('利用日');

    if (info.adultCount !== null) heardItems.push(`大人: ${info.adultCount}名`);
    else unheardItems.push('大人の人数');

    if (info.childCount !== null) heardItems.push(`子供: ${info.childCount}名`);
    else unheardItems.push('子供の人数');

    // // デバッグログ
    // console.log('[ConversationHooks] generateBeforeAIResponseMessage called', {
    //   phase2_jobanExpressUse: info.phase2_jobanExpressUse,
    //   phase2_confirmed: info.phase2_confirmed,
    //   ticketConfirmed: info.ticketConfirmed,
    //   userMessage
    // });

    //共通関数 - 次のアクションの指示メッセージを返す
    const createResult = (heardItems: string[], nextActions: string[], unheardItems: string[]): InjectionMessage => {

      // メッセージを生成
      let content = '';

      if (heardItems.length > 0) {
        // content += `【確認済み項目】${heardItems.join('、')}`;
      }

      if (unheardItems.length > 0) {
        if (content) content += ' ';
        content += `【未確認項目】${unheardItems.join('、')}`;
      }

      if (nextActions.length > 0) {
        if (content) content += ' ';
        content += `【次のアクション】${nextActions.join('、')}(出力指示がある場合、内容を変えずにそのまま出力しなおしてください。JRの切符の話です)`;
      }

      return {
        content,
        role: 'user',
        timing: 'before_send'
      };
    }


    // ◆ 基本情報フェーズ野処理
    if (state.ticketInfo.currentPhase === TicketPhases.BASIC_INFO) {
      // console.log('[差し込み処理]', "基本情報フェーズです***********************************");
      DebugChatInjector.post('[ConversationHooks] 基本情報フェーズ]');
      const execBasicInfoPhase = async () => {

        // 基本情報が未完了の場合
        //--すべての情報が何も聞けていない場合はいらっしゃいませ、どちらに行かれますか？と出力
        if (heardItems.length === 0) {
          if (!info.iscleared) {
            nextActions.push('「いらっしゃいませ、どちらに行かれますか？」と出力');
          } else {
            nextActions.push('「かしこまりました。恐れ入りますが、初めからお聞きいたします。どちらに行かれますか？」と出力');
            info.iscleared = false;
          }
        } else {
          if (!info.destination && info.notFoundDestination) {
            nextActions.push('「恐れ入ります。行き先が正しく聞き取れていないか、JR東日本以外の駅名をおっしゃったようです。再度、駅名を、水戸駅、のように最後に「駅」をつけてはっきりとお話しください。」と出力。');
            info.notFoundDestination = null;
            return state.ticketInfo.currentPhase !== TicketPhases.BASIC_INFO;
          }

          //後は順に聞いていく
          if (!this.isNotNullAndUndefined(info.destination)) {
            nextActions.push('「どちらに行かれますか？」と出力');
          } else if (!this.isNotNullAndUndefined(info.travelDate)) {
            nextActions.push('「ご利用日は今日でよろしいですか？」と出力');
          } else if (!this.isNotNullAndUndefined(info.adultCount)) {
            nextActions.push('「大人と子供の人数は何人ですか？」と出力');
          } else if (!this.isNotNullAndUndefined(info.childCount)) {
            nextActions.push('「子供の人数は何人ですか？」と出力');
          } else {
            if (!this.isNotNullAndUndefined(info.basicInfoConfirmed)) {
              nextActions.push(`「${info.destination_kana}まで、${info.travelDate}、大人${info.adultCount}名${info.childCount !== null && info.childCount > 0 ? `、子供${info.childCount}名` : ''}でよろしいでしょうか？」と出力する。
重要：音声出力すると間違えるので、指示通り、駅名は平仮名のまま、${info.destination_kana}と出力すること。
日付も勝手に会話から抜きださずに、「${info.travelDate}」と、出力指示通り出力すること。`);
            } else if (info.basicInfoConfirmed === false) {
              nextActions.push('それでは、変更のご要望を教えて下さい。');
              info.basicInfoConfirmed = null; //いったんリセット
            } else {
              state.ticketInfo.currentPhase = TicketPhases.JOBAN_1;
              DebugChatInjector.post('基本情報のヒアリングが完了 => 常磐線フェーズ１に移行しました--------------------------------------------');
              // 基本情報確認済み、常磐線フェーズ１へ
            }
          }
          // if (!basicInfoComplete) {

            
          // } else {
          //   // 基本情報が完了し、basicInfoConfirmedがまだの場合
          //   if (info.basicInfoConfirmed !== true) {
          //     nextActions.push(`「${info.destination_kana}まで、${info.travelDate}、大人${info.adultCount}名${info.childCount !== null && info.childCount > 0 ? `、子供${info.childCount}名` : ''}でよろしいでしょうか？」と出力`);
          //   } else {
          //     state.ticketInfo.currentPhase = TicketPhases.JOBAN_1;
          //     DebugChatInjector.post('基本情報のヒアリングが完了 => 常磐線フェーズ１に移行しました--------------------------------------------');
          //     // 基本情報確認済み、常磐線フェーズ１へ
          //   }
          // }
        }

        return state.ticketInfo.currentPhase !== TicketPhases.BASIC_INFO;
      }
      const changePhaseBasicInfo = await execBasicInfoPhase();
      console.log('[ConversationHooks] changePhase:', changePhaseBasicInfo);

      if (!changePhaseBasicInfo) {
        return createResult(heardItems, nextActions, unheardItems);
      };
    }

    // ◆ 常磐線フェーズ１の処理
    if (state.ticketInfo.currentPhase === TicketPhases.JOBAN_1) {
      DebugChatInjector.post('[ConversationHooks] 常磐線フェーズ１]');
      console.log('[差し込み処理]', "常磐線フェーズ１です***********************************");
      const execJoban1Phase = async () => {

        // 常磐線が経路に存在するかの確認
        if (!info.jobanExpressRoutes || info.jobanExpressRoutes.length === 0) {

          //[最終確認]常磐線無し=すべて普通
          const msg = this.generateTicketConfirmationMessage(info, null, null, true);
          nextActions.push(`「${msg}」と出力`);
          //強制的にユーザー発話を追加
          return state.ticketInfo.currentPhase !== TicketPhases.JOBAN_1;
        }

        // 常磐線特急利用の確認
        if (info.phase2_jobanExpressUse === null || info.phase2_jobanExpressUse === undefined) {
          nextActions.push('「常磐線は、特急のご利用でよろしいですか？」と出力');
        } else if (info.phase2_jobanExpressUse === false) {
          heardItems.push('常磐線特急：利用しない（すべて普通列車）');

          //[最終確認]常磐線あり／利用しない＝すべて普通
          //[終了]常磐線特急を利用しない
          if (info.ticketConfirmed !== true) {
            //[最終確認]常磐線あり／利用しない＝すべて普通
            const msg = this.generateTicketConfirmationMessage(info, null, null, true);
            nextActions.push(`「${msg}」と出力`);
            return state.ticketInfo.currentPhase !== TicketPhases.JOBAN_1;
          }

          //ここには来ない（ticketConfirmedがfalseなら最初から、trueなら勝手に最終フェーズへ）
          nextActions.push('[エラーが発生しています。エラー：常磐線を利用しないケースのイレギュラー１]と出力。');

        } else if (info.phase2_jobanExpressUse === true) {
          heardItems.push('常磐線特急：利用する');

          // 時間指定の確認
          if (info.phase2_timeSpecification === null || info.phase2_timeSpecification === undefined) {
            nextActions.push('「ご乗車のお時間や、到着のお時間は決まっていますか？時間は、午前５時、午後５時または、１７時のように、午前と午後を明確にお伝えください。」と出力する（内容を勝手に変えないこと）');
          } else if (info.phase2_timeSpecification === false) {
            // 時間指定がない場合
            heardItems.push('時間指定：なし');

            // 座席未指定券の確認
            if (info.phase2_confirmUnspecifiedSeat === null || info.phase2_confirmUnspecifiedSeat === undefined) {
              nextActions.push(`「それでは、座席未指定券をご利用になれます。座席未指定券は、全席指定席の在来線特急にだけ設定されている、日付指定・時間未指定の特急券です。これを持っている場合、お客さまは座席上にあるランプが赤の席（＝空席）を探して座ることができます。
時間指定をせずにどの特急列車でも乗れますが日付は指定されます。
そちらでよろしいですか？」と出力。`);

            } else if (info.phase2_confirmUnspecifiedSeat === false) {
              heardItems.push('座席未指定券：利用しない');
              if (!info.ticketConfirmed) {
                //[最終確認]常磐線あり／利用する・時刻指定なし／座席未指定券：不要
                const msg = this.generateTicketConfirmationMessage(info, null, null, true);
                nextActions.push(`「${msg}」と出力。`);
              }

            } else if (info.phase2_confirmUnspecifiedSeat === true) {
              heardItems.push('座席未指定券：利用する');
              //
              // if (true) {
              if (!info.ticketConfirmed) {
                // 最終確認フェーズへ遷移
                // state.ticketInfo.currentPhase = TicketPhases.TICKET_CONFIRMATION;
                const msg = this.generateTicketConfirmationMessage(info, null, null, false);
                nextActions.push(`「${msg}」と出力。`);
              }
            }
          } else if (info.phase2_timeSpecification === true) {
            // 時間指定がある場合
            heardItems.push('時間指定：あり');

            // 時間指定タイプの確認
            if (!info.phase2_timeSpecificationType) {
              nextActions.push('「ご指定は、出発のお時間ですか？到着のお時間ですか？時間は、午前５時、午後５時または、１７時のように、午前と午後を明確にお伝えください。」と出力');
            } else {
              heardItems.push(`時間指定タイプ：${info.phase2_timeSpecificationType === 'start' ? '出発時刻' : '到着時刻'}`);

              if (!info.phase2_specificTime) {
                // 初回の時刻確認
                nextActions.push('「ご希望時間は、何時でしょうか？時間は、午前５時、午後５時または、１７時のように、午前と午後を明確にお伝えください。」と出力');
              } else {
                heardItems.push(`希望時刻：${info.phase2_specificTime}`);

                if (info.phase2_timeSpecificationType === 'stop') {
                  // 到着時刻指定の場合 *******************
                  await ConversationContextGenerator.handleTimeSpecifiedForArrival(info, state, heardItems, nextActions, userMessage, true);


                } else if (info.phase2_timeSpecificationType === 'start') {
                  // 出発時刻指定の場合 *******************

                  // proposedRouteがないのにproposedRouteOKが設定されている異常な状態を修正
                  if (!info.proposedRoute && info.proposedRouteOK) {
                    DebugChatInjector.post('異常事態によりクリアされました。')
                    info.proposedRouteOK = null;
                  }

                  if (!this.isNotNullAndUndefined(info.phase2_useZairaiExpress)) {
                    // 在来特急利用確認がまだの場合
                    await this.handleTimeSpecified(info, state, heardItems, nextActions, userMessage, false);

                  } else {
                    if (info.phase2_useZairaiExpress === false) {

                      // 在来特急を利用しない場合
                      heardItems.push(`在来特急：利用しない`);
                      // 初回のみ「特急は常磐線のみのご利用ですね」を表示（在来線特急が含まれているなら）
                      if (info.proposedRoute && !this.isNotNullAndUndefined(info.proposedRouteOK)) {
                        nextActions.push('まず、「特急は常磐線のみのご利用ですね。」と出力。続けて、');
                      }
                      // 出発時刻指定／在来特急なしの初期提案経路のフローに入る
                      await this.handleTimeSpecified(info, state, heardItems, nextActions, userMessage, false);
                    } else if (info.phase2_useZairaiExpress === true) {

                      //中央線以外の場合
                      if (info.zairaiExpressCategory) {
                        if (info.zairaiExpressCategory !== '中央線') {
                          //中央線以外 ＝＞ 内部で時刻調整を行う経路選定フローに入るため、これでOK。早い・遅いに対応されているし、了承しても毎回ここに来る。
                          await this.handleTimeSpecified(info, state, heardItems, nextActions, userMessage, false);
                        } else {

                          // 在来特急を利用する場合の処理 - 常磐線フェーズ２へ移行
                          // console.log('[ConversationHooks] Processing Zairai Express use = true');
                          DebugChatInjector.post('[ConversationHooks] 在来特急を利用かつ、中央線のため - 常磐線フェーズ２へ移行');
                          heardItems.push(`在来特急：利用する`);
                          state.ticketInfo.currentPhase = TicketPhases.JOBAN_PHASE_2;
                        }
                      } else {
                        //在来の種別が出せていない状態でここには来ないはずなので、例外にする
                        throw new Error('[generateBeforeAIResponseMessage] Invalid phase');
                      }


                    }
                  }
                }
              }
            }
          }
        }
        return state.ticketInfo.currentPhase !== TicketPhases.JOBAN_1;
      }

      const changePhaseJoban1 = await execJoban1Phase();
      // console.log('[ConversationHooks] changePhase:', changePhaseJoban1);

      //フェーズが変わっていなければ、そのまま結果を返す
      if (!changePhaseJoban1) {
        return createResult(heardItems, nextActions, unheardItems);
      };
    }

    // 常磐線フェーズ２の場合の処理
    if (state.ticketInfo.currentPhase === TicketPhases.JOBAN_PHASE_2) {
      // console.log('[差し込み処理]', "常磐線フェーズ２です***********************************");
      DebugChatInjector.post('[ConversationHooks] 常磐線フェーズ２]');

      // 初期提案経路と在来特急情報が既に設定されているか確認
      if (!info.initialProposedRouteWithZairai || !info.initialProposedZairaiExpressSection) {
        // console.log('[ConversationHooks] Route info not yet set, calling handleTimeSpecified first');
        // まだ経路情報が設定されていない場合は、handleTimeSpecifiedを呼んで設定
        await this.handleTimeSpecified(info, state, heardItems, nextActions, userMessage, false);
        // handleTimeSpecifiedで質問が設定された場合は処理を中断
        // （nextActionsがある場合は、最後のreturn文で処理される）
      }

      // 経路情報が設定されている場合のみフェーズ２へ移行
      if (info.initialProposedRouteWithZairai && info.initialProposedZairaiExpressSection) {

        // フェーズ２の初期処理 *******************************************

        // 常磐線降車駅の確認
        if (info.zairaiExpressCategory !== '中央線') {
          // 中央線以外 ＝＞ 内部で時刻調整を行う経路選定フローに入るため、これでOK。早い・遅いに対応されているし、了承しても毎回ここに来る。
          await this.handleTimeSpecified(info, state, heardItems, nextActions, userMessage, false);
        } else {

          //中央線の場合の経路
          //まず時刻の再確認を行う
          if (!this.isNotNullAndUndefined(info.phase2_timeReConfirmed)) {
            nextActions.push(`「では改めて出発時間を確認します。ご希望に合わせますと、水戸駅を、${info.phase2_specificTime}頃にご出発したいとのことで、水戸駅発の常磐線特急は、水戸駅発、${this.trimToHHMM(info.initialProposedRouteWithZairai?.departureTime)}の常磐線特急となりますがよろしいですか？」と出力`);
          } else if (info.phase2_timeReConfirmed === false) {
            nextActions.push(`「かしこまりました。それでは、ご希望の出発時刻または到着時刻から改めてお教えください。時間は、午前５時、午後５時または、１７時のように、午前と午後を明確にお伝えください。」と出力`);
            //常磐１のヒアリングに戻る
            state.ticketInfo.currentPhase = TicketPhases.JOBAN_1;
            //在来特急の利用は、在来特急の有無に合わせて設定する
            if (info.jobanZairaiExpressRoutes && info.jobanZairaiExpressRoutes.length === 0) {
              info.phase2_useZairaiExpress = false;
            } else {
              info.phase2_useZairaiExpress = null;
            }
            info.proposedRoute = null;
            info.proposedRouteOK = null;
            info.proposedRouteRequest = null;
            info.phase2_timeReConfirmed = null;
            info.phase2_specificTime = null;
            info.phase2_timeSpecificationType = null;
            info.zairaiSpecial_transferMinutes = null;
            info.zairaiSpecial_shinjukuArrivalTime = null;
            info.zairaiSpecial_shinjukuDepartureTime = null;
            info.zairaiSpecial_shinjukuRoutes = null;
            info.zairaiSpecial_selectedRoute = null;
            info.zairaiSpecial_proposedRoute = null;
            info.zairaiSpecial_proposedRouteOK = null;
            info.zairaiSpecial_proposedRouteRequest = null;

          } else {

            if (!info.phase2_jobanDropOffStation) {
              nextActions.push('「ではまず、乗換駅を確認します。常磐線特急は、上野・東京、どちらでおりますか？」と出力');
            } else {
              heardItems.push(`常磐線降車駅：${info.phase2_jobanDropOffStation}`);
              // フェーズ２へ移行（中央線のみ）。中央線以外は既に合流済み

              //中央線の場合

              // 新宿駅での乗り換え時間確認
              if (info.phase2_transferTimeIsNormal === null || info.phase2_transferTimeIsNormal === undefined) {
                nextActions.push('「新宿駅での乗り換え時間は通常の時間でよろしいですか？乗り換えのお時間を指定する場合は、"１時間あいだをあけたい"、のようにお話しください。」と出力');
              } else if (info.phase2_transferTimeIsNormal === false && !this.isNotNullAndUndefined(info.zairaiSpecial_transferMinutes)) {
                nextActions.push('「新宿駅での乗り換え時間は、どのくらいあけますか？"１時間あいだをあけたい"、のようにお話しください。」と出力');
              } else {
                heardItems.push(`新宿駅乗り換え時間：${info.phase2_transferTimeIsNormal ? '通常' : '通常以外'}`);

                //[新宿出発時刻確定処理]******************************************************************************************** */
                const setShinjukuDepartureTime = async () => {
                  console.log('[差し込み処理]', "在来特急特殊フェーズです***********************************");

                  heardItems.push(`新宿乗換所要時間: ${info.zairaiSpecial_transferMinutes}分`);

                  // 2) 元提案経路から新宿到着時刻を導出
                  const baseRoute = info.initialProposedRouteWithZairai;
                  const zairaiLeg = info.initialProposedZairaiExpressSection;
                  if (baseRoute && zairaiLeg) {

                    //常磐線の経路をログに出力
                    const jobanLegs = this.getLastZairaiExpressLegs(baseRoute);
                    const firstJobanLeg = jobanLegs?.[0];
                    const lastJobanLeg = jobanLegs?.[jobanLegs.length - 1];
                    const jobanMsg = `常磐線の経路が確定***********：${firstJobanLeg?.from.name || 'なし'}|${firstJobanLeg?.from.time || 'なし'} -> ${lastJobanLeg?.to.name || 'なし'}|${lastJobanLeg?.to.time || 'なし'}`;
                    DebugChatInjector.post('[ConversationHooks] 常磐線の経路：' + jobanMsg);

                    //baseRouteのlegsから、toが新宿の到着時刻を取得する
                    let shinjukuArrivalTime = this.getArrivalTimeAtStation(baseRoute, '新宿');

                    //見つからなければ、水戸新宿の現在時刻以降のルートをルート検索し、所要時間(duration)が最も小さいレコードの所要時間を抽出する
                    //→資料では現在時刻となっていたが、全体から探す。（ない場合が合えり得るので）
                    if (shinjukuArrivalTime) {
                      DebugChatInjector.post('[ConversationHooks] 新宿到着時刻が元のルートに含まれています。利用します。：' + shinjukuArrivalTime);

                    } else {
                      DebugChatInjector.post('[ConversationHooks] 新宿到着時刻が元のルートに含まれていません。ルート検索します。');

                      //TODO: 新宿までの時間を探し出す個所は、別途見直しが必要かもしれない。（今は全体の中で最短にしているが時刻以降が要求）
                      const results = await ConversationContextGenerator.routeSearchService.searchRoutesWithMinDeparture('水戸', '新宿', new Date().toISOString());

                      //reultsからdurationが最も小さいレコードの値を取得
                      const minDuration = results.routes.reduce((min: number, route: any) => {
                        return Math.min(min, route.duration);
                      }, Infinity);

                      //ルート情報をデバッグ出力
                      DebugChatInjector.post('[ConversationHooks] 水戸から新宿までの経路を探して、最も小さい移動時間は' + minDuration + '分です。');

                      //duration(秒数)を、元のルートの水戸初の時刻に足した時間が、新宿到着時刻となる
                      shinjukuArrivalTime = this.minutesToHHMM(this.timeToMinutes(baseRoute.departureTime) + minDuration / 60);
                      DebugChatInjector.post('[ConversationHooks] 新宿到着時刻(常磐線特急乗車時刻 + 水戸->新宿最短所要時間で計算)：' + shinjukuArrivalTime);
                    }

                    // 新宿到着を含むlegのto.time または zairaiLeg.from.time 前の到着駅が新宿
                    // ここではzairaiLeg.from.time を新宿出発時刻（元）とし、到着はその直前の常磐降車後の移動区間終端とみなす簡易導出
                    info.zairaiSpecial_shinjukuArrivalTime = shinjukuArrivalTime; // 表示用（画面要件に従い到着刻として扱う）
                    // 3) 乗換分を加味して新宿出発時刻を計算
                    const depMinutes = this.timeToMinutes(shinjukuArrivalTime);
                    const newDepMinutes = depMinutes + (info.zairaiSpecial_transferMinutes || 0);
                    const hh = Math.floor(newDepMinutes / 60) % 24;
                    const mm = newDepMinutes % 60;
                    const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
                    const newDep = `${pad(hh)}:${pad(mm)}`;
                    info.zairaiSpecial_shinjukuDepartureTime = newDep;

                    DebugChatInjector.post('[ConversationHooks] 新宿出発可能刻：' + info.zairaiSpecial_shinjukuDepartureTime);

                    // 4) 新宿→目的地の再検索（Cosmos既存データを使用）
                    // 既存のRouteSearchServiceは出発時刻条件を持たないため、一覧から新宿発のroutesを抽出＆時刻フィルタ
                    // ここでは既存全routesの中から origin=新宿, destination=行先 を検索後、発時刻>=newDep でフィルタ
                    // 実行自体は会話層では行えないため、UI・サービス層の既存routesには依存せず、nextActionsで誘導しつつ内部状態に保存は省略
                    // 代替として、既存の全ルート検索は行えないため、表示文のみ整備
                    heardItems.push(`新宿到着刻: ${info.zairaiSpecial_shinjukuArrivalTime}`);
                    heardItems.push(`新宿出発可能刻: ${info.zairaiSpecial_shinjukuDepartureTime}`);

                    //新宿発、目的地行のルートを検索して保持しておく(一旦全件調べておく)
                    const shinjukuRoutes = await ConversationContextGenerator.routeSearchService.searchRoutesWithMinDeparture(
                      '新宿', info.destination || '', '');
                    info.zairaiSpecial_shinjukuRoutes = shinjukuRoutes.routes;

                    //ここでルート候補が確定したので、時刻フローに入る
                    await this.handleTimeSpecifiedForZairaiFromShijuku(info, state, heardItems, nextActions, userMessage);

                  }
                }
                //[新宿出発時刻確定処理]******************************************************************************************** */
                
                //乗り換え時間別フロー
                if (info.phase2_transferTimeIsNormal === true) {
                  //通常の乗り換え時間でOK -> 10分にする
                  // await this.handleTimeSpecified(info, state, heardItems, nextActions, userMessage, false);
                  info.zairaiSpecial_transferMinutes = 10;
                  DebugChatInjector.post('[ConversationHooks] 新宿乗換所要時間(通常の時間): ' + info.zairaiSpecial_transferMinutes + '分');
                  await setShinjukuDepartureTime();
                } else {
                  //通常の乗り換え時間だとNG

                  //時間が聞けていない場合
                  if (!ConversationContextGenerator.isNotNullAndUndefined(info.phase2_transferTimeIsNormal)) {
                    // 在来特急特殊フェーズに遷移
                    // state.ticketInfo.currentPhase = TicketPhases.ZAIRAI_SPECIAL_CASE;
                    nextActions.push('「では新宿駅での乗り換えに必要な時間は何分必要かをお教えください。」と出力');

                  } else {
                    console.log('[差し込み処理]', "在来特急特殊フェーズです***********************************");

                    heardItems.push(`新宿乗換所要時間: ${info.zairaiSpecial_transferMinutes}分`);
                    DebugChatInjector.post('[ConversationHooks] 新宿乗換所要時間(利用客指定): ' + info.zairaiSpecial_transferMinutes + '分');

                    await setShinjukuDepartureTime();
                  }
                }

              } //中央線の場合の終わり

              if (nextActions.length > 0) {
                return createResult(heardItems, nextActions, unheardItems);
              }

              // // 在来特急を含む経路の最終確認
              // if (!info.phase2_finalRouteConfirmed) {
              //   // 経路確認スクリプトの生成
              //   const proposedRoute = info.initialProposedRouteWithZairai;
              //   const zairaiSection = info.initialProposedZairaiExpressSection;
              //   if (proposedRoute && zairaiSection) {
              //     // 常磐線降車時刻を取得
              //     const jobanDropOffTime = this.getJobanDropOffTime(proposedRoute, info.phase2_jobanDropOffStation);
              //     const confirmScript = `常磐線特急 水戸に${proposedRoute.departureTime}に乗車、${info.phase2_jobanDropOffStation}に、${jobanDropOffTime}で降車。` +
              //       `在来特急${zairaiSection.nickname}に新宿に${this.getZairaiDepartureTime(zairaiSection)}に乗車し、` +
              //       `${zairaiSection.to.name}に${zairaiSection.to.time}に降車。こちらでよろしいでしょうか？`;
              //     nextActions.push(confirmScript);
              //   }
              // } else {
              //   // フェーズ２が完了している場合
              //   if (info.phase2_finalRouteConfirmed === false as boolean) {
              //     // NGの場合
              //     nextActions.push('承知しました。しばらくお待ちください。実装中です。');
              //   } else {
              //     // OKの場合 - 確認フェーズへ
              //     // state.ticketInfo.currentPhase = TicketPhases.TICKET_CONFIRMATION;
              //     nextActions.push('発券内容の最終確認を行います。');
              //   }
              // }
            }
          }
        }
      }
    }


    // メッセージを生成
    let content = '';

    if (heardItems.length > 0) {
      // content += `【確認済み項目】${heardItems.join('、')}`;
    }

    if (unheardItems.length > 0) {
      if (content) content += ' ';
      content += `【未確認項目】${unheardItems.join('、')}`;
    }

    if (nextActions.length > 0) {
      if (content) content += ' ';
      content += `【次のアクション】${nextActions.join('、')}(出力指示がある場合、内容を変えずにそのまま出力しなおしてください。JRの切符の話です)`;
    }
    return {
      content,
      role: 'user',
      timing: 'before_send'
    };
  }

  /**
   * 音声合成サービスを設定
   * @param service 音声合成サービス
   */
  public static setSpeechSynthesisService(service: ISpeechSynthesisService | null): void {
    this.speechSynthesisService = service;
  }

  /**
   * 音声合成サービスを取得
   * @returns 音声合成サービス（設定されていない場合はnull）
   */
  public static getSpeechSynthesisService(): ISpeechSynthesisService | null {
    return this.speechSynthesisService;
  }

  /**
   * テキストを音声合成して再生（音声合成サービスが設定されている場合のみ）
   * @param text 音声合成するテキスト
   * @param onEnded 音声再生完了時のコールバック
   */
  public static async synthesizeAndPlaySpeech(text: string, onEnded?: () => void): Promise<void> {
    if (this.speechSynthesisService) {
      await this.speechSynthesisService.synthesizeAndPlaySpeech(text, onEnded);
    } else {
      console.warn('[ConversationContextGenerator] Speech synthesis service not available');
    }
  }
  /**
   * Azure OpenAIサービスを初期化
   */
  private static async initializeService() {
    if (this.isInitialized) return;

    const azureConfig = ConfigManager.getInstance().getAzureConfig();

    if (!azureConfig) {
      console.warn('[ConversationContextGenerator] Configuration not available');
      return;
    }

    const apiKey = azureConfig.openAIApiKey;
    const endpoint = azureConfig.openAIEndpoint;
    const deployment = azureConfig.openAIDeploymentGpt4o || 'gpt-4o';

    if (!apiKey || !endpoint) {
      console.warn('[ConversationContextGenerator] Azure OpenAI credentials not found.');
      return;
    }

    try {
      this.azureOpenAIService = new AzureOpenAIService({
        apiKey,
        endpoint,
        deployment,
        apiVersion: '2024-02-15-preview',
        openAIEastUsEndpoint: azureConfig.openAIEastUsEndpoint,
        openAIEastUsApiKey: azureConfig.openAIEastUsApiKey,
        openAIEastUsDeployment: azureConfig.openAIEastUsDeployment,
        openAIEastUsDeploymentGpt5: azureConfig.openAIEastUsDeploymentGpt5
      });

      await this.azureOpenAIService.initialize();
      this.isInitialized = true;
    } catch (error) {
      console.error('[ConversationContextGenerator] Failed to initialize Azure OpenAI:', error);
    }
  }

  // private static hhmmToMinutes(hhmm: string): number {
  //   const m = hhmm.match(/(\d{1,2}):(\d{2})/);
  //   if (!m) return 0;
  //   return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  // }
  private static minutesToHHMM(mins: number): string {
    const m = ((mins % (24 * 60)) + (24 * 60)) % (24 * 60);
    const h = Math.floor(m / 60);
    const mm = m % 60;
    const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
    return `${pad(h)}:${pad(mm)}`;
  }
  // private static timeToSeconds(hhmmss: string): number {
  //   const parts = hhmmss.split(':').map(Number);
  //   if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  //   if (parts.length === 2) return parts[0] * 3600 + parts[1] * 60;
  //   return 0;
  // }
  // ===== Helper utilities (time and route) =====
  private static trimToHHMM(time: string): string {
    const m = time?.match(/^(\d{1,2}:\d{2})(?::\d{2})?$/);
    return m ? m[1] : time || '';
  }
  private static getArrivalTimeAtStation(route: any, stationName: string): string | null {
    if (!route?.legs) return null;
    for (const leg of route.legs) {
      if (leg?.to?.name && leg.to.name.includes(stationName)) {
        return this.trimToHHMM(leg.to.time || '');
      }
    }
    return null;
  }
  private static routeSearchService: RouteSearchService
  constructor() {
    ConversationContextGenerator.routeSearchService = new RouteSearchService();
  }

  public static generateConfirmProposeRoute(info: TicketInformation, jobanRoute: JobanExpressRoute, zairaiRoute: Route, needJobanConfirm: boolean): string {
    const jobanLegs = jobanRoute.jobanExpressLegs;
    const jobanLegFirst = jobanLegs[0];
    const jobanLegLast = jobanLegs[jobanLegs.length - 1];

    let msg = `${jobanLegFirst.from.name}から、${this.trimToHHMM(jobanLegFirst.from.time || '')}発の、特急、${jobanLegFirst.nickname} ${jobanLegFirst.trainName}号で、${info.phase2_jobanDropOffStation || jobanLegLast.to.name}駅に、${this.trimToHHMM(jobanLegLast.to.time || '')}に降車。`

    const zairaiLegs = this.getLastZairaiExpressLegs(zairaiRoute);

    //在来特急の案内は、後半「利用する」といわれない限り、早い・遅いのフローでも言わないことにする
    if (zairaiLegs && zairaiLegs.length > 0 && (info.phase2_useZairaiExpress || info.phase2_timeSpecificationType === "stop")) {
      const zairaiLegFirst = zairaiLegs[0];
      const zairaiLegLast = zairaiLegs[zairaiLegs.length - 1];
      if (needJobanConfirm) {
        msg += `そのあと、在来特急、${zairaiLegFirst.nickname} ${zairaiLegFirst.trainName}号で、${zairaiLegFirst.from.name}から、${this.trimToHHMM(zairaiLegFirst.from.time || '')}に乗車し、${zairaiLegLast.to.name}駅に、${this.trimToHHMM(zairaiLegLast.to.time || '')}に降車。`  
      } else {
        msg = `在来特急、${zairaiLegFirst.nickname} ${zairaiLegFirst.trainName}号で、${zairaiLegFirst.from.name}から、${this.trimToHHMM(zairaiLegFirst.from.time || '')}に乗車し、${zairaiLegLast.to.name}駅に、${this.trimToHHMM(zairaiLegLast.to.time || '')}に降車。`
      }
      msg += `${info.destination_kana}には、${this.trimToHHMM(zairaiRoute.arrivalTime || '')}に到着可能です。`
    } else {
      if (needJobanConfirm) {
        msg += `ご希望のお時間ですと、${info.destination_kana}駅まで、普通列車のご移動で、${this.trimToHHMM(zairaiRoute.arrivalTime || '')}の到着が可能ですので、在来特急のご利用は無しとなります。`
      }
    }
    msg += `こちらでよろしいでしょうか？`;
    return msg;
  }


  public static generateTicketConfirmationMessage(info: TicketInformation, jobanRoute: JobanExpressRoute | null, zairaiRoute: Route | null, isAllNormal: boolean): string {

    //すべて普通車の利用ケース
    if (isAllNormal) {
      return `全て普通列車のご利用ですね。
確認します。
乗車券は、水戸から、${info.destination_kana}まで。
${info.travelDate}のご利用で、
大人${info.adultCount}名、子供${info.childCount}名。
以上でよろしいでしょうか？`;
    }

    //座席未指定券を利用するケース
    if (info.phase2_jobanExpressUse && info.phase2_confirmUnspecifiedSeat) {
      return `確認します。
乗車券は、水戸から、${info.destination_kana}まで。
${info.travelDate}のご利用で、
大人${info.adultCount}名、子供${info.childCount}名。
特急券は、常磐線特急を、座席未指定でご利用。
以上でよろしいでしょうか？`;
    }


    const jobanLegs = jobanRoute?.jobanExpressLegs;
    const jobanLegFirst = jobanLegs?.[0];
    const jobanLegLast = jobanLegs?.[jobanLegs.length - 1];

    let msg = `確認します。
乗車券は、水戸から、${info.destination_kana}まで。
特急券は、常磐線特急、${jobanLegFirst?.from.name}から、${this.trimToHHMM(jobanLegFirst?.from.time || '')}発の、特急、${jobanLegFirst?.nickname} ${jobanLegFirst?.trainName}号で、${info.phase2_jobanDropOffStation || jobanLegLast?.to.name}駅に、${this.trimToHHMM(jobanLegLast?.to.time || '')}に降車。`

    if (info.phase2_useZairaiExpress || info.phase2_timeSpecificationType === "stop") {
      const zairaiLegs = this.getLastZairaiExpressLegs(zairaiRoute!);
      if (zairaiLegs && zairaiLegs.length > 0) {
        const zairaiLegFirst = zairaiLegs[0];
        const zairaiLegLast = zairaiLegs[zairaiLegs.length - 1];
        msg += `
そのあと、在来特急、${zairaiLegFirst.nickname} ${zairaiLegFirst.trainName}号で、${zairaiLegFirst.from.name}から、${this.trimToHHMM(zairaiLegFirst.from.time || '')}に乗車し、${zairaiLegLast.to.name}駅に、${this.trimToHHMM(zairaiLegLast.to.time || '')}に降車。`

        //       //特急の降車駅と、目的地が異なる場合は、それ以降は普通列車となることを出力。
        //       if (zairaiLegLast.to.name !== info.destination) {
        //         msg += `
        // そのあと、${info.destination_kana}駅まで、普通列車のご移動で、${zairaiRoute?.arrivalTime}に到着。`
        //       }
        //       msg += `
        // こちらでよろしいでしょうか？`;
        //     } else {
        //       if (jobanLegLast && jobanLegLast.to.name !== info.destination) {
        //         msg += `
        // そのあと、${info.destination_kana}駅まで、普通列車のご移動で、${jobanRoute?.arrivalTime}に到着。`
        //       } else {
        //         msg += `
        // こちらでよろしいでしょうか？`;
        //       }
      }
    }
    msg += `以上でよろしいでしょうか？`;
    return msg;
  }

  /**
   * 時刻指定の共通処理
   * @param isArrivalTime true: 到着時刻指定, false: 出発時刻指定
   */
  public static async handleTimeSpecified(
    info: TicketInformation,
    state: TicketSystemState,
    heardItems: string[],
    nextActions: string[],
    userMessage: string,
    isArrivalTime: boolean
  ): Promise<void> {
    // console.log("userMessage", userMessage)
    // 常磐線特急を含む経路が取得されているか確認
    if (!info.jobanExpressRoutes || info.jobanExpressRoutes.length === 0) {
      nextActions.push('経路データの取得が必要です');
      return;
    }

    console.log('userMessage', userMessage);

    DebugChatInjector.post('[handleTimeSpecifiedに入りました] info.proposedRouteは、' + (info.proposedRoute === null ? 'なし' : 'あり'));

    if (!info.proposedRoute) {
      // 初回提案時の処理************************************************************
      // 希望時刻に最も近い経路を探す
      const targetTime = info.phase2_specificTime!;
      const destination = info.destination!;

      const targetMinutes = this.timeToMinutes(targetTime);

      // 出発時刻指定の場合、在来線特急も含めたデータがあるかチェック
      if (info.jobanZairaiExpressRoutes && info.jobanZairaiExpressRoutes.length > 0) {
        // 出発時刻指定で在来特急経路がある場合
        const targetMinutes = this.timeToMinutes(targetTime);
        const afterTargetRoutes = info.jobanZairaiExpressRoutes.filter(route => {
          const depTime = this.getDepartureTimeFromMito(route);
          return this.timeToMinutes(depTime) >= targetMinutes;
        });
        const afterTargetRoutesJobanAll = info.jobanExpressRoutes.filter(route => {
          const depTime = this.getDepartureTimeFromMito(route);
          return this.timeToMinutes(depTime) >= targetMinutes;
        });

        //デバッグ：出発時刻以降の在来特急経路情報を出力(まとめて)
        {
          const routeDebugInfoAfterTarget = afterTargetRoutes.map(route => {
            const jobanExpressLeg = route.jobanExpressLegs[0];
            const zairaiExpressLegs = this.getLastZairaiExpressLegs(route);
            const firstZairaiExpressLeg = zairaiExpressLegs?.[0];
            const lastZairaiExpressLeg = zairaiExpressLegs?.[zairaiExpressLegs.length - 1];
            const debugMsg = `・常磐線特急：${jobanExpressLeg.nickname}, ${jobanExpressLeg.from.name}|${jobanExpressLeg.from.time} -> ${jobanExpressLeg.to.name}|${jobanExpressLeg.to.time}` +
              `／在来線特急：${firstZairaiExpressLeg?.nickname || 'なし'}, ${firstZairaiExpressLeg?.from.name || 'なし'}|${firstZairaiExpressLeg?.from.time || 'なし'} -> ${lastZairaiExpressLeg?.to.name || 'なし'}|${lastZairaiExpressLeg?.to.time || 'なし'}`;
            return debugMsg;
          }).join('\r\n');

          //該当がなければ該当なしと出力する
          if (afterTargetRoutes.length === 0) {
            DebugChatInjector.post('[出発時刻以降の在来特急を含む経路]\r\n該当なし');
          } else {
            DebugChatInjector.post('[出発時刻以降の在来特急を含む経路]\r\n' + routeDebugInfoAfterTarget);
          }
        }


        if (afterTargetRoutes.length > 0) {
          // 在来線特急がある場合の処理
          // 初期提案在来特急名称の導出
          // 1. 指定時間に合う在来線特急経路リストから、顧客が指定している時刻から45分以内のルートを検索
          let within45MinRoutes = afterTargetRoutes.filter(route => {
            const depTime = this.getDepartureTimeFromMito(route);
            const depMinutes = this.timeToMinutes(depTime);
            return depMinutes <= targetMinutes + 45;
          });


          //デバッグ：45分以内の経路をすべて列挙
          {
            const routeDebugInfo45Min = within45MinRoutes.map(route => {
              const jobanExpressLeg = route.jobanExpressLegs[0];
              const zairaiExpressLegs = this.getLastZairaiExpressLegs(route);
              const firstZairaiExpressLeg = zairaiExpressLegs?.[0];
              const lastZairaiExpressLeg = zairaiExpressLegs?.[zairaiExpressLegs.length - 1];
              const debugMsg = `・常磐線特急：${jobanExpressLeg.nickname}, ${jobanExpressLeg.from.name}|${jobanExpressLeg.from.time} -> ${jobanExpressLeg.to.name}|${jobanExpressLeg.to.time}` +
                `／在来線特急：${firstZairaiExpressLeg?.nickname || 'なし'}, ${firstZairaiExpressLeg?.from.name || 'なし'}|${firstZairaiExpressLeg?.from.time || 'なし'} -> ${lastZairaiExpressLeg?.to.name || 'なし'}|${lastZairaiExpressLeg?.to.time || 'なし'}`;
              return debugMsg;
            }).join('\r\n');

            //該当がなければ該当なしと出力する
            if (within45MinRoutes.length === 0) {
              DebugChatInjector.post('[45分以内の経路]\r\n該当なし');
            } else {
              DebugChatInjector.post('[45分以内の経路]\r\n' + routeDebugInfo45Min);
            }
          }

          if (within45MinRoutes.length === 0) {
            // 45分以内の経路がない場合は、在来線特急なしの処理に進む
            // console.log('出発時刻指定：45分以内の在来線特急経路なし');
            info.phase2_useZairaiButNotFound = true;//強制的に在来特急は利用しないとする
            info.phase2_useZairaiExpress = false;
          }
          //なければ、常磐線全体から引き直す
          if (within45MinRoutes.length === 0) {
            // 45分以内の経路がない場合は、常磐線全体から、45分以内の経路を検索しなおす
            // 指定している出発時刻以降に出発する経路を抽出
            const afterTargetRoutesJobanAllFiltered = [...afterTargetRoutesJobanAll].filter(route => {
              const depTime = this.getDepartureTimeFromMito(route);
              const depMinutes = this.timeToMinutes(depTime);
              return depMinutes >= targetMinutes;
            });

            // 希望時刻に最も近い出発時刻を見つける
            let minTimeDiff = Infinity;

            for (const route of afterTargetRoutesJobanAllFiltered) {
              const depTime = this.getDepartureTimeFromMito(route);
              const depMinutes = this.timeToMinutes(depTime);
              const timeDiff = Math.abs(depMinutes - targetMinutes);

              if (timeDiff < minTimeDiff) {
                minTimeDiff = timeDiff;
              }
            }

            // 最も近い出発時刻の経路群を抽出
            const closestRoutes = afterTargetRoutesJobanAllFiltered.filter(route => {
              const depTime = this.getDepartureTimeFromMito(route);
              const depMinutes = this.timeToMinutes(depTime);
              const timeDiff = Math.abs(depMinutes - targetMinutes);
              return timeDiff === minTimeDiff;
            });


            // その中で最も所要時間が小さい経路を1件抽出
            const within45MinRoutes2 = closestRoutes.length > 0 ?
              [closestRoutes.reduce((shortest, current) =>
                current.duration < shortest.duration ? current : shortest
              )] : [];

            //詰め替える
            within45MinRoutes = within45MinRoutes2 as any;
          }
          //其れでもなければ、時間を改めてもらえるようにする
          if (within45MinRoutes.length === 0) {
            nextActions.push('「ご指定の時間では、ご利用できる列車がございません。ご希望の出発または、時刻を改めて教えてください。」と出力');
            state.ticketInfo.currentPhase = TicketPhases.JOBAN_1;
            state.ticketInfo.ticketConfirmed = null;
            state.ticketInfo.phase2_timeSpecification = null;
            state.ticketInfo.phase2_timeSpecificationType = null;
            state.ticketInfo.phase2_specificTime = null;
            state.ticketInfo.phase2_useZairaiExpress = null;
            state.ticketInfo.proposedRoute = null;
            state.ticketInfo.proposedRouteOK = null;
            state.ticketInfo.proposedRouteRequest = null;
            DebugChatInjector.post(`[ConversationHooks] 常磐線特急有で、${destination}駅に、${targetTime}以降に出発する、経路一覧はありません。`);
            return;
            return;
          }
          {
            // 2. 最も早く目的地に到着するルートを抽出
            const fastestRoute = within45MinRoutes.reduce((fastest, current) => {
              const fastestArr = this.getArrivalTimeAtDestination(fastest, destination);
              const currentArr = this.getArrivalTimeAtDestination(current, destination);
              if (!fastestArr || !currentArr) return fastest;

              return this.timeToMinutes(currentArr) < this.timeToMinutes(fastestArr) ? current : fastest;
            });

            // 初期提案経路として設定
            // DebugChatInjector.post('[ConversationHooks] fastestRouteが、初期提案経路として設定されました。' + JSON.stringify(fastestRoute));
            info.proposedRoute = fastestRoute;

            // 初期提案経路（在来線含む）として保存
            info.initialProposedRouteWithZairai = fastestRoute;

            // 3. 最後に登場するisExpressがtrueのleg要素を取得
            const zairaiExpressLeg = this.getLastZairaiExpressLegs(fastestRoute);
            const firstZairaiExpressLeg = zairaiExpressLeg?.[0];
            const lastZairaiExpressLeg = zairaiExpressLeg?.[zairaiExpressLeg.length - 1];
            if (!zairaiExpressLeg) {
              //差し替えにより在来線がなくなった場合は、常磐線のみで案内する
              const msg = this.generateConfirmProposeRoute(info, fastestRoute, fastestRoute, true);
              nextActions.push(`「かしこまりました。それでは、${msg}」と出力`);
              return;
            }

            // 在来特急利用確認
            const zairaiExpressName = firstZairaiExpressLeg?.nickname || '在来線特急';
            info.zairaiExpressName = zairaiExpressName;
            info.zairaiExpressLeg = firstZairaiExpressLeg;
            info.initialProposedZairaiExpressSection = firstZairaiExpressLeg;
            // 在来特急種別（初期提案）の導出も即時に行う
            const initialCat = this.deriveZairaiExpressCategory(firstZairaiExpressLeg?.nickname || '');
            if (initialCat) {
              info.zairaiExpressCategory = initialCat;
            }
            DebugChatInjector.post('[初期提案経路]在来特急：' + firstZairaiExpressLeg?.nickname + '、方面：' + initialCat);
            // useZairaiExpressがnullの場合のみ質問する
            if (info.phase2_useZairaiExpress === null || info.phase2_useZairaiExpress === undefined) {
              // 在来特急利用確認中は、proposedRouteOKをリセットして誤抽出を防ぐ
              info.proposedRouteOK = null;
              nextActions.push(`「在来線の特急、${zairaiExpressName}は、利用しますか？」と出力`);
              // console.log('[ConversationHooks] Asking for Zairai Express confirmation:', zairaiExpressName);
              return;
            }
            else if (info.phase2_useZairaiExpress === true) {
              // 在来特急を利用する場合はここでreturnして、外側の処理に任せる
              // console.log('[ConversationHooks] Zairai Express confirmed in handleTimeSpecified');
              const zairaiInfo = `在来特急、${firstZairaiExpressLeg?.nickname || 'なし'}, ${firstZairaiExpressLeg?.from.name || 'なし'}|${firstZairaiExpressLeg?.from.time || 'なし'} -> ${lastZairaiExpressLeg?.to.name || 'なし'}|${lastZairaiExpressLeg?.to.time || 'なし'}`;
              DebugChatInjector.post('[ConversationHooks] -handleTimeSpcifiedで提案１-４５分以内の経路があり、在来特急を利用する');
              nextActions.push(`${zairaiInfo}の経路があります。こちらでよろしいですか？`);
              return;
            }
            else {
              //利用しないケース
            }
            // 在来特急を利用しない場合は、通常の常磐線特急のみの処理に進む
          }
        }
        // 在来線特急経路が0件の場合は、通常の常磐線特急のみの処理に進む
      }

      //初回提案の時に在来を含む経路がなければこちらに来る
      //時間を満たしている経路があるかを確認
      //指定した出発時刻以降のデータのみを抜き出す
      const validRoutes = info.jobanExpressRoutes.filter(route => {
        const departureTime = this.getDepartureTimeFromMito(route);
        if (!departureTime) return false;
        return this.timeToMinutes(departureTime) >= targetMinutes;
      });
      if (validRoutes.length === 0) {
        //時間を満たしている経路がなければ、時間を聞きなおす
        nextActions.push('「ご指定の時間では、ご利用できる列車がございません。ご希望の出発または、時刻を改めて教えてください。」と出力');
        state.ticketInfo.currentPhase = TicketPhases.JOBAN_1;
        state.ticketInfo.ticketConfirmed = null;
        state.ticketInfo.phase2_timeSpecification = null;
        state.ticketInfo.phase2_timeSpecificationType = null;
        state.ticketInfo.phase2_specificTime = null;
        state.ticketInfo.phase2_useZairaiExpress = null;
        state.ticketInfo.proposedRoute = null;
        state.ticketInfo.proposedRouteOK = null;
        state.ticketInfo.proposedRouteRequest = null;
        DebugChatInjector.post(`[ConversationHooks] 常磐線特急有で、${destination}駅に、${targetTime}までに到着する、経路一覧はありません。`);
        return;
      }

      // 時刻でソートして最も近い経路を見つける
      const sortedRoutes = [...validRoutes].sort((a, b) => {
        // 出発時刻指定の場合
        const aDeparture = this.getDepartureTimeFromMito(a);
        const bDeparture = this.getDepartureTimeFromMito(b);

        if (!aDeparture || !bDeparture) return 0;

        // 1. 出発時刻の昇順（早い順）、2. 到着時刻の昇順（早い順）で並べ替え
        const aMinutes = this.timeToMinutes(aDeparture);
        const bMinutes = this.timeToMinutes(bDeparture);

        // 出発時刻の昇順（早い順）でソート
        const departureComparison = aMinutes - bMinutes;
        if (departureComparison !== 0) {
          return departureComparison;
        }

        // 出発時刻が同じ場合は到着時刻の昇順（早い順）でソート
        const aArrivalMinutes = this.timeToMinutes(a.arrivalTime);
        const bArrivalMinutes = this.timeToMinutes(b.arrivalTime);
        return aArrivalMinutes - bArrivalMinutes;
      });

      if (sortedRoutes.length > 0) {

        //提案可能な経路一覧を出す
        const routeDebugInfo = sortedRoutes.map(route => {
          const jobanExpressLeg = route.jobanExpressLegs[0];
          const zairaiExpressLegs = this.getLastZairaiExpressLegs(route);
          const firstZairaiExpressLeg = zairaiExpressLegs?.[0];
          const lastZairaiExpressLeg = zairaiExpressLegs?.[zairaiExpressLegs.length - 1];

          const debugMsg = `水戸発：${route.departureTime}, ${info.destination}着：${route.arrivalTime}／ ・常磐線特急：${jobanExpressLeg.nickname}, ${jobanExpressLeg.from.name}|${jobanExpressLeg.from.time} -> ${jobanExpressLeg.to.name}|${jobanExpressLeg.to.time}` +
            `／在来線特急：${firstZairaiExpressLeg?.nickname || 'なし'}, ${firstZairaiExpressLeg?.from.name || 'なし'}|${firstZairaiExpressLeg?.from.time || 'なし'} -> ${lastZairaiExpressLeg?.to.name || 'なし'}|${lastZairaiExpressLeg?.to.time || 'なし'}`;
          return debugMsg;
        }).join('\r\n');
        let cmt = "";
        cmt = "出発時間指定の場合、指定時間以降で最も早い出発時間の経路から順に昇順"

        DebugChatInjector.post(`[ConversationHooks] 提案可能な経路一覧[${isArrivalTime ? '到着' : '出発'}指定${cmt})]：\r\n` + cmt + '\r\n' + routeDebugInfo);


        //指定時刻に一番近い出発時刻の経路を提案（最後の経路が一番近い）
        const proposedRoute = sortedRoutes[0];
        info.proposedRoute = proposedRoute;

        ConversationContextGenerator.synthesizeAndPlaySpeech("かしこまりました。一般的な、のりかえ時間と、経路で、お調べします。");
        const msg = this.generateConfirmProposeRoute(info, proposedRoute, proposedRoute, true);

        // 経路情報のフォーマット
        const routeInfo = `「${msg}」と出力`;
        DebugChatInjector.post('[ConversationHooks] -handleTimeSpcifiedで提案２');
        nextActions.push(routeInfo);
      }
      // 初回提案時の処理************************************************************
    } else {

      //提案経路有 （在来特急がある場合は、そもそも在来線を利用するかのタイミングで設定されている）

      // 既に提案済みの場合
      // proposedRouteOKとproposedRouteRequestはLLMが動的に抽出するので、ここでは判定しない

      if (info.proposedRouteOK === null || info.proposedRouteOK === undefined) {

        const proposedRoute = info.proposedRoute!;
        const msg = this.generateConfirmProposeRoute(info, proposedRoute, proposedRoute, true);
        // 経路情報のフォーマット
        const routeInfo = `「${msg}」と出力`;

        DebugChatInjector.post('[ConversationHooks] -handleTimeSpcifiedで提案３');
        nextActions.push(routeInfo);
      } else if (info.proposedRouteOK === false && info.proposedRouteRequest) {

        // NGの場合で要望がある場合、要望に基づいて再提案
        const selectedRoute = await this.proposeAlternativeRoute(info, state, heardItems, nextActions, isArrivalTime, info.proposedRoute!, info.jobanExpressRoutes!, info.proposedRouteRequest!);
        if (!selectedRoute) return;
        // 選択された経路を新しい提案経路として設定
        info.proposedRoute = selectedRoute as JobanExpressRoute;
        const msg = this.generateConfirmProposeRoute(info, info.proposedRoute!, info.proposedRoute!, true);
        DebugChatInjector.post('[ConversationHooks] -handleTimeSpecifiedで提案４');
        nextActions.push(`「${msg}」と出力`);

      } else if (info.proposedRouteOK === false && !info.proposedRouteRequest) {
        // NGの場合で要望がない場合、要望を聞く
        nextActions.push('ではもっと早い経路や、もっと遅い経路といった要望をお教えください');
      } else if (info.proposedRouteOK === true) {

        const stop = await this.executeAfterProposedRoute(nextActions, info.proposedRoute!, info.proposedRoute!, info);
        if (stop) return;
      }
    }
  }

  /**
   * 時刻指定の共通処理
   * @param isArrivalTime true: 到着時刻指定, false: 出発時刻指定
   */
  public static async handleTimeSpecifiedForArrival(
    info: TicketInformation,
    state: TicketSystemState,
    heardItems: string[],
    nextActions: string[],
    userMessage: string,
    isArrivalTime: boolean
  ): Promise<void> {
    // console.log("userMessage", userMessage)
    // 常磐線特急を含む経路が取得されているか確認
    if (!info.jobanExpressRoutes || info.jobanExpressRoutes.length === 0) {
      nextActions.push('経路データの取得が必要です');
      return;
    }

    console.log('userMessage', userMessage);

    DebugChatInjector.post('[handleTimeSpecifiedForArrivalに入りました] info.proposedRouteは、' + (info.proposedRoute === null ? 'なし' : 'あり'));
    // 初回提案時の処理
    if (!info.proposedRoute) {
      // 希望時刻に最も近い経路を探す
      const targetTime = info.phase2_specificTime!;
      const destination = info.destination!;

      // ★ここには、初期提案以降の出発 または 到着時のすべてのパターンが来る
      // 時刻でソートして最も近い経路を見つける
      // 到着時刻指定の場合、指定時刻以前に到着する経路のみを抽出
      const targetMinutes = this.timeToMinutes(targetTime);
      const validRoutes = info.jobanExpressRoutes.filter(route => {
        const arrivalTime = this.getArrivalTimeAtDestination(route, destination);
        if (!arrivalTime) return false;
        return this.timeToMinutes(arrivalTime) <= targetMinutes;
      });

      // 指定時刻に最も近い到着時間順でソート
      const sortedRoutes = [...validRoutes].sort((a, b) => {
        const aArrival = this.getArrivalTimeAtDestination(a, destination);
        const bArrival = this.getArrivalTimeAtDestination(b, destination);

        if (!aArrival || !bArrival) return 0;

        const aDiff = Math.abs(this.timeToMinutes(aArrival) - targetMinutes);
        const bDiff = Math.abs(this.timeToMinutes(bArrival) - targetMinutes);

        // まず指定時間に最も近い到着時間で比較
        if (aDiff !== bDiff) {
          return aDiff - bDiff;
        }

        // 到着時間の差が同じ場合は所要時間で比較（短い順）
        return a.duration - b.duration;
      });

      //一件もないときは時間指定からやり直しにする
      if (sortedRoutes.length === 0) {
        nextActions.push('「ご指定の時間では、ご利用できる列車がございません。ご希望の出発または、時刻を改めて教えてください。」と出力');
        state.ticketInfo.currentPhase = TicketPhases.JOBAN_1;
        state.ticketInfo.ticketConfirmed = null;
        state.ticketInfo.phase2_timeSpecification = null;
        state.ticketInfo.phase2_timeSpecificationType = null;
        state.ticketInfo.phase2_specificTime = null;
        state.ticketInfo.phase2_useZairaiExpress = null;
        state.ticketInfo.proposedRoute = null;
        state.ticketInfo.proposedRouteOK = null;
        state.ticketInfo.proposedRouteRequest = null;
        DebugChatInjector.post(`[ConversationHooks] 常磐線特急有で、${destination}駅に、${targetTime}までに到着する、経路一覧はありません。`);
        return;
      } else {

        //提案経路がない初回の提案経路を出す・常磐線・在来特急の提案経路情報を生成・出力
        DebugChatInjector.post('[ConversationHooks] -handleTimeSpcifiedForArrivalで提案２');
        info.proposedRoute = sortedRoutes[0];
        const msg = this.generateConfirmProposeRoute(info, sortedRoutes[0], sortedRoutes[0], true);
        nextActions.push(`「かしこまりました。それでは、${msg}」と出力`);
      }
    } else {

      // 既に提案済みの場合
      // proposedRouteOKとproposedRouteRequestはLLMが動的に抽出するので、ここでは判定しない

      if (info.proposedRouteOK === null || info.proposedRouteOK === undefined) {

        const proposedRoute = info.proposedRoute!;
        const msg = this.generateConfirmProposeRoute(info, proposedRoute, proposedRoute, true);

        // 経路情報のフォーマット
        const routeInfo = `「かしこまりました。それでは、${msg}」と出力。`;
        DebugChatInjector.post('[ConversationHooks] -handleTimeSpcifiedForArrivalで提案３');
        nextActions.push(routeInfo);

      } else if (info.proposedRouteOK === false && info.proposedRouteRequest) {

        // NGの場合で要望がある場合、要望に基づいて再提案
        const selectedRoute = await this.proposeAlternativeRoute(info, state, heardItems, nextActions, isArrivalTime, info.proposedRoute!, info.jobanExpressRoutes!, info.proposedRouteRequest!);
        if (!selectedRoute) {
          info.proposedRouteRequest = null;
          info.proposedRouteOK = false;
          return;
        }
        // 選択された経路を新しい提案経路として設定
        info.proposedRoute = selectedRoute as JobanExpressRoute;
        const msg = this.generateConfirmProposeRoute(info, info.proposedRoute!, info.proposedRoute!, true);
        DebugChatInjector.post('[ConversationHooks] -handleTimeSpcifiedForArrivalで提案５');
        nextActions.push(`「${msg}」と出力`);

      } else if (info.proposedRouteOK === false && !info.proposedRouteRequest) {
        // NGの場合で要望がない場合、要望を聞く
        nextActions.push('ではもっと早い経路や、もっと遅い経路といった要望をお教えください');

      } else if (info.proposedRouteOK === true) {
        //経路提案がOKなら、座席確認へ（到着時刻指定ケース）

        const stop = await this.executeAfterProposedRoute(nextActions, info.proposedRoute!, info.proposedRoute!, info);
        if (stop) return;
      }
    }
  }

  /**
   * 時刻指定の共通処理（新宿乗り換え）
   * @param isArrivalTime true: 到着時刻指定, false: 出発時刻指定
   */
  public static async handleTimeSpecifiedForZairaiFromShijuku(
    info: TicketInformation,
    state: TicketSystemState,
    heardItems: string[],
    nextActions: string[],
    userMessage: string,
  ): Promise<void> {

    console.log("userMessage", userMessage)
    // 新宿発の経路が取得されているか確認
    if (!info.zairaiSpecial_shinjukuRoutes || info.zairaiSpecial_shinjukuRoutes.length === 0) {
      nextActions.push('新宿からの在来特急経路データの取得が必要です');
      return;
    }
    const targetTime = info.zairaiSpecial_shinjukuDepartureTime!;
    const destination = info.destination!;

    //初回提案は、「targetTime」以降のルートの中で最も早く着くルートを抜き出す
    if (!info.zairaiSpecial_proposedRoute) {
      //targetTime以降のルートを抜き出す
      const targetTimeMinutes = this.timeToMinutes(targetTime);
      const targetRoutes = info.zairaiSpecial_shinjukuRoutes.filter(route => {
        const departureTime = this.getDepartureTimeFromMito(route);
        return this.timeToMinutes(departureTime!) >= targetTimeMinutes;
      });

      //ここで新宿発の経路がなければエラーにする
      if (targetRoutes.length === 0) {
        nextActions.push('「ご指定の時間では、ご利用できる列車がございません。乗り換えの時間をもっと短くしてください。」と出力');
        info.zairaiSpecial_proposedRouteOK = null;
        info.zairaiSpecial_proposedRouteRequest = null;
        info.zairaiSpecial_proposedRoute = null;
        info.zairaiSpecial_shinjukuDepartureTime = null;
        info.zairaiSpecial_transferMinutes = null;
        info.zairaiSpecial_shinjukuArrivalTime = null;
        info.zairaiSpecial_selectedRoute = null;
        info.zairaiSpecial_shinjukuRoutes = null;

        return;
      }

      //targetRoutesを、到着時刻でソートして、最も早く着くルートを抜き出す
      const sortedRoutes = targetRoutes.sort((a, b) => {
        const aArrival = this.getArrivalTimeAtDestination(a, destination);
        const bArrival = this.getArrivalTimeAtDestination(b, destination);
        return this.timeToMinutes(aArrival!) - this.timeToMinutes(bArrival!);
      });

      //利用可能経路一覧(targetRoutes)をデバッグに送る
      const availableRoutes = targetRoutes.map(route => {
        const jobanFirstLeg = info.proposedRoute!.jobanExpressLegs[0];
        const jobanLastLeg = info.proposedRoute!.jobanExpressLegs[info.proposedRoute!.jobanExpressLegs.length - 1];

        let msg = `常磐線特急：${jobanFirstLeg.nickname}に、${jobanFirstLeg.from.name}から、${jobanFirstLeg.from.time}に乗車、${info.phase2_jobanDropOffStation}駅に、${jobanLastLeg.to.time}に到着。`;

        //在来線の有無をチェック
        const zairaiLegs = this.getLastZairaiExpressLegs(route);
        const firstZairaiLeg = zairaiLegs?.[0];
        const lastZairaiLeg = zairaiLegs?.[zairaiLegs.length - 1];
        if (zairaiLegs) {
          msg += `在来特急：${firstZairaiLeg?.nickname || 'なし'}, ${firstZairaiLeg?.from.name || 'なし'}|${firstZairaiLeg?.from.time || 'なし'} -> ${lastZairaiLeg?.to.name || 'なし'}|${lastZairaiLeg?.to.time || 'なし'}`;
        } else {
          msg += `その他はすべて普通列車。`;
        }

        return msg;
      });
      DebugChatInjector.post('[ConversationHooks] 利用可能経路一覧：' + availableRoutes.join('\n'));

      info.zairaiSpecial_proposedRoute = sortedRoutes[0];
    }


    //初回確認の扱い
    if (info.zairaiSpecial_proposedRouteOK === null || info.zairaiSpecial_proposedRouteOK === undefined) {
      // まだ確認が取れていない
      const msg = this.generateConfirmProposeRoute(info, info.proposedRoute!, info.zairaiSpecial_proposedRoute!, false);
      nextActions.push(`「かしこまりました。それでは、${msg}」と出力`);
      return;
    }

    //変更要求がある場合
    if (info.zairaiSpecial_proposedRouteOK === false && info.zairaiSpecial_proposedRouteRequest) {
      // NGの場合で要望がある場合、要望に基づいて再提案
      // 代替の提案をここでする
      let selectedRoute = await this.proposeAlternativeRoute(info, state, heardItems, nextActions, false,
        info.zairaiSpecial_proposedRoute!, info.zairaiSpecial_shinjukuRoutes!, info.zairaiSpecial_proposedRouteRequest!);
      if (selectedRoute && this.timeToMinutes(selectedRoute.departureTime) < this.timeToMinutes(info.zairaiSpecial_shinjukuDepartureTime!)) {
        nextActions.push(`「ご要望にあわせておしらべいたしますと、新宿到着時刻が、${info.zairaiSpecial_shinjukuArrivalTime}、
新宿での乗り換え時間が、${info.zairaiSpecial_transferMinutes}分、あけますと、新宿を出発可能なお時間は、${info.zairaiSpecial_shinjukuDepartureTime}となります。
先ほどのご提案の経路でよろしいですか？`);
        selectedRoute = null;
      }
      if (!selectedRoute) return;
      // 選択された経路を新しい提案経路として設定
      info.zairaiSpecial_proposedRoute = selectedRoute as Route;
      const msg = this.generateConfirmProposeRoute(info, info.proposedRoute!, info.zairaiSpecial_proposedRoute!, false);
      nextActions.push(`「かしこまりました。それでは、${msg}」と出力`);
      return;
    } else if (info.zairaiSpecial_proposedRouteOK === false && !info.zairaiSpecial_proposedRouteRequest) {
      // NGの場合で要望がない場合、要望を聞く
      nextActions.push('ではもっと早い経路や、もっと遅い経路といった要望をお教えください');
    } else if (info.zairaiSpecial_proposedRouteOK === true) {

      const stop = await this.executeAfterProposedRoute(nextActions, info.proposedRoute!, info.zairaiSpecial_proposedRoute!, info);
      if (stop) return;
    }
  }

  /**
   * 代替経路の提案
   * @param isArrivalTime true: 到着時刻指定, false: 出発時刻指定
   */
  private static async proposeAlternativeRoute(
    info: TicketInformation,
    state: TicketSystemState,
    heardItems: string[],
    nextActions: string[],
    isArrivalTime: boolean,
    proposedRoute: Route,
    expressRoutes: Route[],
    proposedRouteRequest: string
  ): Promise<Route | null> {
    console.log("state", state)
    console.log("heardItems", heardItems)
    if (!proposedRoute || !expressRoutes) return null;

    const currentDeparture = this.getDepartureTimeFromMito(proposedRoute);
    const currentArrival = this.getArrivalTimeAtDestination(proposedRoute, info.destination!);
    DebugChatInjector.post('[ConversationHooks] -proposeAlternativeRouteで代替経路の検索開始');

    // 常磐線特急を含む経路が10件以上の場合、範囲フィルタリングを適用
    const filteredRoutes = expressRoutes;

    let hayaiRoutes: Route[] = [];
    let osoiRoutes: Route[] = [];

    // 1. 早い経路の絞り込み（到着時刻が現在の提案経路より早い経路）
    const currentArrMinutes = this.timeToMinutes(currentArrival!);
    const currentDepMinutes = this.timeToMinutes(currentDeparture);

    // 到着時刻が現在の提案経路より早い経路を抽出
    const earlierArrivalRoutes = filteredRoutes.filter(route => {
      const routeDep = this.getDepartureTimeFromMito(route);
      const routeArr = this.getArrivalTimeAtDestination(route, info.destination!);
      if (!routeDep || !routeArr) return false;

      const routeDepMinutes = this.timeToMinutes(routeDep);
      const routeArrMinutes = this.timeToMinutes(routeArr);

      // 現在提案している経路とIDが同じ場合は残す（比較のため）
      if (route.id === proposedRoute.id) {
        return true;
      }

      // 出発・到着時刻が全く同じ場合は除外
      if (routeDepMinutes === currentDepMinutes && routeArrMinutes === currentArrMinutes) {
        return false;
      }

      // 到着時刻が現在の提案経路より早い経路のみ
      return routeArrMinutes < currentArrMinutes;
    });

    // 出発時刻昇順 → 所要時間昇順でソート
    const sortedEarlierRoutes = earlierArrivalRoutes.sort((a, b) => {
      const aDep = this.getDepartureTimeFromMito(a);
      const bDep = this.getDepartureTimeFromMito(b);
      const aDepMinutes = this.timeToMinutes(aDep);
      const bDepMinutes = this.timeToMinutes(bDep);

      // まず出発時刻で比較
      if (aDepMinutes !== bDepMinutes) {
        return aDepMinutes - bDepMinutes;
      }

      // 出発時刻が同じ場合は所要時間で比較
      if (a.duration !== b.duration) {
        return a.duration - b.duration;
      }

      return 0;
    });

    // 現在の経路のインデックスを確認し、その1つ前の要素を「早い経路」とする
    const currentRouteIndexInEarlier = sortedEarlierRoutes.findIndex(route => route.id === proposedRoute.id);
    if (currentRouteIndexInEarlier > 0) {
      hayaiRoutes = [sortedEarlierRoutes[currentRouteIndexInEarlier - 1]];
    }

    // 2. 遅い経路の絞り込み（出発時刻が現在の提案経路より遅い経路）
    // 出発時刻が現在の提案経路より遅い経路を抽出
    const laterDepartureRoutes = filteredRoutes.filter(route => {
      const routeDep = this.getDepartureTimeFromMito(route);
      const routeArr = this.getArrivalTimeAtDestination(route, info.destination!);
      if (!routeDep || !routeArr) return false;

      const routeDepMinutes = this.timeToMinutes(routeDep);
      const routeArrMinutes = this.timeToMinutes(routeArr);

      // 現在提案している経路とIDが同じ場合は残す（比較のため）
      if (route.id === proposedRoute.id) {
        return true;
      }

      // 出発・到着時刻が全く同じ場合は除外
      if (routeDepMinutes === currentDepMinutes && routeArrMinutes === currentArrMinutes) {
        return false;
      }

      // 出発時刻が現在の提案経路より遅い経路のみ
      return routeDepMinutes > currentDepMinutes;
    });

    // 出発時刻昇順 → 所要時間昇順でソート
    const sortedLaterRoutes = laterDepartureRoutes.sort((a, b) => {
      const aDep = this.getDepartureTimeFromMito(a);
      const bDep = this.getDepartureTimeFromMito(b);
      const aDepMinutes = this.timeToMinutes(aDep);
      const bDepMinutes = this.timeToMinutes(bDep);

      // まず出発時刻で比較
      if (aDepMinutes !== bDepMinutes) {
        return aDepMinutes - bDepMinutes;
      }

      // 出発時刻が同じ場合は所要時間で比較
      if (a.duration !== b.duration) {
        return a.duration - b.duration;
      }

      return 0;
    });

    // 現在の経路のインデックスを確認し、その1つ後の要素を「遅い経路」とする
    const currentRouteIndexInLater = sortedLaterRoutes.findIndex(route => route.id === proposedRoute.id);
    if (currentRouteIndexInLater !== -1 && currentRouteIndexInLater < sortedLaterRoutes.length - 1) {
      osoiRoutes = [sortedLaterRoutes[currentRouteIndexInLater + 1]];
    }

    // 代替経路が存在しない場合の処理
    if (hayaiRoutes.length === 0 && osoiRoutes.length === 0) {
      nextActions.push('申し訳ございません。ご希望の条件では、現在ご提案しているご要望に即した経路はございません。早い、遅いといったご要望をもう一度お教えいただけますか？それとも先ほどのご提案でよろしいでしょうか？');
      return null;
    }

    // LLMに渡して最適経路を選定
    if (filteredRoutes.length > 0) {
      // 到着時刻順にソート
      const sortedRoutes = filteredRoutes.sort((a, b) => {
        const aArr = this.getArrivalTimeAtDestination(a, info.destination!);
        const bArr = this.getArrivalTimeAtDestination(b, info.destination!);
        return this.timeToMinutes(aArr!) - this.timeToMinutes(bArr!);
      });

      // 現在の提案経路の情報
      const currentRouteDep = this.getDepartureTimeFromMito(proposedRoute!);
      const currentRouteArr = this.getArrivalTimeAtDestination(proposedRoute!, info.destination!);
      const currentRouteSection = this.getJobanExpressSection(proposedRoute! as JobanExpressRoute);

      // 提案可能な経路のリスト
      const createRouteOptionsList = (routes: Route[]) => {
        return routes.map(route => {
          const dep = this.getDepartureTimeFromMito(route);
          const arr = this.getArrivalTimeAtDestination(route, info.destination!);

          // 常磐線特急の乗車・降車情報を取得
          // const jobanExpressSection = this.getJobanExpressSection(route);
          let jobanExpressInfo = '';
          let zairaiExpressInfo = '';

          // 常磐線特急の詳細情報を取得
          if (route.legs) {
            for (const leg of route.legs) {
              if (leg.isExpress && leg.senkuName && leg.senkuName.includes('常磐線')) {
                if (!jobanExpressInfo) {
                  jobanExpressInfo = `常磐線特急の乗車駅：${leg.from.name}、乗車時間：${leg.from.time}、降車駅：${leg.to.name}、降車時間：${leg.to.time}`;
                }
              }
            }

            // 最後のlegが常磐線以外の特急かチェック
            const lastLeg = route.legs[route.legs.length - 1];
            if (lastLeg.isExpress && lastLeg.senkuName && !lastLeg.senkuName.includes('常磐線')) {
              zairaiExpressInfo = `、在来特急「${lastLeg.nickname || lastLeg.senkuName}」${lastLeg.from.name}→${lastLeg.to.name}`;
            }
          }

          return `水戸${dep}発、${info.destination}${arr}着、${jobanExpressInfo}${zairaiExpressInfo}`;
        });
      }
      const routeOptionsListHayai = createRouteOptionsList(hayaiRoutes);
      const routeOptionsListOsoi = createRouteOptionsList(osoiRoutes);

      ConversationContextGenerator.synthesizeAndPlaySpeech('お調べしますので少々お待ちください。');
      // LLMプロンプトの作成
      const llmPrompt = `現在提案しているJRの経路に対して顧客の要望に即した経路を特定しなさい。
${!isArrivalTime ? '※出発時刻指定のため、指定時刻以降の経路から選択してください。' : ''}

#ユーザーの発言
${proposedRouteRequest}

#現在提案している経路
水戸${currentRouteDep}発、${info.destination}${currentRouteArr}着、${currentRouteSection}

#早い時間を要求する場合の提案可能な経路（現在提案している経路より早い。ユーザーの発言が「現在の提案経路よりも早い経路を希望している場合はこちらから選択」）
${routeOptionsListHayai.map(route => `・${route}`).join('\n')}

#遅い時間を要求する場合の提案可能な経路（現在提案している経路より遅い。ユーザーの発言が「現在の提案経路よりも遅い経路を希望している場合はこちらから選択」）
${routeOptionsListOsoi.map(route => `・${route}`).join('\n')}

#出力フォーマット：
<該当なし>true/false</該当なし>
<出発時刻>XX:XX</出発時刻>
<到着時刻>YY:YY</到着時刻>
<選択理由>なぜその便を選んだのか明確な理由を（その他の候補で近いものを選ばなかった理由も）</選択理由>

#注意：
・現在提案している経路の途中駅や降車駅は考慮せずに、ユーザーの発言に対して時間指定に最適な経路を1つ選び、その出発時刻と到着時刻を「出発時刻:XX:XX,到着時刻:YY:YY」の形式で回答してください。
・遅い・早いに対して「もうちょっと」などの表現がある場合は、一番遅い・一番早いではなく、現在提案の次に遅い・次に早いという概念です。`;

      // コンソールにLLMプロンプトを出力
      console.log('[ConversationContextGenerator] LLM Prompt:', llmPrompt);
      // console.log('[ConversationContextGenerator] Route Options:', routeOptionsList);
      DebugChatInjector.post('[ConversationContextGenerator] 代替経路検索プロンプト:\r\n' + llmPrompt);

      // Azure OpenAIを使って最適経路を選定
      let selectedRoute = sortedRoutes[0]; // デフォルト

      // Azure OpenAIサービスの初期化
      await this.initializeService();

      if (this.azureOpenAIService && this.isInitialized) {
        const MAX_RETRIES = 5;
        let retryCount = 0;
        let llmSuccess = false;

        while (retryCount <= MAX_RETRIES && !llmSuccess) {
          try {
            const messages: ChatMessage[] = [
              {
                role: 'system',
                content: 'あなたはJRの経路選定アシスタントです。ユーザーの要望に基づいて最適な経路を1つ選んでください。必ず指定された出力フォーマットに従って回答してください。'
              },
              {
                role: 'user',
                content: llmPrompt
              }
            ];

            const response = await this.azureOpenAIService.sendMessage(messages);
            console.log('[ConversationContextGenerator] LLM Response (attempt ' + (retryCount + 1) + '):', response);

            // 新しいフォーマットから値を抽出
            const noMatch = response.match(/<該当なし>(true|false)<\/該当なし>/);
            const depTimeMatch = response.match(/<出発時刻>(\d{1,2}:\d{2})<\/出発時刻>/);
            const arrTimeMatch = response.match(/<到着時刻>(\d{1,2}:\d{2})<\/到着時刻>/);
            const reasonMatch = response.match(/<選択理由>([\s\S]*?)<\/選択理由>/);

            if (noMatch && noMatch[1] === 'true') {
              llmSuccess = true;
              nextActions.push('申し訳ございません。ご希望の条件では、現在ご提案しているご要望に即した経路はございません。早い、遅いといったご要望をもう一度お教えいただけますか？それとも先ほどのご提案でよろしいでしょうか？');
              return null;
            }

            if (depTimeMatch && arrTimeMatch) {
              const selectedDepTime = depTimeMatch[1];
              const selectedArrTime = arrTimeMatch[1];
              const selectionReason = reasonMatch ? reasonMatch[1].trim() : '';

              console.log('[ConversationContextGenerator] Extracted times:', {
                departure: selectedDepTime,
                arrival: selectedArrTime,
                reason: selectionReason
              });

              // 時刻が一致する経路を探す
              const matchedRoute = sortedRoutes.find(route => {
                const dep = this.getDepartureTimeFromMito(route);
                const arr = this.getArrivalTimeAtDestination(route, info.destination!);
                return dep === selectedDepTime && arr === selectedArrTime;
              });

              if (matchedRoute) {
                selectedRoute = matchedRoute;
                llmSuccess = true;
                DebugChatInjector.post(`[ConversationContextGenerator] LLMにより、新しい提案経路が選択されました。
[変更前経路の時刻]
・出発時刻：${currentRouteDep}
・到着時刻：${currentRouteArr}
-----------------------------
[変更後経路の時刻]
・出発時刻：${selectedDepTime}
・到着時刻：${selectedArrTime}
-----------------------------
・選択理由：${selectionReason}`);
                console.log('[ConversationContextGenerator] Selected route by LLM:', {
                  departure: selectedDepTime,
                  arrival: selectedArrTime,
                  reason: selectionReason
                });

                // 選択理由を保存（必要に応じて後で使用）
                if (selectedRoute && selectionReason) {
                  (selectedRoute as any).selectionReason = selectionReason;
                }
              } else {
                // LLMの応答が時刻を返したが、一致する経路が見つからない場合
                console.warn('[ConversationContextGenerator] No matching route found for LLM response, retrying...');
                retryCount++;
                if (retryCount > MAX_RETRIES) {
                  nextActions.push('申し訳ございません。現在、OpenAIのサービスが不安定です。後ほど改めてください。');
                  console.error('[ConversationContextGenerator] Max retries reached, using fallback');
                  return null;
                }
              }
            } else {
              // フォーマットが正しくない場合はリトライ
              console.warn('[ConversationContextGenerator] Response format incorrect, retrying...', {
                hasDepTime: !!depTimeMatch,
                hasArrTime: !!arrTimeMatch
              });
              retryCount++;
              if (retryCount > MAX_RETRIES) {
                console.error('[ConversationContextGenerator] Max retries reached for format issues, using fallback');
                nextActions.push('申し訳ございません。現在、OpenAIのサービスが不安定です。後ほど改めてください。');
                console.error('[ConversationContextGenerator] Max retries reached, using fallback');
                return null;
              }
            }
          } catch (error) {
            console.error('[ConversationContextGenerator] LLM call failed (attempt ' + (retryCount + 1) + '):', error);
            retryCount++;
            if (retryCount > MAX_RETRIES) {
              console.error('[ConversationContextGenerator] Max retries reached due to errors, using fallback');
              nextActions.push('申し訳ございません。現在、OpenAIのサービスが不安定です。後ほど改めてください。');
              return null;
            }
          }
        }
      } else {
        console.warn('[ConversationContextGenerator] Azure OpenAI service not initialized, using fallback logic');
        nextActions.push('申し訳ございません。現在、OpenAIのサービスが不安定です。後ほど改めてください。');
        return null;
      }

      return selectedRoute;

    } else {
      DebugChatInjector.post('[ConversationHooks] -proposeAlternativeRouteで該当経路無し');
      nextActions.push('ご希望に合う経路が見つかりませんでした');
      return null;
    }
  }

  /**
   * 水戸からの出発時刻を取得
   */
  private static getDepartureTimeFromMito(route: Route): string {
    // Route全体の出発時刻を使用し、秒を削除
    const time = route.departureTime || '';
    // HH:MM:SS形式からHH:MM形式に変換
    const match = time.match(/^(\d{1,2}:\d{2})(:\d{2})?$/);
    return match ? match[1] : time;
  }

  /**
   * 指定駅への到着時刻を取得
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private static getArrivalTimeAtDestination(route: Route, _destination: string): string | null {
    // console.log("destination", destination);
    // Route全体の到着時刻を使用し、秒を削除
    const time = route.arrivalTime || null;
    if (!time) return null;
    // HH:MM:SS形式からHH:MM形式に変換
    const match = time.match(/^(\d{1,2}:\d{2})(:\d{2})?$/);
    return match ? match[1] : time;
  }

  // 在来特急特殊ケースで使用するユーティリティ（定義は末尾に重複あり）

  public static hasJobanExpressLeg(route: JobanExpressRoute): boolean {
    if (!route.jobanExpressLegs) return false;
    return route.jobanExpressLegs.length > 0;
  }

  public static hasZairaiExpressLeg(route: Route): boolean {
    const zairaiLastLegs = this.getLastZairaiExpressLegs(route);
    return zairaiLastLegs !== null;
  }

  /**
   * 常磐線特急区間の説明を取得
   */
  private static getJobanExpressSection(route: JobanExpressRoute): string {
    if (route.jobanExpressLegs && route.jobanExpressLegs.length > 0) {
      const leg = route.jobanExpressLegs[0];
      const depStation = leg.from?.name || '不明';
      const arrStation = leg.to?.name || '不明';
      const depTimeRaw = leg.from?.time || '';
      const arrTimeRaw = leg.to?.time || '';
      const trainName = leg.nickname || '特急';

      // HH:MM:SS形式からHH:MM形式に変換
      const depMatch = depTimeRaw.match(/^(\d{1,2}:\d{2})(:\d{2})?$/);
      const arrMatch = arrTimeRaw.match(/^(\d{1,2}:\d{2})(:\d{2})?$/);
      const depTime = depMatch ? depMatch[1] : depTimeRaw;
      const arrTime = arrMatch ? arrMatch[1] : arrTimeRaw;

      return `${depStation}${depTime}、特急${trainName}に乗車、${arrStation}駅に${arrTime}に降車`;
    }

    if (route.jobanExpressLegsRouteExplain) {
      return route.jobanExpressLegsRouteExplain;
    }

    if (route.jobanExpressLegs && route.jobanExpressLegs.length > 0) {
      const leg = route.jobanExpressLegs[0];
      // RouteLegのプロパティを正しく参照
      const depStation = leg.from?.name || '不明';
      const arrStation = leg.to?.name || '不明';
      const depTime = (leg.from?.time || '不明').replace(/:00$/, '');
      const arrTime = (leg.to?.time || '不明').replace(/:00$/, '');
      return `常磐線特急（${depStation}→${arrStation}）・${depTime}発・${arrTime}着`;
    }

    return '常磐線特急';
  }

  /**
   * 最後にisExpressがtrueのlegを取得
   */
  public static getLastZairaiExpressLegs(route: Route, needExpress: boolean = true): RouteLeg[] | null {
    if (!route?.legs) return null;

    // seqでソートして、isExpressがtrueのものを逆順で検索
    const sortedLegs = [...route.legs].sort((a, b) => (a.seq || 0) - (b.seq || 0));
    const zairaiExpressLegs: RouteLeg[] = [];

    for (let i = sortedLegs.length - 1; i >= 0; i--) {
      if (needExpress) {
        if (sortedLegs[i].isExpress === true && sortedLegs[i].senkuName !== '常磐線') {
          // to.directFlagが"0"の在来特急降車駅を見つけた場合
          if (sortedLegs[i].to.directFlag === "0") {
            // この要素を追加
            zairaiExpressLegs.push(sortedLegs[i]);

            // from.directFlagが"0"でなければ、前の要素も探す
            if (sortedLegs[i].from.directFlag !== "0") {
              // 現在の要素より前のseqを持つ要素を逆順で探す
              for (let j = i - 1; j >= 0; j--) {
                if (sortedLegs[j].isExpress === true && sortedLegs[j].senkuName !== '常磐線') {
                  // 先頭に追加
                  zairaiExpressLegs.unshift(sortedLegs[j]);

                  // from.directFlagが"0"になったら終了
                  if (sortedLegs[j].from.directFlag === "0") {
                    break;
                  }
                }
              }
            }
            return zairaiExpressLegs;
          }
        }
      } else {
        zairaiExpressLegs.push(sortedLegs[i]);
        return zairaiExpressLegs;
      }
    }
    return null;
  }

  /** 在来特急種別を導出（分岐用／表示用） */
  private static deriveZairaiExpressCategory(trainNameRaw: string): string | null {
    const name = (trainNameRaw || '').toLowerCase();
    const includesAny = (arr: string[]) => arr.some(k => name.includes(k.toLowerCase()));
    if (includesAny(['あずさ', 'かいじ'])) return '中央線';
    if (includesAny(['踊り子', '湘南', 'サフィール踊り子'])) return '東海道線';
    if (includesAny(['成田エクスプレス', 'しおさい', 'わかしお', 'さざなみ'])) return '千葉方面';
    if (includesAny(['草津・四万', 'きぬがわ', 'スペーシア日光'])) return '永野日光';
    return null;
  }

  /**
   * 時刻を分に変換
   */
  private static timeToMinutes(time: string): number {
    const match = time.match(/(\d{1,2}):(\d{2})/);
    if (!match) return 0;

    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);

    return hours * 60 + minutes;
  }
  /**
   * 現在のフェーズの説明を取得
   */
  private static getPhaseDescription(phase: TicketPhases): string {
    const phaseDescriptions: Record<TicketPhases, string> = {
      [TicketPhases.BASIC_INFO]: '基本情報ヒアリング',
      [TicketPhases.JOBAN_1]: '常磐線特急利用確認',
      [TicketPhases.ROUTE_SEARCH]: '経路検索',
      [TicketPhases.SEAT_UNSPECIFIED]: '座席未指定利用ヒアリング',
      [TicketPhases.ARRIVAL_TIME_SPECIFIED]: '到着時刻指定',
      [TicketPhases.DEPARTURE_TIME_SPECIFIED]: '出発時刻指定',
      [TicketPhases.JOBAN_PHASE_2]: '常磐線フェーズ２',
      [TicketPhases.ZAIRAI_SPECIAL_CASE]: '在来特急特殊ケース',
      [TicketPhases.TICKET_CONFIRMATION]: '発券内容確認',
      [TicketPhases.SEAT_SELECTION]: '',
      [TicketPhases.PAYMENT]: '',
      [TicketPhases.CONFIRMATION]: ''
    };
    return phaseDescriptions[phase] || phase;
  }

  /**
   * 抽出済み項目の要約を生成
   */
  private static generateExtractedItemsSummary(state: TicketSystemState): string {
    const info = state.ticketInfo;
    const items: string[] = [];

    // 基本情報
    if (info.destination) items.push(`行先: ${info.destination}`);
    if (info.travelDate) items.push(`利用日: ${info.travelDate}`);
    if (info.adultCount !== null) items.push(`大人: ${info.adultCount}名`);
    if (info.childCount !== null) items.push(`子供: ${info.childCount}名`);

    // フェーズ2の情報
    if (info.phase2_jobanExpressUse !== null) {
      items.push(`常磐線特急利用: ${info.phase2_jobanExpressUse ? 'あり' : 'なし'}`);
    }
    if (info.phase2_timeSpecification !== null) {
      items.push(`時間指定: ${info.phase2_timeSpecification ? 'あり' : 'なし'}`);
    }
    if (info.phase2_timeSpecificationType) {
      items.push(`時間指定タイプ: ${info.phase2_timeSpecificationType === 'start' ? '出発時刻' : '到着時刻'}`);
    }
    if (info.phase2_specificTime) {
      items.push(`指定時刻: ${info.phase2_specificTime}`);
    }

    // 経路情報
    if (info.routes && info.routes.length > 0) {
      items.push(`検索済み経路数: ${info.routes.length}件`);
    }
    if (info.jobanExpressRoutes && info.jobanExpressRoutes.length > 0) {
      items.push(`常磐線特急経路: ${info.jobanExpressRoutes.length}件`);
    }
    if (info.jobanZairaiExpressRoutes && info.jobanZairaiExpressRoutes.length > 0) {
      items.push(`常磐線+在来線特急経路: ${info.jobanZairaiExpressRoutes.length}件`);
    }

    return items.join('、');
  }

  /**
   * 会話コンテキストメッセージを生成
   * @param state 現在のチケットシステムの状態
   * @param includePhase フェーズ情報を含めるか
   * @param includeExtracted 抽出済み項目を含めるか
   * @returns コンテキストメッセージ
   */
  static generateContextMessage(
    state: TicketSystemState,
    includePhase: boolean = true,
    includeExtracted: boolean = true
  ): string {
    const parts: string[] = [];

    // 現在のフェーズ
    if (includePhase) {
      const phaseDesc = this.getPhaseDescription(state.ticketInfo.currentPhase);
      parts.push(`【現在のフェーズ】${phaseDesc}`);
    }

    // 抽出済み項目
    if (includeExtracted) {
      const extractedSummary = this.generateExtractedItemsSummary(state);
      if (extractedSummary) {
        // parts.push(`【確認済み項目】${extractedSummary}`);
      }
    }

    return parts.join(' ');
  }
}