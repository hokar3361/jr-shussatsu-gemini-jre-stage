import type { HearingItemDefinition } from './SchemaTypes';

export class PromptBuilder {
  static buildExtractionPrompt(history: string, lastUserMessage: string, items: HearingItemDefinition[]): string {

    //historyから、最後の「駅員: 」から始まるメッセージを取得（改行で区切ってはいけない。単純に最後に登場する「駅員:」を見つけてそれ以降をすべて抜き出す
    const lastAssistantMessageIndex = history.lastIndexOf('駅員: ');
    const lastAssistantMessage = lastAssistantMessageIndex !== -1 
      ? history.substring(lastAssistantMessageIndex) 
      : '';

    //現在日時（日本時間）を取得しておく
    const now = new Date();
    const nowString = now.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

    const itemsText = items.map(it => {
      const key = it.field.llmKey ?? String(it.field.stateKey);
      let typeHint = '';
      switch (it.field.valueType) {
        case 'string': 
          if (key === 'jobanExpressSeatInfo' || key === 'zairaiExpressSeatInfo') {
            typeHint = '（文字列。null非許容）';
          } else {
            typeHint = '（文字列またはnull）';
          }
          break;
        case 'number': typeHint = '（数値またはnull）'; break;
        case 'boolean': 
          if (key === 'ticketConfirmed') {
            typeHint = '（true/false）※発券内容の最終確認項目。内容に合意していないまたは、変更を要求している場合はfalse。';
          } else {
            typeHint = '（true/falseまたはnull）';
          }
          if (key === 'canExtractFromLastUserMessage') {
            typeHint = '（true/false。null非許容）';
          }
          break;
        case 'date': typeHint = '（YYYY-MM-DDまたはnull）'; break;
      }
      return `・${key}：${it.field.description}${typeHint}`;
    }).join('\n');
    return `次の会話は、発券業務を行うJRの駅員と、発券を希望している顧客の会話である。
「★評価対象の利用客の発言★」に基づき、確定した情報のみを抽出せよ。
あくまで抽出するのは、「★評価対象の利用客の発言★」の内容に基づくものであり、それ以外の会話部分は、文脈理解にのみ利用すること。

# 過去の会話内容（文脈理解にのみ利用）：
${history}

# ★評価対象のとなる利用客の返答に対する、駅員の発言
${lastAssistantMessage}

# ★評価対象の利用客の発言★：
${lastUserMessage}

# 抽出すべき項目：
${itemsText}


# 参考情報 - 
${items.some(item => ['phase2_timeSpecification', 'phase2_timeSpecificationType', 'phase2_specificTime', 'travelDate'].includes(item.field.stateKey as string)) 
  ? `- 現在日時：${nowString}` 
  : ''}

# 抽出ルール（重要）
- 直前のアシスタント発話が「〜でよろしいでしょうか？」「〜で問題ないでしょうか？」等の確認で、最新のユーザー発話が肯定（例：「はい」「OK」「お願いします」「ええ」など）の場合、該当項目を確定として抽出する
  - 例：直前に「ご利用日は『今日』でよろしいでしょうか？」→最新ユーザーが「はい」→ travelDate に『今日』を設定（本日を意味する文字列で可）
  - 例：直前に「座席未指定でよろしいでしょうか？」→最新ユーザーが「OK」→ confirmUnspecifiedSeat=true を設定
- 会話に言及のない項目は出力しない（空値のための出力は禁止）
- ユーザーが取り消し/否定を示した場合は null または適切なfalseを出力
-「もっと、遅いので」、は「遅い経路にしてください」。「もっと、早いので」「早い経路にしてください」を要求していることに注意。（早いので、もっと遅くしてれという意味ではない）
- フィラーのようなユーザーの発言の場合は、何も出力しないこと。（ええと、あのなど、意味をなさないもの）

# 注意
- 「よろしいですか？」に対して「いいです」は、「OKです」。
- 会話の履歴全体をもとに、会話を理解。
- 項目の抽出は、最後のユーザーの発言からのみ行うこと。（途中のユーザーとAIの発言は、会話の文脈理解の身に利用し、変更点の検出は最後のユーザーの発言に基づくこと）

# 出力
canExtractFromLastUserMessageは必ず出力。
それ以外の項目は、変更があった項目のみをJSONで厳密に出力（余計な文字やコメントは不可）`;
  }
}
