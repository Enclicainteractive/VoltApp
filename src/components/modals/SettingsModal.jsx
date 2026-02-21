import React, { useState, useEffect, useRef } from 'react'
import { X, User, Bell, Volume2, Shield, Palette, Info, Mic, Video, Monitor, MicOff, VideoOff, Eye, Edit2, Globe, Server, Settings, Bot, Network, Play, Pause, Languages } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useI18n } from '../../contexts/I18nContext'
import { useBanner } from '../../hooks/useAvatar'
import { settingsService } from '../../services/settingsService'
import { soundService } from '../../services/soundService'
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
  const { t, language, setLanguage, availableLanguages } = useI18n()
  const server = getStoredServer()
  const apiUrl = server?.apiUrl || ''
  const imageApiUrl = server?.imageApiUrl || apiUrl
  const bannerUrl = user?.id ? `${imageApiUrl}/api/images/users/${user.id}/banner` : null
  const { bannerSrc } = useBanner(bannerUrl)
  const [settings, setSettings] = useState(() => settingsService.getSettings())
  
  useEffect(() => {
    const unsubscribe = settingsService.subscribe((newSettings) => {
      setSettings(newSettings)
    })
    return unsubscribe
  }, [])

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
  const [previewingSound, setPreviewingSound] = useState(null)
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
    { id: 'account', label: t('settings.account'), icon: User },
    { id: 'notifications', label: t('settings.notifications'), icon: Bell },
    { id: 'language', label: t('settings.language'), icon: Languages },
    { id: 'voice', label: t('settings.voice'), icon: Volume2 },
    { id: 'privacy', label: t('settings.privacy'), icon: Shield },
    { id: 'age', label: t('settings.age'), icon: Shield },
    { id: 'selfvolt', label: t('settings.selfvolt'), icon: Globe },
    { id: 'federation', label: t('settings.federation'), icon: Network, adminOnly: true },
    { id: 'bots', label: t('settings.bots'), icon: Bot },
    { id: 'serverconfig', label: t('settings.serverconfig'), icon: Settings, adminOnly: true },
    { id: 'appearance', label: t('settings.appearance'), icon: Palette },
    { id: 'about', label: t('settings.about'), icon: Info },
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
                  <h3>{t('settings.title')}</h3>
                  <button className="settings-mobile-close" onClick={onClose} aria-label={t('common.close', 'Close')}>
                    <X size={18} />
                  </button>
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
                  {t('settings.logout')}
                </button>
              </div>
            </div>
          )}

          {isMobile && !showSidebar && (
            <div className="settings-mobile-nav">
              <button className="settings-back-btn" onClick={handleBack}>
                ← {t('settings.back')}
              </button>
              <span className="settings-mobile-title">
                {tabs.find(t => t.id === activeTab)?.label}
              </span>
              <button className="settings-mobile-close" onClick={onClose} aria-label={t('common.close', 'Close')}>
                <X size={18} />
              </button>
            </div>
          )}

          <div className={`settings-content ${isMobile && !showSidebar ? 'mobile-full' : ''} ${isMobile && showSidebar ? 'mobile-hidden' : ''}`}>
            {!isMobile && (
              <button className="settings-close" onClick={onClose}>
                <X size={24} />
              </button>
            )}

            {activeTab === 'account' && (
              <div className="settings-section">
                <h2>{t('settings.account')}</h2>
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
                  <label>{t('account.userId')}</label>
                  <input 
                    type="text" 
                    className="input" 
                    value={user?.id || ''}
                    disabled
                  />
                </div>

                <div className="form-group">
                  <label>{t('account.usernameCannotChange')}</label>
                  <input 
                    type="text" 
                    className="input" 
                    value={user?.username || ''}
                    disabled
                  />
                  <small className="form-hint">{t('account.usernameCannotChange')}</small>
                </div>

                <div className="form-group">
                  <label>{t('account.customUsername')}</label>
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
                            setUsernameError(err.response?.data?.error || t('errors.generic'))
                          })
                      }
                    }}
                    placeholder={t('account.customUsernamePlaceholder')}
                  />
                  {usernameError && <span className="error-text">{usernameError}</span>}
                  <small className="form-hint">{t('account.usernameHint')}</small>
                </div>

                <div className="form-group">
                  <label>{t('account.displayName')}</label>
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
                            setDisplayNameError(err.response?.data?.error || t('errors.generic'))
                          })
                      }
                    }}
                    placeholder={t('account.displayNamePlaceholder')}
                  />
                  {displayNameError && <span className="error-text">{displayNameError}</span>}
                  <small className="form-hint">{t('account.displayNameHint')}</small>
                </div>

                <div className="form-group">
                  <label>{t('account.email')}</label>
                  <input 
                    type="email" 
                    className="input" 
                    value={user?.email || ''}
                    disabled
                  />
                </div>

                <div className="form-group">
                  <label>{t('account.bio')}</label>
                  <div className="bio-editor">
                    <div className="bio-editor-tabs">
                      <button 
                        type="button"
                        className={`bio-tab ${!bioPreview ? 'active' : ''}`}
                        onClick={() => setBioPreview(false)}
                      >
                        <Edit2 size={14} /> {t('account.write')}
                      </button>
                      <button 
                        type="button"
                        className={`bio-tab ${bioPreview ? 'active' : ''}`}
                        onClick={() => setBioPreview(true)}
                      >
                        <Eye size={14} /> {t('account.preview')}
                      </button>
                    </div>
                    {bioPreview ? (
                      <div className="bio-preview">
                        {bioValue || user?.bio ? (
                          <MarkdownMessage content={bioValue || user?.bio || ''} />
                        ) : (
                          <span className="bio-preview-empty">{t('account.nothingToPreview')}</span>
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
                        placeholder={t('account.bioPlaceholder')}
                        maxLength={500}
                      />
                    )}
                    <span className="char-count">{(bioValue || user?.bio || '').length}/500</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'language' && (
              <div className="settings-section">
                <h2>{t('settings.language')}</h2>
                <p style={{ marginBottom: '20px', color: 'var(--volt-text-secondary)' }}>
                  {t('settings.selectLanguage')}
                </p>
                
                <div className="language-grid">
                  {availableLanguages.map((lang) => (
                    <button
                      key={lang.code}
                      className={`language-card ${language === lang.code ? 'active' : ''}`}
                      onClick={() => setLanguage(lang.code)}
                    >
                      <span className="language-flag">{lang.flag}</span>
                      <div className="language-info">
                        <span className="language-name">{lang.nativeName}</span>
                        <span className="language-english">{lang.name}</span>
                      </div>
                      {language === lang.code && (
                        <span className="language-check">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="settings-section">
                <h2>{t('settings.notifications')}</h2>
                
                {pushSupported && (
                  <div className="setting-item">
                    <div>
                      <h4>{t('notifications.pushNotifications')}</h4>
                      <p>{t('notifications.pushNotificationsDesc')}</p>
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
                    <h4>{t('notifications.desktopNotifications')}</h4>
                    <p>{t('notifications.desktopNotificationsDesc')}</p>
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
                    <h4>{t('notifications.messageNotifications')}</h4>
                    <p>{t('notifications.messageNotificationsDesc')}</p>
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
                    <h4>{t('notifications.friendRequests')}</h4>
                    <p>{t('notifications.friendRequestsDesc')}</p>
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
                    <h4>{t('notifications.notificationSounds')}</h4>
                    <p>{t('notifications.notificationSoundsDesc')}</p>
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

                <div className="setting-item">
                  <div>
                    <h4>{t('notifications.soundPack', 'Sound Pack')}</h4>
                    <p>{t('notifications.soundPackDescription', 'Choose notification sound style')}</p>
                  </div>
                  <select 
                    className="input"
                    style={{ width: 'auto', minWidth: '150px' }}
                    value={settings.soundpack || 'default'}
                    onChange={(e) => {
                      const pack = e.target.value
                      handleSelect('soundpack', pack)
                      soundService.setSoundpack(pack)
                      if (pack !== 'default') {
                        soundService._preloadSounds(pack)
                      }
                    }}
                    >
                      <option value="default">{t('notifications.defaultSoundpack', 'Default (Generated)')}</option>
                      <option value="classic">{t('notifications.classicSoundpack', 'Enclica Messenger')}</option>
                    </select>
                  </div>

                  {settings.soundpack && settings.soundpack !== 'default' && (
                    <>
                      <div className="setting-item">
                        <div>
                          <h4>{t('notifications.soundPackVolume')}</h4>
                          <p>{t('notifications.soundPackVolumeDesc', 'Adjust volume for sound pack')}</p>
                        </div>
                        <div className="volume-control">
                          <input 
                            type="range" 
                            min="0" 
                            max="100" 
                            value={settings.soundpackVolume || 100}
                            onChange={(e) => {
                              const vol = parseInt(e.target.value)
                              handleSelect('soundpackVolume', vol)
                              soundService.setSoundpackVolume(vol)
                            }}
                            className="volume-slider"
                          />
                          <span className="volume-value">{settings.soundpackVolume || 100}%</span>
                        </div>
                      </div>

                      <div className="soundpack-previews">
                        <h4>{t('notifications.soundPreviews')}</h4>
                        <div className="sound-preview-grid">
                          {[
                            { key: 'messageReceived', label: t('notifications.soundMessage', 'Message') },
                            { key: 'mention', label: t('notifications.soundMention', 'Mention') },
                            { key: 'callJoin', label: t('notifications.soundFriendCall', 'Friend Call') },
                            { key: 'userJoined', label: t('notifications.soundVoiceJoin', 'Voice Join') },
                            { key: 'userLeft', label: t('notifications.soundVoiceLeave', 'Voice Leave') },
                            { key: 'ringtone', label: t('notifications.soundRingtone', 'Ringtone') },
                            { key: 'welcome', label: t('notifications.soundWelcome', 'Welcome') },
                            { key: 'logout', label: t('common.logout') }
                          ].map(sound => (
                          <div key={sound.key} className="sound-preview-item">
                            <span className="sound-preview-label">{sound.label}</span>
                            <button 
                              className={`btn btn-icon ${previewingSound === sound.key ? 'btn-primary' : 'btn-secondary'}`}
                              onClick={() => {
                                if (previewingSound === sound.key) {
                                  setPreviewingSound(null)
                                } else {
                                  setPreviewingSound(sound.key)
                                  soundService.previewSound(sound.key)
                                  setTimeout(() => setPreviewingSound(null), 2000)
                                }
                              }}
                              disabled={previewingSound && previewingSound !== sound.key}
                            >
                              {previewingSound === sound.key ? <Pause size={14} /> : <Play size={14} />}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'voice' && (
              <div className="settings-section">
                <h2>{t('settings.voice')}</h2>
                
                <div className="voice-settings-group">
                  <h3><Mic size={18} /> {t('voice.voiceSettings')}</h3>
                  
                  {!permissionsGranted && devices.audio.length === 0 && (
                    <div className="permission-notice">
                      <p>{t('voice.grantMicAccess')}</p>
                      <button className="btn btn-secondary btn-sm" onClick={requestPermissions}>
                        <Mic size={14} /> {t('voice.allowAccess')}
                      </button>
                    </div>
                  )}
                  
                  <div className="form-group">
                    <label>{t('voice.inputDevice')}</label>
                    <select 
                      className="input"
                      value={settings.inputDevice}
                      onChange={(e) => handleSelect('inputDevice', e.target.value)}
                    >
                      <option value="default">{t('voice.defaultMicrophone')}</option>
                      {devices.audio.map(d => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Microphone (${d.deviceId.slice(0, 8)}...)`}
                        </option>
                      ))}
                    </select>
                    {devices.audio.length > 0 && (
                      <span className="device-count">{devices.audio.length} {t('voice.devicesDetected')}</span>
                    )}
                  </div>

                  <div className="setting-item">
                    <div>
                      <h4>{t('voice.inputVolume')}</h4>
                      <p>{t('voice.inputVolumeDesc', 'Adjust your microphone volume')}</p>
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
                    <label>{t('voice.outputDevice')}</label>
                    <select 
                      className="input"
                      value={settings.outputDevice}
                      onChange={(e) => handleSelect('outputDevice', e.target.value)}
                    >
                      <option value="default">{t('voice.defaultSpeaker')}</option>
                      {devices.output.map(d => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Speaker (${d.deviceId.slice(0, 8)}...)`}
                        </option>
                      ))}
                    </select>
                    {devices.output.length > 0 && (
                      <span className="device-count">{devices.output.length} {t('voice.devicesDetected')}</span>
                    )}
                  </div>

                  <div className="setting-item">
                    <div>
                      <h4>{t('voice.outputVolume')}</h4>
                      <p>{t('voice.outputVolumeDesc', 'Adjust your output volume')}</p>
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
                      <h4>{t('voice.muteAll')}</h4>
                      <p>{t('voice.muteAllDesc', 'Mute all voice channels')}</p>
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
                    <h4>{t('voice.microphoneTest')}</h4>
                    <p>{t('voice.microphoneTestDesc') || 'Test your microphone to make sure it\'s working'}</p>
                    {micError && <div className="test-error">{micError}</div>}
                    <div className="mic-test-controls">
                      <button 
                        className={`btn ${testingMic ? 'btn-danger' : 'btn-primary'}`}
                        onClick={testingMic ? stopMicTest : startMicTest}
                      >
                        {testingMic ? <><MicOff size={16} /> {t('voice.stopTest')}</> : <><Mic size={16} /> {t('voice.testMicrophone')}</>}
                      </button>
                    </div>
                    {testingMic && (
                      <div className="mic-level-container">
                        <span className="mic-level-label">{t('voice.inputLevel')}</span>
                        <div className="mic-level-bar">
                          <div className="mic-level-fill" style={{ width: `${micLevel}%` }} />
                        </div>
                        <span className="mic-level-value">{Math.round(micLevel)}%</span>
                      </div>
                    )}
                    {testingMic && (
                      <p className="test-hint">{t('voice.speakToSeeLevel')}</p>
                    )}
                  </div>
                </div>

                <div className="voice-settings-group">
                  <h3><Video size={18} /> {t('voice.videoSettings')}</h3>
                  
                  <div className="form-group">
                    <label>{t('voice.camera')}</label>
                    <select 
                      className="input"
                      value={settings.videoDevice}
                      onChange={(e) => handleSelect('videoDevice', e.target.value)}
                    >
                      <option value="default">{t('voice.defaultCamera')}</option>
                      {devices.video.map(d => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Camera (${d.deviceId.slice(0, 8)}...)`}
                        </option>
                      ))}
                    </select>
                    {devices.video.length > 0 && (
                      <span className="device-count">{devices.video.length} {t('voice.devicesDetected')}</span>
                    )}
                  </div>

                  <div className="camera-test-section">
                    <h4>{t('voice.cameraPreview')}</h4>
                    <p>{t('voice.cameraPreviewDesc') || 'Test your camera to make sure it\'s working'}</p>
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
                          <span>{t('voice.cameraPreviewOff')}</span>
                          <span className="preview-hint">{t('voice.clickToStart')}</span>
                        </div>
                      )}
                    </div>
                    <button 
                      className={`btn ${testingCamera ? 'btn-danger' : 'btn-primary'}`}
                      onClick={testingCamera ? stopCameraTest : startCameraTest}
                    >
                      {testingCamera ? <><VideoOff size={16} /> {t('voice.stopPreview')}</> : <><Video size={16} /> {t('voice.startCameraPreview')}</>}
                    </button>
                  </div>
                </div>

                <div className="voice-settings-group">
                  <h3><Monitor size={18} /> {t('voice.advanced')}</h3>

                  <div className="setting-item">
                    <div>
                      <h4>{t('voice.noiseSuppression')}</h4>
                      <p>{t('voice.noiseSuppressionDesc')}</p>
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
                      <h4>{t('voice.echoCancellation')}</h4>
                      <p>{t('voice.echoCancellationDesc')}</p>
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
                      <h4>{t('voice.autoGainControl')}</h4>
                      <p>{t('voice.autoGainControlDesc')}</p>
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
                <h2>{t('settings.privacy')}</h2>
                <p style={{marginBottom: '20px', color: 'var(--volt-text-secondary)'}}>
                  {t('privacy.description')}
                </p>
                
                <div className="privacy-note">
                  <h4>{t('privacy.directMessages')}</h4>
                  <p>{t('privacy.dmDesc')}</p>
                  <select 
                    className="input"
                    value={settings.dmPermissions}
                    onChange={(e) => handleSelect('dmPermissions', e.target.value)}
                  >
                    <option value="everyone">{t('privacy.everyone')}</option>
                    <option value="friends">{t('privacy.friendsOnly')}</option>
                    <option value="nobody">{t('privacy.nobody')}</option>
                  </select>
                </div>
              </div>
            )}

            {activeTab === 'age' && (
              <div className="settings-section">
                <h2>{t('settings.age')}</h2>
                <p style={{ marginBottom: '16px', color: 'var(--volt-text-secondary)' }}>
                  {t('age.description')}
                </p>

                {ageLoading ? (
                  <div className="privacy-note">{t('age.loading')}</div>
                ) : (
                  <div className="privacy-note">
                    <h4>{t('age.status')}</h4>
                    <p>{ageInfo?.verified ? t('age.verified') : t('age.notVerified')}</p>
                    {ageInfo && (
                      <div className="age-meta">
                        <div><strong>{t('age.category')}:</strong> {ageInfo.category || t('age.unknown')}</div>
                        <div><strong>{t('age.method')}:</strong> {ageInfo.method || t('age.unknown')}</div>
                        <div><strong>{t('age.verifiedAt')}:</strong> {ageInfo.verifiedAt ? new Date(ageInfo.verifiedAt).toLocaleString() : '—'}</div>
                        <div><strong>{t('age.expiresAt')}:</strong> {ageInfo.expiresAt ? new Date(ageInfo.expiresAt).toLocaleString() : '—'}</div>
                        <div><strong>{t('age.estimatedAge')}:</strong> {ageInfo.estimatedAge ?? '—'}</div>
                      </div>
                    )}
                    {ageError && <div className="test-error" style={{ marginTop: 8 }}>{ageError}</div>}
                    <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary" onClick={() => { setShowAgeVerify(true); setAgeError('') }}>
                        {t('age.rerunVerification')}
                      </button>
                      <button className="btn btn-secondary" onClick={loadAgeInfo}>
                        {t('age.refresh')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="settings-section">
                <h2>{t('appearance.title')}</h2>
                <p className="theme-description">{t('appearance.description')}</p>
                <div className="theme-grid">
                  {allThemes.map(themeOption => (
                    <button
                      key={themeOption.id}
                      className={`theme-card ${theme === themeOption.id ? 'active' : ''}`}
                      onClick={() => setTheme(themeOption.id)}
                      aria-label={t('appearance.applyTheme', 'Apply {{name}} theme', { name: themeOption.name })}
                    >
                      <div className="theme-card-preview" style={{ background: getThemePreviewBackground(themeOption) }}>
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
                        <div className="theme-name">{themeOption.name}</div>
                        <div className="theme-mode">
                          {themeOption.isCustom
                            ? t('appearance.custom', 'Custom')
                            : themeOption.mode === 'auto'
                              ? t('appearance.system', 'System')
                              : themeOption.mode === 'dark'
                                ? t('appearance.dark', 'Dark')
                                : t('appearance.light', 'Light')}
                        </div>
                      </div>
                      {themeOption.isCustom && (
                        <span
                          className="theme-remove"
                          role="button"
                          tabIndex={0}
                          aria-label={t('appearance.removeTheme', 'Remove {{name}} theme', { name: themeOption.name })}
                          onClick={(e) => {
                            e.stopPropagation()
                            removeCustomTheme(themeOption.id)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              e.stopPropagation()
                              removeCustomTheme(themeOption.id)
                            }
                          }}
                        >
                          {t('appearance.remove', 'Remove')}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                <div className="divider" />

                <div className="theme-customizer">
                  <h3>{t('appearance.customTheme', 'Custom Theme')}</h3>
                  <p className="theme-customizer-desc">{t('appearance.customThemeDesc', 'Create your own palette and optionally add a background gradient.')}</p>

                  <div className="form-grid">
                    <div className="form-group">
                      <label>{t('appearance.themeName', 'Name')}</label>
                      <input
                        type="text"
                        className="input"
                        value={customThemeDraft.name}
                        onChange={(e) => setCustomThemeDraft(p => ({ ...p, name: e.target.value }))}
                        placeholder={t('appearance.themeNamePlaceholder', 'My Theme')}
                      />
                    </div>

                    <div className="form-group">
                      <label>{t('appearance.mode', 'Mode')}</label>
                      <select
                        className="input"
                        value={customThemeDraft.mode}
                        onChange={(e) => setCustomThemeDraft(p => ({ ...p, mode: e.target.value }))}
                      >
                        <option value="dark">{t('appearance.dark', 'Dark')}</option>
                        <option value="light">{t('appearance.light', 'Light')}</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-grid">
                    <div className="form-group">
                      <label>{t('appearance.primary', 'Primary')}</label>
                      <div className="color-input-row">
                        <input type="color" className="color-picker" value={customThemeDraft.primary} onChange={(e) => setCustomThemeDraft(p => ({ ...p, primary: e.target.value }))} />
                        <input type="text" className="input" value={customThemeDraft.primary} onChange={(e) => setCustomThemeDraft(p => ({ ...p, primary: e.target.value }))} />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>{t('appearance.success', 'Success')}</label>
                      <div className="color-input-row">
                        <input type="color" className="color-picker" value={customThemeDraft.success} onChange={(e) => setCustomThemeDraft(p => ({ ...p, success: e.target.value }))} />
                        <input type="text" className="input" value={customThemeDraft.success} onChange={(e) => setCustomThemeDraft(p => ({ ...p, success: e.target.value }))} />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>{t('appearance.warning', 'Warning')}</label>
                      <div className="color-input-row">
                        <input type="color" className="color-picker" value={customThemeDraft.warning} onChange={(e) => setCustomThemeDraft(p => ({ ...p, warning: e.target.value }))} />
                        <input type="text" className="input" value={customThemeDraft.warning} onChange={(e) => setCustomThemeDraft(p => ({ ...p, warning: e.target.value }))} />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>{t('appearance.danger', 'Danger')}</label>
                      <div className="color-input-row">
                        <input type="color" className="color-picker" value={customThemeDraft.danger} onChange={(e) => setCustomThemeDraft(p => ({ ...p, danger: e.target.value }))} />
                        <input type="text" className="input" value={customThemeDraft.danger} onChange={(e) => setCustomThemeDraft(p => ({ ...p, danger: e.target.value }))} />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>{t('appearance.backgroundPrimary', 'Background (Primary)')}</label>
                      <div className="color-input-row">
                        <input type="color" className="color-picker" value={customThemeDraft.bgPrimary} onChange={(e) => setCustomThemeDraft(p => ({ ...p, bgPrimary: e.target.value }))} />
                        <input type="text" className="input" value={customThemeDraft.bgPrimary} onChange={(e) => setCustomThemeDraft(p => ({ ...p, bgPrimary: e.target.value }))} />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>{t('appearance.backgroundSecondary', 'Background (Secondary)')}</label>
                      <div className="color-input-row">
                        <input type="color" className="color-picker" value={customThemeDraft.bgSecondary} onChange={(e) => setCustomThemeDraft(p => ({ ...p, bgSecondary: e.target.value }))} />
                        <input type="text" className="input" value={customThemeDraft.bgSecondary} onChange={(e) => setCustomThemeDraft(p => ({ ...p, bgSecondary: e.target.value }))} />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>{t('appearance.backgroundTertiary', 'Background (Tertiary)')}</label>
                      <div className="color-input-row">
                        <input type="color" className="color-picker" value={customThemeDraft.bgTertiary} onChange={(e) => setCustomThemeDraft(p => ({ ...p, bgTertiary: e.target.value }))} />
                        <input type="text" className="input" value={customThemeDraft.bgTertiary} onChange={(e) => setCustomThemeDraft(p => ({ ...p, bgTertiary: e.target.value }))} />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>{t('appearance.backgroundQuaternary', 'Background (Quaternary)')}</label>
                      <div className="color-input-row">
                        <input type="color" className="color-picker" value={customThemeDraft.bgQuaternary} onChange={(e) => setCustomThemeDraft(p => ({ ...p, bgQuaternary: e.target.value }))} />
                        <input type="text" className="input" value={customThemeDraft.bgQuaternary} onChange={(e) => setCustomThemeDraft(p => ({ ...p, bgQuaternary: e.target.value }))} />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>{t('appearance.textPrimary', 'Text (Primary)')}</label>
                      <div className="color-input-row">
                        <input type="color" className="color-picker" value={customThemeDraft.textPrimary} onChange={(e) => setCustomThemeDraft(p => ({ ...p, textPrimary: e.target.value }))} />
                        <input type="text" className="input" value={customThemeDraft.textPrimary} onChange={(e) => setCustomThemeDraft(p => ({ ...p, textPrimary: e.target.value }))} />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>{t('appearance.textSecondary', 'Text (Secondary)')}</label>
                      <div className="color-input-row">
                        <input type="color" className="color-picker" value={customThemeDraft.textSecondary} onChange={(e) => setCustomThemeDraft(p => ({ ...p, textSecondary: e.target.value }))} />
                        <input type="text" className="input" value={customThemeDraft.textSecondary} onChange={(e) => setCustomThemeDraft(p => ({ ...p, textSecondary: e.target.value }))} />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>{t('appearance.textMuted', 'Text (Muted)')}</label>
                      <div className="color-input-row">
                        <input type="color" className="color-picker" value={customThemeDraft.textMuted} onChange={(e) => setCustomThemeDraft(p => ({ ...p, textMuted: e.target.value }))} />
                        <input type="text" className="input" value={customThemeDraft.textMuted} onChange={(e) => setCustomThemeDraft(p => ({ ...p, textMuted: e.target.value }))} />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>{t('appearance.border', 'Border')}</label>
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
                      {t('appearance.enableGradient')}
                    </label>

                    {customThemeDraft.gradientEnabled && (
                      <div className="form-grid">
                        <div className="form-group">
                          <label>{t('appearance.gradientAngle', 'Gradient Angle')}</label>
                          <input
                            type="number"
                            className="input"
                            value={customThemeDraft.gradientAngle}
                            onChange={(e) => setCustomThemeDraft(p => ({ ...p, gradientAngle: e.target.value }))}
                          />
                        </div>

                        <div className="form-group">
                          <label>{t('appearance.gradientA', 'Gradient A')}</label>
                          <div className="color-input-row">
                            <input type="color" className="color-picker" value={customThemeDraft.gradientA} onChange={(e) => setCustomThemeDraft(p => ({ ...p, gradientA: e.target.value }))} />
                            <input type="text" className="input" value={customThemeDraft.gradientA} onChange={(e) => setCustomThemeDraft(p => ({ ...p, gradientA: e.target.value }))} />
                          </div>
                        </div>

                        <div className="form-group">
                          <label>{t('appearance.gradientB', 'Gradient B')}</label>
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
                      {t('appearance.saveCustomTheme')}
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
                      {t('appearance.applyLatestCustom')}
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
                <h2>{t('federation.title')}</h2>
                <p className="settings-description">
                  {t('federation.description')}
                </p>
                <FederationPanel />
              </div>
            )}

            {activeTab === 'bots' && (
              <div className="settings-section">
                <h2>{t('bots.title')}</h2>
                <p className="settings-description">
                  {t('bots.description')}
                </p>
                <BotPanel />
              </div>
            )}

            {activeTab === 'serverconfig' && (
              <div className="settings-section">
                <h2>{t('settings.serverconfig')}</h2>
                <p className="settings-description">
                  {t('settings.serverConfigDescription')}
                </p>
                <button 
                  className="btn btn-primary" 
                  onClick={() => setShowAdminConfig(true)}
                >
                  <Settings size={16} /> {t('settings.openServerConfig')}
                </button>
              </div>
            )}

            {activeTab === 'about' && (
              <div className="settings-section">
                <h2>{t('about.title')}</h2>
                <div className="about-info">
                  <div className="about-logo">⚡</div>
                  <h3>VoltChat</h3>
                  <p>{t('about.version')} 1.0.0</p>
                  <p className="about-description">
                    {t('about.description')}
                  </p>
                  <div className="about-tech">
                    <h4>{t('about.technologies')}</h4>
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
