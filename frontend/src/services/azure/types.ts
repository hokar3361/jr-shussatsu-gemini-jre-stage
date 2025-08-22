export interface AzureConfig {
  speechSubscriptionKey: string;
  speechRegion: string;
  openAIEndpoint: string;
  openAIApiKey: string;
  openAIDeployment: string;
  openAIDeploymentGpt4o?: string;
  voiceName: string;
  openAIEastUsEndpoint: string;
  openAIEastUsApiKey: string;
  openAIEastUsDeployment: string;
  openAIEastUsDeploymentGpt5: string;
}

export interface AzureSpeechConfig {
  subscriptionKey: string;
  region: string;
  language?: string;
  voiceName?: string;
}

export interface AzureOpenAIConfig {
  endpoint: string;
  apiKey: string;
  deployment: string;
  apiVersion?: string;
  openAIEastUsEndpoint?: string;
  openAIEastUsApiKey?: string;
  openAIEastUsDeployment?: string;
  openAIEastUsDeploymentGpt5?: string;
}

export interface SpeechRecognitionResult {
  text: string;
  isFinal: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}