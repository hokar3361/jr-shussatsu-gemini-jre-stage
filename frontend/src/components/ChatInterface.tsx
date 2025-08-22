import React, { useRef, useEffect } from 'react'
import type { Message } from '../types/index'
import '../App.css'

interface ChatInterfaceProps {
  messages: Message[]
  onSendMessage: (text: string) => void
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages }) => {
  // const [inputText, setInputText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // const handleSubmit = (e: React.FormEvent) => {
  //   e.preventDefault()
  //   if (inputText.trim()) {
  //     onSendMessage(inputText)
  //     setInputText('')
  //   }
  // }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="chat-interface" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div
        className="messages-container"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
          backgroundColor: 'transparent',
          minHeight: 0
        }}
      >
        {messages.map((message) => (
          <div
            key={message.id}
            className={`message ${message.sender}${message.isDebug ? ' debug' : ''}`}
            style={{
              marginBottom: '16px',
              display: 'flex',
              justifyContent: message.isDebug ? 'center' : (message.sender === 'user' ? 'flex-end' : 'flex-start')
            }}
          >
            <div
              className="bubble"
              style={{
                maxWidth: message.isDebug ? "100%" : '70%',
                padding: '12px 16px',
                borderRadius: '12px',
                backgroundColor: message.isDebug ? "gray" : (message.sender === 'user' ? '#2196f3' : '#fff'),
                color: message.isDebug ? "white" : (message.sender === 'user' ? '#fff' : '#333'),
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
            >
              {(message.isTranscription || message.isDebug) && (
                <div
                  style={{
                    fontSize: '11px',
                    opacity: 0.6,
                    marginBottom: '4px',
                    fontStyle: 'italic'
                  }}
                >
                  {message.isDebug
                    ? ''
                    : (message.sender === 'user' ? '🎤 音声入力' : '🔊 音声応答')}
                </div>
              )}
              <div style={{ marginBottom: '4px', whiteSpace: 'pre-wrap', fontFamily: message.isDebug ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \'Liberation Mono\', \'Courier New\', monospace' : undefined }}>{message.text}</div>
              <div
                className="meta"
                style={{
                  fontSize: '12px',
                  opacity: 0.7,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {message.isDebug ? '' : formatTime(message.timestamp)}
                {message.type === 'audio' && (
                  <span style={{ fontSize: '10px' }}>音声</span>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
{/*       
      <form
        onSubmit={handleSubmit}
        style={{
          padding: '20px',
          backgroundColor: '#fff',
          borderTop: '1px solid #e0e0e0',
          display: 'flex',
          gap: '12px'
        }}
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="メッセージを入力..."
          style={{
            flex: 1,
            padding: '12px',
            borderRadius: '24px',
            border: '1px solid #e0e0e0',
            fontSize: '16px',
            outline: 'none'
          }}
        />
        <button
          type="submit"
          style={{
            padding: '12px 24px',
            borderRadius: '24px',
            border: 'none',
            backgroundColor: '#2196f3',
            color: 'white',
            fontSize: '16px',
            cursor: 'pointer',
            transition: 'background-color 0.3s'
          }}
        >
          送信
        </button>
      </form> */}
    </div>
  )
}

export default ChatInterface