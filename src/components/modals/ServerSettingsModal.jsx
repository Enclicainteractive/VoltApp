import React, { useState, useEffect, useRef } from 'react'
import { X, Server, Users, Shield, Link, Trash2, Hash, Volume2, ChevronDown, ChevronRight, Crown, UserMinus, Ban, Settings, Plus, Edit2, Check, Copy, Palette, Globe, CheckCircle, Clock, Lock, Key, RefreshCw, Download, Upload, Music, Palette as PaletteIcon, FlaskConical, GraduationCap, Film, Trophy, Briefcase, Gamepad2, Bot, Folder, GripVertical, ArrowUp, ArrowDown, Smile } from 'lucide-react'
import { apiService } from '../../services/apiService'
import { getStoredServer } from '../../services/serverConfig'
import { useAuth } from '../../contexts/AuthContext'
import { useE2e } from '../../contexts/E2eContext'
import Avatar from '../Avatar'
import BioEditor from '../BioEditor'
import ServerBots from '../ServerBots'
import './Modal.css'
import './ServerSettingsModal.css'
import '../../assets/styles/RichTextEditor.css'

const CATEGORY_ICONS = {
  'general': Hash,
  'gaming': Gamepad2,
  'music': Music,
  'art': PaletteIcon,
  'science': FlaskConical,
  'education': GraduationCap,
  'entertainment': Film,
  'sports': Trophy,
  'business': Briefcase,
  'community': Users
}

const ServerSettingsModal = ({ server, onClose, onUpdate, onDelete, initialTab = 'overview' }) => {
  const { user } = useAuth()
  const { 
    isEncryptionEnabled, 
    hasDecryptedKey,
    enableServerEncryption, 
    disableServerEncryption,
    joinServerEncryption,
    leaveServerEncryption,
    rotateServerKeys,
    getServerEncryptionStatus,
    serverEncryptionStatus
  } = useE2e()
  const currentServer = getStoredServer()
  const apiUrl = currentServer?.apiUrl || ''
  const imageApiUrl = currentServer?.imageApiUrl || apiUrl
  const [activeTab, setActiveTab] = useState(initialTab)
  const [serverData, setServerData] = useState({
    name: server?.name || '',
    icon: server?.icon || '',
    description: server?.description || '',
    themeColor: server?.themeColor || '#1fb6ff',
    bannerUrl: server?.bannerUrl || '',
    backgroundUrl: server?.backgroundUrl || '',
    bannerPosition: server?.bannerPosition || 'cover'
  })
  
  useEffect(() => {
    setServerData({
      name: server?.name || '',
      icon: server?.icon || '',
      description: server?.description || '',
      themeColor: server?.themeColor || '#1fb6ff',
      bannerUrl: server?.bannerUrl || '',
      backgroundUrl: server?.backgroundUrl || '',
      bannerPosition: server?.bannerPosition || 'cover'
    })
  }, [server?.id])

  useEffect(() => {
    if (server?.id) {
      loadDiscoveryStatus()
      loadDiscoveryCategories()
    }
  }, [server?.id])

  const loadDiscoveryStatus = async () => {
    try {
      const res = await apiService.getDiscoveryStatus(server.id)
      setDiscoveryStatus(res.data)
    } catch (err) {
      console.error('Failed to load discovery status:', err)
    }
  }

  const loadDiscoveryCategories = async () => {
    try {
      const res = await apiService.getDiscoveryCategories()
      setDiscoveryCategories(res.data)
    } catch (err) {
      console.error('Failed to load categories:', err)
    }
  }

  const handleSubmitToDiscovery = async () => {
    if (!discoverySubmit.category) return
    setDiscoveryLoading(true)
    try {
      await apiService.submitToDiscovery(server.id, discoverySubmit)
      await loadDiscoveryStatus()
    } catch (err) {
      console.error('Failed to submit to discovery:', err)
    } finally {
      setDiscoveryLoading(false)
    }
  }

  const handleRemoveFromDiscovery = async () => {
    setDiscoveryLoading(true)
    try {
      await apiService.removeFromDiscovery(server.id)
      await loadDiscoveryStatus()
    } catch (err) {
      console.error('Failed to remove from discovery:', err)
    } finally {
      setDiscoveryLoading(false)
    }
  }
  const [members, setMembers] = useState(server?.members || [])
  const [channels, setChannels] = useState([])
  const [categories, setCategories] = useState([])
  const [draggedChannel, setDraggedChannel] = useState(null)
  const [dragOverChannel, setDragOverChannel] = useState(null)
  const [draggedCategory, setDraggedCategory] = useState(null)
  const [dragOverCategory, setDragOverCategory] = useState(null)
  const [roles, setRoles] = useState(server?.roles || [])
  const [editingRole, setEditingRole] = useState(null)
  const [editingRolePerms, setEditingRolePerms] = useState([])
  const [permCategory, setPermCategory] = useState('general')
  const [newRole, setNewRole] = useState({ name: '', color: '#1fb6ff', permissions: [] })
  const [memberSearch, setMemberSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [showRoleMenu, setShowRoleMenu] = useState({})
  const [invites, setInvites] = useState([])
  const [newInvite, setNewInvite] = useState(null)
  const [editingChannel, setEditingChannel] = useState(null)
  const [newChannelName, setNewChannelName] = useState('')
  const [editingCategory, setEditingCategory] = useState(null)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteInput, setDeleteInput] = useState('')
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const [uploadingBackground, setUploadingBackground] = useState(false)
  const [discoveryStatus, setDiscoveryStatus] = useState(null)
  const [discoveryLoading, setDiscoveryLoading] = useState(false)
  const [discoveryCategories, setDiscoveryCategories] = useState([])
  const [discoverySubmit, setDiscoverySubmit] = useState({ description: '', category: '' })
  const [serverEmojis, setServerEmojis] = useState([])
  const [newEmojiName, setNewEmojiName] = useState('')
  const [uploadingEmoji, setUploadingEmoji] = useState(false)
  const emojiFileInputRef = useRef(null)
  const bannerInputRef = useRef(null)
  const iconInputRef = useRef(null)
  const backgroundInputRef = useRef(null)

  const isOwner = server?.ownerId === user?.id
  const getMemberRoles = (memberId) => {
    const member = members.find(m => m.id === memberId)
    if (!member) return []
    if (Array.isArray(member.roles)) return member.roles
    return member.role ? [member.role] : []
  }

  const resolveRoles = (roleIds) => roleIds.map(id => roles.find(r => r.id === id)).filter(Boolean)

  const hasPermission = (permission) => {
    if (isOwner) return true
    const roleIds = getMemberRoles(user?.id)
    const resolved = resolveRoles(roleIds)
    const permSet = new Set(['view_channels', 'send_messages', 'connect', 'speak', 'use_voice_activity'])
    resolved.forEach(r => r.permissions?.forEach(p => permSet.add(p)))
    return permSet.has('admin') || permSet.has(permission)
  }

  const isAdmin = isOwner || hasPermission('manage_roles')

  const handleBannerUpload = async (file) => {
    if (!file) return
    setUploadingBanner(true)
    try {
      const res = await apiService.uploadFiles([file], server?.id)
      const url = res.data.attachments?.[0]?.url
      if (url) {
        setServerData(p => ({ ...p, bannerUrl: url }))
      }
    } catch (err) {
      console.error('Banner upload failed:', err)
    } finally {
      setUploadingBanner(false)
    }
  }

  const handleIconUpload = async (file) => {
    if (!file) return
    setUploadingBanner(true)
    try {
      const res = await apiService.uploadFiles([file], server?.id)
      const url = res.data.attachments?.[0]?.url
      if (url) {
        setServerData(p => ({ ...p, icon: url }))
      }
    } catch (err) {
      console.error('Icon upload failed:', err)
    } finally {
      setUploadingBanner(false)
    }
  }

  const handleBackgroundUpload = async (file) => {
    if (!file) return
    setUploadingBackground(true)
    try {
      const res = await apiService.uploadFiles([file], server?.id)
      const url = res.data.attachments?.[0]?.url
      if (url) {
        setServerData(p => ({ ...p, backgroundUrl: url }))
      }
    } catch (err) {
      console.error('Background upload failed:', err)
    } finally {
      setUploadingBackground(false)
    }
  }

  useEffect(() => {
    setServerData({
      name: server?.name || '',
      icon: server?.icon || '',
      description: server?.description || '',
      themeColor: server?.themeColor || '#1fb6ff',
      bannerUrl: server?.bannerUrl || ''
    })
    setRoles(server?.roles || [])
    setMembers(server?.members || [])
  }, [server])

  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

  useEffect(() => {
    loadChannels()
    loadCategories()
    loadInvites()
    loadServerEmojis()
  }, [server?.id])

  const loadServerEmojis = async () => {
    try {
      const res = await apiService.getServerEmojis(server.id)
      setServerEmojis(res.data || [])
    } catch (err) {
      console.error('Failed to load server emojis:', err)
    }
  }

  const handleEmojiUpload = async (file) => {
    if (!file || !newEmojiName.trim()) return
    setUploadingEmoji(true)
    try {
      const uploadRes = await apiService.uploadFiles([file], server?.id)
      const url = uploadRes.data.attachments?.[0]?.url
      if (url) {
        const res = await apiService.addServerEmoji(server.id, newEmojiName.trim(), url)
        setServerEmojis(prev => [...prev, res.data])
        setNewEmojiName('')
        if (emojiFileInputRef.current) emojiFileInputRef.current.value = ''
      }
    } catch (err) {
      console.error('Failed to upload emoji:', err)
    } finally {
      setUploadingEmoji(false)
    }
  }

  const handleDeleteEmoji = async (emojiId) => {
    if (!confirm('Delete this emoji?')) return
    try {
      await apiService.deleteServerEmoji(server.id, emojiId)
      setServerEmojis(prev => prev.filter(e => e.id !== emojiId))
    } catch (err) {
      console.error('Failed to delete emoji:', err)
    }
  }

  const loadChannels = async () => {
    try {
      const res = await apiService.getChannels(server.id)
      const sorted = [...res.data].sort((a, b) => (a.position || 0) - (b.position || 0))
      setChannels(sorted)
    } catch (err) {
      console.error('Failed to load channels:', err)
    }
  }

  const loadCategories = async () => {
    try {
      const res = await apiService.getCategories(server.id)
      const sorted = [...res.data].sort((a, b) => (a.position || 0) - (b.position || 0))
      setCategories(sorted)
    } catch (err) {
      console.error('Failed to load categories:', err)
      setCategories([])
    }
  }

  const loadInvites = async () => {
    try {
      const res = await apiService.getServerInvites(server.id)
      setInvites(res.data || [])
    } catch (err) {
      console.error('Failed to load invites:', err)
    }
  }

  const handleSaveOverview = async () => {
    setSaving(true)
    try {
      await apiService.updateServer(server.id, serverData)
      onUpdate?.({ ...server, ...serverData })
    } catch (err) {
      console.error('Failed to save server:', err)
    }
    setSaving(false)
  }

  const handleCreateInvite = async () => {
    try {
      const res = await apiService.createServerInvite(server.id)
      setNewInvite(res.data)
      loadInvites()
    } catch (err) {
      console.error('Failed to create invite:', err)
    }
  }

  const handleCopyInvite = (code) => {
    navigator.clipboard.writeText(`https://volt.voltagechat.app/invite/${code}`)
  }

  const handleDeleteInvite = async (code) => {
    try {
      await apiService.deleteServerInvite(server.id, code)
      loadInvites()
    } catch (err) {
      console.error('Failed to delete invite:', err)
    }
  }

  const handleKickMember = async (memberId) => {
    if (!confirm('Are you sure you want to kick this member?')) return
    try {
      await apiService.kickMember(server.id, memberId)
      setMembers(prev => prev.filter(m => m.id !== memberId))
    } catch (err) {
      console.error('Failed to kick member:', err)
    }
  }

  const handleBanMember = async (memberId) => {
    if (!confirm('Are you sure you want to ban this member?')) return
    try {
      await apiService.banMember(server.id, memberId)
      setMembers(prev => prev.filter(m => m.id !== memberId))
    } catch (err) {
      console.error('Failed to ban member:', err)
    }
  }

  const handleChangeMemberRoles = async (memberId, roleIds) => {
    console.log('[Role] Changing roles for', memberId, 'to', roleIds)
    const oldMembers = [...members]
    const updatedMembers = members.map(m => {
      if (m.id === memberId) {
        return { ...m, roles: roleIds, role: roleIds[0] || null }
      }
      return m
    })
    setMembers(updatedMembers)
    try {
      await apiService.updateMemberRoles(server.id, memberId, roleIds)
      console.log('[Role] Successfully updated roles')
      const updatedServer = { ...server, members: updatedMembers }
      onUpdate?.(updatedServer)
    } catch (err) {
      console.error('Failed to change roles:', err)
      setMembers(oldMembers)
    }
  }

  const handleMemberAction = async (member, action) => {
    if (action === 'kick') {
      if (!confirm(`Kick ${member.username} from the server?`)) return
      await handleKickMember(member.id)
    } else if (action === 'ban') {
      if (!confirm(`Ban ${member.username} from the server?`)) return
      await handleBanMember(member.id)
    } else if (action === 'transfer') {
      if (!confirm(`Transfer server ownership to ${member.username}? You will no longer be the owner.`)) return
      try {
        await apiService.transferServer(server.id, member.id)
        onUpdate?.({ ...server, ownerId: member.id })
        alert('Server transferred successfully!')
      } catch (err) {
        console.error('Failed to transfer server:', err)
        alert('Failed to transfer server: ' + (err.response?.data?.error || err.message))
      }
    }
    setMemberActions(null)
  }

  const handleUpdateChannel = async (channelId) => {
    if (!newChannelName.trim()) return
    try {
      await apiService.updateChannel(channelId, { name: newChannelName })
      setChannels(prev => prev.map(c => c.id === channelId ? { ...c, name: newChannelName } : c))
      setEditingChannel(null)
      setNewChannelName('')
    } catch (err) {
      console.error('Failed to update channel:', err)
    }
  }

  const handleDeleteChannel = async (channelId) => {
    if (!confirm('Are you sure you want to delete this channel?')) return
    try {
      await apiService.deleteChannel(channelId)
      setChannels(prev => prev.filter(c => c.id !== channelId))
    } catch (err) {
      console.error('Failed to delete channel:', err)
    }
  }

  const handleDragStart = (e, channel) => {
    setDraggedChannel(channel)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', channel.id)
  }

  const handleDragOver = (e, channel) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (draggedChannel && draggedChannel.id !== channel.id) {
      setDragOverChannel(channel.id)
    }
  }

  const handleDragLeave = () => {
    setDragOverChannel(null)
  }

  const handleDrop = async (e, targetChannel) => {
    e.preventDefault()
    if (!draggedChannel || draggedChannel.id === targetChannel.id) {
      setDraggedChannel(null)
      setDragOverChannel(null)
      return
    }

    const draggedId = draggedChannel.id
    const targetId = targetChannel.id

    const newChannels = [...channels]
    const draggedIndex = newChannels.findIndex(c => c.id === draggedId)
    const targetIndex = newChannels.findIndex(c => c.id === targetId)

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedChannel(null)
      setDragOverChannel(null)
      return
    }

    const [draggedItem] = newChannels.splice(draggedIndex, 1)
    newChannels.splice(targetIndex, 0, draggedItem)

    const reorderedChannels = newChannels.map((c, index) => ({
      ...c,
      position: index
    }))

    setChannels(reorderedChannels)

    try {
      await apiService.updateChannelOrder(server.id, reorderedChannels.map(c => c.id))
    } catch (err) {
      console.error('Failed to save channel order:', err)
    }

    setDraggedChannel(null)
    setDragOverChannel(null)
  }

  const handleDragEnd = () => {
    setDraggedChannel(null)
    setDragOverChannel(null)
  }

  const handleDeleteServer = async () => {
    if (deleteInput !== server.name) return
    try {
      await apiService.deleteServer(server.id)
      onDelete?.()
      onClose()
    } catch (err) {
      console.error('Failed to delete server:', err)
    }
  }

  // Category management functions
  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return
    try {
      const res = await apiService.createCategory(server.id, { 
        name: newCategoryName.trim(),
        position: categories.length
      })
      setCategories([...categories, res.data])
      setNewCategoryName('')
    } catch (err) {
      console.error('Failed to create category:', err)
    }
  }

  const handleUpdateCategory = async (categoryId) => {
    if (!newCategoryName.trim()) return
    try {
      await apiService.updateCategory(categoryId, { name: newCategoryName.trim() })
      setCategories(categories.map(c => c.id === categoryId ? { ...c, name: newCategoryName.trim() } : c))
      setEditingCategory(null)
      setNewCategoryName('')
    } catch (err) {
      console.error('Failed to update category:', err)
    }
  }

  const handleDeleteCategory = async (categoryId) => {
    if (!confirm('Delete this category? Channels will be moved to "No Category". This cannot be undone.')) return
    try {
      await apiService.deleteCategory(categoryId)
      setCategories(categories.filter(c => c.id !== categoryId))
      // Move channels to uncategorized
      setChannels(channels.map(c => c.categoryId === categoryId ? { ...c, categoryId: null } : c))
    } catch (err) {
      console.error('Failed to delete category:', err)
    }
  }

  // Drag and drop for categories
  const handleCategoryDragStart = (e, category) => {
    setDraggedCategory(category)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', category.id)
  }

  const handleCategoryDragOver = (e, category) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (draggedCategory && draggedCategory.id !== category.id) {
      setDragOverCategory(category.id)
    }
  }

  const handleCategoryDragLeave = () => {
    setDragOverCategory(null)
  }

  const handleCategoryDrop = async (e, targetCategory) => {
    e.preventDefault()
    if (!draggedCategory || draggedCategory.id === targetCategory.id) {
      setDraggedCategory(null)
      setDragOverCategory(null)
      return
    }

    const draggedId = draggedCategory.id
    const targetId = targetCategory.id

    const newCategories = [...categories]
    const draggedIndex = newCategories.findIndex(c => c.id === draggedId)
    const targetIndex = newCategories.findIndex(c => c.id === targetId)

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedCategory(null)
      setDragOverCategory(null)
      return
    }

    const [draggedItem] = newCategories.splice(draggedIndex, 1)
    newCategories.splice(targetIndex, 0, draggedItem)

    const reorderedCategories = newCategories.map((c, index) => ({
      ...c,
      position: index
    }))

    setCategories(reorderedCategories)

    try {
      await apiService.updateCategoryOrder(server.id, reorderedCategories.map(c => c.id))
    } catch (err) {
      console.error('Failed to save category order:', err)
    }

    setDraggedCategory(null)
    setDragOverCategory(null)
  }

  const handleCategoryDragEnd = () => {
    setDraggedCategory(null)
    setDragOverCategory(null)
  }

  // Move channel to category
  const handleMoveChannelToCategory = async (channelId, categoryId) => {
    try {
      await apiService.updateChannel(channelId, { categoryId })
      setChannels(channels.map(c => c.id === channelId ? { ...c, categoryId } : c))
    } catch (err) {
      console.error('Failed to move channel:', err)
    }
  }

  const availablePermissions = [
    { id: 'admin', name: 'Administrator', desc: 'Bypass all checks and manage everything', category: 'admin' },
    { id: 'manage_server', name: 'Manage Server', desc: 'Edit server settings and details', category: 'admin' },
    { id: 'manage_roles', name: 'Manage Roles', desc: 'Create, edit, delete, and assign roles', category: 'admin' },
    { id: 'manage_channels', name: 'Manage Channels', desc: 'Create, edit, delete channels', category: 'admin' },
    { id: 'manage_messages', name: 'Manage Messages', desc: 'Delete or pin messages', category: 'moderation' },
    { id: 'manage_emojis', name: 'Manage Emojis & Stickers', desc: 'Add or remove emojis and stickers', category: 'general' },
    { id: 'manage_events', name: 'Manage Events', desc: 'Create and edit events', category: 'general' },
    { id: 'manage_webhooks', name: 'Manage Webhooks', desc: 'Create, edit, or delete webhooks', category: 'general' },
    { id: 'manage_threads', name: 'Manage Threads', desc: 'Manage and moderate threads', category: 'moderation' },
    { id: 'create_invites', name: 'Create Invites', desc: 'Generate invite links', category: 'general' },
    { id: 'kick_members', name: 'Kick Members', desc: 'Remove members from the server', category: 'moderation' },
    { id: 'ban_members', name: 'Ban Members', desc: 'Ban and unban members', category: 'moderation' },
    { id: 'mute_members', name: 'Mute Members', desc: 'Mute members in voice', category: 'moderation' },
    { id: 'deafen_members', name: 'Deafen Members', desc: 'Deafen members in voice', category: 'moderation' },
    { id: 'move_members', name: 'Move Members', desc: 'Move members between voice channels', category: 'moderation' },
    { id: 'priority_speaker', name: 'Priority Speaker', desc: 'Gain priority voice quality', category: 'voice' },
    { id: 'view_channels', name: 'View Channels', desc: 'See channels the role applies to', category: 'general' },
    { id: 'send_messages', name: 'Send Messages', desc: 'Post messages in text channels', category: 'text' },
    { id: 'send_embeds', name: 'Send Embeds', desc: 'Embed links and rich content', category: 'text' },
    { id: 'attach_files', name: 'Attach Files', desc: 'Upload files and media', category: 'text' },
    { id: 'add_reactions', name: 'Add Reactions', desc: 'Add reactions to messages', category: 'text' },
    { id: 'mention_everyone', name: 'Mention Everyone', desc: 'Use @everyone and @here', category: 'text' },
    { id: 'connect', name: 'Connect', desc: 'Join voice channels', category: 'voice' },
    { id: 'speak', name: 'Speak', desc: 'Talk in voice channels', category: 'voice' },
    { id: 'video', name: 'Video', desc: 'Turn on camera', category: 'voice' },
    { id: 'share_screen', name: 'Share Screen', desc: 'Start screen share', category: 'voice' },
    { id: 'use_voice_activity', name: 'Voice Activity', desc: 'Use voice activity detection', category: 'voice' }
  ]

  const permissionCategories = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'admin', label: 'Administration', icon: Crown },
    { id: 'moderation', label: 'Moderation', icon: Shield },
    { id: 'text', label: 'Text & Messages', icon: Hash },
    { id: 'voice', label: 'Voice & Video', icon: Volume2 }
  ]

  const handleCreateRole = async () => {
    if (!newRole.name.trim()) return
    const role = {
      id: `role_${Date.now()}`,
      name: newRole.name,
      color: newRole.color,
      permissions: newRole.permissions,
      position: roles.length
    }
    setRoles(prev => [...prev, role])
    setNewRole({ name: '', color: '#1fb6ff', permissions: [] })
    try {
      await apiService.createRole(server.id, role)
    } catch (err) {
      console.error('Failed to create role:', err)
    }
  }

  const handleUpdateRole = async (roleId, updates) => {
    setRoles(prev => prev.map(r => r.id === roleId ? { ...r, ...updates } : r))
    try {
      await apiService.updateRole(server.id, roleId, updates)
    } catch (err) {
      console.error('Failed to update role:', err)
    }
  }

  const handleDeleteRole = async (roleId) => {
    if (!confirm('Are you sure you want to delete this role?')) return
    setRoles(prev => prev.filter(r => r.id !== roleId))
    try {
      await apiService.deleteRole(server.id, roleId)
    } catch (err) {
      console.error('Failed to delete role:', err)
    }
  }

  const toggleRolePermission = (roleId, permissionId) => {
    setRoles(prev => prev.map(r => {
      if (r.id !== roleId) return r
      const has = r.permissions.includes(permissionId)
      return {
        ...r,
        permissions: has 
          ? r.permissions.filter(p => p !== permissionId)
          : [...r.permissions, permissionId]
      }
    }))
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Server },
    { id: 'theme', label: 'Theme', icon: Palette },
    { id: 'channels', label: 'Channels', icon: Hash },
    { id: 'roles', label: 'Roles', icon: Shield },
    { id: 'members', label: 'Members', icon: Users },
    { id: 'invites', label: 'Invites', icon: Link },
    { id: 'discovery', label: 'Discovery', icon: Globe },
    { id: 'emojis', label: 'Emojis', icon: Smile },
    { id: 'bots', label: 'Bots', icon: Bot },
    { id: 'security', label: 'Security', icon: Lock },
    ...(isOwner ? [{ id: 'danger', label: 'Danger Zone', icon: Trash2 }] : [])
  ]

  return (
    <div className="modal-overlay settings-overlay" onClick={onClose}>
      <div className="modal-content server-settings-modal" onClick={e => e.stopPropagation()}>
        <div className="settings-container">
          <div className="settings-sidebar">
            <div className="settings-server-header">
              <div className="server-icon-preview">
                {server?.icon ? (
                  <img src={server.icon} alt={server.name} />
                ) : (
                  <span>{server?.name?.charAt(0)}</span>
                )}
              </div>
              <span className="server-name-preview">{server?.name}</span>
            </div>
            <div className="settings-tabs">
              {tabs.map(tab => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    className={`settings-tab ${activeTab === tab.id ? 'active' : ''} ${tab.id === 'danger' ? 'danger' : ''}`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <Icon size={18} />
                    <span>{tab.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="settings-content">
            <button className="settings-close" onClick={onClose}>
              <X size={24} />
            </button>

            {activeTab === 'overview' && (
              <div className="settings-section">
                <h2>Server Overview</h2>
                
                <div className="server-icon-section">
                  <div className="server-icon-large">
                    {serverData.icon ? (
                      <img src={serverData.icon} alt={serverData.name} />
                    ) : (
                      <span>{serverData.name?.charAt(0) || 'S'}</span>
                    )}
                  </div>
                  <div className="server-icon-actions">
                    <input
                      ref={iconInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleIconUpload(file)
                      }}
                    />
                    <button className="btn btn-secondary" onClick={() => iconInputRef.current?.click()} disabled={!isAdmin || uploadingBanner}>
                      {uploadingBanner ? 'Uploading...' : 'Upload Icon'}
                    </button>
                    {serverData.icon && (
                      <button className="btn btn-text" onClick={() => setServerData(p => ({ ...p, icon: '' }))}>
                        Remove
                      </button>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <label>Server Name</label>
                  <input
                    type="text"
                    className="input"
                    value={serverData.name}
                    onChange={e => setServerData(p => ({ ...p, name: e.target.value }))}
                    disabled={!isAdmin}
                  />
                </div>

                <div className="form-group">
                  <label>Server Description</label>
                  <BioEditor
                    value={serverData.description}
                    onChange={(text) => setServerData(p => ({ ...p, description: text }))}
                    placeholder="Tell people about your server..."
                    maxLength={2000}
                  />
                </div>

                {isAdmin && (
                  <button 
                    className="btn btn-primary"
                    onClick={handleSaveOverview}
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                )}
              </div>
            )}

            {activeTab === 'theme' && (
              <div className="settings-section">
                <h2>Server Theme</h2>
                <p className="section-desc">Customize colors and banner to brand your server.</p>

                <div className="theme-preview" style={{
                  background: serverData.bannerUrl 
                    ? `linear-gradient(160deg, ${serverData.themeColor}bb, #0b1220dd), url(${serverData.bannerUrl}) ${serverData.bannerPosition || 'center'}/cover`
                    : `linear-gradient(135deg, ${serverData.themeColor}, #0f1828)`
                }}>
                  <div className="theme-badge">Preview</div>
                  <div className="theme-title">{serverData.name || server?.name}</div>
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label>Accent Color</label>
                    <div className="color-row">
                      <input
                        type="color"
                        className="color-picker large"
                        value={serverData.themeColor}
                        onChange={e => setServerData(p => ({ ...p, themeColor: e.target.value }))}
                        disabled={!isAdmin}
                      />
                      <input
                        type="text"
                        className="input"
                        value={serverData.themeColor}
                        onChange={e => setServerData(p => ({ ...p, themeColor: e.target.value }))}
                        disabled={!isAdmin}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Banner Position</label>
                    <select
                      className="input"
                      value={serverData.bannerPosition}
                      onChange={e => setServerData(p => ({ ...p, bannerPosition: e.target.value }))}
                      disabled={!isAdmin}
                    >
                      <option value="cover">Cover</option>
                      <option value="center">Center</option>
                      <option value="repeat">Tiled</option>
                      <option value="contain">Contain</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Banner Image URL</label>
                    <input
                      type="text"
                      className="input"
                      value={serverData.bannerUrl}
                      onChange={e => setServerData(p => ({ ...p, bannerUrl: e.target.value }))}
                      placeholder="https://.../banner.png"
                      disabled={!isAdmin}
                    />
                    <div className="upload-row">
                      <input
                        ref={bannerInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) handleBannerUpload(file)
                        }}
                      />
                      <button
                        className="btn btn-ghost"
                        disabled={!isAdmin || uploadingBanner}
                        onClick={() => bannerInputRef.current?.click()}
                        type="button"
                      >
                        {uploadingBanner ? 'Uploading...' : 'Upload image'}
                      </button>
                      {serverData.bannerUrl && (
                        <button className="btn btn-ghost" type="button" onClick={() => setServerData(p => ({ ...p, bannerUrl: '' }))}>
                          Clear
                        </button>
                      )}
                    </div>
                    <p className="field-hint">Wide image for server header (e.g. 1600x600)</p>
                  </div>

                  <div className="form-group">
                    <label>Chat Background</label>
                    <input
                      type="text"
                      className="input"
                      value={serverData.backgroundUrl}
                      onChange={e => setServerData(p => ({ ...p, backgroundUrl: e.target.value }))}
                      placeholder="https://.../background.png"
                      disabled={!isAdmin}
                    />
                    <div className="upload-row">
                      <input
                        ref={backgroundInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) handleBackgroundUpload(file)
                        }}
                      />
                      <button
                        className="btn btn-ghost"
                        disabled={!isAdmin || uploadingBackground}
                        onClick={() => backgroundInputRef.current?.click()}
                        type="button"
                      >
                        {uploadingBackground ? 'Uploading...' : 'Upload image'}
                      </button>
                      {serverData.backgroundUrl ? (
                        <button className="btn btn-ghost" type="button" onClick={() => {
                          setServerData(p => ({ ...p, backgroundUrl: '' }))
                        }}>
                          Clear
                        </button>
                      ) : null}
                    </div>
                    <p className="field-hint">Optional background for sidebar</p>
                  </div>
                </div>

                {isAdmin && (
                  <button 
                    className="btn btn-primary"
                    onClick={handleSaveOverview}
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Save Theme'}
                  </button>
                )}
              </div>
            )}

            {activeTab === 'channels' && (
              <div className="settings-section">
                <h2>Channels & Categories</h2>
                <p className="section-desc">Manage your server's channels and categories. Drag to reorder.</p>

                {/* Categories Section */}
                <div className="categories-section">
                  <div className="section-header-with-action">
                    <h4>Categories</h4>
                    {isAdmin && (
                      <div className="create-category-inline">
                        <input
                          type="text"
                          className="input small"
                          placeholder="New category name"
                          value={newCategoryName}
                          onChange={e => setNewCategoryName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleCreateCategory()}
                        />
                        <button 
                          className="btn btn-primary btn-small"
                          onClick={handleCreateCategory}
                          disabled={!newCategoryName.trim()}
                        >
                          <Plus size={14} /> Add
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="categories-list">
                    {categories.map((category, index) => (
                      <div
                        key={category.id}
                        className={`category-manage-item ${draggedCategory?.id === category.id ? 'dragging' : ''} ${dragOverCategory === category.id ? 'drag-over' : ''}`}
                        draggable={isAdmin}
                        onDragStart={(e) => handleCategoryDragStart(e, category)}
                        onDragOver={(e) => handleCategoryDragOver(e, category)}
                        onDragLeave={handleCategoryDragLeave}
                        onDrop={(e) => handleCategoryDrop(e, category)}
                        onDragEnd={handleCategoryDragEnd}
                      >
                        <GripVertical size={16} className="drag-handle" />
                        <Folder size={18} className="category-icon" />
                        {editingCategory === category.id ? (
                          <input
                            type="text"
                            className="input inline-edit"
                            value={newCategoryName}
                            onChange={e => setNewCategoryName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleUpdateCategory(category.id)}
                            onBlur={() => { setEditingCategory(null); setNewCategoryName('') }}
                            autoFocus
                          />
                        ) : (
                          <span className="category-manage-name">{category.name}</span>
                        )}
                        <span className="category-channel-count">
                          {channels.filter(c => c.categoryId === category.id).length} channels
                        </span>
                        {isAdmin && (
                          <div className="category-manage-actions">
                            {editingCategory === category.id ? (
                              <button className="icon-btn" onClick={() => handleUpdateCategory(category.id)}>
                                <Check size={16} />
                              </button>
                            ) : (
                              <button className="icon-btn" onClick={() => { setEditingCategory(category.id); setNewCategoryName(category.name) }}>
                                <Edit2 size={16} />
                              </button>
                            )}
                            <button className="icon-btn danger" onClick={() => handleDeleteCategory(category.id)}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                    {categories.length === 0 && (
                      <div className="no-items-message">No categories yet. Create one above!</div>
                    )}
                  </div>
                </div>

                {/* Channels by Category */}
                <div className="channels-by-category-section">
                  <h4>Channels</h4>
                  
                  {/* Uncategorized channels */}
                  <div className="channel-category-group">
                    <div className="category-group-header">
                      <Folder size={16} />
                      <span>No Category</span>
                      <span className="channel-count">{channels.filter(c => !c.categoryId).length}</span>
                    </div>
                    {channels.filter(c => !c.categoryId).map(channel => (
                      <div
                        key={channel.id}
                        className={`channel-manage-item indented ${draggedChannel?.id === channel.id ? 'dragging' : ''} ${dragOverChannel === channel.id ? 'drag-over' : ''}`}
                        draggable={isAdmin}
                        onDragStart={(e) => handleDragStart(e, channel)}
                        onDragOver={(e) => handleDragOver(e, channel)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, channel)}
                        onDragEnd={handleDragEnd}
                      >
                        <GripVertical size={16} className="drag-handle" />
                        {channel.type === 'voice' ? <Volume2 size={18} /> : <Hash size={18} />}
                        {editingChannel === channel.id ? (
                          <input
                            type="text"
                            className="input inline-edit"
                            value={newChannelName}
                            onChange={e => setNewChannelName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleUpdateChannel(channel.id)}
                            autoFocus
                          />
                        ) : (
                          <span className="channel-manage-name">{channel.name}</span>
                        )}
                        {isAdmin && (
                          <>
                            <select
                              className="input category-select"
                              value={channel.categoryId || ''}
                              onChange={e => handleMoveChannelToCategory(channel.id, e.target.value || null)}
                            >
                              <option value="">No Category</option>
                              {categories.map(cat => (
                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                              ))}
                            </select>
                            <div className="channel-manage-actions">
                              {editingChannel === channel.id ? (
                                <button className="icon-btn" onClick={() => handleUpdateChannel(channel.id)}>
                                  <Check size={16} />
                                </button>
                              ) : (
                                <button className="icon-btn" onClick={() => { setEditingChannel(channel.id); setNewChannelName(channel.name) }}>
                                  <Edit2 size={16} />
                                </button>
                              )}
                              <button className="icon-btn danger" onClick={() => handleDeleteChannel(channel.id)}>
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Channels grouped by category */}
                  {categories.map(category => {
                    const categoryChannels = channels.filter(c => c.categoryId === category.id)
                    if (categoryChannels.length === 0) return null
                    
                    return (
                      <div key={category.id} className="channel-category-group">
                        <div className="category-group-header">
                          <Folder size={16} />
                          <span>{category.name}</span>
                          <span className="channel-count">{categoryChannels.length}</span>
                        </div>
                        {categoryChannels.map(channel => (
                          <div
                            key={channel.id}
                            className={`channel-manage-item indented ${draggedChannel?.id === channel.id ? 'dragging' : ''} ${dragOverChannel === channel.id ? 'drag-over' : ''}`}
                            draggable={isAdmin}
                            onDragStart={(e) => handleDragStart(e, channel)}
                            onDragOver={(e) => handleDragOver(e, channel)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, channel)}
                            onDragEnd={handleDragEnd}
                          >
                            <GripVertical size={16} className="drag-handle" />
                            {channel.type === 'voice' ? <Volume2 size={18} /> : <Hash size={18} />}
                            {editingChannel === channel.id ? (
                              <input
                                type="text"
                                className="input inline-edit"
                                value={newChannelName}
                                onChange={e => setNewChannelName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleUpdateChannel(channel.id)}
                                autoFocus
                              />
                            ) : (
                              <span className="channel-manage-name">{channel.name}</span>
                            )}
                            {isAdmin && (
                              <>
                                <select
                                  className="input category-select"
                                  value={channel.categoryId || ''}
                                  onChange={e => handleMoveChannelToCategory(channel.id, e.target.value || null)}
                                >
                                  <option value="">No Category</option>
                                  {categories.map(cat => (
                                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                                  ))}
                                </select>
                                <div className="channel-manage-actions">
                                  {editingChannel === channel.id ? (
                                    <button className="icon-btn" onClick={() => handleUpdateChannel(channel.id)}>
                                      <Check size={16} />
                                    </button>
                                  ) : (
                                    <button className="icon-btn" onClick={() => { setEditingChannel(channel.id); setNewChannelName(channel.name) }}>
                                      <Edit2 size={16} />
                                    </button>
                                  )}
                                  <button className="icon-btn danger" onClick={() => handleDeleteChannel(channel.id)}>
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {activeTab === 'roles' && (
              <div className="settings-section">
                <h2>Roles</h2>
                <p className="section-desc">Manage roles and permissions for your server</p>

                {!editingRole ? (
                  <>
                    <div className="roles-list">
                      {roles.sort((a, b) => a.position - b.position).map(role => (
                        <div key={role.id} className="role-item">
                          <div className="role-color" style={{ backgroundColor: role.color }} />
                          <div className="role-info">
                            <span className="role-name">{role.name}</span>
                            <span className="role-perms">
                              {role.permissions.includes('all') ? 'All permissions' : `${role.permissions.length} permissions`}
                            </span>
                          </div>
{role.id !== 'owner' && role.id !== 'member' && isAdmin && (
                            <div className="Role-actions">
                              <button className="icon-btn" onClick={() => { setEditingRole(role); setEditingRolePerms(role.permissions || []); setPermCategory('general') }}>
                                <Edit2 size={16} />
                              </button>
                              {isOwner && (
                                <button className="icon-btn danger" onClick={() => handleDeleteRole(role.id)}>
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          )}
                          {(role.id === 'owner' || role.id === 'member') && isAdmin && (
                            <button className="icon-btn" onClick={() => { setEditingRole(role); setEditingRolePerms(role.permissions || []); setPermCategory('general') }}>
                              <Settings size={16} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {isOwner && (
                      <div className="create-role-section">
                        <h4>Create New Role</h4>
                        <div className="create-role-form">
                          <input
                            type="text"
                            className="input"
                            placeholder="Role name"
                            value={newRole.name}
                            onChange={e => setNewRole(p => ({ ...p, name: e.target.value }))}
                          />
                          <input
                            type="color"
                            className="color-picker"
                            value={newRole.color}
                            onChange={e => setNewRole(p => ({ ...p, color: e.target.value }))}
                          />
                          <button className="btn btn-primary" onClick={handleCreateRole} disabled={!newRole.name.trim()}>
                            <Plus size={16} /> Create
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="role-editor">
                    <div className="role-editor-header">
                      <button className="btn btn-text" onClick={() => setEditingRole(null)}>
                        ← Back to Roles
                      </button>
                      <div className="role-preview-badge" style={{ backgroundColor: editingRole.color }}>
                        {editingRole.name}
                      </div>
                    </div>

                    <div className="role-editor-basic">
                      <div className="form-group">
                        <label>Role Name</label>
                        <input
                          type="text"
                          className="input"
                          value={editingRole.name}
                          onChange={e => setEditingRole(p => ({ ...p, name: e.target.value }))}
                          disabled={editingRole.id === 'owner'}
                        />
                      </div>
                      <div className="form-group">
                        <label>Role Color</label>
                        <div className="color-input-row">
                          <input
                            type="color"
                            className="color-picker large"
                            value={editingRole.color}
                            onChange={e => setEditingRole(p => ({ ...p, color: e.target.value }))}
                          />
                          <input
                            type="text"
                            className="input"
                            value={editingRole.color}
                            onChange={e => setEditingRole(p => ({ ...p, color: e.target.value }))}
                          />
                        </div>
                      </div>
                    </div>

                    {editingRole.id !== 'owner' && (
                      <div className="role-permissions">
                        <div className="perm-categories">
                          {permissionCategories.map(cat => {
                            const Icon = cat.icon
                            const catPerms = availablePermissions.filter(p => p.category === cat.id)
                            const enabledCount = catPerms.filter(p => editingRolePerms.includes(p.id)).length
                            return (
                              <button
                                key={cat.id}
                                className={`perm-category-btn ${permCategory === cat.id ? 'active' : ''}`}
                                onClick={() => setPermCategory(cat.id)}
                              >
                                <Icon size={14} />
                                <span>{cat.label}</span>
                                {enabledCount > 0 && (
                                  <span className="perm-count">{enabledCount}</span>
                                )}
                              </button>
                            )
                          })}
                        </div>

                        <div className="permissions-grid">
                          {availablePermissions
                            .filter(p => p.category === permCategory)
                            .map(perm => (
                              <label key={perm.id} className={`permission-checkbox ${editingRolePerms.includes(perm.id) ? 'enabled' : ''}`}>
                                <input
                                  type="checkbox"
                                  checked={editingRolePerms.includes(perm.id)}
                                  onChange={() => {
                                    const has = editingRolePerms.includes(perm.id)
                                    const newPermissions = has 
                                      ? editingRolePerms.filter(x => x !== perm.id)
                                      : [...editingRolePerms, perm.id]
                                    setEditingRolePerms(newPermissions)
                                    setEditingRole({ ...editingRole, permissions: newPermissions })
                                  }}
                                />
                                <div className="permission-label">
                                  <span className="permission-name">{perm.name}</span>
                                  <span className="permission-desc">{perm.desc}</span>
                                </div>
                              </label>
                            ))}
                        </div>
                      </div>
                    )}

                    <div className="role-editor-actions">
                      <button className="btn btn-secondary" onClick={() => setEditingRole(null)}>
                        Cancel
                      </button>
                      <button 
                        className="btn btn-primary" 
                        onClick={() => {
                          handleUpdateRole(editingRole.id, editingRole)
                          setEditingRole(null)
                        }}
                      >
                        Save Changes
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'members' && (
              <div className="settings-section">
                <div className="section-header-row">
                  <div>
                    <h2>Members</h2>
                    <p className="section-desc">{members.length} members</p>
                  </div>
                  <div className="members-toolbar">
                    <input
                      type="text"
                      className="input"
                      placeholder="Search..."
                      value={memberSearch}
                      onChange={e => setMemberSearch(e.target.value)}
                    />
                    <select
                      className="input"
                      value={roleFilter}
                      onChange={e => setRoleFilter(e.target.value)}
                    >
                      <option value="all">All Roles</option>
                      {roles.map(role => (
                        <option key={role.id} value={role.id}>{role.name}</option>
                      ))}
                      <option value="none">No Roles</option>
                    </select>
                  </div>
                </div>

                <div className="members-simple-list">
                  {members.length === 0 && (
                    <div className="no-members-message">Loading members...</div>
                  )}
                  {members
                    .filter(m => {
                      const matchesSearch = !memberSearch || 
                        m.username?.toLowerCase().includes(memberSearch.toLowerCase())
                      const matchesRole = roleFilter === 'all' || 
                        (roleFilter === 'none' ? (!m.roles || m.roles.length === 0) : m.roles?.includes(roleFilter))
                      return matchesSearch && matchesRole
                    })
                    .map(member => {
                      const canManage = isAdmin
                      const isSelf = member.id === user?.id
                      const memberRoleIds = member.roles || (member.role ? [member.role] : [])
                      return (
                    <div key={member.id} className="member-simple-row">
                      <Avatar
                        src={member.avatar || `${imageApiUrl}/api/images/users/${member.id}/profile`}
                        fallback={member.username}
                        size={32}
                      />
                      <span className="member-simple-name">
                        {member.username}
                        {member.id === server?.ownerId && <Crown size={12} className="owner-crown" />}
                        {isSelf && <span className="you-badge">you</span>}
                      </span>
                      <div className="member-roles-pills">
                        {memberRoleIds.map(rid => {
                          const role = roles.find(r => r.id === rid)
                          const canRemove = canManage || isSelf
                          return (
                            <span 
                              key={rid} 
                              className={`role-pill ${!canRemove ? 'disabled' : ''}`}
                              style={role ? { backgroundColor: role.color + '22', borderColor: role.color, color: role.color } : {}}
                            >
                              {role?.name || rid}
                              {canRemove && (
                                <button 
                                  className="role-pill-remove" 
                                  onClick={() => handleChangeMemberRoles(member.id, memberRoleIds.filter(r => r !== rid))}
                                >
                                  ×
                                </button>
                              )}
                            </span>
                          )
                        })}
                        <div className="role-add-wrapper">
                          <button 
                            className="role-add-pill"
                            onClick={() => setShowRoleMenu(prev => ({ ...prev, [member.id]: !prev[member.id] }))}
                          >
                            +
                          </button>
                          {showRoleMenu[member.id] && (
                            <div className="role-dropdown">
                              {roles.filter(r => r.id !== 'owner' && !memberRoleIds.includes(r.id)).map(role => (
                                <button 
                                  key={role.id}
                                  className="role-dropdown-item"
                                  onClick={() => {
                                    handleChangeMemberRoles(member.id, [...memberRoleIds, role.id])
                                    setShowRoleMenu(prev => ({ ...prev, [member.id]: false }))
                                  }}
                                >
                                  <span className="role-dot" style={{ backgroundColor: role.color }} />
                                  {role.name}
                                </button>
                              ))}
                              {roles.filter(r => r.id !== 'owner' && !memberRoleIds.includes(r.id)).length === 0 && (
                                <div className="role-dropdown-empty">No roles to add</div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="member-action-btns">
                        {isOwner && member.id !== user?.id && (
                          <button 
                            className="member-action-btn transfer" 
                            onClick={() => handleMemberAction(member, 'transfer')}
                            title="Transfer Ownership"
                          >
                            <Crown size={14} />
                          </button>
                        )}
                        <button 
                          className={`member-action-btn kick ${!canManage || isSelf || member.id === server?.ownerId ? 'disabled' : ''}`}
                          onClick={() => canManage && !isSelf && member.id !== server?.ownerId && handleMemberAction(member, 'kick')}
                          title={isSelf || member.id === server?.ownerId ? "Can't kick yourself or owner" : "Kick"}
                          disabled={!canManage || isSelf || member.id === server?.ownerId}
                        >
                          <UserMinus size={14} />
                        </button>
                        <button 
                          className={`member-action-btn ban ${!canManage || isSelf || member.id === server?.ownerId ? 'disabled' : ''}`}
                          onClick={() => canManage && !isSelf && member.id !== server?.ownerId && handleMemberAction(member, 'ban')}
                          title={isSelf || member.id === server?.ownerId ? "Can't ban yourself or owner" : "Ban"}
                          disabled={!canManage || isSelf || member.id === server?.ownerId}
                        >
                          <Ban size={14} />
                        </button>
                      </div>
                    </div>
                  )})}
                </div>
              </div>
            )}

            {activeTab === 'invites' && (
              <div className="settings-section">
                <h2>Server Invites</h2>
                <p className="section-desc">Create and manage invite links</p>

                <button className="btn btn-primary" onClick={handleCreateInvite}>
                  <Plus size={16} /> Create Invite Link
                </button>

                {newInvite && (
                  <div className="new-invite-box">
                    <span className="invite-code">volt.voltagechat.app/invite/{newInvite.code}</span>
                    <button className="btn btn-secondary" onClick={() => handleCopyInvite(newInvite.code)}>
                      <Copy size={16} /> Copy
                    </button>
                  </div>
                )}

                <div className="invites-list">
                  {invites.map(invite => (
                    <div key={invite.code} className="invite-item">
                      <div className="invite-info">
                        <span className="invite-code">{invite.code}</span>
                        <span className="invite-uses">{invite.uses} uses</span>
                      </div>
                      <div className="invite-actions">
                        <button className="icon-btn" onClick={() => handleCopyInvite(invite.code)}>
                          <Copy size={16} />
                        </button>
                        <button className="icon-btn danger" onClick={() => handleDeleteInvite(invite.code)}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {invites.length === 0 && (
                    <div className="no-invites">No active invites</div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'discovery' && (
              <div className="settings-section">
                <h2>Server Discovery</h2>
                <p className="section-desc">Submit your server to the discovery page to let new users find it</p>

                {discoveryStatus?.isInDiscovery ? (
                  <div className="discovery-status-box approved">
                    <div className="discovery-status-header">
                      <CheckCircle size={24} />
                      <h3>Listed in Discovery</h3>
                    </div>
                    <p>Your server is visible on the Server Discovery page</p>
                    <button 
                      className="btn btn-secondary danger" 
                      onClick={handleRemoveFromDiscovery}
                      disabled={discoveryLoading}
                    >
                      {discoveryLoading ? 'Removing...' : 'Remove from Discovery'}
                    </button>
                  </div>
                ) : discoveryStatus?.submission ? (
                  <div className="discovery-status-box pending">
                    <div className="discovery-status-header">
                      <Clock size={24} />
                      <h3>Pending Approval</h3>
                    </div>
                    <p>Your server is waiting for review</p>
                    <span className="discovery-status-info">
                      Submitted: {new Date(discoveryStatus.submission.submittedAt).toLocaleDateString()}
                    </span>
                  </div>
                ) : (
                  <div className="discovery-submit-form">
                    <div className="form-group">
                      <label>Category</label>
                      <div className="category-grid">
                        {discoveryCategories.map(cat => {
                          const IconComponent = CATEGORY_ICONS[cat.id] || Hash
                          return (
                            <button
                              key={cat.id}
                              type="button"
                              className={`category-btn ${discoverySubmit.category === cat.id ? 'selected' : ''}`}
                              onClick={() => setDiscoverySubmit(p => ({ ...p, category: cat.id }))}
                            >
                              <IconComponent size={20} />
                              <span>{cat.name}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Description (optional)</label>
                      <textarea
                        className="input"
                        rows={4}
                        placeholder="Tell users what your server is about..."
                        value={discoverySubmit.description}
                        onChange={(e) => setDiscoverySubmit(p => ({ ...p, description: e.target.value }))}
                        maxLength={500}
                      />
                      <span className="char-count">{discoverySubmit.description.length}/500</span>
                    </div>

                    <button 
                      className="btn btn-primary"
                      onClick={handleSubmitToDiscovery}
                      disabled={!discoverySubmit.category || discoveryLoading}
                    >
                      {discoveryLoading ? 'Submitting...' : 'Submit for Review'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'emojis' && (
              <div className="settings-section">
                <h2>Server Emojis</h2>
                <p className="section-desc">Upload custom emojis for your server. Members can use them in messages with <code>:emoji_name:</code> syntax.</p>

                {(isAdmin || hasPermission('manage_emojis')) && (
                  <div className="emoji-upload-section" style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 24, flexWrap: 'wrap' }}>
                    <div className="form-group" style={{ margin: 0, flex: '1 1 200px' }}>
                      <label>Emoji Name</label>
                      <input
                        type="text"
                        className="input"
                        placeholder="e.g. pepe_happy"
                        value={newEmojiName}
                        onChange={e => setNewEmojiName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                        maxLength={32}
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Image</label>
                      <input
                        ref={emojiFileInputRef}
                        type="file"
                        accept="image/png,image/gif,image/jpeg,image/webp"
                        className="input"
                        style={{ padding: '6px 8px' }}
                      />
                    </div>
                    <button
                      className="btn btn-primary"
                      disabled={!newEmojiName.trim() || uploadingEmoji}
                      onClick={() => {
                        const file = emojiFileInputRef.current?.files?.[0]
                        if (file) handleEmojiUpload(file)
                      }}
                      style={{ height: 38 }}
                    >
                      {uploadingEmoji ? 'Uploading...' : <><Upload size={16} /> Upload Emoji</>}
                    </button>
                  </div>
                )}

                <div className="emoji-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                  {serverEmojis.map(emoji => (
                    <div key={emoji.id} className="emoji-card" style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                      background: 'var(--bg-secondary, #1a1d24)', borderRadius: 8, border: '1px solid var(--border-color, #2a2d35)'
                    }}>
                      <img
                        src={emoji.url}
                        alt={emoji.name}
                        style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 4 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>:{emoji.name}:</div>
                      </div>
                      {(isAdmin || hasPermission('manage_emojis')) && (
                        <button className="icon-btn danger" onClick={() => handleDeleteEmoji(emoji.id)} title="Delete emoji">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {serverEmojis.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted, #888)', fontSize: 14 }}>
                    <Smile size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
                    <p>No custom emojis yet. Upload one above!</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'bots' && (
              <div className="settings-section">
                <h2>Server Bots</h2>
                <p className="section-desc">
                  Manage bots installed in this server. Bots can respond to messages, run commands, and automate tasks.
                </p>
                <ServerBots serverId={server?.id} isOwner={isOwner} canManage={hasPermission('manage_server')} />
              </div>
            )}

            {activeTab === 'security' && (
              <div className="settings-section">
                <h2>End-to-End Encryption</h2>
                <p className="section-desc">
                  Secure your server messages with end-to-end encryption. When enabled, messages can only be read by server members, not even server admins can read them.
                </p>

                <div className="e2e-status-card">
                  <div className="e2e-status-header">
                    <div className="e2e-status-icon">
                      {isEncryptionEnabled(server?.id) ? (
                        <Lock size={32} className="locked" />
                      ) : (
                        <Lock size={32} className="unlocked" />
                      )}
                    </div>
                    <div className="e2e-status-info">
                      <h3>{isEncryptionEnabled(server?.id) ? 'Encryption Enabled' : 'Encryption Disabled'}</h3>
                      <p>
                        {isEncryptionEnabled(server?.id) 
                          ? 'Messages in this server are end-to-end encrypted'
                          : 'Messages are not encrypted in this server'}
                      </p>
                    </div>
                  </div>

                  {isEncryptionEnabled(server?.id) ? (
                    <div className="e2e-status-details">
                      {hasDecryptedKey(server?.id) ? (
                        <div className="e2e-key-status success">
                          <Key size={16} />
                          <span>Your device has the decryption key</span>
                        </div>
                      ) : (
                        <div className="e2e-key-status warning">
                          <Key size={16} />
                          <span>You don't have the decryption key - messages cannot be read</span>
                          <button 
                            className="btn btn-primary btn-sm"
                            onClick={() => joinServerEncryption(server?.id)}
                          >
                            Join Encryption
                          </button>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>

                {isOwner ? (
                  <div className="e2e-actions">
                    {!isEncryptionEnabled(server?.id) ? (
                      <div className="e2e-enable-section">
                        <div className="e2e-warning">
                          <h4>Enable End-to-End Encryption</h4>
                          <ul>
                            <li>All existing messages will remain unencrypted</li>
                            <li>New messages will be encrypted</li>
                            <li>Members will need to join encryption to read messages</li>
                            <li>Members can export their keys for device recovery</li>
                          </ul>
                        </div>
                        <button 
                          className="btn btn-primary"
                          onClick={async () => {
                            if (confirm('Enable end-to-end encryption for this server?')) {
                              await enableServerEncryption(server?.id)
                            }
                          }}
                        >
                          <Lock size={16} />
                          Enable Encryption
                        </button>
                      </div>
                    ) : (
                      <div className="e2e-manage-section">
                        <div className="e2e-info">
                          <h4>Manage Encryption</h4>
                          <p>Current encryption status for this server</p>
                        </div>
                        
                        <div className="e2e-buttons">
                          <button 
                            className="btn btn-secondary"
                            onClick={async () => {
                              if (confirm('Rotate encryption keys? All members will need to rejoin encryption.')) {
                                await rotateServerKeys(server?.id)
                              }
                            }}
                          >
                            <RefreshCw size={16} />
                            Rotate Keys
                          </button>
                          
                          <button 
                            className="btn btn-danger"
                            onClick={async () => {
                              if (confirm('Disable end-to-end encryption? All encrypted messages will become unreadable.')) {
                                await disableServerEncryption(server?.id)
                              }
                            }}
                          >
                            <Lock size={16} />
                            Disable Encryption
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="e2e-member-section">
                    {!isEncryptionEnabled(server?.id) ? (
                      <p>Encryption is not enabled on this server.</p>
                    ) : hasDecryptedKey(server?.id) ? (
                      <div className="e2e-joined">
                        <CheckCircle size={20} />
                        <span>You have joined the encryption - your messages are secure</span>
                      </div>
                    ) : (
                      <div className="e2e-join-prompt">
                        <p>Encryption is enabled on this server. Join to enable reading and sending encrypted messages.</p>
                        <button 
                          className="btn btn-primary"
                          onClick={() => joinServerEncryption(server?.id)}
                        >
                          <Key size={16} />
                          Join Encryption
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'danger' && isOwner && (
              <div className="settings-section danger-zone">
                <h2>Danger Zone</h2>
                <p className="section-desc warning">These actions are irreversible. Be careful!</p>

                <div className="danger-action">
                  <div className="danger-info">
                    <h4>Delete Server</h4>
                    <p>Once you delete a server, there is no going back. Please be certain.</p>
                  </div>
                  {!confirmDelete ? (
                    <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
                      Delete Server
                    </button>
                  ) : (
                    <div className="confirm-delete">
                      <p>Type <strong>{server.name}</strong> to confirm:</p>
                      <input
                        type="text"
                        className="input"
                        value={deleteInput}
                        onChange={e => setDeleteInput(e.target.value)}
                        placeholder={server.name}
                      />
                      <div className="confirm-buttons">
                        <button className="btn btn-secondary" onClick={() => { setConfirmDelete(false); setDeleteInput('') }}>
                          Cancel
                        </button>
                        <button 
                          className="btn btn-danger" 
                          onClick={handleDeleteServer}
                          disabled={deleteInput !== server.name}
                        >
                          Delete Forever
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ServerSettingsModal
