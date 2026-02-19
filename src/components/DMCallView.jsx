import React, { useEffect, useRef } from 'react'
import { Mic, MicOff, Headphones, VolumeX, PhoneOff, Video, VideoOff, Phone } from 'lucide-react'
import { useCall } from '../contexts/CallContext'
import { useAuth } from '../contexts/AuthContext'
import Avatar from './Avatar'
import '../assets/styles/DMCallView.css'

const DMCallView = ({ onClose }) => {
  const { user } = useAuth()
  const {
    activeCall,
    callStatus,
    callDuration,
    isMuted,
    isDeafened,
    isVideoEnabled,
    localStream,
    remoteStream,
    endCall,
    cancelCall,
    toggleMute,
    toggleDeafen,
    toggleVideo,
    formatDuration
  } = useCall()

  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)

  // Connect video streams to video elements
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream
    }
  }, [localStream, isVideoEnabled])

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream
    }
  }, [remoteStream])

  if (!activeCall) return null

  const otherUser = activeCall.otherUser || { 
    id: activeCall.otherUserId, 
    username: 'Unknown' 
  }

  const handleEndCall = () => {
    if (callStatus === 'ringing' && activeCall.isCaller) {
      cancelCall()
    } else {
      endCall()
    }
    onClose?.()
  }

  const statusText = {
    idle: 'Idle',
    ringing: activeCall.isCaller ? 'Ringing...' : 'Incoming Call',
    connecting: 'Connecting...',
    active: formatDuration(callDuration),
    ended: 'Call Ended'
  }[callStatus] || 'Connecting...'

  return (
    <div className="dm-call-view">
      {/* Video area - only show if video is enabled */}
      {isVideoEnabled && (
        <div className="dm-call-video-area">
          {/* Remote video (full size) */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="dm-call-remote-video"
          />
          
          {/* Local video (picture-in-picture) */}
          <div className="dm-call-local-video-container">
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
      {!isVideoEnabled && (
        <div className="dm-call-avatar-area">
          <div className="dm-call-participant self">
            <Avatar
              src={user?.avatar}
              fallback={user?.username || 'You'}
              size={80}
              className={isMuted ? 'muted' : ''}
            />
            <span className="participant-name">You</span>
            {isMuted && <MicOff className="mute-indicator" size={16} />}
          </div>

          <div className="dm-call-participant other">
            <Avatar
              src={otherUser.avatar}
              fallback={otherUser.username}
              size={80}
            />
            <span className="participant-name">{otherUser.username}</span>
          </div>
        </div>
      )}

      {/* Call info */}
      <div className="dm-call-info">
        <h3 className="dm-call-username">{otherUser.username}</h3>
        <span className={`dm-call-status ${callStatus}`}>
          {statusText}
        </span>
      </div>

      {/* Call controls */}
      <div className="dm-call-controls">
        <button
          className={`dm-call-btn ${isMuted ? 'active' : ''}`}
          onClick={toggleMute}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
        </button>

        <button
          className={`dm-call-btn ${isDeafened ? 'active' : ''}`}
          onClick={toggleDeafen}
          title={isDeafened ? 'Undeafen' : 'Deafen'}
        >
          {isDeafened ? <VolumeX size={24} /> : <Headphones size={24} />}
        </button>

        <button
          className={`dm-call-btn ${isVideoEnabled ? 'active-video' : ''}`}
          onClick={toggleVideo}
          title={isVideoEnabled ? 'Turn Off Camera' : 'Turn On Camera'}
        >
          {isVideoEnabled ? <Video size={24} /> : <VideoOff size={24} />}
        </button>

        <button
          className="dm-call-btn end"
          onClick={handleEndCall}
          title="End Call"
        >
          <PhoneOff size={24} />
        </button>
      </div>

      {/* Connecting overlay */}
      {callStatus === 'connecting' && (
        <div className="dm-call-connecting-overlay">
          <div className="connecting-spinner"></div>
          <span>Connecting...</span>
        </div>
      )}

      {/* Ringing overlay for caller */}
      {callStatus === 'ringing' && activeCall.isCaller && (
        <div className="dm-call-ringing-overlay">
          <div className="ringing-animation">
            <Phone size={32} className="ringing-phone" />
          </div>
          <span>Ringing {otherUser.username}...</span>
        </div>
      )}
    </div>
  )
}

export default DMCallView