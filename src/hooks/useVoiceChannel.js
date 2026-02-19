import { useState, useEffect, useRef } from 'react'
import { useSocket } from '../contexts/SocketContext'
import SimplePeer from 'simple-peer'
import { voiceAudio } from '../services/voiceAudio'

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

  useEffect(() => {
    if (!socket || !channelId) return

    const handleVoiceUserJoined = ({ userId, username, peerId }) => {
      if (!peersRef.current[userId]) {
        const peer = createPeer(peerId, streamRef.current, userId)
        peersRef.current[userId] = peer
        setParticipants(prev => [...prev, { userId, username, peerId }])
      }
    }

    const handleVoiceUserLeft = ({ userId }) => {
      if (peersRef.current[userId]) {
        peersRef.current[userId].destroy()
        delete peersRef.current[userId]
        setParticipants(prev => prev.filter(p => p.userId !== userId))
      }
      removeAudioEl(userId)
    }

    const handleVoiceSignal = ({ from, signal }) => {
      if (peersRef.current[from]) {
        peersRef.current[from].signal(signal)
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
  }, [socket, channelId])

  const createPeer = (targetPeerId, stream, key) => {
    const peer = new SimplePeer({
      initiator: true,
      trickle: false,
      stream
    })

    peer.on('signal', signal => {
      socket.emit('voice:signal', {
        to: targetPeerId,
        signal
      })
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

    Object.values(peersRef.current).forEach(peer => peer.destroy())
    peersRef.current = {}

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
    toggleDeafen
  }
}
