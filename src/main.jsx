import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './assets/styles/index.css'
import { soundService } from './services/soundService'

// Register the user-gesture listener immediately so the AudioContext can be
// created and resumed on the very first interaction (click, keydown, etc.)
// before any individual sound method is called.
soundService.init()

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
