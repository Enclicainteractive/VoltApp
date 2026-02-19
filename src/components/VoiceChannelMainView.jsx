import React, { useState } from 'react'
import { Volume2, Users, Mic, MicOff, VolumeX, Maximize2, X, Wifi, WifiOff, PhoneOff, Monitor, MonitorOff, Video, VideoOff, Settings, ChevronUp } from 'lucide-react'
import Avatar from './Avatar'
import '../assets/styles/VoiceChannelMainView.css'

/**
 * VoiceChannelMainView
 * Replaces the chat area when a voice channel is selected in the sidebar.
 * Shows participants, video tiles, connection status, and allows joining/leaving.
 */
const VoiceChannelMainView = ({
  channel,
  isActive,
  participants = [],
  onJoin,
  onLeave,
  isMuted = false,
  isDeafened = false,
  onToggleMute,
  onToggleDeafen,
  isVideoOn = false,
  onToggleVideo,
  isScreenSharing = false,
  onToggleScreenShare,
  connectionState = 'disconnected',
  peerStates = {},
  onShowConnectionInfo,
  onOpenSettings,
  showAsMini = false,
  onExpand,
}) => {
  const [expandedVideo, setExpandedVideo] = useState(null)

  if (!channel) return null

  const getConnectionStatus = () => {
    if (!isActive) return { text: 'Click to join', color: 'var(--volt-text-muted)', icon: null }
    if (connectionState === 'connecting') return { text: 'Connecting...', color: 'var(--volt-warning)', icon: <Wifi className="pulse" size={14} /> }
    if (connectionState === 'connected') return { text: 'Connected', color: '#22c55e', icon: <Wifi size={14} /> }
    if (connectionState === 'failed') return { text: 'Connection failed', color: 'var(--volt-danger)', icon: <WifiOff size={14} /> }
    return { text: 'Disconnected', color: 'var(--volt-text-muted)', icon: <WifiOff size={14} /> }
  }

  const connectionStatus = getConnectionStatus()

  const handleDoubleClick = () => {
    if (!isActive) {
      onJoin()
    }
  }

  if (showAsMini) {
    return (
      <div className="vc-mini-view">
        <div className="vc-mini-header" onClick={onExpand}>
          <Volume2 size={16} />
          <span className="vc-mini-title">{channel.name}</span>
          <span className="vc-mini-status" style={{ color: connectionStatus.color }}>
            {connectionStatus.icon}
            {participants.length}
          </span>
          <ChevronUp size={14} className="vc-mini-expand-icon" />
        </div>
        <div className="vc-mini-controls">
          <button 
            className={`vc-mini-btn ${isMuted ? 'active' : ''}`}
            onClick={onToggleMute}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
          <button 
            className={`vc-mini-btn ${isDeafened ? 'active danger' : ''}`}
            onClick={onToggleDeafen}
            title={isDeafened ? 'Undeafen' : 'Deafen'}
          >
            {isDeafened ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <button 
            className={`vc-mini-btn ${isVideoOn ? 'active' : ''}`}
            onClick={onToggleVideo}
            title={isVideoOn ? 'Turn off camera' : 'Turn on camera'}
          >
            {isVideoOn ? <Video size={16} /> : <VideoOff size={16} />}
          </button>
          <button 
            className={`vc-mini-btn ${isScreenSharing ? 'active' : ''}`}
            onClick={onToggleScreenShare}
            title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
          >
            {isScreenSharing ? <Monitor size={16} /> : <MonitorOff size={16} />}
          </button>
          <button className="vc-mini-btn danger" onClick={onLeave} title="Leave">
            <PhoneOff size={16} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="vc-main-view" onDoubleClick={handleDoubleClick}>
      {/* Header */}
      <div className="vc-main-header">
        <Volume2 size={22} />
        <span className="vc-main-title">{channel.name}</span>
        {isActive && (
          <span className="vc-active-badge" style={{ color: connectionStatus.color, background: `${connectionStatus.color}20`, borderColor: `${connectionStatus.color}40` }}>
            {connectionStatus.icon}
            {connectionStatus.text}
          </span>
        )}
        <div className="vc-main-actions">
          {isActive ? (
            <button className="btn btn-danger btn-sm" onClick={onLeave}>
              <PhoneOff size={14} />
              Leave
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={onJoin}>
              <Volume2 size={14} />
              Join Voice
            </button>
          )}
        </div>
      </div>

      {/* Participants grid */}
      <div className="vc-main-body">
        {participants.length === 0 ? (
          <div className="vc-empty" onClick={!isActive ? onJoin : undefined}>
            <Users size={48} style={{ opacity: 0.3 }} />
            <p>No one is here yet.</p>
            {!isActive && (
              <button className="btn btn-primary" onClick={onJoin}>Join Voice</button>
            )}
            {isActive && <p className="vc-hint">Double-click to rejoin if disconnected</p>}
          </div>
        ) : (
          <div className="vc-participants-grid">
            {participants.map(p => {
              const hasVideo = !!(p.videoStream || p.screenStream)
              const peerState = peerStates[p.id]
              const isPeerConnected = peerState === 'connected'
              
              return (
                <div
                  key={p.id}
                  className={[
                    'vc-tile',
                    p.muted    ? 'muted'    : '',
                    p.speaking ? 'speaking' : '',
                    hasVideo   ? 'has-video' : '',
                    !isPeerConnected && p.id !== user?.id ? 'connecting' : '',
                  ].filter(Boolean).join(' ')}
                  onDoubleClick={() => {
                    if (!isActive) onJoin()
                  }}
                >
                  {hasVideo ? (
                    <>
                      <video
                        autoPlay
                        playsInline
                        muted={p.isSelf}
                        className="vc-tile-video"
                        ref={el => { if (el) el.srcObject = p.videoStream || p.screenStream }}
                      />
                      <button
                        className="vc-tile-expand"
                        onClick={() => setExpandedVideo({ userId: p.id, stream: p.videoStream || p.screenStream, label: p.username })}
                        title="Expand"
                      >
                        <Maximize2 size={14} />
                      </button>
                    </>
                  ) : (
                    <div className="vc-tile-avatar">
                      <Avatar
                        src={p.avatar}
                        fallback={p.username}
                        size={72}
                        className="vc-avatar"
                      />
                      {!isPeerConnected && p.id !== user?.id && (
                        <div className="vc-tile-connecting-overlay">
                          <Wifi size={16} className="pulse" />
                        </div>
                      )}
                    </div>
                  )}
                  <div className="vc-tile-footer">
                    <span className="vc-tile-name">
                      {p.username}
                      {p.isSelf ? ' (You)' : ''}
                      {!isPeerConnected && p.id !== user?.id && <span className="vc-tile-pending"> (connecting)</span>}
                    </span>
                    <span className="vc-tile-status">
                      {p.deafened ? <VolumeX size={14} /> : p.muted ? <MicOff size={14} /> : <Mic size={14} />}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Bottom Controls Bar */}
      {isActive && (
        <div className="vc-main-bottom-controls">
          <div className="vc-bottom-controls-left">
            <button 
              className={`vc-bottom-btn ${isMuted ? 'active danger' : ''}`}
              onClick={onToggleMute}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
              <span>{isMuted ? 'Unmute' : 'Mute'}</span>
            </button>
            <button 
              className={`vc-bottom-btn ${isDeafened ? 'active danger' : ''}`}
              onClick={onToggleDeafen}
              title={isDeafened ? 'Undeafen' : 'Deafen'}
            >
              {isDeafened ? <VolumeX size={20} /> : <Volume2 size={20} />}
              <span>{isDeafened ? 'Undeafen' : 'Deafen'}</span>
            </button>
          </div>
          
          <div className="vc-bottom-controls-center">
            <span className="vc-bottom-participants">
              <Users size={16} />
              {participants.length} {participants.length === 1 ? 'person' : 'people'}
            </span>
          </div>
          
          <div className="vc-bottom-controls-right">
            <button 
              className={`vc-bottom-btn ${isVideoOn ? 'active' : ''}`}
              onClick={onToggleVideo}
              title={isVideoOn ? 'Turn off camera' : 'Turn on camera'}
            >
              {isVideoOn ? <Video size={20} /> : <VideoOff size={20} />}
              <span>{isVideoOn ? 'Stop Video' : 'Start Video'}</span>
            </button>
            <button 
              className={`vc-bottom-btn ${isScreenSharing ? 'active' : ''}`}
              onClick={onToggleScreenShare}
              title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
            >
              {isScreenSharing ? <Monitor size={20} /> : <MonitorOff size={20} />}
              <span>{isScreenSharing ? 'Stop Share' : 'Share Screen'}</span>
            </button>
            <button 
              className="vc-bottom-btn"
              onClick={onShowConnectionInfo}
              title="Connection Settings"
            >
              <Wifi size={20} />
              <span>Connection</span>
            </button>
            <button 
              className="vc-bottom-btn"
              onClick={onOpenSettings}
              title="Voice Settings"
            >
              <Settings size={20} />
              <span>Settings</span>
            </button>
            <button className="vc-bottom-btn danger" onClick={onLeave} title="Leave Voice">
              <PhoneOff size={20} />
              <span>Leave</span>
            </button>
          </div>
        </div>
      )}

      {/* Fullscreen video overlay */}
      {expandedVideo && (
        <div className="vc-fullscreen-overlay" onClick={() => setExpandedVideo(null)}>
          <div className="vc-fullscreen-inner" onClick={e => e.stopPropagation()}>
            <button className="vc-fullscreen-close" onClick={() => setExpandedVideo(null)}>
              <X size={20} />
            </button>
            <video
              autoPlay playsInline
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

export default VoiceChannelMainView
