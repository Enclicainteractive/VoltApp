import React from 'react'
import { PhoneIcon, PhoneXMarkIcon, VideoCameraIcon } from '@heroicons/react/24/outline'
import { useNavigate } from 'react-router-dom'
import { useCall } from '../contexts/CallContext'
import Avatar from './Avatar'
import '../assets/styles/IncomingCallModal.css'

const IncomingCallModal = () => {
  const { incomingCall, acceptCall, declineCall } = useCall()
  const navigate = useNavigate()

  if (!incomingCall) return null

  const { caller, type, conversationId } = incomingCall
  const callerName = caller?.displayName || caller?.customUsername || caller?.username || 'Unknown'
  const isVideo = type === 'video'

  const handleAccept = () => {
    acceptCall()
    if (conversationId) navigate(`/chat/dms/${conversationId}`)
  }

  return (
    <div className="incoming-call-overlay">
      <div className="incoming-call-modal">
        <div className="incoming-call-backdrop-ring ring-one" />
        <div className="incoming-call-backdrop-ring ring-two" />

        <div className="incoming-call-label">{isVideo ? 'Incoming Video Call' : 'Incoming Voice Call'}</div>

        <div className="incoming-call-profile">
          <div className="incoming-call-avatar">
            <Avatar
              src={caller?.avatar}
              fallback={callerName}
              size={92}
              userId={caller?.id}
            />
          </div>

          <h2>{callerName}</h2>
          <p>{isVideo ? 'They want to start a face-to-face call.' : 'They want to talk now.'}</p>
        </div>

        <div className="incoming-call-actions">
          <button className="incoming-call-action decline" type="button" onClick={declineCall}>
            <PhoneXMarkIcon width={24} height={24} />
            <span>Decline</span>
          </button>

          <button className={`incoming-call-action accept ${isVideo ? 'video' : 'voice'}`} type="button" onClick={handleAccept}>
            {isVideo ? <VideoCameraIcon width={24} height={24} /> : <PhoneIcon width={24} height={24} />}
            <span>{isVideo ? 'Join Video' : 'Answer'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default IncomingCallModal
