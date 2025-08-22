import { useState, useEffect } from 'react'
import ChatInterface from './ChatInterface'
import ConnectionStatus from './ConnectionStatus'
import AudioControls from './AudioControls'
import { ModeSelector } from './Settings/ModeSelector'
import DialogStatus from './DialogStatus'
import type { Message } from '../types/index'
import { type CommunicationMode, ConnectionState, type Message as CommunicationMessage } from '../services/communication'
import { useCommunication } from '../hooks/useCommunication'
import { getConfig } from '../config'
import { ConfigManager } from '../config/ConfigManager'
import { type DialogFlowState } from '../types/dialog'
import { useTicketSystem } from '../hooks/useTicketSystem'
import { TicketInfoSidebar } from './ticket/TicketInfoSidebar'
import { RouteListPopup } from './ticket/RouteListPopup'
import { JobanExpressPopup } from './ticket/JobanExpressPopup'
import { TicketDisplay } from './TicketDisplay'
import { Dialog, DialogContent, IconButton, Button, Box, Typography } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import SettingsIcon from '@mui/icons-material/Settings'
import HomeIcon from '@mui/icons-material/Home'
import { loadStationDictionary } from '../constants/jrStationDictionary'
import { DebugChatInjector } from '../services/communication/DebugChatInjector'
import { StationNameNormalizer } from '../services/ticket/StationNameNormalizer'
import { TTSSettings } from './Settings/TTSSettings'
import FeedbackIcon from '@mui/icons-material/Feedback'
import FeedbackDialog from './FeedbackDialog'
import { useNavigate } from 'react-router-dom'

function TicketSystem() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([])
  const [communicationMode, setCommunicationMode] = useState<CommunicationMode>('azure')
  const [dialogFlowState, setDialogFlowState] = useState<DialogFlowState | null>(null)
  const [isRouteListOpen, setIsRouteListOpen] = useState(false)
  const [isJobanExpressOpen, setIsJobanExpressOpen] = useState(false)
  const [isJobanZairaiExpressOpen, setIsJobanZairaiExpressOpen] = useState(false)
  const [, setIsZairaiSpecialOpen] = useState(false)
  const [isTicketDisplayOpen, setIsTicketDisplayOpen] = useState(false)
  const [isTTSSettingsOpen, setIsTTSSettingsOpen] = useState(false)
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false)
  
  // アプリケーション起動時に駅名辞書を読み込む
  useEffect(() => {
    // 既存の駅名辞書読み込み
    loadStationDictionary().catch(error => {
      console.error('Failed to load station dictionary:', error);
    });
    
    // 駅名正規化用の辞書読み込み
    const normalizer = StationNameNormalizer.getInstance();
    normalizer.loadDictionary().catch(error => {
      console.error('Failed to load destination dictionary for normalizer:', error);
    });
  }, []);

  // DebugChatInjector のハンドラ登録（UIにデバッグメッセージを差し込む）
  useEffect(() => {
    DebugChatInjector.setHandler((dbg) => {
      const id = `debug-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      setMessages(prev => ([
        ...prev,
        {
          id,
          text: dbg.content,
          sender: 'gemini',
          timestamp: new Date(),
          type: 'text',
          isDebug: true
        }
      ]))
    })
  }, [])
  
  // メッセージ完了時のハンドラ
  const handleMessageComplete = () => {
    // DialogFlowStateから共通メッセージを取得して表示
    if (dialogFlowState && dialogFlowState.messageHistory.length > 0) {
      const latestMessages = dialogFlowState.messageHistory.slice(-2); // 最新の2つのメッセージ
      latestMessages.forEach(msg => {
        if (msg.type === 'completion') {
          console.log(`[DialogFlow] ${msg.content}`);
        }
      });
    }
  };
  
  // Communication config state
  const [communicationConfig, setCommunicationConfig] = useState<any>(null);
  
  // Get communication configuration based on mode
  const getCommunicationConfig = async () => {
    const config = await getConfig();
    
    // ConfigManagerに設定を保存
    ConfigManager.getInstance().setConfig(config);
    
    switch (communicationMode) {
      case 'azure':
        return { 
          azureConfig: {
            speechSubscriptionKey: config.azure.speechSubscriptionKey,
            speechRegion: config.azure.speechRegion,
            openAIEndpoint: config.azure.openAIEndpoint,
            openAIApiKey: config.azure.openAIApiKey,
            openAIDeployment: config.azure.openAIDeployment,
            openAIDeploymentGpt4o: config.azure.openAIDeploymentGpt4o,
            voiceName: config.azure.voiceName,
            openAIEastUsEndpoint: config.azure.openAIEastUsEndpoint,
            openAIEastUsApiKey: config.azure.openAIEastUsApiKey,
            openAIEastUsDeployment: config.azure.openAIEastUsDeployment,
            openAIEastUsDeploymentGpt5: config.azure.openAIEastUsDeploymentGpt5
          }
        }
      case 'gemini-websocket':
        return { proxyUrl: config.app.wsUrl || 'ws://localhost:8080' }
      case 'oauth-direct':
        return { apiHost: 'us-central1-aiplatform.googleapis.com' }
      default:
        return {}
    }
  }
  
  // Load communication config when mode changes
  useEffect(() => {
    const loadConfig = async () => {
      const config = await getCommunicationConfig();
      setCommunicationConfig(config);
    };
    loadConfig();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communicationMode]);
  
  // Use communication hook
  const {
    service,
    connectionState,
    isRecording,
    startRecording,
    stopRecording,
    sendText,
  } = useCommunication({
    mode: communicationMode,
    config: communicationConfig,
    onMessage: (message: CommunicationMessage) => {
      const sender = message.role === 'user' ? 'user' : 'gemini';
      
      setMessages(prev => {
        // Check if message with same ID already exists
        const existingIndex = prev.findIndex(m => m.id === message.id);
        
        if (existingIndex !== -1) {
          // Update existing message
          const updatedMessages = [...prev];
          updatedMessages[existingIndex] = {
            ...updatedMessages[existingIndex],
            text: message.content,
            timestamp: message.timestamp,
            turnComplete: message.turnComplete
          };
          
          return updatedMessages;
        } else {
          // Create new message
          const appMessage: Message = {
            id: message.id,
            text: message.content,
            sender: sender,
            timestamp: message.timestamp,
            type: message.isTranscription ? 'audio' : 'text',
            isTranscription: message.isTranscription,
            turnComplete: message.turnComplete
          };
          
          return [...prev, appMessage];
        }
      });
    },
    onMessageComplete: (message: CommunicationMessage) => {
      console.log("message", message)
      handleMessageComplete();
    },
    onError: (error: Error) => {
      console.error('Communication error:', error)
    }
  })
  
  // 発券システムの状態を取得（serviceが定義された後）
  const { ticketState, isEnabled: isTicketSystemEnabled } = useTicketSystem(
    service?.getDialogFlowManager ? service.getDialogFlowManager() : undefined
  )
  
  // 発券完了を監視
  useEffect(() => {
    if (ticketState?.ticketInfo?.ticketIssued) {
      // 切符表示ポップアップを開く
      setIsTicketDisplayOpen(true);
      
      // 音声通話を終了
      if (service && isRecording) {
        stopRecording();
      }
    }
  }, [ticketState?.ticketInfo?.ticketIssued, service, isRecording, stopRecording])

  // Clear messages when mode changes
  useEffect(() => {
    setMessages([])
  }, [communicationMode])

  // Setup DialogFlowManager state listener
  useEffect(() => {
    if (service && 'getDialogFlowManager' in service) {
      const dialogFlowManager = (service as any).getDialogFlowManager();
      dialogFlowManager.setOnStateChange((state: DialogFlowState) => {
        setDialogFlowState(state);
      });
    }
  }, [service])

  const handleToggleRecording = async () => {
    if (isRecording) {
      stopRecording()
    } else {
      try {
        startRecording()
      } catch (error) {
        console.error('Failed to start recording:', error)
      }
    }
  }

  const handleSendText = async (text: string) => {
    try {
      await sendText(text)
    } catch (error) {
      console.error('Failed to send message:', error)
    }
  }
  
  const handleModeChange = (mode: CommunicationMode) => {
    setCommunicationMode(mode)
  }

  const handleFeedbackSubmit = async (feedback: string) => {
    // フィードバックをConversationRecorderに送信
    console.log('Feedback submitted:', feedback);
    
    // DialogFlowManager経由でフィードバックを送信
    if (service && 'getDialogFlowManager' in service) {
      const dialogFlowManager = (service as any).getDialogFlowManager();
      if (dialogFlowManager && 'addFeedback' in dialogFlowManager) {
        try {
          await dialogFlowManager.addFeedback(feedback);
          console.log('Feedback sent successfully');
        } catch (error) {
          console.error('Failed to send feedback:', error);
        }
      }
    }
  };

  return (
    <Box sx={{ 
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      display: 'flex', 
      flexDirection: 'column', 
      overflow: 'hidden' 
    }}>
      <Box component="header" sx={{ 
        p: 2, 
        borderBottom: 1, 
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        backgroundColor: '#0A8C0D',
        flexShrink: 0
      }}>
        <Button
          variant="outlined"
          startIcon={<HomeIcon />}
          onClick={() => navigate('/')}
          size="small"
          sx={{ 
            color: 'white',
            borderColor: 'lightgreen',
            '&:hover': {
              borderColor: 'white',
              backgroundColor: 'rgba(255, 255, 255, 0.1)'
            },
            '& .MuiButton-startIcon': {
              mr: { xs: 0, sm: 1 }
            }
          }}
        >
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
            ホーム
          </Box>
        </Button>
        <Typography variant="h5" sx={{ flexGrow: 1, fontWeight: 600, color: 'white', ml: 2, display: 'flex', alignItems: 'center' }}>
          <Box component="span" sx={{ display: { xs: 'none', sm: 'none', md: 'inline' } }}>
            JR発券システム AI音声対話
          </Box>
          <Box component="span" sx={{ display: { xs: 'inline', fontSize: '0.8rem', sm: 'inline', md: 'none' } }}>
          JR発券
          </Box>
        </Typography>
        <ModeSelector 
          currentMode={communicationMode}
          onModeChange={handleModeChange}
          disabled={connectionState === ConnectionState.CONNECTING || isRecording}
        />
        <ConnectionStatus status={connectionState === ConnectionState.CONNECTED ? 'connected' : 
                               connectionState === ConnectionState.CONNECTING ? 'connecting' : 
                               connectionState === ConnectionState.ERROR ? 'error' : 'disconnected'} />
        <Button
          variant="outlined"
          startIcon={<SettingsIcon />}
          onClick={() => setIsTTSSettingsOpen(true)}
          size="small"
          sx={{ 
            color: 'white',
            borderColor: 'lightgreen',
            '&:hover': {
              borderColor: 'lightgreen',
              backgroundColor: 'rgba(255, 255, 255, 0.1)'
            },
            '& .MuiButton-startIcon': {
              mr: { xs: 0, sm: 1 }
            }
          }}
        >
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
            TTS設定
          </Box>
        </Button>
        <Button
          variant="outlined"
          startIcon={<FeedbackIcon />}
          onClick={() => setIsFeedbackOpen(true)}
          size="small"
          sx={{ 
            color: 'white',
            borderColor: 'white',
            '&:hover': {
              borderColor: 'white',
              backgroundColor: 'rgba(255, 255, 255, 0.1)'
            },
            '& .MuiButton-startIcon': {
              mr: { xs: 0, sm: 1 }
            }
          }}
        >
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
            フィードバック
          </Box>
        </Button>
      </Box>
      
      <Box component="main" sx={{ flex: 1, display: 'flex', overflow: 'hidden', backgroundColor: '#FFFFFF', minHeight: 0 }}>
        {isTicketSystemEnabled && ticketState ? (
          <>
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#FFFFFF', minHeight: 0 }}>
              <DialogStatus dialogFlowState={dialogFlowState} />
              <ChatInterface messages={messages} onSendMessage={handleSendText} />
            </Box>
            <Box sx={{ 
              width: { xs: 0, sm: 0, md: 0, lg: 280, xl: 320 },
              borderLeft: { xs: 0, sm: 0, md: 0, lg: 1 },
              borderColor: 'divider', 
              overflow: 'auto',
              display: { xs: 'none', sm: 'none', md: 'none', lg: 'block' },  // lgブレークポイント（1200px）以下で非表示
              maxHeight: '100%'
            }}>
              <TicketInfoSidebar 
                ticketInfo={ticketState.ticketInfo} 
                isExtracting={ticketState.isExtracting}
                isSearchingRoutes={ticketState.isSearchingRoutes}
                currentPhase={ticketState.ticketInfo.currentPhase}
                lastExtractedInfo={ticketState.lastExtractedInfo}
                onRouteListClick={() => setIsRouteListOpen(true)}
                onJobanExpressClick={() => setIsJobanExpressOpen(true)}
                onJobanZairaiExpressClick={() => setIsJobanZairaiExpressOpen(true)}
                onZairaiSpecialClick={() => setIsZairaiSpecialOpen(true)}
              />
            </Box>
          </>
        ) : (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
            <DialogStatus dialogFlowState={dialogFlowState} />
            <ChatInterface messages={messages} onSendMessage={handleSendText} />
          </Box>
        )}
      </Box>
      
      <Box component="footer" sx={{ 
        p: 2, 
        pb: 'calc(8px + env(safe-area-inset-bottom))',
        borderTop: 1, 
        borderColor: 'divider', 
        flexShrink: 0 
      }}>
        <AudioControls 
          isRecording={isRecording}
          onToggleRecording={handleToggleRecording}
          disabled={connectionState !== ConnectionState.CONNECTED}
        />
      </Box>
      
      {isTicketSystemEnabled && ticketState && ticketState.ticketInfo.routes && (
        <RouteListPopup
          routes={ticketState.ticketInfo.routes}
          isOpen={isRouteListOpen}
          onClose={() => setIsRouteListOpen(false)}
        />
      )}
      
      {isTicketSystemEnabled && ticketState && ticketState.ticketInfo.jobanExpressRoutes && (
        <JobanExpressPopup
          routes={ticketState.ticketInfo.jobanExpressRoutes}
          isOpen={isJobanExpressOpen}
          onClose={() => setIsJobanExpressOpen(false)}
          showOnlyJobanExpress={true}
        />
      )}
      
      {isTicketSystemEnabled && ticketState && ticketState.ticketInfo.jobanZairaiExpressRoutes && (
        <JobanExpressPopup
          routes={ticketState.ticketInfo.jobanZairaiExpressRoutes}
          isOpen={isJobanZairaiExpressOpen}
          onClose={() => setIsJobanZairaiExpressOpen(false)}
          showOnlyJobanExpress={false}
        />
      )}
      
      {/* TTS設定ポップアップ */}
      <Dialog
        open={isTTSSettingsOpen}
        onClose={() => setIsTTSSettingsOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <IconButton
          aria-label="close"
          onClick={() => setIsTTSSettingsOpen(false)}
          sx={{
            position: 'absolute',
            right: 8,
            top: 8,
            color: (theme) => theme.palette.grey[500],
          }}
        >
          <CloseIcon />
        </IconButton>
        <DialogContent>
          <TTSSettings
            onSettingsChange={async () => {
              console.log('TTS settings changed');
              // AzureサービスのTTSプロバイダーを再初期化
              if (service && 'reinitializeTTSProvider' in service) {
                try {
                  await (service as any).reinitializeTTSProvider();
                  console.log('TTS provider reinitialized');
                } catch (error) {
                  console.error('Failed to reinitialize TTS provider:', error);
                }
              }
            }}
          />
        </DialogContent>
      </Dialog>

      {/* フィードバックダイアログ */}
      <FeedbackDialog
        open={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
        onSubmit={handleFeedbackSubmit}
      />
      
      {/* 切符表示ポップアップ */}
      {isTicketSystemEnabled && ticketState && (
        <Dialog
          open={isTicketDisplayOpen}
          onClose={() => setIsTicketDisplayOpen(false)}
          maxWidth="sm"
          fullWidth
        >
          <IconButton
            aria-label="close"
            onClick={() => setIsTicketDisplayOpen(false)}
            sx={{
              position: 'absolute',
              right: 8,
              top: 8,
              color: (theme) => theme.palette.grey[500],
            }}
          >
            <CloseIcon />
          </IconButton>
          <DialogContent>
            {ticketState && <TicketDisplay ticketInfo={ticketState.ticketInfo} />}
          </DialogContent>
        </Dialog>
      )}
    </Box>
  )
}

export default TicketSystem