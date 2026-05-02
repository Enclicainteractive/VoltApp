import React, { Suspense, useState, useEffect, useRef, useMemo } from 'react'
import LazyComponent from './LazyComponent'
import lazyLoadingService from '../services/lazyLoadingService'

// Page loading phases with priorities
const PAGE_PHASES = {
  SHELL: {
    priority: lazyLoadingService.priorities.CRITICAL,
    delay: 0,
    description: ''
  },
  CORE: {
    priority: lazyLoadingService.priorities.HIGH,
    delay: 100,
    description: ''
  },
  SECONDARY: {
    priority: lazyLoadingService.priorities.MEDIUM,
    delay: 300,
    description: ''
  },
  TERTIARY: {
    priority: lazyLoadingService.priorities.LOW,
    delay: 600,
    description: ''
  },
  BACKGROUND: {
    priority: lazyLoadingService.priorities.BACKGROUND,
    delay: 1000,
    description: ''
  }
}

// Progressive loading indicator
const LoadingProgress = React.memo(({ phases, currentPhase, progress }) => {
  const phaseNames = Object.keys(phases)
  const currentIndex = phaseNames.indexOf(currentPhase)
  
  return (
    <div className="page-loading-progress">
      <div className="progress-bar">
        <div 
          className="progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="progress-phases">
        {phaseNames.map((phaseName, index) => (
          <div
            key={phaseName}
            className={`progress-phase ${
              index <= currentIndex ? 'completed' : ''
            } ${
              index === currentIndex ? 'active' : ''
            }`}
          >
            <div className="phase-dot" />
            <span className="phase-label">{phases[phaseName].description}</span>
          </div>
        ))}
      </div>
      <div className="progress-text">
        Loading {phases[currentPhase]?.description}...
      </div>
    </div>
  )
})

LoadingProgress.displayName = 'LoadingProgress'

// Page section component
const PageSection = React.memo(({
  id,
  phase,
  component: Component,
  loader,
  props = {},
  className = '',
  style = {},
  skeletonType = 'card',
  skeletonProps = {},
  fallback,
  onLoad,
  onError,
  children
}) => {
  const phaseConfig = PAGE_PHASES[phase] || PAGE_PHASES.CORE
  const [shouldLoad, setShouldLoad] = useState(phaseConfig.delay === 0)
  const [isVisible, setIsVisible] = useState(false)
  const sectionRef = useRef(null)
  
  // Delayed loading based on phase
  useEffect(() => {
    if (phaseConfig.delay > 0) {
      const timer = setTimeout(() => {
        setShouldLoad(true)
      }, phaseConfig.delay)
      
      return () => clearTimeout(timer)
    }
  }, [phaseConfig.delay])
  
  // Intersection observer for visibility-based loading
  useEffect(() => {
    if (!sectionRef.current) return
    
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setIsVisible(true)
            observer.disconnect()
          }
        })
      },
      { threshold: 0.1, rootMargin: '100px' }
    )
    
    observer.observe(sectionRef.current)
    
    return () => observer.disconnect()
  }, [])
  
  // Handle load callback
  const handleLoad = (loadedComponent) => {
    onLoad?.(id, loadedComponent)
  }
  
  // Handle error callback
  const handleError = (error) => {
    onError?.(id, error)
  }
  
  const sectionContent = useMemo(() => {
    if (!shouldLoad) {
      return (
        <LazyComponent
          skeletonType={skeletonType}
          skeletonProps={{ ...skeletonProps, className: `skeleton-${id}` }}
        />
      )
    }
    
    if (Component) {
      return <Component {...props} />
    }
    
    if (loader) {
      return (
        <LazyComponent
          loaderComponent={loader}
          priority={phaseConfig.priority}
          skeletonType={skeletonType}
          skeletonProps={skeletonProps}
          fallback={fallback}
          onLoad={handleLoad}
          onError={handleError}
          loadOnVisible={true}
          {...props}
        />
      )
    }
    
    return children
  }, [shouldLoad, Component, loader, props, skeletonType, skeletonProps, fallback, children, phaseConfig.priority, handleLoad, handleError, id])
  
  return (
    <div
      ref={sectionRef}
      id={id}
      className={`page-section page-section-${phase} ${className}`}
      style={style}
      data-phase={phase}
      data-loaded={shouldLoad}
      data-visible={isVisible}
    >
      {sectionContent}
    </div>
  )
})

PageSection.displayName = 'PageSection'

// Main progressive page component
const ProgressivePage = React.memo(({
  sections = [],
  className = '',
  style = {},
  showProgress = true,
  onPhaseComplete,
  onPageComplete,
  children
}) => {
  const [loadedSections, setLoadedSections] = useState(new Set())
  const [currentPhase, setCurrentPhase] = useState('SHELL')
  const [progress, setProgress] = useState(0)
  const [isComplete, setIsComplete] = useState(false)
  
  // Calculate progress and current phase
  useEffect(() => {
    const totalSections = sections.length + (children ? 1 : 0)
    const loadedCount = loadedSections.size
    const newProgress = totalSections > 0 ? (loadedCount / totalSections) * 100 : 0
    
    setProgress(newProgress)
    
    // Determine current phase based on loaded sections
    const phases = Object.keys(PAGE_PHASES)
    const sectionsByPhase = sections.reduce((acc, section) => {
      if (!acc[section.phase]) acc[section.phase] = []
      acc[section.phase].push(section)
      return acc
    }, {})
    
    for (const phase of phases) {
      const phaseSections = sectionsByPhase[phase] || []
      const phaseLoaded = phaseSections.every(section => loadedSections.has(section.id))
      
      if (!phaseLoaded) {
        setCurrentPhase(phase)
        break
      }
    }
    
    // Check if page is complete
    if (newProgress >= 100 && !isComplete) {
      setIsComplete(true)
      onPageComplete?.()
    }
  }, [loadedSections, sections, children, isComplete, onPageComplete])
  
  // Handle section load
  const handleSectionLoad = (sectionId, component) => {
    setLoadedSections(prev => {
      const newSet = new Set([...prev, sectionId])
      
      // Check if phase is complete
      const section = sections.find(s => s.id === sectionId)
      if (section) {
        const phaseSections = sections.filter(s => s.phase === section.phase)
        const phaseComplete = phaseSections.every(s => newSet.has(s.id))
        
        if (phaseComplete) {
          onPhaseComplete?.(section.phase, phaseSections)
        }
      }
      
      return newSet
    })
  }
  
  // Handle section error
  const handleSectionError = (sectionId, error) => {
    console.error(`Page section ${sectionId} failed to load:`, error)
  }
  
  // Group sections by phase for rendering order
  const sectionsByPhase = useMemo(() => {
    const grouped = {}
    sections.forEach(section => {
      if (!grouped[section.phase]) grouped[section.phase] = []
      grouped[section.phase].push(section)
    })
    return grouped
  }, [sections])
  
  return (
    <div 
      className={`progressive-page ${className} ${isComplete ? 'complete' : 'loading'}`}
      style={style}
      data-progress={Math.round(progress)}
    >
      {/* Loading progress indicator */}
      {showProgress && !isComplete && (
        <div className="page-progress-overlay">
          <LoadingProgress
            phases={PAGE_PHASES}
            currentPhase={currentPhase}
            progress={progress}
          />
        </div>
      )}
      
      {/* Render sections by phase */}
      {Object.keys(PAGE_PHASES).map(phase => {
        const phaseSections = sectionsByPhase[phase] || []
        if (phaseSections.length === 0) return null
        
        return (
          <div key={phase} className={`page-phase page-phase-${phase.toLowerCase()}`}>
            {phaseSections.map(section => (
              <PageSection
                key={section.id}
                {...section}
                onLoad={handleSectionLoad}
                onError={handleSectionError}
              />
            ))}
          </div>
        )
      })}
      
      {/* Children as main content */}
      {children && (
        <PageSection
          id="main-content"
          phase="CORE"
          onLoad={() => handleSectionLoad('main-content')}
          onError={(error) => handleSectionError('main-content', error)}
        >
          {children}
        </PageSection>
      )}
    </div>
  )
})

ProgressivePage.displayName = 'ProgressivePage'

// Hook for managing progressive page loading
export const useProgressivePage = () => {
  const [sections, setSections] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadedPhases, setLoadedPhases] = useState(new Set())
  
  const addSection = (section) => {
    setSections(prev => [...prev, section])
  }
  
  const removeSection = (sectionId) => {
    setSections(prev => prev.filter(s => s.id !== sectionId))
  }
  
  const updateSection = (sectionId, updates) => {
    setSections(prev => prev.map(s => 
      s.id === sectionId ? { ...s, ...updates } : s
    ))
  }
  
  const handlePhaseComplete = (phase) => {
    setLoadedPhases(prev => new Set([...prev, phase]))
  }
  
  const handlePageComplete = () => {
    setIsLoading(false)
  }
  
  return {
    sections,
    isLoading,
    loadedPhases: Array.from(loadedPhases),
    addSection,
    removeSection,
    updateSection,
    handlePhaseComplete,
    handlePageComplete
  }
}

// Pre-configured page templates
export const PageTemplates = {
  chat: [
    {
      id: 'chat-area',
      phase: 'CORE',
      loader: () => import('../components/ChatArea'),
      skeletonType: 'message'
    },
    {
      id: 'server-sidebar',
      phase: 'SECONDARY',
      loader: () => import('../components/ServerSidebar'),
      skeletonType: 'sidebar'
    },
    {
      id: 'member-sidebar',
      phase: 'SECONDARY',
      loader: () => import('../components/MemberSidebar'),
      skeletonType: 'list'
    },
    {
      id: 'activities-panel',
      phase: 'TERTIARY',
      loader: () => import('../components/ActivitiesPanel'),
      skeletonType: 'card'
    }
  ],
  
  settings: [
    {
      id: 'settings-modal',
      phase: 'SHELL',
      loader: () => import('../components/modals/SettingsModal'),
      skeletonType: 'modal'
    },
    {
      id: 'profile-modal',
      phase: 'CORE',
      loader: () => import('../components/modals/ProfileModal'),
      skeletonType: 'modal'
    },
    {
      id: 'server-settings',
      phase: 'CORE',
      loader: () => import('../components/modals/ServerSettingsModal'),
      skeletonType: 'card'
    }
  ]
}

export default ProgressivePage
