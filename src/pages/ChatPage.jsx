import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { MessageSquare, Lock } from 'lucide-react'
import ServerSidebar from '../components/ServerSidebar'
import ChannelSidebar from '../components/ChannelSidebar'
import ChatArea from '../components/ChatArea'
import MemberSidebar from '../components/MemberSidebar'
import FriendsPage from '../components/FriendsPage'
import Discovery from '../components/Discovery'
import DMList from '../components/DMList'
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
import { useSocket } from '../contexts/SocketContext'
import { useAuth } from '../contexts/AuthContext'
import { useE2e } from '../contexts/E2eContext'
import { apiService } from '../services/apiService'
import { soundService } from '../services/soundService'
import { settingsService } from '../services/settingsService'
import '../assets/styles/ChatPage.css'

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
  const isJoiningVoiceRef = useRef(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isDeafened, setIsDeafened] = useState(false)
  const [selectedDM, setSelectedDM] = useState(null)
  const [themeStyles, setThemeStyles] = useState({})
  const [pendingAgeChannel, setPendingAgeChannel] = useState(null)
  const [ageGateNotice, setAgeGateNotice] = useState('')
  const [blockedAgeChannels, setBlockedAgeChannels] = useState(new Set())
  const [showMembers, setShowMembers] = useState(true)
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isModerator, setIsModerator] = useState(false)
  const [friendRequestCount, setFriendRequestCount] = useState(0)
  const [dmNotifications, setDmNotifications] = useState([])
  const [serverUnreadCounts, setServerUnreadCounts] = useState({})
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
      loadNotifications()
    }
    
    const handleDMNotification = (data) => {
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
      
      if (message.encrypted && serverId && isEncryptionEnabled(serverId) && hasDecryptedKey(serverId)) {
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
          console.error('[ChatPage] Decryption error:', err)
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
      
      const [serverRes, channelsRes] = await Promise.all([
        apiService.getServer(id),
        apiService.getChannels(id)
      ])
      
      console.log('[API] Server:', serverRes.data.name)
      console.log('[API] Channels:', channelsRes.data.length)
      
      setCurrentServer(serverRes.data)
      setChannels(channelsRes.data)
      setMembers(serverRes.data.members || [])
      
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
        setActiveVoiceChannel(voiceChannel)
        setVoicePreviewChannel(null)
        setVoiceViewMode('full')
      } else {
        navigate(`/chat/${serverId}/${id}`)
      }
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
    
    // Reset after a short delay to allow next join
    setTimeout(() => {
      isJoiningVoiceRef.current = false
    }, 1000)
  }

  const toggleVoiceViewMode = () => {
    setVoiceViewMode(prev => prev === 'full' ? 'mini' : 'full')
  }

  const handleLeaveVoice = () => {
    setActiveVoiceChannel(null)
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

  return (
    <div className="chat-page" style={themeStyles}>
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
      
      {viewMode === 'friends' ? (
        <>
          <DMList type="friends" onSelectConversation={(conv) => {
            setSelectedDM(conv)
            setViewMode('dms')
          }} onClose={() => {}} />
          <FriendsPage onStartDM={(conv) => {
            setSelectedDM(conv)
            setViewMode('dms')
            navigate('/chat/dms')
          }} />
        </>
      ) : viewMode === 'dms' ? (
        <>
          <DMList 
            type="dms" 
            onSelectConversation={setSelectedDM}
            selectedConversation={selectedDM}
            onClose={(convId) => {
              if (selectedDM?.id === convId) {
                setSelectedDM(null)
              }
            }}
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
        <Discovery 
          onJoinServer={(serverId) => {
            loadServers()
          }}
        />
      ) : viewMode === 'home' ? (
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
      ) : serverId && serverId !== 'null' && currentServer ? (
        <>
          <ChannelSidebar 
            server={currentServer}
            channels={channels}
            currentChannelId={channelId}
            onChannelChange={handleChannelChange}
            onCreateChannel={() => loadServerData(serverId)}
            onOpenServerSettings={() => { setServerSettingsTab('overview'); setShowServerSettings(true) }}
            onOpenSettings={() => setShowSettings(true)}
            onVoicePreview={handleVoicePreview}
            activeVoiceChannel={activeVoiceChannel}
            onDeleteChannel={handleChannelDeleted}
            onRefreshChannels={() => loadServerData(serverId)}
            onInvite={() => { setServerSettingsTab('invites'); setShowServerSettings(true) }}
            isMuted={isMuted}
            isDeafened={isDeafened}
            onToggleMute={() => setIsMuted(!isMuted)}
            onToggleDeafen={() => { setIsDeafened(!isDeafened); if (!isDeafened) setIsMuted(true) }}
          />
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
                </>
              )}
            </>
          ) : (
            <div className="empty-state simple">
              <p>no channels are visible for you :(</p>
            </div>
          )}
          {activeVoiceChannel && (
            <div className={`voice-container ${voiceViewMode}`}>
              <div className="voice-container-header">
                <span>{activeVoiceChannel.name}</span>
                <div className="voice-view-controls">
                  <button onClick={toggleVoiceViewMode} title={voiceViewMode === 'full' ? 'Minimize' : 'Maximize'}>
                    {voiceViewMode === 'full' ? '−' : '□'}
                  </button>
                </div>
              </div>
              <VoiceChannel 
                channel={activeVoiceChannel}
                onLeave={handleLeaveVoice}
                viewMode={voiceViewMode}
                isMuted={isMuted}
                isDeafened={isDeafened}
                onMuteChange={setIsMuted}
                onDeafenChange={setIsDeafened}
                onOpenSettings={() => { setSettingsInitialTab('voice'); setShowSettings(true) }}
              />
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
    </div>
  )
}

export default ChatPage
