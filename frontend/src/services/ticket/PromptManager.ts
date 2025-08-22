import { TicketPhases } from './types';
import type { ExtractionRequest } from './types';

export class PromptManager {
  // 情報抽出用のプロンプトを生成
  static generateExtractionPrompt(request: ExtractionRequest): string {
    const basePrompt = `以下の会話履歴から、確定した情報を抽出してください。
最終的に確定した情報のみを返してください。
あいまいな情報や未確定の情報は含めないでください。

会話履歴:
${request.conversationHistory}

以下のJSON形式で返してください：`;

    switch (request.currentPhase) {
      case TicketPhases.BASIC_INFO:
        return `${basePrompt}
{
  "destination": "行先駅名（確定していない場合はnull）",
  "travelDate": "利用日（YYYY-MM-DD形式、確定していない場合はnull）",
  "adultCount": 大人の人数（数値、確定していない場合はnull）,
  "childCount": 子供の人数（数値、確定していない場合はnull）
}

注意事項:
- 駅名は正式名称で記載（例：「東京」「新宿」「横浜」）
- 日付は必ずYYYY-MM-DD形式に変換（例：「明日」→ 実際の日付）
- 人数は数値型で返す（例：1, 2, 3）
- 子供の人数が明示されていない場合は0として扱う`;

      // 今後のフェーズ用（Phase2以降で実装）
      case TicketPhases.ROUTE_SEARCH:
      case TicketPhases.SEAT_SELECTION:
      case TicketPhases.PAYMENT:
      case TicketPhases.CONFIRMATION:
        return `${basePrompt}
{
  // Phase${request.currentPhase}の抽出項目（未実装）
}`;

      default:
        throw new Error(`Unknown phase: ${request.currentPhase}`);
    }
  }

  // 会話履歴をフォーマット
  static formatConversationHistory(
    history: Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }>
  ): string {
    if (history.length === 0) return '';
    
    // すべての会話履歴をフォーマット
    const messages: string[] = [];
    
    for (const msg of history) {
      const role = msg.role === 'user' ? 'ユーザー' : 'アシスタント';
      messages.push(`${role}: ${msg.content}`);
    }

    //最後のユーザーの発言の先頭に【★今回評価する対象の発言★】というマークを付ける
    const lastUserMessage = messages[messages.length - 1];
    
    //まず最後のメッセージ以外を単純に改行で連結
    const messagesText = messages.slice(0, -1).join('\n');

    //最後のメッセージを、【★今回評価する対象のユーザーの発言★】というマークを付けて、改行で連結
    const lastUserMessageText = `\n\n今回評価する対象のユーザーの発言：\n${lastUserMessage}`;

    return messagesText + '\n' + lastUserMessageText;
  }

  // デバッグ用：生成されたプロンプトをログ出力
  static logPrompt(prompt: string, phase: TicketPhases): void {
    console.log(`[PromptManager] Generated prompt for phase ${phase}:`);
    console.log(prompt);
    console.log('---');
  }
}