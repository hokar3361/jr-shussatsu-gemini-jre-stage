import { useState, useEffect } from 'react'
import './App.css'
import ChatInterface from './components/ChatInterface'
import ConnectionStatus from './components/ConnectionStatus'
import AudioControls from './components/AudioControls'
import { ModeSelector } from './components/Settings/ModeSelector'
import DialogStatus from './components/DialogStatus'
import type { Message } from './types/index'
import { type CommunicationMode, ConnectionState, type Message as CommunicationMessage } from './services/communication'
import { useCommunication } from './hooks/useCommunication'
import { getConfig } from './config'
import { ConfigManager } from './config/ConfigManager'
import { type DialogFlowState } from './types/dialog'
import { useTicketSystem } from './hooks/useTicketSystem'
import { TicketInfoSidebar } from './components/ticket/TicketInfoSidebar'
import { RouteListPopup } from './components/ticket/RouteListPopup'
import { JobanExpressPopup } from './components/ticket/JobanExpressPopup'
import { TicketDisplay } from './components/TicketDisplay'
import { Dialog, DialogContent, IconButton, Button } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import SettingsIcon from '@mui/icons-material/Settings'
import { loadStationDictionary } from './constants/jrStationDictionary'
import { DebugChatInjector } from './services/communication/DebugChatInjector'
import { TTSSettings } from './components/Settings/TTSSettings'

// WS_URLは後でConfigManagerから取得

function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [communicationMode, setCommunicationMode] = useState<CommunicationMode>('azure')
  const [dialogFlowState, setDialogFlowState] = useState<DialogFlowState | null>(null)
  const [isRouteListOpen, setIsRouteListOpen] = useState(false)
  const [isJobanExpressOpen, setIsJobanExpressOpen] = useState(false)
  const [isJobanZairaiExpressOpen, setIsJobanZairaiExpressOpen] = useState(false)
  const [, setIsZairaiSpecialOpen] = useState(false)
  const [isTicketDisplayOpen, setIsTicketDisplayOpen] = useState(false)
  const [isTTSSettingsOpen, setIsTTSSettingsOpen] = useState(false)
  
  // アプリケーション起動時に駅名辞書を読み込む
  useEffect(() => {
    loadStationDictionary().catch(error => {
      console.error('Failed to load station dictionary:', error);
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
    // if (message.sender === 'user') {
    //   console.log('========================================');
    //   console.log('[App] ユーザーメッセージ完了');
    //   console.log('全文:', message.text);
    //   console.log('文字数:', message.text.length);
    //   console.log('========================================');
    // } else if (message.sender === 'gemini') {
    //   console.log('========================================');
    //   console.log('[App] AIメッセージ完了');
    //   console.log('全文:', message.text);
    //   console.log('文字数:', message.text.length);
    //   console.log('========================================');
    // }
    
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
    // console.log('[App] Loading communication config for mode:', communicationMode);
    getCommunicationConfig().then(config => {
      // console.log('[App] Setting communication config:', config);
      setCommunicationConfig(config);
    });
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
      // console.log('[App] onMessageComplete called');
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

  return (
    <div className="app">
      <header className="app-header">
        <h1>JR発券システム AI音声対話</h1>
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
          sx={{ ml: 2 }}
        >
          TTS設定
        </Button>
      </header>
      
      <main className="app-main">
        {isTicketSystemEnabled && ticketState ? (
          <>
            <div className="main-content">
              <div className="chat-section">
                <DialogStatus dialogFlowState={dialogFlowState} />
                <ChatInterface messages={messages} onSendMessage={handleSendText} />
              </div>
              <div className="sidebar-section">
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
              </div>
            </div>
          </>
        ) : (
          <>
            <DialogStatus dialogFlowState={dialogFlowState} />
            <ChatInterface messages={messages} onSendMessage={handleSendText} />
          </>
        )}
      </main>
      
      <footer className="app-footer">
        <AudioControls 
          isRecording={isRecording}
          onToggleRecording={handleToggleRecording}
          disabled={connectionState !== ConnectionState.CONNECTED}
        />
      </footer>
      
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

      {/* 在来特急特殊フェーズ：新宿→目的地 再検索の候補を流用ポップアップで表示 */}
      {/* {isTicketSystemEnabled && ticketState && ticketState.ticketInfo.zairaiSpecial_routes && (
        <JobanExpressPopup
          routes={ticketState.ticketInfo.zairaiSpecial_routes as any}
          isOpen={isZairaiSpecialOpen}
          onClose={() => setIsZairaiSpecialOpen(false)}
          showOnlyJobanExpress={false}
        />
      )} */}
      
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
            onSettingsChange={() => {
              // 設定変更時の処理（必要に応じて）
              console.log('TTS settings changed');
            }}
          />
        </DialogContent>
      </Dialog>
      
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
    </div>
  )
}

export default App
