import React, { useState, useEffect } from 'react'
import { UsersIcon, ArrowPathIcon, XMarkIcon, GlobeAltIcon } from '@heroicons/react/24/outline'
import { useTranslation } from '../hooks/useTranslation'
import { apiService } from '../services/apiService'
import { soundService } from '../services/soundService'
import { getStoredServer } from '../services/serverConfig'
import '../assets/styles/InviteEmbed.css'

const inviteCache = new Map()
const INVITE_CACHE_MS = 60 * 1000

const InviteEmbed = ({ inviteCode, inviteUrl }) => {
  const { t } = useTranslation()
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

    const cached = inviteCache.get(inviteCode)
    if (cached && Date.now() - cached.ts < INVITE_CACHE_MS) {
      if (cached.error) {
        setError(true)
        setLoading(false)
      } else {
        setInvite(cached.data)
        setLoading(false)
      }
      return () => { cancelled = true }
    }

    const fetchInvite = async () => {
      try {
        const res = await apiService.getInvite(inviteCode)
        if (!cancelled && res.data) {
          inviteCache.set(inviteCode, { ts: Date.now(), error: false, data: res.data })
          setInvite(res.data)
          setLoading(false)
          return
        }
      } catch {}

      try {
        const res = await apiService.getCrossHostInvite(inviteCode)
        if (!cancelled && res.data) {
          inviteCache.set(inviteCode, { ts: Date.now(), error: false, data: res.data })
          setInvite(res.data)
          setLoading(false)
          return
        }
      } catch {}

      if (!cancelled) {
        inviteCache.set(inviteCode, { ts: Date.now(), error: true, data: null })
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
      const newWindow = window.open(inviteUrl, '_blank', 'noopener,noreferrer')
      if (newWindow) newWindow.opener = null
    }
    setJoining(false)
  }

  if (loading) {
    return (
      <div className="invite-embed loading">
        <ArrowPathIcon size={18} className="invite-embed-spinner" />
        <span>{t('invitePage.loading', 'Loading invite...')}</span>
      </div>
    )
  }

  if (error || !invite) {
    return (
      <div className="invite-embed invalid">
        <div className="invite-embed-icon-invalid">
          <XMarkIcon size={24} />
        </div>
        <div className="invite-embed-info">
          <div className="invite-embed-label">{t('invitePage.invalidInvite', 'Invalid Invite')}</div>
          <div className="invite-embed-desc">{t('invitePage.invalidInviteDesc', 'This invite may be expired or you might not have permission to join.')}</div>
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
        {isExternal && <GlobeAltIcon size={12} />}
        <span>{t('invitePage.invitedToJoinServer', "You've been invited to join a server")}</span>
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
                {onlineCount} {t('status.online', 'Online')}
              </span>
            )}
            <span className="invite-embed-stat">
              <span className="invite-embed-dot members" />
              <UsersIcon size={12} />
              {memberCount} {t('chat.members', 'Members')}
            </span>
          </div>
        </div>
        <button
          className={`invite-embed-join ${joined ? 'joined' : ''}`}
          onClick={handleJoin}
          disabled={joining || joined}
        >
          {joined ? t('invitePage.joined', 'Joined') : joining ? '...' : t('servers.join', 'Join')}
        </button>
      </div>
    </div>
  )
}

export default InviteEmbed
