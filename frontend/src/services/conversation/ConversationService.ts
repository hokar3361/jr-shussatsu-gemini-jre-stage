import { CosmosClient, Database, Container } from '@azure/cosmos';
import { ConfigManager } from '../../config/ConfigManager';

export interface ConversationRecord {
  id: string;
  sessionId: string;
  startTime: string;
  endTime?: string;
  status: 'completed' | 'in_progress' | 'aborted';
  ticketIssued: boolean;
  ticketConfirmed?: boolean;
  hearingItems?: any;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
  feedback?: {
    hasFeedback: boolean;
    feedbackTime?: string;
    content?: string;
  };
  recording?: {
    hasRecording: boolean;
    storageUrl?: string;
    sasToken?: string;
  };
  ttsSettings?: {
    provider: string;
    voiceName?: string;
  };
}

export class ConversationService {
  private client: CosmosClient | null = null;
  private database: Database | null = null;
  private container: Container | null = null;
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    // コンストラクタでは初期化しない
  }

  private async initializeClient(): Promise<void> {
    // 既に初期化済みまたは初期化中の場合はスキップ
    if (this.client || this.initPromise) {
      return this.initPromise || Promise.resolve();
    }

    this.initPromise = this.doInitialize();
    return this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    try {
      // ConfigManagerが初期化されていない場合は、getConfigを呼び出す
      let config = ConfigManager.getInstance().getCosmosConfig();
      
      if (!config || !config.endpoint || !config.key) {
        // 設定がまだない場合は、APIから取得
        const { getConfig } = await import('../../config');
        const fullConfig = await getConfig();
        ConfigManager.getInstance().setConfig(fullConfig);
        config = ConfigManager.getInstance().getCosmosConfig();
      }

      if (config && config.endpoint && config.key) {
        this.client = new CosmosClient({ endpoint: config.endpoint, key: config.key });
        this.database = this.client.database('jr-ticket-db');
        this.container = this.database.container('conversations');
      } else {
        throw new Error('Cosmos DB configuration not available');
      }
    } catch (error) {
      console.error('Failed to initialize Cosmos DB client:', error);
      this.initPromise = null;
      throw error;
    }
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;
    
    // クライアントが初期化されていない場合は初期化
    if (!this.client) {
      await this.initializeClient();
    }
    
    if (!this.database || !this.container) {
      throw new Error('Cosmos DB client not initialized');
    }
    
    try {
      // コンテナの存在確認、なければ作成
      await this.database.containers.createIfNotExists({
        id: 'conversations',
        partitionKey: { paths: ['/sessionId'] }
      });
      
      this.container = this.database.container('conversations');
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize Cosmos DB connection:', error);
      throw new Error('Failed to connect to Cosmos DB');
    }
  }

  async getConversations(): Promise<ConversationRecord[]> {
    await this.initialize();
    
    try {
      const query = {
        query: 'SELECT * FROM c ORDER BY c.startTime DESC',
      };

      if (this.container) {
        const { resources } = await this.container.items
          .query<ConversationRecord>(query)
          .fetchAll();
        
        return resources;
      }
      return [];
    } catch (error) {
      console.error('Error fetching conversations:', error);
      return [];
    }
  }

  async getConversationsByDate(
    date: string,
    skip: number = 0,
    limit: number = 25,
    filters?: {
      destination?: string;
      basicInfoConfirmed?: boolean;
      ticketConfirmed?: boolean;
    }
  ): Promise<{
    conversations: ConversationRecord[];
    totalCount: number;
    hasMore: boolean;
  }> {
    await this.initialize();
    
    try {
      if (!this.container) {
        return { conversations: [], totalCount: 0, hasMore: false };
      }

      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      // WHERE句の構築
      const whereConditions = ['c.startTime >= @startTime', 'c.startTime <= @endTime'];
      const parameters: any[] = [
        { name: '@startTime', value: startOfDay.toISOString() },
        { name: '@endTime', value: endOfDay.toISOString() }
      ];

      if (filters) {
        if (filters.destination !== undefined && filters.destination !== '') {
          whereConditions.push('CONTAINS(LOWER(c.hearingItems.destination), LOWER(@destination))');
          parameters.push({ name: '@destination', value: filters.destination });
        }
        // basicInfoConfirmedがtrueの場合のみフィルタリング（falseの場合は全件表示）
        if (filters.basicInfoConfirmed === true) {
          whereConditions.push('c.hearingItems.basicInfoConfirmed = true');
        }
        // ticketConfirmedがtrueの場合のみフィルタリング（falseの場合は全件表示）
        if (filters.ticketConfirmed === true) {
          whereConditions.push('(c.ticketConfirmed = true OR c.hearingItems.ticketConfirmed = true)');
        }
      }

      const whereClause = whereConditions.join(' AND ');

      const countQuery = {
        query: `SELECT VALUE COUNT(1) FROM c WHERE ${whereClause}`,
        parameters
      };

      const { resources: countResult } = await this.container.items
        .query(countQuery)
        .fetchAll();
      
      const totalCount = countResult[0] || 0;

      const dataQuery = {
        query: `SELECT * FROM c WHERE ${whereClause} ORDER BY c.startTime DESC OFFSET @skip LIMIT @limit`,
        parameters: [
          ...parameters,
          { name: '@skip', value: skip },
          { name: '@limit', value: limit }
        ]
      };

      const { resources } = await this.container.items
        .query<ConversationRecord>(dataQuery)
        .fetchAll();

      return {
        conversations: resources,
        totalCount,
        hasMore: skip + limit < totalCount
      };
    } catch (error) {
      console.error('Error fetching conversations by date:', error);
      return { conversations: [], totalCount: 0, hasMore: false };
    }
  }

  async getConversationDetail(conversationId: string): Promise<ConversationRecord | null> {
    await this.initialize();
    
    try {
      if (this.container) {
        // まずconversationIdでクエリして、sessionIdを取得
        const query = {
          query: 'SELECT * FROM c WHERE c.id = @conversationId',
          parameters: [
            { name: '@conversationId', value: conversationId }
          ]
        };
        
        const { resources } = await this.container.items
          .query<ConversationRecord>(query)
          .fetchAll();
        
        if (resources.length > 0) {
          return resources[0];
        }
      }
      return null;
    } catch (error) {
      console.error('Error fetching conversation detail:', error);
      return null;
    }
  }

  async createConversation(sessionId: string): Promise<ConversationRecord> {
    await this.initialize();
    
    // 現在のTTS設定を取得
    const ttsProvider = localStorage.getItem('tts_provider') || 'azure';
    let voiceName = '';
    if (ttsProvider === 'google-cloud') {
      voiceName = localStorage.getItem('google_cloud_voice_name') || 'Kore';
    } else if (ttsProvider === 'azure') {
      voiceName = ConfigManager.getInstance().getConfig()?.azure?.voiceName || 'ja-JP-NanamiNeural';
    }
    
    const conversation: ConversationRecord = {
      id: `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sessionId,
      startTime: new Date().toISOString(),
      status: 'in_progress',
      ticketIssued: false,
      messages: [],
      feedback: {
        hasFeedback: false
      },
      recording: {
        hasRecording: false
      },
      ttsSettings: {
        provider: ttsProvider,
        voiceName: voiceName
      }
    };

    if (this.container) {
      const { resource } = await this.container.items.create(conversation);
      return resource as ConversationRecord;
    }
    
    return conversation;
  }

  async updateConversation(conversationId: string, updates: Partial<ConversationRecord>): Promise<void> {
    await this.initialize();
    
    try {
      if (this.container) {
        // まずconversationIdでクエリして、sessionIdを取得
        const query = {
          query: 'SELECT * FROM c WHERE c.id = @conversationId',
          parameters: [
            { name: '@conversationId', value: conversationId }
          ]
        };
        
        const { resources } = await this.container.items
          .query<ConversationRecord>(query)
          .fetchAll();
        
        if (resources.length > 0) {
          const existing = resources[0];
          const updated = { ...existing, ...updates };
          await this.container.item(conversationId, existing.sessionId).replace(updated);
        }
      }
    } catch (error) {
      console.error('Error updating conversation:', error);
    }
  }

  async addMessage(conversationId: string, message: { role: 'user' | 'assistant'; content: string }): Promise<void> {
    await this.initialize();
    
    try {
      if (this.container) {
        // まずconversationIdでクエリして、sessionIdを取得
        const query = {
          query: 'SELECT * FROM c WHERE c.id = @conversationId',
          parameters: [
            { name: '@conversationId', value: conversationId }
          ]
        };
        
        const { resources } = await this.container.items
          .query<ConversationRecord>(query)
          .fetchAll();
        
        if (resources.length > 0) {
          const existing = resources[0];
          const newMessage = {
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            role: message.role,
            content: message.content,
            timestamp: new Date().toISOString()
          };
          
          existing.messages.push(newMessage);
          await this.container.item(conversationId, existing.sessionId).replace(existing);
        }
      }
    } catch (error) {
      console.error('Error adding message:', error);
    }
  }

  async addFeedback(conversationId: string, feedback: string): Promise<void> {
    await this.initialize();
    
    try {
      if (this.container) {
        // まずconversationIdでクエリして、sessionIdを取得
        const query = {
          query: 'SELECT * FROM c WHERE c.id = @conversationId',
          parameters: [
            { name: '@conversationId', value: conversationId }
          ]
        };
        
        const { resources } = await this.container.items
          .query<ConversationRecord>(query)
          .fetchAll();
        
        if (resources.length > 0) {
          const existing = resources[0];
          existing.feedback = {
            hasFeedback: true,
            content: feedback,
            feedbackTime: new Date().toISOString()
          };
          await this.container.item(conversationId, existing.sessionId).replace(existing);
        }
      }
    } catch (error) {
      console.error('Error adding feedback:', error);
    }
  }

  async updateRecording(conversationId: string, storageUrl: string, sasToken: string): Promise<void> {
    await this.initialize();
    
    try {
      if (this.container) {
        // まずconversationIdでクエリして、sessionIdを取得
        const query = {
          query: 'SELECT * FROM c WHERE c.id = @conversationId',
          parameters: [
            { name: '@conversationId', value: conversationId }
          ]
        };
        
        const { resources } = await this.container.items
          .query<ConversationRecord>(query)
          .fetchAll();
        
        if (resources.length > 0) {
          const existing = resources[0];
          existing.recording = {
            hasRecording: true,
            storageUrl,
            sasToken
          };
          await this.container.item(conversationId, existing.sessionId).replace(existing);
        }
      }
    } catch (error) {
      console.error('Error updating recording:', error);
    }
  }
}