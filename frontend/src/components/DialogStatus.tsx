import React from 'react';
import { type DialogFlowState } from '../types/dialog';

interface DialogStatusProps {
  dialogFlowState: DialogFlowState | null;
}

const DialogStatus: React.FC<DialogStatusProps> = ({ dialogFlowState }) => {
  if (!dialogFlowState) {
    return null;
  }

  const recentMessages = dialogFlowState.messageHistory
    .filter(msg => msg.type === 'completion')
    .slice(-3);

  return (
    <div className="dialog-status">
      <div className="dialog-phase">
        <span className="label">現在のフェーズ:</span>
        <span className="value">{dialogFlowState.currentPhase.name}</span>
      </div>
      {recentMessages.length > 0 && (
        <div className="dialog-messages">
          {recentMessages.map((msg, index) => (
            <div key={index} className="dialog-message">
              {msg.content}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DialogStatus;