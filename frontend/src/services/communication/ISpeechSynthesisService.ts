/**
 * 音声合成サービスのインターフェース
 * 異なる音声対話方式（Azure、Gemini等）の差異を吸収する
 */
export interface ISpeechSynthesisService {
  /**
   * テキストを音声合成して再生
   * @param text 音声合成するテキスト
   * @param onEnded 音声再生完了時のコールバック
   */
  synthesizeAndPlaySpeech(text: string, onEnded?: () => void): Promise<void>;

  /**
   * 音声合成のみ（AudioBufferを返す）
   * @param text 音声合成するテキスト
   * @returns 合成された音声データ
   */
  synthesizeSpeech(text: string): Promise<ArrayBuffer | null>;

  /**
   * 音声データの再生のみ
   * @param audioData 再生する音声データ
   * @param onEnded 音声再生完了時のコールバック
   */
  playSynthesizedAudio(audioData: ArrayBuffer, onEnded?: () => void): void;
}

/**
 * 音声合成サービスを取得するためのコンテキスト
 */
export interface SpeechSynthesisContext {
  speechSynthesisService?: ISpeechSynthesisService;
}
