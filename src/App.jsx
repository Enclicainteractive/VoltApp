import React, { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { SocketProvider } from './contexts/SocketContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { E2eProvider } from './contexts/E2eContext'
import { E2eTrueProvider } from './contexts/E2eTrueContext'
import { SelfVoltProvider } from './contexts/SelfVoltContext'
import { VoiceProvider } from './contexts/VoiceContext'
import { CallProvider } from './contexts/CallContext'
import { I18nProvider } from './contexts/I18nContext'
import LoginPage from './pages/LoginPage'
import ChatPage from './pages/ChatPage'
import CallbackPage from './pages/CallbackPage'
import InvitePage from './pages/InvitePage'
import ProtectedRoute from './components/ProtectedRoute'
import IncomingCallModal from './components/IncomingCallModal'
import { soundService } from './services/soundService'

function App() {
  // soundService.init() is called once in main.jsx before React mounts,
  // registering native capture-phase gesture listeners that survive the
  // browser autoplay policy.  No need to call it again here.

  return (
    <Router>
      <I18nProvider>
        <AuthProvider>
          <ThemeProvider>
            <SocketProvider>
              <VoiceProvider>
                <SelfVoltProvider>
                  <E2eProvider>
                    <E2eTrueProvider>
                      <CallProvider>
                        <Routes>
                          <Route path="/login" element={<LoginPage />} />
                          <Route path="/callback" element={<CallbackPage />} />
                          <Route path="/invite/:code" element={<InvitePage />} />
                          <Route 
                            path="/chat" 
                            element={
                              <ProtectedRoute>
                                <ChatPage />
                              </ProtectedRoute>
                            } 
                          />
                          <Route 
                            path="/chat/:serverId" 
                            element={
                              <ProtectedRoute>
                                <ChatPage />
                              </ProtectedRoute>
                            } 
                          />
                          <Route 
                            path="/chat/:serverId/:channelId" 
                            element={
                              <ProtectedRoute>
                                <ChatPage />
                              </ProtectedRoute>
                            } 
                          />
                          <Route path="/" element={<Navigate to="/chat" replace />} />
                        </Routes>
                        <IncomingCallModal />
                      </CallProvider>
                    </E2eTrueProvider>
                  </E2eProvider>
                </SelfVoltProvider>
              </VoiceProvider>
            </SocketProvider>
          </ThemeProvider>
        </AuthProvider>
      </I18nProvider>
    </Router>
  )
}

export default App
