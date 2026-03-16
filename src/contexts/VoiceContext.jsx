import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { useSocket } from './SocketContext'
import { useAuth } from './AuthContext'
import { settingsService } from '../services/settingsService'
import { soundService } from '../services/soundService'
import { voiceAudio } from '../services/voiceAudio'
import { getStoredServer } from '../services/serverConfig'

// Default ICE servers - includes TURN servers for NAT traversal
// TURN servers are essential for international calls and restrictive NATs
const DEFAULT_ICE_SERVERS = [
  // STUN servers for initial connection attempts
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  { urls: 'stun:stun.stunprotocol.org:3478' },
  
  // Open Relay Project - Free global TURN servers
  // Essential for symmetric NAT and international connections
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
  }
]

const buildPeerConfig = (serverIceServers = []) => ({
  iceServers: [...DEFAULT_ICE_SERVERS, ...serverIceServers],
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  iceCandidatePoolSize: 10,
  // Enable ICE restart for connection recovery
  iceRestart: true
})

const PEER_LEAVE_GRACE_MS = 5000
const NEGOTIATION_TIMEOUT_MS = 12000
const PENDING_CANDIDATE_MAX_AGE_MS = 15000

const VoiceContext = createContext(null)

// Provider that manages all RTC state - persists across UI view changes
export const VoiceProvider = ({ children }) => {
  const { socket, connected } = useSocket()
  const { user } = useAuth()
  
  // Connection state
  const [isConnected, setIsConnected] = useState(false)
  const [connectionState, setConnectionState] = useState('disconnected') // 'disconnected' | 'connecting' | 'connected' | 'error'
  const [channel, setChannel] = useState(null)
  const [participants, setParticipants] = useState([])
  const [localStream, setLocalStream] = useState(null)
  const [localVideoStream, setLocalVideoStream] = useState(null)
  const [screenStream, setScreenStream] = useState(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isDeafened, setIsDeafened] = useState(false)
  const [isVideoOn, setIsVideoOn] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [showScreenPicker, setShowScreenPicker] = useState(false)
  const [peerStates, setPeerStates] = useState({})
  
  // Refs for RTC management (immutable during connection)
  const peerConnections = useRef({})
  const remoteStreams = useRef({})
  const audioElements = useRef({})
  const localStreamRef = useRef(null)
  const localVideoStreamRef = useRef(null)
  const screenStreamRef = useRef(null)
  const analyserRef = useRef(null)
  const channelIdRef = useRef(null)
  const hasJoinedRef = useRef(false)
  const hasLeftRef = useRef(false)
  const isInitializingRef = useRef(false)
  
  // Perfect negotiation state
  const makingOfferRef = useRef({})
  const ignoreOfferRef = useRef({})
  const remoteDescSetRef = useRef({})
  const pendingCandidatesRef = useRef({})
  const serverIceServersRef = useRef([])
  const connectionGenerationRef = useRef(0)
  
  // Reconnect attempt tracking for exponential backoff
  const reconnectAttemptsRef = useRef({})
  const peerDisconnectTimestampsRef = useRef({})
  const leaveGraceTimersRef = useRef({})
  const negotiationTimersRef = useRef({})
  
  // Connection queue
  const connectionQueueRef = useRef([])
  const isProcessingQueueRef = useRef(false)
  const activeNegotiationsRef = useRef(0)
  const connectionCooldownsRef = useRef(new Map())
  const isMassJoinInProgressRef = useRef(false)
  const pendingPeerCountRef = useRef(0)
  
  const TIER_CONFIG = {
    small: { maxPeers: 10, concurrent: 2, cooldown: 1000, staggerBase: 400, staggerPerPeer: 300, batchSize: 10 },
    medium: { maxPeers: 25, concurrent: 2, cooldown: 1500, staggerBase: 800, staggerPerPeer: 500, batchSize: 15 },
    large: { maxPeers: 50, concurrent: 1, cooldown: 2000, staggerBase: 1500, staggerPerPeer: 700, batchSize: 20 },
    massive: { maxPeers: 100, concurrent: 1, cooldown: 3000, staggerBase: 2500, staggerPerPeer: 900, batchSize: 25 }
  }
  const MAX_CONNECTED_PEERS = 100
  const priorityPeersRef = useRef(new Set())

  const releaseNegotiationSlot = useCallback((targetUserId) => {
    const timer = negotiationTimersRef.current[targetUserId]
    if (timer) {
      clearTimeout(timer)
      delete negotiationTimersRef.current[targetUserId]
    }
    activeNegotiationsRef.current = Math.max(0, activeNegotiationsRef.current - 1)
  }, [])

  const startNegotiationSlot = useCallback((targetUserId) => {
    releaseNegotiationSlot(targetUserId)
    activeNegotiationsRef.current += 1
    negotiationTimersRef.current[targetUserId] = setTimeout(() => {
      releaseNegotiationSlot(targetUserId)
    }, NEGOTIATION_TIMEOUT_MS)
  }, [releaseNegotiationSlot])

  const clearPendingLeaveTimer = useCallback((targetUserId) => {
    const timer = leaveGraceTimersRef.current[targetUserId]
    if (timer) {
      clearTimeout(timer)
      delete leaveGraceTimersRef.current[targetUserId]
    }
  }, [])

  const clearConnectionTracking = useCallback(() => {
    connectionGenerationRef.current += 1
    connectionQueueRef.current = []
    isProcessingQueueRef.current = false
    activeNegotiationsRef.current = 0
    connectionCooldownsRef.current.clear()
    pendingCandidatesRef.current = {}
    reconnectAttemptsRef.current = {}
    peerDisconnectTimestampsRef.current = {}
    makingOfferRef.current = {}
    ignoreOfferRef.current = {}
    remoteDescSetRef.current = {}

    Object.values(leaveGraceTimersRef.current).forEach((timer) => clearTimeout(timer))
    leaveGraceTimersRef.current = {}
    Object.values(negotiationTimersRef.current).forEach((timer) => clearTimeout(timer))
    negotiationTimersRef.current = {}
  }, [])

  const cleanupPeer = useCallback((targetUserId) => {
    clearPendingLeaveTimer(targetUserId)
    releaseNegotiationSlot(targetUserId)
    delete reconnectAttemptsRef.current[targetUserId]
    delete peerDisconnectTimestampsRef.current[targetUserId]
    delete makingOfferRef.current[targetUserId]
    delete ignoreOfferRef.current[targetUserId]
    delete remoteDescSetRef.current[targetUserId]
    delete pendingCandidatesRef.current[targetUserId]

    const pc = peerConnections.current[targetUserId]
    if (pc) {
      try { pc.close() } catch {}
      delete peerConnections.current[targetUserId]
    }

    const audioEl = audioElements.current[targetUserId]
    if (audioEl) {
      try {
        voiceAudio.forget(audioEl)
        audioEl.pause()
        audioEl.srcObject = null
        audioEl.parentNode?.removeChild(audioEl)
      } catch {}
      delete audioElements.current[targetUserId]
    }

    const remoteStream = remoteStreams.current[targetUserId]
    if (remoteStream) {
      try {
        remoteStream.getTracks().forEach((track) => track.stop?.())
      } catch {}
      delete remoteStreams.current[targetUserId]
    }

    setPeerStates((prev) => {
      const next = { ...prev }
      delete next[targetUserId]
      return next
    })
  }, [clearPendingLeaveTimer, releaseNegotiationSlot])
  
  // Keep refs updated
  useEffect(() => {
    localStreamRef.current = localStream
  }, [localStream])
  
  // Install audio unlock early for Electron/Chrome
  useEffect(() => {
    if (typeof window !== 'undefined' && window.__IS_DESKTOP_APP__) {
      installAudioUnlock()
    }
  }, [])
  
  useEffect(() => {
    localVideoStreamRef.current = localVideoStream
  }, [localVideoStream])
  
  useEffect(() => {
    screenStreamRef.current = screenStream
  }, [screenStream])
  
  useEffect(() => {
    channelIdRef.current = channel?.id
  }, [channel?.id])
  
  const isPolite = useCallback((remoteId) => {
    return (user?.id || '') < remoteId
  }, [user?.id])
  
  const getTierConfig = useCallback(() => {
    const peerCount = Object.keys(peerConnections.current).length + connectionQueueRef.current.length
    if (peerCount <= TIER_CONFIG.small.maxPeers) return TIER_CONFIG.small
    if (peerCount <= TIER_CONFIG.medium.maxPeers) return TIER_CONFIG.medium
    if (peerCount <= TIER_CONFIG.large.maxPeers) return TIER_CONFIG.large
    return TIER_CONFIG.massive
  }, [])
  
  const canAcceptPeer = useCallback((peerId) => {
    const currentPeers = Object.keys(peerConnections.current).length
    if (priorityPeersRef.current.has(peerId)) return true
    if (currentPeers >= MAX_CONNECTED_PEERS) return false
    return true
  }, [])
  
  const reportPeerState = useCallback((targetPeerId, state) => {
    if (!socket?.connected || !channelIdRef.current) return
    socket.emit('voice:peer-state-report', {
      channelId: channelIdRef.current,
      targetPeerId,
      state,
      timestamp: Date.now()
    })
  }, [socket])

  const applyReceiverLatencyHints = useCallback((pc, peerId = 'unknown') => {
    if (!pc?.getReceivers) return
    const receivers = pc.getReceivers()
    receivers.forEach(receiver => {
      try {
        if (!receiver?.track) return
        const isVideo = receiver.track.kind === 'video'
        
        // Force low-latency audio playout for Chrome A/V sync
        // This reduces Chrome audio buffering so it matches video
        if (!isVideo && typeof receiver.playoutDelayHint !== 'undefined') {
          receiver.playoutDelayHint = 0  // Minimum delay for audio
        }
        
        // Set jitter buffer target
        if (typeof receiver.jitterBufferTarget !== 'undefined') {
          receiver.jitterBufferTarget = isVideo ? 0 : 0  // 0 for both for sync
        }
        
        console.log(`[WebRTC] Applied latency hints for ${peerId}: ${isVideo ? 'video' : 'audio'} playoutDelayHint=0`)
      } catch (err) {
        console.warn(`[WebRTC] Failed to apply latency hints for ${peerId}:`, err.message)
      }
    })
  }, [])
  
  // Chrome audio unlock - required for autoplay after reconnect
  const audioUnlockedRef = useRef(false)
  
  const installAudioUnlock = useCallback(() => {
    if (audioUnlockedRef.current) return

    const unlock = () => {
      try {
        voiceAudio.unlock()
        audioUnlockedRef.current = true
      } catch (e) {
        console.warn('[WebRTC] Audio unlock failed:', e?.name || e)
      }
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }

    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
  }, [])
  
  const ensureRemoteAudioElement = useCallback((peerId) => {
    const applyOutputDevice = async (audioEl, desiredDeviceId) => {
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
    }

    let audioEl = audioElements.current[peerId]
    if (!audioEl) {
      audioEl = document.createElement('audio')
      audioEl.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none;opacity:0'
      document.body.appendChild(audioEl)
      audioElements.current[peerId] = audioEl
      
      // Set output device immediately for Chromium/Electron
      const settings = settingsService.getSettings()
      applyOutputDevice(audioEl, settings.outputDevice)
    }
    audioEl.autoplay = true
    audioEl.playsInline = true
    audioEl.muted = false
    return audioEl
  }, [])

  // Attach remote audio with Chrome autoplay handling
  const attachRemoteAudio = useCallback((audioEl, remoteStream) => {
    if (!audioEl || !remoteStream) return
    audioEl.srcObject = remoteStream
    const settings = settingsService.getSettings()
    audioEl.volume = Math.max(0, Math.min(1, (settings.volume ?? 100) / 100))
    audioEl.muted = isDeafened
    
    // Set output device - CRITICAL for Chromium/Electron audio
    if (audioEl.setSinkId) {
      const targetDevice = settings.outputDevice || 'default'
      audioEl.setSinkId(targetDevice).then(() => {
        console.log('[WebRTC] setSinkId success:', targetDevice)
      }).catch(async (e) => {
        console.warn('[WebRTC] setSinkId failed:', e?.name, e?.message)
        if (targetDevice !== 'default') {
          try {
            await audioEl.setSinkId('default')
            const latest = settingsService.getSettings()
            if (latest.outputDevice !== 'default') {
              settingsService.saveSettings({ ...latest, outputDevice: 'default' })
            }
            console.warn('[WebRTC] Fell back to default output device')
          } catch (fallbackErr) {
            console.warn('[WebRTC] Default output fallback failed:', fallbackErr?.name, fallbackErr?.message)
          }
        }
      })
    }
    
    // Ensure AudioContext is created/unlocked for Electron/Chrome
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (AudioContext && AudioContext.prototype.state !== 'running') {
        new AudioContext().resume().catch(() => {})
      }
    } catch (e) {}
    
    // Explicitly try to play - critical for Electron/Chrome
    const playPromise = audioEl.play()
    if (playPromise) {
      playPromise.catch(() => {
        voiceAudio.register(audioEl)
      })
    }
    
    voiceAudio.register(audioEl)
  }, [isDeafened])

  const attachRemoteAudioTrack = useCallback((peerId, track) => {
    if (!peerId || !track || track.kind !== 'audio') return
    const audioEl = ensureRemoteAudioElement(peerId)
    const stream = new MediaStream([track])
    remoteStreams.current[peerId] = stream

    const start = () => attachRemoteAudio(audioEl, stream)
    track.onunmute = start
    if (!track.muted) start()
    track.onended = () => {
      if (audioEl?.srcObject === stream) {
        voiceAudio.forget(audioEl)
        audioEl.pause()
        audioEl.srcObject = null
      }
    }
  }, [attachRemoteAudio, ensureRemoteAudioElement])

  // Force audio unlock on user interaction (Chrome requirement)
  useEffect(() => {
    const forceUnlock = () => {
      voiceAudio.unlock()
      const ctx = voiceAudio.getAudioContext()
      if (ctx && ctx.state === 'suspended') {
        ctx.resume()
      }
    }
    document.addEventListener('click', forceUnlock, { once: true })
    document.addEventListener('keydown', forceUnlock, { once: true })
    return () => {
      document.removeEventListener('click', forceUnlock)
      document.removeEventListener('keydown', forceUnlock)
    }
  }, [])
   
  // Create peer connection
  const createPeerConnection = useCallback((targetUserId) => {
    const existing = peerConnections.current[targetUserId]
    if (existing) {
      const state = existing.connectionState
      if (state !== 'closed' && state !== 'failed') return existing
      try { existing.close() } catch {}
    }
    
    makingOfferRef.current[targetUserId] = false
    ignoreOfferRef.current[targetUserId] = false
    remoteDescSetRef.current[targetUserId] = false
    pendingCandidatesRef.current[targetUserId] = []
    
    const pc = new RTCPeerConnection(buildPeerConfig(serverIceServersRef.current))
    peerConnections.current[targetUserId] = pc
    
    pc.onicecandidate = (event) => {
      if (!event.candidate || !channelIdRef.current) return
      socket?.emit('voice:ice-candidate', {
        to: targetUserId,
        candidate: event.candidate.toJSON(),
        channelId: channelIdRef.current
      })
    }
    
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') pc.restartIce()
      if (pc.iceConnectionState === 'disconnected') {
        peerDisconnectTimestampsRef.current[targetUserId] = Date.now()
        const pcAtCheck = pc
        setTimeout(() => {
          if (pcAtCheck.iceConnectionState === 'disconnected' || pcAtCheck.iceConnectionState === 'failed') {
            console.log(`[Voice] ICE still disconnected for ${targetUserId}, restarting ICE`)
            try { pcAtCheck.restartIce() } catch(e) {
              console.warn('[Voice] ICE restart failed:', e.message)
            }
          }
        }, 6000) // Increased from 4000 to 6000ms to be less aggressive
      }
    }
    
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState
      setPeerStates(prev => ({ ...prev, [targetUserId]: s }))
      reportPeerState(targetUserId, s)
      
      if (s === 'connected') {
        releaseNegotiationSlot(targetUserId)
        // Reset reconnect attempts on successful connection
        delete reconnectAttemptsRef.current[targetUserId]
        delete peerDisconnectTimestampsRef.current[targetUserId]
        applyReceiverLatencyHints(pc, targetUserId)
        const receivers = pc.getReceivers()
        
        // Handle audio receiver
        const audioReceiver = receivers.find(r => r.track?.kind === 'audio')
        if (audioReceiver?.track) {
          attachRemoteAudioTrack(targetUserId, audioReceiver.track)
        }
        
        // Handle video receiver - recover video tracks on reconnection
        const videoReceiver = receivers.find(r => r.track?.kind === 'video')
        if (videoReceiver && videoReceiver.track) {
          const videoTrack = videoReceiver.track
          console.log(`[WebRTC] Found video track for ${targetUserId} on connect: readyState=${videoTrack.readyState}`)
          const clearRecoveredVideo = () => {
            const stream = remoteStreams.current[targetUserId]
            if (stream) {
              stream.getVideoTracks().forEach(t => {
                try { stream.removeTrack(t) } catch {}
              })
              if (stream.getTracks().length === 0) {
                delete remoteStreams.current[targetUserId]
              }
            }
            setParticipants(prev => prev.map(p =>
              p.id === targetUserId ? { ...p, hasVideo: false, videoStream: null, isScreenSharing: false } : p
            ))
          }
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
            
            // Update participants state with video stream
            setParticipants(prev => {
              const existing = prev.find(p => p.id === targetUserId)
              if (existing?.hasVideo && existing?.videoStream?.id === videoStream.id) return prev
              console.log(`[WebRTC] Recovering video stream for ${targetUserId} on connect`)
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
        releaseNegotiationSlot(targetUserId)
        cleanupPeer(targetUserId)
        makingOfferRef.current[targetUserId] = false
        
        // Track reconnect attempts
        const attempts = (reconnectAttemptsRef.current[targetUserId] || 0) + 1
        reconnectAttemptsRef.current[targetUserId] = attempts
        
        if (attempts <= 5) {
          const delay = Math.min(2000 * Math.pow(1.5, attempts - 1), 20000) // Exponential backoff, max 20s
          console.log(`[Voice] Peer ${targetUserId} failed (attempt ${attempts}/5), retrying in ${delay}ms`)
          setTimeout(() => {
            if (hasJoinedRef.current && channelIdRef.current) {
              connectionCooldownsRef.current.delete(targetUserId)
              try {
                createPeerConnection(targetUserId)
              } catch {}
            }
          }, delay)
        } else {
          console.warn(`[Voice] Peer ${targetUserId} failed after 5 attempts, giving up`)
          delete reconnectAttemptsRef.current[targetUserId]
        }
      }
      
      if (s === 'closed') {
        releaseNegotiationSlot(targetUserId)
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
    
    pc.onnegotiationneeded = async () => {
      if (makingOfferRef.current[targetUserId] || pc.signalingState !== 'stable') return
      try {
        makingOfferRef.current[targetUserId] = true
        const offer = await pc.createOffer()
        if (pc.signalingState !== 'stable') return
        await pc.setLocalDescription(offer)
        socket?.emit('voice:offer', {
          to: targetUserId,
          offer: pc.localDescription,
          channelId: channelIdRef.current
        })
      } catch (err) {
        console.error('[WebRTC] onnegotiationneeded error:', err.message)
      } finally {
        makingOfferRef.current[targetUserId] = false
      }
    }
    
    pc.ontrack = (event) => {
      const track = event.track
      applyReceiverLatencyHints(pc, targetUserId)
      let remoteStream = event.streams[0]
      if (!remoteStream) {
        if (!remoteStreams.current[targetUserId]) {
          remoteStreams.current[targetUserId] = new MediaStream()
        }
        remoteStream = remoteStreams.current[targetUserId]
        if (!remoteStream.getTracks().find(t => t.id === track.id)) {
          remoteStream.addTrack(track)
        }
      } else {
        remoteStreams.current[targetUserId] = remoteStream
      }
      
      if (track.kind === 'audio') {
        attachRemoteAudioTrack(targetUserId, track)
      }
      
      if (track.kind === 'video') {
        setParticipants(prev => prev.map(p =>
          p.id === targetUserId ? { ...p, hasVideo: true, videoStream: remoteStream } : p
        ))

        const clearVideo = () => {
          const stream = remoteStreams.current[targetUserId]
          if (stream) {
            stream.getVideoTracks().forEach(t => {
              try { stream.removeTrack(t) } catch {}
            })
            if (stream.getTracks().length === 0) {
              delete remoteStreams.current[targetUserId]
            }
          }
          setParticipants(prev => prev.map(p =>
            p.id === targetUserId ? { ...p, hasVideo: false, videoStream: null, isScreenSharing: false } : p
          ))
        }
        track.onended = clearVideo
        track.onmute = clearVideo
      }
    }
    
    // Add local tracks
    const addTracks = () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          const senders = pc.getSenders()
          if (!senders.find(s => s.track === track)) {
            pc.addTrack(track, localStreamRef.current)
          }
        })
      }
      if (localVideoStreamRef.current) {
        localVideoStreamRef.current.getVideoTracks().forEach(track => {
          const senders = pc.getSenders()
          if (!senders.find(s => s.track === track)) {
            pc.addTrack(track, localVideoStreamRef.current)
          }
        })
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getVideoTracks().forEach(track => {
          const senders = pc.getSenders()
          if (!senders.find(s => s.track === track)) {
            pc.addTrack(track, screenStreamRef.current)
          }
        })
      }
    }
    
    addTracks()
    return pc
  }, [socket, user?.id, isPolite, applyReceiverLatencyHints, attachRemoteAudioTrack, cleanupPeer, releaseNegotiationSlot])
  
  const initiateCall = useCallback((targetUserId) => {
    if (!targetUserId || targetUserId === user?.id) return
    const existing = peerConnections.current[targetUserId]
    if (existing) {
      const state = existing.connectionState
      if (state === 'connected' || state === 'connecting' || state === 'completed') return
      if (makingOfferRef.current[targetUserId]) return
    }
    createPeerConnection(targetUserId)
  }, [createPeerConnection, user?.id])
  
  const queueConnection = useCallback((targetUserId) => {
    if (!targetUserId || targetUserId === user?.id) return
    if (!canAcceptPeer(targetUserId)) return
    if (!hasJoinedRef.current || !channelIdRef.current) return
    
    const tier = getTierConfig()
    const lastAttempt = connectionCooldownsRef.current.get(targetUserId)
    if (lastAttempt && Date.now() - lastAttempt < tier.cooldown) return
    
    if (connectionQueueRef.current.includes(targetUserId)) return
    
    const existing = peerConnections.current[targetUserId]
    if (existing) {
      const state = existing.connectionState
      if (state === 'connected' || state === 'connecting' || state === 'completed') return
    }
    
    connectionQueueRef.current.push(targetUserId)
    processConnectionQueue()
  }, [user?.id, canAcceptPeer, getTierConfig])
  
  const processConnectionQueue = useCallback(async () => {
    if (isProcessingQueueRef.current) return
    isProcessingQueueRef.current = true
    
    const tier = getTierConfig()
    const maxConcurrent = tier.concurrent
    const generation = connectionGenerationRef.current
    
    try {
      while (connectionQueueRef.current.length > 0) {
        if (generation !== connectionGenerationRef.current || !hasJoinedRef.current || !channelIdRef.current) {
          connectionQueueRef.current = []
          break
        }
        if (activeNegotiationsRef.current >= maxConcurrent) {
          // Wait before checking again
          await new Promise(resolve => setTimeout(resolve, tier.staggerBase))
          continue
        }
        
        const targetUserId = connectionQueueRef.current.shift()
        if (!targetUserId) continue
        
        // Check if already connected
        const existing = peerConnections.current[targetUserId]
        if (existing && (existing.connectionState === 'connected' || existing.connectionState === 'connecting' || existing.connectionState === 'completed')) {
          continue
        }
        
        startNegotiationSlot(targetUserId)
        connectionCooldownsRef.current.set(targetUserId, Date.now())
        
        initiateCall(targetUserId)
        
        // Stagger between connections
        await new Promise(resolve => setTimeout(resolve, tier.staggerPerPeer))
      }
    } finally {
      isProcessingQueueRef.current = false
    }
  }, [getTierConfig, initiateCall, startNegotiationSlot])
  
  // Join voice channel
  const joinChannel = useCallback(async (channelData) => {
    if (!socket || !channelData) return
    if (hasJoinedRef.current && channelIdRef.current === channelData.id) return
    
    // Clean up previous connection if any
    if (hasJoinedRef.current && channelIdRef.current !== channelData.id) {
      clearConnectionTracking()
      // Different channel - full cleanup
      Object.keys(peerConnections.current).forEach(cleanupPeer)
      peerConnections.current = {}
      Object.values(audioElements.current).forEach(el => {
        try {
          voiceAudio.forget(el)
          el.pause()
          el.srcObject = null
          el.parentNode?.removeChild(el)
        } catch {}
      })
      audioElements.current = {}
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop())
        localStreamRef.current = null
      }
      if (analyserRef.current?.audioContext) {
        analyserRef.current.audioContext.close().catch(() => {})
      }
      analyserRef.current = null
      setLocalStream(null)
      setLocalVideoStream(null)
      setScreenStream(null)
      setParticipants([])
      setPeerStates({})
    }
    
    setChannel(channelData)
    setConnectionState('connecting')
    setIsConnected(false)
    
    const settings = settingsService.getSettings()
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: settings.echoCancellation ?? true,
          noiseSuppression: settings.noiseSuppression ?? true,
          autoGainControl: settings.autoGainControl ?? true
        }
      })
      
      setLocalStream(stream)
      localStreamRef.current = stream
      
      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      const analyser = audioContext.createAnalyser()
      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)
      analyserRef.current = { audioContext, analyser }
      
      hasJoinedRef.current = true
      hasLeftRef.current = false
      
      socket.emit('voice:join', {
        channelId: channelData.id,
        peerId: user.id
      })
      
      // Install audio unlock for Chrome autoplay
      installAudioUnlock()
    } catch (err) {
      console.error('[Voice] Failed to get microphone:', err)
      setConnectionState('error')
      soundService.error()
    }
  }, [socket, user?.id])
  
  // Leave voice channel
  const leaveChannel = useCallback(() => {
    if (!hasJoinedRef.current) return
    clearConnectionTracking()
    
    Object.keys(peerConnections.current).forEach(cleanupPeer)
    peerConnections.current = {}
    
    Object.values(audioElements.current).forEach(el => {
      try {
        voiceAudio.forget(el)
        el.pause()
        el.srcObject = null
        el.parentNode?.removeChild(el)
      } catch {}
    })
    audioElements.current = {}
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop())
      localStreamRef.current = null
    }
    
    if (localVideoStreamRef.current) {
      localVideoStreamRef.current.getTracks().forEach(t => t.stop())
      localVideoStreamRef.current = null
    }
    
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop())
      screenStreamRef.current = null
    }
    
    if (analyserRef.current?.audioContext) {
      analyserRef.current.audioContext.close().catch(() => {})
    }
    analyserRef.current = null
    
    if (socket?.connected && channelIdRef.current) {
      socket.emit('voice:leave', channelIdRef.current)
    }
    
    hasJoinedRef.current = false
    hasLeftRef.current = true
    
    setChannel(null)
    setIsConnected(false)
    setConnectionState('disconnected')
    setLocalStream(null)
    setLocalVideoStream(null)
    setScreenStream(null)
    setParticipants([])
    setPeerStates({})
    setIsMuted(false)
    setIsDeafened(false)
    setIsVideoOn(false)
    setIsScreenSharing(false)
    
    soundService.callLeft()
  }, [clearConnectionTracking, cleanupPeer, socket])
  
  // Toggle mute
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const newMuted = !isMuted
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !newMuted
      })
      setIsMuted(newMuted)
      socket?.emit('voice:mute', { channelId: channelIdRef.current, muted: newMuted })
    }
  }, [isMuted, socket])
  
  // Toggle deafen
  const toggleDeafen = useCallback(() => {
    const newDeafened = !isDeafened
    setIsDeafened(newDeafened)
    
    Object.entries(audioElements.current).forEach(([key, el]) => {
      if (key.includes('__webaudio')) return
      if (el instanceof HTMLMediaElement) el.muted = newDeafened
    })
    
    if (newDeafened && !isMuted) {
      setIsMuted(true)
      localStreamRef.current?.getAudioTracks().forEach(t => t.enabled = false)
    }
    
    socket?.emit('voice:deafen', { channelId: channelIdRef.current, deafened: newDeafened })
  }, [isDeafened, isMuted, socket])
  
  // Toggle video
  const toggleVideo = useCallback(async () => {
    if (isVideoOn) {
      localVideoStreamRef.current?.getTracks().forEach(t => t.stop())
      setLocalVideoStream(null)
      setIsVideoOn(false)
      socket?.emit('voice:video', { channelId: channelIdRef.current, enabled: false })
    } else {
      try {
        // Force higher capture resolution - Chrome defaults to 640x360 otherwise
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 30, max: 60 }
          }
        })
        setLocalVideoStream(stream)
        setIsVideoOn(true)
        socket?.emit('voice:video', { channelId: channelIdRef.current, enabled: true })
      } catch (err) {
        console.error('[Video] Failed to get camera:', err)
      }
    }
  }, [isVideoOn, socket])
  
  // Toggle screen share
  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      screenStreamRef.current?.getTracks().forEach(t => t.stop())
      setScreenStream(null)
      setIsScreenSharing(false)
      socket?.emit('voice:screen-share', { channelId: channelIdRef.current, enabled: false })
    } else {
      // Show screen picker in desktop mode
      if (window.__IS_DESKTOP_APP__) {
        setShowScreenPicker(true)
        return
      }
      
      // Web fallback
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ 
          video: { 
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 }
          }, 
          audio: true,
          // @ts-ignore - exclude current tab
          selfBrowserSurface: 'exclude',
          // @ts-ignore - exclude current app
          systemAudio: 'include'
        })
        
        setScreenStream(stream)
        setIsScreenSharing(true)
        socket?.emit('voice:screen-share', { channelId: channelIdRef.current, enabled: true })
        
        stream.getVideoTracks()[0].onended = () => {
          setScreenStream(null)
          setIsScreenSharing(false)
        }
      } catch (err) {
        if (err.name !== 'NotAllowedError') {
          console.error('[Screen] Failed to share screen:', err)
        }
      }
    }
  }, [isScreenSharing, socket])

  // Start screen share with selected source from picker (desktop only)
  const startScreenShareWithSource = useCallback(async ({ sourceId, includeAudio, isNative, stream: nativeStream }) => {
    try {
      let stream
      if (isNative && nativeStream) {
        // Wayland native picker returns stream directly
        stream = nativeStream
      } else if (sourceId) {
        // Use getDisplayMedia with specific source constraint
        // @ts-ignore - Electron-specific constraint
        stream = await navigator.mediaDevices.getDisplayMedia({
          audio: includeAudio ? {
            // @ts-ignore - Electron-specific
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
          },
          // @ts-ignore - exclude current tab/app
          selfBrowserSurface: 'exclude',
          // @ts-ignore
          systemAudio: includeAudio ? 'include' : 'exclude'
        })
      } else {
        // Fallback to native picker
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 }
          },
          audio: includeAudio,
          // @ts-ignore
          selfBrowserSurface: 'exclude',
          // @ts-ignore
          systemAudio: includeAudio ? 'include' : 'exclude'
        })
      }
      
      setScreenStream(stream)
      setIsScreenSharing(true)
      socket?.emit('voice:screen-share', { channelId: channelIdRef.current, enabled: true })
      
      stream.getVideoTracks()[0].onended = () => {
        setScreenStream(null)
        setIsScreenSharing(false)
      }
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        console.error('[Screen] Failed to share screen:', err)
      }
    }
  }, [socket])
   
  // Socket event handlers
  useEffect(() => {
    if (!socket || !connected) return

    const currentGeneration = connectionGenerationRef.current

    const drainPendingCandidates = async (peerId, pc) => {
      const pending = (pendingCandidatesRef.current[peerId] || []).filter((entry) => (
        entry?.candidate &&
        entry.generation === connectionGenerationRef.current &&
        Date.now() - entry.timestamp < PENDING_CANDIDATE_MAX_AGE_MS
      ))
      pendingCandidatesRef.current[peerId] = []
      for (const entry of pending) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(entry.candidate))
        } catch {}
      }
    }

    const handleSocketConnect = () => {
      // Re-join voice if we were in a channel when socket disconnected
      if (hasJoinedRef.current && channelIdRef.current) {
        console.log('[Voice] Socket reconnected, re-joining voice channel')
        clearConnectionTracking()
        // Clean up all existing peer connections to avoid stale state on reconnection
        Object.keys(peerConnections.current).forEach(cleanupPeer)
        peerConnections.current = {}
        setConnectionState('connecting')
        setIsConnected(false)
        setTimeout(() => {
          if (hasJoinedRef.current && channelIdRef.current) {
            socket.emit('voice:join', {
              channelId: channelIdRef.current,
              peerId: user?.id
            })
          }
        }, 1500)
      }
    }
    
    const handleParticipants = (data) => {
      if (data.channelId !== channelIdRef.current) return
      if (currentGeneration !== connectionGenerationRef.current) return
      if (data.iceServers?.length) serverIceServersRef.current = data.iceServers
      
      const peerIds = (data.participants || []).filter(p => p.id !== user.id).map(p => p.id)
      peerIds.forEach(clearPendingLeaveTimer)
      setParticipants((data.participants || []).map((participant) => ({
        ...participant,
        isReconnecting: false
      })))
      setConnectionState('connected')
      setIsConnected(true)
      
      // Requeue missing peers with a wider spread during larger joins.
      peerIds.forEach((peerId, index) => {
        // Skip if already connected
        const existing = peerConnections.current[peerId]
        if (existing && (existing.connectionState === 'connected' || existing.connectionState === 'completed')) {
          return
        }
        setTimeout(() => queueConnection(peerId), index * 140 + Math.random() * 260)
      })
    }
    
    const handleUserJoined = (userInfo) => {
      clearPendingLeaveTimer(userInfo.id)
      setParticipants(prev => {
        if (prev.find(p => p.id === userInfo.id)) return prev
        return [...prev, { ...userInfo, isReconnecting: false }]
      })
      if (userInfo.id !== user.id) {
        // Skip if already connected
        const existing = peerConnections.current[userInfo.id]
        if (existing && (existing.connectionState === 'connected' || existing.connectionState === 'completed')) {
          return
        }
        setTimeout(() => queueConnection(userInfo.id), 500 + Math.random() * 300)
      }
    }
    
    const handleUserLeft = (data) => {
      const userId = data?.userId || data?.id
      if (!userId) return
      clearPendingLeaveTimer(userId)
      setParticipants((prev) => prev.map((participant) => (
        participant.id === userId
          ? { ...participant, isReconnecting: true }
          : participant
      )))

      leaveGraceTimersRef.current[userId] = setTimeout(() => {
        setParticipants((prev) => prev.filter((participant) => participant.id !== userId))
        cleanupPeer(userId)
      }, PEER_LEAVE_GRACE_MS)
    }
    
    const handleOffer = async (data) => {
      const { from, offer, channelId } = data
      if (channelId && channelId !== channelIdRef.current) return
      if (!hasJoinedRef.current) return
      
      const pc = createPeerConnection(from)
      const offerCollision = makingOfferRef.current[from] || pc.signalingState !== 'stable'
      const polite = isPolite(from)

      ignoreOfferRef.current[from] = !polite && offerCollision
      if (ignoreOfferRef.current[from]) {
        return
      }

      if (offerCollision && polite) {
        try {
          await pc.setLocalDescription({ type: 'rollback' })
        } catch {}
        makingOfferRef.current[from] = false
      }
      
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer))
        remoteDescSetRef.current[from] = true
        await drainPendingCandidates(from, pc)
        
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        
        socket.emit('voice:answer', {
          to: from,
          answer: pc.localDescription,
          channelId: channelIdRef.current
        })
      } catch (err) {
        console.error('[WebRTC] Failed to handle offer:', err.message)
      }
    }
    
    const handleAnswer = async (data) => {
      const { from, answer, channelId } = data
      if (channelId && channelId !== channelIdRef.current) return
      const pc = peerConnections.current[from]
      if (!pc || pc.signalingState === 'stable') return
      
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer))
        remoteDescSetRef.current[from] = true
        ignoreOfferRef.current[from] = false
        await drainPendingCandidates(from, pc)
      } catch (err) {
        console.error('[WebRTC] Failed to set answer:', err.message)
      }
    }
    
    const handleIceCandidate = async (data) => {
      const { from, candidate, channelId } = data
      if (channelId && channelId !== channelIdRef.current) return
      
      const pc = peerConnections.current[from]
      if (!pc || !remoteDescSetRef.current[from]) {
        if (!pendingCandidatesRef.current[from]) pendingCandidatesRef.current[from] = []
        pendingCandidatesRef.current[from].push({
          candidate,
          generation: connectionGenerationRef.current,
          timestamp: Date.now()
        })
        return
      }
      
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (err) {
        console.error('[WebRTC] Failed to add ICE candidate:', err.message)
      }
    }
    
    // Handle force-reconnect from server (consensus-based reconnection)
    const handleForceReconnect = async (data) => {
      const { channelId, reason, targetPeer } = data
      console.log('[WebRTC] Force reconnect received:', reason, 'for peer:', targetPeer)
      
      if (channelId !== channelIdRef.current) return
      
      // If we're the target peer, reconnect to everyone
      if (targetPeer === user?.id) {
        console.log('[WebRTC] We are the target peer, reconnecting to all peers')
        // Close all connections and re-establish
        clearConnectionTracking()
        Object.keys(peerConnections.current).forEach(cleanupPeer)
        // Re-join to get fresh participant list
        if (hasJoinedRef.current && channelIdRef.current) {
          setTimeout(() => {
            socket.emit('voice:join', {
              channelId: channelIdRef.current,
              peerId: user.id
            })
          }, 1000)
        }
      } else {
        // Reconnect to just the target peer
        console.log('[WebRTC] Closing connection to', targetPeer, 'for reconnection')
        cleanupPeer(targetPeer)
        setTimeout(() => {
          if (hasJoinedRef.current && channelIdRef.current) {
            queueConnection(targetPeer)
          }
        }, 1500)
      }
    }
    
    // Handle user reconnection notification
    const handleUserReconnected = (data) => {
      const { id: userId, isReconnection } = data
      console.log('[WebRTC] User reconnected:', userId)
      clearPendingLeaveTimer(userId)
      setParticipants((prev) => prev.map((participant) => (
        participant.id === userId
          ? { ...participant, isReconnecting: false }
          : participant
      )))
      
      // Reset connection state for this peer and re-establish
      if (peerConnections.current[userId]) {
        const pc = peerConnections.current[userId]
        const state = pc.connectionState
        
        if (state !== 'connected' && state !== 'connecting') {
          console.log('[WebRTC] Re-establishing connection to reconnected peer:', userId)
          cleanupPeer(userId)
          
          setTimeout(() => {
            if (hasJoinedRef.current && channelIdRef.current) {
              queueConnection(userId)
            }
          }, 500)
        }
      } else if (isReconnection) {
        queueConnection(userId)
      }
    }

    socket.on('connect', handleSocketConnect)
    socket.on('voice:participants', handleParticipants)
    socket.on('voice:user-joined', handleUserJoined)
    socket.on('voice:user-left', handleUserLeft)
    socket.on('voice:offer', handleOffer)
    socket.on('voice:answer', handleAnswer)
    socket.on('voice:ice-candidate', handleIceCandidate)
    socket.on('voice:force-reconnect', handleForceReconnect)
    socket.on('voice:user-reconnected', handleUserReconnected)
    
    return () => {
      socket.off('connect', handleSocketConnect)
      socket.off('voice:participants', handleParticipants)
      socket.off('voice:user-joined', handleUserJoined)
      socket.off('voice:user-left', handleUserLeft)
      socket.off('voice:offer', handleOffer)
      socket.off('voice:answer', handleAnswer)
      socket.off('voice:ice-candidate', handleIceCandidate)
      socket.off('voice:force-reconnect', handleForceReconnect)
      socket.off('voice:user-reconnected', handleUserReconnected)
    }
  }, [socket, connected, user?.id, clearConnectionTracking, clearPendingLeaveTimer, cleanupPeer, createPeerConnection, isPolite, queueConnection])
  
  // Heartbeat
  useEffect(() => {
    if (!socket) return
    const interval = setInterval(() => {
      if (socket.connected && hasJoinedRef.current && channelIdRef.current) {
        socket.emit('voice:heartbeat', { channelId: channelIdRef.current })
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [socket])

  // Clean up VC ghost on page refresh/close.
  // When the page unloads while in a voice channel the socket disconnects
  // abruptly, leaving a ghost participant on the server.  We use the
  // synchronous sendBeacon API (or a synchronous XHR fallback) to fire a
  // leave event before the page dies.
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!hasJoinedRef.current || !channelIdRef.current) return

      // Try socket emit first (may work if socket is still alive)
      try {
        if (socket?.connected) {
          socket.emit('voice:leave', channelIdRef.current)
        }
      } catch {}

      // Also fire a beacon so the server can clean up even if the socket
      // closes before the emit is flushed.
      try {
        const server = typeof getStoredServer === 'function' ? getStoredServer() : null
        const apiBase = server?.apiUrl || 'https://volt.voltagechat.app'
        const payload = JSON.stringify({ channelId: channelIdRef.current })
        navigator.sendBeacon?.(`${apiBase}/api/voice/leave`, new Blob([payload], { type: 'application/json' }))
      } catch {}
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [socket])
  
  // Connection watchdog - periodically checks peer connections and restarts ICE for stuck ones
  useEffect(() => {
    const watchdog = setInterval(() => {
      if (!hasJoinedRef.current || !channelIdRef.current) return
      
      Object.entries(peerConnections.current).forEach(([peerId, pc]) => {
        if (!pc) return
        const iceState = pc.iceConnectionState
        const connState = pc.connectionState
        
        if (connState === 'failed') {
          console.log('[Voice Watchdog] Peer', peerId, 'is failed, attempting recovery')
          // Already handled by onconnectionstatechange
        } else if (iceState === 'disconnected') {
          console.log('[Voice Watchdog] Peer', peerId, 'ICE disconnected, restarting')
          try { pc.restartIce() } catch {}
        }
      })
    }, 15000) // Every 15 seconds
    
    return () => clearInterval(watchdog)
  }, [])
  
  const value = {
    // State
    isConnected,
    connectionState,
    channel,
    participants,
    localStream,
    localVideoStream,
    screenStream,
    isMuted,
    isDeafened,
    isVideoOn,
    isScreenSharing,
    showScreenPicker,
    peerStates,
    
    // Actions
    joinChannel,
    leaveChannel,
    toggleMute,
    toggleDeafen,
    toggleVideo,
    toggleScreenShare,
    startScreenShareWithSource,
    setShowScreenPicker,
    
    // Refs for UI binding
    peerConnections,
    remoteStreams,
    audioElements,
    analyserRef,
  }
  
  return (
    <VoiceContext.Provider value={value}>
      {children}
    </VoiceContext.Provider>
  )
}

export const useVoice = () => {
  const context = useContext(VoiceContext)
  if (!context) {
    throw new Error('useVoice must be used within a VoiceProvider')
  }
  return context
}

export default VoiceContext
