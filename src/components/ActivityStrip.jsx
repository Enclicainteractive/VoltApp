import React, { useState, useEffect } from 'react'
import { XMarkIcon, Squares2X2Icon, ArrowsPointingOutIcon, ArrowsPointingInIcon, ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline'
import { useAppStore } from '../store/useAppStore'
import { soundService } from '../services/soundService'
import { resolveActivityCategoryKey, resolveActivityIconComponent } from '../activities/builtin/activityIconResolver'
import '../assets/styles/ActivityStrip.css'

const getActivityIcon = (activity) => {
  return resolveActivityIconComponent({
    id: activity.activityId,
    category: activity.category
  })
}

const ActivityStrip = ({ socket, contextType, contextId, onActivityFocus }) => {
  const { 
    activeActivities, 
    focusedActivityId, 
    setFocusedActivity, 
    clearFocusedActivity,
    removeActivity 
  } = useAppStore()
  
  // Local state for UI controls
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [prevFocusedId, setPrevFocusedId] = useState(null)
  
  // Filter activities for this context - show all activities in this voice/call context
  const activitiesForContext = activeActivities.filter(
    a => a.contextType === contextType && 
         a.contextId === contextId &&
         a.sessionId // Must have sessionId
  )

  // Play sound when activity focus changes
  useEffect(() => {
    if (focusedActivityId !== prevFocusedId) {
      if (focusedActivityId && !prevFocusedId) {
        // Activity opened/focused
        soundService?.activityStart?.() || soundService?.success?.()
      } else if (!focusedActivityId && prevFocusedId) {
        // Activity closed/unfocused
        soundService?.activityStop?.() || soundService?.callLeft?.()
      }
      setPrevFocusedId(focusedActivityId)
    }
  }, [focusedActivityId, prevFocusedId])

  const handleActivityClick = (activity) => {
    if (focusedActivityId === activity.sessionId) {
      // Already focused, so unfocus
      clearFocusedActivity()
    } else {
      // Join the session and focus this activity
      if (socket) {
        socket.emit('activity:join-session', { sessionId: activity.sessionId })
      }
      setFocusedActivity(activity.sessionId)
      onActivityFocus?.(activity)
    }
  }

  const handleCloseActivity = (e, activity) => {
    e.stopPropagation()
    // Play close sound
    soundService?.activityStop?.() || soundService?.callLeft?.()
    // Leave the session
    if (socket) {
      socket.emit('activity:leave-session', { sessionId: activity.sessionId })
    }
    // Remove from store
    removeActivity(activity.sessionId)
    // Clear focus if this was focused
    if (focusedActivityId === activity.sessionId) {
      clearFocusedActivity()
    }
  }

  const toggleFullscreen = React.useCallback(() => {
    if (focusedActivityId) {
      window.dispatchEvent(new CustomEvent('activity:fullscreen', { 
        detail: { sessionId: focusedActivityId }
      }))
    } else {
      if (!isFullscreen) {
        document.documentElement.requestFullscreen?.().catch(() => {})
      } else {
        document.exitFullscreen?.().catch(() => {})
      }
    }
  }, [focusedActivityId, isFullscreen])

  // Track fullscreen state changes to fix sizing issues
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!document.fullscreenElement
      setIsFullscreen(isCurrentlyFullscreen)
      
      // Force layout recalculation when exiting fullscreen
      if (!isCurrentlyFullscreen) {
        window.dispatchEvent(new Event('resize'))
      }
    }
    
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  // Debug logging
  useEffect(() => {
    if (activitiesForContext.length > 0) {
      console.log('[ActivityStrip] Valid activities:', activitiesForContext.map(a => ({
        id: a.sessionId,
        name: a.activityName,
        activityId: a.activityId
      })))
    }
  }, [activitiesForContext])

  if (activitiesForContext.length === 0) {
    return null
  }

  return (
    <div className={`activity-strip ${isCollapsed ? 'collapsed' : ''} ${isFullscreen ? 'fullscreen' : ''}`}>
      <div className="activity-strip-header">
        <span className="activity-strip-title">
          <Squares2X2Icon width={14} height={14} />
          Activities ({activitiesForContext.length})
        </span>
        <div className="activity-strip-controls">
          <button 
            className="strip-control-btn"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <ArrowsPointingInIcon width={16} /> : <ArrowsPointingOutIcon width={16} />}
          </button>
          <button 
            className="strip-control-btn"
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ?  'Collapse' : 'Expand'}
          >
            {isCollapsed ? <ChevronDownIcon width={16} /> : <ChevronUpIcon width={16} />}
          </button>
        </div>
      </div>
      
      {!isCollapsed && (
        <div className={`activity-grid-preview ${activitiesForContext.length === 1 ? 'single' : 'multiple'}`}>
          {activitiesForContext.map(activity => {
            const ActivityIcon = getActivityIcon(activity)
            const categoryLabel = resolveActivityCategoryKey(activity)
            return (
              <div
                key={activity.sessionId}
                className={`activity-preview-tile ${focusedActivityId === activity.sessionId ? 'focused' : ''}`}
                onClick={() => handleActivityClick(activity)}
                title={focusedActivityId === activity.sessionId ? 'Click to unfocus' : 'Click to focus'}
              >
                <div className="activity-preview-content">
                  <div className="activity-preview-icon">
                    <ActivityIcon />
                  </div>
                  <div className="activity-preview-copy">
                    <div className="activity-preview-name">
                      {activity.activityName || 'Activity'}
                    </div>
                    <div className="activity-preview-subtitle">
                      {categoryLabel}
                    </div>
                  </div>
                </div>
                <div className="activity-preview-meta">
                  <span>{focusedActivityId === activity.sessionId ? 'Open in focus' : 'Ready to join'}</span>
                  {focusedActivityId === activity.sessionId && (
                    <span className="activity-preview-badge">Live</span>
                  )}
                </div>
                <button 
                  className="activity-tile-close"
                  onClick={(e) => handleCloseActivity(e, activity)}
                  title="Leave activity"
                >
                  <XMarkIcon width={12} height={12} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default ActivityStrip
