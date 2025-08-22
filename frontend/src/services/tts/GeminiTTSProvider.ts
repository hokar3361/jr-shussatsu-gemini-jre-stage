import { GoogleGenAI } from '@google/genai';
import type { ITTSProvider } from './ITTSProvider';

interface GeminiTTSConfig {
  apiKey: string;
  voiceName?: string;
  temperature?: number;
}

export class GeminiTTSProvider implements ITTSProvider {
  private ai: GoogleGenAI | null = null;
  private isSpeaking: boolean = false;
  private voiceName: string = 'Zephyr';
  private temperature: number = 1;

  constructor(private config: GeminiTTSConfig) {
    if (config.voiceName) {
      this.voiceName = config.voiceName;
    }
    if (config.temperature !== undefined) {
      this.temperature = config.temperature;
    }
  }

  async initialize(): Promise<void> {
    try {
      if (!this.config.apiKey) {
        throw new Error('Gemini API key is required');
      }

      this.ai = new GoogleGenAI({
        apiKey: this.config.apiKey,
      });

      console.log('[GeminiTTSProvider] Initialized successfully');
    } catch (error) {
      console.error('[GeminiTTSProvider] Failed to initialize:', error);
      throw new Error(`Failed to initialize Gemini TTS: ${error}`);
    }
  }

  async synthesizeSpeech(text: string): Promise<ArrayBuffer> {
    if (!this.ai) {
      throw new Error('Gemini TTS provider not initialized');
    }

    this.isSpeaking = true;

    try {
      const modelConfig = {
        temperature: this.temperature,
        responseModalities: ['audio' as const],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: this.voiceName
            }
          }
        },
      };

      // const model = 'gemini-2.5-pro-preview-tts';
      const model = 'gemini-2.5-flash-preview-tts';
      const contents = [
        {
          role: 'user' as const,
          parts: [
            {
              text: text,
            },
          ],
        },
      ];

      // ストリーミングレスポンスを取得
      const response = await this.ai.models.generateContentStream({
        model,
        config: modelConfig,
        contents,
      });

      // 音声データを収集
      const audioChunks: Uint8Array[] = [];
      
      for await (const chunk of response) {
        if (chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
          const inlineData = chunk.candidates[0].content.parts[0].inlineData;
          
          if (inlineData.data) {
            // Base64データをデコード
            const binaryString = atob(inlineData.data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            
            // MIMEタイプに基づいてWAV形式に変換
            if (inlineData.mimeType && !inlineData.mimeType.includes('wav')) {
              // WAVヘッダーを追加
              const wavData = this.convertToWav(bytes, inlineData.mimeType);
              audioChunks.push(wavData);
            } else {
              audioChunks.push(bytes);
            }
          }
        }
      }

      // すべてのチャンクを結合
      const totalLength = audioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of audioChunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }

      this.isSpeaking = false;
      return result.buffer;
    } catch (error) {
      this.isSpeaking = false;
      console.error('[GeminiTTSProvider] Synthesis error:', error);
      throw new Error(`Speech synthesis failed: ${error}`);
    }
  }

  getIsSpeaking(): boolean {
    return this.isSpeaking;
  }

  dispose(): void {
    this.ai = null;
    this.isSpeaking = false;
  }

  /**
   * 音声データをWAV形式に変換
   */
  private convertToWav(audioData: Uint8Array, mimeType: string): Uint8Array {
    // MIMEタイプから音声パラメータを解析
    const options = this.parseMimeType(mimeType);
    
    // WAVヘッダーを作成
    const wavHeader = this.createWavHeader(audioData.length, options);
    
    // ヘッダーとデータを結合
    const result = new Uint8Array(wavHeader.length + audioData.length);
    result.set(wavHeader, 0);
    result.set(audioData, wavHeader.length);
    
    return result;
  }

  /**
   * MIMEタイプから音声パラメータを解析
   */
  private parseMimeType(mimeType: string): WavConversionOptions {
    const [fileType, ...params] = mimeType.split(';').map(s => s.trim());
    const [, format] = fileType.split('/');

    const options: WavConversionOptions = {
      numChannels: 1,
      sampleRate: 24000,
      bitsPerSample: 16
    };

    // L16形式の場合、ビット深度を抽出
    if (format && format.startsWith('L')) {
      const bits = parseInt(format.slice(1), 10);
      if (!isNaN(bits)) {
        options.bitsPerSample = bits;
      }
    }

    // パラメータからサンプルレートを抽出
    for (const param of params) {
      const [key, value] = param.split('=').map(s => s.trim());
      if (key === 'rate') {
        options.sampleRate = parseInt(value, 10);
      }
    }

    return options;
  }

  /**
   * WAVヘッダーを作成
   */
  private createWavHeader(dataLength: number, options: WavConversionOptions): Uint8Array {
    const { numChannels, sampleRate, bitsPerSample } = options;
    const byteRate = sampleRate * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    
    const buffer = new ArrayBuffer(44);
    const view = new DataView(buffer);
    const encoder = new TextEncoder();

    // RIFF header
    view.setUint8(0, encoder.encode('R')[0]);
    view.setUint8(1, encoder.encode('I')[0]);
    view.setUint8(2, encoder.encode('F')[0]);
    view.setUint8(3, encoder.encode('F')[0]);
    view.setUint32(4, 36 + dataLength, true);
    
    // WAVE header
    view.setUint8(8, encoder.encode('W')[0]);
    view.setUint8(9, encoder.encode('A')[0]);
    view.setUint8(10, encoder.encode('V')[0]);
    view.setUint8(11, encoder.encode('E')[0]);
    
    // fmt subchunk
    view.setUint8(12, encoder.encode('f')[0]);
    view.setUint8(13, encoder.encode('m')[0]);
    view.setUint8(14, encoder.encode('t')[0]);
    view.setUint8(15, encoder.encode(' ')[0]);
    view.setUint32(16, 16, true); // Subchunk1Size
    view.setUint16(20, 1, true); // AudioFormat (PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    
    // data subchunk
    view.setUint8(36, encoder.encode('d')[0]);
    view.setUint8(37, encoder.encode('a')[0]);
    view.setUint8(38, encoder.encode('t')[0]);
    view.setUint8(39, encoder.encode('a')[0]);
    view.setUint32(40, dataLength, true);

    return new Uint8Array(buffer);
  }
}

interface WavConversionOptions {
  numChannels: number;
  sampleRate: number;
  bitsPerSample: number;
}