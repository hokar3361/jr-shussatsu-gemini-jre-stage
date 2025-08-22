export class AudioRecordingService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private isRecording: boolean = false;
  private stream: MediaStream | null = null;

  async startRecording(): Promise<void> {
    if (this.isRecording) {
      console.warn('Already recording');
      return;
    }

    try {
      // マイクへのアクセス許可を取得
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });

      // MediaRecorderの設定
      const options: MediaRecorderOptions = {
        mimeType: this.getSupportedMimeType()
      };

      this.mediaRecorder = new MediaRecorder(this.stream, options);
      this.audioChunks = [];

      // データが利用可能になったときの処理
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      // 録音開始
      this.mediaRecorder.start(1000); // 1秒ごとにデータを取得
      this.isRecording = true;
      console.log('Recording started');
    } catch (error) {
      console.error('Failed to start recording:', error);
      throw error;
    }
  }

  async stopRecording(): Promise<Blob | null> {
    if (!this.isRecording || !this.mediaRecorder) {
      console.warn('Not recording');
      return null;
    }

    return new Promise((resolve) => {
      if (!this.mediaRecorder) {
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = () => {
        // 録音データをBlobに変換
        const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
        const audioBlob = new Blob(this.audioChunks, { type: mimeType });
        
        // ストリームを停止
        if (this.stream) {
          this.stream.getTracks().forEach(track => track.stop());
          this.stream = null;
        }

        this.isRecording = false;
        this.audioChunks = [];
        console.log('Recording stopped, blob size:', audioBlob.size);
        
        resolve(audioBlob);
      };

      this.mediaRecorder.stop();
    });
  }

  private getSupportedMimeType(): string {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/ogg'
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        console.log('Using MIME type:', type);
        return type;
      }
    }

    // フォールバック
    return 'audio/webm';
  }

  isCurrentlyRecording(): boolean {
    return this.isRecording;
  }

  // 録音データをBase64に変換
  async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        // data:audio/webm;base64, の部分を削除
        const base64Data = base64.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // 録音データをArrayBufferに変換
  async blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
    return blob.arrayBuffer();
  }
}