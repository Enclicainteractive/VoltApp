import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { useSocket } from './SocketContext'
import { useAuth } from './AuthContext'
import { soundService } from '../services/soundService'

const CallContext = createContext(null)

export const useCall = () => {
  const context = useContext(CallContext)
  if (!context) {
    throw new Error('useCall must be used within a CallProvider')
  }
  return context
}

export const CallProvider = ({ children }) => {
  const { socket, connected } = useSocket()
  const { user } = useAuth()

  // Incoming call state
  const [incomingCall, setIncomingCall] = useState(null)
  
  // Active call state
  const [activeCall, setActiveCall] = useState(null)
  const [callStatus, setCallStatus] = useState('idle') // idle, ringing, connecting, active, ended
  const [callDuration, setCallDuration] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [isDeafened, setIsDeafened] = useState(false)
  const [isVideoEnabled, setIsVideoEnabled] = useState(false)
  const [callError, setCallError] = useState(null)

  // WebRTC state
  const [iceServers, setIceServers] = useState([])
  const [remoteStream, setRemoteStream] = useState(null)
  const [localStream, setLocalStream] = useState(null)

  // Refs
  const peerConnectionRef = useRef(null)
  const localStreamRef = useRef(null)
  const audioElementRef = useRef(null)
  const callTimerRef = useRef(null)

  // Play ringtone on incoming call - uses soundService.startRingtone() which loops
  const startRingtone = useCallback(() => {
    soundService.startRingtone()
  }, [])

  // Stop ringtone - uses soundService.stopRingtone() which stops immediately
  const stopRingtone = useCallback(() => {
    soundService.stopRingtone()
  }, [])

  // Start call timer
  const startCallTimer = useCallback(() => {
    if (callTimerRef.current) clearInterval(callTimerRef.current)
    
    setCallDuration(0)
    callTimerRef.current = setInterval(() => {
      setCallDuration(prev => prev + 1)
    }, 1000)
  }, [])

  // Stop call timer
  const stopCallTimer = useCallback(() => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current)
      callTimerRef.current = null
    }
  }, [])

  // Initialize WebRTC peer connection
  const createPeerConnection = useCallback((iceServersList) => {
    const config = {
      iceServers: iceServersList || [],
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    }

    const pc = new RTCPeerConnection(config)
    peerConnectionRef.current = pc

    pc.onicecandidate = (event) => {
      if (event.candidate && activeCall) {
        socket?.emit('call:ice-candidate', {
          callId: activeCall.callId,
          to: activeCall.otherUserId,
          candidate: event.candidate.toJSON()
        })
      }
    }

    pc.ontrack = (event) => {
      console.log('[Call] Received remote track:', event.track.kind)
      const stream = event.streams[0]
      if (stream) {
        setRemoteStream(stream)
        
        // Create audio element for remote audio
        if (!audioElementRef.current) {
          audioElementRef.current = document.createElement('audio')
          audioElementRef.current.autoplay = true
          document.body.appendChild(audioElementRef.current)
        }
        audioElementRef.current.srcObject = stream
      }
    }

    pc.onconnectionstatechange = () => {
      console.log('[Call] Connection state:', pc.connectionState)
      if (pc.connectionState === 'connected') {
        setCallStatus('active')
        startCallTimer()
        soundService.callConnected()
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        // Handle reconnection or end call
        if (pc.connectionState === 'failed') {
          setCallError('Connection failed')
        }
      }
    }

    return pc
  }, [activeCall, socket, startCallTimer])

  // Get local media stream
  const getLocalStream = useCallback(async (video = false) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: video ? { facingMode: 'user' } : false
      })
      
      localStreamRef.current = stream
      setLocalStream(stream)
      return stream
    } catch (err) {
      console.error('[Call] Failed to get local stream:', err)
      setCallError('Failed to access microphone')
      return null
    }
  }, [])

  // Initiate a call
  const initiateCall = useCallback(async (recipientId, conversationId, type = 'audio') => {
    if (!socket || !connected) {
      setCallError('Not connected to server')
      return
    }

    setCallError(null)
    setCallStatus('ringing')

    socket.emit('call:initiate', {
      recipientId,
      conversationId,
      type
    })
  }, [socket, connected])

  // Accept incoming call
  const acceptCall = useCallback(async () => {
    if (!incomingCall || !socket) return

    stopRingtone()
    setCallStatus('connecting')

    // Get local stream
    const stream = await getLocalStream(incomingCall.type === 'video')
    if (!stream) {
      setCallStatus('idle')
      setIncomingCall(null)
      return
    }

    // Create peer connection
    const pc = createPeerConnection(incomingCall.iceServers)

    // Add local tracks
    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream)
    })

    // Accept the call
    socket.emit('call:accept', { callId: incomingCall.callId })

    setActiveCall({
      callId: incomingCall.callId,
      otherUserId: incomingCall.caller.id,
      otherUser: incomingCall.caller,
      conversationId: incomingCall.conversationId,
      type: incomingCall.type,
      isCaller: false
    })

    setIncomingCall(null)
    soundService.callConnected()
  }, [incomingCall, socket, stopRingtone, getLocalStream, createPeerConnection])

  // Decline incoming call
  const declineCall = useCallback(() => {
    if (!incomingCall || !socket) return

    stopRingtone()
    socket.emit('call:decline', { callId: incomingCall.callId })
    setIncomingCall(null)
    setCallStatus('idle')
    soundService.callDeclined()
  }, [incomingCall, socket, stopRingtone])

  // End active call
  const endCall = useCallback(() => {
    if (!activeCall || !socket) return

    socket.emit('call:end', { callId: activeCall.callId })
    
    // Cleanup
    stopCallTimer()
    stopRingtone()
    
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
      peerConnectionRef.current = null
    }
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop())
      localStreamRef.current = null
    }
    
    if (audioElementRef.current) {
      audioElementRef.current.pause()
      audioElementRef.current.srcObject = null
      if (audioElementRef.current.parentNode) {
        audioElementRef.current.parentNode.removeChild(audioElementRef.current)
      }
      audioElementRef.current = null
    }

    setActiveCall(null)
    setCallStatus('idle')
    setCallDuration(0)
    setLocalStream(null)
    setRemoteStream(null)
    setIsMuted(false)
    setIsDeafened(false)
    setIsVideoEnabled(false)
    
    soundService.callEnded()
  }, [activeCall, socket, stopCallTimer, stopRingtone])

  // Cancel outgoing call (before it's answered)
  const cancelCall = useCallback(() => {
    if (!activeCall || !socket) return

    socket.emit('call:cancel', { callId: activeCall.callId })
    
    stopRingtone()
    
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
      peerConnectionRef.current = null
    }
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop())
      localStreamRef.current = null
    }

    setActiveCall(null)
    setCallStatus('idle')
    setCallDuration(0)
    setLocalStream(null)
    
    soundService.callLeft()
  }, [activeCall, socket, stopRingtone])

  // Toggle mute
  const toggleMute = useCallback(() => {
    const newMuted = !isMuted
    setIsMuted(newMuted)
    
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !newMuted
      })
    }
    
    if (activeCall && socket) {
      socket.emit('call:mute', { callId: activeCall.callId, muted: newMuted })
    }
    
    soundService[newMuted ? 'mute' : 'unmute']()
  }, [isMuted, activeCall, socket])

  // Toggle deafen
  const toggleDeafen = useCallback(() => {
    const newDeafened = !isDeafened
    setIsDeafened(newDeafened)
    
    if (audioElementRef.current) {
      audioElementRef.current.muted = newDeafened
    }
    
    if (activeCall && socket) {
      socket.emit('call:deafen', { callId: activeCall.callId, deafened: newDeafened })
    }
    
    soundService[newDeafened ? 'deafen' : 'undeafen']()
  }, [isDeafened, activeCall, socket])

  // Toggle video
  const toggleVideo = useCallback(async () => {
    if (!activeCall) return

    if (isVideoEnabled) {
      // Turn off video
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach(t => t.stop())
      }
      setIsVideoEnabled(false)
      
      if (socket) {
        socket.emit('call:video-toggle', { callId: activeCall.callId, enabled: false })
      }
      
      soundService.cameraOff()
    } else {
      // Turn on video
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
        const videoTrack = newStream.getVideoTracks()[0]
        
        if (localStreamRef.current && peerConnectionRef.current) {
          localStreamRef.current.addTrack(videoTrack)
          const sender = peerConnectionRef.current.getSenders().find(s => s.track?.kind === 'video')
          if (sender) {
            sender.replaceTrack(videoTrack)
          } else {
            peerConnectionRef.current.addTrack(videoTrack, localStreamRef.current)
          }
        }
        
        setIsVideoEnabled(true)
        
        if (socket) {
          socket.emit('call:video-toggle', { callId: activeCall.callId, enabled: true })
        }
        
        soundService.cameraOn()
      } catch (err) {
        console.error('[Call] Failed to get video:', err)
        setCallError('Failed to access camera')
      }
    }
  }, [activeCall, isVideoEnabled, socket])

  // Socket event listeners
  useEffect(() => {
    if (!socket) return

    // Incoming call
    const handleIncomingCall = (data) => {
      console.log('[Call] Incoming call:', data)
      
      // If there's already an active call, end it first
      if (activeCall || callStatus !== 'idle') {
        console.log('[Call] Ending previous call before accepting new incoming call')
        // Clean up any existing call state
        stopRingtone()
        stopCallTimer()
        
        if (peerConnectionRef.current) {
          peerConnectionRef.current.close()
          peerConnectionRef.current = null
        }
        
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(t => t.stop())
          localStreamRef.current = null
        }
        
        if (audioElementRef.current) {
          audioElementRef.current.pause()
          audioElementRef.current.srcObject = null
          if (audioElementRef.current.parentNode) {
            audioElementRef.current.parentNode.removeChild(audioElementRef.current)
          }
          audioElementRef.current = null
        }
        
        setActiveCall(null)
        setLocalStream(null)
        setRemoteStream(null)
        setCallDuration(0)
      }
      
      // Clear any previous error
      setCallError(null)
      setIncomingCall(data)
      setCallStatus('ringing')
      startRingtone()
    }

    // Call ringing (caller side)
    const handleCallRinging = (data) => {
      console.log('[Call] Call ringing:', data)
      setActiveCall({
        callId: data.callId,
        otherUserId: data.recipientId,
        conversationId: data.conversationId,
        type: data.type,
        isCaller: true
      })
    }

    // Call accepted (caller side)
    const handleCallAccepted = async (data) => {
      console.log('[Call] Call accepted:', data)
      setCallStatus('connecting')
      setIceServers(data.iceServers || [])

      // Get local stream
      const stream = await getLocalStream(activeCall?.type === 'video')
      if (!stream) {
        endCall()
        return
      }

      // Create peer connection
      const pc = createPeerConnection(data.iceServers)

      // Add local tracks
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream)
      })

      // Create and send offer
      try {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        
        socket.emit('call:offer', {
          callId: activeCall.callId,
          to: data.recipientId,
          offer: pc.localDescription
        })
      } catch (err) {
        console.error('[Call] Failed to create offer:', err)
        setCallError('Failed to establish connection')
      }
    }

    // Call connected (recipient side)
    const handleCallConnected = async (data) => {
      console.log('[Call] Call connected:', data)
      setIceServers(data.iceServers || [])
    }

    // Call ended
    const handleCallEnded = (data) => {
      console.log('[Call] Call ended:', data)
      
      stopRingtone()
      stopCallTimer()
      
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close()
        peerConnectionRef.current = null
      }
      
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop())
        localStreamRef.current = null
      }
      
      if (audioElementRef.current) {
        audioElementRef.current.pause()
        audioElementRef.current.srcObject = null
        if (audioElementRef.current.parentNode) {
          audioElementRef.current.parentNode.removeChild(audioElementRef.current)
        }
        audioElementRef.current = null
      }

      setActiveCall(null)
      setIncomingCall(null)
      setCallStatus('idle')
      setCallDuration(0)
      setLocalStream(null)
      setRemoteStream(null)
      
      if (data.reason === 'missed') {
        soundService.callDeclined()
      } else if (data.reason === 'declined') {
        soundService.callDeclined()
      } else {
        soundService.callEnded()
      }
    }

    // Call missed
    const handleCallMissed = (data) => {
      console.log('[Call] Call missed:', data)
      stopRingtone()
      setActiveCall(null)
      setCallStatus('idle')
      soundService.callDeclined()
    }

    // Call error
    const handleCallError = (data) => {
      console.error('[Call] Error:', data)
      setCallError(data.error)
      stopRingtone()
      stopCallTimer()
      
      // Reset state regardless of current status
      // This handles cases where call was accepted but server returns error
      setCallStatus('idle')
      setActiveCall(null)
      setIncomingCall(null)
      setLocalStream(null)
      setRemoteStream(null)
      
      // Clean up peer connection
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close()
        peerConnectionRef.current = null
      }
      
      // Clean up local stream
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop())
        localStreamRef.current = null
      }
      
      // Clean up audio element
      if (audioElementRef.current) {
        audioElementRef.current.pause()
        audioElementRef.current.srcObject = null
        if (audioElementRef.current.parentNode) {
          audioElementRef.current.parentNode.removeChild(audioElementRef.current)
        }
        audioElementRef.current = null
      }
    }

    // WebRTC signaling
    const handleCallOffer = async (data) => {
      console.log('[Call] Received offer from:', data.from)
      
      if (!peerConnectionRef.current) {
        createPeerConnection(iceServers)
      }
      
      const pc = peerConnectionRef.current
      
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer))
        
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        
        socket.emit('call:answer', {
          callId: data.callId,
          to: data.from,
          answer: pc.localDescription
        })
      } catch (err) {
        console.error('[Call] Failed to handle offer:', err)
      }
    }

    const handleCallAnswer = async (data) => {
      console.log('[Call] Received answer from:', data.from)
      
      const pc = peerConnectionRef.current
      if (!pc) return
      
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer))
      } catch (err) {
        console.error('[Call] Failed to handle answer:', err)
      }
    }

    const handleCallIceCandidate = async (data) => {
      const pc = peerConnectionRef.current
      if (!pc) return
      
      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate))
      } catch (err) {
        console.error('[Call] Failed to add ICE candidate:', err)
      }
    }

    // Register event listeners
    socket.on('call:incoming', handleIncomingCall)
    socket.on('call:ringing', handleCallRinging)
    socket.on('call:accepted', handleCallAccepted)
    socket.on('call:connected', handleCallConnected)
    socket.on('call:ended', handleCallEnded)
    socket.on('call:missed', handleCallMissed)
    socket.on('call:error', handleCallError)
    socket.on('call:offer', handleCallOffer)
    socket.on('call:answer', handleCallAnswer)
    socket.on('call:ice-candidate', handleCallIceCandidate)

    // Cleanup
    return () => {
      socket.off('call:incoming', handleIncomingCall)
      socket.off('call:ringing', handleCallRinging)
      socket.off('call:accepted', handleCallAccepted)
      socket.off('call:connected', handleCallConnected)
      socket.off('call:ended', handleCallEnded)
      socket.off('call:missed', handleCallMissed)
      socket.off('call:error', handleCallError)
      socket.off('call:offer', handleCallOffer)
      socket.off('call:answer', handleCallAnswer)
      socket.off('call:ice-candidate', handleCallIceCandidate)
      
      stopRingtone()
      stopCallTimer()
    }
  }, [socket, activeCall, iceServers, callStatus, startRingtone, stopRingtone, stopCallTimer, getLocalStream, createPeerConnection, endCall])

  // Format call duration
  const formatDuration = useCallback((seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }, [])

  const value = {
    // State
    incomingCall,
    activeCall,
    callStatus,
    callDuration,
    isMuted,
    isDeafened,
    isVideoEnabled,
    callError,
    localStream,
    remoteStream,
    
    // Actions
    initiateCall,
    acceptCall,
    declineCall,
    endCall,
    cancelCall,
    toggleMute,
    toggleDeafen,
    toggleVideo,
    
    // Utilities
    formatDuration,
    setCallError
  }

  return (
    <CallContext.Provider value={value}>
      {children}
    </CallContext.Provider>
  )
}

export default CallContext