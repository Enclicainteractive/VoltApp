import React, { useState, useEffect } from 'react'
import { Shield, Lock, Monitor, Smartphone, AlertTriangle, Check, X, Loader2, Key, Clock } from 'lucide-react'
import { useSocket } from '../contexts/SocketContext'
import { useAuth } from '../contexts/AuthContext'
import { apiService } from '../services/apiService'
import { useE2e } from '../contexts/E2eContext'

const DmEncryptionRequestModal = ({ isOpen, onClose, request, conversation, onAccepted, onDeclined, alreadyHandled }) => {
  const { socket } = useSocket()
  const { user } = useAuth()
  const { getDmEncryptionFullStatus } = useE2e()
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState(request?.mode || 'password')
  
  // Listen for request updates
  useEffect(() => {
    if (!socket || !isOpen) return
    
    const handleRequestUpdate = (data) => {
      if (data.conversationId === conversation?.id) {
        // Request was cancelled or updated
        if (data.cancelled) {
          onClose()
        }
      }
    }
    
    socket.on('e2e:encryption-request-cancelled', handleRequestUpdate)
    
    return () => {
      socket.off('e2e:encryption-request-cancelled', handleRequestUpdate)
    }
  }, [socket, isOpen, conversation?.id, onClose])
  
  const getModeInfo = (modeId) => {
    switch (modeId) {
      case 'password':
        return {
          title: 'Password Protected',
          icon: Lock,
          color: 'var(--volt-primary)',
          description: 'Your messages will be encrypted with a key protected by your password. Even if the server is compromised, your messages remain secure.',
          security: 'Highest - Key never leaves your devices'
        }
      case 'local':
        return {
          title: 'Device Only',
          icon: Monitor,
          color: 'var(--volt-success)',
          description: 'Your encryption key stays on this device only. Maximum security but you cannot access messages from other devices.',
          security: 'High - Key stored locally only'
        }
      case 'transparent':
        return {
          title: 'Synced (Recovery)',
          icon: Smartphone,
          color: 'var(--volt-warning)',
          description: 'Your key is encrypted and synced to your account. You can recover your messages on new devices.',
          security: 'Medium - Encrypted backup stored on server'
        }
      default:
        return {
          title: 'Standard',
          icon: Shield,
          color: '#6366f1',
          description: 'End-to-end encrypted with key sync.',
          security: 'Standard'
        }
    }
  }
  
  const handleAccept = async () => {
    setLoading(true)
    setError(null)
    
    try {
      // For password mode, we need to handle differently - the initiator will send the key
      // For local mode, the key is generated locally and never synced
      // For transparent mode, we get the key from the initiator
      
      // Call the API to respond to the request
      await apiService.respondToDmEncryptionRequest(conversation?.id, true, null)
      
      // Notify parent
      onAccepted?.()
      onClose()
    } catch (err) {
      console.error('[DmEncryptionRequest] Accept error:', err)
      setError(err.message || 'Failed to accept encryption request')
    } finally {
      setLoading(false)
    }
  }
  
  const handleDecline = async () => {
    setLoading(true)
    setError(null)
    
    try {
      await apiService.respondToDmEncryptionRequest(conversation?.id, false, null)
      onDeclined?.()
      onClose()
    } catch (err) {
      console.error('[DmEncryptionRequest] Decline error:', err)
      setError(err.message || 'Failed to decline encryption request')
    } finally {
      setLoading(false)
    }
  }
  
  if (!isOpen || !request) return null
  
  // If already handled via chat message, show a simple message
  if (alreadyHandled) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="volt-modal" onClick={e => e.stopPropagation()}>
          <div className="volt-modal-header">
            <Shield size={22} style={{ color: 'var(--volt-primary)' }} />
            <h2>Encryption Request</h2>
            <button className="volt-modal-close" onClick={onClose}><X size={20} /></button>
          </div>
          <div className="volt-modal-content">
            <p>This encryption request has been handled in the chat.</p>
          </div>
          <div className="volt-modal-footer">
            <button className="volt-btn volt-btn-primary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    )
  }
  
  const modeInfo = getModeInfo(request.mode || mode)
  const requesterName = request.requesterName || 'Unknown user'
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="volt-modal encryption-request-modal" onClick={e => e.stopPropagation()}>
        <div className="volt-modal-header">
          <Shield size={22} style={{ color: 'var(--volt-primary)' }} />
          <h2>Encryption Request</h2>
          <button className="volt-modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="volt-modal-content">
          {/* Request info */}
          <div className="encryption-request-info">
            <div className="requester-avatar">
              <div className="avatar-placeholder">{requesterName.charAt(0).toUpperCase()}</div>
            </div>
            <div className="requester-details">
              <span className="requester-name">@{requesterName}</span>
              <span className="request-time">
                <Clock size={12} />
                {request.createdAt ? new Date(request.createdAt).toLocaleString() : 'Just now'}
              </span>
            </div>
          </div>
          
          {/* Mode description */}
          <div className="mode-description">
            <AlertTriangle size={16} style={{ color: modeInfo.color }} />
            <span>
              <strong>@{requesterName}</strong> wants to enable end-to-end encryption with mode: 
              <strong style={{ color: modeInfo.color }}> {modeInfo.title}</strong>
            </span>
          </div>
          
          {/* Mode details card */}
          <div className="mode-details-card" style={{ borderColor: modeInfo.color }}>
            <div className="mode-header">
              <modeInfo.icon size={24} style={{ color: modeInfo.color }} />
              <div>
                <h3>{modeInfo.title}</h3>
                <span className="mode-security">{modeInfo.security}</span>
              </div>
            </div>
            <p className="mode-desc">{modeInfo.description}</p>
            
            {request.mode === 'password' && (
              <div className="mode-warning">
                <Lock size={14} />
                <span>Your password will be required to decrypt messages. Make sure to remember it!</span>
              </div>
            )}
            
            {request.mode === 'local' && (
              <div className="mode-warning">
                <Monitor size={14} />
                <span>You won't be able to recover messages if you lose access to this device.</span>
              </div>
            )}
            
            {request.mode === 'transparent' && (
              <div className="mode-warning">
                <Smartphone size={14} />
                <span>A backup of your key will be stored encrypted on the server for recovery.</span>
              </div>
            )}
          </div>
          
          {error && (
            <div className="volt-modal-error">{error}</div>
          )}
          
          {/* Info about what happens */}
          <div className="request-consequences">
            <h4>What happens next:</h4>
            <ul>
              <li><Check size={14} /> Messages will be encrypted end-to-end</li>
              <li><Check size={14} /> The server cannot read your messages</li>
              <li><Check size={14} /> Both parties need to accept for encryption to activate</li>
              {request.mode === 'password' && (
                <li><Check size={14} /> You'll need a password to decrypt messages</li>
              )}
              {request.mode === 'local' && (
                <li><Check size={14} /> Messages can only be read on this device</li>
              )}
              {request.mode === 'transparent' && (
                <li><Check size={14} /> You can restore messages on new devices</li>
              )}
            </ul>
          </div>
        </div>

        <div className="volt-modal-footer">
          <button 
            className="volt-btn volt-btn-ghost" 
            onClick={handleDecline}
            disabled={loading}
          >
            <X size={16} />
            Decline
          </button>
          <button 
            className="volt-btn volt-btn-primary" 
            onClick={handleAccept}
            disabled={loading}
            style={{ backgroundColor: modeInfo.color }}
          >
            {loading ? <Loader2 size={16} className="spin" /> : <Check size={16} />}
            Accept & Enable
          </button>
        </div>
      </div>
    </div>
  )
}

export default DmEncryptionRequestModal
