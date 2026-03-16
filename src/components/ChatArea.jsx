import React, { useState, useEffect, useRef, useCallback } from 'react'
import { HashtagIcon, UsersIcon, MapPinIcon, XMarkIcon, MagnifyingGlassIcon, DocumentTextIcon, ArrowUturnLeftIcon } from "@heroicons/react/24/outline";
import { Hash, Users, MapPin, Search, Smile, X, FileText, Lock, AtSign, Signal, Grip, LayoutGrid } from 'lucide-react'
import { useSocket } from '../contexts/SocketContext'
import { useAuth } from '../contexts/AuthContext'
import { useE2e } from '../contexts/E2eContext'
import { useE2eTrue } from '../contexts/E2eTrueContext'
import { apiService } from '../services/apiService'
import {
  buildClientSignature,
  runSafetyScan,
  warmupSafetyModels
} from '../services/localSafetyService'
import {
  buildTransmitContentFlags,
  scanSelectedImageFiles
} from '../services/nsfwDetectionService'
import { useTranslation } from '../hooks/useTranslation'
import { soundService } from '../services/soundService'
import { getStoredServer } from '../services/serverConfig'
import { preloadHostMetadata } from '../services/hostMetadataService'
import MessageList from './MessageList'
import EmojiPicker from './EmojiPicker'
import KlipyPicker from './KlipyPicker'
import ChatInput from './ChatInput'
import MarkdownMessage from './MarkdownMessage'
import { EncryptionFallback } from './EncryptionFallback'
import WidgetManager from './WidgetManager'
import { loadWidgets, saveWidgets, subscribeWidgets } from '../services/widgetService'
import '../assets/styles/ChatArea.css'
import '../assets/styles/ChatInput.css'

const ChatArea = ({ channelId, serverId, channels, messages, channelDiagnostic = null, initialMembers = [], initialServer = null, onMessageSent, onMessageFailed, onMessageAck, onAgeGateTriggered, onLoadMoreMessages, onToggleMembers, onSaveScrollPosition, scrollPosition, onShowProfile, isAdmin, isLoading }) => {
  const { socket, connected } = useSocket()
  const { user } = useAuth()
  const { t } = useTranslation()
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
  const [showKlipyPicker, setShowKlipyPicker] = useState(false)
  const [serverEmojis, setServerEmojis] = useState([])
  const [attachments, setAttachments] = useState([])
  const [uploadProgress, setUploadProgress] = useState(null) // null = idle, 0-100 = uploading
  const [pendingPreviews, setPendingPreviews] = useState([]) // local file objects before upload completes
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionSuggestions, setMentionSuggestions] = useState([])
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0)
  const [members, setMembers] = useState(Array.isArray(initialMembers) ? initialMembers : [])
  const [server, setServer] = useState(initialServer || null)
  const [showSearchModal, setShowSearchModal] = useState(false)
  const [showPinnedModal, setShowPinnedModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [pinnedMessages, setPinnedMessages] = useState([])
  const [isLoadingPins, setIsLoadingPins] = useState(false)
  const [highlightMessageId, setHighlightMessageId] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [encryptionError, setEncryptionError] = useState(null)
  const [isRetryingEncryption, setIsRetryingEncryption] = useState(false)
  const [showWidgetEditor, setShowWidgetEditor] = useState(false)
  const [widgets, setWidgets] = useState([])
  const [selectedWidgetId, setSelectedWidgetId] = useState(null)
  const [replyingTo, setReplyingTo] = useState(null)
  const isSendingRef = useRef(false)
  const typingTimeoutRef = useRef(null)
  const emojiPickerRef = useRef(null)
  const emojiButtonRef = useRef(null)
  const mentionPanelRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const chatAreaRef = useRef(null)
  const safeChannels = Array.isArray(channels) ? channels : channels && typeof channels === 'object' ? Object.values(channels) : []
  const currentChannel = safeChannels.find(c => c.id === channelId)

  useEffect(() => {
    setWidgets(loadWidgets())
    return subscribeWidgets(setWidgets)
  }, [])

  // Load members for mention suggestions
  useEffect(() => {
    if (Array.isArray(initialMembers) && initialMembers.length > 0) {
      setMembers(initialMembers)
      const hosts = initialMembers.filter(m => !m.isBot && m.host).map(m => m.host)
      if (hosts.length > 0) preloadHostMetadata(hosts)
      return
    }

    setMembers([])
  }, [serverId, initialMembers])

  useEffect(() => {
    warmupSafetyModels({ text: true, images: false })
  }, [])

  // Load server info for admin features
  useEffect(() => {
    if (initialServer?.id === serverId) {
      setServer(initialServer)
      return
    }

    setServer(null)
  }, [serverId, initialServer])

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

  // Trigger initial message load when component mounts and no messages are loaded yet
  const [hasTriggeredInitialLoad, setHasTriggeredInitialLoad] = useState(false)
  
  useEffect(() => {
    setHasTriggeredInitialLoad(false)
  }, [channelId])

  useEffect(() => {
    if (channelId && onLoadMoreMessages && !hasTriggeredInitialLoad) {
      console.log('[ChatArea] Triggering initial message load for channel:', channelId)
      // Call onLoadMoreMessages with no timestamp to load the most recent messages
      onLoadMoreMessages(null)
      setHasTriggeredInitialLoad(true)
    }
  }, [channelId, onLoadMoreMessages, hasTriggeredInitialLoad])

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
        if (payload?.clientNonce) {
          onMessageFailed?.(payload.clientNonce, payload?.error || 'Failed to send message')
        }
        if (payload.code === 'AGE_VERIFICATION_REQUIRED') {
          setSendError(t('ageVerification.channelAccess', 'Access to #{{channel}} requires age verification.', { channel: currentChannel?.name || t('chat.channelName', 'this channel') }))
          onAgeGateTriggered?.()
        } else if (payload.code === 'SLOWMODE') {
          setSendError(payload.error || t('chat.slowmodeActive', 'Slowmode is active. Please wait before sending another message.'))
        } else {
          setSendError(payload?.error || t('chat.sendFailed', 'Failed to send message'))
        }
      }
    }

    socket.on('message:error', handleMessageError)

    return () => {
      socket.off('user:typing', handleTyping)
      socket.off('message:error', handleMessageError)
    }
  }, [socket, connected, channelId, user, onAgeGateTriggered, onMessageFailed, t, currentChannel?.name])

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
    const displayContent = messageContent
    let encryptedData = null

    // Local-only safety moderation before encryption/send.
    // We never transmit content or scores, only boolean flags when a threat is escalated.
    try {
      const { flags, safety } = await runSafetyScan({
        text: messageContent,
        attachments,
        recipient: { isMinor: false, isUnder16: false },
        allowBlockingModels: false
      })

      if (safety.shouldBlock) {
        setSendError(t('chat.automodBlocked', 'Message blocked by local safety policy.'))
        if (safety.shouldReport) {
          const reportPayload = {
            contextType: 'channel',
            reportType: 'threat',
            accusedUserId: user?.id || null,
            targetUserId: null,
            channelId,
            contentFlags: flags
          }
          const signature = await buildClientSignature(reportPayload)
          await apiService.submitSafetyReport({
            ...reportPayload,
            clientSignature: signature
          }).catch(() => {})
        }
        isSendingRef.current = false
        return
      }
    } catch (err) {
      console.error('[ChatArea] Local safety moderation failed:', err)
    }

    // Security hardening: when encryption is enabled for a server, require
    // True E2EE and do not silently fall back to legacy server-readable mode.
    const trueE2eeRequired = serverId && e2eTrue
      ? await e2eTrue.isEncryptionEnabled(serverId)
      : false

    if (serverId && e2eTrue && trueE2eeRequired) {
      try {
        const trueEncrypted = await e2eTrue.encryptMessage(messageContent, serverId)
        if (trueEncrypted.encrypted) {
          encryptedData = trueEncrypted
          messageContent = trueEncrypted.content
        } else {
          setEncryptionError('encryption_failed')
          isSendingRef.current = false
          return
        }
      } catch (err) {
        console.error('[ChatArea] True E2EE encryption error:', err)
        setEncryptionError('encryption_failed')
        isSendingRef.current = false
        return
      }
    }
    
    // Legacy fallback is only used when True E2EE is not required/enabled.
    if (!trueE2eeRequired && !encryptedData?.encrypted && serverId && hasDecryptedKey(serverId) && isEncryptionEnabled(serverId)) {
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
        setEncryptionError('encryption_failed')
      }
    }
    
    const clientNonce = `chn_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    const messageData = {
      channelId,
      content: messageContent,
      replyTo: replyingTo?.id,
      attachments: attachments.length > 0 ? attachments : undefined,
      encrypted: encryptedData?.encrypted || false,
      iv: encryptedData?.iv,
      epoch: encryptedData?.epoch || null,
      keyVersion: encryptedData?.keyVersion || null,
      clientNonce
    }

    onMessageSent?.({
      id: `local_${clientNonce}`,
      channelId,
      userId: user?.id,
      username: user?.username || user?.email || 'You',
      avatar: user?.avatar,
      content: displayContent,
      mentions: null,
      timestamp: new Date().toISOString(),
      attachments: attachments.length > 0 ? attachments : [],
      replyTo: replyingTo || null,
      encrypted: encryptedData?.encrypted || false,
      iv: encryptedData?.iv || null,
      epoch: encryptedData?.epoch || null,
      keyVersion: encryptedData?.keyVersion || null,
      clientNonce,
      _sendStatus: 'sending'
    })

    console.log('[ChatArea] Sending message:', messageData)
    
    // Send with acknowledgment for immediate feedback
    socket.emit('message:send', messageData, (ack) => {
      if (ack && ack.success) {
        console.log('[ChatArea] Message acknowledged:', ack.messageId)
        onMessageAck?.(channelId, clientNonce, ack.messageId)
      }
    })
    
    soundService.messageSent()
    setInputValue('')
    inputRef.current?.setValueAndCaret?.('', 0)
    setAttachments([])
    setPendingPreviews([])
    setReplyingTo(null)
    setIsTyping(false)
    setShowMentionSuggestions(false)
    setShowEmojiPicker(false)
    
    isSendingRef.current = false
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
        { id: 'everyone', username: 'everyone', displayName: '@everyone — notify all members', type: 'special', color: 'var(--volt-warning)' },
        { id: 'here', username: 'here', displayName: '@here — notify online members', type: 'special', color: 'var(--volt-primary-light)' },
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

  // Auto-send typing indicator when input is focused (unless in full voice mode)
  const handleInputFocus = () => {
    const voiceContainer = document.querySelector('.voice-container')
    const isVoiceFullMode = voiceContainer?.classList.contains('full')
    
    if (!isVoiceFullMode && !isTyping) {
      setIsTyping(true)
      socket?.emit('message:typing', { channelId })
      
      clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false)
      }, 2000)
    }
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
    // Only handle mention suggestions when they're shown
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
    
    // Only prevent default for plain Enter (not Shift+Enter)
    // Shift+Enter should be handled by the contentEditable to insert a newline
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
    // For Shift+Enter, do nothing - let the browser handle the newline insertion
  }

  const handleVoiceMessageSent = useCallback((attachment) => {
    if (!socket || !attachment || !channelId) return

    const clientNonce = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    const messageData = {
      channelId,
      content: '',
      attachments: [attachment],
      clientNonce
    }

    const optimisticMessage = {
      id: `local_${clientNonce}`,
      channelId,
      serverId,
      userId: user?.id,
      username: user?.username || user?.email || 'You',
      avatar: user?.avatar,
      content: '',
      mentions: null,
      timestamp: new Date().toISOString(),
      attachments: [attachment],
      clientNonce,
      _sendStatus: 'sending'
    }

    onMessageSent?.(channelId, optimisticMessage)

    socket.emit('message:send', messageData, (ack) => {
      if (ack && ack.success) {
        onMessageAck?.(channelId, clientNonce, ack.messageId)
      }
    })
    
    soundService.messageSent()
  }, [socket, channelId, serverId, user, onMessageSent, onMessageAck])

  const handleEmojiSelect = (emoji) => {
    const insertAtCaret = (textToInsert) => {
      const editor = inputRef.current
      const editorText = editor?.getEditor?.()?.innerText ?? inputValue
      const caret = editor?.getCaretPosition?.() ?? editorText.length
      const next = `${editorText.slice(0, caret)}${textToInsert}${editorText.slice(caret)}`
      editor?.setValueAndCaret?.(next, caret + textToInsert.length)
      setInputValue(next)
    }

    if (typeof emoji === 'string') {
      insertAtCaret(emoji)
    } else if (emoji.type === 'gif') {
      insertAtCaret(`[GIF: ${emoji.url}]`)
    } else if (emoji.type === 'custom') {
      // Insert global emoji format: :host|serverId|emojiId|name:
      // This ensures the emoji displays correctly everywhere (DMs, other servers, etc.)
      const emojiFormat = emoji.host && emoji.serverId && emoji.id
        ? `:${emoji.host}|${emoji.serverId}|${emoji.id}|${emoji.name}:`
        : `:${emoji.name}:`
      insertAtCaret(emojiFormat)
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
    warmupSafetyModels({ text: false, images: true })

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
      const localNsfwResults = await scanSelectedImageFiles(validFiles)
      const result = await apiService.uploadFiles(validFiles, serverId, (pct) => {
        setUploadProgress(Math.round(pct))
      })
      // uploadFiles with onProgress returns raw JSON; without returns axios response
      const uploaded = result?.attachments ?? result?.data?.attachments ?? []
      const uploadedWithFlags = uploaded.map((attachment, index) => {
        const scan = localNsfwResults[index]
        if (!scan) return attachment
        return {
          ...attachment,
          contentFlags: buildTransmitContentFlags(scan)
        }
      })
      setAttachments(prev => [...prev, ...uploadedWithFlags])
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
      setSendError(t('dm.uploadError', 'Failed to upload file(s)'))
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

  const toggleKlipyPicker = () => {
    setShowKlipyPicker(!showKlipyPicker)
  }

  const handleKlipySelect = (item) => {
    const insertAtCaret = (textToInsert) => {
      const editor = inputRef.current
      const editorText = editor?.getEditor?.()?.innerText ?? inputValue
      const caret = editor?.getCaretPosition?.() ?? editorText.length
      const next = `${editorText.slice(0, caret)}${textToInsert}${editorText.slice(caret)}`
      editor?.setValueAndCaret?.(next, caret + textToInsert.length)
      setInputValue(next)
    }

    if (item.url) {
      insertAtCaret(`[${item.type.toUpperCase()}: ${item.url}]`)
    }
    setShowKlipyPicker(false)
    requestAnimationFrame(() => inputRef.current?.focus?.())
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

  const beginWidgetMove = useCallback((widgetId, event) => {
    event.preventDefault()
    event.stopPropagation()
    setSelectedWidgetId(widgetId)
    const startX = event.clientX
    const startY = event.clientY
    const targetWidget = widgets.find((widget) => widget.id === widgetId)
    if (!targetWidget) return
    const startLeft = targetWidget.x || 16
    const startTop = targetWidget.y || 16

    const onMove = (moveEvent) => {
      saveWidgets(widgets.map((widget) => widget.id === widgetId ? {
        ...widget,
        x: Math.max(0, startLeft + (moveEvent.clientX - startX)),
        y: Math.max(0, startTop + (moveEvent.clientY - startY))
      } : widget))
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [widgets])

  const beginWidgetResize = useCallback((widgetId, event) => {
    event.preventDefault()
    event.stopPropagation()
    setSelectedWidgetId(widgetId)
    const startX = event.clientX
    const startY = event.clientY
    const targetWidget = widgets.find((widget) => widget.id === widgetId)
    if (!targetWidget) return
    const startWidth = targetWidget.width || 280
    const startHeight = targetWidget.height || 160

    const onMove = (moveEvent) => {
      saveWidgets(widgets.map((widget) => widget.id === widgetId ? {
        ...widget,
        width: Math.min(640, Math.max(140, startWidth + (moveEvent.clientX - startX))),
        height: Math.min(420, Math.max(90, startHeight + (moveEvent.clientY - startY)))
      } : widget))
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [widgets])

  const removeWidget = useCallback((widgetId) => {
    saveWidgets(widgets.filter((widget) => widget.id !== widgetId))
    setSelectedWidgetId((current) => current === widgetId ? null : current)
  }, [widgets])

  const handleReportMessage = async (message) => {
    if (!message?.id) return
    const reason = window.prompt('Report this message. What happened?')
    if (!reason || reason.trim().length < 3) return

    try {
      await apiService.submitUserSafetyReport({
        contextType: 'server_message',
        reportType: 'user_report',
        accusedUserId: message.userId || null,
        channelId,
        serverId: serverId || null,
        messageId: message.id,
        messagePreview: (message.content || '').slice(0, 240),
        reason: reason.trim()
      })
      window.alert('Report sent. Thanks for helping moderate the community.')
    } catch (err) {
      console.error('Failed to submit message report:', err)
      window.alert(err?.response?.data?.error || 'Failed to submit report')
    }
  }

  const handleLoadMoreMessages = async (beforeTimestamp) => {
    if (!channelId || !onLoadMoreMessages) return false
    return onLoadMoreMessages(beforeTimestamp)
  }

  return (
    <div 
      className={`chat-area ${isDragging ? 'dragging' : ''}`}
      ref={chatAreaRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onMouseDown={() => setSelectedWidgetId(null)}
    >
      {isDragging && (
        <div className="drop-overlay">
          <div className="drop-message">
            <DocumentTextIcon size={48} />
            <span>{t('chat.dropFilesUpload', 'Drop files to upload')}</span>
          </div>
        </div>
      )}
      <div className="chat-area-main">
        {widgets.map((widget) => (
          (widget.type === 'image' || widget.type === 'gif') && widget.src ? (
            <div
              key={widget.id}
              className={`chat-widget chat-widget-image ${selectedWidgetId === widget.id ? 'selected' : ''}`}
              style={{
                width: `${widget.width}px`,
                height: `${widget.height}px`,
                left: `${widget.x}px`,
                top: `${widget.y}px`
              }}
              onMouseDown={(event) => {
                if (event.target.closest('button')) return
                beginWidgetMove(widget.id, event)
              }}
              onClick={(event) => {
                event.stopPropagation()
                setSelectedWidgetId(widget.id)
              }}
            >
              <button type="button" className="chat-widget-grab" onMouseDown={(event) => beginWidgetMove(widget.id, event)} title={t('chat.moveWidget', 'Move widget')}>
                <Grip size={14} />
              </button>
              <button type="button" className="chat-widget-close" onClick={() => removeWidget(widget.id)} title={t('chat.removeWidget', 'Remove widget')}>
                <X size={14} />
              </button>
              <img src={widget.src} alt={widget.title || t('chat.widget', 'Widget')} />
              <div className="chat-widget-label">{widget.title || t('chat.widget', 'Widget')}</div>
              <button type="button" className="chat-widget-resize" onMouseDown={(event) => beginWidgetResize(widget.id, event)} title={t('chat.resizeWidget', 'Resize widget')}>
                <Grip size={14} />
              </button>
            </div>
          ) : widget.type === 'text' && widget.content ? (
            <div
              key={widget.id}
              className={`chat-widget chat-widget-text ${selectedWidgetId === widget.id ? 'selected' : ''}`}
              style={{
                width: `${widget.width}px`,
                height: `${widget.height}px`,
                left: `${widget.x}px`,
                top: `${widget.y}px`,
                color: widget.color || '#ffffff',
                background: widget.background || 'rgba(10, 10, 14, 0.72)'
              }}
              onMouseDown={(event) => {
                if (event.target.closest('button')) return
                beginWidgetMove(widget.id, event)
              }}
              onClick={(event) => {
                event.stopPropagation()
                setSelectedWidgetId(widget.id)
              }}
            >
              <button type="button" className="chat-widget-grab" onMouseDown={(event) => beginWidgetMove(widget.id, event)} title={t('chat.moveWidget', 'Move widget')}>
                <Grip size={14} />
              </button>
              <button type="button" className="chat-widget-close" onClick={() => removeWidget(widget.id)} title={t('chat.removeWidget', 'Remove widget')}>
                <X size={14} />
              </button>
              <div className="chat-widget-text-copy">
                <strong>{widget.title || t('chat.widget', 'Widget')}</strong>
                <span>{widget.content}</span>
              </div>
              <button type="button" className="chat-widget-resize" onMouseDown={(event) => beginWidgetResize(widget.id, event)} title={t('chat.resizeWidget', 'Resize widget')}>
                <Grip size={14} />
              </button>
            </div>
          ) : null
        ))}
        <div className="chat-header">
        <div className="channel-info">
          <Hash size={24} />
          <span className="channel-title">{currentChannel?.name || 'channel'}</span>
        </div>
        <div className="chat-actions">
          <button className="icon-btn" title={t('misc.showMembers', 'Show Members')} onClick={onToggleMembers}>
            <UsersIcon size={20} />
          </button>
          <div className="divider-vertical"></div>
          <button className="icon-btn" title={t('misc.pinnedMessages', 'Pinned Messages')} onClick={() => { handleLoadPinned(); setShowPinnedModal(true) }}>
            <MapPinIcon size={20} />
          </button>
          <button className="icon-btn" title={t('common.search', 'Search')} onClick={() => setShowSearchModal(true)}>
            <MagnifyingGlassIcon size={20} />
          </button>
          <button className="icon-btn" title={t('chat.widgets', 'Widgets')} onClick={() => setShowWidgetEditor((prev) => !prev)}>
            <LayoutGrid size={18} />
          </button>
        </div>
      </div>

      {showWidgetEditor && (
        <div className="chat-widget-editor">
          <WidgetManager showClose onClose={() => setShowWidgetEditor(false)} />
        </div>
      )}

      <MessageList 
        messages={messages || []} 
        emptyState={channelDiagnostic}
        currentUserId={user?.id} 
        channelId={channelId} 
        onReply={setReplyingTo}
        onLoadMore={handleLoadMoreMessages}
        onPinMessage={handlePinMessage}
        onUnpinMessage={handleUnpinMessage}
        onReportMessage={handleReportMessage}
        highlightMessageId={highlightMessageId}
        onSaveScrollPosition={onSaveScrollPosition}
        scrollPosition={scrollPosition}
        onShowProfile={onShowProfile}
        members={members}
        serverEmojis={serverEmojis}
        serverId={serverId}
        isAdmin={isAdmin}
        server={server}
        isLoading={isLoading}
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
        {replyingTo && (
          <div className="reply-preview-bar">
            <ArrowUturnLeftIcon size={16} className="reply-icon" />
            <div className="reply-content">
              <span className="reply-author">{replyingTo.username}</span>
              <span className="reply-text">
                {replyingTo.content?.slice(0, 120) || 'Attachment'}
                {(replyingTo.content?.length || 0) > 120 ? '…' : ''}
              </span>
            </div>
            <button
              type="button"
              className="reply-cancel"
              onClick={() => setReplyingTo(null)}
              title={t('common.cancel', 'Cancel')}
            >
              <XMarkIcon size={16} />
            </button>
          </div>
        )}

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
                  <span className="attachment-size">{preview.size > 0 ? (preview.size < 1024 * 1024 ? (preview.size / 1024).toFixed(1) + ' KB' : (preview.size / (1024 * 1024)).toFixed(1) + ' MB') : ''}</span>
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
                      <DocumentTextIcon size={18} />
                    </div>
                  )}
                  <div className="attachment-meta">
                    <span className="attachment-name">{file.name}</span>
                    {file.size > 0 && <span className="attachment-size">{file.size < 1024 * 1024 ? (file.size / 1024).toFixed(1) + ' KB' : (file.size / (1024 * 1024)).toFixed(1) + ' MB'}</span>}
                  </div>
                  <button 
                    type="button" 
                    className="attachment-remove"
                    onClick={() => removeAttachment(index)}
                  >
                    <XMarkIcon size={14} />
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
                {t('chat.membersAndMentions', 'Members & Mentions')} {mentionQuery ? `"@${mentionQuery}"` : t('chat.typeToFilter', 'type to filter')}
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
                          ? <UsersIcon size={16} />
                          : <Signal size={16} />}
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
            onFocus={handleInputFocus}
            placeholder={t('chat.messageChannel', { channel: currentChannel?.name || 'channel' })}
            onSubmit={handleSendMessage}
            onKeyDown={handleKeyDown}
            onAttachClick={handlePlusClick}
            onEmojiClick={toggleEmojiPicker}
            onKlipyClick={toggleKlipyPicker}
            onVoiceMessageSent={handleVoiceMessageSent}
            customEmojis={serverEmojis}
          />

          {encryptionError && (
            <EncryptionFallback
              status={encryptionError}
              onRetry={async () => {
                setIsRetryingEncryption(true)
                try {
                  await getServerEncryptionStatus(serverId)
                  setEncryptionError(null)
                } catch (err) {
                  console.error('[ChatArea] Retry failed:', err)
                } finally {
                  setIsRetryingEncryption(false)
                }
              }}
              isRetrying={isRetryingEncryption}
              showDetails={true}
            />
          )}

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

      {showKlipyPicker && (
        <KlipyPicker 
          onSelect={handleKlipySelect}
          onClose={() => setShowKlipyPicker(false)}
        />
      )}

      {showSearchModal && (
        <div className="modal-overlay" onClick={() => setShowSearchModal(false)}>
          <div className="modal-content search-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t('search.searchMessagesTitle', 'Search Messages')}</h3>
              <button className="modal-close" onClick={() => setShowSearchModal(false)}>
                <XMarkIcon size={20} />
              </button>
            </div>
            <form onSubmit={handleSearch} className="search-form">
              <input
                type="text"
                placeholder={t('search.searchMessages', 'Search messages...')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                autoFocus
              />
              <button type="submit" disabled={isSearching}>
                <MagnifyingGlassIcon size={18} />
              </button>
            </form>
            <div className="search-results">
              {isSearching ? (
                <div className="search-loading">{t('search.searching', 'Searching...')}</div>
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
                <div className="search-empty">{t('common.noResults', 'No results found')}</div>
              ) : (
                <div className="search-empty">{t('search.enterSearchTerm', 'Enter a search term to find messages')}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {showPinnedModal && (
        <div className="modal-overlay" onClick={() => setShowPinnedModal(false)}>
          <div className="modal-content pinned-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t('misc.pinnedMessages', 'Pinned Messages')}</h3>
              <button className="modal-close" onClick={() => setShowPinnedModal(false)}>
                <XMarkIcon size={20} />
              </button>
            </div>
            <div className="pinned-messages-list">
              {isLoadingPins ? (
                <div className="pinned-loading">{t('common.loading', 'Loading...')}</div>
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
                      {t('chat.unpin', 'Unpin')}
                    </button>
                  </div>
                ))
              ) : (
                <div className="pinned-empty">{t('chat.noPinnedMessages', 'No pinned messages')}</div>
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
