/**
 * JR関連用語の発音辞書
 */
export interface TermPronunciation {
  term: string;           // 用語（駅名、その他のJR用語）
  reading: string;        // ひらがな読み
  ipa?: string;          // IPA発音記号（オプション）
  alternativeSpellings?: string[]; // 代替表記（カタカナ、ひらがなバリエーションなど）
}

/**
 * JR関連用語発音辞書データ（CSVファイルから読み込み）
 */
let JR_TERM_DICTIONARY: TermPronunciation[] = [];

/**
 * CSVファイルから用語辞書を読み込む
 */
export async function loadStationDictionary(): Promise<void> {
  try {
    const response = await fetch('/jr-station-dictionary.csv', {
      credentials: 'include'  // 基本認証のクレデンシャルを含める
    });
    const csvText = await response.text();
    
    // CSVをパース
    const lines = csvText.split('\n').filter(line => line.trim());
    // ヘッダー行をスキップ
    
    JR_TERM_DICTIONARY = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      if (values.length < 3) continue;
      
      const term = values[0].trim();
      const reading = values[1].trim();
      const ipa = values[2].trim() || undefined;
      
      // 代替表記を収集（空でないもののみ）- すべての列を読み込む
      const alternativeSpellings: string[] = [];
      for (let j = 3; j < values.length; j++) {
        const spelling = values[j]?.trim();
        if (spelling) {
          alternativeSpellings.push(spelling);
        }
      }
      
      JR_TERM_DICTIONARY.push({
        term,
        reading,
        ipa,
        alternativeSpellings: alternativeSpellings.length > 0 ? alternativeSpellings : undefined
      });
    }
    
    // console.log(`[TermDictionary] Loaded ${JR_TERM_DICTIONARY.length} term pronunciations`);
  } catch (error) {
    console.error('[TermDictionary] Failed to load CSV:', error);
    // フォールバックとして最小限の辞書を設定
    JR_TERM_DICTIONARY = [
      {
        term: '飯給',
        reading: 'いたぶ',
        ipa: 'itabu',
        alternativeSpellings: ['いたぶ', 'イタブ']
      }
    ];
  }
}

/**
 * 用語辞書を取得
 */
export function getStationDictionary(): TermPronunciation[] {
  return JR_TERM_DICTIONARY;
}

export { JR_TERM_DICTIONARY }; // For compatibility, though getStationDictionary is preferred

/**
 * 用語から発音情報を取得
 */
export function getStationPronunciation(termName: string): TermPronunciation | undefined {
  return JR_TERM_DICTIONARY.find(
    item => item.term === termName || 
           item.alternativeSpellings?.includes(termName)
  );
}

/**
 * 音声認識用のフレーズリストを生成
 */
export function getRecognitionPhrases(): string[] {
  const phrases: string[] = [];
  
  JR_TERM_DICTIONARY.forEach(item => {
    // 用語を追加
    phrases.push(item.term);
    
    // 駅名の場合は「駅」付きバージョンも追加
    if (!['発', '着', '行', '止'].includes(item.term)) {
      phrases.push(item.term + '駅');
    }
    
    // ひらがな読みを追加
    phrases.push(item.reading);
    
    // 駅名の場合は読み＋「えき」も追加
    if (!['発', '着', '行', '止'].includes(item.term)) {
      phrases.push(item.reading + 'えき');
    }
    
    // 代替表記を追加
    if (item.alternativeSpellings) {
      phrases.push(...item.alternativeSpellings);
    }
  });
  
  // 重複を除去
  return [...new Set(phrases)];
}

/**
 * 音声合成用のSSML lexicon XML を生成
 */
export function generateSSMLLexicon(): string {
  const lexemes = JR_TERM_DICTIONARY
    .filter(item => item.ipa) // IPA発音記号がある項目のみ
    .map(item => `
    <lexeme>
        <grapheme>${item.term}</grapheme>
        <phoneme>${item.ipa}</phoneme>
    </lexeme>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<lexicon version="1.0"
      xmlns="http://www.w3.org/2005/01/pronunciation-lexicon"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:schemaLocation="http://www.w3.org/2005/01/pronunciation-lexicon
        http://www.w3.org/TR/2007/CR-pronunciation-lexicon-20071212/pls.xsd"
      alphabet="ipa" xml:lang="ja-JP">${lexemes}
</lexicon>`;
} 