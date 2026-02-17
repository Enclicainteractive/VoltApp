import React from 'react'
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX } from 'lucide-react'
import { useVoiceChannel } from '../hooks/useVoiceChannel'
import '../assets/styles/VoiceControls.css'

const VoiceControls = ({ channelId }) => {
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
          <Phone size={20} />
          Join Voice
        </button>
      ) : (
        <div className="voice-active">
          <div className="voice-participants">
            <span className="voice-label">In Voice ({participants.length + 1})</span>
          </div>
          <div className="voice-buttons">
            <button
              className={`icon-btn ${isMuted ? 'danger' : ''}`}
              onClick={toggleMute}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            <button
              className={`icon-btn ${isDeafened ? 'danger' : ''}`}
              onClick={toggleDeafen}
              title={isDeafened ? 'Undeafen' : 'Deafen'}
            >
              {isDeafened ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            <button
              className="icon-btn danger"
              onClick={leaveVoiceChannel}
              title="Leave Voice"
            >
              <PhoneOff size={20} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default VoiceControls
