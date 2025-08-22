import React from 'react';
import type { CommunicationMode } from '../../services/communication';
import './ModeSelector.css';

interface ModeSelectorProps {
  currentMode: CommunicationMode;
  onModeChange: (mode: CommunicationMode) => void;
  disabled?: boolean;
}

const MODE_LABELS: Record<CommunicationMode, string> = {
  'azure': 'Azure Speech SDK版',
  'gemini-websocket': 'Gemini WebSocket (現行版)',
  'oauth-direct': 'OAuth直接接続版'
};

const MODE_DESCRIPTIONS: Record<CommunicationMode, string> = {
  'azure': 'Azure Speech SDKとAzure OpenAIを使用',
  'gemini-websocket': 'バックエンド経由でGemini APIと通信',
  'oauth-direct': '直接Gemini APIに接続（APIキーが必要）'
};

export const ModeSelector: React.FC<ModeSelectorProps> = ({
  currentMode,
  onModeChange,
  disabled = false
}) => {
  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newMode = event.target.value as CommunicationMode;
    if (newMode !== currentMode) {
      onModeChange(newMode);
    }
  };

  return (
    <div className="mode-selector" style={{ display: 'none' }}>
      <label htmlFor="communication-mode" className="mode-selector__label">
        通信モード:
      </label>
      <select
        id="communication-mode"
        className="mode-selector__select"
        value={currentMode}
        onChange={handleChange}
        disabled={disabled}
      >
        {/* TODO： Azure以外のモードを利用できないようにする */}
        {Object.entries(MODE_LABELS)
          .filter(([mode]) => mode === 'azure')
          .map(([mode, label]) => (
            <option key={mode} value={mode}>
              {label}
            </option>
          ))}
      </select>
      <span className="mode-selector__description">
        {MODE_DESCRIPTIONS[currentMode]}
      </span>
      {currentMode === 'oauth-direct' && (
        <span className="mode-selector__warning">
          ⚠️ APIキーを.envファイルに設定してください
        </span>
      )}
    </div>
  );
};