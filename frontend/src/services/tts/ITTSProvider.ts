/**
 * TTSプロバイダーのインターフェース
 * 異なるTTSサービス（Azure、Gemini等）の差異を吸収する
 */
export interface ITTSProvider {
  /**
   * プロバイダーの初期化
   */
  initialize(): Promise<void>;

  /**
   * テキストを音声合成
   * @param text 音声合成するテキスト
   * @returns 合成された音声データ（ArrayBuffer形式）
   */
  synthesizeSpeech(text: string): Promise<ArrayBuffer>;

  /**
   * 現在音声合成中かどうか
   */
  getIsSpeaking(): boolean;

  /**
   * リソースのクリーンアップ
   */
  dispose(): void;
}

/**
 * TTSプロバイダーの設定
 */
export interface TTSProviderConfig {
  provider: 'azure' | 'google-cloud';
  azure?: {
    subscriptionKey: string;
    region: string;
    language: string;
    voiceName: string;
  };
  googleCloud?: {
    proxyUrl?: string;
    voiceName?: string;
  };
}

/**
 * TTSプロバイダーのタイプ
 */
export type TTSProviderType = 'azure' | 'google-cloud';