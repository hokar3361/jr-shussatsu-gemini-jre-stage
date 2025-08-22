export type DebugRole = 'system' | 'assistant' | 'user';

export interface DebugMessage {
  content: string;
  role?: DebugRole;
  important?: boolean;
}

type Handler = (msg: DebugMessage) => void;

export class DebugChatInjector {
  private static handler: Handler | null = null;
  private static enabled = true;
  private static buffer: DebugMessage[] = [];

  static setHandler(handler: Handler): void {
    DebugChatInjector.handler = handler;
    // Flush buffered messages
    if (DebugChatInjector.enabled && DebugChatInjector.buffer.length > 0) {
      for (const msg of DebugChatInjector.buffer) {
        try {
          handler(msg);
        } catch {
          // ignore
        }
      }
      DebugChatInjector.buffer = [];
    }
  }

  static setEnabled(enabled: boolean): void {
    DebugChatInjector.enabled = enabled;
  }

  static post(content: string, role: DebugRole = 'system', important = false): void {
    const msg: DebugMessage = { content, role, important };
    if (!DebugChatInjector.enabled) return;
    if (DebugChatInjector.handler) {
      try {
        DebugChatInjector.handler(msg);
      } catch {
        // ignore
      }
    } else {
      DebugChatInjector.buffer.push(msg);
    }
  }
}



