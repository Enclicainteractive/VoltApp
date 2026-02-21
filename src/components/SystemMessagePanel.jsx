/**
 * SystemMessagePanel
 *
 * In-app inbox for system messages sent by Voltage.
 * Shown as a full panel when the user clicks the inbox icon in the DM sidebar.
 *
 * Categories: update | account | discovery | announcement
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  Bell, RefreshCw, Shield, ShieldAlert, Search, SearchX,
  Megaphone, Info, CheckCircle, AlertTriangle, XCircle,
  Trash2, CheckCheck, ExternalLink, ChevronDown, ChevronUp, X
} from 'lucide-react'
import { apiService } from '../services/apiService'
import { useTranslation } from '../hooks/useTranslation'
import MarkdownMessage from './MarkdownMessage'
import '../assets/styles/SystemMessagePanel.css'

// ---------------------------------------------------------------------------
// Icon & colour helpers
// ---------------------------------------------------------------------------

const CATEGORY_META = {
  update:       { key: 'system.categoryUpdate',       fallback: 'Update',       icon: RefreshCw,    colour: '#818cf8' },
  account:      { key: 'system.categoryAccount',      fallback: 'Account',      icon: Shield,       colour: '#f59e0b' },
  discovery:    { key: 'system.categoryDiscovery',    fallback: 'Discovery',    icon: Search,       colour: '#34d399' },
  announcement: { key: 'system.categoryAnnouncement', fallback: 'Announcement', icon: Megaphone,    colour: '#60a5fa' },
  default:      { key: 'system.categorySystem',       fallback: 'System',       icon: Bell,         colour: '#94a3b8' }
}

const SEVERITY_ICON = {
  success: CheckCircle,
  warning: AlertTriangle,
  error:   XCircle,
  info:    Info
}

const SEVERITY_COLOUR = {
  success: '#22c55e',
  warning: '#f59e0b',
  error:   '#ef4444',
  info:    '#818cf8'
}

function getCategoryMeta(category, t) {
  const meta = CATEGORY_META[category] || CATEGORY_META.default
  return { ...meta, label: t(meta.key, meta.fallback) }
}

function SeverityIcon({ severity, size = 16 }) {
  const Icon = SEVERITY_ICON[severity] || Info
  const color = SEVERITY_COLOUR[severity] || '#818cf8'
  return <Icon size={size} color={color} />
}

// ---------------------------------------------------------------------------
// Individual message card
// ---------------------------------------------------------------------------

function SystemMessageCard({ message, onMarkRead, onDelete, t }) {
  const [expanded, setExpanded] = useState(!message.read)
  const meta = getCategoryMeta(message.category, t)
  const CategoryIcon = meta.icon

  const handleExpand = () => {
    setExpanded(e => !e)
    if (!message.read) onMarkRead(message.id)
  }

  const timeAgo = (iso) => {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return t('system.justNow', 'just now')
    if (mins < 60) return t('system.minutesAgoShort', '{{count}}m ago', { count: mins })
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return t('system.hoursAgoShort', '{{count}}h ago', { count: hrs })
    return t('system.daysAgoShort', '{{count}}d ago', { count: Math.floor(hrs / 24) })
  }

  return (
    <div className={`sysmsg-card ${message.read ? 'read' : 'unread'} severity-${message.severity || 'info'}`}>
      <div className="sysmsg-card-header" onClick={handleExpand} role="button" tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && handleExpand()}>
        <div className="sysmsg-card-icon" style={{ color: meta.colour }}>
          <CategoryIcon size={18} />
        </div>
        <div className="sysmsg-card-summary">
          <div className="sysmsg-card-title">
            {!message.read && <span className="sysmsg-unread-dot" />}
            {message.title}
          </div>
          <div className="sysmsg-card-meta">
            <span className="sysmsg-category-label" style={{ color: meta.colour }}>{meta.label}</span>
            <span className="sysmsg-dot">·</span>
            <SeverityIcon severity={message.severity} size={12} />
            <span className="sysmsg-time">{timeAgo(message.createdAt)}</span>
          </div>
        </div>
        <div className="sysmsg-card-actions">
          {!message.read && (
            <button
              className="sysmsg-action-btn"
              title={t('system.markAsRead', 'Mark as read')}
              onClick={e => { e.stopPropagation(); onMarkRead(message.id) }}
            >
              <CheckCheck size={14} />
            </button>
          )}
          <button
            className="sysmsg-action-btn danger"
            title={t('system.dismiss', 'Dismiss')}
            onClick={e => { e.stopPropagation(); onDelete(message.id) }}
          >
            <Trash2 size={14} />
          </button>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>

      {expanded && (
        <div className="sysmsg-card-body">
          <MarkdownMessage content={message.body} />

          {message.meta?.releaseUrl && (
            <a
              href={message.meta.releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="sysmsg-external-link"
            >
              <ExternalLink size={13} />
              {t('system.viewOnGithub', 'View on GitHub')}
            </a>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export default function SystemMessagePanel({ onClose }) {
  const { t } = useTranslation()
  const [messages, setMessages] = useState([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')  // 'all' | 'unread' | category

  const load = useCallback(async () => {
    try {
      const res = await apiService.getSystemMessages()
      setMessages(res.data.messages || [])
      setUnread(res.data.unread || 0)
    } catch (err) {
      console.error('[SystemMessagePanel] load failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleMarkRead = async (id) => {
    await apiService.markSystemMessageRead(id).catch(() => {})
    setMessages(prev => prev.map(m => m.id === id ? { ...m, read: true } : m))
    setUnread(prev => Math.max(0, prev - 1))
  }

  const handleDelete = async (id) => {
    await apiService.deleteSystemMessage(id).catch(() => {})
    const msg = messages.find(m => m.id === id)
    setMessages(prev => prev.filter(m => m.id !== id))
    if (msg && !msg.read) setUnread(prev => Math.max(0, prev - 1))
  }

  const handleMarkAllRead = async () => {
    await apiService.markAllSystemMessagesRead().catch(() => {})
    setMessages(prev => prev.map(m => ({ ...m, read: true })))
    setUnread(0)
  }

  const handleClearAll = async () => {
    await apiService.clearSystemMessages().catch(() => {})
    setMessages([])
    setUnread(0)
  }

  const displayed = messages.filter(m => {
    if (filter === 'unread') return !m.read
    if (filter !== 'all') return m.category === filter
    return true
  })

  const categories = [...new Set(messages.map(m => m.category))]

  return (
    <div className="sysmsg-panel">
      {/* Header */}
      <div className="sysmsg-panel-header">
        <div className="sysmsg-panel-title">
          <Bell size={18} />
          <span>{t('system.systemInbox', 'System Inbox')}</span>
          {unread > 0 && <span className="sysmsg-badge">{unread}</span>}
        </div>
        <div className="sysmsg-panel-header-actions">
          {unread > 0 && (
            <button className="sysmsg-header-btn" onClick={handleMarkAllRead} title={t('system.markAllAsRead', 'Mark all as read')}>
              <CheckCheck size={15} />
            </button>
          )}
          {messages.length > 0 && (
            <button className="sysmsg-header-btn danger" onClick={handleClearAll} title={t('system.clearAll', 'Clear all')}>
              <Trash2 size={15} />
            </button>
          )}
          {onClose && (
            <button className="sysmsg-header-btn" onClick={onClose} title={t('common.close', 'Close')}>
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      {messages.length > 0 && (
        <div className="sysmsg-filters">
          {['all', 'unread', ...categories].map(f => (
            <button
              key={f}
              className={`sysmsg-filter-btn ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? t('system.all', 'All') : f === 'unread' ? t('system.unreadCount', 'Unread ({{count}})', { count: unread }) : getCategoryMeta(f, t).label}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="sysmsg-list">
        {loading && (
          <div className="sysmsg-empty">
            <span className="sysmsg-loading-dots">
              <span /><span /><span />
            </span>
          </div>
        )}

        {!loading && displayed.length === 0 && (
          <div className="sysmsg-empty">
            <Bell size={36} opacity={0.25} />
            <p>{filter === 'unread' ? t('system.noUnreadMessages', 'No unread messages') : t('system.inboxEmpty', 'Your inbox is empty')}</p>
          </div>
        )}

        {!loading && displayed.map(msg => (
          <SystemMessageCard
            key={msg.id}
            message={msg}
            onMarkRead={handleMarkRead}
            onDelete={handleDelete}
            t={t}
          />
        ))}
      </div>
    </div>
  )
}
