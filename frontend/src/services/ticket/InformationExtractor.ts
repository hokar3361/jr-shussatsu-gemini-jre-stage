import { TicketPhases } from './types';
import type { 
  TicketInformation, 
  ExtractionRequest, 
  ExtractionResponse
} from './types';
import { PromptManager } from './PromptManager';
import { ConfigManager } from '../../config/ConfigManager';

export class InformationExtractor {
  // 設定を保持
  private apiKey: string = '';
  private apiEndpoint: string = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

  constructor() {
    this.initializeApiKey();
  }

  private initializeApiKey() {
    const googleConfig = ConfigManager.getInstance().getGoogleConfig();
    if (googleConfig) {
      this.apiKey = googleConfig.geminiApiKey || '';
    }
    
    if (!this.apiKey) {
      console.warn('[InformationExtractor] API key not found. Information extraction will be disabled.');
    }
  }

  // 会話履歴から情報を抽出
  async extractInformation(request: ExtractionRequest): Promise<Partial<TicketInformation>> {
    // APIキーが設定されていない場合、再試行
    if (!this.apiKey) {
      this.initializeApiKey();
      
      if (!this.apiKey) {
        console.error('[InformationExtractor] API key not configured');
        return {};
      }
    }

    try {
      // console.log('[InformationExtractor] Starting extraction for phase:', request.currentPhase);
      
      // プロンプトを生成
      const prompt = PromptManager.generateExtractionPrompt(request);
      console.log('[InformationExtractor] Prompt:', prompt);
      PromptManager.logPrompt(prompt, request.currentPhase);

      // Gemini APIを呼び出し
      const response = await this.callGeminiAPI(prompt);
      
      // レスポンスをパース
      const extractedInfo = this.parseResponse(response, request.currentPhase);
      
      console.log('[InformationExtractor] Extracted information:', extractedInfo);
      return extractedInfo;
    } catch (error) {
      console.error('[InformationExtractor] Extraction failed:', error);
      return {};
    }
  }

  // Gemini APIを呼び出し
  private async callGeminiAPI(prompt: string): Promise<string> {
    const requestBody = {
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        temperature: 0.1,  // 低い温度で一貫性のある出力を得る
        maxOutputTokens: 1000,
        topP: 0.95,
        topK: 1
      }
    };

    const response = await fetch(`${this.apiEndpoint}?key=${this.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // レスポンスからテキストを抽出
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return text;
  }

  // レスポンスをパースして情報を抽出
  private parseResponse(response: string, currentPhase: TicketPhases): Partial<TicketInformation> {
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

      const parsed: ExtractionResponse = JSON.parse(jsonStr);
      
      // フェーズに応じて必要な情報のみを返す
      switch (currentPhase) {
        case TicketPhases.BASIC_INFO:
          return {
            destination: parsed.destination || null,
            travelDate: parsed.travelDate || null,
            adultCount: parsed.adultCount || null,
            childCount: parsed.childCount || null
          };
        
        // 今後のフェーズ用
        default:
          return {};
      }
    } catch (error) {
      console.error('[InformationExtractor] Failed to parse response:', error);
      console.error('Raw response:', response);
      return {};
    }
  }

  // 情報が完全に揃っているかチェック
  static isBasicInfoComplete(info: TicketInformation): boolean {
    return !!(
      info.destination &&
      info.travelDate &&
      info.adultCount !== null &&
      info.childCount !== null
    );
  }

  // デバッグ用：現在の情報をログ出力
  static logCurrentInfo(info: TicketInformation): void {
    console.log('[InformationExtractor] Current ticket information:');
    console.log(`  - Destination: ${info.destination || '未入力'}`);
    console.log(`  - Travel Date: ${info.travelDate || '未入力'}`);
    console.log(`  - Adult Count: ${info.adultCount ?? '未入力'}`);
    console.log(`  - Child Count: ${info.childCount ?? '未入力'}`);
  }
}