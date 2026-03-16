import React, { useState, useCallback, useRef } from 'react'
import { MicrophoneIcon, SpeakerWaveIcon, SpeakerXMarkIcon, VideoCameraIcon, VideoCameraSlashIcon, ComputerDesktopIcon, Cog6ToothIcon, WifiIcon, PhoneXMarkIcon, UsersIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Mic, Volume2, VolumeX, Video, VideoOff, Monitor, Settings, Wifi, PhoneOff, Users, Maximize2, X } from 'lucide-react'
import Avatar from './Avatar'
import { useAuth } from '../contexts/AuthContext'
import '../assets/styles/VoiceChannel.css'

const UnifiedVoiceView = ({
  channel,
  participants = [],
  isActive,
  connectionState = 'disconnected',
  isMuted = false,
  isDeafened = false,
  isVideoOn = false,
  isScreenSharing = false,
  onToggleMute,
  onToggleDeafen,
  onToggleVideo,
  onToggleScreenShare,
  onLeave,
  onOpenSettings,
  onShowConnectionInfo,
  localUserSettings = {},
  onLocalUserSettingChange,
  showAsMini = false,
  onExpand,
}) => {
  const { user } = useAuth()
  const currentUserId = user?.id
  const [participantMenu, setParticipantMenu] = useState(null)
  const [expandedVideo, setExpandedVideo] = useState(null)

  if (!channel) return null

  const getConnectionStatus = () => {
    if (!isActive) return { text: 'Click to join', color: 'var(--volt-text-muted)', icon: null, class: 'disconnected' }
    switch (connectionState) {
      case 'connecting':
        return { text: 'Connecting...', color: 'var(--volt-warning)', icon: <WifiIcon size={14} className="pulse" />, class: 'connecting' }
      case 'connected':
        return { text: 'Connected', color: 'var(--volt-success)', icon: <WifiIcon size={14} />, class: 'connected' }
      case 'failed':
        return { text: 'Connection failed', color: 'var(--volt-danger)', icon: <WifiIcon size={14} />, class: 'failed' }
      default:
        return { text: 'Disconnected', color: 'var(--volt-text-muted)', icon: <WifiIcon size={14} />, class: 'disconnected' }
    }
  }

  const connectionStatus = getConnectionStatus()

  // Check if any participant has video or screen share
  const hasVideoContent = participants.some(p => p.videoStream || p.screenStream)

  const handleParticipantContextMenu = (e, participant) => {
    if (participant.id === currentUserId) return
    e.preventDefault()
    const ls = localUserSettings[participant.id] || { muted: false, volume: 100 }
    setParticipantMenu({
      userId: participant.id,
      username: participant.username,
      x: e.clientX,
      y: e.clientY,
      isMuted: ls.muted,
      volume: ls.volume
    })
  }

  const handleCloseMenu = () => setParticipantMenu(null)

  if (showAsMini) {
    return (
      <div className="vc-mini-view">
        <div className="vc-mini-header" onClick={onExpand}>
          <span className="vc-mini-title">{channel.name}</span>
          <span className="vc-mini-status" style={{ color: connectionStatus.color }}>
            {connectionStatus.icon}
            {participants.length}
          </span>
        </div>
        <div className="vc-mini-controls">
          <button className={`vc-mini-btn ${isMuted ? 'active' : ''}`} onClick={onToggleMute}>
            {isMuted ? <MicrophoneIcon size={16} /> : <MicrophoneIcon size={16} />}
          </button>
          <button className={`vc-mini-btn ${isDeafened ? 'active danger' : ''}`} onClick={onToggleDeafen}>
            {isDeafened ? <SpeakerXMarkIcon size={16} /> : <Volume2 size={16} />}
          </button>
          <button className={`vc-mini-btn ${isVideoOn ? 'active' : ''}`} onClick={onToggleVideo}>
            {isVideoOn ? <VideoCameraIcon size={16} /> : <VideoCameraSlashIcon size={16} />}
          </button>
          <button className={`vc-mini-btn ${isScreenSharing ? 'active' : ''}`} onClick={onToggleScreenShare}>
            {isScreenSharing ? <ComputerDesktopIcon size={16} /> : <ComputerDesktopIcon size={16} />}
          </button>
          <button className="vc-mini-btn danger" onClick={onLeave}>
            <PhoneXMarkIcon size={16} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="voice-channel-view">
      {/* Header */}
      <div className="voice-header">
        <div className="voice-channel-name">{channel.name}</div>
        <div className={`connection-status ${connectionStatus.class}`}>
          {connectionStatus.icon}
          {connectionStatus.text}
        </div>
      </div>

      {/* Participants Grid */}
      <div className={`unified-voice-content`}>
        {participants.length === 0 ? (
          <div className="unified-voice-empty">
            <UsersIcon size={48} style={{ opacity: 0.3 }} />
            <p>No one is here yet</p>
          </div>
        ) : (
          <div className={`unified-voice-grid ${hasVideoContent ? 'has-video' : ''} ${participants.length === 1 ? 'single-participant' : ''}`}>
            {participants.map(p => {
              const hasVideo = !!p.videoStream
              const hasScreen = !!p.screenStream
              const isSelf = p.id === currentUserId
              const ls = localUserSettings[p.id] || { muted: false, volume: 100 }

              return (
                <div
                  key={p.id}
                  className={`voice-participant-tile ${p.speaking ? 'speaking' : ''} ${p.muted ? 'muted' : ''} ${p.isReconnecting ? 'reconnecting' : ''}`}
                  onContextMenu={(e) => handleParticipantContextMenu(e, p)}
                >
                  {hasScreen ? (
                    <div className="voice-tile-video-container">
                      <video
                        autoPlay
                        playsInline
                        muted={isSelf}
                        className="voice-tile-video screen-share"
                        ref={el => { if (el) el.srcObject = p.screenStream }}
                      />
                      <div className="voice-screen-badge">
                        <ComputerDesktopIcon size={12} />
                        <span>Screen</span>
                      </div>
                    </div>
                  ) : hasVideo ? (
                    <div className="voice-tile-video-container">
                      <video
                        autoPlay
                        playsInline
                        muted={isSelf}
                        className="voice-tile-video"
                        ref={el => { if (el) el.srcObject = p.videoStream }}
                      />
                      <button
                        className="vc-tile-expand"
                        onClick={() => setExpandedVideo({ userId: p.id, stream: p.videoStream, label: p.username })}
                      >
                        <ArrowsPointingOutIcon size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="voice-tile-avatar-wrap">
                      <Avatar
                        src={p.avatar}
                        fallback={p.username}
                        size={28}
                        userId={p.id}
                      />
                      {(p.muted || p.deafened) && (
                        <div className="voice-tile-status-indicators">
                          {p.deafened && (
                            <span className="voice-tile-status-icon deafened">
                              <SpeakerXMarkIcon size={12} />
                            </span>
                          )}
                          {p.muted && !p.deafened && (
                            <span className="voice-tile-status-icon">
                              <MicrophoneIcon size={12} />
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="voice-tile-info">
                    <div className="voice-tile-name">
                      {p.username}
                      {isSelf && <span className="self-badge">(You)</span>}
                    </div>
                    <div className="voice-tile-badges">
                      {hasScreen && (
                        <span className="voice-tile-badge screen-on">
                          <ComputerDesktopIcon size={12} />
                        </span>
                      )}
                      {hasVideo && (
                        <span className="voice-tile-badge video-on">
                          <VideoCameraIcon size={12} />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Controls */}
      {isActive && (
        <div className="unified-voice-controls">
          <div className="unified-voice-control-group">
            <button
              className={`unified-voice-btn ${isMuted ? 'active' : ''}`}
              onClick={onToggleMute}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <MicrophoneIcon size={20} /> : <MicrophoneIcon size={20} />}
              <span>{isMuted ? 'Unmute' : 'Mute'}</span>
            </button>
            <button
              className={`unified-voice-btn ${isDeafened ? 'active' : ''}`}
              onClick={onToggleDeafen}
              title={isDeafened ? 'Undeafen' : 'Deafen'}
            >
              {isDeafened ? <SpeakerXMarkIcon size={20} /> : <Volume2 size={20} />}
              <span>{isDeafened ? 'Undeafen' : 'Deafen'}</span>
            </button>
          </div>

          <div className="unified-voice-control-group">
            <button
              className={`unified-voice-btn ${isVideoOn ? 'active' : ''}`}
              onClick={onToggleVideo}
              title={isVideoOn ? 'Stop Video' : 'Start Video'}
            >
              {isVideoOn ? <VideoCameraSlashIcon size={20} /> : <VideoCameraIcon size={20} />}
              <span>{isVideoOn ? 'Stop Video' : 'Video'}</span>
            </button>
            <button
              className={`unified-voice-btn ${isScreenSharing ? 'active' : ''}`}
              onClick={onToggleScreenShare}
              title={isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
            >
              {isScreenSharing ? <ComputerDesktopIcon size={20} /> : <ComputerDesktopIcon size={20} />}
              <span>{isScreenSharing ? 'Stop Share' : 'Screen'}</span>
            </button>
          </div>

          <div className="unified-voice-control-group">
            <button
              className="unified-voice-btn"
              onClick={onShowConnectionInfo}
              title="Connection Info"
            >
              <WifiIcon size={20} />
              <span>Connection</span>
            </button>
            <button
              className="unified-voice-btn"
              onClick={onOpenSettings}
              title="Settings"
            >
              <CogIcon size={20} />
              <span>Settings</span>
            </button>
            <button
              className="unified-voice-btn danger"
              onClick={onLeave}
              title="Leave Voice"
            >
              <PhoneXMarkIcon size={20} />
              <span>Leave</span>
            </button>
          </div>
        </div>
      )}

      {/* Participant Context Menu */}
      {participantMenu && (
        <>
          <div className="voice-context-overlay" onClick={handleCloseMenu} />
          <div
            className="vc-participant-menu"
            style={{ 
              position: 'fixed', 
              left: Math.min(participantMenu.x, window.innerWidth - 240), 
              top: Math.min(participantMenu.y, window.innerHeight - 200), 
              zIndex: 9999 
            }}
          >
            <div className="vpm-header">{participantMenu.username}</div>
            <button
              className="vpm-item"
              onClick={() => {
                onLocalUserSettingChange?.(participantMenu.userId, { muted: !participantMenu.isMuted })
                handleCloseMenu()
              }}
            >
              {participantMenu.isMuted ? <Volume2 size={14} /> : <SpeakerXMarkIcon size={14} />}
              {participantMenu.isMuted ? 'Unmute for me' : 'Mute for me'}
            </button>
            <div className="vpm-volume">
              <span>Volume</span>
              <input
                type="range"
                min={0}
                max={200}
                value={participantMenu.volume}
                onChange={(e) => {
                  onLocalUserSettingChange?.(participantMenu.userId, { volume: Number(e.target.value) })
                }}
              />
              <span>{participantMenu.volume}%</span>
            </div>
            <button
              className="vpm-item vpm-reset"
              onClick={() => {
                onLocalUserSettingChange?.(participantMenu.userId, { muted: false, volume: 100 })
                handleCloseMenu()
              }}
            >
              Reset to default
            </button>
          </div>
        </>
      )}

      {/* Expanded Video Modal */}
      {expandedVideo && (
        <div className="vc-fullscreen-overlay" onClick={() => setExpandedVideo(null)}>
          <div className="vc-fullscreen-inner" onClick={e => e.stopPropagation()}>
            <button className="vc-fullscreen-close" onClick={() => setExpandedVideo(null)}>
              <XMarkIcon size={20} />
            </button>
            <video
              autoPlay
              playsInline
              className="vc-fullscreen-video"
              ref={el => { if (el && expandedVideo.stream) el.srcObject = expandedVideo.stream }}
            />
            <div className="vc-fullscreen-label">{expandedVideo.label}</div>
          </div>
        </div>
      )}
    </div>
  )
}

export default UnifiedVoiceView
