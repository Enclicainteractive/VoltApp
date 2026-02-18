import React, { useState } from 'react'
import { X, Link, ArrowRight } from 'lucide-react'
import { apiService } from '../../services/apiService'
import { soundService } from '../../services/soundService'
import './Modal.css'
import './JoinServerModal.css'

const JoinServerModal = ({ onClose, onSuccess }) => {
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const extractInviteCode = (input) => {
    // Handle full URLs like volt.voltagechat.app/invite/ABC123
    const urlMatch = input.match(/(?:invite\/|\.gg\/)([a-zA-Z0-9]+)/)
    if (urlMatch) return urlMatch[1]
    // Otherwise just use the raw input (assuming it's a code)
    return input.trim()
  }

  const handleJoin = async (e) => {
    e.preventDefault()
    
    const code = extractInviteCode(inviteCode)
    if (!code) {
      setError('Please enter an invite link or code')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await apiService.joinServer(code)
      soundService.serverJoined()
      onSuccess?.(res.data)
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid invite or server not found')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content join-server-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Join a Server</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleJoin}>
          <div className="modal-body">
            <div className="join-server-icon">
              <Link size={48} />
            </div>
            
            <p className="join-description">
              Enter an invite link or code to join an existing server
            </p>

            <div className="form-group">
              <label>Invite Link</label>
              <input
                type="text"
                className="input"
                placeholder="https://volt.voltagechat.app/invite/ABC123 or ABC123"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value)}
                autoFocus
              />
              <span className="input-hint">
                Invites look like: volt.voltagechat.app/invite/hTKzmak or hTKzmak
              </span>
            </div>

            {error && <div className="error-message">{error}</div>}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={loading || !inviteCode.trim()}
            >
              {loading ? 'Joining...' : <>Join Server <ArrowRight size={16} /></>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default JoinServerModal
