import type { AppConfig } from './index';

/**
 * グローバルな設定管理クラス
 * シングルトンパターンで実装し、アプリケーション全体で設定を共有
 */
export class ConfigManager {
  private static instance: ConfigManager;
  private config: AppConfig | null = null;

  private constructor() {}

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  setConfig(config: AppConfig): void {
    this.config = config;
  }

  getConfig(): AppConfig | null {
    return this.config;
  }

  getAzureConfig() {
    return this.config?.azure || null;
  }

  getCosmosConfig() {
    return this.config?.cosmos || null;
  }

  getGoogleConfig() {
    return this.config?.google || null;
  }

  getAppConfig() {
    return this.config?.app || null;
  }

  // 設定が読み込まれているかチェック
  isConfigLoaded(): boolean {
    return this.config !== null;
  }
}