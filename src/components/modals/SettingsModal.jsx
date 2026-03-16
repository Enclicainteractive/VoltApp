import React, { useState, useEffect, useRef } from 'react'
import { XMarkIcon, UserIcon, BellIcon, ShieldCheckIcon, MicrophoneIcon, VideoCameraIcon, VideoCameraSlashIcon, ComputerDesktopIcon, EyeIcon, PencilIcon, ServerIcon, SparklesIcon, PlayIcon, PauseIcon, SpeakerWaveIcon, Cog6ToothIcon, ArrowDownTrayIcon, ArrowUpTrayIcon, KeyIcon, RocketLaunchIcon } from "@heroicons/react/24/outline";
import { Camera, ImagePlus, Trash2, X, User, Bell, Volume2, ShieldCheck, Palette, Info, Mic, Video, Monitor, VideoOff, Eye, Pencil, Globe, Server, Settings, Sparkles, Play, Pause, Languages, Download, Upload, Key, Wand2, Type, Sliders } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useI18n } from '../../contexts/I18nContext'
import { useE2e } from '../../contexts/E2eContext'
import { useBanner } from '../../hooks/useAvatar'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import { settingsService } from '../../services/settingsService'
import { createVTPPackage, downloadVTPPackage, importVTPPackage, validateThemePackage, exportCurrentTheme } from '../../utils/themePackage'
import { soundService } from '../../services/soundService'
import { pushService } from '../../services/pushService'
import { apiService } from '../../services/apiService'
import { getStoredServer } from '../../services/serverConfig'
import Avatar from '../Avatar'
import MarkdownMessage from '../MarkdownMessage'
import BioEditor from '../BioEditor'
import AgeVerificationModal from './AgeVerificationModal'
import AdminConfigModal from './AdminConfigModal'
import ThemeCustomizer from './ThemeCustomizer'
import FontSelector from './FontSelector'
import AnimationSettings from './AnimationSettings'
import ColorCustomizer from './ColorCustomizer'
import SelfVoltPanel from '../SelfVoltPanel'
import FederationPanel from '../FederationPanel'
import BotPanel from '../BotPanel'
import ActivityAppsPanel from '../ActivityAppsPanel'
import './Modal.css'
import './SettingsModal.css'
import '../../assets/styles/RichTextEditor.css'

const SettingsModal = ({ onClose, initialTab = 'account' }) => {
  const [activeTab, setActiveTab] = useState(initialTab)
  const [isMobile, setIsMobile] = useState(false)
  const [showSidebar, setShowSidebar] = useState(true)
  const { user, logout, refreshUser } = useAuth()
  const { theme, setTheme, allThemes, customThemes, addCustomTheme, removeCustomTheme, saveActiveThemeConfig } = useTheme()
  const { t, language, setLanguage, availableLanguages } = useI18n()
  const { exportAllKeysForBackup, importAllKeysFromBackup, userKeys } = useE2e()
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
  const [ageJurisdictions, setAgeJurisdictions] = useState([])
  const [ageJurisdictionCode, setAgeJurisdictionCode] = useState('GLOBAL')
  const [ageSavingPolicy, setAgeSavingPolicy] = useState(false)
  const [ageLoading, setAgeLoading] = useState(false)
  const [ageError, setAgeError] = useState('')
  const [showAgeVerify, setShowAgeVerify] = useState(false)
  const [myReports, setMyReports] = useState([])
  const [reportsLoading, setReportsLoading] = useState(false)
  const [reportsError, setReportsError] = useState('')
  const [showAdminConfig, setShowAdminConfig] = useState(false)
  const [bioPreview, setBioPreview] = useState(false)
  const [bioValue, setBioValue] = useState('')
  const [usernameValue, setUsernameValue] = useState('')
  const [displayNameValue, setDisplayNameValue] = useState('')
  const [accountAvatarPreview, setAccountAvatarPreview] = useState('')
  const [accountBannerPreview, setAccountBannerPreview] = useState('')
  const [profileMediaError, setProfileMediaError] = useState('')
  const [savingAvatar, setSavingAvatar] = useState(false)
  const [savingBanner, setSavingBanner] = useState(false)
  const [birthDateValue, setBirthDateValue] = useState('')
  const [birthDateError, setBirthDateError] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [displayNameError, setDisplayNameError] = useState('')
  const [pushSupported, setPushSupported] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [previewingSound, setPreviewingSound] = useState(null)
  const [backupPassword, setBackupPassword] = useState('')
  const [backupConfirmPassword, setBackupConfirmPassword] = useState('')
  const [backupError, setBackupError] = useState('')
  const [backupSuccess, setBackupSuccess] = useState('')
  const [restorePassword, setRestorePassword] = useState('')
  const [restoreError, setRestoreError] = useState('')
  const [restoreSuccess, setRestoreSuccess] = useState('')
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [showThemeCustomizer, setShowThemeCustomizer] = useState(false)
  const [showFontModal, setShowFontModal] = useState(false)
  const [showAnimationModal, setShowAnimationModal] = useState(false)
  const [showProfileCustomModal, setShowProfileCustomModal] = useState(false)
  const micStreamRef = useRef(null)
  const cameraStreamRef = useRef(null)
  const videoPreviewRef = useRef(null)
  const avatarInputRef = useRef(null)
  const bannerInputRef = useRef(null)
  const analyserRef = useRef(null)
  const animationRef = useRef(null)
  const soundPreviewTimeoutRef = useRef(null)

  const [isAdminUser, setIsAdminUser] = useState(false)
  const isDesktopApp = typeof window !== 'undefined' && window.__IS_DESKTOP_APP__ && typeof window.electron?.setDiscordPresence === 'function'
  const soundpackOptions = [
    { value: 'default', label: t('notifications.defaultSoundpack', 'Default (Generated)') },
    { value: 'classic', label: t('notifications.classicSoundpack', 'Enclica Messenger') },
    { value: 'kenney_interface', label: t('notifications.kenneyInterfaceSoundpack', 'Kenney Interface (CC0)') },
    { value: 'button_hitech', label: t('notifications.buttonHitechSoundpack', 'Button Hi-Tech (CC0)') },
    { value: 'owlish', label: t('notifications.owlishSoundpack', 'Owlish Media (CC0)') },
    { value: 'ui51', label: t('notifications.ui51Soundpack', 'UI SFX Set (CC0)') },
    { value: 'digital63', label: t('notifications.digital63Soundpack', 'Digital SFX Set (CC0)') },
    { value: 'retro512', label: t('notifications.retro512Soundpack', 'Retro 512 (CC0)') },
    { value: 'rpg50', label: t('notifications.rpg50Soundpack', 'RPG 50 (CC0)') },
    { value: 'kenney_interface_alt1', label: t('notifications.kenneyInterfaceAlt1Soundpack', 'Kenney Interface Alt 1 (CC0)') },
    { value: 'kenney_interface_alt2', label: t('notifications.kenneyInterfaceAlt2Soundpack', 'Kenney Interface Alt 2 (CC0)') },
    { value: 'button_hitech_alt', label: t('notifications.buttonHitechAltSoundpack', 'Button Hi-Tech Alt (CC0)') },
    { value: 'owlish_ui', label: t('notifications.owlishUiSoundpack', 'Owlish UI Alt (CC0)') },
    { value: 'owlish_scifi', label: t('notifications.owlishScifiSoundpack', 'Owlish Sci-Fi Alt (CC0)') },
    { value: 'ui51_alt', label: t('notifications.ui51AltSoundpack', 'UI SFX Set Alt (CC0)') },
    { value: 'digital63_alt', label: t('notifications.digital63AltSoundpack', 'Digital SFX Alt (CC0)') },
    { value: 'retro512_alt1', label: t('notifications.retro512Alt1Soundpack', 'Retro 512 Alt 1 (CC0)') },
    { value: 'retro512_alt2', label: t('notifications.retro512Alt2Soundpack', 'Retro 512 Alt 2 (CC0)') },
    { value: 'rpg50_alt', label: t('notifications.rpg50AltSoundpack', 'RPG 50 Alt (CC0)') }
  ]
  const prettifySoundKey = (key) => (
    key
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/^./, (char) => char.toUpperCase())
  )

  const previewLabelByKey = {
    messageReceived: t('notifications.soundMessage', 'Message'),
    mention: t('notifications.soundMention', 'Mention'),
    callJoin: t('notifications.soundFriendCall', 'Friend Call'),
    userJoined: t('notifications.soundVoiceJoin', 'Voice Join'),
    userLeft: t('notifications.soundVoiceLeave', 'Voice Leave'),
    ringtone: t('notifications.soundRingtone', 'Ringtone'),
    welcome: t('notifications.soundWelcome', 'Welcome'),
    logout: t('common.logout'),
    dmReceived: t('notifications.soundDmReceived', 'DM Received'),
    dmMention: t('notifications.soundDmMention', 'DM Mention'),
    callConnected: t('notifications.soundCallConnected', 'Call Connected'),
    callLeft: t('notifications.soundCallLeft', 'Call Left'),
    callEnded: t('notifications.soundCallEnded', 'Call Ended'),
    callDeclined: t('notifications.soundCallDeclined', 'Call Declined'),
    mute: t('notifications.soundMute', 'Mute'),
    unmute: t('notifications.soundUnmute', 'Unmute'),
    deafen: t('notifications.soundDeafen', 'Deafen'),
    undeafen: t('notifications.soundUndeafen', 'Undeafen'),
    screenShareStart: t('notifications.soundScreenShareStart', 'Screen Share Start'),
    screenShareStop: t('notifications.soundScreenShareStop', 'Screen Share Stop'),
    cameraOn: t('notifications.soundCameraOn', 'Camera On'),
    cameraOff: t('notifications.soundCameraOff', 'Camera Off'),
    voiceKick: t('notifications.soundVoiceKick', 'Voice Kick'),
    serverJoined: t('notifications.soundServerJoined', 'Server Joined'),
    roleAdded: t('notifications.soundRoleAdded', 'Role Added'),
    roleRemoved: t('notifications.soundRoleRemoved', 'Role Removed'),
    notification: t('notifications.soundNotification', 'Notification'),
    error: t('notifications.soundError', 'Error'),
    success: t('notifications.soundSuccess', 'Success'),
    typing: t('notifications.soundTyping', 'Typing')
  }

  const selectedPack = settings.soundpack || 'default'
  const previewSounds = soundService.getPreviewSoundKeys(selectedPack).map((key) => ({
    key,
    label: previewLabelByKey[key] || prettifySoundKey(key)
  }))

  useEffect(() => {
    return () => {
      if (soundPreviewTimeoutRef.current) {
        clearTimeout(soundPreviewTimeoutRef.current)
      }
      if (previewingSound) {
        soundService.stopPreview(previewingSound)
      }
    }
  }, [previewingSound])

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
    warning: 'var(--volt-warning)',
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
  const [importExportLoading, setImportExportLoading] = useState(false)
  const [importExportMessage, setImportExportMessage] = useState({ type: '', text: '' })
  const themeImportInputRef = useRef(null)

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
      // Try to get a stream first - needed for output device labels in Chrome
      let stream = null
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
        stream.getTracks().forEach(t => t.stop())
      } catch (permErr) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          stream.getTracks().forEach(t => t.stop())
        } catch (e) {
          console.log('[Settings] Could not get media permissions for device enumeration')
        }
      }
      
      const deviceList = await navigator.mediaDevices.enumerateDevices()
      
      const outputDevices = deviceList.filter(d => d.kind === 'audiooutput')
      
      console.log('[Settings] Found output devices:', outputDevices.length)
      console.log('[Settings] Output device labels:', outputDevices.map(d => d.label))
      
      setDevices({
        audio: deviceList.filter(d => d.kind === 'audioinput'),
        video: deviceList.filter(d => d.kind === 'videoinput'),
        output: outputDevices.length > 0 ? outputDevices : [{ deviceId: 'default', label: 'System Default', kind: 'audiooutput' }]
      })
    } catch (err) {
      console.error('[Settings] Failed to enumerate devices:', err)
      setDevices({
        audio: [],
        video: [],
        output: [{ deviceId: 'default', label: 'System Default', kind: 'audiooutput' }]
      })
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
    // Request permissions first to get device labels, then enumerate
    const initDevices = async () => {
      try {
        // Request audio permission first
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
        stream.getTracks().forEach(t => t.stop())
        setPermissionsGranted(true)
      } catch (err) {
        console.log('[Settings] Could not get all permissions:', err.message)
        try {
          // Try audio only
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true })
          audioStream.getTracks().forEach(t => t.stop())
        } catch (e) {
          console.log('[Settings] Could not get audio permission')
        }
      }
      
      // Now enumerate devices with permissions granted
      await enumerateDevices()
    }
    
    initDevices()
    
    // Listen for device changes
    navigator.mediaDevices?.addEventListener('devicechange', enumerateDevices)
    
    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', enumerateDevices)
      stopMicTest()
      stopCameraTest()
    }
  }, [])

  // If a previously saved device disappears, fall back to default to avoid broken audio routing.
  useEffect(() => {
    if (!devices.output?.length) return
    const outputIds = new Set(devices.output.map(d => d.deviceId))
    if (settings.outputDevice && settings.outputDevice !== 'default' && !outputIds.has(settings.outputDevice)) {
      handleSelect('outputDevice', 'default')
    }
  }, [devices.output, settings.outputDevice])

  useEffect(() => {
    if (user) {
      setUsernameValue(user.customUsername || '')
      setDisplayNameValue(user.displayName || '')
      setBirthDateValue(user.birthDate || '')
      setAccountAvatarPreview(user.avatar || '')
    }
  }, [user])

  useEffect(() => {
    setAccountBannerPreview(bannerSrc || '')
  }, [bannerSrc])

  useEffect(() => {
    const initPush = async () => {
      const supported = pushService.isSupported()
      setPushSupported(supported)
      
      if (supported) {
        const subscription = await pushService.getSubscription()
        const hasSubscription = !!subscription
        setPushEnabled(hasSubscription)
        if (settings.pushNotifications && !hasSubscription) {
          setSettings(prev => {
            const next = { ...prev, pushNotifications: false }
            settingsService.saveSettings(next)
            return next
          })
        }
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
        setMicError('Mic access denied. Please allow microphone access in your browser.')
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
    { id: 'voice', label: t('settings.voice'), icon: SpeakerWaveIcon },
    { id: 'privacy', label: t('settings.privacy'), icon: ShieldCheck },
    { id: 'reports', label: t('settings.reports', 'My Reports'), icon: ShieldCheck },
    { id: 'age', label: t('settings.age'), icon: ShieldCheck },
    { id: 'selfvolt', label: t('settings.selfvolt'), icon: Globe },
    { id: 'federation', label: t('settings.federation'), icon: Globe, adminOnly: true },
    { id: 'bots', label: t('settings.bots'), icon: SparklesIcon },
    { id: 'apps', label: t('settings.apps', 'Apps'), icon: RocketLaunchIcon },
    { id: 'serverconfig', label: t('settings.serverconfig'), icon: Settings, adminOnly: true },
    { id: 'customization', label: 'Customization', icon: Wand2 },
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
      setAgeJurisdictions(Array.isArray(res.data?.jurisdictions) ? res.data.jurisdictions : [])
      setAgeJurisdictionCode(res.data?.jurisdictionCode || res.data?.ageVerification?.jurisdictionCode || 'GLOBAL')
    } catch (err) {
      setAgeError(err?.response?.data?.error || 'Failed to load age verification status')
    }
    setAgeLoading(false)
  }

  const handleAgeJurisdictionChange = async (jurisdictionCode) => {
    setAgeJurisdictionCode(jurisdictionCode)
    setAgeSavingPolicy(true)
    setAgeError('')
    try {
      const res = await apiService.setAgeVerificationJurisdiction(jurisdictionCode)
      setAgeInfo(res.data?.ageVerification || null)
      setAgeJurisdictions(Array.isArray(res.data?.jurisdictions) ? res.data.jurisdictions : ageJurisdictions)
      setAgeJurisdictionCode(res.data?.jurisdictionCode || jurisdictionCode)
      await refreshUser?.()
    } catch (err) {
      setAgeError(err?.response?.data?.error || 'Failed to update age verification policy')
    } finally {
      setAgeSavingPolicy(false)
    }
  }

  const handleAgeSelfAttest = async () => {
    setAgeSavingPolicy(true)
    setAgeError('')
    try {
      const res = await apiService.selfAttestAgeVerification({ device: 'web' })
      setAgeInfo(res.data?.ageVerification || null)
      await refreshUser?.()
    } catch (err) {
      setAgeError(err?.response?.data?.error || 'Failed to save self-attestation')
    } finally {
      setAgeSavingPolicy(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'age') {
      loadAgeInfo()
    }
  }, [activeTab])

  const loadMyReports = async () => {
    setReportsLoading(true)
    setReportsError('')
    try {
      const res = await apiService.getMySafetyReports({ limit: 100 })
      setMyReports(Array.isArray(res.data) ? res.data : [])
    } catch (err) {
      setReportsError(err?.response?.data?.error || 'Failed to load your reports')
    } finally {
      setReportsLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'reports') {
      loadMyReports()
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

      if (['font', 'animationSpeed', 'entranceAnimation', 'exitAnimation', 'smoothTransitions', 'reducedMotion'].includes(key)) {
        const vars = {
          '--volt-animation-speed': newSettings.animationSpeed || 'normal',
          '--volt-entrance-animation': newSettings.entranceAnimation || 'fade',
          '--volt-exit-animation': newSettings.exitAnimation || 'fade-out',
          '--volt-smooth-transitions': newSettings.smoothTransitions !== false ? '1' : '0',
          '--volt-reduced-motion': newSettings.reducedMotion ? '1' : '0',
        }

        saveActiveThemeConfig({
          id: theme,
          font: newSettings.font || 'default',
          vars,
        })
      }
      return newSettings
    })
  }

  const handleOutputDeviceChange = async (value) => {
    if (!value || value === 'default') {
      handleSelect('outputDevice', 'default')
      return
    }

    const trySetSink = async (deviceId) => {
      const probe = document.createElement('audio')
      if (!probe.setSinkId) return { ok: false, reason: 'unsupported' }
      try {
        await probe.setSinkId(deviceId)
        return { ok: true, deviceId }
      } catch (err) {
        return { ok: false, reason: err?.name || 'error', error: err }
      }
    }

    let resolvedDeviceId = value
    let sinkTest = await trySetSink(resolvedDeviceId)

    if (!sinkTest.ok && typeof navigator.mediaDevices?.selectAudioOutput === 'function') {
      try {
        const selected = await navigator.mediaDevices.selectAudioOutput({ deviceId: value })
        if (selected?.deviceId) {
          resolvedDeviceId = selected.deviceId
          sinkTest = await trySetSink(resolvedDeviceId)
        }
      } catch (err) {
        console.warn('[Settings] selectAudioOutput failed:', err?.name || err)
      }
    }

    if (!sinkTest.ok) {
      console.warn('[Settings] Output device selection failed, falling back to default:', value, sinkTest.reason)
      handleSelect('outputDevice', 'default')
      return
    }

    handleSelect('outputDevice', resolvedDeviceId)
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

  const readImageFile = (file, maxBytes, onLoad) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setProfileMediaError('Please select an image file.')
      return
    }
    if (file.size > maxBytes) {
      setProfileMediaError(maxBytes > 2 * 1024 * 1024 ? 'Avatar images must be less than 2MB.' : 'Banner images must be less than 10MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = (event) => {
      setProfileMediaError('')
      onLoad(String(event.target?.result || ''))
    }
    reader.readAsDataURL(file)
  }

  const handleSettingsAvatarUpload = async (event) => {
    const file = event.target.files?.[0]
    readImageFile(file, 2 * 1024 * 1024, async (dataUrl) => {
      setSavingAvatar(true)
      try {
        const response = await apiService.uploadAvatar(dataUrl)
        const avatar = response.data?.avatar || dataUrl
        setAccountAvatarPreview(avatar)
      } catch (err) {
        console.error('Failed to upload avatar:', err)
        try {
          await apiService.updateProfile({ avatar: dataUrl })
          setAccountAvatarPreview(dataUrl)
        } catch (fallbackErr) {
          console.error('Failed to save avatar fallback:', fallbackErr)
          setProfileMediaError(fallbackErr?.response?.data?.error || 'Failed to update avatar.')
        }
      } finally {
        await refreshUser?.()
        setSavingAvatar(false)
        event.target.value = ''
      }
    })
  }

  const handleSettingsBannerUpload = async (event) => {
    const file = event.target.files?.[0]
    readImageFile(file, 10 * 1024 * 1024, async (dataUrl) => {
      setSavingBanner(true)
      try {
        await apiService.updateProfile({ banner: dataUrl })
        setAccountBannerPreview(dataUrl)
        await refreshUser?.()
      } catch (err) {
        console.error('Failed to update banner:', err)
        setProfileMediaError(err?.response?.data?.error || 'Failed to update banner.')
      } finally {
        setSavingBanner(false)
        event.target.value = ''
      }
    })
  }

  const handleSettingsAvatarRemove = async () => {
    setSavingAvatar(true)
    try {
      await apiService.deleteAvatar()
      setAccountAvatarPreview('')
    } catch (err) {
      console.error('Failed to remove avatar:', err)
      try {
        await apiService.updateProfile({ avatar: null })
        setAccountAvatarPreview('')
      } catch (fallbackErr) {
        console.error('Failed to remove avatar fallback:', fallbackErr)
        setProfileMediaError(fallbackErr?.response?.data?.error || 'Failed to remove avatar.')
      }
    } finally {
      await refreshUser?.()
      setSavingAvatar(false)
    }
  }

  const handleSettingsBannerRemove = async () => {
    setSavingBanner(true)
    try {
      await apiService.updateProfile({ banner: null })
      setAccountBannerPreview('')
      await refreshUser?.()
    } catch (err) {
      console.error('Failed to remove banner:', err)
      setProfileMediaError(err?.response?.data?.error || 'Failed to remove banner.')
    } finally {
      setSavingBanner(false)
    }
  }

  const handleExportKeys = async () => {
    setBackupError('')
    setBackupSuccess('')
    
    if (!backupPassword) {
      setBackupError(t('settings.backup.passwordRequired') || 'Password is required')
      return
    }
    
    if (backupPassword.length < 8) {
      setBackupError(t('settings.backup.passwordMinLength') || 'Password must be at least 8 characters')
      return
    }
    
    if (backupPassword !== backupConfirmPassword) {
      setBackupError(t('settings.backup.passwordMismatch') || 'Passwords do not match')
      return
    }
    
    setIsBackingUp(true)
    
    try {
      const backupData = await exportAllKeysForBackup(backupPassword)
      
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `voltchat-keys-backup-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      setBackupSuccess(t('settings.backup.exportSuccess') || 'Keys exported successfully!')
      setBackupPassword('')
      setBackupConfirmPassword('')
    } catch (err) {
      setBackupError(err.message || 'Failed to export keys')
    } finally {
      setIsBackingUp(false)
    }
  }

  const handleImportKeys = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    
    setRestoreError('')
    setRestoreSuccess('')
    
    if (!restorePassword) {
      setRestoreError(t('settings.backup.passwordRequired') || 'Password is required')
      event.target.value = ''
      return
    }
    
    setIsRestoring(true)
    
    try {
      const text = await file.text()
      const backupData = JSON.parse(text)
      
      const result = await importAllKeysFromBackup(backupData, restorePassword)
      
      if (result.success) {
        setRestoreSuccess(t('settings.backup.importSuccess') || 'Keys imported successfully! Please restart the app.')
        setRestorePassword('')
      } else {
        setRestoreError(result.error || 'Failed to import keys')
      }
    } catch (err) {
      setRestoreError(err.message || 'Invalid backup file')
    } finally {
      setIsRestoring(false)
      event.target.value = ''
    }
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
                    <XMarkIcon size={18} />
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
                <XMarkIcon size={18} />
              </button>
            </div>
          )}

          <div className={`settings-content ${isMobile && !showSidebar ? 'mobile-full' : ''} ${isMobile && showSidebar ? 'mobile-hidden' : ''}`}>
            {!isMobile && (
              <button className="settings-close" onClick={onClose}>
                <XMarkIcon size={24} />
              </button>
            )}

            {activeTab === 'account' && (
              <div className="settings-section">
                <h2>{t('settings.account')}</h2>
                <div className="user-profile-card">
                  <div 
                    className="user-banner"
                    style={accountBannerPreview ? {
                      backgroundImage: `url(${accountBannerPreview})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center'
                    } : {}}
                  >
                    <div className="account-media-actions banner">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => bannerInputRef.current?.click()} disabled={savingBanner}>
                        <ImagePlus size={14} /> {savingBanner ? 'Saving...' : 'Change Banner'}
                      </button>
                      {accountBannerPreview ? (
                        <button type="button" className="btn btn-danger btn-sm" onClick={handleSettingsBannerRemove} disabled={savingBanner}>
                          <Trash2 size={14} /> Remove
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <Avatar 
                    src={accountAvatarPreview || user?.avatar}
                    alt={user?.username}
                    fallback={user?.username || user?.email}
                    size={80}
                    className="user-avatar-large"
                    userId={user?.id}
                  />
                  <div className="account-avatar-actions">
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => avatarInputRef.current?.click()} disabled={savingAvatar}>
                      <Camera size={14} /> {savingAvatar ? 'Saving...' : 'Change Avatar'}
                    </button>
                    {(accountAvatarPreview || user?.avatar) ? (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={handleSettingsAvatarRemove} disabled={savingAvatar}>
                        <Trash2 size={14} /> Remove
                      </button>
                    ) : null}
                  </div>
                  <div className="user-info-large">
                    <h3>{user?.displayName || user?.customUsername || user?.username || 'User'}</h3>
                    <p className="user-username">@{user?.customUsername || user?.username}</p>
                    <p className="user-email">{user?.email}</p>
                  </div>
                </div>

                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  style={{ display: 'none' }}
                  onChange={handleSettingsAvatarUpload}
                />
                <input
                  ref={bannerInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  style={{ display: 'none' }}
                  onChange={handleSettingsBannerUpload}
                />

                {profileMediaError ? (
                  <div className="settings-inline-error">{profileMediaError}</div>
                ) : null}

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
                  <label>Birthday</label>
                  <input
                    type="date"
                    className={`input ${birthDateError ? 'input-error' : ''}`}
                    value={birthDateValue}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => {
                      setBirthDateValue(e.target.value)
                      setBirthDateError('')
                    }}
                    onBlur={() => {
                      if (birthDateValue !== (user?.birthDate || '')) {
                        apiService.updateProfile({ birthDate: birthDateValue || null })
                          .then(() => refreshUser?.())
                          .catch(err => {
                            console.error('Failed to update birth date:', err)
                            setBirthDateError(err.response?.data?.error || t('errors.generic'))
                          })
                      }
                    }}
                  />
                  {birthDateError && <span className="error-text">{birthDateError}</span>}
                  <small className="form-hint">Used for age checks and local policy compliance. It does not replace full age verification.</small>
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
                        <PencilIcon size={14} /> {t('account.write')}
                      </button>
                      <button 
                        type="button"
                        className={`bio-tab ${bioPreview ? 'active' : ''}`}
                        onClick={() => setBioPreview(true)}
                      >
                        <EyeIcon size={14} /> {t('account.preview')}
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
                        checked={settings.pushNotifications}
                        onChange={async (e) => {
                          const enable = e.target.checked
                          if (enable) {
                            const permissionGranted = await pushService.ensurePermission()
                            if (!permissionGranted) {
                              console.warn('[Push] Notification permission denied')
                              setSettings(prev => {
                                const next = { ...prev, pushNotifications: false }
                                settingsService.saveSettings(next)
                                return next
                              })
                              return
                            }
                            const registration = await pushService.register()
                            if (registration) {
                              let subscription = await pushService.getSubscription()

                              if (!subscription) {
                                if (registration.isDesktop || window.__IS_DESKTOP_APP__) {
                                  subscription = await pushService.subscribe(registration, '')
                                } else {
                                  const configRes = await apiService.getPushConfig().catch(() => ({ data: { vapidPublicKey: '' } }))
                                  if (configRes.data?.vapidPublicKey) {
                                    subscription = await pushService.subscribe(registration, configRes.data.vapidPublicKey)
                                  }
                                }
                              }

                              if (subscription) {
                                await apiService.subscribePush(subscription).catch(err => console.error('[Push] Subscribe failed:', err))
                                setPushEnabled(true)
                                setSettings(prev => {
                                  const next = { ...prev, pushNotifications: true }
                                  settingsService.saveSettings(next)
                                  return next
                                })
                              } else {
                                setSettings(prev => {
                                  const next = { ...prev, pushNotifications: false }
                                  settingsService.saveSettings(next)
                                  return next
                                })
                              }
                            } else {
                              setSettings(prev => {
                                const next = { ...prev, pushNotifications: false }
                                settingsService.saveSettings(next)
                                return next
                              })
                            }
                          } else {
                            await pushService.unsubscribe()
                            await apiService.unsubscribePush().catch(err => console.error('[Push] Unsubscribe failed:', err))
                            setPushEnabled(false)
                            setSettings(prev => {
                              const next = { ...prev, pushNotifications: false }
                              settingsService.saveSettings(next)
                              return next
                            })
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
                        onChange={async () => {
                          const nextEnabled = !settings.notifications
                          if (nextEnabled) {
                            await pushService.ensurePermission()
                          }
                          handleToggle('notifications')
                        }}
                      />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                {isDesktopApp && (
                  <div className="setting-item">
                    <div>
                      <h4>{t('notifications.discordRichPresence', 'Discord Rich Presence')}</h4>
                      <p>{t('notifications.discordRichPresenceDesc', 'Show your Volt username and status on Discord while the desktop app is open.')}</p>
                    </div>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={settings.discordRichPresence}
                        onChange={() => handleToggle('discordRichPresence')}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                )}

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
                      {soundpackOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
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
                    </>
                  )}

                  <div className="soundpack-previews">
                    <h4>{t('notifications.soundPreviews')}</h4>
                    <div className="sound-preview-grid">
                      {previewSounds.map(sound => (
                        <div key={sound.key} className="sound-preview-item">
                          <span className="sound-preview-label">{sound.label}</span>
                          <button 
                            className={`btn btn-icon ${previewingSound === sound.key ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => {
                              if (soundPreviewTimeoutRef.current) {
                                clearTimeout(soundPreviewTimeoutRef.current)
                                soundPreviewTimeoutRef.current = null
                              }
                              if (previewingSound === sound.key) {
                                soundService.stopPreview(sound.key)
                                setPreviewingSound(null)
                              } else {
                                if (previewingSound) {
                                  soundService.stopPreview(previewingSound)
                                }
                                setPreviewingSound(sound.key)
                                soundService.previewSound(sound.key)
                                soundPreviewTimeoutRef.current = setTimeout(() => {
                                  soundService.stopPreview(sound.key)
                                  setPreviewingSound(null)
                                  soundPreviewTimeoutRef.current = null
                                }, 2000)
                              }
                            }}
                            disabled={previewingSound && previewingSound !== sound.key}
                          >
                            {previewingSound === sound.key ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
              </div>
            )}

            {activeTab === 'voice' && (
              <div className="settings-section">
                <h2>{t('settings.voice')}</h2>
                
                <div className="voice-settings-group">
                  <h3><MicrophoneIcon size={18} /> {t('voice.voiceSettings')}</h3>
                  
                  {!permissionsGranted && devices.audio.length === 0 && (
                    <div className="permission-notice">
                      <p>{t('voice.grantMicAccess')}</p>
                      <button className="btn btn-secondary btn-sm" onClick={requestPermissions}>
                        <MicrophoneIcon size={14} /> {t('voice.allowAccess')}
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
                      <option value="default">{t('voice.defaultMic')}</option>
                      {devices.audio.map(d => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Mic (${d.deviceId.slice(0, 8)}...)`}
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
                      onChange={(e) => handleOutputDeviceChange(e.target.value)}
                      onFocus={() => enumerateDevices()}
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
                        {testingMic ? <><MicrophoneIcon size={16} /> {t('voice.stopTest')}</> : <><MicrophoneIcon size={16} /> {t('voice.testMic')}</>}
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
                  <h3><VideoCameraIcon size={18} /> {t('voice.videoSettings')}</h3>
                  
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
                          <VideoCameraSlashIcon size={48} />
                          <span>{t('voice.cameraPreviewOff')}</span>
                          <span className="preview-hint">{t('voice.clickToStart')}</span>
                        </div>
                      )}
                    </div>
                    <button 
                      className={`btn ${testingCamera ? 'btn-danger' : 'btn-primary'}`}
                      onClick={testingCamera ? stopCameraTest : startCameraTest}
                    >
                      {testingCamera ? <><VideoCameraSlashIcon size={16} /> {t('voice.stopPreview')}</> : <><VideoCameraIcon size={16} /> {t('voice.startCameraPreview')}</>}
                    </button>
                  </div>
                </div>

                <div className="voice-settings-group">
                  <h3><ComputerDesktopIcon size={18} /> {t('voice.advanced')}</h3>

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

                <div className="setting-item" style={{ marginTop: '16px' }}>
                  <div>
                    <h4>NSFW image filter</h4>
                    <p>Blur/block NSFW-flagged images locally on this device.</p>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={!!settings.nsfwImageFilter}
                      onChange={() => handleToggle('nsfwImageFilter')}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                {userKeys && (
                  <div className="privacy-note" style={{ marginTop: '24px', borderTop: '1px solid var(--volt-border)', paddingTop: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                      <Key size={20} />
                      <h4>{t('settings.backup.title') || 'Encryption Key Backup'}</h4>
                    </div>
                    <p style={{ marginBottom: '16px', color: 'var(--volt-text-secondary)', fontSize: '14px' }}>
                      {t('settings.backup.description') || 'Export your encryption keys to a secure backup file. You will need your password to restore them.'}
                    </p>

                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500' }}>
                        {t('settings.backup.password') || 'Backup Password'}
                      </label>
                      <input
                        type="password"
                        className="input"
                        placeholder={t('settings.backup.passwordPlaceholder') || 'Enter a strong password'}
                        value={backupPassword}
                        onChange={(e) => setBackupPassword(e.target.value)}
                        style={{ width: '100%' }}
                      />
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500' }}>
                        {t('settings.backup.confirmPassword') || 'Confirm Password'}
                      </label>
                      <input
                        type="password"
                        className="input"
                        placeholder={t('settings.backup.confirmPasswordPlaceholder') || 'Confirm your password'}
                        value={backupConfirmPassword}
                        onChange={(e) => setBackupConfirmPassword(e.target.value)}
                        style={{ width: '100%' }}
                      />
                    </div>

                    {backupError && (
                      <div className="test-error" style={{ marginBottom: '12px' }}>{backupError}</div>
                    )}
                    {backupSuccess && (
                      <div style={{ marginBottom: '12px', color: 'var(--volt-success)', fontSize: '13px' }}>{backupSuccess}</div>
                    )}

                    <button
                      className="btn btn-primary"
                      onClick={handleExportKeys}
                      disabled={isBackingUp}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      <Download size={16} />
                      {isBackingUp ? (t('settings.backup.exporting') || 'Exporting...') : (t('settings.backup.export') || 'Export Keys')}
                    </button>
                  </div>
                )}

                <div className="privacy-note" style={{ marginTop: '24px', borderTop: '1px solid var(--volt-border)', paddingTop: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <Upload size={20} />
                    <h4>{t('settings.backup.importTitle') || 'Restore Keys from Backup'}</h4>
                  </div>
                  <p style={{ marginBottom: '16px', color: 'var(--volt-text-secondary)', fontSize: '14px' }}>
                    {t('settings.backup.importDescription') || 'Restore your encryption keys from a backup file.'}
                  </p>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500' }}>
                      {t('settings.backup.backupFile') || 'Backup File'}
                    </label>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImportKeys}
                      style={{ width: '100%', padding: '8px', background: 'var(--volt-bg-secondary)', border: '1px solid var(--volt-border)', borderRadius: '4px' }}
                    />
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500' }}>
                      {t('settings.backup.restorePassword') || 'Backup Password'}
                    </label>
                    <input
                      type="password"
                      className="input"
                      placeholder={t('settings.backup.restorePasswordPlaceholder') || 'Enter the password used when creating the backup'}
                      value={restorePassword}
                      onChange={(e) => setRestorePassword(e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>

                  {restoreError && (
                    <div className="test-error" style={{ marginBottom: '12px' }}>{restoreError}</div>
                  )}
                  {restoreSuccess && (
                    <div style={{ marginBottom: '12px', color: 'var(--volt-success)', fontSize: '13px' }}>{restoreSuccess}</div>
                  )}
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
                  <div className="privacy-note age-settings-card">
                    <h4>{t('age.status')}</h4>

                    <div className="age-policy-grid">
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Location policy</label>
                        <select
                          className="input"
                          value={ageJurisdictionCode}
                          onChange={(e) => handleAgeJurisdictionChange(e.target.value)}
                          disabled={ageSavingPolicy}
                        >
                          {(ageJurisdictions.length > 0 ? ageJurisdictions : [{ code: 'GLOBAL', label: 'Other / Not Listed' }]).map((item) => (
                            <option key={item.code} value={item.code}>{item.label}</option>
                          ))}
                        </select>
                      </div>

                      <div className={`age-policy-summary ${ageInfo?.requiresProofVerification ? 'required' : 'optional'}`}>
                        <strong>{ageInfo?.jurisdictionName || 'Other / Not Listed'}</strong>
                        <span>{ageInfo?.policySummary || 'Choose the age-verification policy that applies to your account.'}</span>
                        <span>
                          Policy: {ageInfo?.policyStatus || 'none'} | Minimum age signal: {ageInfo?.minimumAge || 18}+
                        </span>
                      </div>
                    </div>

                    <div className="age-badge-row">
                      <span className={`status-badge ${ageInfo?.adultAccess ? 'online' : ageInfo?.verified && ageInfo?.category === 'child' ? 'offline' : 'idle'}`}>
                        {ageInfo?.adultAccess ? '18+ access granted' : ageInfo?.verified && ageInfo?.category === 'child' ? 'Minor profile' : t('age.notVerified')}
                      </span>
                      <span className={`status-badge ${ageInfo?.riskLevel === 'self_attested_adult' ? 'idle' : ageInfo?.riskLevel === 'none' ? 'online' : 'offline'}`}>
                        {ageInfo?.riskLevel === 'self_attested_adult' ? 'Risky to others' : ageInfo?.riskLevel === 'none' ? 'Trusted verification' : 'Needs verification'}
                      </span>
                    </div>

                    {ageInfo && (
                      <div className="age-meta">
                        <div><strong>{t('age.category')}:</strong> {ageInfo.category || t('age.unknown')}</div>
                        <div><strong>{t('age.method')}:</strong> {ageInfo.method || (ageInfo.selfDeclaredAdult ? 'self_attestation' : t('age.unknown'))}</div>
                        <div><strong>{t('age.verifiedAt')}:</strong> {ageInfo.verifiedAt ? new Date(ageInfo.verifiedAt).toLocaleString() : '—'}</div>
                        <div><strong>Self-attested at:</strong> {ageInfo.selfAttestedAt ? new Date(ageInfo.selfAttestedAt).toLocaleString() : '—'}</div>
                        <div><strong>{t('age.expiresAt')}:</strong> {ageInfo.expiresAt ? new Date(ageInfo.expiresAt).toLocaleString() : '—'}</div>
                        <div><strong>{t('age.estimatedAge')}:</strong> {ageInfo.estimatedAge ?? '—'}</div>
                      </div>
                    )}

                    {ageError && <div className="test-error" style={{ marginTop: 8 }}>{ageError}</div>}
                    <div className="age-actions-row" style={{ marginTop: 12 }}>
                      {!ageInfo?.requiresProofVerification && (
                        <button className="btn btn-secondary" onClick={handleAgeSelfAttest} disabled={ageSavingPolicy}>
                          I'm Over 18
                        </button>
                      )}
                      <button className="btn btn-primary" onClick={() => { setShowAgeVerify(true); setAgeError('') }}>
                        {ageInfo?.verified ? t('age.rerunVerification') : 'Run full verification'}
                      </button>
                      <button className="btn btn-secondary" onClick={loadAgeInfo}>
                        {t('age.refresh')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'reports' && (
              <div className="settings-section">
                <h2>{t('settings.reports', 'My Reports')}</h2>
                <p style={{ marginBottom: '16px', color: 'var(--volt-text-secondary)' }}>
                  Review reports you submitted and see their moderation status.
                </p>

                <div className="setting-item">
                  <div>
                    <h4>Report History</h4>
                    <p>Your reports are metadata-only and do not expose private message plaintext.</p>
                  </div>
                  <button className="btn btn-secondary" onClick={loadMyReports} disabled={reportsLoading}>
                    {reportsLoading ? 'Refreshing...' : 'Refresh'}
                  </button>
                </div>

                {reportsError && <div className="test-error" style={{ marginBottom: 12 }}>{reportsError}</div>}

                {!reportsLoading && (
                  <div className="privacy-note" style={{ marginBottom: 16 }}>
                    <div className="age-meta">
                      <div><strong>Total:</strong> {myReports.length}</div>
                      <div><strong>Open:</strong> {myReports.filter(r => r.status === 'open').length}</div>
                      <div><strong>Resolved:</strong> {myReports.filter(r => r.status === 'resolved').length}</div>
                      <div><strong>Dismissed:</strong> {myReports.filter(r => r.status === 'dismissed').length}</div>
                    </div>
                  </div>
                )}

                {reportsLoading ? (
                  <div className="privacy-note">Loading report history...</div>
                ) : myReports.length === 0 ? (
                  <div className="privacy-note">No reports submitted yet.</div>
                ) : (
                  <div className="settings-report-list">
                    {myReports.map((report) => (
                      <div key={report.id} className="settings-report-item">
                        <div className="settings-report-line">
                          <strong>{report.reportType || 'user_report'}</strong>
                          <span className={`settings-report-status status-${report.status || 'open'}`}>{report.status || 'open'}</span>
                        </div>
                        <div className="settings-report-line mono">id: {report.id}</div>
                        <div className="settings-report-line">
                          context: {report.contextType || 'unknown'} | server: {report.clientMeta?.serverId || 'n/a'} | message: {report.clientMeta?.messageId || 'n/a'}
                        </div>
                        <div className="settings-report-line">
                          reason: {report.clientMeta?.reason || 'n/a'}
                        </div>
                        <div className="settings-report-line">
                          submitted: {report.createdAt ? new Date(report.createdAt).toLocaleString() : 'unknown'}
                        </div>
                        {report.resolvedAt && (
                          <div className="settings-report-line">
                            updated: {new Date(report.resolvedAt).toLocaleString()}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
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

            {activeTab === 'apps' && (
              <div className="settings-section">
                <h2>Activity Apps</h2>
                <p className="settings-description">
                  Create and manage custom activities that can be launched in voice channels.
                </p>
                <ActivityAppsPanel />
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
                  <Cog6ToothIcon size={16} /> {t('settings.openServerConfig')}
                </button>
              </div>
            )}

            {activeTab === 'customization' && (
              <div className="settings-section">
                <h2>Customization</h2>
                <p style={{ color: 'var(--volt-text-secondary)', marginBottom: '24px' }}>
                  Personalize your VoltChat experience with advanced customization options.
                </p>

                <div className="customization-list">
                  <button className="customization-item" onClick={() => setShowThemeCustomizer(true)}>
                    <div className="customization-item-icon">
                      <Palette size={24} />
                    </div>
                    <div className="customization-item-content">
                      <h3>Theme Studio</h3>
                      <p>Create and manage custom themes with full control over colors, fonts, and effects.</p>
                    </div>
                    <div className="customization-item-arrow">›</div>
                  </button>

                  <button className="customization-item" onClick={() => setShowFontModal(true)}>
                    <div className="customization-item-icon">
                      <Type size={24} />
                    </div>
                    <div className="customization-item-content">
                      <h3>Typography</h3>
                      <p>Choose from 20+ fonts to customize your reading experience.</p>
                    </div>
                    <div className="customization-item-arrow">›</div>
                  </button>

                  <button className="customization-item" onClick={() => setShowAnimationModal(true)}>
                    <div className="customization-item-icon">
                      <SparklesIcon size={24} />
                    </div>
                    <div className="customization-item-content">
                      <h3>Animations</h3>
                      <p>Customize modal animations and transition effects.</p>
                    </div>
                    <div className="customization-item-arrow">›</div>
                  </button>

                  <button className="customization-item" onClick={() => setShowProfileCustomModal(true)}>
                    <div className="customization-item-icon">
                      <Sliders size={24} />
                    </div>
                    <div className="customization-item-content">
                      <h3>Profile Customization</h3>
                      <p>Customize your profile appearance, banner effects, and layout.</p>
                    </div>
                    <div className="customization-item-arrow">›</div>
                  </button>
                </div>

                <div className="customization-reset">
                  <button 
                    className="btn btn-secondary"
                    onClick={() => {
                      if (confirm('Reset all customization settings to default?')) {
                        const defaultSettings = {
                          font: 'default',
                          entranceAnimation: 'fade',
                          exitAnimation: 'fade-out',
                          animationSpeed: 'normal',
                          profileLayout: 'standard',
                          bannerEffect: 'none',
                          badgeStyle: 'default',
                        };
                        Object.entries(defaultSettings).forEach(([key, value]) => {
                          handleSelect(key, value);
                        });
                      }
                    }}
                  >
                    Reset Customizations
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'about' && (
              <div className="settings-section">
                <h2>{t('about.title')}</h2>
                <div className="about-info">
                  <div className="about-logo">
                    <img src="/favicon.svg" alt="VoltChat logo" className="about-logo-image" />
                  </div>
                  <h3>VoltChat</h3>
                  <p>{t('about.version')} 1.8.2</p>
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
                      <li>Enhanced Profile System</li>
                      <li>Advanced Theme Customization</li>
                      <li>Modal Animation System</li>
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

    {showThemeCustomizer && (
      <div className="modal-overlay settings-overlay" onClick={() => setShowThemeCustomizer(false)}>
        <div onClick={e => e.stopPropagation()}>
          <ThemeCustomizer 
            onClose={() => setShowThemeCustomizer(false)}
            onSave={(theme) => {
              console.log('Theme saved:', theme);
            }}
          />
        </div>
      </div>
    )}

    {showFontModal && (
      <div className="modal-overlay settings-overlay" onClick={() => setShowFontModal(false)}>
        <div className="font-modal-content" onClick={e => e.stopPropagation()}>
          <div className="simple-modal-header">
            <h3><Type size={20} /> Typography</h3>
            <button className="modal-close-btn" onClick={() => setShowFontModal(false)}>
              <X size={20} />
            </button>
          </div>
          <div className="simple-modal-body">
            <p className="modal-description">Choose a font for your VoltChat interface.</p>
            <FontSelector
              selected={settings.font || 'default'}
              onSelect={(font) => {
                handleSelect('font', font);
              }}
            />
          </div>
        </div>
      </div>
    )}

    {showAnimationModal && (
      <div className="modal-overlay settings-overlay" onClick={() => setShowAnimationModal(false)}>
        <div className="animation-modal-content" onClick={e => e.stopPropagation()}>
          <div className="simple-modal-header">
            <h3><SparklesIcon size={20} /> Animations</h3>
            <button className="modal-close-btn" onClick={() => setShowAnimationModal(false)}>
              <X size={20} />
            </button>
          </div>
          <div className="simple-modal-body">
            <p className="modal-description">Customize modal animations and transition effects.</p>
            <AnimationSettings
              settings={{
                entranceAnimation: settings.entranceAnimation || 'fade',
                exitAnimation: settings.exitAnimation || 'fade-out',
                animationSpeed: settings.animationSpeed || 'normal',
                smoothTransitions: settings.smoothTransitions !== false,
                reducedMotion: settings.reducedMotion || false,
              }}
              onChange={(newSettings) => {
                Object.entries(newSettings).forEach(([key, value]) => {
                  handleSelect(key, value);
                });
              }}
            />
          </div>
        </div>
      </div>
    )}

    {showProfileCustomModal && (
      <div className="modal-overlay settings-overlay" onClick={() => setShowProfileCustomModal(false)}>
        <div className="profile-custom-modal-content" onClick={e => e.stopPropagation()}>
          <div className="simple-modal-header">
            <h3><Sliders size={20} /> Profile Customization</h3>
            <button className="modal-close-btn" onClick={() => setShowProfileCustomModal(false)}>
              <X size={20} />
            </button>
          </div>
          <div className="simple-modal-body">
            <p className="modal-description">Customize your profile appearance.</p>
            <div className="profile-custom-options">
              <div className="form-group">
                <label>Profile Layout</label>
                <select 
                  className="input"
                  value={settings.profileLayout || 'standard'}
                  onChange={(e) => handleSelect('profileLayout', e.target.value)}
                >
                  <option value="standard">Standard</option>
                  <option value="compact">Compact</option>
                  <option value="expanded">Expanded</option>
                  <option value="card">Card</option>
                </select>
              </div>
              <div className="form-group">
                <label>Banner Effect</label>
                <select 
                  className="input"
                  value={settings.bannerEffect || 'none'}
                  onChange={(e) => handleSelect('bannerEffect', e.target.value)}
                >
                  <option value="none">None</option>
                  <option value="gradient-shift">Gradient Shift</option>
                  <option value="pulse">Pulse</option>
                  <option value="wave">Wave</option>
                  <option value="aurora">Aurora</option>
                </select>
              </div>
              <div className="form-group">
                <label>Badge Style</label>
                <select 
                  className="input"
                  value={settings.badgeStyle || 'default'}
                  onChange={(e) => handleSelect('badgeStyle', e.target.value)}
                >
                  <option value="default">Default</option>
                  <option value="glow">Glow</option>
                  <option value="bordered">Bordered</option>
                  <option value="minimal">Minimal</option>
                  <option value="3d">3D</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

export default SettingsModal
