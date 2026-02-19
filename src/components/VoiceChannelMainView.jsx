import React, { useState } from 'react'
import { Volume2, Users, Mic, MicOff, VolumeX, Maximize2, X } from 'lucide-react'
import Avatar from './Avatar'
import '../assets/styles/VoiceChannelMainView.css'

/**
 * VoiceChannelMainView
 * Replaces the chat area when a voice channel is selected in the sidebar.
 * Shows participants, video tiles, and allows joining/leaving.
 */
const VoiceChannelMainView = ({
  channel,
  isActive,
  participants = [],
  onJoin,
  onLeave,
}) => {
  const [expandedVideo, setExpandedVideo] = useState(null) // { userId, stream, label }

  if (!channel) return null

  return (
    <div className="vc-main-view">
      {/* Header */}
      <div className="vc-main-header">
        <Volume2 size={22} />
        <span className="vc-main-title">{channel.name}</span>
        {isActive && <span className="vc-active-badge">Connected</span>}
        <div className="vc-main-actions">
          {isActive ? (
            <button className="btn btn-danger btn-sm" onClick={onLeave}>Leave</button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={onJoin}>Join Voice</button>
          )}
        </div>
      </div>

      {/* Participants grid */}
      <div className="vc-main-body">
        {participants.length === 0 ? (
          <div className="vc-empty">
            <Users size={48} style={{ opacity: 0.3 }} />
            <p>No one is here yet.</p>
            {!isActive && (
              <button className="btn btn-primary" onClick={onJoin}>Join Voice</button>
            )}
          </div>
        ) : (
          <div className="vc-participants-grid">
            {participants.map(p => {
              const hasVideo = !!(p.videoStream || p.screenStream)
              return (
                <div
                  key={p.id}
                  className={[
                    'vc-tile',
                    p.muted    ? 'muted'    : '',
                    p.speaking ? 'speaking' : '',
                    hasVideo   ? 'has-video' : '',
                  ].filter(Boolean).join(' ')}
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
                    </div>
                  )}
                  <div className="vc-tile-footer">
                    <span className="vc-tile-name">
                      {p.username}
                      {p.isSelf ? ' (You)' : ''}
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
