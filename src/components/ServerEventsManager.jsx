import React, { useEffect, useMemo, useState } from 'react'
import { CalendarPlus2, MapPin, Clock3, Trash2, Pencil, CalendarDays } from 'lucide-react'
import { apiService } from '../services/apiService'
import { useTranslation } from '../hooks/useTranslation'
import { useSocket } from '../contexts/SocketContext'
import './ServerEventsManager.css'

const emptyForm = {
  title: '',
  description: '',
  location: '',
  startAt: '',
  endAt: ''
}

const ServerEventsManager = ({ serverId, canManage }) => {
  const { t } = useTranslation()
  const { socket } = useSocket()
  const [events, setEvents] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingEventId, setEditingEventId] = useState(null)

  const loadEvents = async () => {
    try {
      setLoading(true)
      const res = await apiService.getServerEvents(serverId)
      setEvents(Array.isArray(res.data) ? res.data : [])
    } catch (error) {
      console.error('Failed to load server events:', error)
      setEvents([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (serverId) loadEvents()
  }, [serverId])

  useEffect(() => {
    if (!socket || !serverId) return undefined

    const handleCreated = (event) => {
      if (event?.serverId !== serverId) return
      setEvents((prev) => [...prev.filter((item) => item.id !== event.id), event].sort((a, b) => new Date(a.startAt) - new Date(b.startAt)))
    }

    const handleUpdated = (event) => {
      if (event?.serverId !== serverId) return
      setEvents((prev) => prev.map((item) => item.id === event.id ? event : item).sort((a, b) => new Date(a.startAt) - new Date(b.startAt)))
    }

    const handleDeleted = ({ eventId, serverId: deletedServerId }) => {
      if (deletedServerId !== serverId) return
      setEvents((prev) => prev.filter((item) => item.id !== eventId))
    }

    socket.on('server:event-created', handleCreated)
    socket.on('server:event-updated', handleUpdated)
    socket.on('server:event-deleted', handleDeleted)
    return () => {
      socket.off('server:event-created', handleCreated)
      socket.off('server:event-updated', handleUpdated)
      socket.off('server:event-deleted', handleDeleted)
    }
  }, [socket, serverId])

  const monthSummary = useMemo(() => {
    const grouped = new Map()
    events.forEach((event) => {
      const start = new Date(event.startAt)
      if (Number.isNaN(start.getTime())) return
      const key = start.toISOString().slice(0, 10)
      grouped.set(key, (grouped.get(key) || 0) + 1)
    })
    return Array.from(grouped.entries()).slice(0, 10)
  }, [events])

  const handleCreate = async () => {
    if (!form.title.trim() || !form.startAt) return
    try {
      setSaving(true)
      if (editingEventId) {
        const res = await apiService.updateServerEvent(serverId, editingEventId, form)
        setEvents(prev => prev.map((event) => event.id === editingEventId ? res.data : event).sort((a, b) => new Date(a.startAt) - new Date(b.startAt)))
      } else {
        const res = await apiService.createServerEvent(serverId, form)
        setEvents(prev => [...prev, res.data].sort((a, b) => new Date(a.startAt) - new Date(b.startAt)))
      }
      setForm(emptyForm)
      setEditingEventId(null)
    } catch (error) {
      console.error('Failed to create server event:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (eventId) => {
    try {
      await apiService.deleteServerEvent(serverId, eventId)
      setEvents(prev => prev.filter(event => event.id !== eventId))
    } catch (error) {
      console.error('Failed to delete server event:', error)
    }
  }

  const handleEdit = (event) => {
    setEditingEventId(event.id)
    setForm({
      title: event.title || '',
      description: event.description || '',
      location: event.location || '',
      startAt: event.startAt ? new Date(event.startAt).toISOString().slice(0, 16) : '',
      endAt: event.endAt ? new Date(event.endAt).toISOString().slice(0, 16) : ''
    })
  }

  return (
    <div className="server-events-manager">
      <div className="server-events-summary">
        <div>
          <span className="server-events-kicker">{t('events.kicker', 'Server Events')}</span>
          <h2>{t('events.manage', 'Plan events for your server')}</h2>
          <p>{t('events.manageDesc', 'Schedule launches, meetups, voice sessions, and community events with a title, time, and location.')}</p>
        </div>
        <div className="server-events-calendar-strip">
          <div className="server-events-calendar-title">
            <CalendarDays size={16} />
            <span>{t('events.calendar', 'Calendar')}</span>
          </div>
          {monthSummary.length === 0 ? (
            <span className="server-events-empty-inline">{t('events.noUpcoming', 'No upcoming events yet')}</span>
          ) : monthSummary.map(([dateKey, count]) => (
            <div key={dateKey} className="server-events-calendar-pill">
              <strong>{new Date(dateKey).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</strong>
              <span>{count}x</span>
            </div>
          ))}
        </div>
      </div>

      {canManage && (
        <div className="server-events-composer">
          <div className="server-events-form-grid">
            <input className="input" placeholder={t('events.title', 'Event title')} value={form.title} onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))} />
            <input className="input" placeholder={t('events.location', 'Location / link')} value={form.location} onChange={e => setForm(prev => ({ ...prev, location: e.target.value }))} />
            <input className="input" type="datetime-local" value={form.startAt} onChange={e => setForm(prev => ({ ...prev, startAt: e.target.value }))} />
            <input className="input" type="datetime-local" value={form.endAt} onChange={e => setForm(prev => ({ ...prev, endAt: e.target.value }))} />
          </div>
          <textarea className="input" rows={4} placeholder={t('events.description', 'Describe what is happening')} value={form.description} onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))} />
          <div className="server-events-actions">
            {editingEventId ? (
              <button className="btn btn-secondary" type="button" onClick={() => {
                setEditingEventId(null)
                setForm(emptyForm)
              }}>
                {t('common.cancel', 'Cancel')}
              </button>
            ) : null}
            <button className="btn btn-primary" onClick={handleCreate} disabled={saving || !form.title.trim() || !form.startAt}>
            <CalendarPlus2 size={16} />
              {saving ? t('common.saving', 'Saving...') : editingEventId ? t('events.update', 'Update event') : t('events.create', 'Create event')}
            </button>
          </div>
        </div>
      )}

      <div className="server-events-list">
        {loading ? (
          <div className="server-events-empty">{t('common.loading', 'Loading...')}</div>
        ) : events.length === 0 ? (
          <div className="server-events-empty">{t('events.noServerEvents', 'No events planned for this server yet')}</div>
        ) : events.map(event => (
          <article key={event.id} className="server-event-item">
            <div className="server-event-main">
              <strong>{event.title}</strong>
              {event.description ? <p>{event.description}</p> : null}
              <div className="server-event-meta">
                <span><Clock3 size={14} /> {new Date(event.startAt).toLocaleString()}</span>
                {event.location ? <span><MapPin size={14} /> {event.location}</span> : null}
              </div>
            </div>
            {canManage && (
              <div className="server-event-actions">
                <button className="icon-btn" onClick={() => handleEdit(event)} title={t('common.edit', 'Edit')}>
                  <Pencil size={16} />
                </button>
                <button className="icon-btn danger" onClick={() => handleDelete(event.id)} title={t('common.delete', 'Delete')}>
                  <Trash2 size={16} />
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  )
}

export default ServerEventsManager
