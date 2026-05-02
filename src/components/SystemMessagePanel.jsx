/**
 * SystemMessagePanel
 *
 * In-app inbox for system messages sent by Voltage.
 * Shown as a full panel when the user clicks the inbox icon in the DM sidebar.
 *
 * Categories: update | account | discovery | announcement
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowPathIcon, ArrowTopRightOnSquareIcon, BellIcon, CheckCircleIcon, CheckIcon, ChevronDownIcon, ChevronUpIcon, ExclamationTriangleIcon, InformationCircleIcon, MagnifyingGlassIcon, MegaphoneIcon, ShieldCheckIcon, TrashIcon, XCircleIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { apiService } from '../services/apiService'
import { useTranslation } from '../hooks/useTranslation'
import MarkdownMessage from './MarkdownMessage'
import { useResetScrollOnChange } from '../hooks/useResetScrollOnChange'
import '../assets/styles/SystemMessagePanel.css'

const CATEGORY_META = {
  update: { key: 'system.categoryUpdate', fallback: 'Update', icon: ArrowPathIcon, colour: 'var(--volt-primary)' },
  account: { key: 'system.categoryAccount', fallback: 'Account', icon: ShieldCheckIcon, colour: 'var(--volt-warning)' },
  discovery: { key: 'system.categoryDiscovery', fallback: 'Discovery', icon: MagnifyingGlassIcon, colour: 'var(--volt-success)' },
  announcement: { key: 'system.categoryAnnouncement', fallback: 'Announcement', icon: MegaphoneIcon, colour: 'var(--volt-primary-light)' },
  default: { key: 'system.categorySystem', fallback: 'System', icon: BellIcon, colour: 'var(--volt-text-secondary)' }
}

const SEVERITY_ICON = {
  success: CheckCircleIcon,
  warning: ExclamationTriangleIcon,
  error: XCircleIcon,
  info: InformationCircleIcon
}

const SEVERITY_COLOUR = {
  success: 'var(--volt-success)',
  warning: 'var(--volt-warning)',
  error: 'var(--volt-danger)',
  info: 'var(--volt-primary)'
}

function getCategoryMeta(category, t) {
  const meta = CATEGORY_META[category] || CATEGORY_META.default
  return { ...meta, label: t(meta.key, meta.fallback) }
}

function SeverityIcon({ severity, size = 16 }) {
  const Icon = SEVERITY_ICON[severity] || InformationCircleIcon
  const color = SEVERITY_COLOUR[severity] || 'var(--volt-primary)'
  return <Icon size={size} color={color} />
}

function SystemMessageCard({ message, onMarkRead, onDelete, busy, t }) {
  const [expanded, setExpanded] = useState(!message.read)
  const meta = getCategoryMeta(message.category, t)
  const CategoryIcon = meta.icon

  useEffect(() => {
    if (!message.read) {
      setExpanded(true)
    }
  }, [message.read])

  const handleExpand = () => {
    setExpanded((prev) => !prev)
    if (!busy && !message.read) {
      onMarkRead(message.id)
    }
  }

  const timeAgo = (iso) => {
    const created = new Date(iso).getTime()
    if (Number.isNaN(created)) return t('common.unknown', 'Unknown')

    const diff = Date.now() - created
    const mins = Math.floor(diff / 60000)

    if (mins < 1) return t('system.justNow', 'just now')
    if (mins < 60) return t('system.minutesAgoShort', '{{count}}m ago', { count: mins })

    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return t('system.hoursAgoShort', '{{count}}h ago', { count: hrs })

    return t('system.daysAgoShort', '{{count}}d ago', { count: Math.floor(hrs / 24) })
  }

  return (
    <div className={`sysmsg-card ${message.read ? 'read' : 'unread'} severity-${message.severity || 'info'}`} aria-busy={busy}>
      <div
        className="sysmsg-card-header"
        onClick={handleExpand}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleExpand()
          }
        }}
      >
        <div className="sysmsg-card-icon" style={{ color: meta.colour }}>
          <CategoryIcon size={18} />
        </div>
        <div className="sysmsg-card-summary">
          <div className="sysmsg-card-title">
            {!message.read && <span className="sysmsg-unread-dot" />}
            {message.title || t('system.systemMessage', 'System Message')}
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
              type="button"
              className="sysmsg-action-btn"
              title={t('system.markAsRead', 'Mark as read')}
              onClick={(e) => { e.stopPropagation(); onMarkRead(message.id) }}
              disabled={busy}
            >
              <CheckIcon size={14} />
            </button>
          )}
          <button
            type="button"
            className="sysmsg-action-btn danger"
            title={t('system.dismiss', 'Dismiss')}
            onClick={(e) => { e.stopPropagation(); onDelete(message.id) }}
            disabled={busy}
          >
            <TrashIcon size={14} />
          </button>
          {expanded ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
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
              <ArrowTopRightOnSquareIcon size={13} />
              {t('system.viewOnGithub', 'View on GitHub')}
            </a>
          )}
        </div>
      )}
    </div>
  )
}

export default function SystemMessagePanel({ onClose }) {
  const { t } = useTranslation()
  const [messages, setMessages] = useState([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [busyMessageIds, setBusyMessageIds] = useState([])
  const [markAllBusy, setMarkAllBusy] = useState(false)
  const [clearAllBusy, setClearAllBusy] = useState(false)
  const listRef = useResetScrollOnChange([filter])

  const load = useCallback(async ({ withLoader = false } = {}) => {
    if (withLoader) {
      setRefreshing(true)
    }
    setLoadError('')

    try {
      const res = await apiService.getSystemMessages()
      const nextMessages = Array.isArray(res.data?.messages) ? res.data.messages : []
      setMessages(nextMessages)
      setUnread(Number.isFinite(res.data?.unread) ? res.data.unread : nextMessages.filter((m) => !m.read).length)
      setActionError('')
    } catch (err) {
      console.error('[SystemMessagePanel] load failed:', err)
      setLoadError(t('system.loadFailed', 'Failed to load your system inbox.'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [t])

  useEffect(() => {
    load()
  }, [load])

  const isMessageBusy = (id) => busyMessageIds.includes(id)

  const withBusyMessage = async (id, action) => {
    if (!id || isMessageBusy(id)) return

    setActionError('')
    setBusyMessageIds((prev) => [...prev, id])

    try {
      await action()
    } catch (error) {
      console.error('[SystemMessagePanel] message action failed:', error)
      setActionError(t('system.actionFailed', 'Action failed. Please try again.'))
    } finally {
      setBusyMessageIds((prev) => prev.filter((value) => value !== id))
    }
  }

  const handleMarkRead = async (id) => {
    const target = messages.find((m) => m.id === id)
    if (!target || target.read) return

    await withBusyMessage(id, async () => {
      await apiService.markSystemMessageRead(id)
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, read: true } : m)))
      setUnread((prev) => Math.max(0, prev - 1))
    })
  }

  const handleDelete = async (id) => {
    const target = messages.find((m) => m.id === id)
    if (!target) return

    await withBusyMessage(id, async () => {
      await apiService.deleteSystemMessage(id)
      setMessages((prev) => prev.filter((m) => m.id !== id))
      if (!target.read) {
        setUnread((prev) => Math.max(0, prev - 1))
      }
    })
  }

  const handleMarkAllRead = async () => {
    if (markAllBusy || unread === 0) return

    setActionError('')
    setMarkAllBusy(true)

    try {
      await apiService.markAllSystemMessagesRead()
      setMessages((prev) => prev.map((m) => ({ ...m, read: true })))
      setUnread(0)
    } catch (error) {
      console.error('[SystemMessagePanel] mark all read failed:', error)
      setActionError(t('system.actionFailed', 'Action failed. Please try again.'))
    } finally {
      setMarkAllBusy(false)
    }
  }

  const handleClearAll = async () => {
    if (clearAllBusy || messages.length === 0) return

    setActionError('')
    setClearAllBusy(true)

    try {
      await apiService.clearSystemMessages()
      setMessages([])
      setUnread(0)
      setBusyMessageIds([])
    } catch (error) {
      console.error('[SystemMessagePanel] clear all failed:', error)
      setActionError(t('system.actionFailed', 'Action failed. Please try again.'))
    } finally {
      setClearAllBusy(false)
    }
  }

  const displayed = messages.filter((m) => {
    if (filter === 'unread') return !m.read
    if (filter !== 'all') return m.category === filter
    return true
  })

  const categories = [...new Set(messages.map((m) => m.category).filter(Boolean))]

  const unreadByCategory = useMemo(() => messages.reduce((acc, message) => {
    if (message.category && !message.read) {
      acc[message.category] = (acc[message.category] || 0) + 1
    }
    return acc
  }, {}), [messages])

  return (
    <div className="sysmsg-panel">
      <div className="sysmsg-panel-header">
        <div className="sysmsg-panel-title">
          <BellIcon size={18} />
          <span>{t('system.systemInbox', 'System Inbox')}</span>
          {unread > 0 && <span className="sysmsg-badge">{unread}</span>}
        </div>

        <div className="sysmsg-panel-header-actions">
          <button
            type="button"
            className="sysmsg-header-btn"
            onClick={() => load({ withLoader: true })}
            title={t('common.refresh', 'Refresh')}
            disabled={refreshing || loading}
          >
            <ArrowPathIcon size={15} />
          </button>

          {unread > 0 && (
            <button
              type="button"
              className="sysmsg-header-btn"
              onClick={handleMarkAllRead}
              title={t('system.markAllAsRead', 'Mark all as read')}
              disabled={markAllBusy}
            >
              <CheckIcon size={15} />
            </button>
          )}

          {messages.length > 0 && (
            <button
              type="button"
              className="sysmsg-header-btn danger"
              onClick={handleClearAll}
              title={t('system.clearAll', 'Clear all')}
              disabled={clearAllBusy}
            >
              <TrashIcon size={15} />
            </button>
          )}

          {onClose && (
            <button
              type="button"
              className="sysmsg-header-btn"
              onClick={onClose}
              title={t('common.close', 'Close')}
            >
              <XMarkIcon size={15} />
            </button>
          )}
        </div>
      </div>

      {messages.length > 0 && (
        <div className="sysmsg-filters">
          {['all', 'unread', ...categories].map((value) => (
            <button
              type="button"
              key={value}
              className={`sysmsg-filter-btn ${filter === value ? 'active' : ''}`}
              onClick={() => setFilter(value)}
            >
              {value === 'all'
                ? t('system.all', 'All')
                : value === 'unread'
                  ? t('system.unreadCount', 'Unread ({{count}})', { count: unread })
                  : t('system.categoryWithCount', '{{category}} ({{count}})', {
                      category: getCategoryMeta(value, t).label,
                      count: unreadByCategory[value] || 0
                    })}
            </button>
          ))}
        </div>
      )}

      <div ref={listRef} className="sysmsg-list">
        {actionError && (
          <div className="alert alert-warning" role="alert">
            {actionError}
          </div>
        )}

        {(loading || refreshing) && (
          <div className="sysmsg-empty" role="status" aria-live="polite">
            <span className="sysmsg-loading-dots">
              <span /><span /><span />
            </span>
            <p>{refreshing ? t('common.refreshing', 'Refreshing...') : t('common.loading', 'Loading...')}</p>
          </div>
        )}

        {!loading && !refreshing && loadError && (
          <div className="sysmsg-empty">
            <BellIcon size={36} opacity={0.25} />
            <p>{loadError}</p>
            <button type="button" className="btn btn-secondary" onClick={() => load({ withLoader: true })}>
              {t('common.retry', 'Retry')}
            </button>
          </div>
        )}

        {!loading && !refreshing && !loadError && displayed.length === 0 && (
          <div className="sysmsg-empty">
            <BellIcon size={36} opacity={0.25} />
            <p>{filter === 'unread' ? t('system.noUnreadMessages', 'No unread messages') : t('system.inboxEmpty', 'Your inbox is empty')}</p>
          </div>
        )}

        {!loading && !refreshing && !loadError && displayed.map((msg) => (
          <SystemMessageCard
            key={msg.id}
            message={msg}
            onMarkRead={handleMarkRead}
            onDelete={handleDelete}
            busy={isMessageBusy(msg.id)}
            t={t}
          />
        ))}
      </div>
    </div>
  )
}
