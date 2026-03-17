import { useState, useEffect, useRef, useCallback } from 'react'
import { useSocket } from '../contexts/SocketContext'
import SimplePeer from 'simple-peer'
import { voiceAudio } from '../services/voiceAudio'
import { useAppStore } from '../store/useAppStore'

const ACTIVITY_DATA_CHANNEL = 'activity-data'

// STUN servers for NAT traversal — without these, connections fail across different networks
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
]

export const useVoiceChannel = (channelId) => {
  const { socket } = useSocket()
  const [isConnected, setIsConnected] = useState(false)
  const [participants, setParticipants] = useState([])
  const [isMuted, setIsMuted] = useState(false)
  const [isDeafened, setIsDeafened] = useState(false)
  const peersRef = useRef({})
  const streamRef = useRef(null)
  const audioElsRef = useRef(new Map())
  const isDeafenedRef = useRef(false)
  const { activeActivities, addActivity } = useAppStore()
  const activeActivitiesRef = useRef(activeActivities)
  const prevActivitiesRef = useRef([])
  // Track pending signals for peers not yet created
  const pendingSignalsRef = useRef({})

  useEffect(() => {
    activeActivitiesRef.current = activeActivities
  }, [activeActivities])

  useEffect(() => {
    if (!isConnected || activeActivities.length === 0) return

    const newActivities = activeActivities.filter(
      activity => !prevActivitiesRef.current.some(prev => prev.sessionId === activity.sessionId)
    )

    if (newActivities.length > 0) {
      const activityData = JSON.stringify({
        type: 'activities-sync',
        activities: activeActivities
      })
      Object.values(peersRef.current).forEach(peer => {
        try {
          if (peer.connected) {
            peer.send(activityData)
          }
        } catch (e) {
          console.warn('[VoiceChannel] Failed to broadcast activities to peer:', e)
        }
      })
    }

    prevActivitiesRef.current = activeActivities
  }, [activeActivities, isConnected])

  const broadcastActivityToPeers = (activity) => {
    const activityData = JSON.stringify({
      type: 'activity-joined',
      activity
    })
    Object.values(peersRef.current).forEach(peer => {
      try {
        if (peer.connected) {
          peer.send(activityData)
        }
      } catch (e) {
        console.warn('[VoiceChannel] Failed to broadcast activity to peer:', e)
      }
    })
  }

  useEffect(() => {
    isDeafenedRef.current = isDeafened
  }, [isDeafened])

  const getAudioEl = (key) => {
    const existing = audioElsRef.current.get(key)
    if (existing) return existing

    const el = document.createElement('audio')
    el.dataset.peerKey = key
    el.style.display = 'none'
    document.body.appendChild(el)
    audioElsRef.current.set(key, el)
    return el
  }

  const removeAudioEl = (key) => {
    const el = audioElsRef.current.get(key)
    if (!el) return
    voiceAudio.forget(el)
    try { el.pause() } catch {}
    el.srcObject = null
    if (el.parentNode) el.parentNode.removeChild(el)
    audioElsRef.current.delete(key)
  }

  const destroyPeer = useCallback((userId) => {
    const peer = peersRef.current[userId]
    if (!peer) return
    try { peer.destroy() } catch {}
    delete peersRef.current[userId]
    delete pendingSignalsRef.current[userId]
    removeAudioEl(userId)
    setParticipants(prev => prev.filter(p => p.userId !== userId))
  }, [])

  useEffect(() => {
    if (!socket || !channelId) return

    const handleVoiceUserJoined = ({ userId, username, peerId }) => {
      // Avoid duplicate peers — destroy stale one if it exists
      if (peersRef.current[userId]) {
        try { peersRef.current[userId].destroy() } catch {}
        delete peersRef.current[userId]
      }

      const peer = createPeer(peerId, streamRef.current, userId, true)
      peersRef.current[userId] = peer
      setParticipants(prev => {
        if (prev.some(p => p.userId === userId)) return prev
        return [...prev, { userId, username, peerId }]
      })

      // Flush any pending signals that arrived before the peer was created
      const pending = pendingSignalsRef.current[userId]
      if (pending) {
        pending.forEach(sig => {
          try { peer.signal(sig) } catch (e) {
            console.warn('[VoiceChannel] Failed to apply pending signal:', e)
          }
        })
        delete pendingSignalsRef.current[userId]
      }
    }

    const handleVoiceUserLeft = ({ userId }) => {
      destroyPeer(userId)
    }

    const handleVoiceSignal = ({ from, signal, username }) => {
      if (peersRef.current[from]) {
        // Peer exists — apply signal directly
        try {
          peersRef.current[from].signal(signal)
        } catch (e) {
          console.warn('[VoiceChannel] Signal error on existing peer, recreating:', e)
          // Peer is in a bad state — recreate as non-initiator
          try { peersRef.current[from].destroy() } catch {}
          delete peersRef.current[from]
          const peer = createPeer(null, streamRef.current, from, false)
          peersRef.current[from] = peer
          setParticipants(prev => {
            if (prev.some(p => p.userId === from)) return prev
            return [...prev, { userId: from, username: username || 'Unknown', peerId: from }]
          })
          try { peer.signal(signal) } catch {}
        }
      } else {
        // Peer doesn't exist yet — create as non-initiator and apply signal
        const peer = createPeer(null, streamRef.current, from, false)
        peersRef.current[from] = peer
        setParticipants(prev => {
          if (prev.some(p => p.userId === from)) return prev
          return [...prev, { userId: from, username: username || 'Unknown', peerId: from }]
        })
        try {
          peer.signal(signal)
        } catch (e) {
          console.warn('[VoiceChannel] Failed to signal new peer:', e)
          // Queue it for later if signal fails immediately
          if (!pendingSignalsRef.current[from]) pendingSignalsRef.current[from] = []
          pendingSignalsRef.current[from].push(signal)
        }
      }
    }

    socket.on('voice:user-joined', handleVoiceUserJoined)
    socket.on('voice:user-left', handleVoiceUserLeft)
    socket.on('voice:signal', handleVoiceSignal)

    return () => {
      socket.off('voice:user-joined', handleVoiceUserJoined)
      socket.off('voice:user-left', handleVoiceUserLeft)
      socket.off('voice:signal', handleVoiceSignal)
    }
  }, [socket, channelId, destroyPeer])

  const createPeer = (targetPeerId, stream, key, initiator = true) => {
    const peer = new SimplePeer({
      initiator,
      trickle: true, // Enable trickle ICE — much faster connection establishment
      stream,
      config: {
        iceServers: ICE_SERVERS,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
        iceCandidatePoolSize: 10
      }
    })

    peer.on('signal', signal => {
      // Always use key (userId) as the routing target — the server routes by userId
      // targetPeerId is the remote peer's WebRTC peerId, not their userId
      socket.emit('voice:signal', {
        to: key,
        signal
      })
    })

    peer.on('connect', () => {
      const activityData = JSON.stringify({
        type: 'activities-sync',
        activities: activeActivitiesRef.current
      })
      try {
        peer.send(activityData)
      } catch (e) {
        console.warn('[VoiceChannel] Failed to send activities on connect:', e)
      }
    })

    peer.on('error', (err) => {
      console.warn(`[VoiceChannel] Peer error for ${key}:`, err?.message || err)
      // Clean up the broken peer — the user will need to reconnect
      // Don't destroy immediately on all errors; some are recoverable
      if (err?.message?.includes('Connection failed') || err?.message?.includes('ICE')) {
        console.warn(`[VoiceChannel] Unrecoverable peer error for ${key}, cleaning up`)
        destroyPeer(key)
      }
    })

    peer.on('close', () => {
      // Peer closed — clean up if it's still tracked
      if (peersRef.current[key]) {
        delete peersRef.current[key]
        removeAudioEl(key)
        setParticipants(prev => prev.filter(p => p.userId !== key))
      }
    })

    peer.on('data', (data) => {
      try {
        const parsed = JSON.parse(data.toString())
        if (parsed.type === 'activities-sync' && Array.isArray(parsed.activities)) {
          parsed.activities.forEach(activity => {
            addActivity(activity)
          })
        } else if (parsed.type === 'activity-joined' && parsed.activity) {
          addActivity(parsed.activity)
        }
      } catch (e) {
        console.warn('[VoiceChannel] Failed to parse peer data:', e)
      }
    })

    const attachStream = (remoteStream, peerKey) => {
      if (!remoteStream) return
      const audio = getAudioEl(peerKey)
      audio.srcObject = remoteStream
      audio.muted = isDeafenedRef.current
      const track = remoteStream.getAudioTracks()[0]
      const start = () => voiceAudio.register(audio)
      if (track && track.muted) {
        track.addEventListener('unmute', start, { once: true })
      } else {
        start()
      }
    }

    peer.on('stream', remoteStream => {
      attachStream(remoteStream, key || targetPeerId)
    })

    peer.on('track', (track, stream) => {
      if (track?.kind !== 'audio') return
      if (stream) attachStream(stream, key || targetPeerId)
    })

    return peer
  }

  const joinVoiceChannel = async () => {
    try {
      voiceAudio.unlock()
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      streamRef.current = stream
      setIsConnected(true)

      const peerId = Math.random().toString(36).substring(7)
      socket.emit('voice:join', { channelId, peerId })
    } catch (error) {
      console.error('Failed to get media stream:', error)
      throw error
    }
  }

  const leaveVoiceChannel = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }

    Object.keys(peersRef.current).forEach(userId => {
      try { peersRef.current[userId].destroy() } catch {}
    })
    peersRef.current = {}
    pendingSignalsRef.current = {}

    for (const key of Array.from(audioElsRef.current.keys())) {
      removeAudioEl(key)
    }

    socket.emit('voice:leave', channelId)
    setIsConnected(false)
    setParticipants([])
  }

  const toggleMute = () => {
    if (streamRef.current) {
      const audioTrack = streamRef.current.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        setIsMuted(!audioTrack.enabled)
      }
    }
  }

  const toggleDeafen = () => {
    setIsDeafened(prev => {
      const next = !prev
      for (const el of audioElsRef.current.values()) {
        el.muted = next
      }
      return next
    })
  }

  return {
    isConnected,
    participants,
    isMuted,
    isDeafened,
    joinVoiceChannel,
    leaveVoiceChannel,
    toggleMute,
    toggleDeafen,
    broadcastActivityToPeers
  }
}
