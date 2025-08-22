import React, { useEffect, useRef } from 'react';
import type { TicketInformation, TicketPhases } from '../../services/ticket/types';

interface TicketInfoSidebarProps {
  ticketInfo: TicketInformation;
  isExtracting: boolean;
  isSearchingRoutes?: boolean;
  currentPhase?: TicketPhases;
  lastExtractedInfo?: Partial<TicketInformation>;
  className?: string;
  onRouteListClick?: () => void;
  onJobanExpressClick?: () => void;
  onJobanZairaiExpressClick?: () => void;
  onZairaiSpecialClick?: () => void;
}

export const TicketInfoSidebar: React.FC<TicketInfoSidebarProps> = ({
  ticketInfo,
  isExtracting,
  isSearchingRoutes = false,
  currentPhase,
  lastExtractedInfo,
  className = '',
  onRouteListClick,
  onJobanExpressClick,
  onJobanZairaiExpressClick}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const phase2Ref = useRef<HTMLDivElement>(null);

  // フェーズに応じた自動スクロール
  useEffect(() => {
    if (currentPhase === 'joban_express_inquiry' && phase2Ref.current && scrollContainerRef.current) {
      // フェーズ2の場合、そのセクションまでスクロール
      phase2Ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [currentPhase]);

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '未入力';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const formatCount = (count: number | null): string => {
    if (count === null) return '未入力';
    return `${count}名`;
  };

  const formatBoolean = (value: boolean | null): string => {
    if (value === null) return '未入力';
    return value ? 'はい' : 'いいえ';
  };

  const formatTimeType = (type: string | null): string => {
    if (!type) return '未入力';
    return type === 'start' ? '出発時刻' : '到着時刻';
  };

  return (
    <div className={`ticket-info-sidebar ${className}`}>
      <h3 className="sidebar-title">発券情報</h3>
      {/* 現在フェーズと直近抽出差分の表示 */}
      <div className="phase-and-extract">
        <div className="phase-chip">
          現在フェーズ: <strong>{currentPhase || ticketInfo.currentPhase}</strong>
        </div>
        { lastExtractedInfo && Object.keys(lastExtractedInfo).length > 0 && (
          <div className="extract-chip">
            直近抽出: {Object.entries(lastExtractedInfo).map(([k,v]) => `${k}:${String(v)}`).join(', ')}
          </div>
        )}
      </div>
      
      <div className="info-content" ref={scrollContainerRef}>
        <div className="info-section">
        <h4>基本情報</h4>
        
        <div className={`info-item ${ticketInfo.destination ? 'completed' : ''}`}>
          <div className="info-label">行先</div>
          <div className="info-value">
            {ticketInfo.destination || '未入力'}
          </div>
        </div>

        <div className={`info-item ${ticketInfo.travelDate ? 'completed' : ''}`}>
          <div className="info-label">利用日</div>
          <div className="info-value">
            {formatDate(ticketInfo.travelDate)}
          </div>
        </div>

        <div className={`info-item ${ticketInfo.adultCount !== null ? 'completed' : ''}`}>
          <div className="info-label">大人</div>
          <div className="info-value">
            {formatCount(ticketInfo.adultCount)}
          </div>
        </div>

        <div className={`info-item ${ticketInfo.childCount !== null ? 'completed' : ''}`}>
          <div className="info-label">子供</div>
          <div className="info-value">
            {formatCount(ticketInfo.childCount)}
          </div>
        </div>

        {/* オプション項目（基本情報内） */}
        {ticketInfo.useDateTime && (
          <div className="info-item completed optional">
            <div className="info-label">利用日時<span className="optional-badge">オプション</span></div>
            <div className="info-value">{ticketInfo.useDateTime}</div>
          </div>
        )}

        {ticketInfo.useDateTimeType && (
          <div className="info-item completed optional">
            <div className="info-label">日時区分<span className="optional-badge">オプション</span></div>
            <div className="info-value">{ticketInfo.useDateTimeType}</div>
          </div>
        )}

        {ticketInfo.phase2_jobanExpressUse !== null && (
          <div className="info-item completed optional">
            <div className="info-label">常磐線特急<span className="optional-badge">オプション</span></div>
            <div className="info-value">{ticketInfo.phase2_jobanExpressUse ? '利用希望' : '利用しない'}</div>
          </div>
        )}

        {ticketInfo.jobanExpressStop && (
          <div className="info-item completed optional">
            <div className="info-label">常磐線特急降車駅<span className="optional-badge">オプション</span></div>
            <div className="info-value">{ticketInfo.jobanExpressStop}</div>
          </div>
        )}

        {ticketInfo.expressPreference !== null && (
          <div className="info-item completed optional">
            <div className="info-label">在来特急<span className="optional-badge">オプション</span></div>
            <div className="info-value">{ticketInfo.expressPreference ? '利用希望' : '利用しない'}</div>
          </div>
        )}

        {ticketInfo.transferTimePreference && (
          <div className="info-item completed optional">
            <div className="info-label">乗り換え時間<span className="optional-badge">オプション</span></div>
            <div className="info-value">{ticketInfo.transferTimePreference}</div>
          </div>
        )}

        {/* 経路リスト項目 */}
        {ticketInfo.destination && (
          <div 
            className={`info-item route-list ${ticketInfo.routes && ticketInfo.routes.length > 0 ? 'completed clickable' : ''}`}
            onClick={ticketInfo.routes && ticketInfo.routes.length > 0 ? onRouteListClick : undefined}
          >
            <div className="info-label">経路リスト</div>
            <div className="info-value">
              {isSearchingRoutes ? (
                <span className="searching">検索中...</span>
              ) : ticketInfo.routes ? (
                <span>{ticketInfo.routes.length}件</span>
              ) : (
                <span>未検索</span>
              )}
            </div>
          </div>
        )}

        {/* 常磐線特急経路数 */}
        {ticketInfo.jobanExpressRoutes && ticketInfo.jobanExpressRoutes.length > 0 && (
          <div 
            className="info-item joban-express completed clickable"
            onClick={onJobanExpressClick}
          >
            <div className="info-label">常磐線特急経路数</div>
            <div className="info-value">
              <span>{ticketInfo.jobanExpressRoutes.length}件</span>
            </div>
          </div>
        )}

        {/* 常磐線+在来線特急経路数 */}
        {ticketInfo.jobanZairaiExpressRoutes && ticketInfo.jobanZairaiExpressRoutes.length > 0 && (
          <div 
            className="info-item joban-zairai-express completed clickable"
            onClick={onJobanZairaiExpressClick}
          >
            <div className="info-label">常磐線+在来線特急経路数</div>
            <div className="info-value">
              <span>{ticketInfo.jobanZairaiExpressRoutes.length}件</span>
            </div>
          </div>
        )}

        {/* 在来特急 初期提案表示 */}
        {(ticketInfo.zairaiExpressName || ticketInfo.zairaiExpressCategory) && (
          <div className="info-item completed optional">
            <div className="info-label">在来特急（初期提案）<span className="optional-badge">オプション</span></div>
            <div className="info-value">
              {(ticketInfo.zairaiExpressName || '') + (ticketInfo.zairaiExpressCategory ? `／${ticketInfo.zairaiExpressCategory}` : '')}
            </div>
          </div>
        )}

        {/* 在来特急特殊フェーズ 情報表示 */}
        {(ticketInfo.zairaiSpecial_transferMinutes != null || ticketInfo.zairaiSpecial_shinjukuArrivalTime || ticketInfo.zairaiSpecial_shinjukuDepartureTime) && (
          <div className="info-item completed optional">
            <div className="info-label">在来特急特殊ケース<span className="optional-badge">オプション</span></div>
            <div className="info-value">
              {`乗換: ${ticketInfo.zairaiSpecial_transferMinutes ?? '-'}分 / 新宿着: ${ticketInfo.zairaiSpecial_shinjukuArrivalTime ?? '-'} / 新宿発: ${ticketInfo.zairaiSpecial_shinjukuDepartureTime ?? '-'}`}
            </div>
          </div>
        )}

        {/* 在来特急特殊フェーズ 再検索一覧 */}
        {/* {ticketInfo.zairaiSpecial_routes && ticketInfo.zairaiSpecial_routes.length > 0 && (
          <div 
            className="info-item joban-zairai-express completed clickable"
            onClick={onZairaiSpecialClick}
          >
            <div className="info-label">新宿発 在来特急候補</div>
            <div className="info-value">
              <span>{ticketInfo.zairaiSpecial_routes.length}件</span>
            </div>
          </div>
        )} */}
      </div>

      {/* 全項目（デバッグ・フェーズ無視で全て表示） */}
      {/* <div className="info-section">
        <h4>全項目（デバッグ）</h4>
        <div className="all-fields">
          {Object.entries(ticketInfo).map(([key, value]) => (
            <div key={key} className="info-item">
              <div className="info-label">{key}</div>
              <div className="info-value">
                {typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)}
              </div>
            </div>
          ))}
        </div>
      </div> */}

      {/* 現在フェーズの抽出判定（デバッグ） */}
      {/* <div className="info-section">
        <h4>抽出判定（デバッグ）</h4>
        <div className="all-fields">
          <div className="info-item">
            <div className="info-label">included</div>
            <div className="info-value">{JSON.stringify((ticketInfo as any).debugView?.included || [])}</div>
          </div>
          <div className="info-item">
            <div className="info-label">required</div>
            <div className="info-value">{JSON.stringify((ticketInfo as any).debugView?.required || [])}</div>
          </div>
        </div>
      </div> */}

      {/* 常磐線特急関連ヒアリングセクション */}
      {(ticketInfo.phase2_jobanExpressUse !== null || 
        ticketInfo.phase2_timeSpecification !== null || 
        ticketInfo.phase2_timeSpecificationType !== null || 
        ticketInfo.phase2_specificTime !== null ||
        ticketInfo.zairaiExpressLeg !== null ||
        ticketInfo.transferStation !== null) && (
        <div className="info-section" ref={phase2Ref}>
          <h4>常磐線特急関連</h4>
          
          {ticketInfo.phase2_jobanExpressUse !== null && (
            <div className="info-item completed">
              <div className="info-label">常磐線特急利用</div>
              <div className="info-value">{formatBoolean(ticketInfo.phase2_jobanExpressUse)}</div>
            </div>
          )}

          {ticketInfo.phase2_timeSpecification !== null && (
            <div className="info-item completed">
              <div className="info-label">時間指定</div>
              <div className="info-value">{formatBoolean(ticketInfo.phase2_timeSpecification)}</div>
            </div>
          )}

          {ticketInfo.phase2_timeSpecificationType !== null && (
            <div className="info-item completed">
              <div className="info-label">時間指定種別</div>
              <div className="info-value">{formatTimeType(ticketInfo.phase2_timeSpecificationType)}</div>
            </div>
          )}

          {ticketInfo.phase2_specificTime !== null && (
            <div className="info-item completed">
              <div className="info-label">指定時刻</div>
              <div className="info-value">{ticketInfo.phase2_specificTime || '未入力'}</div>
            </div>
          )}

          {ticketInfo.zairaiExpressCategory && (
            <div className="info-item completed optional">
              <div className="info-label">在来特急種別<span className="optional-badge">オプション</span></div>
              <div className="info-value">{ticketInfo.zairaiExpressCategory}</div>
            </div>
          )}

          {ticketInfo.phase2_useZairaiExpress !== null && (
            <div className="info-item completed optional">
              <div className="info-label">在来線特急利用<span className="optional-badge">オプション</span></div>
              <div className="info-value">{formatBoolean(ticketInfo.phase2_useZairaiExpress!)}</div>
            </div>
          )}

          {ticketInfo.transferStation !== null && (
            <div className="info-item completed optional">
              <div className="info-label">乗り継ぎ駅<span className="optional-badge">オプション</span></div>
              <div className="info-value">{ticketInfo.transferStation || '未入力'}</div>
            </div>
          )}
        </div>
      )}
      
      {/* 確認フェーズの情報 */}
      {ticketInfo.ticketConfirmation && (
        <div className="info-section confirmation-section">
          <h4>確認フェーズ</h4>
          
          {ticketInfo.ticketConfirmation.ticketType && (
            <div className="info-item completed">
              <div className="info-label">発券種類</div>
              <div className="info-value">{ticketInfo.ticketConfirmation.ticketType}</div>
            </div>
          )}
          
          <div className="info-item completed">
            <div className="info-label">出発駅</div>
            <div className="info-value">{ticketInfo.ticketConfirmation.departureStation}</div>
          </div>
          
          <div className="info-item completed">
            <div className="info-label">行き先</div>
            <div className="info-value">{ticketInfo.ticketConfirmation.destination}</div>
          </div>
          
          {/* 常磐線特急券 */}
          {ticketInfo.ticketConfirmation.jobanExpressTicket && (
            <>
              <div className="express-ticket-section">
                <h5>常磐線特急券</h5>
                
                <div className="info-item completed">
                  <div className="info-label">座席未指定利用</div>
                  <div className="info-value">{formatBoolean(ticketInfo.ticketConfirmation.jobanExpressTicket.seatUnspecifiedUse)}</div>
                </div>
                
                <div className="info-item completed">
                  <div className="info-label">常磐線特急</div>
                  <div className="info-value">{formatBoolean(ticketInfo.ticketConfirmation.jobanExpressTicket.useExpressTrain)}</div>
                </div>
                
                {ticketInfo.ticketConfirmation.jobanExpressTicket.trainName && (
                  <div className="info-item completed">
                    <div className="info-label">列車名</div>
                    <div className="info-value">{ticketInfo.ticketConfirmation.jobanExpressTicket.trainName}</div>
                  </div>
                )}
                
                <div className="info-item completed">
                  <div className="info-label">乗車駅</div>
                  <div className="info-value">{ticketInfo.ticketConfirmation.jobanExpressTicket.boardingStation}</div>
                </div>
                
                {ticketInfo.ticketConfirmation.jobanExpressTicket.alightingStation && (
                  <div className="info-item completed">
                    <div className="info-label">降車駅</div>
                    <div className="info-value">{ticketInfo.ticketConfirmation.jobanExpressTicket.alightingStation}</div>
                  </div>
                )}
                
                {ticketInfo.ticketConfirmation.jobanExpressTicket.departureTime && (
                  <div className="info-item completed">
                    <div className="info-label">出発時刻</div>
                    <div className="info-value">{ticketInfo.ticketConfirmation.jobanExpressTicket.departureTime}</div>
                  </div>
                )}
                
                {ticketInfo.ticketConfirmation.jobanExpressTicket.arrivalTime && (
                  <div className="info-item completed">
                    <div className="info-label">到着時刻</div>
                    <div className="info-value">{ticketInfo.ticketConfirmation.jobanExpressTicket.arrivalTime}</div>
                  </div>
                )}
              </div>
            </>
          )}
          
          {/* 在来線特急券 */}
          {ticketInfo.ticketConfirmation.zairaiExpressTicket && (
            <>
              <div className="express-ticket-section">
                <h5>在来線特急券</h5>
                
                <div className="info-item completed">
                  <div className="info-label">利用</div>
                  <div className="info-value">{formatBoolean(ticketInfo.ticketConfirmation.zairaiExpressTicket.use)}</div>
                </div>
                
                {ticketInfo.ticketConfirmation.zairaiExpressTicket.trainName && (
                  <div className="info-item completed">
                    <div className="info-label">列車名</div>
                    <div className="info-value">{ticketInfo.ticketConfirmation.zairaiExpressTicket.trainName}</div>
                  </div>
                )}
                
                <div className="info-item completed">
                  <div className="info-label">乗車駅</div>
                  <div className="info-value">{ticketInfo.ticketConfirmation.zairaiExpressTicket.boardingStation}</div>
                </div>
                
                {ticketInfo.ticketConfirmation.zairaiExpressTicket.lineName && (
                  <div className="info-item completed">
                    <div className="info-label">線区名</div>
                    <div className="info-value">{ticketInfo.ticketConfirmation.zairaiExpressTicket.lineName}</div>
                  </div>
                )}
                
                {ticketInfo.ticketConfirmation.zairaiExpressTicket.alightingStation && (
                  <div className="info-item completed">
                    <div className="info-label">降車駅</div>
                    <div className="info-value">{ticketInfo.ticketConfirmation.zairaiExpressTicket.alightingStation}</div>
                  </div>
                )}
                
                {ticketInfo.ticketConfirmation.zairaiExpressTicket.departureTime && (
                  <div className="info-item completed">
                    <div className="info-label">出発時刻</div>
                    <div className="info-value">{ticketInfo.ticketConfirmation.zairaiExpressTicket.departureTime}</div>
                  </div>
                )}
                
                {ticketInfo.ticketConfirmation.zairaiExpressTicket.arrivalTime && (
                  <div className="info-item completed">
                    <div className="info-label">到着時刻</div>
                    <div className="info-value">{ticketInfo.ticketConfirmation.zairaiExpressTicket.arrivalTime}</div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
      </div>

      {isExtracting && (
        <div className="extracting-indicator">
          <div className="spinner"></div>
          <span>情報を抽出中...</span>
        </div>
      )}

      <style>{`
        .ticket-info-sidebar {
          background: white;
          border-radius: 12px;
          padding: 1rem;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
          height: 100%;
          border: 1px solid rgba(0, 0, 0, 0.05);
          display: flex;
          flex-direction: column;
        }

        .info-content {
          flex: 1;
          overflow-y: auto;
          padding-right: 0.25rem;
          margin-right: -0.25rem;
          scroll-behavior: smooth;
        }

        .info-content::-webkit-scrollbar {
          width: 4px;
        }

        .info-content::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 2px;
        }

        .info-content::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 2px;
        }

        .info-content::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }

        .sidebar-title {
          font-size: 1rem;
          font-weight: 700;
          margin: 0 0 0.75rem 0;
          color: #1e293b;
          letter-spacing: -0.02em;
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }
        
        .sidebar-title::before {
          content: '🎫';
          font-size: 1rem;
        }

        .phase-and-extract {
          display: flex;
          gap: 8px;
          margin-bottom: 8px;
          flex-wrap: wrap;
        }
        .phase-chip, .extract-chip {
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          border-radius: 999px;
          padding: 4px 10px;
          font-size: 0.75rem;
          color: #334155;
        }

        .info-section {
          margin-bottom: 0.75rem;
        }

        .info-section h4 {
          font-size: 0.75rem;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin: 0 0 0.5rem 0;
          padding-bottom: 0.25rem;
          border-bottom: 1px solid #f1f5f9;
        }

        .info-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.375rem 0.5rem;
          border-radius: 6px;
          margin-bottom: 0.25rem;
          background: #f8fafc;
          transition: all 0.2s ease;
          position: relative;
          overflow: hidden;
          border: 1px solid #e2e8f0;
          min-height: 28px;
        }

        .info-item::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 2px;
          background: #ddd;
          transition: background 0.2s ease;
        }

        .info-item.completed {
          background: #f0fdf4;
          border-color: #bbf7d0;
        }

        .info-item.completed::before {
          background: #4caf50;
        }

        .info-label {
          font-size: 0.75rem;
          color: #475569;
          font-weight: 500;
          line-height: 1.2;
        }

        .info-value {
          font-size: 0.75rem;
          color: #1e293b;
          font-weight: 600;
          text-align: right;
          line-height: 1.2;
        }

        .info-item.completed .info-value {
          color: #2e7d32;
        }

        .info-item:not(.completed) .info-value {
          color: #999;
          font-style: italic;
        }

        .info-item.optional {
          background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%);
          border-color: #c7d2fe;
        }

        .info-item.optional::before {
          background: #8b5cf6;
        }

        .optional-badge {
          display: inline-block;
          margin-left: 0.5rem;
          padding: 0.125rem 0.375rem;
          font-size: 0.625rem;
          font-weight: 600;
          background: #8b5cf6;
          color: white;
          border-radius: 4px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          vertical-align: middle;
        }

        .info-item.clickable {
          cursor: pointer;
        }

        .info-item.clickable:hover {
          background: linear-gradient(135deg, #e7f5ff 0%, #d0ebff 100%);
          border-color: #a5d8ff;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .info-item.joban-express {
          background: linear-gradient(135deg, #fff4e6 0%, #ffe0b2 100%);
          border-color: #ffcc80;
        }

        .info-item.joban-express::before {
          background: #ff9800;
        }

        .info-item.joban-express:hover {
          background: linear-gradient(135deg, #fff8e1 0%, #ffecb3 100%);
          border-color: #ffd54f;
        }

        .info-item.joban-zairai-express {
          background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%);
          border-color: #81c784;
        }

        .info-item.joban-zairai-express::before {
          background: #4caf50;
        }

        .info-item.joban-zairai-express:hover {
          background: linear-gradient(135deg, #f1f8e9 0%, #dcedc8 100%);
          border-color: #aed581;
        }

        .info-value .searching {
          color: #1976d2;
          font-style: normal;
        }

        .extracting-indicator {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1.25rem;
          background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
          border-radius: 12px;
          margin-top: 1.25rem;
          gap: 0.75rem;
          border: 1px solid #bfdbfe;
        }

        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid #1976d2;
          border-top-color: transparent;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .extracting-indicator span {
          font-size: 0.875rem;
          color: #1976d2;
          font-weight: 500;
        }
        
        .confirmation-section {
          background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
          padding: 0.75rem;
          border-radius: 8px;
          margin-top: 0.75rem;
          border: 1px solid #fcd34d;
        }
        
        .confirmation-section h4 {
          color: #92400e;
          font-weight: 700;
          font-size: 0.875rem;
        }
        
        .express-ticket-section {
          margin-top: 0.75rem;
        }
        
        .express-ticket-section h5 {
          font-size: 0.75rem;
          font-weight: 600;
          color: #713f12;
          margin: 0 0 0.375rem 0;
          padding-bottom: 0.25rem;
          border-bottom: 1px solid #fbbf24;
        }

        @media (max-width: 768px) {
          .ticket-info-sidebar {
            padding: 1rem;
          }

          .sidebar-title {
            font-size: 1.125rem;
          }

          .info-item {
            padding: 0.5rem;
          }
        }
      `}</style>
    </div>
  );
};