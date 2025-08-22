import type { TicketSystemState } from '../types';

export class GuidanceBuilder {
  // 段階1では未使用。今後 ConversationHooks に導入予定。
  static buildBeforeAIResponseMessage(_state: TicketSystemState): string | null {
    // プレースホルダ：実装は段階3
    return null;
  }
}
