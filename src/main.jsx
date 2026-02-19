import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './assets/styles/index.css'
import { soundService } from './services/soundService'

// Register the user-gesture listener immediately so the AudioContext can be
// created and resumed on the very first interaction (click, keydown, etc.)
// before any individual sound method is called.
soundService.init()

// Desktop app detection - inline implementation
// Checks for Tauri desktop environment
const isDesktopApp = () => {
  if (typeof window === 'undefined') return false
  return window.__TAURI__ !== undefined || 
         window.tauri !== undefined ||
         navigator.userAgent.includes('VoltDesktop')
}

// Set up desktop app environment detection
if (isDesktopApp()) {
  console.log('[VoltApp] Running in desktop mode')
  window.__IS_DESKTOP_APP__ = true
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
