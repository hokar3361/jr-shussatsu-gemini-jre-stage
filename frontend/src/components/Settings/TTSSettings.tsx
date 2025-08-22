import React, { useState, useEffect } from 'react';
import type { TTSProviderType } from '../../services/tts/ITTSProvider';
import './TTSSettings.css';

interface TTSSettingsProps {
  onSettingsChange?: () => void;
}

const GOOGLE_CLOUD_VOICES = [
  'Aoede',
  'Puck',
  'Charon',
  'Kore',
  'Fenrir',
  'Leda',
  'Orus',
  'Zephyr'
];

export const TTSSettings: React.FC<TTSSettingsProps> = ({ onSettingsChange }) => {
  const [provider, setProvider] = useState<TTSProviderType>('azure');
  const [googleCloudVoice, setGoogleCloudVoice] = useState('Kore');

  useEffect(() => {
    // LocalStorageから設定を読み込む
    const savedProvider = localStorage.getItem('tts_provider') as TTSProviderType;
    const savedGoogleCloudVoice = localStorage.getItem('google_cloud_voice_name') || 'Kore';

    if (savedProvider === 'azure' || savedProvider === 'google-cloud') {
      setProvider(savedProvider);
    } else if (savedProvider === 'gemini') {
      // Gemini TTSが選択されていた場合は、Google Cloudにフォールバック
      setProvider('google-cloud');
      localStorage.setItem('tts_provider', 'google-cloud');
    }
    setGoogleCloudVoice(savedGoogleCloudVoice);
  }, []);

  const handleProviderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newProvider = event.target.value as TTSProviderType;
    setProvider(newProvider);
    localStorage.setItem('tts_provider', newProvider);
    onSettingsChange?.();
  };


  const handleGoogleCloudVoiceChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newVoice = event.target.value;
    setGoogleCloudVoice(newVoice);
    localStorage.setItem('google_cloud_voice_name', newVoice);
    onSettingsChange?.();
  };



  const handleSaveSettings = () => {
    // 設定を保存してコールバックを呼ぶ
    localStorage.setItem('tts_provider', provider);
    if (provider === 'google-cloud') {
      localStorage.setItem('google_cloud_voice_name', googleCloudVoice);
    }
    onSettingsChange?.();
    alert('TTS設定を保存しました');
  };

  return (
    <div className="tts-settings">
      <h3 className="tts-settings__title">音声合成（TTS）設定</h3>
      
      <div className="tts-settings__provider">
        <label className="tts-settings__label">TTSプロバイダー:</label>
        <div className="tts-settings__radio-group">
          <label className="tts-settings__radio">
            <input
              type="radio"
              name="tts-provider"
              value="azure"
              checked={provider === 'azure'}
              onChange={handleProviderChange}
            />
            <span>Azure Speech Service</span>
          </label>
          <label className="tts-settings__radio">
            <input
              type="radio"
              name="tts-provider"
              value="google-cloud"
              checked={provider === 'google-cloud'}
              onChange={handleProviderChange}
            />
            <span>Google Cloud TTS (Chirp 3: HD)</span>
          </label>
        </div>
      </div>

      {provider === 'google-cloud' && (
        <div className="tts-settings__google-cloud">
          <div className="tts-settings__field">
            <label htmlFor="google-cloud-voice" className="tts-settings__label">
              音声の種類 (Chirp 3: HD):
            </label>
            <select
              id="google-cloud-voice"
              className="tts-settings__select"
              value={googleCloudVoice}
              onChange={handleGoogleCloudVoiceChange}
            >
              {GOOGLE_CLOUD_VOICES.map(voice => (
                <option key={voice} value={voice}>
                  {voice}
                </option>
              ))}
            </select>
            <small className="tts-settings__hint">
              高品質な次世代LLMモデルによる音声合成
            </small>
          </div>

          <div className="tts-settings__info">
            <p>Google Cloud TTS (Chirp 3: HD) は高品質な音声合成を提供します。</p>
            <p>サーバー側で自動的に設定されます。</p>
          </div>
        </div>
      )}

      {provider === 'azure' && (
        <div className="tts-settings__azure">
          <p className="tts-settings__info">
            Azure Speech Serviceの設定は環境変数で管理されています。
          </p>
          <ul className="tts-settings__env-list">
            <li>VITE_AZURE_SPEECH_SUBSCRIPTION_KEY</li>
            <li>VITE_AZURE_SPEECH_REGION</li>
            <li>VITE_AZURE_VOICE_NAME</li>
          </ul>
        </div>
      )}

      <div className="tts-settings__actions">
        <button
          type="button"
          className="tts-settings__save-button"
          onClick={handleSaveSettings}
        >
          設定を保存
        </button>
      </div>
    </div>
  );
};