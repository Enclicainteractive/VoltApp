import { useState, useEffect, useRef } from 'react'
import { useSocket } from '../contexts/SocketContext'
import SimplePeer from 'simple-peer'

export const useVoiceChannel = (channelId) => {
  const { socket } = useSocket()
  const [isConnected, setIsConnected] = useState(false)
  const [participants, setParticipants] = useState([])
  const [isMuted, setIsMuted] = useState(false)
  const [isDeafened, setIsDeafened] = useState(false)
  const peersRef = useRef({})
  const streamRef = useRef(null)

  useEffect(() => {
    if (!socket || !channelId) return

    const handleVoiceUserJoined = ({ userId, username, peerId }) => {
      if (!peersRef.current[userId]) {
        const peer = createPeer(peerId, streamRef.current)
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

  const createPeer = (targetPeerId, stream) => {
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

    peer.on('stream', remoteStream => {
      const audio = new Audio()
      audio.srcObject = remoteStream
      audio.play()
    })

    return peer
  }

  const joinVoiceChannel = async () => {
    try {
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
    setIsDeafened(prev => !prev)
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
