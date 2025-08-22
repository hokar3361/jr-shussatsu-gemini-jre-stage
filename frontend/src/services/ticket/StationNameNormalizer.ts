/**
 * 駅名正規化サービス
 * ユーザー入力の駅名を駅名辞書と照合して正しい駅名に変換
 */

interface StationDictionary {
  name: string;           // 正式な駅名
  reading: string;        // ひらがな読み
}

export class StationNameNormalizer {
  private static instance: StationNameNormalizer | null = null;
  private stationDictionary: StationDictionary[] = [];
  private isLoaded: boolean = false;

  private constructor() {}

  /**
   * シングルトンインスタンスを取得
   */
  public static getInstance(): StationNameNormalizer {
    if (!StationNameNormalizer.instance) {
      StationNameNormalizer.instance = new StationNameNormalizer();
    }
    return StationNameNormalizer.instance;
  }

  /**
   * 駅名辞書を読み込む
   */
  public async loadDictionary(): Promise<void> {
    if (this.isLoaded) {
      return;
    }

    try {
      const response = await fetch('/jr-destination-dictionary.csv', {
        credentials: 'include'
      });
      const csvText = await response.text();
      
      // CSVをパース
      const lines = csvText.split('\n').filter(line => line.trim());
      this.stationDictionary = [];
      
      // ヘッダー行をスキップ（駅名,駅名平仮名）
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        if (values.length < 2) continue;
        
        const name = values[0].trim();
        const reading = values[1].trim();
        
        this.stationDictionary.push({
          name,
          reading
        });
      }
      
      this.isLoaded = true;
      console.log(`[StationNameNormalizer] Loaded ${this.stationDictionary.length} stations`);
    } catch (error) {
      console.error('[StationNameNormalizer] Failed to load dictionary:', error);
      // エラー時は空の辞書として続行
      this.stationDictionary = [];
      this.isLoaded = true;
    }
  }

  /**
   * 文字列をひらがなに変換
   */
  private toHiragana(str: string): string {
    // カタカナをひらがなに変換
    return str.replace(/[\u30A1-\u30F6]/g, function(match) {
      const chr = match.charCodeAt(0) - 0x60;
      return String.fromCharCode(chr);
    }).toLowerCase();
  }

  /**
   * レーベンシュタイン距離を計算
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    
    const dp: number[][] = Array(len1 + 1)
      .fill(null)
      .map(() => Array(len2 + 1).fill(0));
    
    for (let i = 0; i <= len1; i++) {
      dp[i][0] = i;
    }
    
    for (let j = 0; j <= len2; j++) {
      dp[0][j] = j;
    }
    
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,      // 削除
          dp[i][j - 1] + 1,      // 挿入
          dp[i - 1][j - 1] + cost // 置換
        );
      }
    }
    
    return dp[len1][len2];
  }

  /**
   * 駅名を正規化
   * @param input ユーザー入力の駅名
   * @returns 正規化結果
   */
  public async normalize(input: string): Promise<{
    originalInput: string;
    hiraganaReading_OnYomi: string;
    hiraganaReading_KunYomi: string;
    suggestedStation: string | null;
    suggestedStation_Kana: string | null;
    confidence: number;
  }> {
    // 辞書が読み込まれていない場合は読み込む
    if (!this.isLoaded) {
      await this.loadDictionary();
    }

    // 入力が空の場合
    if (!input || input.trim() === '') {
      return {
        originalInput: input,
        hiraganaReading_OnYomi: '',
        hiraganaReading_KunYomi: '',
        suggestedStation: null,
        suggestedStation_Kana: null,
        confidence: 0
      };
    }

    // 入力の前処理（末尾・先頭の「ー」を除去、空白除去）
    const cleanedInput = input.trim().replace(/^ー+/, '').replace(/ー+$/, '');
    
    // ひらがなに変換
    const inputHiragana = this.toHiragana(cleanedInput);

    // 完全一致をまず探す
    const exactMatch = this.stationDictionary.find(
      station => station.name === cleanedInput || 
                 station.reading === inputHiragana
    );

    if (exactMatch) {
      return {
        originalInput: input,
        hiraganaReading_OnYomi: inputHiragana,
        hiraganaReading_KunYomi: inputHiragana,
        suggestedStation: exactMatch.name,
        suggestedStation_Kana: exactMatch.reading,
        confidence: 1.0
      };
    }

    // 部分一致と類似度計算
    let bestMatch: { station: StationDictionary; distance: number } | null = null;

    for (const station of this.stationDictionary) {
      // ひらがな読みで比較
      const distance = this.levenshteinDistance(inputHiragana, station.reading);
      
      if (!bestMatch || distance < bestMatch.distance) {
        bestMatch = { station, distance };
      }

      // 駅名そのものでも比較
      const nameDistance = this.levenshteinDistance(cleanedInput, station.name);
      if (!bestMatch || nameDistance < bestMatch.distance) {
        bestMatch = { station, distance: nameDistance };
      }
    }


    // 該当なし
    return {
      originalInput: input,
      hiraganaReading_OnYomi: inputHiragana,
      hiraganaReading_KunYomi: inputHiragana,
      suggestedStation: null,
      suggestedStation_Kana: null,
      confidence: 0
    };
  }

  /**
   * Azure OpenAI経由で駅名を正規化（高精度版）
   * @param input ユーザー入力の駅名
   * @param azureOpenAIService Azure OpenAIサービスインスタンス
   * @returns 正規化結果
   */
  public async normalizeWithAI(
    input: string,
    azureOpenAIService: any
  ): Promise<{
    originalInput: string;
    hiraganaReading_OnYomi: string;
    hiraganaReading_KunYomi: string;
    suggestedStation: string | null;
    suggestedStation_Kana: string | null;
  }> {
    // 辞書が読み込まれていない場合は読み込む
    if (!this.isLoaded) {
      await this.loadDictionary();
    }

    // 入力が空の場合
    if (!input || input.trim() === '') {
      return {
        originalInput: input,
        hiraganaReading_OnYomi: '',
        hiraganaReading_KunYomi: '',
        suggestedStation: null,
        suggestedStation_Kana: null,
      };
    }

    // 入力の前処理
    const cleanedInput = input.trim().replace(/^ー+/, '').replace(/ー+$/, '').replace(/駅$/, '');

    // 駅名リストを作成（最初の100件程度に制限）
    const stationList = this.stationDictionary
    //   .slice(0, 100)
      .map(s => `${s.name},${s.reading}`)
      .join('\n');

    // プロンプト作成
    const prompt = `ユーザーの発言の駅名を、すべての音読み及び訓読みのひらがなに変換してください。
そのうえで、読み方をもとに、駅名リストから最も近いと思われる駅名だけを出力してください。

#ユーザーの発言に含まれる駅名：
${cleanedInput}

#駅名リスト（一部抜粋）：
駅名,読み方
${stationList}
...（全${this.stationDictionary.length}駅）

#出力フォーマット（JSON形式で出力）：
{
  "userInputHiragana_OnYomi": "ユーザーの話した駅名の、音読みのひらがなよみとして考えられる候補のリスト。カンマ区切りで出力。",
  "userInputHiragana_KunYomi": "ユーザーの話した駅名の、訓読みのひらがなよみとして考えられる候補のリスト。カンマ区切りで出力。",
  "suggestedStation": "提案可能な駅名（正式名称）",
  "suggestedStation_Kana": "提案可能な駅名（正式名称）のカナ"
}

注意：駅名リストに該当する駅が見つからない場合は、suggestedStationをnullとしてください。`;

    try {
      const messages = [
        {
          role: 'system',
          content: '駅名を正規化するアシスタントです。JSON形式で回答してください。'
        },
        {
          role: 'user',
          content: prompt
        }
      ];

      const response = await azureOpenAIService.sendMessageGPT5(messages);
      console.log('[StationNameNormalizer] AI response:', response);
      // JSONパース
      let result: any;
      try {
        const jsonMatch = response?.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[1]);
        } else {
          const objectMatch = response?.match(/\{[\s\S]*\}/);
          if (objectMatch) {
            result = JSON.parse(objectMatch[0]);
          } else {
            throw new Error('JSON not found in response');
          }
        }
      } catch (e) {
        console.error('[StationNameNormalizer] Failed to parse AI response:', e);
        // AIでの正規化が失敗した場合は通常の正規化を使用
        return this.normalize(input);
      }

      return {
        originalInput: input,
        hiraganaReading_OnYomi: result.userInputHiragana_OnYomi || '',
        hiraganaReading_KunYomi: result.userInputHiragana_KunYomi || '',
        suggestedStation: result.suggestedStation || null,
        suggestedStation_Kana: result.suggestedStation_Kana || null,
      };

    } catch (error) {
      console.error('[StationNameNormalizer] AI normalization failed:', error);
      // エラー時は通常の正規化を使用
      return this.normalize(input);
    }
  }
}
