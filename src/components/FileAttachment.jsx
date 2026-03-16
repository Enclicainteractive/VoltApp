import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { DocumentTextIcon, ArrowDownTrayIcon, EyeIcon, EyeSlashIcon, CodeBracketIcon, MusicalNoteIcon, FilmIcon, PhotoIcon, PlayIcon, PauseIcon, SpeakerWaveIcon, SpeakerXMarkIcon, ArrowsPointingOutIcon, MagnifyingGlassPlusIcon, MagnifyingGlassMinusIcon, ArrowPathIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../contexts/AuthContext'
import { settingsService } from '../services/settingsService'
import { classifyImageUrlForNsfw, getNsfwThresholds } from '../services/nsfwDetectionService'
import '../assets/styles/FileAttachment.css'

// Custom Audio Player Component
const CustomAudioPlayer = ({ src, name, size, formatFileSize }) => {
  const audioRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const sourceNodeRef = useRef(null)
  const animationFrameRef = useRef(null)
  const previousVolumeRef = useRef(1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [showVolumeSlider, setShowVolumeSlider] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [visualizerBars, setVisualizerBars] = useState(() => Array.from({ length: 32 }, () => 0.18))

  const resetVisualizer = useCallback(() => {
    setVisualizerBars((current) => current.map((_, index) => {
      const offset = ((index % 6) + 1) / 60
      return 0.16 + offset
    }))
  }, [])

  const stopVisualizerLoop = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
  }, [])

  const startVisualizerLoop = useCallback(() => {
    const analyser = analyserRef.current
    if (!analyser) return

    const buffer = new Uint8Array(analyser.frequencyBinCount)

    const tick = () => {
      analyser.getByteFrequencyData(buffer)

      setVisualizerBars((current) => current.map((previous, index, all) => {
        const start = Math.floor((index / all.length) * buffer.length)
        const end = Math.max(start + 1, Math.floor(((index + 1) / all.length) * buffer.length))
        let sum = 0
        for (let i = start; i < end; i += 1) sum += buffer[i]
        const average = sum / (end - start)
        const normalized = clamp(average / 255, 0.08, 1)
        return previous * 0.42 + normalized * 0.58
      }))

      animationFrameRef.current = requestAnimationFrame(tick)
    }

    stopVisualizerLoop()
    tick()
  }, [stopVisualizerLoop])

  const ensureVisualizer = useCallback(async () => {
    const audio = audioRef.current
    if (!audio || typeof window === 'undefined') return false

    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return false

    try {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioContextClass()
      }

      const audioContext = audioContextRef.current
      if (!analyserRef.current) {
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.72
        analyser.connect(audioContext.destination)
        analyserRef.current = analyser
      }

      if (!sourceNodeRef.current) {
        const sourceNode = audioContext.createMediaElementSource(audio)
        sourceNode.connect(analyserRef.current)
        sourceNodeRef.current = sourceNode
      }

      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }

      return true
    } catch (err) {
      console.warn('[FileAttachment] Failed to initialize audio visualizer:', err)
      return false
    }
  }, [])
  
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    
    const handleLoadedMetadata = () => setDuration(audio.duration)
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime)
    const handleDurationChange = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
    const handleVolumeChange = () => {
      setVolume(audio.volume)
      setIsMuted(audio.muted || audio.volume === 0)
      if (audio.volume > 0) previousVolumeRef.current = audio.volume
    }
    const handleRateChange = () => setPlaybackRate(audio.playbackRate || 1)
    const handleEnded = () => {
      setIsPlaying(false)
      setCurrentTime(audio.duration || 0)
      stopVisualizerLoop()
      resetVisualizer()
    }
    const handlePlay = async () => {
      setIsPlaying(true)
      const visualizerReady = await ensureVisualizer()
      if (visualizerReady) {
        startVisualizerLoop()
      }
    }
    const handlePause = () => {
      setIsPlaying(false)
      stopVisualizerLoop()
      resetVisualizer()
    }
    const handleEmptied = () => {
      setCurrentTime(0)
      setDuration(0)
      setIsPlaying(false)
      stopVisualizerLoop()
      resetVisualizer()
    }
    
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('durationchange', handleDurationChange)
    audio.addEventListener('volumechange', handleVolumeChange)
    audio.addEventListener('ratechange', handleRateChange)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('emptied', handleEmptied)
    
    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('durationchange', handleDurationChange)
      audio.removeEventListener('volumechange', handleVolumeChange)
      audio.removeEventListener('ratechange', handleRateChange)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('emptied', handleEmptied)
    }
  }, [ensureVisualizer, resetVisualizer, src, startVisualizerLoop, stopVisualizerLoop])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return undefined

    audio.currentTime = 0
    audio.pause()
    audio.load()
    setCurrentTime(0)
    setDuration(0)
    setIsPlaying(false)
    resetVisualizer()

    return () => {
      stopVisualizerLoop()
    }
  }, [resetVisualizer, src, stopVisualizerLoop])

  useEffect(() => () => {
    stopVisualizerLoop()
    try {
      sourceNodeRef.current?.disconnect()
    } catch {}
    try {
      analyserRef.current?.disconnect()
    } catch {}
    try {
      audioContextRef.current?.close?.().catch(() => {})
    } catch {}
  }, [stopVisualizerLoop])
  
  const togglePlay = async () => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.pause()
      return
    }

    await ensureVisualizer()
    audio.play().catch((err) => {
      console.warn('[FileAttachment] Failed to play audio attachment:', err)
    })
  }
  
  const handleSeek = (e) => {
    const time = parseFloat(e.target.value)
    if (audioRef.current) {
      audioRef.current.currentTime = time
      setCurrentTime(time)
    }
  }
  
  const handleVolumeChange = (e) => {
    const vol = parseFloat(e.target.value)
    if (audioRef.current) {
      audioRef.current.volume = vol
      audioRef.current.muted = vol === 0
      setVolume(vol)
      setIsMuted(vol === 0)
      if (vol > 0) previousVolumeRef.current = vol
    }
  }
  
  const toggleMute = () => {
    if (audioRef.current) {
      if (isMuted) {
        const restoredVolume = previousVolumeRef.current > 0 ? previousVolumeRef.current : 1
        audioRef.current.muted = false
        audioRef.current.volume = restoredVolume
        setVolume(restoredVolume)
        setIsMuted(false)
      } else {
        if (audioRef.current.volume > 0) previousVolumeRef.current = audioRef.current.volume
        audioRef.current.muted = true
        audioRef.current.volume = 0
        setIsMuted(true)
      }
    }
  }

  const cyclePlaybackRate = () => {
    const nextRate = playbackRate >= 2 ? 1 : Number((playbackRate + 0.25).toFixed(2))
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate
    }
    setPlaybackRate(nextRate)
  }
  
  const formatTime = (time) => {
    if (isNaN(time)) return '0:00'
    const mins = Math.floor(time / 60)
    const secs = Math.floor(time % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }
  
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0
  const volumePercent = (isMuted ? 0 : volume) * 100

  return (
    <div className="custom-audio-player">
      <audio ref={audioRef} src={src} preload="metadata" crossOrigin="anonymous" />
      <div className="media-card-header">
        <div className="media-card-title-group">
          <span className="media-card-eyebrow">Audio Attachment</span>
          <span className="media-card-title" title={name}>{name}</span>
        </div>
        <div className="media-card-actions">
          <button className="media-pill-btn" onClick={cyclePlaybackRate} type="button">
            {playbackRate}x
          </button>
          <a href={src} download={name} className="media-pill-btn" title="Download audio">
            <ArrowDownTrayIcon width={16} height={16} />
          </a>
        </div>
      </div>
      
      <div className="audio-visualizer">
        <div className="audio-wave" aria-hidden="true">
          {visualizerBars.map((value, i) => (
            <div 
              key={i} 
              className={`wave-bar ${isPlaying ? 'playing' : ''}`}
              style={{ 
                height: `${Math.max(14, Math.round(value * 100))}%`,
                animationDelay: `${i * 0.03}s`
              }}
            />
          ))}
        </div>
      </div>
      
      <div className="audio-controls">
        <button className="control-btn play-btn" onClick={togglePlay}>
          {isPlaying ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
        </button>
        
        <div className="progress-container">
          <span className="time-display">{formatTime(currentTime)}</span>
          <input
            type="range"
            className="progress-slider"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            style={{ '--range-progress': `${progressPercent}%` }}
          />
          <span className="time-display">{formatTime(duration)}</span>
        </div>
        
        <div className="volume-container">
          <button 
            className="control-btn volume-btn"
            onClick={toggleMute}
            onMouseEnter={() => setShowVolumeSlider(true)}
          >
            {isMuted || volume === 0 ? <SpeakerXMarkIcon size={18} /> : <SpeakerWaveIcon size={18} />}
          </button>
          
          {showVolumeSlider && (
            <div 
              className="volume-slider-container"
              onMouseLeave={() => setShowVolumeSlider(false)}
            >
              <input
                type="range"
                className="volume-slider"
                min={0}
                max={1}
                step={0.1}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                style={{ '--range-progress': `${volumePercent}%` }}
              />
            </div>
          )}
        </div>
      </div>
      
      <div className="audio-meta">
        <MusicalNoteIcon size={20} className="audio-icon" />
        <div className="audio-details">
          <span className="audio-name">{name}</span>
          <span className="audio-size">{formatFileSize(size)}</span>
        </div>
      </div>
    </div>
  )
}

// Custom Video Player Component
const CustomVideoPlayer = ({ src, name, size, formatFileSize }) => {
  const videoRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const controlsTimeoutRef = useRef(null)
  
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    
    const handleLoadedMetadata = () => setDuration(video.duration)
    const handleTimeUpdate = () => setCurrentTime(video.currentTime)
    const handleEnded = () => setIsPlaying(false)
    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    
    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('ended', handleEnded)
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    
    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('ended', handleEnded)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [src])
  
  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause()
      } else {
        videoRef.current.play()
      }
    }
  }
  
  const handleSeek = (e) => {
    const time = parseFloat(e.target.value)
    if (videoRef.current) {
      videoRef.current.currentTime = time
      setCurrentTime(time)
    }
  }
  
  const handleVolumeChange = (e) => {
    const vol = parseFloat(e.target.value)
    if (videoRef.current) {
      videoRef.current.volume = vol
      setVolume(vol)
      setIsMuted(vol === 0)
    }
  }
  
  const toggleMute = () => {
    if (videoRef.current) {
      if (isMuted) {
        videoRef.current.volume = volume || 1
        setIsMuted(false)
      } else {
        videoRef.current.volume = 0
        setIsMuted(true)
      }
    }
  }

  const cyclePlaybackRate = () => {
    const nextRate = playbackRate >= 2 ? 1 : Number((playbackRate + 0.25).toFixed(2))
    if (videoRef.current) {
      videoRef.current.playbackRate = nextRate
    }
    setPlaybackRate(nextRate)
  }
  
  const containerRef = useRef(null)
  
  const toggleFullscreen = () => {
    const container = containerRef.current
    if (container) {
      if (!isFullscreen) {
        container.requestFullscreen?.()
      } else {
        document.exitFullscreen?.()
      }
    }
  }
  
  const handleMouseMove = () => {
    setShowControls(true)
    clearTimeout(controlsTimeoutRef.current)
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000)
    }
  }
  
  const formatTime = (time) => {
    if (isNaN(time)) return '0:00'
    const mins = Math.floor(time / 60)
    const secs = Math.floor(time % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0
  const volumePercent = (isMuted ? 0 : volume) * 100
  
  return (
    <div 
      ref={containerRef}
      className={`custom-video-player ${isFullscreen ? 'fullscreen' : ''}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      <div className="video-floating-meta">
        <span className="media-card-eyebrow">Video Attachment</span>
        <span className="video-floating-title" title={name}>{name}</span>
      </div>
      <video 
        ref={videoRef} 
        src={src} 
        className="video-element"
        onClick={togglePlay}
        preload="metadata"
      />
      
      {!isPlaying && (
        <div className="video-overlay" onClick={togglePlay}>
          <button className="big-play-btn">
            <PlayIcon size={48} />
          </button>
        </div>
      )}
      
      <div className={`video-controls ${showControls ? 'visible' : 'hidden'}`}>
        <div className="video-progress-container">
          <input
            type="range"
            className="video-progress-slider"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            style={{ '--range-progress': `${progressPercent}%` }}
          />
        </div>
        
        <div className="video-controls-row">
          <div className="video-controls-left">
            <button className="control-btn" onClick={togglePlay}>
              {isPlaying ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
            </button>
            
            <div className="volume-container">
              <button className="control-btn" onClick={toggleMute}>
                {isMuted || volume === 0 ? <SpeakerXMarkIcon size={18} /> : <SpeakerWaveIcon size={18} />}
              </button>
              <input
                type="range"
                className="volume-slider"
                min={0}
                max={1}
                step={0.1}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                style={{ '--range-progress': `${volumePercent}%` }}
              />
            </div>
            
            <span className="video-time">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
          
          <div className="video-controls-right">
            <button className="control-btn video-rate-btn" onClick={cyclePlaybackRate} type="button" title="Change playback speed">
              <span className="rate-btn-label">{playbackRate}x</span>
            </button>
            <a href={src} download={name} className="control-btn video-download-btn" title="Download video">
              <ArrowDownTrayIcon width={18} height={18} />
            </a>
            <span className="video-name">{name}</span>
            <button className="control-btn" onClick={toggleFullscreen}>
              <ArrowsPointingOutIcon size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// File type detection based on extension
const getFileType = (filename) => {
  if (!filename) return 'unknown'
  const ext = filename.split('.').pop().toLowerCase()
  
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico']
  const videoExts = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv']
  const audioExts = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma']
  const codeExts = [
    'js', 'jsx', 'ts', 'tsx', 'html', 'htm', 'css', 'scss', 'sass', 'less',
    'json', 'xml', 'yaml', 'yml', 'sql', 'sh', 'bash', 'zsh', 'ps1', 'bat',
    'c', 'cpp', 'h', 'hpp', 'cs', 'java', 'py', 'rb', 'go', 'rs', 'swift',
    'kt', 'kts', 'php', 'pl', 'r', 'm', 'mm', 'scala', 'groovy', 'lua',
    'vim', 'vimrc', 'dockerfile', 'makefile', 'cmake', 'gradle'
  ]
  const textExts = ['txt', 'md', 'log', 'csv', 'tsv', 'ini', 'conf', 'cfg', 'env', 'gitignore']
  
  if (imageExts.includes(ext)) return 'image'
  if (videoExts.includes(ext)) return 'video'
  if (audioExts.includes(ext)) return 'audio'
  if (codeExts.includes(ext)) return 'code'
  if (textExts.includes(ext)) return 'text'
  
  return 'file'
}

// Get language for syntax highlighting
const getLanguage = (filename) => {
  const ext = filename.split('.').pop().toLowerCase()
  const langMap = {
    'js': 'javascript', 'jsx': 'jsx',
    'ts': 'typescript', 'tsx': 'tsx',
    'html': 'html', 'htm': 'html',
    'css': 'css', 'scss': 'scss', 'sass': 'sass', 'less': 'less',
    'json': 'json', 'xml': 'xml',
    'c': 'c', 'cpp': 'cpp', 'h': 'c', 'hpp': 'cpp',
    'cs': 'csharp',
    'java': 'java',
    'py': 'python',
    'rb': 'ruby',
    'go': 'go',
    'rs': 'rust',
    'swift': 'swift',
    'kt': 'kotlin', 'kts': 'kotlin',
    'php': 'php',
    'sql': 'sql',
    'sh': 'bash', 'bash': 'bash',
    'yaml': 'yaml', 'yml': 'yaml',
    'md': 'markdown', 'txt': 'text'
  }
  return langMap[ext] || 'text'
}

// Simple syntax highlighting (basic implementation)
const highlightCode = (code, language) => {
  // Escape HTML first
  let highlighted = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  
  // Basic highlighting patterns
  const patterns = [
    // Comments
    { regex: /(\/\/.*$|\/\*[\s\S]*?\*\/|#.*$|--.*$)/gm, class: 'comment' },
    // Strings
    { regex: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, class: 'string' },
    // Keywords
    { regex: /\b(function|const|let|var|if|else|for|while|return|class|import|export|from|async|await|try|catch|throw|new|this|true|false|null|undefined)\b/g, class: 'keyword' },
    // Numbers
    { regex: /\b\d+\.?\d*\b/g, class: 'number' },
    // Functions
    { regex: /\b([a-zA-Z_]\w*)\s*(?=\()/g, class: 'function' }
  ]
  
  // Apply highlighting (simple approach - in production use a proper library like Prism.js)
  patterns.forEach(({ regex, class: className }) => {
    highlighted = highlighted.replace(regex, `<span class="code-${className}">$&</span>`)
  })
  
  return highlighted
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const ImageLightbox = ({ isOpen, url, name, sizeLabel, onClose }) => {
  const [zoomLevel, setZoomLevel] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  const resetView = useCallback(() => {
    setZoomLevel(1)
    setPosition({ x: 0, y: 0 })
    setIsDragging(false)
  }, [])

  const closeLightbox = useCallback(() => {
    resetView()
    onClose?.()
  }, [onClose, resetView])

  const handleZoom = useCallback((delta) => {
    setZoomLevel((current) => {
      const nextZoom = clamp(Number((current + delta).toFixed(2)), 1, 4)
      if (nextZoom === 1) {
        setPosition({ x: 0, y: 0 })
      }
      return nextZoom
    })
  }, [])

  const handleReset = useCallback(() => {
    resetView()
  }, [resetView])

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeLightbox()
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        handleZoom(0.25)
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault()
        handleZoom(-0.25)
      } else if (event.key === '0') {
        event.preventDefault()
        handleReset()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeLightbox, handleReset, handleZoom, isOpen])

  useEffect(() => {
    if (isOpen) {
      resetView()
    }
  }, [isOpen, resetView])

  if (!isOpen || typeof document === 'undefined') return null

  const handleMouseDown = (event) => {
    if (zoomLevel <= 1) return
    event.preventDefault()
    setIsDragging(true)
    setDragStart({
      x: event.clientX - position.x,
      y: event.clientY - position.y
    })
  }

  const handleMouseMove = (event) => {
    if (!isDragging || zoomLevel <= 1) return
    event.preventDefault()
    setPosition({
      x: event.clientX - dragStart.x,
      y: event.clientY - dragStart.y
    })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleWheel = (event) => {
    event.preventDefault()
    handleZoom(event.deltaY > 0 ? -0.2 : 0.2)
  }

  const lightbox = (
    <div
      className="image-lightbox"
      onClick={closeLightbox}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      role="dialog"
      aria-modal="true"
      aria-label={`Image viewer for ${name}`}
    >
      <div className="lightbox-shell" onClick={(event) => event.stopPropagation()}>
        <div className="lightbox-topbar">
          <div className="lightbox-file-meta">
            <span className="lightbox-name" title={name}>{name}</span>
            {sizeLabel ? <span className="lightbox-size">{sizeLabel}</span> : null}
          </div>
          <div className="lightbox-actions">
            <a
              href={url}
              download={name}
              className="lightbox-action-btn"
              title="Download image"
              aria-label="Download image"
            >
              <ArrowDownTrayIcon width={18} height={18} />
            </a>
            <button
              type="button"
              className="lightbox-action-btn"
              onClick={closeLightbox}
              aria-label="Close lightbox"
            >
              <XMarkIcon width={18} height={18} />
            </button>
          </div>
        </div>

        <div className="lightbox-stage" onWheel={handleWheel}>
          <div
            className="lightbox-image-container"
            style={{
              transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${zoomLevel})`,
              cursor: zoomLevel > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default'
            }}
            onMouseDown={handleMouseDown}
          >
            <img
              src={url}
              alt={name}
              className="lightbox-image"
              draggable="false"
              onDragStart={(event) => event.preventDefault()}
            />
          </div>
        </div>

        <div className="lightbox-toolbar">
          <button
            type="button"
            className="lightbox-control-btn"
            onClick={() => handleZoom(-0.25)}
            disabled={zoomLevel <= 1}
            aria-label="Zoom out"
          >
            <MagnifyingGlassMinusIcon width={18} height={18} />
          </button>
          <span className="zoom-level">{Math.round(zoomLevel * 100)}%</span>
          <button
            type="button"
            className="lightbox-control-btn"
            onClick={() => handleZoom(0.25)}
            disabled={zoomLevel >= 4}
            aria-label="Zoom in"
          >
            <MagnifyingGlassPlusIcon width={18} height={18} />
          </button>
          <button
            type="button"
            className="lightbox-control-btn"
            onClick={handleReset}
            disabled={zoomLevel === 1 && position.x === 0 && position.y === 0}
            aria-label="Reset view"
          >
            <ArrowPathIcon width={18} height={18} />
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(lightbox, document.body)
}

const FileAttachment = ({ attachment }) => {
  const { user } = useAuth()
  const { url, name, size, type: attachmentType, filename } = attachment
  const [fileType, setFileType] = useState(attachmentType || 'file')
  const [content, setContent] = useState(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [nsfwFilterEnabled, setNsfwFilterEnabled] = useState(() => !!settingsService.getSetting('nsfwImageFilter'))
  const [nsfwState, setNsfwState] = useState({ checking: false, blocked: false, reason: null })
  const [revealBlockedImage, setRevealBlockedImage] = useState(false)

  const isAdultVerified = !!(
    user?.ageVerification?.adultAccess ||
    (user?.ageVerification?.verified && user?.ageVerification?.category === 'adult') ||
    (user?.ageVerification?.method === 'admin_manual' && user?.ageVerification?.category === 'adult')
  )
  const senderNsfwFlag = !!attachment?.contentFlags?.nsfw
  const shouldEnforceNsfwFilter = !isAdultVerified || nsfwFilterEnabled

  useEffect(() => {
    const unsubscribe = settingsService.subscribe((nextSettings) => {
      setNsfwFilterEnabled(!!nextSettings?.nsfwImageFilter)
    })
    return unsubscribe
  }, [])
  
  useEffect(() => {
    // Determine file type from extension if not provided
    if (!attachmentType || attachmentType === 'file') {
      setFileType(getFileType(name))
    }
  }, [name, attachmentType])

  useEffect(() => {
    let cancelled = false
    const evaluateImageSafety = async () => {
      if (fileType !== 'image') return
      setRevealBlockedImage(false)

      if (!shouldEnforceNsfwFilter) {
        setNsfwState({ checking: false, blocked: false, reason: null })
        return
      }

      if (senderNsfwFlag) {
        setNsfwState({ checking: false, blocked: true, reason: 'sender_flag' })
        return
      }

      setNsfwState({ checking: true, blocked: false, reason: 'receiver_scan' })
      const thresholds = getNsfwThresholds()
      const threshold = !isAdultVerified || nsfwFilterEnabled ? thresholds.minor : thresholds.adult
      const scan = await classifyImageUrlForNsfw(url, { 
        threshold, 
        failClosed: false,
        maxRetries: 3 
      })

      if (cancelled) return
      setNsfwState({
        checking: false,
        blocked: !!scan?.nsfw,
        reason: scan?.status || 'receiver_scan'
      })
    }

    evaluateImageSafety()
    return () => {
      cancelled = true
    }
  }, [fileType, url, shouldEnforceNsfwFilter, senderNsfwFlag, isAdultVerified, nsfwFilterEnabled])
  
  const loadTextContent = async () => {
    if (content || isLoading) return
    
    setIsLoading(true)
    setError(null)
    
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error('Failed to load file')
      
      // Check file size - don't load files larger than 1MB
      const contentLength = response.headers.get('content-length')
      if (contentLength && parseInt(contentLength) > 1024 * 1024) {
        throw new Error('File too large to preview')
      }
      
      const text = await response.text()
      
      // Limit to 10000 characters for display
      if (text.length > 10000) {
        setContent(text.substring(0, 10000) + '\n\n... (truncated)')
      } else {
        setContent(text)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }
  
  const formatFileSize = (size) => {
    // Handle if size is already formatted (string) but guard against "NaN"
    if (typeof size === 'string') {
      if (size === '' || size.toLowerCase() === 'nan') return ''
      // If it looks like a pre-formatted size string (e.g. "1.2 KB"), return as-is
      if (/^\d/.test(size)) return size
    }

    // Handle numeric bytes
    const bytes = Number(size)
    if (!Number.isFinite(bytes) || bytes < 0) return ''
    if (bytes === 0) return '0 B'
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }
  
  const renderIcon = () => {
    switch (fileType) {
      case 'image': return <PhotoIcon size={20} />
      case 'video': return <FilmIcon size={20} />
      case 'audio': return <MusicalNoteIcon size={20} />
      case 'code': return <CodeBracketIcon size={20} />
      default: return <DocumentTextIcon size={20} />
    }
  }
  
  // Image rendering
  if (fileType === 'image') {
    const showBlocked = shouldEnforceNsfwFilter && nsfwState.blocked && !revealBlockedImage
    const canReveal = isAdultVerified && nsfwFilterEnabled
    const formattedSize = formatFileSize(size)
    
    return (
      <>
        {showBlocked ? (
          <div className="attachment-viewer image-viewer nsfw-blocked">
            <div className="nsfw-warning">
              <strong>Sensitive image hidden</strong>
              <span>
                {nsfwState.checking
                  ? 'Scanning locally...'
                  : !isAdultVerified
                    ? 'Age verification is required to view this image.'
                    : 'NSFW filter is enabled for your account.'}
              </span>
            </div>
            {canReveal && !nsfwState.checking && (
              <button
                type="button"
                className="nsfw-reveal-btn"
                onClick={() => setRevealBlockedImage(true)}
              >
                Reveal once
              </button>
            )}
            <div className="attachment-info">
              <span className="attachment-name">{name}</span>
              <span className="attachment-size">{formatFileSize(size)}</span>
            </div>
          </div>
        ) : (
          <div className="attachment-viewer image-viewer">
            <div 
              className="image-link"
              onClick={() => setLightboxOpen(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setLightboxOpen(true)
                }
              }}
              aria-label={`Open image ${name}`}
            >
              <img src={url} alt={name} className="attachment-image" />
              <div className="attachment-image-overlay">
                <span className="attachment-image-chip">Open viewer</span>
              </div>
            </div>
            <div className="attachment-info">
              <span className="attachment-name">{name}</span>
              <span className="attachment-size">{formattedSize}</span>
            </div>
          </div>
        )}
        <ImageLightbox
          isOpen={lightboxOpen}
          url={url}
          name={name}
          sizeLabel={formattedSize}
          onClose={() => setLightboxOpen(false)}
        />
      </>
    )
  }
  
  // Video rendering
  if (fileType === 'video') {
    return (
      <div className="attachment-viewer video-viewer">
        <CustomVideoPlayer src={url} name={name} size={size} formatFileSize={formatFileSize} />
      </div>
    )
  }

  // Audio rendering
  if (fileType === 'audio') {
    const isVoiceMessage = attachment?.isVoiceMessage
    const duration = attachment?.duration
    
    if (isVoiceMessage) {
      return (
        <div className="voice-message-player">
          <button className="voice-play-btn" onClick={() => {
            const audio = document.getElementById(`voice-audio-${attachment.id}`)
            if (audio) {
              if (audio.paused) audio.play()
              else audio.pause()
            }
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </button>
          <div className="voice-waveform">
            {Array.from({ length: 30 }).map((_, i) => (
              <span key={i} style={{ height: `${20 + Math.random() * 60}%` }}></span>
            ))}
          </div>
          <span className="voice-duration">
            {duration ? `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}` : '0:00'}
          </span>
          <audio id={`voice-audio-${attachment.id}`} src={url} preload="metadata" />
        </div>
      )
    }
    
    return (
      <div className="attachment-viewer audio-viewer">
        <CustomAudioPlayer src={url} name={name} size={size} formatFileSize={formatFileSize} />
      </div>
    )
  }
  
  // Code/Text file rendering
  if (fileType === 'code' || fileType === 'text') {
    const language = getLanguage(name)
    
    return (
      <div className="attachment-viewer code-viewer">
        <div className="code-header">
          <div className="code-header-left">
            <CodeBracketIcon size={18} />
            <span className="code-filename">{name}</span>
            <span className="code-language">{language}</span>
          </div>
          <div className="code-header-right">
            {!isExpanded ? (
              <button 
                className="code-action-btn"
                onClick={() => {
                  setIsExpanded(true)
                  loadTextContent()
                }}
                disabled={isLoading}
              >
                <EyeIcon size={16} />
                Preview
              </button>
            ) : (
              <button 
                className="code-action-btn"
                onClick={() => setIsExpanded(false)}
              >
                <EyeSlashIcon size={16} />
                Hide
              </button>
            )}
            <a 
              href={url} 
              download={name}
              className="code-action-btn"
              title="Download"
            >
              <ArrowDownTrayIcon size={16} />
            </a>
          </div>
        </div>
        
        {isExpanded && (
          <div className="code-content">
            {isLoading ? (
              <div className="code-loading">Loading...</div>
            ) : error ? (
              <div className="code-error">{error}</div>
            ) : content ? (
              <pre className="code-block">
                <code 
                  dangerouslySetInnerHTML={{ 
                    __html: highlightCode(content, language) 
                  }} 
                />
              </pre>
            ) : null}
          </div>
        )}
        
        {!isExpanded && (
          <div className="code-collapsed">
            <DocumentTextIcon size={40} />
            <span>Click Preview to view file contents</span>
          </div>
        )}
      </div>
    )
  }
  
  // Generic file rendering
  return (
    <div className="attachment-viewer file-viewer">
      <div className="file-icon-wrapper">
        {renderIcon()}
      </div>
      <div className="file-details">
        <span className="file-name">{name}</span>
        <span className="file-size">{formatFileSize(size)}</span>
      </div>
      <a 
        href={url} 
        download={name}
        className="file-download-btn"
        title="Download"
      >
        <ArrowDownTrayIcon size={18} />
      </a>
    </div>
  )
}

export default FileAttachment
