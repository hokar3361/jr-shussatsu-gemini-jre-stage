"""
Google Cloud Text-to-Speech APIのPython実装
WebSocketサーバーと同じプロセスで動作可能
"""
import os
import json
import struct
import numpy as np
from scipy import signal
from google.cloud import texttospeech
from google.oauth2 import service_account
from typing import Optional

class GoogleCloudTTSService:
    """Google Cloud Text-to-Speech サービス"""
    
    # Chirp 3: HD音声のリスト
    CHIRP3_HD_VOICES = {
        'Aoede': 'female',
        'Puck': 'male',
        'Charon': 'male',
        'Kore': 'female',
        'Fenrir': 'male',
        'Leda': 'female',
        'Orus': 'male',
        'Zephyr': 'female'
    }
    
    def __init__(self, credentials_path: Optional[str] = None):
        """
        初期化
        Args:
            credentials_path: 認証情報JSONファイルのパス（オプション）
        """
        # 環境変数からJSON文字列として認証情報を取得
        if os.environ.get('GOOGLE_CREDENTIALS_JSON'):
            # 環境変数からJSON文字列を読み込み
            credentials_json = os.environ.get('GOOGLE_CREDENTIALS_JSON')
            credentials_dict = json.loads(credentials_json)
            credentials = service_account.Credentials.from_service_account_info(
                credentials_dict,
                scopes=['https://www.googleapis.com/auth/cloud-platform']
            )
            self.client = texttospeech.TextToSpeechClient(credentials=credentials)
            print("[GoogleCloudTTS] Using credentials from GOOGLE_CREDENTIALS_JSON environment variable")
        elif credentials_path:
            # ファイルパスが指定された場合
            os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = credentials_path
            self.client = texttospeech.TextToSpeechClient()
            print(f"[GoogleCloudTTS] Using credentials from file: {credentials_path}")
        else:
            # デフォルトパス（ローカル開発用）
            default_path = os.path.join(os.path.dirname(__file__), 'formal-hybrid-424011-t0-cb2529a8c33e.json')
            if os.path.exists(default_path):
                os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = default_path
                self.client = texttospeech.TextToSpeechClient()
                print(f"[GoogleCloudTTS] Using credentials from default file: {default_path}")
            else:
                # 環境変数もファイルもない場合はデフォルトの認証を試みる
                self.client = texttospeech.TextToSpeechClient()
                print("[GoogleCloudTTS] Using default application credentials")
    
    def synthesize_speech(
        self, 
        text: str, 
        voice_name: str = 'Kore',
        language_code: str = 'ja-JP'
    ) -> bytes:
        """
        テキストから音声を合成
        
        Args:
            text: 合成するテキスト
            voice_name: 音声の名前（Chirp3 HD）
            language_code: 言語コード
            
        Returns:
            WAV形式の音声データ（bytes）
        """
        if voice_name not in self.CHIRP3_HD_VOICES:
            raise ValueError(f"Invalid voice name. Available: {list(self.CHIRP3_HD_VOICES.keys())}")
        
        # 入力テキストの設定
        synthesis_input = texttospeech.SynthesisInput(text=text)
        
        # Chirp 3: HD音声の設定
        voice = texttospeech.VoiceSelectionParams(
            language_code=language_code,
            name=f"{language_code}-Chirp3-HD-{voice_name}"
        )
        
        # 音声出力の設定（LINEAR16 = WAV PCM）
        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.LINEAR16,
            speaking_rate=1.0,
            pitch=0,
            volume_gain_db=0
        )
        
        # 音声合成の実行
        response = self.client.synthesize_speech(
            input=synthesis_input,
            voice=voice,
            audio_config=audio_config
        )
        
        # 重複を検出して削除
        cleaned_audio = self._remove_duplicate_audio(response.audio_content)
        
        # フェードイン/アウトを適用してポップノイズを除去
        faded_audio = self._apply_fade_in_out(cleaned_audio)
        
        # PCMデータをWAV形式に変換
        wav_data = self._create_wav_header(faded_audio) + faded_audio
        return wav_data
    
    def _create_wav_header(self, pcm_data: bytes) -> bytes:
        """
        PCMデータ用のWAVヘッダーを作成
        
        Args:
            pcm_data: PCM音声データ
            
        Returns:
            WAVヘッダー（44バイト）
        """
        sample_rate = 24000  # Google Cloud TTSのデフォルト
        num_channels = 1  # モノラル
        bits_per_sample = 16  # LINEAR16
        
        byte_rate = sample_rate * num_channels * bits_per_sample // 8
        block_align = num_channels * bits_per_sample // 8
        data_size = len(pcm_data)
        file_size = data_size + 36  # ファイルサイズ - 8
        
        # WAVヘッダーの構築
        header = b'RIFF'
        header += struct.pack('<I', file_size)
        header += b'WAVE'
        header += b'fmt '
        header += struct.pack('<I', 16)  # fmt チャンクサイズ
        header += struct.pack('<H', 1)  # PCM
        header += struct.pack('<H', num_channels)
        header += struct.pack('<I', sample_rate)
        header += struct.pack('<I', byte_rate)
        header += struct.pack('<H', block_align)
        header += struct.pack('<H', bits_per_sample)
        header += b'data'
        header += struct.pack('<I', data_size)
        
        return header
    
    def _apply_fade_in_out(self, pcm_data: bytes, fade_duration: float = 0.05, sample_rate: int = 24000) -> bytes:
        """
        音声データの開始と終了部分にフェードイン/アウトを適用してポップノイズを防ぐ
        
        Args:
            pcm_data: PCM音声データ（16ビット、モノラル）
            fade_duration: フェードイン/アウトの長さ（秒）
            sample_rate: サンプリングレート
            
        Returns:
            フェードイン/アウトを適用したPCM音声データ
        """
        try:
            # PCMデータをnumpy配列に変換（16ビット整数）
            audio_array = np.frombuffer(pcm_data, dtype=np.int16).astype(np.float32)
            
            # DCオフセット（直流成分）を除去
            audio_array = audio_array - np.mean(audio_array)
            
            # 開始部分に短い無音を追加（10ms）
            silence_duration = 0.01
            silence_samples = int(silence_duration * sample_rate)
            silence = np.zeros(silence_samples, dtype=np.float32)
            audio_array = np.concatenate([silence, audio_array])
            
            # フェードのサンプル数を計算（50ms）
            fade_samples = int(fade_duration * sample_rate)
            
            if fade_samples > 0 and len(audio_array) > fade_samples * 2:
                # より滑らかなフェードインカーブ（S字カーブ）
                t = np.linspace(0, 1, fade_samples)
                fade_in_curve = t * t * (3.0 - 2.0 * t)  # スムーズステップ関数
                fade_out_curve = 1.0 - (1.0 - t) * (1.0 - t) * (3.0 - 2.0 * (1.0 - t))
                
                # フェードインを適用（無音部分の後から）
                audio_array[silence_samples:silence_samples + fade_samples] *= fade_in_curve
                
                # フェードアウトを適用
                audio_array[-fade_samples:] *= fade_out_curve
            
            # ハイパスフィルタでDC成分と低周波ノイズを除去（20Hz以下をカット）
            nyquist = sample_rate / 2
            cutoff = 20  # Hz
            b, a = signal.butter(2, cutoff / nyquist, btype='high')
            audio_array = signal.filtfilt(b, a, audio_array)
            
            # クリッピングを防ぐために正規化（音量を95%に抑える）
            max_val = np.max(np.abs(audio_array))
            if max_val > 0:
                audio_array = audio_array * (32767 * 0.95 / max_val)
            
            # int16に戻す
            return audio_array.astype(np.int16).tobytes()
            
        except Exception as e:
            print(f"[GoogleCloudTTS] フェード処理中にエラーが発生しました: {e}")
            return pcm_data
    
    def _remove_duplicate_audio(self, pcm_data: bytes, sample_rate: int = 24000) -> bytes:
        """
        音声データから重複部分を検出して削除
        
        Args:
            pcm_data: PCM音声データ（16ビット、モノラル）
            sample_rate: サンプリングレート
            
        Returns:
            重複を削除したPCM音声データ
        """
        try:
            # PCMデータをnumpy配列に変換（16ビット整数）
            audio_array = np.frombuffer(pcm_data, dtype=np.int16)
            
            # 音声の長さを確認
            total_samples = len(audio_array)
            if total_samples == 0:
                return pcm_data
            
            # 最小検出単位（0.5秒分のサンプル数）
            min_chunk_samples = int(sample_rate * 0.5)
            
            # 音声を3分割して、各部分が同じかどうかをチェック
            third_length = total_samples // 3
            
            # 3分割がほぼ同じ長さで、かつ十分な長さがある場合のみチェック
            if third_length > min_chunk_samples and total_samples % 3 < sample_rate * 0.1:
                part1 = audio_array[:third_length]
                part2 = audio_array[third_length:2*third_length]
                part3 = audio_array[2*third_length:3*third_length]
                
                # 各部分の類似度を計算（相関係数を使用）
                # 音声の振幅を正規化
                def normalize_audio(audio):
                    if np.std(audio) > 0:
                        return (audio - np.mean(audio)) / np.std(audio)
                    return audio
                
                part1_norm = normalize_audio(part1.astype(np.float32))
                part2_norm = normalize_audio(part2.astype(np.float32))
                part3_norm = normalize_audio(part3.astype(np.float32))
                
                # 相関係数を計算
                corr_12 = np.corrcoef(part1_norm, part2_norm)[0, 1]
                corr_23 = np.corrcoef(part2_norm, part3_norm)[0, 1]
                corr_13 = np.corrcoef(part1_norm, part3_norm)[0, 1]
                
                # 高い相関（0.95以上）があれば重複と判定
                if corr_12 > 0.95 and corr_23 > 0.95 and corr_13 > 0.95:
                    print(f"[GoogleCloudTTS] 音声の重複を検出しました（相関係数: {corr_12:.3f}, {corr_23:.3f}, {corr_13:.3f}）")
                    print(f"[GoogleCloudTTS] 元の長さ: {total_samples/sample_rate:.2f}秒 → 削除後: {third_length/sample_rate:.2f}秒")
                    # 最初の1/3だけを返す
                    return part1.tobytes()
            
            # 2分割チェック（2回の重複の場合）
            half_length = total_samples // 2
            if half_length > min_chunk_samples and total_samples % 2 < sample_rate * 0.1:
                part1 = audio_array[:half_length]
                part2 = audio_array[half_length:2*half_length]
                
                part1_norm = normalize_audio(part1.astype(np.float32))
                part2_norm = normalize_audio(part2.astype(np.float32))
                
                corr = np.corrcoef(part1_norm, part2_norm)[0, 1]
                
                if corr > 0.95:
                    print(f"[GoogleCloudTTS] 音声の重複（2回）を検出しました（相関係数: {corr:.3f}）")
                    print(f"[GoogleCloudTTS] 元の長さ: {total_samples/sample_rate:.2f}秒 → 削除後: {half_length/sample_rate:.2f}秒")
                    return part1.tobytes()
            
            # 重複が検出されなかった場合は元のデータを返す
            return pcm_data
            
        except Exception as e:
            print(f"[GoogleCloudTTS] 重複検出中にエラーが発生しました: {e}")
            # エラーが発生した場合は元のデータをそのまま返す
            return pcm_data
    
    def get_available_voices(self):
        """利用可能な音声のリストを取得"""
        return [
            {
                'name': name,
                'gender': gender,
                'language_code': 'ja-JP',
                'model': 'Chirp3-HD'
            }
            for name, gender in self.CHIRP3_HD_VOICES.items()
        ]