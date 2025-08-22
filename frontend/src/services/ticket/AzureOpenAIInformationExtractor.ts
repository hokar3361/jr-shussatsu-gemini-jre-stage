import { TicketPhases } from './types';
import type { HearingItemDefinition, /* HearingRuleContext */ } from './schema/SchemaTypes';
import type {
  TicketInformation,
  ExtractionRequest,
  // ExtractionResponse,
  HearingItem,
  JobanExpressRoute,
  // PhaseConfig
} from './types';
// import { PromptManager } from './PromptManager';
import { AzureOpenAIService } from '../azure/azureOpenAIService';
import type { ChatMessage } from '../azure/types';
import { ConfigManager } from '../../config/ConfigManager';
// import { HearingRuleEngine } from './schema/HearingRules';
import { PromptBuilder } from './schema/PromptBuilder';
import { ExtractionMapper } from './schema/ExtractionMapper';
import { Hearing, /* HearingItems */ } from './schema/HearingItems';
// import { DebugChatInjector } from '../communication/DebugChatInjector';
import type { ISpeechSynthesisService } from '../communication/ISpeechSynthesisService';
import { DebugChatInjector } from '../communication/DebugChatInjector';
import { ConversationContextGenerator } from '../conversation/ConversationHooks';
import { TicketSystemManager } from './TicketSystemManager';
import { StationNameNormalizer } from './StationNameNormalizer';
import type { Route } from '../cosmos/types';

export class AzureOpenAIInformationExtractor {
  private azureOpenAIService: AzureOpenAIService | null = null;
  private isInitialized = false;
  private speechSynthesisService: ISpeechSynthesisService | null = null;

  constructor() {
    this.initializeService();
  }

  private async initializeService() {
    const azureConfig = ConfigManager.getInstance().getAzureConfig();

    if (!azureConfig) {
      console.warn('[AzureOpenAIInformationExtractor] Configuration not available yet. Will retry on next extraction.');
      return;
    }

    const apiKey = azureConfig.openAIApiKey;
    const endpoint = azureConfig.openAIEndpoint;
    const deployment = azureConfig.openAIDeploymentGpt4o || 'gpt-4o'; // Issue要件に従いgpt-4oを使用

    if (!apiKey || !endpoint) {
      console.warn('[AzureOpenAIInformationExtractor] Azure OpenAI credentials not found. Information extraction will be disabled.');
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
      // console.log('[AzureOpenAIInformationExtractor] Service initialized successfully');
    } catch (error) {
      console.error('[AzureOpenAIInformationExtractor] Failed to initialize:', error);
    }
  }

  isNotNullAndUndefined = (value: any) => value !== null && value !== undefined;

  /**
   * 音声合成サービスを設定
   * @param service 音声合成サービス
   */
  setSpeechSynthesisService(service: ISpeechSynthesisService | null): void {
    this.speechSynthesisService = service;
  }

  /**
   * 音声合成サービスを取得
   * @returns 音声合成サービス（設定されていない場合はnull）
   */
  getSpeechSynthesisService(): ISpeechSynthesisService | null {
    return this.speechSynthesisService;
  }

  async executeAfterProposedRoute(proposedRouteJoban: JobanExpressRoute,
    proposedRouteZairai: Route, currentStateTicketInfo: TicketInformation, schemaItems: any, request: ExtractionRequest):
    Promise<Partial<TicketInformation>> {

    //常磐線特急があるなら座席を聞く
    const hasJobanExpressLeg = ConversationContextGenerator.hasJobanExpressLeg(proposedRouteJoban!);
    if (hasJobanExpressLeg && !this.isNotNullAndUndefined(currentStateTicketInfo.jobanExpressSeatInfo)) {
      schemaItems.push(Hearing.confirmation.jobanExpressSeatInfo);
      return await this.extractInfoWithLLM(request, schemaItems);
    }

    //在来特急があるなら座席を聞く - 明確に在来使うとなっている場合のみ
    const hasZairaiExpressLeg = ConversationContextGenerator.hasZairaiExpressLeg(proposedRouteZairai!);
    if (hasZairaiExpressLeg && !this.isNotNullAndUndefined(currentStateTicketInfo.zairaiExpressSeatInfo)
      && (currentStateTicketInfo.phase2_useZairaiExpress || currentStateTicketInfo.phase2_timeSpecificationType === "stop")) {
      schemaItems.push(Hearing.confirmation.zairaiExpressSeatInfo);
      return await this.extractInfoWithLLM(request, schemaItems);
    }

    //--[最終]常磐線特急を利用する-新宿時間指定乗り換えOK => 常磐線は座席を聞く＋在来はあれば座席を聞く
    if (!this.isNotNullAndUndefined(currentStateTicketInfo.ticketConfirmed)) {
      schemaItems.push(Hearing.confirmation.ticketConfirmed);
      return await this.extractInfoWithLLM(request, schemaItems);
    }
    throw new Error('Invalid state');
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
      console.warn('[AzureOpenAIInformationExtractor] Speech synthesis service not available');
    }
  }
  async extractInfoWithLLM(request: ExtractionRequest, schemaItems: any): Promise<Partial<TicketInformation>> {

    const prompt = PromptBuilder.buildExtractionPrompt(request.conversationHistory, request.lastUserMessage, schemaItems);
    console.log("[Azure Extractor]prompt", prompt)
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: 'あなたは会話内容から情報を正確に抽出するアシスタントです。JSON形式で回答してください。'
      },
      {
        role: 'user',
        content: prompt
      }
    ];

    // DebugChatInjector.post('[AzureExtractor] 情報抽出プロンプト送信');
    const response = await this.azureOpenAIService?.sendMessageGPT5(messages);
    // DebugChatInjector.post(`[AzureExtractor] 応答受信: ${(response || '').slice(0, 120)}${(response || '').length > 120 ? '…' : ''}`);
    let extractedInfo: Partial<TicketInformation> = {};
    try {
      // スキーマ駆動でパース
      let jsonStr = response;
      const jsonMatch = response?.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      } else {
        const objectMatch = response?.match(/\{[\s\S]*\}/);
        if (objectMatch) {
          jsonStr = objectMatch[0];
        }
      }
      const parsed: any = JSON.parse(jsonStr || '{}');
      //canExtractFromLastUserMessageがfalseの場合は、何も抽出しない
      if (parsed.canExtractFromLastUserMessage === false) {
        return {};
      }
      extractedInfo = ExtractionMapper.mapJsonToTicketInfo(parsed, schemaItems as any);
      if (extractedInfo.travelDate) {
        extractedInfo.travelDate = this.normalizeDate(extractedInfo.travelDate as string);
      }
      //extractedInfoにdestinationが含まれている場合、末尾・先頭の「ー」は除去
      if (extractedInfo.destination) {
        extractedInfo.destination = extractedInfo.destination.replace(/^ー+/, '').replace(/ー+$/, '');
      }

      return extractedInfo as Partial<TicketInformation>;
      // } catch (e) {
    } catch {
      console.warn('[AzureOpenAIInformationExtractor] Schema parse failed, fallback to legacy parser');
      const legacyLikeItems = schemaItems.map((si: HearingItemDefinition) => ({ key: (si as any).field.llmKey || String((si as any).field.stateKey) })) as any as HearingItem[];
      extractedInfo = this.parseResponseDynamic(response || '', legacyLikeItems);
      return extractedInfo as Partial<TicketInformation>;
    }
  }

  // 会話履歴から情報を抽出
  async extractInformation(request: ExtractionRequest): Promise<Partial<TicketInformation>> {
    // 初期化されていない場合、再試行
    if (!this.isInitialized || !this.azureOpenAIService) {
      await this.initializeService();

      if (!this.isInitialized || !this.azureOpenAIService) {
        console.error('[AzureOpenAIInformationExtractor] Service not initialized');
        return {};
      }
    }

    try {
      // 現在の状態を取得（requestに含まれるべき）
      const currentStateTicketInfo = (request as any).currentStateTicketInfo || {};
      // console.log('[AzureOpenAIInformationExtractor] Current state:', currentState);
      let schemaItems = new Array<HearingItemDefinition>();

      //常に追加（効果がなさそうなので一旦コメントアウト）
      // schemaItems.push(Hearing.canExtractFromLastUserMessage.canExtractFromLastUserMessage);

      if (currentStateTicketInfo.currentPhase === TicketPhases.BASIC_INFO) {
        console.log('[Azure InformationExtractor] 情報抽出 - 基本情報フェーズです***********************************');

        //ヒアリング項目はすべて追加
        schemaItems.push(Hearing.basic.adultCount)
        schemaItems.push(Hearing.basic.childCount)
        schemaItems.push(Hearing.basic.destination)
        schemaItems.push(Hearing.basic.travelDate)

        //すべての項目を聞き終わっているかどうかをチェック
        const allBasicHeared = this.isNotNullAndUndefined(currentStateTicketInfo.adultCount)
          && this.isNotNullAndUndefined(currentStateTicketInfo.destination)
          && this.isNotNullAndUndefined(currentStateTicketInfo.travelDate)
          && currentStateTicketInfo.routes && currentStateTicketInfo.routes.length > 0;

        //聞き終わっているなら、確認メッセージに対するフラグも聞く
        if (allBasicHeared &&
          (!this.isNotNullAndUndefined(currentStateTicketInfo.basicInfoConfirmed) ||
            currentStateTicketInfo.basicInfoConfirmed === false)) {
          schemaItems.push(Hearing.basic.basicInfoConfirmed);
        }

        //行き先の妥当性チェック
        const res = await this.extractInfoWithLLM(request, schemaItems);

        //destinationが含まれている場合、正規化・存在チェックで妥当性を検証する
        if (res.destination && currentStateTicketInfo.destination !== res.destination) {
          // ************************************************ */

          this.speechSynthesisService?.synthesizeAndPlaySpeech("少々お待ちください。")

          //if (!await TicketSystemManager.hasRoute(res.destination)) {
          //存在しなければ、駅名を正規化して取得しなおす

          // 駅名正規化処理
          const normalizer = StationNameNormalizer.getInstance();
          if (this.azureOpenAIService == null) {
            this.initializeService();
          }
          const normalizedResult = await normalizer.normalizeWithAI(
            res.destination,
            this.azureOpenAIService
          );

          console.log('[StationNameNormalizer] 正規化結果:', {
            original: normalizedResult.originalInput,
            hiragana_OnYomi: normalizedResult.hiraganaReading_OnYomi,
            hiragana_KunYomi: normalizedResult.hiraganaReading_KunYomi,
            suggested: normalizedResult.suggestedStation,
          });

          // 正規化された駅名が見つかった場合
          if (normalizedResult.suggestedStation) {
            // 正規化された駅名で再度ルート検索
            if (await TicketSystemManager.hasRoute(normalizedResult.suggestedStation)) {
              res.destination = normalizedResult.suggestedStation;
              res.destination_kana = normalizedResult.suggestedStation_Kana;
              DebugChatInjector.post(`[駅名正規化] "${normalizedResult.originalInput}" を "${normalizedResult.suggestedStation}" に正規化しました。`);

              //発言自体の最後も差し替える
              res.convertLastUserMessage = request.lastUserMessage.replace(res.destination, normalizedResult.suggestedStation);

              //ここは抜けるようにする
              // return state.ticketInfo.currentPhase !== TicketPhases.BASIC_INFO;
            } else {
              res.notFoundDestination = true;
              res.destination = null;
            }
          } else {
            res.notFoundDestination = true;
            res.destination = null;
          }
          //}
        }
        return res;
      }

      if (currentStateTicketInfo.currentPhase === TicketPhases.JOBAN_1) {
        console.log('[Azure InformationExtractor] 情報抽出 - 常磐線フェーズ１です***********************************');

        // 常磐線が経路に存在するかの確認
        if (!currentStateTicketInfo.jobanExpressRoutes || currentStateTicketInfo.jobanExpressRoutes.length === 0) {
          //--[最終]常磐線特急なし-すべて普通列車
          schemaItems.push(Hearing.confirmation.ticketConfirmed);
          return await this.extractInfoWithLLM(request, schemaItems);
        }

        //常磐線を利用するかどうかを聞けていない場合
        if (!this.isNotNullAndUndefined(currentStateTicketInfo.phase2_jobanExpressUse)) {
          schemaItems.push(Hearing.joban1.phase2_jobanExpressUse);
          return await this.extractInfoWithLLM(request, schemaItems);
        }

        //常磐線を利用しない場合
        if (currentStateTicketInfo.phase2_jobanExpressUse === false) {
          if (!currentStateTicketInfo.ticketConfirmed) {
            //これでよいかを確認する
            //--[最終]常磐線特急を利用しない-すべて普通列車
            schemaItems.push(Hearing.confirmation.ticketConfirmed);
            return await this.extractInfoWithLLM(request, schemaItems);
          } else {
            throw new Error('Invalid phase');
          }
        }

        // 常磐線を利用する場合（前工程でプロックしているのでここには来ない） *****************************************************************
        if ((currentStateTicketInfo.phase2_timeSpecification !== false)
          && (!this.isNotNullAndUndefined(currentStateTicketInfo.phase2_timeSpecification)
            || !this.isNotNullAndUndefined(currentStateTicketInfo.phase2_timeSpecificationType)
            || !this.isNotNullAndUndefined(currentStateTicketInfo.phase2_specificTime))) {
          schemaItems.push(Hearing.joban1.phase2_timeSpecification);
          schemaItems.push(Hearing.joban1.phase2_timeSpecificationType);
          schemaItems.push(Hearing.joban1.phase2_specificTime);
          return await this.extractInfoWithLLM(request, schemaItems);
        }

        //すべての項目が聞けているかどうか
        //1. 座席未指定券 #####################################################################################################
        //--常磐線を利用するが、時間指定なしが確定している場合
        if (currentStateTicketInfo.phase2_timeSpecification === false) {
          //座席未指定券が必要かどうかの確認
          if (!this.isNotNullAndUndefined(currentStateTicketInfo.phase2_confirmUnspecifiedSeat)) {
            schemaItems.push(Hearing.joban1.phase2_confirmUnspecifiedSeat);
            return await this.extractInfoWithLLM(request, schemaItems);
          } else {
            //--[最終]常磐線特急を利用する-座席未指定券
            schemaItems.push(Hearing.confirmation.ticketConfirmed);
            return await this.extractInfoWithLLM(request, schemaItems);
          }
        }
        //[END]座席未指定券 #####################################################################################################

        //2. 時間指定あり（無しならここに来ない） #####################################################################################################
        //時間指定の種別
        if (!this.isNotNullAndUndefined(currentStateTicketInfo.phase2_timeSpecificationType)
          || !this.isNotNullAndUndefined(currentStateTicketInfo.phase2_specificTime)) {
          return await this.extractInfoWithLLM(request, schemaItems);
        }

        //3. 到着時刻の場合 #####################################################################################################
        if (currentStateTicketInfo.phase2_timeSpecificationType === 'stop') {
          //--経路提案の結果を抽出（フェーズ判定は、generateBeforeAiで行っているのでここでは行わない）
          if (!this.isNotNullAndUndefined(currentStateTicketInfo.proposedRouteOK)) {
            schemaItems.push(Hearing.joban1.proposedRouteOK);
            schemaItems.push(Hearing.joban1.proposedRouteRequest);
            return await this.extractInfoWithLLM(request, schemaItems);
          } else if (currentStateTicketInfo.proposedRouteOK === false) {
            schemaItems.push(Hearing.joban1.proposedRouteOK);
            schemaItems.push(Hearing.joban1.proposedRouteRequest);
            return await this.extractInfoWithLLM(request, schemaItems);
          } else {

            if (currentStateTicketInfo.proposedRouteOK === true) {

              return await this.executeAfterProposedRoute(currentStateTicketInfo.proposedRoute!,
                currentStateTicketInfo.proposedRoute!, currentStateTicketInfo, schemaItems, request);
            }
          }
        }
        //[END]到着時刻の場合 #####################################################################################################

        //4. 出発時間指定の場合 #####################################################################################################
        if (currentStateTicketInfo.phase2_timeSpecificationType === 'start') {

          //在来特急を利用しない かつ 45分以内の経路に在来無し（初期提案できない)のフラグが立っていないこと
          if (!this.isNotNullAndUndefined(currentStateTicketInfo.phase2_useZairaiExpress)
            && (!this.isNotNullAndUndefined(currentStateTicketInfo.phase2_useZairaiButNotFound)
              || currentStateTicketInfo.phase2_useZairaiButNotFound === false)) {
            schemaItems.push(Hearing.joban1.phase2_useZairaiExpress);
            //常磐線を利用するかどうかを削除する
            schemaItems = schemaItems.filter(item => item.field.stateKey !== 'phase2_jobanExpressUse').map(item => item as HearingItemDefinition);
            const res = await this.extractInfoWithLLM(request, schemaItems);
            if (!this.isNotNullAndUndefined(res.phase2_useZairaiExpress)) {
              res.resetProposedRoute = true;
            }
            return res;
          }

          //--在来特急を利用しない場合 または45分以内の経路に在来無し（初期提案できない)
          if (currentStateTicketInfo.phase2_useZairaiExpress === false) {
            if (currentStateTicketInfo.phase2_useZairaiButNotFound === true) {
              DebugChatInjector.post('[AzureOpenAIInformationExtractor] 在来を利用するとしていますが、45分以内の経路に在来無し（初期提案できない)のため、在来無しのフローを行っています....');
            }
            //--提案経路でよいかどうかの確認
            if (!this.isNotNullAndUndefined(currentStateTicketInfo.proposedRouteOK)
              || currentStateTicketInfo.proposedRouteOK === false) {
              schemaItems.push(Hearing.joban1.proposedRouteOK);
              schemaItems.push(Hearing.joban1.proposedRouteRequest);
              return await this.extractInfoWithLLM(request, schemaItems);
            } else {
              return await this.executeAfterProposedRoute(currentStateTicketInfo.proposedRoute!,
                currentStateTicketInfo.proposedRoute!, currentStateTicketInfo, schemaItems, request);
            }
          }
        }
        //[END]出発時間指定の場合 #####################################################################################################

        //在来を利用するとなった後は、時刻関連は抽出から外す
        schemaItems = schemaItems.filter(item => item.field.stateKey !== 'phase2_useZairaiExpress'
          && item.field.stateKey !== 'phase2_timeSpecification'
          && item.field.stateKey !== 'phase2_timeSpecificationType'
          && item.field.stateKey !== 'phase2_specificTime').map(item => item as HearingItemDefinition);

        //中央線以外の場合 #####################################################################################################
        if (currentStateTicketInfo.phase2_useZairaiExpress &&
          currentStateTicketInfo.zairaiExpressCategory && currentStateTicketInfo.zairaiExpressCategory !== '中央線') {
          //経路提案をすぐにしているはずなので、経路提案の確認項目を入れる
          schemaItems.push(Hearing.joban1.proposedRouteOK);
          schemaItems.push(Hearing.joban1.proposedRouteRequest);

          if (currentStateTicketInfo.proposedRouteOK === true) {

            return await this.executeAfterProposedRoute(currentStateTicketInfo.proposedRoute!,
              currentStateTicketInfo.proposedRoute!, currentStateTicketInfo, schemaItems, request);
          }
          return await this.extractInfoWithLLM(request, schemaItems);
        }
        //[END]中央線以外の場合 #####################################################################################################

        return await this.extractInfoWithLLM(request, schemaItems);
      }

      if (currentStateTicketInfo.currentPhase === TicketPhases.JOBAN_PHASE_2) {
        //--ここは在来特急を利用することになっている
        console.log('[Azure InformationExtractor] 情報抽出 - 常磐線フェーズ２です***********************************');
        //中央線

        //時刻再確認
        if (!this.isNotNullAndUndefined(currentStateTicketInfo.phase2_timeReConfirmed)) {
          schemaItems.push(Hearing.jobanPhase2.phase2_timeReConfirmed);
          return await this.extractInfoWithLLM(request, schemaItems);
        }

        //常磐線特急の降車駅
        if (!this.isNotNullAndUndefined(currentStateTicketInfo.phase2_jobanDropOffStation)) {
          schemaItems.push(Hearing.jobanPhase2.phase2_jobanDropOffStation);
          return await this.extractInfoWithLLM(request, schemaItems);
        }

        //--新宿駅での乗り換え時間は通常か/乗り換え時間指定があるか
        if (!this.isNotNullAndUndefined(currentStateTicketInfo.phase2_transferTimeIsNormal)
          && !this.isNotNullAndUndefined(currentStateTicketInfo.zairaiSpecial_transferMinutes)) {
          schemaItems.push(Hearing.jobanPhase2.phase2_transferTimeIsNormal);
          schemaItems.push(Hearing.jobanPhase2.zairaiSpecial_transferMinutes);
          const res = await this.extractInfoWithLLM(request, schemaItems);
          if (this.isNotNullAndUndefined(res.zairaiSpecial_transferMinutes) &&
            !this.isNotNullAndUndefined(res.phase2_transferTimeIsNormal) || res.phase2_transferTimeIsNormal === false) {
            res.phase2_transferTimeIsNormal = false;
          }
          return res;
        }

        //時間だけが聞けていない場合
        if (currentStateTicketInfo.phase2_transferTimeIsNormal === false &&
          !this.isNotNullAndUndefined(currentStateTicketInfo.zairaiSpecial_transferMinutes)) {
          schemaItems.push(Hearing.jobanPhase2.zairaiSpecial_transferMinutes);
          return await this.extractInfoWithLLM(request, schemaItems);
        }

        //普通でよい場合は、提案経路を確認
        if (currentStateTicketInfo.phase2_transferTimeIsNormal === true) {
          //新宿通常乗り換えOKの場合

          //経路確認結果を確定させる
          if (!this.isNotNullAndUndefined(currentStateTicketInfo.zairaiSpecial_proposedRouteOK)) {
            schemaItems.push(Hearing.jobanPhase2.zairaiSpecial_proposedRouteOK);
            schemaItems.push(Hearing.jobanPhase2.zairaiSpecial_proposedRouteRequest);
            const res = await this.extractInfoWithLLM(request, schemaItems);
            if (!this.isNotNullAndUndefined(res.zairaiSpecial_proposedRouteRequest) && 
            res.zairaiSpecial_proposedRouteOK === null) {
              res.zairaiSpecial_proposedRouteOK = false;
            }
            return res;
          } else if (currentStateTicketInfo.zairaiSpecial_proposedRouteOK === false) {
            //通常でよいの後経路提案がNGとなったとき
            //TODO: ここと、時間指定されたて、経路提案してもNGとなったときに、時間を聞きなおすフローに入るのかもしれない
            currentStateTicketInfo.phase2_transferTimeIsNormal = false;
            currentStateTicketInfo.zairaiSpecial_transferMinutes = 0;
          } else {
            return await this.executeAfterProposedRoute(currentStateTicketInfo.proposedRoute!,
              currentStateTicketInfo.proposedRoute!, currentStateTicketInfo, schemaItems, request);
          }
        } else if (currentStateTicketInfo.phase2_transferTimeIsNormal === false &&
          !this.isNotNullAndUndefined(currentStateTicketInfo.zairaiSpecial_transferMinutes)
        ) {
          //--新宿駅での乗り換え時間が通常でない場合
          schemaItems.push(Hearing.jobanPhase2.zairaiSpecial_transferMinutes);
          if (!this.isNotNullAndUndefined(currentStateTicketInfo.zairaiSpecial_transferMinutes)) {
            return await this.extractInfoWithLLM(request, schemaItems);
          }
        }

        //新宿発のルートに対する確認
        if (!this.isNotNullAndUndefined(currentStateTicketInfo.zairaiSpecial_proposedRouteOK) ||
          currentStateTicketInfo.zairaiSpecial_proposedRouteOK === false) {
          schemaItems.push(Hearing.jobanPhase2.zairaiSpecial_proposedRouteOK);
          schemaItems.push(Hearing.jobanPhase2.zairaiSpecial_proposedRouteRequest);
          return await this.extractInfoWithLLM(request, schemaItems);
        }

        //新宿のルートに対してOKかどうか。
        if (currentStateTicketInfo.zairaiSpecial_proposedRouteOK === true) {
          return await this.executeAfterProposedRoute(currentStateTicketInfo.proposedRoute!,
            currentStateTicketInfo.zairaiSpecial_proposedRoute!, currentStateTicketInfo, schemaItems, request);
        }
        return await this.extractInfoWithLLM(request, schemaItems);
      }

      throw new Error('Invalid phase');
    } catch (error) {
      console.error('[AzureOpenAIInformationExtractor] Extraction failed:', error);
      return {};
    }
  }

  // 動的な抽出結果をパース
  private parseResponseDynamic(response: string, items: HearingItem[]): Partial<TicketInformation> {
    try {
      // JSONを抽出（マークダウンのコードブロックに対応）
      let jsonStr = response;
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      } else {
        // JSONオブジェクトを直接探す
        const objectMatch = response.match(/\{[\s\S]*\}/);
        if (objectMatch) {
          jsonStr = objectMatch[0];
        }
      }

      const parsed: any = JSON.parse(jsonStr);
      const result: Partial<TicketInformation> = {};

      // 抽出項目に基づいて結果をマップ
      items.forEach(item => {
        if (parsed[item.key] !== undefined) {
          switch (item.key) {
            case 'destination_name':
              result.destination = parsed[item.key];
              break;
            case 'date':
              result.travelDate = this.normalizeDate(parsed[item.key]);
              break;
            case 'adult_count':
              result.adultCount = parsed[item.key];
              break;
            case 'child_count':
              result.childCount = parsed[item.key];
              break;
            case 'basicInfoConfirmed':
              result.basicInfoConfirmed = parsed[item.key];
              break;
            case 'phase2_jobanExpressUse':
              result.phase2_jobanExpressUse = parsed[item.key];
              break;
            case 'phase2_timeSpecification':
              result.phase2_timeSpecification = parsed[item.key];
              break;
            case 'phase2_timeSpecificationType':
              result.phase2_timeSpecificationType = parsed[item.key];
              break;
            case 'phase2_specificTime':
              result.phase2_specificTime = parsed[item.key];
              break;
            case 'phase2_confirmUnspecifiedSeat':
              result.phase2_confirmUnspecifiedSeat = parsed[item.key];
              break;
              // removed case phase2_confirmed:
              result.phase2_confirmed = parsed[item.key];
              break;
            case 'proposedRouteOK':
              result.proposedRouteOK = parsed[item.key];
              break;
            case 'proposedRouteRequest':
              result.proposedRouteRequest = parsed[item.key];
              break;
            case 'ticketConfirmed':
              result.ticketConfirmed = parsed[item.key];
              break;
            case 'phase2_useZairaiExpress':
              result.phase2_useZairaiExpress = parsed[item.key];
              break;
            case 'phase2_jobanDropOffStation':
              result.phase2_jobanDropOffStation = parsed[item.key];
              break;
            case 'phase2_transferTimeIsNormal':
              result.phase2_transferTimeIsNormal = parsed[item.key];
              break;
            case 'zairaiSpecial_transferMinutes':
              result.zairaiSpecial_transferMinutes = parsed[item.key];
              break;
          }
        }
      });

      return result;
    } catch (error) {
      console.error('[AzureOpenAIInformationExtractor] Failed to parse response:', error);
      console.error('Raw response:', response);
      return {};
    }
  }

  // 日付を正規化（「今日」「明日」などをYYYY-MM-DD形式に変換）
  private normalizeDate(dateStr: string): string {
    if (!dateStr) return dateStr;

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const lowerDateStr = dateStr.toLowerCase();

    if (lowerDateStr === '今日' || lowerDateStr === 'today' || lowerDateStr === '本日') {
      return today.toISOString().split('T')[0]; // YYYY-MM-DD形式
    } else if (lowerDateStr === '明日' || lowerDateStr === 'tomorrow' || lowerDateStr === 'あした') {
      return tomorrow.toISOString().split('T')[0];
    }

    // その他の場合はそのまま返す
    return dateStr;
  }

}