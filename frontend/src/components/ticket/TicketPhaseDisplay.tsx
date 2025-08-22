import React from 'react';
import { TicketPhases } from '../../services/ticket/types';

interface TicketPhaseDisplayProps {
  currentPhase: TicketPhases;
  className?: string;
}

const phaseLabels: Record<TicketPhases, string> = {
  [TicketPhases.BASIC_INFO]: '基本情報',
  [TicketPhases.JOBAN_1]: '特急確認',
  [TicketPhases.ROUTE_SEARCH]: '経路検索',
  [TicketPhases.SEAT_SELECTION]: '座席選択',
  [TicketPhases.PAYMENT]: '決済',
  [TicketPhases.CONFIRMATION]: '確認',
  [TicketPhases.SEAT_UNSPECIFIED]: '座席未指定',
  [TicketPhases.ARRIVAL_TIME_SPECIFIED]: '到着時刻指定',
  [TicketPhases.DEPARTURE_TIME_SPECIFIED]: '出発時刻指定',
  [TicketPhases.TICKET_CONFIRMATION]: '発券確認',
  [TicketPhases.JOBAN_PHASE_2]: '常磐線フェーズ2',
  zairai_special_case: ''
};

const phaseOrder: TicketPhases[] = [
  TicketPhases.BASIC_INFO,
  TicketPhases.JOBAN_1,
  TicketPhases.ROUTE_SEARCH,
  TicketPhases.SEAT_UNSPECIFIED,
  TicketPhases.ARRIVAL_TIME_SPECIFIED,
  TicketPhases.DEPARTURE_TIME_SPECIFIED,
  TicketPhases.JOBAN_PHASE_2,
  TicketPhases.SEAT_SELECTION,
  TicketPhases.PAYMENT,
  TicketPhases.CONFIRMATION,
  TicketPhases.TICKET_CONFIRMATION
];

export const TicketPhaseDisplay: React.FC<TicketPhaseDisplayProps> = ({ 
  currentPhase,
  className = ''
}) => {
  const currentIndex = phaseOrder.indexOf(currentPhase);
  const progressPercentage = ((currentIndex + 1) / (phaseOrder.length + 1)) * 100;

  return (
    <div className={`ticket-phase-display ${className}`}>
      <div className="phase-header">
        <h3 className="phase-title">発券手続きの進捗</h3>
        <div className="current-phase-badge">
          {phaseLabels[currentPhase]}
        </div>
      </div>
      
      <div className="train-track-container">
        <div className="train-track">
          <div className="track-progress" style={{ width: `${progressPercentage}%` }} />
          
          {/* 列車アイコン */}
          <div 
            className="train-icon" 
            style={{ left: `calc(${progressPercentage}% - 1.5rem)` }}
          >
            <svg viewBox="0 0 24 24" width="36" height="36">
              <path d="M12 2C8 2 4 2.5 4 6V15.5C4 17.43 5.57 19 7.5 19L6 20.5V21H8.23L10 19H14L15.77 21H18V20.5L16.5 19C18.43 19 20 17.43 20 15.5V6C20 2.5 16 2 12 2M7.5 17C6.67 17 6 16.33 6 15.5S6.67 14 7.5 14 9 14.67 9 15.5 8.33 17 7.5 17M11 10H6V6H11V10M13 10V6H18V10H13M16.5 17C15.67 17 15 16.33 15 15.5S15.67 14 16.5 14 18 14.67 18 15.5 17.33 17 16.5 17Z" fill="currentColor"/>
            </svg>
          </div>
          
          {/* 各駅（フェーズ） */}
          {phaseOrder.map((phase, index) => {
            const isActive = phase === currentPhase;
            const isCompleted = index < currentIndex;
            const stationPosition = ((index + 1) / (phaseOrder.length + 1)) * 100;
            
            return (
              <div
                key={phase}
                className={`station ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
                style={{ left: `${stationPosition}%` }}
              >
                <div className="station-marker">
                  {isCompleted ? (
                    <svg viewBox="0 0 24 24" width="16" height="16">
                      <path d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z" fill="currentColor"/>
                    </svg>
                  ) : (
                    <div className="station-dot" />
                  )}
                </div>
                <div className="station-label">
                  {phaseLabels[phase]}
                </div>
              </div>
            );
          })}
          
          {/* 最終駅（発券） */}
          <div className="station final-station" style={{ left: '100%' }}>
            <div className="station-marker destination">
              <svg viewBox="0 0 24 24" width="20" height="20">
                <path d="M12,11.5A2.5,2.5 0 0,1 9.5,9A2.5,2.5 0 0,1 12,6.5A2.5,2.5 0 0,1 14.5,9A2.5,2.5 0 0,1 12,11.5M12,2A7,7 0 0,0 5,9C5,14.25 12,22 12,22C12,22 19,14.25 19,9A7,7 0 0,0 12,2Z" fill="currentColor"/>
              </svg>
            </div>
            <div className="station-label">発券完了</div>
          </div>
        </div>
      </div>
      
      <style>{`
        .ticket-phase-display {
          background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
          padding: 1rem;
          border-radius: 12px;
          margin-bottom: 0.75rem;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
        }

        .phase-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .phase-title {
          font-size: 0.9375rem;
          font-weight: 700;
          color: #2c3e50;
          margin: 0;
          letter-spacing: -0.02em;
        }

        .current-phase-badge {
          background: #3498db;
          color: white;
          padding: 0.25rem 0.75rem;
          border-radius: 16px;
          font-size: 0.75rem;
          font-weight: 600;
          box-shadow: 0 2px 6px rgba(52, 152, 219, 0.25);
        }

        .train-track-container {
          position: relative;
          padding: 2rem 0 1.5rem;
          margin: 0 1.5rem;
        }

        .train-track {
          position: relative;
          height: 4px;
          background: #dee2e6;
          border-radius: 2px;
          overflow: visible;
        }

        .track-progress {
          position: absolute;
          top: 0;
          left: 0;
          height: 100%;
          background: linear-gradient(90deg, #3498db 0%, #2980b9 100%);
          border-radius: 3px;
          transition: width 0.5s ease;
        }

        .train-icon {
          position: absolute;
          top: -18px;
          transition: left 0.5s ease;
          color: #e74c3c;
          filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.15));
          animation: trainBobble 2s ease-in-out infinite;
        }

        @keyframes trainBobble {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }

        .station {
          position: absolute;
          top: -6px;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          transition: all 0.3s ease;
        }

        .station-marker {
          width: 16px;
          height: 16px;
          background: white;
          border: 2px solid #dee2e6;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s ease;
          z-index: 2;
        }

        .station-dot {
          width: 6px;
          height: 6px;
          background: #dee2e6;
          border-radius: 50%;
        }

        .station.completed .station-marker {
          background: #27ae60;
          border-color: #27ae60;
          color: white;
        }

        .station.active .station-marker {
          background: #3498db;
          border-color: #3498db;
          transform: scale(1.2);
          box-shadow: 0 0 0 8px rgba(52, 152, 219, 0.1);
        }

        .station.active .station-dot {
          background: white;
        }

        .station-label {
          position: absolute;
          top: 22px;
          font-size: 0.6875rem;
          color: #6c757d;
          white-space: nowrap;
          font-weight: 500;
          text-align: center;
        }

        .station.completed .station-label {
          color: #27ae60;
          font-weight: 600;
        }

        .station.active .station-label {
          color: #3498db;
          font-weight: 700;
        }

        .final-station {
          opacity: 0.5;
        }

        .station-marker.destination {
          width: 24px;
          height: 24px;
          background: #e74c3c;
          border-color: #e74c3c;
          color: white;
        }

        .final-station .station-label {
          font-weight: 700;
          color: #e74c3c;
        }

        /* タブレット対応 */
        @media (max-width: 1024px) {
          .ticket-phase-display {
            padding: 0.875rem;
          }

          .train-track-container {
            margin: 0 1rem;
            padding: 1.5rem 0 1.25rem;
          }

          .phase-title {
            font-size: 0.875rem;
          }

          .current-phase-badge {
            font-size: 0.6875rem;
            padding: 0.1875rem 0.625rem;
          }
        }

        /* スマートフォン対応 */
        @media (max-width: 768px) {
          .phase-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.5rem;
          }

          .station-label {
            font-size: 0.625rem;
            top: 25px;
          }

          .train-icon svg {
            width: 28px;
            height: 28px;
          }

          .station-marker {
            width: 16px;
            height: 16px;
          }

          .station-marker.destination {
            width: 24px;
            height: 24px;
          }

          .train-track-container {
            padding: 2rem 0 1.5rem;
            margin: 0 0.5rem;
          }
        }
      `}</style>
    </div>
  );
};