import React, { Suspense, useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import LazyComponent from './LazyComponent'
import lazyLoadingService from '../services/lazyLoadingService'

// Segmented loading priorities for modal sections
const SEGMENT_PRIORITIES = {
  HEADER: lazyLoadingService.priorities.CRITICAL,
  CONTENT: lazyLoadingService.priorities.HIGH,
  SIDEBAR: lazyLoadingService.priorities.MEDIUM,
  FOOTER: lazyLoadingService.priorities.MEDIUM,
  TABS: lazyLoadingService.priorities.LOW,
  ADVANCED: lazyLoadingService.priorities.BACKGROUND
}

// Modal segment types with their loading characteristics
const SEGMENT_TYPES = {
  header: {
    priority: SEGMENT_PRIORITIES.HEADER,
    skeleton: 'modal-header',
    loadDelay: 0
  },
  content: {
    priority: SEGMENT_PRIORITIES.CONTENT,
    skeleton: 'modal-content',
    loadDelay: 100
  },
  sidebar: {
    priority: SEGMENT_PRIORITIES.SIDEBAR,
    skeleton: 'sidebar',
    loadDelay: 200
  },
  footer: {
    priority: SEGMENT_PRIORITIES.FOOTER,
    skeleton: 'modal-footer',
    loadDelay: 300
  },
  tabs: {
    priority: SEGMENT_PRIORITIES.TABS,
    skeleton: 'list',
    loadDelay: 400
  },
  advanced: {
    priority: SEGMENT_PRIORITIES.ADVANCED,
    skeleton: 'card',
    loadDelay: 800
  }
}

// Progressive modal backdrop
const ModalBackdrop = React.memo(({ isOpen, onClose, children, className = '' }) => {
  const backdropRef = useRef(null)
  
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      
      // Trap focus within modal
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
          onClose?.()
        }
      }
      
      document.addEventListener('keydown', handleKeyDown)
      return () => {
        document.body.style.overflow = ''
        document.removeEventListener('keydown', handleKeyDown)
      }
    }
  }, [isOpen, onClose])
  
  const handleBackdropClick = useCallback((e) => {
    if (e.target === backdropRef.current) {
      onClose?.()
    }
  }, [onClose])
  
  if (!isOpen) return null
  
  return (
    <div 
      ref={backdropRef}
      className={`modal-backdrop ${className}`}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
    >
      <div className="modal-container">
        {children}
      </div>
    </div>
  )
})

ModalBackdrop.displayName = 'ModalBackdrop'

// Individual modal segment component
const ModalSegment = React.memo(({ 
  type,
  component: Component,
  loader,
  props = {},
  className = '',
  style = {},
  fallback,
  onLoad,
  onError
}) => {
  const segmentConfig = SEGMENT_TYPES[type] || SEGMENT_TYPES.content
  const [shouldLoad, setShouldLoad] = useState(segmentConfig.loadDelay === 0)
  
  // Delayed loading for progressive experience
  useEffect(() => {
    if (segmentConfig.loadDelay > 0) {
      const timer = setTimeout(() => {
        setShouldLoad(true)
      }, segmentConfig.loadDelay)
      
      return () => clearTimeout(timer)
    }
  }, [segmentConfig.loadDelay])
  
  if (!shouldLoad) {
    return (
      <div className={`modal-segment modal-segment-${type} loading ${className}`} style={style}>
        <LazyComponent
          skeletonType={segmentConfig.skeleton}
          skeletonProps={{ className: `skeleton-${type}` }}
        />
      </div>
    )
  }
  
  if (Component) {
    return (
      <div className={`modal-segment modal-segment-${type} ${className}`} style={style}>
        <Component {...props} />
      </div>
    )
  }
  
  if (loader) {
    return (
      <div className={`modal-segment modal-segment-${type} ${className}`} style={style}>
        <LazyComponent
          loaderComponent={loader}
          priority={segmentConfig.priority}
          skeletonType={segmentConfig.skeleton}
          skeletonProps={{ className: `skeleton-${type}` }}
          fallback={fallback}
          onLoad={onLoad}
          onError={onError}
          {...props}
        />
      </div>
    )
  }
  
  return null
})

ModalSegment.displayName = 'ModalSegment'

// Main segmented modal component
const SegmentedModal = React.memo(({
  isOpen = false,
  onClose,
  title = '',
  size = 'medium', // small, medium, large, fullscreen
  segments = [],
  className = '',
  style = {},
  showCloseButton = true,
  closeOnBackdrop = true,
  closeOnEscape = true,
  animation = 'fade', // fade, slide, scale
  onOpen,
  onClosed,
  children
}) => {
  const [isAnimating, setIsAnimating] = useState(false)
  const [loadedSegments, setLoadedSegments] = useState(new Set())
  const modalRef = useRef(null)
  
  // Handle modal open/close animations
  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true)
      onOpen?.()
      
      const timer = setTimeout(() => {
        setIsAnimating(false)
      }, 300)
      
      return () => clearTimeout(timer)
    } else {
      onClosed?.()
      setLoadedSegments(new Set())
    }
  }, [isOpen, onOpen, onClosed])
  
  // Memoize modal classes
  const modalClasses = useMemo(() => {
    const classes = [
      'segmented-modal',
      `modal-${size}`,
      `modal-${animation}`,
      className
    ]
    
    if (isAnimating) classes.push('animating')
    if (loadedSegments.size > 0) classes.push('has-content')
    
    return classes.filter(Boolean).join(' ')
  }, [size, animation, className, isAnimating, loadedSegments.size])
  
  // Handle segment load
  const handleSegmentLoad = useCallback((segmentId) => {
    setLoadedSegments(prev => new Set([...prev, segmentId]))
  }, [])
  
  // Handle segment error
  const handleSegmentError = useCallback((segmentId, error) => {
    console.error(`Modal segment ${segmentId} failed to load:`, error)
  }, [])
  
  // Handle close
  const handleClose = useCallback(() => {
    if (closeOnEscape || closeOnBackdrop) {
      onClose?.()
    }
  }, [closeOnEscape, closeOnBackdrop, onClose])
  
  if (!isOpen) return null
  
  const modalContent = (
    <ModalBackdrop 
      isOpen={isOpen} 
      onClose={closeOnBackdrop ? handleClose : undefined}
      className={`backdrop-${animation}`}
    >
      <div 
        ref={modalRef}
        className={modalClasses}
        style={style}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        {(title || showCloseButton) && (
          <ModalSegment
            type="header"
            component={({ title, onClose, showCloseButton }) => (
              <div className="modal-header">
                {title && <h2 className="modal-title">{title}</h2>}
                {showCloseButton && (
                  <button 
                    className="modal-close-btn"
                    onClick={onClose}
                    aria-label="Close modal"
                  >
                    ×
                  </button>
                )}
              </div>
            )}
            props={{ title, onClose: handleClose, showCloseButton }}
            onLoad={() => handleSegmentLoad('header')}
            onError={(error) => handleSegmentError('header', error)}
          />
        )}
        
        {/* Modal Body */}
        <div className="modal-body">
          {/* Render segments */}
          {segments.map((segment, index) => (
            <ModalSegment
              key={segment.id || `segment-${index}`}
              type={segment.type || 'content'}
              component={segment.component}
              loader={segment.loader}
              props={segment.props}
              className={segment.className}
              style={segment.style}
              fallback={segment.fallback}
              onLoad={() => handleSegmentLoad(segment.id || `segment-${index}`)}
              onError={(error) => handleSegmentError(segment.id || `segment-${index}`, error)}
            />
          ))}
          
          {/* Children as content */}
          {children && (
            <ModalSegment
              type="content"
              component={() => children}
              onLoad={() => handleSegmentLoad('children')}
            />
          )}
        </div>
        
        {/* Loading progress indicator */}
        {isAnimating && (
          <div className="modal-progress">
            <div className="modal-progress-bar">
              <div 
                className="modal-progress-fill"
                style={{ 
                  width: `${(loadedSegments.size / Math.max(segments.length + 1, 1)) * 100}%` 
                }}
              />
            </div>
          </div>
        )}
      </div>
    </ModalBackdrop>
  )
  
  // Render to portal
  const portalRoot = document.getElementById('modal-root') || document.body
  return createPortal(modalContent, portalRoot)
})

SegmentedModal.displayName = 'SegmentedModal'

// Hook for managing segmented modals
export const useSegmentedModal = (initialSegments = []) => {
  const [isOpen, setIsOpen] = useState(false)
  const [segments, setSegments] = useState(initialSegments)
  
  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen(prev => !prev), [])
  
  const addSegment = useCallback((segment) => {
    setSegments(prev => [...prev, segment])
  }, [])
  
  const removeSegment = useCallback((segmentId) => {
    setSegments(prev => prev.filter(s => s.id !== segmentId))
  }, [])
  
  const updateSegment = useCallback((segmentId, updates) => {
    setSegments(prev => prev.map(s => 
      s.id === segmentId ? { ...s, ...updates } : s
    ))
  }, [])
  
  return {
    isOpen,
    segments,
    open,
    close,
    toggle,
    addSegment,
    removeSegment,
    updateSegment
  }
}

// Predefined modal configurations
export const ModalConfigs = {
  settings: {
    size: 'large',
    segments: [
      {
        id: 'general',
        type: 'content',
        loader: () => import('../components/modals/SettingsModal')
      }
    ]
  },
  
  profile: {
    size: 'medium',
    segments: [
      {
        id: 'basic',
        type: 'content',
        loader: () => import('../components/modals/ProfileModal')
      }
    ]
  },
  
  admin: {
    size: 'fullscreen',
    segments: [
      {
        id: 'main',
        type: 'content',
        loader: () => import('../components/AdminPanel')
      },
      {
        id: 'config',
        type: 'sidebar',
        loader: () => import('../components/modals/AdminConfigModal')
      }
    ]
  }
}

export default SegmentedModal