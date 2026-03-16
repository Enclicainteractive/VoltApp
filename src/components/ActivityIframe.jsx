import React, { useState, useEffect, useRef, useCallback } from 'react'
import { XMarkIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { useSocket } from '../contexts/SocketContext'

const ActivityIframe = ({ 
  session, 
  activity, 
  onClose,
  className = '' 
}) => {
  const socket = useSocket()
  const iframeRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const launchUrl = activity?.launchUrl || activity?.manifest?.launch?.url

  useEffect(() => {
    if (!launchUrl) {
      setError('No launch URL configured for this activity')
      return
    }

    const url = new URL(launchUrl)
    url.searchParams.set('sessionId', session.sessionId)
    url.searchParams.set('contextType', session.contextType || 'voice')
    url.searchParams.set('contextId', session.contextId || '')
    url.searchParams.set('socket', window.location.origin)
    
    if (iframeRef.current) {
      iframeRef.current.src = url.toString()
    }
  }, [launchUrl, session])

  const handleLoad = () => {
    setLoading(false)
    setError(null)
  }

  const handleError = () => {
    setLoading(false)
    setError('Failed to load activity')
  }

  const toggleFullscreen = useCallback(() => {
    if (!iframeRef.current) return
    
    if (!isFullscreen) {
      if (iframeRef.current.requestFullscreen) {
        iframeRef.current.requestFullscreen()
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen()
      }
    }
  }, [isFullscreen])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const postMessage = useCallback((type, payload) => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type, payload, source: 'voltchat' }, '*')
    }
  }, [])

  useEffect(() => {
    const handleMessage = (event) => {
      const { type, payload, source } = event.data || {}
      if (source !== 'vas-activity') return

      switch (type) {
        case 'ready':
          postMessage('session-info', {
            sessionId: session.sessionId,
            contextType: session.contextType,
            contextId: session.contextId,
            userId: session.userId,
            participants: session.participants || []
          })
          break
        case 'state-request':
          socket?.emit('activity:get-state', { sessionId: session.sessionId })
          break
        case 'activity-error':
          console.error('[Activity] Activity reported error:', payload)
          break
        default:
          break
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [session, socket, postMessage])

  if (!launchUrl && !error) {
    return (
      <div className={`activity-iframe-container ${className}`}>
        <div className="activity-iframe-error">
          <ExclamationTriangleIcon size={48} />
          <h3>No Activity URL</h3>
          <p>This activity doesn't have a launch URL configured.</p>
          <button className="btn btn-primary" onClick={onClose}>
            <XMarkIcon size={16} /> Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`activity-iframe-container ${className} ${isFullscreen ? 'fullscreen' : ''}`}>
      <div className="activity-iframe-header">
        <div className="activity-iframe-title">
          {activity?.name || 'Activity'}
        </div>
        <div className="activity-iframe-controls">
          <button 
            className="activity-iframe-btn" 
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <ArrowsPointingInIcon size={16} /> : <ArrowsPointingOutIcon size={16} />}
          </button>
          <button 
            className="activity-iframe-btn activity-iframe-close" 
            onClick={onClose}
            title="Close activity"
          >
            <XMarkIcon size={16} />
          </button>
        </div>
      </div>
      
      <div className="activity-iframe-wrapper">
        {loading && (
          <div className="activity-iframe-loading">
            <div className="spinner" />
            <span>Loading activity...</span>
          </div>
        )}
        
        {error && (
          <div className="activity-iframe-error-overlay">
            <ExclamationTriangleIcon size={32} />
            <span>{error}</span>
          </div>
        )}
        
        <iframe
          ref={iframeRef}
          className="activity-iframe"
          onLoad={handleLoad}
          onError={handleError}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock"
          allow="camera; microphone; fullscreen; display-capture"
          title={activity?.name || 'Activity'}
        />
      </div>
    </div>
  )
}

export default ActivityIframe
