import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Mic, MicOff, Headphones, VolumeX, PhoneOff, Settings, Volume2, Video, VideoOff, Monitor, MonitorOff, GripVertical } from 'lucide-react'
import { useVoice } from '../contexts/VoiceContext'
import { useAuth } from '../contexts/AuthContext'
import Avatar from './Avatar'
import '../assets/styles/VoiceChannel.css'

const VoiceChannelUI = ({ channel, viewMode = 'full', onLeave, onOpenSettings, onShowConnectionInfo }) => {
  const {
    isConnected,
    connectionState,
    participants,
    isMuted,
    isDeafened,
    isVideoOn,
    isScreenSharing,
    peerStates,
    localStream,
    localVideoStream,
    screenStream,
    toggleMute,
    toggleDeafen,
    toggleVideo,
    toggleScreenShare,
    leaveChannel,
    analyserRef,
  } = useVoice()
  
  const { user } = useAuth()
  const [speaking, setSpeaking] = useState({})
  const [participantMenu, setParticipantMenu] = useState(null)
  const [pinnedParticipant, setPinnedParticipant] = useState(null)
  
  // Draggable mini view state
  const [miniPosition, setMiniPosition] = useState(() => {
    const saved = localStorage.getItem('voltchat_mini_voice_position')
    if (saved) {
      try { return JSON.parse(saved) } catch { return null }
    }
    return null // null means use CSS default (bottom right)
  })
  const [isDragging, setIsDragging] = useState(false)
  const miniRef = useRef(null)
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 })
  
  // Save position to localStorage
  useEffect(() => {
    if (miniPosition) {
      localStorage.setItem('voltchat_mini_voice_position', JSON.stringify(miniPosition))
    }
  }, [miniPosition])
  
  // Drag handlers
  const handleDragStart = useCallback((e) => {
    if (e.target.closest('.voice-mini-btn')) return // Don't drag when clicking buttons
    
    setIsDragging(true)
    const clientX = e.clientX || e.touches?.[0]?.clientX || 0
    const clientY = e.clientY || e.touches?.[0]?.clientY || 0
    
    dragStartRef.current = {
      x: clientX,
      y: clientY,
      posX: miniPosition?.x ?? 0,
      posY: miniPosition?.y ?? 0
    }
    
    e.preventDefault()
  }, [miniPosition])
  
  const handleDragMove = useCallback((e) => {
    if (!isDragging) return
    
    const clientX = e.clientX || e.touches?.[0]?.clientX || 0
    const clientY = e.clientY || e.touches?.[0]?.clientY || 0
    
    const deltaX = clientX - dragStartRef.current.x
    const deltaY = clientY - dragStartRef.current.y
    
    const newX = dragStartRef.current.posX + deltaX
    const newY = dragStartRef.current.posY + deltaY
    
    // Get mini element dimensions for boundary checking
    const rect = miniRef.current?.getBoundingClientRect()
    const width = rect?.width || 280
    const height = rect?.height || 100
    
    // Constrain to viewport
    const constrainedX = Math.max(0, Math.min(newX, window.innerWidth - width))
    const constrainedY = Math.max(0, Math.min(newY, window.innerHeight - height))
    
    setMiniPosition({ x: constrainedX, y: constrainedY })
  }, [isDragging])
  
  const handleDragEnd = useCallback(() => {
    setIsDragging(false)
  }, [])
  
  // Global mouse/touch events for dragging
  useEffect(() => {
    if (!isDragging) return
    
    const handleMove = (e) => handleDragMove(e)
    const handleEnd = () => handleDragEnd()
    
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleEnd)
    window.addEventListener('touchmove', handleMove, { passive: false })
    window.addEventListener('touchend', handleEnd)
    
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleEnd)
      window.removeEventListener('touchmove', handleMove)
      window.removeEventListener('touchend', handleEnd)
    }
  }, [isDragging, handleDragMove, handleDragEnd])
  
  // Speaking detection
  useEffect(() => {
    const analyser = analyserRef?.current
    if (!analyser) return
    
    const audioAnalyser = analyser.analyser
    const dataArray = new Uint8Array(audioAnalyser.frequencyBinCount)
    
    const checkSpeaking = () => {
      if (!isConnected) return
      
      audioAnalyser.getByteFrequencyData(dataArray)
      
      let sum = 0
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i]
      }
      const average = sum / dataArray.length
      const isSpeaking = average > 20 && !isMuted
      
      if (user?.id) {
        setSpeaking(prev => ({ ...prev, [user.id]: isSpeaking }))
      }
    }
    
    const speakingInterval = setInterval(checkSpeaking, 100)
    checkSpeaking()
    
    return () => clearInterval(speakingInterval)
  }, [isConnected, isMuted, user?.id, analyserRef])
  
  const handleLeave = () => {
    leaveChannel()
    onLeave?.()
  }
  
  // Build display participants
  const displayParticipants = participants.length > 0 ? participants : []
  
  const getScreenShareStream = (participant) => {
    if (participant.id === user?.id && isScreenSharing) return screenStream
    return participant.isScreenSharing ? participant.videoStream : null
  }
  
  const getCameraStream = (participant) => {
    if (participant.id === user?.id && isVideoOn) return localVideoStream
    return participant.hasVideo && !participant.isScreenSharing ? participant.videoStream : null
  }
  
  const hasAnyVideo = displayParticipants.some(p => {
    if (p.id === user?.id) return isVideoOn || isScreenSharing
    return !!p.videoStream
  })
  
  const hasScreenShare = displayParticipants.some(p => getScreenShareStream(p))
  
  const mainVideoParticipant = pinnedParticipant || displayParticipants.find(p => {
    if (p.id === user?.id) return isScreenSharing
    return p.isScreenSharing
  }) || displayParticipants.find(p => {
    if (p.id === user?.id) return isVideoOn
    return p.hasVideo
  })
  
  const mainVideoStream = mainVideoParticipant ? (
    mainVideoParticipant.id === user?.id
      ? (isScreenSharing ? screenStream : localVideoStream)
      : mainVideoParticipant.isScreenSharing
        ? mainVideoParticipant.videoStream
        : mainVideoParticipant.videoStream
  ) : null
  
  const mainVideoType = mainVideoParticipant ? (
    mainVideoParticipant.id === user?.id
      ? (isScreenSharing ? 'screen' : 'camera')
      : mainVideoParticipant.isScreenSharing
        ? 'screen'
        : 'camera'
  ) : null
  
  // Get connection status
  const getConnectionStatus = () => {
    if (!isConnected) return { text: 'Not Connected', color: 'var(--volt-text-muted)', class: 'disconnected' }
    switch (connectionState) {
      case 'connecting':
        return { text: 'Connecting...', color: '#f59e0b', class: 'connecting' }
      case 'connected':
        return { text: 'Voice Connected', color: '#22c55e', class: 'connected' }
      case 'error':
        return { text: 'Connection Error', color: '#ef4444', class: 'error' }
      default:
        return { text: 'Disconnected', color: 'var(--volt-text-muted)', class: 'disconnected' }
    }
  }
  
  const connectionStatus = getConnectionStatus()
  
  if (viewMode === 'mini') {
    const isConnecting = connectionState === 'connecting' || !isConnected
    
    return (
      <div 
        ref={miniRef}
        className={`voice-channel-mini ${isDragging ? 'dragging' : ''} ${isConnecting ? 'connecting' : ''}`}
        style={miniPosition ? { 
          left: miniPosition.x, 
          top: miniPosition.y, 
          right: 'auto', 
          bottom: 'auto' 
        } : undefined}
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
      >
        {/* Drag handle */}
        <div className="voice-mini-drag-handle" />
        
        {/* Connecting overlay */}
        {isConnecting && (
          <div className="voice-mini-connecting-overlay">
            <div className="voice-mini-connecting-spinner" />
            <span className="voice-mini-connecting-text">Connecting...</span>
          </div>
        )}
        
        <div className="voice-mini-header">
          <span className="voice-mini-channel">{channel?.name}</span>
          <span className={`voice-mini-status ${connectionStatus.class}`}>
            {displayParticipants.length} participants
          </span>
        </div>
        <div className="voice-mini-controls">
          <button 
            className={`voice-mini-btn ${isMuted ? 'active' : ''}`}
            onClick={toggleMute}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
          <button 
            className={`voice-mini-btn ${isDeafened ? 'active danger' : ''}`}
            onClick={toggleDeafen}
            title={isDeafened ? 'Undeafen' : 'Deafen'}
          >
            {isDeafened ? <VolumeX size={16} /> : <Headphones size={16} />}
          </button>
          <button 
            className={`voice-mini-btn ${isVideoOn ? 'active' : ''}`}
            onClick={toggleVideo}
            title={isVideoOn ? 'Stop Video' : 'Start Video'}
          >
            {isVideoOn ? <VideoOff size={16} /> : <Video size={16} />}
          </button>
          <button 
            className={`voice-mini-btn ${isScreenSharing ? 'active' : ''}`}
            onClick={toggleScreenShare}
            title={isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
          >
            {isScreenSharing ? <MonitorOff size={16} /> : <Monitor size={16} />}
          </button>
          <button 
            className="voice-mini-btn danger"
            onClick={handleLeave}
            title="Leave"
          >
            <PhoneOff size={16} />
          </button>
        </div>
      </div>
    )
  }
  
  // Full view
  return (
    <div className="voice-channel-view">
      <div className="voice-header">
        <Volume2 size={24} />
        <span className="voice-channel-name">{channel?.name || 'Voice Channel'}</span>
        <span
          className={`connection-status ${connectionStatus.class} clickable`}
          onClick={() => onShowConnectionInfo?.()}
          title="Click for connection details"
          style={{ cursor: 'pointer' }}
        >
          {connectionStatus.text}
        </span>
      </div>

      <div className={`voice-main-area ${hasAnyVideo ? 'has-video' : ''}`}>
        {hasAnyVideo && mainVideoStream && mainVideoParticipant ? (
          <div 
            className="voice-main-video"
            onClick={() => setPinnedParticipant(pinnedParticipant ? null : mainVideoParticipant)}
          >
            <video
              autoPlay
              playsInline
              className="main-video-element"
              muted={mainVideoParticipant.id !== user?.id}
              ref={el => { if (el && mainVideoStream) el.srcObject = mainVideoStream }}
            />
            <div className="main-video-overlay">
              <span className="main-video-name">
                {mainVideoParticipant.id === user?.id ? 'You' : mainVideoParticipant.username}
                {mainVideoType === 'screen' && ' · Screen'}
              </span>
              {pinnedParticipant && (
                <span className="pinned-badge">Pinned</span>
              )}
            </div>
            {hasScreenShare && mainVideoType !== 'screen' && (
              <div className="screen-share-notice">
                <Monitor size={14} />
                <span>Someone is sharing their screen</span>
              </div>
            )}
          </div>
        ) : (
          <div className="voice-participants-grid" data-count={displayParticipants.length}>
            {displayParticipants.map(participant => {
              const isSelf = participant.id === user?.id
              const isMutedParticipant = participant.muted || (isSelf && isMuted)
              const isSpeaking = !!speaking[participant.id]
              
              const participantCameraStream = getCameraStream(participant)
              const participantScreenStream = getScreenShareStream(participant)
              const participantHasVideo = !!participantCameraStream || !!participantScreenStream
              
              return (
                <div
                  key={participant.id}
                  className={`participant-grid-tile ${isSpeaking ? 'speaking' : ''} ${isMutedParticipant ? 'muted' : ''} ${participantHasVideo ? 'has-video' : ''}`}
                >
                  {participantHasVideo ? (
                    <video
                      autoPlay
                      playsInline
                      muted={isSelf}
                      className="participant-grid-video"
                      ref={el => { 
                        if (el) {
                          if (participantScreenStream) el.srcObject = participantScreenStream
                          else if (participantCameraStream) el.srcObject = participantCameraStream
                        }
                      }}
                    />
                  ) : (
                    <div className="participant-grid-avatar">
                      <Avatar
                        src={participant.avatar}
                        fallback={participant.username}
                        size={64}
                      />
                      {isMutedParticipant && (
                        <div className="participant-grid-muted-icon">
                          <MicOff size={14} />
                        </div>
                      )}
                    </div>
                  )}
                  <div className="participant-grid-name">
                    {participant.username}
                    {isSelf && ' (You)'}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="voice-participants-strip">
        <div className="participants-scrollable">
          {displayParticipants.map(participant => {
            const isSelf = participant.id === user?.id
            const isMutedParticipant = participant.muted || (isSelf && isMuted)
            const isDeafenedParticipant = participant.deafened || (isSelf && isDeafened)
            const isSpeaking = !!speaking[participant.id]

            const participantCameraStream = getCameraStream(participant)
            const participantScreenStream = getScreenShareStream(participant)
            const participantHasVideo = !!participantCameraStream || !!participantScreenStream
            const isPinned = pinnedParticipant?.id === participant.id
            const isMain = mainVideoParticipant?.id === participant.id

            const peerState = isSelf ? 'connected' : (peerStates[participant.id] ?? 'connecting')

            return (
              <div
                key={participant.id}
                className={[
                  'participant-tile',
                  isSelf ? 'self' : '',
                  isMutedParticipant ? 'muted' : '',
                  isSpeaking ? 'speaking' : '',
                  participantHasVideo ? 'has-video' : '',
                  isPinned ? 'pinned' : '',
                  isMain ? 'main' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => setPinnedParticipant(isPinned ? null : participant)}
                onContextMenu={!isSelf ? (e) => {
                  e.preventDefault()
                  setParticipantMenu({ userId: participant.id, username: participant.username, x: e.clientX, y: e.clientY })
                } : undefined}
              >
                {participantHasVideo ? (
                  <div className="tile-video-container">
                    <video
                      autoPlay
                      playsInline
                      className="tile-video"
                      muted={isSelf}
                      ref={el => {
                        if (el) {
                          if (participantScreenStream) {
                            el.srcObject = participantScreenStream
                          } else if (participantCameraStream) {
                            el.srcObject = participantCameraStream
                          }
                        }
                      }}
                    />
                    <div className="tile-name-overlay">
                      {participant.username}
                      {participantScreenStream ? ' · Screen' : ''}
                    </div>
                  </div>
                ) : (
                  <div className="tile-avatar-container">
                    <Avatar
                      src={participant.avatar}
                      alt={participant.username}
                      fallback={participant.username}
                      size={48}
                      className="tile-avatar"
                    />
                    {isMutedParticipant && <div className="tile-mute-icon"><MicOff size={14} /></div>}
                    {isDeafenedParticipant && <div className="tile-deafen-icon"><VolumeX size={14} /></div>}
                    {!isSelf && peerState !== 'connected' && (
                      <div className={`tile-peer-badge peer-state-${peerState}`}>
                        {peerState === 'connecting' ? '⟳' : peerState === 'failed' ? '✕' : '!'}
                      </div>
                    )}
                  </div>
                )}
                <span className="tile-name">
                  {participant.username}
                  {isSelf && ' (You)'}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="voice-controls">
        <button 
          className={`voice-control-btn ${isMuted ? 'active' : ''}`}
          onClick={toggleMute}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
        </button>
        
        <button 
          className={`voice-control-btn ${isDeafened ? 'active' : ''}`}
          onClick={toggleDeafen}
          title={isDeafened ? 'Undeafen' : 'Deafen'}
        >
          {isDeafened ? <VolumeX size={24} /> : <Headphones size={24} />}
        </button>

        <button 
          className={`voice-control-btn ${isVideoOn ? 'active-video' : ''}`}
          onClick={toggleVideo}
          title={isVideoOn ? 'Turn Off Camera' : 'Turn On Camera'}
        >
          {isVideoOn ? <Video size={24} /> : <VideoOff size={24} />}
        </button>

        <button 
          className={`voice-control-btn ${isScreenSharing ? 'active-screen' : ''}`}
          onClick={toggleScreenShare}
          title={isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
        >
          {isScreenSharing ? <Monitor size={24} /> : <MonitorOff size={24} />}
        </button>

        <button 
          className="voice-control-btn leave"
          onClick={handleLeave}
          title="Leave Voice Channel"
        >
          <PhoneOff size={24} />
        </button>

        <button 
          className="voice-control-btn settings"
          title="Voice Settings"
          onClick={onOpenSettings}
        >
          <Settings size={24} />
        </button>
      </div>

      {/* Participant right-click context menu */}
      {participantMenu && (() => {
        const menuW = 220, menuH = 160
        const x = Math.min(participantMenu.x, window.innerWidth  - menuW - 8)
        const y = Math.min(participantMenu.y, window.innerHeight - menuH - 8)
        return (
          <>
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
              onClick={(e) => {
                e.stopPropagation()
                setParticipantMenu(null)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                setParticipantMenu(null)
              }}
            />
            <div
              className="voice-participant-menu"
              style={{ position: 'fixed', left: x, top: y, zIndex: 9999 }}
              onClick={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.preventDefault()}
            >
              <div className="vpm-header">{participantMenu.username}</div>
              <button className="vpm-item">
                <Volume2 size={14} />
                Mute for me
              </button>
            </div>
          </>
        )
      })()}
    </div>
  )
}

export default VoiceChannelUI
