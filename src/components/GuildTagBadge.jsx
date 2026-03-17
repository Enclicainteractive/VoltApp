/**
 * GuildTagBadge.jsx
 *
 * Reusable guild tag badge. Clicking it opens a small popover showing
 * server info (name, icon, member count, description). If the server has
 * marked its guild tag as private, the popover shows a "Private Server"
 * placeholder instead.
 *
 * Props:
 *  - tag        {string}  The guild tag text (e.g. "VOLT")
 *  - serverId   {string}  Server ID to fetch info for
 *  - serverName {string}  Optional pre-loaded server name
 *  - isPrivate  {boolean} If true, show private server info
 *  - className  {string}  Extra CSS classes
 */

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Lock, Users, Globe, ExternalLink } from 'lucide-react'
import { apiService } from '../services/apiService'
import './GuildTagBadge.css'

const GuildTagBadge = ({ tag, serverId, serverName, isPrivate: isPrivateProp, className = '' }) => {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [serverInfo, setServerInfo] = useState(null)
  const [loading, setLoading] = useState(false)
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 })
  const badgeRef = useRef(null)
  const popoverRef = useRef(null)

  const fetchServerInfo = useCallback(async () => {
    if (!serverId || serverInfo) return
    setLoading(true)
    try {
      const res = await apiService.getServerPublicInfo(serverId)
      setServerInfo(res.data)
    } catch (err) {
      // If 403/404, treat as private
      setServerInfo({ private: true, name: serverName || 'Private Server' })
    } finally {
      setLoading(false)
    }
  }, [serverId, serverInfo, serverName])

  const handleClick = useCallback((e) => {
    e.stopPropagation()
    e.preventDefault()

    if (!popoverOpen) {
      // Position the popover relative to the badge
      const rect = badgeRef.current?.getBoundingClientRect()
      if (rect) {
        const top = rect.bottom + window.scrollY + 6
        let left = rect.left + window.scrollX
        // Keep within viewport
        const popoverWidth = 260
        if (left + popoverWidth > window.innerWidth - 12) {
          left = window.innerWidth - popoverWidth - 12
        }
        setPopoverPos({ top, left })
      }
      fetchServerInfo()
    }
    setPopoverOpen(v => !v)
  }, [popoverOpen, fetchServerInfo])

  // Close on outside click
  useEffect(() => {
    if (!popoverOpen) return
    const handleOutside = (e) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target) &&
        badgeRef.current && !badgeRef.current.contains(e.target)
      ) {
        setPopoverOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [popoverOpen])

  // Close on scroll
  useEffect(() => {
    if (!popoverOpen) return
    const handleScroll = () => setPopoverOpen(false)
    window.addEventListener('scroll', handleScroll, { passive: true, capture: true })
    return () => window.removeEventListener('scroll', handleScroll, { capture: true })
  }, [popoverOpen])

  if (!tag) return null

  const isPrivate = isPrivateProp || serverInfo?.private || serverInfo?.guildTagPrivate

  const popover = popoverOpen && (
    <div
      ref={popoverRef}
      className="guild-tag-popover"
      style={{ top: popoverPos.top, left: popoverPos.left }}
      onClick={e => e.stopPropagation()}
    >
      {loading ? (
        <div className="gtp-loading">
          <span className="gtp-spinner" />
          <span>Loading server info…</span>
        </div>
      ) : isPrivate ? (
        <div className="gtp-private">
          <div className="gtp-private-icon">
            <Lock size={22} />
          </div>
          <div className="gtp-private-text">
            <strong>Private Server</strong>
            <span>This server's information is not publicly visible.</span>
          </div>
        </div>
      ) : serverInfo ? (
        <div className="gtp-info">
          <div className="gtp-header">
            {serverInfo.icon ? (
              <img src={serverInfo.icon} alt={serverInfo.name} className="gtp-icon" />
            ) : (
              <div className="gtp-icon-fallback">
                {(serverInfo.name || '?').slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="gtp-header-text">
              <strong className="gtp-name">{serverInfo.name}</strong>
              <span className="gtp-tag-label">#{tag}</span>
            </div>
          </div>
          {serverInfo.description && (
            <p className="gtp-description">{serverInfo.description}</p>
          )}
          <div className="gtp-stats">
            {serverInfo.memberCount != null && (
              <span className="gtp-stat">
                <Users size={12} />
                {serverInfo.memberCount.toLocaleString()} members
              </span>
            )}
            {serverInfo.isPublic !== false && (
              <span className="gtp-stat">
                <Globe size={12} />
                Public
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="gtp-private">
          <div className="gtp-private-icon"><Lock size={22} /></div>
          <div className="gtp-private-text">
            <strong>Unknown Server</strong>
            <span>Could not load server information.</span>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <>
      <span
        ref={badgeRef}
        className={`guild-tag-badge${popoverOpen ? ' open' : ''} ${className}`}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        aria-label={`Guild tag: ${tag}`}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleClick(e) }}
        title={`Guild: ${tag} — click for server info`}
      >
        #{tag}
      </span>
      {typeof document !== 'undefined' && popover && createPortal(popover, document.body)}
    </>
  )
}

export default GuildTagBadge
