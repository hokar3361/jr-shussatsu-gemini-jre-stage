import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Chip,
  FormControlLabel,
  Switch,
  TablePagination,
  CircularProgress,
  Button,
  Alert,
  TextField,
} from '@mui/material';
import { 
  Visibility, 
  Feedback, 
  Mic, 
  CheckCircle, 
  Cancel,
  HourglassEmpty,
  ArrowBack,
  NavigateBefore,
  NavigateNext,
} from '@mui/icons-material';
import { ConversationService } from '../services/conversation/ConversationService';
import ConversationDetail from './ConversationDetail';

interface Conversation {
  id: string;
  sessionId: string;
  startTime: string;
  endTime?: string;
  status: 'completed' | 'in_progress' | 'aborted';
  ticketIssued: boolean;
  ticketConfirmed?: boolean;
  hearingItems?: {
    destination?: string;
    travelDate?: string;
    adultCount?: number;
    childCount?: number;
    basicInfoConfirmed?: boolean;
    ticketConfirmed?: boolean;
    [key: string]: any;
  };
  feedback?: {
    hasFeedback: boolean;
    content?: string;
  };
  recording?: {
    hasRecording: boolean;
  };
}

const ConversationHistory: React.FC = () => {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [filteredConversations, setFilteredConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [filterFeedback, setFilterFeedback] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [totalCount, setTotalCount] = useState(0);
  const [, setHasMore] = useState(false);
  
  // 絞り込み条件
  const [filterDestination, setFilterDestination] = useState<string>('');
  const [filterBasicInfoConfirmed, setFilterBasicInfoConfirmed] = useState<boolean>(true);
  const [filterTicketConfirmed, setFilterTicketConfirmed] = useState<boolean>(true);

  const conversationService = new ConversationService();

  useEffect(() => {
    setPage(0);
    loadConversationsForDate();
  }, [selectedDate, filterDestination, filterBasicInfoConfirmed, filterTicketConfirmed]);

  useEffect(() => {
    loadConversationsForDate();
  }, [page, rowsPerPage]);

  useEffect(() => {
    if (filterFeedback) {
      setFilteredConversations(conversations.filter(c => c.feedback?.hasFeedback));
    } else {
      setFilteredConversations(conversations);
    }
  }, [conversations, filterFeedback]);

  const loadConversationsForDate = async () => {
    setLoading(true);
    setError(null);
    try {
      const skip = page * rowsPerPage;
      const filters = {
        destination: filterDestination || undefined,
        basicInfoConfirmed: filterBasicInfoConfirmed,
        ticketConfirmed: filterTicketConfirmed
      };
      const data = await conversationService.getConversationsByDate(
        selectedDate,
        skip,
        rowsPerPage,
        filters
      );
      // 発券確認済みの場合はステータスを完了に変更
      const updatedConversations = data.conversations.map(conv => ({
        ...conv,
        status: (conv.ticketConfirmed || conv.hearingItems?.ticketConfirmed) ? 'completed' as const : conv.status
      }));
      setConversations(updatedConversations);
      setTotalCount(data.totalCount);
      setHasMore(data.hasMore);
    } catch (error: any) {
      console.error('Failed to load conversations:', error);
      setConversations([]);
      setTotalCount(0);
      setHasMore(false);
      if (error.message?.includes('Cosmos DB')) {
        setError('Cosmos DBの設定が不足しています。管理者にお問い合わせください。');
      } else {
        setError('会話履歴の読み込みに失敗しました。');
      }
    }
    setLoading(false);
  };

  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate);
  };

  const changeDate = (days: number) => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + days);
    setSelectedDate(date.toISOString().split('T')[0]);
  };

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle color="success" fontSize="small" />;
      case 'in_progress':
        return <HourglassEmpty color="warning" fontSize="small" />;
      case 'aborted':
        return <Cancel color="error" fontSize="small" />;
      default:
        return null;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return '完了';
      case 'in_progress':
        return '進行中';
      case 'aborted':
        return '中断';
      default:
        return status;
    }
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('ja-JP');
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '未設定';
    const date = new Date(dateStr);
    return date.toLocaleDateString('ja-JP');
  };

  const formatHearingInfo = (hearingItems: Conversation['hearingItems']) => {
    if (!hearingItems) return { destination: '未設定', travelDate: '未設定', passengers: '未設定', confirmed: '未確認' };
    
    const destination = hearingItems.destination || '未設定';
    const travelDate = formatDate(hearingItems.travelDate);
    const adultCount = hearingItems.adultCount || 0;
    const childCount = hearingItems.childCount || 0;
    const passengers = (adultCount || childCount) ? `大人${adultCount}名 子供${childCount}名` : '未設定';
    const confirmed = hearingItems.basicInfoConfirmed ? '確認済' : '未確認';
    
    return { destination, travelDate, passengers, confirmed };
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button
            startIcon={<ArrowBack />}
            onClick={() => navigate('/')}
            variant="contained"
            sx={{ 
              backgroundColor: '#0A8C0D',
              '&:hover': {
                backgroundColor: '#086B0A'
              }
            }}
          >
            戻る
          </Button>
          <Typography variant="h4" component="h1" sx={{ color: '#0A8C0D' }}>
            会話履歴一覧
          </Typography>
        </Box>
        <FormControlLabel
          control={
            <Switch
              checked={filterFeedback}
              onChange={(e) => setFilterFeedback(e.target.checked)}
              color="primary"
            />
          }
          label="フィードバックありのみ表示"
        />
      </Box>

      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton onClick={() => changeDate(-1)} size="small">
            <NavigateBefore />
          </IconButton>
          <TextField
            type="date"
            value={selectedDate}
            onChange={(e) => handleDateChange(e.target.value)}
            variant="outlined"
            size="small"
            sx={{ width: 180 }}
            InputLabelProps={{ shrink: true }}
            label="日付選択"
          />
          <IconButton 
            onClick={() => changeDate(1)} 
            size="small"
            disabled={selectedDate >= new Date().toISOString().split('T')[0]}
          >
            <NavigateNext />
          </IconButton>
        </Box>
        
        <TextField
          value={filterDestination}
          onChange={(e) => setFilterDestination(e.target.value)}
          variant="outlined"
          size="small"
          sx={{ width: 150 }}
          placeholder="例: 東京"
          label="行き先"
        />
        
        <FormControlLabel
          control={
            <Switch
              checked={filterBasicInfoConfirmed}
              onChange={(e) => setFilterBasicInfoConfirmed(e.target.checked)}
              color="primary"
              size="small"
            />
          }
          label="基本情報確認済みのみ"
        />
        
        <FormControlLabel
          control={
            <Switch
              checked={filterTicketConfirmed}
              onChange={(e) => setFilterTicketConfirmed(e.target.checked)}
              color="primary"
              size="small"
            />
          }
          label="発券済みのみ"
        />
        
        <Typography variant="body2" color="text.secondary">
          {totalCount > 0 ? `${totalCount}件の履歴` : '履歴なし'}
        </Typography>
      </Box>

      {error && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : conversations.length === 0 && !error ? (
        <Alert severity="info">
          会話履歴がありません。発券システムで会話を開始してください。
        </Alert>
      ) : (
        <>
          <TableContainer 
            component={Paper} 
            elevation={2}
            sx={{ 
              maxHeight: { xs: '60vh', sm: '70vh', md: '75vh' },
              overflow: 'auto',
              '& .MuiTable-root': {
                minWidth: { xs: 600, sm: 800, md: 1000 }
              }
            }}
          >
            <Table stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ minWidth: 120 }}>会話ID</TableCell>
                  <TableCell sx={{ minWidth: 140 }}>開始日時</TableCell>
                  <TableCell sx={{ minWidth: 100 }}>ステータス</TableCell>
                  <TableCell sx={{ minWidth: 100 }}>行き先</TableCell>
                  <TableCell sx={{ minWidth: 100 }}>旅行日</TableCell>
                  <TableCell sx={{ minWidth: 80 }}>人数</TableCell>
                  <TableCell align="center" sx={{ minWidth: 120 }}>基本情報確認</TableCell>
                  <TableCell align="center" sx={{ minWidth: 80 }}>発券</TableCell>
                  <TableCell align="center" sx={{ minWidth: 100 }}>フィードバック</TableCell>
                  <TableCell align="center" sx={{ minWidth: 80 }}>録音</TableCell>
                  <TableCell align="center" sx={{ minWidth: 80 }}>操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredConversations
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((conversation) => {
                    const hearingInfo = formatHearingInfo(conversation.hearingItems);
                    return (
                      <TableRow key={conversation.id} hover>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                            {conversation.id.slice(0, 8)}...
                          </Typography>
                        </TableCell>
                        <TableCell>{formatDateTime(conversation.startTime)}</TableCell>
                        <TableCell>
                          <Chip
                            icon={getStatusIcon(conversation.status) ?? undefined}
                            label={getStatusLabel(conversation.status)}
                            size="small"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>{hearingInfo.destination}</TableCell>
                        <TableCell>{hearingInfo.travelDate}</TableCell>
                        <TableCell>{hearingInfo.passengers}</TableCell>
                        <TableCell align="center">
                          <Chip
                            label={hearingInfo.confirmed}
                            size="small"
                            color={conversation.hearingItems?.basicInfoConfirmed ? "success" : "default"}
                            variant={conversation.hearingItems?.basicInfoConfirmed ? "filled" : "outlined"}
                          />
                        </TableCell>
                      <TableCell align="center">
                        {(conversation.ticketConfirmed || conversation.hearingItems?.ticketConfirmed) && (
                          <CheckCircle color="success" fontSize="small" />
                        )}
                      </TableCell>
                      <TableCell align="center">
                        {conversation.feedback?.hasFeedback && (
                          <Feedback color="secondary" fontSize="small" />
                        )}
                      </TableCell>
                      <TableCell align="center">
                        {conversation.recording?.hasRecording && (
                          <Mic color="primary" fontSize="small" />
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <IconButton
                          color="primary"
                          onClick={() => setSelectedConversation(conversation.id)}
                          size="small"
                        >
                          <Visibility />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={totalCount}
            page={page}
            onPageChange={handleChangePage}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            labelRowsPerPage="表示件数:"
            labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${count}件`}
            rowsPerPageOptions={[25, 50, 100]}
          />
        </>
      )}

      {selectedConversation && (
        <ConversationDetail
          conversationId={selectedConversation}
          open={!!selectedConversation}
          onClose={() => setSelectedConversation(null)}
        />
      )}
    </Container>
  );
};

export default ConversationHistory;