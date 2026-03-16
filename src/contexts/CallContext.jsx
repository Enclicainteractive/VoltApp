import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useSocket } from './SocketContext'
import { useAuth } from './AuthContext'
import { soundService } from '../services/soundService'

const CallContext = createContext(null)

const DEFAULT_REMOTE_STATE = { muted: false, deafened: false, videoEnabled: false }
const CONNECTION_TIMEOUT_MS = 30000
const MAX_ICE_RESTARTS = 2

const AUDIO_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true
}

const VIDEO_CONSTRAINTS = {
  width: { ideal: 1280, max: 1920 },
  height: { ideal: 720, max: 1080 },
  frameRate: { ideal: 30, max: 30 },
  facingMode: 'user'
}

export const useCall = () => {
  const context = useContext(CallContext)
  if (!context) throw new Error('useCall must be used within a CallProvider')
  return context
}

export const CallProvider = ({ children }) => {
  const { socket, connected } = useSocket()
  const { user } = useAuth()

  const [incomingCall, setIncomingCall] = useState(null)
  const [activeCall, setActiveCall] = useState(null)
  const [callStatus, setCallStatus] = useState('idle')
  const [callDuration, setCallDuration] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [isDeafened, setIsDeafened] = useState(false)
  const [isVideoEnabled, setIsVideoEnabled] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [callError, setCallError] = useState(null)
  const [remoteMuteState, setRemoteMuteState] = useState(DEFAULT_REMOTE_STATE)
  const [iceServers, setIceServers] = useState([])
  const [localStream, setLocalStream] = useState(null)
  const [screenStream, setScreenStream] = useState(null)
  const [remoteStream, setRemoteStream] = useState(null)

  const activeCallRef = useRef(null)
  const incomingCallRef = useRef(null)
  const callStatusRef = useRef('idle')
  const peerConnectionRef = useRef(null)
  const localStreamRef = useRef(null)
  const screenStreamRef = useRef(null)
  const remoteTracksRef = useRef(new Map())
  const pendingIceCandidatesRef = useRef([])
  const makingOfferRef = useRef(false)
  const callTimerIntervalRef = useRef(null)
  const callStartTimeRef = useRef(null)
  const connectionTimeoutRef = useRef(null)
  const endOverlayTimeoutRef = useRef(null)
  const iceRestartAttemptsRef = useRef(0)

  useEffect(() => {
    activeCallRef.current = activeCall
  }, [activeCall])

  useEffect(() => {
    incomingCallRef.current = incomingCall
  }, [incomingCall])

  useEffect(() => {
    callStatusRef.current = callStatus
  }, [callStatus])

  const normalizeIceServers = useCallback((servers = []) => {
    const seen = new Set()
    return (Array.isArray(servers) ? servers : []).filter((server) => {
      const urls = Array.isArray(server?.urls) ? server.urls.join(',') : server?.urls
      if (!urls || seen.has(urls)) return false
      seen.add(urls)
      return true
    })
  }, [])

  const getDefaultIceServers = useCallback(() => ([
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
  ]), [])

  const clearConnectionTimeout = useCallback(() => {
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current)
      connectionTimeoutRef.current = null
    }
  }, [])

  const clearEndedOverlayTimeout = useCallback(() => {
    if (endOverlayTimeoutRef.current) {
      clearTimeout(endOverlayTimeoutRef.current)
      endOverlayTimeoutRef.current = null
    }
  }, [])

  const stopCallTimer = useCallback(() => {
    if (callTimerIntervalRef.current) {
      clearInterval(callTimerIntervalRef.current)
      callTimerIntervalRef.current = null
    }
    callStartTimeRef.current = null
  }, [])

  const startCallTimer = useCallback(() => {
    stopCallTimer()
    setCallDuration(0)
    callStartTimeRef.current = Date.now()
    callTimerIntervalRef.current = setInterval(() => {
      if (!callStartTimeRef.current) return
      setCallDuration(Math.floor((Date.now() - callStartTimeRef.current) / 1000))
    }, 1000)
  }, [stopCallTimer])

  const cloneStream = useCallback((stream) => {
    if (!stream) return null
    const tracks = stream.getTracks().filter((track) => track.readyState === 'live')
    return tracks.length > 0 ? new MediaStream(tracks) : null
  }, [])

  const publishLocalStream = useCallback(() => {
    setLocalStream(cloneStream(localStreamRef.current))
  }, [cloneStream])

  const publishScreenStream = useCallback(() => {
    setScreenStream(cloneStream(screenStreamRef.current))
  }, [cloneStream])

  const rebuildRemoteStream = useCallback(() => {
    const tracks = Array.from(remoteTracksRef.current.values()).filter((track) => track.readyState === 'live')
    const nextRemoteStream = tracks.length > 0 ? new MediaStream(tracks) : null
    setRemoteStream(nextRemoteStream)
    setRemoteMuteState((prev) => ({ ...prev, videoEnabled: tracks.some((track) => track.kind === 'video') }))
  }, [])

  const stopStream = useCallback((stream) => {
    stream?.getTracks?.().forEach((track) => {
      try { track.stop() } catch {}
    })
  }, [])

  const clearRemoteTracks = useCallback(() => {
    remoteTracksRef.current.clear()
    setRemoteStream(null)
    setRemoteMuteState(DEFAULT_REMOTE_STATE)
  }, [])

  const closePeerConnection = useCallback(() => {
    if (peerConnectionRef.current) {
      try {
        peerConnectionRef.current.ontrack = null
        peerConnectionRef.current.onicecandidate = null
        peerConnectionRef.current.onconnectionstatechange = null
        peerConnectionRef.current.oniceconnectionstatechange = null
        peerConnectionRef.current.close()
      } catch {}
      peerConnectionRef.current = null
    }
    pendingIceCandidatesRef.current = []
    makingOfferRef.current = false
    iceRestartAttemptsRef.current = 0
    clearRemoteTracks()
  }, [clearRemoteTracks])

  const resetCallState = useCallback(({ status = 'idle', keepActiveCall = false, keepError = false } = {}) => {
    clearConnectionTimeout()
    clearEndedOverlayTimeout()
    stopCallTimer()
    soundService.stopRingtone()
    closePeerConnection()
    stopStream(localStreamRef.current)
    stopStream(screenStreamRef.current)
    localStreamRef.current = null
    screenStreamRef.current = null
    setLocalStream(null)
    setScreenStream(null)
    setRemoteStream(null)
    setCallDuration(0)
    setIsMuted(false)
    setIsDeafened(false)
    setIsVideoEnabled(false)
    setIsScreenSharing(false)
    setRemoteMuteState(DEFAULT_REMOTE_STATE)
    setIceServers([])
    if (!keepActiveCall) setActiveCall(null)
    if (!keepError) setCallError(null)
    setIncomingCall(null)
    setCallStatus(status)
  }, [clearConnectionTimeout, clearEndedOverlayTimeout, stopCallTimer, closePeerConnection, stopStream])

  const dismissEndedCall = useCallback(() => {
    resetCallState({ status: 'idle' })
  }, [resetCallState])

  const finishCall = useCallback((reason = 'ended') => {
    const currentCall = activeCallRef.current
    resetCallState({ status: 'ended', keepActiveCall: !!currentCall, keepError: true })

    if (reason === 'missed' || reason === 'declined') soundService.callDeclined()
    else soundService.callEnded()

    clearEndedOverlayTimeout()
    endOverlayTimeoutRef.current = setTimeout(() => {
      if (callStatusRef.current === 'ended') {
        resetCallState({ status: 'idle' })
      }
    }, 5000)
  }, [clearEndedOverlayTimeout, resetCallState])

  const markCallActive = useCallback(() => {
    if (callStatusRef.current === 'active') return
    clearConnectionTimeout()
    setCallStatus('active')
    startCallTimer()
    soundService.callConnected()
  }, [clearConnectionTimeout, startCallTimer])

  const maybeMarkCallActiveFromPeer = useCallback((pc) => {
    if (!pc || !activeCallRef.current) return

    const connState = pc.connectionState
    const iceState = pc.iceConnectionState
    const hasRemoteDescription = Boolean(pc.remoteDescription)
    const hasLiveRemoteTrack = Array.from(remoteTracksRef.current.values()).some((track) => track.readyState === 'live')

    if (connState === 'failed' || connState === 'closed') return
    if (iceState === 'failed' || iceState === 'closed') return

    if (
      connState === 'connected' ||
      iceState === 'connected' ||
      iceState === 'completed' ||
      (hasRemoteDescription && hasLiveRemoteTrack)
    ) {
      markCallActive()
    }
  }, [markCallActive])

  const startConnectionTimeout = useCallback(() => {
    clearConnectionTimeout()
    connectionTimeoutRef.current = setTimeout(() => {
      if (callStatusRef.current !== 'connecting') return
      const currentCall = activeCallRef.current
      if (currentCall?.callId && socket?.connected) {
        socket.emit('call:end', { callId: currentCall.callId, reason: 'timeout' })
      }
      setCallError('Call connection timed out.')
      finishCall('timeout')
    }, CONNECTION_TIMEOUT_MS)
  }, [clearConnectionTimeout, finishCall, socket])

  const createInitialLocalStream = useCallback(async (withVideo = false) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: AUDIO_CONSTRAINTS,
        video: withVideo ? VIDEO_CONSTRAINTS : false
      })
      localStreamRef.current = stream
      setIsMuted(false)
      setIsVideoEnabled(stream.getVideoTracks().length > 0)
      publishLocalStream()
      return stream
    } catch (error) {
      console.error('[Call] Failed to get local media:', error)
      setCallError(withVideo ? 'Camera or microphone access was denied.' : 'Microphone access was denied.')
      return null
    }
  }, [publishLocalStream])

  const ensureAudioStream = useCallback(async () => {
    if (localStreamRef.current?.getAudioTracks().length) return localStreamRef.current

    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS, video: false })
      if (!localStreamRef.current) {
        localStreamRef.current = audioStream
      } else {
        audioStream.getAudioTracks().forEach((track) => localStreamRef.current.addTrack(track))
      }
      publishLocalStream()
      return localStreamRef.current
    } catch (error) {
      console.error('[Call] Failed to acquire audio track:', error)
      setCallError('Microphone access was denied.')
      return null
    }
  }, [publishLocalStream])

  const ensureCameraTrack = useCallback(async () => {
    const currentTrack = localStreamRef.current?.getVideoTracks?.().find((track) => track.readyState === 'live') || null
    if (currentTrack) return currentTrack

    try {
      const cameraStream = await navigator.mediaDevices.getUserMedia({ video: VIDEO_CONSTRAINTS })
      const [cameraTrack] = cameraStream.getVideoTracks()
      if (!cameraTrack) return null

      if (!localStreamRef.current) {
        const baseStream = await ensureAudioStream()
        if (!baseStream) {
          stopStream(cameraStream)
          return null
        }
      }

      localStreamRef.current.addTrack(cameraTrack)
      publishLocalStream()
      setIsVideoEnabled(true)
      return cameraTrack
    } catch (error) {
      console.error('[Call] Failed to acquire camera track:', error)
      setCallError('Camera access was denied.')
      return null
    }
  }, [ensureAudioStream, publishLocalStream, stopStream])

  const removeCameraTrack = useCallback(() => {
    const cameraTracks = localStreamRef.current?.getVideoTracks?.() || []
    cameraTracks.forEach((track) => {
      try { localStreamRef.current.removeTrack(track) } catch {}
      try { track.stop() } catch {}
    })
    publishLocalStream()
  }, [publishLocalStream])

  const flushPendingIceCandidates = useCallback(async (pc) => {
    if (!pc?.remoteDescription) return
    while (pendingIceCandidatesRef.current.length > 0) {
      const candidate = pendingIceCandidatesRef.current.shift()
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (error) {
        console.warn('[Call] Failed to flush ICE candidate:', error)
      }
    }
  }, [])

  const createAndSendOffer = useCallback(async (pc, { iceRestart = false } = {}) => {
    const currentCall = activeCallRef.current
    if (!pc || !socket || !currentCall?.callId || !currentCall?.otherUserId) return
    if (makingOfferRef.current || pc.signalingState !== 'stable') return

    try {
      makingOfferRef.current = true
      const offer = await pc.createOffer(iceRestart ? { iceRestart: true } : undefined)
      if (pc.signalingState !== 'stable') return
      await pc.setLocalDescription(offer)
      socket.emit('call:offer', {
        callId: currentCall.callId,
        to: currentCall.otherUserId,
        offer: pc.localDescription
      })
    } catch (error) {
      console.error('[Call] Failed to create offer:', error)
      setCallError('Failed to renegotiate the call.')
    } finally {
      makingOfferRef.current = false
    }
  }, [socket])

  const replaceOutgoingVideoTrack = useCallback(async (nextTrack, sourceStream = null) => {
    const pc = peerConnectionRef.current
    if (!pc) return

    const sender = pc.getSenders().find((entry) => entry.track?.kind === 'video')

    try {
      if (nextTrack) {
        if (sender) {
          await sender.replaceTrack(nextTrack)
        } else {
          pc.addTrack(nextTrack, sourceStream || new MediaStream([nextTrack]))
          await createAndSendOffer(pc)
        }
      } else if (sender) {
        try { await sender.replaceTrack(null) } catch {}
        try { pc.removeTrack(sender) } catch {}
        await createAndSendOffer(pc)
      }
    } catch (error) {
      console.error('[Call] Failed to update outgoing video track:', error)
      setCallError('Failed to update video for this call.')
    }
  }, [createAndSendOffer])

  const createPeerConnection = useCallback((serverIceServers = []) => {
    closePeerConnection()

    const resolvedIceServers = normalizeIceServers(serverIceServers)
    const fallbackIceServers = normalizeIceServers(getDefaultIceServers())
    const nextIceServers = resolvedIceServers.length > 0 ? resolvedIceServers : fallbackIceServers
    setIceServers(nextIceServers)

    const pc = new RTCPeerConnection({
      iceServers: nextIceServers,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceCandidatePoolSize: 4
    })

    peerConnectionRef.current = pc
    iceRestartAttemptsRef.current = 0

    pc.onicecandidate = (event) => {
      const currentCall = activeCallRef.current
      if (!event.candidate || !currentCall?.callId || !currentCall?.otherUserId || !socket) return
      socket.emit('call:ice-candidate', {
        callId: currentCall.callId,
        to: currentCall.otherUserId,
        candidate: event.candidate.toJSON()
      })
    }

    pc.ontrack = (event) => {
      remoteTracksRef.current.set(event.track.id, event.track)
      rebuildRemoteStream()
      maybeMarkCallActiveFromPeer(pc)

      event.track.onended = () => {
        remoteTracksRef.current.delete(event.track.id)
        rebuildRemoteStream()
      }
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        markCallActive()
      } else if (pc.connectionState === 'connecting') {
        maybeMarkCallActiveFromPeer(pc)
      } else if (pc.connectionState === 'failed') {
        setCallError('The peer connection failed.')
        finishCall('failed')
      } else if (pc.connectionState === 'closed') {
        clearConnectionTimeout()
      }
    }

    pc.oniceconnectionstatechange = async () => {
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        iceRestartAttemptsRef.current = 0
        markCallActive()
        return
      }

      if (pc.iceConnectionState === 'checking') {
        maybeMarkCallActiveFromPeer(pc)
      }

      if ((pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') && iceRestartAttemptsRef.current < MAX_ICE_RESTARTS) {
        iceRestartAttemptsRef.current += 1
        try {
          await createAndSendOffer(pc, { iceRestart: true })
        } catch {}
      }
    }

    return pc
  }, [clearConnectionTimeout, closePeerConnection, createAndSendOffer, finishCall, getDefaultIceServers, markCallActive, maybeMarkCallActiveFromPeer, normalizeIceServers, rebuildRemoteStream, socket])

  const attachLocalTracksToPeer = useCallback((pc, stream) => {
    stream.getTracks().forEach((track) => {
      const sender = pc.getSenders().find((entry) => entry.track?.id === track.id)
      if (!sender) pc.addTrack(track, stream)
    })
  }, [])

  const beginSession = useCallback(async ({ call, iceServers: sessionIceServers = [], createOffer = false }) => {
    setCallError(null)
    setActiveCall(call)
    setCallStatus('connecting')
    startConnectionTimeout()

    const stream = await createInitialLocalStream(call.type === 'video')
    if (!stream) {
      resetCallState({ status: 'idle', keepActiveCall: false, keepError: true })
      return null
    }

    const pc = createPeerConnection(sessionIceServers)
    attachLocalTracksToPeer(pc, stream)

    if (createOffer) {
      await createAndSendOffer(pc)
    }

    return pc
  }, [attachLocalTracksToPeer, createAndSendOffer, createInitialLocalStream, createPeerConnection, resetCallState, startConnectionTimeout])

  const initiateCall = useCallback((recipientId, conversationId, type = 'audio', recipient = null, participantIds = null) => {
    if (!socket || !connected) {
      setCallError('Not connected to server.')
      return
    }

    if (!recipientId || !conversationId) {
      setCallError('Missing conversation details for this call.')
      return
    }

    resetCallState({ status: 'idle' })
    setCallError(null)

    const nextCall = {
      callId: null,
      otherUserId: recipientId,
      otherUser: recipient || null,
      conversationId,
      type,
      participantIds: Array.isArray(participantIds) ? participantIds : [],
      isCaller: true
    }

    setActiveCall(nextCall)
    setCallStatus('ringing')

    socket.emit('call:initiate', {
      recipientId,
      participantIds: Array.isArray(participantIds) && participantIds.length > 0 ? participantIds : undefined,
      conversationId,
      type
    })
  }, [connected, resetCallState, socket])

  const acceptCall = useCallback(async () => {
    if (!incomingCallRef.current || !socket) return

    soundService.stopRingtone()
    const call = {
      callId: incomingCallRef.current.callId,
      otherUserId: incomingCallRef.current.caller?.id,
      otherUser: incomingCallRef.current.caller || null,
      conversationId: incomingCallRef.current.conversationId,
      type: incomingCallRef.current.type || 'audio',
      participantIds: incomingCallRef.current.participantIds || [],
      isCaller: false
    }

    setIncomingCall(null)
    const pc = await beginSession({
      call,
      iceServers: incomingCallRef.current.iceServers || [],
      createOffer: false
    })

    if (!pc) return
    socket.emit('call:accept', { callId: call.callId })
  }, [beginSession, socket])

  const declineCall = useCallback(() => {
    if (!incomingCallRef.current || !socket) return
    soundService.stopRingtone()
    socket.emit('call:decline', { callId: incomingCallRef.current.callId })
    resetCallState({ status: 'idle' })
    soundService.callDeclined()
  }, [resetCallState, socket])

  const cancelCall = useCallback(() => {
    const currentCall = activeCallRef.current
    if (!currentCall || !socket) return
    if (currentCall.callId) socket.emit('call:cancel', { callId: currentCall.callId })
    resetCallState({ status: 'idle' })
    soundService.callLeft()
  }, [resetCallState, socket])

  const endCall = useCallback(() => {
    const currentCall = activeCallRef.current
    if (!currentCall || !socket) return
    if (currentCall.callId) socket.emit('call:end', { callId: currentCall.callId })
    finishCall('ended')
  }, [finishCall, socket])

  const emitRemoteState = useCallback((nextState) => {
    const currentCall = activeCallRef.current
    if (!socket || !currentCall?.callId) return
    socket.emit('call:state-change', { callId: currentCall.callId, ...nextState })
  }, [socket])

  const toggleMute = useCallback(() => {
    const nextMuted = !isMuted
    setIsMuted(nextMuted)
    localStreamRef.current?.getAudioTracks?.().forEach((track) => {
      track.enabled = !nextMuted
    })
    emitRemoteState({ muted: nextMuted })
    soundService[nextMuted ? 'mute' : 'unmute']()
  }, [emitRemoteState, isMuted])

  const toggleDeafen = useCallback(() => {
    const nextDeafened = !isDeafened
    setIsDeafened(nextDeafened)
    emitRemoteState({ deafened: nextDeafened })
    soundService[nextDeafened ? 'deafen' : 'undeafen']()
  }, [emitRemoteState, isDeafened])

  const toggleVideo = useCallback(async () => {
    if (!activeCallRef.current) return

    if (isVideoEnabled) {
      removeCameraTrack()
      setIsVideoEnabled(false)
      emitRemoteState({ videoEnabled: isScreenSharing })

      if (!isScreenSharing) {
        await replaceOutgoingVideoTrack(null)
      }

      soundService.cameraOff()
      return
    }

    const cameraTrack = await ensureCameraTrack()
    if (!cameraTrack) return

    if (!isScreenSharing) {
      await replaceOutgoingVideoTrack(cameraTrack, localStreamRef.current)
    }

    setIsVideoEnabled(true)
    emitRemoteState({ videoEnabled: true })
    soundService.cameraOn()
  }, [emitRemoteState, ensureCameraTrack, isScreenSharing, isVideoEnabled, removeCameraTrack, replaceOutgoingVideoTrack])

  const toggleScreenShare = useCallback(async () => {
    if (!activeCallRef.current) return

    if (isScreenSharing) {
      stopStream(screenStreamRef.current)
      screenStreamRef.current = null
      publishScreenStream()
      setIsScreenSharing(false)

      const cameraTrack = localStreamRef.current?.getVideoTracks?.().find((track) => track.readyState === 'live') || null
      await replaceOutgoingVideoTrack(cameraTrack, localStreamRef.current)
      emitRemoteState({ videoEnabled: !!cameraTrack })
      soundService.screenShareStop?.()
      return
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 30 } },
        audio: false
      })

      const [screenTrack] = stream.getVideoTracks()
      if (!screenTrack) {
        stopStream(stream)
        return
      }

      screenStreamRef.current = stream
      publishScreenStream()
      setIsScreenSharing(true)
      await replaceOutgoingVideoTrack(screenTrack, stream)
      emitRemoteState({ videoEnabled: true })
      soundService.screenShareStart?.()

      screenTrack.onended = () => {
        const cameraTrack = localStreamRef.current?.getVideoTracks?.().find((track) => track.readyState === 'live') || null
        stopStream(screenStreamRef.current)
        screenStreamRef.current = null
        publishScreenStream()
        setIsScreenSharing(false)
        replaceOutgoingVideoTrack(cameraTrack, localStreamRef.current).catch(() => {})
        emitRemoteState({ videoEnabled: !!cameraTrack })
      }
    } catch (error) {
      if (error?.name !== 'NotAllowedError') {
        console.error('[Call] Failed to start screen sharing:', error)
        setCallError('Failed to start screen sharing.')
      }
    }
  }, [emitRemoteState, isScreenSharing, publishScreenStream, replaceOutgoingVideoTrack, stopStream])

  useEffect(() => {
    if (!socket) return

    const handleIncomingCall = (payload) => {
      if (!payload?.callId) return

      if (activeCallRef.current || callStatusRef.current !== 'idle') {
        socket.emit('call:decline', { callId: payload.callId, reason: 'busy' })
        return
      }

      setCallError(null)
      setIncomingCall(payload)
      setCallStatus('ringing')
      soundService.startRingtone()
    }

    const handleCallRinging = (payload) => {
      setActiveCall((prev) => ({
        ...(prev || {}),
        callId: payload.callId,
        otherUserId: payload.recipientId || prev?.otherUserId || null,
        otherUser: payload.recipient || prev?.otherUser || null,
        participantIds: payload.participantIds || prev?.participantIds || [],
        conversationId: payload.conversationId || prev?.conversationId || null,
        type: payload.type || prev?.type || 'audio',
        isCaller: true
      }))
    }

    const handleCallAccepted = async (payload) => {
      const current = activeCallRef.current || {
        callId: payload.callId,
        otherUserId: payload.recipientId,
        otherUser: payload.recipient || null,
        conversationId: payload.conversationId,
        type: payload.type || 'audio',
        participantIds: payload.participantIds || [],
        isCaller: true
      }

      await beginSession({
        call: {
          ...current,
          callId: payload.callId || current.callId,
          otherUserId: payload.recipientId || current.otherUserId,
          otherUser: payload.recipient || current.otherUser || null,
          participantIds: payload.participantIds || current.participantIds || []
        },
        iceServers: payload.iceServers || [],
        createOffer: true
      })
    }

    const handleCallConnected = (payload) => {
      if (payload?.iceServers) {
        setIceServers(normalizeIceServers(payload.iceServers))
      }
      maybeMarkCallActiveFromPeer(peerConnectionRef.current)
    }

    const handleCallEnded = (payload) => {
      finishCall(payload?.reason || 'ended')
    }

    const handleCallMissed = () => {
      resetCallState({ status: 'idle' })
      soundService.callDeclined()
    }

    const handleCallError = (payload) => {
      setCallError(payload?.error || 'Call failed.')
      resetCallState({ status: 'idle', keepError: true })
    }

    const handleCallOffer = async (payload) => {
      const active = activeCallRef.current
      if (!active) return

      let pc = peerConnectionRef.current
      if (!pc) {
        const stream = localStreamRef.current || await createInitialLocalStream(active.type === 'video')
        if (!stream) return
        pc = createPeerConnection(payload.iceServers || iceServers)
        attachLocalTracksToPeer(pc, stream)
      }

      const shouldTreatAsInitialConnection = callStatusRef.current !== 'active'
      if (shouldTreatAsInitialConnection) {
        setCallStatus('connecting')
        startConnectionTimeout()
      } else {
        clearConnectionTimeout()
      }

      try {
        if (pc.signalingState !== 'stable') {
          try { await pc.setLocalDescription({ type: 'rollback' }) } catch {}
        }

        await pc.setRemoteDescription(new RTCSessionDescription(payload.offer))
        await flushPendingIceCandidates(pc)
        maybeMarkCallActiveFromPeer(pc)

        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)

        socket.emit('call:answer', {
          callId: payload.callId,
          to: payload.from,
          answer: pc.localDescription
        })
      } catch (error) {
        console.error('[Call] Failed to handle offer:', error)
        setCallError('Failed to handle the incoming connection.')
      }
    }

    const handleCallAnswer = async (payload) => {
      const pc = peerConnectionRef.current
      if (!pc || !payload?.answer) return

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.answer))
        await flushPendingIceCandidates(pc)
        maybeMarkCallActiveFromPeer(pc)
      } catch (error) {
        console.error('[Call] Failed to handle answer:', error)
        setCallError('Failed to finish connecting the call.')
      }
    }

    const handleCallIceCandidate = async (payload) => {
      if (!payload?.candidate) return
      const pc = peerConnectionRef.current

      if (!pc || !pc.remoteDescription) {
        pendingIceCandidatesRef.current.push(payload.candidate)
        return
      }

      try {
        await pc.addIceCandidate(new RTCIceCandidate(payload.candidate))
        maybeMarkCallActiveFromPeer(pc)
      } catch (error) {
        console.warn('[Call] Failed to add ICE candidate:', error)
      }
    }

    const handleParticipantJoined = (payload) => {
      setActiveCall((prev) => {
        if (!prev || prev.callId !== payload.callId) return prev
        const nextParticipantIds = Array.from(new Set([...(prev.participantIds || []), payload.userId].filter(Boolean)))
        return { ...prev, participantIds: nextParticipantIds }
      })
    }

    const handleParticipantLeft = (payload) => {
      setActiveCall((prev) => {
        if (!prev || prev.callId !== payload.callId) return prev
        return { ...prev, participantIds: payload.participantIds || [] }
      })
    }

    const handleRemoteStateChange = (payload) => {
      const current = activeCallRef.current
      if (!current || current.callId !== payload.callId) return
      setRemoteMuteState((prev) => ({
        muted: payload.muted ?? prev.muted,
        deafened: payload.deafened ?? prev.deafened,
        videoEnabled: payload.videoEnabled ?? prev.videoEnabled
      }))
    }

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
    socket.on('call:state-change', handleRemoteStateChange)

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
      socket.off('call:state-change', handleRemoteStateChange)
    }
  }, [
    attachLocalTracksToPeer,
    beginSession,
    clearConnectionTimeout,
    createInitialLocalStream,
    createPeerConnection,
    finishCall,
    flushPendingIceCandidates,
    iceServers,
    maybeMarkCallActiveFromPeer,
    normalizeIceServers,
    resetCallState,
    socket,
    startConnectionTimeout
  ])

  useEffect(() => {
    return () => {
      resetCallState({ status: 'idle' })
    }
  }, [resetCallState])

  const formatDuration = useCallback((seconds) => {
    const safeSeconds = Number.isFinite(seconds) ? seconds : 0
    const mins = Math.floor(safeSeconds / 60)
    const secs = safeSeconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }, [])

  const value = {
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
    remoteMuteState,
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
