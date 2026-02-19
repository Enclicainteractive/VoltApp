import React, { useEffect } from 'react'
import { Phone, PhoneOff, Video } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useCall } from '../contexts/CallContext'
import Avatar from './Avatar'
import '../assets/styles/IncomingCallModal.css'

const IncomingCallModal = () => {
  const { incomingCall, acceptCall, declineCall } = useCall()
  const navigate = useNavigate()

  if (!incomingCall) return null

  const { caller, type, conversationId } = incomingCall

  const handleAccept = () => {
    acceptCall()
    
    // Navigate to the DM conversation
    if (conversationId) {
      navigate(`/chat/dms/${conversationId}`)
    }
  }

  const handleDecline = () => {
    declineCall()
  }

  return (
    <div className="incoming-call-overlay">
      <div className="incoming-call-modal">
        <div className="incoming-call-header">
          <h2>Incoming {type === 'video' ? 'Video' : 'Voice'} Call</h2>
        </div>

        <div className="incoming-call-caller">
          <Avatar
            src={caller.avatar}
            fallback={caller.username}
            size={96}
            className="caller-avatar"
          />
          <h3 className="caller-name">{caller.username}</h3>
          <p className="call-type">
            {type === 'video' ? '📹 Video Call' : '📞 Voice Call'}
          </p>
        </div>

        <div className="incoming-call-actions">
          <button
            className="call-action-btn decline"
            onClick={handleDecline}
            title="Decline"
          >
            <PhoneOff size={28} />
            <span>Decline</span>
          </button>

          <button
            className={`call-action-btn accept ${type}`}
            onClick={handleAccept}
            title="Accept"
          >
            {type === 'video' ? <Video size={28} /> : <Phone size={28} />}
            <span>Accept</span>
          </button>
        </div>

        <div className="incoming-call-ring-animation">
          <div className="ring ring-1"></div>
          <div className="ring ring-2"></div>
          <div className="ring ring-3"></div>
        </div>
      </div>
    </div>
  )
}

export default IncomingCallModal