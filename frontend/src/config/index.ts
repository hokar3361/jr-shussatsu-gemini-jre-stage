// 統一的な設定管理
export interface AppConfig {
  // Azure関連
  azure: {
    speechSubscriptionKey: string;
    speechRegion: string;
    openAIEndpoint: string;
    openAIApiKey: string;
    openAIDeployment: string;
    openAIDeploymentGpt4o: string;
    voiceName: string;
    openAIEastUsEndpoint: string;
    openAIEastUsApiKey: string;
    openAIEastUsDeployment: string;
    openAIEastUsDeploymentGpt5: string;
  };
  // Azure Storage関連
  storage: {
    connectionString: string;
    container: string;
  };
  // Cosmos DB
  cosmos: {
    endpoint: string;
    key: string;
  };
  // Google/Gemini関連
  google: {
    projectId: string;
    accessToken?: string;
    geminiApiKey: string;
    ttsApiKey?: string;
    ttsProjectId?: string;
    ttsApiUrl?: string;
    websocketUrl?: string;
  };
  // アプリケーション設定
  app: {
    wsUrl: string;
    departureStation: string;
    useTicketSystem: boolean;
    isDev: boolean;
    apiUrl?: string;
  };
}

let cachedConfig: AppConfig | null = null;

export const getConfig = async (): Promise<AppConfig> => {
  // キャッシュがあれば返す
  if (cachedConfig) {
    return cachedConfig;
  }

  // 常にAPIから取得（開発環境でも本番環境でも）
  try {
    // console.log('[Config] Fetching config from API...');
    const response = await fetch('/api/config', {
      credentials: 'include',  // 基本認証のクレデンシャルを含める
      headers: {
        'Accept': 'application/json',
      }
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch config: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    // console.log('[Config] Raw API response:', data);
    // console.log('[Config] Azure config from API:');
    // console.log('  speechSubscriptionKey:', data.azure?.speechSubscriptionKey ? 'exists' : 'empty or not found');
    // console.log('  speechRegion:', data.azure?.speechRegion || 'empty or not found');
    // console.log('  openAIEndpoint:', data.azure?.openAIEndpoint ? 'exists' : 'empty or not found');
    // console.log('  openAIApiKey:', data.azure?.openAIApiKey ? 'exists' : 'empty or not found');
    
    cachedConfig = {
      azure: {
        speechSubscriptionKey: data.azure?.speechSubscriptionKey || '',
        speechRegion: data.azure?.speechRegion || 'japaneast',
        openAIEndpoint: data.azure?.openAIEndpoint || '',
        openAIApiKey: data.azure?.openAIApiKey || '',
        openAIDeployment: data.azure?.openAIDeployment || 'gpt-4o',
        openAIDeploymentGpt4o: data.azure?.openAIDeploymentGpt4o || 'gpt-4o',
        voiceName: data.azure?.voiceName || 'ja-JP-NanamiNeural',
        openAIEastUsEndpoint: data.azure?.openAIEastUsEndpoint || '',
        openAIEastUsApiKey: data.azure?.openAIEastUsApiKey || '',
        openAIEastUsDeployment: data.azure?.openAIEastUsDeployment || '',
        openAIEastUsDeploymentGpt5: data.azure?.openAIEastUsDeploymentGpt5 || ''
      },
      storage: {
        connectionString: data.storage?.connectionString || '',
        container: data.storage?.container || 'recordings'
      },
      cosmos: {
        endpoint: data.cosmos?.endpoint || '',
        key: data.cosmos?.key || ''
      },
      google: {
        projectId: data.google?.projectId || 'formal-hybrid-424011-t0',
        accessToken: data.google?.accessToken,
        geminiApiKey: data.google?.geminiApiKey || '',
        ttsApiKey: data.google?.ttsApiKey,
        ttsProjectId: data.google?.ttsProjectId,
        ttsApiUrl: data.google?.ttsApiUrl || '/api/tts/synthesize',
        websocketUrl: data.google?.websocketUrl || data.app?.wsUrl || window.location.origin.replace(/^http/, 'ws') + '/ws'
      },
      app: {
        wsUrl: data.app?.wsUrl || data.google?.websocketUrl || window.location.origin.replace(/^http/, 'ws') + '/ws',
        departureStation: data.app?.departureStation || '水戸',
        useTicketSystem: data.app?.useTicketSystem || false,
        isDev: false,
        apiUrl: data.app?.apiUrl
      }
    };
    
    return cachedConfig;
  } catch (error) {
    console.error('Failed to load config:', error);
    // フォールバック
    return {
      azure: {
        speechSubscriptionKey: '',
        speechRegion: 'japaneast',
        openAIEndpoint: '',
        openAIApiKey: '',
        openAIDeployment: 'gpt-4o',
        openAIDeploymentGpt4o: 'gpt-4o',
        voiceName: 'ja-JP-NanamiNeural',
        openAIEastUsEndpoint: '',
        openAIEastUsApiKey: '',
        openAIEastUsDeployment: '',
        openAIEastUsDeploymentGpt5: ''
      },
      storage: {
        connectionString: '',
        container: 'recordings'
      },
      cosmos: {
        endpoint: '',
        key: ''
      },
      google: {
        projectId: 'formal-hybrid-424011-t0',
        geminiApiKey: '',
        ttsApiUrl: '/api/tts/synthesize',
        websocketUrl: window.location.origin.replace(/^http/, 'ws') + '/ws'
      },
      app: {
        wsUrl: window.location.origin.replace(/^http/, 'ws') + '/ws',
        departureStation: '水戸',
        useTicketSystem: false,
        isDev: false
      }
    };
  }
};

// 同期的に取得できる設定（初期化時のみ使用）
export const getConfigSync = (): Partial<AppConfig> => {
  if (cachedConfig) {
    return cachedConfig;
  }
  
  // // 開発環境のみ同期的に返せる
  // if (isDevelopment) {
  //   return {
  //     app: {
  //       wsUrl: import.meta.env.VITE_WS_URL || 'ws://localhost:8080',
  //       departureStation: import.meta.env.VITE_DEPARTURE_STATION || '水戸',
  //       useTicketSystem: import.meta.env.VITE_USE_TICKET_SYSTEM === 'true',
  //       isDev: import.meta.env.DEV
  //     }
  //   };
  // }
  
  return {};
};