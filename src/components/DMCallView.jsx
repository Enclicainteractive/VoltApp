import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeftIcon,
  ComputerDesktopIcon,
  MicrophoneIcon,
  MusicalNoteIcon,
  PhoneIcon,
  PhoneXMarkIcon,
  SignalIcon,
  SpeakerXMarkIcon,
  VideoCameraIcon,
  VideoCameraSlashIcon
} from '@heroicons/react/24/outline'
import { useCall } from '../contexts/CallContext'
import { useAuth } from '../contexts/AuthContext'
import { useTranslation } from '../hooks/useTranslation'
import Avatar from './Avatar'
import '../assets/styles/DMCallView.css'

const SpeakingBadge = ({ active, label }) => active ? <div className="dm-call-speaking-badge">{label}</div> : null

const ControlButton = ({ active = false, danger = false, onClick, title, children, label }) => (
  <button
    className={`dm-call-control ${active ? 'active' : ''} ${danger ? 'danger' : ''}`}
    onClick={onClick}
    title={title}
    type="button"
  >
    <span className="dm-call-control-icon">{children}</span>
    <span className="dm-call-control-label">{label}</span>
  </button>
)

const DMCallView = ({ onClose }) => {
  const { t } = useTranslation()
  const { user } = useAuth()
  const {
    activeCall,
    callStatus,
    callDuration,
    callError,
    isMuted,
    isDeafened,
    isVideoEnabled,
    isScreenSharing,
    localStream,
    screenStream,
    remoteStream,
    remoteMuteState,
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
  const remoteAudioRef = useRef(null)
  const [localSpeaking, setLocalSpeaking] = useState(false)
  const [remoteSpeaking, setRemoteSpeaking] = useState(false)

  const localPreviewStream = screenStream || localStream

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localPreviewStream || null
  }, [localPreviewStream])

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream || null
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStream || null
      remoteAudioRef.current.muted = isDeafened
      if (remoteStream) {
        remoteAudioRef.current.play().catch(() => {})
      }
    }
  }, [remoteStream, isDeafened])

  const hasRemoteVideo = useMemo(
    () => !!remoteStream?.getVideoTracks?.().some((track) => track.readyState === 'live' && track.enabled !== false),
    [remoteStream]
  )
  const hasLocalVideo = useMemo(
    () => !!localPreviewStream?.getVideoTracks?.().some((track) => track.readyState === 'live' && track.enabled !== false),
    [localPreviewStream]
  )

  useEffect(() => {
    const contexts = []
    const intervals = []

    const attachSpeakingDetector = (stream, setSpeaking, threshold) => {
      if (!stream?.getAudioTracks?.().length) return
      const context = new (window.AudioContext || window.webkitAudioContext)()
      const analyser = context.createAnalyser()
      analyser.fftSize = 256
      const source = context.createMediaStreamSource(stream)
      source.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)

      const intervalId = setInterval(() => {
        try {
          analyser.getByteFrequencyData(data)
          const average = data.reduce((sum, value) => sum + value, 0) / data.length / 255
          setSpeaking(average > threshold)
        } catch {
          setSpeaking(false)
        }
      }, 120)

      contexts.push(context)
      intervals.push(intervalId)
    }

    attachSpeakingDetector(localStream, setLocalSpeaking, 0.02)
    attachSpeakingDetector(remoteStream, setRemoteSpeaking, 0.01)

    return () => {
      intervals.forEach(clearInterval)
      contexts.forEach((context) => context.close().catch(() => {}))
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
  const isOutgoingRinging = callStatus === 'ringing' && activeCall.isCaller
  const isVideoCall = activeCall.type === 'video' || hasRemoteVideo || hasLocalVideo

  let statusText = t('call.connecting', 'Connecting...')
  if (callStatus === 'idle') statusText = t('call.idle', 'Idle')
  else if (callStatus === 'ringing') statusText = activeCall.isCaller ? t('call.ringingOutgoing', 'Ringing...') : t('call.incoming', 'Incoming call')
  else if (callStatus === 'connecting') statusText = t('call.connecting', 'Connecting...')
  else if (callStatus === 'active') statusText = formatDuration(callDuration)
  else if (callStatus === 'ended') statusText = t('call.ended', 'Call ended')

  const handleLeave = () => {
    if (callStatus === 'ringing' && activeCall.isCaller) cancelCall()
    else endCall()
    onClose?.()
  }

  const detailPills = [
    isVideoCall ? t('call.videoCall', 'Video call') : t('call.voiceCall', 'Voice call'),
    isScreenSharing ? t('chat.shareScreen', 'Screen sharing') : null,
    remoteMuteState.videoEnabled ? t('call.remoteVideoOn', 'Remote video on') : null,
    isMuted ? t('call.muted', 'Muted') : null,
    isDeafened ? t('call.deafened', 'Deafened') : null
  ].filter(Boolean)

  return (
    <div className="dm-call-shell">
      <audio ref={remoteAudioRef} autoPlay playsInline />

      <div className="dm-call-topbar">
        <button className="dm-call-back" type="button" onClick={onClose} title={t('common.back', 'Back')}>
          <ArrowLeftIcon width={18} height={18} />
          <span>{t('common.back', 'Back')}</span>
        </button>

        <div className={`dm-call-status-pill ${callStatus}`}>
          <SignalIcon width={16} height={16} />
          <span>{statusText}</span>
        </div>
      </div>

      <div className={`dm-call-stage ${isVideoCall ? 'video-mode' : 'audio-mode'}`}>
        <div className="dm-call-hero">
          <div className="dm-call-title-block">
            <p className="dm-call-kicker">{isVideoCall ? t('call.videoCall', 'Video call') : t('call.voiceCall', 'Voice call')}</p>
            <h2>{otherUserName}</h2>
            <p>{isOutgoingRinging ? t('call.ringingUser', 'Ringing {{user}}...', { user: otherUserName }) : t('call.liveConnection', 'Private, direct, real-time connection')}</p>
          </div>

          <div className="dm-call-pill-row">
            {detailPills.map((pill) => (
              <span key={pill} className="dm-call-detail-pill">{pill}</span>
            ))}
          </div>
        </div>

        {isVideoCall ? (
          <div className="dm-call-video-layout">
            <div className="dm-call-remote-pane">
              {hasRemoteVideo ? (
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className={`dm-call-remote-video ${remoteSpeaking ? 'speaking' : ''}`}
                />
              ) : (
                <div className={`dm-call-avatar-panel ${remoteSpeaking ? 'speaking' : ''}`}>
                  <Avatar src={otherUser.avatar} fallback={otherUserName} size={128} userId={otherUser.id} />
                  <h3>{otherUserName}</h3>
                  <p>{remoteMuteState.muted ? t('call.waitingForAudio', 'Muted right now') : t('call.videoUnavailable', 'Video is off')}</p>
                </div>
              )}

              <div className="dm-call-pane-meta">
                <div>
                  <strong>{otherUserName}</strong>
                  <span>{remoteMuteState.muted ? t('call.muted', 'Muted') : t('call.listening', 'Listening')}</span>
                </div>
                <SpeakingBadge active={remoteSpeaking} label={t('call.speaking', 'Speaking')} />
              </div>
            </div>

            <div className={`dm-call-local-pane ${localSpeaking ? 'speaking' : ''}`}>
              {hasLocalVideo ? (
                <video ref={localVideoRef} autoPlay playsInline muted className="dm-call-local-video" />
              ) : (
                <div className="dm-call-local-avatar">
                  <Avatar src={user?.avatar} fallback={user?.displayName || user?.username} size={72} userId={user?.id} />
                </div>
              )}
              <div className="dm-call-local-meta">
                <strong>{t('common.you', 'You')}</strong>
                <span>{isScreenSharing ? t('chat.shareScreen', 'Sharing your screen') : isMuted ? t('call.muted', 'Muted') : t('call.live', 'Live')}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="dm-call-audio-layout">
            <div className={`dm-call-user-card self ${localSpeaking ? 'speaking' : ''}`}>
              <div className="dm-call-avatar-ring">
                <Avatar
                  src={user?.avatar}
                  fallback={user?.displayName || user?.username}
                  size={88}
                  userId={user?.id}
                />
              </div>
              <strong>{t('common.you', 'You')}</strong>
              <span>{isMuted ? t('call.muted', 'Muted') : t('call.microphoneLive', 'Microphone live')}</span>
              <SpeakingBadge active={localSpeaking} label={t('call.speaking', 'Speaking')} />
            </div>

            <div className="dm-call-audio-bridge">
              <div className="dm-call-audio-wave" />
              <div className="dm-call-audio-wave delayed" />
            </div>

            <div className={`dm-call-user-card other ${remoteSpeaking ? 'speaking' : ''}`}>
              <div className="dm-call-avatar-ring">
                <Avatar src={otherUser.avatar} fallback={otherUserName} size={104} userId={otherUser.id} />
              </div>
              <strong>{otherUserName}</strong>
              <span>{remoteMuteState.muted ? t('call.muted', 'Muted') : t('call.available', 'Available')}</span>
              <SpeakingBadge active={remoteSpeaking} label={t('call.speaking', 'Speaking')} />
            </div>
          </div>
        )}

        {callError && (
          <div className="dm-call-error-banner">
            <span>{callError}</span>
          </div>
        )}
      </div>

      <div className="dm-call-controls-bar">
        <ControlButton
          active={isMuted}
          onClick={toggleMute}
          title={isMuted ? t('call.unmute', 'Unmute') : t('call.mute', 'Mute')}
          label={isMuted ? t('call.unmute', 'Unmute') : t('call.mute', 'Mute')}
        >
          <MicrophoneIcon width={22} height={22} />
        </ControlButton>

        <ControlButton
          active={isDeafened}
          onClick={toggleDeafen}
          title={isDeafened ? t('call.undeafen', 'Undeafen') : t('call.deafen', 'Deafen')}
          label={isDeafened ? t('call.undeafen', 'Undeafen') : t('call.deafen', 'Deafen')}
        >
          {isDeafened ? <SpeakerXMarkIcon width={22} height={22} /> : <MusicalNoteIcon width={22} height={22} />}
        </ControlButton>

        <ControlButton
          active={isVideoEnabled}
          onClick={toggleVideo}
          title={isVideoEnabled ? t('call.turnOffCamera', 'Turn off camera') : t('call.turnOnCamera', 'Turn on camera')}
          label={isVideoEnabled ? t('call.cameraOn', 'Camera on') : t('call.cameraOff', 'Camera off')}
        >
          {isVideoEnabled ? <VideoCameraIcon width={22} height={22} /> : <VideoCameraSlashIcon width={22} height={22} />}
        </ControlButton>

        <ControlButton
          active={isScreenSharing}
          onClick={toggleScreenShare}
          title={isScreenSharing ? t('chat.stopSharing', 'Stop sharing') : t('chat.shareScreen', 'Share screen')}
          label={isScreenSharing ? t('chat.stopSharing', 'Stop sharing') : t('chat.shareScreen', 'Share screen')}
        >
          <ComputerDesktopIcon width={22} height={22} />
        </ControlButton>

        <ControlButton
          danger
          onClick={handleLeave}
          title={t('call.endCall', 'End call')}
          label={callStatus === 'ringing' && activeCall.isCaller ? t('call.cancel', 'Cancel') : t('call.endCall', 'End call')}
        >
          {callStatus === 'ringing' && activeCall.isCaller ? <PhoneIcon width={22} height={22} /> : <PhoneXMarkIcon width={22} height={22} />}
        </ControlButton>
      </div>

      {callStatus === 'connecting' && (
        <div className="dm-call-overlay">
          <div className="dm-call-spinner" />
          <strong>{t('call.connecting', 'Connecting...')}</strong>
          <span>{t('call.connectingHint', 'Negotiating media and network routes')}</span>
        </div>
      )}

      {isOutgoingRinging && (
        <div className="dm-call-overlay">
          <div className="dm-call-ringing-icon">
            <PhoneIcon width={28} height={28} />
          </div>
          <strong>{t('call.ringingOutgoing', 'Ringing...')}</strong>
          <span>{t('call.waitingForPickup', 'Waiting for the other side to pick up')}</span>
        </div>
      )}

      {callStatus === 'ended' && (
        <div className="dm-call-overlay ended">
          <strong>{t('call.ended', 'Call ended')}</strong>
          <span>{t('call.sessionClosed', 'The session has been closed cleanly')}</span>
          <button className="dm-call-return" type="button" onClick={() => { dismissEndedCall(); onClose?.() }}>
            <ArrowLeftIcon width={16} height={16} />
            <span>{t('common.back', 'Back')}</span>
          </button>
        </div>
      )}
    </div>
  )
}

export default DMCallView
