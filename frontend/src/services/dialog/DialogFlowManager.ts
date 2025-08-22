import type { DialogPhase, DialogMessage, DialogFlowState } from '../../types/dialog';
// import { DIALOG_MESSAGES } from '../../constants/dialogMessages';

export class DialogFlowManager {
  protected currentPhase: DialogPhase;
  protected phases: Map<string, DialogPhase>;
  protected messageHistory: DialogMessage[] = [];
  protected onStateChange?: (state: DialogFlowState) => void;
  protected onPhaseChanged?: (newPhase: string) => void;

  constructor() {
    this.phases = new Map();
    // this.initializePhases();
    this.currentPhase = this.phases.get('phase1')!;
  }

  // protected initializePhases(): void {
  //   this.phases.set('phase1', {
  //     id: 'phase1',
  //     name: 'フェーズ1',
  //     systemPrompt: 'あなたは親切で役立つアシスタントです。日本語で応答してください。',
  //     transitionMessage: DIALOG_MESSAGES.PHASE_TRANSITION.PHASE_1_START,
  //   });

  //   this.phases.set('phase2', {
  //     id: 'phase2',
  //     name: 'フェーズ2',
  //     systemPrompt: 'あなたは専門的な知識を持つアシスタントです。詳細な情報を提供してください。日本語で応答してください。',
  //     transitionMessage: DIALOG_MESSAGES.PHASE_TRANSITION.PHASE_2_START,
  //   });

  //   this.phases.set('phase3', {
  //     id: 'phase3',
  //     name: 'フェーズ3',
  //     systemPrompt: 'あなたは問題解決に特化したアシスタントです。具体的な解決策を提案してください。日本語で応答してください。',
  //     transitionMessage: DIALOG_MESSAGES.PHASE_TRANSITION.PHASE_3_START,
  //   });
  // }

  public transitionToPhase(phaseId: string): void {
    const phase = this.phases.get(phaseId);
    if (!phase) {
      // this.addMessage('error', DIALOG_MESSAGES.ERROR.INVALID_PHASE);
      throw new Error(`Invalid phase: ${phaseId}`);
    }

    this.currentPhase = phase;
    if (phase.transitionMessage) {
      this.addMessage('transition', phase.transitionMessage);
    }

    this.notifyStateChange();
  }

  public getCurrentPrompt(): string {
    // if (!this.currentPhase) {
    //   throw new Error(DIALOG_MESSAGES.ERROR.PROMPT_NOT_FOUND);
    // }
    return this.currentPhase.systemPrompt;
  }

  public getCurrentPhase(): DialogPhase {
    return this.currentPhase;
  }

  public generateTransitionMessage(): string {
    return this.currentPhase.transitionMessage || '';
  }

  // public generateCompletionMessage(type: 'user' | 'ai'): string {
  //   if (type === 'user') {
  //     return DIALOG_MESSAGES.COMPLETION.USER_MESSAGE;
  //   } else {
  //     return DIALOG_MESSAGES.COMPLETION.AI_MESSAGE;
  //   }
  // }

  // public generateProgressMessage(): string {
  //   return DIALOG_MESSAGES.COMPLETION.DIALOG_PROGRESS;
  // }

  public addMessage(type: DialogMessage['type'], content: string): void {
    const message: DialogMessage = {
      type,
      content,
      timestamp: new Date(),
    };
    this.messageHistory.push(message);
    this.notifyStateChange();
  }

  public getMessageHistory(): DialogMessage[] {
    return [...this.messageHistory];
  }

  public clearHistory(): void {
    this.messageHistory = [];
    this.notifyStateChange();
  }

  public setOnStateChange(callback: (state: DialogFlowState) => void): void {
    this.onStateChange = callback;
  }

  private notifyStateChange(): void {
    if (this.onStateChange) {
      this.onStateChange({
        currentPhase: this.currentPhase,
        messageHistory: this.getMessageHistory(),
      });
    }
  }

  public reset(): void {
    this.currentPhase = this.phases.get('phase1')!;
    this.clearHistory();
  }

  public setOnPhaseChanged(callback: (newPhase: string) => void): void {
    console.log('[DialogFlowManager] setOnPhaseChanged called');
    this.onPhaseChanged = callback;
  }
}