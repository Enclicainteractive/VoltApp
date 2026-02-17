import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Mic, MicOff, Headphones, VolumeX, PhoneOff, Settings, Volume2, Video, VideoOff, Monitor, MonitorOff, Ghost } from 'lucide-react'
import { useSocket } from '../contexts/SocketContext'
import { useAuth } from '../contexts/AuthContext'
import { settingsService } from '../services/settingsService'
import { soundService } from '../services/soundService'
import Avatar from './Avatar'
import '../assets/styles/VoiceChannel.css'

const ICE_SERVERS = {
  iceServers: [
    // Google
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun1.google.com:19302' },
    { urls: 'stun:stun2.google.com:19302' },
    { urls: 'stun:stun3.google.com:19302' },
    { urls: 'stun:stun4.google.com:19302' },
    // Twilio
    { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: 'stun:n1.stun.twilio.com:3478' },
    { urls: 'stun:n2.stun.twilio.com:3478' },
    // STUN Protocol
    { urls: 'stun:stun.stunprotocol.org:3478' },
    { urls: 'stun:stun.stunprotocol.org:3479' },
    // VoIP providers
    { urls: 'stun:stun.12connect.com:3478' },
    { urls: 'stun:stun.12voip.com:3478' },
    { urls: 'stun:stun.1und1.de:3478' },
    { urls: 'stun:stun.3cx.com:3478' },
    { urls: 'stun:stun.acrobits.cz:3478' },
    { urls: 'stun:stun.antisip.com:3478' },
    { urls: 'stun:stun.b2b2.com:3478' },
    { urls: 'stun:stun.benoc.co.za:3478' },
    { urls: 'stun:stun.budgetphone.nl:3478' },
    { urls: 'stun:stun.budgetphone.eu:3478' },
    { urls: 'stun:stun.callromania.ro:3478' },
    { urls: 'stun:stun.cesnet.cz:3478' },
    { urls: 'stun:stun.coloured.nl:3478' },
    { urls: 'stun:stun.comtube.com:3478' },
    { urls: 'stun:stun.cope.es:3478' },
    { urls: 'stun:stun.dariofl.com:3478' },
    { urls: 'stun:stun.demos.de:3478' },
    { urls: 'stun:stun.doctorg.com:3478' },
    { urls: 'stun:stun.e-fon.ch:3478' },
    { urls: 'stun:stun.easybell.de:3478' },
    { urls: 'stun:stun.elastix.org:3478' },
    { urls: 'stun:stun.faktortel.com.au:3478' },
    { urls: 'stun:stun.freephoneline.ca:3478' },
    { urls: 'stun:stun.freeswitch.org:3478' },
    { urls: 'stun:stun.gnax.net:3478' },
    { urls: 'stun:stun.halonet.pl:3478' },
    { urls: 'stun:stun.cheapvoip.com:3478' },
    { urls: 'stun:stun.voip.aebc.com:3478' },
    { urls: 'stun:stun.voiparound.com:3478' },
    { urls: 'stun:stun.voipblast.com:3478' },
    { urls: 'stun:stun.voipdiscount.com:3478' },
    { urls: 'stun:stun.voipgate.com:3478' },
    { urls: 'stun:stun.voipms.com:3478' },
    { urls: 'stun:stun.voipplanet.nl:3478' },
    { urls: 'stun:stun.voipraider.com:3478' },
    { urls: 'stun:stun.voiprush.com:3478' },
    { urls: 'stun:stun.voys.nl:3478' },
    { urls: 'stun:stun.zoiper.com:3478' },
    // Other public servers
    { urls: 'stun:stun.ideasip.com:3478' },
    { urls: 'stun:stun01.ideasip.com:3478' },
    { urls: 'stun:stun02.ideasip.com:3478' },
    { urls: 'stun:stun.iptel.org:3478' },
    { urls: 'stun:stun1.iptel.org:3478' },
    { urls: 'stun:stun2.iptel.org:3478' },
    { urls: 'stun:stun.linphone.org:3478' },
    { urls: 'stun:stun1.linphone.org:3478' },
    { urls: 'stun:stun2.linphone.org:3478' },
    { urls: 'stun:stun.mit.edu:3478' },
    { urls: 'stun:stun1.mit.edu:3478' },
    { urls: 'stun:stun2.mit.edu:3478' },
    { urls: 'stun:stunserver.org:3478' },
    { urls: 'stun:stun.creepylabs.com:3478' },
    { urls: 'stun:stun.babiel.com:3478' }
  ],
  iceCandidatePoolSize: 10
}

const PEER_CONNECTION_CONFIG = {
  ...ICE_SERVERS,
  bundlePolicy: 'max-compat',
  rtcpMuxPolicy: 'require'
}

const VoiceChannel = ({ channel, onLeave, isMuted: externalMuted, isDeafened: externalDeafened, onMuteChange, onDeafenChange, onOpenSettings }) => {
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
  
  const peerConnections = useRef({})
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

  const createPeerConnection = useCallback((targetUserId) => {
    if (peerConnections.current[targetUserId]) {
      return peerConnections.current[targetUserId]
    }

    const pc = new RTCPeerConnection(PEER_CONNECTION_CONFIG)
    peerConnections.current[targetUserId] = pc

    pc.onicecandidate = (event) => {
      if (event.candidate && channelIdRef.current) {
        console.log('[WebRTC] ICE candidate for:', targetUserId)
        socket?.emit('voice:ice-candidate', {
          to: targetUserId,
          candidate: event.candidate,
          channelId: channelIdRef.current
        })
      }
    }

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams
      remoteStreams.current[targetUserId] = remoteStream

      if (event.track.kind === 'audio') {
        if (!audioElements.current[targetUserId]) {
          const audio = new Audio()
          audio.autoplay = true
          audioElements.current[targetUserId] = audio
        }
        audioElements.current[targetUserId].srcObject = remoteStream
        
        const settings = settingsService.getSettings()
        audioElements.current[targetUserId].volume = settings.volume / 100
        audioElements.current[targetUserId].muted = settings.muteAll
        
        audioElements.current[targetUserId].play().catch(err => {
          console.log('[WebRTC] Audio play failed (user gesture needed):', err)
        })
      }

      if (event.track.kind === 'video') {
        setParticipants(prev => prev.map(p => 
          p.id === targetUserId ? { ...p, hasVideo: true, videoStream: remoteStream } : p
        ))
      }
    }

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state with ${targetUserId}:`, pc.connectionState)
    }

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE connection state with ${targetUserId}:`, pc.iceConnectionState)
    }

    pc.onicegatheringstatechange = () => {
      console.log(`[WebRTC] ICE gathering state with ${targetUserId}:`, pc.iceGatheringState)
    }

    const addTracksToPc = (pc) => {
      const audioStream = localStreamRef.current
      if (audioStream) {
        audioStream.getTracks().forEach(track => {
          pc.addTrack(track, audioStream)
        })
      }

      const videoStream = localVideoStreamRef.current
      if (videoStream) {
        const videoTrack = videoStream.getVideoTracks()[0]
        if (videoTrack) {
          pc.addTrack(videoTrack, videoStream)
        }
      }

      const screen = screenStreamRef.current
      if (screen) {
        const screenVideoTrack = screen.getVideoTracks()[0]
        if (screenVideoTrack) {
          pc.addTrack(screenVideoTrack, screen)
        }
        const screenAudioTrack = screen.getAudioTracks()[0]
        if (screenAudioTrack) {
          pc.addTrack(screenAudioTrack, screen)
        }
      }
    }

    addTracksToPc(pc)

    const checkForStreams = setInterval(() => {
      addTracksToPc(pc)
    }, 1000)
    setTimeout(() => clearInterval(checkForStreams), 15000)

    return pc
  }, [socket, channel?.id])

  const initiateCall = useCallback(async (targetUserId) => {
    console.log('[WebRTC] initiateCall called for:', targetUserId, 'socket connected:', socket?.connected)
    const pc = createPeerConnection(targetUserId)
    
    try {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      
      if (channelIdRef.current) {
        console.log('[WebRTC] Emitting offer to:', targetUserId, 'channel:', channelIdRef.current)
        socket?.emit('voice:offer', {
          to: targetUserId,
          offer: pc.localDescription,
          channelId: channelIdRef.current
        })
      } else {
        console.log('[WebRTC] channelIdRef.current is null, cannot emit offer')
      }
    } catch (err) {
      console.error('[WebRTC] Failed to create offer:', err)
    }
  }, [createPeerConnection, socket, channel?.id])

  useEffect(() => {
    if (!socket || !channel) return
    
    // Prevent multiple concurrent initializations or re-init after joined
    // Only allow re-init if the channel actually changed
    const channelChanged = initializedChannelIdRef.current !== channel.id
    if ((hasJoinedRef.current || isInitializingRef.current) && !channelChanged) {
      console.log('[Voice] Skipping init - already joined or initializing, channel unchanged')
      return
    }
    
    // If we're joining a different channel, do full cleanup first
    if (hasJoinedRef.current && channelChanged) {
      console.log('[Voice] Channel changed, cleaning up previous session')
      // Close existing peer connections
      Object.values(peerConnections.current).forEach(pc => {
        try { pc.close() } catch (e) {}
      })
      peerConnections.current = {}
      
      // Clean up audio elements
      Object.values(audioElements.current).forEach(audio => {
        if (audio.srcObject) {
          audio.srcObject = null
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
      
      // Reset state
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
        
        // Play join sound for self
        soundService.userJoined()
        
        // Resume audio context on user interaction (required by browsers)
        const resumeAudio = () => {
          if (analyserRef.current?.audioContext?.state === 'suspended') {
            analyserRef.current.audioContext.resume().catch(() => {})
          }
          // Try to play all audio elements
          Object.values(audioElements.current).forEach(audio => {
            if (audio.paused) {
              audio.play().catch(() => {})
            }
          })
        }
        
        document.addEventListener('click', resumeAudio, { once: true })
        document.addEventListener('keydown', resumeAudio, { once: true })
        
        // Request current participants in the channel
        socket.emit('voice:get-participants', { channelId: channel.id })
        
        socket.emit('voice:join', { 
          channelId: channel.id,
          peerId: user.id
        })
        soundService.userJoined()
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
      if (data.channelId === channelIdRef.current) {
        setParticipants(data.participants || [])
        data.participants?.forEach(p => {
          if (p.id !== user.id && !peerConnections.current[p.id]) {
            setTimeout(() => initiateCall(p.id), 500)
          }
        })
      }
    })

    socket.on('voice:user-joined', (userInfo) => {
      setParticipants(prev => {
        if (prev.find(p => p.id === userInfo.id)) return prev
        return [...prev, userInfo]
      })
      
      if (userInfo.id !== user.id) {
        // Play user joined sound
        soundService.userJoined()
        setTimeout(() => initiateCall(userInfo.id), 500)
      }
    })

    socket.on('voice:offer', async (data) => {
      const { from, offer } = data
      console.log('[WebRTC] Received offer from:', from)
      const pc = createPeerConnection(from)
      
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        
        console.log('[WebRTC] Emitting answer to:', from)
        socket.emit('voice:answer', {
          to: from,
          answer: pc.localDescription,
          channelId: channelIdRef.current
        })
      } catch (err) {
        console.error('[WebRTC] Failed to handle offer:', err)
      }
    })

    socket.on('voice:answer', async (data) => {
      const { from, answer } = data
      const pc = peerConnections.current[from]
      
      if (pc && pc.signalingState !== 'stable') {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer))
        } catch (err) {
          console.error('[WebRTC] Failed to set remote description:', err)
        }
      }
    })

    socket.on('voice:ice-candidate', async (data) => {
      const { from, candidate } = data
      const pc = peerConnections.current[from]
      
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate))
        } catch (err) {
          console.error('[WebRTC] Failed to add ICE candidate:', err)
        }
      }
    })

    socket.on('voice:user-left', ({ userId }) => {
      setParticipants(prev => prev.filter(p => p.id !== userId))
      
      // Play user left sound
      soundService.userLeft()
      
      if (peerConnections.current[userId]) {
        peerConnections.current[userId].close()
        delete peerConnections.current[userId]
      }
      if (audioElements.current[userId]) {
        audioElements.current[userId].srcObject = null
        delete audioElements.current[userId]
      }
      delete remoteStreams.current[userId]
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
        
        // Clean up audio elements
        Object.values(audioElements.current).forEach(audio => {
          if (audio.srcObject) {
            audio.srcObject = null
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
          // Play leave sound for self
          soundService.userLeft()
          
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
  }, [socket, channel?.id, user?.id])

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

  const currentMuted = externalMuted !== undefined ? externalMuted : localIsMuted
  const currentDeafened = externalDeafened !== undefined ? externalDeafened : localIsDeafened

  const toggleMute = () => {
    const newMuted = !currentMuted
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !newMuted
      })
    }
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
    
    Object.values(audioElements.current).forEach(audio => {
      audio.muted = newDeafened
    })
    
    if (newDeafened && !currentMuted) {
      setLocalIsMuted(true)
      onMuteChange?.(true)
      if (localStream) {
        localStream.getAudioTracks().forEach(track => {
          track.enabled = false
        })
      }
      socket?.emit('voice:mute', { channelId: channel.id, muted: true })
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
      localVideoStream?.getTracks().forEach(track => track.stop())
      setLocalVideoStream(null)
      setIsVideoOn(false)
      soundService.cameraOff()
      
      Object.values(peerConnections.current).forEach(pc => {
        const senders = pc.getSenders()
        const videoSender = senders.find(s => s.track?.kind === 'video')
        if (videoSender) {
          videoSender.replaceTrack(null)
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
            console.log('[Video] Saved camera device not found, using default')
            settingsService.saveSettings({ ...settings, videoDevice: 'default' })
            videoStream = await tryGetCamera(null)
          } else {
            throw err
          }
        }
        
        setLocalVideoStream(videoStream)
        setIsVideoOn(true)
        soundService.cameraOn()
        
        // Add video track to peer connections
        const videoTrack = videoStream.getVideoTracks()[0]
        Object.values(peerConnections.current).forEach(pc => {
          const senders = pc.getSenders()
          const videoSender = senders.find(s => s.track?.kind === 'video')
          if (videoSender) {
            videoSender.replaceTrack(videoTrack)
          } else {
            pc.addTrack(videoTrack, videoStream)
          }
        })
        
        // Notify others
        socket?.emit('voice:video', { channelId: channel.id, enabled: true })
      } catch (err) {
        console.error('[Video] Failed to get camera:', err)
      }
    }
  }

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      screenStream?.getTracks().forEach(track => track.stop())
      
      Object.values(peerConnections.current).forEach(pc => {
        const senders = pc.getSenders()
        senders.forEach(sender => {
          if (sender.track?.kind === 'video' || sender.track?.kind === 'audio') {
            sender.replaceTrack(null)
          }
        })
      })
      
      setScreenStream(null)
      setIsScreenSharing(false)
      soundService.screenShareStop()
      socket?.emit('voice:screen-share', { channelId: channel.id, enabled: false })
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        })
        
        setScreenStream(stream)
        setIsScreenSharing(true)
        soundService.screenShareStart()
        
        const videoTrack = stream.getVideoTracks()[0]
        const audioTrack = stream.getAudioTracks()[0]
        
        Object.values(peerConnections.current).forEach(pc => {
          const senders = pc.getSenders()
          const videoSender = senders.find(s => s.track?.kind === 'video')
          if (videoSender) {
            videoSender.replaceTrack(videoTrack)
          } else {
            pc.addTrack(videoTrack, stream)
          }
          
          if (audioTrack) {
            const audioSender = senders.find(s => s.track?.kind === 'audio' && s.track.label !== 'Microphone')
            if (audioSender) {
              audioSender.replaceTrack(audioTrack)
            } else {
              pc.addTrack(audioTrack, stream)
            }
          }
        })
        
        stream.getVideoTracks()[0].onended = () => {
          setScreenStream(null)
          setIsScreenSharing(false)
          soundService.screenShareStop()
          socket?.emit('voice:screen-share', { channelId: channel.id, enabled: false })
        }
        
        socket?.emit('voice:screen-share', { channelId: channel.id, enabled: true })
      } catch (err) {
        console.error('[Screen] Failed to share screen:', err)
      }
    }
  }

  const handleLeave = () => {
    // Play leave sound
    soundService.callLeft()
    
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop())
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop())
      localStreamRef.current = null
    }
    if (localVideoStream) {
      localVideoStream.getTracks().forEach(track => track.stop())
    }
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop())
    }
    
    Object.values(peerConnections.current).forEach(pc => pc.close())
    peerConnections.current = {}
    
    // Emit leave and mark as not joined
    if (hasJoinedRef.current && !hasLeftRef.current) {
      if (socket?.connected) {
        socket.emit('voice:leave', channel.id)
        console.log('[Voice] Manual leave - emitted voice:leave')
      } else {
        console.log('[Voice] Manual leave - socket disconnected, skipping emit')
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

  return (
    <div className="voice-channel-view">
      <div className="voice-header">
        <Volume2 size={24} />
        <span className="voice-channel-name">{channel?.name || 'Voice Channel'}</span>
        <span className={`connection-status ${connectionState}`}>
          {connectionState === 'connecting' && 'Connecting...'}
          {connectionState === 'connected' && 'Voice Connected'}
          {connectionState === 'error' && 'Connection Error'}
        </span>
      </div>

      <div className="voice-participants">
        <div className="participants-grid">
          {displayParticipants.map(participant => (
              <div 
                key={participant.id} 
                className={`voice-participant ${participant.muted || (participant.id === user?.id && currentMuted) ? 'muted' : ''} ${participant.id === user?.id ? 'self' : ''} ${speaking[participant.id] ? 'speaking' : ''}`}
              >
                {participant.hasVideo || (participant.id === user?.id && isVideoOn) || (participant.id === user?.id && isScreenSharing) ? (
                  <div className="participant-video-container">
                    {participant.id === user?.id ? (
                      <video 
                        ref={(el) => {
                          localVideoRef.current = el
                          if (el) {
                            if (isScreenSharing && screenStream) {
                              el.srcObject = screenStream
                            } else if (isVideoOn && localVideoStream) {
                              el.srcObject = localVideoStream
                            }
                          }
                        }}
                        autoPlay 
                        muted 
                        playsInline 
                        className="participant-video" 
                      />
                    ) : (
                      <video 
                        autoPlay 
                        playsInline 
                        className="participant-video"
                        ref={el => { if (el && participant.videoStream) el.srcObject = participant.videoStream }}
                      />
                    )}
                    <div className="video-name-overlay">
                      {participant.username}
                      {participant.id === user?.id && ' (You)'}
                      {participant.id === user?.id && isScreenSharing && ' - Screen'}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="participant-avatar-container">
                      <Avatar 
                        src={participant.avatar}
                        alt={participant.username}
                        fallback={participant.username}
                        size={80}
                        className="participant-avatar"
                      />
                      {(participant.muted || (participant.id === user?.id && currentMuted)) && (
                        <div className="mute-indicator">
                          <MicOff size={16} />
                        </div>
                      )}
                      {(participant.deafened || (participant.id === user?.id && currentDeafened)) && (
                        <div className="deafen-indicator">
                          <VolumeX size={16} />
                        </div>
                      )}
                    </div>
                    <span className="participant-name">
                      {participant.username}
                      {participant.id === user?.id && ' (You)'}
                    </span>
                  </>
                )}
                {(participant.isScreenSharing || (participant.id === user?.id && isScreenSharing)) && (
                  <div className="screen-share-badge">
                    <Monitor size={14} /> Sharing
                  </div>
                )}
              </div>
            ))}
          </div>

          {otherParticipants.length === 0 && (
            <div className="invite-hint">
              <p>You're the only one here. Invite friends to join!</p>
            </div>
          )}
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
    </div>
  )
}

export default VoiceChannel
