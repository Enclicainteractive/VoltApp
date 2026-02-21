import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Mic, MicOff, Headphones, VolumeX, PhoneOff, Video, VideoOff, Phone, Monitor, MonitorOff, ArrowLeft } from 'lucide-react'
import { useCall } from '../contexts/CallContext'
import { useAuth } from '../contexts/AuthContext'
import { useTranslation } from '../hooks/useTranslation'
import Avatar from './Avatar'
import '../assets/styles/DMCallView.css'

const DMCallView = ({ onClose }) => {
  const { t } = useTranslation()
  const { user } = useAuth()
  const {
    activeCall,
    callStatus,
    callDuration,
    isMuted,
    isDeafened,
    isVideoEnabled,
    isScreenSharing,
    localStream,
    screenStream,
    remoteStream,
    endCall,
    cancelCall,
    dismissEndedCall,
    toggleMute,
    toggleDeafen,
    toggleVideo,
    toggleScreenShare,
    formatDuration
  } = useCall()

  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const [localSpeaking, setLocalSpeaking] = useState(false)
  const [remoteSpeaking, setRemoteSpeaking] = useState(false)

  // Connect video streams to video elements
  const localPreviewStream = screenStream || localStream

  useEffect(() => {
    if (localVideoRef.current && localPreviewStream) {
      localVideoRef.current.srcObject = localPreviewStream
    }
  }, [localPreviewStream, isVideoEnabled, isScreenSharing])

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream
    }
  }, [remoteStream])

  const hasRemoteVideo = useMemo(
    () => !!remoteStream?.getVideoTracks?.().some(t => t.readyState === 'live' && t.enabled !== false),
    [remoteStream]
  )
  const hasLocalVideo = useMemo(
    () => !!localPreviewStream?.getVideoTracks?.().some(t => t.readyState === 'live' && t.enabled !== false),
    [localPreviewStream]
  )

  useEffect(() => {
    const localAudioTrack = localStream?.getAudioTracks?.()[0]
    const remoteAudioTrack = remoteStream?.getAudioTracks?.()[0]
    if (!localAudioTrack && !remoteAudioTrack) return

    const contexts = []
    const intervals = []
    const attachSpeaking = (stream, setSpeaking, threshold = 0.015) => {
      if (!stream?.getAudioTracks?.().length) return
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      const src = ctx.createMediaStreamSource(stream)
      src.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      const interval = setInterval(() => {
        try {
          analyser.getByteFrequencyData(data)
          let sum = 0
          for (let i = 0; i < data.length; i++) sum += data[i]
          const normalized = (sum / data.length) / 255
          setSpeaking(normalized > threshold)
        } catch {
          setSpeaking(false)
        }
      }, 120)
      contexts.push(ctx)
      intervals.push(interval)
    }

    attachSpeaking(localStream, setLocalSpeaking, 0.02)
    attachSpeaking(remoteStream, setRemoteSpeaking, 0.01)

    return () => {
      intervals.forEach(clearInterval)
      contexts.forEach(ctx => ctx.close().catch(() => {}))
      setLocalSpeaking(false)
      setRemoteSpeaking(false)
    }
  }, [localStream, remoteStream])

  if (!activeCall) return null

  const otherUser = activeCall.otherUser || { 
    id: activeCall.otherUserId, 
    username: activeCall.otherUserId ? `@${String(activeCall.otherUserId).slice(0, 8)}` : t('call.unknown', 'Unknown') 
  }
  const otherUserName = otherUser.displayName || otherUser.customUsername || otherUser.username

  const handleEndCall = () => {
    if (callStatus === 'ringing' && activeCall.isCaller) {
      cancelCall()
    } else {
      endCall()
    }
    onClose?.()
  }

  const statusText = {
    idle: t('call.idle', 'Idle'),
    ringing: activeCall.isCaller ? t('call.ringingOutgoing', 'Ringing...') : t('call.incoming', 'Incoming Call'),
    connecting: t('call.connecting', 'Connecting...'),
    active: formatDuration(callDuration),
    ended: t('call.ended', 'Call Ended')
  }[callStatus] || t('call.connecting', 'Connecting...')

  return (
    <div className="dm-call-view">
      {/* Video area - only show if video is enabled */}
      {(hasRemoteVideo || hasLocalVideo) && (
        <div className="dm-call-video-area">
          {/* Remote video (full size) */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={`dm-call-remote-video ${remoteSpeaking ? 'speaking' : ''}`}
          />
          
          {/* Local video (picture-in-picture) */}
          <div className={`dm-call-local-video-container ${localSpeaking ? 'speaking' : ''}`}>
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="dm-call-local-video"
            />
          </div>
        </div>
      )}

      {/* Avatar area - show when no video */}
      {!(hasRemoteVideo || hasLocalVideo) && (
        <div className="dm-call-avatar-area">
          <div className={`dm-call-participant self ${localSpeaking ? 'speaking' : ''}`}>
            <Avatar
              src={user?.avatar}
              fallback={user?.username || t('common.you', 'You')}
              size={80}
              className={isMuted ? 'muted' : ''}
            />
            <span className="participant-name">{t('common.you', 'You')}</span>
            {isMuted && <MicOff className="mute-indicator" size={16} />}
          </div>

          <div className={`dm-call-participant other ${remoteSpeaking ? 'speaking' : ''}`}>
            <Avatar
              src={otherUser.avatar}
              fallback={otherUserName}
              size={80}
            />
            <span className="participant-name">{otherUserName}</span>
          </div>
        </div>
      )}

      {/* Call info */}
      <div className="dm-call-info">
        <h3 className="dm-call-username">{otherUserName}</h3>
        <span className={`dm-call-status ${callStatus}`}>
          {statusText}
        </span>
      </div>

      {/* Call controls */}
      <div className="dm-call-controls">
        <button
          className={`dm-call-btn ${isMuted ? 'active' : ''}`}
          onClick={toggleMute}
          title={isMuted ? t('call.unmute', 'Unmute') : t('call.mute', 'Mute')}
        >
          {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
        </button>

        <button
          className={`dm-call-btn ${isDeafened ? 'active' : ''}`}
          onClick={toggleDeafen}
          title={isDeafened ? t('call.undeafen', 'Undeafen') : t('call.deafen', 'Deafen')}
        >
          {isDeafened ? <VolumeX size={24} /> : <Headphones size={24} />}
        </button>

        <button
          className={`dm-call-btn ${isVideoEnabled ? 'active-video' : ''}`}
          onClick={toggleVideo}
          title={isVideoEnabled ? t('call.turnOffCamera', 'Turn Off Camera') : t('call.turnOnCamera', 'Turn On Camera')}
        >
          {isVideoEnabled ? <Video size={24} /> : <VideoOff size={24} />}
        </button>

        <button
          className={`dm-call-btn ${isScreenSharing ? 'active-video' : ''}`}
          onClick={toggleScreenShare}
          title={isScreenSharing ? t('chat.stopSharing', 'Stop Sharing') : t('chat.shareScreen', 'Share Screen')}
        >
          {isScreenSharing ? <MonitorOff size={24} /> : <Monitor size={24} />}
        </button>

        <button
          className="dm-call-btn end"
          onClick={handleEndCall}
          title={t('call.endCall', 'End Call')}
        >
          <PhoneOff size={24} />
        </button>
      </div>

      {/* Connecting overlay */}
      {callStatus === 'connecting' && (
        <div className="dm-call-connecting-overlay">
          <div className="connecting-spinner"></div>
          <span className="dm-call-overlay-text">{t('call.connecting', 'Connecting...')}</span>
        </div>
      )}

      {/* Ringing overlay for caller */}
      {callStatus === 'ringing' && activeCall.isCaller && (
        <div className="dm-call-ringing-overlay">
          <div className="ringing-animation">
            <Phone size={32} className="ringing-phone" />
          </div>
          <span className="dm-call-overlay-text">{t('call.ringingUser', 'Ringing {{user}}...', { user: otherUserName })}</span>
        </div>
      )}

      {callStatus === 'ended' && (
        <div className="dm-call-ended-overlay">
          <div className="dm-call-overlay-text">{t('call.ended', 'Call Ended')}</div>
          <button className="dm-call-return-btn" onClick={() => { dismissEndedCall(); onClose?.() }}>
            <ArrowLeft size={16} />
            {t('common.back', 'Return')}
          </button>
        </div>
      )}
    </div>
  )
}

export default DMCallView
