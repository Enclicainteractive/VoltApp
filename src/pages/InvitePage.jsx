import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Users, Check, X, Loader2 } from 'lucide-react'
import { apiService } from '../services/apiService'
import { getStoredServer } from '../services/serverConfig'
import { useAuth } from '../contexts/AuthContext'
import '../assets/styles/InvitePage.css'

const InvitePage = () => {
  const { code } = useParams()
  const navigate = useNavigate()
  const { isAuthenticated, loading: authLoading } = useAuth()
  const [invite, setInvite] = useState(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState(null)
  const [joined, setJoined] = useState(false)
  
  const server = getStoredServer()
  const apiUrl = server?.apiUrl || ''
  const imageApiUrl = server?.imageApiUrl || apiUrl

  useEffect(() => {
    loadInvite()
  }, [code])

  const loadInvite = async () => {
    try {
      const res = await apiService.getInvite(code)
      setInvite(res.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid or expired invite')
    } finally {
      setLoading(false)
    }
  }

  const handleJoin = async () => {
    if (!isAuthenticated) {
      // Store invite code and redirect to login
      sessionStorage.setItem('pending_invite', code)
      navigate('/login')
      return
    }

    setJoining(true)
    setError(null)

    try {
      const res = await apiService.joinServer(code)
      setJoined(true)
      setTimeout(() => {
        navigate(`/chat/${res.data.id}`)
      }, 1500)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to join server')
      setJoining(false)
    }
  }

  if (authLoading || loading) {
    return (
      <div className="invite-page">
        <div className="invite-card loading">
          <Loader2 size={48} className="spin" />
          <p>Loading invite...</p>
        </div>
      </div>
    )
  }

  if (error && !invite) {
    return (
      <div className="invite-page">
        <div className="invite-card error">
          <div className="invite-icon error">
            <X size={48} />
          </div>
          <h1>Invalid Invite</h1>
          <p>{error}</p>
          <button className="btn btn-secondary" onClick={() => navigate('/chat')}>
            Go to VoltChat
          </button>
        </div>
      </div>
    )
  }

  if (joined) {
    return (
      <div className="invite-page">
        <div className="invite-card success">
          <div className="invite-icon success">
            <Check size={48} />
          </div>
          <h1>Joined!</h1>
          <p>Welcome to {invite?.server?.name}</p>
          <p className="redirect-text">Redirecting you to the server...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="invite-page">
      <div className="invite-card">
        <p className="invite-label">You've been invited to join</p>
        
        <div className="server-preview">
          <div className="server-icon-large">
            {invite?.server?.icon ? (
              <img src={invite.server.icon} alt={invite.server.name} />
            ) : (
              <span>{invite?.server?.name?.charAt(0) || 'S'}</span>
            )}
          </div>
          <h1 className="server-name">{invite?.server?.name || 'Server'}</h1>
          
          <div className="server-stats">
            <div className="stat">
              <span className="stat-dot online"></span>
              <span>{invite?.server?.onlineCount || 0} Online</span>
            </div>
            <div className="stat">
              <Users size={16} />
              <span>{invite?.server?.memberCount || 0} Members</span>
            </div>
          </div>
        </div>

        {invite?.inviter && (
          <div className="inviter-info">
            <img 
              src={invite.inviter.avatar || `${imageApiUrl}/api/images/users/${invite.inviter.id}/profile`} 
              alt={invite.inviter.username}
              className="inviter-avatar"
            />
            <span>Invited by <strong>{invite.inviter.username}</strong></span>
          </div>
        )}

        {error && <div className="error-message">{error}</div>}

        <button 
          className="btn btn-primary btn-large"
          onClick={handleJoin}
          disabled={joining}
        >
          {joining ? (
            <>
              <Loader2 size={20} className="spin" />
              Joining...
            </>
          ) : isAuthenticated ? (
            'Accept Invite'
          ) : (
            'Login to Join'
          )}
        </button>

        {!isAuthenticated && (
          <p className="login-hint">You need to be logged in to join servers</p>
        )}
      </div>
    </div>
  )
}

export default InvitePage
