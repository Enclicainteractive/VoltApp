import React, { useState, useEffect, useRef } from 'react'
import { FileText, Download, Eye, EyeOff, Code, Music, Film, Image, Play, Pause, Volume2, VolumeX, Maximize, SkipBack, SkipForward } from 'lucide-react'
import '../assets/styles/FileAttachment.css'

// Custom Audio Player Component
const CustomAudioPlayer = ({ src, name, size, formatFileSize }) => {
  const audioRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [showVolumeSlider, setShowVolumeSlider] = useState(false)
  
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    
    const handleLoadedMetadata = () => setDuration(audio.duration)
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime)
    const handleEnded = () => setIsPlaying(false)
    
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('ended', handleEnded)
    
    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('ended', handleEnded)
    }
  }, [src])
  
  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
      } else {
        audioRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
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
      setVolume(vol)
      setIsMuted(vol === 0)
    }
  }
  
  const toggleMute = () => {
    if (audioRef.current) {
      if (isMuted) {
        audioRef.current.volume = volume || 1
        setIsMuted(false)
      } else {
        audioRef.current.volume = 0
        setIsMuted(true)
      }
    }
  }
  
  const formatTime = (time) => {
    if (isNaN(time)) return '0:00'
    const mins = Math.floor(time / 60)
    const secs = Math.floor(time % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }
  
  return (
    <div className="custom-audio-player">
      <audio ref={audioRef} src={src} preload="metadata" />
      
      <div className="audio-visualizer">
        <div className="audio-wave">
          {[...Array(20)].map((_, i) => (
            <div 
              key={i} 
              className={`wave-bar ${isPlaying ? 'playing' : ''}`}
              style={{ 
                height: isPlaying ? `${Math.random() * 100}%` : '20%',
                animationDelay: `${i * 0.05}s`
              }}
            />
          ))}
        </div>
      </div>
      
      <div className="audio-controls">
        <button className="control-btn play-btn" onClick={togglePlay}>
          {isPlaying ? <Pause size={20} /> : <Play size={20} />}
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
          />
          <span className="time-display">{formatTime(duration)}</span>
        </div>
        
        <div className="volume-container">
          <button 
            className="control-btn volume-btn"
            onClick={toggleMute}
            onMouseEnter={() => setShowVolumeSlider(true)}
          >
            {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
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
              />
            </div>
          )}
        </div>
      </div>
      
      <div className="audio-meta">
        <Music size={20} className="audio-icon" />
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
  const controlsTimeoutRef = useRef(null)
  
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    
    const handleLoadedMetadata = () => setDuration(video.duration)
    const handleTimeUpdate = () => setCurrentTime(video.currentTime)
    const handleEnded = () => setIsPlaying(false)
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    
    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('ended', handleEnded)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    
    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('ended', handleEnded)
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
      setIsPlaying(!isPlaying)
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
  
  return (
    <div 
      ref={containerRef}
      className={`custom-video-player ${isFullscreen ? 'fullscreen' : ''}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
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
            <Play size={48} />
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
          />
        </div>
        
        <div className="video-controls-row">
          <div className="video-controls-left">
            <button className="control-btn" onClick={togglePlay}>
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>
            
            <div className="volume-container">
              <button className="control-btn" onClick={toggleMute}>
                {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <input
                type="range"
                className="volume-slider"
                min={0}
                max={1}
                step={0.1}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
              />
            </div>
            
            <span className="video-time">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
          
          <div className="video-controls-right">
            <span className="video-name">{name}</span>
            <button className="control-btn" onClick={toggleFullscreen}>
              <Maximize size={18} />
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

const FileAttachment = ({ attachment }) => {
  const { url, name, size, type: attachmentType, filename } = attachment
  const [fileType, setFileType] = useState(attachmentType || 'file')
  const [content, setContent] = useState(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  
  useEffect(() => {
    // Determine file type from extension if not provided
    if (!attachmentType || attachmentType === 'file') {
      setFileType(getFileType(name))
    }
  }, [name, attachmentType])
  
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
    // Handle if size is already formatted (string)
    if (typeof size === 'string') return size
    
    // Handle numeric bytes
    if (!size || isNaN(size)) return ''
    const bytes = parseInt(size)
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }
  
  const renderIcon = () => {
    switch (fileType) {
      case 'image': return <Image size={20} />
      case 'video': return <Film size={20} />
      case 'audio': return <Music size={20} />
      case 'code': return <Code size={20} />
      default: return <FileText size={20} />
    }
  }
  
  // Image rendering
  if (fileType === 'image') {
    const handleZoomIn = () => {
      const newZoom = Math.min(zoomLevel + 0.25, 3)
      setZoomLevel(newZoom)
    }
    const handleZoomOut = () => {
      const newZoom = Math.max(zoomLevel - 0.25, 0.5)
      setZoomLevel(newZoom)
      if (newZoom === 1) setPosition({ x: 0, y: 0 })
    }
    const handleResetZoom = () => {
      setZoomLevel(1)
      setPosition({ x: 0, y: 0 })
    }
    
    const handleMouseDown = (e) => {
      e.preventDefault()
      if (zoomLevel > 1) {
        setIsDragging(true)
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
      }
    }
    
    const handleMouseMove = (e) => {
      if (isDragging && zoomLevel > 1) {
        e.preventDefault()
        setPosition({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y
        })
      }
    }
    
    const handleMouseUp = () => setIsDragging(false)
    
    // Prevent default drag behavior on the image
    const handleDragStart = (e) => {
      e.preventDefault()
      return false
    }
    
    return (
      <>
        <div className="attachment-viewer image-viewer">
          <div 
            className="image-link"
            onClick={() => setLightboxOpen(true)}
            style={{ cursor: 'zoom-in' }}
          >
            <img src={url} alt={name} className="attachment-image" />
          </div>
          <div className="attachment-info">
            <span className="attachment-name">{name}</span>
            <span className="attachment-size">{formatFileSize(size)}</span>
          </div>
        </div>
        
        {/* Lightbox */}
        {lightboxOpen && (
          <div 
            className="image-lightbox"
            onClick={() => setLightboxOpen(false)}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
              <div 
                className="lightbox-image-container"
                style={{
                  transform: `scale(${zoomLevel}) translate(${position.x}px, ${position.y}px)`,
                  cursor: zoomLevel > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-out'
                }}
                onMouseDown={handleMouseDown}
                onClick={(e) => {
                  if (zoomLevel === 1) setLightboxOpen(false)
                }}
              >
                <img 
                  src={url} 
                  alt={name} 
                  className="lightbox-image"
                  draggable="false"
                  onDragStart={handleDragStart}
                />
              </div>
              
              {/* Zoom Controls */}
              <div className="lightbox-zoom-controls">
                <button 
                  className="zoom-btn"
                  onClick={(e) => { e.stopPropagation(); handleZoomOut(); }}
                  disabled={zoomLevel <= 0.5}
                  aria-label="Zoom out"
                >
                  −
                </button>
                <span className="zoom-level">{Math.round(zoomLevel * 100)}%</span>
                <button 
                  className="zoom-btn"
                  onClick={(e) => { e.stopPropagation(); handleZoomIn(); }}
                  disabled={zoomLevel >= 3}
                  aria-label="Zoom in"
                >
                  +
                </button>
                <button 
                  className="zoom-btn reset"
                  onClick={(e) => { e.stopPropagation(); handleResetZoom(); }}
                  aria-label="Reset zoom"
                >
                  ⟲
                </button>
              </div>
              
              <button 
                className="lightbox-close"
                onClick={(e) => { e.stopPropagation(); setLightboxOpen(false); }}
                aria-label="Close"
              >
                ×
              </button>
              
              <div className="lightbox-info">
                <span className="lightbox-name">{name}</span>
                <span className="lightbox-size">{formatFileSize(size)}</span>
              </div>
            </div>
          </div>
        )}
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
            <Code size={18} />
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
                <Eye size={16} />
                Preview
              </button>
            ) : (
              <button 
                className="code-action-btn"
                onClick={() => setIsExpanded(false)}
              >
                <EyeOff size={16} />
                Hide
              </button>
            )}
            <a 
              href={url} 
              download={name}
              className="code-action-btn"
              title="Download"
            >
              <Download size={16} />
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
            <FileText size={40} />
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
        <Download size={18} />
      </a>
    </div>
  )
}

export default FileAttachment
