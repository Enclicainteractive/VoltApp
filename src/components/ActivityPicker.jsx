import React, { useState, useEffect, useMemo } from 'react'
import { 
  XMarkIcon, 
  MagnifyingGlassIcon,
  PuzzlePieceIcon,
  RocketLaunchIcon,
  UserGroupIcon
} from '@heroicons/react/24/outline'
import { apiService } from '../services/apiService'
import { CLIENT_BUILTIN_ACTIVITIES, CLIENT_BUILTIN_BY_ID } from '../activities/builtin/definitions'
import { getCategoryIcon as getBuiltinCategoryIcon } from '../activities/builtin/ActivityIcons'
import { resolveActivityIconComponent } from '../activities/builtin/activityIconResolver'
import { useAppStore } from '../store/useAppStore'
import '../assets/styles/ActivityPicker.css'

// Activities to filter out from server catalog (no real implementation)
const REDUNDANT_ACTIVITY_IDS = [
  'watch-together',
  'chess-in-the-park',
  'gartic-phone',
  'jam-live',
  'music-jam-live',
  'whiteboard-live'
]

const ActivityPicker = ({ socket, contextType, contextId, participantsCount = 0, onClose, onLaunch }) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [catalog, setCatalog] = useState([])
  const [sessions, setSessions] = useState([])
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [loading, setLoading] = useState(true)
  const [pendingAction, setPendingAction] = useState(null)
  const { activeActivities } = useAppStore()

  const activitiesForContext = useMemo(
    () => activeActivities.filter(a => a.contextType === contextType && a.contextId === contextId),
    [activeActivities, contextType, contextId]
  )

  useEffect(() => {
    const loadCatalog = async () => {
      try {
        const res = await apiService.getActivitiesCatalog()
        const items = Array.isArray(res?.data?.items) ? res.data.items : []
        setCatalog(items)
      } catch (err) {
        if (err?.response?.status === 404) {
          return
        }
        console.error('Failed to load catalog:', err)
      } finally {
        setLoading(false)
      }
    }
    loadCatalog()
  }, [])

  useEffect(() => {
    if (!socket || !contextId) return

    const onSessions = (data = {}) => {
      if (data.contextType !== contextType || data.contextId !== contextId) return
      const nextSessions = Array.isArray(data.sessions) ? data.sessions : []
      setSessions(nextSessions)
      if (pendingAction?.type === 'launch') {
        const createdSession = nextSessions.find((session) => session?.activityId === pendingAction.id)
        if (createdSession) {
          setPendingAction(null)
          onClose?.()
        }
      }
    }

    const onSessionCreated = (payload = {}) => {
      const session = payload.session || payload
      if (session.contextType !== contextType || session.contextId !== contextId) return
      setSessions((prev) => {
        if (prev.some((item) => item?.id === session.id)) return prev
        return [...prev, session]
      })
      if (pendingAction?.type === 'launch' && pendingAction.id === session.activityId) {
        setPendingAction(null)
        onClose?.()
      }
    }

    const onSessionEnded = (payload = {}) => {
      if (!payload?.sessionId) return
      setSessions((prev) => prev.filter((session) => session?.id !== payload.sessionId))
    }

    socket.on('activity:sessions', onSessions)
    socket.on('activity:session-created', onSessionCreated)
    socket.on('activity:session-ended', onSessionEnded)
    socket.emit('activity:get-sessions', { contextType, contextId })

    return () => {
      socket.off('activity:sessions', onSessions)
      socket.off('activity:session-created', onSessionCreated)
      socket.off('activity:session-ended', onSessionEnded)
    }
  }, [socket, contextType, contextId, pendingAction, onClose])

  const sessionsForContext = sessions.filter(s => s.contextType === contextType && s.contextId === contextId)

  const mergedCatalog = useMemo(() => {
    // Filter out redundant server activities that don't have real implementations
    const filteredCatalog = catalog.filter(item => {
      if (!item || typeof item !== 'object') return false
      if (!item.id || typeof item.id !== 'string') return false
      const key = item.id?.replace('builtin:', '')?.replace('app:', '')
      return !REDUNDANT_ACTIVITY_IDS.includes(key)
    })
    const known = new Set(filteredCatalog.map(item => item.id).filter(Boolean))
    const builtins = CLIENT_BUILTIN_ACTIVITIES.filter(item => item?.id && !known.has(item.id))
    return [...filteredCatalog, ...builtins]
  }, [catalog])

  const categories = useMemo(() => {
    const cats = new Set(mergedCatalog.map(a => a.category?.toLowerCase() || 'custom'))
    return ['all', ...Array.from(cats)]
  }, [mergedCatalog])

  const filteredActivities = useMemo(() => {
    let filtered = mergedCatalog
    
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(a =>
        a?.id &&
        a.category?.toLowerCase() === selectedCategory
      )
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(a => (
        a?.id && (
          a.name?.toLowerCase().includes(query) ||
          a.description?.toLowerCase().includes(query)
        )
      ))
    }
    
    return filtered
  }, [mergedCatalog, selectedCategory, searchQuery])

  const handleLaunch = (activityId) => {
    if (!activityId || typeof activityId !== 'string') return
    setPendingAction({ type: 'launch', id: activityId })
    const isBuiltin = activityId.startsWith('builtin:')
    const activityDef = CLIENT_BUILTIN_BY_ID[activityId]
    const catalogActivity = catalog.find(a => a.id === activityId)
    const launchUrl = catalogActivity?.launchUrl || activityDef?.launchUrl || null
    
    if (onLaunch) {
      onLaunch(activityId, launchUrl)
    } else if (socket && contextId) {
      socket.emit('activity:create-session', {
        contextType,
        contextId,
        activityId,
        activityDefinition: activityDef || { id: activityId, launchUrl },
        launchUrl,
        p2p: { enabled: true, preferred: true },
        sound: { enabled: true, volume: 0.8 }
      })
      socket.emit('activity:get-sessions', { contextType, contextId })
    }
  }

  const handleJoinSession = (sessionId) => {
    if (!sessionId || typeof sessionId !== 'string') return
    setPendingAction({ type: 'join', id: sessionId })
    if (socket) {
      socket.emit('activity:join-session', { sessionId })
      socket.emit('activity:get-sessions', { contextType, contextId })
    }
    onClose?.()
  }

  return (
    <div className="activity-picker-overlay" onClick={onClose}>
      <div className="activity-picker-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Activity picker">
        <div className="activity-picker-header">
          <div className="activity-picker-title">
            <RocketLaunchIcon size={20} />
            <span>Volt Activities</span>
          </div>
          <button className="activity-picker-close" onClick={onClose}>
            <XMarkIcon size={20} />
          </button>
        </div>

        <div className="activity-picker-search">
          <MagnifyingGlassIcon size={18} />
          <input
            type="text"
            placeholder="Search activities..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            autoFocus
          />
        </div>

        <div className="activity-picker-categories">
          <button
            className={`category-btn ${selectedCategory === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('all')}
          >
            <RocketLaunchIcon size={14} />
            All
          </button>
          {categories.filter(c => c !== 'all').map(cat => {
            return (
              <button
                key={cat}
                className={`category-btn ${selectedCategory === cat ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {React.createElement(getBuiltinCategoryIcon(cat), { className: 'activity-card-icon' })}
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            )
          })}
        </div>

        <div className="activity-picker-content">
          {loading ? (
            <div className="activity-picker-loading">
              <div className="spinner" />
              <span>Loading activities...</span>
            </div>
          ) : filteredActivities.length === 0 ? (
            <div className="activity-picker-empty">
              <PuzzlePieceIcon size={48} />
              <span>No activities found</span>
            </div>
          ) : (
            <div className="activity-picker-grid">
              {filteredActivities.filter(activity => activity?.id).map(activity => (
                <button
                  key={activity.id}
                  className="activity-card"
                  disabled={pendingAction?.type === 'launch'}
                  onClick={() => handleLaunch(activity.id)}
                >
                  <div className="activity-card-icon-wrapper">
                    {activity.iconUrl ? (
                      <img src={activity.iconUrl} alt="" className="activity-card-icon-img" />
                    ) : React.createElement(resolveActivityIconComponent(activity), { className: 'activity-card-icon' })}
                  </div>
                  <div className="activity-card-info">
                    <span className="activity-card-name">{activity.name || activity.id}</span>
                    <span className="activity-card-desc">
                      {activity.description || 'No description'}
                    </span>
                    <span className="activity-card-desc">
                      {activity.category || 'Custom'} • up to {activity.participantCap || 8}
                    </span>
                  </div>
                  <div className="activity-card-launch">
                    {pendingAction?.type === 'launch' && pendingAction?.id === activity.id ? '...' : <RocketLaunchIcon size={16} />}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {sessionsForContext.length > 0 && (
          <div className="activity-picker-active">
            <div className="active-header">
              <span>Active Sessions</span>
              <span className="active-count">{sessionsForContext.length}</span>
            </div>
            <div className="active-list">
              {sessionsForContext.filter(session => session?.id).map(session => {
                const sessionName = session.activityName || session.activityId || 'Activity Session'
                const activity = CLIENT_BUILTIN_BY_ID[session.activityId] || {
                  id: session.activityId,
                  name: sessionName,
                  category: 'custom'
                }
                return (
                  <button 
                    key={session.id} 
                    className="active-item"
                    onClick={() => handleJoinSession(session.id)}
                  >
                    <span className="active-icon">
                      {activity.iconUrl ? (
                        <img src={activity.iconUrl} alt="" className="activity-card-icon-img" />
                      ) : React.createElement(resolveActivityIconComponent(activity), { className: 'activity-card-icon' })}
                    </span>
                    <span className="active-name">{sessionName}</span>
                    <span className="active-participants">
                      <UserGroupIcon width={12} height={12} />
                      {session.participantCount || 1} joined
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ActivityPicker
