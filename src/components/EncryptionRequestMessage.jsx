import React from 'react'
import { Lock, Shield, Check, X } from 'lucide-react'
import { formatDistance } from 'date-fns'

const EncryptionRequestMessage = ({ request, onAccept, onDecline, onCancel, isPending, canCancel }) => {
  const { mode, requesterName, requestedBy, createdAt } = request

  const getModeInfo = (mode) => {
    switch (mode) {
      case 'password':
        return {
          icon: <Lock size={16} />,
          label: 'Password Protected',
          description: 'Messages encrypted with your password',
          color: 'var(--volt-primary)'
        }
      case 'local':
        return {
          icon: <Shield size={16} />,
          label: 'Device Only',
          description: 'Keys stored locally on this device',
          color: 'var(--volt-success)'
        }
      case 'transparent':
        return {
          icon: <Shield size={16} />,
          label: 'Synced',
          description: 'Encrypted backup for multi-device access',
          color: 'var(--volt-warning)'
        }
      default:
        return {
          icon: <Lock size={16} />,
          label: 'Encrypted',
          description: 'End-to-end encrypted messaging',
          color: 'var(--volt-primary)'
        }
    }
  }

  const modeInfo = getModeInfo(mode)
  const timeAgo = createdAt ? formatDistance(new Date(createdAt), new Date(), { addSuffix: true }) : 'just now'

  return (
    <div className="encryption-request-message">
      <div className="encryption-request-content">
        <div className="encryption-request-header">
          <div className="encryption-request-icon" style={{ backgroundColor: modeInfo.color }}>
            {modeInfo.icon}
          </div>
          <div className="encryption-request-info">
            <div className="encryption-request-title">
              <strong>{requesterName}</strong> wants to start encrypted messaging
            </div>
            <div className="encryption-request-time">{timeAgo}</div>
          </div>
        </div>

        <div className="encryption-request-details">
          <div className="encryption-request-mode">
            <span className="mode-badge" style={{ backgroundColor: modeInfo.color }}>
              {modeInfo.label}
            </span>
            <span className="mode-description">{modeInfo.description}</span>
          </div>
        </div>

        <div className="encryption-request-actions">
          {canCancel ? (
            <button
              className="volt-btn volt-btn-ghost encryption-request-btn decline"
              onClick={onCancel}
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <span className="spin">⟳</span>
                  Cancelling...
                </>
              ) : (
                <>
                  <X size={16} />
                  Cancel Request
                </>
              )}
            </button>
          ) : (
            <>
              <button
                className="volt-btn volt-btn-ghost encryption-request-btn decline"
                onClick={onDecline}
                disabled={isPending}
              >
                <X size={16} />
                Decline
              </button>
              <button
                className="volt-btn volt-btn-primary encryption-request-btn accept"
                onClick={onAccept}
                disabled={isPending}
              >
                {isPending ? (
                  <>
                    <span className="spin">⟳</span>
                    Processing...
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    Accept
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default EncryptionRequestMessage
