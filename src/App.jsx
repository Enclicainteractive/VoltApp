import React, { useEffect, useRef, useState, useCallback, Suspense, lazy } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { SocketProvider, useSocket } from './contexts/SocketContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { E2eProvider } from './contexts/E2eContext'
import { E2eTrueProvider } from './contexts/E2eTrueContext'
import { SelfVoltProvider } from './contexts/SelfVoltContext'
import { VoiceProvider, useVoice } from './contexts/VoiceContext'
import { CallProvider } from './contexts/CallContext'
import { I18nProvider } from './contexts/I18nContext'
import ProtectedRoute from './components/ProtectedRoute'
import ErrorBoundary from './components/ErrorBoundary'
import { LoadingScreen, ReconnectingOverlay } from './components/LoadingScreen'
import GlobalKeyboardShortcuts from './components/GlobalKeyboardShortcuts'
import ProgressivePage, { PageTemplates } from './components/ProgressivePage'
import lazyLoadingService from './services/lazyLoadingService'
import performanceService from './services/performanceService'
import reactOptimizationService from './services/reactOptimizationService'
import { soundService } from './services/soundService'
import apiService from './services/apiService'
import { settingsService } from './services/settingsService'
import { useAppStore } from './store/useAppStore'
import BirthDateRequiredModal, { isBirthDateMissing } from './components/modals/BirthDateRequiredModal'
import './assets/styles/ScreenSharePicker.css'
import './assets/styles/ModalAnimations.css'
import './assets/styles/skeleton-loaders.css'
import './assets/styles/performance-optimizations.css'

// Lazy load pages for better performance with preloadable loader fns
const loadLoginPage = () => import('./pages/LoginPage')
const loadChatPage = () => import('./pages/ChatPage')
const loadCallbackPage = () => import('./pages/CallbackPage')
const loadInvitePage = () => import('./pages/InvitePage')
const loadResetPasswordPage = () => import('./pages/ResetPasswordPage')
const loadIncomingCallModal = () => import('./components/IncomingCallModal')
const loadScreenSharePicker = () => import('./components/ScreenSharePicker')

const LoginPage = lazy(loadLoginPage)
const ChatPage = lazy(loadChatPage)
const CallbackPage = lazy(loadCallbackPage)
const InvitePage = lazy(loadInvitePage)
const ResetPasswordPage = lazy(loadResetPasswordPage)
const IncomingCallModal = lazy(loadIncomingCallModal)
const ScreenSharePicker = lazy(loadScreenSharePicker)

const GlobalBanner = () => {
  const { isAuthenticated } = useAuth()
  const [maintenanceNotice, setMaintenanceNotice] = useState(null)
  const [discoveryInfo, setDiscoveryInfo] = useState(null)

  useEffect(() => {
    if (!isAuthenticated) return
    let cancelled = false

    const loadBannerData = async () => {
      try {
        const res = await apiService.getMaintenanceStatus()
        if (cancelled) return
        const data = res.data || null
        
        if (data?.discovery) {
          setDiscoveryInfo(data.discovery)
        }
        
        if (data?.status === 'active' || data?.status === 'scheduled') {
          setMaintenanceNotice(data)
        } else {
          setMaintenanceNotice(null)
        }
      } catch {
        if (!cancelled) {
          setMaintenanceNotice(null)
          setDiscoveryInfo(null)
        }
      }
    }

    loadBannerData()
    const timer = setInterval(loadBannerData, 60000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [isAuthenticated])

  useEffect(() => {
    const hasBanner = (maintenanceNotice?.window || (discoveryInfo && discoveryInfo.approvedServers > 0))
    if (hasBanner) {
      document.body.classList.add('has-global-banner')
      if (discoveryInfo && discoveryInfo.approvedServers > 0) {
        document.body.classList.add('has-discovery-banner')
      }
    } else {
      document.body.classList.remove('has-global-banner')
      document.body.classList.remove('has-discovery-banner')
    }
    return () => {
      document.body.classList.remove('has-global-banner')
      document.body.classList.remove('has-discovery-banner')
    }
  }, [maintenanceNotice, discoveryInfo])

  const showBanner = maintenanceNotice?.window || (discoveryInfo && discoveryInfo.approvedServers > 0)

  if (!showBanner) return null

  return (
    <div className="global-info-banner-wrapper app-level">
      {maintenanceNotice?.window && (
        <div className={`global-maintenance-banner ${maintenanceNotice.status}`}>
          <strong>{maintenanceNotice.window.title || 'Scheduled maintenance'}</strong>
          <span>{maintenanceNotice.window.message}</span>
          {(maintenanceNotice.window.startAt || maintenanceNotice.window.endAt) && (
            <small>
              {maintenanceNotice.status === 'scheduled'
                ? `Starts: ${new Date(maintenanceNotice.window.startAt).toLocaleString()}`
                : (maintenanceNotice.window.endAt
                    ? `Ends: ${new Date(maintenanceNotice.window.endAt).toLocaleString()}`
                    : `Started: ${new Date(maintenanceNotice.window.startAt).toLocaleString()}`)}
            </small>
          )}
        </div>
      )}
      {discoveryInfo && discoveryInfo.approvedServers > 0 && (
        <div className="global-maintenance-banner discovery">
          <strong>Discovery Active</strong>
          <span>{discoveryInfo.approvedServers} server{discoveryInfo.approvedServers !== 1 ? 's' : ''} in discovery</span>
          {discoveryInfo.pendingSubmissions > 0 && (
            <small>{discoveryInfo.pendingSubmissions} pending submission{discoveryInfo.pendingSubmissions !== 1 ? 's' : ''} awaiting approval</small>
          )}
        </div>
      )}
    </div>
  )
}

const GlobalReconnectHandler = () => {
  const { isAuthenticated, loading } = useAuth()
  const { connected, reconnecting } = useSocket()
  const shouldShowReconnect = isAuthenticated && !loading && !connected && reconnecting

  return <ReconnectingOverlay visible={shouldShowReconnect} />
}

const RouteChunkPreloader = () => {
  const location = useLocation()
  const { isAuthenticated } = useAuth()

  useEffect(() => {
    const pathname = location.pathname || '/'
    const path = pathname.toLowerCase()

    const commonRoutes = ['route:login', 'route:callback']
    const authenticatedRoutes = ['route:chat', 'route:invite', 'route:settings-modal', 'route:admin-panel']
    const unauthenticatedRoutes = ['route:reset-password']

    lazyLoadingService.preloadRouteChunks(commonRoutes, { idle: true })

    if (isAuthenticated) {
      lazyLoadingService.preloadRouteChunks(authenticatedRoutes, { idle: true })
      lazyLoadingService.preloadComponents(
        ['ChatArea', 'MessageList', 'ServerSidebar', 'ChannelSidebar', 'MemberSidebar', 'DMList', 'FriendsPage', 'Discovery', 'IncomingCallModal'],
        { idle: true }
      )
    } else {
      lazyLoadingService.preloadRouteChunks(unauthenticatedRoutes, { idle: true })
    }

    if (path.startsWith('/chat')) {
      lazyLoadingService.preloadRouteChunks(['route:invite', 'route:settings-modal', 'route:admin-panel'], { idle: true })
      lazyLoadingService.preloadComponents(['VoiceChannel', 'VoiceChannelPreview', 'ActivitiesPanel', 'DMChat'], { idle: true })
      return
    }

    if (path.startsWith('/login')) {
      lazyLoadingService.preloadRouteChunks(['route:chat', 'route:reset-password'], { idle: true })
      return
    }

    if (path.startsWith('/invite')) {
      lazyLoadingService.preloadRouteChunks(['route:chat', 'route:login'], { idle: true })
    }
  }, [isAuthenticated, location.pathname])

  return null
}

const BirthDateGate = () => {
  const { isAuthenticated, loading, user } = useAuth()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!isAuthenticated || loading) {
      setReady(false)
      return
    }

    const timerId = window.setTimeout(() => {
      setReady(true)
    }, 4000)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [isAuthenticated, loading])

  if (!isAuthenticated || loading || !ready || !isBirthDateMissing(user)) return null
  return <BirthDateRequiredModal />
}

const ScreenSharePickerWrapper = () => {
  const { showScreenPicker, setShowScreenPicker, startScreenShareWithSource } = useVoice()
  
  return (
    <ScreenSharePicker
      isOpen={showScreenPicker}
      onClose={() => setShowScreenPicker(false)}
      onSelect={startScreenShareWithSource}
    />
  )
}

const DeepLinkHandler = () => {
  const navigate = useNavigate()

  useEffect(() => {
    const handleDeepLink = (url) => {
      try {
        const urlObj = new URL(url)
        const code = urlObj?.searchParams?.get('code')
        const state = urlObj?.searchParams?.get('state')
        
        if (code) {
          navigate(`/callback?code=${code}${state ? `&state=${state}` : ''}`)
        }
      } catch (error) {
        console.error('[App] Failed to parse deep link:', error)
      }
    }
    
    if (window.electron?.onDeepLink) {
      window.electron.onDeepLink(handleDeepLink)
    }
    
    return () => {
      // Cleanup if needed
    }
  }, [navigate])

  return null
}

const UpdateBanner = () => {
  const [updateState, setUpdateState] = useState(null)

  useEffect(() => {
    if (!window.electron?.onUpdateState) return

    const unsubscribe = window.electron.onUpdateState((state) => {
      setUpdateState(state)
    })

    window.electron.getUpdateState().then(setUpdateState)

    return unsubscribe
  }, [])

  if (!updateState) return null

  const { status, message, updateInfo, currentVersion, progressPercent } = updateState

  if (status === 'available' || status === 'downloaded') {
    const isDownloaded = status === 'downloaded'
    const version = updateInfo?.version || 'latest'
    const releaseNotes = updateInfo?.releaseNotes

    return (
      <div className="global-info-banner-wrapper app-level">
        <div className={`global-maintenance-banner ${isDownloaded ? 'discovery' : 'scheduled'}`}>
          <strong>{isDownloaded ? 'Update Ready' : 'Update Available'}</strong>
          <span>Version {version} is available{!isDownloaded ? ` (current: ${currentVersion})` : ''}</span>
          {progressPercent > 0 && progressPercent < 100 && (
            <small>Downloading: {progressPercent}%</small>
          )}
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            {!isDownloaded && (
              <button 
                className="btn btn-primary btn-sm"
                onClick={async () => {
                  console.log('[UI] Download button clicked');
                  try {
                    const result = await window.electron?.downloadUpdate?.();
                    console.log('[UI] downloadUpdate result:', result);
                  } catch (err) {
                    console.error('[UI] downloadUpdate error:', err);
                  }
                }}
              >
                Download Update
              </button>
            )}
            {isDownloaded && (
              <button 
                className="btn btn-primary btn-sm"
                onClick={async () => {
                  console.log('[UI] Install button clicked');
                  try {
                    const result = await window.electron?.quitAndInstallUpdate?.();
                    console.log('[UI] quitAndInstallUpdate result:', result);
                  } catch (err) {
                    console.error('[UI] quitAndInstallUpdate error:', err);
                  }
                }}
              >
                Install & Restart
              </button>
            )}
            <button 
              className="btn btn-ghost btn-sm"
              onClick={() => {
                if (updateInfo?.releaseNotes) {
                  const notesWindow = window.open('', '_blank', 'width=600,height=400')
                  if (notesWindow) {
                    notesWindow.document.write(`<pre style="white-space: pre-wrap;">${releaseNotes}</pre>`)
                  }
                }
              }}
            >
              Release Notes
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="global-info-banner-wrapper app-level">
        <div className="global-maintenance-banner" style={{ background: '#dc2626' }}>
          <strong>Update Error</strong>
          <span>{message || 'Failed to check for updates'}</span>
          <button 
            className="btn btn-sm"
            style={{ marginTop: '8px', background: 'rgba(255,255,255,0.2)' }}
            onClick={() => window.electron?.checkForUpdates?.()}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return null
}

const DiscordRichPresenceSync = () => {
  const { user, isAuthenticated } = useAuth()
  const location = useLocation()
  const selfPresence = useAppStore(state => state.selfPresence)
  const [settings, setSettings] = useState(() => settingsService.getSettings())
  const [documentTitle, setDocumentTitle] = useState(() => document.title)
  const sessionStartedAtRef = useRef(Date.now())
  const lastPayloadRef = useRef('')

  useEffect(() => settingsService.subscribe(setSettings), [])

  useEffect(() => {
    const titleElement = document.querySelector('title')
    if (!titleElement) return undefined

    const observer = new MutationObserver(() => {
      setDocumentTitle(document.title)
    })

    observer.observe(titleElement, { childList: true })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!window.electron?.setDiscordPresence || !window.electron?.clearDiscordPresence) {
      return undefined
    }

    if (!isAuthenticated || !settings.discordRichPresence || !user) {
      lastPayloadRef.current = ''
      void window.electron.clearDiscordPresence()
      return undefined
    }

    const payload = {
      username: user.username || user.email || 'Volt user',
      displayName: user.displayName || user.globalName || '',
      status: selfPresence.status || user.status || 'online',
      customStatus: selfPresence.customStatus || user.customStatus || '',
      title: documentTitle,
      pathname: location.pathname,
      startedAt: sessionStartedAtRef.current
    }

    const serializedPayload = JSON.stringify(payload)
    if (serializedPayload === lastPayloadRef.current) {
      return undefined
    }

    lastPayloadRef.current = serializedPayload
    void window.electron.setDiscordPresence(payload)
    return undefined
  }, [documentTitle, isAuthenticated, location.pathname, selfPresence.customStatus, selfPresence.status, settings.discordRichPresence, user])

  return null
}

// Global loading fallback component
const GlobalLoadingFallback = () => (
  <div className="global-loading-wrapper">
    <div className="global-loading-content">
      <div className="loading-logo">⚡</div>
      <div className="loading-title">VoltChat</div>
      <div className="loading-progress">
        <div className="progress-bar">
          <div className="progress-fill"></div>
        </div>
      </div>
      <div className="loading-text">Starting up...</div>
    </div>
  </div>
)

// Stable Suspense fallback — defined once at module scope so Suspense never
// sees a new element reference and avoids a needless remount cycle.
const GLOBAL_LOADING_FALLBACK = <GlobalLoadingFallback />
const LOGIN_ROUTE_FALLBACK = <LoadingScreen message="Loading sign in..." />
const RESET_ROUTE_FALLBACK = <LoadingScreen message="Loading password reset..." />
const CALLBACK_ROUTE_FALLBACK = <LoadingScreen message="Completing sign in..." />
const INVITE_ROUTE_FALLBACK = <LoadingScreen message="Loading invite..." />
const CHAT_ROUTE_FALLBACK = <LoadingScreen message="Opening your channels..." />
const CALL_MODAL_FALLBACK = <LoadingScreen message="Preparing call controls..." />

// Enhanced App component with progressive loading
function App() {
  const [isAppReady, setIsAppReady] = useState(false)
  const [appError, setAppError] = useState(null)
  
  // Initialize global services
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Initialize performance monitoring
        if (process.env.NODE_ENV === 'development') {
          window.performanceService = performanceService
          window.lazyLoadingService = lazyLoadingService
          window.reactOptimizationService = reactOptimizationService
        }
        
        // Initialize React optimization service
        const ReactOptimizationService = new reactOptimizationService()
        ReactOptimizationService.initialize()
        
        // Preload critical resources
        await lazyLoadingService.loadByPriority(lazyLoadingService.priorities.CRITICAL)
        lazyLoadingService.preloadRouteChunks(['route:login', 'route:chat', 'route:callback'], { idle: true })
        
        // Initialize sound service
        soundService.init()
        
        // Start progressive loading for high priority components
        setTimeout(() => {
          lazyLoadingService.loadByPriority(lazyLoadingService.priorities.HIGH)
          lazyLoadingService.preloadRouteChunks(['route:invite', 'route:reset-password', 'route:settings-modal'], { idle: true })
          lazyLoadingService.preloadComponents(['FriendsPage', 'Discovery', 'DMList', 'VoiceChannelPreview'], { idle: true })
        }, 500)
        
        setIsAppReady(true)
      } catch (error) {
        console.error('App initialization failed:', error)
        setAppError(error)
      }
    }
    
    initializeApp()
  }, [])
  
  if (appError) {
    return (
      <div className="app-error">
        <h1>Failed to start VoltChat</h1>
        <p>{appError.message}</p>
        <button onClick={() => window.location.reload()}>Reload App</button>
      </div>
    )
  }

  return (
    <Router>
      <I18nProvider>
        <AuthProvider>
          <ThemeProvider>
            <Suspense fallback={GLOBAL_LOADING_FALLBACK}>
              <ProgressivePage
                sections={[
                  {
                    id: 'app-shell',
                    phase: 'SHELL',
                    component: () => (
                      <>
                        <GlobalBanner />
                        <BirthDateGate />
                      </>
                    )
                  }
                ]}
                showProgress={!isAppReady}
              >
                <SocketProvider>
                  <GlobalReconnectHandler />
                  <RouteChunkPreloader />
                  <DeepLinkHandler />
                  <UpdateBanner />
                  <DiscordRichPresenceSync />
                  <ErrorBoundary name="voice">
                    <VoiceProvider>
                      <GlobalKeyboardShortcuts>
                        <Suspense fallback={<div className="screen-share-loading">Loading screen share...</div>}>
                          <ScreenSharePickerWrapper />
                        </Suspense>
                        <SelfVoltProvider>
                          <E2eProvider>
                            <E2eTrueProvider>
                              <CallProvider>
                                <Routes>
                                  <Route
                                    path="/login"
                                    element={
                                      <Suspense fallback={LOGIN_ROUTE_FALLBACK}>
                                        <LoginPage />
                                      </Suspense>
                                    }
                                  />
                                  <Route
                                    path="/reset-password"
                                    element={
                                      <Suspense fallback={RESET_ROUTE_FALLBACK}>
                                        <ResetPasswordPage />
                                      </Suspense>
                                    }
                                  />
                                  <Route
                                    path="/callback"
                                    element={
                                      <Suspense fallback={CALLBACK_ROUTE_FALLBACK}>
                                        <CallbackPage />
                                      </Suspense>
                                    }
                                  />
                                  <Route
                                    path="/invite/:code"
                                    element={
                                      <Suspense fallback={INVITE_ROUTE_FALLBACK}>
                                        <InvitePage />
                                      </Suspense>
                                    }
                                  />
                                  <Route
                                    path="/chat/*"
                                    element={
                                      <ProtectedRoute>
                                        <ErrorBoundary name="chat-page">
                                          <Suspense fallback={CHAT_ROUTE_FALLBACK}>
                                            <ChatPage />
                                          </Suspense>
                                        </ErrorBoundary>
                                      </ProtectedRoute>
                                    }
                                  />
                                  <Route path="/" element={<Navigate to="/chat" replace />} />
                                  <Route path="*" element={<Navigate to="/" replace />} />
                                </Routes>
                                <Suspense fallback={CALL_MODAL_FALLBACK}>
                                  <IncomingCallModal />
                                </Suspense>
                              </CallProvider>
                            </E2eTrueProvider>
                          </E2eProvider>
                        </SelfVoltProvider>
                      </GlobalKeyboardShortcuts>
                    </VoiceProvider>
                  </ErrorBoundary>
                </SocketProvider>
              </ProgressivePage>
            </Suspense>
          </ThemeProvider>
        </AuthProvider>
      </I18nProvider>
    </Router>
  )
}

export default App
