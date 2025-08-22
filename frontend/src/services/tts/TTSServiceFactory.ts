import type { ITTSProvider, TTSProviderConfig } from './ITTSProvider';
import { AzureTTSProvider } from './AzureTTSProvider';
import { GoogleCloudTTSProvider } from './GoogleCloudTTSProvider';

export class TTSServiceFactory {
  /**
   * 設定に基づいてTTSプロバイダーを作成
   */
  static async create(config: TTSProviderConfig): Promise<ITTSProvider> {
    let provider: ITTSProvider;

    switch (config.provider) {
      case 'azure':
        if (!config.azure) {
          throw new Error('Azure configuration is required for Azure TTS provider');
        }
        provider = new AzureTTSProvider(config.azure);
        break;

      case 'google-cloud':
        if (!config.googleCloud) {
          throw new Error('Google Cloud configuration is required for Google Cloud TTS provider');
        }
        provider = new GoogleCloudTTSProvider(config.googleCloud);
        break;

      default:
        throw new Error(`Unknown TTS provider: ${config.provider}`);
    }

    await provider.initialize();
    return provider;
  }

  /**
   * 現在の設定からTTSプロバイダーを作成
   */
  static async createFromCurrentConfig(): Promise<ITTSProvider> {
    // LocalStorageから設定を読み込む
    const savedProvider = localStorage.getItem('tts_provider') || 'azure';
    
    // Gemini TTSが選択されていた場合は、Google Cloudにフォールバック
    if (savedProvider === 'gemini') {
      localStorage.setItem('tts_provider', 'google-cloud');
      return this.createGoogleCloudProvider();
    }

    if (savedProvider === 'google-cloud') {
      return this.createGoogleCloudProvider();
    }

    return this.createAzureProvider();
  }

  /**
   * Azureプロバイダーを作成（デフォルト）
   */
  private static async createAzureProvider(): Promise<ITTSProvider> {
    // ConfigManagerから設定を取得
    const { ConfigManager } = await import('../../config/ConfigManager');
    const configManager = ConfigManager.getInstance();
    const appConfig = configManager.getConfig();
    
    const config: TTSProviderConfig = {
      provider: 'azure',
      azure: {
        subscriptionKey: appConfig?.azure?.speechSubscriptionKey || import.meta.env.VITE_AZURE_SPEECH_SUBSCRIPTION_KEY || '',
        region: appConfig?.azure?.speechRegion || import.meta.env.VITE_AZURE_SPEECH_REGION || '',
        language: 'ja-JP',
        voiceName: appConfig?.azure?.voiceName || import.meta.env.VITE_AZURE_VOICE_NAME || 'ja-JP-NanamiNeural'
      }
    };

    return await this.create(config);
  }

  /**
   * Google Cloudプロバイダーを作成
   */
  private static async createGoogleCloudProvider(): Promise<ITTSProvider> {
    const googleCloudVoiceName = localStorage.getItem('google_cloud_voice_name') || 'Kore';
    
    // ConfigManagerから設定を取得
    const { ConfigManager } = await import('../../config/ConfigManager');
    const configManager = ConfigManager.getInstance();
    const appConfig = configManager.getConfig();
    
    // プロキシURLは環境変数から取得（/api/config経由）
    // ベースURLとして使用（デフォルトは空文字で相対URL）
    const googleCloudProxyUrl = appConfig?.google?.ttsApiUrl || '';
    
    const config: TTSProviderConfig = {
      provider: 'google-cloud',
      googleCloud: {
        proxyUrl: googleCloudProxyUrl,
        voiceName: googleCloudVoiceName
      }
    };

    try {
      return await this.create(config);
    } catch (error) {
      console.error('[TTSServiceFactory] Failed to create Google Cloud provider, falling back to Azure:', error);
      return this.createAzureProvider();
    }
  }
}