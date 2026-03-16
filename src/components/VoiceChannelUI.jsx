import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { MicrophoneIcon, MusicalNoteIcon, SpeakerXMarkIcon, PhoneXMarkIcon, CogIcon, SpeakerWaveIcon, VideoCameraIcon, VideoCameraSlashIcon, ComputerDesktopIcon, ListBulletIcon, XMarkIcon, RocketLaunchIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline'
import { useVoice } from '../contexts/VoiceContext'
import { useAuth } from '../contexts/AuthContext'
import { useTranslation } from '../hooks/useTranslation'
import { useAppStore } from '../store/useAppStore'
import Avatar from './Avatar'
import ActivityPicker from './ActivityPicker'
import BuiltinActivityHost from '../activities/BuiltinActivityHost'
import { CLIENT_BUILTIN_BY_ID } from '../activities/builtin/definitions'
import { DefaultActivityIcon, getActivityIcon } from '../activities/builtin/ActivityIcons'
import VoiceChannelTempChat from './VoiceChannelTempChat'
import { useVoiceTempChat } from '../hooks/useVoiceTempChat'
import '../assets/styles/VoiceChannel.css'
import '../activities/builtin/builtin-activities.css'

const VoiceChannelUI = ({ channel, viewMode = 'full', onLeave, onOpenSettings, onShowConnectionInfo, socket }) => {
  const { t } = useTranslation()
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
  const { activeActivities, focusedActivityId, setFocusedActivity, clearFocusedActivity, addActivity, removeActivity } = useAppStore()
  const [speaking, setSpeaking] = useState({})
  const [participantMenu, setParticipantMenu] = useState(null)
  const [pinnedParticipant, setPinnedParticipant] = useState(null)
  const [focusedBuiltinSession, setFocusedBuiltinSession] = useState(null)
  const [showActivityPicker, setShowActivityPicker] = useState(false)
  
  const tempChat = useVoiceTempChat(
    participants,
    isConnected,
    channel?.id
  )
  
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

  const contextType = 'voice'
  const contextId = channel?.id
  const FocusedActivityIcon = getActivityIcon(focusedBuiltinSession?.activityId?.replace('builtin:', ''))

  const activitiesForContext = useMemo(
    () => activeActivities.filter(a => a.contextType === contextType && a.contextId === contextId),
    [activeActivities, contextType, contextId]
  )

  const hasActiveActivities = activitiesForContext.length > 0
  const isActivityFocused = focusedActivityId && focusedBuiltinSession

  const handleActivityLaunch = (activityId) => {
    if (!socket || !contextId) return
    socket.emit('activity:create-session', {
      contextType,
      contextId,
      activityId,
      activityDefinition: CLIENT_BUILTIN_BY_ID[activityId] || null,
      p2p: { enabled: true, preferred: true },
      sound: { enabled: true, volume: 0.8 }
    })
    socket.emit('activity:get-sessions', { contextType, contextId })
  }

  const handleActivityClick = (activity) => {
    if (focusedActivityId === activity.sessionId) {
      clearFocusedActivity()
      setFocusedBuiltinSession(null)
    } else {
      if (socket) {
        socket.emit('activity:join-session', { sessionId: activity.sessionId })
      }
      setFocusedActivity(activity.sessionId)
      if (String(activity.activityId || '').startsWith('builtin:')) {
        setFocusedBuiltinSession({
          id: activity.sessionId,
          sessionId: activity.sessionId,
          activityId: activity.activityId,
          activityName: activity.activityName,
          ownerId: activity.ownerId || activity.hostId || null,
          hostId: activity.hostId || activity.ownerId || null,
          contextType: 'voice',
          contextId: channel?.id
        })
      }
    }
  }

  const handleActivityClose = (activity, e) => {
    e?.stopPropagation()
    if (socket) {
      socket.emit('activity:leave-session', { sessionId: activity.sessionId })
    }
    removeActivity(activity.sessionId)
    if (focusedActivityId === activity.sessionId) {
      clearFocusedActivity()
      setFocusedBuiltinSession(null)
    }
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
    if (!isConnected) return { text: t('chat.disconnected', 'Disconnected'), color: 'var(--volt-text-muted)', class: 'disconnected' }
    switch (connectionState) {
      case 'connecting':
        return { text: t('voice.connectingStatus', 'Connecting...'), color: 'var(--volt-warning)', class: 'connecting' }
      case 'connected':
        return { text: t('chat.voiceConnected', 'Voice Connected'), color: 'var(--volt-success)', class: 'connected' }
      case 'error':
        return { text: t('voice.connectionError', 'Connection Error'), color: 'var(--volt-danger)', class: 'error' }
      default:
        return { text: t('chat.disconnected', 'Disconnected'), color: 'var(--volt-text-muted)', class: 'disconnected' }
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
            <span className="voice-mini-connecting-text">{t('voice.connectingStatus', 'Connecting...')}</span>
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
            title={isMuted ? t('chat.unmute', 'Unmute') : t('chat.mute', 'Mute')}
          >
            {isMuted ? <MicrophoneIcon size={16} /> : <MicrophoneIcon size={16} />}
          </button>
          <button 
            className={`voice-mini-btn ${isDeafened ? 'active danger' : ''}`}
            onClick={toggleDeafen}
            title={isDeafened ? t('chat.undeafen', 'Undeafen') : t('chat.deafen', 'Deafen')}
          >
            {isDeafened ? <SpeakerXMarkIcon size={16} /> : <MusicalNoteIcon size={16} />}
          </button>
          <button 
            className={`voice-mini-btn ${isVideoOn ? 'active' : ''}`}
            onClick={toggleVideo}
            title={isVideoOn ? t('chat.disableVideo', 'Stop Video') : t('chat.enableVideo', 'Start Video')}
          >
            {isVideoOn ? <VideoCameraSlashIcon size={16} /> : <VideoCameraIcon size={16} />}
          </button>
          <button 
            className={`voice-mini-btn ${isScreenSharing ? 'active' : ''}`}
            onClick={toggleScreenShare}
            title={isScreenSharing ? t('chat.stopSharing', 'Stop Sharing') : t('chat.shareScreen', 'Share Screen')}
          >
            <ComputerDesktopIcon size={16} />
          </button>
          <button 
            className={`voice-mini-btn ${tempChat.isVisible ? 'active' : ''}`}
            onClick={tempChat.toggleVisibility}
            title={tempChat.isVisible ? 'Hide Voice Chat' : 'Show Voice Chat'}
          >
            <ChatBubbleLeftRightIcon size={16} />
            {tempChat.unreadCount > 0 && !tempChat.isVisible && (
              <span className="voice-chat-unread-badge" style={{ right: -2, top: -2, minWidth: 14, height: 14, fontSize: 9 }}>{tempChat.unreadCount > 9 ? '9+' : tempChat.unreadCount}</span>
            )}
          </button>
          <button 
            className="voice-mini-btn danger"
            onClick={handleLeave}
            title="Leave"
          >
            <PhoneXMarkIcon size={16} />
          </button>
        </div>
      </div>
    )
  }
  
  // Full view
  return (
    <div className="voice-channel-view">
      {showActivityPicker && (
        <ActivityPicker
          socket={socket}
          contextType="voice"
          contextId={channel?.id}
          participantsCount={displayParticipants.length}
          onClose={() => setShowActivityPicker(false)}
          onLaunch={handleActivityLaunch}
        />
      )}

      <div className="voice-header">
        <SpeakerWaveIcon size={24} />
        <span className="voice-channel-name">{channel?.name || t('chat.voiceChannel', 'Voice Channel')}</span>
        <span
          className={`connection-status ${connectionStatus.class} clickable`}
          onClick={() => onShowConnectionInfo?.()}
          title="Click for connection details"
          style={{ cursor: 'pointer' }}
        >
          {connectionStatus.text}
        </span>
      </div>

      {/* Wrapper for main content with optional chat sidebar */}
      <div className={`voice-main-content ${tempChat.isVisible ? 'has-chat' : ''}`}>
        {/* Voice temp chat - positioned as sibling to voice-main-area (side by side) */}
        {tempChat.isVisible && (
          <VoiceChannelTempChat
            messages={tempChat.messages}
            onSendMessage={tempChat.sendMessage}
            isVisible={tempChat.isVisible}
            onToggleVisibility={tempChat.toggleVisibility}
            notificationsEnabled={tempChat.notificationsEnabled}
            onToggleNotifications={() => tempChat.setNotificationsEnabled(prev => !prev)}
            unreadCount={tempChat.unreadCount}
            onMarkAsRead={tempChat.markAsRead}
            participants={participants}
          />
        )}
        
        <div className={`voice-main-area ${hasAnyVideo || isActivityFocused ? 'has-video' : ''}`}>
          {isActivityFocused && focusedBuiltinSession ? (
            <div className="voice-main-video activity-main-video">
              <BuiltinActivityHost
                session={focusedBuiltinSession}
                socket={socket}
                contextType="voice"
                contextId={channel?.id}
                embedded
                onClose={() => {
                  clearFocusedActivity()
                  setFocusedBuiltinSession(null)
                }}
              />
              <div className="main-video-overlay activity-overlay">
                <span className="main-video-name">
                  <span className="activity-badge-icon"><FocusedActivityIcon width={16} height={16} /></span>
                  {focusedBuiltinSession.activityName || 'Activity'}
                </span>
                <button 
                  className="activity-exit-btn"
                  onClick={() => {
                    clearFocusedActivity()
                    setFocusedBuiltinSession(null)
                  }}
                  title="Return to grid"
                >
                  Exit Activity
                </button>
              </div>
            </div>
          ) : hasAnyVideo && mainVideoStream && mainVideoParticipant ? (
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
                  {mainVideoParticipant.id === user?.id ? t('common.you', 'You') : mainVideoParticipant.username}
                  {mainVideoType === 'screen' && ' · Screen'}
                </span>
                {pinnedParticipant && (
                  <span className="pinned-badge">Pinned</span>
                )}
              </div>
              {hasScreenShare && mainVideoType !== 'screen' && (
                <div className="screen-share-notice">
                  <ComputerDesktopIcon size={14} />
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
                        size={40}
                        userId={participant.userId || participant.id}
                      />
                        {isMutedParticipant && (
                          <div className="participant-grid-muted-icon">
                            <MicrophoneIcon size={14} />
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

              {hasActiveActivities && activitiesForContext.map(activity => {
                const isFocused = focusedActivityId === activity.sessionId
                const activityKey = activity.activityId?.replace('builtin:', '')
                const ActivityIcon = getActivityIcon(activityKey) || DefaultActivityIcon
                
                return (
                  <div
                    key={activity.sessionId}
                    className={`participant-grid-tile activity-tile ${isFocused ? 'focused' : ''}`}
                    onClick={() => handleActivityClick(activity)}
                  >
                    <div className="activity-tile-content">
                      <div className="activity-tile-icon"><ActivityIcon width={18} height={18} /></div>
                      <div className="activity-tile-name">{activity.activityName || 'Activity'}</div>
                      <div className="activity-tile-status">
                        {isFocused ? 'Active' : 'Click to join'}
                      </div>
                    </div>
                    <button 
                      className="activity-tile-close"
                      onClick={(e) => handleActivityClose(activity, e)}
                      title="Leave activity"
                    >
                      <XMarkIcon size={12} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
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
                    {isMutedParticipant && <div className="tile-mute-icon"><MicrophoneIcon size={14} /></div>}
                    {isDeafenedParticipant && <div className="tile-deafen-icon"><SpeakerXMarkIcon size={14} /></div>}
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
          title={isMuted ? t('chat.unmute', 'Unmute') : t('chat.mute', 'Mute')}
        >
          {isMuted ? <MicrophoneIcon size={28} /> : <MicrophoneIcon size={28} />}
        </button>
        
        <button 
          className={`voice-control-btn ${isDeafened ? 'active' : ''}`}
          onClick={toggleDeafen}
          title={isDeafened ? t('chat.undeafen', 'Undeafen') : t('chat.deafen', 'Deafen')}
        >
          {isDeafened ? <SpeakerXMarkIcon size={28} /> : <MusicalNoteIcon size={28} />}
        </button>

        <button 
          className={`voice-control-btn ${isVideoOn ? 'active-video' : ''}`}
          onClick={toggleVideo}
          title={isVideoOn ? t('chat.disableVideo', 'Turn Off Camera') : t('chat.enableVideo', 'Turn On Camera')}
        >
          {isVideoOn ? <VideoCameraIcon size={28} /> : <VideoCameraSlashIcon size={28} />}
        </button>

        <button 
          className={`voice-control-btn ${isScreenSharing ? 'active-screen' : ''}`}
          onClick={toggleScreenShare}
          title={isScreenSharing ? t('chat.stopSharing', 'Stop Sharing') : t('chat.shareScreen', 'Share Screen')}
        >
          {isScreenSharing ? <ComputerDesktopIcon size={28} /> : <ComputerDesktopIcon size={28} />}
        </button>

        <button 
          className={`voice-control-btn activities-btn ${hasActiveActivities ? 'active' : ''}`}
          onClick={() => setShowActivityPicker(true)}
          title="Start Activity"
        >
          <RocketLaunchIcon size={28} />
        </button>

        <button 
          className={`voice-control-btn chat-btn ${tempChat.isVisible ? 'active' : ''}`}
          onClick={tempChat.toggleVisibility}
          title={tempChat.isVisible ? 'Hide Voice Chat' : 'Show Voice Chat'}
        >
          <ChatBubbleLeftRightIcon size={28} />
          {tempChat.unreadCount > 0 && !tempChat.isVisible && (
            <span className="voice-chat-unread-badge">{tempChat.unreadCount > 9 ? '9+' : tempChat.unreadCount}</span>
          )}
        </button>

        <button 
          className="voice-control-btn leave"
          onClick={handleLeave}
          title={t('misc.leaveVoiceChannel', 'Leave Voice Channel')}
        >
          <PhoneXMarkIcon size={28} />
        </button>

        <button 
          className="voice-control-btn settings"
          title={t('misc.voiceSettings', 'Voice Settings')}
          onClick={onOpenSettings}
        >
          <CogIcon size={28} />
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
                <SpeakerWaveIcon size={14} />
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
