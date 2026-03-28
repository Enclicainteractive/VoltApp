import React, { useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  MicrophoneIcon, SpeakerXMarkIcon, SpeakerWaveIcon, PhoneXMarkIcon,
  ChatBubbleLeftRightIcon, XMarkIcon, ChevronDownIcon, ChevronUpIcon,
  VideoCameraIcon, VideoCameraSlashIcon
} from '@heroicons/react/24/outline'
import { useVoice } from '../contexts/VoiceContext'
import { useAuth } from '../contexts/AuthContext'
import Avatar from './Avatar'
import '../assets/styles/VoiceOverlay.css'

/**
 * VoiceOverlay — a small floating overlay that lets users read/send messages
 * while staying connected to a voice channel. Draggable, collapsible.
 */
const VoiceOverlay = ({ channel, messages = [], onSendMessage, onLeave, onExpand }) => {
  const { isMuted, isDeafened, isVideoOn, toggleMute, toggleDeafen, toggleVideo, participants } = useVoice()
  const { user } = useAuth()

  const [collapsed, setCollapsed] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [position, setPosition] = useState(() => {
    try {
      const saved = localStorage.getItem('voltchat_voice_overlay_pos')
      return saved ? JSON.parse(saved) : { x: 16, y: 80 }
    } catch { return { x: 16, y: 80 } }
  })
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 })
  const overlayRef = useRef(null)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  // Persist position
  useEffect(() => {
    localStorage.setItem('voltchat_voice_overlay_pos', JSON.stringify(position))
  }, [position])

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleDragStart = useCallback((e) => {
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('.overlay-messages')) return
    e.preventDefault()
    setIsDragging(true)
    const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0
    const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0
    dragStartRef.current = { x: clientX, y: clientY, posX: position.x, posY: position.y }
  }, [position])

  const handleDragMove = useCallback((e) => {
    if (!isDragging) return
    e.preventDefault()
    const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0
    const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0
    const dx = clientX - dragStartRef.current.x
    const dy = clientY - dragStartRef.current.y
    const rect = overlayRef.current?.getBoundingClientRect()
    const w = rect?.width ?? 300
    const h = rect?.height ?? 200
    setPosition({
      x: Math.max(0, Math.min(dragStartRef.current.posX + dx, window.innerWidth - w)),
      y: Math.max(0, Math.min(dragStartRef.current.posY + dy, window.innerHeight - h))
    })
  }, [isDragging])

  const handleDragEnd = useCallback(() => setIsDragging(false), [])

  useEffect(() => {
    if (!isDragging) return
    window.addEventListener('mousemove', handleDragMove)
    window.addEventListener('mouseup', handleDragEnd)
    window.addEventListener('touchmove', handleDragMove, { passive: false })
    window.addEventListener('touchend', handleDragEnd)
    return () => {
      window.removeEventListener('mousemove', handleDragMove)
      window.removeEventListener('mouseup', handleDragEnd)
      window.removeEventListener('touchmove', handleDragMove)
      window.removeEventListener('touchend', handleDragEnd)
    }
  }, [isDragging, handleDragMove, handleDragEnd])

  const handleSend = useCallback(() => {
    const text = inputValue.trim()
    if (!text) return
    onSendMessage?.(text)
    setInputValue('')
    inputRef.current?.focus()
  }, [inputValue, onSendMessage])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const recentMessages = messages.slice(-20)

  const overlay = (
    <div
      ref={overlayRef}
      className={`voice-overlay ${collapsed ? 'collapsed' : ''} ${isDragging ? 'dragging' : ''}`}
      style={{ left: position.x, top: position.y }}
      onMouseDown={handleDragStart}
      onTouchStart={handleDragStart}
    >
      {/* Header */}
      <div className="voice-overlay-header">
        <div className="voice-overlay-channel">
          <span className="voice-overlay-dot" />
          <span className="voice-overlay-name">{channel?.name ?? 'Voice'}</span>
          <span className="voice-overlay-count">{participants.length}</span>
        </div>
        <div className="voice-overlay-header-actions">
          <button
            className="voice-overlay-icon-btn"
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <ChevronDownIcon size={14} /> : <ChevronUpIcon size={14} />}
          </button>
          {onExpand && (
            <button
              className="voice-overlay-icon-btn"
              onClick={onExpand}
              title="Open full voice view"
            >
              <ChatBubbleLeftRightIcon size={14} />
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Participants strip */}
          <div className="voice-overlay-participants">
            {participants.slice(0, 6).map(p => (
              <div key={p.id} className="voice-overlay-participant" title={p.username}>
                <Avatar src={p.avatar} fallback={p.username} size={24} userId={p.id} />
                {p.muted && <span className="voice-overlay-muted-dot" />}
              </div>
            ))}
            {participants.length > 6 && (
              <span className="voice-overlay-more">+{participants.length - 6}</span>
            )}
          </div>

          {/* Messages */}
          <div className="overlay-messages">
            {recentMessages.length === 0 ? (
              <div className="overlay-messages-empty">No messages yet</div>
            ) : (
              recentMessages.map((msg, i) => (
                <div key={msg.id ?? i} className={`overlay-msg ${msg.userId === user?.id ? 'own' : ''}`}>
                  <span className="overlay-msg-author">{msg.username}</span>
                  <span className="overlay-msg-content">{msg.content}</span>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="overlay-input-row">
            <input
              ref={inputRef}
              className="overlay-input"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message..."
              maxLength={2000}
            />
            <button
              className="overlay-send-btn"
              onClick={handleSend}
              disabled={!inputValue.trim()}
              title="Send"
            >
              ↑
            </button>
          </div>

          {/* Voice controls */}
          <div className="voice-overlay-controls">
            <button
              className={`voice-overlay-ctrl-btn ${isMuted ? 'active danger' : ''}`}
              onClick={toggleMute}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              <MicrophoneIcon size={16} />
            </button>
            <button
              className={`voice-overlay-ctrl-btn ${isDeafened ? 'active danger' : ''}`}
              onClick={toggleDeafen}
              title={isDeafened ? 'Undeafen' : 'Deafen'}
            >
              {isDeafened ? <SpeakerXMarkIcon size={16} /> : <SpeakerWaveIcon size={16} />}
            </button>
            <button
              className={`voice-overlay-ctrl-btn ${isVideoOn ? 'active' : ''}`}
              onClick={toggleVideo}
              title={isVideoOn ? 'Stop Video' : 'Start Video'}
            >
              {isVideoOn ? <VideoCameraIcon size={16} /> : <VideoCameraSlashIcon size={16} />}
            </button>
            <button
              className="voice-overlay-ctrl-btn danger leave"
              onClick={onLeave}
              title="Leave Voice"
            >
              <PhoneXMarkIcon size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  )

  return createPortal(overlay, document.body)
}

export default VoiceOverlay
