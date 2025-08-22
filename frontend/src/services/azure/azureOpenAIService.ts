import { AzureOpenAI } from 'openai';
import type { AzureOpenAIConfig, ChatMessage } from './types';
import type { Stream } from 'openai/streaming';

export class AzureOpenAIService {
  private client: AzureOpenAI;
  private clientEastUs: AzureOpenAI;
  private config: AzureOpenAIConfig;
  private modelName: string;

  constructor(config: AzureOpenAIConfig) {
    this.config = {
      ...config,
      apiVersion: config.apiVersion || '2024-12-01-preview'
    };

    // Ensure endpoint doesn't have trailing slash
    const endpoint = this.config.endpoint.endsWith('/') 
      ? this.config.endpoint.slice(0, -1) 
      : this.config.endpoint;

    // Initialize Azure OpenAI client with proper options
    this.client = new AzureOpenAI({
      endpoint,
      apiKey: this.config.apiKey,
      deployment: this.config.deployment,
      apiVersion: this.config.apiVersion,
      dangerouslyAllowBrowser: true
    });

    this.clientEastUs = new AzureOpenAI({
      endpoint: this.config.openAIEastUsEndpoint || '',
      apiKey: this.config.openAIEastUsApiKey,
      deployment: this.config.openAIEastUsDeployment,
      apiVersion: this.config.apiVersion,
      // Use the latest API version for East US deployment
      dangerouslyAllowBrowser: true
    });
    //https://axcxe-mbw8vpog-eastus2.cognitiveservices.azure.com/openai/deployments/gpt-5/chat/completions?api-version=2025-01-01-preview

    // Use deployment name as model name (Azure OpenAI pattern)
    this.modelName = this.config.deployment;
  }

  async initialize(): Promise<void> {
    // Test connection
    try {
      await this.testConnection();
    } catch (error) {
      throw new Error(`Failed to initialize Azure OpenAI Service: ${error}`);
    }
  }

  async sendMessage(messages: ChatMessage[]): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        messages,
        model: this.config.deployment || 'gpt-4o',
        // store: false,
        // reasoning_effort: "minimal",
        // verbosity: "low",
        max_completion_tokens: 16384,
        stream: false
      });

      // Check for error in response
      if ((response as any)?.error !== undefined && (response as any).status !== "200") {
        throw (response as any).error;
      }

      return response.choices[0]?.message?.content || '';
    } catch (error) {
      console.error('[AzureOpenAIService] Error:', error);
      throw new Error(`Failed to send message: ${error}`);
    }
    
  }

  
  async sendMessageGPT5(messages: ChatMessage[]): Promise<string> {
    try {
      console.log('[AzureOpenAIService] sendMessageGPT5', messages);
      const response = await this.clientEastUs.chat.completions.create({
        messages,
        model: this.config.openAIEastUsDeployment || 'gpt-5',
        // store: false,
        // reasoning_effort: "minimal",
        // verbosity: "low",
        max_completion_tokens: 16384,
        stream: false
      });

      // Check for error in response
      if ((response as any)?.error !== undefined && (response as any).status !== "200") {
        throw (response as any).error;
      }

      return response.choices[0]?.message?.content || '';
    } catch (error) {
      console.error('[AzureOpenAIService] Error:', error);
      throw new Error(`Failed to send message: ${error}`);
    }

  }

  async sendMessageStream(
    messages: ChatMessage[],
    onChunk: (chunk: string) => void
  ): Promise<void> {
    try {
      const stream = await this.client.chat.completions.create({
        messages,
        model: this.modelName,
        max_completion_tokens: 16384,
        stream: true
      }) as Stream<any>;

      // Process stream chunks
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          onChunk(content);
        }
      }
    } catch (error) {
      console.error('[AzureOpenAIService] Streaming error:', error);
      throw new Error(`Failed to send streaming message: ${error}`);
    }
  }

  private async testConnection(): Promise<void> {
    try {
      const response = await this.client.chat.completions.create({
        messages: [{ role: 'user', content: 'test' }],
        model: this.modelName,
        max_completion_tokens: 1,
        stream: false
      });

      // Check for error in response
      if ((response as any)?.error !== undefined && (response as any).status !== "200") {
        throw (response as any).error;
      }
    } catch (error) {
      // Accept 400 error as it means the API is reachable but request is invalid
      if (error instanceof Error && error.message.includes('400')) {
        return;
      }
      throw new Error(`Connection test failed: ${error}`);
    }
  }
}