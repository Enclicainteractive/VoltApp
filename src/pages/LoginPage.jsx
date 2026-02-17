import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useAppStore } from '../store/useAppStore'
import { getStoredServer } from '../services/serverConfig'
import ServerSelector from '../components/ServerSelector'
import { Zap, Server, ChevronDown } from 'lucide-react'
import '../assets/styles/LoginPage.css'

const LoginPage = () => {
  const { login } = useAuth()
  const { currentMainServer, setCurrentMainServer } = useAppStore()
  const [showServerSelector, setShowServerSelector] = useState(false)
  const [server, setServer] = useState(null)

  useEffect(() => {
    const stored = getStoredServer()
    setServer(stored)
  }, [])

  const handleServerChange = (newServer) => {
    setCurrentMainServer(newServer)
    setServer(newServer)
    setShowServerSelector(false)
  }

  return (
    <div className="login-page">
      <div className="login-background">
        <div className="glow glow-1"></div>
        <div className="glow glow-2"></div>
      </div>

      <div className="server-selector-button-container">
        <button 
          className="server-selector-button"
          onClick={() => setShowServerSelector(true)}
        >
          <Server size={16} />
          <span>{server?.name || 'Select Server'}</span>
          <ChevronDown size={14} />
        </button>
      </div>

      <div className="login-container">
        <div className="login-content">
          <div className="login-branding">
            <div className="logo">
              <Zap size={48} strokeWidth={2.5} />
            </div>
            <h1 className="brand-name">VoltChat</h1>
            <p className="brand-tagline">Power Your Conversations</p>
          </div>

          <button className="login-button" onClick={login}>
            <Zap size={20} />
            <span>Connect with {server?.name || 'Enclica'}</span>
          </button>

          <p className="login-footer">
            Secure authentication powered by OAuth 2.0
          </p>
        </div>
      </div>

      {showServerSelector && (
        <ServerSelector 
          onClose={() => setShowServerSelector(false)} 
        />
      )}
    </div>
  )
}

export default LoginPage
