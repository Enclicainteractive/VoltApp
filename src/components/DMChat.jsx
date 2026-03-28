import React, { useState, useEffect, useRef, useCallback, forwardRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { PhoneIcon, VideoCameraIcon, MagnifyingGlassIcon, FaceSmileIcon, PencilIcon, TrashIcon, ArrowUturnLeftIcon, XMarkIcon, DocumentTextIcon, ChatBubbleLeftRightIcon, CheckIcon, ArrowDownIcon, ClipboardDocumentIcon, AtSymbolIcon, PhoneXMarkIcon, VideoCameraSlashIcon, LockClosedIcon, LockOpenIcon } from '@heroicons/react/24/outline'
import { Lock, Bell, BellOff, Shield, ShieldOff, Key } from 'lucide-react'
import { formatDistance } from 'date-fns'
import { useSocket } from '../contexts/SocketContext'
import { useAuth } from '../contexts/AuthContext'
import { useCall } from '../contexts/CallContext'
import { useE2e } from '../contexts/E2eContext'
import { useTranslation } from '../hooks/useTranslation'
import { apiService } from '../services/apiService'
import {
  buildClientSignature,
  runSafetyScan,
  warmupSafetyModels,
  quickSafetyCheck,
  scanMessageAsync,
  scanReceivedMessage
} from '../services/localSafetyService'
import {
  buildTransmitContentFlags,
  scanSelectedImageFiles
} from '../services/nsfwDetectionService'
import { soundService } from '../services/soundService'
import Avatar from './Avatar'
import EmojiPicker from './EmojiPicker'
import KlipyPicker from './KlipyPicker'
import ChatInput from './ChatInput'
import FileAttachment from './FileAttachment'
import MarkdownMessage from './MarkdownMessage'
import DMCallView from './DMCallView'
import E2eeStatusBadge from './E2eeStatusBadge'
import E2eeEnableModal from './E2eeEnableModal'
import E2eeKeyPromptModal from './E2eeKeyPromptModal'
import DmEncryptionRequestModal from './DmEncryptionRequestModal'
import EncryptionRequestMessage from './EncryptionRequestMessage'
import ContextMenu from './ContextMenu'
import DmContextMenu from './DmContextMenu'
import MessageContextMenu from './MessageContextMenu'
import ReactionEmojiPicker from './ReactionEmojiPicker'
import { EncryptionFallback } from './EncryptionFallback'
import BotUIMessage from './BotUIMessage'
import { deserializeReactionEmoji, serializeReactionEmoji } from '../utils/reactionEmoji'
import '../assets/styles/DMChat.css'

const isLikelySameDmMessage = (local, remote) => {
  if (!local || !remote) return false
    if (local.userId !== remote.userId) return false
      if ((local.content || '') !== (remote.content || '')) return false
        const localAttachments = Array.isArray(local.attachments) ? local.attachments.length : 0
        const remoteAttachments = Array.isArray(remote.attachments) ? remote.attachments.length : 0
        if (localAttachments !== remoteAttachments) return false

          const localTime = new Date(local.timestamp || 0).getTime()
          const remoteTime = new Date(remote.timestamp || 0).getTime()
          if (!Number.isFinite(localTime) || !Number.isFinite(remoteTime)) return false

            return Math.abs(remoteTime - localTime) < 30000
}
import '../assets/styles/ChatInput.css'

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥']
const ATTACHMENT_PLACEHOLDER_TYPES = new Set(['image', 'video', 'audio', 'file', 'attachment'])

const isAttachmentOnlyPlaceholder = (content = '') => {
  const trimmed = String(content || '').trim()
  if (!trimmed || !trimmed.startsWith('[') || !trimmed.endsWith(']')) return false

    const chunks = trimmed
    .split(']')
    .map((chunk) => chunk.trim())
    .filter(Boolean)

    if (chunks.length === 0) return false

      return chunks.every((chunk) => {
        if (!chunk.startsWith('[')) return false
          const inner = chunk.slice(1).trim().replaceAll('\t', ' ')
          const normalized = inner.split(' ').filter(Boolean)
          if (normalized.length < 1 || normalized.length > 2) return false
            if (!ATTACHMENT_PLACEHOLDER_TYPES.has(normalized[0].toLowerCase())) return false
              if (normalized.length === 1) return true
                const suffix = normalized[1]
                return suffix.startsWith('#') && suffix.length > 1 && suffix.slice(1).split('').every((char) => char >= '0' && char <= '9')
      })
}

// Normalize timestamp to ISO format for proper sorting
const normalizeTimestamp = (timestamp) => {
  if (!timestamp) return new Date(0).toISOString()
    // If already ISO format with T, return as-is
    if (timestamp.includes('T')) return timestamp
      // Convert "2026-02-24 02:11:46.506" to "2026-02-24T02:11:46.506Z"
      return timestamp.replace(' ', 'T') + 'Z'
}

// Sort messages by timestamp (oldest first)
const sortMessages = (msgs) => {
  if (!msgs || msgs.length === 0) return []
    return [...msgs].sort((a, b) => {
      const timeA = new Date(normalizeTimestamp(a.timestamp)).getTime()
      const timeB = new Date(normalizeTimestamp(b.timestamp)).getTime()
      return timeA - timeB
    })
}

const DMChat = ({ conversation, onClose, onShowProfile }) => {
  const { t } = useTranslation()
  const { socket, connected } = useSocket()
  const { user } = useAuth()
  const {
    activeCall,
    callStatus,
    callDuration,
    initiateCall,
    endCall,
    formatDuration
  } = useCall()
  const {
    isDmEncryptionEnabled,
    getDmEncryptionFullStatus,
    joinDmEncryption,
    respondToDmEncryptionRequest,
    encryptMessageForDm,
    decryptMessageFromDm,
    hasDmDecryptedKey
  } = useE2e()

  const [dmEncryptionStatus, setDmEncryptionStatus] = useState(null)
  const [showE2eeModal, setShowE2eeModal] = useState(false)
  const [showKeyPrompt, setShowKeyPrompt] = useState(false)
  const [needsKey, setNeedsKey] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [contextMenu, setContextMenu] = useState(null)
  const [messageContextMenu, setMessageContextMenu] = useState(null)
  const [selectedMessage, setSelectedMessage] = useState(null)

  // Danger modal — shown when a received message is flagged as dangerous
  const [dangerModal, setDangerModal] = useState(null)
  // { senderName, senderUserId, blockReasons, flags, reported }

  useEffect(() => {
    warmupSafetyModels({ text: true, images: false })
  }, [])
  const [isAcceptingE2ee, setIsAcceptingE2ee] = useState(false)
  const [isCancellingE2eeRequest, setIsCancellingE2eeRequest] = useState(false)

  // Encryption request state
  const [pendingRequest, setPendingRequest] = useState(null)
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [encryptionRequestMessage, setEncryptionRequestMessage] = useState(null)

  const [rawMessages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(true)
  const [typingUsers, setTypingUsers] = useState(new Set())
  const [editingMessage, setEditingMessage] = useState(null)
  const [editContent, setEditContent] = useState('')
  const [replyingTo, setReplyingTo] = useState(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showKlipyPicker, setShowKlipyPicker] = useState(false)
  const [showMessageEmojiPicker, setShowMessageEmojiPicker] = useState(null)
  const [emojiPickerAnchor, setEmojiPickerAnchor] = useState(null)
  const [attachments, setAttachments] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const [hoveredMessage, setHoveredMessage] = useState(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [sendError, setSendError] = useState('')
  const [uploadProgress, setUploadProgress] = useState(null) // null = not uploading, 0-100 = progress
  const [isUploading, setIsUploading] = useState(false)

  // Search state
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchOffset, setSearchOffset] = useState(0)
  const [searchTotal, setSearchTotal] = useState(0)
  const searchLimit = 50

  // Helper to ensure DM encryption keys are loaded
  const ensureDmEncryptionKeys = useCallback(async (convId) => {
    if (!convId) return false

      const fullStatus = await getDmEncryptionFullStatus(convId).catch(() => null)
      const enabledByStatus = !!(fullStatus?.enabled || isDmEncryptionEnabled(convId))
      if (!enabledByStatus) return false

        // Try joining/fetching DM key first so refresh/reconnect decrypt works.
        try {
          await joinDmEncryption(convId)
        } catch {
          // Continue with local checks/retries.
        }

        let attempts = 0
        const maxAttempts = 40
        const delay = 120

        while (attempts < maxAttempts) {
          const hasKey = hasDmDecryptedKey(convId)
          if (hasKey) {
            return true
          }

          await new Promise(resolve => setTimeout(resolve, delay))
          attempts++
        }

        return hasDmDecryptedKey(convId)
  }, [getDmEncryptionFullStatus, isDmEncryptionEnabled, hasDmDecryptedKey, joinDmEncryption])
  const [highlightedMessageId, setHighlightedMessageId] = useState(null)
  const [showCallView, setShowCallView] = useState(true)
  const [encryptionError, setEncryptionError] = useState(null)
  const [isRetryingEncryption, setIsRetryingEncryption] = useState(false)

  const getEncryptionRequestPayload = useCallback((message) => {
    if (!message) return null
      if (message.type === 'encryption-request' && message.encryptionRequest) {
        return message.encryptionRequest
      }
      const storedRequest = message.storage?.request
      if (message.storage?.systemType === 'encryption-request' && storedRequest) {
        return storedRequest
      }
      return null
  }, [])

  // Sort messages by timestamp (oldest first), filter out encryption requests when encryption is enabled
  const messages = useMemo(() => {
    const sorted = sortMessages(rawMessages)
    // Filter out encryption request messages if encryption is now enabled for this DM
    if (dmEncryptionStatus?.enabled) {
      return sorted.filter(msg => {
        const requestPayload = getEncryptionRequestPayload(msg)
        if (requestPayload) return false
          return true
      })
    }
    return sorted
  }, [rawMessages, dmEncryptionStatus, getEncryptionRequestPayload])

  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const loadMessagesRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const isTypingRef = useRef(false)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const uploadXhrRef = useRef(null)
  const isSendingRef = useRef(false)
  const isAtBottomRef = useRef(true)
  const prevMessageCountRef = useRef(0)
  const recipientAgeCacheRef = useRef(new Map())
  const pendingDmSendTimersRef = useRef(new Map())

  const recipient = conversation?.recipient
  const dmMentionMembers = useMemo(() => {
    const map = new Map()
    const pushMember = (member) => {
      if (!member?.id) return
        if (!map.has(member.id)) map.set(member.id, member)
    }

    pushMember(user)
    pushMember(recipient)
    ;(conversation?.recipients || []).forEach(pushMember)
    ;(conversation?.participants || []).forEach(pushMember)

    return Array.from(map.values())
  }, [conversation?.participants, conversation?.recipients, recipient, user])
  const isGroupConversation = !!conversation?.isGroup || (Array.isArray(conversation?.participants) && conversation.participants.length > 2)
  const conversationTitle = isGroupConversation
  ? (conversation?.groupName || conversation?.title || conversation?.recipients?.map(r => r.displayName || r.username).slice(0, 3).join(', ') || t('dm.title', 'Direct Messages'))
  : (recipient?.displayName || recipient?.customUsername || recipient?.username)
  const groupParticipantIds = (conversation?.recipients || []).map(r => r.id).filter(Boolean)

  const resolveRecipientSafetyContext = useCallback(async () => {
    const targetIds = isGroupConversation
    ? groupParticipantIds
    : [recipient?.id || conversation?.recipientId].filter(Boolean)
    if (targetIds.length === 0) {
      return { isMinor: false, isUnder16: false, targetUserId: null }
    }

    let hasMinor = false
    let hasUnder16 = false
    let targetUserId = targetIds[0] || null

    for (const userId of targetIds) {
      let profile = recipientAgeCacheRef.current.get(userId)
      if (!profile) {
        try {
          const res = await apiService.getUserProfile(userId)
          profile = res.data || null
          recipientAgeCacheRef.current.set(userId, profile)
        } catch {
          profile = null
        }
      }
      const av = profile?.ageVerification
      const verified = !!av?.verified
      const ageRaw = Number(av?.age ?? av?.estimatedAge)
      const age = Number.isFinite(ageRaw) ? ageRaw : null
      const isMinor = verified && (av?.category === 'child' || (age !== null && age < 18))
      const isUnder16 = verified && (age !== null ? age < 16 : av?.category === 'child')
      if (isMinor) {
        hasMinor = true
        targetUserId = userId
      }
      if (isUnder16) {
        hasUnder16 = true
        targetUserId = userId
      }
    }

    return { isMinor: hasMinor, isUnder16: hasUnder16, targetUserId }
  }, [conversation?.recipientId, groupParticipantIds, isGroupConversation, recipient?.id])

  const clearPendingDmSendTimeout = useCallback((clientNonce) => {
    if (!clientNonce) return
      const timer = pendingDmSendTimersRef.current.get(clientNonce)
      if (timer) {
        clearTimeout(timer)
        pendingDmSendTimersRef.current.delete(clientNonce)
      }
  }, [])

  const markDmMessageFailed = useCallback((clientNonce, errorText = 'Failed to send') => {
    if (!clientNonce) return
      clearPendingDmSendTimeout(clientNonce)
      setMessages(prev => prev.map(m => {
        if (m?.clientNonce === clientNonce && m?._sendStatus === 'sending') {
          return { ...m, _sendStatus: 'failed', _sendError: errorText }
        }
        return m
      }))
  }, [clearPendingDmSendTimeout])

  useEffect(() => {
    const timers = pendingDmSendTimersRef.current
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer)
      }
      timers.clear()
    }
  }, [])

  useEffect(() => {
    if (activeCall && activeCall.conversationId === conversation?.id) {
      setShowCallView(true)
    }
  }, [activeCall, conversation?.id])

  // ─── Load messages ────────────────────────────────────────────────────────

  const loadMessages = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiService.getDMMessages(conversation.id)
      let msgs = res.data || []

      // Ensure encryption keys are available before decryption
      await ensureDmEncryptionKeys(conversation.id)

      // Decrypt messages if needed
      if (isDmEncryptionEnabled(conversation.id) && hasDmDecryptedKey(conversation.id)) {
        msgs = await Promise.all(msgs.map(async (msg) => {
          // Only try to decrypt if this specific message has cipher payload
          if ((msg.encrypted || msg.iv) && isDmEncryptionEnabled(conversation.id)) {
            try {
              const decryptedContent = await decryptMessageFromDm(msg, conversation.id)
              return { ...msg, content: decryptedContent, _decrypted: true }
            } catch (err) {
              console.error('[DMChat] Decryption error:', err)
              return { ...msg, content: '[Encrypted message - could not decrypt]', _decrypted: false }
            }
          }
          return msg
        }))
      }

      setMessages(prev => {
        const unsentLocal = prev
        .filter(msg => msg?._sendStatus === 'sending' || msg?._sendStatus === 'failed')
        .filter(local => !msgs.some(remote =>
        (remote?.id && remote.id === local.id) ||
        (remote?.clientNonce && local?.clientNonce && remote.clientNonce === local.clientNonce) ||
        isLikelySameDmMessage(local, remote)
        ))
        return [...msgs, ...unsentLocal]
      })
      setHasMore(msgs.length >= 50)
      prevMessageCountRef.current = msgs.length
      setTimeout(() => scrollToBottom(false), 50)
    } catch (err) {
      console.error('[DMChat] Failed to load messages:', err)
    }
    setLoading(false)
  }, [conversation?.id, isDmEncryptionEnabled, hasDmDecryptedKey, decryptMessageFromDm, ensureDmEncryptionKeys])

  useEffect(() => {
    loadMessagesRef.current = loadMessages
  }, [loadMessages])

  useEffect(() => {
    if (!conversation?.id) return

      for (const timer of pendingDmSendTimersRef.current.values()) {
        clearTimeout(timer)
      }
      pendingDmSendTimersRef.current.clear()

      setMessages([])
      setHasMore(true)
      loadMessagesRef.current?.()
      socket?.emit('dm:join', conversation.id)

      getDmEncryptionFullStatus(conversation.id).then(status => {
        setDmEncryptionStatus(status)
        if (status?.enabled && !status?.pending) {
          const hasLocalKey = localStorage.getItem(`dm_e2e_${conversation.id}`)
          if (!hasLocalKey) {
            setNeedsKey(true)
            setShowKeyPrompt(true)
          }
        }
      }).catch(() => {
        setDmEncryptionStatus(null)
      })

      apiService.getDmMuteStatus(conversation.id).then(res => {
        setIsMuted(res.data?.muted || false)
      }).catch(() => {
        setIsMuted(false)
      })

      return () => {
        if (conversation?.id) socket?.emit('dm:leave', conversation.id)
      }
  }, [conversation?.id, socket])

  const loadMoreMessages = useCallback(async () => {
    if (!hasMore || isLoadingMore || messages.length === 0) return
      setIsLoadingMore(true)
      try {
        const oldest = messages[0]
        const res = await apiService.getDMMessages(conversation.id, { before: oldest.timestamp, limit: 50 })
        const older = res.data || []
        if (older.length === 0) { setHasMore(false); return }
        // Preserve scroll position
        const container = messagesContainerRef.current
        const prevScrollHeight = container?.scrollHeight || 0
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m?.id).filter(Boolean))
          const dedupedOlder = older.filter(msg => {
            if (msg?.id && existingIds.has(msg.id)) return false
              return true
          })
          if (dedupedOlder.length === 0) return prev
            return sortMessages([...dedupedOlder, ...prev])
        })
        setHasMore(older.length >= 50)
        requestAnimationFrame(() => {
          if (container) {
            container.scrollTop = container.scrollHeight - prevScrollHeight
          }
        })
      } catch (err) {
        console.error('[DMChat] Failed to load more messages:', err)
      }
      setIsLoadingMore(false)
  }, [conversation?.id, messages, hasMore, isLoadingMore])

  // ─── Socket events ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!socket || !connected) return

      const handleNewMessage = async (message) => {
        if (message.conversationId !== conversation?.id) return

          // Ensure encryption keys are available
          await ensureDmEncryptionKeys(conversation.id)

          let processedMessage = { ...message }
          if (processedMessage.userId === user?.id && user?.avatar && !processedMessage.avatar) {
            processedMessage.avatar = user.avatar
          }

          if ((message.encrypted || message.iv) && isDmEncryptionEnabled(conversation.id) && hasDmDecryptedKey(conversation.id)) {
            try {
              const decryptedContent = await decryptMessageFromDm(message, conversation.id)
              processedMessage.content = decryptedContent
              processedMessage._decrypted = true
            } catch (err) {
              console.error('[DMChat] Decryption error:', err)
              processedMessage.content = '[Encrypted message - could not decrypt]'
            }
          }

          // ── Receiver-side safety scan with context window ─────────────────
          // Runs AFTER the message is added to the local list so the context
          // window (±7 messages) is available.  We first add the message
          // optimistically, then remove it if the scan blocks it.
          if (!message.bot) {
            // Add message to state first so context window works
            setMessages(prev => {
              if (prev.some(m => m.id === processedMessage.id)) return prev
              return [...prev, { ...processedMessage, _sendStatus: 'sent', _pendingScan: true }]
            })
            if (message.userId !== user?.id) soundService.messageReceived()
            if (isAtBottomRef.current) setTimeout(() => scrollToBottom(true), 20)

            // Fetch sender profile for adult-to-adult check (cached)
            let senderProfile = recipientAgeCacheRef.current.get(processedMessage.userId) || null
            if (!senderProfile && processedMessage.userId) {
              try {
                const res = await apiService.getUserProfile(processedMessage.userId)
                senderProfile = res.data || null
                if (senderProfile) recipientAgeCacheRef.current.set(processedMessage.userId, senderProfile)
              } catch { /* ignore */ }
            }

            // Run context-aware scan in background
            setMessages(currentMsgs => {
              // We need the current message list for context — capture it here
              // and run the scan asynchronously
              const msgsSnapshot = currentMsgs
              ;(async () => {
                try {
                  const { flags, safety } = await scanReceivedMessage({
                    message: processedMessage,
                    messages: msgsSnapshot,
                    senderProfile,
                    localUser: user,
                    contextWindow: 7
                  })

                  // Remove _pendingScan flag regardless of outcome
                  setMessages(prev => prev.map(m =>
                    m.id === processedMessage.id ? { ...m, _pendingScan: false } : m
                  ))

                  if (safety.shouldBlock) {
                    // Remove the message from the UI
                    setMessages(prev => prev.filter(m => m.id !== processedMessage.id))

                    // Show danger modal
                    setDangerModal({
                      senderName: processedMessage.username || 'Unknown',
                      senderUserId: processedMessage.userId || null,
                      blockReasons: safety.blockReasons || [],
                      flags,
                      reported: false
                    })

                    if (safety.shouldReport) {
                      const selfAgeRaw = Number(user?.ageVerification?.age ?? user?.ageVerification?.estimatedAge)
                      const selfAge = Number.isFinite(selfAgeRaw) ? selfAgeRaw : null
                      const recipientContext = {
                        isMinor: !!(user?.ageVerification?.verified && (user?.ageVerification?.category === 'child' || (selfAge !== null && selfAge < 18))),
                        isUnder16: !!(user?.ageVerification?.verified && (selfAge !== null ? selfAge < 16 : user?.ageVerification?.category === 'child'))
                      }
                      const reportPayload = {
                        contextType: 'dm',
                        reportType: 'threat',
                        accusedUserId: processedMessage.userId || null,
                        targetUserId: user?.id || null,
                        conversationId: conversation.id,
                        contentFlags: flags,
                        targetAgeContext: recipientContext
                      }
                      const signature = await buildClientSignature(reportPayload)
                      apiService.submitSafetyReport({ ...reportPayload, clientSignature: signature }).catch(() => {})
                      setDangerModal(prev => prev ? { ...prev, reported: true } : prev)
                    }
                  }
                } catch (err) {
                  console.error('[DMChat] Receiver-side safety scan failed:', err)
                  // On error, keep the message visible (fail-open)
                  setMessages(prev => prev.map(m =>
                    m.id === processedMessage.id ? { ...m, _pendingScan: false } : m
                  ))
                }
              })()
              return currentMsgs // don't mutate state here
            })

            // Early return — message already added above
            clearPendingDmSendTimeout(processedMessage.clientNonce)
            return
          }

          setMessages(prev => {
            const messageNonce = processedMessage.clientNonce || null
            if (messageNonce) {
              const pendingIdx = prev.findIndex(m =>
              m?.clientNonce === messageNonce && (m?._sendStatus === 'sending' || m?._sendStatus === 'failed')
              )
              if (pendingIdx >= 0) {
                const next = [...prev]
                next[pendingIdx] = {
                  ...next[pendingIdx],
                  ...processedMessage,
                  avatar: processedMessage.avatar || next[pendingIdx]?.avatar || null,
                  replyTo: processedMessage.replyTo || next[pendingIdx]?.replyTo || null,
                  _sendStatus: 'sent',
                  _sendError: null
                }
                return next
              }
            }
            const fallbackPendingIdx = prev.findIndex(m =>
            (m?._sendStatus === 'sending' || m?._sendStatus === 'failed') &&
            isLikelySameDmMessage(m, processedMessage)
            )
            if (fallbackPendingIdx >= 0) {
              const next = [...prev]
              const fallbackNonce = next[fallbackPendingIdx]?.clientNonce || null
              next[fallbackPendingIdx] = {
                ...next[fallbackPendingIdx],
                ...processedMessage,
                avatar: processedMessage.avatar || next[fallbackPendingIdx]?.avatar || null,
                replyTo: processedMessage.replyTo || next[fallbackPendingIdx]?.replyTo || null,
                clientNonce: processedMessage.clientNonce || fallbackNonce,
                _sendStatus: 'sent',
                _sendError: null
              }
              if (fallbackNonce) clearPendingDmSendTimeout(fallbackNonce)
                return next
            }
            if (prev.some(m => m.id === processedMessage.id)) return prev
              return [...prev, { ...processedMessage, _sendStatus: 'sent' }]
          })
          clearPendingDmSendTimeout(processedMessage.clientNonce)
          if (message.userId !== user?.id) {
            soundService.messageReceived()
          }
          if (isAtBottomRef.current) {
            setTimeout(() => scrollToBottom(true), 20)
          }
      }

      const handleTyping = (data) => {
        if (data.conversationId !== conversation?.id || data.userId === user?.id) return
          setTypingUsers(prev => new Set([...prev, data.username]))
          setTimeout(() => {
            setTypingUsers(prev => { const s = new Set(prev); s.delete(data.username); return s })
          }, 3000)
      }

      const handleEdited = (message) => {
        if (message.conversationId !== conversation?.id) return
          setMessages(prev => prev.map(m => m.id === message.id ? { ...m, ...message } : m))
      }

      const handleDeleted = ({ messageId }) => {
        setMessages(prev => prev.filter(m => m.id !== messageId))
      }

      const handleDmError = (payload) => {
        if (payload?.conversationId !== conversation?.id) return
          if (payload?.clientNonce) {
            markDmMessageFailed(payload.clientNonce, payload?.error || 'Failed to send message')
          }
          setSendError(payload?.error || 'Failed to send message')
      }

      const handleDmFullyEnabled = async (data) => {
        if (data?.conversationId !== conversation?.id) return
          await ensureDmEncryptionKeys(conversation.id)
          const status = await getDmEncryptionFullStatus(conversation.id).catch(() => null)
          if (status) setDmEncryptionStatus(status)
            await loadMessages()
      }

      const handleDmKeyRotated = async (data) => {
        if (data?.conversationId !== conversation?.id) return
          await ensureDmEncryptionKeys(conversation.id)
          await loadMessages()
      }

      // Handle incoming encryption requests
      const handleEncryptionRequest = (data) => {
        if (data.conversationId !== conversation?.id) return

          console.log('[DMChat] Received encryption request:', data)
          const requestData = {
            mode: data.mode,
            requesterName: data.requesterName || data.username || 'Unknown',
            requestedBy: data.requestedBy,
            createdAt: data.createdAt
          }
          setPendingRequest(requestData)
          setShowRequestModal(true)
          setEncryptionRequestMessage(requestData)
      }

      const handleDmReactionUpdated = (payload) => {
        if (payload.conversationId !== conversation?.id) return
        setMessages(prev => prev.map(m => {
          if (m.id !== payload.messageId) return m
          return { ...m, reactions: payload.reactions || {} }
        }))
      }

      socket.on('dm:new', handleNewMessage)
      socket.on('dm:typing', handleTyping)
      socket.on('dm:edited', handleEdited)
      socket.on('dm:deleted', handleDeleted)
      socket.on('dm:error', handleDmError)
      socket.on('dm:reaction:updated', handleDmReactionUpdated)
      socket.on('e2e:dm-fully-enabled', handleDmFullyEnabled)
      socket.on('e2e:dm-key-rotated', handleDmKeyRotated)
      // Listen for both event names for compatibility
      socket.on('e2e:encryption-request', handleEncryptionRequest)
      socket.on('e2e:encryption-requested', handleEncryptionRequest)

      return () => {
        socket.off('dm:new', handleNewMessage)
        socket.off('dm:typing', handleTyping)
        socket.off('dm:edited', handleEdited)
        socket.off('dm:deleted', handleDeleted)
        socket.off('dm:error', handleDmError)
        socket.off('dm:reaction:updated', handleDmReactionUpdated)
        socket.off('e2e:dm-fully-enabled', handleDmFullyEnabled)
        socket.off('e2e:dm-key-rotated', handleDmKeyRotated)
        socket.off('e2e:encryption-request', handleEncryptionRequest)
        socket.off('e2e:encryption-requested', handleEncryptionRequest)
      }
  }, [socket, connected, conversation?.id, user, isDmEncryptionEnabled, hasDmDecryptedKey, decryptMessageFromDm, ensureDmEncryptionKeys, getDmEncryptionFullStatus, loadMessages, clearPendingDmSendTimeout, markDmMessageFailed])

  // ─── Scroll tracking ──────────────────────────────────────────────────────

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' })
  }

  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current
    if (!container) return
      const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80
      isAtBottomRef.current = atBottom
      setIsAtBottom(atBottom)
      // Load more when near top
      if (container.scrollTop < 60 && hasMore && !isLoadingMore) {
        loadMoreMessages()
      }
  }, [hasMore, isLoadingMore, loadMoreMessages])

  // ─── Mute handlers ─────────────────────────────────────────────────────────

  const handleMute = async () => {
    try {
      await apiService.muteDm(conversation.id, true)
      setIsMuted(true)
    } catch (err) {
      console.error('Failed to mute DM:', err)
    }
  }

  const handleUnmute = async () => {
    try {
      await apiService.muteDm(conversation.id, false)
      setIsMuted(false)
    } catch (err) {
      console.error('Failed to unmute DM:', err)
    }
  }

  const handleDisableE2ee = async () => {
    try {
      await apiService.disableDmEncryption(conversation.id)
      setDmEncryptionStatus({ enabled: false })
    } catch (err) {
      console.error('Failed to disable E2EE:', err)
    }
  }

  // ─── Context menu ─────────────────────────────────────────────────────────

  const handleContextMenu = (e) => {
    e.preventDefault()
    // Check if clicking on a message
    const messageEl = e.target.closest('[data-message-id]')
    if (messageEl) {
      const messageId = messageEl.dataset.messageId
      const message = rawMessages.find(m => m.id === messageId)
      if (message) {
        setSelectedMessage(message)
        setMessageContextMenu({ x: e.clientX, y: e.clientY })
        return
      }
    }
    // General chat area click - no menu for now (E2EE moved to DMList)
  }

  const closeContextMenu = () => setContextMenu(null)
  const closeMessageContextMenu = () => {
    setMessageContextMenu(null)
    setSelectedMessage(null)
  }

  // ─── Send message ─────────────────────────────────────────────────────────

  const handleSendMessage = useCallback(async () => {
    if (isSendingRef.current) return
    if (!inputValue.trim() && attachments.length === 0) return
    if (!socket) return

    isSendingRef.current = true
    setSendError('')

    let messageContent = inputValue.trim()
    const displayContent = messageContent
    const snapshotAttachments = [...attachments]
    const snapshotReplyingTo = replyingTo
    let encrypted = false
    let iv = null

    // ── Encryption ────────────────────────────────────────────────────────
    const dmE2eeEnabled = isDmEncryptionEnabled(conversation.id)
    if (dmE2eeEnabled) {
      try {
        const keyReady = hasDmDecryptedKey(conversation.id) || await ensureDmEncryptionKeys(conversation.id)
        if (!keyReady) {
          setEncryptionError('encryption_key_unavailable')
          isSendingRef.current = false
          return
        }
        const encryptedData = await encryptMessageForDm(messageContent, conversation.id)
        if (encryptedData.encrypted) {
          encrypted = true
          iv = encryptedData.iv
          messageContent = encryptedData.content
        } else {
          setEncryptionError('encryption_failed')
          isSendingRef.current = false
          return
        }
      } catch (err) {
        console.error('[DMChat] Encryption error:', err)
        setEncryptionError('encryption_failed')
        isSendingRef.current = false
        return
      }
    }

    // ── Optimistic send ───────────────────────────────────────────────────
    // Add the message to the UI immediately so the user sees it as "sending"
    // and can start typing the next message without waiting for the scan.
    const clientNonce = `dm_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    const messageData = {
      conversationId: conversation.id,
      content: messageContent,
      recipientId: recipient?.id || conversation.recipientId,
      replyTo: snapshotReplyingTo?.id,
      attachments: snapshotAttachments.length > 0 ? snapshotAttachments : undefined,
      encrypted,
      iv,
      clientNonce
    }

    const optimisticMessage = {
      id: `local_${clientNonce}`,
      conversationId: conversation.id,
      userId: user?.id,
      username: user?.username || user?.email || 'You',
      avatar: user?.avatar,
      content: displayContent,
      timestamp: new Date().toISOString(),
      attachments: snapshotAttachments.length > 0 ? snapshotAttachments : [],
      replyTo: snapshotReplyingTo || null,
      encrypted,
      iv,
      clientNonce,
      _sendStatus: 'sending'
    }
    setMessages(prev => [...prev, optimisticMessage])

    // Clear input immediately so the user can type the next message.
    setInputValue('')
    inputRef.current?.setValueAndCaret?.('', 0)
    setReplyingTo(null)
    setAttachments([])
    isTypingRef.current = false
    isSendingRef.current = false

    // ── Transmit immediately ──────────────────────────────────────────────
    // Send the message right away — do NOT wait for the safety scan.
    // Waiting for TF inference before sending causes the "stuck sending" bug
    // and the double-send bug (scan success path + catch path both emit).
    const pendingTimer = setTimeout(() => {
      markDmMessageFailed(clientNonce, 'Message failed to send (timeout)')
    }, 8000)
    pendingDmSendTimersRef.current.set(clientNonce, pendingTimer)

    socket.emit('dm:send', messageData, (ack) => {
      if (ack && ack.success) {
        clearPendingDmSendTimeout(clientNonce)
        setMessages(prev => prev.map(m => {
          if (m?.clientNonce === clientNonce) {
            return { ...m, _sendStatus: 'sent', id: ack.messageId || m.id }
          }
          return m
        }))
      } else if (ack && !ack.success) {
        markDmMessageFailed(clientNonce, ack.error || 'Message failed to send')
      }
    })
    soundService.messageSent()

    // ── Background safety scan (non-blocking, post-send) ──────────────────
    // Run the AI safety scan AFTER the message is already sent.
    // This is purely for local safety reporting — it never blocks sending.
    scanMessageAsync({ text: displayContent, attachments: snapshotAttachments })
      .then(async ({ flags, safety }) => {
        if (safety.shouldReport) {
          const recipientContext = await resolveRecipientSafetyContext()
          const reportPayload = {
            contextType: 'dm',
            reportType: 'threat',
            accusedUserId: user?.id || null,
            targetUserId: recipientContext.targetUserId,
            conversationId: conversation.id,
            contentFlags: flags,
            targetAgeContext: recipientContext
          }
          const signature = await buildClientSignature(reportPayload)
          apiService.submitSafetyReport({ ...reportPayload, clientSignature: signature }).catch(() => {})
        }
      })
      .catch(() => {
        // Scan errors are non-fatal — message was already sent successfully.
      })
  }, [socket, inputValue, attachments, conversation, recipient, replyingTo, isDmEncryptionEnabled, hasDmDecryptedKey, encryptMessageForDm, ensureDmEncryptionKeys, resolveRecipientSafetyContext, t, user?.id, user?.username, user?.email, user?.avatar, markDmMessageFailed, clearPendingDmSendTimeout])

  // ─── Input change (plain string from ChatInput) ───────────────────────────

  const handleInputChange = useCallback((value) => {
    setInputValue(value)
    if (!isTypingRef.current && value.length > 0) {
      isTypingRef.current = true
      socket?.emit('dm:typing', { conversationId: conversation.id })
    }
    clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => { isTypingRef.current = false }, 2000)
  }, [socket, conversation?.id])

  // Auto-send typing indicator when input is focused (unless in full voice mode)
  const handleInputFocus = useCallback(() => {
    const voiceContainer = document.querySelector('.voice-container')
    const isVoiceFullMode = voiceContainer?.classList.contains('full')

    if (!isVoiceFullMode && !isTypingRef.current) {
      isTypingRef.current = true
      socket?.emit('dm:typing', { conversationId: conversation.id })

      clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = setTimeout(() => { isTypingRef.current = false }, 2000)
    }
  }, [socket, conversation?.id])

  const handleKeyDown = useCallback((e) => {
    // Only prevent default for plain Enter (not Shift+Enter)
    // Shift+Enter should be handled by the contentEditable to insert a newline
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
    // For Shift+Enter, do nothing - let the browser handle the newline insertion
  }, [handleSendMessage])

  // ─── Voice message ─────────────────────────────────────────────────────────

  const handleVoiceMessageSent = useCallback((attachment) => {
    if (!socket || !attachment) return

      const clientNonce = `dm_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
      const messageData = {
        conversationId: conversation.id,
        content: '',
        recipientId: recipient?.id || conversation.recipientId,
        attachments: [attachment],
        clientNonce
      }

      const optimisticMessage = {
        id: `local_${clientNonce}`,
        conversationId: conversation.id,
        userId: user?.id,
        username: user?.username || user?.email || 'You',
        avatar: user?.avatar,
        content: '',
        timestamp: new Date().toISOString(),
                                             attachments: [attachment],
                                             clientNonce,
                                             _sendStatus: 'sending'
      }
      setMessages(prev => [...prev, optimisticMessage])

      const pendingTimer = setTimeout(() => {
        markDmMessageFailed(clientNonce, 'Voice message failed to send (timeout)')
      }, 5000)
      pendingDmSendTimersRef.current.set(clientNonce, pendingTimer)

      socket.emit('dm:send', messageData, (ack) => {
        if (ack && ack.success) {
          clearPendingDmSendTimeout(clientNonce)
          setMessages(prev => prev.map(m => {
            if (m?.clientNonce === clientNonce) {
              return { ...m, _sendStatus: 'sent', id: ack.messageId || m.id }
            }
            return m
          }))
        } else if (ack && !ack.success) {
          markDmMessageFailed(clientNonce, ack.error || 'Voice message failed to send')
        }
      })
      soundService.messageSent()
  }, [socket, conversation, recipient, user, markDmMessageFailed, clearPendingDmSendTimeout])

  // ─── File upload ──────────────────────────────────────────────────────────

  const cancelUpload = useCallback(() => {
    if (uploadXhrRef.current) {
      uploadXhrRef.current.abort()
      uploadXhrRef.current = null
    }
    setIsUploading(false)
    setUploadProgress(null)
  }, [])

  const processFiles = useCallback(async (files) => {
    if (!files || files.length === 0) return
    const validFiles = Array.from(files).filter(f =>
      f.type || f.name.match(/\.(jpg|jpeg|png|gif|webp|svg|mp4|webm|mp3|wav|ogg|pdf|doc|docx|txt|zip|rar)$/i)
    )
    if (validFiles.length === 0) return
    warmupSafetyModels({ text: false, images: true })
    setIsUploading(true)
    setUploadProgress(0)
    setSendError('')
    try {
      const localNsfwResults = await scanSelectedImageFiles(validFiles)
      const uploadHandle = apiService.uploadFiles(validFiles, null, (pct) => {
        setUploadProgress(Math.round(pct))
      })
      uploadXhrRef.current = uploadHandle
      const res = await uploadHandle.promise
      uploadXhrRef.current = null
      const uploaded = res?.attachments || res?.data?.attachments || []
      const uploadedWithFlags = uploaded.map((attachment, index) => {
        const scan = localNsfwResults[index]
        if (!scan) return attachment
        return {
          ...attachment,
          contentFlags: buildTransmitContentFlags(scan)
        }
      })
      setAttachments(prev => [...prev, ...uploadedWithFlags])
      soundService.success()
    } catch (err) {
      if (err?.name === 'AbortError') {
        // User cancelled — don't show error
      } else {
        console.error('[DMChat] Upload failed:', err)
        setSendError(t('dm.uploadError', 'Failed to upload file(s)'))
      }
    } finally {
      setIsUploading(false)
      setUploadProgress(null)
    }
  }, [t])

  const handlePaste = useCallback(async (e) => {
    const items = e.clipboardData?.items
    if (!items) return
      const files = []
      for (const item of items) {
        if (item.kind === 'file') { const f = item.getAsFile(); if (f) files.push(f) }
      }
      if (files.length > 0) { e.preventDefault(); await processFiles(files) }
  }, [processFiles])

  // Attach paste to the inner contentEditable via the forwarded ref
  useEffect(() => {
    const editor = inputRef.current?.getEditor?.()
    if (editor) {
      editor.addEventListener('paste', handlePaste)
      return () => editor.removeEventListener('paste', handlePaste)
    }
  }, [handlePaste])

  const handleDragOver = useCallback((e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true) }, [])
  const handleDragLeave = useCallback((e) => {
    e.preventDefault(); e.stopPropagation()
    if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false)
  }, [])
  const handleDrop = useCallback(async (e) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false)
    const files = e.dataTransfer?.files
    if (files?.length > 0) await processFiles(files)
  }, [processFiles])

  // ─── Emoji ────────────────────────────────────────────────────────────────

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
    setShowEmojiPicker(false)
    requestAnimationFrame(() => inputRef.current?.focus?.())
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

  // ─── Reactions ────────────────────────────────────────────────────────────

  // Helper to render an emoji (unicode or custom)
  const renderEmoji = (emoji, className = '') => {
    // Check if it's a custom emoji object
    if (emoji && typeof emoji === 'object' && emoji.type === 'custom') {
      return (
        <img
        src={emoji.url}
        alt={emoji.name}
        className={`dm-reaction-custom-emoji ${className}`}
        title={emoji.name}
        />
      )
    }
    // Unicode emoji
    return <span className={className}>{emoji}</span>
  }

  const handleAddReaction = useCallback(async (messageId, emojiOrKey) => {
    const msg = messages.find(m => m.id === messageId)
    if (!msg) return

    // Handle custom emoji objects or strings
    const emojiKey = typeof emojiOrKey === 'string' ? emojiOrKey : serializeReactionEmoji(emojiOrKey)

    const reactions = msg.reactions || {}
    const users = reactions[emojiKey] || []
    const alreadyReacted = users.includes(user?.id)

    // Enforce 20-reaction limit on frontend
    const MAX_REACTIONS = 20
    const isNewEmoji = !reactions[emojiKey]
    if (!alreadyReacted && isNewEmoji && Object.keys(reactions).length >= MAX_REACTIONS) {
      return // Silently ignore - at limit
    }

    socket?.emit(alreadyReacted ? 'dm:reaction:remove' : 'dm:reaction:add', {
      messageId,
      conversationId: conversation.id,
      emoji: emojiKey
    })
    // Optimistic update
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m
      const r = { ...(m.reactions || {}) }
      if (alreadyReacted) {
        r[emojiKey] = (r[emojiKey] || []).filter(id => id !== user?.id)
        if (r[emojiKey].length === 0) delete r[emojiKey]
      } else {
        r[emojiKey] = [...(r[emojiKey] || []), user?.id]
      }
      return { ...m, reactions: r }
    }))
    setShowMessageEmojiPicker(null)
    setEmojiPickerAnchor(null)
  }, [messages, conversation?.id, socket, user?.id])

  const renderReactions = (message) => {
    const reactions = message.reactions || {}
    if (Object.keys(reactions).length === 0) return null
      return (
        <div className="dm-reactions">
        {Object.entries(reactions).map(([emojiKey, users]) => {
          if (!users?.length) return null
            const emoji = deserializeReactionEmoji(emojiKey)
            const reacted = users.includes(user?.id)
            return (
              <button
              key={emojiKey}
              className={`dm-reaction-btn ${reacted ? 'active' : ''}`}
              onClick={() => handleAddReaction(message.id, emojiKey)}
              title={`${users.length} reaction${users.length !== 1 ? 's' : ''}`}
              >
              {renderEmoji(emoji)} <span>{users.length}</span>
              </button>
            )
        })}
        </div>
      )
  }

  // ─── Edit ─────────────────────────────────────────────────────────────────

  const handleEditMessage = async (messageId) => {
    if (!editContent.trim()) return
      try {
        await apiService.editDMMessage(conversation.id, messageId, editContent)
        setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, content: editContent, edited: true } : m
        ))
        setEditingMessage(null)
        setEditContent('')
      } catch (err) {
        console.error('[DMChat] Failed to edit message:', err)
      }
  }

  const handleDeleteMessage = async (messageId, e) => {
    // Skip confirmation if shift key is held down
    const skipConfirm = e?.shiftKey
    if (!skipConfirm && !confirm(t('chat.deleteConfirm', 'Delete this message?'))) return
      try {
        await apiService.deleteDMMessage(conversation.id, messageId)
        setMessages(prev => prev.filter(m => m.id !== messageId))
      } catch (err) {
        console.error('[DMChat] Failed to delete message:', err)
      }
  }

  // ─── Render message content (markdown + mentions) ─────────────────────────

  const renderMessageContent = (content, mentions, attachments = []) => {
    if (!content) return null
      if (attachments.length > 0 && isAttachmentOnlyPlaceholder(content)) {
        return null
      }

      const handleMentionClick = (userId, username, host) => {
        if (userId) {
          onShowProfile?.(userId)
          return
        }

        if (!username) return

          const match = dmMentionMembers.find((member) => {
            const memberUsername = member.username?.toLowerCase?.()
            const memberCustomUsername = member.customUsername?.toLowerCase?.()
            const memberHost = (member.host || member.federatedHost || member.homeServer || '').toLowerCase()
            if (host) {
              return (memberUsername === username.toLowerCase() || memberCustomUsername === username.toLowerCase()) && memberHost === host.toLowerCase()
            }
            return memberUsername === username.toLowerCase() || memberCustomUsername === username.toLowerCase()
          })

          if (match?.id) {
            onShowProfile?.(match.id)
          }
      }

      return (
        <MarkdownMessage
        content={content}
        currentUserId={user?.id}
        mentions={mentions}
        members={dmMentionMembers}
        onMentionClick={handleMentionClick}
        />
      )
  }

  // ─── Search messages ─────────────────────────────────────────────────────

  const handleSearchMessages = useCallback(async (query, loadMore = false) => {
    if (!loadMore) {
      setSearchQuery(query)
      setSearchOffset(0)
      if (query.length < 2) {
        setSearchResults([])
        return
      }
    }

    setSearching(true)
    try {
      // Search within current conversation's messages with pagination
      const res = await apiService.getDMMessages(conversation.id, { search: query, limit: searchLimit, offset: loadMore ? searchOffset : 0 })
      if (loadMore) {
        setSearchResults(prev => [...prev, ...(res.data || [])])
        setSearchOffset(prev => prev + searchLimit)
      } else {
        setSearchResults(res.data || [])
        setSearchTotal(res.data?.length || 0)
      }
    } catch (err) {
      console.error('[DMChat] Search failed:', err)
    }
    setSearching(false)
  }, [conversation?.id, searchLimit, searchOffset])

  const handleSearchLoadMore = useCallback(() => {
    if (searchQuery.length >= 2 && !searching) {
      handleSearchMessages(searchQuery, true)
    }
  }, [searchQuery, searching, handleSearchMessages])

  const scrollToMessage = useCallback((messageId) => {
    const messageEl = document.querySelector(`[data-message-id="${messageId}"]`)
    if (messageEl) {
      messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightedMessageId(messageId)
      setTimeout(() => setHighlightedMessageId(null), 2000)
    }
    setShowSearch(false)
    setSearchQuery('')
    setSearchResults([])
  }, [])

  // ─── Render call log message ─────────────────────────────────────────────

  const renderCallLogMessage = (message) => {
    const { callLog } = message
    if (!callLog) return null

      const isOwn = callLog.callerId === user?.id
      const otherUser = isOwn ? recipient : { id: callLog.callerId }

      let statusText = ''
      let statusClass = ''
      let icon = callLog.type === 'video' ? '📹' : '📞'

      switch (callLog.status) {
        case 'missed':
          statusText = t('call.missed', 'Missed call')
          statusClass = 'missed'
          break
        case 'declined':
          statusText = t('call.declined', 'Call declined')
          statusClass = 'declined'
          break
        case 'cancelled':
          statusText = t('call.cancelled', 'Call cancelled')
          statusClass = 'cancelled'
          break
        default:
          const mins = Math.floor(callLog.duration / 60)
          const secs = callLog.duration % 60
          const durationStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
          statusText = `Call ended • ${durationStr}`
          statusClass = 'ended'
      }

      return (
        <div className={`dm-call-log-message ${statusClass}`}>
        <span className="call-log-icon">{icon}</span>
        <span className="call-log-status">{statusText}</span>
        {callLog.type === 'video' && (
          <span className="call-log-type" title="Video call">📹</span>
        )}
        </div>
      )
  }

  // ─── JSX ──────────────────────────────────────────────────────────────────

  const isCallActive = activeCall && activeCall.conversationId === conversation?.id && showCallView

  return (
    <div
    className={`dm-chat ${isDragging ? 'dragging' : ''} ${isCallActive ? 'has-active-call' : ''}`}
    onDragOver={handleDragOver}
    onDragLeave={handleDragLeave}
    onDrop={handleDrop}
    onContextMenu={handleContextMenu}
    >
    {isDragging && (
      <div className="drop-overlay">
      <div className="drop-message">
      <DocumentTextIcon size={48} />
      <span>Drop files to upload</span>
      </div>
      </div>
    )}

    {/* Active Call View */}
    {activeCall && activeCall.conversationId === conversation?.id && showCallView && (
      <DMCallView onClose={() => setShowCallView(false)} />
    )}

    {/* Header */}
    <div className="dm-chat-header">
    <Avatar src={recipient?.avatar} fallback={recipient?.username} size={32} userId={recipient?.id} />
    <div className="dm-recipient-info">
    <span className="dm-recipient-name">
    {conversationTitle}
    <E2eeStatusBadge
    enabled={isDmEncryptionEnabled(conversation?.id)}
    mode={dmEncryptionStatus?.mode}
    needsKey={needsKey}
    size={14}
    />
    </span>
    <span className={`dm-recipient-status ${recipient?.status || 'offline'}`}>
    {t(`status.${recipient?.status}`, t('status.offline', 'Offline'))}
    </span>
    </div>
    <button
    className={`icon-btn e2ee-settings-btn ${needsKey ? 'needs-key' : ''}`}
    title={needsKey ? "Enter E2EE Key" : "E2EE Settings"}
    onClick={() => needsKey ? setShowKeyPrompt(true) : setShowE2eeModal(true)}
    >
    {needsKey ? <LockOpenIcon size={18} /> : <LockClosedIcon size={18} />}
    </button>
    <div className="dm-header-actions">
    {activeCall && activeCall.conversationId === conversation?.id ? (
      <>
      {!showCallView && (
        <button className="icon-btn" title="Return to call" onClick={() => setShowCallView(true)}>
        <PhoneIcon size={20} />
        </button>
      )}
      <span className="dm-call-indicator">
      {callStatus === 'active' ? formatDuration(callDuration || 0) : callStatus}
      </span>
      <button className="icon-btn active-call" title="End Call" onClick={endCall}>
      <PhoneXMarkIcon size={20} />
      </button>
      </>
    ) : (
      <>
      <button
      className="icon-btn"
      title="Voice Call"
      onClick={() => initiateCall(
        recipient?.id || conversation.recipientId || groupParticipantIds[0],
        conversation.id,
        'audio',
        recipient,
        isGroupConversation ? groupParticipantIds : null
      )}
      disabled={isGroupConversation ? groupParticipantIds.length === 0 : (!recipient?.status || recipient.status === 'offline')}
      >
      <PhoneIcon size={20} />
      </button>
      <button
      className="icon-btn"
      title="Video Call"
      onClick={() => initiateCall(
        recipient?.id || conversation.recipientId || groupParticipantIds[0],
        conversation.id,
        'video',
        recipient,
        isGroupConversation ? groupParticipantIds : null
      )}
      disabled={isGroupConversation ? groupParticipantIds.length === 0 : (!recipient?.status || recipient.status === 'offline')}
      >
      <VideoCameraIcon size={20} />
      </button>
      </>
    )}
    <button className="icon-btn" title="Search" onClick={() => setShowSearch(!showSearch)}><MagnifyingGlassIcon size={20} /></button>
    </div>
    </div>

    {/* Search Panel */}
    {showSearch && (
      <div className="dm-search-panel">
      <div className="dm-search-input-wrapper">
      <MagnifyingGlassIcon size={16} />
      <input
      type="text"
      className="dm-search-input"
      placeholder="Search messages..."
      value={searchQuery}
      onChange={e => handleSearchMessages(e.target.value)}
      autoFocus
      />
      {searchQuery && (
        <button className="dm-search-clear" onClick={() => { setSearchQuery(''); setSearchResults([]) }}>
        <XMarkIcon size={14} />
        </button>
      )}
      </div>

      {searching && (
        <div className="dm-search-loading">Searching...</div>
      )}

      {searchResults.length > 0 && (
        <div className="dm-search-results">
        <div className="dm-search-results-header">
        {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
        </div>
        {searchResults.slice(0, 20).map(msg => (
          <button
          key={msg.id}
          className="dm-search-result-item"
          onClick={() => scrollToMessage(msg.id)}
          >
          <div className="dm-search-result-header">
          <span className="dm-search-result-author">{msg.username}</span>
          <span className="dm-search-result-time">
          {formatDistance(new Date(msg.timestamp), new Date(), { addSuffix: true })}
          </span>
          </div>
          <div className="dm-search-result-content">
          {msg.content?.slice(0, 100)}{msg.content?.length > 100 ? '...' : ''}
          </div>
          </button>
        ))}
        </div>
      )}

      {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
        <div className="dm-search-no-results">No messages found</div>
      )}
      </div>
    )}

    {/* Messages */}
    <div
    className="dm-messages"
    ref={messagesContainerRef}
    onScroll={handleScroll}
    >
    {isLoadingMore && (
      <div className="dm-loading-more">Loading earlier messages...</div>
    )}

    {loading ? (
      <div className="dm-loading">Loading messages...</div>
    ) : messages.length === 0 ? (
      <div className="dm-empty">
      <ChatBubbleLeftRightIcon size={48} className="dm-empty-icon" />
      <Avatar src={recipient?.avatar} fallback={recipient?.username} size={80} userId={recipient?.id} />
      <h3>Start of your conversation with {recipient?.username}</h3>
      <p>No messages yet. Say hi!</p>
      </div>
    ) : (
      messages.map((message, index) => {
        // Handle encryption request messages specially
        const requestPayload = getEncryptionRequestPayload(message)
        if (requestPayload) {
          const canCancelRequest = requestPayload.requestedBy === user?.id || message.userId === user?.id
          return (
            <div key={message.id} className="dm-message encryption-request-wrapper">
            <EncryptionRequestMessage
            request={requestPayload}
            onAccept={async () => {
              setIsAcceptingE2ee(true)
              try {
                await respondToDmEncryptionRequest(conversation.id, true)
                setShowRequestModal(false)
                setPendingRequest(null)
                setEncryptionRequestMessage(null)
                // Fetch fresh status and ensure keys
                const status = await getDmEncryptionFullStatus(conversation.id)
                setDmEncryptionStatus(status)
                await ensureDmEncryptionKeys(conversation.id)
                // Force reload messages after a short delay to ensure state updates
                setTimeout(() => {
                  loadMessages()
                }, 100)
              } catch (err) {
                console.error('[DMChat] Failed to accept encryption request:', err)
              } finally {
                setIsAcceptingE2ee(false)
              }
            }}
            onDecline={async () => {
              try {
                await respondToDmEncryptionRequest(conversation.id, false)
                setShowRequestModal(false)
                setPendingRequest(null)
                setEncryptionRequestMessage(null)
                const status = await getDmEncryptionFullStatus(conversation.id)
                setDmEncryptionStatus(status)
                await loadMessages()
              } catch (err) {
                console.error('[DMChat] Failed to decline encryption request:', err)
              }
            }}
            onCancel={async () => {
              setIsCancellingE2eeRequest(true)
              try {
                await apiService.disableDmEncryptionRequest(conversation.id)
                await apiService.deleteDMMessage(conversation.id, message.id)
                setShowRequestModal(false)
                setPendingRequest(null)
                setEncryptionRequestMessage(null)
                const status = await getDmEncryptionFullStatus(conversation.id).catch(() => null)
                if (status) setDmEncryptionStatus(status)
                  await loadMessages()
              } catch (err) {
                console.error('[DMChat] Failed to cancel encryption request:', err)
              } finally {
                setIsCancellingE2eeRequest(false)
              }
            }}
            canCancel={canCancelRequest}
            isPending={isAcceptingE2ee || isCancellingE2eeRequest}
            />
            </div>
          )
        }

        const isOwn = message.userId === user?.id
        const prev = messages[index - 1]
        const grouped = prev &&
        prev.userId === message.userId &&
        new Date(message.timestamp) - new Date(prev.timestamp) < 300000
        const isHovered = hoveredMessage === message.id
        const sendStatus = isOwn ? (message._sendStatus || 'sent') : 'sent'

        const isHighlighted = highlightedMessageId === message.id

        return (
          <div
          key={message.id}
          data-message-id={message.id}
          className={`dm-message ${isOwn ? 'own' : ''} ${grouped ? 'grouped' : ''} ${isHighlighted ? 'highlighted' : ''} ${sendStatus === 'sending' ? 'sending' : ''} ${sendStatus === 'failed' ? 'failed' : ''}`}
          onMouseEnter={() => setHoveredMessage(message.id)}
          onMouseLeave={() => setHoveredMessage(null)}
          >
          {/* Reply reference */}
          {message.replyTo && (
            <div
            className={`dm-message-reply ${message.replyTo.deleted ? 'deleted' : ''}`}
            onClick={() => !message.replyTo.deleted && scrollToMessage(message.replyTo.id)}
            >
            <ArrowUturnLeftIcon size={12} />
            {message.replyTo.deleted ? (
              <span className="reply-deleted">Original message was deleted</span>
            ) : (
              <>
              <span className="reply-author">{message.replyTo.username}</span>
              <span className="reply-content">{message.replyTo.content?.slice(0, 80)}{message.replyTo.content?.length > 80 ? '...' : ''}</span>
              </>
            )}
            </div>
          )}

          {/* Header row */}
          {!grouped && (
            <div className="dm-message-header">
            <Avatar
            src={message.avatar}
            fallback={message.username}
            size={36}
            userId={message.userId}
            onClick={() => onShowProfile?.(message.userId)}
            />
            <span
            className="dm-message-author"
            onClick={() => onShowProfile?.(message.userId)}
            >
            {message.username}
            </span>
            {Boolean(message.encrypted) && (
              <span className="dm-message-e2ee-indicator" title="End-to-End Encrypted">
              <Lock size={12} />
              </span>
            )}
            <span className="dm-message-time">
            {formatDistance(new Date(message.timestamp), new Date(), { addSuffix: true })}
            </span>
            {isOwn && sendStatus === 'sending' && (
              <span className="dm-message-send-state sending">Sending...</span>
            )}
            {isOwn && sendStatus === 'failed' && (
              <span className="dm-message-send-state failed">Failed to send</span>
            )}
            </div>
          )}

          {/* Content */}
          <div className="dm-message-content-wrapper">
          {editingMessage === message.id ? (
            <div className="dm-message-edit">
            <input
            type="text"
            className="message-edit-input"
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleEditMessage(message.id)
                if (e.key === 'Escape') setEditingMessage(null)
            }}
            autoFocus
            />
            <div className="message-edit-actions">
            <button className="edit-cancel" onClick={() => setEditingMessage(null)}>
            <XMarkIcon size={14} /> Cancel
            </button>
            <button className="edit-save" onClick={() => handleEditMessage(message.id)}>
            <CheckIcon size={14} /> Save
            </button>
            </div>
            </div>
          ) : (
            <div className="dm-message-body">
            {/* Call log message */}
            {message.system && message.callLog ? (
              renderCallLogMessage(message)
            ) : (
              <>
              <div className="dm-message-content">
              {renderMessageContent(message.content, message.mentions, message.attachments)}
              {Boolean(message.edited) && <span className="edited-indicator">(edited)</span>}
              {message.ui && (
                <BotUIMessage
                ui={message.ui}
                messageId={message.id}
                channelId={conversation.id}
                />
              )}
              {isOwn && grouped && sendStatus === 'sending' && (
                <span className="dm-message-send-state-inline sending">Sending...</span>
              )}
              {isOwn && grouped && sendStatus === 'failed' && (
                <span className="dm-message-send-state-inline failed">Failed to send</span>
              )}
              </div>

              {/* Attachments rendered below content, same as server chat */}
              {message.attachments?.length > 0 && (
                <div className="message-attachments">
                {message.attachments.map((att, i) => (
                  <FileAttachment key={i} attachment={att} />
                ))}
                </div>
              )}
              </>
            )}

            {/* Reactions */}
            {renderReactions(message)}
            </div>
          )}

          {/* Hover action toolbar — shown for all messages */}
          {isHovered && !editingMessage && (
            <div className="dm-message-actions">
            {QUICK_REACTIONS.map(emoji => (
              <button
              key={emoji}
              className="dm-action-btn reaction-quick"
              onClick={() => handleAddReaction(message.id, emoji)}
              title={`React with ${emoji}`}
              >
              {emoji}
              </button>
            ))}
            <button
            className="dm-action-btn"
            onClick={(e) => {
              if (showMessageEmojiPicker === message.id) {
                setShowMessageEmojiPicker(null)
                setEmojiPickerAnchor(null)
              } else {
                const rect = e.currentTarget.getBoundingClientRect()
                setEmojiPickerAnchor(rect)
                setShowMessageEmojiPicker(message.id)
              }
            }}
            title="Add Reaction"
            >
            <FaceSmileIcon size={15} />
            </button>
            <button
            className="dm-action-btn"
            onClick={() => setReplyingTo(message)}
            title="Reply"
            >
            <ArrowUturnLeftIcon size={15} />
            </button>
            <button
            className="dm-action-btn"
            onClick={() => navigator.clipboard.writeText(message.content)}
            title="Copy"
            >
            <ClipboardDocumentIcon size={15} />
            </button>
            {isOwn && (
              <button
              className="dm-action-btn"
              onClick={() => { setEditingMessage(message.id); setEditContent(message.content) }}
              title="Edit"
              >
              <PencilIcon size={15} />
              </button>
            )}
            {isOwn && sendStatus === 'sent' && (
              <button
              className="dm-action-btn danger"
              onClick={(e) => handleDeleteMessage(message.id, e)}
              title="Delete"
              >
              <TrashIcon size={15} />
              </button>
            )}
            </div>
          )}

          {/* Per-message emoji picker - rendered via portal at end of component */}
          </div>
          </div>
        )
      })
    )}
    <div ref={messagesEndRef} />
    </div>

    {/* Scroll-to-bottom button - rendered via portal to avoid overflow clipping */}
    {!isAtBottom && createPortal(
      <button className="dm-scroll-to-bottom" onClick={() => scrollToBottom(true)} title="Jump to latest">
      <ArrowDownIcon size={18} />
      </button>,
      document.body
    )}

    {/* Typing indicator */}
    {typingUsers.size > 0 && (
      <div className="dm-typing-indicator">
      <span className="typing-dots"><span /><span /><span /></span>
      {Array.from(typingUsers).join(', ')} {typingUsers.size === 1 ? 'is' : 'are'} typing...
      </div>
    )}

    {/* Send error */}
    {sendError && (
      <div className="age-warning-banner">{sendError}</div>
    )}

    {/* Encryption error fallback */}
    {encryptionError && (
      <EncryptionFallback
      status={encryptionError}
      onRetry={async () => {
        setIsRetryingEncryption(true)
        try {
          await getDmEncryptionFullStatus(conversation.id)
          setEncryptionError(null)
        } catch (err) {
          console.error('[DMChat] Retry failed:', err)
        } finally {
          setIsRetryingEncryption(false)
        }
      }}
      isRetrying={isRetryingEncryption}
      showDetails={true}
      />
    )}

    {/* Reply preview */}
    {replyingTo && (
      <div className="dm-reply-preview">
      <ArrowUturnLeftIcon size={16} />
      <span>Replying to <strong>{replyingTo.username}</strong>: {replyingTo.content?.slice(0, 60)}{replyingTo.content?.length > 60 ? '…' : ''}</span>
      <button onClick={() => setReplyingTo(null)}><XMarkIcon size={16} /></button>
      </div>
    )}

    {/* Input area */}
    <div className="dm-input-container">
    {/* Upload progress bar */}
    {isUploading && (
      <div className="dm-upload-progress-bar-container">
        <div className="dm-upload-progress-info">
          <span className="dm-upload-progress-label">
            {uploadProgress !== null ? `Uploading… ${uploadProgress}%` : 'Preparing upload…'}
          </span>
          <button
            type="button"
            className="dm-upload-cancel-btn"
            onClick={cancelUpload}
            title="Cancel upload"
          >
            <XMarkIcon size={14} />
            Cancel
          </button>
        </div>
        <div className="dm-upload-progress-track">
          <div
            className="dm-upload-progress-fill"
            style={{ width: `${uploadProgress ?? 0}%` }}
          />
        </div>
      </div>
    )}

    {/* Attachment preview */}
    {attachments.length > 0 && (
      <div className="attachment-preview-bar">
      {attachments.map((file, i) => (
        <div key={i} className="attachment-preview-item">
        <DocumentTextIcon size={16} />
        <span className="attachment-name">{file.name}</span>
        <button type="button" className="attachment-remove" onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}>
        <XMarkIcon size={14} />
        </button>
        </div>
      ))}
      </div>
    )}

    <input
    type="file"
    ref={fileInputRef}
    onChange={async (e) => { await processFiles(e.target.files); e.target.value = '' }}
    style={{ display: 'none' }}
    multiple
    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip,.rar,.svg"
    />

    <div className="dm-input-wrapper">
    <ChatInput
    ref={inputRef}
    value={inputValue}
    onChange={handleInputChange}
    onFocus={handleInputFocus}
    placeholder={`Message @${recipient?.username || 'user'}`}
    onSubmit={handleSendMessage}
    onKeyDown={handleKeyDown}
    onAttachClick={() => fileInputRef.current?.click()}
    onEmojiClick={() => setShowEmojiPicker(p => !p)}
    onKlipyClick={toggleKlipyPicker}
    onVoiceMessageSent={handleVoiceMessageSent}
    voiceContext="dm"
    voiceServerId={null}
    />

    {showEmojiPicker && (
      <div className="emoji-picker-popover">
      <EmojiPicker
      onSelect={handleEmojiSelect}
      onClose={() => setShowEmojiPicker(false)}
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

    <E2eeEnableModal
    isOpen={showE2eeModal}
    onClose={() => setShowE2eeModal(false)}
    conversationId={conversation?.id}
    otherUser={recipient}
    onEnabled={() => {
      getDmEncryptionFullStatus(conversation?.id).then(setDmEncryptionStatus)
    }}
    />

    <E2eeKeyPromptModal
    isOpen={showKeyPrompt}
    onClose={() => setShowKeyPrompt(false)}
    conversationId={conversation?.id}
    mode={dmEncryptionStatus?.mode}
    otherUser={recipient}
    encryptedKeyData={(() => {
      // Get stored encrypted key data for password mode
      try {
        const stored = localStorage.getItem(`dm_e2e_${conversation?.id}`)
        if (stored) {
          const parsed = JSON.parse(stored)
          // For password mode, we need the encryptedKey
          if (parsed.encryptedKey) {
            return parsed
          }
          // For transparent mode with plain key, wrap it
          if (parsed.key && parsed.mode === 'transparent') {
            return { encryptedKey: parsed.key, mode: 'transparent' }
          }
        }
      } catch (e) {
        console.error('[DMChat] Error getting encryptedKeyData:', e)
      }
      return null
    })()}
    onKeyProvided={(key) => {
      // Store the decrypted key based on mode
      const mode = dmEncryptionStatus?.mode
      if (mode === 'password') {
        // For password mode, we store the key directly (already decrypted)
        localStorage.setItem(`dm_e2e_${conversation?.id}`, JSON.stringify({
          key,
          mode: 'password',
          savedAt: Date.now()
        }))
      } else {
        localStorage.setItem(`dm_e2e_${conversation?.id}`, JSON.stringify({
          key,
          mode: mode,
          savedAt: Date.now()
        }))
      }
      setNeedsKey(false)
      setShowKeyPrompt(false)
      // Reload messages to decrypt
      loadMessages()
    }}
    />

    {messageContextMenu && selectedMessage && (
      <div className="context-menu-overlay" onClick={closeMessageContextMenu}>
      <MessageContextMenu
      position={messageContextMenu}
      onClose={closeMessageContextMenu}
      message={selectedMessage}
      onReply={(msg) => {
        setReplyingTo(msg)
      }}
      onCopy={(msg) => {
        navigator.clipboard.writeText(msg.content)
      }}
      onEdit={(msg) => {
        setEditingMessage(msg.id)
        setEditContent(msg.content)
      }}
      onDelete={(msg) => {
        if (confirm('Delete this message?')) {
          apiService.deleteDMMessage(conversation.id, msg.id)
          .then(() => loadMessages())
          .catch(err => console.error('Failed to delete message:', err))
        }
      }}
      onAddReaction={(msg) => {
        const rect = document.querySelector(`[data-message-id="${msg.id}"]`)?.getBoundingClientRect()
        if (rect) {
          setEmojiPickerAnchor(rect)
          setShowMessageEmojiPicker(msg.id)
        }
      }}
      canEdit={selectedMessage.userId === user?.id}
      canDelete={selectedMessage.userId === user?.id}
      isOwn={selectedMessage.userId === user?.id}
      />
      </div>
    )}

    {/* Encryption Request Modal */}
    <DmEncryptionRequestModal
    isOpen={showRequestModal}
    onClose={() => {
      setShowRequestModal(false)
      setPendingRequest(null)
    }}
    request={pendingRequest}
    conversation={conversation}
    alreadyHandled={!!encryptionRequestMessage}
    onAccepted={() => {
      // Refresh encryption status
      getDmEncryptionFullStatus(conversation.id).then(setDmEncryptionStatus)
    }}
    onDeclined={() => {
      // Refresh encryption status
      getDmEncryptionFullStatus(conversation.id).then(setDmEncryptionStatus)
    }}
    />

    {/* Portal-based emoji picker for reactions */}
    <ReactionEmojiPicker
    isOpen={!!showMessageEmojiPicker}
    anchorRect={emojiPickerAnchor}
    onSelect={(emoji) => {
      if (showMessageEmojiPicker) {
        handleAddReaction(showMessageEmojiPicker, serializeReactionEmoji(emoji))
      }
    }}
    onClose={() => {
      setShowMessageEmojiPicker(null)
      setEmojiPickerAnchor(null)
    }}
    />

    {/* ── Danger modal — received message blocked by safety scan ── */}
    {dangerModal && createPortal(
      <div className="dm-danger-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="danger-modal-title">
        <div className="dm-danger-modal">
          <div className="dm-danger-modal-icon">🛡️</div>
          <h2 id="danger-modal-title" className="dm-danger-modal-title">
            Message Blocked
          </h2>
          <p className="dm-danger-modal-body">
            A message from <strong>{dangerModal.senderName}</strong> was blocked by your local safety filter
            because it may contain harmful content.
          </p>
          {dangerModal.blockReasons.length > 0 && (
            <ul className="dm-danger-modal-reasons">
              {dangerModal.blockReasons.map(r => (
                <li key={r} className="dm-danger-modal-reason-item">
                  {r.replace(/_/g, ' ')}
                </li>
              ))}
            </ul>
          )}
          {dangerModal.reported && (
            <p className="dm-danger-modal-reported">
              ✅ This message has been automatically reported to the server for review.
            </p>
          )}
          <div className="dm-danger-modal-actions">
            {!dangerModal.reported && dangerModal.senderUserId && (
              <button
                className="btn btn-danger"
                onClick={async () => {
                  const selfAgeRaw = Number(user?.ageVerification?.age ?? user?.ageVerification?.estimatedAge)
                  const selfAge = Number.isFinite(selfAgeRaw) ? selfAgeRaw : null
                  const recipientContext = {
                    isMinor: !!(user?.ageVerification?.verified && (user?.ageVerification?.category === 'child' || (selfAge !== null && selfAge < 18))),
                    isUnder16: !!(user?.ageVerification?.verified && (selfAge !== null ? selfAge < 16 : user?.ageVerification?.category === 'child'))
                  }
                  const reportPayload = {
                    contextType: 'dm',
                    reportType: 'threat',
                    accusedUserId: dangerModal.senderUserId,
                    targetUserId: user?.id || null,
                    conversationId: conversation.id,
                    contentFlags: dangerModal.flags,
                    targetAgeContext: recipientContext
                  }
                  const signature = await buildClientSignature(reportPayload)
                  apiService.submitSafetyReport({ ...reportPayload, clientSignature: signature }).catch(() => {})
                  setDangerModal(prev => prev ? { ...prev, reported: true } : prev)
                }}
              >
                Report to Server
              </button>
            )}
            <button
              className="btn btn-secondary"
              onClick={() => setDangerModal(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}
    </div>
  )
}

export default DMChat
