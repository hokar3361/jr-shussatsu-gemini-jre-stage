export interface DialogPhase {
  id: string;
  name: string;
  systemPrompt: string;
  transitionMessage?: string;
}

export interface DialogMessage {
  type: 'transition' | 'completion' | 'error';
  content: string;
  timestamp: Date;
}

export interface DialogFlowState {
  currentPhase: DialogPhase;
  messageHistory: DialogMessage[];
}