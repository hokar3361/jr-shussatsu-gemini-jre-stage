import * as speechSdk from 'microsoft-cognitiveservices-speech-sdk';
import type { AzureSpeechConfig } from './types';
import { getRecognitionPhrases, getStationDictionary } from '../../constants/jrStationDictionary';

export class AzureSpeechService {
  [x: string]: any;
  private speechConfig: speechSdk.SpeechConfig | null = null;
  private recognizer: speechSdk.SpeechRecognizer | null = null;
  private synthesizer: speechSdk.SpeechSynthesizer | null = null;
  private recognizedCallbacks: ((text: string) => void)[] = [];
  private recognizingCallbacks: ((text: string) => void)[] = [];
  private errorCallbacks: ((error: Error) => void)[] = [];
  private isRecognizing: boolean = false;
  private isSpeaking: boolean = false;
  private phraseListGrammar: speechSdk.PhraseListGrammar | null = null;

  constructor(private config: AzureSpeechConfig) {}

  async initialize(): Promise<void> {
    try {
      // console.log('[AzureSpeechService] Initializing with config:', {
      //   subscriptionKeyExists: !!this.config.subscriptionKey,
      //   region: this.config.region
      // });
      
      if (!this.config.subscriptionKey) {
        throw new Error('subscriptionKey is required but was not provided');
      }
      
      // Create speech config
      this.speechConfig = speechSdk.SpeechConfig.fromSubscription(
        this.config.subscriptionKey,
        this.config.region
      );

      // Set language
      this.speechConfig.speechRecognitionLanguage = this.config.language || 'ja-JP';
      this.speechConfig.speechSynthesisVoiceName = this.config.voiceName || 'ja-JP-NanamiNeural';

      // Create recognizer with microphone input
      const audioConfig = speechSdk.AudioConfig.fromDefaultMicrophoneInput();
      this.recognizer = new speechSdk.SpeechRecognizer(this.speechConfig, audioConfig);

      // JR駅名のフレーズリストを設定
      this.setupPhraseList();

      // Create synthesizer with audio stream output (no automatic playback)
      const audioStream = speechSdk.AudioOutputStream.createPullStream();
      const streamConfig = speechSdk.AudioConfig.fromStreamOutput(audioStream);
      this.synthesizer = new speechSdk.SpeechSynthesizer(this.speechConfig, streamConfig);

      // Set up recognizer event handlers
      this.setupRecognizerEvents();
    } catch (error) {
      throw new Error(`Failed to initialize Azure Speech Service: ${error}`);
    }
  }

  private setupPhraseList(): void {
    if (!this.recognizer) return;

    // フレーズリストグラマーを作成
    this.phraseListGrammar = speechSdk.PhraseListGrammar.fromRecognizer(this.recognizer);
    
    // JR駅名の発音辞書からフレーズを追加
    const phrases = getRecognitionPhrases();
    phrases.forEach(phrase => {
      this.phraseListGrammar!.addPhrase(phrase);
    });

    console.log(`Added ${phrases.length} phrases to recognition grammar`);
  }

  startContinuousRecognition(): void {
    if (!this.recognizer) {
      throw new Error('Speech service not initialized');
    }

    if (this.isRecognizing) {
      return;
    }

    this.isRecognizing = true;
    this.recognizer.startContinuousRecognitionAsync(
      () => console.log('Started continuous recognition'),
      (error) => this.notifyError(new Error(`Failed to start recognition: ${error}`))
    );
  }

  stopContinuousRecognition(): void {
    if (!this.recognizer || !this.isRecognizing) {
      return;
    }

    this.isRecognizing = false;
    this.recognizer.stopContinuousRecognitionAsync(
      () => console.log('Stopped continuous recognition'),
      (error) => this.notifyError(new Error(`Failed to stop recognition: ${error}`))
    );
  }

  async recognizeSpeech(): Promise<string> {
    if (!this.recognizer) {
      throw new Error('Speech service not initialized');
    }

    return new Promise((resolve, reject) => {
      this.recognizer!.recognizeOnceAsync(
        (result) => {
          if (result.reason === speechSdk.ResultReason.RecognizedSpeech) {
            resolve(result.text);
          } else if (result.reason === speechSdk.ResultReason.NoMatch) {
            resolve('');
          } else {
            reject(new Error('Speech recognition failed'));
          }
        },
        (error) => reject(new Error(`Recognition error: ${error}`))
      );
    });
  }

  async synthesizeSpeech(text: string): Promise<ArrayBuffer> {
    if (!this.synthesizer) {
      throw new Error('Speech service not initialized');
    }

    // JR駅名が含まれているかチェックし、必要に応じてSSMLに変換
    const processedText = this.processTextForPronunciation(text);
    const isSSML = processedText.startsWith('<speak');

    this.isSpeaking = true;
    return new Promise((resolve, reject) => {
      const synthesizeMethod = isSSML ? 
        this.synthesizer!.speakSsmlAsync.bind(this.synthesizer) :
        this.synthesizer!.speakTextAsync.bind(this.synthesizer);

      synthesizeMethod(
        processedText,
        (result) => {
          this.isSpeaking = false;
          if (result.reason === speechSdk.ResultReason.SynthesizingAudioCompleted) {
            resolve(result.audioData);
          } else {
            console.error('[AzureSpeechService] Synthesis failed:', result.reason, result.errorDetails);
            reject(new Error(`Speech synthesis failed: ${result.errorDetails || 'Unknown error'}`));
          }
        },
        (error) => {
          this.isSpeaking = false;
          console.error('[AzureSpeechService] Synthesis error:', error);
          reject(new Error(`Synthesis error: ${error}`));
        }
      );
    });
  }

  private processTextForPronunciation(text: string): string {
    // JR関連用語が含まれているかチェック
    let hasTargetTerm = false;
    const dictionary = getStationDictionary();

    dictionary.forEach(term => {
      if (text.includes(term.term)) {
        hasTargetTerm = true;
      }
    });

    // 対象用語が含まれていない場合はそのまま返す
    if (!hasTargetTerm) {
      return text;
    }

    // SSMLを生成
    let ssmlText = text;
    dictionary.forEach(term => {
      if (text.includes(term.term)) {
        // 日本語の読み方を優先的に使用（IPA形式は日本語音声合成では不安定）
        if (term.reading) {
          const subTag = `<sub alias="${term.reading}">${term.term}</sub>`;
          ssmlText = ssmlText.replace(new RegExp(term.term, 'g'), subTag);
        }
      }
    });

    // SSMLドキュメントとして整形
    const ssmlDocument = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ja-JP">
      <voice name="${this.config.voiceName || 'ja-JP-NanamiNeural'}">
        ${ssmlText}
      </voice>
    </speak>`;
    
    // console.log('[AzureSpeechService] Generated SSML:', ssmlDocument);
    return ssmlDocument;
  }

  async synthesizeSsml(ssml: string): Promise<ArrayBuffer> {
    if (!this.synthesizer) {
      throw new Error('Speech service not initialized');
    }

    this.isSpeaking = true;
    return new Promise((resolve, reject) => {
      this.synthesizer!.speakSsmlAsync(
        ssml,
        (result) => {
          this.isSpeaking = false;
          if (result.reason === speechSdk.ResultReason.SynthesizingAudioCompleted) {
            resolve(result.audioData);
          } else {
            reject(new Error('SSML synthesis failed'));
          }
        },
        (error) => {
          this.isSpeaking = false;
          reject(new Error(`SSML synthesis error: ${error}`));
        }
      );
    });
  }


  getIsSpeaking(): boolean {
    return this.isSpeaking;
  }

  onRecognized(callback: (text: string) => void): void {
    this.recognizedCallbacks.push(callback);
  }

  onRecognizing(callback: (text: string) => void): void {
    this.recognizingCallbacks.push(callback);
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallbacks.push(callback);
  }

  dispose(): void {
    if (this.recognizer) {
      this.recognizer.close();
      this.recognizer = null;
    }

    if (this.synthesizer) {
      this.synthesizer.close();
      this.synthesizer = null;
    }

    this.speechConfig = null;
    this.recognizedCallbacks = [];
    this.errorCallbacks = [];
  }

  private setupRecognizerEvents(): void {
    if (!this.recognizer) return;

    // Handle interim recognition results
    this.recognizer.recognizing = (_s, e) => {
      if (e.result.reason === speechSdk.ResultReason.RecognizingSpeech) {
        // 認識中のテキストも変換（デフォルトでは数字変換あり）
        const convertedText = this.convertRecognizedText(e.result.text);
        this.notifyRecognizing(convertedText);
      }
    };

    // Handle final recognition results
    this.recognizer.recognized = (_s, e) => {
      if (e.result.reason === speechSdk.ResultReason.RecognizedSpeech) {
        // 認識完了時に駅名を変換（デフォルトでは数字変換あり）
        const convertedText = this.convertRecognizedText(e.result.text);
        this.notifyRecognized(convertedText);
      }
    };

    // Handle errors
    this.recognizer.canceled = (_s, e) => {
      if (e.reason === speechSdk.CancellationReason.Error) {
        this.notifyError(new Error(`Recognition error: ${e.errorDetails}`));
      }
    };
  }

  /**
   * 音声認識結果のテキストを駅名辞書に基づいて変換
   */
  private convertRecognizedText(text: string): string {
    let convertedText = text;
    
    // JR関連用語辞書を使用して変換
    const dictionary = getStationDictionary();
    dictionary.forEach(term => {
      // ひらがな読みから漢字に変換
      if (convertedText.includes(term.reading)) {
        convertedText = convertedText.replace(new RegExp(term.reading, 'g'), term.term);
      }
      
      // 代替表記からも変換
      if (term.alternativeSpellings) {
        term.alternativeSpellings.forEach(spelling => {
          if (convertedText.includes(spelling)) {
            convertedText = convertedText.replace(new RegExp(spelling, 'g'), term.term);
          }
        });
      }
    });
    
    return convertedText;
  }

  private notifyRecognized(text: string): void {
    this.recognizedCallbacks.forEach(callback => callback(text));
  }

  private notifyRecognizing(text: string): void {
    this.recognizingCallbacks.forEach(callback => callback(text));
  }

  private notifyError(error: Error): void {
    this.errorCallbacks.forEach(callback => callback(error));
  }
}