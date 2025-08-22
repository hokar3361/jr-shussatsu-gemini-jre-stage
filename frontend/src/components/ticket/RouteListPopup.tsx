import React from 'react';
import type { Route } from '../../services/ticket/../cosmos/types';
import { RouteSearchService } from '../../services/cosmos/RouteSearchService';

interface RouteListPopupProps {
  routes: Route[];
  isOpen: boolean;
  onClose: () => void;
}

export const RouteListPopup: React.FC<RouteListPopupProps> = ({
  routes,
  isOpen,
  onClose
}) => {
  if (!isOpen) return null;

  return (
    <>
      <div className="popup-overlay" onClick={onClose} />
      <div className="route-list-popup">
        <div className="popup-header">
          <h3>時刻表リスト</h3>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="popup-content">
          {routes.length === 0 ? (
            <div className="no-routes">経路が見つかりませんでした</div>
          ) : (
            <div className="route-list">
              {routes.map((route, index) => (
                <div key={route.id || index} className="route-item">
                  <div className="route-main-info">
                    <div className="station-info">
                      <span className="label">乗車駅:</span>
                      <span className="value">{route.origin.name}</span>
                    </div>
                    <div className="station-info">
                      <span className="label">行先:</span>
                      <span className="value">{route.destination.name}</span>
                    </div>
                  </div>
                  
                  <div className="route-time-info">
                    <div className="time-info">
                      <span className="label">出発時刻:</span>
                      <span className="value time">{route.departureTime}</span>
                    </div>
                    <div className="time-info">
                      <span className="label">到着時刻:</span>
                      <span className="value time">{route.arrivalTime}</span>
                    </div>
                    <div className="time-info">
                      <span className="label">所要時間:</span>
                      <span className="value">{RouteSearchService.formatDuration(route.duration)}</span>
                    </div>
                  </div>
                  
                  <div className="route-details">
                    <div className="express-info">
                      <span className="label">特急有無:</span>
                      <span className={`value ${route.hasExpress ? 'has-express' : ''}`}>
                        {route.hasExpress ? '○' : '×'}
                      </span>
                    </div>
                    
                    <div className="route-path">
                      <span className="label">経路:</span>
                      <div className="path-description">
                        {new RouteSearchService().generateRouteDescription(route.legs)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
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
          animation: fadeIn 0.2s ease-out;
        }

        .route-list-popup {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: white;
          border-radius: 16px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
          z-index: 1001;
          max-width: 900px;
          width: 90%;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          animation: slideIn 0.3s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translate(-50%, -45%);
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
          border-bottom: 1px solid #e2e8f0;
        }

        .popup-header h3 {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 700;
          color: #1e293b;
        }

        .close-button {
          background: none;
          border: none;
          font-size: 1.5rem;
          color: #64748b;
          cursor: pointer;
          padding: 0;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          transition: all 0.2s;
        }

        .close-button:hover {
          background: #f1f5f9;
          color: #1e293b;
        }

        .popup-content {
          flex: 1;
          overflow-y: auto;
          padding: 1.5rem;
        }

        .no-routes {
          text-align: center;
          padding: 3rem;
          color: #64748b;
          font-size: 1rem;
        }

        .route-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .route-item {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 1.25rem;
          transition: all 0.2s;
        }

        .route-item:hover {
          background: #f1f5f9;
          border-color: #cbd5e1;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
        }

        .route-main-info {
          display: flex;
          gap: 2rem;
          margin-bottom: 1rem;
        }

        .station-info {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }

        .route-time-info {
          display: flex;
          gap: 1.5rem;
          margin-bottom: 1rem;
          padding: 0.75rem;
          background: white;
          border-radius: 8px;
        }

        .time-info {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }

        .route-details {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .express-info {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }

        .route-path {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .path-description {
          background: white;
          padding: 0.75rem;
          border-radius: 8px;
          font-size: 0.875rem;
          line-height: 1.6;
          color: #475569;
        }

        .label {
          font-size: 0.875rem;
          color: #64748b;
          font-weight: 500;
        }

        .value {
          font-size: 0.9375rem;
          color: #1e293b;
          font-weight: 600;
        }

        .value.time {
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
          color: #1976d2;
        }

        .value.has-express {
          color: #059669;
          font-size: 1.125rem;
        }

        @media (max-width: 768px) {
          .route-list-popup {
            width: 95%;
            max-height: 90vh;
          }

          .popup-header {
            padding: 1rem;
          }

          .popup-content {
            padding: 1rem;
          }

          .route-main-info {
            flex-direction: column;
            gap: 0.5rem;
          }

          .route-time-info {
            flex-direction: column;
            gap: 0.5rem;
          }
        }
      `}</style>
    </>
  );
};