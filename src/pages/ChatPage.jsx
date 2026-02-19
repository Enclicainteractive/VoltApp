import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { MessageSquare, Lock, Menu, ChevronLeft, Users } from 'lucide-react'
import ServerSidebar from '../components/ServerSidebar'
import ChannelSidebar from '../components/ChannelSidebar'
import ChatArea from '../components/ChatArea'
import MemberSidebar from '../components/MemberSidebar'
import FriendsPage from '../components/FriendsPage'
import Discovery from '../components/Discovery'
import DMList from '../components/DMList'
import SystemMessagePanel from '../components/SystemMessagePanel'
import DMChat from '../components/DMChat'
import VoiceChannel from '../components/VoiceChannel'
import VoiceChannelPreview from '../components/VoiceChannelPreview'
import SettingsModal from '../components/modals/SettingsModal'
import ServerSettingsModal from '../components/modals/ServerSettingsModal'
import UserProfileModal from '../components/modals/UserProfileModal'
import CreateServerModal from '../components/modals/CreateServerModal'
import JoinServerModal from '../components/modals/JoinServerModal'
import AgeVerificationModal from '../components/modals/AgeVerificationModal'
import AdminPanel from '../components/AdminPanel'
import NotificationToast from '../components/NotificationToast'
import VoiceInfoModal from '../components/VoiceInfoModal'
import MobileNav from '../components/MobileNav'
import { useSocket } from '../contexts/SocketContext'
import { useAuth } from '../contexts/AuthContext'
import { useE2e } from '../contexts/E2eContext'
import { useE2eTrue } from '../contexts/E2eTrueContext'
import { apiService } from '../services/apiService'
import { soundService } from '../services/soundService'
import { settingsService } from '../services/settingsService'
import '../assets/styles/ChatPage.css'

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
  
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  
  return isMobile
}

const ChatPage = () => {
  const navigate = useNavigate()
  const { serverId, channelId } = useParams()
  const { socket, connected, serverUpdates, clearServerUpdate } = useSocket()
  const { user, refreshUser, isAuthenticated } = useAuth()
  const { 
    decryptMessageFromServer, 
    isEncryptionEnabled, 
    hasDecryptedKey 
  } = useE2e()
  const e2eTrue = useE2eTrue()
  const isMobile = useIsMobile()
  
  const [servers, setServers] = useState([])
  const [currentServer, setCurrentServer] = useState(null)
  const [channels, setChannels] = useState([])
  const [members, setMembers] = useState([])
  const [channelMessages, setChannelMessages] = useState({})
  const [channelScrollPositions, setChannelScrollPositions] = useState({})
  const [loading, setLoading] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsInitialTab, setSettingsInitialTab] = useState('account')
  const [showServerSettings, setShowServerSettings] = useState(false)
  const [serverSettingsTab, setServerSettingsTab] = useState('overview')
  const [showUserProfile, setShowUserProfile] = useState(null)
  const [showCreateServer, setShowCreateServer] = useState(false)
  const [showJoinServer, setShowJoinServer] = useState(false)
  const [viewMode, setViewMode] = useState('server')
  const [activeVoiceChannel, setActiveVoiceChannel] = useState(null)
  const [voicePreviewChannel, setVoicePreviewChannel] = useState(null)
  const [voiceViewMode, setVoiceViewMode] = useState('full')
  const [voiceFloating, setVoiceFloating] = useState(false)
  const [selectedVoiceChannelId, setSelectedVoiceChannelId] = useState(null)
  const [voiceParticipantsByChannel, setVoiceParticipantsByChannel] = useState({})
  const [leavingVoiceChannelId, setLeavingVoiceChannelId] = useState(null)
  const isJoiningVoiceRef = useRef(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isDeafened, setIsDeafened] = useState(false)
  const [showVoiceInfo, setShowVoiceInfo] = useState(false)
  const [voiceJoinKey, setVoiceJoinKey] = useState(0)
  const [selectedDM, setSelectedDM] = useState(null)
  const [themeStyles, setThemeStyles] = useState({})
  const [pendingAgeChannel, setPendingAgeChannel] = useState(null)
  const [ageGateNotice, setAgeGateNotice] = useState('')
  const [blockedAgeChannels, setBlockedAgeChannels] = useState(new Set())
  const [showMembers, setShowMembers] = useState(true)
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [contentCollapsed, setContentCollapsed] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isModerator, setIsModerator] = useState(false)
  const [friendRequestCount, setFriendRequestCount] = useState(0)
  const [dmNotifications, setDmNotifications] = useState([])
  const [serverUnreadCounts, setServerUnreadCounts] = useState({})
  
  const [mobileTab, setMobileTab] = useState('home')
  const [showChannelDrawer, setShowChannelDrawer] = useState(false)
  const [mobileBack, setMobileBack] = useState(null)
  const [isVideoOn, setIsVideoOn] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [voiceExpanded, setVoiceExpanded] = useState(false)
  const [categories, setCategories] = useState([])
  const [serverEmojis, setServerEmojis] = useState([])
  
  const settings = settingsService.getSettings()
  const serverMutes = settings.serverMutes || {}

  const loadNotifications = async () => {
    try {
      const [friendRes, dmRes, unreadRes] = await Promise.all([
        apiService.getFriendRequests(),
        apiService.getDirectMessages(),
        apiService.getUnreadCounts().catch(() => ({ data: {} }))
      ])
      const incomingRequests = friendRes.data?.incoming || []
      setFriendRequestCount(incomingRequests.length)
      
      const dms = dmRes.data || []
      const unreadDMs = dms.filter(dm => dm.unreadCount > 0)
      setDmNotifications(unreadDMs)
      
      if (unreadRes.data) {
        const counts = {}
        for (const [serverId, data] of Object.entries(unreadRes.data)) {
          if (!serverMutes[serverId]) {
            counts[serverId] = data.unread || 0
          }
        }
        setServerUnreadCounts(counts)
      }
    } catch (err) {
      console.error('Failed to load notifications:', err)
    }
  }

  useEffect(() => {
    if (isAuthenticated) {
      loadNotifications()
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (!socket || !connected) return
    
    const handleNewFriendRequest = () => {
      soundService.notification()
      loadNotifications()
    }
    
    const handleDMNotification = (data) => {
      soundService.dmReceived()
      loadNotifications()
    }
    
    const handleMessage = (data) => {
      loadNotifications()
    }
    
    socket.on('friend:request', handleNewFriendRequest)
    socket.on('dm:notification', handleDMNotification)
    socket.on('message', handleMessage)
    
    return () => {
      socket.off('friend:request', handleNewFriendRequest)
      socket.off('dm:notification', handleDMNotification)
      socket.off('message', handleMessage)
    }
  }, [socket, connected])

  useEffect(() => {
    if (serverId === 'friends') {
      setViewMode('friends')
    } else if (serverId === 'dms') {
      setViewMode('dms')
    } else if (serverId === 'discovery') {
      setViewMode('discovery')
    } else if (serverId === 'home' || serverId === undefined || serverId === null || serverId === 'null') {
      setViewMode('home')
    } else {
      setViewMode('server')
    }
  }, [serverId])

  const ageVerified = useMemo(() => {
    const verification = user?.ageVerification
    if (!verification?.verified) return false
    if (verification?.category !== 'adult') return false
    // 18+ verifications never expire; only non-adult ones can expire
    if (verification.expiresAt && new Date(verification.expiresAt) < new Date()) return false
    return true
  }, [user])

  // Get messages for current channel
  const messages = channelMessages[channelId] || []
  const currentScrollPosition = channelScrollPositions[channelId] || 0

  useEffect(() => {
    console.log('[ChatPage] Initial load')
    loadServers()
    refreshUser?.()
    checkAdminStatus()
  }, [])

  const checkAdminStatus = async () => {
    try {
      const res = await apiService.getMyAdminRole()
      setIsAdmin(res.data.isAdmin)
      setIsModerator(res.data.isModerator)
    } catch (err) {
      console.error('Failed to check admin status:', err)
    }
  }

  useEffect(() => {
    console.log('[ChatPage] ServerId changed to:', serverId)
    const safeServerId = serverId
    
    if (safeServerId === 'friends') {
      setViewMode('friends')
    } else if (safeServerId === 'dms') {
      setViewMode('dms')
    } else if (safeServerId === 'discovery') {
      setViewMode('discovery')
    } else if (safeServerId && safeServerId !== 'null' && safeServerId !== 'undefined') {
      setViewMode('server')
      loadServerData(safeServerId)
    } else {
      if (servers.length > 0) {
        setViewMode('server')
      } else {
        setViewMode('home')
      }
    }
  }, [serverId, servers.length])

  useEffect(() => {
    if (viewMode === 'dms' || viewMode === 'friends' || viewMode === 'discovery' || viewMode === 'system') {
      if (activeVoiceChannel && !voiceFloating) {
        setVoiceFloating(true)
      }
    } else if (viewMode === 'server') {
      if (activeVoiceChannel && voiceFloating) {
        setVoiceFloating(false)
        // Don't change voiceViewMode here - let the render logic determine it
        // based on selectedVoiceChannelId (mini for text channel, full for voice channel)
        setContentCollapsed(false)
      }
    }
  }, [viewMode, activeVoiceChannel])

  useEffect(() => {
    console.log('[ChatPage] ChannelId changed to:', channelId)
    
    if (channelId && channelId !== 'null') {
      const target = channels.find(c => c.id === channelId)
      if (target?.nsfw && !ageVerified && user !== null) {
        if (user?.ageVerification?.category === 'child') {
          setAgeGateNotice('This channel is 18+. Your account is marked under 18, so access is blocked.')
          setPendingAgeChannel(target)
          return
        }
        setAgeGateNotice('')
        setPendingAgeChannel(target)
        return
      }
      if (blockedAgeChannels.has(channelId)) {
        setAgeGateNotice('This channel is age-restricted. Please complete age verification to view messages.')
        setPendingAgeChannel(target)
        return
      }
      setPendingAgeChannel(null)
      setAgeGateNotice('')
      soundService.channelSwitch()
      
      // Check if we already have messages for this channel
      if (channelMessages[channelId] && channelMessages[channelId].length > 0) {
        console.log('[ChatPage] Restoring cached messages for channel:', channelId)
      } else {
        loadMessages(channelId)
      }
    } else {
      setAgeGateNotice('')
      setPendingAgeChannel(null)
    }
  }, [channelId, channels, ageVerified, blockedAgeChannels, user])

  // Save current channel state before switching
  const saveCurrentChannelState = useCallback((scrollTop) => {
    if (channelId) {
      setChannelMessages(prev => ({
        ...prev,
        [channelId]: messages
      }))
      setChannelScrollPositions(prev => ({
        ...prev,
        [channelId]: scrollTop
      }))
    }
  }, [channelId, messages])

  useEffect(() => {
    if (!socket || !connected) return

    const handleNewMessage = async (message) => {
      console.log('[Socket] New message received:', message)
      
      let processedMessage = { ...message }
      
      // Try True E2EE decryption first (has epoch field)
      if (message.encrypted && message.epoch && serverId && e2eTrue) {
        try {
          const decrypted = await e2eTrue.decryptMessage(message, serverId)
          processedMessage.content = decrypted
          processedMessage._decrypted = true
        } catch (err) {
          console.error('[ChatPage] True E2EE decryption error:', err)
          processedMessage.content = '[Encrypted message - could not decrypt]'
        }
      } else if (message.encrypted && serverId && isEncryptionEnabled(serverId) && hasDecryptedKey(serverId)) {
        try {
          const encryptedData = JSON.parse(message.content)
          if (encryptedData._encrypted) {
            const decryptedContent = await decryptMessageFromServer({
              iv: encryptedData.iv,
              content: encryptedData.content
            }, serverId)
            processedMessage.content = decryptedContent
            processedMessage._decrypted = true
          }
        } catch (err) {
          console.error('[ChatPage] Legacy decryption error:', err)
          processedMessage.content = '[Encrypted message - could not decrypt]'
        }
      }
      
      if (processedMessage.channelId === channelId) {
        setChannelMessages(prev => ({
          ...prev,
          [channelId]: [...(prev[channelId] || []), processedMessage]
        }))
        // Play sound for messages from others
        if (processedMessage.userId !== user?.id) {
          soundService.messageReceived()
        }
      }
    }

    const handleMessageEdited = (message) => {
      console.log('[Socket] Message edited:', message)
      if (message.channelId === channelId) {
        setChannelMessages(prev => ({
          ...prev,
          [channelId]: (prev[channelId] || []).map(m => m.id === message.id ? message : m)
        }))
      }
    }

    const handleMessageDeleted = ({ messageId, channelId: cId }) => {
      console.log('[Socket] Message deleted:', messageId)
      if (cId === channelId) {
        setChannelMessages(prev => ({
          ...prev,
          [channelId]: (prev[channelId] || []).filter(m => m.id !== messageId)
        }))
      }
    }

    const handleReactionUpdated = ({ messageId, reactions }) => {
      setChannelMessages(prev => ({
        ...prev,
        [channelId]: (prev[channelId] || []).map(m => 
          m.id === messageId ? { ...m, reactions } : m
        )
      }))
    }

    socket.on('message:new', handleNewMessage)
    socket.on('message:edited', handleMessageEdited)
    socket.on('message:deleted', handleMessageDeleted)
    socket.on('reaction:updated', handleReactionUpdated)

    return () => {
      socket.off('message:new', handleNewMessage)
      socket.off('message:edited', handleMessageEdited)
      socket.off('message:deleted', handleMessageDeleted)
      socket.off('reaction:updated', handleReactionUpdated)
    }
  }, [socket, connected, channelId])

  useEffect(() => {
    if (socket && connected && serverId && serverId !== 'null') {
      socket.emit('server:join', serverId)
    }
  }, [socket, connected, serverId])

  // Keep the members list in sync with realtime presence events so that
  // the MemberSidebar's ONLINE / OFFLINE sections update without a page
  // reload.  We patch status + customStatus directly on the member objects
  // so the sidebar's initial-seed logic also gets fresh data.
  useEffect(() => {
    if (!socket || !connected) return

    const handleUserStatus = ({ userId, status, customStatus }) => {
      setMembers(prev => prev.map(m =>
        m.id === userId
          ? {
              ...m,
              status,
              ...(customStatus !== undefined ? { customStatus } : {})
            }
          : m
      ))
    }

    const handleMemberOffline = ({ userId }) => {
      if (!userId) return
      setMembers(prev => prev.map(m =>
        m.id === userId ? { ...m, status: 'offline' } : m
      ))
    }

    socket.on('user:status',   handleUserStatus)
    socket.on('member:offline', handleMemberOffline)

    return () => {
      socket.off('user:status',   handleUserStatus)
      socket.off('member:offline', handleMemberOffline)
    }
  }, [socket, connected])

  useEffect(() => {
    if (!socket || !connected) return

    const handleServerUpdated = (updatedServer) => {
      if (updatedServer.id === currentServer?.id) {
        setCurrentServer(updatedServer)
      }
      setServers(prev => prev.map(s => s.id === updatedServer.id ? updatedServer : s))
    }

    const handleChannelCreated = (channel) => {
      if (channel.serverId === currentServer?.id) {
        setChannels(prev => [...prev, channel])
      }
    }

    const handleChannelUpdated = (channel) => {
      if (channel.serverId === currentServer?.id) {
        setChannels(prev => prev.map(c => c.id === channel.id ? channel : c))
      }
    }

    const handleChannelDeleted = ({ channelId }) => {
      if (currentServer?.id) {
        setChannels(prev => prev.filter(c => c.id !== channelId))
      }
    }

    const handleChannelOrderUpdated = (updatedChannels) => {
      if (currentServer?.id && updatedChannels[0]?.serverId === currentServer.id) {
        setChannels(updatedChannels)
      }
    }

    socket.on('server:updated', handleServerUpdated)
    socket.on('channel:created', handleChannelCreated)
    socket.on('channel:updated', handleChannelUpdated)
    socket.on('channel:deleted', handleChannelDeleted)
    socket.on('channel:order-updated', handleChannelOrderUpdated)

    return () => {
      socket.off('server:updated', handleServerUpdated)
      socket.off('channel:created', handleChannelCreated)
      socket.off('channel:updated', handleChannelUpdated)
      socket.off('channel:deleted', handleChannelDeleted)
      socket.off('channel:order-updated', handleChannelOrderUpdated)
    }
  }, [socket, connected, currentServer?.id])

  const loadServers = async () => {
    try {
      console.log('[API] Loading servers...')
      const response = await apiService.getServers()
      console.log('[API] Servers loaded:', response.data)
      
      setServers(response.data)
      setLoading(false)
      
      if (response.data.length > 0 && (!serverId || serverId === 'null')) {
        const firstServer = response.data[0]
        console.log('[Navigation] Auto-selecting first server:', firstServer.id)
        navigate(`/chat/${firstServer.id}`, { replace: true })
      } else if (response.data.length === 0) {
        console.log('[Info] No servers found')
      }
    } catch (error) {
      console.error('[API] Failed to load servers:', error)
      setLoading(false)
    }
  }

  const handleLeaveServer = (serverId) => {
    setServers(prev => prev.filter(s => s.id !== serverId))
    if (currentServer?.id === serverId) {
      navigate('/chat', { replace: true })
    }
  }

  const loadServerData = async (id) => {
    try {
      console.log('[API] Loading full server data for:', id)
      
      const [serverRes, channelsRes, onlineRes, categoriesRes] = await Promise.all([
        apiService.getServer(id),
        apiService.getChannels(id),
        apiService.getOnlineMembers(id),
        apiService.getCategories(id).catch(() => ({ data: [] }))
      ])
      
      console.log('[API] Server:', serverRes.data.name)
      console.log('[API] Channels:', channelsRes.data.length)
      console.log('[API] Online members:', onlineRes.data.length)
      console.log('[API] Categories:', (categoriesRes.data || []).length)
      
      setCurrentServer(serverRes.data)
      setChannels(channelsRes.data)
      setCategories(categoriesRes.data || [])
      
      // Merge online status into members
      const membersWithStatus = (serverRes.data.members || []).map(member => {
        const onlineInfo = onlineRes.data.find(o => o.userId === member.id)
        if (onlineInfo) {
          return { ...member, status: onlineInfo.status, customStatus: onlineInfo.customStatus }
        }
        return { ...member, status: 'offline' }
      })
      setMembers(membersWithStatus)
      
      const defaultChannel = serverRes.data.defaultChannelId 
        ? channelsRes.data.find(c => c.id === serverRes.data.defaultChannelId)
        : null
      const firstChannel = channelsRes.data[0]
      const targetChannel = defaultChannel || firstChannel
      
      if (targetChannel && (!channelId || channelId === 'null')) {
        console.log('[Navigation] Auto-selecting channel:', targetChannel.name, '(default:', !!defaultChannel, ')')
        navigate(`/chat/${id}/${targetChannel.id}`, { replace: true })
      }
    } catch (error) {
      console.error('[API] Failed to load server data:', error)
    }
  }

  const loadMessages = async (cId) => {
    if (!cId || cId === 'null') return
    
    // Store the channelId we're loading for to verify later
    const loadingChannelId = cId
    
    // Only block if the channel is NSFW and user is not verified
    const target = channels.find(c => c.id === cId)
    if (target?.nsfw && !ageVerified) {
      console.log('[API] Skipping message load - age verification required for NSFW channel')
      return
    }
    
    if (blockedAgeChannels.has(cId)) {
      console.log('[API] Skipping message load - channel is blocked')
      return
    }
    
    try {
      console.log('[API] Loading messages for channel:', cId)
      const response = await apiService.getMessages(cId)
      console.log('[API] Loaded', response.data.length, 'messages')
      
      // Only set messages if we're still on the same channel
      if (loadingChannelId === channelId) {
        setChannelMessages(prev => ({
          ...prev,
          [cId]: response.data
        }))
      }
    } catch (error) {
      console.error('[API] Failed to load messages:', error)
      if (error?.response?.status === 451) {
        const blocked = channels.find(c => c.id === cId)
        setPendingAgeChannel(blocked || { id: cId })
        setAgeGateNotice('This channel is age-restricted. Please complete age verification to view messages.')
        setBlockedAgeChannels(prev => new Set(prev).add(cId))
      }
      if (loadingChannelId === channelId) {
        setChannelMessages(prev => ({
          ...prev,
          [cId]: []
        }))
      }
    }
  }

  const handleServerChange = (id) => {
    console.log('[User Action] Server change requested:', id)
    if (!id || id === 'home') {
      navigate('/chat')
      setViewMode('home')
    } else if (id === 'friends') {
      navigate('/chat/friends')
      setViewMode('friends')
    } else if (id === 'dms') {
      navigate('/chat/dms')
      setViewMode('dms')
    } else if (id === 'discovery') {
      navigate('/chat/discovery')
      setViewMode('discovery')
    } else {
      navigate(`/chat/${id}`)
      setViewMode('server')
    }
  }

  const handleChannelChange = (id, isVoice = false) => {
    console.log('[User Action] Channel change requested:', id, 'isVoice:', isVoice)
    if (serverId) {
      const targetChannel = channels.find(c => c.id === id)
      if (!isVoice && targetChannel?.nsfw && !ageVerified) {
        if (user?.ageVerification?.category === 'child') {
          setAgeGateNotice('This channel is 18+. Your account is marked under 18, so access is blocked.')
          setPendingAgeChannel(targetChannel)
          return
        }
        setAgeGateNotice('')
        setPendingAgeChannel(targetChannel)
        return
      }
      if (!isVoice && blockedAgeChannels.has(id)) {
        setAgeGateNotice('This channel is age-restricted. Please complete age verification to view messages.')
        setPendingAgeChannel(targetChannel)
        return
      }
      setAgeGateNotice('')
      setPendingAgeChannel(null)
      if (isVoice) {
        const voiceChannel = channels.find(c => c.id === id)
        // Always select voice channel in main view
        setSelectedVoiceChannelId(id)
        // Join if not already in a call in this channel
        if (!activeVoiceChannel || activeVoiceChannel.id !== id) {
          setActiveVoiceChannel(voiceChannel)
          setVoicePreviewChannel(null)
          setVoiceViewMode('full')
          setVoiceJoinKey(k => k + 1)
        }
      } else {
        // When clicking a text channel, clear the voice channel selection
        // so the text channel renders. The voice call stays alive via
        // activeVoiceChannel and shows as a mini bar.
        setSelectedVoiceChannelId(null)
        navigate(`/chat/${serverId}/${id}`)
      }
    }
  }

  const handleReturnToVoice = () => {
    if (activeVoiceChannel) {
      setSelectedVoiceChannelId(activeVoiceChannel.id)
    }
  }

  const handleAgeVerificationSuccess = async (verification) => {
    const updated = await refreshUser?.()
    const verdict = verification?.category || updated?.ageVerification?.category
    const nextChannel = pendingAgeChannel
    setPendingAgeChannel(null)
    if (verdict === 'adult') {
      setAgeGateNotice('')
      setBlockedAgeChannels(new Set())
      if (nextChannel?.id) {
        navigate(`/chat/${serverId}/${nextChannel.id}`)
        loadMessages(nextChannel.id)
      }
    } else {
      setAgeGateNotice('This channel is 18+. Your account is marked under 18, so access is blocked.')
      if (nextChannel?.id) {
        setBlockedAgeChannels(prev => new Set(prev).add(nextChannel.id))
      }
    }
  }

  const handleVoicePreview = (channel) => {
    setVoicePreviewChannel(channel)
  }

  const handleJoinFromPreview = () => {
    // Prevent double-clicks
    if (isJoiningVoiceRef.current || !voicePreviewChannel) return
    
    isJoiningVoiceRef.current = true
    setActiveVoiceChannel(voicePreviewChannel)
    setVoicePreviewChannel(null)
    setVoiceViewMode('full')
    setVoiceJoinKey(k => k + 1)
    
    // Reset after a short delay to allow next join
    setTimeout(() => {
      isJoiningVoiceRef.current = false
    }, 1000)
  }

  const toggleVoiceViewMode = () => {
    // When in mini mode and user clicks maximize, set selectedVoiceChannelId
    // to show the full voice view. When in full mode and user clicks minimize,
    // clear selectedVoiceChannelId to show the mini bar.
    if (selectedVoiceChannelId) {
      setSelectedVoiceChannelId(null)
    } else if (activeVoiceChannel) {
      setSelectedVoiceChannelId(activeVoiceChannel.id)
    }
  }

  const handleLeaveVoice = () => {
    const leftChannelId = activeVoiceChannel?.id
    setActiveVoiceChannel(null)
    setIsMuted(false)
    setIsDeafened(false)
    setSelectedVoiceChannelId(null)
    setContentCollapsed(false)
    setVoiceFloating(false)
    // Reset joining lock so user can rejoin immediately without page refresh
    isJoiningVoiceRef.current = false
    if (leftChannelId) {
      // Clear from the live map immediately
      setVoiceParticipantsByChannel(prev => {
        const next = { ...prev }
        delete next[leftChannelId]
        return next
      })
      // Tell ChannelSidebar to clear + re-fetch that channel's participants
      setLeavingVoiceChannelId(leftChannelId)
      // Reset after sidebar has had time to refetch
      setTimeout(() => setLeavingVoiceChannelId(null), 2000)
    }
  }

  const handleVoiceParticipantsChange = (channelId, participants) => {
    if (!channelId) return
    setVoiceParticipantsByChannel(prev => ({ ...prev, [channelId]: participants }))
  }

  const handleChannelDeleted = async (channel) => {
    try {
      await apiService.deleteChannel(channel.id)
      setChannels(prev => prev.filter(c => c.id !== channel.id))
      if (channel.id === channelId) {
        setMessages([])
        const next = channels.find(c => c.id !== channel.id)
        if (next) navigate(`/chat/${serverId}/${next.id}`)
        else navigate(`/chat/${serverId}`)
      }
    } catch (err) {
      console.error('Failed to delete channel:', err)
    }
  }

  const handleMemberKick = async (memberId) => {
    try {
      await apiService.kickMember(serverId, memberId)
      setMembers(prev => prev.filter(m => m.id !== memberId))
    } catch (err) {
      console.error('Failed to kick member:', err)
    }
  }

  const handleMemberBan = async (memberId) => {
    try {
      await apiService.banMember(serverId, memberId)
      setMembers(prev => prev.filter(m => m.id !== memberId))
    } catch (err) {
      console.error('Failed to ban member:', err)
    }
  }

  const handleAddFriend = async (userId) => {
    try {
      await apiService.sendFriendRequestById(userId)
    } catch (err) {
      console.error('Failed to send friend request:', err)
    }
  }

  const handleStartDM = async (userId) => {
    try {
      const res = await apiService.createDirectMessage(userId)
      setSelectedDM(res.data)
      setViewMode('dms')
      navigate('/chat/dms')
    } catch (err) {
      console.error('Failed to start DM:', err)
    }
  }

  useEffect(() => {
    if (currentServer) {
      const accent = currentServer.themeColor || '#1fb6ff'
      const banner = currentServer.bannerUrl || ''
      const background = currentServer.backgroundUrl || ''
      const bannerPos = currentServer.bannerPosition || 'cover'
      setThemeStyles({
        '--server-accent': accent,
        '--server-banner': banner ? `url(${banner})` : 'none',
        '--server-background': background ? `url(${background})` : 'none',
        '--server-banner-position': bannerPos
      })
      document.documentElement.style.setProperty('--server-accent', accent)
      if (banner) {
        document.documentElement.style.setProperty('--server-banner', `url(${banner})`)
      } else {
        document.documentElement.style.setProperty('--server-banner', 'none')
      }
      if (background) {
        document.documentElement.style.setProperty('--server-background', `url(${background})`)
      } else {
        document.documentElement.style.setProperty('--server-background', 'none')
      }
    } else {
      setThemeStyles({})
      document.documentElement.style.setProperty('--server-accent', '#1fb6ff')
      document.documentElement.style.setProperty('--server-banner', 'none')
      document.documentElement.style.setProperty('--server-background', 'none')
    }
  }, [currentServer])

  useEffect(() => {
    if (serverUpdates[currentServer?.id]) {
      const updated = serverUpdates[currentServer.id]
      setCurrentServer(updated)
      if (updated.channels) {
        setChannels(updated.channels)
      }
      if (updated.roles) {
        setMembers(prev => prev.map(m => ({
          ...m,
          roles: m.roles?.map(r => {
            const updatedRole = updated.roles.find(ur => ur.id === r.id)
            return updatedRole || r
          })
        })))
      }
      clearServerUpdate(currentServer.id)
    }
  }, [serverUpdates, currentServer?.id])

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading VoltChat...</p>
      </div>
    )
  }

  const handleMobileTabChange = (tab) => {
    setMobileTab(tab)
    if (tab === 'home') {
      handleServerChange('home')
    } else if (tab === 'servers') {
      handleServerChange(servers[0]?.id || 'home')
    } else if (tab === 'dms') {
      handleServerChange('dms')
    } else if (tab === 'friends') {
      handleServerChange('friends')
    } else if (tab === 'discovery') {
      handleServerChange('discovery')
    }
  }

  const getCurrentMobileTab = () => {
    if (serverId === 'friends' || viewMode === 'friends') return 'friends'
    if (serverId === 'dms' || viewMode === 'dms' || viewMode === 'system') return 'dms'
    if (serverId === 'discovery' || viewMode === 'discovery') return 'discovery'
    if (serverId && serverId !== 'home' && serverId !== 'null') return 'servers'
    return 'home'
  }

  return (
    <div className="chat-page" style={themeStyles}>
      {!isMobile && (
        <ServerSidebar 
          servers={servers} 
          currentServerId={serverId}
          onServerChange={handleServerChange}
          onCreateServer={loadServers}
          onOpenSettings={() => setShowSettings(true)}
          onOpenCreate={() => setShowCreateServer(true)}
          onOpenJoin={() => setShowJoinServer(true)}
          onOpenServerSettings={() => { setServerSettingsTab('overview'); setShowServerSettings(true) }}
          onLeaveServer={handleLeaveServer}
          onOpenAdmin={() => setShowAdminPanel(true)}
          isAdmin={isAdmin}
          friendRequestCount={friendRequestCount}
          dmNotifications={dmNotifications}
          serverUnreadCounts={serverUnreadCounts}
        />
      )}

      {isMobile && (
        <MobileNav
          currentTab={getCurrentMobileTab()}
          onTabChange={handleMobileTabChange}
          onCreateServer={() => setShowCreateServer(true)}
          onOpenSettings={() => setShowSettings(true)}
          friendRequestCount={friendRequestCount}
          dmNotifications={dmNotifications.length}
          serverUnreadCounts={serverUnreadCounts}
          servers={servers}
        />
      )}
      
      {viewMode === 'friends' ? (
        <>
          <DMList type="friends"
            onSelectConversation={(conv) => { setSelectedDM(conv); setViewMode('dms') }}
            onClose={() => {}}
            onOpenSystemInbox={() => setViewMode('system')}
          />
          <FriendsPage onStartDM={(conv) => {
            setSelectedDM(conv)
            setViewMode('dms')
            navigate('/chat/dms')
          }} />
        </>
      ) : viewMode === 'system' ? (
        <>
          <DMList
            type="dms"
            onSelectConversation={(conv) => { setSelectedDM(conv); setViewMode('dms') }}
            selectedConversation={null}
            onClose={(convId) => {}}
            onOpenSystemInbox={() => setViewMode('system')}
          />
          <SystemMessagePanel onClose={() => setViewMode('dms')} />
        </>
      ) : viewMode === 'dms' ? (
        <>
          <DMList 
            type="dms" 
            onSelectConversation={setSelectedDM}
            selectedConversation={selectedDM}
            onClose={(convId) => {
              if (selectedDM?.id === convId) setSelectedDM(null)
            }}
            onOpenSystemInbox={() => setViewMode('system')}
          />
          {selectedDM ? (
            <DMChat conversation={selectedDM} onShowProfile={(userId) => setShowUserProfile(userId)} />
          ) : (
            <div className="empty-state">
              <MessageSquare size={48} className="empty-state-icon" />
              <h2>Select a DM</h2>
              <p>Choose a conversation from the sidebar</p>
            </div>
          )}
        </>
      ) : viewMode === 'discovery' ? (
        <>
          <Discovery 
            onJoinServer={(serverId) => {
              loadServers()
            }}
          />
        </>
      ) : viewMode === 'home' ? (
        <>
          <div className="empty-state full hero simple-home">
            <div className="simple-welcome">
              <h2>Welcome to VoltChat</h2>
              <p>Create or join a server to get started</p>
              <div className="simple-actions">
                <button className="btn btn-primary btn-lg" onClick={() => setShowCreateServer(true)}>
                  Create Server
                </button>
                <button className="btn btn-secondary btn-lg" onClick={() => setShowJoinServer(true)}>
                  Join Server
                </button>
              </div>
            </div>
          </div>
        </>
      ) : serverId && serverId !== 'null' && currentServer ? (
        <>
          {isMobile && (
            <div className="mobile-header">
              <button className="mobile-header-btn" onClick={() => setShowChannelDrawer(true)}>
                <Menu size={20} />
              </button>
              <div className="mobile-header-title">
                <span className="mobile-server-name">{currentServer.name}</span>
                {channelId && (
                  <span className="mobile-channel-name">
                    {channels.find(c => c.id === channelId)?.name}
                  </span>
                )}
              </div>
              <button className="mobile-header-btn" onClick={() => setShowMembers(prev => !prev)}>
                <Users size={20} />
              </button>
            </div>
          )}
          
          {isMobile && showChannelDrawer && (
            <>
              <div 
                className="channel-sidebar-overlay visible" 
                onClick={() => setShowChannelDrawer(false)}
              />
              <div className="channel-sidebar open">
                <div className="mobile-drawer-header">
                  <button onClick={() => setShowChannelDrawer(false)}>
                    <ChevronLeft size={20} />
                  </button>
                  <span>{currentServer.name}</span>
                </div>
                <ChannelSidebar 
                  server={currentServer}
                  channels={channels}
                  categories={categories}
                  currentChannelId={channelId}
                  selectedVoiceChannelId={selectedVoiceChannelId}
                  onChannelChange={(id, isVoice) => {
                    handleChannelChange(id, isVoice)
                    setShowChannelDrawer(false)
                  }}
                  onCreateChannel={() => loadServerData(serverId)}
                  onOpenServerSettings={() => { setServerSettingsTab('overview'); setShowServerSettings(true); setShowChannelDrawer(false) }}
                  onOpenSettings={() => { setShowSettings(true); setShowChannelDrawer(false) }}
                  onVoicePreview={handleVoicePreview}
                  activeVoiceChannel={activeVoiceChannel}
                  voiceParticipantsByChannel={voiceParticipantsByChannel}
                  leavingVoiceChannelId={leavingVoiceChannelId}
                  onDeleteChannel={handleChannelDeleted}
                  onRefreshChannels={() => loadServerData(serverId)}
                  onInvite={() => { setServerSettingsTab('invites'); setShowServerSettings(true); setShowChannelDrawer(false) }}
                  onReturnToVoice={() => { handleReturnToVoice(); setShowChannelDrawer(false) }}
                  onLeaveVoice={() => { handleLeaveVoice(); setShowChannelDrawer(false) }}
                  isMuted={isMuted}
                  isDeafened={isDeafened}
                  onToggleMute={() => setIsMuted(!isMuted)}
                  onToggleDeafen={() => { setIsDeafened(!isDeafened); if (!isDeafened) setIsMuted(true) }}
                />
              </div>
            </>
          )}

          {!isMobile && (
            <ChannelSidebar 
              server={currentServer}
              channels={channels}
              categories={categories}
              currentChannelId={channelId}
              selectedVoiceChannelId={selectedVoiceChannelId}
              onChannelChange={handleChannelChange}
              onCreateChannel={() => loadServerData(serverId)}
              onOpenServerSettings={() => { setServerSettingsTab('overview'); setShowServerSettings(true) }}
              onOpenSettings={() => setShowSettings(true)}
              onVoicePreview={handleVoicePreview}
              activeVoiceChannel={activeVoiceChannel}
              voiceParticipantsByChannel={voiceParticipantsByChannel}
              leavingVoiceChannelId={leavingVoiceChannelId}
              onDeleteChannel={handleChannelDeleted}
              onRefreshChannels={() => loadServerData(serverId)}
              onInvite={() => { setServerSettingsTab('invites'); setShowServerSettings(true) }}
              onReturnToVoice={handleReturnToVoice}
              onLeaveVoice={handleLeaveVoice}
              isMuted={isMuted}
              isDeafened={isDeafened}
              onToggleMute={() => setIsMuted(!isMuted)}
              onToggleDeafen={() => { setIsDeafened(!isDeafened); if (!isDeafened) setIsMuted(true) }}
            />
          )}
          {/* When voice channel is selected as main view, show placeholder or ChatArea behind the mini bar */}
          {channelId && channelId !== 'null' ? (
            <>
              {ageGateNotice ? (
                <div className="empty-state">
                  <Lock size={48} className="empty-state-icon" />
                  <h2>Age restricted</h2>
                  <p>{ageGateNotice}</p>
                  {pendingAgeChannel && (
                    <button className="btn btn-primary" onClick={() => setPendingAgeChannel(pendingAgeChannel)}>
                      Retry verification
                    </button>
                  )}
                </div>
              ) : pendingAgeChannel?.id === channelId ? (
                <div className="empty-state">
                  <Lock size={48} className="empty-state-icon" />
                  <h2>Age verification required</h2>
                  <p>This channel is age-restricted. Complete verification to continue.</p>
                  <button className="btn btn-primary" onClick={() => setPendingAgeChannel(pendingAgeChannel)}>
                    Start verification
                  </button>
                </div>
              ) : (
                <>
                  {!contentCollapsed && (
                  <ChatArea 
                    channelId={channelId}
                    serverId={serverId}
                    channels={channels}
                    messages={messages}
                    onLoadMoreMessages={(olderMessages) => {
                      setChannelMessages(prev => {
                        const currentMessages = prev[channelId] || []
                        const existingIds = new Set(currentMessages.map(m => m.id))
                        const newMessages = olderMessages.filter(m => !existingIds.has(m.id))
                        return {
                          ...prev,
                          [channelId]: [...newMessages, ...currentMessages]
                        }
                      })
                    }}
                    onSaveScrollPosition={saveCurrentChannelState}
                    scrollPosition={currentScrollPosition}
                    onShowProfile={(userId) => setShowUserProfile(userId)}
                    onAgeGateTriggered={() => {
                      const target = channels.find(c => c.id === channelId)
                      if (target?.nsfw && !ageVerified) {
                        if (user?.ageVerification?.category === 'child') {
                          setAgeGateNotice('This channel is 18+. Your account is marked under 18, so access is blocked.')
                          setPendingAgeChannel(null)
                          return
                        }
                        setPendingAgeChannel(target)
                      }
                    }}
                    onToggleMembers={() => setShowMembers(prev => !prev)}
                  />
                  )}
                  {!contentCollapsed && (
                  <MemberSidebar 
                    members={members} 
                    server={currentServer}
                    visible={showMembers}
                    onMemberClick={(userId) => setShowUserProfile(userId)}
                    onStartDM={handleStartDM}
                    onKick={handleMemberKick}
                    onBan={handleMemberBan}
                    onAddFriend={handleAddFriend}
                  />
                  )}
                </>
              )}
            </>
          ) : (
            <div className="empty-state simple">
              <p>no channels are visible for you :(</p>
            </div>
          )}
          {voicePreviewChannel && !activeVoiceChannel && (
            <div className="voice-preview-overlay" onClick={() => setVoicePreviewChannel(null)}>
              <VoiceChannelPreview
                channel={voicePreviewChannel}
                onJoin={handleJoinFromPreview}
                onClose={() => setVoicePreviewChannel(null)}
              />
            </div>
          )}
        </>
      ) : (
        <div className="empty-state full hero simple-home">
          <div className="simple-welcome">
            <h2>Welcome to VoltChat</h2>
            <p>Create or join a server to get started</p>
            <div className="simple-actions">
              <button className="btn btn-primary btn-lg" onClick={() => setShowCreateServer(true)}>
                Create Server
              </button>
              <button className="btn btn-secondary btn-lg" onClick={() => setShowJoinServer(true)}>
                Join Server
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unified Voice panel - SINGLE persistent render that adapts to view mode
          This prevents WebRTC reconnection when switching between views.
          viewMode is 'full' when selectedVoiceChannelId is set, otherwise 'mini' */}
      {activeVoiceChannel && (
        <div className={`voice-container ${selectedVoiceChannelId ? 'full' : (voiceFloating ? 'mini' : (viewMode === 'server' ? 'mini' : voiceViewMode))}`}>
          <div className="voice-container-header">
            <span>{activeVoiceChannel.name}</span>
            <div className="voice-view-controls">
              <button onClick={() => setContentCollapsed(!contentCollapsed)} title={contentCollapsed ? 'Show Chat' : 'Hide Chat'}>
                {contentCollapsed ? '▶' : '◀'}
              </button>
              <button onClick={toggleVoiceViewMode} title={voiceViewMode === 'full' ? 'Minimize' : 'Maximize'}>
                {voiceViewMode === 'full' ? '−' : '□'}
              </button>
            </div>
          </div>
          <VoiceChannel
            key={activeVoiceChannel.id}
            channel={activeVoiceChannel}
            joinKey={voiceJoinKey}
            onLeave={() => {
              handleLeaveVoice()
              setVoiceExpanded(false)
            }}
            viewMode={selectedVoiceChannelId ? 'full' : (voiceFloating ? 'mini' : (viewMode === 'server' ? 'mini' : voiceViewMode))}
            isMuted={isMuted}
            isDeafened={isDeafened}
            onMuteChange={setIsMuted}
            onDeafenChange={setIsDeafened}
            onOpenSettings={() => { setSettingsInitialTab('voice'); setShowSettings(true) }}
            onParticipantsChange={handleVoiceParticipantsChange}
            onShowConnectionInfo={() => setShowVoiceInfo(true)}
          />
        </div>
      )}

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} initialTab={settingsInitialTab} />
      )}

      {showServerSettings && currentServer && (
        <ServerSettingsModal 
          server={currentServer}
          initialTab={serverSettingsTab}
          onClose={() => { setShowServerSettings(false); setServerSettingsTab('overview') }}
          onUpdate={(updated) => {
            setCurrentServer(updated)
            setMembers(updated.members || [])
          }}
          onDelete={() => {
            setCurrentServer(null)
            loadServers()
            navigate('/chat')
          }}
        />
      )}

      {showUserProfile && (
        <UserProfileModal 
          userId={showUserProfile}
          server={currentServer}
          members={members}
          onClose={() => setShowUserProfile(null)}
          onStartDM={(conv) => {
            setSelectedDM(conv)
            setViewMode('dms')
            navigate('/chat/dms')
            setShowUserProfile(null)
          }}
        />
      )}

      {showCreateServer && (
        <CreateServerModal
          onClose={() => setShowCreateServer(false)}
          onSuccess={() => {
            setShowCreateServer(false)
            loadServers()
          }}
        />
      )}

      {showJoinServer && (
        <JoinServerModal
          onClose={() => setShowJoinServer(false)}
          onSuccess={() => {
            setShowJoinServer(false)
            loadServers()
          }}
        />
      )}

      {pendingAgeChannel && (
        <AgeVerificationModal
          channelName={pendingAgeChannel.name}
          onClose={() => setPendingAgeChannel(null)}
          onVerified={handleAgeVerificationSuccess}
        />
      )}

      {showAdminPanel && (
        <AdminPanel onClose={() => setShowAdminPanel(false)} />
      )}

      {/* Notification Toast Container */}
      <NotificationToast />

      {/* Voice connection info modal */}
      {showVoiceInfo && activeVoiceChannel && (
        <VoiceInfoModal
          channel={activeVoiceChannel}
          onClose={() => setShowVoiceInfo(false)}
        />
      )}
    </div>
  )
}

export default ChatPage
