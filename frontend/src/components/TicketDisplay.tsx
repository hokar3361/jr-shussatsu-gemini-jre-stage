import React from 'react';
import { Box, Typography, Paper, Grid, Divider } from '@mui/material';
import { styled } from '@mui/material/styles';
import type { TicketInformation, JobanExpressRoute } from '../services/ticket/types';
// import type { Route } from '../services/cosmos/types';
import { ConversationContextGenerator } from '../services/conversation/ConversationHooks';

// JR切符風のスタイリング
const TicketPaper = styled(Paper)(({ theme }) => ({
  backgroundColor: '#E8F5E9',
  border: '2px solid #1B5E20',
  borderRadius: '8px',
  padding: theme.spacing(2),
  maxWidth: '400px',
  margin: '0 auto',
  position: 'relative',
  overflow: 'hidden',
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '30px',
    backgroundColor: '#1B5E20',
  },
}));

const TicketHeader = styled(Box)(({ theme }) => ({
  position: 'relative',
  zIndex: 1,
  color: 'white',
  marginTop: '-16px',
  marginBottom: theme.spacing(2),
  textAlign: 'center',
}));

const TicketContent = styled(Box)(({ theme }) => ({
  padding: theme.spacing(1),
}));

const StationInfo = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: theme.spacing(2),
}));

const RouteArrow = styled(Typography)(() => ({
  fontSize: '24px',
  margin: '0 16px',
}));

const PriceBox = styled(Box)(({ theme }) => ({
  border: '2px solid #1B5E20',
  borderRadius: '4px',
  padding: theme.spacing(1, 2),
  marginTop: theme.spacing(2),
  backgroundColor: 'white',
}));

interface TicketDisplayProps {
  ticketInfo: TicketInformation;
}

export const TicketDisplay: React.FC<TicketDisplayProps> = ({ ticketInfo }) => {
  const proposedRoute = ticketInfo.proposedRoute as JobanExpressRoute;

  //zairaiExpressLegは初期提案なので、proposedRouteから最後の在来特急区間を取得
  const zairaiExpressLegs = ConversationContextGenerator.getLastZairaiExpressLegs(proposedRoute, true);
  const zairaiSpecialLegs = ConversationContextGenerator.getLastZairaiExpressLegs(ticketInfo.zairaiSpecial_proposedRoute!, true);

  const isNormalTrain = !ticketInfo.phase2_jobanExpressUse; // 普通列車のみかどうか
  const isUnspecifiedSeat = ticketInfo.phase2_confirmUnspecifiedSeat === true; // 座席未指定券かどうか

  const jobanExpressSeatInfo = ticketInfo.jobanExpressSeatInfo || '聞き取れず';
  const zairaiExpressSeatInfo = ticketInfo.zairaiExpressSeatInfo || '聞き取れず';

  // 時刻フォーマット（時分のみに修正）
  const formatTime = (time: string | null | undefined) => {
    if (!time) return '';
    // 時分秒形式（HH:MM:SS）から時分形式（HH:MM）に変換
    return time.replace(/:\d{2}$/, '');
  };

  // 常磐線特急の詳細情報を取得
  const getJobanExpressDetails = () => {
    if (!proposedRoute?.jobanExpressLegs || proposedRoute.jobanExpressLegs.length === 0) {
      return null;
    }
    const leg = proposedRoute.jobanExpressLegs[0];
    return {
      depStation: leg.from?.name || '水戸',
      nickName: leg.nickname || '',
      arrStation: leg.to?.name || '',
      depTime: formatTime(leg.from?.time),
      arrTime: formatTime(leg.to?.time),
      trainName: leg.trainName || '常磐線特急'
    };
  };

  // const getZairaiExpressDetails = () => {
  //   if (zairaiExpressLeg) {
  //     return zairaiExpressLeg;
  //   }
  //   if (zairaiSpecialRoute) {
  //     return zairaiSpecialRoute;
  //   }
  //   return null;
  // };

  const jobanDetails = getJobanExpressDetails();
  let firstZairaiDetails = null;
  let lastZairaiDetails = null;
  if (zairaiSpecialLegs) {
    firstZairaiDetails = zairaiSpecialLegs[0];
    lastZairaiDetails = zairaiSpecialLegs[zairaiSpecialLegs.length - 1];
  } else {
    if (zairaiExpressLegs) {
      firstZairaiDetails = zairaiExpressLegs[0];
      lastZairaiDetails = zairaiExpressLegs[zairaiExpressLegs.length - 1];
    }
  }
  // const departureTime = formatTime(proposedRoute?.departureTime);
  // const arrivalTime = formatTime(proposedRoute?.arrivalTime);

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" align="center" gutterBottom sx={{ color: '#1B5E20', fontWeight: 'bold' }}>
        JR乗車券・特急券
      </Typography>

      <TicketPaper elevation={3}>
        <TicketHeader>
          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
            JR東日本
          </Typography>
        </TicketHeader>

        <TicketContent>
          {/* 日付と人数 */}
          <Box sx={{ mb: 2 }}>
            <Grid container spacing={2}>
              <Grid size={6}>
                <Typography variant="caption" color="textSecondary">利用日</Typography>
                <Typography variant="body2">{ticketInfo.travelDate || '2025-07-28'}</Typography>
              </Grid>
              <Grid size={6}>
                <Typography variant="caption" color="textSecondary">人数</Typography>
                <Typography variant="body2">
                  大人 {ticketInfo.adultCount || 0}名
                  {ticketInfo.childCount ? `、子供 ${ticketInfo.childCount}名` : ''}
                </Typography>
              </Grid>
            </Grid>
          </Box>

          <Divider sx={{ my: 2 }} />

          {/* 乗車区間 */}
          <StationInfo>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 'bold' }}>水　戸</Typography>
              <Typography variant="body2">{isNormalTrain ? '※時刻指定なし' : ""}</Typography>
            </Box>
            <RouteArrow>→</RouteArrow>
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="h6" sx={{ fontWeight: 'bold' }}>{ticketInfo.destination?.split('').join('　')}</Typography>
              <Typography variant="body2">{isNormalTrain ? '※時刻指定なし' : ""}</Typography>
            </Box>
          </StationInfo>

          <Divider sx={{ my: 2 }} />

          {/* 列車情報 */}
          {isNormalTrain ? (
            // 普通列車の場合
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" color="textSecondary">列車種別</Typography>
              <Typography variant="body1" sx={{ fontWeight: 'bold', color: '#1B5E20' }}>
                普通列車
              </Typography>
              <Typography variant="body2" color="textSecondary">
                ※乗車券のみ（特急券不要）
              </Typography>
            </Box>
          ) : isUnspecifiedSeat && !proposedRoute ? (
            // 座席未指定券の場合（経路指定なし）
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" color="textSecondary">常磐線特急</Typography>
              <Typography variant="body1" sx={{ fontWeight: 'bold', color: '#1B5E20' }}>
                常磐線特急
              </Typography>
              <Box sx={{ mt: 1, p: 1, backgroundColor: '#FFF3E0', borderRadius: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#E65100' }}>
                  座席未指定券
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  ※座席の指定はありません
                </Typography>
              </Box>
            </Box>
          ) : (
            // 常磐線特急の場合（経路指定あり）
            jobanDetails && (
              <>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="caption" color="textSecondary">常磐線特急</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 'bold', color: '#1B5E20' }}>
                    {jobanDetails.nickName} ／ {jobanDetails.trainName}
                  </Typography>
                  <Typography variant="body2">
                    {jobanDetails.depStation} {jobanDetails.depTime} → {ticketInfo.phase2_jobanDropOffStation || jobanDetails.arrStation} {jobanDetails.arrTime}
                  </Typography>
                </Box>

                {isUnspecifiedSeat && (
                  <Box sx={{ mt: 1, p: 1, backgroundColor: '#FFF3E0', borderRadius: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#E65100' }}>
                      座席未指定券
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      ※座席の指定はありません
                    </Typography>
                  </Box>
                )}
                {jobanExpressSeatInfo && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body1" sx={{ fontWeight: 'bold', color: '#1B5E20' }}>
                      座席希望：{jobanExpressSeatInfo}
                    </Typography>
                  </Box>
                )}
              </>
            )
          )}

          {/* 在来特急の案内 - useZairaiExpressがtrue or 到着の場合のみ表示 */}
          {firstZairaiDetails && lastZairaiDetails && (ticketInfo.phase2_useZairaiExpress || ticketInfo.phase2_timeSpecificationType === "stop") && (
            <>
              <hr />
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" color="textSecondary">在来特急</Typography>
                <Typography variant="body1" sx={{ fontWeight: 'bold', color: '#1B5E20' }}>
                  {firstZairaiDetails?.nickname || 'なし'} ／ {firstZairaiDetails?.trainName || 'なし'}
                </Typography>

                <Typography variant="body2">
                  {firstZairaiDetails?.from.name || 'なし'} {formatTime(firstZairaiDetails?.from.time || 'なし')} → {lastZairaiDetails?.to.name || 'なし'} {formatTime(lastZairaiDetails?.to.time || 'なし')}
                </Typography>
              </Box>

              {zairaiExpressSeatInfo && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body1" sx={{ fontWeight: 'bold', color: '#1B5E20' }}>
                    座席希望：{zairaiExpressSeatInfo}
                  </Typography>
                </Box>
              )}
            </>
          )}
          {/* 料金 */}
          <PriceBox>
            <Grid container justifyContent="space-between">
              <Grid>
                <Typography variant="body2" color="textSecondary">運賃・料金</Typography>
              </Grid>
              <Grid>
                <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#1B5E20' }}>
                  ￥---
                </Typography>
              </Grid>
            </Grid>
          </PriceBox>

          {/* 発券情報 */}
          <Box sx={{ mt: 2, textAlign: 'center' }}>
            <Typography variant="caption" color="textSecondary">
              発券日時: {new Date().toLocaleString('ja-JP')}
            </Typography>
          </Box>
        </TicketContent>
      </TicketPaper>

      <Box sx={{ mt: 3, textAlign: 'center' }}>
        <Typography variant="body2" color="textSecondary">
          ※この画面はデモ用です。実際の切符ではありません。
        </Typography>
      </Box>
    </Box>
  );
};