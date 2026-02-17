import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true
      }
    }
  },
  preview: {
    port: 3000,
    host: true,
    allowedHosts: ['voltchatapp.enclicainteractive.com']
  },
  vitePWA: {
    registerType: 'autoUpdate',
    includeAssets: ['favicon.ico', 'icon-192.png', 'icon-512.png', 'badge-72.png'],
    manifest: {
      name: 'VoltChat',
      short_name: 'VoltChat',
      description: 'A modern chat platform',
      theme_color: '#1fb6ff',
      background_color: '#1e1e2e',
      display: 'standalone',
      icons: [
        {
          src: '/icon-192.png',
          sizes: '192x192',
          type: 'image/png'
        },
        {
          src: '/icon-512.png',
          sizes: '512x512',
          type: 'image/png'
        }
      ]
    }
  }
})
