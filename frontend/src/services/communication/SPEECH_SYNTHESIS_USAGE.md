# 音声合成機能の使用方法

## 概要
Azure音声合成機能を、様々なクラス（ConversationHooks、TicketSystemManager、AzureOpenAIInformationExtractor）から利用できるようになりました。

## アーキテクチャ
```
AzureService (ISpeechSynthesisServiceを実装)
    ├── ConversationContextGenerator（静的クラス）
    │   └── setSpeechSynthesisService()で参照を保持
    │
    └── TicketDialogFlowManager
        └── TicketSystemManager
            ├── setSpeechSynthesisService()で参照を保持
            └── AzureOpenAIInformationExtractor
                └── setSpeechSynthesisService()で参照を保持
```

## 使用例

### 1. ConversationContextGeneratorから使用

```typescript
// 音声合成して再生
await ConversationContextGenerator.synthesizeAndPlaySpeech(
  'ご利用ありがとうございます',
  () => console.log('再生完了')
);
```

### 2. TicketSystemManagerから使用

```typescript
class TicketSystemManager {
  async handlePhaseTransition() {
    // フェーズ遷移時の音声案内
    await this.synthesizeAndPlaySpeech(
      '次の質問にお答えください',
      () => {
        // 音声再生完了後の処理
        this.proceedToNextPhase();
      }
    );
  }
}
```

### 3. AzureOpenAIInformationExtractorから使用

```typescript
class AzureOpenAIInformationExtractor {
  async extractInformation(request: ExtractionRequest) {
    // 情報抽出完了時の音声フィードバック
    if (this.speechSynthesisService) {
      await this.synthesizeAndPlaySpeech(
        '情報を確認しています',
        () => console.log('確認音声再生完了')
      );
    }
    
    // 抽出処理...
  }
}
```

### 4. 外部コンポーネントから使用（useCommunicationフック経由）

```typescript
import { useCommunication } from './hooks/useCommunication';

function MyComponent() {
  const { synthesizeAndPlaySpeech } = useCommunication({ 
    mode: 'azure', 
    config 
  });
  
  const handleClick = async () => {
    await synthesizeAndPlaySpeech('ボタンがクリックされました');
  };
  
  return <button onClick={handleClick}>音声再生</button>;
}
```

### 5. AzureServiceインスタンスから直接使用

```typescript
if (service instanceof AzureService) {
  // 音声合成と再生
  await service.synthesizeAndPlaySpeech('こんにちは');
  
  // 音声合成のみ（データ取得）
  const audioData = await service.synthesizeSpeech('こんにちは');
  
  // 音声データの再生のみ
  service.playSynthesizedAudio(audioData, () => {
    console.log('再生完了');
  });
}
```

## 注意事項

1. **初期化の順序**
   - AzureServiceが初期化された時点で、自動的に各クラスに音声合成サービスの参照が設定されます
   - disconnectメソッドが呼ばれると、全ての参照がクリアされます

2. **null チェック**
   - 音声合成サービスが利用できない場合（Azureモード以外など）は、各メソッドが警告を出力して処理を続行します
   - エラーで処理が止まることはありません

3. **非同期処理**
   - synthesizeAndPlaySpeechは非同期関数です
   - 音声再生完了を待つ場合は、onEndedコールバックを使用してください

## インターフェース定義

```typescript
interface ISpeechSynthesisService {
  // テキストを音声合成して再生
  synthesizeAndPlaySpeech(text: string, onEnded?: () => void): Promise<void>;
  
  // 音声合成のみ（AudioBufferを返す）
  synthesizeSpeech(text: string): Promise<ArrayBuffer | null>;
  
  // 音声データの再生のみ
  playSynthesizedAudio(audioData: ArrayBuffer, onEnded?: () => void): void;
}
```
