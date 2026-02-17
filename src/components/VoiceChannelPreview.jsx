import React, { useState, useEffect } from 'react'
import { Volume2, Users, PhoneCall } from 'lucide-react'
import { useSocket } from '../contexts/SocketContext'
import Avatar from './Avatar'
import '../assets/styles/VoiceChannelPreview.css'

const VoiceChannelPreview = ({ channel, onJoin, onClose }) => {
  const { socket, connected } = useSocket()
  const [participants, setParticipants] = useState([])

  useEffect(() => {
    if (!socket || !connected || !channel) return

    socket.emit('voice:get-participants', { channelId: channel.id })

    const handleParticipants = (data) => {
      if (data.channelId === channel.id) {
        setParticipants(data.participants || [])
      }
    }

    socket.on('voice:participants', handleParticipants)

    return () => {
      socket.off('voice:participants', handleParticipants)
    }
  }, [socket, connected, channel])

  return (
    <div className="voice-channel-preview">
      <div className="preview-header">
        <Volume2 size={24} />
        <div className="preview-info">
          <h3>{channel?.name}</h3>
          <span className="preview-type">Voice Channel</span>
        </div>
      </div>

      <div className="preview-participants">
        <div className="participants-header">
          <Users size={16} />
          <span>{participants.length} {participants.length === 1 ? 'person' : 'people'} in channel</span>
        </div>

        {participants.length > 0 ? (
          <div className="participants-list">
            {participants.map(p => (
              <div key={p.id} className="participant-item">
                <Avatar src={p.avatar} fallback={p.username} size={32} />
                <span className="participant-name">{p.username}</span>
                {p.muted && <span className="participant-status muted">Muted</span>}
              </div>
            ))}
          </div>
        ) : (
          <div className="no-participants">
            <p>No one is in this channel yet.</p>
            <p className="hint">Be the first to join!</p>
          </div>
        )}
      </div>

      <div className="preview-actions">
        <button className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={onJoin}>
          <PhoneCall size={18} />
          Join Voice
        </button>
      </div>
    </div>
  )
}

export default VoiceChannelPreview
