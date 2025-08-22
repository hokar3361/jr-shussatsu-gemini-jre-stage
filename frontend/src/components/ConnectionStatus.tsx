import React from 'react'
import { Box, useMediaQuery, useTheme } from '@mui/material'
import type { ConnectionState } from '../types/index'

interface ConnectionStatusProps {
  status: ConnectionState
}

const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ status }) => {
  const theme = useTheme()
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('sm'))

  const getStatusColor = () => {
    switch (status) {
      case 'connected':
        return '#4caf50'
      case 'connecting':
        return '#ff9800'
      case 'error':
        return '#f44336'
      default:
        return '#9e9e9e'
    }
  }

  const getStatusText = () => {
    if (isSmallScreen) {
      switch (status) {
        case 'connected':
          return 'OK'
        case 'connecting':
          return '...'
        case 'error':
          return 'NG'
        default:
          return 'NG'
      }
    } else {
      switch (status) {
        case 'connected':
          return 'Connected'
        case 'connecting':
          return 'Connecting...'
        case 'error':
          return 'Connection Error'
        default:
          return 'Disconnected'
      }
    }
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Box
        sx={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          backgroundColor: getStatusColor(),
          animation: status === 'connecting' ? 'pulse 1.5s infinite' : 'none',
          '@keyframes pulse': {
            '0%': { opacity: 1 },
            '50%': { opacity: 0.5 },
            '100%': { opacity: 1 }
          }
        }}
      />
      <Box component="span" sx={{ fontSize: 14, color: '#fff' }}>
        {getStatusText()}
      </Box>
    </Box>
  )
}

export default ConnectionStatus