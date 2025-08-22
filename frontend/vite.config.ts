import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['localhost', '127.0.0.1', '0.0.0.0', '3b8bc1219858.ngrok-free.app'],
    proxy: {
      // APIとWebSocketのみバックエンドにプロキシ
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
})
