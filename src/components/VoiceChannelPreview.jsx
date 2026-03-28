import React, { useState, useEffect } from 'react'
import { SpeakerWaveIcon, UsersIcon, PhoneIcon } from '@heroicons/react/24/outline'
import { useSocket } from '../contexts/SocketContext'
import { useTranslation } from '../hooks/useTranslation'
import { soundService } from '../services/soundService'
import Avatar from './Avatar'
import '../assets/styles/VoiceChannelPreview.css'

const VoiceChannelPreview = ({ channel, onJoin, onClose }) => {
  const { socket, connected } = useSocket()
  const { t } = useTranslation()
  const [participants, setParticipants] = useState([])

  useEffect(() => {
    if (!socket || !connected || !channel) return

    socket.emit('voice:get-participants', { channelId: channel.id })

    const handleParticipants = (data) => {
      if (data.channelId === channel.id) {
        setParticipants(data.participants || [])
      }
    }

    const handleUserJoined = (userInfo) => {
      const cid = userInfo?.channelId
      if (cid && cid !== channel.id) return
      if (!userInfo?.id) return
      setParticipants(prev => {
        if (prev.find(p => p.id === userInfo.id)) return prev
        return [...prev, userInfo]
      })
    }

    const handleUserLeft = (data) => {
      const userId = data?.userId || data?.id
      if (!userId) return
      const cid = data?.channelId
      // Only remove if the event is for this channel, or if no channelId provided
      if (cid && cid !== channel.id) return
      setParticipants(prev => prev.filter(p => p.id !== userId))
    }

    socket.on('voice:participants', handleParticipants)
    socket.on('voice:user-joined', handleUserJoined)
    socket.on('voice:user-left', handleUserLeft)

    return () => {
      socket.off('voice:participants', handleParticipants)
      socket.off('voice:user-joined', handleUserJoined)
      socket.off('voice:user-left', handleUserLeft)
    }
  }, [socket, connected, channel])

  return (
    <div className="voice-channel-preview">
      <div className="preview-header">
        <SpeakerWaveIcon size={24} />
        <div className="preview-info">
          <h3>{channel?.name}</h3>
          <span className="preview-type">{t('chat.voiceChannel', 'Voice Channel')}</span>
        </div>
      </div>

      <div className="preview-participants">
        <div className="participants-header">
          <UsersIcon size={16} />
          <span>{participants.length} {t('chat.connected', 'connected')}</span>
        </div>

        {participants.length > 0 ? (
          <div className="participants-list">
            {participants.map(p => (
              <div key={p.id} className="participant-item">
                <Avatar src={p.avatar} fallback={p.username} size={32} userId={p.userId} />
                <span className="participant-name">{p.username}</span>
                {p.muted && <span className="participant-status muted">{t('chat.muted', 'Muted')}</span>}
              </div>
            ))}
          </div>
        ) : (
          <div className="no-participants">
            <p>{t('voicePreview.empty', 'No one is in this channel yet.')}</p>
            <p className="hint">{t('voicePreview.beFirst', 'Be the first to join!')}</p>
          </div>
        )}
      </div>

      <div className="preview-actions">
        <button className="btn btn-secondary" onClick={onClose}>
          {t('common.cancel', 'Cancel')}
        </button>
        <button className="btn btn-primary" onClick={() => {
          soundService.prime()
          onJoin?.()
        }}>
          <PhoneIcon size={18} />
          {t('chat.joinChannel', 'Join Voice')}
        </button>
      </div>
    </div>
  )
}

export default VoiceChannelPreview
