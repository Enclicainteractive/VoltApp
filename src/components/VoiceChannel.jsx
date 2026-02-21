import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Mic, MicOff, Headphones, VolumeX, PhoneOff, Settings, Volume2, Video, VideoOff, Monitor, MonitorOff, Ghost, Music } from 'lucide-react'
import { useTranslation } from '../hooks/useTranslation'
import { useSocket } from '../contexts/SocketContext'
import { useAuth } from '../contexts/AuthContext'
import { settingsService } from '../services/settingsService'
import { soundService } from '../services/soundService'
import Avatar from './Avatar'
import VoiceFX from './VoiceFX'
import '../assets/styles/VoiceChannel.css'

// Fallback ICE servers used only before server provides its list
// Priority order: self-hosted STUN first, then Google's reliable STUN, then Open Relay Project TURN
// Once the server sends its ICE servers, we use ONLY those for consistency
const FALLBACK_ICE_SERVERS = [
  // Self-hosted STUN (volt.voltagechat.app)
  { urls: 'stun:volt.voltagechat.app:32768' },
  
  // Google's STUN servers - most reliable public STUN
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  
  // Additional reliable public STUN servers
  { urls: 'stun:stun.ekiga.net' },
  { urls: 'stun:stun.xten.com' },
  { urls: 'stun:stun.schlund.de' },
  
  // Open Relay Project - ONLY reliable free TURN service
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turns:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
]

const buildPeerConfig = (serverIceServers = []) => {
  // Use ONLY the server's ICE servers if available - this ensures everyone
  // uses the same configuration for consistent connectivity
  const iceServers = serverIceServers.length > 0 ? serverIceServers : FALLBACK_ICE_SERVERS
  
  const stunCount = iceServers.filter(s => s.urls.startsWith('stun')).length
  const turnCount = iceServers.filter(s => s.urls.startsWith('turn')).length
  const source = serverIceServers.length > 0 ? 'server' : 'fallback'
  console.log(`[WebRTC] Building peer config with ${iceServers.length} ICE servers from ${source} (${stunCount} STUN, ${turnCount} TURN)`)
  console.log(`[WebRTC] ICE servers:`, iceServers.map(s => s.urls))
  
  return {
    iceServers,
    bundlePolicy: 'max-bundle',   // all m-lines in one bundle — fixes m-line order errors
    rtcpMuxPolicy: 'require',
    iceCandidatePoolSize: 10,
    // FIX: Add more aggressive ICE settings for global connectivity
    iceTransports: 'all',         // Use all transport types (UDP, TCP, TLS)
    // Increase timeouts for global connections (high latency)
    // Note: These are not standard RTCConfig options but some browsers support them
  }
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

const VoiceChannel = ({ channel, joinKey, viewMode = 'full', onLeave, isMuted: externalMuted, isDeafened: externalDeafened, onMuteChange, onDeafenChange, onOpenSettings, onParticipantsChange, onShowConnectionInfo }) => {
  const { socket, connected } = useSocket()
  const { user } = useAuth()
  const { t } = useTranslation()
  const initialVoiceState = readPersistedVoiceState()
  const [participants, setParticipants] = useState([])
  const [localIsMuted, setLocalIsMuted] = useState(initialVoiceState.muted)
  const [localIsDeafened, setLocalIsDeafened] = useState(initialVoiceState.deafened)
  const [isVideoOn, setIsVideoOn] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [localStream, setLocalStream] = useState(null)
  const [localVideoStream, setLocalVideoStream] = useState(null)
  const [screenStream, setScreenStream] = useState(null)
  const [connectionState, setConnectionState] = useState('connecting')
  const [speaking, setSpeaking] = useState({})
  // Per-peer WebRTC connection state: peerId -> 'connecting'|'connected'|'failed'|'disconnected'
  const [peerStates, setPeerStates] = useState({})
  
  // ICE connection info - track which ICE server we're connected to
  const [iceConnectionInfo, setIceConnectionInfo] = useState({
    selectedServer: null,
    candidatePairs: [],
    connectionType: null, // 'host', 'srflx', 'relay'
  })
  // VoiceFX state
  const [showVoiceFX, setShowVoiceFX] = useState(false)
  const [voiceFXEnabled, setVoiceFXEnabled] = useState(false)
  const [voiceFXEffect, setVoiceFXEffect] = useState('none')
  const [voiceFXParams, setVoiceFXParams] = useState({})
  const [voiceFXPreviewEnabled, setVoiceFXPreviewEnabled] = useState(false)
  const [screenShareAudioWarning, setScreenShareAudioWarning] = useState('')
  const voiceFXNodesRef = useRef({})
  const voiceFXDryGainRef = useRef(null)
  const voiceFXWetGainRef = useRef(null)
  const voiceFXDestinationRef = useRef(null)
  const voiceFXSourceRef = useRef(null)
  const originalAudioTrackRef = useRef(null)
  const voiceFXPreviewAudioRef = useRef(null)
  // Remote audio analysers for speaking detection: peerId -> { analyser, dataArray }
const remoteAnalysersRef = useRef({})
const participantsRef = useRef([])
// Local per-user overrides: { [userId]: { muted: bool, volume: 0-100, screenShareMuted: bool } }
const [localUserSettings, setLocalUserSettings] = useState(() => {
  try { return JSON.parse(localStorage.getItem('voltchat_local_user_settings')) || {} } catch { return {} }
})
// Right-click context menu state
const [participantMenu, setParticipantMenu] = useState(null) // { userId, username, x, y }
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
  const analyserRef = useRef(null)
  const channelIdRef = useRef(channel?.id)
  const localStreamRef = useRef(null)
  const localVideoStreamRef = useRef(null)
  const screenStreamRef = useRef(null)
  const hasJoinedRef = useRef(false)
  const hasLeftRef = useRef(false)
  const isInitializingRef = useRef(false)
  const initializedChannelIdRef = useRef(null)

  // Perfect negotiation state per peer
  const makingOfferRef  = useRef({})   // peerId -> bool
  const ignoreOfferRef  = useRef({})   // peerId -> bool
  const remoteDescSetRef = useRef({})  // peerId -> bool
  const pendingCandidatesRef = useRef({}) // peerId -> RTCIceCandidateInit[]
  const lastOfferTimeRef = useRef({})  // peerId -> timestamp of last offer received
  const negotiationLockRef = useRef({}) // peerId -> bool (prevents concurrent negotiations)
  const negotiationCompleteRef = useRef({}) // peerId -> bool (track if initial negotiation done)

  // ICE server list received from the Voltage server on voice:participants
  const serverIceServersRef = useRef([])
  
  // Notify parent of participants changes (for sidebar display)
  useEffect(() => {
    onParticipantsChange?.(channel?.id, participants)
  }, [participants, channel?.id])

  // Apply local user setting (volume/mute) to a peer's audio element
  const applyLocalUserSetting = useCallback((userId, settings) => {
    const voiceEl = audioElements.current[userId]
    if (voiceEl instanceof HTMLMediaElement) {
      voiceEl.muted = settings.muted ?? false
      voiceEl.volume = Math.max(0, Math.min(1, (settings.volume ?? 100) / 100))
    }
    const screenEl = audioElements.current[`${userId}__screen`]
    if (screenEl instanceof HTMLMediaElement) {
      screenEl.muted = settings.screenShareMuted ?? false
      screenEl.volume = Math.max(0, Math.min(1, (settings.volume ?? 100) / 100))
    }
  }, [])

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
      try { localStorage.setItem('voltchat_local_user_settings', JSON.stringify(next)) } catch {}
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
      p.id === userId
        ? { ...p, hasVideo: false, videoStream: null, isScreenSharing: false }
        : p
    )))
  }, [])

  // Helper to update all peer connections with a new audio track
  const updateAllPeerTracks = useCallback((track) => {
    Object.values(peerConnections.current).forEach(pc => {
      try {
        const senders = pc.getSenders()
        const audioSender = senders.find((s) => {
          if (s.track?.kind === 'audio') return true
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
    dryGain.disconnect()
    wetGain.disconnect()
    try { source.disconnect(dryGain) } catch {}
    try { source.disconnect(wetGain) } catch {}

    if (effectName === 'none' || !effectName) {
      // No effect - direct passthrough
      source.connect(dryGain)
      dryGain.connect(destination)
      dryGain.gain.value = 1
      wetGain.gain.value = 0
      
      // Replace with original track
      const originalTrack = originalAudioTrackRef.current
      if (originalTrack && localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach(t => localStreamRef.current.removeTrack(t))
        localStreamRef.current.addTrack(originalTrack)
        updateAllPeerTracks(voiceFXPreviewEnabled ? null : originalTrack)
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
        const sourceProcessor = audioContext.createScriptProcessor(4096, 1, 1)
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
        
        const processor = audioContext.createScriptProcessor(2048, 1, 1)
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
        
        const processor = audioContext.createScriptProcessor(2048, 1, 1)
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
        
        const processor = audioContext.createScriptProcessor(2048, 1, 1)
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
        
        const processor = audioContext.createScriptProcessor(2048, 1, 1)
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
        const processor = audioContext.createScriptProcessor(4096, 1, 1)
        
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
        
        const processor = audioContext.createScriptProcessor(2048, 1, 1)
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
        const noise = audioContext.createScriptProcessor(2048, 1, 1)
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
        const pitchProcessor = audioContext.createScriptProcessor(4096, 1, 1)
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
        const processor = audioContext.createScriptProcessor(4096, 1, 1)
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
        const crusher = audioContext.createScriptProcessor(2048, 1, 1)
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
    if (localStreamRef.current) {
      // Replace in local stream
      localStreamRef.current.getAudioTracks().forEach(t => localStreamRef.current.removeTrack(t))
      localStreamRef.current.addTrack(processedTrack)
      setLocalStream(localStreamRef.current)
      
      // Update all peer connections
      updateAllPeerTracks(voiceFXPreviewEnabled ? null : processedTrack)
    }
    
    console.log('[VoiceFX] Applied effect:', effectName)
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
      const activeTrack = localStreamRef.current?.getAudioTracks?.()[0] || originalAudioTrackRef.current || null
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
      const vol = Math.max(0, Math.min(1, (newSettings.volume ?? 100) / 100))
      // Apply to all active remote audio elements
      Object.entries(audioElements.current).forEach(([key, el]) => {
        if (key.includes('__webaudio')) return
        if (el instanceof HTMLMediaElement) {
          el.volume = vol
          // Switch output device if supported (Chrome/Edge)
          if (newSettings.outputDevice && newSettings.outputDevice !== 'default' && el.setSinkId) {
            el.setSinkId(newSettings.outputDevice).catch(() => {})
          }
        }
      })
      // Apply input volume via gain node if available
      if (analyserRef.current?.gainNode) {
        analyserRef.current.gainNode.gain.value = Math.max(0, Math.min(2, (newSettings.inputVolume ?? 100) / 100))
      }
    })
    return unsub
  }, [])

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
  const connectionCooldownsRef = useRef(new Map()) // peerId -> timestamp of last attempt
  const isMassJoinInProgressRef = useRef(false) // Flag for batch processing
  const pendingPeerCountRef = useRef(0)      // Track expected peer count during mass joins

  // Tiered configuration for scaling to 100+ peers
  const TIER_CONFIG = {
    small: { maxPeers: 10, concurrent: 2, cooldown: 1000, staggerBase: 400, staggerPerPeer: 300, batchSize: 10 },
    medium: { maxPeers: 25, concurrent: 2, cooldown: 1500, staggerBase: 800, staggerPerPeer: 500, batchSize: 15 },
    large: { maxPeers: 50, concurrent: 1, cooldown: 2000, staggerBase: 1500, staggerPerPeer: 700, batchSize: 20 },
    massive: { maxPeers: 100, concurrent: 1, cooldown: 3000, staggerBase: 2500, staggerPerPeer: 900, batchSize: 25 }
  }

  // No peer limit - allow all connections
  const priorityPeersRef = useRef(new Set()) // High priority peer IDs (speakers)

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

    const pc = new RTCPeerConnection(buildPeerConfig(serverIceServersRef.current))
    peerConnections.current[targetUserId] = pc

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
      console.log(`[WebRTC] ICE state with ${targetUserId}:`, pc.iceConnectionState)
      if (pc.iceConnectionState === 'failed') {
        console.log(`[WebRTC] ICE failed with ${targetUserId} — restarting ICE`)
        pc.restartIce()
      }
      if (pc.iceConnectionState === 'disconnected') {
        // Browser may recover on its own; give it 4 s then restart ICE
        const pcAtCheck = pc
        setTimeout(() => {
          if (pcAtCheck.iceConnectionState === 'disconnected' ||
              pcAtCheck.iceConnectionState === 'failed') {
            console.log(`[WebRTC] ICE still disconnected for ${targetUserId} — restarting`)
            pcAtCheck.restartIce()
          }
        }, 4000)
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

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState
      console.log(`[WebRTC] Connection state with ${targetUserId}:`, s)

      // Mirror into React state so the UI reflects real peer status
      setPeerStates(prev => ({ ...prev, [targetUserId]: s }))

      // Report peer state to server for consensus monitoring
      reportPeerState(targetUserId, s)

      if (s === 'connected') {
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
        const audioReceiver = receivers.find(r => r.track?.kind === 'audio')
        if (audioReceiver) {
          const track = audioReceiver.track
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
            console.log(`[WebRTC] Created ${isScreenAudio ? 'screen-share' : 'voice'} audio element on connect for ${targetUserId}`)
          }

          const settings = settingsService.getSettings()
          audio.srcObject = stream
          audio.volume = Math.max(0, Math.min(1, (settings.volume ?? 100) / 100))
          audio.muted = isScreenAudio ? !!localSettings.screenShareMuted : !!localSettings.muted

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
          const clearRecoveredVideo = () => clearRemoteVideoState(targetUserId)
          videoTrack.onended = clearRecoveredVideo
          videoTrack.onmute = clearRecoveredVideo
          
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
        console.log(`[WebRTC] Connection failed with ${targetUserId} — will wait for peer to reconnect`)
        // Don't auto-reconnect - the peer who initiated will retry, or we'll get an offer from them
        try { pc.close() } catch {}
        delete peerConnections.current[targetUserId]
        makingOfferRef.current[targetUserId] = false
        ignoreOfferRef.current[targetUserId] = false
        remoteDescSetRef.current[targetUserId] = false
      }
      // Handle 'new' state that gets stuck - just restart ICE
      if (s === 'new') {
        console.log(`[WebRTC] Connection stuck in 'new' state for ${targetUserId} — restarting ICE`)
        pc.restartIce()
      }
      if (s === 'closed') {
        delete peerConnections.current[targetUserId]
        setTimeout(() => {
          setPeerStates(prev => {
            const next = { ...prev }
            delete next[targetUserId]
            return next
          })
        }, 1000)
      }
    }

    // --- Perfect negotiation: onnegotiationneeded ---
    // This fires when tracks are added/removed. We need to handle both initial
    // negotiation and track-change renegotiations.
    pc.onnegotiationneeded = async () => {
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
      try {
        makingOfferRef.current[targetUserId] = true
        const offer = await pc.createOffer()
        // Re-check state after async createOffer — may have changed
        if (pc.signalingState !== 'stable') {
          console.log(`[WebRTC] Aborting offer for ${targetUserId} — state changed to ${pc.signalingState}`)
          return
        }
        await pc.setLocalDescription(offer)
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
        const settings = settingsService.getSettings()
        console.log(`[WebRTC] Audio track: readyState=${track.readyState} trackMuted=${track.muted} enabled=${track.enabled} volume=${settings.volume}`)
        const isScreenAudio = isLikelyScreenAudioTrack(targetUserId, track, remoteStream)
        const audioKey = isScreenAudio ? `${targetUserId}__screen` : targetUserId
        const localSettings = localUserSettings[targetUserId] || { muted: false, volume: 100, screenShareMuted: false }

        // Create or reuse a DOM-attached audio element.
        // DOM-attached elements satisfy autoplay policy and persist.
        let audio = audioElements.current[audioKey]
        if (!audio) {
          audio = document.createElement('audio')
          audio.autoplay = true
          audio.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none;opacity:0'
          document.body.appendChild(audio)
          audioElements.current[audioKey] = audio
          console.log(`[WebRTC] Created DOM ${isScreenAudio ? 'screen-share' : 'voice'} audio element for ${targetUserId}`)
        }

        const audioStream = new MediaStream([track])
        audio.srcObject = audioStream
        audio.volume    = Math.max(0, Math.min(1, (settings.volume ?? 100) / 100))
        audio.muted     = isScreenAudio ? !!localSettings.screenShareMuted : !!localSettings.muted

        console.log(`[WebRTC] Audio element: volume=${audio.volume} trackMuted=${track.muted}`)

        // Helper — call play() and retry on autoplay rejection
        const tryPlay = () => {
          if (audio.srcObject !== remoteStream) audio.srcObject = remoteStream
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
        track.onunmute = () => {
          console.log(`[WebRTC] track.onunmute for ${targetUserId} — starting playback`)
          tryPlay()
        }

        track.onended = () => console.log(`[WebRTC] track ended for ${targetUserId}`)

        // Play immediately if track already has audio flowing.
        if (!track.muted) {
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
          console.log(`[WebRTC] Video track ended/muted for ${targetUserId}, clearing UI state`)
          clearRemoteVideoState(targetUserId)
        }
        track.onended = handleRemoteVideoEnded
        track.onmute = handleRemoteVideoEnded
        
        console.log(`[WebRTC] ========== VIDEO TRACK PROCESSING COMPLETE for ${targetUserId} ==========`)
      }
    }

    // Add our local audio tracks
    const addTracks = () => {
      const audioStream = localStreamRef.current
      if (audioStream) {
        audioStream.getTracks().forEach(track => {
          const senders = pc.getSenders()
          if (!senders.find(s => s.track === track)) {
            pc.addTrack(track, audioStream)
          }
        })
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
  }, [socket, user?.id, isPolite, clearRemoteVideoState, applyReceiverLatencyHints, isLikelyScreenAudioTrack, localUserSettings])

  const initiateCall = useCallback((targetUserId) => {
    if (!targetUserId || targetUserId === user?.id) return
    const existing = peerConnections.current[targetUserId]
    if (existing) {
      const state = existing.connectionState
      // Already connected, connecting, or completed (wrtc uses 'completed') — skip
      if (state === 'connected' || state === 'connecting' || state === 'completed') {
        activeNegotiationsRef.current = Math.max(0, activeNegotiationsRef.current - 1)
        return
      }
      // Offer already in flight for this peer — skip
      if (makingOfferRef.current[targetUserId]) {
        console.log('[WebRTC] Skipping initiateCall for', targetUserId, '— offer in flight')
        activeNegotiationsRef.current = Math.max(0, activeNegotiationsRef.current - 1)
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

    while (connectionQueueRef.current.length > 0 && activeNegotiationsRef.current < maxConcurrent) {
      const targetUserId = connectionQueueRef.current.shift()

      // Double-check state before connecting
      const existing = peerConnections.current[targetUserId]
      if (existing) {
        const state = existing.connectionState
        if (state === 'connected' || state === 'connecting' || state === 'completed' || makingOfferRef.current[targetUserId]) {
          console.log(`[WebRTC] Skipping ${targetUserId} — already connecting/connected`)
          continue
        }
      }

      activeNegotiationsRef.current++
      connectionCooldownsRef.current.set(targetUserId, Date.now())

      console.log(`[WebRTC] Processing connection to ${targetUserId} (${activeNegotiationsRef.current}/${maxConcurrent} active, tier: ${tier.maxPeers} max)`)

      try {
        initiateCall(targetUserId)
        
        // Decrement counter after a delay to allow negotiation to complete
        setTimeout(() => {
          activeNegotiationsRef.current = Math.max(0, activeNegotiationsRef.current - 1)
          // Try to process more queued connections
          processConnectionQueue()
        }, 4000)
      } catch (err) {
        console.error(`[WebRTC] Error initiating connection to ${targetUserId}:`, err.message)
        activeNegotiationsRef.current = Math.max(0, activeNegotiationsRef.current - 1)
      }

      // Tiered delay between starting connections to prevent flooding
      if (connectionQueueRef.current.length > 0) {
        await new Promise(r => setTimeout(r, tier.staggerPerPeer))
      }
    }

    isProcessingQueueRef.current = false

    // If queue still has items, schedule another processing round
    if (connectionQueueRef.current.length > 0) {
      setTimeout(() => processConnectionQueue(), tier.staggerBase)
    }
  }, [initiateCall, getTierConfig])

  // Queue a connection with tiered cooldown management for 100+ peer support
  const queueConnection = useCallback((targetUserId) => {
    if (!targetUserId || targetUserId === user?.id) return

    // Check capacity
    if (!canAcceptPeer(targetUserId)) {
      console.log(`[WebRTC] Cannot queue ${targetUserId}: at capacity`)
      return
    }

    // Check cooldown to prevent rapid reconnection attempts
    const tier = getTierConfig()
    const lastAttempt = connectionCooldownsRef.current.get(targetUserId)
    if (lastAttempt && Date.now() - lastAttempt < tier.cooldown) {
      console.log(`[WebRTC] Connection to ${targetUserId} on cooldown, skipping`)
      return
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
    console.log(`[WebRTC] Queued connection to ${targetUserId} (queue length: ${connectionQueueRef.current.length})`)
    processConnectionQueue()
  }, [user?.id, canAcceptPeer, getTierConfig])

  // Process large groups in batches to prevent overwhelming the system
  const processPeerBatches = useCallback((peerIds, tier) => {
    const batchSize = tier.batchSize
    const batches = []
    
    // Split into batches
    for (let i = 0; i < peerIds.length; i += batchSize) {
      batches.push(peerIds.slice(i, i + batchSize))
    }
    
    console.log(`[WebRTC] Split ${peerIds.length} peers into ${batches.length} batches of ~${batchSize}`)
    
    // Process batches with delays
    batches.forEach((batch, batchIndex) => {
      const batchDelay = batchIndex * 6000 // 6 seconds between batches
      
      setTimeout(() => {
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
          setTimeout(() => queueConnection(peerId), delay)
        })
        
        // Mark mass join complete after last batch
        if (batchIndex === batches.length - 1) {
          setTimeout(() => {
            isMassJoinInProgressRef.current = false
            pendingPeerCountRef.current = 0
            console.log('[WebRTC] Mass join processing complete')
          }, 12000)
        }
      }, batchDelay)
    })
  }, [canAcceptPeer, queueConnection])

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
      serverIceServersRef.current = []
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
      
      const tryGetMicrophone = async (deviceId) => {
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
          stream = await tryGetMicrophone(settings.inputDevice)
        } catch (err) {
          if (err.name === 'OverconstrainedError') {
            console.log('[Voice] Saved mic device not found, using default')
            settingsService.saveSettings({ ...settings, inputDevice: 'default' })
            stream = await tryGetMicrophone(null)
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
          setConnectionState('error')
          soundService.error()
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
      if (data.iceServers?.length) serverIceServersRef.current = data.iceServers
      
      const peerIds = (data.participants || [])
        .filter(p => p.id !== user.id)
        .map(p => p.id)
      
      console.log(`[WebRTC] Received participants list: ${peerIds.length} peers —`, peerIds)
      setParticipants(data.participants || [])
      
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
        
        // Simple staggered connections - no retry spam
        const delay = baseDelay + (index * staggerMs) + (Math.random() * 300)
        console.log(`[WebRTC] Queuing connection to ${peerId} in ${Math.round(delay)}ms`)
        setTimeout(() => queueConnection(peerId), delay)
      })
    })

    // Simple user-joined handler - don't spam connections
    socket.on('voice:user-joined', (userInfo) => {
      applyLowDelayModeToAllPeers()
      setParticipants(prev => {
        if (prev.find(p => p.id === userInfo.id)) return prev
        return [...prev, userInfo]
      })
      if (userInfo.id !== user.id) {
        soundService.userJoined()
        
        // Check if already connected - don't reconnect if we already have a good connection
        const existing = peerConnections.current[userInfo.id]
        if (existing) {
          const s = existing.connectionState
          if (s === 'connected' || s === 'completed') {
            console.log(`[WebRTC] Already connected to ${userInfo.id}, skipping`)
            return
          }
          if (s === 'connecting' || s === 'new') {
            console.log(`[WebRTC] Already connecting to ${userInfo.id}, skipping`)
            return
          }
          // If failed/closed, will try to reconnect below
        }
        
        // Check capacity before connecting
        if (!canAcceptPeer(userInfo.id)) {
          console.log(`[WebRTC] Cannot accept peer ${userInfo.id}: at capacity`)
          return
        }
        
        // Simple delay - no retry spam
        const tier = getTierConfig()
        const delay = 800 + Math.random() * 400
        console.log(`[WebRTC] Scheduling connection to new peer ${userInfo.id} in ${Math.round(delay)}ms`)
        setTimeout(() => queueConnection(userInfo.id), delay)
      }
    })

    // Handle user reconnection - don't treat as new join, just reconnect WebRTC
    socket.on('voice:user-reconnected', (userInfo) => {
      console.log(`[WebRTC] User reconnected: ${userInfo.id} (${userInfo.username})`)
      applyLowDelayModeToAllPeers()
      
      // Update participants list (user was already there, just updating)
      setParticipants(prev => prev.map(p => 
        p.id === userInfo.id ? { ...p, ...userInfo } : p
      ))
      
      // Don't play join sound for reconnections - they were never really gone
      
      if (userInfo.id !== user.id) {
        // Check if we already have a connection to this peer
        const existing = peerConnections.current[userInfo.id]
        if (existing) {
          const state = existing.connectionState
          // If connection is still good, no need to reconnect
          if (state === 'connected' || state === 'connecting' || state === 'completed') {
            console.log(`[WebRTC] Already connected to reconnected peer ${userInfo.id}, no action needed`)
            return
          }
        }
        
        // Reconnect to the peer with a small delay
        const delay = 500 + (Math.random() * 500)
        console.log(`[WebRTC] Reconnecting to peer ${userInfo.id} in ${Math.round(delay)}ms`)
        setTimeout(() => queueConnection(userInfo.id), delay)
      }
    })

    // Perfect negotiation — handle incoming offers
    // FIX: Always process ALL offers regardless of collision to prevent deadlocks
    // The original "ignore colliding offers when impolite" logic caused connection issues
    // when both peers tried to connect simultaneously
    socket.on('voice:offer', async (data) => {
      const { from, offer, channelId } = data
      if (channelId && channelId !== channelIdRef.current) return
      
      // Debounce rapid offers from the same peer (prevents loops)
      const now = Date.now()
      const lastOffer = lastOfferTimeRef.current[from] || 0
      if (now - lastOffer < 300) {
        console.log('[WebRTC] Debouncing rapid offer from', from)
        return
      }
      lastOfferTimeRef.current[from] = now
      
      // Check if we're already in a negotiation with this peer
      if (negotiationLockRef.current[from]) {
        console.log('[WebRTC] Negotiation already in progress for', from, '- queuing offer')
        // Queue this offer for later instead of ignoring
        setTimeout(() => {
          if (negotiationLockRef.current[from]) {
            // Still locked, try again
            lastOfferTimeRef.current[from] = 0 // Reset debounce
          }
        }, 500)
        return
      }
      
      console.log('[WebRTC] Received offer from:', from)
      negotiationLockRef.current[from] = true

      const pc = createPeerConnection(from)
      applyReceiverLatencyHints(pc, from)
      const offerCollision = makingOfferRef.current[from] || pc.signalingState !== 'stable'
      const polite = isPolite(from)

      // FIX: Never ignore offers - always respond to ensure connectivity
      // Original logic caused deadlocks when both peers ignored each other
      if (offerCollision) {
        console.log('[WebRTC] Handling offer collision for', from, '- polite:', polite)
        // If we're already making an offer, we need to handle the collision
        if (makingOfferRef.current[from]) {
          // We're also trying to connect - let the polite peer win
          // Wait a bit then proceed anyway to ensure connection
          if (!polite) {
            // Give polite peer time to complete their offer
            await new Promise(r => setTimeout(r, 200))
          }
        }
        // Regardless of politeness, rollback if needed to accept the offer
        if (pc.signalingState !== 'stable') {
          console.log('[WebRTC] Rolling back for', from)
          try {
            await pc.setLocalDescription({ type: 'rollback' })
          } catch (e) {
            // Rollback might fail if we're already in stable state - that's ok
          }
          makingOfferRef.current[from] = false
        }
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer))
        applyReceiverLatencyHints(pc, from)
        remoteDescSetRef.current[from] = true

        // Flush buffered ICE candidates
        const pending = pendingCandidatesRef.current[from] || []
        pendingCandidatesRef.current[from] = []
        for (const c of pending) {
          try { await pc.addIceCandidate(new RTCIceCandidate(c)) } catch {}
        }
        if (pending.length) console.log(`[WebRTC] Flushed ${pending.length} buffered ICE for ${from}`)

        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)

        socket.emit('voice:answer', {
          to: from,
          answer: pc.localDescription,
          channelId: channelIdRef.current
        })
        console.log('[WebRTC] Sent answer to:', from)
        // Don't initiate return connection - it creates collisions
        // The peer who sent the offer will maintain the connection to us
        
      } catch (err) {
        console.error('[WebRTC] Failed to handle offer from', from, ':', err.message)
      } finally {
        // Release the lock after a short delay to allow the answer to be processed
        setTimeout(() => {
          negotiationLockRef.current[from] = false
        }, 1000)
      }
    })

    // FIX: Improved answer handling - always process and ensure bidirectional connectivity
    socket.on('voice:answer', async (data) => {
      const { from, answer, channelId } = data
      if (channelId && channelId !== channelIdRef.current) return
      const pc = peerConnections.current[from]
      if (!pc) {
        console.log('[WebRTC] No peer connection for answer from', from, '- creating one')
        // FIX: Create a new connection if we don't have one
        const newPc = createPeerConnection(from)
        applyReceiverLatencyHints(newPc, from)
        try {
          await newPc.setRemoteDescription(new RTCSessionDescription(answer))
          applyReceiverLatencyHints(newPc, from)
          remoteDescSetRef.current[from] = true
          // Flush any buffered ICE candidates
          const pending = pendingCandidatesRef.current[from] || []
          pendingCandidatesRef.current[from] = []
          for (const c of pending) {
            try { await newPc.addIceCandidate(new RTCIceCandidate(c)) } catch {}
          }
          if (pending.length) console.log(`[WebRTC] Flushed ${pending.length} buffered ICE for ${from}`)
        } catch (err) {
          console.error('[WebRTC] Failed to set answer from', from, ':', err.message)
        }
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
        // Clear ignoreOffer now that we have a valid answer — ICE candidates
        // from this peer must be processed from this point forward.
        ignoreOfferRef.current[from] = false
        // Mark negotiation as complete to prevent spurious renegotiation
        negotiationCompleteRef.current[from] = true
        console.log('[WebRTC] Set remote answer from:', from)
        // Flush buffered ICE candidates
        const pending = pendingCandidatesRef.current[from] || []
        pendingCandidatesRef.current[from] = []
        for (const c of pending) {
          try { await pc.addIceCandidate(new RTCIceCandidate(c)) } catch {}
        }
        if (pending.length) console.log(`[WebRTC] Flushed ${pending.length} buffered ICE for ${from}`)
        // Don't retry - let the connection establish naturally
      } catch (err) {
        console.error('[WebRTC] Failed to set answer from', from, ':', err.message)
      }
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
      setParticipants(prev => prev.filter(p => p.id !== userId))
      setPeerStates(prev => { const n = { ...prev }; delete n[userId]; return n })
      soundService.userLeft()

      if (peerConnections.current[userId]) {
        try { peerConnections.current[userId].close() } catch {}
        delete peerConnections.current[userId]
      }
      ;[userId, `${userId}__screen`].forEach(audioKey => {
        const el = audioElements.current[audioKey]
        if (!(el instanceof HTMLMediaElement)) return
        try { el.pause() } catch {}
        el.srcObject = null
        if (el.parentNode) el.parentNode.removeChild(el)
        delete audioElements.current[audioKey]
      })
      // Disconnect Web Audio bypass nodes
      try { audioElements.current[`${userId}__webaudio_source`]?.disconnect() } catch {}
      try { audioElements.current[`${userId}__webaudio_gain`]?.disconnect() } catch {}
      delete audioElements.current[`${userId}__webaudio_source`]
      delete audioElements.current[`${userId}__webaudio_gain`]
      delete audioElements.current[`${userId}__webaudio_ctx`]
      delete remoteStreams.current[userId]
      // Clear perfect-negotiation state
      delete makingOfferRef.current[userId]
      delete ignoreOfferRef.current[userId]
      delete remoteDescSetRef.current[userId]
      delete pendingCandidatesRef.current[userId]
      delete lastOfferTimeRef.current[userId]
      delete negotiationLockRef.current[userId]
      delete negotiationCompleteRef.current[userId]
      // Clean up remote audio analyser
      if (remoteAnalysersRef.current[userId]) {
        try { 
          remoteAnalysersRef.current[userId].audioContext?.close()?.catch(() => {}) 
        } catch {}
        delete remoteAnalysersRef.current[userId]
      }
      // Clear speaking state for this user
      setSpeaking(prev => {
        const next = { ...prev }
        delete next[userId]
        return next
      })
      // Clear video streams for this user
      setVideoStreams(prev => {
        const next = { ...prev }
        delete next[userId]
        return next
      })
    })

// Handle force-reconnect command from server (consensus broken)
socket.on('voice:force-reconnect', (data) => {
  // Clear video streams on reconnect
  setVideoStreams({})
      const { channelId, reason, targetPeer, failurePercent, timestamp } = data
      if (channelId !== channelIdRef.current) return

      console.log(`[Voice] Force-reconnect received: ${reason}, target=${targetPeer}, failures=${failurePercent}%`)

      if (targetPeer === user?.id) {
        // I am the problematic peer - perform full reconnect
        console.log('[Voice] I am the target peer - performing full reconnect in 1s')
        soundService.error()
        // Trigger leave and rejoin
        handleLeave()
        setTimeout(() => {
          if (channelIdRef.current === channelId) {
            console.log('[Voice] Rejoining after force-reconnect')
            // The effect will handle rejoining via joinKey change
          }
        }, 1000)
      } else if (targetPeer === 'all' || targetPeer === '*') {
        // Everyone reconnect
        console.log('[Voice] Full channel reconnect requested - performing full reconnect in 1s')
        soundService.error()
        handleLeave()
        setTimeout(() => {
          if (channelIdRef.current === channelId) {
            console.log('[Voice] Rejoining after full channel reconnect')
          }
        }, 1000)
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
        setTimeout(() => queueConnection(targetPeer), 1000)
      }
    })

    socket.on('voice:user-updated', (data) => {
      setParticipants(prev => prev.map(p => 
        p.id === data.userId ? { ...p, ...data } : p
      ))
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
        }
        
        // Clean up audio context
        if (analyserRef.current?.audioContext && analyserRef.current.audioContext.state !== 'closed') {
          analyserRef.current.audioContext.close().catch(() => {})
        }
        analyserRef.current = null
        
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
  }, [socket, channel?.id, user?.id, joinKey, clearRemoteVideoState, applyLowDelayModeToAllPeers, applyReceiverLatencyHints])

  // Expose peer connections for the VoiceInfoModal stats panel
  useEffect(() => {
    window.__vcGetPCs = () => ({ ...peerConnections.current })
    return () => { delete window.__vcGetPCs }
  }, [])

  // Connection watchdog — gentle monitoring, minimal interference
  // Only restart ICE for disconnected peers, don't aggressively reconnect
  
  useEffect(() => {
    if (!socket) return
    const watchdog = setInterval(() => {
      if (!hasJoinedRef.current) return
      
      Object.entries(peerConnections.current).forEach(([peerId, pc]) => {
        const s = pc.connectionState
        const iceS = pc.iceConnectionState
        
        // Only handle completely failed connections - close them cleanly
        if (s === 'failed' || s === 'closed') {
          console.log(`[WebRTC] Watchdog: ${peerId} is ${s}`)
          try { pc.close() } catch {}
          delete peerConnections.current[peerId]
          makingOfferRef.current[peerId] = false
          // Don't auto-reconnect - let the peer reconnect to us naturally
          return
        }
        
        // Only restart ICE for truly stuck connections, don't reconnect
        if (s === 'disconnected' && iceS === 'disconnected') {
          console.log(`[WebRTC] Watchdog: ${peerId} disconnected — restarting ICE`)
          pc.restartIce()
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

  // Trigger renegotiation for a specific peer after track changes
  const renegotiateWithPeer = async (peerId) => {
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
    
    try {
      makingOfferRef.current[peerId] = true
      const offer = await pc.createOffer()
      
      if (pc.signalingState !== 'stable') {
        console.log(`[WebRTC] Aborting renegotiation for ${peerId} - state changed to ${pc.signalingState}`)
        return
      }
      
      await pc.setLocalDescription(offer)
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

  const currentMuted = externalMuted !== undefined ? externalMuted : localIsMuted
  const currentDeafened = externalDeafened !== undefined ? externalDeafened : localIsDeafened

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
        settingsService.setSetting('voiceMuted', nextMuted)
        settingsService.setSetting('voiceDeafened', nextDeafened)
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

  const toggleVideo = async () => {
    if (isVideoOn) {
      // Stop all video tracks first so the camera LED turns off
      localVideoStream?.getVideoTracks().forEach(track => track.stop())
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

        setLocalVideoStream(videoStream)
        setIsVideoOn(true)
        soundService.cameraOn()

        const videoTrack = videoStream.getVideoTracks()[0]
        // Tag this track so we can find it later
        videoTrack._senderTag = 'camera'

        // Add video track to all peer connections that are in a good state
        Object.entries(peerConnections.current).forEach(([peerId, pc]) => {
          // Skip connections that aren't in a usable state
          const connState = pc.connectionState
          const iceState = pc.iceConnectionState
          if (connState === 'closed' || connState === 'failed' || connState === 'disconnected') {
            console.log(`[Video] Skipping track add to ${peerId} - connection state: ${connState}`)
            return
          }
          if (iceState === 'failed' || iceState === 'disconnected') {
            console.log(`[Video] Skipping track add to ${peerId} - ICE state: ${iceState}`)
            return
          }
          
          // Camera and screen share each get their OWN sender — don't reuse
          const existing = pc.getSenders().find(s => s.track?._senderTag === 'camera')
          if (existing) {
            existing.replaceTrack(videoTrack)
          } else {
            const sender = pc.addTrack(videoTrack, videoStream)
            if (sender) sender.track._senderTag = 'camera'
          }
        })

        // Renegotiate to send video track to all peers
        await renegotiateWithAllPeers()

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
    stream?.getTracks().forEach(track => track.stop())
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
      try {
        const browser = detectScreenShareBrowser()
        let stream = null
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

        setScreenStream(stream)
        setIsScreenSharing(true)
        soundService.screenShareStart()

        const videoTrack = stream.getVideoTracks()[0]
        videoTrack._senderTag = 'screen'
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

        // Add screen share track to all peer connections that are in a good state
        Object.entries(peerConnections.current).forEach(([peerId, pc]) => {
          // Skip connections that aren't in a usable state
          const connState = pc.connectionState
          const iceState = pc.iceConnectionState
          if (connState === 'closed' || connState === 'failed' || connState === 'disconnected') {
            console.log(`[Screen] Skipping track add to ${peerId} - connection state: ${connState}`)
            return
          }
          if (iceState === 'failed' || iceState === 'disconnected') {
            console.log(`[Screen] Skipping track add to ${peerId} - ICE state: ${iceState}`)
            return
          }
          
          // Screen share gets its own dedicated sender — camera sender is untouched
          const existingVideoSender = pc.getSenders().find(s => s.track?._senderTag === 'screen')
          if (existingVideoSender) {
            existingVideoSender.replaceTrack(videoTrack)
          } else {
            pc.addTrack(videoTrack, stream)
          }

          screenAudioTracks.forEach(audioTrack => {
            const existingAudioSender = pc.getSenders().find(s => s.track?._senderTag === 'screen-audio')
            if (existingAudioSender) {
              existingAudioSender.replaceTrack(audioTrack)
            } else if (!pc.getSenders().find(s => s.track?.id === audioTrack.id)) {
              pc.addTrack(audioTrack, stream)
            }
          })
        })

        // Renegotiate to send screen share track to all peers
        await renegotiateWithAllPeers()

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
      }
    }
  }

  const handleLeave = () => {
    // Mark as intentional leave so cleanup doesn't re-emit voice:leave
    isIntentionalLeave = true
    
    // soundService.callLeft() - removed, cleanup handles this

    // Stop all media tracks
    localStream?.getTracks().forEach(t => t.stop())
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    localStreamRef.current = null
    localVideoStream?.getTracks().forEach(t => t.stop())
    screenStream?.getTracks().forEach(t => t.stop())

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
// Close video elements
Object.entries(videoElements.current).forEach(([key, node]) => {
  if (node && node.pause) {
    node.pause()
    node.srcObject = null
    if (node.parentNode) node.parentNode.removeChild(node)
  }
})
// Clear video streams
setVideoStreams({})
// Close video elements
Object.entries(videoElements.current).forEach(([key, node]) => {
  if (node && node.pause) {
    node.pause()
    node.srcObject = null
    if (node.parentNode) node.parentNode.removeChild(node)
  }
})
// Clear video streams
setVideoStreams({})
// Close video elements
Object.entries(videoElements.current).forEach(([key, node]) => {
  if (node && node.pause) {
    node.pause()
    node.srcObject = null
    if (node.parentNode) node.parentNode.removeChild(node)
  }
})
// Clear video streams
setVideoStreams({})
// Close video elements
Object.entries(videoElements.current).forEach(([key, node]) => {
  if (node && node.pause) {
    node.pause()
    node.srcObject = null
    if (node.parentNode) node.parentNode.removeChild(node)
  }
})
// Clear video streams
setVideoStreams({})
// Close video elements
Object.entries(videoElements.current).forEach(([key, node]) => {
  if (node && node.pause) {
    node.pause()
    node.srcObject = null
    if (node.parentNode) node.parentNode.removeChild(node)
  }
})
// Clear video streams
setVideoStreams({})
// Close video elements
Object.entries(videoElements.current).forEach(([key, node]) => {
  if (node && node.pause) {
    node.pause()
    node.srcObject = null
    if (node.parentNode) node.parentNode.removeChild(node)
  }
})
// Clear video streams
setVideoStreams({})
// Close video elements
Object.entries(videoElements.current).forEach(([key, node]) => {
  if (node && node.pause) {
    node.pause()
    node.srcObject = null
    if (node.parentNode) node.parentNode.removeChild(node)
  }
})
// Clear video streams
setVideoStreams({})
// Close video elements
Object.entries(videoElements.current).forEach(([key, node]) => {
  if (node && node.pause) {
    node.pause()
    node.srcObject = null
    if (node.parentNode) node.parentNode.removeChild(node)
  }
})
// Clear video streams
setVideoStreams({})
// Close video elements
Object.entries(videoElements.current).forEach(([key, node]) => {
  if (node && node.pause) {
    node.pause()
    node.srcObject = null
    if (node.parentNode) node.parentNode.removeChild(node)
  }
})
// Clear video streams
setVideoStreams({})
// Close video elements
Object.entries(videoElements.current).forEach(([key, node]) => {
  if (node && node.pause) {
    node.pause()
    node.srcObject = null
    if (node.parentNode) node.parentNode.removeChild(node)
  }
})
// Clear video streams
setVideoStreams({})
// Close video elements
Object.entries(videoElements.current).forEach(([key, node]) => {
  if (node && node.pause) {
    node.pause()
    node.srcObject = null
    if (node.parentNode) node.parentNode.removeChild(node)
  }
})
// Clear video streams
setVideoStreams({})
// Close video elements
Object.entries(videoElements.current).forEach(([key, node]) => {
  if (node && node.pause) {
    node.pause()
    node.srcObject = null
    if (node.parentNode) node.parentNode.removeChild(node)
  }
})
// Clear video streams
setVideoStreams({})
// Close video elements
Object.entries(videoElements.current).forEach(([key, node]) => {
  if (node && node.pause) {
    node.pause()
    node.srcObject = null
    if (node.parentNode) node.parentNode.removeChild(node)
  }
})
// Clear video streams
setVideoStreams({})
    analyserRef.current = null

    // Reset all negotiation state so a fresh join works without page reload
    makingOfferRef.current  = {}
    ignoreOfferRef.current  = {}
    remoteDescSetRef.current = {}
    pendingCandidatesRef.current = {}
    lastOfferTimeRef.current = {}
    negotiationLockRef.current = {}
    serverIceServersRef.current = []
    initializedChannelIdRef.current = null
    isInitializingRef.current = false

    // Reset React state
    setLocalStream(null)
    setLocalVideoStream(null)
    setScreenStream(null)
    setParticipants([])
    setPeerStates({})
    setConnectionState('connecting')
    setIsVideoOn(false)
    setIsScreenSharing(false)
    setVideoStreams({})

// Emit leave
if (hasJoinedRef.current && !hasLeftRef.current) {
  // Clear video streams on leave
  setVideoStreams({})
      if (socket?.connected) {
        socket.emit('voice:leave', channel.id)
        console.log('[Voice] Manual leave - emitted voice:leave')
      }
      hasJoinedRef.current = false
      hasLeftRef.current = true
    }

    onLeave()
  }

  const otherParticipants = participants.filter(p => p.id !== user?.id)
  
  // Create self participant if not in list yet
  const selfParticipant = participants.find(p => p.id === user?.id) || {
    id: user?.id,
    username: user?.username || user?.email,
    avatar: user?.avatar,
    muted: currentMuted,
    deafened: currentDeafened
  }

  // All participants including self
  const displayParticipants = participants.find(p => p.id === user?.id)
    ? participants
    : [selfParticipant, ...participants]

  // Derive a single overall header status from mic state + peer states
  const overallStatus = (() => {
    if (connectionState === 'error') return 'error'
    if (connectionState === 'connecting') return 'connecting'
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
        setSpeaking(prev => ({ ...prev, [id]: true }))
      }, SPEAKING_ON_DELAY)
      return
    }

    if (!isSpeakingRaw && wasSpeaking) {
      speakingTimersRef.current[id] = setTimeout(() => {
        setSpeaking(prev => ({ ...prev, [id]: false }))
      }, SPEAKING_OFF_DELAY)
      return
    }

    if (isSpeakingRaw === wasSpeaking) {
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
        if (participant.id === user?.id) return // Skip self
        
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
      const currentParticipantIds = new Set(displayParticipants.map(p => p.id))
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

  const bindVideoStream = useCallback((el, stream) => {
    const nextStream = hasLiveVideoTrack(stream) ? stream : null
    const nextTrackSignature = nextStream
      ? nextStream.getVideoTracks().map(t => `${t.id}:${t.readyState}:${t.enabled}`).join('|')
      : ''
    const prevTrackSignature = el.dataset.trackSignature || ''

    // Rebind when stream object changes OR when underlying video track set changes.
    if (el.srcObject !== nextStream || prevTrackSignature !== nextTrackSignature) {
      el.srcObject = nextStream
      el.dataset.trackSignature = nextTrackSignature
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
      bindVideoStream(el, expectedStream)
    }
  }, [videoStreams, bindVideoStream])

  const isScreenShareMutedForMe = useCallback((participantId) => {
    if (!participantId || participantId === user?.id) return false
    return !!localUserSettings[participantId]?.screenShareMuted
  }, [localUserSettings, user?.id])

  const getScreenShareStream = (participant) => {
    if (participant.id === user?.id && isScreenSharing) {
      return hasLiveVideoTrack(screenStream) ? screenStream : null
    }
    return participant.isScreenSharing && hasLiveVideoTrack(participant.videoStream) ? participant.videoStream : null
  }

  const getCameraStream = (participant) => {
    if (participant.id === user?.id && isVideoOn) {
      return hasLiveVideoTrack(localVideoStream) ? localVideoStream : null
    }
    return participant.hasVideo && !participant.isScreenSharing && hasLiveVideoTrack(participant.videoStream)
      ? participant.videoStream
      : null
  }

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
        <Volume2 size={24} />
        <span className="voice-channel-name">{channel?.name || t('chat.voiceChannel')}</span>
        <span
          className={`connection-status ${overallStatus} clickable`}
          onClick={() => onShowConnectionInfo?.()}
          title={t('misc.connectionDetails')}
          style={{ cursor: 'pointer' }}
        >
          {statusLabel}
        </span>
      </div>
      {isScreenSharing && screenShareAudioWarning && (
        <div className="voice-inline-warning" role="status" aria-live="polite">
          <Music size={14} />
          <span>{screenShareAudioWarning}</span>
        </div>
      )}

      <div className={`voice-main-area ${hasAnyVideo ? 'has-video' : ''}`}>
        {hasAnyVideo && mainVideoStream && mainVideoParticipant ? (
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
                <Monitor size={14} />
                <span>{t('chat.someoneSharingScreen')}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="voice-participants-grid" data-count={displayParticipants.length}>
            {displayParticipants.map(participant => {
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
                        src={participant.avatar}
                        fallback={participant.username}
                        size={64}
                      />
                      {isMuted && (
                        <div className="participant-grid-muted-icon">
                          <MicOff size={14} />
                        </div>
                      )}
                    </div>
                  )}
                  <div className="participant-grid-name">
                    {participant.username}
                    {participant.bot && <span className="bot-badge">{t('member.bot')}</span>}
                    {isSelf && ` (${t('common.you') || 'You'})`}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="voice-participants-strip">
        <div className="participants-scrollable">
          {displayParticipants.map(participant => {
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
                    />
                    {isMuted && <div className="tile-mute-icon"><MicOff size={14} /></div>}
                    {isDeafened && <div className="tile-deafen-icon"><VolumeX size={14} /></div>}
                    {!isSelf && peerState !== 'connected' && (
                      <div className={`tile-peer-badge peer-state-${peerState}`} title={t(`voice.peerState.${peerState}`, peerState)}>
                        {peerState === 'connecting' ? '⟳' : peerState === 'failed' ? '✕' : '!'}
                      </div>
                    )}
                  </div>
                )}
                <span className="tile-name">
                  {participant.username}
                  {participant.bot && <span className="bot-badge">{t('member.bot')}</span>}
                  {isSelf && ` (${t('common.you') || 'You'})`}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="voice-controls">
        <button 
          className={`voice-control-btn ${currentMuted ? 'active' : ''}`}
          onClick={toggleMute}
          title={currentMuted ? t('chat.unmute') : t('chat.mute')}
        >
          {currentMuted ? <MicOff size={24} /> : <Mic size={24} />}
        </button>
        
        <button 
          className={`voice-control-btn ${currentDeafened ? 'active' : ''}`}
          onClick={toggleDeafen}
          title={currentDeafened ? t('chat.undeafen') : t('chat.deafen')}
        >
          {currentDeafened ? <VolumeX size={24} /> : <Headphones size={24} />}
        </button>

        <button 
          className={`voice-control-btn ${isVideoOn ? 'active-video' : ''}`}
          onClick={toggleVideo}
          title={isVideoOn ? t('chat.disableVideo') : t('chat.enableVideo')}
        >
          {isVideoOn ? <Video size={24} /> : <VideoOff size={24} />}
        </button>

        <button 
          className={`voice-control-btn ${isScreenSharing ? 'active-screen' : ''}`}
          onClick={toggleScreenShare}
          title={isScreenSharing ? t('chat.stopSharing') : t('chat.shareScreen')}
        >
          {isScreenSharing ? <Monitor size={24} /> : <MonitorOff size={24} />}
        </button>

        <button 
          className="voice-control-btn leave"
          onClick={handleLeave}
          title={t('misc.leaveVoiceChannel')}
        >
          <PhoneOff size={24} />
        </button>

        <button 
          className="voice-control-btn settings"
          title={t('misc.voiceSettings')}
          onClick={onOpenSettings}
        >
          <Settings size={24} />
        </button>

        <button 
          className={`voice-control-btn ${showVoiceFX ? 'active' : ''}`}
          title={t('misc.voiceEffects')}
          onClick={() => setShowVoiceFX(true)}
        >
          <Music size={24} />
        </button>
      </div>

      {/* Participant right-click context menu */}
      {participantMenu && (() => {
        const ls = localUserSettings[participantMenu.userId] || { muted: false, volume: 100 }
        const menuParticipant = displayParticipants.find(p => p.id === participantMenu.userId)
        const canMuteScreenShare = participantMenu.canMuteForMe && !!menuParticipant?.isScreenSharing
        const menuW = 240
        const menuH = participantMenu.canMuteForMe ? (canMuteScreenShare ? 290 : 250) : 145
        const x = Math.min(participantMenu.x, window.innerWidth  - menuW - 8)
        const y = Math.min(participantMenu.y, window.innerHeight - menuH - 8)
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
                {participantMenu.isPinned || participantMenu.isMain ? <MonitorOff size={14} /> : <Monitor size={14} />}
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
                {ls.screenShareMuted ? <Monitor size={14} /> : <MonitorOff size={14} />}
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
                {ls.muted ? <Volume2 size={14} /> : <VolumeX size={14} />}
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
    </div>
  )
}

export default VoiceChannel
