import type { TicketInformation } from '../types';
import type { HearingItemDefinition } from './SchemaTypes';

export class ExtractionMapper {
  static mapJsonToTicketInfo(parsed: any, items: HearingItemDefinition[]): Partial<TicketInformation> {
    const result: Partial<TicketInformation> = {};
    for (const it of items) {
      const key = it.field.llmKey ?? String(it.field.stateKey);
      if (parsed[key] !== undefined) {
        (result as any)[it.field.stateKey] = parsed[key];
      }
    }
    return result;
  }
}
