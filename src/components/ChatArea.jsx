import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Hash, Users, Pin, Search, Smile, X, FileText, Lock, AtSign, Radio } from 'lucide-react'
import { useSocket } from '../contexts/SocketContext'
import { useAuth } from '../contexts/AuthContext'
import { useE2e } from '../contexts/E2eContext'
import { useE2eTrue } from '../contexts/E2eTrueContext'
import { apiService } from '../services/apiService'
import { soundService } from '../services/soundService'
import { getStoredServer } from '../services/serverConfig'
import { preloadHostMetadata } from '../services/hostMetadataService'
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
  const e2eTrue = useE2eTrue()
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [typingUsers, setTypingUsers] = useState(new Set())
  const [sendError, setSendError] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [serverEmojis, setServerEmojis] = useState([])
  const [attachments, setAttachments] = useState([])
  const [uploadProgress, setUploadProgress] = useState(null) // null = idle, 0-100 = uploading
  const [pendingPreviews, setPendingPreviews] = useState([]) // local file objects before upload completes
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
          const loaded = res.data || []
          setMembers(loaded)
          // Warm host metadata cache for any federated members
          const hosts = loaded.filter(m => !m.isBot && m.host).map(m => m.host)
          if (hosts.length > 0) preloadHostMetadata(hosts)
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
      
      // Check mention panel — inputRef is an imperative handle, use getEditor() for DOM node
      const isMentionPanel = mentionPanelRef.current && mentionPanelRef.current.contains(e.target)
      const editorNode = inputRef.current?.getEditor?.()
      const isInput = editorNode && editorNode.contains(e.target)
      
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
    
    // Try True E2EE first, then fall back to legacy
    if (serverId && e2eTrue) {
      try {
        const trueEncrypted = await e2eTrue.encryptMessage(messageContent, serverId)
        if (trueEncrypted.encrypted) {
          encryptedData = trueEncrypted
          messageContent = trueEncrypted.content
        }
      } catch (err) {
        console.error('[ChatArea] True E2EE encryption error:', err)
      }
    }
    
    if (!encryptedData?.encrypted && serverId && isEncryptionEnabled(serverId) && hasDecryptedKey(serverId)) {
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
        console.error('[ChatArea] Legacy encryption error:', err)
      }
    }
    
    const messageData = {
      channelId,
      content: messageContent,
      attachments: attachments.length > 0 ? attachments : undefined,
      encrypted: encryptedData?.encrypted || false,
      iv: encryptedData?.iv,
      epoch: encryptedData?.epoch || null
    }

    console.log('[ChatArea] Sending message:', messageData)
    socket.emit('message:send', messageData)
    soundService.messageSent()
    setInputValue('')
    setAttachments([])
    setPendingPreviews([])
    setIsTyping(false)
    setShowMentionSuggestions(false)
    setShowEmojiPicker(false)
    
    // Reset sending flag after a short delay
    setTimeout(() => {
      isSendingRef.current = false
    }, 500)
  }

  // Called by ChatInput with a plain string (the current innerText)
  const handleInputChange = (value) => {
    setInputValue(value)
    
    // Read cursor position from the actual contentEditable via the forwarded ref
    const caretPos = inputRef.current?.getCaretPosition?.() ?? value.length
    const textBeforeCursor = value.slice(0, caretPos)
    const mentionMatch = textBeforeCursor.match(/@([a-zA-Z0-9_]*)$/)
    
    if (mentionMatch) {
      const query = mentionMatch[1].toLowerCase()
      setMentionQuery(query)
      setShowMentionSuggestions(true)
      setSelectedMentionIndex(0)
      
      // Special mentions always shown, filter members by query
      const specials = [
        { id: 'everyone', username: 'everyone', displayName: '@everyone — notify all members', type: 'special', color: '#fbbf24' },
        { id: 'here', username: 'here', displayName: '@here — notify online members', type: 'special', color: '#60a5fa' },
      ].filter(s => !query || s.username.startsWith(query))

      const memberMatches = members.filter(m => 
        !query ||
        m.username?.toLowerCase().startsWith(query) || 
        m.displayName?.toLowerCase().startsWith(query) ||
        m.username?.toLowerCase().includes(query) || 
        m.displayName?.toLowerCase().includes(query)
      ).slice(0, 8)

      setMentionSuggestions([...specials, ...memberMatches])
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
    // Read current text directly from the DOM to avoid stale state when focused
    const editorEl = inputRef.current?.getEditor?.()
    const currentText = editorEl?.innerText ?? inputValue
    const caretPos = inputRef.current?.getCaretPosition?.() ?? currentText.length
    const textBeforeCursor = currentText.slice(0, caretPos)
    const mentionMatch = textBeforeCursor.match(/@([a-zA-Z0-9_]*)$/)

    if (mentionMatch) {
      // For special mentions (@everyone, @here) keep plain @username
      // For real users, store @username:host in the message content
      let storedMention
      if (mention.type === 'special') {
        storedMention = `@${mention.username}`
      } else {
        const currentServer = getStoredServer()
        const userHost = mention.host || currentServer?.host || 'local'
        storedMention = `@${mention.username}:${userHost}`
      }
      const insertText = `${storedMention} `
      const newBefore = textBeforeCursor.replace(/@([a-zA-Z0-9_]*)$/, insertText)
      const newValue = newBefore + currentText.slice(caretPos)

      // Use setValueAndCaret to atomically update the DOM + caret without focus fighting
      inputRef.current?.setValueAndCaret?.(newValue, newBefore.length)
      // Sync React state to match DOM
      setInputValue(newValue)
      setShowMentionSuggestions(false)
    } else {
      setShowMentionSuggestions(false)
    }
  }

  const handleKeyDown = (e) => {
    if (showMentionSuggestions && mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedMentionIndex(prev => (prev + 1) % mentionSuggestions.length)
        return
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedMentionIndex(prev => (prev - 1 + mentionSuggestions.length) % mentionSuggestions.length)
        return
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleMentionSelect(mentionSuggestions[selectedMentionIndex])
        return
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setShowMentionSuggestions(false)
        return
      } else if (e.key === 'Tab') {
        e.preventDefault()
        handleMentionSelect(mentionSuggestions[selectedMentionIndex])
        return
      }
    }
    
    if (e.key === 'Enter' && !e.shiftKey) {
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
    // inputRef is now a forwarded ref object with a .focus() helper
    requestAnimationFrame(() => inputRef.current?.focus?.())
  }

  const getFileCategory = (file) => {
    const mime = file.type || ''
    const name = file.name || ''
    if (mime.startsWith('image/') || name.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i)) return 'image'
    if (mime.startsWith('video/') || name.match(/\.(mp4|webm|mov|avi|mkv)$/i)) return 'video'
    if (mime.startsWith('audio/') || name.match(/\.(mp3|wav|ogg|flac|aac|m4a)$/i)) return 'audio'
    if (mime === 'application/pdf' || name.match(/\.pdf$/i)) return 'pdf'
    if (name.match(/\.(doc|docx|xls|xlsx|ppt|pptx)$/i)) return 'office'
    if (name.match(/\.(txt|md|json|xml|yaml|yml|csv|log)$/i)) return 'text'
    if (name.match(/\.(js|ts|jsx|tsx|py|rb|go|rs|java|c|cpp|cs|php|html|css|sh)$/i)) return 'code'
    return 'file'
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

    // Generate local previews immediately (before upload)
    const previews = validFiles.map(file => ({
      file,
      name: file.name,
      size: file.size,
      category: getFileCategory(file),
      localUrl: getFileCategory(file) === 'image' || getFileCategory(file) === 'video'
        ? URL.createObjectURL(file)
        : null
    }))
    setPendingPreviews(prev => [...prev, ...previews])
    setUploadProgress(0)

    try {
      const result = await apiService.uploadFiles(validFiles, serverId, (pct) => {
        setUploadProgress(Math.round(pct))
      })
      // uploadFiles with onProgress returns raw JSON; without returns axios response
      const uploaded = result?.attachments ?? result?.data?.attachments ?? []
      setAttachments(prev => [...prev, ...uploaded])
      // Revoke object URLs to free memory
      previews.forEach(p => { if (p.localUrl) URL.revokeObjectURL(p.localUrl) })
      setPendingPreviews(prev => prev.filter(p => !previews.includes(p)))
      setUploadProgress(null)
      soundService.success()
    } catch (err) {
      console.error('Upload failed:', err)
      // Revoke and remove previews on failure
      previews.forEach(p => { if (p.localUrl) URL.revokeObjectURL(p.localUrl) })
      setPendingPreviews(prev => prev.filter(p => !previews.includes(p)))
      setUploadProgress(null)
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
    // inputRef is now the forwarded ref object; get the inner editor node
    const editor = inputRef.current?.getEditor?.()
    if (editor) {
      editor.addEventListener('paste', handlePaste)
      return () => editor.removeEventListener('paste', handlePaste)
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
      <div className="chat-area-main">
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
        members={members}
        serverEmojis={serverEmojis}
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
        {/* Upload progress bar */}
        {uploadProgress !== null && (
          <div className="upload-progress-bar-container">
            <div className="upload-progress-label">
              Uploading... {uploadProgress}%
            </div>
            <div className="upload-progress-track">
              <div
                className="upload-progress-fill"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Pending previews (while uploading) */}
        {pendingPreviews.length > 0 && (
          <div className="attachment-preview-bar">
            {pendingPreviews.map((preview, index) => (
              <div key={`pending-${index}`} className="attachment-preview-item uploading">
                {preview.category === 'image' && preview.localUrl ? (
                  <img src={preview.localUrl} alt={preview.name} className="attachment-thumb-img" />
                ) : preview.category === 'video' && preview.localUrl ? (
                  <video src={preview.localUrl} className="attachment-thumb-img" muted />
                ) : (
                  <div className={`attachment-type-icon attachment-type-${preview.category}`}>
                    {preview.category === 'audio' ? '♪' :
                     preview.category === 'pdf' ? 'PDF' :
                     preview.category === 'office' ? 'DOC' :
                     preview.category === 'code' ? '</>' :
                     preview.category === 'text' ? 'TXT' : '📎'}
                  </div>
                )}
                <div className="attachment-meta">
                  <span className="attachment-name">{preview.name}</span>
                  <span className="attachment-size">{(preview.size / 1024).toFixed(1)} KB</span>
                </div>
                <div className="attachment-uploading-spinner" />
              </div>
            ))}
          </div>
        )}

        {/* Uploaded attachments preview */}
        {attachments.length > 0 && (
          <div className="attachment-preview-bar">
            {attachments.map((file, index) => {
              const cat = file.type?.split('/')?.[0] || 'file'
              const isImage = cat === 'image' || file.name?.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i)
              const isVideo = cat === 'video' || file.name?.match(/\.(mp4|webm|mov)$/i)
              const isAudio = cat === 'audio' || file.name?.match(/\.(mp3|wav|ogg|flac|aac)$/i)
              const isPDF = file.name?.match(/\.pdf$/i)
              const isCode = file.name?.match(/\.(js|ts|jsx|tsx|py|rb|go|rs|java|c|cpp|cs|php|html|css|sh)$/i)
              return (
                <div key={index} className="attachment-preview-item">
                  {isImage && file.url ? (
                    <img src={file.url} alt={file.name} className="attachment-thumb-img" />
                  ) : isVideo ? (
                    <div className="attachment-type-icon attachment-type-video">▶</div>
                  ) : isAudio ? (
                    <div className="attachment-type-icon attachment-type-audio">♪</div>
                  ) : isPDF ? (
                    <div className="attachment-type-icon attachment-type-pdf">PDF</div>
                  ) : isCode ? (
                    <div className="attachment-type-icon attachment-type-code">&lt;/&gt;</div>
                  ) : (
                    <div className="attachment-type-icon attachment-type-file">
                      <FileText size={18} />
                    </div>
                  )}
                  <div className="attachment-meta">
                    <span className="attachment-name">{file.name}</span>
                    {file.size && <span className="attachment-size">{(file.size / 1024).toFixed(1)} KB</span>}
                  </div>
                  <button 
                    type="button" 
                    className="attachment-remove"
                    onClick={() => removeAttachment(index)}
                  >
                    <X size={14} />
                  </button>
                </div>
              )
            })}
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

          {/* Mention suggestions panel — rendered ABOVE the input */}
          {showMentionSuggestions && mentionSuggestions.length > 0 && (
            <div ref={mentionPanelRef} className="mention-suggestions-panel">
              <div className="mention-suggestions-header">
                Members &amp; Mentions — {mentionQuery ? `"@${mentionQuery}"` : 'type to filter'}
              </div>
              <div className="mention-suggestions-list">
                {mentionSuggestions.map((mention, index) => (
                  <button
                    key={mention.id}
                    className={`mention-item ${index === selectedMentionIndex ? 'selected' : ''}`}
                    onMouseDown={(e) => {
                      e.preventDefault() // prevent blur on the input
                      handleMentionSelect(mention)
                    }}
                    onMouseEnter={() => setSelectedMentionIndex(index)}
                  >
                    {mention.type === 'special' ? (
                      <div
                        className="mention-special-icon"
                        style={{ '--mention-color': mention.color }}
                      >
                        {mention.username === 'everyone'
                          ? <Users size={16} />
                          : <Radio size={16} />}
                      </div>
                    ) : (
                      <div
                        className="mention-avatar"
                        style={{ background: `hsl(${(mention.username?.charCodeAt(0) || 0) * 37 % 360}, 60%, 45%)` }}
                      >
                        {mention.avatar
                          ? <img src={mention.avatar} alt={mention.username} />
                          : (mention.username?.[0] || '?').toUpperCase()}
                      </div>
                    )}
                    <div className="mention-info">
                      <span className="mention-name">
                        {mention.type === 'special' ? `@${mention.username}` : (mention.displayName || mention.username)}
                      </span>
                      {mention.type !== 'special' && mention.host && (
                        <span className="mention-username">@{mention.username}:{mention.host}</span>
                      )}
                      {mention.type !== 'special' && !mention.host && (
                        <span className="mention-username">@{mention.username}</span>
                      )}
                      {mention.type === 'special' && (
                        <span className="mention-username">{mention.displayName}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          
          <ChatInput
            ref={inputRef}
            value={inputValue}
            onChange={handleInputChange}
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
    </div>
  )
}

export default ChatArea
