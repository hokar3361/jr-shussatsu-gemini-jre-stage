import { useState, useEffect, useCallback } from 'react';
// import { TicketPhases } from '../services/ticket/types';
import type { TicketSystemState } from '../services/ticket/types';
import { TicketSystemManager } from '../services/ticket/TicketSystemManager';
import { TicketDialogFlowManager } from '../services/dialog/TicketDialogFlowManager';
import { ConfigManager } from '../config/ConfigManager';

interface UseTicketSystemResult {
  ticketState: TicketSystemState | null;
  ticketSystemManager: TicketSystemManager | null;
  // changePhase: (phase: TicketPhases) => void;
  resetSystem: () => void;
  isEnabled: boolean;
}

export const useTicketSystem = (dialogFlowManager?: any): UseTicketSystemResult => {
  const [ticketState, setTicketState] = useState<TicketSystemState | null>(null);
  const [ticketSystemManager, setTicketSystemManager] = useState<TicketSystemManager | null>(null);
  
  // 発券システムが有効かどうか
  const appConfig = ConfigManager.getInstance().getAppConfig();
  const isEnabled = appConfig?.useTicketSystem ?? true; // デフォルトで有効

  useEffect(() => {
    if (!isEnabled) {
      return;
    }

    // TicketDialogFlowManagerの場合、TicketSystemManagerを取得
    if (dialogFlowManager && dialogFlowManager instanceof TicketDialogFlowManager) {
      const manager = dialogFlowManager.getTicketSystemManager();
      setTicketSystemManager(manager);

      // 状態変更を監視
      manager.setOnStateChange((state) => {
        setTicketState(state);
      });

      // 初期状態を設定
      setTicketState(manager.getState());
    }
  }, [dialogFlowManager, isEnabled]);

  // // フェーズを変更
  // const changePhase = useCallback((phase: TicketPhases) => {
  //   if (ticketSystemManager) {
  //     ticketSystemManager.changePhase(phase);
  //   }
  // }, [ticketSystemManager]);

  // システムをリセット
  const resetSystem = useCallback(() => {
    if (ticketSystemManager) {
      ticketSystemManager.reset();
    }
  }, [ticketSystemManager]);

  return {
    ticketState,
    ticketSystemManager,
    // changePhase,
    resetSystem,
    isEnabled
  };
};