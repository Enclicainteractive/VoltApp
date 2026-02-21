import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { useSocket } from './SocketContext'
import { useAuth } from './AuthContext'
import { settingsService } from '../services/settingsService'
import { soundService } from '../services/soundService'

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
  
  // Keep refs updated
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
        const pcAtCheck = pc
        setTimeout(() => {
          if (pcAtCheck.iceConnectionState === 'disconnected' || pcAtCheck.iceConnectionState === 'failed') {
            pcAtCheck.restartIce()
          }
        }, 4000)
      }
    }
    
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState
      setPeerStates(prev => ({ ...prev, [targetUserId]: s }))
      reportPeerState(targetUserId, s)
      
      if (s === 'connected') {
        applyReceiverLatencyHints(pc, targetUserId)
        const receivers = pc.getReceivers()
        
        // Handle audio receiver
        const audioReceiver = receivers.find(r => r.track?.kind === 'audio')
        if (audioReceiver) {
          const track = audioReceiver.track
          let stream = remoteStreams.current[targetUserId]
          if (!stream) {
            stream = new MediaStream([track])
            remoteStreams.current[targetUserId] = stream
          } else if (!stream.getTracks().find(t => t.id === track.id)) {
            stream.addTrack(track)
          }
          
          let audio = audioElements.current[targetUserId]
          if (!audio) {
            audio = document.createElement('audio')
            audio.autoplay = true
            audio.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none;opacity:0'
            document.body.appendChild(audio)
            audioElements.current[targetUserId] = audio
          }
          
          const settings = settingsService.getSettings()
          audio.srcObject = stream
          audio.volume = Math.max(0, Math.min(1, (settings.volume ?? 100) / 100))
          audio.muted = false
          
          const tryPlay = () => {
            audio.play().catch(() => {
              const retry = () => {
                audio.play().catch(() => {})
                document.removeEventListener('pointerdown', retry, true)
                document.removeEventListener('keydown', retry, true)
              }
              document.addEventListener('pointerdown', retry, true)
              document.addEventListener('keydown', retry, true)
            })
          }
          
          track.onunmute = () => tryPlay()
          if (!track.muted) tryPlay()
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
        try { pc.close() } catch {}
        delete peerConnections.current[targetUserId]
        makingOfferRef.current[targetUserId] = false
        setTimeout(() => {
          if (hasJoinedRef.current && channelIdRef.current) {
            initiateCall(targetUserId)
          }
        }, 2000)
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
        const settings = settingsService.getSettings()
        let audio = audioElements.current[targetUserId]
        if (!audio) {
          audio = document.createElement('audio')
          audio.autoplay = true
          audio.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none;opacity:0'
          document.body.appendChild(audio)
          audioElements.current[targetUserId] = audio
        }
        
        audio.srcObject = remoteStream
        audio.volume = Math.max(0, Math.min(1, (settings.volume ?? 100) / 100))
        audio.muted = false
        
        const tryPlay = () => audio.play().catch(() => {})
        track.onunmute = () => tryPlay()
        if (!track.muted) tryPlay()
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
  }, [socket, user?.id, isPolite, applyReceiverLatencyHints])
  
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
    
    while (connectionQueueRef.current.length > 0 && activeNegotiationsRef.current < maxConcurrent) {
      const targetUserId = connectionQueueRef.current.shift()
      activeNegotiationsRef.current++
      connectionCooldownsRef.current.set(targetUserId, Date.now())
      
      initiateCall(targetUserId)
      
      setTimeout(() => {
        activeNegotiationsRef.current = Math.max(0, activeNegotiationsRef.current - 1)
        processConnectionQueue()
      }, 4000)
    }
    
    isProcessingQueueRef.current = false
    
    if (connectionQueueRef.current.length > 0) {
      setTimeout(() => processConnectionQueue(), tier.staggerBase)
    }
  }, [initiateCall, getTierConfig])
  
  // Join voice channel
  const joinChannel = useCallback(async (channelData) => {
    if (!socket || !channelData) return
    if (hasJoinedRef.current && channelIdRef.current === channelData.id) return
    
    // Clean up previous connection if any
    if (hasJoinedRef.current && channelIdRef.current !== channelData.id) {
      // Different channel - full cleanup
      Object.values(peerConnections.current).forEach(pc => { try { pc.close() } catch {} })
      peerConnections.current = {}
      Object.values(audioElements.current).forEach(el => {
        try { el.pause(); el.srcObject = null; el.parentNode?.removeChild(el) } catch {}
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
      
      setConnectionState('connected')
      setIsConnected(true)
      // soundService.callJoin() - removed, callConnected handles the join sound
    } catch (err) {
      console.error('[Voice] Failed to get microphone:', err)
      setConnectionState('error')
      soundService.error()
    }
  }, [socket, user?.id])
  
  // Leave voice channel
  const leaveChannel = useCallback(() => {
    if (!hasJoinedRef.current) return
    
    Object.values(peerConnections.current).forEach(pc => { try { pc.close() } catch {} })
    peerConnections.current = {}
    
    Object.values(audioElements.current).forEach(el => {
      try { el.pause(); el.srcObject = null; el.parentNode?.removeChild(el) } catch {}
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
  }, [socket])
  
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
    
    Object.values(audioElements.current).forEach(([key, el]) => {
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
        const stream = await navigator.mediaDevices.getUserMedia({ video: true })
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
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30 } }, audio: false })
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
  
  // Socket event handlers
  useEffect(() => {
    if (!socket || !connected) return
    
    // FIX: Simplified connection handling - no aggressive retries
    socket.on('voice:participants', (data) => {
      if (data.channelId !== channelIdRef.current) return
      if (data.iceServers?.length) serverIceServersRef.current = data.iceServers
      
      const peerIds = (data.participants || []).filter(p => p.id !== user.id).map(p => p.id)
      setParticipants(data.participants || [])
      
      // Simple staggered connections without retries
      peerIds.forEach((peerId, index) => {
        // Skip if already connected
        const existing = peerConnections.current[peerId]
        if (existing && (existing.connectionState === 'connected' || existing.connectionState === 'completed')) {
          return
        }
        setTimeout(() => queueConnection(peerId), index * 100 + Math.random() * 200)
      })
    })
    
    socket.on('voice:user-joined', (userInfo) => {
      setParticipants(prev => {
        if (prev.find(p => p.id === userInfo.id)) return prev
        return [...prev, userInfo]
      })
      if (userInfo.id !== user.id) {
        // Skip if already connected
        const existing = peerConnections.current[userInfo.id]
        if (existing && (existing.connectionState === 'connected' || existing.connectionState === 'completed')) {
          return
        }
        setTimeout(() => queueConnection(userInfo.id), 500 + Math.random() * 300)
      }
    })
    
    socket.on('voice:user-left', (data) => {
      const userId = data?.userId || data?.id
      if (!userId) return
      setParticipants(prev => prev.filter(p => p.id !== userId))
      setPeerStates(prev => { const n = { ...prev }; delete n[userId]; return n })
      
      if (peerConnections.current[userId]) {
        try { peerConnections.current[userId].close() } catch {}
        delete peerConnections.current[userId]
      }
      if (audioElements.current[userId]) {
        audioElements.current[userId].pause()
        audioElements.current[userId].srcObject = null
        audioElements.current[userId].parentNode?.removeChild(audioElements.current[userId])
        delete audioElements.current[userId]
      }
    })
    
    // FIX: Always process all offers - don't ignore
    socket.on('voice:offer', async (data) => {
      const { from, offer, channelId } = data
      if (channelId && channelId !== channelIdRef.current) return
      
      const pc = createPeerConnection(from)
      const offerCollision = makingOfferRef.current[from] || pc.signalingState !== 'stable'
      const polite = isPolite(from)
      
      // FIX: Never ignore offers - always respond to ensure connectivity
      if (offerCollision) {
        try {
          await pc.setLocalDescription({ type: 'rollback' })
        } catch {}
        makingOfferRef.current[from] = false
      }
      
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer))
        remoteDescSetRef.current[from] = true
        
        const pending = pendingCandidatesRef.current[from] || []
        pendingCandidatesRef.current[from] = []
        for (const c of pending) {
          try { await pc.addIceCandidate(new RTCIceCandidate(c)) } catch {}
        }
        
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
    })
    
    socket.on('voice:answer', async (data) => {
      const { from, answer, channelId } = data
      if (channelId && channelId !== channelIdRef.current) return
      const pc = peerConnections.current[from]
      if (!pc || pc.signalingState === 'stable') return
      
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer))
        remoteDescSetRef.current[from] = true
        ignoreOfferRef.current[from] = false
        
        const pending = pendingCandidatesRef.current[from] || []
        pendingCandidatesRef.current[from] = []
        for (const c of pending) {
          try { await pc.addIceCandidate(new RTCIceCandidate(c)) } catch {}
        }
      } catch (err) {
        console.error('[WebRTC] Failed to set answer:', err.message)
      }
    })
    
    socket.on('voice:ice-candidate', async (data) => {
      const { from, candidate, channelId } = data
      if (channelId && channelId !== channelIdRef.current) return
      
      const pc = peerConnections.current[from]
      if (!pc || !remoteDescSetRef.current[from]) {
        if (!pendingCandidatesRef.current[from]) pendingCandidatesRef.current[from] = []
        pendingCandidatesRef.current[from].push(candidate)
        return
      }
      
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (err) {
        console.error('[WebRTC] Failed to add ICE candidate:', err.message)
      }
    })
    
    // Handle force-reconnect from server (consensus-based reconnection)
    socket.on('voice:force-reconnect', async (data) => {
      const { channelId, reason, targetPeer } = data
      console.log('[WebRTC] Force reconnect received:', reason, 'for peer:', targetPeer)
      
      if (channelId !== channelIdRef.current) return
      
      // If we're the target peer, reconnect to everyone
      if (targetPeer === user?.id) {
        console.log('[WebRTC] We are the target peer, reconnecting to all peers')
        // Close all connections and re-establish
        for (const [peerId, pc] of Object.entries(peerConnections.current)) {
          try { pc.close() } catch {}
          delete peerConnections.current[peerId]
        }
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
        const pc = peerConnections.current[targetPeer]
        if (pc) {
          console.log('[WebRTC] Closing connection to', targetPeer, 'for reconnection')
          try { pc.close() } catch {}
          delete peerConnections.current[targetPeer]
          
          // Re-initiate connection after brief delay
          setTimeout(() => {
            if (hasJoinedRef.current && channelIdRef.current) {
              queueConnection(targetPeer)
            }
          }, 1500)
        }
      }
    })
    
    // Handle user reconnection notification
    socket.on('voice:user-reconnected', (data) => {
      const { id: userId, isReconnection } = data
      console.log('[WebRTC] User reconnected:', userId)
      
      // Reset connection state for this peer and re-establish
      if (peerConnections.current[userId]) {
        const pc = peerConnections.current[userId]
        const state = pc.connectionState
        
        if (state !== 'connected' && state !== 'connecting') {
          console.log('[WebRTC] Re-establishing connection to reconnected peer:', userId)
          try { pc.close() } catch {}
          delete peerConnections.current[userId]
          
          setTimeout(() => {
            if (hasJoinedRef.current && channelIdRef.current) {
              queueConnection(userId)
            }
          }, 500)
        }
      }
    })
    
    return () => {
      socket.off('voice:participants')
      socket.off('voice:user-joined')
      socket.off('voice:user-left')
      socket.off('voice:offer')
      socket.off('voice:answer')
      socket.off('voice:ice-candidate')
      socket.off('voice:force-reconnect')
      socket.off('voice:user-reconnected')
    }
  }, [socket, connected, user?.id, createPeerConnection, isPolite, queueConnection])
  
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
    peerStates,
    
    // Actions
    joinChannel,
    leaveChannel,
    toggleMute,
    toggleDeafen,
    toggleVideo,
    toggleScreenShare,
    
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
