import type { ICommunicationService, CommunicationConfig } from './types';
import { GeminiWebSocketService } from './GeminiWebSocketService';
import { AzureService } from './AzureService';
import { DirectOAuthService } from './DirectOAuthService';
import type { AzureConfig } from '../azure/types';

export class CommunicationServiceFactory {
  static create(config: CommunicationConfig): ICommunicationService {
    // console.log('CommunicationServiceFactory.create called with config:', config);
    
    switch (config.mode) {
      case 'gemini-websocket':
        // console.log('Creating GeminiWebSocketService');
        return new GeminiWebSocketService({
          proxyUrl: config.proxyUrl || 'ws://localhost:8080'
        });

      case 'azure':
        // console.log('Creating AzureService');
        if (!config.azureConfig) {
          throw new Error('Azure configuration is required for Azure mode');
        }
        return new AzureService(config.azureConfig as AzureConfig);

      case 'oauth-direct':
        // console.log('Creating DirectOAuthService');
        return new DirectOAuthService({
          apiHost: config.apiHost
        });

      default:
        throw new Error(`Unsupported communication mode: ${config.mode}`);
    }
  }
}