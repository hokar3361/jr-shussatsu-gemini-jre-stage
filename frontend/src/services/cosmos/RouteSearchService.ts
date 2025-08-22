import { CosmosClient, Database, Container } from '@azure/cosmos';
import type { Route, RouteSearchResult } from './types';
import { ConfigManager } from '../../config/ConfigManager';

export class RouteSearchService {
  private client: CosmosClient | null = null;
  private database: Database | null = null;
  private container: Container | null = null;
  private initialized: boolean = false;
  private cosmosConfig: { endpoint: string; key: string } | null = null;

  constructor(cosmosConfig?: { endpoint: string; key: string }) {
    if (cosmosConfig) {
      this.cosmosConfig = cosmosConfig;
      this.initializeClient();
    } else {
      // ConfigManagerから設定を取得
      const config = ConfigManager.getInstance().getCosmosConfig();
      if (config) {
        this.cosmosConfig = config;
        this.initializeClient();
      }
    }
  }

  setConfig(cosmosConfig: { endpoint: string; key: string }) {
    this.cosmosConfig = cosmosConfig;
    this.initializeClient();
  }

  private initializeClient() {
    if (!this.cosmosConfig) {
      throw new Error('Cosmos DB configuration not provided');
    }

    const { endpoint, key } = this.cosmosConfig;
    
    if (!endpoint || !key) {
      throw new Error('Cosmos DB configuration missing. Please check Cosmos DB endpoint and key configuration.');
    }

    this.client = new CosmosClient({ endpoint, key });
    this.database = this.client.database('jr-ticket-db');
    this.container = this.database.container('routes');
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;
    
    // 設定がまだない場合は、ConfigManagerから再取得を試みる
    if (!this.client && !this.cosmosConfig) {
      const config = ConfigManager.getInstance().getCosmosConfig();
      if (config) {
        this.cosmosConfig = config;
        this.initializeClient();
      } else {
        throw new Error('Cosmos DB configuration not available');
      }
    }
    
    if (!this.database || !this.container) {
      throw new Error('Cosmos DB client not initialized');
    }
    
    try {
      await this.database.read();
      await this.container.read();
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize Cosmos DB connection:', error);
      throw new Error('Failed to connect to Cosmos DB');
    }
  }

  async searchRoutes(originName: string, destinationName: string): Promise<RouteSearchResult> {
    if (!originName || originName.trim() === '' || !destinationName || destinationName.trim() === '') {
      return { routes: [], searchTime: 0 };
    }

    await this.initialize();
    
    const startTime = Date.now();
    
    try {
      const query = {
        query: 'SELECT * FROM c WHERE c.origin.name = @originName AND c.destination.name = @destinationName',
        parameters: [
          {
            name: '@originName',
            value: originName
          },
          {
            name: '@destinationName',
            value: destinationName
          }
        ]
      };

      if (this.container) {
      const { resources } = await this.container.items
        .query<Route>(query)
        .fetchAll();

      const sortedRoutes = this.sortRoutesByArrivalTime(resources);
      
      const searchTime = Date.now() - startTime;
      
      console.log(`Route search completed: found ${sortedRoutes.length} routes from ${originName} to ${destinationName} in ${searchTime}ms`);
      
      return {
        routes: sortedRoutes,
        searchTime
      };
    } else {
      console.error('Cosmos DB container not initialized');
      return { routes: [], searchTime: 0 };
    }
    } catch (error) {
      console.error('Error searching routes:', error);
      throw new Error(`Failed to search routes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 出発時刻の下限(HH:MM)でフィルタしたルートを取得（到着時刻昇順）
   */
  async searchRoutesWithMinDeparture(
    originName: string,
    destinationName: string,
    minDepartureHHMM?: string
  ): Promise<RouteSearchResult> {
    const result = await this.searchRoutes(originName, destinationName);
    if (!minDepartureHHMM) return result;

    const minSec = this.parseHHMMToSeconds(minDepartureHHMM);
    const filtered = result.routes.filter(r => this.parseTimeString(r.departureTime) >= minSec);
    return { routes: this.sortRoutesByArrivalTime(filtered), searchTime: result.searchTime };
  }

  private parseHHMMToSeconds(hhmm: string): number {
    const m = hhmm.match(/(\d{1,2}):(\d{2})/);
    if (!m) return 0;
    const h = parseInt(m[1], 10);
    const mnt = parseInt(m[2], 10);
    return h * 3600 + mnt * 60;
  }

  private sortRoutesByArrivalTime(routes: Route[]): Route[] {
    return routes.sort((a, b) => {
      const timeA = this.parseTimeString(a.arrivalTime);
      const timeB = this.parseTimeString(b.arrivalTime);
      return timeA - timeB;
    });
  }

  private parseTimeString(timeStr: string): number {
    const parts = timeStr.split(':');
    if (parts.length !== 3) {
      console.warn(`Invalid time format: ${timeStr}`);
      return 0;
    }
    
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseInt(parts[2], 10);
    
    return hours * 3600 + minutes * 60 + seconds;
  }

  static formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours}時間`);
    if (minutes > 0) parts.push(`${minutes}分`);
    if (secs > 0) parts.push(`${secs}秒`);
    
    return parts.length > 0 ? parts.join('') : '0秒';
  }

  generateRouteDescription(legs: Route['legs']): string {
    if (!legs || legs.length === 0) return '';
    
    const parts: string[] = [];
    
    legs.forEach((leg, index) => {
      if (index === 0) {
        parts.push(leg.from.name);
      }
      
      let legDesc = `（${leg.senkuName}`;
      if (leg.isExpress) {
        legDesc += '[特急]';
      }
      legDesc += '）→ ' + leg.to.name;
      
      parts.push(legDesc);
    });
    
    return parts.join(' ');
  }
}