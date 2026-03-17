import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { MicrophoneIcon, MusicalNoteIcon, SpeakerXMarkIcon, Cog6ToothIcon, CogIcon, SpeakerWaveIcon, VideoCameraIcon, VideoCameraSlashIcon, ComputerDesktopIcon, SparklesIcon, PhoneXMarkIcon, LockClosedIcon, ShieldCheckIcon, ShieldExclamationIcon, RocketLaunchIcon, XMarkIcon, ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";
import { Mic, Music, VolumeX, PhoneOff, Settings, Volume2, Video, VideoOff, Monitor, Sparkles, Lock, Shield, ShieldAlert, ShieldCheck, ShieldQuestion, Layers3 } from 'lucide-react'
import { useTranslation } from '../hooks/useTranslation'
import { useSocket } from '../contexts/SocketContext'
import { useAppStore, clearFocusedActivity } from '../store/useAppStore'
import BuiltinActivityHost from '../activities/BuiltinActivityHost'
import { useAuth } from '../contexts/AuthContext'
import { useE2e } from '../contexts/E2eContext'
import { settingsService } from '../services/settingsService'
import { soundService } from '../services/soundService'
import { E2eVoiceVerifier, voiceVerification, VerificationStatus } from '../services/e2eVoiceVerification'
import Avatar from './Avatar'
import VoiceFX from './VoiceFX'
import ScreenSharePicker from './ScreenSharePicker'
import ActivityPicker from './ActivityPicker'
import ActivityStrip from './ActivityStrip'
import ActivityIframe from './ActivityIframe'
import StreamOverlayModal from './StreamOverlayModal'
import { CLIENT_BUILTIN_BY_ID, CLIENT_BUILTIN_ACTIVITIES } from '../activities/builtin/definitions'
import { loadVoiceOverlayState, saveVoiceOverlayState } from '../services/voiceOverlayService'
import VoiceChannelTempChat from './VoiceChannelTempChat'
import { useVoiceTempChat } from '../hooks/useVoiceTempChat'
import { getStoredServer } from '../services/serverConfig'
import '../assets/styles/VoiceChannel.css'
import '../assets/styles/ScreenSharePicker.css'

// Fallback ICE servers used ONLY before the server provides its list.
// IMPORTANT: Only STUN servers here - no TURN credentials.
// TURN servers require matching credentials on both peers to relay traffic.
// If peer A uses fallback TURN and peer B uses server TURN, they get different
// relay addresses and can never connect via TURN. STUN is credential-free so
// it works regardless of which list each peer uses.
// Once the server sends its ICE servers (via voice:participants), we use ONLY
// those for all subsequent peer connections - ensuring all peers use the same
// TURN credentials and can relay through the same server.
const FALLBACK_ICE_SERVERS = [
  // Self-hosted STUN (volt.voltagechat.app)
  { urls: 'stun:volt.voltagechat.app:32768' },
  
  // Google's STUN servers - most reliable public STUN (credential-free)
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  
  // Additional reliable public STUN servers (credential-free)
  { urls: 'stun:stun.ekiga.net' },
  { urls: 'stun:stun.xten.com' },
  // NOTE: No TURN servers in fallback - TURN credentials must be consistent
  // across all peers. TURN servers are provided by the Voltage server only.
]

const isElectronRuntime = () => {
  try {
    const ua = navigator?.userAgent || ''
    const hasElectronUa = ua.includes('Electron')
    const hasElectronProcess = !!window?.process?.versions?.electron
    return hasElectronUa || hasElectronProcess
  } catch {
    return false
  }
}

const buildPeerConfig = (serverIceServers = [], encrypted = true) => {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const isFirefox = ua.includes('Firefox')
  const isChrome = ua.includes('Chrome') && !ua.includes('Edg') && !ua.includes('Opera')
  const isSafari = ua.includes('Safari') && !ua.includes('Chrome') && !ua.includes('Chromium')
  const isEdge = ua.includes('Edg')
  const isElectron = ua.includes('Electron')
  
  const iceServers = serverIceServers.length > 0 ? serverIceServers : FALLBACK_ICE_SERVERS
  
  const stunCount = iceServers.filter(s => s.urls.startsWith('stun')).length
  const turnCount = iceServers.filter(s => s.urls.startsWith('turn') || s.urls.startsWith('turns')).length
  const source = serverIceServers.length > 0 ? 'server' : 'fallback (STUN-only, no TURN)'
  console.log(`[WebRTC] Building peer config with ${iceServers.length} ICE servers from ${source} (${stunCount} STUN, ${turnCount} TURN)`)
  if (serverIceServers.length === 0) {
    console.log('[WebRTC] WARNING: Using STUN-only fallback - server ICE servers not yet received. TURN relay unavailable until voice:participants arrives.')
  }
  console.log(`[WebRTC] Browser: ${isFirefox ? 'Firefox' : isChrome ? 'Chrome' : isSafari ? 'Safari' : isEdge ? 'Edge' : isElectron ? 'Electron' : 'Other'}`)
  console.log(`[WebRTC] ICE servers:`, iceServers.map(s => s.urls))
  console.log(`[WebRTC] SRTP encryption: ${encrypted ? 'enabled (DTLS-SRTP)' : 'disabled'}`)
  
  const config = {
    iceServers,
    sdpSemantics: 'unified-plan',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    iceCandidatePoolSize: 10,
    iceTransports: 'all',
  }
  
  // Firefox works better with smaller pool size
  if (isFirefox) {
    config.iceCandidatePoolSize = 0
  }
  
  // Safari needs specific configuration for better connectivity
  if (isSafari) {
    config.iceCandidatePoolSize = 0
    config.sdpSemantics = 'plan-b' // Safari still prefers plan-b in some versions
  }
  
  // Edge Legacy (non-Chromium) needs plan-b
  if (isEdge && !ua.includes('Chrome')) {
    config.sdpSemantics = 'plan-b'
  }
  
  return config
}

// Check if a peer connection is using SRTP encryption
const isConnectionEncrypted = (pc) => {
  try {
    const stats = pc.getStats()
    let encrypted = false
    stats.forEach(report => {
      if (report.type === 'inbound-rtp' || report.type === 'outbound-rtp') {
        if (report.kind === 'audio' || report.kind === 'video') {
          // Check if SRTP is being used
          if (report.scipher || report.cipher) {
            encrypted = true
          }
        }
      }
    })
    return encrypted
  } catch (e) {
    return false
  }
}

// Chrome requires transceivers to be created before tracks are added mid-negotiation
const ensureTransceivers = (pc, isVideoOn = false) => {
  const transceivers = pc.getTransceivers()
  const hasAudio = transceivers.some(t =>
    t.sender?.track?.kind === 'audio' || t.receiver?.track?.kind === 'audio'
  )
  const hasVideo = transceivers.some(t =>
    t.sender?.track?.kind === 'video' || t.receiver?.track?.kind === 'video'
  )

  if (!hasAudio) {
    try {
      pc.addTransceiver('audio', { direction: 'sendrecv' })
      console.log('[WebRTC] Added audio transceiver')
    } catch (e) {
      console.warn('[WebRTC] Failed to add audio transceiver:', e.message)
    }
  }
  if (!hasVideo && isVideoOn) {
    try {
      pc.addTransceiver('video', { direction: 'sendrecv' })
      console.log('[WebRTC] Added video transceiver (video enabled)')
    } catch (e) {
      console.warn('[WebRTC] Failed to add video transceiver:', e.message)
    }
  } else if (hasVideo && !isVideoOn) {
    console.log('[WebRTC] Skipping video transceiver (video disabled)')
  }
}

// Force Opus audio codec for cross-browser compatibility
// Works with Chrome, Firefox, Edge, and Electron
const forceOpusAudioCodec = (pc) => {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const isSafari = ua.includes('Safari') && !ua.includes('Chrome') && !ua.includes('Chromium')
  
  // Safari handles codec negotiation automatically, skip manual intervention
  if (isSafari) {
    console.log('[WebRTC] Skipping manual codec forcing for Safari')
    return
  }
  
  try {
    const audioCaps = RTCRtpSender.getCapabilities?.('audio')?.codecs || []
    if (audioCaps.length === 0) {
      console.log('[WebRTC] No audio capabilities available')
      return
    }
    
    const opusCodecs = audioCaps.filter(c => 
      c.mimeType?.toLowerCase() === 'audio/opus'
    )
    
    if (opusCodecs.length === 0) {
      console.log('[WebRTC] No Opus codec available, available:', audioCaps.map(c => c.mimeType).join(', '))
      return
    }
    
    pc.getTransceivers()
      .filter(t => (
        t.sender?.track?.kind === 'audio' ||
        t.receiver?.track?.kind === 'audio'
      ))
      .forEach(t => {
        try {
          t.setCodecPreferences(opusCodecs)
          console.log('[WebRTC] Forced Opus audio codec for transceiver')
        } catch (e) {
          console.warn('[WebRTC] Failed to set Opus codec preferences:', e.message)
        }
      })
  } catch (e) {
    console.warn('[WebRTC] Error forcing Opus codec:', e.message)
  }
}

// Chromium can connect but output silence when Opus is not prioritized in m=audio.
// Firefox also benefits from Opus prioritization for cross-browser compatibility.
// Reorder payload types in SDP to put Opus first.
const preferOpusInSdp = (sdp) => {
  if (!sdp || typeof sdp !== 'string') return sdp
  
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const isSafari = ua.includes('Safari') && !ua.includes('Chrome') && !ua.includes('Chromium')
  
  // Safari doesn't need SDP modification, it handles codec negotiation differently
  if (isSafari) return sdp
  
  const lines = sdp.split('\r\n')
  const opusPayloads = new Set()

  lines.forEach((line) => {
    const match = line.match(/^a=rtpmap:(\d+)\s+opus\/48000(?:\/2)?/i)
    if (match?.[1]) opusPayloads.add(match[1])
  })

  if (opusPayloads.size === 0) return sdp

  const reordered = lines.map((line) => {
    if (!line.startsWith('m=audio ')) return line
    const parts = line.split(' ')
    if (parts.length < 4) return line
    const header = parts.slice(0, 3)
    const payloads = parts.slice(3)
    const opusFirst = []
    const others = []
    payloads.forEach((pt) => {
      if (opusPayloads.has(pt)) opusFirst.push(pt)
      else others.push(pt)
    })
    if (opusFirst.length === 0) return line
    return [...header, ...opusFirst, ...others].join(' ')
  })

  return reordered.join('\r\n')
}

// Set codec preference for cross-browser compatibility
// Forces H.264/VP8 priority over AV1/VP9 which can fail on some devices
// Safari handles this automatically, so we skip manual intervention
const setCodecPreferences = (pc) => {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const isSafari = ua.includes('Safari') && !ua.includes('Chrome') && !ua.includes('Chromium')
  
  // Safari handles codec negotiation automatically
  if (isSafari) {
    console.log('[WebRTC] Skipping manual video codec forcing for Safari')
    // Still force Opus for audio even on Safari
    forceOpusAudioCodec(pc)
    return
  }
  
  // First force Opus for audio (most important for cross-browser compatibility)
  forceOpusAudioCodec(pc)
  
  // Then set video codec preferences for Chromium-based browsers
  try {
    const videoCaps = RTCRtpSender.getCapabilities?.('video')
    if (!videoCaps?.codecs) return
    
    // Prioritize H264 first (most compatible), then VP8
    const preferred = videoCaps.codecs.filter(c => 
      ['video/H264', 'video/VP8'].includes(c.mimeType)
    )
    if (preferred.length === 0) return
    
    pc.getTransceivers()
      .filter(t => t.sender?.track?.kind === 'video')
      .forEach(t => {
        try {
          t.setCodecPreferences(preferred)
        } catch (e) {
          console.warn('[WebRTC] Failed to set codec preferences:', e.message)
        }
      })
  } catch (e) {
    // getCapabilities not supported in all browsers
  }
}

// Safe addTrack wrapper - waits for stable state before adding tracks (Chrome requirement)
const addTrackSafe = async (pc, track, stream) => {
  if (pc.signalingState !== 'stable') {
    // Wait for stable state
    await new Promise(resolve => {
      const checkState = () => {
        if (pc.signalingState === 'stable') {
          pc.removeEventListener('signalingstatechange', checkState)
          resolve()
        }
      }
      pc.addEventListener('signalingstatechange', checkState)
      // Timeout fallback
      setTimeout(() => {
        pc.removeEventListener('signalingstatechange', checkState)
        resolve()
      }, 2000)
    })
  }
  pc.addTrack(track, stream)
}

// Global flag to track if we're intentionally leaving the voice channel
// This prevents cleanup from emitting voice:leave when switching views
let isIntentionalLeave = false

export const setVoiceIntentionalLeave = (value) => {
  isIntentionalLeave = value
}

const VOICE_STATE_STORAGE_KEY = 'voltchat_voice_state_v1'
const MINI_POSITION_STORAGE_KEY = 'voltchat_mini_voice_position'

const readPersistedVoiceState = () => {
  let remembered = false
  let settingsMuted = false
  let settingsDeafened = false
  try {
    const settings = settingsService.getSettings()
    remembered = !!settings?.rememberVoiceState
    if (remembered) {
      settingsMuted = !!settings.voiceMuted
      settingsDeafened = !!settings.voiceDeafened
    }
  } catch {}

  let storageMuted = null
  let storageDeafened = null
  try {
    const raw = localStorage.getItem(VOICE_STATE_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (typeof parsed?.muted === 'boolean') storageMuted = parsed.muted
      if (typeof parsed?.deafened === 'boolean') storageDeafened = parsed.deafened
    }
  } catch {}

  const muted = storageMuted ?? settingsMuted
  const deafened = storageDeafened ?? settingsDeafened
  if (!remembered && storageMuted === null && storageDeafened === null) {
    return { muted: false, deafened: false }
  }
  return { muted: deafened ? true : muted, deafened }
}

const detectScreenShareBrowser = () => {
  const ua = navigator.userAgent || ''
  if (/Waterfox\/\d+/i.test(ua)) {
    return { key: 'waterfox', label: 'Waterfox', isFirefoxFamily: true }
  }
  if (/Firefox\/\d+/i.test(ua)) {
    return { key: 'firefox', label: 'Firefox', isFirefoxFamily: true }
  }
  if (/Edg\/\d+/i.test(ua)) {
    return { key: 'edge', label: 'Edge', isFirefoxFamily: false }
  }
  if (/Chrome\/\d+/i.test(ua)) {
    return { key: 'chrome', label: 'Chrome', isFirefoxFamily: false }
  }
  if (/Safari\/\d+/i.test(ua) && !/Chrome\/\d+/i.test(ua)) {
    return { key: 'safari', label: 'Safari', isFirefoxFamily: false }
  }
  return { key: 'unknown', label: 'this browser', isFirefoxFamily: false }
}

const buildVoiceIssue = (code, severity, title, message, fix, action = null) => ({
  code,
  severity,
  title,
  message,
  fix,
  action
})

const VoiceChannel = ({ channel, joinKey, viewMode = 'full', onLeave, isMuted: externalMuted, isDeafened: externalDeafened, onMuteChange, onDeafenChange, onOpenSettings, onParticipantsChange, onShowConnectionInfo }) => {
  const { socket, connected } = useSocket()
  const { user } = useAuth()
  const { t } = useTranslation()
  const { isEncryptionEnabled, getServerEncryptionStatus } = useE2e()
  const { focusedActivityId, activeActivities, setFocusedActivity, clearFocusedActivity, addActivity, removeActivity } = useAppStore()
  
  const currentServer = getStoredServer()
  const apiUrl = currentServer?.apiUrl || ''
  const imageApiUrl = currentServer?.imageApiUrl || apiUrl
  
  // Check if server encryption is enabled
  const serverId = channel?.serverId
  const encryptionEnabled = serverId ? isEncryptionEnabled(serverId) : false
  
  // Check encryption status when channel/server changes
  useEffect(() => {
    if (serverId) {
      console.log('[VoiceChannel] Checking encryption status for server:', serverId)
      getServerEncryptionStatus(serverId)
    }
  }, [serverId, getServerEncryptionStatus])

  // Check if user is server admin/owner
  useEffect(() => {
    if (!socket || !serverId || !user?.id) {
      setIsServerAdmin(false)
      return
    }

    const checkAdminStatus = async () => {
      try {
        const response = await fetch(`/api/servers/${serverId}/my-role`, {
          credentials: 'include'
        })
        if (response.ok) {
          const data = await response.json()
          setIsServerAdmin(data.role === 'owner' || data.role === 'admin' || data.permissions?.includes('manage_server'))
        }
      } catch (err) {
        console.warn('[VoiceChannel] Failed to check admin status:', err)
        setIsServerAdmin(false)
      }
    }

    checkAdminStatus()
  }, [socket, serverId, user?.id])

  // Handle force reconnect from admin
  useEffect(() => {
    if (!socket) return

    const handleForceReconnect = ({ channelId: targetChannelId }) => {
      if (targetChannelId === channel?.id) {
        console.log('[VoiceChannel] Admin forced reconnect, cleaning up and rejoining...')
        
        // Clean up existing connections
        Object.values(peerConnections.current).forEach(pc => {
          try { pc.close() } catch {}
        })
        peerConnections.current = {}
        
        // Notify user
        if (onLeave) {
          onLeave()
        }
        
        // Rejoin after short delay
        setTimeout(() => {
          window.location.reload()
        }, 1000)
      }
    }

    socket.on('voice:force-reconnect', handleForceReconnect)

    return () => {
      socket.off('voice:force-reconnect', handleForceReconnect)
    }
  }, [socket, channel?.id, onLeave])
  const [showEncryptionInfo, setShowEncryptionInfo] = useState(false)
  
  const initialVoiceState = readPersistedVoiceState()
  const [participants, setParticipants] = useState([])
  const [localIsMuted, setLocalIsMuted] = useState(initialVoiceState.muted)
  const [localIsDeafened, setLocalIsDeafened] = useState(initialVoiceState.deafened)
  const pendingLaunchedActivityIdRef = useRef(null)
  // Effective local state (can be externally controlled by parent)
  const currentMuted = externalMuted !== undefined ? externalMuted : localIsMuted
  const currentDeafened = externalDeafened !== undefined ? externalDeafened : localIsDeafened
  const [isVideoOn, setIsVideoOn] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  
  // Local state for focused builtin activity session
  const [focusedBuiltinSession, setFocusedBuiltinSession] = useState(null)
  // Local state for focused external activity session
  const [focusedExternalSession, setFocusedExternalSession] = useState(null)
  
  // Update focusedBuiltinSession when focusedActivityId changes
  useEffect(() => {
    if (focusedActivityId && activeActivities.length > 0) {
      const activity = activeActivities.find(a => a.sessionId === focusedActivityId)
      // Only focus if activity is valid
      if (activity && activity.activityId && activity.activityId.startsWith('builtin:')) {
        setFocusedBuiltinSession({
          id: activity.sessionId,
          sessionId: activity.sessionId,
          activityId: activity.activityId,
          activityName: activity.activityName || 'Activity',
          contextType: activity.contextType,
          contextId: activity.contextId
        })
        setFocusedExternalSession(null)
      } else if (activity && activity.activityId && !activity.activityId.startsWith('builtin:')) {
        setFocusedBuiltinSession(null)
        setFocusedExternalSession({
          id: activity.sessionId,
          sessionId: activity.sessionId,
          activityId: activity.activityId,
          activityName: activity.activityName || 'Activity',
          launchUrl: activity.launchUrl || null,
          contextType: activity.contextType,
          contextId: activity.contextId
        })
      } else {
        setFocusedBuiltinSession(null)
        setFocusedExternalSession(null)
        if (activity && !activity.activityId) {
          clearFocusedActivity()
          removeActivity(focusedActivityId)
        }
      }
    } else {
      setFocusedBuiltinSession(null)
      setFocusedExternalSession(null)
    }
  }, [focusedActivityId, activeActivities])
  const [localStream, setLocalStream] = useState(null)
  const [localVideoStream, setLocalVideoStream] = useState(null)
  const [screenStream, setScreenStream] = useState(null)
  const [connectionState, setConnectionState] = useState('connecting')
  const isConnected = connectionState === 'connected'
  const [speaking, setSpeaking] = useState({})
  const [voiceIssues, setVoiceIssues] = useState([])
  const [joinedWithoutMic, setJoinedWithoutMic] = useState(false)
  // Per-peer WebRTC connection state: peerId -> 'connecting'|'connected'|'failed'|'disconnected'
  const [peerStates, setPeerStates] = useState({})
  
  // ICE connection info - track which ICE server we're connected to
  const [iceConnectionInfo, setIceConnectionInfo] = useState({
    selectedServer: null,
    candidatePairs: [],
    connectionType: null, // 'host', 'srflx', 'relay'
  })
  // Voice encryption status - tracks if voice is using DTLS-SRTP
  const [voiceEncryptionStatus, setVoiceEncryptionStatus] = useState({
    isEncrypted: false,
    algorithm: null, // 'DTLS-SRTP' or null
  })
  // E2E Voice Verification - per-peer verification status
  const [peerVerificationStatus, setPeerVerificationStatus] = useState({})
  const [verifier, setVerifier] = useState(null)
  const [myFingerprint, setMyFingerprint] = useState('')
  // Store encryption state in ref for use in callbacks
  const encryptionEnabledRef = useRef(encryptionEnabled)
  
  // Load user's voice fingerprint when encryption is enabled
  useEffect(() => {
    if (serverId && encryptionEnabled) {
      voiceVerification.getShortFingerprint(serverId).then(fp => {
        setMyFingerprint(fp)
        console.log('[E2E Voice] Loaded fingerprint:', fp)
      }).catch(err => {
        console.error('[E2E Voice] Error loading fingerprint:', err)
      })
    }
  }, [serverId, encryptionEnabled])
  
  // Initialize E2E voice verifier when joining a channel
  useEffect(() => {
    if (serverId && user?.id && encryptionEnabled) {
      const newVerifier = new E2eVoiceVerifier(serverId, user.id)
      setVerifier(newVerifier)
      console.log('[E2E Voice] Initialized verifier for server:', serverId)
    }
  }, [serverId, user?.id, encryptionEnabled])
  
  // Trigger verification when participants change
  useEffect(() => {
    if (!verifier || !encryptionEnabled) return
    
    participants.forEach(async (participant) => {
      if (participant.id === user?.id) return // Don't verify self
      if (peerVerificationStatus[participant.id]) return // Already verified
      
      try {
        console.log('[E2E Voice] Verifying peer:', participant.id)
        const result = await verifier.initiateVerification(participant.id)
        setPeerVerificationStatus(prev => ({
          ...prev,
          [participant.id]: result
        }))
        console.log('[E2E Voice] Verification result for', participant.id, ':', result)
      } catch (err) {
        console.error('[E2E Voice] Verification failed for', participant.id, ':', err)
      }
    })
  }, [participants, verifier, encryptionEnabled, user?.id])
  
  useEffect(() => {
    encryptionEnabledRef.current = encryptionEnabled
  }, [encryptionEnabled])

  // Listen for fullscreen events from ActivityStrip
  useEffect(() => {
    const handleFullscreen = (e) => {
      if (e.detail?.sessionId === focusedActivityId) {
        const container = document.querySelector('.voice-main-activity')
        if (container) {
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {})
          } else {
            container.requestFullscreen().catch(() => {})
          }
        }
      }
    }
    window.addEventListener('activity:fullscreen', handleFullscreen)
    return () => window.removeEventListener('activity:fullscreen', handleFullscreen)
  }, [focusedActivityId])

  // Activity socket event handlers
  useEffect(() => {
    if (!socket || !channel?.id) return

    const onSessions = (data = {}) => {
      if (!data.sessions || !Array.isArray(data.sessions)) return
      // Filter sessions for this channel - ONLY valid sessions
      const channelSessions = data.sessions.filter(s => 
        s.contextType === 'voice' && 
        s.contextId === channel.id &&
        s.id && // Must have id
        s.activityId && // Must have activityId
        s.activityId.startsWith('builtin:') // Must be builtin
      )
      
      // Cleanup sessions that no longer exist in this context.
      const validSessionIds = new Set(channelSessions.map(s => s.id))
      activeActivities.forEach(activity => {
        if (!validSessionIds.has(activity.sessionId)) {
          removeActivity(activity.sessionId)
          if (focusedActivityId === activity.sessionId) {
            clearFocusedActivity()
            // Exit fullscreen if active
            if (document.fullscreenElement) {
              document.exitFullscreen().catch(() => {})
            }
          }
        }
      })
      
      // Add all valid sessions to store
      channelSessions.forEach(session => {
        if (!session.id || !session.activityId) return
        const participantCount = Math.max(Number(session.participantCount || 0), 1)
        const isPendingLaunch = pendingLaunchedActivityIdRef.current && pendingLaunchedActivityIdRef.current === session.activityId
        const isBuiltin = String(session.activityId || '').startsWith('builtin:')
        if (!activeActivities.find(a => a.sessionId === session.id)) {
          addActivity({
            sessionId: session.id,
            activityId: session.activityId,
            activityName: session.activityName || 'Activity',
            launchUrl: session.launchUrl || null,
            ownerId: session.ownerId || session.hostId || null,
            hostId: session.hostId || session.ownerId || null,
            contextType: session.contextType,
            contextId: session.contextId,
            participantCount,
            isBuiltin
          })
        }
        if (isPendingLaunch) {
          pendingLaunchedActivityIdRef.current = null
          setFocusedActivity(session.id)
          if (isBuiltin) {
            setFocusedBuiltinSession({
              id: session.id,
              sessionId: session.id,
              activityId: session.activityId,
              activityName: session.activityName || 'Activity',
              ownerId: session.ownerId || session.hostId || null,
              hostId: session.hostId || session.ownerId || null,
              contextType: session.contextType,
              contextId: session.contextId,
              participantCount
            })
            setFocusedExternalSession(null)
          } else {
            setFocusedBuiltinSession(null)
            setFocusedExternalSession({
              id: session.id,
              sessionId: session.id,
              activityId: session.activityId,
              activityName: session.activityName || 'Activity',
              launchUrl: session.launchUrl || null,
              contextType: session.contextType,
              contextId: session.contextId,
              participantCount
            })
          }
        }
      })
    }

    const onSessionCreated = (payload = {}) => {
      const session = payload.session || payload
      if (session.contextType !== 'voice' || session.contextId !== channel.id) return
      if (!session.id || !session.activityId) {
        console.warn('[VoiceChannel] Ignoring invalid session:', session)
        return
      }
      const participantCount = Math.max(Number(session.participantCount || 0), 1)
      const isPendingLaunch = pendingLaunchedActivityIdRef.current && pendingLaunchedActivityIdRef.current === session.activityId
      const isBuiltin = String(session.activityId || '').startsWith('builtin:')
      if (!activeActivities.find(a => a.sessionId === session.id)) {
        addActivity({
          sessionId: session.id,
          activityId: session.activityId,
          activityName: session.activityName || 'Activity',
          launchUrl: session.launchUrl || null,
          ownerId: session.ownerId || session.hostId || null,
          hostId: session.hostId || session.ownerId || null,
          contextType: session.contextType,
          contextId: session.contextId,
          participantCount,
          isBuiltin
        })
        soundService?.activityStart?.() || soundService?.success?.()
      }
      if (isPendingLaunch) {
        pendingLaunchedActivityIdRef.current = null
        setFocusedActivity(session.id)
        if (isBuiltin) {
          setFocusedBuiltinSession({
            id: session.id,
            sessionId: session.id,
            activityId: session.activityId,
            activityName: session.activityName || 'Activity',
            ownerId: session.ownerId || session.hostId || null,
            hostId: session.hostId || session.ownerId || null,
            contextType: session.contextType,
            contextId: session.contextId,
            participantCount
          })
          setFocusedExternalSession(null)
        } else {
          setFocusedBuiltinSession(null)
          setFocusedExternalSession({
            id: session.id,
            sessionId: session.id,
            activityId: session.activityId,
            activityName: session.activityName || 'Activity',
            launchUrl: session.launchUrl || null,
            contextType: session.contextType,
            contextId: session.contextId,
            participantCount
          })
        }
      }
    }

    const onSessionEnded = (data = {}) => {
      if (!data.sessionId) return
      removeActivity(data.sessionId)
      if (focusedActivityId === data.sessionId) {
        clearFocusedActivity()
      }
      // Play sound when activity ends
      soundService?.activityStop?.() || soundService?.callLeft?.()
    }

    socket.on('activity:sessions', onSessions)
    socket.on('activity:session-created', onSessionCreated)
    socket.on('activity:session-ended', onSessionEnded)

    // Request current sessions
    socket.emit('activity:get-sessions', { contextType: 'voice', contextId: channel.id })

    return () => {
      socket.off('activity:sessions', onSessions)
      socket.off('activity:session-created', onSessionCreated)
      socket.off('activity:session-ended', onSessionEnded)
    }
  }, [socket, channel?.id])

  // VoiceFX state
  const [showVoiceFX, setShowVoiceFX] = useState(false)
  const [showScreenSharePicker, setShowScreenSharePicker] = useState(false)
  const [showActivityPicker, setShowActivityPicker] = useState(false)
  const [showOverlayStudio, setShowOverlayStudio] = useState(false)
  const [overlayTarget, setOverlayTarget] = useState('camera')
  const [cameraOverlays, setCameraOverlays] = useState([])
  const [screenOverlays, setScreenOverlays] = useState([])
  const [overlayStorageChannelId, setOverlayStorageChannelId] = useState(null)
  const [voiceFXEnabled, setVoiceFXEnabled] = useState(false)
  const [voiceFXEffect, setVoiceFXEffect] = useState('none')
  const [voiceFXParams, setVoiceFXParams] = useState({})
  const [voiceFXPreviewEnabled, setVoiceFXPreviewEnabled] = useState(false)
  const [screenShareAudioWarning, setScreenShareAudioWarning] = useState('')
  
  const tempChat = useVoiceTempChat(
    participants,
    isConnected,
    channel?.id
  )
  const voiceFXNodesRef = useRef({})
  const voiceFXDryGainRef = useRef(null)
  const voiceFXWetGainRef = useRef(null)
  const voiceFXDestinationRef = useRef(null)
  const voiceFXSourceRef = useRef(null)
  const originalAudioTrackRef = useRef(null)
  const activeOutboundAudioTrackRef = useRef(null)
  const activeOutboundAudioStreamRef = useRef(null)
  const voiceFXPreviewAudioRef = useRef(null)
  const warnedElectronVoiceFXRef = useRef(false)
  // Enable VoiceFX on all platforms - show warning on Electron if issues occur
  const voiceFXSupported = true
  // Remote audio analysers for speaking detection: peerId -> { analyser, dataArray }
const remoteAnalysersRef = useRef({})
const participantsRef = useRef([])
// Local per-user overrides: { [userId]: { muted: bool, volume: 0-100, screenShareMuted: bool } }
const [localUserSettings, setLocalUserSettings] = useState(() => {
  try {
    const parsed = JSON.parse(localStorage.getItem('voltchat_local_user_settings')) || {}
    const normalized = {}
    Object.entries(parsed).forEach(([userId, value]) => {
      const volume = Math.max(0, Math.min(100, Number(value?.volume ?? 100)))
      normalized[userId] = {
        // Mute flags are session-local; stale persisted mutes can cause "no audio" confusion.
        muted: false,
        screenShareMuted: false,
        volume
      }
    })
    return normalized
  } catch {
    return {}
  }
})
// Right-click context menu state
const [participantMenu, setParticipantMenu] = useState(null) // { userId, username, x, y }
const [isServerAdmin, setIsServerAdmin] = useState(false)
// Video stream management state
const [videoStreams, setVideoStreams] = useState({})
const rootViewRef = useRef(null)
const preDeafenMutedRef = useRef(initialVoiceState.muted)
const [isViewTransitioning, setIsViewTransitioning] = useState(false)
const [isMiniDragging, setIsMiniDragging] = useState(false)
const miniDragRef = useRef({ active: false, startX: 0, startY: 0, startLeft: 0, startTop: 0 })
// Audio-video sync correction state
const syncCorrectionRef = useRef({}) // participantId -> { lastVideoTime, lastAudioTime, drift, correctionApplied }
const SYNC_CHECK_INTERVAL = 5000 // Check sync every 5 seconds
const MAX_DRIFT_THRESHOLD = 150 // ms - if drift exceeds this, correct
const SYNC_CORRECTION_STEP = 50 // ms - amount to adjust per correction
  const peerConnections = useRef({})   // peerId -> RTCPeerConnection
  const remoteStreams = useRef({})
  const audioElements = useRef({})
  const videoElements = useRef({})
  const localVideoRef = useRef(null)
  const remoteVideoMuteTimersRef = useRef({})
  const analyserRef = useRef(null)
  const channelIdRef = useRef(channel?.id)
  const localStreamRef = useRef(null)
  const localVideoStreamRef = useRef(null)
  const screenStreamRef = useRef(null)
  const rawLocalVideoStreamRef = useRef(null)
  const rawScreenStreamRef = useRef(null)
  const schedulePeerReconnectRef = useRef(null)
  const overlaySessionsRef = useRef({ camera: null, screen: null })
  const hasJoinedRef = useRef(false)
  const hasLeftRef = useRef(false)
  const isInitializingRef = useRef(false)
  const initializedChannelIdRef = useRef(null)
  const softReconnectInProgressRef = useRef(false)
  const lastForceReconnectAtRef = useRef(0)

  const stopOverlaySession = useCallback((kind) => {
    const session = overlaySessionsRef.current[kind]
    if (!session) return
    try {
      session.stop?.()
    } catch {}
    overlaySessionsRef.current[kind] = null
  }, [])

  const drawCoverFrame = useCallback((context, source, destWidth, destHeight) => {
    const sourceWidth = source?.videoWidth || source?.width || destWidth
    const sourceHeight = source?.videoHeight || source?.height || destHeight
    if (!sourceWidth || !sourceHeight) return
    const scale = Math.max(destWidth / sourceWidth, destHeight / sourceHeight)
    const drawWidth = sourceWidth * scale
    const drawHeight = sourceHeight * scale
    const offsetX = (destWidth - drawWidth) / 2
    const offsetY = (destHeight - drawHeight) / 2
    context.drawImage(source, offsetX, offsetY, drawWidth, drawHeight)
  }, [])

  const buildOverlayCompositeStream = useCallback((kind, sourceStream, overlays = []) => {
    stopOverlaySession(kind)
    if (!sourceStream) return null
    const videoTrack = sourceStream.getVideoTracks?.()[0]
    if (!videoTrack || !Array.isArray(overlays) || overlays.length === 0) {
      return sourceStream
    }

    const settings = videoTrack.getSettings?.() || {}
    const referenceOverlay = overlays.find(Boolean)
    const stageWidth = Math.max(1, Number(referenceOverlay?.stageWidth) || 1280)
    const stageHeight = Math.max(1, Number(referenceOverlay?.stageHeight) || 720)
    const stageAspect = stageWidth / stageHeight
    const sourceWidth = Math.max(1, Math.round(settings.width || 1280))
    const sourceHeight = Math.max(1, Math.round(settings.height || 720))
    const canvas = document.createElement('canvas')
    if (sourceWidth / sourceHeight > stageAspect) {
      canvas.height = Math.max(360, sourceHeight)
      canvas.width = Math.max(640, Math.round(canvas.height * stageAspect))
    } else {
      canvas.width = Math.max(640, sourceWidth)
      canvas.height = Math.max(360, Math.round(canvas.width / stageAspect))
    }
    const context = canvas.getContext('2d')
    if (!context) return sourceStream

    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.autoplay = true
    video.srcObject = new MediaStream([videoTrack])
    video.play?.().catch(() => {})

    const assetCache = new Map()
    const assetHost = document.createElement('div')
    assetHost.style.position = 'fixed'
    assetHost.style.left = '-9999px'
    assetHost.style.top = '0'
    assetHost.style.width = '1px'
    assetHost.style.height = '1px'
    assetHost.style.opacity = '0.01'
    assetHost.style.pointerEvents = 'none'
    assetHost.style.overflow = 'hidden'
    assetHost.style.zIndex = '-1'
    document.body.appendChild(assetHost)
    let rafId = 0
    let stopped = false

    const getAsset = (overlay) => {
      if (!overlay?.src) return null
      if (assetCache.has(overlay.id)) return assetCache.get(overlay.id)
      const image = document.createElement('img')
      image.crossOrigin = 'anonymous'
      image.alt = overlay.title || 'overlay'
      image.decoding = 'async'
      image.style.display = 'block'
      image.style.width = '1px'
      image.style.height = '1px'
      image.style.objectFit = 'cover'
      image.src = overlay.src
      assetHost.appendChild(image)
      assetCache.set(overlay.id, image)
      return image
    }

    const drawFrame = () => {
      if (stopped) return
      context.clearRect(0, 0, canvas.width, canvas.height)
      if (video.readyState >= 2) {
        drawCoverFrame(context, video, canvas.width, canvas.height)
      } else {
        context.fillStyle = '#060910'
        context.fillRect(0, 0, canvas.width, canvas.height)
      }

      overlays.forEach((overlay) => {
        const overlayStageWidth = Math.max(1, Number(overlay.stageWidth) || stageWidth)
        const overlayStageHeight = Math.max(1, Number(overlay.stageHeight) || stageHeight)
        const scaleX = canvas.width / overlayStageWidth
        const scaleY = canvas.height / overlayStageHeight
        const x = (Number(overlay.x) || 0) * scaleX
        const y = (Number(overlay.y) || 0) * scaleY
        const width = Math.max(80, (Number(overlay.width) || 180) * scaleX)
        const height = Math.max(50, (Number(overlay.height) || 100) * scaleY)

        if (overlay.type === 'text' && overlay.content) {
          context.save()
          context.fillStyle = overlay.background || 'rgba(7, 10, 18, 0.58)'
          const radius = 18
          context.beginPath()
          context.moveTo(x + radius, y)
          context.lineTo(x + width - radius, y)
          context.quadraticCurveTo(x + width, y, x + width, y + radius)
          context.lineTo(x + width, y + height - radius)
          context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
          context.lineTo(x + radius, y + height)
          context.quadraticCurveTo(x, y + height, x, y + height - radius)
          context.lineTo(x, y + radius)
          context.quadraticCurveTo(x, y, x + radius, y)
          context.closePath()
          context.fill()
          context.fillStyle = overlay.color || '#ffffff'
          context.font = `600 ${Math.max(14, Math.round(18 * scaleY))}px sans-serif`
          context.fillText(overlay.title || 'Overlay', x + 14, y + 26)
          context.font = `400 ${Math.max(12, Math.round(16 * scaleY))}px sans-serif`
          const words = String(overlay.content).split(/\s+/)
          let line = ''
          let lineY = y + 52
          words.forEach((word) => {
            const testLine = line ? `${line} ${word}` : word
            if (context.measureText(testLine).width > width - 28 && line) {
              context.fillText(line, x + 14, lineY)
              line = word
              lineY += 20
            } else {
              line = testLine
            }
          })
          if (line && lineY <= y + height - 12) {
            context.fillText(line, x + 14, lineY)
          }
          context.restore()
          return
        }

        const asset = getAsset(overlay)
        if (asset && (asset.complete || overlay.type === 'gif') && asset.naturalWidth > 0) {
          context.drawImage(asset, x, y, width, height)
        }
      })

      rafId = window.requestAnimationFrame(drawFrame)
    }

    drawFrame()

    const output = canvas.captureStream(Math.min(30, Number(settings.frameRate) || 30))
    sourceStream.getAudioTracks().forEach((track) => output.addTrack(track))
    const outputVideoTrack = output.getVideoTracks?.()[0]
    if (outputVideoTrack) {
      outputVideoTrack._senderTag = kind === 'camera' ? 'camera' : 'screen'
    }
    output.getAudioTracks?.().forEach((track) => {
      track._senderTag = kind === 'screen' ? 'screen-audio' : track._senderTag
    })

    overlaySessionsRef.current[kind] = {
      stream: output,
      stop: () => {
        stopped = true
        if (rafId) window.cancelAnimationFrame(rafId)
        output.getVideoTracks?.().forEach((track) => track.stop())
        try { video.pause?.() } catch {}
        video.srcObject = null
        try { assetHost.remove() } catch {}
        assetCache.clear()
      }
    }

    return output
  }, [drawCoverFrame, stopOverlaySession])

  const upsertVoiceIssue = useCallback((issue) => {
    if (!issue?.code) return
    setVoiceIssues(prev => {
      const next = prev.filter(entry => entry?.code !== issue.code)
      return [...next, issue]
    })
  }, [])

  const clearVoiceIssue = useCallback((code) => {
    if (!code) return
    setVoiceIssues(prev => prev.filter(entry => entry?.code !== code))
  }, [])

  useEffect(() => {
    return () => {
      stopOverlaySession('camera')
      stopOverlaySession('screen')
    }
  }, [stopOverlaySession])

  const diagnoseMediaError = useCallback((err, source = 'microphone') => {
    const noun = source === 'camera' ? 'camera' : source === 'screen' ? 'screen share' : 'microphone'
    const displayName = `${noun[0].toUpperCase()}${noun.slice(1)}`
    const settingsAction = source === 'screen' ? null : 'settings'

    if (!err) {
      return buildVoiceIssue(
        `${source}-unknown`,
        'warning',
        `${displayName} unavailable`,
        `Volt could not access your ${noun}.`,
        `Open Voice Settings, confirm the correct ${noun} is selected, and try again.`,
        settingsAction
      )
    }

    if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
      return buildVoiceIssue(
        `${source}-permission`,
        'warning',
        `${displayName} permission blocked`,
        `The browser or desktop app blocked access to your ${noun}.`,
        source === 'screen'
          ? 'Allow screen capture in the system or browser prompt, then start sharing again.'
          : `Allow ${noun} access for this site or app, then retry from Voice Settings.`,
        settingsAction
      )
    }

    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      return buildVoiceIssue(
        `${source}-missing`,
        'warning',
        `${displayName} not found`,
        `No usable ${noun} was detected on this device.`,
        `Connect a ${noun}, or pick another input in Voice Settings.`,
        settingsAction
      )
    }

    if (err.name === 'OverconstrainedError' || err.name === 'ConstraintNotSatisfiedError') {
      return buildVoiceIssue(
        `${source}-unavailable-device`,
        'warning',
        `${displayName} selection is invalid`,
        `Your saved ${noun} device is missing or no longer matches the current hardware.`,
        `Open Voice Settings and switch ${noun} back to the default device.`,
        settingsAction
      )
    }

    if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      return buildVoiceIssue(
        `${source}-busy`,
        'warning',
        `${displayName} is busy`,
        `Another app may already be using your ${noun}.`,
        `Close other calls or recorder apps using the ${noun}, then try again.`,
        settingsAction
      )
    }

    return buildVoiceIssue(
      `${source}-error`,
      'warning',
      `${displayName} failed to start`,
      err.message || `Volt could not start your ${noun}.`,
      `Re-open Voice Settings and retry. If this keeps happening, reconnect the device or restart the browser/app.`,
      settingsAction
    )
  }, [])

  // Perfect negotiation state per peer
  const makingOfferRef  = useRef({})   // peerId -> bool
  const ignoreOfferRef  = useRef({})   // peerId -> bool
  const remoteDescSetRef = useRef({})  // peerId -> bool
  const pendingCandidatesRef = useRef({}) // peerId -> RTCIceCandidateInit[]
  const lastOfferTimeRef = useRef({})  // peerId -> timestamp of last offer received
  const negotiationLockRef = useRef({}) // peerId -> bool (prevents concurrent negotiations)
  const negotiationCompleteRef = useRef({}) // peerId -> bool (track if initial negotiation done)

  // Per-peer signal queue for serialized signaling (prevents dropped offers)
  const signalChainRef = useRef({}) // peerId -> Promise chain
  const isSettingRemoteAnswerPendingRef = useRef({}) // peerId -> bool

  // Per-peer signal queue helper - serializes signaling operations per peer
  const enqueueSignal = useCallback((peerId, fn) => {
    const prev = signalChainRef.current[peerId] || Promise.resolve()
    const next = prev
      .catch(() => {}) // don't break the chain on errors
      .then(fn)
    signalChainRef.current[peerId] = next
    return next
  }, [])

  // ICE server list received from the Voltage server on voice:participants
  const serverIceServersRef = useRef([])
  
  // Heartbeat/ping system to detect stale connections
  const heartbeatIntervalRef = useRef(null)
  const lastHeartbeatRef = useRef({})
  
  // Per-peer disconnected grace tracking for monitorPeerConnection
  const peerDisconnectedGraceRef = useRef({}) // peerId -> timestamp first seen disconnected
  
  // Exponential backoff state for reconnect attempts
  const reconnectBackoffRef = useRef({ attempts: 0, lastAttemptAt: 0 })
  
  // Notify parent of participants changes (for sidebar display)
  useEffect(() => {
    onParticipantsChange?.(channel?.id, participants)
  }, [participants, channel?.id])

  // Apply local user setting (volume/mute) to a peer's audio element
  const applyLocalUserSetting = useCallback((userId, settings) => {
    const globalSettings = settingsService.getSettings()
    const globalVolume = Math.max(0, Math.min(1, (globalSettings.volume ?? 100) / 100))
    const globallyMuted = !!globalSettings.muteAll || !!currentDeafened
    const userVolume = Math.max(0, Math.min(1, (settings.volume ?? 100) / 100))
    const effectiveVolume = globalVolume * userVolume
    const voiceEl = audioElements.current[userId]
    if (voiceEl instanceof HTMLMediaElement) {
      voiceEl.muted = globallyMuted || !!(settings.muted ?? false)
      voiceEl.volume = effectiveVolume
    }
    const screenEl = audioElements.current[`${userId}__screen`]
    if (screenEl instanceof HTMLMediaElement) {
      screenEl.muted = globallyMuted || !!(settings.screenShareMuted ?? false)
      screenEl.volume = effectiveVolume
    }
  }, [currentDeafened])

  useEffect(() => {
    if (!socket) return

    const onDisconnect = (reason) => {
      upsertVoiceIssue(buildVoiceIssue(
        'socket-disconnected',
        'error',
        'Realtime connection lost',
        reason ? `The realtime connection dropped: ${reason}.` : 'The realtime connection dropped.',
        'Check your network, wait for reconnect, or leave and rejoin the voice channel if it stays stuck.',
        'details'
      ))
    }

    const onConnect = () => {
      clearVoiceIssue('socket-disconnected')
    }

    socket.on('disconnect', onDisconnect)
    socket.on('connect', onConnect)

    return () => {
      socket.off('disconnect', onDisconnect)
      socket.off('connect', onConnect)
    }
  }, [socket, upsertVoiceIssue, clearVoiceIssue])

  useEffect(() => {
    if (!navigator.mediaDevices?.addEventListener) return

    const handleDeviceChange = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const hasAudioInput = devices.some(device => device.kind === 'audioinput')
        if (!hasAudioInput) {
          upsertVoiceIssue(buildVoiceIssue(
            'microphone-missing-live',
            'warning',
            'Microphone disconnected',
            'Your microphone is no longer available while voice is active.',
            'Reconnect the device, then open Voice Settings or rejoin the channel if input does not recover.',
            'settings'
          ))
        } else {
          clearVoiceIssue('microphone-missing-live')
        }
      } catch {}
    }

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange)
    return () => navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange)
  }, [upsertVoiceIssue, clearVoiceIssue])

  // Chromium/Electron can retain stale audiooutput IDs between sessions.
  // If setSinkId fails, fall back to system default to prevent silent playback.
  const applyOutputDevice = useCallback(async (audioEl, desiredDeviceId) => {
    if (!audioEl?.setSinkId) return true

    const targetDevice = desiredDeviceId || 'default'
    try {
      await audioEl.setSinkId(targetDevice)
      return true
    } catch (err) {
      if (targetDevice !== 'default') {
        try {
          await audioEl.setSinkId('default')
          const settings = settingsService.getSettings()
          if (settings.outputDevice !== 'default') {
            settingsService.saveSettings({ ...settings, outputDevice: 'default' })
          }
          console.warn('[WebRTC] Failed to use output device, fell back to default:', targetDevice, err?.name || err)
          return true
        } catch (fallbackErr) {
          console.warn('[WebRTC] Failed to fall back to default output device:', fallbackErr?.name || fallbackErr)
        }
      } else {
        console.warn('[WebRTC] Failed to set default output device:', err?.name || err)
      }
      return false
    }
  }, [])

  const gracefulReconnect = useCallback(async (peerId) => {
    console.log(`[Voice] Attempting graceful reconnect for peer ${peerId}`)
    const pc = peerConnections.current[peerId]
    // Clear any retry interval
    const retryKey = `ice_retry_${peerId}`
    const retryState = iceRetryStateRef.current.get(retryKey)
    if (retryState?.intervalId) {
      clearInterval(retryState.intervalId)
      iceRetryStateRef.current.delete(retryKey)
    }
    if (pc) {
      try {
        pc.restartIce()
      } catch {
        pc.close()
        delete peerConnections.current[peerId]
      }
    }
  }, [])

  const monitorPeerConnection = useCallback((peerId, pc) => {
    if (!pc) return
    
    // Grace period: tolerate 'disconnected' for up to 12s before acting.
    // Only immediately act on 'failed'. This avoids killing peers that are
    // briefly flapping due to network hiccups or route changes.
    const DISCONNECTED_GRACE_MS = 12000
    
    const interval = setInterval(() => {
      if (!pc || pc.connectionState === 'closed') {
        // Connection already torn down, stop monitoring
        delete peerDisconnectedGraceRef.current[peerId]
        // Clean up ICE retry interval
        const retryKey = `ice_retry_${peerId}`
        const retryState = iceRetryStateRef.current.get(retryKey)
        if (retryState?.intervalId) {
          clearInterval(retryState.intervalId)
          iceRetryStateRef.current.delete(retryKey)
        }
        clearInterval(interval)
        return
      }
      
      const iceState = pc.iceConnectionState
      
      if (iceState === 'failed') {
        console.log(`[Voice] Peer ${peerId} ICE failed, attempting graceful recovery`)
        delete peerDisconnectedGraceRef.current[peerId]
        gracefulReconnect(peerId)
        return
      }
      
      if (iceState === 'disconnected') {
        const now = Date.now()
        if (!peerDisconnectedGraceRef.current[peerId]) {
          // First time seeing disconnected — start grace timer
          peerDisconnectedGraceRef.current[peerId] = now
          console.log(`[Voice] Monitor: peer ${peerId} disconnected — grace period started (${DISCONNECTED_GRACE_MS}ms)`)
          return
        }
        const elapsed = now - peerDisconnectedGraceRef.current[peerId]
        if (elapsed >= DISCONNECTED_GRACE_MS) {
          console.log(`[Voice] Monitor: peer ${peerId} disconnected for ${elapsed}ms — exceeds grace, restarting ICE`)
          delete peerDisconnectedGraceRef.current[peerId]
          try { pc.restartIce() } catch { gracefulReconnect(peerId) }
        }
        return
      }
      
      // Peer recovered or is connected/checking — clear grace timer
      if (peerDisconnectedGraceRef.current[peerId]) {
        console.log(`[Voice] Monitor: peer ${peerId} recovered from disconnected state (now ${iceState})`)
        delete peerDisconnectedGraceRef.current[peerId]
      }
    }, 5000)
    
    return () => {
      clearInterval(interval)
      delete peerDisconnectedGraceRef.current[peerId]
    }
  }, [gracefulReconnect])

  const isLikelyScreenAudioTrack = useCallback((userId, track, stream) => {
    if (!track) return false
    const label = (track.label || '').toLowerCase()
    if (label.includes('screen') || label.includes('display') || label.includes('window') || label.includes('tab') || label.includes('system')) {
      return true
    }
    const participant = participantsRef.current.find(p => p.id === userId)
    const streamHasScreenVideo = !!stream?.getVideoTracks?.().some(v => {
      const vLabel = (v.label || '').toLowerCase()
      return vLabel.includes('screen') || vLabel.includes('display') || vLabel.includes('window') || vLabel.includes('monitor')
    })
    return !!participant?.isScreenSharing && streamHasScreenVideo
  }, [])

  const setLocalUserSetting = useCallback((userId, patch) => {
    setLocalUserSettings(prev => {
      const next = { ...prev, [userId]: { ...(prev[userId] || { muted: false, volume: 100, screenShareMuted: false }), ...patch } }
      try {
        // Persist only volume so stale mute flags don't survive app restarts.
        const persisted = Object.fromEntries(
          Object.entries(next).map(([id, settings]) => [id, { volume: settings?.volume ?? 100 }])
        )
        localStorage.setItem('voltchat_local_user_settings', JSON.stringify(persisted))
      } catch {}
      applyLocalUserSetting(userId, next[userId])
      return next
    })
  }, [applyLocalUserSetting])

  useEffect(() => {
    participantsRef.current = participants
  }, [participants])

  const applyReceiverLatencyHints = useCallback((pc, peerId = 'unknown') => {
    if (!pc?.getReceivers) return
    const receivers = pc.getReceivers()
    receivers.forEach(receiver => {
      try {
        if (!receiver?.track) return
        const isVideo = receiver.track.kind === 'video'
        if (typeof receiver.playoutDelayHint !== 'undefined') {
          receiver.playoutDelayHint = 0
        }
        if (typeof receiver.jitterBufferTarget !== 'undefined') {
          receiver.jitterBufferTarget = isVideo ? 0 : 10
        }
      } catch (err) {
        console.warn(`[WebRTC] Failed to apply latency hints for ${peerId}:`, err.message)
      }
    })
  }, [])

  const applyLowDelayModeToAllPeers = useCallback(() => {
    Object.entries(peerConnections.current).forEach(([peerId, pc]) => {
      applyReceiverLatencyHints(pc, peerId)
    })
  }, [applyReceiverLatencyHints])

  const clearRemoteVideoState = useCallback((userId, { onlyIfScreen = false } = {}) => {
    const stream = remoteStreams.current[userId]
    if (onlyIfScreen && stream) {
      const hasScreenTrack = stream.getVideoTracks().some(track => {
        const label = (track.label || '').toLowerCase()
        return label.includes('screen') || label.includes('monitor') || label.includes('display')
      })
      if (!hasScreenTrack) return
    }

    if (stream) {
      stream.getVideoTracks().forEach(track => {
        try { stream.removeTrack(track) } catch {}
      })
      if (stream.getTracks().length === 0) {
        delete remoteStreams.current[userId]
      }
    }

    const videoEl = videoElements.current[userId]
    if (videoEl) {
      try { videoEl.pause() } catch {}
      videoEl.srcObject = null
    }

    setVideoStreams(prev => {
      if (!prev[userId]) return prev
      const next = { ...prev }
      delete next[userId]
      return next
    })

    setParticipants(prev => prev.map(p => (
      p?.id === userId
        ? { ...p, hasVideo: false, videoStream: null, isScreenSharing: false }
        : p
    )).filter(p => p?.id))
  }, [])

  const clearRemoteVideoMuteTimer = useCallback((userId) => {
    const timer = remoteVideoMuteTimersRef.current[userId]
    if (!timer) return
    clearTimeout(timer)
    delete remoteVideoMuteTimersRef.current[userId]
  }, [])

  const scheduleRemoteVideoMuteClear = useCallback((userId, track, delayMs = 4000) => {
    clearRemoteVideoMuteTimer(userId)
    remoteVideoMuteTimersRef.current[userId] = setTimeout(() => {
      delete remoteVideoMuteTimersRef.current[userId]
      if (track?.readyState !== 'live' || track?.muted) {
        console.log(`[WebRTC] Video track stayed muted for ${userId} >${delayMs}ms, clearing UI state`)
        clearRemoteVideoState(userId)
      }
    }, delayMs)
  }, [clearRemoteVideoMuteTimer, clearRemoteVideoState])

  // Rebuild peer mesh in-place without leaving the voice channel.
  // This avoids "random kicks" when server requests a reconnect.
  const performInPlaceReconnect = useCallback((reason = 'force-reconnect') => {
    const activeChannelId = channelIdRef.current
    if (!activeChannelId || !hasJoinedRef.current || !user?.id) return

    const now = Date.now()
    if (now - lastForceReconnectAtRef.current < 4000) {
      console.log(`[Voice] Ignoring duplicate reconnect request (${reason})`)
      return
    }
    lastForceReconnectAtRef.current = now

    if (softReconnectInProgressRef.current) {
      console.log(`[Voice] Reconnect already in progress (${reason})`)
      return
    }
    softReconnectInProgressRef.current = true

    console.log(`[Voice] Performing in-place reconnect: ${reason}`)

    // Close all existing peer mesh links and clear per-peer state.
    Object.values(peerConnections.current).forEach(pc => {
      try { pc.close() } catch {}
    })
    peerConnections.current = {}

    Object.entries(audioElements.current).forEach(([key, node]) => {
      if (key.includes('__webaudio')) {
        try { node?.disconnect() } catch {}
      } else if (node?.pause) {
        try { node.pause() } catch {}
        node.srcObject = null
        if (node.parentNode) node.parentNode.removeChild(node)
      }
    })
    audioElements.current = {}

    Object.entries(videoElements.current).forEach(([, node]) => {
      if (!node?.pause) return
      try { node.pause() } catch {}
      node.srcObject = null
      if (node.parentNode) node.parentNode.removeChild(node)
    })
    videoElements.current = {}

    Object.values(remoteAnalysersRef.current).forEach(entry => {
      try { entry?.audioContext?.close()?.catch(() => {}) } catch {}
    })
    remoteAnalysersRef.current = {}
    remoteStreams.current = {}

    makingOfferRef.current = {}
    ignoreOfferRef.current = {}
    remoteDescSetRef.current = {}
    pendingCandidatesRef.current = {}
    lastOfferTimeRef.current = {}
    negotiationLockRef.current = {}
    negotiationCompleteRef.current = {}
    signalChainRef.current = {}
    isSettingRemoteAnswerPendingRef.current = {}

    connectionQueueRef.current = []
    isProcessingQueueRef.current = false
    activeNegotiationsRef.current = 0
    pendingPeerCountRef.current = 0
    isMassJoinInProgressRef.current = false

    setPeerStates({})
    setSpeaking({})
    setVideoStreams({})
    setParticipants(prev => prev.filter(p => p.id === user?.id))

    if (socket?.connected) {
      socket.emit('voice:join', {
        channelId: activeChannelId,
        peerId: user.id
      })
      socket.emit('voice:get-participants', { channelId: activeChannelId })
      console.log('[Voice] Re-emitted voice:join for in-place reconnect')
    } else {
      console.log('[Voice] Socket disconnected during in-place reconnect, waiting for reconnect')
    }

    setTimeout(() => {
      softReconnectInProgressRef.current = false
    }, 1500)
  }, [socket, user?.id])

  useEffect(() => {
    return () => {
      Object.values(remoteVideoMuteTimersRef.current).forEach(timer => clearTimeout(timer))
      remoteVideoMuteTimersRef.current = {}
    }
  }, [])

  // Helper to update all peer connections with a new audio track
  const updateAllPeerTracks = useCallback((track) => {
    Object.values(peerConnections.current).forEach(pc => {
      try {
        const senders = pc.getSenders()
        const audioSender = senders.find((s) => {
          if (s.track?._senderTag === 'mic') return true
          if (s.track?.kind === 'audio' && s.track?._senderTag !== 'screen-audio') return true
          const tx = pc.getTransceivers?.().find(t => t.sender === s)
          return tx?.receiver?.track?.kind === 'audio'
        })
        if (audioSender) {
          audioSender.replaceTrack(track || null).catch(() => {})
        }
      } catch (e) {
        console.warn('[VoiceFX] Failed to update peer track:', e)
      }
    })
  }, [])

  // Apply VoiceFX effect to the audio chain
  const applyVoiceFXEffect = useCallback((effectName, effectParams) => {
    console.log('[VoiceFX] Applying effect:', effectName, effectParams)
    setVoiceFXEffect(effectName || 'none')
    setVoiceFXParams(effectParams || {})
    setVoiceFXEnabled(effectName !== 'none')
    
    const audioContext = analyserRef.current?.audioContext
    const source = voiceFXSourceRef.current
    const destination = voiceFXDestinationRef.current
    const dryGain = voiceFXDryGainRef.current
    const wetGain = voiceFXWetGainRef.current
    
    if (!audioContext || !source || !destination || !dryGain || !wetGain) {
      console.log('[VoiceFX] Missing audio nodes, cannot apply effect')
      return
    }

    // Check if audio context is still valid (not closed)
    if (audioContext.state === 'closed') {
      console.log('[VoiceFX] AudioContext is closed, cannot apply effect')
      return
    }

    const restorePassthrough = () => {
      try { source.disconnect(dryGain) } catch {}
      try { source.disconnect(wetGain) } catch {}
      try { dryGain.disconnect() } catch {}
      try { wetGain.disconnect() } catch {}
      try {
        source.connect(dryGain)
        dryGain.connect(destination)
        dryGain.gain.value = 1
        wetGain.gain.value = 0
      } catch (e) {
        console.warn('[VoiceFX] Failed to restore passthrough graph:', e)
      }
      const passthroughTrack = destination.stream.getAudioTracks()[0] || originalAudioTrackRef.current
      if (passthroughTrack) {
        passthroughTrack._senderTag = 'mic'
        activeOutboundAudioTrackRef.current = passthroughTrack
        activeOutboundAudioStreamRef.current = destination.stream
        updateAllPeerTracks(voiceFXPreviewEnabled ? null : passthroughTrack)
      }
    }

    const createProcessor = (bufferSize, inChannels = 1, outChannels = 1) => {
      if (typeof audioContext.createScriptProcessor !== 'function') {
        throw new Error('ScriptProcessorNode is not available in this runtime')
      }
      return audioContext.createScriptProcessor(bufferSize, inChannels, outChannels)
    }

    // Effects that don't require ScriptProcessorNode and can work on Electron
    const electronSafeEffects = ['none', 'reverb', 'delay', 'distortion', 'chorus', 'flanger', 'vibrato', 'radio', 'underwater', 'stadium', 'tunnel', 'broadcast']
    
    if (isElectronRuntime() && effectName && effectName !== 'none' && !electronSafeEffects.includes(effectName)) {
      if (!warnedElectronVoiceFXRef.current) {
        warnedElectronVoiceFXRef.current = true
        console.warn('[VoiceFX] Electron compatibility mode: some effects require ScriptProcessor which can cause renderer crashes. Using simplified version or disabling.')
      }
      // For Electron, use a simplified version or fall back to passthrough
      // Check if we can use the effect without ScriptProcessor
      const effectsNeedingProcessor = ['pitch', 'tremolo', 'robot', 'alien', 'vocoder', 'phone', 'whisper', 'demon', 'helium', 'lofi', 'cyberpunk']
      if (effectsNeedingProcessor.includes(effectName)) {
        // Disable effect that requires ScriptProcessor on Electron
        setVoiceFXEffect('none')
        setVoiceFXParams({})
        setVoiceFXEnabled(false)
        restorePassthrough()
        return
      }
    }

    try {

    // Stop any oscillators BEFORE clearing nodes
    const nodes = voiceFXNodesRef.current
    const oscNames = [
      'osc', 'lfo', 'robotOsc', 'robotLfo', 'robotMod', 'alienOsc', 'alienOsc1', 'alienOsc2', 'alienOsc3',
      'tremoloLfo', 'vibratoLfo', 'chorusLfo0', 'chorusLfo1', 'chorusLfo2', 'flangerLfo'
    ]
    oscNames.forEach(name => {
      if (nodes[name]) {
        try { nodes[name].stop() } catch {}
      }
    })

    // Mark all processors as inactive before disconnecting to prevent postMessage errors
    Object.entries(nodes).forEach(([name, node]) => {
      if (node && typeof node.onaudioprocess === 'function') {
        node._isActive = false
        node.onaudioprocess = null
      }
    })

    // Disconnect all existing effect nodes
    Object.values(nodes).forEach(node => {
      try { node.disconnect() } catch {}
    })
    voiceFXNodesRef.current = {}

    // Reset gains and base routing
    try { dryGain.disconnect() } catch {}
    try { wetGain.disconnect() } catch {}
    try { source.disconnect(dryGain) } catch {}
    try { source.disconnect(wetGain) } catch {}

    if (effectName === 'none' || !effectName) {
      // No effect - direct passthrough
      source.connect(dryGain)
      dryGain.connect(destination)
      dryGain.gain.value = 1
      wetGain.gain.value = 0
      
      // Keep a stable outbound sender track for Chromium/Electron.
      const passthroughTrack = destination.stream.getAudioTracks()[0] || originalAudioTrackRef.current
      if (passthroughTrack) {
        passthroughTrack._senderTag = 'mic'
        activeOutboundAudioTrackRef.current = passthroughTrack
        activeOutboundAudioStreamRef.current = destination.stream
        updateAllPeerTracks(voiceFXPreviewEnabled ? null : passthroughTrack)
      }
      console.log('[VoiceFX] Effect disabled, using original audio')
      return
    }

    const wet = effectParams.wet ?? 0.5
    
    // When effect is active, silence the dry path so we only hear the effect
    dryGain.gain.value = 0
    wetGain.gain.value = 1

    // Connect source to wet path only (effects)
    source.connect(wetGain)

    // Build effect chain on wet path
    let wetChainEnd = wetGain
    
    switch (effectName) {
      case 'pitch': {
        const pitchValue = Math.max(0.25, Math.min(4, effectParams.pitch || 1))
        const sourceProcessor = createProcessor(4096, 1, 1)
        const BUFFER_SIZE = 8192
        const buffer = new Float32Array(BUFFER_SIZE * 2)
        let writePos = 0
        let readPos = 0
        let samplesInBuffer = 0
        
        sourceProcessor._isActive = true
        sourceProcessor.onaudioprocess = (e) => {
          // Guard against closed context or disconnected node
          if (!sourceProcessor._isActive || audioContext.state === 'closed') {
            return
          }
          const inputData = e.inputBuffer.getChannelData(0)
          const outputData = e.outputBuffer.getChannelData(0)
          const bufferLen = buffer.length
          
          for (let i = 0; i < inputData.length; i++) {
            buffer[writePos] = inputData[i]
            writePos = (writePos + 1) % bufferLen
            if (samplesInBuffer < bufferLen) {
              samplesInBuffer++
            }
          }
          
          const step = pitchValue
          let outputIdx = 0
          
          while (outputIdx < outputData.length) {
            if (samplesInBuffer < 2) {
              outputData[outputIdx++] = 0
              continue
            }
            
            const r = Math.floor(readPos)
            const frac = readPos - r
            const r1 = r % bufferLen
            const r2 = (r + 1) % bufferLen
            
            outputData[outputIdx] = buffer[r1] * (1 - frac) + buffer[r2] * frac
            
            readPos += step
            outputIdx++
            
            while (readPos >= samplesInBuffer && samplesInBuffer > 0) {
              readPos -= samplesInBuffer
            }
          }
          
          readPos = readPos % bufferLen
        }
        
        wetGain.disconnect()
        wetGain.connect(sourceProcessor)
        sourceProcessor.connect(destination)
        voiceFXNodesRef.current.pitch = sourceProcessor
        break
      }
      case 'reverb': {
        const decay = effectParams.decay || 2
        const sampleRate = audioContext.sampleRate
        const length = sampleRate * decay
        const impulse = audioContext.createBuffer(2, length, sampleRate)
        
        for (let ch = 0; ch < 2; ch++) {
          const data = impulse.getChannelData(ch)
          for (let i = 0; i < length; i++) {
            const t = i / length
            const envelope = Math.exp(-3 * t)
            const diffusion = (Math.random() * 2 - 1) * 0.5
            const early = i < sampleRate * 0.1 ? Math.sin(i * 0.01) * 0.3 : 0
            data[i] = (diffusion + early) * envelope
          }
        }
        
        const convolver = audioContext.createConvolver()
        convolver.buffer = impulse
        
        wetGain.connect(convolver)
        convolver.connect(destination)
        
        voiceFXNodesRef.current.reverb = convolver
        break
      }
      case 'delay': {
        const delayTime = effectParams.time || 0.3
        const feedback = effectParams.feedback || 0.4
        
        const delay1 = audioContext.createDelay(1)
        delay1.delayTime.value = delayTime
        
        const delay2 = audioContext.createDelay(1)
        delay2.delayTime.value = delayTime * 1.5
        
        const feedbackGain = audioContext.createGain()
        feedbackGain.gain.value = feedback
        
        wetGain.connect(delay1)
        wetGain.connect(delay2)
        delay1.connect(feedbackGain)
        delay2.connect(feedbackGain)
        feedbackGain.connect(delay1)
        feedbackGain.connect(delay2)
        delay1.connect(destination)
        delay2.connect(destination)
        
        voiceFXNodesRef.current.delay1 = delay1
        voiceFXNodesRef.current.delay2 = delay2
        voiceFXNodesRef.current.feedback = feedbackGain
        break
      }
      case 'distortion': {
        const amount = effectParams.amount || 20
        const k = amount / 100
        const n_samples = 256
        const curve = new Float32Array(n_samples)
        
        for (let i = 0; i < n_samples; i++) {
          const x = (i * 2) / n_samples - 1
          if (x > 0) {
            curve[i] = 1 - Math.exp(-x / k)
          } else {
            curve[i] = -1 + Math.exp(x / k)
          }
        }
        
        const waveshaper = audioContext.createWaveShaper()
        waveshaper.curve = curve
        waveshaper.oversample = '4x'
        
        const drive = audioContext.createGain()
        drive.gain.value = 1 + amount / 20
        
        const output = audioContext.createGain()
        output.gain.value = 0.7
        
        wetGain.connect(drive)
        drive.connect(waveshaper)
        waveshaper.connect(output)
        output.connect(destination)
        
        voiceFXNodesRef.current.distortion = waveshaper
        voiceFXNodesRef.current.distortionDrive = drive
        break
      }
      case 'chorus': {
        const rate = effectParams.rate || 1.5
        const depth = effectParams.depth || 0.5
        
        const delays = []
        const lfos = []
        
        for (let i = 0; i < 3; i++) {
          const delay = audioContext.createDelay(1)
          delay.delayTime.value = 0.02 + i * 0.005
          
          const lfo = audioContext.createOscillator()
          lfo.type = 'sine'
          lfo.frequency.value = rate + i * 0.3
          
          const lfoGain = audioContext.createGain()
          lfoGain.gain.value = depth * 0.01
          
          lfo.connect(lfoGain)
          lfoGain.connect(delay.delayTime)
          
          wetGain.connect(delay)
          delay.connect(destination)
          
          lfo.start()
          
          delays.push(delay)
          lfos.push(lfo)
          voiceFXNodesRef.current[`chorusDelay${i}`] = delay
          voiceFXNodesRef.current[`chorusLfo${i}`] = lfo
        }
        break
      }
      case 'flanger': {
        const rate = effectParams.rate || 0.5
        const depth = effectParams.depth || 0.5
        
        const delay = audioContext.createDelay(1)
        delay.delayTime.value = 0.005
        
        const lfo = audioContext.createOscillator()
        lfo.type = 'sine'
        lfo.frequency.value = rate
        
        const lfoGain = audioContext.createGain()
        lfoGain.gain.value = depth * 0.004
        
        const feedback = audioContext.createGain()
        feedback.gain.value = 0.5
        
        lfo.connect(lfoGain)
        lfoGain.connect(delay.delayTime)
        
        wetGain.connect(delay)
        delay.connect(feedback)
        feedback.connect(delay)
        delay.connect(destination)
        
        lfo.start()
        
        voiceFXNodesRef.current.flangerDelay = delay
        voiceFXNodesRef.current.flangerLfo = lfo
        voiceFXNodesRef.current.flangerFeedback = feedback
        break
      }
      case 'tremolo': {
        const rate = effectParams.rate || 5
        const depth = effectParams.depth || 0.5
        
        const lfo = audioContext.createOscillator()
        lfo.type = 'sine'
        lfo.frequency.value = rate
        
        const lfoGain = audioContext.createGain()
        const baseGain = 1 - depth * 0.5
        lfoGain.gain.value = depth * 0.5
        
        const processor = createProcessor(2048, 1, 1)
        let phase = 0
        const twoPi = Math.PI * 2
        
        processor.onaudioprocess = (e) => {
          const input = e.inputBuffer.getChannelData(0)
          const output = e.outputBuffer.getChannelData(0)
          const phaseInc = twoPi * rate / audioContext.sampleRate
          
          for (let i = 0; i < input.length; i++) {
            const mod = baseGain + lfoGain.gain.value * Math.sin(phase)
            output[i] = input[i] * mod
            phase += phaseInc
            if (phase > twoPi) phase -= twoPi
          }
        }
        
        wetGain.connect(processor)
        processor.connect(destination)
        
        lfo.start()
        
        voiceFXNodesRef.current.tremoloLfo = lfo
        voiceFXNodesRef.current.tremoloProcessor = processor
        break
      }
      case 'vibrato': {
        const rate = effectParams.rate || 5
        const depth = effectParams.depth || 0.3
        
        const delay = audioContext.createDelay(1)
        delay.delayTime.value = 0.01
        
        const lfo = audioContext.createOscillator()
        lfo.type = 'sine'
        lfo.frequency.value = rate
        
        const lfoGain = audioContext.createGain()
        lfoGain.gain.value = depth * 0.02
        
        lfo.connect(lfoGain)
        lfoGain.connect(delay.delayTime)
        
        wetGain.connect(delay)
        delay.connect(destination)
        
        lfo.start()
        
        voiceFXNodesRef.current.vibratoLfo = lfo
        voiceFXNodesRef.current.vibratoDelay = delay
        break
      }
      case 'robot': {
        const freq = effectParams.freq || 55
        const modDepth = effectParams.modDepth || 0.7
        
        const osc = audioContext.createOscillator()
        osc.type = 'square'
        osc.frequency.value = freq
        
        const processor = createProcessor(2048, 1, 1)
        let phase = 0
        const twoPi = Math.PI * 2
        
        processor.onaudioprocess = (e) => {
          const input = e.inputBuffer.getChannelData(0)
          const output = e.outputBuffer.getChannelData(0)
          const phaseInc = twoPi * freq / audioContext.sampleRate
          
          for (let i = 0; i < input.length; i++) {
            const mod = (1 - modDepth) + modDepth * Math.sin(phase)
            output[i] = input[i] * mod
            phase += phaseInc
            if (phase > twoPi) phase -= twoPi
          }
        }
        
        const filter = audioContext.createBiquadFilter()
        filter.type = 'lowpass'
        filter.frequency.value = 2500
        filter.Q.value = 3
        
        wetGain.connect(processor)
        processor.connect(filter)
        filter.connect(destination)
        
        osc.start()
        
        voiceFXNodesRef.current.robotOsc = osc
        voiceFXNodesRef.current.robotProcessor = processor
        voiceFXNodesRef.current.robotFilter = filter
        break
      }
      case 'alien': {
        const freq = effectParams.freq || 100
        const wetValue = effectParams.wet || 0.6
        
        const osc = audioContext.createOscillator()
        osc.type = 'sine'
        osc.frequency.value = freq
        
        const processor = createProcessor(2048, 1, 1)
        let phase = 0
        const twoPi = Math.PI * 2
        
        processor.onaudioprocess = (e) => {
          const input = e.inputBuffer.getChannelData(0)
          const output = e.outputBuffer.getChannelData(0)
          const phaseInc = twoPi * freq / audioContext.sampleRate
          const mix1 = 1 - wetValue
          const mix2 = wetValue
          
          for (let i = 0; i < input.length; i++) {
            const mod = Math.sin(phase)
            const dry = input[i] * mix1
            const wet = input[i] * mod * mix2
            output[i] = dry + wet
            phase += phaseInc
            if (phase > twoPi) phase -= twoPi
          }
        }
        
        const highpass = audioContext.createBiquadFilter()
        highpass.type = 'highpass'
        highpass.frequency.value = 200
        
        const lowpass = audioContext.createBiquadFilter()
        lowpass.type = 'lowpass'
        lowpass.frequency.value = 4000
        
        wetGain.connect(processor)
        processor.connect(highpass)
        highpass.connect(lowpass)
        lowpass.connect(destination)
        
        osc.start()
        
        voiceFXNodesRef.current.alienOsc = osc
        voiceFXNodesRef.current.alienProcessor = processor
        break
      }
      case 'radio': {
        const highpass = audioContext.createBiquadFilter()
        highpass.type = 'highpass'
        highpass.frequency.value = 400
        
        const lowpass = audioContext.createBiquadFilter()
        lowpass.type = 'lowpass'
        lowpass.frequency.value = 2600
        
        const bandpass = audioContext.createBiquadFilter()
        bandpass.type = 'bandpass'
        bandpass.frequency.value = 1200
        bandpass.Q.value = 1
        
        const compressor = audioContext.createDynamicsCompressor()
        compressor.threshold.value = -20
        compressor.knee.value = 10
        compressor.ratio.value = 4
        compressor.attack.value = 0.005
        compressor.release.value = 0.1
        
        const processor = createProcessor(2048, 1, 1)
        processor.onaudioprocess = (e) => {
          const input = e.inputBuffer.getChannelData(0)
          const output = e.outputBuffer.getChannelData(0)
          
          for (let i = 0; i < input.length; i++) {
            const s = input[i]
            output[i] = Math.tanh(s * 2) * 0.8
          }
        }
        
        wetGain.connect(highpass)
        highpass.connect(lowpass)
        lowpass.connect(bandpass)
        bandpass.connect(compressor)
        compressor.connect(processor)
        processor.connect(destination)
        
        voiceFXNodesRef.current.radioHighpass = highpass
        voiceFXNodesRef.current.radioLowpass = lowpass
        voiceFXNodesRef.current.radioBand = bandpass
        voiceFXNodesRef.current.radioCompressor = compressor
        break
      }
      case 'vocoder': {
        const processor = createProcessor(4096, 1, 1)
        
        const bandFreqs = [300, 500, 700, 1000, 1400, 2000, 2800, 4000]
        
        const filters = bandFreqs.map(freq => {
          const filter = audioContext.createBiquadFilter()
          filter.type = 'bandpass'
          filter.frequency.value = freq
          filter.Q.value = 8
          return filter
        })
        
        const envs = new Array(bandFreqs.length).fill(0)
        const envAttack = 0.15
        const envRelease = 0.3
        
        processor.onaudioprocess = (e) => {
          const input = e.inputBuffer.getChannelData(0)
          const output = e.outputBuffer.getChannelData(0)
          const frameSize = Math.floor(input.length / bandFreqs.length)
          
          for (let b = 0; b < bandFreqs.length; b++) {
            let sum = 0
            const start = b * frameSize
            const end = Math.min(start + frameSize, input.length)
            for (let i = start; i < end; i++) {
              sum += Math.abs(input[i])
            }
            const level = sum / (end - start)
            
            const target = level * 4
            if (target > envs[b]) {
              envs[b] = envs[b] + (target - envs[b]) * envAttack
            } else {
              envs[b] = envs[b] + (target - envs[b]) * envRelease
            }
          }
          
          for (let i = 0; i < output.length; i++) {
            const bandIdx = Math.floor((i / input.length) * bandFreqs.length)
            const env = envs[Math.min(bandIdx, bandFreqs.length - 1)]
            output[i] = input[i] * (0.3 + env * 0.7) * 0.8
          }
        }
        
        wetGain.connect(processor)
        processor.connect(destination)
        
        voiceFXNodesRef.current.vocoderProcessor = processor
        break
      }
      case 'phone': {
        const lowpass = audioContext.createBiquadFilter()
        lowpass.type = 'lowpass'
        lowpass.frequency.value = 1800
        
        const highpass = audioContext.createBiquadFilter()
        highpass.type = 'highpass'
        highpass.frequency.value = 300
        
        const processor = createProcessor(2048, 1, 1)
        processor.onaudioprocess = (e) => {
          const input = e.inputBuffer.getChannelData(0)
          const output = e.outputBuffer.getChannelData(0)
          
          for (let i = 0; i < input.length; i++) {
            output[i] = Math.round(input[i] * 127) / 128
          }
        }
        
        wetGain.connect(highpass)
        highpass.connect(lowpass)
        lowpass.connect(processor)
        processor.connect(destination)
        
        voiceFXNodesRef.current.phoneLowpass = lowpass
        voiceFXNodesRef.current.phoneHighpass = highpass
        break
      }
      case 'megaphone': {
        const drive = effectParams.drive || 1.8
        const tone = effectParams.tone || 1500
        const highpass = audioContext.createBiquadFilter()
        highpass.type = 'highpass'
        highpass.frequency.value = 450
        const band = audioContext.createBiquadFilter()
        band.type = 'bandpass'
        band.frequency.value = tone
        band.Q.value = 1.2
        const shaper = audioContext.createWaveShaper()
        const curve = new Float32Array(256)
        for (let i = 0; i < curve.length; i++) {
          const x = (i / 128) - 1
          curve[i] = Math.tanh(x * drive)
        }
        shaper.curve = curve
        shaper.oversample = '2x'
        wetGain.connect(highpass)
        highpass.connect(band)
        band.connect(shaper)
        shaper.connect(destination)
        voiceFXNodesRef.current.megaphoneBand = band
        break
      }
      case 'whisper': {
        const airy = effectParams.airy ?? 0.65
        const highpass = audioContext.createBiquadFilter()
        highpass.type = 'highpass'
        highpass.frequency.value = 1000
        const noiseGain = audioContext.createGain()
        noiseGain.gain.value = Math.max(0, Math.min(0.3, airy * 0.25))
        const noise = createProcessor(2048, 1, 1)
        noise.onaudioprocess = (e) => {
          const input = e.inputBuffer.getChannelData(0)
          const output = e.outputBuffer.getChannelData(0)
          for (let i = 0; i < input.length; i++) {
            output[i] = (input[i] * 0.45) + ((Math.random() * 2 - 1) * noiseGain.gain.value)
          }
        }
        wetGain.connect(highpass)
        highpass.connect(noise)
        noise.connect(destination)
        voiceFXNodesRef.current.whisperNoise = noise
        break
      }
      case 'demon': {
        const pitchValue = effectParams.pitch || 0.68
        const drive = effectParams.drive || 1.6
        const pitchProcessor = createProcessor(4096, 1, 1)
        const ringBuffer = new Float32Array(16384)
        let writePos = 0
        let readPos = 0
        pitchProcessor.onaudioprocess = (e) => {
          const input = e.inputBuffer.getChannelData(0)
          const output = e.outputBuffer.getChannelData(0)
          for (let i = 0; i < input.length; i++) {
            ringBuffer[writePos] = input[i]
            writePos = (writePos + 1) % ringBuffer.length
            const p1 = Math.floor(readPos) % ringBuffer.length
            const p2 = (p1 + 1) % ringBuffer.length
            const frac = readPos - Math.floor(readPos)
            const sample = ringBuffer[p1] * (1 - frac) + ringBuffer[p2] * frac
            output[i] = Math.tanh(sample * drive)
            readPos += pitchValue
            if (readPos >= ringBuffer.length) readPos -= ringBuffer.length
          }
        }
        wetGain.connect(pitchProcessor)
        pitchProcessor.connect(destination)
        voiceFXNodesRef.current.demonPitch = pitchProcessor
        break
      }
      case 'helium': {
        const pitchValue = effectParams.pitch || 1.55
        const processor = createProcessor(4096, 1, 1)
        const ringBuffer = new Float32Array(16384)
        let writePos = 0
        let readPos = 0
        processor.onaudioprocess = (e) => {
          const input = e.inputBuffer.getChannelData(0)
          const output = e.outputBuffer.getChannelData(0)
          for (let i = 0; i < input.length; i++) {
            ringBuffer[writePos] = input[i]
            writePos = (writePos + 1) % ringBuffer.length
            const p1 = Math.floor(readPos) % ringBuffer.length
            const p2 = (p1 + 1) % ringBuffer.length
            const frac = readPos - Math.floor(readPos)
            output[i] = ringBuffer[p1] * (1 - frac) + ringBuffer[p2] * frac
            readPos += pitchValue
            if (readPos >= ringBuffer.length) readPos -= ringBuffer.length
          }
        }
        wetGain.connect(processor)
        processor.connect(destination)
        voiceFXNodesRef.current.heliumPitch = processor
        break
      }
      case 'underwater': {
        const depth = effectParams.depth || 0.55
        const lowpass = audioContext.createBiquadFilter()
        lowpass.type = 'lowpass'
        lowpass.frequency.value = 850 + ((1 - depth) * 1400)
        const comb = audioContext.createDelay(1)
        comb.delayTime.value = 0.015 + (depth * 0.01)
        const fb = audioContext.createGain()
        fb.gain.value = 0.25 + depth * 0.35
        wetGain.connect(lowpass)
        lowpass.connect(comb)
        comb.connect(fb)
        fb.connect(comb)
        comb.connect(destination)
        voiceFXNodesRef.current.underwaterComb = comb
        break
      }
      case 'stadium': {
        const decay = effectParams.decay || 1.8
        const sampleRate = audioContext.sampleRate
        const length = Math.floor(sampleRate * Math.max(0.2, decay))
        const impulse = audioContext.createBuffer(2, length, sampleRate)
        for (let c = 0; c < 2; c++) {
          const data = impulse.getChannelData(c)
          for (let i = 0; i < length; i++) {
            const t = i / length
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.2)
          }
        }
        const convolver = audioContext.createConvolver()
        convolver.buffer = impulse
        wetGain.connect(convolver)
        convolver.connect(destination)
        voiceFXNodesRef.current.stadiumVerb = convolver
        break
      }
      case 'tunnel': {
        const freq = effectParams.freq || 700
        const q = effectParams.q || 8
        const notch = audioContext.createBiquadFilter()
        notch.type = 'bandpass'
        notch.frequency.value = freq
        notch.Q.value = q
        wetGain.connect(notch)
        notch.connect(destination)
        voiceFXNodesRef.current.tunnelBand = notch
        break
      }
      case 'broadcast': {
        const presence = effectParams.presence || 2600
        const hp = audioContext.createBiquadFilter()
        hp.type = 'highpass'
        hp.frequency.value = 120
        const lp = audioContext.createBiquadFilter()
        lp.type = 'lowpass'
        lp.frequency.value = 7800
        const peaking = audioContext.createBiquadFilter()
        peaking.type = 'peaking'
        peaking.frequency.value = presence
        peaking.Q.value = 1
        peaking.gain.value = 6
        const comp = audioContext.createDynamicsCompressor()
        comp.threshold.value = -22
        comp.ratio.value = 3
        comp.attack.value = 0.003
        comp.release.value = 0.12
        wetGain.connect(hp)
        hp.connect(lp)
        lp.connect(peaking)
        peaking.connect(comp)
        comp.connect(destination)
        voiceFXNodesRef.current.broadcastComp = comp
        break
      }
      case 'lofi': {
        const bits = effectParams.bits || 7
        const cutoff = effectParams.cutoff || 3800
        const lowpass = audioContext.createBiquadFilter()
        lowpass.type = 'lowpass'
        lowpass.frequency.value = cutoff
        const crusher = createProcessor(2048, 1, 1)
        const step = Math.pow(0.5, bits)
        crusher.onaudioprocess = (e) => {
          const input = e.inputBuffer.getChannelData(0)
          const output = e.outputBuffer.getChannelData(0)
          for (let i = 0; i < input.length; i++) {
            output[i] = Math.round(input[i] / step) * step
          }
        }
        wetGain.connect(lowpass)
        lowpass.connect(crusher)
        crusher.connect(destination)
        voiceFXNodesRef.current.lofiCrusher = crusher
        break
      }
      case 'cyberpunk': {
        const rate = effectParams.rate || 3.2
        const wetAmount = effectParams.wet || 0.4
        const delay = audioContext.createDelay(1)
        delay.delayTime.value = 0.008
        const lfo = audioContext.createOscillator()
        lfo.frequency.value = rate
        const lfoGain = audioContext.createGain()
        lfoGain.gain.value = 0.0035
        const mix = audioContext.createGain()
        mix.gain.value = wetAmount
        lfo.connect(lfoGain)
        lfoGain.connect(delay.delayTime)
        wetGain.connect(delay)
        delay.connect(mix)
        mix.connect(destination)
        lfo.start()
        voiceFXNodesRef.current.cyberLfo = lfo
        break
      }
      default:
        // Safe fallback: pass wet path directly if no effect chain matched.
        wetGain.connect(destination)
        break
    }

    // Get the processed audio track and replace in stream + peers
    const processedTrack = destination.stream.getAudioTracks()[0]
    if (!processedTrack) {
      console.warn('[VoiceFX] No processed track found in destination stream')
      return
    }
    // Keep the original mic stream stable and only swap outbound sender tracks.
    // Mutating localStream tracks can destabilize desktop webviews.
    processedTrack._senderTag = 'mic'
    activeOutboundAudioTrackRef.current = processedTrack
    activeOutboundAudioStreamRef.current = destination.stream
    updateAllPeerTracks(voiceFXPreviewEnabled ? null : processedTrack)
    
    console.log('[VoiceFX] Applied effect:', effectName)
    } catch (err) {
      console.error('[VoiceFX] Failed to apply effect. Falling back to none:', err)
      setVoiceFXEffect('none')
      setVoiceFXParams({})
      setVoiceFXEnabled(false)
      restorePassthrough()
    }
  }, [voiceFXPreviewEnabled, updateAllPeerTracks])

  const handleVoiceFXPreviewToggle = useCallback((enabled) => {
    setVoiceFXPreviewEnabled(enabled)
    const destination = voiceFXDestinationRef.current
    if (!destination) return

    if (!voiceFXPreviewAudioRef.current) {
      const previewEl = new Audio()
      previewEl.autoplay = false
      previewEl.playsInline = true
      previewEl.muted = false
      previewEl.volume = 1
      voiceFXPreviewAudioRef.current = previewEl
    }

    const previewEl = voiceFXPreviewAudioRef.current
    if (enabled) {
      previewEl.srcObject = destination.stream
      previewEl.play().catch(() => {})
      updateAllPeerTracks(null)
    } else {
      try { previewEl.pause() } catch {}
      const activeTrack = activeOutboundAudioTrackRef.current || originalAudioTrackRef.current || null
      updateAllPeerTracks(activeTrack)
      // Re-apply current effect graph so peers always get a valid outbound sender track after preview mode.
      const effectName = voiceFXEnabled ? (voiceFXEffect || 'none') : 'none'
      const effectParams = voiceFXEnabled ? (voiceFXParams || {}) : {}
      setTimeout(() => applyVoiceFXEffect(effectName, effectParams), 0)
    }
  }, [updateAllPeerTracks, applyVoiceFXEffect, voiceFXEnabled, voiceFXEffect, voiceFXParams])

  useEffect(() => {
    return () => {
      if (voiceFXPreviewAudioRef.current) {
        try { voiceFXPreviewAudioRef.current.pause() } catch {}
        voiceFXPreviewAudioRef.current.srcObject = null
      }
      voiceFXPreviewAudioRef.current = null
    }
  }, [])

  // Re-apply saved local user settings whenever audio elements are (re)created
  useEffect(() => {
    Object.entries(localUserSettings).forEach(([userId, settings]) => {
      applyLocalUserSetting(userId, settings)
    })
  }, [peerStates]) // runs when peer connections change

  // Live settings — apply output volume + output device changes immediately
  useEffect(() => {
    const unsub = settingsService.subscribe((newSettings) => {
      const globalVol = Math.max(0, Math.min(1, (newSettings.volume ?? 100) / 100))
      const globallyMuted = !!newSettings.muteAll || !!currentDeafened
      // Apply to all active remote audio elements
      Object.entries(audioElements.current).forEach(([key, el]) => {
        if (key.includes('__webaudio')) return
        if (el instanceof HTMLMediaElement) {
          const userId = key.includes('__') ? key.split('__')[0] : key
          const userVol = Math.max(0, Math.min(1, ((localUserSettings[userId]?.volume ?? 100) / 100)))
          el.volume = globalVol * userVol
          const isScreen = key.includes('__screen')
          const userMuted = isScreen
            ? !!localUserSettings[userId]?.screenShareMuted
            : !!localUserSettings[userId]?.muted
          el.muted = globallyMuted || userMuted
          // Keep sink in sync with settings, including explicit default fallback.
          applyOutputDevice(el, newSettings.outputDevice)
        }
      })
      // Apply input volume via gain node if available
      if (analyserRef.current?.gainNode) {
        analyserRef.current.gainNode.gain.value = Math.max(0, Math.min(2, (newSettings.inputVolume ?? 100) / 100))
      }
    })
    return unsub
  }, [applyOutputDevice, localUserSettings, currentDeafened])

  // When externalDeafened changes (e.g. from sidebar button), apply audio muting
  useEffect(() => {
    if (externalDeafened === undefined) return
    const deafened = externalDeafened
    Object.entries(audioElements.current).forEach(([key, el]) => {
      if (key.includes('__webaudio')) return
      if (el instanceof HTMLMediaElement) el.muted = deafened
    })
    if (deafened) {
      localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = false })
    } else {
      // Restore mic based on current mute state
      const muted = externalMuted !== undefined ? externalMuted : localIsMuted
      localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !muted })
    }
  }, [externalDeafened])

  // Keep refs updated
  useEffect(() => {
    channelIdRef.current = channel?.id
  }, [channel?.id])
  
  useEffect(() => {
    localStreamRef.current = localStream
  }, [localStream])

  useEffect(() => {
    localVideoStreamRef.current = localVideoStream
  }, [localVideoStream])

  useEffect(() => {
    screenStreamRef.current = screenStream
  }, [screenStream])

  useEffect(() => {
    if (!channel?.id) {
      setCameraOverlays([])
      setScreenOverlays([])
      setOverlayTarget('camera')
      setOverlayStorageChannelId(null)
      return
    }
    const stored = loadVoiceOverlayState(channel.id)
    setCameraOverlays(stored.camera)
    setScreenOverlays(stored.screen)
    setOverlayTarget(stored.target)
    setOverlayStorageChannelId(channel.id)
  }, [channel?.id])

  useEffect(() => {
    if (!channel?.id || overlayStorageChannelId !== channel.id) return
    saveVoiceOverlayState(channel.id, {
      camera: cameraOverlays,
      screen: screenOverlays,
      target: overlayTarget
    })
  }, [cameraOverlays, channel?.id, overlayStorageChannelId, overlayTarget, screenOverlays])

  useEffect(() => {
    if (!isVideoOn || !rawLocalVideoStreamRef.current) return
    const nextStream = buildOverlayCompositeStream('camera', rawLocalVideoStreamRef.current, cameraOverlays)
    setLocalVideoStream(nextStream)
    publishCameraStream(nextStream, { renegotiate: false }).catch(() => {})
  }, [cameraOverlays, buildOverlayCompositeStream, isVideoOn])

  useEffect(() => {
    if (!isScreenSharing || !rawScreenStreamRef.current) return
    const nextStream = buildOverlayCompositeStream('screen', rawScreenStreamRef.current, screenOverlays)
    setScreenStream(nextStream)
    publishScreenStream(nextStream, { renegotiate: false }).catch(() => {})
  }, [screenOverlays, buildOverlayCompositeStream, isScreenSharing])

  // Determine if we are the "polite" peer — lower user ID loses a collision
  const isPolite = useCallback((remoteId) => {
    return (user?.id || '') < remoteId
  }, [user?.id])

  // Tiered connection management helpers for scaling to 100 peers
  const getTierConfig = useCallback(() => {
    const peerCount = Object.keys(peerConnections.current).length + connectionQueueRef.current.length
    if (peerCount <= TIER_CONFIG.small.maxPeers) return TIER_CONFIG.small
    if (peerCount <= TIER_CONFIG.medium.maxPeers) return TIER_CONFIG.medium
    if (peerCount <= TIER_CONFIG.large.maxPeers) return TIER_CONFIG.large
    return TIER_CONFIG.massive
  }, [])

  // Always accept all peer connections - no limit
  const canAcceptPeer = useCallback((peerId) => {
    return true
  }, [])

  // Report peer connection state to server for consensus monitoring
  const reportPeerState = useCallback((targetPeerId, state) => {
    if (!socket?.connected || !channelIdRef.current) return
    socket.emit('voice:peer-state-report', {
      channelId: channelIdRef.current,
      targetPeerId,
      state,
      timestamp: Date.now()
    })
  }, [socket])

  // Multi-peer connection management for stability - supports up to 100 peers
  const connectionQueueRef = useRef([])      // Queue of peer IDs waiting to connect
  const isProcessingQueueRef = useRef(false) // Whether currently processing queue
  const activeNegotiationsRef = useRef(0)    // Current active negotiations
  const activeNegotiationPeersRef = useRef(new Set())
  const connectionCooldownsRef = useRef(new Map()) // peerId -> timestamp of last attempt
  const isMassJoinInProgressRef = useRef(false) // Flag for batch processing
  const pendingPeerCountRef = useRef(0)      // Track expected peer count during mass joins
  const trackedTimeoutsRef = useRef(new Set())
  const connectionAttemptTimersRef = useRef(new Map())
  const participantRemovalTimersRef = useRef(new Map())
  const negotiationReleaseTimersRef = useRef(new Map())
  const peerDisconnectedAtRef = useRef(new Map()) // peerId -> timestamp when disconnected state was first observed
  const peerReconnectStateRef = useRef(new Map()) // peerId -> { attempts, nextAllowedAt, lastReason }
  const forcedInitiatorPeersRef = useRef(new Set()) // peers allowed to bypass owner rule temporarily
  const iceRetryStateRef = useRef(new Map()) // peerId -> { attempts, lastRetry, intervalId }
  const iceTimeoutRef = useRef(new Map()) // peerId -> { startedAt, timerId } for connection timeout

  // Tiered configuration for scaling to 100+ peers
  const TIER_CONFIG = {
    small: { maxPeers: 10, concurrent: 2, cooldown: 1000, staggerBase: 400, staggerPerPeer: 300, batchSize: 10 },
    medium: { maxPeers: 25, concurrent: 2, cooldown: 1500, staggerBase: 800, staggerPerPeer: 500, batchSize: 15 },
    large: { maxPeers: 50, concurrent: 1, cooldown: 2000, staggerBase: 1500, staggerPerPeer: 700, batchSize: 20 },
    massive: { maxPeers: 100, concurrent: 1, cooldown: 3000, staggerBase: 2500, staggerPerPeer: 900, batchSize: 25 }
  }

  // No peer limit - allow all connections
  const priorityPeersRef = useRef(new Set()) // High priority peer IDs (speakers)

  const shouldInitiatePeerConnection = useCallback((peerId, { force = false } = {}) => {
    if (!peerId || peerId === user?.id) return false
    if (force || forcedInitiatorPeersRef.current.has(peerId)) return true
    // Only one side proactively offers to avoid full-mesh offer collisions.
    // The impolite peer (higher stable ID) initiates; the polite peer answers.
    return !isPolite(peerId)
  }, [isPolite, user?.id])

  const getPeerPriorityScore = useCallback((peerId) => {
    const participant = participantsRef.current.find((entry) => entry?.id === peerId)
    let score = 0
    if (priorityPeersRef.current.has(peerId)) score += 1000
    if (participant?.isScreenSharing) score += 600
    if (participant?.hasVideo) score += 200
    const reconnectState = peerReconnectStateRef.current.get(peerId)
    if (reconnectState?.attempts) score -= reconnectState.attempts * 25
    return score
  }, [])

  const sortConnectionQueue = useCallback(() => {
    const uniquePeerIds = [...new Set(connectionQueueRef.current)]
    uniquePeerIds.sort((left, right) => {
      const scoreDelta = getPeerPriorityScore(right) - getPeerPriorityScore(left)
      if (scoreDelta !== 0) return scoreDelta
      return String(left).localeCompare(String(right))
    })
    connectionQueueRef.current = uniquePeerIds
  }, [getPeerPriorityScore])

  const clearPeerReconnectState = useCallback((peerId) => {
    peerReconnectStateRef.current.delete(peerId)
    forcedInitiatorPeersRef.current.delete(peerId)
  }, [])

  const getReconnectDelayMs = useCallback((peerId, reason = 'retry') => {
    const current = peerReconnectStateRef.current.get(peerId) || { attempts: 0, nextAllowedAt: 0, lastReason: null }
    const attempts = Math.min(current.attempts + 1, 6)
    const tier = getTierConfig()
    const multiplier = reason === 'failed' ? 2.4 : reason === 'closed' ? 2.1 : 1.7
    const baseDelay = Math.max(1200, tier.cooldown)
    const jitter = Math.floor(Math.random() * 700)
    const delay = Math.min(30000, Math.round(baseDelay * (multiplier ** attempts) + jitter))
    peerReconnectStateRef.current.set(peerId, {
      attempts,
      nextAllowedAt: Date.now() + delay,
      lastReason: reason
    })
    return delay
  }, [getTierConfig])

  const clearTrackedTimeout = useCallback((timeoutId) => {
    if (!timeoutId) return
    clearTimeout(timeoutId)
    trackedTimeoutsRef.current.delete(timeoutId)
  }, [])

  const scheduleTrackedTimeout = useCallback((fn, delay) => {
    let timeoutId = null
    timeoutId = setTimeout(() => {
      trackedTimeoutsRef.current.delete(timeoutId)
      fn()
    }, delay)
    trackedTimeoutsRef.current.add(timeoutId)
    return timeoutId
  }, [])

  const cancelConnectionAttempt = useCallback((peerId) => {
    const timeoutId = connectionAttemptTimersRef.current.get(peerId)
    if (!timeoutId) return
    clearTrackedTimeout(timeoutId)
    connectionAttemptTimersRef.current.delete(peerId)
  }, [clearTrackedTimeout])

  const cancelPendingPeerRemoval = useCallback((peerId) => {
    const timeoutId = participantRemovalTimersRef.current.get(peerId)
    if (!timeoutId) return
    clearTrackedTimeout(timeoutId)
    participantRemovalTimersRef.current.delete(peerId)
  }, [clearTrackedTimeout])

  const releaseNegotiationSlot = useCallback((peerId) => {
    const releaseTimer = negotiationReleaseTimersRef.current.get(peerId)
    if (releaseTimer) {
      clearTrackedTimeout(releaseTimer)
      negotiationReleaseTimersRef.current.delete(peerId)
    }
    if (!activeNegotiationPeersRef.current.has(peerId)) return
    activeNegotiationPeersRef.current.delete(peerId)
    activeNegotiationsRef.current = Math.max(0, activeNegotiationsRef.current - 1)
    // If there are queued peers waiting, trigger queue processing now that a slot freed up
    if (connectionQueueRef.current.length > 0 && !isProcessingQueueRef.current) {
      // Use a microtask delay to avoid re-entrancy issues
      setTimeout(() => {
        if (connectionQueueRef.current.length > 0 && !isProcessingQueueRef.current) {
          isProcessingQueueRef.current = false // ensure flag is clear
          // processConnectionQueue will be called by the scheduled timeout from the queue
        }
      }, 50)
    }
  }, [clearTrackedTimeout])

  const reserveNegotiationSlot = useCallback((peerId, fallbackDelay = 6500) => {
    if (activeNegotiationPeersRef.current.has(peerId)) return
    activeNegotiationPeersRef.current.add(peerId)
    activeNegotiationsRef.current += 1
    const timerId = scheduleTrackedTimeout(() => {
      releaseNegotiationSlot(peerId)
    }, fallbackDelay)
    negotiationReleaseTimersRef.current.set(peerId, timerId)
  }, [releaseNegotiationSlot, scheduleTrackedTimeout])

  const clearAllScheduledVoiceTimers = useCallback(() => {
    trackedTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId))
    trackedTimeoutsRef.current.clear()
    connectionAttemptTimersRef.current.clear()
    participantRemovalTimersRef.current.clear()
    negotiationReleaseTimersRef.current.clear()
    activeNegotiationPeersRef.current.clear()
    activeNegotiationsRef.current = 0
    forcedInitiatorPeersRef.current.clear()
  }, [])

  const cleanupRemotePeerMedia = useCallback((userId) => {
    ;[userId, `${userId}__screen`].forEach(audioKey => {
      const el = audioElements.current[audioKey]
      if (!(el instanceof HTMLMediaElement)) return
      try { el.pause() } catch {}
      el.srcObject = null
      if (el.parentNode) el.parentNode.removeChild(el)
      delete audioElements.current[audioKey]
    })
    try { audioElements.current[`${userId}__webaudio_source`]?.disconnect() } catch {}
    try { audioElements.current[`${userId}__webaudio_gain`]?.disconnect() } catch {}
    delete audioElements.current[`${userId}__webaudio_source`]
    delete audioElements.current[`${userId}__webaudio_gain`]
    delete audioElements.current[`${userId}__webaudio_ctx`]
    delete remoteStreams.current[userId]

    if (remoteAnalysersRef.current[userId]) {
      try {
        remoteAnalysersRef.current[userId].audioContext?.close()?.catch(() => {})
      } catch {}
      delete remoteAnalysersRef.current[userId]
    }

    setSpeaking(prev => {
      if (!prev[userId]) return prev
      const next = { ...prev }
      delete next[userId]
      return next
    })

    setVideoStreams(prev => {
      if (!prev[userId]) return prev
      const next = { ...prev }
      delete next[userId]
      return next
    })
  }, [])

  const cleanupPeerConnectionState = useCallback((userId) => {
    cancelConnectionAttempt(userId)
    cancelPendingPeerRemoval(userId)
    releaseNegotiationSlot(userId)
    connectionQueueRef.current = connectionQueueRef.current.filter(id => id !== userId)
    connectionCooldownsRef.current.delete(userId)
    clearPeerReconnectState(userId)
    priorityPeersRef.current.delete(userId)
    delete makingOfferRef.current[userId]
    delete ignoreOfferRef.current[userId]
    delete remoteDescSetRef.current[userId]
    delete pendingCandidatesRef.current[userId]
    delete lastOfferTimeRef.current[userId]
    delete negotiationLockRef.current[userId]
    delete negotiationCompleteRef.current[userId]
    delete signalChainRef.current[userId]
    delete isSettingRemoteAnswerPendingRef.current[userId]
  }, [cancelConnectionAttempt, cancelPendingPeerRemoval, releaseNegotiationSlot, clearPeerReconnectState])

  const hardRemovePeer = useCallback((userId, { playSound = false } = {}) => {
    if (!userId) return
    cancelPendingPeerRemoval(userId)
    cleanupPeerConnectionState(userId)
    if (peerConnections.current[userId]) {
      try { peerConnections.current[userId].close() } catch {}
      delete peerConnections.current[userId]
    }
    cleanupRemotePeerMedia(userId)
    setParticipants(prev => prev.filter(p => p?.id !== userId))
    setPeerStates(prev => {
      if (!(userId in prev)) return prev
      const next = { ...prev }
      delete next[userId]
      return next
    })
    if (playSound) {
      soundService.userLeft()
    }
  }, [cancelPendingPeerRemoval, cleanupPeerConnectionState, cleanupRemotePeerMedia])

  const schedulePeerRemoval = useCallback((userId, delay, options = {}) => {
    if (!userId || userId === user?.id) return
    cancelPendingPeerRemoval(userId)
    const timeoutId = scheduleTrackedTimeout(() => {
      participantRemovalTimersRef.current.delete(userId)
      hardRemovePeer(userId, options)
    }, delay)
    participantRemovalTimersRef.current.set(userId, timeoutId)
  }, [cancelPendingPeerRemoval, hardRemovePeer, scheduleTrackedTimeout, user?.id])

  const cleanupAllVideoElements = useCallback(() => {
    Object.entries(videoElements.current).forEach(([, node]) => {
      if (node && node.pause) {
        node.pause()
        node.srcObject = null
        if (node.parentNode) node.parentNode.removeChild(node)
      }
    })
    videoElements.current = {}
    setVideoStreams({})
  }, [])

  const createPeerConnection = useCallback((targetUserId) => {
    // Destroy stale closed/failed connection before creating a new one
    const existing = peerConnections.current[targetUserId]
    if (existing) {
      const state = existing.connectionState
      if (state !== 'closed' && state !== 'failed') return existing
      try { existing.close() } catch {}
    }

    // Reset perfect-negotiation state for this peer
    makingOfferRef.current[targetUserId]    = false
    ignoreOfferRef.current[targetUserId]    = false
    remoteDescSetRef.current[targetUserId]  = false
    pendingCandidatesRef.current[targetUserId] = []
    negotiationCompleteRef.current[targetUserId] = false
    isSettingRemoteAnswerPendingRef.current[targetUserId] = false
    signalChainRef.current[targetUserId] = undefined // Clear any pending signal chain

    const pc = new RTCPeerConnection(buildPeerConfig(serverIceServersRef.current, encryptionEnabledRef.current))
    peerConnections.current[targetUserId] = pc

    // Chrome requires transceivers to exist before negotiation - prevents stalls
    // Only add video transceiver if video is enabled
    ensureTransceivers(pc, isVideoOn)
    
    // Set codec preferences for Chrome - prevents black video
    setCodecPreferences(pc)

    // --- ICE candidates ---
    pc.onicecandidate = (event) => {
      if (!event.candidate || !channelIdRef.current) return
      socket?.emit('voice:ice-candidate', {
        to: targetUserId,
        candidate: event.candidate.toJSON(),
        channelId: channelIdRef.current
      })
    }

    pc.oniceconnectionstatechange = () => {
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
      const isFirefox = ua.includes('Firefox')
      const isSafari = ua.includes('Safari') && !ua.includes('Chrome')
      
      console.log(`[WebRTC] ICE state with ${targetUserId}:`, pc.iceConnectionState)
      
      // Add connection timeout for stuck connections
      if (pc.iceConnectionState === 'new' || pc.iceConnectionState === 'checking') {
        const timeoutKey = `ice_timeout_${targetUserId}`
        let timeoutState = iceTimeoutRef.current.get(timeoutKey)
        
        if (!timeoutState) {
          timeoutState = {
            startedAt: Date.now(),
            timerId: scheduleTrackedTimeout(() => {
              // If still stuck after 15 seconds, force ICE restart
              if (pc.iceConnectionState === 'new' || pc.iceConnectionState === 'checking') {
                console.log(`[WebRTC] ICE stuck in ${pc.iceConnectionState} for ${targetUserId}, forcing restart`)
                try { pc.restartIce() } catch {
                  // If restart fails, recreate connection
                  try { pc.close() } catch {}
                  delete peerConnections.current[targetUserId]
                  scheduleTrackedTimeout(() => {
                    if (channelIdRef.current) createPeerConnection(targetUserId)
                  }, 1000)
                }
              }
              iceTimeoutRef.current.delete(timeoutKey)
            }, 15000)
          }
          iceTimeoutRef.current.set(timeoutKey, timeoutState)
        }
      } else {
        // Clear timeout for other states
        const timeoutKey = `ice_timeout_${targetUserId}`
        const timeoutState = iceTimeoutRef.current.get(timeoutKey)
        if (timeoutState) {
          clearTimeout(timeoutState.timerId)
          iceTimeoutRef.current.delete(timeoutKey)
        }
      }
      
      // Persistent retry - keep trying until connected
      const retryKey = `ice_retry_${targetUserId}`
      let retryState = iceRetryStateRef.current.get(retryKey) || { attempts: 0, lastRetry: 0, intervalId: null }
      
      const shouldRetry = (state) => state === 'failed' || state === 'disconnected' || state === 'new'
      const isConnected = (state) => state === 'connected' || state === 'completed'
      
      if (shouldRetry(pc.iceConnectionState)) {
        // Clear any existing retry interval first
        if (retryState.intervalId) {
          clearInterval(retryState.intervalId)
        }
        
        // Use shorter backoff for cross-browser compatibility
        // Firefox and Safari may need faster retries
        const baseBackoff = isFirefox || isSafari ? 2000 : 3000
        const backoffMs = Math.min(15000, baseBackoff + (retryState.attempts * 500))
        
        const intervalId = setInterval(() => {
          // Stop if connected
          if (isConnected(pc.iceConnectionState)) {
            clearInterval(intervalId)
            retryState.intervalId = null
            iceRetryStateRef.current.delete(retryKey)
            console.log(`[WebRTC] ICE connected with ${targetUserId}, stopped retry`)
            return
          }
          
          // Stop if connection closed
          if (pc.connectionState === 'closed') {
            clearInterval(intervalId)
            retryState.intervalId = null
            return
          }
          
          retryState.attempts++
          console.log(`[WebRTC] ICE retry ${retryState.attempts} for ${targetUserId}`)
          
          try {
            pc.restartIce()
          } catch (e) {
            console.log(`[WebRTC] restartIce failed for ${targetUserId}, recreating connection`)
            clearInterval(intervalId)
            retryState.intervalId = null
            // Close and recreate connection
            try { pc.close() } catch {}
            delete peerConnections.current[targetUserId]
            scheduleTrackedTimeout(() => {
              if (!peerConnections.current[targetUserId] && channelIdRef.current) {
                const newPc = createPeerConnection(targetUserId)
                if (newPc) {
                  iceRetryStateRef.current.delete(retryKey)
                }
              }
            }, 1000)
          }
        }, backoffMs)
        
        retryState.intervalId = intervalId
        retryState.attempts++
        retryState.lastRetry = Date.now()
        iceRetryStateRef.current.set(retryKey, retryState)
        
      } else if (isConnected(pc.iceConnectionState)) {
        // Clear retry interval on successful connection
        if (retryState.intervalId) {
          clearInterval(retryState.intervalId)
        }
        iceRetryStateRef.current.delete(retryKey)
        console.log(`[WebRTC] ICE connected with ${targetUserId}`)
      }
    }

    // Track selected ICE candidate pair for connection info display
    pc.onicecandidatepair = (event) => {
      if (event && event.candidatePair) {
        const pair = event.candidatePair
        const selectedServer = pair.remote?.candidate || pair.local?.candidate || null
        let connectionType = 'unknown'
        
        // Determine connection type from candidate types
        if (selectedServer) {
          const candType = pair.remote?.candidate?.type || pair.local?.candidate?.type
          if (candType === 'host') connectionType = 'host'
          else if (candType === 'srflx') connectionType = 'srflx'  // Server reflexive (STUN)
          else if (candType === 'relay') connectionType = 'relay'  // TURN relay
        }
        
        // Update ICE connection info
        const iceInfo = {
          selectedServer: selectedServer?.split(' ')[4] || selectedServer?.split(' ')[5] || 'unknown',
          candidatePairs: [...iceConnectionInfo.candidatePairs, {
            local: pair.local?.candidate?.ip || 'unknown',
            remote: pair.remote?.candidate?.ip || 'unknown',
            type: connectionType,
            state: pair.state
          }].slice(-10), // Keep last 10
          connectionType
        }
        setIceConnectionInfo(iceInfo)
        console.log(`[WebRTC] ICE candidate pair selected for ${targetUserId}: ${connectionType} (${iceInfo.selectedServer})`)
      }
    }

    pc.onicegatheringstatechange = () => {
      console.log(`[WebRTC] ICE gathering with ${targetUserId}:`, pc.iceGatheringState)
    }

    const getBestInboundAudioTrack = () => {
      try {
        const audioTracks = (pc.getReceivers?.() || [])
          .map(r => r?.track)
          .filter(t => t?.kind === 'audio' && t.readyState === 'live')
        if (!audioTracks.length) return null
        return audioTracks.find(t => !t.muted) || audioTracks[0]
      } catch {
        return null
      }
    }

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState
      console.log(`[WebRTC] Connection state with ${targetUserId}:`, s)

      // Mirror into React state so the UI reflects real peer status
      setPeerStates(prev => ({ ...prev, [targetUserId]: s }))

      // Report peer state to server for consensus monitoring
      reportPeerState(targetUserId, s)
      if (s === 'connected' || s === 'failed' || s === 'closed') {
        releaseNegotiationSlot(targetUserId)
      }

      if (s === 'connected') {
        clearPeerReconnectState(targetUserId)
        applyReceiverLatencyHints(pc, targetUserId)
        const receivers = pc.getReceivers()
        receivers.forEach(r => {
          const t = r.track
          console.log(`[WebRTC] Receiver track: kind=${t?.kind} id=${t?.id?.slice(0,8)} readyState=${t?.readyState} enabled=${t?.enabled} muted=${t?.muted}`)
        })

        // If this PC connected but we have no audio element yet (ontrack fired on
        // a previous PC that was replaced), build the audio pipeline from the
        // receivers directly.  This handles the renegotiation case where the bot
        // creates a new RTCPeerConnection after a collision, and ontrack fires
        // again — but also the case where it doesn't because receivers were
        // inherited from the old PC.
        const track = getBestInboundAudioTrack()
        if (track) {
          const stream = new MediaStream([track])
          const isScreenAudio = isLikelyScreenAudioTrack(targetUserId, track, stream)
          const audioKey = isScreenAudio ? `${targetUserId}__screen` : targetUserId
          const localSettings = localUserSettings[targetUserId] || { muted: false, volume: 100, screenShareMuted: false }
          let audio = audioElements.current[audioKey]
          if (!audio) {
            audio = document.createElement('audio')
            audio.autoplay = true
            audio.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none;opacity:0'
            document.body.appendChild(audio)
            audioElements.current[audioKey] = audio
            
            // Set output device immediately for Chromium/Electron
            const initSettings = settingsService.getSettings()
            applyOutputDevice(audio, initSettings.outputDevice)
            
            console.log(`[WebRTC] Created ${isScreenAudio ? 'screen-share' : 'voice'} audio element on connect for ${targetUserId}`)
          }

          const settings = settingsService.getSettings()
          const userVolume = Math.max(0, Math.min(1, ((localSettings.volume ?? 100) / 100)))
          const globallyMuted = !!settings.muteAll || !!currentDeafened
          audio.srcObject = stream
          audio.volume = Math.max(0, Math.min(1, (settings.volume ?? 100) / 100)) * userVolume
          audio.muted = globallyMuted || (isScreenAudio ? !!localSettings.screenShareMuted : !!localSettings.muted)

          console.log(`[WebRTC] Audio element on connect: paused=${audio.paused} volume=${audio.volume} trackMuted=${track.muted}`)

          const tryPlay = () => {
            audio.play().then(() => {
              console.log(`[WebRTC] play() OK on connect for ${targetUserId}`)
            }).catch(err => {
              console.warn(`[WebRTC] play() blocked on connect: ${err.message}`)
              const retry = () => {
                audio.play().catch(() => {})
                document.removeEventListener('pointerdown', retry, true)
                document.removeEventListener('keydown', retry, true)
              }
              document.addEventListener('pointerdown', retry, true)
              document.addEventListener('keydown', retry, true)
            })
          }

          track.onunmute = () => {
            console.log(`[WebRTC] track.onunmute on connect for ${targetUserId}`)
            audio.srcObject = stream
            tryPlay()
          }

          if (!track.muted) tryPlay()

          // Ensure the audio element is playing when we reach connected state.
          // This handles the case where onunmute fired before connection was ready.
          const audioEl = audioElements.current[audioKey]
          if (audioEl && audioEl.paused) {
            audioEl.play().catch(() => {})
          }
        } else {
          console.warn(`[WebRTC] No audio receiver found for ${targetUserId} at connected state`)
        }
        
        // Handle video receiver - recover video tracks on reconnection
        const videoReceiver = receivers.find(r => r.track?.kind === 'video')
        if (videoReceiver && videoReceiver.track) {
          const videoTrack = videoReceiver.track
          console.log(`[WebRTC] Found video track for ${targetUserId} on connect: readyState=${videoTrack.readyState}`)
          videoTrack.onended = () => {
            clearRemoteVideoMuteTimer(targetUserId)
            clearRemoteVideoState(targetUserId)
          }
          videoTrack.onmute = () => {
            console.log(`[WebRTC] Video track muted for ${targetUserId}, waiting before clear`)
            scheduleRemoteVideoMuteClear(targetUserId, videoTrack)
          }
          videoTrack.onunmute = () => {
            clearRemoteVideoMuteTimer(targetUserId)
          }
          
          if (videoTrack.readyState === 'live') {
            let videoStream = remoteStreams.current[targetUserId]
            if (!videoStream) {
              videoStream = new MediaStream([videoTrack])
              remoteStreams.current[targetUserId] = videoStream
            } else {
              // Check if video track already in stream
              const existingVideo = videoStream.getVideoTracks().find(t => t.id === videoTrack.id)
              if (!existingVideo) {
                videoStream.addTrack(videoTrack)
              }
            }
            
            // Update videoStreams state with the video stream
            setVideoStreams(prev => {
              if (prev[targetUserId]?.id === videoStream.id) return prev
              console.log(`[WebRTC] Recovering video stream for ${targetUserId} on connect`)
              return { ...prev, [targetUserId]: videoStream }
            })
            
            // Update participants state with video stream
            setParticipants(prev => {
              const existing = prev.find(p => p.id === targetUserId)
              if (existing?.hasVideo && existing?.videoStream?.id === videoStream.id) return prev
              console.log(`[WebRTC] Updating participant ${targetUserId} with video stream`)
              return prev.map(p => 
                p.id === targetUserId 
                  ? { ...p, hasVideo: true, videoStream: videoStream }
                  : p
              )
            })
          }
        }
      }
      if (s === 'failed') {
        upsertVoiceIssue(buildVoiceIssue(
          'peer-connectivity',
          'warning',
          'Some peers could not connect',
          `The WebRTC link to ${targetUserId} failed.`,
          'Open connection details for diagnostics. If this keeps happening, try another network or enable TURN on the server.',
          'details'
        ))
        console.log(`[WebRTC] Connection failed with ${targetUserId} — scheduling controlled reconnect`)
        try { pc.close() } catch {}
        delete peerConnections.current[targetUserId]
        makingOfferRef.current[targetUserId] = false
        ignoreOfferRef.current[targetUserId] = false
        remoteDescSetRef.current[targetUserId] = false
        schedulePeerReconnectRef.current?.(targetUserId, 'failed')
      }
      // Handle 'new' state that gets stuck - just restart ICE
      if (s === 'new') {
        console.log(`[WebRTC] Connection stuck in 'new' state for ${targetUserId} — restarting ICE`)
        pc.restartIce()
      }
      if (s === 'closed') {
        delete peerConnections.current[targetUserId]
        const hasFailedPeers = Object.values(peerConnections.current).some(peer => peer?.connectionState === 'failed')
        if (!hasFailedPeers) {
          clearVoiceIssue('peer-connectivity')
        }
        schedulePeerReconnectRef.current?.(targetUserId, 'closed')
        scheduleTrackedTimeout(() => {
          setPeerStates(prev => {
            const next = { ...prev }
            delete next[targetUserId]
            return next
          })
        }, 1000)
      }
    }

    // --- Perfect negotiation: onnegotiationneeded ---
    // Uses per-peer queue to serialize negotiations and prevent dropped offers
    pc.onnegotiationneeded = () => {
      enqueueSignal(targetUserId, async () => {
        // Skip if offer already in flight
        if (makingOfferRef.current[targetUserId]) {
          console.log(`[WebRTC] Skipping onnegotiationneeded for ${targetUserId} — offer in flight`)
          return
        }
        // Skip if not in stable state (e.g. waiting for an answer)
        if (pc.signalingState !== 'stable') {
          console.log(`[WebRTC] Skipping onnegotiationneeded for ${targetUserId} — state: ${pc.signalingState}`)
          return
        }
        // Skip if we're currently setting a remote answer (Chrome timing fix)
        if (isSettingRemoteAnswerPendingRef.current[targetUserId]) {
          console.log(`[WebRTC] Skipping onnegotiationneeded for ${targetUserId} — setting remote answer`)
          return
        }

        try {
          makingOfferRef.current[targetUserId] = true
          
          // Chrome timing bug fix: wait one microtask before createOffer
          // This avoids Chrome firing onnegotiationneeded twice
          await Promise.resolve()
          
          const offer = await pc.createOffer()
          const patchedOffer = {
            ...offer,
            sdp: preferOpusInSdp(offer.sdp)
          }
          
          // Re-check state after async createOffer — may have changed
          if (pc.signalingState !== 'stable') {
            console.log(`[WebRTC] Aborting offer for ${targetUserId} — state changed to ${pc.signalingState}`)
            return
          }
          
          await pc.setLocalDescription(patchedOffer)
          socket?.emit('voice:offer', {
            to: targetUserId,
            offer: pc.localDescription,
            channelId: channelIdRef.current
          })
          console.log(`[WebRTC] Sent offer to ${targetUserId} (connectionState: ${pc.connectionState})`)
          negotiationCompleteRef.current[targetUserId] = true
        } catch (err) {
          console.error(`[WebRTC] onnegotiationneeded error for ${targetUserId}:`, err.message)
        } finally {
          makingOfferRef.current[targetUserId] = false
        }
      })
    }

    // --- Incoming tracks ---
    pc.ontrack = (event) => {
      const track = event.track
      console.log(`[WebRTC] ontrack from ${targetUserId}: kind=${track.kind} readyState=${track.readyState} streams=${event.streams.length} enabled=${track.enabled} muted=${track.muted}`)
      applyReceiverLatencyHints(pc, targetUserId)

      // Use event.streams[0] if present; otherwise build a synthetic stream from the track.
      // @roamhq/wrtc (bot) may send addTrack(track) without a stream, giving event.streams=[].
      let remoteStream = event.streams[0]
      if (!remoteStream) {
        console.log(`[WebRTC] No stream in event for ${targetUserId}, building synthetic MediaStream`)
        if (!remoteStreams.current[targetUserId]) {
          remoteStreams.current[targetUserId] = new MediaStream()
        }
        remoteStream = remoteStreams.current[targetUserId]
        if (!remoteStream.getTracks().find(t => t.id === track.id)) {
          remoteStream.addTrack(track)
          console.log(`[WebRTC] Added track to synthetic stream for ${targetUserId}, stream tracks:`, remoteStream.getTracks().length)
        }
      } else {
        remoteStreams.current[targetUserId] = remoteStream
        console.log(`[WebRTC] Using stream from event for ${targetUserId}, stream active=${remoteStream.active} tracks=${remoteStream.getTracks().length}`)
      }

      if (track.kind === 'audio') {
        // CRITICAL FIX: Use the track from the event or remoteStream, NOT from getBestInboundAudioTrack
        // The event.track is the actual track that was just received via ontrack
        // Using getBestInboundAudioTrack can return a different (muted) track from another receiver
        const selectedTrack = track
        console.log(`[WebRTC] Using event track for ${targetUserId}: id=${selectedTrack.id} muted=${selectedTrack.muted}`)
        
        const settings = settingsService.getSettings()
        console.log(`[WebRTC] Audio track: readyState=${selectedTrack.readyState} trackMuted=${selectedTrack.muted} enabled=${selectedTrack.enabled} volume=${settings.volume}`)
        const isScreenAudio = isLikelyScreenAudioTrack(targetUserId, selectedTrack, remoteStream)
        const audioKey = isScreenAudio ? `${targetUserId}__screen` : targetUserId
        const localSettings = localUserSettings[targetUserId] || { muted: false, volume: 100, screenShareMuted: false }
        const userVolume = Math.max(0, Math.min(1, ((localSettings.volume ?? 100) / 100)))
        const globallyMuted = !!settings.muteAll || !!currentDeafened

        // Create or reuse a DOM-attached audio element.
        // DOM-attached elements satisfy autoplay policy and persist.
        let audio = audioElements.current[audioKey]
        if (!audio) {
          audio = document.createElement('audio')
          audio.autoplay = true
          audio.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none;opacity:0'
          document.body.appendChild(audio)
          audioElements.current[audioKey] = audio
          
          // Set output device immediately for Chromium/Electron
          const initSettings = settingsService.getSettings()
          applyOutputDevice(audio, initSettings.outputDevice)
          
          console.log(`[WebRTC] Created DOM ${isScreenAudio ? 'screen-share' : 'voice'} audio element for ${targetUserId}`)
        }

        const existingTrack = audio.srcObject?.getAudioTracks?.()[0] || null
        const existingPlayable = !!(existingTrack && existingTrack.readyState === 'live' && !existingTrack.muted)
        const incomingPlayable = !!(selectedTrack.readyState === 'live' && !selectedTrack.muted)

        // Chrome/Electron can expose duplicate inbound audio receivers.
        // Never replace a currently playable track with a muted duplicate.
        if (existingPlayable && !incomingPlayable && existingTrack?.id !== selectedTrack.id) {
          console.log(`[WebRTC] Ignoring muted duplicate audio track for ${targetUserId}: ${selectedTrack.id}`)
          selectedTrack.onunmute = () => {
            const streamOnUnmute = new MediaStream([selectedTrack])
            audio.srcObject = streamOnUnmute
            audio.play().catch(() => {})
          }
          return
        }

        // Use a single-track stream for audio playback to avoid track conflicts
        // but keep the analyser on the full remoteStream for speaking detection
        const audioStream = new MediaStream([selectedTrack])
        audio.srcObject = audioStream
        audio.volume    = Math.max(0, Math.min(1, (settings.volume ?? 100) / 100)) * userVolume
        audio.muted     = globallyMuted || (isScreenAudio ? !!localSettings.screenShareMuted : !!localSettings.muted)

        console.log(`[WebRTC] Audio element: volume=${audio.volume} trackMuted=${selectedTrack.muted}`)

        // Helper — call play() and retry on autoplay rejection
        const tryPlay = () => {
          // Keep playback on a dedicated single-track stream.
          // Using the shared remoteStream can include multiple audio tracks after renegotiation.
          if (audio.srcObject !== audioStream) audio.srcObject = audioStream
          audio.play().then(() => {
            console.log(`[WebRTC] play() OK for ${targetUserId} readyState=${audio.readyState}`)
          }).catch(err => {
            console.warn(`[WebRTC] play() blocked: ${err.message} — retrying on next gesture`)
            const retry = () => {
              audio.play().catch(e2 => console.warn(`[WebRTC] retry play() failed: ${e2.message}`))
              document.removeEventListener('pointerdown', retry, true)
              document.removeEventListener('keydown',     retry, true)
            }
            document.addEventListener('pointerdown', retry, true)
            document.addEventListener('keydown',     retry, true)
          })
        }

        // Always set onunmute — this is the correct trigger for when RTP
        // packets start flowing (track goes from receive-muted to live).
        selectedTrack.onunmute = () => {
          console.log(`[WebRTC] track.onunmute for ${targetUserId} — starting playback`)
          tryPlay()
        }

        selectedTrack.onended = () => console.log(`[WebRTC] track ended for ${targetUserId}`)

        // Play immediately if track already has audio flowing.
        if (!selectedTrack.muted) {
          console.log(`[WebRTC] Track already unmuted for ${targetUserId}`)
          tryPlay()
        }

        // No WebAudio bypass here — the <audio> element above is sufficient.
        // WebAudio contexts created before a user gesture are suspended and
        // produce no output; using them causes silent audio. The <audio> element
        // with autoplay + srcObject works correctly after the first user gesture.
        
        // Create an analyser for remote audio to detect speaking
        // Use a timeout to ensure the stream is fully active before creating analyser
        setTimeout(() => {
          try {
            // Check if stream is still active
            if (!remoteStream.active) {
              console.log(`[WebRTC] Stream no longer active for ${targetUserId}, skipping analyser creation`)
              return
            }
            
            const remoteAudioContext = new (window.AudioContext || window.webkitAudioContext)()
            const remoteAnalyser = remoteAudioContext.createAnalyser()
            remoteAnalyser.fftSize = 256
            remoteAnalyser.smoothingTimeConstant = 0.3 // More responsive to changes
            const remoteSource = remoteAudioContext.createMediaStreamSource(remoteStream)
            remoteSource.connect(remoteAnalyser)
            
            // Resume the audio context if it's suspended (needs user gesture)
            if (remoteAudioContext.state === 'suspended') {
              // Try to resume on next user interaction
              const resumeOnInteraction = () => {
                remoteAudioContext.resume().then(() => {
                  console.log(`[WebRTC] Resumed remote audio context for ${targetUserId}`)
                }).catch(err => {
                  console.warn(`[WebRTC] Failed to resume remote audio context for ${targetUserId}:`, err.message)
                })
                document.removeEventListener('click', resumeOnInteraction)
                document.removeEventListener('keydown', resumeOnInteraction)
              }
              document.addEventListener('click', resumeOnInteraction)
              document.addEventListener('keydown', resumeOnInteraction)
            }
            
            remoteAnalysersRef.current[targetUserId] = { 
              analyser: remoteAnalyser, 
              audioContext: remoteAudioContext,
              stream: remoteStream
            }
            console.log(`[WebRTC] Created remote analyser for ${targetUserId} (state: ${remoteAudioContext.state})`)
          } catch (analyserErr) {
            console.warn(`[WebRTC] Failed to create remote analyser for ${targetUserId}:`, analyserErr.message)
          }
        }, 500) // Give the stream time to become active
      }

      if (track.kind === 'video') {
        console.log(`[WebRTC] ========== VIDEO TRACK RECEIVED from ${targetUserId} ==========`)
        console.log(`[WebRTC] Video track details: id=${track.id}, readyState=${track.readyState}, enabled=${track.enabled}, muted=${track.muted}`)
        
        // Get or create the remote stream for this user
        let videoStream = remoteStreams.current[targetUserId]
        
        if (!videoStream) {
          // Create a new stream with this video track
          videoStream = new MediaStream([track])
          remoteStreams.current[targetUserId] = videoStream
          console.log(`[WebRTC] Created NEW video stream for ${targetUserId}`)
        } else {
          // Check if this video track is already in the stream
          const existingVideoTrack = videoStream.getVideoTracks()?.find(t => t.id === track.id)
          if (existingVideoTrack) {
            console.log(`[WebRTC] Video track already in stream for ${targetUserId}`)
          } else {
            // Add the video track to the existing stream
            videoStream.addTrack(track)
            console.log(`[WebRTC] Added video track to existing stream for ${targetUserId}, stream now has ${videoStream.getTracks().length} tracks`)
          }
        }
        
        // Log the stream state
        console.log(`[WebRTC] Video stream for ${targetUserId}: active=${videoStream.active}, tracks=${videoStream.getTracks().map(t => `${t.kind}:${t.readyState}`).join(',')}`)
        
        // Determine if this is a screen share or camera based on track settings
        // Screen shares typically have different aspect ratios or are marked
        const isScreenShare = track.label?.toLowerCase().includes('screen') || 
                              track.label?.toLowerCase().includes('monitor') ||
                              event.streams[0]?.id?.includes('screen') ||
                              false
        
        console.log(`[WebRTC] Video type for ${targetUserId}: ${isScreenShare ? 'screen share' : 'camera'}`)
        
        // Update video streams state with the video stream
        setVideoStreams(prev => ({ ...prev, [targetUserId]: videoStream }))
        
        // Force update participants state with the video stream
        setParticipants(prev => {
          const existingIndex = prev.findIndex(p => p.id === targetUserId)
          
          if (existingIndex === -1) {
            // Participant not in list yet - add them with video
            console.log(`[WebRTC] Adding NEW participant ${targetUserId} with video`)
            return [...prev, { 
              id: targetUserId, 
              hasVideo: true, 
              videoStream: videoStream,
              isScreenSharing: isScreenShare
            }]
          }
          
          // Update existing participant
          const existing = prev[existingIndex]
          const updatedParticipant = {
            ...existing,
            hasVideo: true,
            videoStream: videoStream,
            // If this is a screen share, mark it
            ...(isScreenShare ? { isScreenSharing: true } : {})
          }
          
          console.log(`[WebRTC] Updating participant ${targetUserId}: hasVideo=true, isScreenSharing=${isScreenShare}`)
          
          const newParticipants = [...prev]
          newParticipants[existingIndex] = updatedParticipant
          return newParticipants
        })
        
        // Also emit a local event to notify any video elements
        // This helps when the video element is already mounted
        window.dispatchEvent(new CustomEvent('voltchat:video-track', {
          detail: { userId: targetUserId, stream: videoStream, isScreenShare }
        }))

        const handleRemoteVideoEnded = () => {
          clearRemoteVideoMuteTimer(targetUserId)
          console.log(`[WebRTC] Video track ended for ${targetUserId}, clearing UI state`)
          clearRemoteVideoState(targetUserId)
        }
        const handleRemoteVideoMuted = () => {
          console.log(`[WebRTC] Video track muted for ${targetUserId}, waiting before clear`)
          scheduleRemoteVideoMuteClear(targetUserId, track)
        }
        const handleRemoteVideoUnmuted = () => {
          clearRemoteVideoMuteTimer(targetUserId)
        }
        track.onended = handleRemoteVideoEnded
        track.onmute = handleRemoteVideoMuted
        track.onunmute = handleRemoteVideoUnmuted
        
        console.log(`[WebRTC] ========== VIDEO TRACK PROCESSING COMPLETE for ${targetUserId} ==========`)
      }
    }

    // Add our local audio tracks
    const addTracks = () => {
      const audioStream = activeOutboundAudioStreamRef.current || localStreamRef.current
      const audioTrack = activeOutboundAudioTrackRef.current || audioStream?.getAudioTracks?.()[0]
      if (audioStream && audioTrack) {
        audioTrack._senderTag = 'mic'
        const senders = pc.getSenders()
        const existingAudioSender = senders.find(s => (
          s.track?._senderTag === 'mic' ||
          (s.track?.kind === 'audio' && s.track?._senderTag !== 'screen-audio')
        ))
        if (!existingAudioSender) {
          pc.addTrack(audioTrack, audioStream)
        } else if (existingAudioSender.track?.id !== audioTrack.id) {
          existingAudioSender.replaceTrack(audioTrack).catch(() => {})
        }
      }
      const videoStream = localVideoStreamRef.current
      if (videoStream) {
        videoStream.getVideoTracks().forEach(track => {
          const senders = pc.getSenders()
          if (!senders.find(s => s.track === track)) {
            pc.addTrack(track, videoStream)
          }
        })
      }
      const screen = screenStreamRef.current
      if (screen) {
        screen.getTracks().forEach(track => {
          const senders = pc.getSenders()
          if (!senders.find(s => s.track === track)) {
            pc.addTrack(track, screen)
          }
        })
      }
    }

    addTracks()

    return pc
  }, [socket, user?.id, isPolite, clearRemoteVideoState, clearRemoteVideoMuteTimer, scheduleRemoteVideoMuteClear, applyReceiverLatencyHints, isLikelyScreenAudioTrack, localUserSettings, upsertVoiceIssue, clearVoiceIssue, releaseNegotiationSlot, scheduleTrackedTimeout, clearPeerReconnectState])

  const initiateCall = useCallback((targetUserId) => {
    if (!targetUserId || targetUserId === user?.id) return
    const existing = peerConnections.current[targetUserId]
    if (existing) {
      const state = existing.connectionState
      // Already connected, connecting, or completed (wrtc uses 'completed') — skip
      if (state === 'connected' || state === 'connecting' || state === 'completed') {
        return
      }
      // Offer already in flight for this peer — skip
      if (makingOfferRef.current[targetUserId]) {
        console.log('[WebRTC] Skipping initiateCall for', targetUserId, '— offer in flight')
        return
      }
    }
    console.log('[WebRTC] Connecting to peer:', targetUserId)
    createPeerConnection(targetUserId)
  }, [createPeerConnection, user?.id])

  // Process the connection queue with tiered concurrency for scaling to 100 peers
  const processConnectionQueue = useCallback(async () => {
    if (isProcessingQueueRef.current) return
    isProcessingQueueRef.current = true

    const tier = getTierConfig()
    const maxConcurrent = tier.concurrent
    sortConnectionQueue()

    while (connectionQueueRef.current.length > 0 && activeNegotiationsRef.current < maxConcurrent) {
      const targetUserId = connectionQueueRef.current.shift()
      if (!targetUserId) continue

      // Double-check state before connecting
      const existing = peerConnections.current[targetUserId]
      if (existing) {
        const state = existing.connectionState
        if (state === 'connected' || state === 'connecting' || state === 'completed' || makingOfferRef.current[targetUserId]) {
          console.log(`[WebRTC] Skipping ${targetUserId} — already connecting/connected`)
          continue
        }
      }

      if (!shouldInitiatePeerConnection(targetUserId)) {
        console.log(`[WebRTC] Skipping ${targetUserId} in queue — remote side owns initiation`)
        continue
      }

      reserveNegotiationSlot(targetUserId)
      connectionCooldownsRef.current.set(targetUserId, Date.now())

      console.log(`[WebRTC] Processing connection to ${targetUserId} (${activeNegotiationsRef.current}/${maxConcurrent} active, tier: ${tier.maxPeers} max)`)

      try {
        initiateCall(targetUserId)
      } catch (err) {
        console.error(`[WebRTC] Error initiating connection to ${targetUserId}:`, err.message)
        releaseNegotiationSlot(targetUserId)
      }

      // Tiered delay between starting connections to prevent flooding
      if (connectionQueueRef.current.length > 0) {
        await new Promise(r => setTimeout(r, tier.staggerPerPeer))
      }
    }

    isProcessingQueueRef.current = false

    // If queue still has items (either blocked by concurrency limit or new items added),
    // schedule another processing round to drain the queue
    if (connectionQueueRef.current.length > 0) {
      scheduleTrackedTimeout(() => processConnectionQueue(), tier.staggerBase)
    }
  }, [initiateCall, getTierConfig, releaseNegotiationSlot, reserveNegotiationSlot, scheduleTrackedTimeout, sortConnectionQueue, shouldInitiatePeerConnection])

  // Queue a connection with tiered cooldown management for 100+ peer support
  const queueConnection = useCallback((targetUserId, options = {}) => {
    if (!targetUserId || targetUserId === user?.id) return
    const { force = false, bypassBackoff = false } = options

    // Check capacity
    if (!canAcceptPeer(targetUserId)) {
      console.log(`[WebRTC] Cannot queue ${targetUserId}: at capacity`)
      return
    }

    if (!shouldInitiatePeerConnection(targetUserId, { force })) {
      console.log(`[WebRTC] Waiting for ${targetUserId} to initiate (owner rule)`)
      return
    }

    // Check cooldown to prevent rapid reconnection attempts
    const tier = getTierConfig()
    const lastAttempt = connectionCooldownsRef.current.get(targetUserId)
    if (lastAttempt && Date.now() - lastAttempt < tier.cooldown) {
      const retryIn = tier.cooldown - (Date.now() - lastAttempt) + 50
      console.log(`[WebRTC] Connection to ${targetUserId} on cooldown, retrying in ${retryIn}ms`)
      cancelConnectionAttempt(targetUserId)
      const timeoutId = scheduleTrackedTimeout(() => {
        connectionAttemptTimersRef.current.delete(targetUserId)
        queueConnection(targetUserId)
      }, retryIn)
      connectionAttemptTimersRef.current.set(targetUserId, timeoutId)
      return
    }

    if (!bypassBackoff) {
      const reconnectState = peerReconnectStateRef.current.get(targetUserId)
      if (reconnectState?.nextAllowedAt && reconnectState.nextAllowedAt > Date.now()) {
        const retryIn = reconnectState.nextAllowedAt - Date.now() + 50
        console.log(`[WebRTC] Connection to ${targetUserId} in backoff, retrying in ${retryIn}ms`)
        cancelConnectionAttempt(targetUserId)
        const timeoutId = scheduleTrackedTimeout(() => {
          connectionAttemptTimersRef.current.delete(targetUserId)
          queueConnection(targetUserId, options)
        }, retryIn)
        connectionAttemptTimersRef.current.set(targetUserId, timeoutId)
        return
      }
    }

    // Check if already in queue
    if (connectionQueueRef.current.includes(targetUserId)) {
      console.log(`[WebRTC] Connection to ${targetUserId} already queued`)
      return
    }

    // Check if already connected
    const existing = peerConnections.current[targetUserId]
    if (existing) {
      const state = existing.connectionState
      if (state === 'connected' || state === 'connecting' || state === 'completed') {
        console.log(`[WebRTC] Already connected to ${targetUserId}, skipping queue`)
        return
      }
    }

    connectionQueueRef.current.push(targetUserId)
    sortConnectionQueue()
    console.log(`[WebRTC] Queued connection to ${targetUserId} (queue length: ${connectionQueueRef.current.length})`)
    processConnectionQueue()
  }, [user?.id, canAcceptPeer, shouldInitiatePeerConnection, getTierConfig, cancelConnectionAttempt, scheduleTrackedTimeout, sortConnectionQueue, processConnectionQueue])

  // Process large groups in batches to prevent overwhelming the system
  const processPeerBatches = useCallback((peerIds, tier) => {
    const batchSize = tier.batchSize
    const batches = []
    const sortedPeerIds = [...peerIds].sort((left, right) => {
      const scoreDelta = getPeerPriorityScore(right) - getPeerPriorityScore(left)
      if (scoreDelta !== 0) return scoreDelta
      return String(left).localeCompare(String(right))
    })
    
    // Split into batches
    for (let i = 0; i < sortedPeerIds.length; i += batchSize) {
      batches.push(sortedPeerIds.slice(i, i + batchSize))
    }
    
    console.log(`[WebRTC] Split ${peerIds.length} peers into ${batches.length} batches of ~${batchSize}`)
    
    // Process batches with delays
    batches.forEach((batch, batchIndex) => {
      const batchDelay = batchIndex * 6000 // 6 seconds between batches
      
      scheduleTrackedTimeout(() => {
        console.log(`[WebRTC] Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} peers)`)
        
        batch.forEach((peerId, index) => {
          // Skip if at capacity
          if (!canAcceptPeer(peerId)) return
          
          // Skip if already connected
          const existing = peerConnections.current[peerId]
          if (existing) {
            const s = existing.connectionState
            if (s === 'connected' || s === 'connecting' || s === 'completed') return
          }
          
          const delay = tier.staggerBase + (index * tier.staggerPerPeer) + (Math.random() * 200)
          cancelConnectionAttempt(peerId)
          const timeoutId = scheduleTrackedTimeout(() => {
            connectionAttemptTimersRef.current.delete(peerId)
            queueConnection(peerId)
          }, delay)
          connectionAttemptTimersRef.current.set(peerId, timeoutId)
        })
        
        // Mark mass join complete after last batch
        if (batchIndex === batches.length - 1) {
          scheduleTrackedTimeout(() => {
            isMassJoinInProgressRef.current = false
            pendingPeerCountRef.current = 0
            console.log('[WebRTC] Mass join processing complete')
          }, 12000)
        }
      }, batchDelay)
    })
  }, [canAcceptPeer, queueConnection, cancelConnectionAttempt, scheduleTrackedTimeout, getPeerPriorityScore])

  const schedulePeerReconnect = useCallback((peerId, reason = 'retry', options = {}) => {
    if (!peerId || peerId === user?.id) return
    if (!participantsRef.current.some((entry) => entry?.id === peerId)) return

    const { force = false, immediate = false } = options
    if (!shouldInitiatePeerConnection(peerId, { force })) {
      console.log(`[WebRTC] Not scheduling reconnect to ${peerId} (${reason}) — waiting for remote initiator`)
      return
    }

    const delay = immediate ? Math.max(250, getTierConfig().staggerBase) : getReconnectDelayMs(peerId, reason)
    if (force) forcedInitiatorPeersRef.current.add(peerId)

    cancelConnectionAttempt(peerId)
    const timeoutId = scheduleTrackedTimeout(() => {
      connectionAttemptTimersRef.current.delete(peerId)
      queueConnection(peerId, { force, bypassBackoff: force || immediate })
    }, delay)
    connectionAttemptTimersRef.current.set(peerId, timeoutId)
    console.log(`[WebRTC] Scheduled reconnect to ${peerId} in ${delay}ms (${reason})`)
  }, [user?.id, shouldInitiatePeerConnection, getTierConfig, getReconnectDelayMs, cancelConnectionAttempt, scheduleTrackedTimeout, queueConnection])

  useEffect(() => {
    schedulePeerReconnectRef.current = schedulePeerReconnect
  }, [schedulePeerReconnect])

  useEffect(() => {
    if (!socket || !channel) return

    // joinKey increments every time the user explicitly joins (including rejoins).
    // Without it, rejoining the same channel after leave would be a no-op because
    // channel.id hasn't changed and the effect deps haven't changed.
    const channelChanged = initializedChannelIdRef.current !== channel.id
    const isRejoin = !hasJoinedRef.current && !isInitializingRef.current && initializedChannelIdRef.current === null

    // Prevent double-init when already live in this channel
    if ((hasJoinedRef.current || isInitializingRef.current) && !channelChanged) {
      console.log('[Voice] Skipping init - already joined or initializing, channel unchanged')
      return
    }
    
    // If we're joining a different channel, do full cleanup first
    if (hasJoinedRef.current && channelChanged) {
      console.log('[Voice] Channel changed, cleaning up previous session')
      clearAllScheduledVoiceTimers()
      Object.values(peerConnections.current).forEach(pc => { try { pc.close() } catch {} })
      peerConnections.current = {}
      Object.entries(audioElements.current).forEach(([key, node]) => {
        if (key.includes('__webaudio')) {
          try { node?.disconnect() } catch {}
        } else if (node && node.pause) {
          node.pause(); node.srcObject = null
          if (node.parentNode) node.parentNode.removeChild(node)
        }
      })
      audioElements.current = {}
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop())
        localStreamRef.current = null
        activeOutboundAudioTrackRef.current = null
        activeOutboundAudioStreamRef.current = null
      }
      if (analyserRef.current?.audioContext && analyserRef.current.audioContext.state !== 'closed') {
        analyserRef.current.audioContext.close().catch(() => {})
      }
      analyserRef.current = null
      // Reset perfect-negotiation state
      makingOfferRef.current  = {}
      ignoreOfferRef.current  = {}
      remoteDescSetRef.current = {}
      pendingCandidatesRef.current = {}
      lastOfferTimeRef.current = {}
      negotiationLockRef.current = {}
      signalChainRef.current = {}
      isSettingRemoteAnswerPendingRef.current = {}
      serverIceServersRef.current = []
      connectionQueueRef.current = []
      connectionCooldownsRef.current = new Map()
      setLocalStream(null)
      setLocalVideoStream(null)
      setScreenStream(null)
      setParticipants([])
      setConnectionState('connecting')
      hasJoinedRef.current = false
      hasLeftRef.current = false
    }
    
    let cancelled = false
    isInitializingRef.current = true
    initializedChannelIdRef.current = channel.id

    // Hoisted to effect scope so the cleanup return() can removeEventListener
    let resumeThrottle = null
    const resumeAudio = () => {
      if (resumeThrottle) return
      resumeThrottle = setTimeout(() => { resumeThrottle = null }, 500)
      if (analyserRef.current?.audioContext?.state === 'suspended') {
        analyserRef.current.audioContext.resume().catch(() => {})
      }
      Object.values(audioElements.current).forEach(audio => {
        if (audio.paused && audio.srcObject) {
          audio.play().catch(() => {})
        }
      })
    }
    document.addEventListener('click',   resumeAudio)
    document.addEventListener('keydown', resumeAudio)

    const initVoice = async () => {
      const settings = settingsService.getSettings()
      
      const tryGetMic = async (deviceId) => {
        const constraints = {
          audio: {
            echoCancellation: settings.echoCancellation ?? true,
            noiseSuppression: settings.noiseSuppression ?? true,
            autoGainControl: settings.autoGainControl ?? true,
            ...(deviceId && deviceId !== 'default' ? { deviceId: { exact: deviceId } } : {})
          }
        }
        return navigator.mediaDevices.getUserMedia(constraints)
      }
      
      try {
        let stream
        try {
          stream = await tryGetMic(settings.inputDevice)
        } catch (err) {
          if (err.name === 'OverconstrainedError') {
            console.log('[Voice] Saved mic device not found, using default')
            settingsService.saveSettings({ ...settings, inputDevice: 'default' })
            stream = await tryGetMic(null)
          } else {
            throw err
          }
        }
        
        // Check if cancelled after async operation
        if (cancelled) {
          console.log('[Voice] Init cancelled, stopping stream')
          stream.getTracks().forEach(t => t.stop())
          return
        }
        
        setLocalStream(stream)
        localStreamRef.current = stream
        setJoinedWithoutMic(false)
        clearVoiceIssue('mic-fallback')
        clearVoiceIssue('microphone-permission')
        clearVoiceIssue('microphone-missing')
        clearVoiceIssue('microphone-unavailable-device')
        clearVoiceIssue('microphone-busy')
        clearVoiceIssue('microphone-error')
        setConnectionState('connected')
        
        soundService.callConnected()

        const audioContext = new (window.AudioContext || window.webkitAudioContext)()
        const analyser = audioContext.createAnalyser()
        const source = audioContext.createMediaStreamSource(stream)
        source.connect(analyser)
        analyserRef.current = { audioContext, analyser }
        
        // Initialize VoiceFX audio processing chain
        const voiceFXDestination = audioContext.createMediaStreamDestination()
        const voiceFXDryGain = audioContext.createGain()
        const voiceFXWetGain = audioContext.createGain()
        voiceFXDryGain.gain.value = 1
        voiceFXWetGain.gain.value = 0
        
        voiceFXDestinationRef.current = voiceFXDestination
        voiceFXDryGainRef.current = voiceFXDryGain
        voiceFXWetGainRef.current = voiceFXWetGain
        voiceFXSourceRef.current = source
        
        // Connect: source -> dry path -> destination (initially no effects)
        source.connect(voiceFXDryGain)
        voiceFXDryGain.connect(voiceFXDestination)
        
        // Store original audio track reference
        const audioTrack = stream.getAudioTracks()[0]
        originalAudioTrackRef.current = audioTrack
        // Always send a stable VoiceFX destination track to peers.
        // In "none" mode, graph is source -> dry -> destination passthrough.
        const outboundTrack = voiceFXDestination.stream.getAudioTracks()[0] || audioTrack
        outboundTrack._senderTag = 'mic'
        activeOutboundAudioTrackRef.current = outboundTrack
        activeOutboundAudioStreamRef.current = voiceFXDestination.stream
        
        // Apply robustly restored mute/deafen state to the mic track.
        const savedVoiceState = readPersistedVoiceState()
        if (savedVoiceState.deafened || savedVoiceState.muted) {
          audioTrack.enabled = false
          console.log('[Voice] Applied saved mute/deafen state - mic disabled')
        } else {
          audioTrack.enabled = true
          console.log('[Voice] Applied saved voice state - mic enabled')
        }
        setLocalIsMuted(savedVoiceState.muted)
        setLocalIsDeafened(savedVoiceState.deafened)
        preDeafenMutedRef.current = savedVoiceState.muted
        
        if (audioContext.state === 'suspended') {
          audioContext.resume().catch(err => {
            console.log('[Voice] AudioContext resume failed:', err)
          })
        }

        // Mark as joined BEFORE emitting
        hasJoinedRef.current = true
        hasLeftRef.current = false
        
        // Play join sound for self (callConnected plays when connection is established)
        // soundService.callJoin() - removed to avoid duplicate sounds
        
        // resumeAudio is registered at effect scope above — no need to add again here
        
        // voice:join already returns voice:participants from the server.
        // Do NOT emit voice:get-participants here — it causes a second participants
        // response which triggers duplicate initiateCall calls and m-line order errors.
        socket.emit('voice:join', { 
          channelId: channel.id,
          peerId: user.id
        })
        console.log('[Voice] Emitted voice:join for channel:', channel.id)
      } catch (err) {
        console.error('[Voice] Failed to get microphone:', err)
        if (!cancelled) {
          upsertVoiceIssue(diagnoseMediaError(err, 'microphone'))
          upsertVoiceIssue(buildVoiceIssue(
            'mic-fallback',
            'warning',
            'Connected without microphone',
            'You can still hear the channel and use activities, but your microphone is unavailable right now.',
            'Open Voice Settings to grant microphone access or choose another input device.',
            'settings'
          ))

          setLocalStream(null)
          localStreamRef.current = null
          activeOutboundAudioTrackRef.current = null
          activeOutboundAudioStreamRef.current = null
          setJoinedWithoutMic(true)
          hasJoinedRef.current = true
          hasLeftRef.current = false
          setConnectionState('connected')

          socket.emit('voice:join', {
            channelId: channel.id,
            peerId: user.id
          })
          console.log('[Voice] Emitted voice:join fallback without microphone for channel:', channel.id)
        }
      } finally {
        isInitializingRef.current = false
      }
    }

    initVoice()

    const onReconnectJoin = () => {
      if (hasJoinedRef.current && channelIdRef.current) {
        socket.emit('voice:join', {
          channelId: channelIdRef.current,
          peerId: user.id
        })
        console.log('[Voice] Re-emitted voice:join after reconnect for channel:', channelIdRef.current)
      }
    }

    socket.on('connect', onReconnectJoin)

    socket.on('voice:participants', (data) => {
      if (data.channelId !== channelIdRef.current) return
      applyLowDelayModeToAllPeers()
      // Store ICE servers from server for subsequent peer connections
      if (data.iceServers?.length) {
        const hadIceServers = serverIceServersRef.current.length > 0
        serverIceServersRef.current = data.iceServers
        // If we had peer connections created with fallback ICE (STUN-only) before
        // server ICE servers arrived, close and recreate them with the full server
        // ICE list (which includes TURN). This ensures all peers use the same TURN
        // credentials and can relay through the same server.
        if (!hadIceServers) {
          const existingPeers = Object.keys(peerConnections.current)
          if (existingPeers.length > 0) {
            console.log(`[WebRTC] Server ICE servers received - recreating ${existingPeers.length} peer connection(s) with TURN support`)
            existingPeers.forEach(peerId => {
              const pc = peerConnections.current[peerId]
              if (pc && pc.connectionState !== 'connected' && pc.connectionState !== 'completed') {
                try { pc.close() } catch {}
                delete peerConnections.current[peerId]
                makingOfferRef.current[peerId] = false
                ignoreOfferRef.current[peerId] = false
                remoteDescSetRef.current[peerId] = false
              }
            })
          }
        }
      }
      
      // Handle both formats: array of user objects OR array of peer IDs (strings)
      const participantsData = (data.participants || [])
      const processedParticipants = participantsData.map(p => {
        // Handle both string IDs and user objects
        if (typeof p === 'string') {
          return { id: p, username: 'Unknown User', avatar: null, bot: false }
        }
        // Validate the user object has required fields
        if (!p || typeof p !== 'object') {
          console.warn('[VoiceChannel] Skipping invalid participant:', p)
          return null
        }
        if (!p.id) {
          console.warn('[VoiceChannel] Skipping participant without id:', p)
          return null
        }
        return { 
          id: p.id, 
          username: p.username || 'Unknown User', 
          avatar: p.avatar || null,
          bot: p.bot || false,
          hasVideo: p.hasVideo || false,
          isScreenSharing: p.isScreenSharing || false,
          muted: p.muted || false,
          deafened: p.deafened || false
        }
      }).filter(Boolean)
      
      const peerIds = processedParticipants
        .filter(p => p?.id !== user?.id)
        .map(p => p?.id)
        .filter(Boolean)
        
      console.log(`[WebRTC] Received participants list: ${peerIds.length} peers —`, peerIds)
      const validParticipants = processedParticipants.filter(p => p?.id)
      const presentIds = new Set(validParticipants.map(p => p.id))
      validParticipants.forEach(participant => cancelPendingPeerRemoval(participant.id))
      setParticipants(prev => {
        const previousById = new Map(prev.filter(p => p?.id).map(p => [p.id, p]))
        const merged = validParticipants.map(participant => ({
          ...(previousById.get(participant.id) || {}),
          ...participant
        }))
        prev.forEach(existing => {
          if (!existing?.id || presentIds.has(existing.id)) return
          merged.push(existing)
          schedulePeerRemoval(existing.id, 3500, { playSound: true })
        })
        return merged
      })
      
      // Detect mass join scenario (>10 peers joining at once)
      if (peerIds.length > 10) {
        isMassJoinInProgressRef.current = true
        pendingPeerCountRef.current = peerIds.length
        console.log(`[WebRTC] Mass join detected: ${peerIds.length} peers. Using batch processing.`)
      }
      
      // Get tier configuration based on peer count
      const tier = getTierConfig()
      console.log(`[WebRTC] Using tier config: concurrent=${tier.concurrent}, cooldown=${tier.cooldown}ms`)
      
      // For massive groups, process in batches
      if (peerIds.length > tier.batchSize) {
        console.log(`[WebRTC] Large group (${peerIds.length} peers), processing in batches of ${tier.batchSize}`)
        processPeerBatches(peerIds, tier)
        return
      }
      
      // Use tiered staggered delays
      // IMPORTANT: As the joining peer, we wait LONGER before initiating to give
      // existing participants priority. This reduces offer collisions during reconnection.
      // Existing peers will initiate first, and we'll respond with answers.
      const baseDelay = tier.staggerBase + 1500  // Extra 1.5s for joining peer
      const staggerMs = tier.staggerPerPeer
      
      peerIds.forEach((peerId, index) => {
        // Skip if already connected or connecting - don't retry if connection in progress
        const existing = peerConnections.current[peerId]
        if (existing) {
          const s = existing.connectionState
          if (s === 'connected' || s === 'completed') return
          // If connecting or new, skip - let the existing connection attempt continue
          if (s === 'connecting' || s === 'new') {
            console.log(`[WebRTC] Skipping ${peerId} - already ${s}`)
            return
          }
          // If failed/closed, will create new connection below
        }
        
        // Skip if at capacity
        if (!canAcceptPeer(peerId)) return
        if (!shouldInitiatePeerConnection(peerId)) return
        
        // Simple staggered connections - no retry spam
        const delay = baseDelay + (index * staggerMs) + (Math.random() * 300)
        console.log(`[WebRTC] Queuing connection to ${peerId} in ${Math.round(delay)}ms`)
        cancelConnectionAttempt(peerId)
        const timeoutId = scheduleTrackedTimeout(() => {
          connectionAttemptTimersRef.current.delete(peerId)
          queueConnection(peerId)
        }, delay)
        connectionAttemptTimersRef.current.set(peerId, timeoutId)
      })
    })

    // Simple user-joined handler - don't spam connections
    // CRITICAL: Handle both string IDs and user objects to prevent crashes
    socket.on('voice:user-joined', (userInfo) => {
      try {
        // Normalize: handle both string IDs and user objects
        const normalizedUser = typeof userInfo === 'string' 
          ? { id: userInfo, username: 'Unknown User', avatar: null, bot: false }
          : (userInfo?.id ? { 
              id: userInfo.id, 
              username: userInfo.username || 'Unknown User', 
              avatar: userInfo.avatar || null,
              bot: userInfo.bot || false,
              hasVideo: userInfo.hasVideo || false,
              isScreenSharing: userInfo.isScreenSharing || false,
              muted: userInfo.muted || false,
              deafened: userInfo.deafened || false
            } : null)
        
        if (!normalizedUser?.id) {
          console.warn('[VoiceChannel] Invalid userInfo in voice:user-joined:', userInfo)
          return
        }
        
        const userId = normalizedUser.id
        
        applyLowDelayModeToAllPeers()
        cancelPendingPeerRemoval(userId)
        // Clear the reconnecting flag if it was set by voice:user-left
        setParticipants(prev => {
          const existingIndex = prev.findIndex(p => p?.id === userId)
          if (existingIndex === -1) return [...prev, normalizedUser]
          const next = [...prev]
          next[existingIndex] = { ...prev[existingIndex], ...normalizedUser, isReconnecting: false }
          return next
        })
        
        if (userId !== user?.id) {
          soundService.userJoined()
          
          // Check if already connected - don't reconnect if we already have a good connection
          const existing = peerConnections.current[userId]
          if (existing) {
            const s = existing.connectionState
            if (s === 'connected' || s === 'completed') {
              console.log(`[WebRTC] Already connected to ${userId}, skipping`)
              return
            }
            if (s === 'connecting' || s === 'new') {
              console.log(`[WebRTC] Already connecting to ${userId}, skipping`)
              return
            }
            // If failed/closed, will try to reconnect below
          }
          
          // Check capacity before connecting
          if (!canAcceptPeer(userId)) {
            console.log(`[WebRTC] Cannot accept peer ${userId}: at capacity`)
            return
          }
          if (!shouldInitiatePeerConnection(userId)) {
            console.log(`[WebRTC] Waiting for ${userId} to initiate new peer connection`)
            return
          }
          
          // Simple delay - no retry spam
          const tier = getTierConfig()
          const delay = 800 + Math.random() * 400
          console.log(`[WebRTC] Scheduling connection to new peer ${userId} in ${Math.round(delay)}ms`)
          cancelConnectionAttempt(userId)
          const timeoutId = scheduleTrackedTimeout(() => {
            connectionAttemptTimersRef.current.delete(userId)
            queueConnection(userId)
          }, delay)
          connectionAttemptTimersRef.current.set(userId, timeoutId)
        }
      } catch (err) {
        console.error('[VoiceChannel] Error in voice:user-joined handler:', err)
      }
    })

    // Handle user reconnection - don't treat as new join, just reconnect WebRTC
    // CRITICAL: Handle both string IDs and user objects to prevent crashes
    socket.on('voice:user-reconnected', (userInfo) => {
      try {
        // Normalize: handle both string IDs and user objects
        const normalizedUser = typeof userInfo === 'string' 
          ? { id: userInfo, username: 'Unknown User', bot: false }
          : (userInfo?.id ? { 
              id: userInfo.id, 
              username: userInfo.username || 'Unknown User',
              avatar: userInfo.avatar || null,
              bot: userInfo.bot || false,
              hasVideo: userInfo.hasVideo || false,
              isScreenSharing: userInfo.isScreenSharing || false
            } : null)
        
        if (!normalizedUser?.id) {
          console.warn('[VoiceChannel] Invalid userInfo in voice:user-reconnected:', userInfo)
          return
        }
        
        console.log(`[WebRTC] User reconnected: ${normalizedUser.id} (${normalizedUser.username})`)
        applyLowDelayModeToAllPeers()
        cancelPendingPeerRemoval(normalizedUser.id)
        
        // Update participants list (user was already there, just updating)
        setParticipants(prev => {
          const existingIndex = prev.findIndex(p => p?.id === normalizedUser.id)
          if (existingIndex === -1) {
            return [...prev, normalizedUser]
          }
          const next = [...prev]
          next[existingIndex] = { ...prev[existingIndex], ...normalizedUser }
          return next
        })
        
        // Don't play join sound for reconnections - they were never really gone
        
        if (normalizedUser.id !== user?.id) {
          // Check if we already have a connection to this peer
          const existing = peerConnections.current[normalizedUser.id]
          if (existing) {
            const state = existing.connectionState
            // If connection is still good, no need to reconnect
            if (state === 'connected' || state === 'connecting' || state === 'completed') {
              console.log(`[WebRTC] Already connected to reconnected peer ${normalizedUser.id}, no action needed`)
              return
            }
          }
          if (!shouldInitiatePeerConnection(normalizedUser.id)) {
            console.log(`[WebRTC] Waiting for ${normalizedUser.id} to initiate reconnection`)
            return
          }
          
          // Reconnect to the peer with a small delay
          const delay = 500 + (Math.random() * 500)
          console.log(`[WebRTC] Reconnecting to peer ${normalizedUser.id} in ${Math.round(delay)}ms`)
          cancelConnectionAttempt(normalizedUser.id)
          const timeoutId = scheduleTrackedTimeout(() => {
            connectionAttemptTimersRef.current.delete(normalizedUser.id)
            queueConnection(normalizedUser.id)
          }, delay)
          connectionAttemptTimersRef.current.set(normalizedUser.id, timeoutId)
        }
      } catch (err) {
        console.error('[VoiceChannel] Error in voice:user-reconnected handler:', err)
      }
    })

    // Perfect negotiation with per-peer queue - prevents dropped offers and "have-local-offer" stalls
    // Uses the standard polite/impolite collision rule from https://webrtc.github.io/samples/
    socket.on('voice:offer', (data) => {
      const { from, offer, channelId } = data
      if (channelId && channelId !== channelIdRef.current) return

      enqueueSignal(from, async () => {
        console.log('[WebRTC] Processing offer from:', from)
        const pc = createPeerConnection(from)
        applyReceiverLatencyHints(pc, from)

        const polite = isPolite(from)

        const offerCollision =
          makingOfferRef.current[from] ||
          pc.signalingState !== 'stable' ||
          isSettingRemoteAnswerPendingRef.current[from]

        // Standard rule: impolite peer ignores colliding offers, polite peer rolls back
        ignoreOfferRef.current[from] = !polite && offerCollision
        if (ignoreOfferRef.current[from]) {
          console.log('[WebRTC] Ignoring colliding offer from', from, '(impolite)')
          return
        }

        try {
          // Chrome requires awaiting rollback - Firefox is forgiving
          if (offerCollision) {
            console.log('[WebRTC] Rolling back for', from, '(polite)')
            await pc.setLocalDescription({ type: 'rollback' })
          }

          await pc.setRemoteDescription(new RTCSessionDescription(offer))
          remoteDescSetRef.current[from] = true

          // Flush buffered ICE after remote desc (Chrome requirement)
          const pending = pendingCandidatesRef.current[from] || []
          pendingCandidatesRef.current[from] = []
          for (const c of pending) {
            try { await pc.addIceCandidate(new RTCIceCandidate(c)) } catch {}
          }
          if (pending.length) console.log(`[WebRTC] Flushed ${pending.length} buffered ICE for ${from}`)

          isSettingRemoteAnswerPendingRef.current[from] = true
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          isSettingRemoteAnswerPendingRef.current[from] = false

          socket.emit('voice:answer', {
            to: from,
            answer: pc.localDescription,
            channelId: channelIdRef.current
          })
          console.log('[WebRTC] Sent answer to:', from)
        } catch (err) {
          console.error('[WebRTC] Failed to handle offer from', from, ':', err.message)
        } finally {
          isSettingRemoteAnswerPendingRef.current[from] = false
        }
      })
    })

    // Answer handling - must match an outstanding local offer
    // Answers without an existing PC are invalid and should be ignored
    socket.on('voice:answer', (data) => {
      const { from, answer, channelId } = data
      if (channelId && channelId !== channelIdRef.current) return

      enqueueSignal(from, async () => {
        const pc = peerConnections.current[from]
        if (!pc) {
          console.log('[WebRTC] No peer connection for answer from', from, '- ignoring (no outstanding offer)')
          return
        }

        if (pc.signalingState === 'stable') {
          console.log('[WebRTC] Already stable with', from, '- ignoring duplicate answer')
          return
        }

        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer))
          applyReceiverLatencyHints(pc, from)
          remoteDescSetRef.current[from] = true
          ignoreOfferRef.current[from] = false
          negotiationCompleteRef.current[from] = true
          console.log('[WebRTC] Set remote answer from:', from)

          // Flush buffered ICE candidates
          const pending = pendingCandidatesRef.current[from] || []
          pendingCandidatesRef.current[from] = []
          for (const c of pending) {
            try { await pc.addIceCandidate(new RTCIceCandidate(c)) } catch {}
          }
          if (pending.length) console.log(`[WebRTC] Flushed ${pending.length} buffered ICE for ${from}`)
        } catch (err) {
          console.error('[WebRTC] Failed to set answer from', from, ':', err.message)
        }
      })
    })

    // FIX: Improved ICE candidate handling - always process candidates
    // regardless of ignoreOffer state to ensure connectivity
    socket.on('voice:ice-candidate', async (data) => {
      const { from, candidate, channelId } = data
      if (channelId && channelId !== channelIdRef.current) return
      if (!from || !candidate) return

      const pc = peerConnections.current[from]

      if (!pc) {
        // No peer connection yet - buffer the candidate
        if (!pendingCandidatesRef.current[from]) pendingCandidatesRef.current[from] = []
        pendingCandidatesRef.current[from].push(candidate)
        console.log('[WebRTC] Buffered ICE candidate from', from, '- no PC yet')
        return
      }

      // FIX: Always try to add candidates even if remote desc isn't set
      // This ensures we don't miss candidates during connection setup
      if (!remoteDescSetRef.current[from]) {
        // Buffer if remote description not yet set
        if (!pendingCandidatesRef.current[from]) pendingCandidatesRef.current[from] = []
        pendingCandidatesRef.current[from].push(candidate)
        console.log('[WebRTC] Buffered ICE candidate from', from, '- waiting for remote desc')
        return
      }

      // FIX: Remove ignoreOfferRef check - we should always accept ICE candidates
      // to ensure connectivity with all peers regardless of negotiation state
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
        applyReceiverLatencyHints(pc, from)
      } catch (err) {
        console.warn('[WebRTC] Failed to add ICE candidate from', from, ':', err.message)
        // Don't treat this as fatal - ICE can fail for various reasons
      }
    })

    socket.on('voice:user-left', (data) => {
      const userId = data?.userId || data?.id
      if (!userId) return
      // Mark participant as reconnecting in UI instead of removing immediately,
      // giving them time to rejoin (e.g. during socket reconnect).
      setParticipants(prev => prev.map(p =>
        p?.id === userId ? { ...p, isReconnecting: true } : p
      ))
      // Schedule actual removal with a longer grace window (5 s).
      // cancelPendingPeerRemoval is called inside schedulePeerRemoval, so any
      // pre-existing timer for this userId is replaced automatically.
      schedulePeerRemoval(userId, 5000, { playSound: true })
    })

// Handle force-reconnect command from server (consensus broken)
socket.on('voice:force-reconnect', (data) => {
      const { channelId, reason, targetPeer, failurePercent, timestamp } = data
      if (channelId !== channelIdRef.current) return

      console.log(`[Voice] Force-reconnect received: ${reason}, target=${targetPeer}, failures=${failurePercent}%`)

      if (targetPeer === user?.id) {
        // I am the problematic peer - rebuild the mesh in-place, do not leave channel.
        console.log('[Voice] I am the target peer - performing in-place reconnect')
        soundService.error()
        performInPlaceReconnect(`targeted:${reason || 'unknown'}`)
      } else if (targetPeer === 'all' || targetPeer === '*') {
        // Everyone reconnect - rebuild in-place so users are not kicked from UI.
        console.log('[Voice] Full channel reconnect requested - performing in-place reconnect')
        soundService.error()
        performInPlaceReconnect(`all:${reason || 'unknown'}`)
      } else {
        // Reconnect to specific peer only
        console.log(`[Voice] Reconnecting to specific peer ${targetPeer}`)
        if (peerConnections.current[targetPeer]) {
          try { peerConnections.current[targetPeer].close() } catch {}
          delete peerConnections.current[targetPeer]
        }
        // Clear state and requeue
        delete makingOfferRef.current[targetPeer]
        delete ignoreOfferRef.current[targetPeer]
        delete remoteDescSetRef.current[targetPeer]
        delete pendingCandidatesRef.current[targetPeer]
        cancelConnectionAttempt(targetPeer)
        schedulePeerReconnect(targetPeer, 'force-reconnect', { force: true, immediate: true })
      }
    })

    socket.on('voice:user-updated', (data) => {
      // Skip if no userId provided
      if (!data?.userId) return
      setParticipants(prev => prev.map(p => 
        p?.id === data.userId ? { ...p, ...data } : p
      ).filter(p => p?.id))
    })

    socket.on('voice:screen-share-update', (data) => {
      if (data.userId !== user?.id) {
        if (data.enabled) soundService.screenShareStart()
        else soundService.screenShareStop()
      }
      setParticipants(prev => prev.map(p => 
        p.id === data.userId ? { ...p, isScreenSharing: data.enabled } : p
      ))
      if (!data.enabled) {
        setTimeout(() => {
          const pc = peerConnections.current[data.userId]
          const hasLiveVideo = !!pc?.getReceivers()?.some(r => (
            r.track?.kind === 'video' && r.track?.readyState === 'live'
          ))
          if (!hasLiveVideo) {
            clearRemoteVideoState(data.userId, { onlyIfScreen: true })
          }
        }, 300)
      }
      console.log(`[WebRTC] User ${data.userId} ${data.enabled ? 'started' : 'stopped'} screen sharing`)
    })

    socket.on('voice:video-update', (data) => {
      const { userId, username, enabled } = data
      console.log(`[WebRTC] User ${userId} (${username}) ${enabled ? 'enabled' : 'disabled'} video`)
      
      // Update participants state to reflect video status
      setParticipants(prev => prev.map(p => 
        p.id === userId ? { ...p, hasVideo: enabled } : p
      ))
      if (!enabled) {
        setTimeout(() => {
          const pc = peerConnections.current[userId]
          const hasLiveVideo = !!pc?.getReceivers()?.some(r => (
            r.track?.kind === 'video' && r.track?.readyState === 'live'
          ))
          if (!hasLiveVideo) {
            clearRemoteVideoState(userId)
          }
        }, 300)
      }
      
      // When peer enables video, request resync to ensure proper audio-video sync
      if (enabled && userId !== user?.id) {
        // Reset sync state for this peer when they enable video
        syncCorrectionRef.current[userId] = {
          lastVideoTime: 0,
          lastAudioTime: 0,
          drift: 0,
          correctionApplied: 0
        }
        // Request resync from that peer
        socket?.emit('voice:resync-request', { 
          to: userId, 
          channelId: channel.id 
        })
      }
      
      // Play a sound for video toggle (optional)
      if (userId !== user?.id) {
        if (enabled) {
          soundService.cameraOn()
        } else {
          soundService.cameraOff()
        }
      }
    })

    // Handle resync requests from peers - tells that peer to resync their media with us
    socket.on('voice:resync-request', (data) => {
      const { from, channelId } = data
      if (channelId && channelId !== channelIdRef.current) return
      
      console.log(`[Sync] Resync requested by peer: ${from}`)
      
      // Reset our sync state for this peer
      syncCorrectionRef.current[from] = {
        lastVideoTime: 0,
        lastAudioTime: 0,
        drift: 0,
        correctionApplied: 0
      }
      
      // Force the video element to seek to current time to resync
      const videoEl = videoElements.current[from]
      const audioEl = audioElements.current[from]
      
      if (videoEl && audioEl) {
        // Both audio and video exist - force a small seek to trigger resync
        const currentTime = audioEl.currentTime
        if (currentTime > 0) {
          // Small seek forward and back to force resync
          videoEl.currentTime = currentTime
          console.log(`[Sync] Forced resync for ${from}: time=${currentTime.toFixed(2)}s`)
        }
      }
    })

    return () => {
      // Mark as cancelled to stop in-flight init
      cancelled = true
      isInitializingRef.current = false
      clearAllScheduledVoiceTimers()

      // Remove document audio resume listeners
      document.removeEventListener('click',   resumeAudio)
      document.removeEventListener('keydown', resumeAudio)
      
      // Check if this is a channel change (component will remount with new channel)
      // A channel change is when we're switching to a DIFFERENT voice channel
      const currentChannel = channelIdRef.current
      const nextChannel = channel?.id
      const isChannelChange = currentChannel && nextChannel && currentChannel !== nextChannel
      // Leaving voice entirely (nextChannel is undefined) also requires cleanup
      const isLeavingVoice = currentChannel && !nextChannel
      
      console.log('[Voice] Cleanup running, hasJoinedRef:', hasJoinedRef.current, 'currentChannel:', currentChannel, 'nextChannel:', nextChannel, 'channelChange:', isChannelChange, 'leavingVoice:', isLeavingVoice)
      
      // Unsubscribe from socket events
      socket.off('voice:participants')
      socket.off('voice:user-joined')
      socket.off('voice:user-reconnected')
      socket.off('voice:user-left')
      socket.off('voice:user-updated')
      socket.off('voice:offer')
      socket.off('voice:answer')
      socket.off('voice:ice-candidate')
      socket.off('voice:screen-share-update')
      socket.off('voice:video-update')
      socket.off('voice:resync-request')
      socket.off('voice:force-reconnect')
      socket.off('connect', onReconnectJoin)
      
      // Clean up if we joined and are either:
      // 1. Switching to a different voice channel (isChannelChange)
      // 2. Leaving the voice channel view entirely (isLeavingVoice)
      // But NOT if this is an intentional leave (handleLeave already emitted voice:leave)
      const shouldCleanup = hasJoinedRef.current && (isChannelChange || isLeavingVoice) && !isIntentionalLeave
      
      // Reset the intentional leave flag after checking (for next time)
      isIntentionalLeave = false
      
      if (shouldCleanup) {
        // Close peer connections
        Object.values(peerConnections.current).forEach(pc => {
          try { pc.close() } catch (e) {}
        })
        peerConnections.current = {}
        
        // Clean up audio elements (also remove from DOM) and Web Audio nodes
        Object.entries(audioElements.current).forEach(([key, node]) => {
          if (key.includes('__webaudio')) {
            try { node?.disconnect() } catch {}
          } else if (node && node.pause) {
            node.pause()
            node.srcObject = null
            if (node.parentNode) node.parentNode.removeChild(node)
          }
        })
        audioElements.current = {}
        
        // Stop local stream
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(track => track.stop())
          localStreamRef.current = null
          activeOutboundAudioTrackRef.current = null
          activeOutboundAudioStreamRef.current = null
        }
        
        // Clean up audio context
        if (analyserRef.current?.audioContext && analyserRef.current.audioContext.state !== 'closed') {
          analyserRef.current.audioContext.close().catch(() => {})
        }
        analyserRef.current = null
        cleanupAllVideoElements()
        
        // Emit leave only if we haven't already and socket is connected
        if (!hasLeftRef.current && channelIdRef.current) {
          // Play self-leave sound (callLeft = melancholic descending arpeggio)
          soundService.callLeft()
          
          if (socket?.connected) {
            socket.emit('voice:leave', channelIdRef.current)
            console.log('[Voice] Emitted voice:leave for channel:', channelIdRef.current)
          } else {
            console.log('[Voice] Skip voice:leave emit because socket is disconnected')
          }
          hasLeftRef.current = true
        }
        hasJoinedRef.current = false
        initializedChannelIdRef.current = null
      }
    }
  }, [socket, channel?.id, user?.id, joinKey, clearRemoteVideoState, applyLowDelayModeToAllPeers, applyReceiverLatencyHints, cancelConnectionAttempt, cancelPendingPeerRemoval, clearAllScheduledVoiceTimers, cleanupAllVideoElements, schedulePeerRemoval, scheduleTrackedTimeout, shouldInitiatePeerConnection, schedulePeerReconnect])

  // Expose peer connections for the VoiceInfoModal stats panel
  useEffect(() => {
    window.__vcGetPCs = () => ({ ...peerConnections.current })
    window.__vcGetDiagnostics = () => {
      let settings = {}
      try {
        settings = settingsService.getSettings() || {}
      } catch {}

      const pcs = peerConnections.current || {}
      const peers = Object.entries(pcs).map(([peerId, pc]) => {
        let receivers = []
        try {
          receivers = (pc.getReceivers?.() || []).map((r) => ({
            kind: r?.track?.kind || null,
            trackId: r?.track?.id || null,
            trackReadyState: r?.track?.readyState || null,
            trackEnabled: !!r?.track?.enabled,
            trackMuted: !!r?.track?.muted
          }))
        } catch {}
        return {
          peerId,
          connectionState: pc.connectionState,
          iceConnectionState: pc.iceConnectionState,
          signalingState: pc.signalingState,
          receivers
        }
      })

      const audio = Object.entries(audioElements.current || {}).flatMap(([key, el]) => {
        if (!(el instanceof HTMLMediaElement)) return []
        const srcTracks = (el.srcObject?.getTracks?.() || []).map((t) => ({
          kind: t.kind,
          id: t.id,
          readyState: t.readyState,
          enabled: !!t.enabled,
          muted: !!t.muted
        }))
        return [{
          key,
          paused: !!el.paused,
          muted: !!el.muted,
          volume: typeof el.volume === 'number' ? Number(el.volume.toFixed(3)) : null,
          readyState: el.readyState,
          currentTime: Number((el.currentTime || 0).toFixed(3)),
          sinkId: typeof el.sinkId === 'string' ? el.sinkId : null,
          hasSrcObject: !!el.srcObject,
          srcTracks
          ,
          effectiveMutedReason: (
            !!settings.muteAll ? 'muteAll' :
            !!currentDeafened ? 'deafened' :
            !!el.muted ? 'perUser' : 'none'
          )
        }]
      })

      return {
        now: Date.now(),
        settings: {
          outputDevice: settings.outputDevice || 'default',
          volume: settings.volume ?? 100,
          muteAll: !!settings.muteAll
        },
        currentState: {
          muted: currentMuted,
          deafened: currentDeafened
        },
        peers,
        audioElements: audio
      }
    }
    return () => {
      delete window.__vcGetPCs
      delete window.__vcGetDiagnostics
    }
  }, [currentMuted, currentDeafened])

  // Connection watchdog — gentle monitoring, minimal interference
  // Only restart ICE for disconnected peers, don't aggressively reconnect
  
  useEffect(() => {
    if (!socket) return
    const watchdog = setInterval(() => {
      if (!hasJoinedRef.current) return
      
      const now = Date.now()
      Object.entries(peerConnections.current).forEach(([peerId, pc]) => {
        const s = pc.connectionState
        const iceS = pc.iceConnectionState
        
        // Only handle completely failed connections - close them cleanly
        if (s === 'failed' || s === 'closed') {
          console.log(`[WebRTC] Watchdog: ${peerId} is ${s}`)
          peerDisconnectedAtRef.current.delete(peerId)
          try { pc.close() } catch {}
          delete peerConnections.current[peerId]
          makingOfferRef.current[peerId] = false
          // Don't auto-reconnect - let the peer reconnect to us naturally
          return
        }
        
        // Track when a peer first enters disconnected state
        if (s === 'disconnected' && iceS === 'disconnected') {
          if (!peerDisconnectedAtRef.current.has(peerId)) {
            peerDisconnectedAtRef.current.set(peerId, now)
            console.log(`[WebRTC] Watchdog: ${peerId} entered disconnected state — waiting before ICE restart`)
            return
          }
          // Only restart ICE after the peer has been disconnected for > 8 s
          const disconnectedFor = now - peerDisconnectedAtRef.current.get(peerId)
          if (disconnectedFor > 8000) {
            console.log(`[WebRTC] Watchdog: ${peerId} disconnected for ${disconnectedFor}ms — restarting ICE`)
            peerDisconnectedAtRef.current.delete(peerId)
            pc.restartIce()
          }
          return
        }
        
        // Peer is no longer disconnected — clear the tracked timestamp
        if (peerDisconnectedAtRef.current.has(peerId)) {
          peerDisconnectedAtRef.current.delete(peerId)
        }
      })
    }, 10000) // Check less frequently - every 10 seconds
    return () => clearInterval(watchdog)
  }, [socket])

  // Heartbeat to keep backend session alive and allow grace on reconnects
  useEffect(() => {
    if (!socket) return

    const interval = setInterval(() => {
      if (socket.connected && hasJoinedRef.current && channelIdRef.current) {
        socket.emit('voice:heartbeat', { channelId: channelIdRef.current })
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [socket, channel?.id])

  // Recover video streams from existing peer connections on mount/rejoin.
  // Use bounded retries instead of perpetual polling to avoid log/CPU churn.
  useEffect(() => {
    const recoverVideoStreams = () => {
      if (!hasJoinedRef.current) return
      
      Object.entries(peerConnections.current).forEach(([peerId, pc]) => {
        if (pc.connectionState !== 'connected') return
        applyReceiverLatencyHints(pc, peerId)
        
        const receivers = pc.getReceivers()
        const videoReceiver = receivers.find(r => r.track?.kind === 'video')
        
        if (videoReceiver && videoReceiver.track) {
          const track = videoReceiver.track
          
          if (track.readyState === 'live') {
            // Get or create stream for this peer
            let stream = remoteStreams.current[peerId]
            if (!stream) {
              stream = new MediaStream([track])
              remoteStreams.current[peerId] = stream
            } else {
              // Check if video track already in stream
              const existingVideo = stream.getVideoTracks().find(t => t.id === track.id)
              if (!existingVideo) {
                stream.addTrack(track)
              }
            }
            
            // Update videoStreams state
            setVideoStreams(prev => {
              if (prev[peerId]?.id === stream.id) return prev
              return { ...prev, [peerId]: stream }
            })
            
            // Update participants state
            setParticipants(prev => {
              const existing = prev.find(p => p.id === peerId)
              if (existing?.hasVideo && existing?.videoStream?.id === stream.id) return prev
              return prev.map(p => 
                p.id === peerId 
                  ? { ...p, hasVideo: true, videoStream: stream }
                  : p
              )
            })
          }
        }
      })
    }

    const timeouts = [0, 700, 1800, 3500].map(delay => (
      setTimeout(recoverVideoStreams, delay)
    ))
    
    return () => {
      timeouts.forEach(clearTimeout)
    }
  }, [channel?.id, applyReceiverLatencyHints])

  // Track change debouncing to prevent rapid renegotiation
  const pendingRenegotiationRef = useRef(null)
  const RENEGOTIATION_DELAY = 500

  // Trigger renegotiation for a specific peer after track changes - uses per-peer queue
  const renegotiateWithPeer = (peerId) => {
    enqueueSignal(peerId, async () => {
      const pc = peerConnections.current[peerId]
      if (!pc) {
        console.log(`[WebRTC] Cannot renegotiate with ${peerId} - no peer connection`)
        return
      }
      
      const connState = pc.connectionState
      const iceState = pc.iceConnectionState
      const sigState = pc.signalingState
      
      if (connState === 'closed' || connState === 'failed' || connState === 'disconnected') {
        console.log(`[WebRTC] Skipping renegotiation with ${peerId} - connection state: ${connState}`)
        return
      }
      
      if (iceState === 'failed' || iceState === 'disconnected') {
        console.log(`[WebRTC] Skipping renegotiation with ${peerId} - ICE state: ${iceState}`)
        return
      }
      
      if (sigState !== 'stable') {
        console.log(`[WebRTC] Cannot renegotiate with ${peerId} - signaling state: ${sigState}`)
        return
      }
      
      if (makingOfferRef.current[peerId]) {
        console.log(`[WebRTC] Skipping renegotiation for ${peerId} - offer already in flight`)
        return
      }
      
      // Skip if we're currently setting a remote answer
      if (isSettingRemoteAnswerPendingRef.current[peerId]) {
        console.log(`[WebRTC] Skipping renegotiation for ${peerId} - setting remote answer`)
        return
      }
      
      try {
        makingOfferRef.current[peerId] = true
        const offer = await pc.createOffer()
        const patchedOffer = {
          ...offer,
          sdp: preferOpusInSdp(offer.sdp)
        }
        
        if (pc.signalingState !== 'stable') {
          console.log(`[WebRTC] Aborting renegotiation for ${peerId} - state changed to ${pc.signalingState}`)
          return
        }
        
        await pc.setLocalDescription(patchedOffer)
        socket?.emit('voice:offer', {
          to: peerId,
          offer: pc.localDescription,
          channelId: channelIdRef.current
        })
        console.log(`[WebRTC] Sent renegotiation offer to ${peerId}`)
      } catch (err) {
        console.error(`[WebRTC] Renegotiation failed for ${peerId}:`, err.message)
      } finally {
        makingOfferRef.current[peerId] = false
      }
    })
  }

  // Trigger renegotiation with all connected peers (debounced)
  const renegotiateWithAllPeers = useCallback(async () => {
    if (pendingRenegotiationRef.current) {
      clearTimeout(pendingRenegotiationRef.current)
    }
    
    pendingRenegotiationRef.current = setTimeout(async () => {
      const peerIds = Object.keys(peerConnections.current)
      console.log(`[WebRTC] Renegotiating with ${peerIds.length} peers for track change`)
      
      for (const peerId of peerIds) {
        const pc = peerConnections.current[peerId]
        if (pc?.connectionState === 'connected' && pc.signalingState === 'stable') {
          await new Promise(r => setTimeout(r, 150))
          await renegotiateWithPeer(peerId)
        }
      }
      
      pendingRenegotiationRef.current = null
    }, RENEGOTIATION_DELAY)
  }, [])

  // Re-apply low-delay mode periodically so receivers created during renegotiation
  // also get latency hints without waiting for another track/connect callback.
  useEffect(() => {
    const run = () => {
      if (!hasJoinedRef.current) return
      applyLowDelayModeToAllPeers()
    }
    run()
    const interval = setInterval(run, 2000)
    return () => clearInterval(interval)
  }, [channel?.id, applyLowDelayModeToAllPeers])
  
  // Connect local video stream to video element
  useEffect(() => {
    if (localVideoRef.current && localVideoStream && isVideoOn) {
      localVideoRef.current.srcObject = localVideoStream
    }
  }, [localVideoStream, isVideoOn])

  // Ensure local camera/screen state is cleared immediately when tracks end.
  useEffect(() => {
    const localVideoTrack = localVideoStream?.getVideoTracks?.()[0]
    if (!localVideoTrack) return

    const handleLocalVideoEnded = async () => {
      setIsVideoOn(false)
      setLocalVideoStream(null)
      setParticipants(prev => prev.map(p => (
        p.id === user?.id ? { ...p, hasVideo: false, videoStream: null } : p
      )))
      setVideoStreams(prev => {
        if (!prev[user?.id]) return prev
        const next = { ...prev }
        delete next[user?.id]
        return next
      })
      socket?.emit('voice:video', { channelId: channel?.id, enabled: false })
      await renegotiateWithAllPeers()
    }

    localVideoTrack.onended = () => { handleLocalVideoEnded().catch(() => {}) }
    return () => {
      if (localVideoTrack.onended) localVideoTrack.onended = null
    }
  }, [localVideoStream, user?.id, channel?.id, socket, renegotiateWithAllPeers])

  useEffect(() => {
    const localScreenTrack = screenStream?.getVideoTracks?.()[0]
    if (!localScreenTrack) return
    localScreenTrack.onended = () => {
      _stopScreenShare(screenStream)
      renegotiateWithAllPeers().catch(() => {})
    }
    return () => {
      if (localScreenTrack.onended) localScreenTrack.onended = null
    }
  }, [screenStream, renegotiateWithAllPeers])

  // ── Global debug helper (accessible from browser console as window.__vcDebug()) ──
  useEffect(() => {
    window.__vcDebug = () => {
      console.group('[VoiceChannel Debug]')
      console.log('Channel:', channel?.id, channel?.name)
      console.log('Participants:', participants.map(p => p.username))
      console.log('Local stream tracks:', localStreamRef.current?.getTracks().map(t => `${t.kind}:${t.readyState}:enabled=${t.enabled}`))
      console.log('Peer connections:')
      Object.entries(peerConnections.current).forEach(([id, pc]) => {
        console.log(`  ${id}: conn=${pc.connectionState} ice=${pc.iceConnectionState} sig=${pc.signalingState}`)
        pc.getReceivers().forEach(r => {
          const t = r.track
          console.log(`    receiver: kind=${t?.kind} readyState=${t?.readyState} enabled=${t?.enabled} muted=${t?.muted}`)
        })
      })
      console.log('Audio elements:')
      Object.entries(audioElements.current).forEach(([id, el]) => {
        const tracks = el.srcObject?.getTracks() || []
        console.log(`  ${id}: paused=${el.paused} volume=${el.volume} muted=${el.muted} readyState=${el.readyState} srcObject=${!!el.srcObject} tracks=${tracks.map(t => `${t.kind}:${t.readyState}`).join(',')}`)
        // Try to force-play if paused
        if (el.paused && el.srcObject) {
          console.log(`  ${id}: attempting force play...`)
          el.play().then(() => console.log(`  ${id}: force play OK`)).catch(e => console.warn(`  ${id}: force play failed:`, e.message))
        }
      })
      console.log('Remote streams:')
      Object.entries(remoteStreams.current).forEach(([id, stream]) => {
        console.log(`  ${id}: active=${stream.active} tracks=${stream.getTracks().map(t => `${t.kind}:${t.readyState}:enabled=${t.enabled}`).join(',')}`)
      })
      console.groupEnd()
    }
    console.log('[VoiceChannel] Debug helper ready — run window.__vcDebug() in console for audio diagnostics')
    return () => { delete window.__vcDebug }
  }, [participants, channel?.id])

  const persistVoiceState = useCallback((muted, deafened) => {
    const nextDeafened = !!deafened
    const nextMuted = nextDeafened ? true : !!muted
    try {
      localStorage.setItem(VOICE_STATE_STORAGE_KEY, JSON.stringify({
        muted: nextMuted,
        deafened: nextDeafened,
        updatedAt: Date.now(),
      }))
    } catch {}

    try {
      const settings = settingsService.getSettings()
      if (settings?.rememberVoiceState) {
        // Persist remembered voice state without broadcasting a global settings
        // update. Mute/unmute should only affect local mic state, not remote
        // playback routing/volume.
        const SETTINGS_KEY = 'voltchat_settings'
        const raw = localStorage.getItem(SETTINGS_KEY)
        const parsed = raw ? JSON.parse(raw) : settings
        const nextSettings = { ...parsed, voiceMuted: nextMuted, voiceDeafened: nextDeafened }
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(nextSettings))
      }
    } catch {}
  }, [])

  // Keep persisted mute/deafen state in sync regardless of where changes originate.
  useEffect(() => {
    persistVoiceState(currentMuted, currentDeafened)
  }, [currentMuted, currentDeafened, persistVoiceState])

  useEffect(() => {
    if (!currentDeafened) preDeafenMutedRef.current = currentMuted
  }, [currentMuted, currentDeafened])

  useEffect(() => {
    const rootEl = rootViewRef.current
    const container = rootEl?.closest('.voice-container')
    if (!container) return

    container.classList.add('voice-size-transition')
    const timer = setTimeout(() => container.classList.remove('voice-size-transition'), 300)
    setIsViewTransitioning(true)
    const innerTimer = setTimeout(() => setIsViewTransitioning(false), 280)

    return () => {
      clearTimeout(timer)
      clearTimeout(innerTimer)
      container.classList.remove('voice-size-transition')
    }
  }, [viewMode])

  useEffect(() => {
    if (viewMode !== 'mini') return
    const rootEl = rootViewRef.current
    const container = rootEl?.closest('.voice-container')
    if (!container) return

    try {
      const saved = localStorage.getItem(MINI_POSITION_STORAGE_KEY)
      if (!saved) return
      const parsed = JSON.parse(saved)
      if (typeof parsed?.x !== 'number' || typeof parsed?.y !== 'number') return
      const rect = container.getBoundingClientRect()
      const maxX = Math.max(0, window.innerWidth - rect.width)
      const maxY = Math.max(0, window.innerHeight - rect.height)
      const x = Math.max(0, Math.min(parsed.x, maxX))
      const y = Math.max(0, Math.min(parsed.y, maxY))
      container.style.left = `${x}px`
      container.style.top = `${y}px`
      container.style.right = 'auto'
      container.style.bottom = 'auto'
    } catch {}
  }, [viewMode])

  useEffect(() => {
    const rootEl = rootViewRef.current
    const container = rootEl?.closest('.voice-container')
    if (!container) return

    if (viewMode !== 'mini') {
      setIsMiniDragging(false)
      miniDragRef.current.active = false
      container.classList.remove('voice-mini-dragging')
      container.style.removeProperty('left')
      container.style.removeProperty('top')
      container.style.removeProperty('right')
      container.style.removeProperty('bottom')
      return
    }

    const isInteractiveTarget = (target) => {
      if (!(target instanceof Element)) return false
      return !!target.closest('button, input, textarea, a, .voice-participant-menu')
    }

    const startDrag = (e) => {
      if (miniDragRef.current.active) return
      if (e.button !== undefined && e.button !== 0) return
      if (isInteractiveTarget(e.target)) return

      const rect = container.getBoundingClientRect()
      const clientX = e.clientX ?? 0
      const clientY = e.clientY ?? 0
      miniDragRef.current = {
        active: true,
        startX: clientX,
        startY: clientY,
        startLeft: rect.left,
        startTop: rect.top,
      }
      setIsMiniDragging(true)
      container.classList.add('voice-mini-dragging')
      container.style.left = `${rect.left}px`
      container.style.top = `${rect.top}px`
      container.style.right = 'auto'
      container.style.bottom = 'auto'
      e.preventDefault()
    }

    const onMove = (e) => {
      if (!miniDragRef.current.active) return
      const rect = container.getBoundingClientRect()
      const deltaX = (e.clientX ?? 0) - miniDragRef.current.startX
      const deltaY = (e.clientY ?? 0) - miniDragRef.current.startY
      const nextLeft = miniDragRef.current.startLeft + deltaX
      const nextTop = miniDragRef.current.startTop + deltaY
      const maxX = Math.max(0, window.innerWidth - rect.width)
      const maxY = Math.max(0, window.innerHeight - rect.height)
      const x = Math.max(0, Math.min(nextLeft, maxX))
      const y = Math.max(0, Math.min(nextTop, maxY))
      container.style.left = `${x}px`
      container.style.top = `${y}px`
    }

    const stopDrag = () => {
      if (!miniDragRef.current.active) return
      miniDragRef.current.active = false
      setIsMiniDragging(false)
      container.classList.remove('voice-mini-dragging')
      const x = Number.parseFloat(container.style.left)
      const y = Number.parseFloat(container.style.top)
      if (Number.isFinite(x) && Number.isFinite(y)) {
        try { localStorage.setItem(MINI_POSITION_STORAGE_KEY, JSON.stringify({ x, y })) } catch {}
      }
    }

    const onResize = () => {
      const rect = container.getBoundingClientRect()
      const maxX = Math.max(0, window.innerWidth - rect.width)
      const maxY = Math.max(0, window.innerHeight - rect.height)
      const x = Number.parseFloat(container.style.left)
      const y = Number.parseFloat(container.style.top)
      if (!Number.isFinite(x) || !Number.isFinite(y)) return
      const nextX = Math.max(0, Math.min(x, maxX))
      const nextY = Math.max(0, Math.min(y, maxY))
      if (nextX !== x || nextY !== y) {
        container.style.left = `${nextX}px`
        container.style.top = `${nextY}px`
      }
    }

    const header = container.querySelector('.voice-container-header')
    if (header) {
      header.style.cursor = 'grab'
      header.addEventListener('mousedown', startDrag)
    }
    rootEl.addEventListener('mousedown', startDrag)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', stopDrag)
    window.addEventListener('resize', onResize)

    return () => {
      if (header) {
        header.style.removeProperty('cursor')
        header.removeEventListener('mousedown', startDrag)
      }
      rootEl.removeEventListener('mousedown', startDrag)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', stopDrag)
      window.removeEventListener('resize', onResize)
      container.classList.remove('voice-mini-dragging')
      miniDragRef.current.active = false
      setIsMiniDragging(false)
    }
  }, [viewMode])

  // Clear focused activity when switching to mini mode to prevent keyboard capture
  useEffect(() => {
    if (viewMode === 'mini' && focusedBuiltinSession) {
      console.log('[VoiceChannel] Clearing focused activity in mini mode to prevent keyboard capture')
      setFocusedBuiltinSession(null)
      clearFocusedActivity()
    }
  }, [viewMode, focusedBuiltinSession, clearFocusedActivity])

  const toggleMute = () => {
    // Can't unmute while deafened
    if (currentDeafened && currentMuted) return

    const newMuted = !currentMuted
    // Enable/disable the actual mic track
    localStream?.getAudioTracks().forEach(track => {
      track.enabled = !newMuted
    })
    localStreamRef.current?.getAudioTracks().forEach(track => {
      track.enabled = !newMuted
    })

    setLocalIsMuted(newMuted)
    onMuteChange?.(newMuted)
    socket?.emit('voice:mute', { channelId: channel.id, muted: newMuted })
    if (!currentDeafened) preDeafenMutedRef.current = newMuted
    persistVoiceState(newMuted, currentDeafened)

    if (newMuted) {
      soundService.mute()
    } else {
      soundService.unmute()
    }
  }

  const toggleDeafen = () => {
    const newDeafened = !currentDeafened
    setLocalIsDeafened(newDeafened)
    onDeafenChange?.(newDeafened)

    // Only mute/unmute real <audio> HTMLMediaElements — skip WebAudio nodes
    Object.entries(audioElements.current).forEach(([key, el]) => {
      if (key.includes('__webaudio')) return
      if (el && el instanceof HTMLMediaElement) {
        el.muted = newDeafened
      }
    })

    // Deafening also mutes the mic so you don't send audio while deaf
    if (newDeafened) {
      preDeafenMutedRef.current = currentMuted
      if (!currentMuted) {
        setLocalIsMuted(true)
        onMuteChange?.(true)
      }
      localStream?.getAudioTracks().forEach(track => { track.enabled = false })
      socket?.emit('voice:mute', { channelId: channel.id, muted: true })
      persistVoiceState(true, true)
    }

    // Un-deafening restores mic to whatever mute state was before
    if (!newDeafened) {
      const restoredMuted = !!preDeafenMutedRef.current
      setLocalIsMuted(restoredMuted)
      onMuteChange?.(restoredMuted)
      socket?.emit('voice:mute', { channelId: channel.id, muted: restoredMuted })
      const shouldBeEnabled = !restoredMuted
      localStream?.getAudioTracks().forEach(track => { track.enabled = shouldBeEnabled })
      persistVoiceState(restoredMuted, false)
    }

    socket?.emit('voice:deafen', { channelId: channel.id, deafened: newDeafened })

    if (newDeafened) {
      soundService.deafen()
    } else {
      soundService.undeafen()
    }
  }

  const publishCameraStream = async (stream, { renegotiate = false } = {}) => {
    const videoTrack = stream?.getVideoTracks?.()[0]
    if (!videoTrack) return
    videoTrack._senderTag = 'camera'

    Object.entries(peerConnections.current).forEach(([peerId, pc]) => {
      const connState = pc.connectionState
      const iceState = pc.iceConnectionState
      if (connState === 'closed' || connState === 'failed' || connState === 'disconnected') return
      if (iceState === 'failed' || iceState === 'disconnected') return
      const existing = pc.getSenders().find((sender) => sender.track?._senderTag === 'camera')
      if (existing) {
        existing.replaceTrack(videoTrack).catch(() => {})
      } else {
        const sender = pc.addTrack(videoTrack, stream)
        if (sender?.track) sender.track._senderTag = 'camera'
      }
    })

    if (renegotiate) {
      await renegotiateWithAllPeers()
    }
  }

  const publishScreenStream = async (stream, { renegotiate = false } = {}) => {
    const videoTrack = stream?.getVideoTracks?.()[0]
    const audioTracks = stream?.getAudioTracks?.() || []

    if (videoTrack) {
      videoTrack._senderTag = 'screen'
    }
    audioTracks.forEach((track) => {
      track._senderTag = 'screen-audio'
    })

    Object.entries(peerConnections.current).forEach(([peerId, pc]) => {
      const connState = pc.connectionState
      const iceState = pc.iceConnectionState
      if (connState === 'closed' || connState === 'failed' || connState === 'disconnected') return
      if (iceState === 'failed' || iceState === 'disconnected') return

      if (videoTrack) {
        const existingVideoSender = pc.getSenders().find((sender) => sender.track?._senderTag === 'screen')
        if (existingVideoSender) {
          existingVideoSender.replaceTrack(videoTrack).catch(() => {})
        } else {
          pc.addTrack(videoTrack, stream)
        }
      }

      audioTracks.forEach((audioTrack) => {
        const existingAudioSender = pc.getSenders().find((sender) => sender.track?._senderTag === 'screen-audio')
        if (existingAudioSender) {
          existingAudioSender.replaceTrack(audioTrack).catch(() => {})
        } else if (!pc.getSenders().find((sender) => sender.track?.id === audioTrack.id)) {
          pc.addTrack(audioTrack, stream)
        }
      })
    })

    if (renegotiate) {
      await renegotiateWithAllPeers()
    }
  }

  const toggleVideo = async () => {
    if (isVideoOn) {
      // Stop all video tracks first so the camera LED turns off
      localVideoStream?.getVideoTracks().forEach(track => track.stop())
      if (rawLocalVideoStreamRef.current && rawLocalVideoStreamRef.current !== localVideoStream) {
        rawLocalVideoStreamRef.current.getTracks().forEach((track) => track.stop())
      }
      rawLocalVideoStreamRef.current = null
      stopOverlaySession('camera')
      setLocalVideoStream(null)
      setIsVideoOn(false)
      soundService.cameraOff()

      // Remove the video sender entirely rather than replaceTrack(null).
      // replaceTrack(null) leaves a broken sender that can destabilise the PC.
      Object.values(peerConnections.current).forEach(pc => {
        const videoSender = pc.getSenders().find(s => s.track?._senderTag === 'camera')
        if (videoSender) {
          try { pc.removeTrack(videoSender) } catch {}
        }
      })

      // Renegotiate to remove video track from all peers
      await renegotiateWithAllPeers()

      // Update local participant state to reflect video is off
      setParticipants(prev => prev.map(p => 
        p.id === user?.id ? { ...p, hasVideo: false, videoStream: null } : p
      ))

      // Clear local video stream from videoStreams
      setVideoStreams(prev => {
        const next = { ...prev }
        delete next[user?.id]
        return next
      })

      socket?.emit('voice:video', { channelId: channel.id, enabled: false })
    } else {
      const settings = settingsService.getSettings()

      const tryGetCamera = async (deviceId) => {
        const constraints = {
          video: deviceId && deviceId !== 'default'
            ? { deviceId: { exact: deviceId } }
            : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
        }
        return navigator.mediaDevices.getUserMedia(constraints)
      }

      try {
        let videoStream
        try {
          videoStream = await tryGetCamera(settings.videoDevice)
        } catch (err) {
          if (err.name === 'OverconstrainedError') {
            settingsService.saveSettings({ ...settings, videoDevice: 'default' })
            videoStream = await tryGetCamera(null)
          } else {
            throw err
          }
        }

        rawLocalVideoStreamRef.current = videoStream
        const outboundVideoStream = buildOverlayCompositeStream('camera', videoStream, cameraOverlays)
        setLocalVideoStream(outboundVideoStream)
        setIsVideoOn(true)
        soundService.cameraOn()

        await publishCameraStream(outboundVideoStream, { renegotiate: true })

        // Request resync from all peers when video starts
        socket?.emit('voice:video', { channelId: channel.id, enabled: true })
        Object.keys(peerConnections.current).forEach(peerId => {
          socket?.emit('voice:resync-request', { 
            to: peerId, 
            channelId: channel.id 
          })
        })
        
        // Reset sync state for all peers when video starts
        Object.keys(syncCorrectionRef.current).forEach(peerId => {
          syncCorrectionRef.current[peerId] = {
            lastVideoTime: 0,
            lastAudioTime: 0,
            drift: 0,
            correctionApplied: 0
          }
        })
      } catch (err) {
        console.error('[Video] Failed to get camera:', err)
      }
    }
  }

  // Remove senders that belong to a specific stream without touching others
  const _removeSendersForStream = (stream) => {
    if (!stream) return
    const trackIds = new Set(stream.getTracks().map(t => t.id))
    Object.values(peerConnections.current).forEach(pc => {
      pc.getSenders().forEach(sender => {
        if (sender.track && trackIds.has(sender.track.id)) {
          try { pc.removeTrack(sender) } catch {}
        }
      })
    })
  }

  const _stopScreenShare = (stream) => {
    // Clear video-only stream cache for this stream
    if (stream?.id) {
      delete videoOnlyStreamCache.current[stream.id]
    }
    stream?.getTracks().forEach(track => track.stop())
    if (rawScreenStreamRef.current && rawScreenStreamRef.current !== stream) {
      rawScreenStreamRef.current.getTracks().forEach((track) => track.stop())
    }
    rawScreenStreamRef.current = null
    stopOverlaySession('screen')
    _removeSendersForStream(stream)
    setScreenStream(null)
    setIsScreenSharing(false)
    setScreenShareAudioWarning('')
    soundService.screenShareStop()
    
    // Update local participant state to reflect screen share is off
    setParticipants(prev => prev.map(p => 
      p.id === user?.id ? { ...p, isScreenSharing: false } : p
    ))
    
    // Clear local screen share from videoStreams
    setVideoStreams(prev => {
      const next = { ...prev }
      delete next[user?.id]
      return next
    })
    
    socket?.emit('voice:screen-share', { channelId: channel.id, enabled: false })
  }

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      _stopScreenShare(screenStream)
      // Renegotiate to remove screen share track from all peers
      await renegotiateWithAllPeers()
    } else {
      // In desktop mode, show the screen picker
      if (window.__IS_DESKTOP_APP__ && window.electron?.getSources) {
        setShowScreenSharePicker(true)
        return
      }
      
      // Web fallback
      try {
        const browser = detectScreenShareBrowser()
        let stream = null
        
        // Use Electron's desktopCapturer for screen sharing with audio
        if (window.__IS_DESKTOP_APP__ && window.electron?.getSources) {
          const sources = await window.electron.getSources({
            types: ['window', 'screen'],
            thumbnailSize: { width: 320, height: 180 }
          })
          
          if (!sources || sources.length === 0) {
            throw new Error('No sources available')
          }
          
          // Prefer screen sources for full screen share with audio
          const sourceId = sources.find(s => s.source === 'screen')?.id || sources[0].id
          
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              // @ts-ignore - Electron-specific constraint
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: sourceId,
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
              }
            },
            video: {
              // @ts-ignore
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: sourceId,
                maxWidth: 1920,
                maxHeight: 1080,
                maxFrameRate: 30
              }
            }
          })
        } else {
          // Fallback for web - standard getDisplayMedia
          try {
            stream = await navigator.mediaDevices.getDisplayMedia({
              video: { frameRate: { ideal: 30 } },
              audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
              }
            })
          } catch (displayErr) {
            // Fallback for browsers/platforms that do not allow display audio capture.
            if (displayErr?.name !== 'NotAllowedError') {
              console.warn('[Screen] Display capture with audio failed, retrying without audio:', displayErr.message || displayErr)
            }
            stream = await navigator.mediaDevices.getDisplayMedia({
              video: { frameRate: { ideal: 30 } },
              audio: false
            })
          }
        }

        rawScreenStreamRef.current = stream
        const outboundScreenStream = buildOverlayCompositeStream('screen', stream, screenOverlays)
        setScreenStream(outboundScreenStream)
        setIsScreenSharing(true)
        soundService.screenShareStart()

        const videoTrack = stream.getVideoTracks()[0]
        const screenAudioTracks = stream.getAudioTracks()
        screenAudioTracks.forEach(track => {
          track._senderTag = 'screen-audio'
        })
        if (screenAudioTracks.length === 0) {
          const warningMessage = browser.isFirefoxFamily
            ? t('voice.screenShareAudioUnavailableFirefox', `${browser.label} may not capture tab/system audio for screen share. Sharing will continue as video only.`)
            : t('voice.screenShareAudioUnavailable', 'Screen sharing started without an audio track. Sharing will continue as video only.')
          setScreenShareAudioWarning(warningMessage)
          console.log('[Screen] Screen share started without system audio track (platform/browser limitation or user choice)')
        } else {
          setScreenShareAudioWarning('')
          console.log(`[Screen] Screen share includes ${screenAudioTracks.length} audio track(s)`)
        }

        await publishScreenStream(outboundScreenStream, { renegotiate: true })

        videoTrack.onended = () => {
          _stopScreenShare(stream)
          // Renegotiate after stopping screen share
          renegotiateWithAllPeers()
        }

        socket?.emit('voice:screen-share', { channelId: channel.id, enabled: true })
      } catch (err) {
        setScreenShareAudioWarning('')
        if (err.name !== 'NotAllowedError') {
          console.error('[Screen] Failed to share screen:', err)
        }
        upsertVoiceIssue(diagnoseMediaError(err, 'screen'))
      }
    }
  }

  // Handle screen share source selection from picker (desktop only)
  const handleScreenShareSourceSelect = async ({ sourceId, includeAudio, isNative, stream: nativeStream }) => {
    setShowScreenSharePicker(false)
    
    try {
      let stream
      if (isNative && nativeStream) {
        // Native picker (Wayland/Windows) returns stream directly
        stream = nativeStream
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: includeAudio ? {
            // @ts-ignore
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId,
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false
            }
          } : false,
          video: {
            // @ts-ignore
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId,
              maxWidth: 1920,
              maxHeight: 1080,
              maxFrameRate: 30
            }
          }
        })
      }
      
      rawScreenStreamRef.current = stream
      const outboundScreenStream = buildOverlayCompositeStream('screen', stream, screenOverlays)
      setScreenStream(outboundScreenStream)
      setIsScreenSharing(true)
      soundService.screenShareStart()

      const videoTrack = stream.getVideoTracks()[0]
      const screenAudioTracks = stream.getAudioTracks()
      screenAudioTracks.forEach(track => {
        track._senderTag = 'screen-audio'
      })
      if (screenAudioTracks.length === 0) {
        setScreenShareAudioWarning(t('voice.screenShareAudioUnavailable', 'Screen sharing started without system audio track'))
      }

      await publishScreenStream(outboundScreenStream, { renegotiate: true })

      videoTrack.onended = () => {
        _stopScreenShare(stream)
        renegotiateWithAllPeers()
      }

      socket?.emit('voice:screen-share', { channelId: channel.id, enabled: true })
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        console.error('[Screen] Failed to share screen:', err)
      }
      upsertVoiceIssue(diagnoseMediaError(err, 'screen'))
    }
  }

  const handleActivityLaunch = (activityId, launchUrl = null) => {
    if (!socket || !channel?.id) return
    pendingLaunchedActivityIdRef.current = activityId
    const isBuiltin = String(activityId).startsWith('builtin:')
    const activityDef = CLIENT_BUILTIN_BY_ID[activityId]
    socket.emit('activity:create-session', {
      contextType: 'voice',
      contextId: channel.id,
      activityId,
      activityDefinition: activityDef || { id: activityId, launchUrl },
      launchUrl: launchUrl || activityDef?.launchUrl || null,
      p2p: { enabled: true, preferred: true },
      sound: { enabled: true, volume: 0.8 }
    })
    socket.emit('activity:get-sessions', { contextType: 'voice', contextId: channel.id })
  }

  const handleLeave = () => {
    // Mark as intentional leave so cleanup doesn't re-emit voice:leave
    isIntentionalLeave = true

    if (hasJoinedRef.current && !hasLeftRef.current) {
      soundService.prime()
      soundService.callLeft()
      window.dispatchEvent(new CustomEvent('voice:self-left', {
        detail: {
          channelId: channel?.id || channelIdRef.current,
          userId: user?.id || null
        }
      }))
    }

    // Stop all media tracks
    localStream?.getTracks().forEach(t => t.stop())
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    localStreamRef.current = null
    activeOutboundAudioTrackRef.current = null
    activeOutboundAudioStreamRef.current = null
    localVideoStream?.getTracks().forEach(t => t.stop())
    screenStream?.getTracks().forEach(t => t.stop())
    rawLocalVideoStreamRef.current?.getTracks().forEach(t => t.stop())
    rawScreenStreamRef.current?.getTracks().forEach(t => t.stop())
    rawLocalVideoStreamRef.current = null
    rawScreenStreamRef.current = null
    stopOverlaySession('camera')
    stopOverlaySession('screen')
    clearAllScheduledVoiceTimers()

    // Close all peer connections
    Object.values(peerConnections.current).forEach(pc => { try { pc.close() } catch {} })
    peerConnections.current = {}

    // Remove all audio DOM elements
    Object.entries(audioElements.current).forEach(([key, node]) => {
      if (key.includes('__webaudio')) { try { node?.disconnect() } catch {} }
      else if (node?.pause) { node.pause(); node.srcObject = null; node.parentNode?.removeChild(node) }
    })
    audioElements.current = {}

    // Close analyser context
    if (analyserRef.current?.audioContext && analyserRef.current.audioContext.state !== 'closed') {
      analyserRef.current.audioContext.close().catch(() => {})
    }
    analyserRef.current = null

    // Close and clear video elements
    Object.entries(videoElements.current).forEach(([, node]) => {
      if (node && node.pause) {
        node.pause()
        node.srcObject = null
        if (node.parentNode) node.parentNode.removeChild(node)
      }
    })
    videoElements.current = {}

    // Reset all negotiation state so a fresh join works without page reload
    makingOfferRef.current  = {}
    ignoreOfferRef.current  = {}
    remoteDescSetRef.current = {}
    pendingCandidatesRef.current = {}
    lastOfferTimeRef.current = {}
    negotiationLockRef.current = {}
    negotiationCompleteRef.current = {}
    signalChainRef.current = {}
    isSettingRemoteAnswerPendingRef.current = {}
    serverIceServersRef.current = []
    connectionQueueRef.current = []
    connectionCooldownsRef.current = new Map()
    initializedChannelIdRef.current = null
    isInitializingRef.current = false

    // Reset React state
    setLocalStream(null)
    setLocalVideoStream(null)
    setScreenStream(null)
    setParticipants([])
    setPeerStates({})
    setConnectionState('connecting')
    setJoinedWithoutMic(false)
    setIsVideoOn(false)
    setIsScreenSharing(false)
    setVideoStreams({})

    // Emit leave
    if (hasJoinedRef.current && !hasLeftRef.current) {
      if (socket?.connected) {
        socket.emit('voice:leave', channel.id)
        console.log('[Voice] Manual leave - emitted voice:leave')
      }
      hasJoinedRef.current = false
      hasLeftRef.current = true
    }

    onLeave()
  }
  const otherParticipants = participants.filter(p => p?.id !== user?.id)

  // Create self participant if not in list yet
  const selfParticipant = participants.find(p => p?.id === user?.id) || {
    id: user?.id,
    username: user?.username || user?.email,
    avatar: user?.avatar,
    muted: currentMuted,
    deafened: currentDeafened
  }

  // All participants including self
  let displayParticipants = participants.find(p => p?.id === user?.id)
    ? participants
    : [selfParticipant, ...participants]

  // Filter out invalid participants to prevent crashes
  displayParticipants = displayParticipants.filter((p, index) => {
    if (!p?.id) {
      console.warn(`[VoiceChannel] Filtering out invalid participant at index ${index}:`, p)
      return false
    }
    return true
  })

  // Derive a single overall header status from mic state + peer states
  const overallStatus = (() => {
    if (connectionState === 'error') return 'error'
    if (connectionState === 'connecting') return 'connecting'
    if (!connected) return 'error'
    if (joinedWithoutMic) return 'degraded'
    const peerList = Object.values(peerStates)
    if (peerList.length === 0) return 'connected'          // mic acquired, no peers yet
    if (peerList.some(s => s === 'connected')) return 'connected'
    if (peerList.every(s => s === 'failed'))   return 'degraded'
    if (peerList.some(s => s === 'failed'))    return 'degraded'
    if (peerList.some(s => s === 'connecting' || s === 'new')) return 'connecting'
    return 'connected'
  })()

  const statusLabel = {
    connecting: t('voice.connectingStatus', 'Connecting…'),
    connected:  t('chat.voiceConnected', 'Voice Connected'),
    degraded:   t('voice.connectionIssues', 'Connection Issues'),
    error:      t('voice.connectionError', 'Connection Error'),
  }[overallStatus] ?? t('voice.connectingStatus', 'Connecting…')

  const visibleVoiceIssues = useMemo(() => {
    const derived = [...voiceIssues]

    if (joinedWithoutMic && !derived.some(issue => issue.code === 'mic-fallback')) {
      derived.push(buildVoiceIssue(
        'mic-fallback',
        'warning',
        'Connected without microphone',
        'You are in the channel, but your microphone is not active.',
        'Open Voice Settings to enable mic access or pick a working input device.',
        'settings'
      ))
    }

    if (!connected && !derived.some(issue => issue.code === 'socket-disconnected')) {
      derived.push(buildVoiceIssue(
        'socket-disconnected',
        'error',
        'Realtime connection lost',
        'Voice reconnect is waiting for the realtime socket to come back.',
        'Check your network. If reconnect does not recover, leave and rejoin the channel.',
        'details'
      ))
    }

    if (overallStatus === 'degraded' && !joinedWithoutMic && !derived.some(issue => issue.code === 'peer-connectivity')) {
      derived.push(buildVoiceIssue(
        'peer-connectivity',
        'warning',
        'Voice quality is degraded',
        'At least one peer connection is unstable or failed.',
        'Open connection details to inspect ICE and peer state. Changing network or TURN settings can help.',
        'details'
      ))
    }

    return derived.slice(0, 3)
  }, [voiceIssues, joinedWithoutMic, connected, overallStatus])

  // Close participant context menu on outside click
  useEffect(() => {
    if (!participantMenu) return
    
    const close = (e) => {
      // Don't close if clicking inside the menu
      const menuEl = document.querySelector('.voice-participant-menu')
      if (menuEl && menuEl.contains(e.target)) return
      setParticipantMenu(null)
    }
    
    const closeOnKey = (e) => {
      if (e.key === 'Escape') setParticipantMenu(null)
    }
    
    // Use bubbling phase (false) so menu handlers can stop propagation if needed
    window.addEventListener('pointerdown', close, false)
    window.addEventListener('keydown', closeOnKey, true)
    return () => {
      window.removeEventListener('pointerdown', close, false)
      window.removeEventListener('keydown', closeOnKey, true)
    }
  }, [participantMenu])

  // Speaking detection with smoothing to prevent rapid flashing
  // Uses a hysteresis approach: must be speaking for 150ms to show, must be silent for 300ms to hide
  const speakingStateRef = useRef({}) // Raw speaking state from audio analysis
  const speakingTimersRef = useRef({}) // Timers for debouncing state changes
  const SPEAKING_ON_DELAY = 150  // ms to wait before showing speaking indicator
  const SPEAKING_OFF_DELAY = 300 // ms to wait before hiding speaking indicator
  const remoteStatsPollInFlightRef = useRef(false)

  const updateSpeakingWithHysteresis = useCallback((id, isSpeakingRaw) => {
    const wasSpeaking = speakingStateRef.current[id]
    speakingStateRef.current[id] = isSpeakingRaw

    if (speakingTimersRef.current[id]) {
      clearTimeout(speakingTimersRef.current[id])
      delete speakingTimersRef.current[id]
    }

    if (isSpeakingRaw && !wasSpeaking) {
      speakingTimersRef.current[id] = setTimeout(() => {
        priorityPeersRef.current.add(id)
        setSpeaking(prev => ({ ...prev, [id]: true }))
      }, SPEAKING_ON_DELAY)
      return
    }

    if (!isSpeakingRaw && wasSpeaking) {
      speakingTimersRef.current[id] = setTimeout(() => {
        priorityPeersRef.current.delete(id)
        setSpeaking(prev => ({ ...prev, [id]: false }))
      }, SPEAKING_OFF_DELAY)
      return
    }

    if (isSpeakingRaw === wasSpeaking) {
      if (isSpeakingRaw) priorityPeersRef.current.add(id)
      else priorityPeersRef.current.delete(id)
      setSpeaking(prev => ({ ...prev, [id]: isSpeakingRaw }))
    }
  }, [])

  // Speaking detection based on audio levels (local user)
  useEffect(() => {
    const analyser = analyserRef.current
    if (!analyser) return
    
    const audioAnalyser = analyser.analyser
    const audioContext = analyser.audioContext
    const dataArray = new Uint8Array(audioAnalyser.frequencyBinCount)
    
    const checkSpeaking = () => {
      if (!hasJoinedRef.current) return
      // Guard against closed AudioContext
      if (audioContext?.state === 'closed') return
      
      try {
        audioAnalyser.getByteFrequencyData(dataArray)
      } catch (e) {
        // AudioContext may have been closed, ignore
        return
      }
      
      let sum = 0
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i]
      }
      const average = sum / dataArray.length
      const isSpeakingRaw = average > 12 && !currentMuted
      
      if (user?.id) updateSpeakingWithHysteresis(user.id, isSpeakingRaw)
    }
    
    const speakingInterval = setInterval(checkSpeaking, 100)
    checkSpeaking()
    
    return () => {
      clearInterval(speakingInterval)
    }
  }, [currentMuted, user?.id, updateSpeakingWithHysteresis])

  // Remote speaking detection - use RTP audioLevel stats first, analyser fallback.
  useEffect(() => {
    const getPeerAudioLevel = async (pc) => {
      try {
        const stats = await pc.getStats()
        let maxLevel = null
        stats.forEach(report => {
          const inboundAudio = report.type === 'inbound-rtp' && (report.kind === 'audio' || report.mediaType === 'audio')
          if (!inboundAudio) return
          if (typeof report.audioLevel === 'number') {
            maxLevel = maxLevel == null ? report.audioLevel : Math.max(maxLevel, report.audioLevel)
          }
        })
        return maxLevel
      } catch {
        return null
      }
    }

    const checkRemoteSpeaking = async () => {
      if (!hasJoinedRef.current) return

      if (remoteStatsPollInFlightRef.current) return
      remoteStatsPollInFlightRef.current = true

      try {
        for (const [peerId, pc] of Object.entries(peerConnections.current)) {
          if (!pc || pc.connectionState !== 'connected') continue

          const statsLevel = await getPeerAudioLevel(pc)
          if (typeof statsLevel === 'number') {
            updateSpeakingWithHysteresis(peerId, statsLevel > 0.008)
            continue
          }

          const analyserEntry = remoteAnalysersRef.current[peerId]
          if (!analyserEntry?.analyser) continue
          const { analyser, audioContext, stream } = analyserEntry
          if (audioContext?.state === 'closed') continue
          if (stream && !stream.active) continue

          try {
            const dataArray = new Uint8Array(analyser.frequencyBinCount)
            analyser.getByteFrequencyData(dataArray)
            let sum = 0
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i]
            const average = sum / dataArray.length
            updateSpeakingWithHysteresis(peerId, average > 8)
          } catch {}
        }
      } finally {
        remoteStatsPollInFlightRef.current = false
      }
    }
    
    const remoteSpeakingInterval = setInterval(() => {
      checkRemoteSpeaking().catch(() => {})
    }, 120)
    checkRemoteSpeaking().catch(() => {})
    
    return () => {
      clearInterval(remoteSpeakingInterval)
    }
  }, [updateSpeakingWithHysteresis])

  useEffect(() => {
    return () => {
      Object.values(speakingTimersRef.current).forEach(timer => clearTimeout(timer))
      speakingTimersRef.current = {}
    }
  }, [])

  // Audio-Video sync correction - automatically detects and fixes drift
  useEffect(() => {
    let syncIntervalId = null
    
    const checkAndCorrectSync = () => {
      if (!hasJoinedRef.current) return
      
      // Check each participant with both audio and video
      displayParticipants.forEach(participant => {
        if (!participant?.id || participant.id === user?.id) return // Skip self

        const audioEl = audioElements.current[participant.id]
        const videoEl = videoElements.current[participant.id]

        if (!audioEl || !videoEl) return
        if (audioEl.paused || videoEl.paused) return

        const audioCurrentTime = audioEl.currentTime
        const videoCurrentTime = videoEl.currentTime

        // Get or create sync state for this participant
        if (!syncCorrectionRef.current[participant.id]) {
          syncCorrectionRef.current[participant.id] = {
            lastVideoTime: 0,
            lastAudioTime: 0,
            drift: 0,
            correctionApplied: 0
          }
        }

        const syncState = syncCorrectionRef.current[participant.id]
        
        // Only check if both are playing
        if (audioCurrentTime === 0 || videoCurrentTime === 0) return
        if (Math.abs(audioCurrentTime - syncState.lastAudioTime) < 0.5) return // Not enough progress
        if (Math.abs(videoCurrentTime - syncState.lastVideoTime) < 0.5) return // Not enough progress
        
        // Calculate drift: positive = video ahead of audio, negative = video behind audio
        const drift = (videoCurrentTime - audioCurrentTime) * 1000 // Convert to ms
        syncState.drift = drift
        syncState.lastAudioTime = audioCurrentTime
        syncState.lastVideoTime = videoCurrentTime
        
        // If drift exceeds threshold, correct it
        if (Math.abs(drift) > MAX_DRIFT_THRESHOLD) {
          // Video is ahead of audio - slow down video or speed up audio
          // Video is behind audio - speed up video or slow down audio
          const correction = drift > 0 ? -SYNC_CORRECTION_STEP : SYNC_CORRECTION_STEP
          
          try {
            // Apply correction to video element playback rate
            // This is a subtle adjustment to bring video back in sync
            const currentRate = videoEl.playbackRate
            const newRate = Math.max(0.5, Math.min(2.0, currentRate + (correction / 1000)))
            videoEl.playbackRate = newRate
            syncState.correctionApplied = correction
            
            console.log(`[Sync] ${participant.username}: drift=${Math.round(drift)}ms, corrected by ${correction}ms, new rate=${newRate.toFixed(3)}`)
          } catch (e) {
            // Playback rate adjustment not supported or failed
          }
        }
      })
    }
    
    // Start sync check interval
    syncIntervalId = setInterval(checkAndCorrectSync, SYNC_CHECK_INTERVAL)
    
    return () => {
      if (syncIntervalId) {
        clearInterval(syncIntervalId)
      }
      // Clean up sync state for participants who left
      const currentParticipantIds = new Set(displayParticipants.map(p => p?.id).filter(Boolean))
      Object.keys(syncCorrectionRef.current).forEach(id => {
        if (!currentParticipantIds.has(id)) {
          delete syncCorrectionRef.current[id]
        }
      })
    }
  }, [displayParticipants, user?.id])
  const [pinnedParticipant, setPinnedParticipant] = useState(null)

  const hasLiveVideoTrack = useCallback((stream) => {
    if (!stream) return false
    const tracks = stream.getVideoTracks?.() || []
    return tracks.some(track => track.readyState === 'live' && track.enabled !== false)
  }, [])

  // Cache for video-only streams to prevent flickering
  const videoOnlyStreamCache = useRef({})

  const bindVideoStream = useCallback((el, stream) => {
    // For user's own screen share with audio, create video-only stream to prevent feedback
    let streamToPlay = stream
    if (stream && stream.getAudioTracks().length > 0) {
      // Reuse cached video-only stream if available and tracks are still valid
      const existingCached = videoOnlyStreamCache.current[stream.id]
      if (existingCached && existingCached.getVideoTracks().length > 0) {
        streamToPlay = existingCached
      } else {
        const videoOnlyStream = new MediaStream(stream.getVideoTracks())
        videoOnlyStreamCache.current[stream.id] = videoOnlyStream
        streamToPlay = videoOnlyStream
      }
    }
    
    const nextStream = hasLiveVideoTrack(streamToPlay) ? streamToPlay : null
    
    // Only update if stream actually changed to prevent flickering
    if (el.srcObject !== nextStream) {
      el.srcObject = nextStream
    }

    if (nextStream) {
      el.play().catch(() => {})
    }
  }, [hasLiveVideoTrack])

  // Keep ref binding element-aware so remounts/view toggles still rebind srcObject.
  const getVideoRefCallback = useCallback((participantId, streamOverride = null) => {
    return (el) => {
      if (!el) {
        delete videoElements.current[participantId]
        return
      }

      videoElements.current[participantId] = el
      const expectedStream = streamOverride || videoStreams[participantId] || null
      // Force re-bind the stream to ensure video is properly connected
      bindVideoStream(el, expectedStream)
    }
  }, [videoStreams, bindVideoStream])

  const isScreenShareMutedForMe = useCallback((participantId) => {
    if (!participantId || participantId === user?.id) return false
    return !!localUserSettings[participantId]?.screenShareMuted
  }, [localUserSettings, user?.id])

  const getScreenShareStream = (participant) => {
    if (participant?.id === user?.id && isScreenSharing) {
      return hasLiveVideoTrack(screenStream) ? screenStream : null
    }
    return participant?.isScreenSharing && hasLiveVideoTrack(participant?.videoStream) ? participant?.videoStream : null
  }

  const getCameraStream = (participant) => {
    if (participant?.id === user?.id && isVideoOn) {
      return hasLiveVideoTrack(localVideoStream) ? localVideoStream : null
    }
    return participant?.hasVideo && !participant?.isScreenSharing && hasLiveVideoTrack(participant?.videoStream)
      ? participant?.videoStream
      : null
  }

  // Effect to re-bind video streams whenever videoStreams or participants change (e.g. view transitions)
  useEffect(() => {
    displayParticipants.forEach(participant => {
      const el = videoElements.current[participant.id]
      if (el) {
        const participantCameraStream = getCameraStream(participant)
        const participantScreenStream = getScreenShareStream(participant)
        const expectedStream = participantScreenStream || participantCameraStream || null
        bindVideoStream(el, expectedStream)
      }
    })
  }, [displayParticipants, videoStreams, screenStream, localVideoStream, bindVideoStream])

  const hasAnyVideo = displayParticipants.some(p => !!getScreenShareStream(p) || !!getCameraStream(p))

  const hasScreenShare = displayParticipants.some(p => getScreenShareStream(p))

  // Prioritize OTHERS' video over own - screen share first, then camera
  // This ensures others' streams are shown full screen when they're sharing
  const mainVideoParticipant = pinnedParticipant || displayParticipants.find(p => {
    // Prioritize others' screen shares first
    if (p.id !== user?.id && !!getScreenShareStream(p)) return true
    return false
  }) || displayParticipants.find(p => {
    // Then prioritize others' camera video
    if (p.id !== user?.id && !!getCameraStream(p)) return true
    return false
  }) || displayParticipants.find(p => {
    // Then self screen share
    if (p.id === user?.id && !!getScreenShareStream(p)) return true
    return false
  }) || displayParticipants.find(p => {
    // Then self camera
    if (p.id === user?.id && !!getCameraStream(p)) return true
    return false
  }) || displayParticipants.find(p => {
    // Fallback to anyone with video
    return !!getScreenShareStream(p) || !!getCameraStream(p)
  })

  const mainScreenStream = mainVideoParticipant ? getScreenShareStream(mainVideoParticipant) : null
  const mainCameraStream = mainVideoParticipant ? getCameraStream(mainVideoParticipant) : null
  const mainVideoStream = mainScreenStream || mainCameraStream || null
  const mainVideoType = mainScreenStream ? 'screen' : mainCameraStream ? 'camera' : null

  const openParticipantMenu = useCallback((participant, e) => {
    e.preventDefault()
    e.stopPropagation()
    const isSelf = participant.id === user?.id
    const ls = localUserSettings[participant.id] || { muted: false, volume: 100 }
    setParticipantMenu({
      userId: participant.id,
      username: participant.username,
      isSelf,
      localMuted: !!ls.muted,
      canMuteForMe: !isSelf,
      isPinned: pinnedParticipant?.id === participant.id,
      isMain: mainVideoParticipant?.id === participant.id,
      x: e.clientX,
      y: e.clientY
    })
  }, [user?.id, localUserSettings, pinnedParticipant, mainVideoParticipant])

  const copyParticipantId = useCallback(async (targetUserId) => {
    if (!targetUserId) return
    try {
      await navigator.clipboard.writeText(String(targetUserId))
      return
    } catch {}
    try {
      const textarea = document.createElement('textarea')
      textarea.value = String(targetUserId)
      textarea.setAttribute('readonly', '')
      textarea.style.position = 'fixed'
      textarea.style.top = '-1000px'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    } catch {}
  }, [])

  const forceParticipantReconnect = useCallback((targetUserId) => {
    if (!socket || !targetUserId || !channel?.id) return
    
    socket.emit('voice:force-reconnect', {
      channelId: channel.id,
      targetUserId
    })
    setParticipantMenu(null)
  }, [socket, channel?.id])

  return (
    <div
      ref={rootViewRef}
      className={[
        'voice-channel-view',
        viewMode === 'mini' ? 'mode-mini' : 'mode-full',
        isViewTransitioning ? 'view-transitioning' : '',
        isMiniDragging ? 'mini-dragging' : ''
      ].filter(Boolean).join(' ')}
    >
      <div className="voice-header">
        <SpeakerWaveIcon size={24} />
        <span className="voice-channel-name">{channel?.name || t('chat.voiceChannel')}</span>
        <span
          className={`connection-status ${overallStatus} clickable`}
          onClick={() => onShowConnectionInfo?.()}
          title={t('misc.connectionDetails')}
          style={{ cursor: 'pointer' }}
        >
          {statusLabel}
        </span>
        {encryptionEnabled && (
          <span
            className="voice-encryption-status secure"
            onClick={() => setShowEncryptionInfo(!showEncryptionInfo)}
            title={t('voice.encryption.secured', 'End-to-end encrypted voice')}
          >
            <LockClosedIcon size={16} />
            <span>{t('voice.encryption.encrypted', 'Encrypted')}</span>
          </span>
        )}
        {!encryptionEnabled && (
          <span
            className="voice-encryption-status insecure"
            onClick={() => setShowEncryptionInfo(!showEncryptionInfo)}
            title={t('voice.encryption.notSecured', 'Voice not encrypted')}
          >
            <ShieldExclamationIcon size={16} />
            <span>{t('voice.encryption.unencrypted', 'Not Encrypted')}</span>
          </span>
        )}
      </div>
      {showEncryptionInfo && (
        <div className="voice-encryption-info" role="status" aria-live="polite">
          {encryptionEnabled ? (
            <>
              <LockClosedIcon size={16} />
              <span><strong>{t('voice.encryption.secureTitle', 'Voice Encryption Enabled')}</strong></span>
              <p>{t('voice.encryption.secureDesc', 'This voice channel is end-to-end encrypted. Your voice data is secured using SRTP (Secure Real-time Transport Protocol).')}</p>
              <div className="encryption-fingerprint">
                <small>{t('voice.encryption.yourFingerprint', 'Your voice fingerprint:')}</small>
                <code>{myFingerprint || 'Generating...'}</code>
              </div>
              {Object.keys(peerVerificationStatus).length > 0 && (
                <div className="encryption-participants">
                  <small>{t('voice.encryption.verifiedParticipants', 'Verified participants:')}</small>
                  {Object.entries(peerVerificationStatus).map(([peerId, status]) => (
                    <div key={peerId} className={`verification-status ${status.verified ? 'verified' : 'discrepancy'}`}>
                      <span>{status.verified ? '✓' : '⚠'}</span>
                      <span>{status.summary}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <ShieldExclamationIcon size={16} />
              <span><strong>{t('voice.encryption.insecureTitle', 'Voice Not Encrypted')}</strong></span>
              <p>{t('voice.encryption.insecureDesc', 'This voice channel is not encrypted. Voice data is transmitted in plain text.')}</p>
            </>
          )}
        </div>
      )}
      {isScreenSharing && screenShareAudioWarning && (
        <div className="voice-inline-warning" role="status" aria-live="polite">
          <Music size={14} />
          <span>{screenShareAudioWarning}</span>
        </div>
      )}
      {visibleVoiceIssues.length > 0 && (
        <div className="voice-issues-panel" role="status" aria-live="polite">
          {visibleVoiceIssues.map((issue) => (
            <div key={issue.code} className={`voice-issue-card ${issue.severity || 'warning'}`}>
              <div className="voice-issue-copy">
                <strong>{issue.title}</strong>
                <span>{issue.message}</span>
                <small>How to fix: {issue.fix}</small>
              </div>
              <div className="voice-issue-actions">
                {issue.action === 'settings' && (
                  <button type="button" onClick={onOpenSettings}>
                    Open Settings
                  </button>
                )}
                {issue.action === 'details' && (
                  <button type="button" onClick={() => onShowConnectionInfo?.()}>
                    View Details
                  </button>
                )}
                <button type="button" className="muted" onClick={() => clearVoiceIssue(issue.code)}>
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={`voice-main-content ${tempChat.isVisible ? 'has-chat' : ''}`}>
        <div className={`voice-main-area ${hasAnyVideo || focusedBuiltinSession || focusedExternalSession ? 'has-video' : ''} ${focusedBuiltinSession || focusedExternalSession ? 'has-focused-activity' : ''}`}>
          {/* When activity is focused, show ONLY the activity (full screen) */}
          {focusedBuiltinSession ? (
          <div 
            className="voice-main-video voice-main-activity focused-activity-full"
            ref={(el) => { if (el) el.dataset.activityContainer = 'true' }}
          >
            <button 
              className="fullscreen-btn"
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                const container = e.target.closest('.voice-main-activity')
                if (container) {
                  if (document.fullscreenElement) {
                    document.exitFullscreen().catch(() => {})
                  } else {
                    container.requestFullscreen().catch(() => {})
                  }
                }
              }}
              title={t('misc.fullscreen')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
              </svg>
            </button>
            <BuiltinActivityHost
              session={focusedBuiltinSession}
              socket={socket}
              contextType="voice"
              contextId={channel?.id}
              embedded
              onClose={() => {
                clearFocusedActivity()
                setFocusedBuiltinSession(null)
              }}
            />
          </div>
          ) : focusedExternalSession ? (
          <ActivityIframe
            session={focusedExternalSession}
            activity={focusedExternalSession}
            onClose={() => {
              clearFocusedActivity()
              setFocusedExternalSession(null)
              socket?.emit('activity:leave-session', { sessionId: focusedExternalSession.sessionId })
            }}
          />
          ) : hasAnyVideo && mainVideoStream && mainVideoParticipant ? (
          <div
            className="voice-main-video"
            onClick={() => setPinnedParticipant(pinnedParticipant ? null : mainVideoParticipant)}
            onContextMenu={(e) => openParticipantMenu(mainVideoParticipant, e)}
          >
            <video
              autoPlay
              playsInline
              className="main-video-element"
              muted={mainVideoParticipant.id !== user?.id}
              ref={el => {
                if (!el) return
                // Force re-bind to ensure main video is always connected to the correct stream
                bindVideoStream(el, mainVideoStream)
              }}
            />
            <button 
              className="fullscreen-btn"
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                const container = e.target.closest('.voice-main-video')
                if (container) {
                  if (document.fullscreenElement) {
                    document.exitFullscreen().catch(() => {})
                  } else {
                    container.requestFullscreen().catch(() => {})
                  }
                }
              }}
              title={t('misc.fullscreen')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
              </svg>
            </button>
            <div className="main-video-overlay">
              <span className="main-video-name">
                {mainVideoParticipant.id === user?.id ? t('common.you') || 'You' : mainVideoParticipant.username}
                {mainVideoType === 'screen' && ` ${t('common.and')} ${t('chat.screen')}`}
              </span>
              {pinnedParticipant && (
                <span className="pinned-badge">{t('chat.pinned')}</span>
              )}
            </div>
            {hasScreenShare && mainVideoType !== 'screen' && (
              <div className="screen-share-notice">
                <ComputerDesktopIcon size={14} />
                <span>{t('chat.someoneSharingScreen')}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="voice-participants-grid" data-count={displayParticipants?.length || 0}>
            {(() => {
              // Safety wrapper to prevent blank page crashes
              try {
                if (!Array.isArray(displayParticipants)) {
                  console.error('[VoiceChannel] displayParticipants is not an array:', displayParticipants)
                  return <div className="voice-error">Error loading participants</div>
                }
                return displayParticipants.map((participant, index) => {
                  try {
                    if (!participant?.id) {
                      console.warn(`[VoiceChannel] Participant at index ${index} has no id:`, participant)
                      return null
                    }
                    const isSelf = participant.id === user?.id
                    const isMuted = participant.muted || (isSelf && currentMuted)
                    const isSpeaking = !!speaking[participant.id]

                    const participantCameraStream = getCameraStream(participant)
                    const participantScreenStream = getScreenShareStream(participant)
                    const participantHasVideo = !!participantCameraStream || !!participantScreenStream

                    return (
                <div
                  key={participant.id}
                  className={`participant-grid-tile ${isSpeaking ? 'speaking' : ''} ${isMuted ? 'muted' : ''} ${participantHasVideo ? 'has-video' : ''}`}
                  onContextMenu={(e) => openParticipantMenu(participant, e)}
                >
                  {participantHasVideo ? (
                    <video
                      autoPlay
                      playsInline
                      muted={isSelf}
                      className="participant-grid-video"
                      ref={getVideoRefCallback(participant.id, participantScreenStream || participantCameraStream)}
                    />
                  ) : (
                    <div className="participant-grid-avatar">
                    <Avatar
                      src={participant.avatar || `${imageApiUrl}/api/images/users/${participant.id}/profile`}
                      fallback={participant.username}
                      size={24}
                      userId={participant.id}
                    />
                      {isMuted && (
                        <div className="participant-grid-muted-icon">
                          <MicrophoneIcon size={14} />
                        </div>
                      )}
                    </div>
                  )}
                  <div className="participant-grid-name">
                    {participant.username}
                    {Boolean(participant.bot) && <span className="bot-badge">{t('member.bot')}</span>}
                    {isSelf && ` (${t('common.you') || 'You'})`}
                    {encryptionEnabled && !isSelf && peerVerificationStatus[participant.id] && (
                      <span 
                        className={`participant-verification-badge ${peerVerificationStatus[participant.id].verified ? 'verified' : 'discrepancy'}`}
                        title={peerVerificationStatus[participant.id].summary || 'Verification status'}
                      >
                        {peerVerificationStatus[participant.id].verified ? (
                          <ShieldCheck size={12} />
                        ) : (
                          <ShieldExclamationIcon size={12} />
                        )}
                      </span>
                    )}
                  </div>
                </div>
                  )
                } catch (err) {
                  console.error(`[VoiceChannel] Error rendering participant at index ${index}:`, err, participant)
                  return null
                }
              })
            } catch (err) {
              console.error('[VoiceChannel] Fatal error rendering participants grid:', err)
              return <div className="voice-error">Error rendering participants</div>
            }
          })()}

          </div>
        )}
      </div>
      </div>

      {/* Activity Strip - shows unfocused activities */}
      <ActivityStrip
        socket={socket}
        contextType="voice"
        contextId={channel?.id}
        onActivityFocus={(activity) => {
          setFocusedActivity(activity.sessionId)
        }}
      />

      <div className="voice-participants-strip">
        <div className="participants-scrollable">
          {(() => {
            // Safety wrapper to prevent blank page crashes
            try {
              if (!Array.isArray(displayParticipants)) {
                console.error('[VoiceChannel] displayParticipants is not an array in strip:', displayParticipants)
                return null
              }
              return displayParticipants.map((participant, index) => {
                try {
                  if (!participant?.id) {
                    console.warn(`[VoiceChannel] Strip participant at index ${index} has no id:`, participant)
                    return null
                  }
                  const isSelf = participant.id === user?.id
                  const isMuted = participant.muted || (isSelf && currentMuted)
                  const isDeafened = participant.deafened || (isSelf && currentDeafened)
                  const isSpeaking = !!speaking[participant.id]
                  const peerState = isSelf ? 'connected' : (peerStates[participant.id] ?? 'connecting')

                  const participantCameraStream = getCameraStream(participant)
                  const participantScreenStream = getScreenShareStream(participant)
                  const participantHasVideo = !!participantCameraStream || !!participantScreenStream
                  const isPinned = pinnedParticipant?.id === participant.id
                  const isMain = mainVideoParticipant?.id === participant.id

                  const localSetting = localUserSettings[participant.id] || { muted: false, volume: 100 }
                  const isLocalMuted = !isSelf && localSetting.muted

                  return (
              <div
                key={participant.id}
                className={[
                  'participant-tile',
                  isSelf ? 'self' : '',
                  isMuted ? 'muted' : '',
                  isLocalMuted ? 'local-muted' : '',
                  isSpeaking ? 'speaking' : '',
                  participantHasVideo ? 'has-video' : '',
                  isPinned ? 'pinned' : '',
                  isMain ? 'main' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => setPinnedParticipant(isPinned ? null : participant)}
                title={`${participant.username}${isSpeaking ? ` • ${t('chat.speaking', 'Speaking')}` : ''}${isMuted ? ` • ${t('chat.muted', 'Muted')}` : ''}`}
                onContextMenu={(e) => openParticipantMenu(participant, e)}
              >
                {participantHasVideo ? (
                  <div className="tile-video-container">
                    <video
                      autoPlay
                      playsInline
                      className="tile-video"
                      muted={isSelf}
                      ref={getVideoRefCallback(participant.id, participantScreenStream || participantCameraStream)}
                    />
                    <div className="tile-name-overlay">
                      {participant.username}
                      {participantScreenStream ? ` ${t('common.and')} ${t('chat.screen')}` : ''}
                    </div>
                  </div>
                ) : (
                  <div className="tile-avatar-container">
                    <Avatar
                      src={participant.avatar}
                      alt={participant.username}
                      fallback={participant.username}
                      size={48}
                      className="tile-avatar"
                      userId={participant.id}
                    />
                    {isMuted && <div className="tile-mute-icon"><MicrophoneIcon size={14} /></div>}
                    {isDeafened && <div className="tile-deafen-icon"><SpeakerXMarkIcon size={14} /></div>}
                    {!isSelf && peerState !== 'connected' && (
                      <div className={`tile-peer-badge peer-state-${peerState}`} title={t(`voice.peerState.${peerState}`, peerState)}>
                        {peerState === 'connecting' ? '⟳' : peerState === 'failed' ? '✕' : '!'}
                      </div>
                    )}
                    {encryptionEnabled && !isSelf && peerVerificationStatus[participant.id] && (
                      <div 
                        className={`tile-verification-badge ${peerVerificationStatus[participant.id].verified ? 'verified' : 'discrepancy'}`}
                        title={peerVerificationStatus[participant.id].summary || 'Verification status'}
                      >
                        {peerVerificationStatus[participant.id].verified ? (
                          <ShieldCheck size={12} />
                        ) : (
                          <ShieldExclamationIcon size={12} />
                        )}
                      </div>
                    )}
                  </div>
                )}
                <span className="tile-name">
                  {participant.username}
                  {Boolean(participant.bot) && <span className="bot-badge">{t('member.bot')}</span>}
                  {isSelf && ` (${t('common.you') || 'You'})`}
                </span>
              </div>
                  )
                } catch (err) {
                  console.error(`[VoiceChannel] Error rendering strip participant at index ${index}:`, err, participant)
                  return null
                }
              })
            } catch (err) {
              console.error('[VoiceChannel] Fatal error rendering strip participants:', err)
              return null
            }
          })()}

          {/* Add Activity button in strip */}
          <button 
            className="activity-launch-btn"
            onClick={() => setShowActivityPicker(true)}
            title="Start an Activity"
          >
            <RocketLaunchIcon size={20} />
            <span>Activity</span>
          </button>
        </div>
      </div>

      <div className="voice-controls">
        <button 
          className={`voice-control-btn ${currentMuted ? 'active' : ''}`}
          onClick={toggleMute}
          title={currentMuted ? t('chat.unmute') : t('chat.mute')}
        >
          {currentMuted ? <MicrophoneIcon size={28} /> : <MicrophoneIcon size={28} />}
        </button>
        
        <button 
          className={`voice-control-btn ${currentDeafened ? 'active' : ''}`}
          onClick={toggleDeafen}
          title={currentDeafened ? t('chat.undeafen') : t('chat.deafen')}
        >
          {currentDeafened ? <SpeakerXMarkIcon size={28} /> : <MusicalNoteIcon size={28} />}
        </button>

        <button 
          className={`voice-control-btn ${isVideoOn ? 'active-video' : ''}`}
          onClick={toggleVideo}
          title={isVideoOn ? t('chat.disableVideo') : t('chat.enableVideo')}
        >
          {isVideoOn ? <VideoCameraIcon size={28} /> : <VideoCameraSlashIcon size={28} />}
        </button>

        <button 
          className={`voice-control-btn ${isScreenSharing ? 'active-screen' : ''}`}
          onClick={toggleScreenShare}
          title={isScreenSharing ? t('chat.stopSharing') : t('chat.shareScreen')}
        >
          {isScreenSharing ? <ComputerDesktopIcon size={28} /> : <ComputerDesktopIcon size={28} />}
        </button>

        <button
          className={`voice-control-btn ${showOverlayStudio ? 'active-video' : ''}`}
          onClick={() => setShowOverlayStudio(true)}
          title={t('voice.overlayStudio', 'Overlay Studio')}
        >
          <Layers3 size={28} />
        </button>

        <button 
          className={`voice-control-btn activities-btn ${activeActivities.filter(a => a.contextType === 'voice' && a.contextId === channel?.id).length > 0 ? 'has-activity' : ''}`}
          onClick={() => setShowActivityPicker(true)}
          title="Start Activity"
        >
          <RocketLaunchIcon size={28} />
        </button>

        <button 
          className={`voice-control-btn chat-btn ${tempChat.isVisible ? 'active' : ''}`}
          onClick={tempChat.toggleVisibility}
          title={tempChat.isVisible ? 'Hide Voice Chat' : 'Show Voice Chat'}
        >
          <ChatBubbleLeftRightIcon size={28} />
          {tempChat.unreadCount > 0 && !tempChat.isVisible && (
            <span className="voice-chat-unread-badge">{tempChat.unreadCount > 9 ? '9+' : tempChat.unreadCount}</span>
          )}
        </button>

        <button 
          className="voice-control-btn leave"
          onClick={handleLeave}
          title={t('misc.leaveVoiceChannel')}
        >
          <PhoneXMarkIcon size={28} />
        </button>

        <button 
          className="voice-control-btn settings"
          title={t('misc.voiceSettings')}
          onClick={onOpenSettings}
        >
          <CogIcon size={28} />
        </button>

        <button 
          className={`voice-control-btn ${showVoiceFX ? 'active' : ''}`}
          title={t('misc.voiceEffects', 'Voice Effects')}
          onClick={() => setShowVoiceFX(true)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="28" height="28">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
          </svg>
        </button>
      </div>

      <VoiceChannelTempChat
        messages={tempChat.messages}
        onSendMessage={tempChat.sendMessage}
        isVisible={tempChat.isVisible}
        onToggleVisibility={tempChat.toggleVisibility}
        notificationsEnabled={tempChat.notificationsEnabled}
        onToggleNotifications={() => tempChat.setNotificationsEnabled(prev => !prev)}
        unreadCount={tempChat.unreadCount}
        onMarkAsRead={tempChat.markAsRead}
        participants={participants}
      />

      {/* Participant right-click context menu */}
      {participantMenu && (() => {
        const ls = localUserSettings[participantMenu.userId] || { muted: false, volume: 100 }
        const menuParticipant = displayParticipants.find(p => p.id === participantMenu.userId)
        const canMuteScreenShare = participantMenu.canMuteForMe && !!menuParticipant?.isScreenSharing
        const menuW = 240
        const menuH = participantMenu.canMuteForMe ? (canMuteScreenShare ? 290 : 250) : 145
        
        // Position menu at cursor, but flip if near edges
        let x = participantMenu.x
        let y = participantMenu.y
        
        // If too close to right edge, position menu to the left of cursor
        if (x + menuW > window.innerWidth - 8) {
          x = x - menuW
        }
        // Ensure minimum left padding
        if (x < 8) x = 8
        
        // If too close to bottom edge, position menu above cursor
        if (y + menuH > window.innerHeight - 8) {
          y = y - menuH
        }
        // Ensure minimum top padding
        if (y < 8) y = 8
        
        return (
          <>
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
              onClick={() => setParticipantMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault()
                setParticipantMenu(null)
              }}
            />
            <div
              className="voice-participant-menu"
              style={{ position: 'fixed', left: x, top: y, zIndex: 9999 }}
              onClick={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.preventDefault()}
              onMouseDown={(e) => e.stopPropagation()}
              onMouseUp={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
            >
              <div className="vpm-header">{participantMenu.username}</div>
              <button
                className="vpm-item"
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  if (participantMenu.isPinned || participantMenu.isMain) {
                    setPinnedParticipant(null)
                  } else if (menuParticipant) {
                    setPinnedParticipant(menuParticipant)
                  }
                  setParticipantMenu(null)
                }}
                title={participantMenu.isPinned || participantMenu.isMain ? t('chat.clearFocus', 'Clear focus from main view') : t('chat.focusInMainView', 'Focus in main view')}
              >
                {participantMenu.isPinned || participantMenu.isMain ? <ComputerDesktopIcon size={14} /> : <ComputerDesktopIcon size={14} />}
                {participantMenu.isPinned || participantMenu.isMain ? t('chat.clearFocus', 'Clear Focus') : t('chat.focusInMainView', 'Focus in Main View')}
              </button>
              <button
                className="vpm-item"
                onClick={async (e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  await copyParticipantId(participantMenu.userId)
                  setParticipantMenu(null)
                }}
                title={t('chat.copyUserId', 'Copy user ID')}
              >
                <span className="vpm-id-icon">#</span>
                {t('chat.copyUserId', 'Copy User ID')}
              </button>
              {participantMenu.canMuteForMe && (
                <>
              {canMuteScreenShare && (
              <button
                className="vpm-item"
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  setLocalUserSetting(participantMenu.userId, { screenShareMuted: !ls.screenShareMuted })
                  setParticipantMenu(null)
                }}
                title={ls.screenShareMuted ? t('chat.unmuteScreenshare', 'Unmute screenshare') : t('chat.muteScreenshare', 'Mute screenshare')}
              >
                {ls.screenShareMuted ? <ComputerDesktopIcon size={14} /> : <ComputerDesktopIcon size={14} />}
                {ls.screenShareMuted ? t('chat.unmuteScreenshare', 'Unmute screenshare') : t('chat.muteScreenshare', 'Mute screenshare')}
              </button>
              )}
              <button
                className="vpm-item"
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  setLocalUserSetting(participantMenu.userId, { muted: !ls.muted })
                  setParticipantMenu(null)
                }}
                title={ls.muted ? t('chat.unmuteForMe', 'Unmute for me') : t('chat.muteForMe', 'Mute for me')}
              >
                {ls.muted ? <SpeakerWaveIcon size={14} /> : <SpeakerXMarkIcon size={14} />}
                {ls.muted ? t('chat.unmuteForMe') : t('chat.muteForMe')}
              </button>
              <div 
                className="vpm-volume" 
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onMouseUp={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
              >
                <span>{t('chat.volume')}</span>
                <input
                  type="range"
                  min={0}
                  max={200}
                  value={ls.volume}
                  onChange={(e) => {
                    e.stopPropagation()
                    setLocalUserSetting(participantMenu.userId, { volume: Number(e.target.value) })
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onMouseUp={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onPointerUp={(e) => e.stopPropagation()}
                />
                <span>{ls.volume}%</span>
              </div>
              <button
                className="vpm-item vpm-reset"
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  setLocalUserSetting(participantMenu.userId, { muted: false, volume: 100, screenShareMuted: false })
                  setParticipantMenu(null)
                }}
              >
                {t('chat.resetToDefault')}
              </button>
                </>
              )}
              {isServerAdmin && participantMenu.userId !== user?.id && (
                <button
                  className="vpm-item vpm-danger"
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    forceParticipantReconnect(participantMenu.userId)
                  }}
                  title={t('chat.forceReconnect', 'Force user to reconnect')}
                >
                  <RocketLaunchIcon size={14} />
                  {t('chat.forceReconnect', 'Force Reconnect')}
                </button>
              )}
            </div>
          </>
        )
      })()}

      {/* VoiceFX Modal */}
      <VoiceFX 
        isOpen={showVoiceFX}
        onClose={() => setShowVoiceFX(false)}
        applyEffect={applyVoiceFXEffect}
        currentEffect={voiceFXEffect}
        currentParams={voiceFXParams}
        isEnabled={voiceFXEnabled}
        isPreviewEnabled={voiceFXPreviewEnabled}
        onPreviewToggle={handleVoiceFXPreviewToggle}
        onToggle={(enabled) => {
          setVoiceFXEnabled(enabled)
          if (!enabled) {
            applyVoiceFXEffect('none', {})
          }
        }}
        onReset={() => {
          setVoiceFXEffect('none')
          setVoiceFXParams({})
          setVoiceFXEnabled(false)
          handleVoiceFXPreviewToggle(false)
          applyVoiceFXEffect('none', {})
        }}
      />

      {/* Screen Share Picker Modal */}
      <ScreenSharePicker
        isOpen={showScreenSharePicker}
        onClose={() => setShowScreenSharePicker(false)}
        onSelect={handleScreenShareSourceSelect}
      />

      <StreamOverlayModal
        isOpen={showOverlayStudio}
        onClose={() => setShowOverlayStudio(false)}
        target={overlayTarget}
        onTargetChange={setOverlayTarget}
        sourceStream={overlayTarget === 'screen' ? (rawScreenStreamRef.current || screenStream) : (rawLocalVideoStreamRef.current || localVideoStream)}
        overlays={overlayTarget === 'screen' ? screenOverlays : cameraOverlays}
        onChange={overlayTarget === 'screen' ? setScreenOverlays : setCameraOverlays}
      />

      {showActivityPicker && (
        <ActivityPicker
          socket={socket}
          contextType="voice"
          contextId={channel?.id}
          participantsCount={displayParticipants.length}
          onClose={() => setShowActivityPicker(false)}
          onLaunch={handleActivityLaunch}
        />
      )}
    </div>
  )
}

export default VoiceChannel
