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
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [callError, setCallError] = useState(null)

  // WebRTC state
  const [iceServers, setIceServers] = useState([])
  const [remoteStream, setRemoteStream] = useState(null)
  const [localStream, setLocalStream] = useState(null)
  const [screenStream, setScreenStream] = useState(null)

  // Refs
  const peerConnectionRef = useRef(null)
  const localStreamRef = useRef(null)
  const screenStreamRef = useRef(null)
  const audioElementRef = useRef(null)
  const callTimerRef = useRef(null)
  const connectionTimeoutRef = useRef(null)
  const callStatusRef = useRef('idle')
  const activeCallRef = useRef(null)
  const incomingCallRef = useRef(null)
  const pendingIceCandidatesRef = useRef([])
  const makingOfferRef = useRef(false)

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

  const clearConnectionTimeout = useCallback(() => {
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current)
      connectionTimeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    activeCallRef.current = activeCall
  }, [activeCall])

  useEffect(() => {
    callStatusRef.current = callStatus
  }, [callStatus])

  useEffect(() => {
    incomingCallRef.current = incomingCall
  }, [incomingCall])

  useEffect(() => {
    screenStreamRef.current = screenStream
  }, [screenStream])

  const getPrimaryVideoTrack = useCallback(() => {
    if (screenStreamRef.current) {
      return screenStreamRef.current.getVideoTracks()[0] || null
    }
    if (localStreamRef.current) {
      return localStreamRef.current.getVideoTracks()[0] || null
    }
    return null
  }, [])

  // Hard timeout for stalled call setup to prevent endless "connecting".
  useEffect(() => {
    clearConnectionTimeout()

    if (callStatus !== 'connecting' || !activeCallRef.current?.callId) return

    connectionTimeoutRef.current = setTimeout(() => {
      if (callStatusRef.current !== 'connecting') return

      console.warn('[Call] Connection timed out after 20s')
      setCallError('Call connection timed out after 20 seconds.')

      const currentCall = activeCallRef.current
      if (currentCall?.callId && socket?.connected) {
        socket.emit('call:end', { callId: currentCall.callId, reason: 'timeout' })
      }

      stopRingtone()
      stopCallTimer()

      if (peerConnectionRef.current) {
        try { peerConnectionRef.current.close() } catch {}
        peerConnectionRef.current = null
      }

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop())
        localStreamRef.current = null
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop())
        screenStreamRef.current = null
      }

      if (audioElementRef.current) {
        try { audioElementRef.current.pause() } catch {}
        audioElementRef.current.srcObject = null
        if (audioElementRef.current.parentNode) {
          audioElementRef.current.parentNode.removeChild(audioElementRef.current)
        }
        audioElementRef.current = null
      }

      pendingIceCandidatesRef.current = []
      setActiveCall(null)
      setIncomingCall(null)
      setCallStatus('idle')
      setCallDuration(0)
      setLocalStream(null)
      setRemoteStream(null)
      setIsMuted(false)
      setIsDeafened(false)
      setIsVideoEnabled(false)
      setScreenStream(null)
      setIsScreenSharing(false)
    }, 20000)

    return clearConnectionTimeout
  }, [callStatus, socket, stopRingtone, stopCallTimer, clearConnectionTimeout])

  const normalizeIceServers = useCallback((servers = []) => {
    const seen = new Set()
    const normalized = []
    for (const s of servers) {
      const urls = Array.isArray(s?.urls) ? s.urls.join(',') : s?.urls
      if (!urls || seen.has(urls)) continue
      seen.add(urls)
      normalized.push(s)
    }
    return normalized
  }, [])

  // Default ICE servers with TURN support for international calls
  const getDefaultIceServers = useCallback(() => {
    return [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
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
  }, [])

  // ICE restart counter for tracking reconnection attempts
  const iceRestartCountRef = useRef(0)
  const maxIceRestarts = 3

  const applyReceiverLatencyHints = useCallback((pc) => {
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
        console.warn('[Call] Failed to apply receiver latency hints:', err.message)
      }
    })
  }, [])

  const sendOfferToPeer = useCallback(async (pc) => {
    if (!pc || makingOfferRef.current) return
    if (pc.signalingState !== 'stable') return
    const currentCall = activeCallRef.current
    if (!currentCall?.callId || !currentCall?.otherUserId) return

    try {
      makingOfferRef.current = true
      const offer = await pc.createOffer()
      if (pc.signalingState !== 'stable') return
      await pc.setLocalDescription(offer)
      socket?.emit('call:offer', {
        callId: currentCall.callId,
        to: currentCall.otherUserId,
        offer: pc.localDescription
      })
    } catch (err) {
      console.error('[Call] Failed to send renegotiation offer:', err)
    } finally {
      makingOfferRef.current = false
    }
  }, [socket])

  // Initialize WebRTC peer connection with enhanced ICE configuration
  const createPeerConnection = useCallback((iceServersList) => {
    // Prefer server-provided ICE config when available.
    const serverIce = normalizeIceServers(iceServersList || [])
    const fallbackIce = normalizeIceServers(getDefaultIceServers())
    const allIceServers = serverIce.length > 0 ? serverIce : fallbackIce
    
    const config = {
      iceServers: allIceServers,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceCandidatePoolSize: 10,
      iceRestart: true
    }

    console.log('[Call] Creating peer connection with', allIceServers.length, 'ICE servers')
    const pc = new RTCPeerConnection(config)
    peerConnectionRef.current = pc
    iceRestartCountRef.current = 0

    // Trickle ICE - send candidates as they are discovered
    pc.onicecandidate = (event) => {
      const currentCall = activeCallRef.current
      if (event.candidate && currentCall?.callId && currentCall?.otherUserId) {
        console.log('[Call] Sending ICE candidate:', event.candidate.type)
        socket?.emit('call:ice-candidate', {
          callId: currentCall.callId,
          to: currentCall.otherUserId,
          candidate: event.candidate.toJSON()
        })
      }
    }

    // Log ICE gathering state for debugging
    pc.onicegatheringstatechange = () => {
      console.log('[Call] ICE gathering state:', pc.iceGatheringState)
    }

    // Handle ICE connection state changes with auto-restart
    pc.oniceconnectionstatechange = () => {
      console.log('[Call] ICE connection state:', pc.iceConnectionState)
      
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        // Attempt ICE restart for reconnection
        if (iceRestartCountRef.current < maxIceRestarts) {
          iceRestartCountRef.current++
          console.log(`[Call] Attempting ICE restart (${iceRestartCountRef.current}/${maxIceRestarts})`)
          
          // Small delay before restart to allow network stabilization
          setTimeout(() => {
            if (peerConnectionRef.current === pc && 
                (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected')) {
              pc.restartIce()
            }
          }, 1000)
        } else if (pc.iceConnectionState === 'failed') {
          console.log('[Call] Max ICE restarts reached, connection failed')
          setCallError('Connection failed after multiple attempts. Please try again.')
        }
      }
      
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        console.log('[Call] ICE connection established')
        applyReceiverLatencyHints(pc)
        iceRestartCountRef.current = 0 // Reset counter on successful connection
      }
    }

    pc.ontrack = (event) => {
      applyReceiverLatencyHints(pc)
      console.log('[Call] Received remote track:', event.track.kind)
      let stream = event.streams[0]
      if (!stream) {
        stream = remoteStream || new MediaStream()
        if (!stream.getTracks().find(t => t.id === event.track.id)) {
          stream.addTrack(event.track)
        }
      }
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

    pc.onnegotiationneeded = async () => {
      await sendOfferToPeer(pc)
    }

    pc.onconnectionstatechange = () => {
      console.log('[Call] Connection state:', pc.connectionState)
      if (pc.connectionState === 'connected') {
        setCallStatus('active')
        startCallTimer()
        soundService.callConnected()
      } else if (pc.connectionState === 'disconnected') {
        // Wait briefly to see if connection recovers
        setTimeout(() => {
          if (peerConnectionRef.current === pc && pc.connectionState === 'disconnected') {
            console.log('[Call] Connection disconnected, attempting recovery')
            // ICE restart will be triggered by oniceconnectionstatechange
          }
        }, 2000)
      } else if (pc.connectionState === 'failed') {
        setCallError('Connection failed. Check your network and try again.')
      }
    }

    return pc
  }, [socket, startCallTimer, getDefaultIceServers, applyReceiverLatencyHints, normalizeIceServers, sendOfferToPeer, remoteStream])

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
  const initiateCall = useCallback(async (recipientId, conversationId, type = 'audio', recipient = null, participantIds = null) => {
    if (!socket || !connected) {
      setCallError('Not connected to server')
      return
    }

    setCallError(null)
    setCallStatus('ringing')
    setActiveCall({
      callId: null,
      otherUserId: recipientId,
      otherUser: recipient || null,
      conversationId,
      type,
      isCaller: true
    })

    socket.emit('call:initiate', {
      recipientId,
      participantIds: Array.isArray(participantIds) && participantIds.length > 0 ? participantIds : undefined,
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
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop())
      screenStreamRef.current = null
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
    setScreenStream(null)
    setIsScreenSharing(false)
    pendingIceCandidatesRef.current = []
    
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
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop())
      screenStreamRef.current = null
    }

    setActiveCall(null)
    setCallStatus('idle')
    setCallDuration(0)
    setLocalStream(null)
    setScreenStream(null)
    setIsScreenSharing(false)
    pendingIceCandidatesRef.current = []
    
    soundService.callLeft()
  }, [activeCall, socket, stopRingtone])

  const dismissEndedCall = useCallback(() => {
    setActiveCall(null)
    setCallStatus('idle')
    setCallDuration(0)
    setCallError(null)
  }, [])

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
      const liveScreenTrack = screenStreamRef.current?.getVideoTracks?.()[0] || null
      if (liveScreenTrack) {
        // If screen share is active, keep sending that and only drop camera track.
        localStreamRef.current?.getVideoTracks().forEach(t => t.stop())
        localStreamRef.current?.getVideoTracks().forEach(t => {
          try { localStreamRef.current.removeTrack(t) } catch {}
        })
      } else {
        if (localStreamRef.current) {
          localStreamRef.current.getVideoTracks().forEach(t => t.stop())
          localStreamRef.current.getVideoTracks().forEach(t => {
            try { localStreamRef.current.removeTrack(t) } catch {}
          })
        }
      }
      setIsVideoEnabled(false)

      const pc = peerConnectionRef.current
      if (pc) {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video')
        if (sender) {
          if (liveScreenTrack) {
            await sender.replaceTrack(liveScreenTrack)
          } else {
            try { pc.removeTrack(sender) } catch {}
          }
          await sendOfferToPeer(pc)
        }
      }

      if (socket) socket.emit('call:video-toggle', { callId: activeCall.callId, enabled: false })
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
            await sender.replaceTrack(videoTrack)
          } else {
            peerConnectionRef.current.addTrack(videoTrack, localStreamRef.current)
          }
          await sendOfferToPeer(peerConnectionRef.current)
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
  }, [activeCall, isVideoEnabled, socket, sendOfferToPeer])

  const toggleScreenShare = useCallback(async () => {
    if (!activeCall) return

    if (isScreenSharing) {
      const activePc = peerConnectionRef.current
      const sender = activePc?.getSenders().find(s => s.track?.kind === 'video')
      const cameraTrack = localStreamRef.current?.getVideoTracks?.()[0] || null

      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop())
        screenStreamRef.current = null
      }
      setScreenStream(null)
      setIsScreenSharing(false)

      if (sender) {
        if (cameraTrack) {
          await sender.replaceTrack(cameraTrack)
        } else {
          try { activePc.removeTrack(sender) } catch {}
        }
        await sendOfferToPeer(activePc)
      }
      return
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 60 } },
        audio: false
      })
      const screenTrack = stream.getVideoTracks()[0]
      setScreenStream(stream)
      setIsScreenSharing(true)
      screenStreamRef.current = stream

      const pc = peerConnectionRef.current
      if (pc) {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video')
        if (sender) {
          await sender.replaceTrack(screenTrack)
        } else {
          pc.addTrack(screenTrack, stream)
        }
        await sendOfferToPeer(pc)
      }

      screenTrack.onended = () => {
        setIsScreenSharing(false)
        setScreenStream(null)
        screenStreamRef.current = null
        const activePc = peerConnectionRef.current
        const activeSender = activePc?.getSenders().find(s => s.track?.kind === 'video')
        const cameraTrack = localStreamRef.current?.getVideoTracks?.()[0] || null
        if (activeSender) {
          if (cameraTrack) activeSender.replaceTrack(cameraTrack).catch(() => {})
          else {
            try { activePc.removeTrack(activeSender) } catch {}
          }
          sendOfferToPeer(activePc)
        }
      }
    } catch (err) {
      if (err?.name !== 'NotAllowedError') {
        console.error('[Call] Failed to start screen share:', err)
      }
    }
  }, [activeCall, isScreenSharing, sendOfferToPeer])

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
        if (screenStreamRef.current) {
          screenStreamRef.current.getTracks().forEach(t => t.stop())
          screenStreamRef.current = null
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
        setScreenStream(null)
        setIsScreenSharing(false)
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
      setActiveCall(prev => ({
        ...prev,
        callId: data.callId,
        otherUserId: data.recipientId,
        otherUser: data.recipient || prev?.otherUser || null,
        participantIds: data.participantIds || prev?.participantIds || [],
        conversationId: data.conversationId,
        type: data.type || prev?.type || 'audio',
        isCaller: true
      }))
    }

    // Call accepted (caller side)
    const handleCallAccepted = async (data) => {
      console.log('[Call] Call accepted:', data)
      setCallStatus('connecting')
      const resolvedIce = normalizeIceServers(data.iceServers || [])
      setIceServers(resolvedIce)
      pendingIceCandidatesRef.current = []

      const currentCall = activeCallRef.current || {
        callId: data.callId,
        otherUserId: data.recipientId,
        otherUser: data.recipient || null,
        participantIds: data.participantIds || [],
        conversationId: data.conversationId,
        type: data.type || 'audio',
        isCaller: true
      }
      if (!activeCallRef.current) {
        setActiveCall(currentCall)
      } else {
        setActiveCall(prev => ({
          ...prev,
          callId: data.callId,
          otherUserId: data.recipientId || prev?.otherUserId,
          otherUser: data.recipient || prev?.otherUser || null,
          participantIds: data.participantIds || prev?.participantIds || []
        }))
      }

      // Get local stream
      const stream = await getLocalStream(currentCall.type === 'video')
      if (!stream) {
        endCall()
        return
      }

      // Create peer connection
      const pc = createPeerConnection(resolvedIce)

      // Add local tracks
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream)
      })

      // Create and send offer
      try {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        
        socket.emit('call:offer', {
          callId: data.callId || currentCall.callId,
          to: data.recipientId || currentCall.otherUserId,
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
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop())
        screenStreamRef.current = null
      }
      
      if (audioElementRef.current) {
        audioElementRef.current.pause()
        audioElementRef.current.srcObject = null
        if (audioElementRef.current.parentNode) {
          audioElementRef.current.parentNode.removeChild(audioElementRef.current)
        }
        audioElementRef.current = null
      }

      setIncomingCall(null)
      setCallStatus('ended')
      setCallDuration(0)
      setLocalStream(null)
      setRemoteStream(null)
      setScreenStream(null)
      setIsScreenSharing(false)
      pendingIceCandidatesRef.current = []
      
      if (data.reason === 'missed') {
        soundService.callDeclined()
      } else if (data.reason === 'declined') {
        soundService.callDeclined()
      } else {
        soundService.callEnded()
      }

      setTimeout(() => {
        if (callStatusRef.current === 'ended') {
          setActiveCall(null)
          setCallStatus('idle')
        }
      }, 8000)
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
      setScreenStream(null)
      setIsScreenSharing(false)
      pendingIceCandidatesRef.current = []
      
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
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop())
        screenStreamRef.current = null
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
        createPeerConnection(normalizeIceServers(data.iceServers || iceServers))
      }
      
      const pc = peerConnectionRef.current
      
      try {
        if (pc.signalingState !== 'stable') {
          try { await pc.setLocalDescription({ type: 'rollback' }) } catch {}
        }
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer))
        while (pendingIceCandidatesRef.current.length > 0) {
          const candidate = pendingIceCandidatesRef.current.shift()
          try { await pc.addIceCandidate(new RTCIceCandidate(candidate)) } catch {}
        }
        
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
        if (pc.signalingState !== 'have-local-offer') return
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer))
        while (pendingIceCandidatesRef.current.length > 0) {
          const candidate = pendingIceCandidatesRef.current.shift()
          try { await pc.addIceCandidate(new RTCIceCandidate(candidate)) } catch {}
        }
      } catch (err) {
        console.error('[Call] Failed to handle answer:', err)
      }
    }

    const handleCallIceCandidate = async (data) => {
      if (!data?.candidate) return
      const pc = peerConnectionRef.current
      if (!pc) {
        pendingIceCandidatesRef.current.push(data.candidate)
        return
      }
      
      try {
        if (!pc.remoteDescription) {
          pendingIceCandidatesRef.current.push(data.candidate)
          return
        }
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate))
      } catch (err) {
        console.error('[Call] Failed to add ICE candidate:', err)
      }
    }

    const handleParticipantJoined = (data) => {
      const current = activeCallRef.current
      if (!current || current.callId !== data.callId) return
      setActiveCall(prev => {
        if (!prev) return prev
        const nextIds = Array.from(new Set([...(prev.participantIds || []), data.userId].filter(Boolean)))
        return { ...prev, participantIds: nextIds }
      })
    }

    const handleParticipantLeft = async (data) => {
      const current = activeCallRef.current
      if (!current || current.callId !== data.callId) return

      const nextParticipantIds = (data.participantIds || []).filter(id => id && id !== user?.id)

      setActiveCall(prev => {
        if (!prev) return prev
        return { ...prev, participantIds: nextParticipantIds }
      })

      // If our current peer left, move to another remaining peer immediately.
      if (current.otherUserId === data.userId && nextParticipantIds.length > 0) {
        const nextPeerId = nextParticipantIds[0]
        console.log('[Call] Current peer left, switching to:', nextPeerId)
        pendingIceCandidatesRef.current = []

        if (peerConnectionRef.current) {
          try { peerConnectionRef.current.close() } catch {}
          peerConnectionRef.current = null
        }
        setRemoteStream(null)

        const stream = localStreamRef.current || await getLocalStream(current.type === 'video')
        if (!stream) return

        const pc = createPeerConnection(iceServers)
        stream.getTracks().forEach(track => pc.addTrack(track, stream))

        setActiveCall(prev => prev ? { ...prev, otherUserId: nextPeerId, otherUser: null } : prev)
        setCallStatus('connecting')

        await sendOfferToPeer(pc)
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
    socket.on('call:participant-joined', handleParticipantJoined)
    socket.on('call:participant-left', handleParticipantLeft)

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
      socket.off('call:participant-joined', handleParticipantJoined)
      socket.off('call:participant-left', handleParticipantLeft)
      
      stopRingtone()
      stopCallTimer()
    }
  }, [socket, activeCall, iceServers, callStatus, startRingtone, stopRingtone, stopCallTimer, getLocalStream, createPeerConnection, endCall, user?.id, sendOfferToPeer])

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
    isScreenSharing,
    callError,
    localStream,
    screenStream,
    remoteStream,
    
    // Actions
    initiateCall,
    acceptCall,
    declineCall,
    endCall,
    cancelCall,
    dismissEndedCall,
    toggleMute,
    toggleDeafen,
    toggleVideo,
    toggleScreenShare,
    
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
