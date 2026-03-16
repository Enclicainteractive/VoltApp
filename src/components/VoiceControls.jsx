import React from 'react'
import { PhoneIcon, PhoneXMarkIcon, MicrophoneIcon, SpeakerWaveIcon, SpeakerXMarkIcon } from '@heroicons/react/24/outline'
import { useVoiceChannel } from '../hooks/useVoiceChannel'
import { useTranslation } from '../hooks/useTranslation'
import '../assets/styles/VoiceControls.css'

const VoiceControls = ({ channelId }) => {
  const { t } = useTranslation()
  const {
    isConnected,
    participants,
    isMuted,
    isDeafened,
    joinVoiceChannel,
    leaveVoiceChannel,
    toggleMute,
    toggleDeafen
  } = useVoiceChannel(channelId)

  return (
    <div className="voice-controls">
      {!isConnected ? (
        <button className="btn btn-success voice-join-btn" onClick={joinVoiceChannel}>
          <PhoneIcon size={24} />
          {t('chat.joinChannel', 'Join Voice')}
        </button>
      ) : (
        <div className="voice-active">
          <div className="voice-participants">
            <span className="voice-label">{t('chat.voiceConnected', 'In Voice')} ({participants.length + 1})</span>
          </div>
          <div className="voice-buttons">
            <button
              className={`icon-btn ${isMuted ? 'danger' : ''}`}
              onClick={toggleMute}
              title={isMuted ? t('chat.unmute', 'Unmute') : t('chat.mute', 'Mute')}
            >
              {isMuted ? <MicrophoneIcon size={24} /> : <MicrophoneIcon size={24} />}
            </button>
            <button
              className={`icon-btn ${isDeafened ? 'danger' : ''}`}
              onClick={toggleDeafen}
              title={isDeafened ? t('chat.undeafen', 'Undeafen') : t('chat.deafen', 'Deafen')}
            >
              {isDeafened ? <SpeakerXMarkIcon size={24} /> : <SpeakerWaveIcon size={24} />}
            </button>
            <button
              className="icon-btn danger"
              onClick={leaveVoiceChannel}
              title={t('misc.leaveVoice', 'Leave Voice')}
            >
              <PhoneXMarkIcon size={24} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default VoiceControls
