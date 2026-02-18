import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Users, Check, X, Loader2, Globe, Link2 } from 'lucide-react'
import { apiService } from '../services/apiService'
import { getStoredServer } from '../services/serverConfig'
import { useAuth } from '../contexts/AuthContext'
import '../assets/styles/InvitePage.css'

const InvitePage = () => {
  const { code } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { isAuthenticated, loading: authLoading } = useAuth()
  const [invite, setInvite] = useState(null)
  const [inviteType, setInviteType] = useState(null) // 'local' | 'cross-host' | 'external'
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState(null)
  const [joined, setJoined] = useState(false)
  const [externalHost, setExternalHost] = useState(searchParams.get('host') || '')
  const [showHostInput, setShowHostInput] = useState(false)
  
  const server = getStoredServer()
  const apiUrl = server?.apiUrl || ''
  const imageApiUrl = server?.imageApiUrl || apiUrl

  useEffect(() => {
    resolveInvite()
  }, [code])

  const resolveInvite = async () => {
    setLoading(true)
    setError(null)

    // 1) Try local invite
    try {
      const res = await apiService.getInvite(code)
      if (res.data) {
        setInvite(res.data)
        setInviteType('local')
        setLoading(false)
        return
      }
    } catch { /* not a local invite */ }

    // 2) Try cross-host encoded invite
    try {
      const res = await apiService.getCrossHostInvite(code)
      if (res.data) {
        if (res.data.type === 'local') {
          const localRes = await apiService.getInvite(res.data.serverId || code)
          setInvite(localRes.data)
          setInviteType('local')
          setLoading(false)
          return
        }
        setInvite(res.data)
        setInviteType('cross-host')
        setLoading(false)
        return
      }
    } catch { /* not a cross-host invite */ }

    // 3) Try external if host is provided
    const hostParam = searchParams.get('host')
    if (hostParam) {
      await resolveExternal(hostParam)
      return
    }

    // No match - show host input to let user specify the remote host
    setShowHostInput(true)
    setLoading(false)
  }

  const resolveExternal = async (host) => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiService.resolveExternalInvite(host, code)
      if (res.data) {
        setInvite(res.data)
        setInviteType('external')
        setShowHostInput(false)
        setLoading(false)
        return
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Could not resolve invite from that host')
    }
    setLoading(false)
  }

  const handleExternalLookup = (e) => {
    e.preventDefault()
    if (!externalHost.trim()) return
    resolveExternal(externalHost.trim())
  }

  const handleJoin = async () => {
    if (!isAuthenticated) {
      const pendingData = { code, type: inviteType }
      if (inviteType === 'external' && invite?.host) pendingData.host = invite.hostUrl || invite.host
      sessionStorage.setItem('pending_invite', JSON.stringify(pendingData))
      navigate('/login')
      return
    }

    setJoining(true)
    setError(null)

    try {
      let res
      if (inviteType === 'local') {
        res = await apiService.joinServer(code)
      } else if (inviteType === 'cross-host') {
        res = await apiService.joinCrossHostInvite(code)
      } else if (inviteType === 'external') {
        res = await apiService.joinExternalInvite(invite.hostUrl || invite.host, code)
      }

      setJoined(true)
      const serverId = res?.data?.id
      setTimeout(() => {
        navigate(serverId ? `/chat/${serverId}` : '/chat')
      }, 1500)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to join server')
      setJoining(false)
    }
  }

  const getServerIcon = () => {
    const srv = invite?.server || invite
    if (!srv?.icon) return null
    if (srv.icon.startsWith('http')) return srv.icon
    if (inviteType === 'external' && invite?.hostUrl) return `${invite.hostUrl}${srv.icon}`
    return srv.icon
  }

  const getServerName = () => {
    return invite?.server?.name || invite?.name || 'Server'
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

  if (showHostInput && !invite) {
    return (
      <div className="invite-page">
        <div className="invite-card">
          <div className="invite-icon" style={{ background: 'rgba(31,182,255,0.1)', color: 'var(--volt-primary, #1fb6ff)' }}>
            <Globe size={48} />
          </div>
          <h1>External Invite</h1>
          <p style={{ color: 'var(--volt-text-secondary)', marginBottom: 16 }}>
            This invite code wasn't found locally. Enter the host it came from to connect.
          </p>
          <form onSubmit={handleExternalLookup} style={{ width: '100%', maxWidth: 340, margin: '0 auto' }}>
            <input
              type="text"
              placeholder="e.g. chat.example.com"
              value={externalHost}
              onChange={e => setExternalHost(e.target.value)}
              className="invite-host-input"
              autoFocus
            />
            <button type="submit" className="btn btn-primary btn-large" style={{ marginTop: 10, width: '100%' }}>
              <Link2 size={18} /> Look Up Invite
            </button>
          </form>
          {error && <div className="error-message" style={{ marginTop: 12 }}>{error}</div>}
          <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={() => navigate('/chat')}>
            Go to VoltChat
          </button>
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
          <p>Welcome to {getServerName()}</p>
          <p className="redirect-text">Redirecting you to the server...</p>
        </div>
      </div>
    )
  }

  const serverIcon = getServerIcon()
  const serverName = getServerName()
  const memberCount = invite?.server?.memberCount || invite?.memberCount || 0
  const onlineCount = invite?.server?.onlineCount || 0
  const isExternal = inviteType === 'external' || inviteType === 'cross-host'
  const remoteHost = invite?.host || invite?.hostUrl || null

  return (
    <div className="invite-page">
      <div className="invite-card">
        <p className="invite-label">You've been invited to join</p>
        
        <div className="server-preview">
          <div className="server-icon-large">
            {serverIcon ? (
              <img src={serverIcon} alt={serverName} />
            ) : (
              <span>{serverName?.charAt(0) || 'S'}</span>
            )}
          </div>
          <h1 className="server-name">{serverName}</h1>
          
          {isExternal && remoteHost && (
            <div className="invite-federation-badge">
              <Globe size={14} />
              <span>{remoteHost}</span>
            </div>
          )}

          <div className="server-stats">
            {onlineCount > 0 && (
              <div className="stat">
                <span className="stat-dot online"></span>
                <span>{onlineCount} Online</span>
              </div>
            )}
            <div className="stat">
              <Users size={16} />
              <span>{memberCount} Members</span>
            </div>
          </div>

          {invite?.server?.description && (
            <p className="server-description">{invite.server.description}</p>
          )}
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

        {isExternal && invite?.newPeer && (
          <div className="federation-notice">
            <Globe size={14} />
            <span>A federation link will be established automatically</span>
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
            isExternal ? 'Join Federated Server' : 'Accept Invite'
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
