import React, { useState, useEffect } from 'react'
import { Users, Loader2, X, Globe } from 'lucide-react'
import { apiService } from '../services/apiService'
import { soundService } from '../services/soundService'
import { getStoredServer } from '../services/serverConfig'
import '../assets/styles/InviteEmbed.css'

const InviteEmbed = ({ inviteCode, inviteUrl }) => {
  const [invite, setInvite] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [joining, setJoining] = useState(false)
  const [joined, setJoined] = useState(false)

  const server = getStoredServer()
  // Server icons are uploaded to the Volt API (/api/upload/file/...), so use apiUrl not imageApiUrl
  const serverImageBase = server?.apiUrl || ''

  useEffect(() => {
    let cancelled = false
    const fetchInvite = async () => {
      try {
        const res = await apiService.getInvite(inviteCode)
        if (!cancelled && res.data) {
          setInvite(res.data)
          setLoading(false)
          return
        }
      } catch {}

      try {
        const res = await apiService.getCrossHostInvite(inviteCode)
        if (!cancelled && res.data) {
          setInvite(res.data)
          setLoading(false)
          return
        }
      } catch {}

      if (!cancelled) {
        setError(true)
        setLoading(false)
      }
    }
    fetchInvite()
    return () => { cancelled = true }
  }, [inviteCode])

  const handleJoin = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    setJoining(true)
    try {
      await apiService.joinServer(inviteCode)
      soundService.serverJoined()
      setJoined(true)
    } catch {
      window.open(inviteUrl, '_blank')
    }
    setJoining(false)
  }

  if (loading) {
    return (
      <div className="invite-embed loading">
        <Loader2 size={18} className="invite-embed-spinner" />
        <span>Loading invite...</span>
      </div>
    )
  }

  if (error || !invite) {
    return (
      <div className="invite-embed invalid">
        <div className="invite-embed-icon-invalid">
          <X size={24} />
        </div>
        <div className="invite-embed-info">
          <div className="invite-embed-label">Invalid Invite</div>
          <div className="invite-embed-desc">This invite may be expired or you might not have permission to join.</div>
        </div>
      </div>
    )
  }

  const serverData = invite.server || invite
  const serverName = serverData.name || 'Server'
  const memberCount = serverData.memberCount || invite.memberCount || 0
  const onlineCount = serverData.onlineCount || 0
  const serverIcon = serverData.icon
    ? serverData.icon.startsWith('http') ? serverData.icon : `${serverImageBase}${serverData.icon}`
    : null
  const isExternal = invite.type === 'cross-host' || invite.type === 'external'

  return (
    <div className="invite-embed">
      <div className="invite-embed-header">
        {isExternal && <Globe size={12} />}
        <span>You've been invited to join a server</span>
      </div>
      <div className="invite-embed-body">
        <div className="invite-embed-server-icon">
          {serverIcon ? (
            <img src={serverIcon} alt={serverName} />
          ) : (
            <span>{serverName.charAt(0)}</span>
          )}
        </div>
        <div className="invite-embed-info">
          <div className="invite-embed-name">{serverName}</div>
          <div className="invite-embed-stats">
            {onlineCount > 0 && (
              <span className="invite-embed-stat">
                <span className="invite-embed-dot online" />
                {onlineCount} Online
              </span>
            )}
            <span className="invite-embed-stat">
              <span className="invite-embed-dot members" />
              <Users size={12} />
              {memberCount} Members
            </span>
          </div>
        </div>
        <button
          className={`invite-embed-join ${joined ? 'joined' : ''}`}
          onClick={handleJoin}
          disabled={joining || joined}
        >
          {joined ? 'Joined' : joining ? '...' : 'Join'}
        </button>
      </div>
    </div>
  )
}

export default InviteEmbed
