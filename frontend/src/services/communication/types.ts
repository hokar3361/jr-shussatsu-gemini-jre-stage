import type { DialogFlowManager } from '../dialog/DialogFlowManager';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  audioData?: ArrayBuffer;
  isTranscription?: boolean;
  turnComplete?: boolean;
}

export type CommunicationMode = 'gemini-websocket' | 'azure' | 'oauth-direct';

export interface ICommunicationService {
  initialize(): Promise<void>;
  startRecording(): void;
  stopRecording(): void;
  sendText(text: string): Promise<void>;
  onMessage(callback: (message: Message) => void): void;
  onMessageComplete?(callback: (message: Message) => void): void;
  onError(callback: (error: Error) => void): void;
  onStateChange(callback: (state: ConnectionState) => void): void;
  disconnect(): void;
  isConnected(): boolean;
  isRecording(): boolean;
  getDialogFlowManager(): DialogFlowManager;
}

export const ConnectionState = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error'
} as const;

export type ConnectionState = typeof ConnectionState[keyof typeof ConnectionState];

export interface CommunicationConfig {
  mode: CommunicationMode;
  azureConfig?: any;
  proxyUrl?: string;
  apiHost?: string;
}