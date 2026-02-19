import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Mic, MicOff, Headphones, VolumeX, PhoneOff, Settings, Volume2, Video, VideoOff, Monitor, MonitorOff, Ghost } from 'lucide-react'
import { useSocket } from '../contexts/SocketContext'
import { useAuth } from '../contexts/AuthContext'
import { settingsService } from '../services/settingsService'
import { soundService } from '../services/soundService'
import Avatar from './Avatar'
import '../assets/styles/VoiceChannel.css'

// Default ICE servers — supplemented at runtime with the list from the server
const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  { urls: 'stun:stun.stunprotocol.org:3478' },
]

const buildPeerConfig = (serverIceServers = []) => ({
  iceServers: [...DEFAULT_ICE_SERVERS, ...serverIceServers],
  bundlePolicy: 'max-bundle',   // all m-lines in one bundle — fixes m-line order errors
  rtcpMuxPolicy: 'require',
  iceCandidatePoolSize: 10,
})

const VoiceChannel = ({ channel, joinKey, onLeave, isMuted: externalMuted, isDeafened: externalDeafened, onMuteChange, onDeafenChange, onOpenSettings, onParticipantsChange, onShowConnectionInfo }) => {
  const { socket, connected } = useSocket()
  const { user } = useAuth()
  const [participants, setParticipants] = useState([])
  const [localIsMuted, setLocalIsMuted] = useState(false)
  const [localIsDeafened, setLocalIsDeafened] = useState(false)
  const [isVideoOn, setIsVideoOn] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [localStream, setLocalStream] = useState(null)
  const [localVideoStream, setLocalVideoStream] = useState(null)
  const [screenStream, setScreenStream] = useState(null)
  const [connectionState, setConnectionState] = useState('connecting')
  const [speaking, setSpeaking] = useState({})
  // Per-peer WebRTC connection state: peerId -> 'connecting'|'connected'|'failed'|'disconnected'
  const [peerStates, setPeerStates] = useState({})
  // Local per-user overrides: { [userId]: { muted: bool, volume: 0-100 } }
  const [localUserSettings, setLocalUserSettings] = useState(() => {
    try { return JSON.parse(localStorage.getItem('voltchat_local_user_settings')) || {} } catch { return {} }
  })
  // Right-click context menu state
  const [participantMenu, setParticipantMenu] = useState(null) // { userId, username, x, y }
  
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

  // ICE server list received from the Voltage server on voice:participants
  const serverIceServersRef = useRef([])
  
  // Notify parent of participants changes (for sidebar display)
  useEffect(() => {
    onParticipantsChange?.(channel?.id, participants)
  }, [participants, channel?.id])

  // Apply local user setting (volume/mute) to a peer's audio element
  const applyLocalUserSetting = useCallback((userId, settings) => {
    const el = audioElements.current[userId]
    if (!el) return
    el.muted = settings.muted ?? false
    el.volume = Math.max(0, Math.min(1, (settings.volume ?? 100) / 100))
  }, [])

  const setLocalUserSetting = useCallback((userId, patch) => {
    setLocalUserSettings(prev => {
      const next = { ...prev, [userId]: { ...(prev[userId] || { muted: false, volume: 100 }), ...patch } }
      try { localStorage.setItem('voltchat_local_user_settings', JSON.stringify(next)) } catch {}
      applyLocalUserSetting(userId, next[userId])
      return next
    })
  }, [applyLocalUserSetting])

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

  // Multi-peer connection management for stability
  const connectionQueueRef = useRef([])      // Queue of peer IDs waiting to connect
  const isProcessingQueueRef = useRef(false) // Whether currently processing queue
  const activeNegotiationsRef = useRef(0)    // Current active negotiations
  const connectionCooldownsRef = useRef(new Map()) // peerId -> timestamp of last attempt
  const MAX_CONCURRENT_CONNECTIONS = 2
  const CONNECTION_COOLDOWN_MS = 1500

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

    pc.onicegatheringstatechange = () => {
      console.log(`[WebRTC] ICE gathering with ${targetUserId}:`, pc.iceGatheringState)
    }

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState
      console.log(`[WebRTC] Connection state with ${targetUserId}:`, s)

      // Mirror into React state so the UI reflects real peer status
      setPeerStates(prev => ({ ...prev, [targetUserId]: s }))

      if (s === 'connected') {
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
            console.log(`[WebRTC] Created audio element on connect for ${targetUserId}`)
          }

          const settings = settingsService.getSettings()
          audio.srcObject = stream
          audio.volume = Math.max(0, Math.min(1, (settings.volume ?? 100) / 100))
          audio.muted = false

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
          const audioEl = audioElements.current[targetUserId]
          if (audioEl && audioEl.paused) {
            audioEl.play().catch(() => {})
          }
        } else {
          console.warn(`[WebRTC] No audio receiver found for ${targetUserId} at connected state`)
        }
      }
      if (s === 'failed') {
        console.log(`[WebRTC] Connection failed with ${targetUserId} — attempting reconnect in 2s`)
        // Close and remove the stale PC, then reconnect after a brief pause
        try { pc.close() } catch {}
        delete peerConnections.current[targetUserId]
        makingOfferRef.current[targetUserId] = false
        setTimeout(() => {
          // Only reconnect if still in the channel and peer is still a participant
          if (hasJoinedRef.current && channelIdRef.current) {
            console.log(`[WebRTC] Reconnecting to ${targetUserId}`)
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

    // --- Perfect negotiation: onnegotiationneeded ---
    // Guard against re-entry: skip if offer already in flight or PC not stable
    pc.onnegotiationneeded = async () => {
      if (makingOfferRef.current[targetUserId]) {
        console.log(`[WebRTC] Skipping onnegotiationneeded for ${targetUserId} — offer in flight`)
        return
      }
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
        console.log(`[WebRTC] Sent offer to ${targetUserId}`)
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

        // Create or reuse a DOM-attached audio element.
        // DOM-attached elements satisfy autoplay policy and persist.
        let audio = audioElements.current[targetUserId]
        if (!audio) {
          audio = document.createElement('audio')
          audio.autoplay = true
          audio.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none;opacity:0'
          document.body.appendChild(audio)
          audioElements.current[targetUserId] = audio
          console.log(`[WebRTC] Created DOM audio element for ${targetUserId}`)
        }

        audio.srcObject = remoteStream
        audio.volume    = Math.max(0, Math.min(1, (settings.volume ?? 100) / 100))
        audio.muted     = false

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
      }

      if (track.kind === 'video') {
        setParticipants(prev => prev.map(p =>
          p.id === targetUserId ? { ...p, hasVideo: true, videoStream: remoteStream } : p
        ))
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
  }, [socket, user?.id, isPolite])

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

  // Process the connection queue with limited concurrency for stability
  const processConnectionQueue = useCallback(async () => {
    if (isProcessingQueueRef.current) return
    isProcessingQueueRef.current = true

    while (connectionQueueRef.current.length > 0 && activeNegotiationsRef.current < MAX_CONCURRENT_CONNECTIONS) {
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

      console.log(`[WebRTC] Processing connection to ${targetUserId} (${activeNegotiationsRef.current}/${MAX_CONCURRENT_CONNECTIONS} active negotiations)`)

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

      // Small delay between starting connections to prevent flooding
      if (connectionQueueRef.current.length > 0) {
        await new Promise(r => setTimeout(r, 300))
      }
    }

    isProcessingQueueRef.current = false

    // If queue still has items, schedule another processing round
    if (connectionQueueRef.current.length > 0) {
      setTimeout(() => processConnectionQueue(), 800)
    }
  }, [initiateCall])

  // Queue a connection to prevent overwhelming the system with simultaneous negotiations
  const queueConnection = useCallback((targetUserId) => {
    if (!targetUserId || targetUserId === user?.id) return

    // Check cooldown to prevent rapid reconnection attempts
    const lastAttempt = connectionCooldownsRef.current.get(targetUserId)
    if (lastAttempt && Date.now() - lastAttempt < CONNECTION_COOLDOWN_MS) {
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
  }, [user?.id, processConnectionQueue])

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
        
        if (audioContext.state === 'suspended') {
          audioContext.resume().catch(err => {
            console.log('[Voice] AudioContext resume failed:', err)
          })
        }

        // Mark as joined BEFORE emitting
        hasJoinedRef.current = true
        hasLeftRef.current = false
        
        // Play join sound for self (ascending arpeggio)
        soundService.callJoin()
        
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
      // Store ICE servers from server for subsequent peer connections
      if (data.iceServers?.length) serverIceServersRef.current = data.iceServers
      
      const peerIds = (data.participants || [])
        .filter(p => p.id !== user.id)
        .map(p => p.id)
      
      console.log(`[WebRTC] Received participants list: ${peerIds.length} peers —`, peerIds)
      setParticipants(data.participants || [])
      
      // Use longer staggered delays for multiple peers to prevent offer flooding
      // Base delay increases with peer count to spread out the load
      const baseDelay = peerIds.length > 3 ? 1000 : 600
      const staggerMs = peerIds.length > 3 ? 800 : 400
      
      peerIds.forEach((peerId, index) => {
        // Skip if already connected
        const existing = peerConnections.current[peerId]
        if (existing) {
          const s = existing.connectionState
          if (s === 'connected' || s === 'connecting' || s === 'completed') return
        }
        
        // Stagger connections with increasing delays
        const delay = baseDelay + (index * staggerMs) + (Math.random() * 300)
        console.log(`[WebRTC] Queuing connection to ${peerId} in ${Math.round(delay)}ms (position ${index + 1}/${peerIds.length})`)
        setTimeout(() => queueConnection(peerId), delay)
      })
    })

    socket.on('voice:user-joined', (userInfo) => {
      setParticipants(prev => {
        if (prev.find(p => p.id === userInfo.id)) return prev
        return [...prev, userInfo]
      })
      if (userInfo.id !== user.id) {
        soundService.userJoined()
        // Longer delay for new joiners to ensure their client is fully ready
        // This prevents the "glitching" when multiple people join simultaneously
        const peerCount = Object.keys(peerConnections.current).length
        const delay = 1000 + (peerCount * 250) + (Math.random() * 400)
        console.log(`[WebRTC] Scheduling connection to new peer ${userInfo.id} in ${Math.round(delay)}ms (we have ${peerCount} existing peers)`)
        setTimeout(() => queueConnection(userInfo.id), delay)
      }
    })

    // Perfect negotiation — handle incoming offers
    socket.on('voice:offer', async (data) => {
      const { from, offer, channelId } = data
      if (channelId && channelId !== channelIdRef.current) return
      console.log('[WebRTC] Received offer from:', from)

      const pc = createPeerConnection(from)
      const offerCollision = makingOfferRef.current[from] || pc.signalingState !== 'stable'
      const polite = isPolite(from)

      ignoreOfferRef.current[from] = !polite && offerCollision
      if (ignoreOfferRef.current[from]) {
        console.log('[WebRTC] Ignoring colliding offer from', from, '(impolite)')
        return
      }

      try {
        if (offerCollision && polite) {
          console.log('[WebRTC] Polite rollback for', from)
          await pc.setLocalDescription({ type: 'rollback' })
          makingOfferRef.current[from] = false
        }

        await pc.setRemoteDescription(new RTCSessionDescription(offer))
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
      } catch (err) {
        console.error('[WebRTC] Failed to handle offer from', from, ':', err.message)
      }
    })

    socket.on('voice:answer', async (data) => {
      const { from, answer, channelId } = data
      if (channelId && channelId !== channelIdRef.current) return
      const pc = peerConnections.current[from]
      if (!pc || pc.signalingState === 'stable') return
      if (ignoreOfferRef.current[from]) return

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer))
        remoteDescSetRef.current[from] = true
        // Clear ignoreOffer now that we have a valid answer — ICE candidates
        // from this peer must be processed from this point forward.
        ignoreOfferRef.current[from] = false
        console.log('[WebRTC] Set remote answer from:', from)
        // Flush buffered ICE candidates
        const pending = pendingCandidatesRef.current[from] || []
        pendingCandidatesRef.current[from] = []
        for (const c of pending) {
          try { await pc.addIceCandidate(new RTCIceCandidate(c)) } catch {}
        }
        if (pending.length) console.log(`[WebRTC] Flushed ${pending.length} buffered ICE for ${from}`)
      } catch (err) {
        if (!ignoreOfferRef.current[from]) {
          console.error('[WebRTC] Failed to set answer from', from, ':', err.message)
        }
      }
    })

    socket.on('voice:ice-candidate', async (data) => {
      const { from, candidate, channelId } = data
      if (channelId && channelId !== channelIdRef.current) return
      if (!from || !candidate) return

      const pc = peerConnections.current[from]

      if (!pc || !remoteDescSetRef.current[from]) {
        // Buffer until remote description is set
        if (!pendingCandidatesRef.current[from]) pendingCandidatesRef.current[from] = []
        pendingCandidatesRef.current[from].push(candidate)
        return
      }

      if (ignoreOfferRef.current[from]) return

      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (err) {
        if (!ignoreOfferRef.current[from]) {
          console.error('[WebRTC] Failed to add ICE candidate from', from, ':', err.message)
        }
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
      if (audioElements.current[userId]) {
        const el = audioElements.current[userId]
        el.pause()
        el.srcObject = null
        if (el.parentNode) el.parentNode.removeChild(el)
        delete audioElements.current[userId]
      }
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
    })

    return () => {
      // Mark as cancelled to stop in-flight init
      cancelled = true
      isInitializingRef.current = false

      // Remove document audio resume listeners
      document.removeEventListener('click',   resumeAudio)
      document.removeEventListener('keydown', resumeAudio)
      
      // Check if this is a channel change (component will remount with new channel)
      const isChannelChange = channelIdRef.current !== channel?.id
      
      console.log('[Voice] Cleanup running, hasJoinedRef:', hasJoinedRef.current, 'channelChange:', isChannelChange)
      
      // Unsubscribe from socket events
      socket.off('voice:participants')
      socket.off('voice:user-joined')
      socket.off('voice:user-left')
      socket.off('voice:user-updated')
      socket.off('voice:offer')
      socket.off('voice:answer')
      socket.off('voice:ice-candidate')
      socket.off('voice:screen-share-update')
      socket.off('connect', onReconnectJoin)
      
      // Only do full cleanup if we actually joined AND are leaving the channel entirely
      // (not just re-rendering due to socket/other state changes)
      if (hasJoinedRef.current && isChannelChange) {
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
  }, [socket, channel?.id, user?.id, joinKey])

  // Expose peer connections for the VoiceInfoModal stats panel
  useEffect(() => {
    window.__vcGetPCs = () => ({ ...peerConnections.current })
    return () => { delete window.__vcGetPCs }
  }, [])

  // Connection watchdog — every 8 s check all peers and reconnect dead ones
  useEffect(() => {
    if (!socket) return
    const watchdog = setInterval(() => {
      if (!hasJoinedRef.current) return
      
      // Count failed/closed connections
      const failedPeers = []
      Object.entries(peerConnections.current).forEach(([peerId, pc]) => {
        const s = pc.connectionState
        if (s === 'failed' || s === 'closed') {
          console.log(`[WebRTC] Watchdog: ${peerId} is ${s} — will reconnect`)
          try { pc.close() } catch {}
          delete peerConnections.current[peerId]
          makingOfferRef.current[peerId] = false
          failedPeers.push(peerId)
        }
        // Also restart ICE for stuck disconnected state
        if (s === 'disconnected' && pc.iceConnectionState === 'disconnected') {
          console.log(`[WebRTC] Watchdog: ${peerId} still disconnected — restarting ICE`)
          pc.restartIce()
        }
      })
      
      // Requeue failed connections with staggered delays
      failedPeers.forEach((peerId, index) => {
        const delay = 1000 + (index * 600) + (Math.random() * 400)
        console.log(`[WebRTC] Watchdog: Reconnecting to ${peerId} in ${Math.round(delay)}ms`)
        setTimeout(() => queueConnection(peerId), delay)
      })
    }, 8000)
    return () => clearInterval(watchdog)
  }, [socket, queueConnection])

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

  // Connect local video stream to video element
  useEffect(() => {
    if (localVideoRef.current && localVideoStream && isVideoOn) {
      localVideoRef.current.srcObject = localVideoStream
    }
  }, [localVideoStream, isVideoOn])

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
    if (newDeafened && !currentMuted) {
      setLocalIsMuted(true)
      onMuteChange?.(true)
      localStream?.getAudioTracks().forEach(track => { track.enabled = false })
      socket?.emit('voice:mute', { channelId: channel.id, muted: true })
    }

    // Un-deafening restores mic to whatever mute state was before
    if (!newDeafened) {
      const shouldBeEnabled = !currentMuted
      localStream?.getAudioTracks().forEach(track => { track.enabled = shouldBeEnabled })
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
      // Stop all tracks first so the camera LED turns off
      localVideoStream?.getTracks().forEach(track => track.stop())
      setLocalVideoStream(null)
      setIsVideoOn(false)
      soundService.cameraOff()

      // Remove the video sender entirely rather than replaceTrack(null).
      // replaceTrack(null) leaves a broken sender that can destabilise the PC.
      Object.values(peerConnections.current).forEach(pc => {
        const videoSender = pc.getSenders().find(s => s.track?.kind === 'video')
        if (videoSender) {
          try { pc.removeTrack(videoSender) } catch {}
        }
      })

      socket?.emit('voice:video', { channelId: channel.id, enabled: false })
    } else {
      const settings = settingsService.getSettings()

      const tryGetCamera = async (deviceId) => {
        const constraints = {
          video: deviceId && deviceId !== 'default'
            ? { deviceId: { exact: deviceId } }
            : true
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

        Object.values(peerConnections.current).forEach(pc => {
          // Camera and screen share each get their OWN sender — don't reuse
          const existing = pc.getSenders().find(s => s.track?._senderTag === 'camera')
          if (existing) {
            existing.replaceTrack(videoTrack)
          } else {
            const sender = pc.addTrack(videoTrack, videoStream)
            if (sender) sender.track._senderTag = 'camera'
          }
        })

        socket?.emit('voice:video', { channelId: channel.id, enabled: true })
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
    soundService.screenShareStop()
    socket?.emit('voice:screen-share', { channelId: channel.id, enabled: false })
  }

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      _stopScreenShare(screenStream)
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 30 } },
          audio: false
        })

        setScreenStream(stream)
        setIsScreenSharing(true)
        soundService.screenShareStart()

        const videoTrack = stream.getVideoTracks()[0]
        videoTrack._senderTag = 'screen'

        Object.values(peerConnections.current).forEach(pc => {
          // Screen share gets its own dedicated sender — camera sender is untouched
          const existing = pc.getSenders().find(s => s.track?._senderTag === 'screen')
          if (existing) {
            existing.replaceTrack(videoTrack)
          } else {
            pc.addTrack(videoTrack, stream)
          }
        })

        videoTrack.onended = () => _stopScreenShare(stream)

        socket?.emit('voice:screen-share', { channelId: channel.id, enabled: true })
      } catch (err) {
        if (err.name !== 'NotAllowedError') {
          console.error('[Screen] Failed to share screen:', err)
        }
      }
    }
  }

  const handleLeave = () => {
    soundService.callLeft()

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
    if (analyserRef.current?.audioContext?.state !== 'closed') {
      analyserRef.current?.audioContext?.close().catch(() => {})
    }
    analyserRef.current = null

    // Reset all negotiation state so a fresh join works without page reload
    makingOfferRef.current  = {}
    ignoreOfferRef.current  = {}
    remoteDescSetRef.current = {}
    pendingCandidatesRef.current = {}
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
    connecting: 'Connecting…',
    connected:  'Voice Connected',
    degraded:   'Connection Issues',
    error:      'Connection Error',
  }[overallStatus] ?? 'Connecting…'

  // Close participant context menu on outside click
  useEffect(() => {
    if (!participantMenu) return
    const close = () => setParticipantMenu(null)
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('keydown', close, true)
    return () => {
      window.removeEventListener('pointerdown', close, true)
      window.removeEventListener('keydown', close, true)
    }
  }, [participantMenu])

  const [pinnedParticipant, setPinnedParticipant] = useState(null)

  const getScreenShareStream = (participant) => {
    if (participant.id === user?.id && isScreenSharing) return screenStream
    return participant.isScreenSharing ? participant.videoStream : null
  }

  const getCameraStream = (participant) => {
    if (participant.id === user?.id && isVideoOn) return localVideoStream
    return participant.hasVideo && !participant.isScreenSharing ? participant.videoStream : null
  }

  const hasAnyVideo = displayParticipants.some(p => {
    if (p.id === user?.id) return isVideoOn || isScreenSharing
    return !!p.videoStream
  })

  const hasScreenShare = displayParticipants.some(p => getScreenShareStream(p))

  const mainVideoParticipant = pinnedParticipant || displayParticipants.find(p => {
    if (p.id === user?.id) return isScreenSharing
    return p.isScreenSharing
  }) || displayParticipants.find(p => {
    if (p.id === user?.id) return isVideoOn
    return p.hasVideo
  })

  const mainVideoStream = mainVideoParticipant ? (
    mainVideoParticipant.id === user?.id
      ? (isScreenSharing ? screenStream : localVideoStream)
      : mainVideoParticipant.isScreenSharing
        ? mainVideoParticipant.videoStream
        : mainVideoParticipant.videoStream
  ) : null

  const mainVideoType = mainVideoParticipant ? (
    mainVideoParticipant.id === user?.id
      ? (isScreenSharing ? 'screen' : 'camera')
      : mainVideoParticipant.isScreenSharing
        ? 'screen'
        : 'camera'
  ) : null

  return (
    <div className="voice-channel-view">
      <div className="voice-header">
        <Volume2 size={24} />
        <span className="voice-channel-name">{channel?.name || 'Voice Channel'}</span>
        <span
          className={`connection-status ${overallStatus} clickable`}
          onClick={() => onShowConnectionInfo?.()}
          title="Click for connection details"
          style={{ cursor: 'pointer' }}
        >
          {statusLabel}
        </span>
      </div>

      <div className={`voice-main-area ${hasAnyVideo ? 'has-video' : ''}`}>
        {mainVideoStream && mainVideoParticipant ? (
          <div 
            className="voice-main-video"
            onClick={() => setPinnedParticipant(pinnedParticipant ? null : mainVideoParticipant)}
          >
            <video
              autoPlay
              playsInline
              className="main-video-element"
              muted={mainVideoParticipant.id !== user?.id}
              ref={el => { if (el && mainVideoStream) el.srcObject = mainVideoStream }}
            />
            <div className="main-video-overlay">
              <span className="main-video-name">
                {mainVideoParticipant.id === user?.id ? 'You' : mainVideoParticipant.username}
                {mainVideoType === 'screen' && ' · Screen'}
              </span>
              {pinnedParticipant && (
                <span className="pinned-badge">Pinned</span>
              )}
            </div>
            {hasScreenShare && mainVideoType !== 'screen' && (
              <div className="screen-share-notice">
                <Monitor size={14} />
                <span>Someone is sharing their screen</span>
              </div>
            )}
          </div>
        ) : (
          <div className="voice-empty-state">
            <div className="ghost-container">
              <Ghost size={80} className="ghost-icon" />
            </div>
            <h3>No one is sharing video</h3>
            <p>Start sharing your camera or screen to fill this space</p>
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
                onContextMenu={!isSelf ? (e) => {
                  e.preventDefault()
                  setParticipantMenu({ userId: participant.id, username: participant.username, x: e.clientX, y: e.clientY })
                } : undefined}
              >
                {participantHasVideo ? (
                  <div className="tile-video-container">
                    <video
                      autoPlay
                      playsInline
                      className="tile-video"
                      muted={isSelf}
                      ref={el => {
                        if (el) {
                          if (participantScreenStream) {
                            el.srcObject = participantScreenStream
                          } else if (participantCameraStream) {
                            el.srcObject = participantCameraStream
                          }
                        }
                      }}
                    />
                    <div className="tile-name-overlay">
                      {participant.username}
                      {participantScreenStream ? ' · Screen' : ''}
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
                      <div className={`tile-peer-badge peer-state-${peerState}`}>
                        {peerState === 'connecting' ? '⟳' : peerState === 'failed' ? '✕' : '!'}
                      </div>
                    )}
                  </div>
                )}
                <span className="tile-name">
                  {participant.username}
                  {isSelf && ' (You)'}
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
          title={currentMuted ? 'Unmute' : 'Mute'}
        >
          {currentMuted ? <MicOff size={24} /> : <Mic size={24} />}
        </button>
        
        <button 
          className={`voice-control-btn ${currentDeafened ? 'active' : ''}`}
          onClick={toggleDeafen}
          title={currentDeafened ? 'Undeafen' : 'Deafen'}
        >
          {currentDeafened ? <VolumeX size={24} /> : <Headphones size={24} />}
        </button>

        <button 
          className={`voice-control-btn ${isVideoOn ? 'active-video' : ''}`}
          onClick={toggleVideo}
          title={isVideoOn ? 'Turn Off Camera' : 'Turn On Camera'}
        >
          {isVideoOn ? <Video size={24} /> : <VideoOff size={24} />}
        </button>

        <button 
          className={`voice-control-btn ${isScreenSharing ? 'active-screen' : ''}`}
          onClick={toggleScreenShare}
          title={isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
        >
          {isScreenSharing ? <Monitor size={24} /> : <MonitorOff size={24} />}
        </button>

        <button 
          className="voice-control-btn leave"
          onClick={handleLeave}
          title="Leave Voice Channel"
        >
          <PhoneOff size={24} />
        </button>

        <button 
          className="voice-control-btn settings"
          title="Voice Settings"
          onClick={onOpenSettings}
        >
          <Settings size={24} />
        </button>
      </div>

      {/* Participant right-click context menu */}
      {participantMenu && (() => {
        const ls = localUserSettings[participantMenu.userId] || { muted: false, volume: 100 }
        // Keep menu on screen
        const menuW = 220, menuH = 160
        const x = Math.min(participantMenu.x, window.innerWidth  - menuW - 8)
        const y = Math.min(participantMenu.y, window.innerHeight - menuH - 8)
        return (
          <div
            className="voice-participant-menu"
            style={{ position: 'fixed', left: x, top: y, zIndex: 9999 }}
            onPointerDown={e => e.stopPropagation()}
          >
            <div className="vpm-header">{participantMenu.username}</div>
            <button
              className="vpm-item"
              onClick={() => {
                setLocalUserSetting(participantMenu.userId, { muted: !ls.muted })
              }}
            >
              {ls.muted ? <Volume2 size={14} /> : <VolumeX size={14} />}
              {ls.muted ? 'Unmute for me' : 'Mute for me'}
            </button>
            <div className="vpm-volume">
              <span>Volume</span>
              <input
                type="range"
                min={0}
                max={200}
                value={ls.volume}
                onChange={e => setLocalUserSetting(participantMenu.userId, { volume: Number(e.target.value) })}
              />
              <span>{ls.volume}%</span>
            </div>
            <button
              className="vpm-item vpm-reset"
              onClick={() => {
                setLocalUserSetting(participantMenu.userId, { muted: false, volume: 100 })
                setParticipantMenu(null)
              }}
            >
              Reset to default
            </button>
          </div>
        )
      })()}
    </div>
  )
}

export default VoiceChannel
