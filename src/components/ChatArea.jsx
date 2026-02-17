import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Hash, Users, Pin, Search, Smile, X, FileText, Lock } from 'lucide-react'
import { useSocket } from '../contexts/SocketContext'
import { useAuth } from '../contexts/AuthContext'
import { useE2e } from '../contexts/E2eContext'
import { apiService } from '../services/apiService'
import { soundService } from '../services/soundService'
import MessageList from './MessageList'
import EmojiPicker from './EmojiPicker'
import ChatInput from './ChatInput'
import MarkdownMessage from './MarkdownMessage'
import '../assets/styles/ChatArea.css'
import '../assets/styles/ChatInput.css'

const ChatArea = ({ channelId, serverId, channels, messages, onMessageSent, onAgeGateTriggered, onLoadMoreMessages, onToggleMembers, onSaveScrollPosition, scrollPosition, onShowProfile }) => {
  const { socket, connected } = useSocket()
  const { user } = useAuth()
  const { 
    isEncryptionEnabled, 
    hasDecryptedKey,
    encryptMessageForServer,
    decryptMessageFromServer
  } = useE2e()
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [typingUsers, setTypingUsers] = useState(new Set())
  const [sendError, setSendError] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [serverEmojis, setServerEmojis] = useState([])
  const [attachments, setAttachments] = useState([])
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionSuggestions, setMentionSuggestions] = useState([])
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0)
  const [members, setMembers] = useState([])
  const [showSearchModal, setShowSearchModal] = useState(false)
  const [showPinnedModal, setShowPinnedModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [pinnedMessages, setPinnedMessages] = useState([])
  const [isLoadingPins, setIsLoadingPins] = useState(false)
  const [highlightMessageId, setHighlightMessageId] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const isSendingRef = useRef(false)
  const typingTimeoutRef = useRef(null)
  const emojiPickerRef = useRef(null)
  const emojiButtonRef = useRef(null)
  const mentionPanelRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const chatAreaRef = useRef(null)
  const currentChannel = channels?.find(c => c.id === channelId)

  // Load members for mention suggestions
  useEffect(() => {
    if (serverId) {
      apiService.getServerMembers(serverId)
        .then(res => {
          setMembers(res.data || [])
        })
        .catch(err => {
          console.error('[ChatArea] Failed to load members:', err)
          setMembers([])
        })
    } else {
      setMembers([])
    }
  }, [serverId])

  // Close emoji picker and mention panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      // Check emoji picker
      const isEmojiButton = emojiButtonRef.current && emojiButtonRef.current.contains(e.target)
      const isEmojiPicker = emojiPickerRef.current && emojiPickerRef.current.contains(e.target)
      
      if (showEmojiPicker && !isEmojiButton && !isEmojiPicker) {
        setShowEmojiPicker(false)
      }
      
      // Check mention panel
      const isMentionPanel = mentionPanelRef.current && mentionPanelRef.current.contains(e.target)
      const isInput = inputRef.current && inputRef.current.contains(e.target)
      
      if (showMentionSuggestions && !isMentionPanel && !isInput) {
        setShowMentionSuggestions(false)
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showEmojiPicker, showMentionSuggestions])

  // Handle Escape key to close panels
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowEmojiPicker(false)
        setShowMentionSuggestions(false)
      }
    }
    
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (channelId && socket) {
      console.log('[ChatArea] Joining channel:', channelId)
      socket.emit('channel:join', channelId)
    }
  }, [channelId, socket])

  useEffect(() => {
    const loadServerEmojis = async () => {
      if (serverId) {
        try {
          const res = await apiService.getServerEmojis(serverId)
          setServerEmojis(res.data || [])
        } catch (err) {
          console.error('Failed to load server emojis:', err)
          setServerEmojis([])
        }
      } else {
        setServerEmojis([])
      }
    }
    loadServerEmojis()
  }, [serverId])

  useEffect(() => {
    if (!socket || !connected) return

    const handleTyping = (data) => {
      if (data.channelId === channelId && data.userId !== user?.id) {
        setTypingUsers(prev => new Set([...prev, data.username]))
        setTimeout(() => {
          setTypingUsers(prev => {
            const newSet = new Set(prev)
            newSet.delete(data.username)
            return newSet
          })
        }, 3000)
      }
    }

    socket.on('user:typing', handleTyping)

    const handleMessageError = (payload) => {
      if (payload?.channelId === channelId) {
        if (payload.code === 'AGE_VERIFICATION_REQUIRED') {
          setSendError('Age verification is required before chatting in this channel.')
          onAgeGateTriggered?.()
        } else if (payload.code === 'SLOWMODE') {
          setSendError(payload.error || 'Slowmode is active. Please wait before sending another message.')
        }
      }
    }

    socket.on('message:error', handleMessageError)

    return () => {
      socket.off('user:typing', handleTyping)
      socket.off('message:error', handleMessageError)
    }
  }, [socket, connected, channelId, user, onAgeGateTriggered])

  useEffect(() => {
    setSendError('')
  }, [channelId])

  const handleSendMessage = async (e) => {
    if (e) {
      e.preventDefault()
      if (e.nativeEvent?.shiftKey) {
        return
      }
    }
    
    // Prevent double sends
    if (isSendingRef.current) return
    if ((!inputValue.trim() && attachments.length === 0) || !socket) return

    isSendingRef.current = true
    
    let messageContent = inputValue.trim()
    let encryptedData = null
    
    if (serverId && isEncryptionEnabled(serverId) && hasDecryptedKey(serverId)) {
      try {
        encryptedData = await encryptMessageForServer(messageContent, serverId)
        if (encryptedData.encrypted) {
          messageContent = JSON.stringify({
            _encrypted: true,
            iv: encryptedData.iv,
            content: encryptedData.content
          })
        }
      } catch (err) {
        console.error('[ChatArea] Encryption error:', err)
      }
    }
    
    const messageData = {
      channelId,
      content: messageContent,
      attachments: attachments.length > 0 ? attachments : undefined,
      encrypted: encryptedData?.encrypted || false,
      iv: encryptedData?.iv
    }

    console.log('[ChatArea] Sending message:', messageData)
    socket.emit('message:send', messageData)
    soundService.messageSent()
    setInputValue('')
    setAttachments([])
    setIsTyping(false)
    setShowMentionSuggestions(false)
    setShowEmojiPicker(false)
    
    // Reset sending flag after a short delay
    setTimeout(() => {
      isSendingRef.current = false
    }, 500)
  }

  const handleInputChange = (e) => {
    const value = e.target.value
    setInputValue(value)
    
    // Check for @ mentions
    const cursorPosition = e.target.selectionStart
    const textBeforeCursor = value.slice(0, cursorPosition)
    const mentionMatch = textBeforeCursor.match(/@([a-zA-Z0-9_]*)$/)
    
    if (mentionMatch) {
      const query = mentionMatch[1].toLowerCase()
      setMentionQuery(query)
      setShowMentionSuggestions(true)
      setSelectedMentionIndex(0)
      
      // Filter members based on query
      const suggestions = [
        { id: 'everyone', username: 'everyone', displayName: 'everyone', type: 'special', color: '#fbbf24' },
        { id: 'here', username: 'here', displayName: 'here', type: 'special', color: '#60a5fa' },
        ...members.filter(m => 
          m.username?.toLowerCase().includes(query) || 
          m.displayName?.toLowerCase().includes(query)
        ).slice(0, 8)
      ]
      setMentionSuggestions(suggestions)
    } else {
      setShowMentionSuggestions(false)
    }
    
    if (!isTyping && value.length > 0) {
      setIsTyping(true)
      socket?.emit('message:typing', { channelId })
    }

    clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false)
    }, 2000)
  }

  const handleMentionSelect = (mention) => {
    const cursorPosition = inputRef.current.selectionStart
    const textBeforeCursor = inputValue.slice(0, cursorPosition)
    const mentionMatch = textBeforeCursor.match(/@([a-zA-Z0-9_]*)$/)
    
    if (mentionMatch) {
      const mentionText = mention.type === 'special' ? `@${mention.username}` : `@${mention.username}`
      const newValue = textBeforeCursor.replace(/@([a-zA-Z0-9_]*)$/, mentionText + ' ') + 
                       inputValue.slice(cursorPosition)
      setInputValue(newValue)
      setShowMentionSuggestions(false)
      inputRef.current.focus()
    }
  }

  const handleKeyDown = (e) => {
    if (showMentionSuggestions) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedMentionIndex(prev => (prev + 1) % mentionSuggestions.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedMentionIndex(prev => (prev - 1 + mentionSuggestions.length) % mentionSuggestions.length)
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleMentionSelect(mentionSuggestions[selectedMentionIndex])
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setShowMentionSuggestions(false)
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleEmojiSelect = (emoji) => {
    if (typeof emoji === 'string') {
      setInputValue(prev => prev + emoji)
    } else if (emoji.type === 'gif') {
      setInputValue(prev => prev + `[GIF: ${emoji.url}]`)
    } else if (emoji.type === 'custom') {
      setInputValue(prev => prev + `:${emoji.name}:`)
    }
    inputRef.current?.focus()
  }

  const processFiles = async (files) => {
    if (files.length === 0) return
    
    const fileArray = Array.from(files)
    const validFiles = fileArray.filter(file => {
      if (!file.type && !file.name.match(/\.(jpg|jpeg|png|gif|webp|mp4|webm|mp3|wav|pdf|doc|docx|txt)$/i)) {
        console.warn('Invalid file type:', file)
        return false
      }
      return true
    })
    
    if (validFiles.length === 0) return

    try {
      const res = await apiService.uploadFiles(validFiles, serverId)
      setAttachments(prev => [...prev, ...res.data.attachments])
      soundService.success()
    } catch (err) {
      console.error('Upload failed:', err)
      setSendError('Failed to upload file(s)')
    }
  }

  const handleFileSelect = async (e) => {
    const files = e.target.files
    await processFiles(files)
    e.target.value = ''
  }

  const handlePlusClick = () => {
    fileInputRef.current?.click()
  }

  const handlePaste = useCallback(async (e) => {
    const items = e.clipboardData?.items
    if (!items) return
    
    const files = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) files.push(file)
      }
    }
    
    if (files.length > 0) {
      e.preventDefault()
      await processFiles(files)
    }
  }, [serverId])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    // Check if we're actually leaving the drop zone (not moving to a child element)
    // Use relatedTarget to check if we're moving outside the element
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDragging(false)
    }
  }, [])

  const handleDrop = useCallback(async (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    
    const files = e.dataTransfer?.files
    if (files && files.length > 0) {
      await processFiles(files)
    }
  }, [serverId])

  useEffect(() => {
    const input = inputRef.current
    if (input) {
      input.addEventListener('paste', handlePaste)
      return () => input.removeEventListener('paste', handlePaste)
    }
  }, [handlePaste])

  const removeAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  const toggleEmojiPicker = () => {
    setShowEmojiPicker(!showEmojiPicker)
  }

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!searchQuery.trim() || !channelId) return
    
    setIsSearching(true)
    setHighlightMessageId(null)
    try {
      const res = await apiService.searchMessages(channelId, searchQuery)
      setSearchResults(res.data || [])
    } catch (err) {
      console.error('Search failed:', err)
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }

  const handleSearchResultClick = (messageId) => {
    setHighlightMessageId(messageId)
    setShowSearchModal(false)
    setSearchQuery('')
    setSearchResults([])
  }

  const handleLoadPinned = async () => {
    if (!channelId) return
    
    setIsLoadingPins(true)
    try {
      const res = await apiService.getPinnedMessages(channelId)
      setPinnedMessages(res.data || [])
    } catch (err) {
      console.error('Failed to load pinned messages:', err)
      setPinnedMessages([])
    } finally {
      setIsLoadingPins(false)
    }
  }

  const handlePinMessage = async (messageId) => {
    if (!channelId) return
    try {
      await apiService.pinMessage(channelId, messageId)
      socket?.emit('message:pin', { messageId, channelId })
    } catch (err) {
      console.error('Failed to pin message:', err)
    }
  }

  const handleUnpinMessage = async (messageId) => {
    if (!channelId) return
    try {
      await apiService.unpinMessage(channelId, messageId)
      socket?.emit('message:unpin', { messageId, channelId })
      setPinnedMessages(prev => prev.filter(m => m.id !== messageId))
    } catch (err) {
      console.error('Failed to unpin message:', err)
    }
  }

  const handleLoadMoreMessages = async (beforeTimestamp) => {
    if (!channelId || !onLoadMoreMessages) return false
    
    try {
      const res = await apiService.getMessages(channelId, { limit: 50, before: beforeTimestamp })
      if (res.data && res.data.length > 0) {
        onLoadMoreMessages(res.data)
        return res.data.length >= 50
      }
      return false
    } catch (err) {
      console.error('Failed to load more messages:', err)
      return false
    }
  }

  return (
    <div 
      className={`chat-area ${isDragging ? 'dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="drop-overlay">
          <div className="drop-message">
            <FileText size={48} />
            <span>Drop files to upload</span>
          </div>
        </div>
      )}
      <div className="chat-header">
        <div className="channel-info">
          <Hash size={24} />
          <span className="channel-title">{currentChannel?.name || 'channel'}</span>
        </div>
        <div className="chat-actions">
          <button className="icon-btn" title="Show Members" onClick={onToggleMembers}>
            <Users size={20} />
          </button>
          <div className="divider-vertical"></div>
          <button className="icon-btn" title="Pinned Messages" onClick={() => { handleLoadPinned(); setShowPinnedModal(true) }}>
            <Pin size={20} />
          </button>
          <button className="icon-btn" title="Search" onClick={() => setShowSearchModal(true)}>
            <Search size={20} />
          </button>
        </div>
      </div>

      <MessageList 
        messages={messages || []} 
        currentUserId={user?.id} 
        channelId={channelId} 
        onLoadMore={handleLoadMoreMessages}
        onPinMessage={handlePinMessage}
        onUnpinMessage={handleUnpinMessage}
        highlightMessageId={highlightMessageId}
        onSaveScrollPosition={onSaveScrollPosition}
        scrollPosition={scrollPosition}
        onShowProfile={onShowProfile}
      />

      {typingUsers.size > 0 && (
        <div className="typing-indicator">
          <div className="typing-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <span className="typing-text">
            {Array.from(typingUsers).join(', ')} {typingUsers.size === 1 ? 'is' : 'are'} typing...
          </span>
        </div>
      )}

      {sendError && (
        <div className="age-warning-banner">
          {sendError}
        </div>
      )}

      <div className="message-input-container">
        {/* Attachment Preview */}
        {attachments.length > 0 && (
          <div className="attachment-preview-bar">
            {attachments.map((file, index) => (
              <div key={index} className="attachment-preview-item">
                <FileText size={16} />
                <span className="attachment-name">{file.name}</span>
                <button 
                  type="button" 
                  className="attachment-remove"
                  onClick={() => removeAttachment(index)}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="message-input-wrapper">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            multiple
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
          />
          
          <ChatInput
            value={inputValue}
            onChange={setInputValue}
            placeholder={`Message #${currentChannel?.name || 'channel'}`}
            onSubmit={handleSendMessage}
            onKeyDown={handleKeyDown}
            onAttachClick={handlePlusClick}
            onEmojiClick={toggleEmojiPicker}
          />
          
          {showEmojiPicker && (
            <div ref={emojiPickerRef} className="emoji-picker-popover">
              <EmojiPicker 
                onSelect={handleEmojiSelect} 
                onClose={() => setShowEmojiPicker(false)} 
                serverEmojis={serverEmojis}
              />
            </div>
          )}
        </div>
      </div>

      {showSearchModal && (
        <div className="modal-overlay" onClick={() => setShowSearchModal(false)}>
          <div className="modal-content search-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Search Messages</h3>
              <button className="modal-close" onClick={() => setShowSearchModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSearch} className="search-form">
              <input
                type="text"
                placeholder="Search messages..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                autoFocus
              />
              <button type="submit" disabled={isSearching}>
                <Search size={18} />
              </button>
            </form>
            <div className="search-results">
              {isSearching ? (
                <div className="search-loading">Searching...</div>
              ) : searchResults.length > 0 ? (
                searchResults.map(msg => (
                  <div 
                    key={msg.id} 
                    className="search-result-item"
                    onClick={() => handleSearchResultClick(msg.id)}
                  >
                    <div className="search-result-header">
                      <span className="search-result-author">{msg.username}</span>
                      <span className="search-result-time">
                        {new Date(msg.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div className="search-result-content">{msg.content}</div>
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="search-result-attachments">
                        📎 {msg.attachments.length} attachment(s)
                      </div>
                    )}
                  </div>
                ))
              ) : searchQuery && !isSearching ? (
                <div className="search-empty">No results found</div>
              ) : (
                <div className="search-empty">Enter a search term to find messages</div>
              )}
            </div>
          </div>
        </div>
      )}

      {showPinnedModal && (
        <div className="modal-overlay" onClick={() => setShowPinnedModal(false)}>
          <div className="modal-content pinned-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Pinned Messages</h3>
              <button className="modal-close" onClick={() => setShowPinnedModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="pinned-messages-list">
              {isLoadingPins ? (
                <div className="pinned-loading">Loading...</div>
              ) : pinnedMessages.length > 0 ? (
                pinnedMessages.map(msg => (
                  <div key={msg.id} className="pinned-message-item">
                    <div className="pinned-message-header">
                      <span className="pinned-message-author">{msg.username}</span>
                      <span className="pinned-message-time">
                        {new Date(msg.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div className="pinned-message-content">{msg.content}</div>
                    <button 
                      className="pinned-unpin-btn"
                      onClick={() => handleUnpinMessage(msg.id)}
                    >
                      Unpin
                    </button>
                  </div>
                ))
              ) : (
                <div className="pinned-empty">No pinned messages</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ChatArea
