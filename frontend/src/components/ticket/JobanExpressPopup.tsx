import React from 'react';
import type { JobanExpressRoute, JobanZairaiExpressRoute } from '../../services/ticket/types';
import { RouteSearchService } from '../../services/cosmos/RouteSearchService';

interface JobanExpressPopupProps {
  routes: JobanExpressRoute[];
  isOpen: boolean;
  onClose: () => void;
  showOnlyJobanExpress?: boolean;
}

export const JobanExpressPopup: React.FC<JobanExpressPopupProps> = ({
  routes,
  isOpen,
  onClose,
  showOnlyJobanExpress = true,
}) => {
  if (!isOpen) return null;

  const formatTime = (time: string) => {
    // "HH:MM:SS" 形式から "HH:MM" 形式に変換
    return time.substring(0, 5);
  };

  const isZairaiExpressRoute = (route: JobanExpressRoute): route is JobanZairaiExpressRoute => {
    return 'zairaiExpressLegsRouteExplainList' in route && 
           (route as JobanZairaiExpressRoute).zairaiExpressLegsRouteExplainList !== undefined;
  };

  return (
    <>
      <div className="popup-overlay" onClick={onClose} />
      <div className="popup-container">
        <div className="popup-header">
          <h2>{showOnlyJobanExpress ? '常磐線特急を含む経路' : '常磐線特急+在来線特急を含む経路'}</h2>
          <button className="close-button" onClick={onClose}>
            ✕
          </button>
        </div>
        
        <div className="popup-content">
          {routes.map((route, index) => (
            <div key={route.id} className="route-card">
              <div className="route-header">
                <span className="route-number">経路 {index + 1}</span>
                <div className="route-summary">
                  <span>{route.origin.name}</span>
                  <span className="arrow">→</span>
                  <span>{route.destination.name}</span>
                </div>
              </div>
              
              <div className="route-info">
                <div className="time-info">
                  <span className="label">出発:</span>
                  <span className="value">{formatTime(route.departureTime)}</span>
                  <span className="label">到着:</span>
                  <span className="value">{formatTime(route.arrivalTime)}</span>
                  <span className="label">所要時間:</span>
                  <span className="value">{RouteSearchService.formatDuration(route.duration)}</span>
                </div>
                
                <div className="transfer-info">
                  <span className="label">乗り換え:</span>
                  <span className="value">{route.transfers}回</span>
                </div>
              </div>

              <div className="express-section">
                <h4 className="section-title joban-express-title">常磐線特急区間</h4>
                <div className="express-route">
                  {route.jobanExpressLegsRouteExplain}
                </div>
              </div>

              {!showOnlyJobanExpress && isZairaiExpressRoute(route) && route.zairaiExpressLegsRouteExplainList.length > 0 && (
                <div className="express-section">
                  <h4 className="section-title zairai-express-title">在来線特急区間</h4>
                  {route.zairaiExpressLegsRouteExplainList.map((explainText, idx) => (
                    <div key={idx} className="express-route">
                      {explainText}
                    </div>
                  ))}
                </div>
              )}

              <div className="route-details">
                <h4 className="section-title">経路詳細</h4>
                <div className="legs-container">
                  {route.legs
                    .sort((a, b) => a.seq - b.seq)
                    .map((leg, legIndex, sortedLegs) => (
                    <div key={legIndex} className={`leg-item ${leg.isExpress ? 'express' : ''}`}>
                      <div className="leg-line">
                        <span className="time">
                          {formatTime(legIndex === 0 ? leg.from.time : sortedLegs[legIndex - 1].to.time)}
                        </span>
                        <span className="station-popup">
                          {legIndex === 0 ? leg.from.name : sortedLegs[legIndex - 1].to.name}
                        </span>
                      </div>
                      <div className="transport-info">
                        <span className="senku-name">{leg.senkuName}</span>
                        {leg.nickname && <span className="nickname">「{leg.nickname}」</span>}
                        {leg.isExpress && <span className="express-badge">特急</span>}
                      </div>
                      <div className="leg-line">
                      <span className="time">{formatTime(leg.to.time)}</span>
                        <span className="station-popup">{leg.to.name}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .popup-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 1000;
          animation: fadeIn 0.2s ease;
        }

        .popup-container {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: white;
          border-radius: 16px;
          width: 90%;
          max-width: 800px;
          max-height: 90vh;
          overflow: hidden;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          z-index: 1001;
          display: flex;
          flex-direction: column;
          animation: slideIn 0.3s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translate(-50%, -40%);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%);
          }
        }

        .popup-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.5rem;
          border-bottom: 1px solid #e5e7eb;
          background: linear-gradient(135deg, #fff4e6 0%, #ffe0b2 100%);
        }

        .popup-header h2 {
          margin: 0;
          font-size: 1.5rem;
          font-weight: 700;
          color: #1e293b;
        }

        .close-button {
          background: none;
          border: none;
          font-size: 1.5rem;
          color: #64748b;
          cursor: pointer;
          padding: 0.5rem;
          border-radius: 8px;
          transition: all 0.2s ease;
        }

        .close-button:hover {
          background: rgba(0, 0, 0, 0.05);
          color: #1e293b;
        }

        .popup-content {
          flex: 1;
          overflow-y: auto;
          padding: 1.5rem;
        }

        .route-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 1.5rem;
          margin-bottom: 1rem;
        }

        .route-card:last-child {
          margin-bottom: 0;
        }

        .route-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .route-number {
          font-size: 0.875rem;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .route-summary {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 1.125rem;
          font-weight: 600;
          color: #1e293b;
        }

        .arrow {
          color: #94a3b8;
        }

        .route-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          background: white;
          border-radius: 8px;
          margin-bottom: 1rem;
          border: 1px solid #e2e8f0;
        }

        .time-info {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .transfer-info {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .label {
          font-size: 0.875rem;
          color: #64748b;
        }

        .value {
          font-size: 0.875rem;
          font-weight: 600;
          color: #1e293b;
        }

        .express-section {
          margin-bottom: 1rem;
          padding: 1rem;
          background: white;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
        }

        .section-title {
          font-size: 0.875rem;
          font-weight: 700;
          margin: 0 0 0.75rem 0;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .joban-express-title {
          color: #ff9800;
        }

        .zairai-express-title {
          color: #2196f3;
        }

        .express-route {
          font-size: 1rem;
          font-weight: 600;
          color: #1e293b;
          padding: 0.5rem;
          background: #f8fafc;
          border-radius: 4px;
          margin-bottom: 0.5rem;
        }

        .express-route:last-child {
          margin-bottom: 0;
        }

        .route-details {
          background: white;
          border-radius: 8px;
          padding: 1rem;
          border: 1px solid #e2e8f0;
        }

        .legs-container {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .leg-item {
          padding: 0.75rem;
          background: #f8fafc;
          border-radius: 6px;
          border-left: 3px solid #e2e8f0;
        }

        .leg-item.express {
          border-left-color: #ff9800;
          background: linear-gradient(to right, #fff8e1, #f8fafc);
        }

        .leg-line {
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.25rem;
        }
        .leg-line .time {
          margin-right: 1rem;
        }

        .station-popup {
          font-weight: 600;
          color: #1e293b;
        }

        .time {
          font-size: 0.875rem;
          color: #64748b;
        }

        .transport-info {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.875rem;
          color: #64748b;
          margin-left: 1rem;
        }

        .senku-name {
          font-weight: 500;
        }

        .nickname {
          color: #2196f3;
          font-weight: 600;
        }

        .express-badge {
          display: inline-block;
          padding: 0.125rem 0.375rem;
          font-size: 0.625rem;
          font-weight: 600;
          background: #ff9800;
          color: white;
          border-radius: 4px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        @media (max-width: 768px) {
          .popup-container {
            width: 95%;
            max-height: 95vh;
          }

          .popup-header {
            padding: 1rem;
          }

          .popup-content {
            padding: 1rem;
          }

          .route-card {
            padding: 1rem;
          }

          .time-info {
            flex-wrap: wrap;
          }
        }
      `}</style>
    </>
  );
};