import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Box,
  Typography,
  Tabs,
  Tab,
  Paper,
  CircularProgress,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow
} from '@mui/material';
import { Close, Person, SmartToy, ExpandMore, ConfirmationNumber } from '@mui/icons-material';
import { ConversationService } from '../services/conversation/ConversationService';
import { TicketDisplay } from './TicketDisplay';
import type { TicketInformation } from '../services/ticket/types';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`conversation-tabpanel-${index}`}
      aria-labelledby={`conversation-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

interface ConversationDetailProps {
  conversationId: string;
  open: boolean;
  onClose: () => void;
}

interface ConversationData {
  id: string;
  sessionId: string;
  startTime: string;
  endTime?: string;
  status: string;
  ticketIssued: boolean;
  ticketConfirmed?: boolean;
  hearingItems?: any;
  messages?: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
  feedback?: {
    hasFeedback: boolean;
    content?: string;
    feedbackTime?: string;
  };
  recording?: {
    hasRecording: boolean;
    storageUrl?: string;
    sasToken?: string;
  };
  ttsSettings?: {
    provider: string;
    voiceName?: string;
  };
}

const ConversationDetail: React.FC<ConversationDetailProps> = ({
  conversationId,
  open,
  onClose,
}) => {
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [conversation, setConversation] = useState<ConversationData | null>(null);
  const conversationService = new ConversationService();

  useEffect(() => {
    if (open && conversationId) {
      loadConversationDetail();
    }
  }, [conversationId, open]);

  const loadConversationDetail = async () => {
    setLoading(true);
    try {
      const data = await conversationService.getConversationDetail(conversationId);
      setConversation(data);
    } catch (error) {
      console.error('Failed to load conversation detail:', error);
    }
    setLoading(false);
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('ja-JP');
  };

  const renderHearingItems = () => {
    if (!conversation?.hearingItems) {
      return <Typography>ヒアリング情報なし</Typography>;
    }

    const items = conversation.hearingItems || {};
    
    // 値を適切にフォーマットする関数
    const formatValue = (value: any): string => {
      if (value === null || value === undefined) {
        return '未設定';
      }
      
      // 配列の場合
      if (Array.isArray(value)) {
        if (value.length === 0) {
          return '未設定';
        }
        // routesやjobanExpressRoutesの場合は件数のみ表示
        if (value.length > 10 && typeof value[0] === 'object') {
          return `${value.length}件の経路情報`;
        }
        // その他の配列はカンマ区切りで表示
        return value.map(item => 
          typeof item === 'object' ? JSON.stringify(item) : String(item)
        ).join(', ');
      }
      
      // オブジェクトの場合
      if (typeof value === 'object') {
        return JSON.stringify(value, null, 2);
      }
      
      // その他の値
      return String(value);
    };
    
    return (
      <Box>
        {/* TTS設定を表示 */}
        {conversation?.ttsSettings && (
          <Box sx={{ mb: 3, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'bold' }}>
              音声合成設定
            </Typography>
            <Box sx={{ mb: 1 }}>
              <Typography variant="subtitle2" color="text.secondary">
                TTSプロバイダー
              </Typography>
              <Typography variant="body1">
                {conversation.ttsSettings.provider === 'azure' ? 'Azure Speech Service' : 
                 conversation.ttsSettings.provider === 'google-cloud' ? 'Google Cloud TTS' : 
                 conversation.ttsSettings.provider}
              </Typography>
            </Box>
            {conversation.ttsSettings.voiceName && (
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  音声種別
                </Typography>
                <Typography variant="body1">
                  {conversation.ttsSettings.voiceName}
                </Typography>
              </Box>
            )}
          </Box>
        )}
        
        {/* ヒアリング項目を表示 */}
        {Object.entries(items).map(([key, value]) => {
          // routes系の大量データは折りたたみ表示
          const isRouteData = key.includes('routes') || key.includes('Routes');
          
          // 経路データの場合は特別な表示
          if (isRouteData && Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
            return (
              <Accordion key={key} sx={{ mb: 2 }}>
                <AccordionSummary expandIcon={<ExpandMore />}>
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      {key}
                    </Typography>
                    <Typography variant="body1">
                      {value.length}件の経路情報 (クリックで詳細表示)
                    </Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
                    <Table stickyHeader size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>経路番号</TableCell>
                          <TableCell>出発時刻</TableCell>
                          <TableCell>到着時刻</TableCell>
                          <TableCell>所要時間</TableCell>
                          <TableCell>料金</TableCell>
                          <TableCell>乗換回数</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {value.map((route: any, index: number) => (
                          <TableRow key={index}>
                            <TableCell>{index + 1}</TableCell>
                            <TableCell>{route.departureTime || '-'}</TableCell>
                            <TableCell>{route.arrivalTime || '-'}</TableCell>
                            <TableCell>{route.duration || '-'}</TableCell>
                            <TableCell>{route.fare ? `¥${route.fare.toLocaleString()}` : '-'}</TableCell>
                            <TableCell>{route.transferCount ?? '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="caption" color="text.secondary">
                      詳細データ（JSON形式）:
                    </Typography>
                    <Paper sx={{ p: 1, mt: 1, maxHeight: 200, overflow: 'auto', bgcolor: 'grey.50' }}>
                      <pre style={{ fontSize: '0.75rem', margin: 0, fontFamily: 'monospace' }}>
                        {JSON.stringify(value, null, 2)}
                      </pre>
                    </Paper>
                  </Box>
                </AccordionDetails>
              </Accordion>
            );
          }
          
          // 通常のヒアリング項目
          const formattedValue = formatValue(value);
          return (
            <Box key={key} sx={{ mb: 2 }}>
              <Typography variant="subtitle2" color="text.secondary">
                {key}
              </Typography>
              <Typography 
                variant="body1" 
                sx={{ 
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}
              >
                {formattedValue}
              </Typography>
            </Box>
          );
        })}
      </Box>
    );
  };

  const renderMessages = () => {
    if (!conversation?.messages || conversation.messages.length === 0) {
      return <Typography>会話履歴なし</Typography>;
    }

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: '500px', overflowY: 'auto', p: 2 }}>
        {conversation.messages.map((message) => (
          <Box
            key={message.id}
            sx={{
              display: 'flex',
              justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
              mb: 1
            }}
          >
            <Box
              sx={{
                maxWidth: '70%',
                display: 'flex',
                flexDirection: message.role === 'user' ? 'row-reverse' : 'row',
                gap: 1,
                alignItems: 'flex-start'
              }}
            >
              <Box
                sx={{
                  backgroundColor: message.role === 'user' ? '#1976d2' : '#f5f5f5',
                  color: message.role === 'user' ? 'white' : 'inherit',
                  borderRadius: 2,
                  p: 1.5,
                  minWidth: '40px',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  height: 'fit-content'
                }}
              >
                {message.role === 'user' ? (
                  <Person sx={{ color: 'white' }} />
                ) : (
                  <SmartToy sx={{ color: '#757575' }} />
                )}
              </Box>
              <Box sx={{ flex: 1 }}>
                <Paper
                  elevation={1}
                  sx={{
                    p: 2,
                    backgroundColor: message.role === 'user' ? '#e3f2fd' : '#f5f5f5',
                    borderRadius: message.role === 'user' 
                      ? '16px 16px 4px 16px' 
                      : '16px 16px 16px 4px',
                    borderLeft: message.role === 'user' ? 'none' : '3px solid #9c27b0',
                    borderRight: message.role === 'user' ? '3px solid #1976d2' : 'none',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                      {message.role === 'user' ? 'あなた' : 'AI アシスタント'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatDateTime(message.timestamp)}
                    </Typography>
                  </Box>
                  <Typography 
                    variant="body2" 
                    sx={{ 
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word'
                    }}
                  >
                    {message.content}
                  </Typography>
                </Paper>
              </Box>
            </Box>
          </Box>
        ))}
      </Box>
    );
  };

  const renderFeedback = () => {
    if (!conversation?.feedback?.hasFeedback) {
      return <Typography>フィードバックなし</Typography>;
    }

    return (
      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          送信日時: {conversation.feedback.feedbackTime && formatDateTime(conversation.feedback.feedbackTime)}
        </Typography>
        <Paper sx={{ p: 2, bgcolor: 'background.default' }}>
          <Typography 
            variant="body1"
            sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
          >
            {conversation.feedback.content || 'フィードバック内容なし'}
          </Typography>
        </Paper>
      </Box>
    );
  };

  const renderRecording = () => {
    if (!conversation?.recording?.hasRecording) {
      return <Typography>録音なし</Typography>;
    }

    if (!conversation.recording.storageUrl || !conversation.recording.sasToken) {
      return <Alert severity="warning">録音ファイルのURLが取得できません</Alert>;
    }

    const audioUrl = `${conversation.recording.storageUrl}?${conversation.recording.sasToken}`;

    return (
      <Box>
        <Typography variant="body2" sx={{ mb: 2 }}>
          会話の録音を再生できます
        </Typography>
        <audio controls style={{ width: '100%' }}>
          <source src={audioUrl} type="audio/webm" />
          <source src={audioUrl} type="audio/mp4" />
          お使いのブラウザは音声再生に対応していません。
        </audio>
      </Box>
    );
  };

  const renderTicket = () => {
    if (!conversation?.hearingItems) {
      return <Typography>発券情報なし</Typography>;
    }

    const ticketInfo = conversation.hearingItems as TicketInformation;
    
    if (!ticketInfo.proposedRoute && !ticketInfo.phase2_confirmUnspecifiedSeat) {
      return (
        <Alert severity="info">
          切符情報が見つかりません。発券が完了していない可能性があります。
        </Alert>
      );
    }

    return <TicketDisplay ticketInfo={ticketInfo} />;
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6">会話詳細</Typography>
          <IconButton onClick={onClose}>
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tabs value={tabValue} onChange={handleTabChange} variant="scrollable" scrollButtons="auto">
                <Tab label="ヒアリング情報" />
                <Tab label="会話履歴" />
                <Tab label="フィードバック" />
                <Tab label="録音" />
                <Tab 
                  label="切符表示" 
                  icon={<ConfirmationNumber />}
                  iconPosition="start"
                  disabled={!(conversation?.ticketConfirmed || conversation?.hearingItems?.ticketConfirmed)}
                />
              </Tabs>
            </Box>
            <TabPanel value={tabValue} index={0}>
              {renderHearingItems()}
            </TabPanel>
            <TabPanel value={tabValue} index={1}>
              {renderMessages()}
            </TabPanel>
            <TabPanel value={tabValue} index={2}>
              {renderFeedback()}
            </TabPanel>
            <TabPanel value={tabValue} index={3}>
              {renderRecording()}
            </TabPanel>
            <TabPanel value={tabValue} index={4}>
              {renderTicket()}
            </TabPanel>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ConversationDetail;