import React, { useState, useEffect, useRef } from 'react'
import { X, User, Bell, Volume2, Shield, Palette, Info, Mic, Video, Monitor, MicOff, VideoOff, Eye, Edit2, Globe, Server, Settings, Bot, Network } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useBanner } from '../../hooks/useAvatar'
import { settingsService } from '../../services/settingsService'
import { pushService } from '../../services/pushService'
import { apiService } from '../../services/apiService'
import { getStoredServer } from '../../services/serverConfig'
import Avatar from '../Avatar'
import MarkdownMessage from '../MarkdownMessage'
import BioEditor from '../BioEditor'
import AgeVerificationModal from './AgeVerificationModal'
import AdminConfigModal from './AdminConfigModal'
import SelfVoltPanel from '../SelfVoltPanel'
import FederationPanel from '../FederationPanel'
import BotPanel from '../BotPanel'
import './Modal.css'
import './SettingsModal.css'
import '../../assets/styles/RichTextEditor.css'

const SettingsModal = ({ onClose, initialTab = 'account' }) => {
  const [activeTab, setActiveTab] = useState(initialTab)
  const [isMobile, setIsMobile] = useState(false)
  const [showSidebar, setShowSidebar] = useState(true)
  const { user, logout, refreshUser } = useAuth()
  const { theme, setTheme, allThemes, customThemes, addCustomTheme, removeCustomTheme } = useTheme()
  const server = getStoredServer()
  const apiUrl = server?.apiUrl || ''
  const imageApiUrl = server?.imageApiUrl || apiUrl
  const bannerUrl = user?.id ? `${imageApiUrl}/api/images/users/${user.id}/banner` : null
  const { bannerSrc } = useBanner(bannerUrl)
  const [settings, setSettings] = useState(() => settingsService.getSettings())
  const [devices, setDevices] = useState({ audio: [], video: [], output: [] })
  const [testingMic, setTestingMic] = useState(false)
  const [testingCamera, setTestingCamera] = useState(false)
  const [micLevel, setMicLevel] = useState(0)
  const [permissionsGranted, setPermissionsGranted] = useState(false)
  const [micError, setMicError] = useState(null)
  const [cameraError, setCameraError] = useState(null)
  const [ageInfo, setAgeInfo] = useState(null)
  const [ageLoading, setAgeLoading] = useState(false)
  const [ageError, setAgeError] = useState('')
  const [showAgeVerify, setShowAgeVerify] = useState(false)
  const [showAdminConfig, setShowAdminConfig] = useState(false)
  const [bioPreview, setBioPreview] = useState(false)
  const [bioValue, setBioValue] = useState('')
  const [usernameValue, setUsernameValue] = useState('')
  const [displayNameValue, setDisplayNameValue] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [displayNameError, setDisplayNameError] = useState('')
  const [pushSupported, setPushSupported] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)
  const micStreamRef = useRef(null)
  const cameraStreamRef = useRef(null)
  const videoPreviewRef = useRef(null)
  const analyserRef = useRef(null)
  const animationRef = useRef(null)

  const [isAdminUser, setIsAdminUser] = useState(false)

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const res = await apiService.getMyAdminRole()
        if (res.data?.isAdmin || res.data?.role === 'owner' || res.data?.role === 'admin') {
          setIsAdminUser(true)
          return
        }
      } catch { /* ignore */ }
      if (user?.adminRole === 'owner' || user?.adminRole === 'admin') {
        setIsAdminUser(true)
      }
    }
    checkAdmin()
  }, [user])

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const [customThemeDraft, setCustomThemeDraft] = useState(() => ({
    name: 'Custom',
    mode: 'dark',
    primary: '#12d8ff',
    success: '#3be3b2',
    warning: '#ffd166',
    danger: '#ff6b81',
    bgPrimary: '#08111e',
    bgSecondary: '#0c1a2c',
    bgTertiary: '#0f2137',
    bgQuaternary: '#142b46',
    textPrimary: '#e6f5ff',
    textSecondary: '#bad7f2',
    textMuted: '#7fa1c2',
    border: '#1e3a56',
    gradientEnabled: false,
    gradientAngle: 135,
    gradientA: '#08111e',
    gradientB: '#142b46'
  }))
  const [customThemeError, setCustomThemeError] = useState('')

  const getThemePreviewBackground = (t) => {
    const v = t?.vars || {}
    const g = t?.previewGradient || v['--volt-bg-gradient']
    if (g && g !== 'none') return g
    const a = t?.preview?.[0] || v['--volt-bg-primary'] || '#0b1220'
    const b = t?.preview?.[1] || v['--volt-primary'] || '#162138'
    return `linear-gradient(135deg, ${a}, ${b})`
  }

  const handleCreateCustomTheme = () => {
    setCustomThemeError('')
    const name = (customThemeDraft.name || '').trim() || 'Custom'
    const mode = customThemeDraft.mode === 'light' ? 'light' : 'dark'

    const vars = {
      '--volt-primary': customThemeDraft.primary,
      '--volt-primary-dark': customThemeDraft.primary,
      '--volt-primary-light': customThemeDraft.primary,
      '--volt-success': customThemeDraft.success,
      '--volt-warning': customThemeDraft.warning,
      '--volt-danger': customThemeDraft.danger,
      '--volt-bg-primary': customThemeDraft.bgPrimary,
      '--volt-bg-secondary': customThemeDraft.bgSecondary,
      '--volt-bg-tertiary': customThemeDraft.bgTertiary,
      '--volt-bg-quaternary': customThemeDraft.bgQuaternary,
      '--volt-text-primary': customThemeDraft.textPrimary,
      '--volt-text-secondary': customThemeDraft.textSecondary,
      '--volt-text-muted': customThemeDraft.textMuted,
      '--volt-border': customThemeDraft.border,
      '--volt-hover': mode === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)',
      '--volt-active': mode === 'light' ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.08)',
      '--volt-shadow': mode === 'light' ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.38)'
    }

    if (customThemeDraft.gradientEnabled) {
      const angle = Number.isFinite(Number(customThemeDraft.gradientAngle)) ? Number(customThemeDraft.gradientAngle) : 135
      vars['--volt-bg-gradient'] = `linear-gradient(${angle}deg, ${customThemeDraft.gradientA}, ${customThemeDraft.gradientB})`
    }

    try {
      const id = addCustomTheme({
        name,
        mode,
        preview: [customThemeDraft.bgPrimary, customThemeDraft.primary],
        vars
      })
      setTheme(id)
    } catch (e) {
      console.error(e)
      setCustomThemeError('Could not save custom theme.')
    }
  }

  const enumerateDevices = async () => {
    try {
      const deviceList = await navigator.mediaDevices.enumerateDevices()
      setDevices({
        audio: deviceList.filter(d => d.kind === 'audioinput'),
        video: deviceList.filter(d => d.kind === 'videoinput'),
        output: deviceList.filter(d => d.kind === 'audiooutput')
      })
    } catch (err) {
      console.error('Failed to enumerate devices:', err)
    }
  }

  const requestPermissions = async () => {
    try {
      // Request both audio and video permissions to get full device list
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
      // Stop the stream immediately, we just needed permissions
      stream.getTracks().forEach(track => track.stop())
      setPermissionsGranted(true)
      // Now enumerate devices to get labels
      await enumerateDevices()
    } catch (err) {
      console.log('Could not get all permissions, trying audio only:', err)
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true })
        audioStream.getTracks().forEach(track => track.stop())
        setPermissionsGranted(true)
        await enumerateDevices()
      } catch (audioErr) {
        console.error('Could not get audio permissions:', audioErr)
      }
    }
  }

  useEffect(() => {
    // Initial device enumeration (may not have labels without permissions)
    enumerateDevices()
    
    // Listen for device changes
    navigator.mediaDevices?.addEventListener('devicechange', enumerateDevices)
    
    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', enumerateDevices)
      stopMicTest()
      stopCameraTest()
    }
  }, [])

  useEffect(() => {
    if (user) {
      setUsernameValue(user.customUsername || '')
      setDisplayNameValue(user.displayName || '')
    }
  }, [user])

  useEffect(() => {
    const initPush = async () => {
      const supported = pushService.isSupported()
      setPushSupported(supported)
      
      if (supported) {
        const subscription = await pushService.getSubscription()
        setPushEnabled(!!subscription)
      }
    }
    initPush()
  }, [])

  const startMicTest = async () => {
    setMicError(null)
    
    const tryGetMic = async (deviceId) => {
      const constraints = {
        audio: deviceId && deviceId !== 'default' 
          ? { deviceId: { exact: deviceId } }
          : true
      }
      return navigator.mediaDevices.getUserMedia(constraints)
    }
    
    try {
      let stream
      try {
        stream = await tryGetMic(settings.inputDevice)
      } catch (err) {
        if (err.name === 'OverconstrainedError') {
          // Device no longer available, fall back to default
          console.log('Saved mic device not found, using default')
          handleSelect('inputDevice', 'default')
          stream = await tryGetMic(null)
        } else {
          throw err
        }
      }
      
      micStreamRef.current = stream
      setPermissionsGranted(true)
      
      // Re-enumerate devices to get labels now that we have permission
      await enumerateDevices()
      
      const audioContext = new AudioContext()
      const analyser = audioContext.createAnalyser()
      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)
      analyser.fftSize = 256
      analyserRef.current = { audioContext, analyser }
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      const updateLevel = () => {
        if (!analyserRef.current) return
        analyserRef.current.analyser.getByteFrequencyData(dataArray)
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
        setMicLevel(Math.min(100, (average / 128) * 100))
        animationRef.current = requestAnimationFrame(updateLevel)
      }
      updateLevel()
      
      setTestingMic(true)
    } catch (err) {
      console.error('Failed to start mic test:', err)
      if (err.name === 'NotAllowedError') {
        setMicError('Microphone access denied. Please allow microphone access in your browser.')
      } else if (err.name === 'NotFoundError') {
        setMicError('No microphone found. Please connect a microphone.')
      } else {
        setMicError('Failed to access microphone: ' + err.message)
      }
    }
  }

  const stopMicTest = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
    if (analyserRef.current?.audioContext && analyserRef.current.audioContext.state !== 'closed') {
      analyserRef.current.audioContext.close().catch(() => {})
    }
    analyserRef.current = null
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop())
      micStreamRef.current = null
    }
    setMicLevel(0)
    setTestingMic(false)
  }

  const startCameraTest = async () => {
    setCameraError(null)
    
    const tryGetCamera = async (deviceId) => {
      const constraints = {
        video: deviceId && deviceId !== 'default'
          ? { deviceId: { exact: deviceId } }
          : true
      }
      return navigator.mediaDevices.getUserMedia(constraints)
    }
    
    try {
      let stream
      try {
        stream = await tryGetCamera(settings.videoDevice)
      } catch (err) {
        if (err.name === 'OverconstrainedError') {
          // Device no longer available, fall back to default
          console.log('Saved camera device not found, using default')
          handleSelect('videoDevice', 'default')
          stream = await tryGetCamera(null)
        } else {
          throw err
        }
      }
      
      cameraStreamRef.current = stream
      setPermissionsGranted(true)
      setTestingCamera(true)
      
      // Re-enumerate devices to get labels
      await enumerateDevices()
    } catch (err) {
      console.error('Failed to start camera test:', err)
      if (err.name === 'NotAllowedError') {
        setCameraError('Camera access denied. Please allow camera access in your browser.')
      } else if (err.name === 'NotFoundError') {
        setCameraError('No camera found. Please connect a camera.')
      } else {
        setCameraError('Failed to access camera: ' + err.message)
      }
    }
  }

  // Effect to attach stream to video element when it becomes available
  useEffect(() => {
    if (testingCamera && videoPreviewRef.current && cameraStreamRef.current) {
      videoPreviewRef.current.srcObject = cameraStreamRef.current
    }
  }, [testingCamera])

  const stopCameraTest = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(t => t.stop())
      cameraStreamRef.current = null
    }
    if (videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = null
    }
    setTestingCamera(false)
  }

  const allTabs = [
    { id: 'account', label: 'My Account', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'voice', label: 'Voice & Video', icon: Volume2 },
    { id: 'privacy', label: 'Privacy', icon: Shield },
    { id: 'age', label: 'Age Verification', icon: Shield },
    { id: 'selfvolt', label: 'Self-Volt', icon: Globe },
    { id: 'federation', label: 'Federation', icon: Network, adminOnly: true },
    { id: 'bots', label: 'Bots', icon: Bot },
    { id: 'serverconfig', label: 'Server Config', icon: Settings, adminOnly: true },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'about', label: 'About', icon: Info },
  ]
  const isVoltageServer = server?.name?.toLowerCase() === 'voltage'
  const canAccessAdminTabs = isAdminUser && (!isVoltageServer || server?.ownerId === user?.id)
  const tabs = allTabs.filter(t => !t.adminOnly || canAccessAdminTabs)

  const loadAgeInfo = async () => {
    setAgeLoading(true)
    setAgeError('')
    try {
      const res = await apiService.getAgeVerificationStatus()
      setAgeInfo(res.data?.ageVerification || null)
    } catch (err) {
      setAgeError(err?.response?.data?.error || 'Failed to load age verification status')
    }
    setAgeLoading(false)
  }

  useEffect(() => {
    if (activeTab === 'age') {
      loadAgeInfo()
    }
  }, [activeTab])

  const handleToggle = (key) => {
    setSettings(prev => {
      const newSettings = { ...prev, [key]: !prev[key] }
      settingsService.saveSettings(newSettings)
      return newSettings
    })
  }

  const handleVolumeChange = (e) => {
    setSettings(prev => {
      const newSettings = { ...prev, volume: parseInt(e.target.value) }
      settingsService.saveSettings(newSettings)
      return newSettings
    })
  }

  const handleSelect = (key, value) => {
    setSettings(prev => {
      const newSettings = { ...prev, [key]: value }
      settingsService.saveSettings(newSettings)
      return newSettings
    })
  }

  const handleTabClick = (tabId) => {
    if (isMobile) {
      setShowSidebar(false)
    }
    setActiveTab(tabId)
  }

  const handleBack = () => {
    setShowSidebar(true)
  }

  return (
    <>
    <div className="modal-overlay settings-overlay" onClick={onClose} style={showAdminConfig ? { display: 'none' } : undefined}>
      <div className="modal-content settings-modal" onClick={e => e.stopPropagation()}>
        <div className="settings-container">
          {(showSidebar || !isMobile) && (
            <div className="settings-sidebar">
              {isMobile && (
                <div className="settings-mobile-header">
                  <h3>Settings</h3>
                </div>
              )}
              <div className="settings-tabs">
                {tabs.map(tab => {
                  const Icon = tab.icon
                  return (
                    <button
                      key={tab.id}
                      className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
                      onClick={() => handleTabClick(tab.id)}
                    >
                      <Icon size={20} />
                      <span>{tab.label}</span>
                    </button>
                  )
                })}
              </div>
              <div className="settings-footer">
                <button className="btn btn-danger" onClick={logout}>
                  Logout
                </button>
              </div>
            </div>
          )}

          {isMobile && !showSidebar && (
            <div className="settings-mobile-nav">
              <button className="settings-back-btn" onClick={handleBack}>
                ← Back
              </button>
              <span className="settings-mobile-title">
                {tabs.find(t => t.id === activeTab)?.label}
              </span>
            </div>
          )}

          <div className={`settings-content ${isMobile && !showSidebar ? 'mobile-full' : ''}`}>
            {!isMobile && (
              <button className="settings-close" onClick={onClose}>
                <X size={24} />
              </button>
            )}

            {activeTab === 'account' && (
              <div className="settings-section">
                <h2>My Account</h2>
                <div className="user-profile-card">
                  <div 
                    className="user-banner"
                    style={bannerSrc ? { 
                      backgroundImage: `url(${bannerSrc})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center'
                    } : {}}
                  ></div>
                  <Avatar 
                    src={user?.avatar} 
                    alt={user?.username}
                    fallback={user?.username || user?.email}
                    size={80}
                    className="user-avatar-large"
                  />
                  <div className="user-info-large">
                    <h3>{user?.displayName || user?.customUsername || user?.username || 'User'}</h3>
                    <p className="user-username">@{user?.customUsername || user?.username}</p>
                    <p className="user-email">{user?.email}</p>
                  </div>
                </div>

                <div className="form-group">
                  <label>User ID</label>
                  <input 
                    type="text" 
                    className="input" 
                    value={user?.id || ''}
                    disabled
                  />
                </div>

                <div className="form-group">
                  <label>Account Username (cannot change)</label>
                  <input 
                    type="text" 
                    className="input" 
                    value={user?.username || ''}
                    disabled
                  />
                  <small className="form-hint">This is your account username from login</small>
                </div>

                <div className="form-group">
                  <label>Custom Username</label>
                  <input 
                    type="text" 
                    className={`input ${usernameError ? 'input-error' : ''}`}
                    value={usernameValue}
                    onChange={(e) => {
                      setUsernameValue(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 32))
                      setUsernameError('')
                    }}
                    onBlur={() => {
                      if (usernameValue && usernameValue !== (user?.customUsername || '')) {
                        apiService.updateProfile({ customUsername: usernameValue })
                          .then(() => refreshUser?.())
                          .catch(err => {
                            console.error('Failed to update username:', err)
                            setUsernameError(err.response?.data?.error || 'Failed to update username')
                          })
                      }
                    }}
                    placeholder="Enter custom username"
                  />
                  {usernameError && <span className="error-text">{usernameError}</span>}
                  <small className="form-hint">Letters, numbers, underscores only (2-32 chars)</small>
                </div>

                <div className="form-group">
                  <label>Display Name</label>
                  <input 
                    type="text" 
                    className={`input ${displayNameError ? 'input-error' : ''}`}
                    value={displayNameValue}
                    onChange={(e) => {
                      setDisplayNameValue(e.target.value.slice(0, 100))
                      setDisplayNameError('')
                    }}
                    onBlur={() => {
                      if (displayNameValue && displayNameValue !== (user?.displayName || '')) {
                        apiService.updateProfile({ displayName: displayNameValue })
                          .then(() => refreshUser?.())
                          .catch(err => {
                            console.error('Failed to update display name:', err)
                            setDisplayNameError(err.response?.data?.error || 'Failed to update display name')
                          })
                      }
                    }}
                    placeholder="Enter display name"
                  />
                  {displayNameError && <span className="error-text">{displayNameError}</span>}
                  <small className="form-hint">How others see you (2-100 chars)</small>
                </div>

                <div className="form-group">
                  <label>Email</label>
                  <input 
                    type="email" 
                    className="input" 
                    value={user?.email || ''}
                    disabled
                  />
                </div>

                <div className="form-group">
                  <label>Bio</label>
                  <div className="bio-editor">
                    <div className="bio-editor-tabs">
                      <button 
                        type="button"
                        className={`bio-tab ${!bioPreview ? 'active' : ''}`}
                        onClick={() => setBioPreview(false)}
                      >
                        <Edit2 size={14} /> Write
                      </button>
                      <button 
                        type="button"
                        className={`bio-tab ${bioPreview ? 'active' : ''}`}
                        onClick={() => setBioPreview(true)}
                      >
                        <Eye size={14} /> Preview
                      </button>
                    </div>
                    {bioPreview ? (
                      <div className="bio-preview">
                        {bioValue || user?.bio ? (
                          <MarkdownMessage content={bioValue || user?.bio || ''} />
                        ) : (
                          <span className="bio-preview-empty">Nothing to preview</span>
                        )}
                      </div>
                    ) : (
                      <BioEditor
                        value={bioValue || user?.bio || ''}
                        onChange={(newBio) => {
                          const trimmedBio = newBio.slice(0, 500)
                          setBioValue(trimmedBio)
                          apiService.updateProfile({ bio: trimmedBio })
                            .then(() => refreshUser?.())
                            .catch(err => console.error('Failed to update bio:', err))
                        }}
                        placeholder="Write something about yourself... (Markdown supported)"
                        maxLength={500}
                      />
                    )}
                    <span className="char-count">{(bioValue || user?.bio || '').length}/500</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="settings-section">
                <h2>Notifications</h2>
                
                {pushSupported && (
                  <div className="setting-item">
                    <div>
                      <h4>Push Notifications</h4>
                      <p>Receive notifications even when the app is closed</p>
                    </div>
                    <label className="toggle">
                      <input 
                        type="checkbox" 
                        checked={settings.pushNotifications || pushEnabled}
                        onChange={async () => {
                          if (!pushEnabled) {
                            const registration = await pushService.register()
                            if (registration) {
                              const configRes = await apiService.getPushConfig().catch(() => ({ data: { vapidPublicKey: '' } }))
                              if (configRes.data?.vapidPublicKey) {
                                const subscription = await pushService.subscribe(registration, configRes.data.vapidPublicKey)
                                if (subscription) {
                                  await apiService.subscribePush(subscription)
                                  setPushEnabled(true)
                                  handleToggle('pushNotifications')
                                }
                              }
                            }
                          } else {
                            await pushService.unsubscribe()
                            await apiService.unsubscribePush()
                            setPushEnabled(false)
                            handleToggle('pushNotifications')
                          }
                        }}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                )}

                <div className="setting-item">
                  <div>
                    <h4>Enable Desktop Notifications</h4>
                    <p>Get notified of new messages</p>
                  </div>
                  <label className="toggle">
                    <input 
                      type="checkbox" 
                      checked={settings.notifications}
                      onChange={() => handleToggle('notifications')}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                <div className="setting-item">
                  <div>
                    <h4>Message Notifications</h4>
                    <p>Show notifications for messages</p>
                  </div>
                  <label className="toggle">
                    <input 
                      type="checkbox" 
                      checked={settings.messageNotifications}
                      onChange={() => handleToggle('messageNotifications')}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                <div className="setting-item">
                  <div>
                    <h4>Friend Requests</h4>
                    <p>Get notified of friend requests</p>
                  </div>
                  <label className="toggle">
                    <input 
                      type="checkbox" 
                      checked={settings.friendRequests}
                      onChange={() => handleToggle('friendRequests')}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                <div className="setting-item">
                  <div>
                    <h4>Notification Sounds</h4>
                    <p>Play sounds for notifications</p>
                  </div>
                  <label className="toggle">
                    <input 
                      type="checkbox" 
                      checked={settings.sounds}
                      onChange={() => handleToggle('sounds')}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>
            )}

            {activeTab === 'voice' && (
              <div className="settings-section">
                <h2>Voice & Video</h2>
                
                <div className="voice-settings-group">
                  <h3><Mic size={18} /> Voice Settings</h3>
                  
                  {!permissionsGranted && devices.audio.length === 0 && (
                    <div className="permission-notice">
                      <p>Grant microphone access to see available devices</p>
                      <button className="btn btn-secondary btn-sm" onClick={requestPermissions}>
                        <Mic size={14} /> Allow Access
                      </button>
                    </div>
                  )}
                  
                  <div className="form-group">
                    <label>Input Device</label>
                    <select 
                      className="input"
                      value={settings.inputDevice}
                      onChange={(e) => handleSelect('inputDevice', e.target.value)}
                    >
                      <option value="default">Default - System Microphone</option>
                      {devices.audio.map(d => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Microphone (${d.deviceId.slice(0, 8)}...)`}
                        </option>
                      ))}
                    </select>
                    {devices.audio.length > 0 && (
                      <span className="device-count">{devices.audio.length} microphone(s) detected</span>
                    )}
                  </div>

                  <div className="setting-item">
                    <div>
                      <h4>Input Volume</h4>
                      <p>Adjust your microphone volume</p>
                    </div>
                    <div className="volume-control">
                      <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        value={settings.inputVolume}
                        onChange={(e) => setSettings(prev => ({ ...prev, inputVolume: parseInt(e.target.value) }))}
                        className="volume-slider"
                      />
                      <span className="volume-value">{settings.inputVolume}%</span>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Output Device</label>
                    <select 
                      className="input"
                      value={settings.outputDevice}
                      onChange={(e) => handleSelect('outputDevice', e.target.value)}
                    >
                      <option value="default">Default - System Speakers</option>
                      {devices.output.map(d => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Speaker (${d.deviceId.slice(0, 8)}...)`}
                        </option>
                      ))}
                    </select>
                    {devices.output.length > 0 && (
                      <span className="device-count">{devices.output.length} output device(s) detected</span>
                    )}
                  </div>

                  <div className="setting-item">
                    <div>
                      <h4>Output Volume</h4>
                      <p>Adjust the volume of voice channels</p>
                    </div>
                    <div className="volume-control">
                      <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        value={settings.volume}
                        onChange={handleVolumeChange}
                        className="volume-slider"
                      />
                      <span className="volume-value">{settings.volume}%</span>
                    </div>
                  </div>

                  <div className="setting-item">
                    <div>
                      <h4>Mute All</h4>
                      <p>Mute all voice channels</p>
                    </div>
                    <label className="toggle">
                      <input 
                        type="checkbox" 
                        checked={settings.muteAll}
                        onChange={() => handleToggle('muteAll')}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  <div className="mic-test-section">
                    <h4>Microphone Test</h4>
                    <p>Test your microphone to make sure it's working</p>
                    {micError && <div className="test-error">{micError}</div>}
                    <div className="mic-test-controls">
                      <button 
                        className={`btn ${testingMic ? 'btn-danger' : 'btn-primary'}`}
                        onClick={testingMic ? stopMicTest : startMicTest}
                      >
                        {testingMic ? <><MicOff size={16} /> Stop Test</> : <><Mic size={16} /> Test Microphone</>}
                      </button>
                    </div>
                    {testingMic && (
                      <div className="mic-level-container">
                        <span className="mic-level-label">Input Level</span>
                        <div className="mic-level-bar">
                          <div className="mic-level-fill" style={{ width: `${micLevel}%` }} />
                        </div>
                        <span className="mic-level-value">{Math.round(micLevel)}%</span>
                      </div>
                    )}
                    {testingMic && (
                      <p className="test-hint">Speak into your microphone to see the level indicator move</p>
                    )}
                  </div>
                </div>

                <div className="voice-settings-group">
                  <h3><Video size={18} /> Video Settings</h3>
                  
                  <div className="form-group">
                    <label>Camera</label>
                    <select 
                      className="input"
                      value={settings.videoDevice}
                      onChange={(e) => handleSelect('videoDevice', e.target.value)}
                    >
                      <option value="default">Default - System Camera</option>
                      {devices.video.map(d => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Camera (${d.deviceId.slice(0, 8)}...)`}
                        </option>
                      ))}
                    </select>
                    {devices.video.length > 0 && (
                      <span className="device-count">{devices.video.length} camera(s) detected</span>
                    )}
                  </div>

                  <div className="camera-test-section">
                    <h4>Camera Preview</h4>
                    <p>Test your camera to make sure it's working</p>
                    {cameraError && <div className="test-error">{cameraError}</div>}
                    <div className="camera-preview-container">
                      {testingCamera ? (
                        <video 
                          ref={(el) => {
                            videoPreviewRef.current = el
                            if (el && cameraStreamRef.current) {
                              el.srcObject = cameraStreamRef.current
                            }
                          }}
                          autoPlay 
                          playsInline 
                          muted 
                          className="camera-preview"
                        />
                      ) : (
                        <div className="camera-preview-placeholder">
                          <VideoOff size={48} />
                          <span>Camera preview off</span>
                          <span className="preview-hint">Click the button below to start</span>
                        </div>
                      )}
                    </div>
                    <button 
                      className={`btn ${testingCamera ? 'btn-danger' : 'btn-primary'}`}
                      onClick={testingCamera ? stopCameraTest : startCameraTest}
                    >
                      {testingCamera ? <><VideoOff size={16} /> Stop Preview</> : <><Video size={16} /> Start Camera Preview</>}
                    </button>
                  </div>
                </div>

                <div className="voice-settings-group">
                  <h3><Monitor size={18} /> Advanced</h3>

                  <div className="setting-item">
                    <div>
                      <h4>Noise Suppression</h4>
                      <p>Reduce background noise from your microphone</p>
                    </div>
                    <label className="toggle">
                      <input 
                        type="checkbox" 
                        checked={settings.noiseSuppression}
                        onChange={() => handleToggle('noiseSuppression')}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  <div className="setting-item">
                    <div>
                      <h4>Echo Cancellation</h4>
                      <p>Prevent echo in voice channels</p>
                    </div>
                    <label className="toggle">
                      <input 
                        type="checkbox" 
                        checked={settings.echoCancellation}
                        onChange={() => handleToggle('echoCancellation')}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  <div className="setting-item">
                    <div>
                      <h4>Automatic Gain Control</h4>
                      <p>Automatically adjust microphone sensitivity</p>
                    </div>
                    <label className="toggle">
                      <input 
                        type="checkbox" 
                        checked={settings.autoGainControl}
                        onChange={() => handleToggle('autoGainControl')}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'privacy' && (
              <div className="settings-section">
                <h2>Privacy & Safety</h2>
                <p style={{marginBottom: '20px', color: 'var(--volt-text-secondary)'}}>
                  Manage your privacy settings and keep your account secure.
                </p>
                
                <div className="privacy-note">
                  <h4>Direct Messages</h4>
                  <p>Control who can send you direct messages</p>
                  <select 
                    className="input"
                    value={settings.dmPermissions}
                    onChange={(e) => handleSelect('dmPermissions', e.target.value)}
                  >
                    <option value="everyone">Everyone</option>
                    <option value="friends">Friends Only</option>
                    <option value="nobody">Nobody</option>
                  </select>
                </div>
              </div>
            )}

            {activeTab === 'age' && (
              <div className="settings-section">
                <h2>Age Verification</h2>
                <p style={{ marginBottom: '16px', color: 'var(--volt-text-secondary)' }}>
                  Review your current verification status or rerun verification.
                </p>

                {ageLoading ? (
                  <div className="privacy-note">Loading status...</div>
                ) : (
                  <div className="privacy-note">
                    <h4>Status</h4>
                    <p>{ageInfo?.verified ? 'Verified' : 'Not verified'}</p>
                    {ageInfo && (
                      <div className="age-meta">
                        <div><strong>Category:</strong> {ageInfo.category || 'unknown'}</div>
                        <div><strong>Method:</strong> {ageInfo.method || 'unknown'}</div>
                        <div><strong>Verified at:</strong> {ageInfo.verifiedAt ? new Date(ageInfo.verifiedAt).toLocaleString() : '—'}</div>
                        <div><strong>Expires:</strong> {ageInfo.expiresAt ? new Date(ageInfo.expiresAt).toLocaleString() : '—'}</div>
                        <div><strong>Estimated age:</strong> {ageInfo.estimatedAge ?? '—'}</div>
                      </div>
                    )}
                    {ageError && <div className="test-error" style={{ marginTop: 8 }}>{ageError}</div>}
                    <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary" onClick={() => { setShowAgeVerify(true); setAgeError('') }}>
                        Re-run verification
                      </button>
                      <button className="btn btn-secondary" onClick={loadAgeInfo}>
                        Refresh
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="settings-section">
                <h2>Appearance</h2>
                <p className="theme-description">Choose how VoltChat looks to you. 70+ curated palettes, custom themes, and gradients.</p>
                <div className="theme-grid">
                  {allThemes.map(t => (
                    <button
                      key={t.id}
                      className={`theme-card ${theme === t.id ? 'active' : ''}`}
                      onClick={() => setTheme(t.id)}
                      aria-label={`Apply ${t.name} theme`}
                    >
                      <div className="theme-card-preview" style={{ background: getThemePreviewBackground(t) }}>
                        <div className="theme-card-sidebar"></div>
                        <div className="theme-card-content">
                          <div className="theme-card-header"></div>
                          <div className="theme-card-lines">
                            <span></span>
                            <span></span>
                          </div>
                        </div>
                      </div>
                      <div className="theme-card-meta">
                        <div className="theme-name">{t.name}</div>
                        <div className="theme-mode">
                          {t.isCustom ? 'Custom' : t.mode === 'auto' ? 'System' : t.mode === 'dark' ? 'Dark' : 'Light'}
                        </div>
                      </div>
                      {t.isCustom && (
                        <span
                          className="theme-remove"
                          role="button"
                          tabIndex={0}
                          aria-label={`Remove ${t.name} theme`}
                          onClick={(e) => {
                            e.stopPropagation()
                            removeCustomTheme(t.id)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              e.stopPropagation()
                              removeCustomTheme(t.id)
                            }
                          }}
                        >
                          Remove
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                <div className="divider" />

                <div className="theme-customizer">
                  <h3>Custom Theme</h3>
                  <p className="theme-customizer-desc">Create your own palette and optionally add a background gradient.</p>

                  <div className="form-grid">
                    <div className="form-group">
                      <label>Name</label>
                      <input
                        type="text"
                        className="input"
                        value={customThemeDraft.name}
                        onChange={(e) => setCustomThemeDraft(p => ({ ...p, name: e.target.value }))}
                        placeholder="My Theme"
                      />
                    </div>

                    <div className="form-group">
                      <label>Mode</label>
                      <select
                        className="input"
                        value={customThemeDraft.mode}
                        onChange={(e) => setCustomThemeDraft(p => ({ ...p, mode: e.target.value }))}
                      >
                        <option value="dark">Dark</option>
                        <option value="light">Light</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-grid">
                    <div className="form-group">
                      <label>Primary</label>
                      <div className="color-input-row">
                        <input type="color" className="color-picker" value={customThemeDraft.primary} onChange={(e) => setCustomThemeDraft(p => ({ ...p, primary: e.target.value }))} />
                        <input type="text" className="input" value={customThemeDraft.primary} onChange={(e) => setCustomThemeDraft(p => ({ ...p, primary: e.target.value }))} />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Success</label>
                      <div className="color-input-row">
                        <input type="color" className="color-picker" value={customThemeDraft.success} onChange={(e) => setCustomThemeDraft(p => ({ ...p, success: e.target.value }))} />
                        <input type="text" className="input" value={customThemeDraft.success} onChange={(e) => setCustomThemeDraft(p => ({ ...p, success: e.target.value }))} />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Warning</label>
                      <div className="color-input-row">
                        <input type="color" className="color-picker" value={customThemeDraft.warning} onChange={(e) => setCustomThemeDraft(p => ({ ...p, warning: e.target.value }))} />
                        <input type="text" className="input" value={customThemeDraft.warning} onChange={(e) => setCustomThemeDraft(p => ({ ...p, warning: e.target.value }))} />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Danger</label>
                      <div className="color-input-row">
                        <input type="color" className="color-picker" value={customThemeDraft.danger} onChange={(e) => setCustomThemeDraft(p => ({ ...p, danger: e.target.value }))} />
                        <input type="text" className="input" value={customThemeDraft.danger} onChange={(e) => setCustomThemeDraft(p => ({ ...p, danger: e.target.value }))} />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Background (Primary)</label>
                      <div className="color-input-row">
                        <input type="color" className="color-picker" value={customThemeDraft.bgPrimary} onChange={(e) => setCustomThemeDraft(p => ({ ...p, bgPrimary: e.target.value }))} />
                        <input type="text" className="input" value={customThemeDraft.bgPrimary} onChange={(e) => setCustomThemeDraft(p => ({ ...p, bgPrimary: e.target.value }))} />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Background (Secondary)</label>
                      <div className="color-input-row">
                        <input type="color" className="color-picker" value={customThemeDraft.bgSecondary} onChange={(e) => setCustomThemeDraft(p => ({ ...p, bgSecondary: e.target.value }))} />
                        <input type="text" className="input" value={customThemeDraft.bgSecondary} onChange={(e) => setCustomThemeDraft(p => ({ ...p, bgSecondary: e.target.value }))} />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Background (Tertiary)</label>
                      <div className="color-input-row">
                        <input type="color" className="color-picker" value={customThemeDraft.bgTertiary} onChange={(e) => setCustomThemeDraft(p => ({ ...p, bgTertiary: e.target.value }))} />
                        <input type="text" className="input" value={customThemeDraft.bgTertiary} onChange={(e) => setCustomThemeDraft(p => ({ ...p, bgTertiary: e.target.value }))} />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Background (Quaternary)</label>
                      <div className="color-input-row">
                        <input type="color" className="color-picker" value={customThemeDraft.bgQuaternary} onChange={(e) => setCustomThemeDraft(p => ({ ...p, bgQuaternary: e.target.value }))} />
                        <input type="text" className="input" value={customThemeDraft.bgQuaternary} onChange={(e) => setCustomThemeDraft(p => ({ ...p, bgQuaternary: e.target.value }))} />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Text (Primary)</label>
                      <div className="color-input-row">
                        <input type="color" className="color-picker" value={customThemeDraft.textPrimary} onChange={(e) => setCustomThemeDraft(p => ({ ...p, textPrimary: e.target.value }))} />
                        <input type="text" className="input" value={customThemeDraft.textPrimary} onChange={(e) => setCustomThemeDraft(p => ({ ...p, textPrimary: e.target.value }))} />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Text (Secondary)</label>
                      <div className="color-input-row">
                        <input type="color" className="color-picker" value={customThemeDraft.textSecondary} onChange={(e) => setCustomThemeDraft(p => ({ ...p, textSecondary: e.target.value }))} />
                        <input type="text" className="input" value={customThemeDraft.textSecondary} onChange={(e) => setCustomThemeDraft(p => ({ ...p, textSecondary: e.target.value }))} />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Text (Muted)</label>
                      <div className="color-input-row">
                        <input type="color" className="color-picker" value={customThemeDraft.textMuted} onChange={(e) => setCustomThemeDraft(p => ({ ...p, textMuted: e.target.value }))} />
                        <input type="text" className="input" value={customThemeDraft.textMuted} onChange={(e) => setCustomThemeDraft(p => ({ ...p, textMuted: e.target.value }))} />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Border</label>
                      <div className="color-input-row">
                        <input type="color" className="color-picker" value={customThemeDraft.border} onChange={(e) => setCustomThemeDraft(p => ({ ...p, border: e.target.value }))} />
                        <input type="text" className="input" value={customThemeDraft.border} onChange={(e) => setCustomThemeDraft(p => ({ ...p, border: e.target.value }))} />
                      </div>
                    </div>
                  </div>

                  <div className="custom-theme-gradient">
                    <label className="custom-theme-gradient-toggle">
                      <input
                        type="checkbox"
                        checked={customThemeDraft.gradientEnabled}
                        onChange={(e) => setCustomThemeDraft(p => ({ ...p, gradientEnabled: e.target.checked }))}
                      />
                      Enable gradient background
                    </label>

                    {customThemeDraft.gradientEnabled && (
                      <div className="form-grid">
                        <div className="form-group">
                          <label>Gradient Angle</label>
                          <input
                            type="number"
                            className="input"
                            value={customThemeDraft.gradientAngle}
                            onChange={(e) => setCustomThemeDraft(p => ({ ...p, gradientAngle: e.target.value }))}
                          />
                        </div>

                        <div className="form-group">
                          <label>Gradient A</label>
                          <div className="color-input-row">
                            <input type="color" className="color-picker" value={customThemeDraft.gradientA} onChange={(e) => setCustomThemeDraft(p => ({ ...p, gradientA: e.target.value }))} />
                            <input type="text" className="input" value={customThemeDraft.gradientA} onChange={(e) => setCustomThemeDraft(p => ({ ...p, gradientA: e.target.value }))} />
                          </div>
                        </div>

                        <div className="form-group">
                          <label>Gradient B</label>
                          <div className="color-input-row">
                            <input type="color" className="color-picker" value={customThemeDraft.gradientB} onChange={(e) => setCustomThemeDraft(p => ({ ...p, gradientB: e.target.value }))} />
                            <input type="text" className="input" value={customThemeDraft.gradientB} onChange={(e) => setCustomThemeDraft(p => ({ ...p, gradientB: e.target.value }))} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {customThemeError && <div className="test-error" style={{ marginTop: 8 }}>{customThemeError}</div>}

                  <div className="custom-theme-actions">
                    <button className="btn btn-primary" type="button" onClick={handleCreateCustomTheme}>
                      Save Custom Theme
                    </button>
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() => {
                        if (!customThemes.length) return
                        const last = customThemes[customThemes.length - 1]
                        if (last?.id) setTheme(last.id)
                      }}
                      disabled={!customThemes.length}
                    >
                      Apply Latest Custom
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'selfvolt' && (
              <SelfVoltPanel />
            )}

            {activeTab === 'federation' && (
              <div className="settings-section">
                <h2>Federation</h2>
                <p className="settings-description">
                  Connect with other VoltChat mainlines to share invites and communicate across instances.
                </p>
                <FederationPanel />
              </div>
            )}

            {activeTab === 'bots' && (
              <div className="settings-section">
                <h2>Bots</h2>
                <p className="settings-description">
                  Create and manage custom bots that can respond to messages, run commands, and automate your servers.
                </p>
                <BotPanel />
              </div>
            )}

            {activeTab === 'serverconfig' && (
              <div className="settings-section">
                <h2>Server Configuration</h2>
                <p className="settings-description">
                  Configure server settings like URL, authentication, features, and more.
                </p>
                <button 
                  className="btn btn-primary" 
                  onClick={() => setShowAdminConfig(true)}
                >
                  <Settings size={16} /> Open Server Config
                </button>
              </div>
            )}

            {activeTab === 'about' && (
              <div className="settings-section">
                <h2>About VoltChat</h2>
                <div className="about-info">
                  <div className="about-logo">⚡</div>
                  <h3>VoltChat</h3>
                  <p>Version 1.0.0</p>
                  <p className="about-description">
                    A powerful real-time chat application built with React and Node.js.
                    Featuring voice channels, direct messages, and OAuth 2.0 authentication.
                  </p>
                  <div className="about-tech">
                    <h4>Technologies</h4>
                    <ul>
                      <li>React 18 + Vite</li>
                      <li>Node.js + Express</li>
                      <li>Socket.IO</li>
                      <li>OAuth 2.0 with PKCE</li>
                      <li>WebRTC for Voice/Video</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>

    {showAgeVerify && (
      <AgeVerificationModal
        onClose={() => setShowAgeVerify(false)}
        onVerified={async (v) => {
          setShowAgeVerify(false)
          await refreshUser?.()
          loadAgeInfo()
        }}
      />
    )}

    {showAdminConfig && (
      <AdminConfigModal onClose={() => setShowAdminConfig(false)} standalone />
    )}
    </>
  )
}

export default SettingsModal
