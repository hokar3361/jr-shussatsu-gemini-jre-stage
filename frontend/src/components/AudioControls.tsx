import React from 'react'

interface AudioControlsProps {
  isRecording: boolean
  onToggleRecording: () => void
  disabled?: boolean
}

const AudioControls: React.FC<AudioControlsProps> = ({ isRecording, onToggleRecording, disabled }) => {
  return (
    <div className="audio-controls" style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      padding: '0px',
      boxSizing: 'border-box'
    }}>
      <button
        onClick={onToggleRecording}
        disabled={disabled}
        style={{
          boxSizing: 'border-box',
          width: '100%',
          margin: '0',
          padding: '5px',
          borderRadius: '8px',
          border: 'none',
          backgroundColor: isRecording ? '#f44336' : '#0A8C0D',
          color: 'white',
          fontSize: 'clamp(24px, 5vw, 32px)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          transition: 'all 0.3s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}
      >
        {isRecording ? '⏹️' : '🎤'}
      </button>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {isRecording && (
          <span style={{ 
            color: '#f44336', 
            animation: 'pulse 1s infinite',
            fontSize: 'clamp(14px, 3vw, 18px)'
          }}>
            Recording...
          </span>
        )}
      </div>
    </div>
  )
}

export default AudioControls