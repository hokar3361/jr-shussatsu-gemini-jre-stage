import type { ITTSProvider } from './ITTSProvider';

interface GoogleCloudTTSConfig {
  proxyUrl?: string;
  voiceName?: string;
}

// Chirp 3: HD 音声のオプション
const CHIRP3_HD_VOICES = {
  'Aoede': 'female',
  'Puck': 'male',
  'Charon': 'male',
  'Kore': 'female',
  'Fenrir': 'male',
  'Leda': 'female',
  'Orus': 'male',
  'Zephyr': 'female'
};

export class GoogleCloudTTSProvider implements ITTSProvider {
  private proxyUrl: string = '';  // デフォルトは現在のドメイン
  private isSpeaking: boolean = false;
  private voiceName: string = 'Kore'; // デフォルトはKore

  constructor(_config: GoogleCloudTTSConfig) {
    // proxyUrlは実際にはベースURLとして使用される
    if (_config.proxyUrl && _config.proxyUrl !== '/api/tts/synthesize') {
      this.proxyUrl = _config.proxyUrl;
    }
    if (_config.voiceName && _config.voiceName in CHIRP3_HD_VOICES) {
      this.voiceName = _config.voiceName;
    }
  }

  async initialize(): Promise<void> {
    try {
      // プロキシサーバーのヘルスチェック
      const response = await fetch(`${this.proxyUrl}/api/health`, {
        credentials: 'include'  // 基本認証のクレデンシャルを含める
      });
      if (!response.ok) {
        throw new Error(`Proxy server is not available: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('[GoogleCloudTTSProvider] Connected to proxy:', data);
      console.log('[GoogleCloudTTSProvider] Using voice:', this.voiceName);
    } catch (error) {
      console.error('[GoogleCloudTTSProvider] Failed to initialize:', error);
      throw new Error(`Failed to connect to Google Cloud TTS proxy. Make sure the proxy server is running on ${this.proxyUrl}`);
    }
  }

  async synthesizeSpeech(text: string): Promise<ArrayBuffer> {
    this.isSpeaking = true;

    try {
      const response = await fetch(`${this.proxyUrl}/api/tts/synthesize`, {
        method: 'POST',
        credentials: 'include',  // 基本認証のクレデンシャルを含める
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          voiceName: this.voiceName,
          languageCode: 'ja-JP'
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || error.error || 'Failed to synthesize speech');
      }

      // レスポンスをArrayBufferとして取得
      const audioData = await response.arrayBuffer();
      
      this.isSpeaking = false;
      return audioData;
    } catch (error) {
      this.isSpeaking = false;
      console.error('[GoogleCloudTTSProvider] Synthesis error:', error);
      throw new Error(`Speech synthesis failed: ${error}`);
    }
  }

  getIsSpeaking(): boolean {
    return this.isSpeaking;
  }

  dispose(): void {
    this.isSpeaking = false;
  }

  /**
   * 利用可能な音声の一覧を取得
   */
  static getAvailableVoices(): { name: string; gender: string }[] {
    return Object.entries(CHIRP3_HD_VOICES).map(([name, gender]) => ({
      name,
      gender
    }));
  }

  /**
   * プロキシサーバーから利用可能な音声のリストを取得
   */
  async getVoicesFromProxy(): Promise<any[]> {
    try {
      const response = await fetch(`${this.proxyUrl}/api/tts/voices`, {
        credentials: 'include'  // 基本認証のクレデンシャルを含める
      });
      if (!response.ok) {
        throw new Error('Failed to fetch voices');
      }
      const data = await response.json();
      return data.voices;
    } catch (error) {
      console.error('[GoogleCloudTTSProvider] Failed to fetch voices:', error);
      return [];
    }
  }
}