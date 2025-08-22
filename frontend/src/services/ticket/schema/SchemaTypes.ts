import type { TicketInformation, TicketPhases } from '../types';

export type HearingValueType = 'string' | 'number' | 'boolean' | 'date';

export interface HearingField {
  // 状態キー（TicketInformationのキーと一致させる）
  stateKey: keyof TicketInformation;
  // LLM抽出で使うキー（省略時はstateKeyと同じ）
  llmKey?: string;
  name: string;
  description: string;
  valueType: HearingValueType;
  defaultValue?: unknown;
}

export interface HearingRuleContext {
  info: TicketInformation;
  phase: TicketPhases;
}

export interface HearingRule {
  // 抽出対象に含める条件
  includeIf(ctx: HearingRuleContext): boolean;
  // 必須とする条件
  requiredIf(ctx: HearingRuleContext): boolean;
  // クリア（null化）を許容するか
  allowClear?: (ctx: HearingRuleContext) => boolean;
}

export interface HearingItemDefinition {
  field: HearingField;
}

export interface GuidanceTemplate {
  // 次アクションの文テンプレート（必要ならプレースホルダを使用）
  id: string;
  when(ctx: HearingRuleContext): boolean;
  build(ctx: HearingRuleContext): string[]; // 複数行を返せる
}
