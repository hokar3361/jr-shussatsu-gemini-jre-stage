import { useState, useEffect, useCallback, useRef } from 'react';
import {
  type ICommunicationService,
  type CommunicationMode,
  type CommunicationConfig,
  type Message,
  ConnectionState, 
  CommunicationServiceFactory
} from '../services/communication';
import { AzureService } from '../services/communication/AzureService';

interface UseCommunicationOptions {
  mode: CommunicationMode;
  config?: Partial<CommunicationConfig>;
  onMessage?: (message: Message) => void;
  onMessageComplete?: (message: Message) => void;
  onError?: (error: Error) => void;
  onStateChange?: (state: ConnectionState) => void;
}

interface UseCommunicationReturn {
  service: ICommunicationService | null;
  connectionState: ConnectionState;
  isRecording: boolean;
  messages: Message[];
  initialize: () => Promise<void>;
  startRecording: () => void;
  stopRecording: () => void;
  sendText: (text: string) => Promise<void>;
  disconnect: () => void;
  clearMessages: () => void;
  // Azure固有の音声合成機能
  synthesizeAndPlaySpeech: (text: string, onEnded?: () => void) => Promise<void>;
  synthesizeSpeech: (text: string) => Promise<ArrayBuffer | null>;
  playSynthesizedAudio: (audioData: ArrayBuffer, onEnded?: () => void) => void;
}

export const useCommunication = (options: UseCommunicationOptions): UseCommunicationReturn => {
  const [service, setService] = useState<ICommunicationService | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [isRecording, setIsRecording] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  
  const serviceRef = useRef<ICommunicationService | null>(null);

  // Initialize service when mode changes
  useEffect(() => {
    let isMounted = true;
    
    const initializeService = async () => {
      // Disconnect existing service
      if (serviceRef.current) {
        serviceRef.current.disconnect();
        serviceRef.current = null;
      }

      if (!isMounted) return;

      try {
        // Skip initialization if config is not ready
        // console.log('[useCommunication] Initializing with options:', {
        //   mode: options.mode,
        //   config: options.config,
        //   hasConfig: !!options.config,
        //   hasAzureConfig: !!options.config?.azureConfig
        // });
        
        if (!options.config) {
          // console.log('[useCommunication] Waiting for configuration...');
          return;
        }
        
        // For Azure mode, ensure azureConfig exists
        if (options.mode === 'azure' && !options.config.azureConfig) {
          // console.log('[useCommunication] Waiting for Azure configuration...');
          return;
        }
        
        // Create new service
        const config: CommunicationConfig = {
          mode: options.mode,
          ...options.config
        };

        const newService = CommunicationServiceFactory.create(config);
        
        // Set up event handlers using setEventHandlers if available
        if ('setEventHandlers' in newService && typeof newService.setEventHandlers === 'function') {
          newService.setEventHandlers({
            onMessage: (message: any) => {
              setMessages(prev => [...prev, message]);
              options.onMessage?.(message);
            },
            onMessageComplete: options.onMessageComplete,
            onError: (error: any) => {
              console.error('Communication error:', error);
              options.onError?.(error);
            },
            onStateChange: (state: any) => {
              setConnectionState(state);
              options.onStateChange?.(state);
            }
          });
        } else {
          // Fallback for services without setEventHandlers
          newService.onMessage((message) => {
            setMessages(prev => [...prev, message]);
            options.onMessage?.(message);
          });

          // Add onMessageComplete if the service supports it
          if (newService.onMessageComplete && options.onMessageComplete) {
            newService.onMessageComplete(options.onMessageComplete);
          }

          newService.onError((error) => {
            console.error('Communication error:', error);
            options.onError?.(error);
          });

          newService.onStateChange((state) => {
            setConnectionState(state);
            options.onStateChange?.(state);
          });
        }

        if (!isMounted) {
          newService.disconnect();
          return;
        }

        serviceRef.current = newService;
        setService(newService);

        // Auto-initialize
        await newService.initialize();
      } catch (error) {
        console.error('Failed to initialize communication service:', error);
        setConnectionState(ConnectionState.ERROR);
      }
    };

    initializeService();

    // Cleanup on unmount
    return () => {
      isMounted = false;
      if (serviceRef.current) {
        serviceRef.current.disconnect();
        serviceRef.current = null;
      }
    };
  }, [options.mode, options.config]);

  const initialize = useCallback(async () => {
    if (serviceRef.current) {
      await serviceRef.current.initialize();
    }
  }, []);

  const startRecording = useCallback(() => {
    if (serviceRef.current && serviceRef.current.isConnected()) {
      serviceRef.current.startRecording();
      setIsRecording(true);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (serviceRef.current) {
      serviceRef.current.stopRecording();
      setIsRecording(false);
    }
  }, []);

  const sendText = useCallback(async (text: string) => {
    if (serviceRef.current && serviceRef.current.isConnected()) {
      await serviceRef.current.sendText(text);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (serviceRef.current) {
      serviceRef.current.disconnect();
      setIsRecording(false);
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  // Azure固有の音声合成機能
  const synthesizeAndPlaySpeech = useCallback(async (text: string, onEnded?: () => void) => {
    if (serviceRef.current && serviceRef.current instanceof AzureService) {
      await serviceRef.current.synthesizeAndPlaySpeech(text, onEnded);
    } else {
      console.warn('synthesizeAndPlaySpeech is only available for Azure service');
    }
  }, []);

  const synthesizeSpeech = useCallback(async (text: string): Promise<ArrayBuffer | null> => {
    if (serviceRef.current && serviceRef.current instanceof AzureService) {
      return await serviceRef.current.synthesizeSpeech(text);
    } else {
      console.warn('synthesizeSpeech is only available for Azure service');
      return null;
    }
  }, []);

  const playSynthesizedAudio = useCallback((audioData: ArrayBuffer, onEnded?: () => void) => {
    if (serviceRef.current && serviceRef.current instanceof AzureService) {
      serviceRef.current.playSynthesizedAudio(audioData, onEnded);
    } else {
      console.warn('playSynthesizedAudio is only available for Azure service');
    }
  }, []);

  return {
    service,
    connectionState,
    isRecording,
    messages,
    initialize,
    startRecording,
    stopRecording,
    sendText,
    disconnect,
    clearMessages,
    synthesizeAndPlaySpeech,
    synthesizeSpeech,
    playSynthesizedAudio
  };
};