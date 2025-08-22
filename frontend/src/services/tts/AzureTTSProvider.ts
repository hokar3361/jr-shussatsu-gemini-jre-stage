import type { ITTSProvider } from './ITTSProvider';
import { AzureSpeechService } from '../azure/azureSpeechService';
import type { AzureSpeechConfig } from '../azure/types';

export class AzureTTSProvider implements ITTSProvider {
  private speechService: AzureSpeechService | null = null;

  constructor(private config: AzureSpeechConfig) {}

  async initialize(): Promise<void> {
    try {
      this.speechService = new AzureSpeechService(this.config);
      await this.speechService.initialize();
      console.log('[AzureTTSProvider] Initialized successfully');
    } catch (error) {
      console.error('[AzureTTSProvider] Failed to initialize:', error);
      throw new Error(`Failed to initialize Azure TTS: ${error}`);
    }
  }

  async synthesizeSpeech(text: string): Promise<ArrayBuffer> {
    if (!this.speechService) {
      throw new Error('Azure TTS provider not initialized');
    }

    try {
      return await this.speechService.synthesizeSpeech(text);
    } catch (error) {
      console.error('[AzureTTSProvider] Synthesis error:', error);
      throw error;
    }
  }

  getIsSpeaking(): boolean {
    if (!this.speechService) {
      return false;
    }
    return this.speechService.getIsSpeaking();
  }

  dispose(): void {
    if (this.speechService) {
      this.speechService.dispose();
      this.speechService = null;
    }
  }

  /**
   * 内部のAzureSpeechServiceインスタンスを取得
   * （音声認識機能へのアクセス用）
   */
  getSpeechService(): AzureSpeechService | null {
    return this.speechService;
  }
}