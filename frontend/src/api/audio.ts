/**
 * 音声録音関連のAPI
 */

export interface UploadAudioResponse {
  storageUrl: string;
  sasToken: string;
}

/**
 * 音声データをAzure Storageにアップロード
 * @param conversationId 会話ID
 * @param audioData 音声データ（ArrayBuffer）
 * @returns アップロード結果（Storage URLとSASトークン）
 */
export async function uploadAudioToStorage(
  conversationId: string,
  audioData: ArrayBuffer
): Promise<UploadAudioResponse> {
  try {
    // ArrayBufferをBase64に変換
    const base64Data = btoa(
      new Uint8Array(audioData).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );

    // バックエンドAPIにPOST
    const response = await fetch('/api/storage/upload-recording', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversation_id: conversationId,
        audio_data: base64Data,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to upload audio: ${response.statusText}`);
    }

    const result = await response.json();
    
    return {
      storageUrl: result.storage_url,
      sasToken: result.sas_token,
    };
  } catch (error) {
    console.error('Error uploading audio to storage:', error);
    throw error;
  }
}

/**
 * 音声ファイルを直接アップロード（Blobとして）
 * @param conversationId 会話ID
 * @param audioBlob 音声Blob
 * @returns アップロード結果（Storage URLとSASトークン）
 */
export async function uploadAudioBlobToStorage(
  conversationId: string,
  audioBlob: Blob
): Promise<UploadAudioResponse> {
  try {
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.webm');

    // バックエンドAPIにPOST（マルチパート）
    const response = await fetch(`/api/storage/upload-recording-file?conversation_id=${conversationId}`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Failed to upload audio: ${response.statusText}`);
    }

    const result = await response.json();
    
    return {
      storageUrl: result.storage_url,
      sasToken: result.sas_token,
    };
  } catch (error) {
    console.error('Error uploading audio blob to storage:', error);
    throw error;
  }
}