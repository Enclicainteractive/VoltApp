import React, { useEffect, useMemo, useState } from 'react'
import { MapPin, Clock3, Sparkles } from 'lucide-react'
import { apiService } from '../services/apiService'
import { useTranslation } from '../hooks/useTranslation'
import { useSocket } from '../contexts/SocketContext'
import './HomeEventsHub.css'

const sameDay = (left, right) => {
  if (!left || !right) return false
  return left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
}

const formatDateLabel = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown date'
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  })
}

const formatTimeLabel = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown time'
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const HomeEventsHub = ({ onOpenServer, events: externalEvents = null }) => {
  const { t } = useTranslation()
  const { socket } = useSocket()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [monthCursor, setMonthCursor] = useState(() => new Date())
  const [selectedDateKey, setSelectedDateKey] = useState(() => new Date().toISOString().slice(0, 10))

  const loadEvents = async () => {
    if (Array.isArray(externalEvents)) {
      setEvents(externalEvents)
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      const res = await apiService.getUpcomingEvents(24)
      setEvents(Array.isArray(res.data) ? res.data : [])
    } catch (error) {
      console.error('Failed to load upcoming events:', error)
      setEvents([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadEvents()
  }, [externalEvents])

  useEffect(() => {
    if (!socket || Array.isArray(externalEvents)) return undefined
    const refresh = () => loadEvents()
    socket.on('server:event-created', refresh)
    socket.on('server:event-updated', refresh)
    socket.on('server:event-deleted', refresh)
    return () => {
      socket.off('server:event-created', refresh)
      socket.off('server:event-updated', refresh)
      socket.off('server:event-deleted', refresh)
    }
  }, [socket, externalEvents])

  const monthDays = useMemo(() => {
    const year = monthCursor.getFullYear()
    const month = monthCursor.getMonth()
    const first = new Date(year, month, 1)
    const last = new Date(year, month + 1, 0)
    const days = []
    for (let i = 0; i < first.getDay(); i += 1) {
      days.push(null)
    }
    for (let day = 1; day <= last.getDate(); day += 1) {
      days.push(new Date(year, month, day))
    }
    return { first, days }
  }, [monthCursor])

  const monthEvents = useMemo(() => {
    return events.filter(event => {
      const start = new Date(event.startAt)
      return !Number.isNaN(start.getTime()) &&
        start.getMonth() === monthCursor.getMonth() &&
        start.getFullYear() === monthCursor.getFullYear()
    })
  }, [events, monthCursor])

  const eventsByDay = useMemo(() => {
    const grouped = new Map()
    monthEvents.forEach((event) => {
      const start = new Date(event.startAt)
      if (Number.isNaN(start.getTime())) return
      const key = start.toISOString().slice(0, 10)
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key).push(event)
    })
    return grouped
  }, [monthEvents])

  const selectedEvents = useMemo(() => {
    const items = eventsByDay.get(selectedDateKey) || []
    return items.slice().sort((a, b) => new Date(a.startAt) - new Date(b.startAt))
  }, [eventsByDay, selectedDateKey])

  const todayKey = new Date().toISOString().slice(0, 10)

  return (
    <section className="home-events-hub">
      <div className="home-events-calendar">
        <div className="home-events-header">
          <div>
            <span className="home-events-kicker">{t('events.kicker', 'Server Events')}</span>
            <h3>{t('events.upcoming', 'Upcoming events')}</h3>
          </div>
          <div className="home-events-month">
            <button type="button" onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}>‹</button>
            <strong>{monthCursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
            <button type="button" onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}>›</button>
          </div>
        </div>

        <div className="home-events-grid">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, index) => (
            <div key={`${label}-${index}`} className="home-events-weekday">{label}</div>
          ))}
          {monthDays.days.map((day, index) => {
            if (!day) {
              return <div key={`empty-${index}`} className="home-events-day home-events-day-empty" />
            }
            const dayKey = day.toISOString().slice(0, 10)
            const dayEvents = eventsByDay.get(dayKey) || []
            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => setSelectedDateKey(dayKey)}
                className={`home-events-day ${dayEvents.length > 0 ? 'has-events' : ''} ${dayKey === todayKey ? 'is-today' : ''} ${dayKey === selectedDateKey ? 'is-selected' : ''}`}
              >
                <span>{day.getDate()}</span>
                {dayEvents.length > 0 && <small>{dayEvents.length}</small>}
              </button>
            )
          })}
        </div>
      </div>

      <div className="home-events-list">
        {loading ? (
          <div className="home-events-empty">{t('common.loading', 'Loading...')}</div>
        ) : selectedEvents.length > 0 ? (
          selectedEvents.map(event => (
            <button
              key={event.id}
              type="button"
              className="home-event-card"
              onClick={() => onOpenServer?.(event.serverId)}
            >
              <div className="home-event-card-top">
                <span className="home-event-date">{formatDateLabel(event.startAt)}</span>
                <span className="home-event-server">{event.serverName || event.serverId}</span>
              </div>
              <strong>{event.title}</strong>
              {event.description ? <p>{event.description}</p> : null}
              <div className="home-event-meta">
                <span><Clock3 size={14} /> {formatTimeLabel(event.startAt)}</span>
                {event.location ? <span><MapPin size={14} /> {event.location}</span> : null}
              </div>
            </button>
          ))
        ) : events.length === 0 ? (
          <div className="home-events-empty">
            <Sparkles size={20} />
            <span>{t('events.noUpcoming', 'No upcoming events yet')}</span>
          </div>
        ) : events.slice(0, 6).map(event => (
          <button
            key={event.id}
            type="button"
            className="home-event-card"
            onClick={() => onOpenServer?.(event.serverId)}
          >
            <div className="home-event-card-top">
              <span className="home-event-date">{formatDateLabel(event.startAt)}</span>
              <span className="home-event-server">{event.serverName || event.serverId}</span>
            </div>
            <strong>{event.title}</strong>
            {event.description ? <p>{event.description}</p> : null}
            <div className="home-event-meta">
              <span><Clock3 size={14} /> {formatTimeLabel(event.startAt)}</span>
              {event.location ? <span><MapPin size={14} /> {event.location}</span> : null}
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}

export default HomeEventsHub
