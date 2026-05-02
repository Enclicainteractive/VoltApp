import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { ShieldCheckIcon, UsersIcon, ServerStackIcon, ExclamationTriangleIcon, MagnifyingGlassIcon, ArrowPathIcon, XMarkIcon, TrashIcon, KeyIcon, ClockIcon, ChartBarIcon, CogIcon, CheckIcon, UserPlusIcon, LockClosedIcon, LockOpenIcon, ScaleIcon, GlobeAltIcon, CheckCircleIcon, XCircleIcon, ChatBubbleLeftRightIcon, BoltIcon, NoSymbolIcon, BellIcon, EyeIcon, HashtagIcon } from '@heroicons/react/24/outline'
import { apiService } from '../services/apiService'
import Avatar from './Avatar'
import useTranslation from '../hooks/useTranslation'
import { useAuth } from '../contexts/AuthContext'
import '../assets/styles/AdminPanel.css'

const AdminPanel = ({ onClose, onServersChanged }) => {
  const { t } = useTranslation()
  const { user: currentUser, refreshUser } = useAuth()
  const [activeTab, setActiveTab] = useState('overview')
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [servers, setServers] = useState([])
  const [bannedUsers, setBannedUsers] = useState([])
  const [bannedServers, setBannedServers] = useState([])
  const [logs, setLogs] = useState([])
  const [safetyReports, setSafetyReports] = useState([])
  const [pendingSubmissions, setPendingSubmissions] = useState([])
  const [approvedDiscovery, setApprovedDiscovery] = useState([])
  const [platformHealth, setPlatformHealth] = useState(null)
  const [platformActivity, setPlatformActivity] = useState(null)
  const [selfVolts, setSelfVolts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [selectedServer, setSelectedServer] = useState(null)
  const [serverDetailsLoading, setServerDetailsLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [showOnlineOnly, setShowOnlineOnly] = useState(false)
  const [onlineUsers, setOnlineUsers] = useState([])
  const [loadingOnlineUsers, setLoadingOnlineUsers] = useState(false)
  const [onlineUsersStats, setOnlineUsersStats] = useState(null)
  const [maintenanceStatus, setMaintenanceStatus] = useState(null)
  const [panelNotice, setPanelNotice] = useState(null)
  const [userPage, setUserPage] = useState(1)
  const [serverPage, setServerPage] = useState(1)
  const [userRowsPerPage, setUserRowsPerPage] = useState(20)
  const [serverRowsPerPage, setServerRowsPerPage] = useState(20)
  const [selectedUserIds, setSelectedUserIds] = useState([])
  const [pendingServerBan, setPendingServerBan] = useState(null)
  const [serverBanReason, setServerBanReason] = useState('')
  const [selectedUserBanReason, setSelectedUserBanReason] = useState('')
  const [sectionStatus, setSectionStatus] = useState({
    users: null,
    servers: null,
    safety: null,
    discovery: null,
    selfvolts: null
  })
  const [pendingConfirmation, setPendingConfirmation] = useState(null)
  const [maintenanceForm, setMaintenanceForm] = useState({
    title: 'Scheduled maintenance',
    message: '',
    severity: 'warning',
    startAt: new Date().toISOString().slice(0, 16),
    durationValue: 2,
    durationUnit: 'hour'
  })

  const showNotice = useCallback((type, message) => {
    if (!message) return
    setPanelNotice({
      type,
      message,
      id: Date.now()
    })
  }, [])

  const setScopedStatus = useCallback((scope, type, message) => {
    if (!scope || !message) return
    setSectionStatus((prev) => ({
      ...prev,
      [scope]: {
        type,
        message,
        id: Date.now()
      }
    }))
  }, [])

  const clearScopedStatus = useCallback((scope) => {
    if (!scope) return
    setSectionStatus((prev) => ({
      ...prev,
      [scope]: null
    }))
  }, [])

  const requestConfirmation = useCallback((scope, message, action, payload = {}) => {
    if (!message || !action) return
    setPendingConfirmation({
      scope,
      message,
      action,
      payload,
      id: Date.now()
    })
  }, [])

  useEffect(() => {
    if (!panelNotice) return undefined
    const timer = window.setTimeout(() => setPanelNotice(null), 4600)
    return () => window.clearTimeout(timer)
  }, [panelNotice])
  
  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (activeTab === 'discovery') {
      loadDiscoveryData()
    } else if (activeTab === 'platform') {
      loadPlatformData()
    } else if (activeTab === 'selfvolts') {
      loadSelfVoltsData()
    }
  }, [activeTab])

  useEffect(() => {
    setSelectedUserBanReason('')
  }, [selectedUser?.id])

  const loadSelfVoltsData = async () => {
    try {
      const res = await apiService.getAllSelfVolts()
      setSelfVolts(Array.isArray(res.data) ? res.data : [])
    } catch (err) {
      console.error('Failed to load self-volts:', err)
      showNotice('error', getApiErrorMessage(err, 'Failed to load self-volts'))
    }
  }

  const handleTestSelfVolt = async (voltId) => {
    setActionLoading(true)
    setScopedStatus('selfvolts', 'warning', 'Testing self-volt...')
    try {
      const res = await apiService.testSelfVoltAdmin(voltId)
      setSelfVolts(prev => prev.map(v => 
        v.id === voltId ? { ...v, status: res.data.status, lastTest: new Date().toISOString() } : v
      ))
      showNotice('success', 'Self-volt test completed.')
      setScopedStatus('selfvolts', 'success', 'Self-volt test completed.')
    } catch (err) {
      console.error('Failed to test self-volt:', err)
      const message = getApiErrorMessage(err, 'Failed to test self-volt')
      showNotice('error', message)
      setScopedStatus('selfvolts', 'error', message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleDeleteSelfVolt = async (voltId, skipConfirmation = false) => {
    if (!skipConfirmation) {
      requestConfirmation('selfvolts', t('admin.adminPanel.confirms.deleteSelfVolt'), 'deleteSelfVolt', { voltId })
      return
    }
    setActionLoading(true)
    setScopedStatus('selfvolts', 'warning', 'Removing self-volt...')
    try {
      await apiService.deleteSelfVoltAdmin(voltId)
      setSelfVolts(prev => prev.filter(v => v.id !== voltId))
      showNotice('success', 'Self-volt removed.')
      setScopedStatus('selfvolts', 'success', 'Self-volt removed.')
    } catch (err) {
      console.error('Failed to delete self-volt:', err)
      const message = getApiErrorMessage(err, 'Failed to delete self-volt')
      showNotice('error', message)
      setScopedStatus('selfvolts', 'error', message)
    } finally {
      setActionLoading(false)
    }
  }

  const loadPlatformData = async () => {
    try {
      const [healthRes, activityRes] = await Promise.all([
        apiService.getPlatformHealth(),
        apiService.getPlatformActivity()
      ])
      setPlatformHealth(healthRes.data)
      setPlatformActivity(activityRes.data)
    } catch (err) {
      console.error('Failed to load platform data:', err)
      showNotice('error', getApiErrorMessage(err, 'Failed to load platform data'))
    }
  }

  const loadDiscoveryData = async () => {
    try {
      const [pendingRes, approvedRes] = await Promise.all([
        apiService.getDiscoveryPending(),
        apiService.getDiscoveryApproved({ limit: 50 })
      ])
      setPendingSubmissions(pendingRes.data || [])
      setApprovedDiscovery(approvedRes.data.servers || [])
    } catch (err) {
      console.error('Failed to load discovery data:', err)
      showNotice('error', getApiErrorMessage(err, 'Failed to load discovery data'))
    }
  }

  const handleApproveDiscovery = async (submissionId) => {
    setScopedStatus('discovery', 'warning', 'Approving submission...')
    try {
      await apiService.approveDiscovery(submissionId)
      showNotice('success', 'Submission approved.')
      setScopedStatus('discovery', 'success', 'Submission approved.')
      loadDiscoveryData()
    } catch (err) {
      console.error('Failed to approve:', err)
      const message = getApiErrorMessage(err, 'Failed to approve submission')
      showNotice('error', message)
      setScopedStatus('discovery', 'error', message)
    }
  }

  const handleRejectDiscovery = async (submissionId) => {
    setScopedStatus('discovery', 'warning', 'Rejecting submission...')
    try {
      await apiService.rejectDiscovery(submissionId)
      showNotice('success', 'Submission rejected.')
      setScopedStatus('discovery', 'success', 'Submission rejected.')
      loadDiscoveryData()
    } catch (err) {
      console.error('Failed to reject:', err)
      const message = getApiErrorMessage(err, 'Failed to reject submission')
      showNotice('error', message)
      setScopedStatus('discovery', 'error', message)
    }
  }

  const handleRemoveFromDiscovery = async (serverId, skipConfirmation = false) => {
    if (!skipConfirmation) {
      requestConfirmation('discovery', t('admin.adminPanel.confirms.removeFromDiscovery'), 'removeFromDiscovery', { serverId })
      return
    }
    setScopedStatus('discovery', 'warning', 'Removing server from discovery...')
    try {
      await apiService.removeFromDiscoveryAdmin(serverId)
      showNotice('success', 'Server removed from discovery.')
      setScopedStatus('discovery', 'success', 'Server removed from discovery.')
      loadDiscoveryData()
    } catch (err) {
      console.error('Failed to remove:', err)
      const message = getApiErrorMessage(err, 'Failed to remove server from discovery')
      showNotice('error', message)
      setScopedStatus('discovery', 'error', message)
    }
  }

  const loadData = async () => {
    setLoading(true)
    setError(null)
    setSelectedUserIds([])
    try {
      const results = await Promise.allSettled([
        apiService.getAdminStats(),
        apiService.getAdminUsers({ limit: 250 }),
        apiService.getAdminServers({ limit: 250 }),
        apiService.getBannedUsers(),
        apiService.getBannedServers(),
        apiService.getAdminLogs(100),
        apiService.getAdminOnlineUsersStats(),
        apiService.getSafetyReports({ limit: 100, status: 'open' }),
        apiService.getMaintenanceStatus()
      ])
      
      const hasErrors = results.some(r => r.status === 'rejected')
      if (hasErrors) {
        const firstError = results.find(r => r.status === 'rejected')?.reason
        if (firstError?.response?.status === 403) {
          setError(t('admin.adminPanel.errors.accessDeniedPermissions'))
          showNotice('error', t('admin.adminPanel.errors.accessDeniedPermissions'))
        } else {
          setError(t('admin.adminPanel.errors.partialData'))
          showNotice('warning', t('admin.adminPanel.errors.partialData'))
        }
      }
      
      if (results[0].status === 'fulfilled') {
        const apiStats = results[0].value.data
        setStats({
          users: apiStats.totalUsers,
          servers: apiStats.totalServers,
          channels: apiStats.totalChannels,
          messages: apiStats.totalMessages,
          dms: apiStats.totalDms,
          members: apiStats.totalMembers || 0,
          bannedUsers: apiStats.totalBans || 0,
          bannedServers: 0
        })
      }
      if (results[1].status === 'fulfilled') setUsers(Array.isArray(results[1].value.data?.users) ? results[1].value.data.users : [])
      if (results[2].status === 'fulfilled') setServers(Array.isArray(results[2].value.data?.servers) ? results[2].value.data.servers : [])
      if (results[3].status === 'fulfilled') setBannedUsers(Array.isArray(results[3].value.data) ? results[3].value.data : [])
      if (results[4].status === 'fulfilled') setBannedServers(Array.isArray(results[4].value.data) ? results[4].value.data : [])
      if (results[5].status === 'fulfilled') setLogs(Array.isArray(results[5].value.data) ? results[5].value.data : [])
      if (results[6].status === 'fulfilled') setOnlineUsersStats(results[6].value.data)
      if (results[7].status === 'fulfilled') setSafetyReports(Array.isArray(results[7].value.data) ? results[7].value.data : [])
      if (results[8].status === 'fulfilled') setMaintenanceStatus(results[8].value.data || null)
    } catch (err) {
      console.error('Failed to load admin data:', err)
      setError(t('admin.adminPanel.errors.failedLoadAdminPanel'))
      showNotice('error', getApiErrorMessage(err, t('admin.adminPanel.errors.failedLoadAdminPanel')))
    } finally {
      setLoading(false)
    }
  }

  const handleBanUser = async (userId, reason) => {
    if (!reason || reason.trim().length < 3) {
      showNotice('warning', 'Please enter a ban reason with at least 3 characters.')
      setScopedStatus('users', 'warning', 'Please enter a ban reason with at least 3 characters.')
      return
    }
    setActionLoading(true)
    setScopedStatus('users', 'warning', 'Banning user...')
    try {
      await apiService.banUser(userId, { reason, banType: 'permanent' })
      await loadData()
      setSelectedUser(null)
      setSelectedUserBanReason('')
      showNotice('success', 'User banned successfully.')
      setScopedStatus('users', 'success', 'User banned successfully.')
    } catch (err) {
      console.error('Failed to ban user:', err)
      const message = getApiErrorMessage(err, 'Failed to ban user')
      showNotice('error', message)
      setScopedStatus('users', 'error', message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleUnbanUser = async (userId) => {
    setActionLoading(true)
    setScopedStatus('users', 'warning', 'Unbanning user...')
    try {
      await apiService.unbanUser(userId)
      await loadData()
      showNotice('success', 'User unbanned.')
      setScopedStatus('users', 'success', 'User unbanned.')
    } catch (err) {
      console.error('Failed to unban user:', err)
      const message = getApiErrorMessage(err, 'Failed to unban user')
      showNotice('error', message)
      setScopedStatus('users', 'error', message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleSetRole = async (userId, role) => {
    setActionLoading(true)
    setScopedStatus('users', 'warning', `Updating role to ${formatRoleLabel(role)}...`)
    try {
      await apiService.setUserRole(userId, role)
      await loadData()
      setSelectedUser(null)
      showNotice('success', 'User role updated.')
      setScopedStatus('users', 'success', 'User role updated.')
    } catch (err) {
      console.error('Failed to set role:', err)
      const message = getApiErrorMessage(err, 'Failed to update role')
      showNotice('error', message)
      setScopedStatus('users', 'error', message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleResetPassword = async (userId) => {
    setActionLoading(true)
    setScopedStatus('users', 'warning', 'Resetting password...')
    try {
      const res = await apiService.resetUserPassword(userId)
      showNotice('success', t('admin.adminPanel.alerts.passwordResetToken', { token: res.data.token }))
      setScopedStatus('users', 'success', 'Password reset token generated.')
    } catch (err) {
      console.error('Failed to reset password:', err)
      const message = getApiErrorMessage(err, 'Failed to reset password')
      showNotice('error', message)
      setScopedStatus('users', 'error', message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleDeleteUser = async (userId, skipConfirmation = false) => {
    if (!skipConfirmation) {
      requestConfirmation('users', t('admin.adminPanel.confirms.deleteUserPermanently'), 'deleteUser', { userId })
      return
    }
    setActionLoading(true)
    setScopedStatus('users', 'warning', 'Deleting user...')
    try {
      await apiService.deleteUser(userId)
      await loadData()
      setSelectedUser(null)
      showNotice('success', 'User deleted.')
      setScopedStatus('users', 'success', 'User deleted.')
    } catch (err) {
      console.error('Failed to delete user:', err)
      const message = getApiErrorMessage(err, 'Failed to delete user')
      showNotice('error', message)
      setScopedStatus('users', 'error', message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleVerifyAge = async (userId, category) => {
    setActionLoading(true)
    setScopedStatus('users', 'warning', `Setting age verification: ${t(`admin.adminPanel.age.categories.${category}`)}...`)
    try {
      await apiService.setUserAgeVerification(userId, { 
        category, 
        method: 'admin_manual',
        age: category === 'adult' ? 18 : 13
      })
      if (currentUser?.id === userId) {
        await refreshUser?.()
      }
      await loadData()
      showNotice('success', t('admin.adminPanel.alerts.userVerifiedAs', { category: t(`admin.adminPanel.age.categories.${category}`) }))
      setScopedStatus('users', 'success', t('admin.adminPanel.alerts.userVerifiedAs', { category: t(`admin.adminPanel.age.categories.${category}`) }))
    } catch (err) {
      console.error('Failed to verify age:', err)
      const message = getApiErrorMessage(err, 'Failed to verify age')
      showNotice('error', message)
      setScopedStatus('users', 'error', message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleRemoveAgeVerification = async (userId, skipConfirmation = false) => {
    if (!skipConfirmation) {
      requestConfirmation('users', t('admin.adminPanel.confirms.removeAgeVerification'), 'removeAgeVerification', { userId })
      return
    }
    setActionLoading(true)
    setScopedStatus('users', 'warning', 'Removing age verification...')
    try {
      await apiService.removeUserAgeVerification(userId)
      if (currentUser?.id === userId) {
        await refreshUser?.()
      }
      await loadData()
      showNotice('success', 'Age verification removed.')
      setScopedStatus('users', 'success', 'Age verification removed.')
    } catch (err) {
      console.error('Failed to remove age verification:', err)
      const message = getApiErrorMessage(err, 'Failed to remove age verification')
      showNotice('error', message)
      setScopedStatus('users', 'error', message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleSetUserStatus = async (userId, status) => {
    setActionLoading(true)
    setScopedStatus('users', 'warning', `Setting status to ${formatStatusLabel(status)}...`)
    try {
      await apiService.setUserStatus(userId, { status })
      await loadData()
      showNotice('success', 'User status updated.')
      setScopedStatus('users', 'success', 'User status updated.')
    } catch (err) {
      console.error('Failed to set status:', err)
      const message = getApiErrorMessage(err, 'Failed to set status')
      showNotice('error', message)
      setScopedStatus('users', 'error', message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleBanServer = async (serverId, reason) => {
    if (!reason || reason.trim().length < 3) {
      showNotice('warning', 'Please enter a ban reason with at least 3 characters.')
      setScopedStatus('servers', 'warning', 'Please enter a ban reason with at least 3 characters.')
      return
    }
    setActionLoading(true)
    setScopedStatus('servers', 'warning', 'Banning server...')
    try {
      await apiService.banServer(serverId, reason)
      await loadData()
      setPendingServerBan(null)
      setServerBanReason('')
      showNotice('success', 'Server banned.')
      setScopedStatus('servers', 'success', 'Server banned.')
    } catch (err) {
      console.error('Failed to ban server:', err)
      const message = getApiErrorMessage(err, 'Failed to ban server')
      showNotice('error', message)
      setScopedStatus('servers', 'error', message)
    } finally {
      setActionLoading(false)
    }
  }

  const loadSafetyReports = async () => {
    try {
      const res = await apiService.getSafetyReports({ limit: 100, status: 'open' })
      setSafetyReports(Array.isArray(res.data) ? res.data : [])
    } catch (err) {
      console.error('Failed to load safety reports:', err)
      showNotice('error', getApiErrorMessage(err, 'Failed to load safety reports'))
    }
  }

  const handleResolveSafetyReport = async (reportId, status = 'resolved') => {
    setActionLoading(true)
    setScopedStatus('safety', 'warning', `Updating report as ${status}...`)
    try {
      await apiService.resolveSafetyReport(reportId, { status })
      await loadSafetyReports()
      showNotice('success', `Safety report ${status}.`)
      setScopedStatus('safety', 'success', `Safety report ${status}.`)
    } catch (err) {
      console.error('Failed to resolve safety report:', err)
      const message = getApiErrorMessage(err, 'Failed to resolve safety report')
      showNotice('error', message)
      setScopedStatus('safety', 'error', message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleBanFromSafetyReport = async (reportId, userId, skipConfirmation = false) => {
    if (!userId) return
    if (!skipConfirmation) {
      requestConfirmation('safety', t('admin.adminPanel.confirms.banUserFromSafetyReport', 'Ban this user from the safety report?'), 'banUserFromSafety', { reportId, userId })
      return
    }
    setActionLoading(true)
    setScopedStatus('safety', 'warning', 'Banning user from report...')
    try {
      await apiService.banUserFromSafetyReport(reportId, { userId })
      await loadData()
      showNotice('success', 'User banned from safety report.')
      setScopedStatus('safety', 'success', 'User banned from safety report.')
    } catch (err) {
      console.error('Failed to ban user from safety report:', err)
      const message = getApiErrorMessage(err, 'Failed to ban user from report')
      showNotice('error', message)
      setScopedStatus('safety', 'error', message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleBanServerFromSafetyReport = async (reportId, serverId, skipConfirmation = false) => {
    if (!serverId) return
    if (!skipConfirmation) {
      requestConfirmation('safety', 'Ban this server from the safety report?', 'banServerFromSafety', { reportId, serverId })
      return
    }
    setActionLoading(true)
    setScopedStatus('safety', 'warning', 'Banning server from report...')
    try {
      await apiService.banServerFromSafetyReport(reportId, { serverId })
      await loadData()
      showNotice('success', 'Server banned from safety report.')
      setScopedStatus('safety', 'success', 'Server banned from safety report.')
    } catch (err) {
      console.error('Failed to ban server from safety report:', err)
      const message = getApiErrorMessage(err, 'Failed to ban server from report')
      showNotice('error', message)
      setScopedStatus('safety', 'error', message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleDeleteMessageFromSafetyReport = async (reportId, messageId, skipConfirmation = false) => {
    if (!messageId) return
    if (!skipConfirmation) {
      requestConfirmation('safety', 'Delete this reported message?', 'deleteSafetyMessage', { reportId, messageId })
      return
    }
    setActionLoading(true)
    setScopedStatus('safety', 'warning', 'Removing reported message...')
    try {
      await apiService.deleteMessageFromSafetyReport(reportId, { messageId })
      await loadData()
      showNotice('success', 'Message removed from report.')
      setScopedStatus('safety', 'success', 'Message removed from report.')
    } catch (err) {
      console.error('Failed to delete reported message:', err)
      const message = getApiErrorMessage(err, 'Failed to delete reported message')
      showNotice('error', message)
      setScopedStatus('safety', 'error', message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleUnbanServer = async (serverId) => {
    setActionLoading(true)
    setScopedStatus('servers', 'warning', 'Unbanning server...')
    try {
      await apiService.unbanServer(serverId)
      await loadData()
      showNotice('success', 'Server unbanned.')
      setScopedStatus('servers', 'success', 'Server unbanned.')
    } catch (err) {
      console.error('Failed to unban server:', err)
      const message = getApiErrorMessage(err, 'Failed to unban server')
      showNotice('error', message)
      setScopedStatus('servers', 'error', message)
    } finally {
      setActionLoading(false)
    }
  }

  const loadServerDetails = async (serverId) => {
    setServerDetailsLoading(true)
    setScopedStatus('servers', 'warning', 'Loading server details...')
    try {
      const res = await apiService.getAdminServer(serverId)
      setSelectedServer(res.data || null)
      setScopedStatus('servers', 'success', 'Server details loaded.')
    } catch (err) {
      console.error('Failed to load server details:', err)
      const message = getApiErrorMessage(err, 'Failed to load server details')
      showNotice('error', message)
      setScopedStatus('servers', 'error', message)
    } finally {
      setServerDetailsLoading(false)
    }
  }

  const handleJoinServerAsAdmin = async (serverId) => {
    setActionLoading(true)
    setScopedStatus('servers', 'warning', 'Joining server as admin...')
    try {
      await apiService.joinAdminServer(serverId)
      await loadData()
      if (selectedServer?.id === serverId) {
        await loadServerDetails(serverId)
      }
      await onServersChanged?.()
      showNotice('success', 'Joined server as admin.')
      setScopedStatus('servers', 'success', 'Joined server as admin.')
    } catch (err) {
      console.error('Failed to join server as admin:', err)
      const message = getApiErrorMessage(err, 'Failed to join server')
      showNotice('error', message)
      setScopedStatus('servers', 'error', message)
    } finally {
      setActionLoading(false)
    }
  }

  const loadOnlineUsers = async () => {
    setLoadingOnlineUsers(true)
    try {
      const res = await apiService.getAdminOnlineUsers()
      // Handle new response format { users: [...], total, timestamp }
      const users = res.data?.users || (Array.isArray(res.data) ? res.data : [])
      setOnlineUsers(users)
    } catch (err) {
      console.error('Failed to load online users:', err)
      showNotice('error', getApiErrorMessage(err, 'Failed to load online users'))
    } finally {
      setLoadingOnlineUsers(false)
    }
  }

  const handleToggleOnlineFilter = () => {
    if (!showOnlineOnly && onlineUsers.length === 0) {
      loadOnlineUsers()
    }
    setShowOnlineOnly(!showOnlineOnly)
    setUserPage(1)
    setSelectedUserIds([])
  }

  const query = searchQuery.trim().toLowerCase()
  const displayUsers = showOnlineOnly ? onlineUsers : users
  const filteredUsers = useMemo(() => (
    query
      ? displayUsers.filter((u) => (
        [u.username, u.email, u.id]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query))
      ))
      : displayUsers
  ), [displayUsers, query])

  const filteredServers = useMemo(() => (
    query
      ? servers.filter((s) => (
        [s.name, s.id, s.owner?.username, s.ownerId]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query))
      ))
      : servers
  ), [query, servers])

  const totalUserPages = Math.max(1, Math.ceil(filteredUsers.length / userRowsPerPage))
  const totalServerPages = Math.max(1, Math.ceil(filteredServers.length / serverRowsPerPage))
  const pagedUsers = useMemo(() => {
    const start = (userPage - 1) * userRowsPerPage
    return filteredUsers.slice(start, start + userRowsPerPage)
  }, [filteredUsers, userRowsPerPage, userPage])
  const pagedServers = useMemo(() => {
    const start = (serverPage - 1) * serverRowsPerPage
    return filteredServers.slice(start, start + serverRowsPerPage)
  }, [filteredServers, serverRowsPerPage, serverPage])

  useEffect(() => {
    setUserPage((prev) => Math.min(prev, totalUserPages))
  }, [totalUserPages])

  useEffect(() => {
    setServerPage((prev) => Math.min(prev, totalServerPages))
  }, [totalServerPages])

  useEffect(() => {
    setUserPage(1)
  }, [query, activeTab, userRowsPerPage])

  useEffect(() => {
    setServerPage(1)
  }, [query, activeTab, serverRowsPerPage])

  const selectedUsersCount = selectedUserIds.length
  const allVisibleUsersSelected = pagedUsers.length > 0 && pagedUsers.every((user) => selectedUserIds.includes(user.id))
  const userPageStart = filteredUsers.length === 0 ? 0 : ((userPage - 1) * userRowsPerPage) + 1
  const userPageEnd = filteredUsers.length === 0 ? 0 : Math.min(filteredUsers.length, userPage * userRowsPerPage)
  const serverPageStart = filteredServers.length === 0 ? 0 : ((serverPage - 1) * serverRowsPerPage) + 1
  const serverPageEnd = filteredServers.length === 0 ? 0 : Math.min(filteredServers.length, serverPage * serverRowsPerPage)

  const toggleUserSelection = (userId) => {
    setSelectedUserIds((prev) => (
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    ))
  }

  const toggleSelectVisibleUsers = () => {
    const visibleIds = pagedUsers.map((user) => user.id)
    if (allVisibleUsersSelected) {
      setSelectedUserIds((prev) => prev.filter((id) => !visibleIds.includes(id)))
      return
    }
    setSelectedUserIds((prev) => {
      const next = new Set(prev)
      visibleIds.forEach((id) => next.add(id))
      return Array.from(next)
    })
  }

  const formatCompactNumber = (value) => new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(Number(value) || 0)

  const formatDateTime = (value) => value ? new Date(value).toLocaleString() : t('admin.adminPanel.na')
  const getApiErrorMessage = (err, fallback) => err?.response?.data?.error || err?.message || fallback

  const tabs = [
    { id: 'overview', labelKey: 'admin.adminPanel.tabs.overview', icon: ChartBarIcon },
    { id: 'users', labelKey: 'admin.adminPanel.tabs.users', icon: UsersIcon },
    { id: 'servers', labelKey: 'admin.adminPanel.tabs.servers', icon: ServerStackIcon },
    { id: 'maintenance', label: 'Maintenance', icon: BellIcon },
    { id: 'selfvolts', labelKey: 'admin.adminPanel.tabs.selfvolts', icon: BoltIcon },
    { id: 'discovery', labelKey: 'admin.adminPanel.tabs.discovery', icon: GlobeAltIcon },
    { id: 'platform', labelKey: 'admin.adminPanel.tabs.platform', icon: ChartBarIcon },
    { id: 'bans', labelKey: 'admin.adminPanel.tabs.bans', icon: NoSymbolIcon },
    { id: 'safety', label: 'Safety Reports', icon: ExclamationTriangleIcon },
    { id: 'logs', labelKey: 'admin.adminPanel.tabs.logs', icon: ClockIcon }
  ]

  const formatRoleLabel = (role) => t(`admin.adminPanel.roles.${role}`, role)
  const formatStatusLabel = (status) => t(`admin.adminPanel.status.${status}`, status)
  const getUserStatusTone = (status) => {
    if (status === 'online' || status === 'active') return 'online'
    if (status === 'idle') return 'idle'
    if (status === 'dnd') return 'dnd'
    return 'offline'
  }
  const getAgeBadgeMeta = (ageVerification) => {
    if (!ageVerification) {
      return { tone: 'offline', label: 'Unverified', detail: 'No record' }
    }
    if (ageVerification.proofVerifiedAdult) {
      return { tone: 'online', label: '18+ verified', detail: ageVerification.method || 'proof' }
    }
    if (ageVerification.selfDeclaredAdult && ageVerification.adultAccess) {
      return { tone: 'idle', label: '18+ self-attested', detail: 'Risky to others' }
    }
    if (ageVerification.verified && ageVerification.category === 'child') {
      return { tone: 'offline', label: 'Minor', detail: ageVerification.method || 'verified' }
    }
    return { tone: 'offline', label: 'Unverified', detail: ageVerification.jurisdictionName || 'Needs review' }
  }

  const handleSaveMaintenance = async () => {
    if (!maintenanceForm.message?.trim()) {
      showNotice('warning', 'Please add a maintenance message.')
      return
    }
    setActionLoading(true)
    try {
      const payload = {
        title: maintenanceForm.title,
        message: maintenanceForm.message,
        severity: maintenanceForm.severity,
        startAt: maintenanceForm.startAt ? new Date(maintenanceForm.startAt).toISOString() : new Date().toISOString(),
        durationValue: Number(maintenanceForm.durationValue),
        durationUnit: maintenanceForm.durationUnit
      }
      const res = await apiService.setMaintenanceWindow(payload)
      setMaintenanceStatus(res.data || null)
      showNotice('success', 'Maintenance announcement saved.')
    } catch (err) {
      console.error('Failed to save maintenance window:', err)
      showNotice('error', getApiErrorMessage(err, 'Failed to save maintenance window'))
    } finally {
      setActionLoading(false)
    }
  }

  const handleClearMaintenance = async () => {
    setActionLoading(true)
    try {
      await apiService.clearMaintenanceWindow()
      const res = await apiService.getMaintenanceStatus()
      setMaintenanceStatus(res.data || null)
      showNotice('success', 'Maintenance announcement cleared.')
    } catch (err) {
      console.error('Failed to clear maintenance window:', err)
      showNotice('error', getApiErrorMessage(err, 'Failed to clear maintenance window'))
    } finally {
      setActionLoading(false)
    }
  }

  const runPendingConfirmation = async () => {
    if (!pendingConfirmation) return
    const { action, payload } = pendingConfirmation
    setPendingConfirmation(null)

    switch (action) {
      case 'deleteSelfVolt':
        await handleDeleteSelfVolt(payload.voltId, true)
        return
      case 'removeFromDiscovery':
        await handleRemoveFromDiscovery(payload.serverId, true)
        return
      case 'deleteUser':
        await handleDeleteUser(payload.userId, true)
        return
      case 'removeAgeVerification':
        await handleRemoveAgeVerification(payload.userId, true)
        return
      case 'banUserFromSafety':
        await handleBanFromSafetyReport(payload.reportId, payload.userId, true)
        return
      case 'banServerFromSafety':
        await handleBanServerFromSafetyReport(payload.reportId, payload.serverId, true)
        return
      case 'deleteSafetyMessage':
        await handleDeleteMessageFromSafetyReport(payload.reportId, payload.messageId, true)
        return
      default:
    }
  }

  const renderSectionStatus = (scope, dismissLabel) => {
    const status = sectionStatus[scope]
    if (!status) return null
    return (
      <div className={`admin-inline-status ${status.type}`} role="status" aria-live="polite">
        <span>{status.message}</span>
        <button
          type="button"
          className="admin-inline-status-dismiss"
          onClick={() => clearScopedStatus(scope)}
          aria-label={dismissLabel}
        >
          <XMarkIcon size={14} />
        </button>
      </div>
    )
  }

  const renderConfirmationBanner = () => {
    if (!pendingConfirmation) return null
    return (
      <div className="admin-confirmation-banner" role="alert" aria-live="assertive">
        <div className="admin-confirmation-message">
          <ExclamationTriangleIcon size={16} />
          <span>{pendingConfirmation.message}</span>
        </div>
        <div className="admin-confirmation-actions">
          <button type="button" className="btn btn-danger btn-sm" onClick={runPendingConfirmation} disabled={actionLoading}>
            Confirm
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPendingConfirmation(null)} disabled={actionLoading}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <div className="admin-header-title">
          <ShieldCheckIcon size={24} />
          <h1>{t('admin.adminPanel.title')}</h1>
        </div>
        <button className="admin-close" type="button" onClick={onClose} aria-label="Close admin panel">
          <XMarkIcon size={24} />
        </button>
      </div>

      <div className="admin-tabs">
        {tabs.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
                className={`admin-tab ${activeTab === tab.id ? 'active' : ''}`}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-pressed={activeTab === tab.id}
              >
                <Icon size={18} />
                {tab.label || t(tab.labelKey)}
              </button>
          )
        })}
      </div>

      <div className="admin-content">
        {panelNotice && (
          <div className={`admin-notice ${panelNotice.type}`} role="status" aria-live="polite">
            <span>{panelNotice.message}</span>
            <button type="button" className="admin-notice-dismiss" onClick={() => setPanelNotice(null)} aria-label="Dismiss notice">
              <XMarkIcon size={16} />
            </button>
          </div>
        )}
        {renderConfirmationBanner()}
        {loading ? (
            <div className="admin-loading">
              <div className="loading-spinner"></div>
            <p>{t('admin.adminPanel.loadingData')}</p>
          </div>
        ) : error ? (
          <div className="admin-error">
            <ShieldCheckIcon size={48} />
            <h3>{t('admin.adminPanel.accessDenied')}</h3>
            <p>{error}</p>
            <p className="admin-hint">{t('admin.adminPanel.accessHint')}</p>
          </div>
        ) : (
          <>
            {activeTab === 'overview' && stats && (
              <div className="admin-overview">
                <div className="overview-header">
                  <h2>{t('admin.adminPanel.platformStatistics')}</h2>
                  <button className="btn btn-secondary" type="button" onClick={loadData}>
                    <ArrowPathIcon size={16} /> {t('admin.adminPanel.actions.refresh')}
                  </button>
                </div>
                <div className="admin-stats-grid">
                  <div className="admin-stat-card primary">
                    <div className="stat-icon-wrapper">
                      <UsersIcon size={24} />
                    </div>
                    <div className="stat-info">
                      <span className="stat-value">{stats.users?.toLocaleString() || 0}</span>
                      <span className="stat-label">{t('admin.adminPanel.stats.totalUsers')}</span>
                    </div>
                  </div>
                  <div
                    className="admin-stat-card success"
                    title={onlineUsersStats?.timestamp ? `Last updated: ${new Date(onlineUsersStats.timestamp).toLocaleTimeString()}` : ''}
                  >
                    <div className="stat-icon-wrapper">
                      <UsersIcon size={24} />
                    </div>
                    <div className="stat-info">
                      <span className="stat-value">{onlineUsersStats?.onlineCount?.toLocaleString() || 0}</span>
                      <span className="stat-label">{t('status.online')}</span>
                    </div>
                  </div>
                  <div className="admin-stat-card">
                    <div className="stat-icon-wrapper">
                      <ServerStackIcon size={24} />
                    </div>
                    <div className="stat-info">
                      <span className="stat-value">{stats.servers?.toLocaleString() || 0}</span>
                      <span className="stat-label">{t('admin.adminPanel.stats.totalServers')}</span>
                    </div>
                  </div>
                  <div className="admin-stat-card info">
                    <div className="stat-icon-wrapper">
                      <ChartBarIcon size={24} />
                    </div>
                    <div className="stat-info">
                      <span className="stat-value">{stats.channels?.toLocaleString() || 0}</span>
                      <span className="stat-label">{t('admin.adminPanel.stats.totalChannels')}</span>
                    </div>
                  </div>
                  <div className="admin-stat-card warning">
                    <div className="stat-icon-wrapper">
                      <ChatBubbleLeftRightIcon size={24} />
                    </div>
                    <div className="stat-info">
                      <span className="stat-value">{stats.messages?.toLocaleString() || 0}</span>
                      <span className="stat-label">{t('admin.adminPanel.stats.totalMessages')}</span>
                    </div>
                  </div>
                  <div className="admin-stat-card purple">
                    <div className="stat-icon-wrapper">
                      <BoltIcon size={24} />
                    </div>
                    <div className="stat-info">
                      <span className="stat-value">{stats.members?.toLocaleString() || 0}</span>
                      <span className="stat-label">{t('admin.adminPanel.stats.totalMembers')}</span>
                    </div>
                  </div>
                  <div className="admin-stat-card danger">
                    <div className="stat-icon-wrapper">
                      <NoSymbolIcon size={24} />
                    </div>
                    <div className="stat-info">
                      <span className="stat-value">{((stats.bannedUsers || 0) + (stats.bannedServers || 0)).toLocaleString()}</span>
                      <span className="stat-label">{t('admin.adminPanel.stats.totalBans')}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'users' && (
              <div className="admin-users">
                <div className="admin-toolbar">
                  <div className="admin-search">
                    <MagnifyingGlassIcon size={18} />
                    <input
                      type="text"
                      placeholder={t('admin.adminPanel.placeholders.searchUsers')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      aria-label={t('admin.adminPanel.placeholders.searchUsers')}
                    />
                  </div>
                  <button 
                    className={`btn ${showOnlineOnly ? 'btn-primary' : 'btn-secondary'}`}
                    type="button"
                    onClick={handleToggleOnlineFilter}
                    disabled={loadingOnlineUsers}
                  >
                    {loadingOnlineUsers ? (
                      <ArrowPathIcon size={16} className="spinning" />
                    ) : (
                      <UsersIcon size={16} />
                    )}
                    {showOnlineOnly ? t('admin.adminPanel.actions.showAllUsers') : t('admin.adminPanel.actions.showOnlineOnly')}
                  </button>
                  <button className="btn btn-secondary" type="button" onClick={loadData}>
                    <ArrowPathIcon size={16} /> {t('admin.adminPanel.actions.refresh')}
                  </button>
                </div>
                {renderSectionStatus('users', 'Dismiss user moderation status')}

                <div className="admin-sub-toolbar">
                  <div className="admin-pagination-controls">
                    <label htmlFor="admin-users-per-page">Rows</label>
                    <select
                      id="admin-users-per-page"
                      value={userRowsPerPage}
                      onChange={(e) => setUserRowsPerPage(Number(e.target.value))}
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={40}>40</option>
                    </select>
                    <label htmlFor="admin-users-page">Page</label>
                    <input
                      id="admin-users-page"
                      className="admin-page-input"
                      type="number"
                      min={1}
                      max={totalUserPages}
                      value={userPage}
                      onChange={(e) => {
                        const next = Number(e.target.value || 1)
                        setUserPage(Math.max(1, Math.min(totalUserPages, next)))
                      }}
                      aria-label="Users page number"
                    />
                    <span>of {totalUserPages}</span>
                    <span>{filteredUsers.length} users</span>
                  </div>
                  <div className="admin-selection-actions">
                    <span>{selectedUsersCount} selected</span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={selectedUsersCount !== 1}
                      onClick={() => {
                        if (selectedUsersCount !== 1) return
                        const selected = displayUsers.find((user) => user.id === selectedUserIds[0]) || null
                        setSelectedUser(selected)
                      }}
                    >
                      Open Selected
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={loadData}
                      disabled={loading}
                    >
                      Refresh
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={selectedUsersCount === 0}
                      onClick={() => setSelectedUserIds([])}
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="admin-table">
                  <table>
                    <thead>
                      <tr>
                        <th>
                          <input
                            type="checkbox"
                            checked={allVisibleUsersSelected}
                            onChange={toggleSelectVisibleUsers}
                            aria-label="Select visible users"
                          />
                        </th>
                        <th>{t('admin.adminPanel.table.user')}</th>
                        <th>{t('admin.adminPanel.table.role')}</th>
                        <th>{t('admin.adminPanel.table.status')}</th>
                        <th>{t('admin.adminPanel.table.age')}</th>
                        <th>{t('admin.adminPanel.table.joined')}</th>
                        <th>{t('admin.adminPanel.table.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedUsers.map(user => {
                        const ageBadge = getAgeBadgeMeta(user.ageVerification)
                        return (
                        <tr key={user.id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedUserIds.includes(user.id)}
                              onChange={() => toggleUserSelection(user.id)}
                              aria-label={`Select ${user.username || user.email || user.id}`}
                            />
                          </td>
                          <td>
                            <div className="user-cell">
                              <Avatar src={user.avatar} fallback={user.username} size={32} userId={user.id} />
                              <div>
                                <span className="username">{user.username || user.email}</span>
                                <span className="user-id">{user.id}</span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="admin-badge-cell">
                              <span className={`role-badge ${user.adminRole || 'user'}`}>
                                {formatRoleLabel(user.adminRole || 'user')}
                              </span>
                            </div>
                          </td>
                          <td>
                            <div className="admin-badge-cell">
                              <span className={`status-badge ${getUserStatusTone(user.status || 'offline')}`}>
                                {formatStatusLabel(user.status || 'offline')}
                              </span>
                            </div>
                          </td>
                          <td>
                            <div className="admin-badge-stack">
                              <span className={`status-badge ${ageBadge.tone}`}>
                                {ageBadge.label}
                              </span>
                              <span className="admin-badge-detail">{ageBadge.detail}</span>
                            </div>
                          </td>
                          <td>
                            <div className="admin-date-cell">
                              {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : t('admin.adminPanel.na')}
                            </div>
                          </td>
                          <td>
                            <div className="action-buttons">
                              <button 
                                className="icon-btn" 
                                title={t('admin.adminPanel.actions.viewDetails')}
                                type="button"
                                onClick={() => setSelectedUser(user)}
                                aria-label={t('admin.adminPanel.actions.viewDetails')}
                              >
                                <CogIcon size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )})}
                      {pagedUsers.length === 0 && (
                        <tr>
                          <td colSpan={7}>
                            <div className="admin-empty-row">
                              <strong>{query ? 'No users matched this search.' : 'No users to display.'}</strong>
                              <span>{query ? 'Try a different keyword or clear the filter.' : 'Use refresh to load users again.'}</span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="admin-pagination">
                  <span>Showing {userPageStart}-{userPageEnd} of {filteredUsers.length}</span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={userPage <= 1}
                    onClick={() => setUserPage((prev) => Math.max(1, prev - 1))}
                  >
                    Previous
                  </button>
                  <span>Page {userPage} of {totalUserPages}</span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={userPage >= totalUserPages}
                    onClick={() => setUserPage((prev) => Math.min(totalUserPages, prev + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'servers' && (
              <div className="admin-servers">
                <div className="admin-toolbar">
                  <div className="admin-search">
                    <MagnifyingGlassIcon size={18} />
                    <input
                      type="text"
                      placeholder={t('admin.adminPanel.placeholders.searchServers')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      aria-label={t('admin.adminPanel.placeholders.searchServers')}
                    />
                  </div>
                  <button className="btn btn-secondary" type="button" onClick={loadData}>
                    <ArrowPathIcon size={16} /> {t('admin.adminPanel.actions.refresh')}
                  </button>
                </div>
                {renderSectionStatus('servers', 'Dismiss server moderation status')}

                {pendingServerBan && (
                  <div className="admin-inline-form">
                    <span>Ban <strong>{pendingServerBan.name}</strong></span>
                    <input
                      type="text"
                      className="input"
                      value={serverBanReason}
                      onChange={(e) => setServerBanReason(e.target.value)}
                      placeholder="Enter ban reason"
                    />
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={actionLoading || serverBanReason.trim().length < 3}
                      onClick={() => handleBanServer(pendingServerBan.id, serverBanReason.trim())}
                    >
                      Confirm Ban
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setPendingServerBan(null)
                        setServerBanReason('')
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}

                <div className="admin-sub-toolbar">
                  <div className="admin-pagination-controls">
                    <label htmlFor="admin-servers-per-page">Rows</label>
                    <select
                      id="admin-servers-per-page"
                      value={serverRowsPerPage}
                      onChange={(e) => setServerRowsPerPage(Number(e.target.value))}
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={40}>40</option>
                    </select>
                    <label htmlFor="admin-servers-page">Page</label>
                    <input
                      id="admin-servers-page"
                      className="admin-page-input"
                      type="number"
                      min={1}
                      max={totalServerPages}
                      value={serverPage}
                      onChange={(e) => {
                        const next = Number(e.target.value || 1)
                        setServerPage(Math.max(1, Math.min(totalServerPages, next)))
                      }}
                      aria-label="Servers page number"
                    />
                    <span>of {totalServerPages}</span>
                    <span>{filteredServers.length} servers</span>
                  </div>
                </div>

                <div className="admin-table">
                  <table>
                    <thead>
                      <tr>
                        <th>{t('admin.adminPanel.table.server')}</th>
                        <th>{t('admin.adminPanel.table.owner')}</th>
                        <th>{t('admin.adminPanel.table.members')}</th>
                        <th>{t('admin.adminPanel.table.status')}</th>
                        <th>{t('admin.adminPanel.table.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedServers.map(server => (
                        <tr key={server.id}>
                          <td>
                            <div className="server-cell">
                              <div className="server-icon">
                                {server.icon ? (
                                  <img src={server.icon} alt={server.name} />
                                ) : (
                                  <span>{server.name?.charAt(0)}</span>
                                )}
                              </div>
                              <span className="server-name">{server.name}</span>
                            </div>
                          </td>
                          <td>{server.owner?.username || server.ownerId}</td>
                          <td>{server.memberCount || server.members?.length || 0}</td>
                          <td>
                            {server.isBanned ? (
                              <span className="status-badge banned">{t('admin.adminPanel.status.banned')}</span>
                            ) : (
                              <span className="status-badge active">{t('admin.adminPanel.status.active')}</span>
                            )}
                          </td>
                          <td>
                            <div className="server-admin-actions">
                              <div className="server-inline-metrics">
                                <span><HashtagIcon size={12} /> {server.metrics?.channelCount || 0} channels</span>
                                <span><ChatBubbleLeftRightIcon size={12} /> {formatCompactNumber(server.metrics?.totalMessages || 0)} messages</span>
                              </div>
                              <div className="action-buttons">
                                <button
                                  className="icon-btn"
                                  title="Inspect server"
                                  type="button"
                                  onClick={() => loadServerDetails(server.id)}
                                  aria-label="Inspect server"
                                >
                                  <EyeIcon size={16} />
                                </button>
                                {!server.joined && (
                                  <button
                                    className="icon-btn success"
                                    title="Join server"
                                    type="button"
                                    onClick={() => handleJoinServerAsAdmin(server.id)}
                                    disabled={actionLoading}
                                    aria-label="Join server as admin"
                                  >
                                    <UserPlusIcon size={16} />
                                  </button>
                                )}
                                {server.isBanned ? (
                                  <button 
                                    className="icon-btn success" 
                                    title={t('admin.adminPanel.actions.unbanServer')}
                                    type="button"
                                    onClick={() => handleUnbanServer(server.id)}
                                    aria-label={t('admin.adminPanel.actions.unbanServer')}
                                  >
                                    <LockOpenIcon size={16} />
                                  </button>
                                ) : (
                                  <button 
                                    className="icon-btn danger" 
                                    title={t('admin.adminPanel.actions.banServer')}
                                    type="button"
                                    onClick={() => {
                                      setPendingServerBan({ id: server.id, name: server.name })
                                      setServerBanReason('')
                                    }}
                                    aria-label={t('admin.adminPanel.actions.banServer')}
                                  >
                                    <LockClosedIcon size={16} />
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {pagedServers.length === 0 && (
                        <tr>
                          <td colSpan={5}>
                            <div className="admin-empty-row">
                              <strong>{query ? 'No servers matched this search.' : 'No servers to display.'}</strong>
                              <span>{query ? 'Try a different keyword or clear the filter.' : 'Use refresh to load servers again.'}</span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="admin-pagination">
                  <span>Showing {serverPageStart}-{serverPageEnd} of {filteredServers.length}</span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={serverPage <= 1}
                    onClick={() => setServerPage((prev) => Math.max(1, prev - 1))}
                  >
                    Previous
                  </button>
                  <span>Page {serverPage} of {totalServerPages}</span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={serverPage >= totalServerPages}
                    onClick={() => setServerPage((prev) => Math.min(totalServerPages, prev + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'maintenance' && (
              <div className="admin-platform">
                <div className="admin-toolbar">
                  <h2>Maintenance Announcement</h2>
                  <button className="btn btn-secondary" type="button" onClick={loadData}>
                    <ArrowPathIcon size={16} /> {t('admin.adminPanel.actions.refresh')}
                  </button>
                </div>

                <div className="platform-section">
                  <h3>Current Status</h3>
                  <div className={`platform-stat-card maintenance-status-card ${(maintenanceStatus?.status || 'inactive')}`}>
                    <BellIcon size={24} />
                    <div className="stat-info">
                      <span className="stat-value">{maintenanceStatus?.status || 'inactive'}</span>
                      <span className="stat-label">
                        {maintenanceStatus?.window?.title || 'No maintenance announcement'}
                      </span>
                    </div>
                  </div>
                  {maintenanceStatus?.window?.message && (
                    <p className="maintenance-status-message">{maintenanceStatus.window.message}</p>
                  )}
                  {maintenanceStatus?.window?.startAt && (
                    <p className="maintenance-status-time">
                      Starts: {new Date(maintenanceStatus.window.startAt).toLocaleString()}
                      {maintenanceStatus?.window?.endAt ? ` | Ends: ${new Date(maintenanceStatus.window.endAt).toLocaleString()}` : ''}
                    </p>
                  )}
                </div>

                <div className="platform-section">
                  <h3>Create / Update Announcement</h3>
                  <div className="maintenance-form-card">
                    <div className="maintenance-grid">
                      <input
                        className="input maintenance-input"
                        type="text"
                        value={maintenanceForm.title}
                        onChange={(e) => setMaintenanceForm(prev => ({ ...prev, title: e.target.value }))}
                        placeholder="Title"
                      />
                      <textarea
                        className="input maintenance-input"
                        rows={4}
                        value={maintenanceForm.message}
                        onChange={(e) => setMaintenanceForm(prev => ({ ...prev, message: e.target.value }))}
                        placeholder="Maintenance message shown to all users"
                      />
                    </div>
                    <div className="maintenance-controls">
                      <select
                        className="input maintenance-input"
                        value={maintenanceForm.severity}
                        onChange={(e) => setMaintenanceForm(prev => ({ ...prev, severity: e.target.value }))}
                      >
                        <option value="info">Info</option>
                        <option value="warning">Warning</option>
                        <option value="critical">Critical</option>
                      </select>
                      <input
                        className="input maintenance-input"
                        type="datetime-local"
                        value={maintenanceForm.startAt}
                        onChange={(e) => setMaintenanceForm(prev => ({ ...prev, startAt: e.target.value }))}
                      />
                      <div className="maintenance-duration">
                        <input
                          className="input maintenance-input"
                          type="number"
                          min="1"
                          value={maintenanceForm.durationValue}
                          onChange={(e) => setMaintenanceForm(prev => ({ ...prev, durationValue: e.target.value }))}
                        />
                        <select
                          className="input maintenance-input"
                          value={maintenanceForm.durationUnit}
                          onChange={(e) => setMaintenanceForm(prev => ({ ...prev, durationUnit: e.target.value }))}
                        >
                          <option value="minute">Minutes</option>
                          <option value="hour">Hours</option>
                          <option value="day">Days</option>
                          <option value="week">Weeks</option>
                          <option value="month">Months</option>
                          <option value="year">Years</option>
                        </select>
                      </div>
                    </div>
                    <div className="maintenance-actions">
                      <button className="btn btn-primary" type="button" onClick={handleSaveMaintenance} disabled={actionLoading}>
                        <CheckIcon size={16} /> Save Announcement
                      </button>
                      <button className="btn btn-danger" type="button" onClick={handleClearMaintenance} disabled={actionLoading}>
                        <TrashIcon size={16} /> Clear
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'bans' && (
              <div className="admin-bans">
                <div className="bans-section">
                  <h3>{t('admin.adminPanel.sections.bannedUsers', { count: bannedUsers.length })}</h3>
                  <div className="bans-list">
                    {bannedUsers.length === 0 ? (
                      <p className="no-data">{t('admin.adminPanel.empty.noBannedUsers')}</p>
                    ) : (
                      bannedUsers.map(ban => (
                        <div key={ban.userId} className="ban-item">
                          <div className="ban-info">
                            <span className="ban-user-id">{ban.userId}</span>
                            <span className="ban-reason">{ban.reason}</span>
                            <span className="ban-meta">
                              {t('admin.adminPanel.bans.bannedByOn', {
                                bannedBy: ban.bannedBy,
                                date: new Date(ban.bannedAt).toLocaleDateString()
                              })}
                            </span>
                          </div>
                          <button 
                            className="btn btn-sm btn-secondary"
                            type="button"
                            onClick={() => handleUnbanUser(ban.userId)}
                          >
                            <LockOpenIcon size={14} /> {t('admin.adminPanel.actions.unban')}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="bans-section">
                  <h3>{t('admin.adminPanel.sections.bannedServers', { count: bannedServers.length })}</h3>
                  <div className="bans-list">
                    {bannedServers.length === 0 ? (
                      <p className="no-data">{t('admin.adminPanel.empty.noBannedServers')}</p>
                    ) : (
                      bannedServers.map(ban => (
                        <div key={ban.serverId} className="ban-item">
                          <div className="ban-info">
                            <span className="ban-server-name">{ban.serverName}</span>
                            <span className="ban-reason">{ban.reason}</span>
                            <span className="ban-meta">
                              {t('admin.adminPanel.bans.membersBannedBy', {
                                count: ban.bannedMembers?.length || 0,
                                bannedBy: ban.bannedBy
                              })}
                            </span>
                          </div>
                          <button 
                            className="btn btn-sm btn-secondary"
                            type="button"
                            onClick={() => handleUnbanServer(ban.serverId)}
                          >
                            <LockOpenIcon size={14} /> {t('admin.adminPanel.actions.unban')}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'safety' && (
              <div className="admin-safety-reports">
                <div className="admin-toolbar">
                  <h3>Open Safety Reports</h3>
                  <button className="btn btn-secondary" type="button" onClick={loadSafetyReports}>
                    <ArrowPathIcon size={16} /> {t('admin.adminPanel.actions.refresh')}
                  </button>
                </div>
                {renderSectionStatus('safety', 'Dismiss safety action status')}
                <div className="safety-reports-list">
                  {safetyReports.length === 0 ? (
                    <p className="no-data">No open safety reports</p>
                  ) : (
                    safetyReports.map((report) => (
                      <div key={report.id} className="safety-report-item">
                        <div className="safety-report-main">
                          <div className="safety-report-line">
                            <strong>{report.reportType || 'threat'}</strong>
                            <span className={`status-badge ${report.status === 'open' ? 'offline' : 'online'}`}>{report.status}</span>
                          </div>
                          <div className="safety-report-line mono">
                            report: {report.id}
                          </div>
                          <div className="safety-report-line mono">
                            accused: {report.accusedUserId || 'unknown'} | target: {report.targetUserId || 'unknown'}
                          </div>
                          <div className="safety-report-line">
                            flags: {Object.entries(report.contentFlags || {}).filter(([, v]) => v === true).map(([k]) => k).join(', ') || 'none'}
                          </div>
                          <div className="safety-report-line">
                            context: {report.contextType || 'unknown'} | channel: {report.channelId || 'n/a'} | server: {report.clientMeta?.serverId || 'n/a'} | message: {report.clientMeta?.messageId || 'n/a'}
                          </div>
                          <div className="safety-report-line">
                            reason: {report.clientMeta?.reason || 'n/a'}
                          </div>
                          <div className="safety-report-line">
                            {report.createdAt ? new Date(report.createdAt).toLocaleString() : 'Unknown time'}
                          </div>
                        </div>
                        <div className="safety-report-actions">
                          <button
                            className="btn btn-sm btn-secondary"
                            type="button"
                            onClick={() => handleResolveSafetyReport(report.id, 'resolved')}
                            disabled={actionLoading}
                          >
                            Resolve
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            type="button"
                            onClick={() => handleBanFromSafetyReport(report.id, report.accusedUserId)}
                            disabled={actionLoading || !report.accusedUserId}
                          >
                            Ban User
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            type="button"
                            onClick={() => handleBanServerFromSafetyReport(report.id, report.clientMeta?.serverId)}
                            disabled={actionLoading || !report.clientMeta?.serverId}
                          >
                            Ban Server
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            type="button"
                            onClick={() => handleDeleteMessageFromSafetyReport(report.id, report.clientMeta?.messageId)}
                            disabled={actionLoading || !report.clientMeta?.messageId}
                          >
                            Delete Message
                          </button>
                          <button
                            className="btn btn-sm btn-secondary"
                            type="button"
                            onClick={() => handleResolveSafetyReport(report.id, 'dismissed')}
                            disabled={actionLoading}
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {activeTab === 'discovery' && (
              <div className="admin-discovery">
                <div className="discovery-section">
                  <h3>{t('admin.adminPanel.sections.pendingSubmissions', { count: pendingSubmissions.length })}</h3>
                  {renderSectionStatus('discovery', 'Dismiss discovery action status')}
                  <div className="discovery-list">
                    {pendingSubmissions.length === 0 ? (
                      <p className="no-data">{t('admin.adminPanel.empty.noPendingSubmissions')}</p>
                    ) : (
                      pendingSubmissions.map(sub => (
                        <div key={sub.id} className="discovery-item">
                          <div className="discovery-info">
                            <GlobeAltIcon size={20} />
                            <div>
                              <span className="discovery-name">{sub.name}</span>
                              <span className="discovery-meta">
                                {t('admin.adminPanel.discovery.categorySubmitted', {
                                  category: sub.category,
                                  submittedAt: new Date(sub.submittedAt).toLocaleDateString()
                                })}
                              </span>
                              {sub.description && (
                                <span className="discovery-desc">{sub.description}</span>
                              )}
                            </div>
                          </div>
                          <div className="discovery-actions">
                            <button 
                              className="btn btn-sm btn-primary"
                              type="button"
                              onClick={() => handleApproveDiscovery(sub.id)}
                            >
                              <CheckCircleIcon size={14} /> {t('admin.adminPanel.actions.approve')}
                            </button>
                            <button 
                              className="btn btn-sm btn-danger"
                              type="button"
                              onClick={() => handleRejectDiscovery(sub.id)}
                            >
                              <XCircleIcon size={14} /> {t('admin.adminPanel.actions.reject')}
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="discovery-section">
                  <h3>{t('admin.adminPanel.sections.approvedServers', { count: approvedDiscovery.length })}</h3>
                  <div className="discovery-list">
                    {approvedDiscovery.length === 0 ? (
                      <p className="no-data">{t('admin.adminPanel.empty.noApprovedServers')}</p>
                    ) : (
                      approvedDiscovery.map(server => (
                        <div key={server.id} className="discovery-item">
                          <div className="discovery-info">
                            <GlobeAltIcon size={20} />
                            <div>
                              <span className="discovery-name">{server.name}</span>
                              <span className="discovery-meta">
                                {t('admin.adminPanel.discovery.categoryMembers', {
                                  category: server.category,
                                  memberCount: server.memberCount
                                })}
                              </span>
                            </div>
                          </div>
                          <div className="discovery-actions">
                            <button 
                              className="btn btn-sm btn-danger"
                              type="button"
                              onClick={() => handleRemoveFromDiscovery(server.serverId)}
                            >
                              <XCircleIcon size={14} /> {t('admin.adminPanel.actions.remove')}
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'selfvolts' && (
              <div className="admin-selfvolts">
                <div className="admin-toolbar">
                  <h2>{t('admin.adminPanel.selfvolts.title')}</h2>
                  <button className="btn btn-secondary" type="button" onClick={loadSelfVoltsData}>
                    <ArrowPathIcon size={16} /> {t('admin.adminPanel.actions.refresh')}
                  </button>
                </div>
                {renderSectionStatus('selfvolts', 'Dismiss self-volt action status')}

                {selfVolts.length === 0 ? (
                  <div className="no-data">{t('admin.adminPanel.empty.noSelfVolts')}</div>
                ) : (
                  <div className="selfvolts-grid">
                    {selfVolts.map(volt => (
                      <div key={volt.id} className="selfvolt-card">
                        <div className="selfvolt-header">
                          <div className="selfvolt-icon">
                            {volt.icon ? (
                              <img src={volt.icon} alt={volt.name} />
                            ) : (
                              <BoltIcon size={24} />
                            )}
                          </div>
                          <div className="selfvolt-info">
                            <h3>{volt.name}</h3>
                            <span className="selfvolt-url">{volt.url}</span>
                          </div>
                          <div className={`selfvolt-status ${volt.status || 'unknown'}`}>
                            {volt.status === 'online' ? <CheckCircleIcon size={16} /> : 
                             volt.status === 'offline' ? <XCircleIcon size={16} /> :
                             <ExclamationTriangleIcon size={16} />}
                          </div>
                        </div>
                        
                        {volt.description && (
                          <p className="selfvolt-desc">{volt.description}</p>
                        )}
                        
                        <div className="selfvolt-meta">
                          <span>{t('admin.adminPanel.selfvolts.owner', { owner: volt.ownerUsername || volt.ownerId })}</span>
                          <span>{t('admin.adminPanel.selfvolts.added', { date: new Date(volt.createdAt).toLocaleDateString() })}</span>
                          {volt.lastTest && <span>{t('admin.adminPanel.selfvolts.lastTest', { date: new Date(volt.lastTest).toLocaleString() })}</span>}
                        </div>
                        
                        <div className="selfvolt-actions">
                          <button 
                            className="btn btn-sm btn-secondary"
                            type="button"
                            onClick={() => handleTestSelfVolt(volt.id)}
                            disabled={actionLoading}
                          >
                            <ChartBarIcon size={14} /> {t('admin.adminPanel.actions.test')}
                          </button>
                          <button 
                            className="btn btn-sm btn-danger"
                            type="button"
                            onClick={() => handleDeleteSelfVolt(volt.id)}
                            disabled={actionLoading}
                          >
                            <TrashIcon size={14} /> {t('admin.adminPanel.actions.delete')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'platform' && (
              <div className="admin-platform">
                <h2>{t('admin.adminPanel.platform.monitorTitle')}</h2>
                
                {platformHealth && (
                  <div className="platform-section">
                    <h3>{t('admin.adminPanel.platform.serverHealth')}</h3>
                    <div className="platform-stats-grid">
                      <div className="platform-stat-card">
                        <ChartBarIcon size={24} />
                        <div className="stat-info">
                          <span className="stat-value">{platformHealth.uptime.formatted}</span>
                          <span className="stat-label">{t('admin.adminPanel.platform.uptime')}</span>
                        </div>
                      </div>
                      <div className="platform-stat-card">
                        <ClockIcon size={24} />
                        <div className="stat-info">
                          <span className="stat-value">{new Date(platformHealth.uptime.startTime).toLocaleDateString()}</span>
                          <span className="stat-label">{t('admin.adminPanel.platform.started')}</span>
                        </div>
                      </div>
                      <div className="platform-stat-card">
                        <GlobeAltIcon size={24} />
                        <div className="stat-info">
                          <span className="stat-value">{platformHealth.discovery.approvedServers}</span>
                          <span className="stat-label">{t('admin.adminPanel.platform.discoveryServers')}</span>
                        </div>
                      </div>
                      <div className="platform-stat-card">
                        <ClockIcon size={24} />
                        <div className="stat-info">
                          <span className="stat-value">{platformHealth.discovery.pendingSubmissions}</span>
                          <span className="stat-label">{t('admin.adminPanel.platform.pendingSubmissions')}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {platformActivity && (
                  <div className="platform-section">
                    <h3>{t('admin.adminPanel.platform.activityTitle')}</h3>
                    <div className="platform-stats-grid">
                      <div className="platform-stat-card">
                        <UsersIcon size={24} />
                        <div className="stat-info">
                          <span className="stat-value">{platformActivity.totalUsers}</span>
                          <span className="stat-label">{t('admin.adminPanel.stats.totalUsers')}</span>
                        </div>
                      </div>
                      <div className="platform-stat-card">
                        <ServerStackIcon size={24} />
                        <div className="stat-info">
                          <span className="stat-value">{platformActivity.totalServers}</span>
                          <span className="stat-label">{t('admin.adminPanel.stats.totalServers')}</span>
                        </div>
                      </div>
                      <div className="platform-stat-card">
                        <ChartBarIcon size={24} />
                        <div className="stat-info">
                          <span className="stat-value">{platformActivity.totalMessages}</span>
                          <span className="stat-label">{t('admin.adminPanel.platform.serverMessages')}</span>
                        </div>
                      </div>
                      <div className="platform-stat-card">
                        <ChatBubbleLeftRightIcon size={24} />
                        <div className="stat-info">
                          <span className="stat-value">{platformActivity.totalDMMessages}</span>
                          <span className="stat-label">{t('admin.adminPanel.platform.dmMessages')}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'logs' && (
              <div className="admin-logs">
                <div className="admin-toolbar">
                  <h3>{t('admin.adminPanel.logs.title')}</h3>
                  <button className="btn btn-secondary" type="button" onClick={loadData}>
                    <ArrowPathIcon size={16} /> {t('admin.adminPanel.actions.refresh')}
                  </button>
                </div>
                <div className="logs-list">
                  {logs.length === 0 ? (
                    <p className="no-data">{t('admin.adminPanel.empty.noLogs')}</p>
                  ) : (
                    logs.map(log => (
                      <div key={log.id} className="log-item">
                        <div className="log-icon">
                          <ScaleIcon size={16} />
                        </div>
                        <div className="log-content">
                          <span className="log-action">{log.action}</span>
                          <span className="log-target">{t('admin.adminPanel.logs.target', { targetId: log.targetId })}</span>
                          {log.details && (
                            <span className="log-details">{JSON.stringify(log.details)}</span>
                          )}
                        </div>
                        <span className="log-time">
                          {new Date(log.timestamp).toLocaleString()}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {selectedUser && (
        <div className="modal-overlay" onClick={() => setSelectedUser(null)}>
          <div className="modal admin-user-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header admin-modal-header">
              <h2>{t('admin.adminPanel.userActions.title')}</h2>
              <button className="admin-modal-close" type="button" onClick={() => setSelectedUser(null)} aria-label="Close user actions"><XMarkIcon size={20} /></button>
            </div>
            <div className="modal-content admin-modal-content">
              {renderSectionStatus('users', 'Dismiss user moderation status')}
              {pendingConfirmation?.scope === 'users' && renderConfirmationBanner()}
              <div className="user-details">
                <Avatar src={selectedUser.avatar} fallback={selectedUser.username} size={64} userId={selectedUser.id} />
                <h3>{selectedUser.username || selectedUser.email}</h3>
                <p className="user-id">{selectedUser.id}</p>
              </div>
              
              <div className="user-actions-section">
                <h4>{t('admin.adminPanel.userActions.setRole')}</h4>
                <div className="role-buttons">
                  {['user', 'moderator', 'admin', 'owner'].map(role => (
                    <button
                      key={role}
                      className={`btn btn-sm ${selectedUser.adminRole === role ? 'btn-primary' : 'btn-secondary'}`}
                      type="button"
                      onClick={() => handleSetRole(selectedUser.id, role)}
                      disabled={actionLoading}
                    >
                      {formatRoleLabel(role)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="user-actions-section">
                <h4>{t('admin.adminPanel.userActions.setStatus')}</h4>
                <div className="role-buttons">
                  {['online', 'idle', 'dnd', 'offline'].map(status => (
                    <button
                      key={status}
                      className={`btn btn-sm ${selectedUser.status === status ? 'btn-primary' : 'btn-secondary'}`}
                      type="button"
                      onClick={() => handleSetUserStatus(selectedUser.id, status)}
                      disabled={actionLoading}
                    >
                      {formatStatusLabel(status)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="user-actions-section">
                <h4>{t('admin.adminPanel.userActions.ageVerification')}</h4>
                <div className="role-buttons">
                  <button
                    className={`btn btn-sm ${selectedUser.ageVerification?.category === 'adult' ? 'btn-primary' : 'btn-secondary'}`}
                    type="button"
                    onClick={() => handleVerifyAge(selectedUser.id, 'adult')}
                    disabled={actionLoading}
                  >
                    {t('admin.adminPanel.age.adultOption')}
                  </button>
                  <button
                    className={`btn btn-sm ${selectedUser.ageVerification?.category === 'child' ? 'btn-primary' : 'btn-secondary'}`}
                    type="button"
                    onClick={() => handleVerifyAge(selectedUser.id, 'child')}
                    disabled={actionLoading}
                  >
                    {t('admin.adminPanel.age.childOption')}
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    type="button"
                    onClick={() => handleRemoveAgeVerification(selectedUser.id)}
                    disabled={actionLoading}
                  >
                    {t('admin.adminPanel.actions.remove')}
                  </button>
                </div>
                {selectedUser.ageVerification && (
                  <div className="user-verification-info">
                    <span>{t('admin.adminPanel.age.verified', { value: selectedUser.ageVerification.verified ? t('admin.adminPanel.common.yes') : t('admin.adminPanel.common.no') })}</span>
                    <span>{t('admin.adminPanel.age.category', { category: t(`admin.adminPanel.age.categories.${selectedUser.ageVerification.category}`, selectedUser.ageVerification.category) })}</span>
                    <span>{t('admin.adminPanel.age.method', { method: selectedUser.ageVerification.method })}</span>
                    <span>Jurisdiction: {selectedUser.ageVerification.jurisdictionName || 'Other / Not Listed'}</span>
                    <span>Risk: {selectedUser.ageVerification.riskLabel || 'Unverified'}</span>
                  </div>
                )}
              </div>

              <div className="user-actions-section">
                <h4>{t('admin.adminPanel.userActions.accountActions')}</h4>
                <div className="action-buttons-group">
                  <button 
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => handleResetPassword(selectedUser.id)}
                    disabled={actionLoading}
                  >
                    <KeyIcon size={16} /> {t('admin.adminPanel.actions.resetPassword')}
                  </button>
                  <button 
                    className="btn btn-danger"
                    type="button"
                    onClick={() => handleDeleteUser(selectedUser.id)}
                    disabled={actionLoading}
                  >
                    <TrashIcon size={16} /> {t('admin.adminPanel.actions.deleteUser')}
                  </button>
                </div>
              </div>

              <div className="user-actions-section">
                <h4>{t('admin.adminPanel.userActions.banUser')}</h4>
                <div className="ban-form">
                  <input
                    type="text"
                    className="input"
                    placeholder={t('admin.adminPanel.placeholders.enterBanReason')}
                    value={selectedUserBanReason}
                    onChange={(e) => setSelectedUserBanReason(e.target.value)}
                  />
                  <button 
                    className="btn btn-danger"
                    type="button"
                    onClick={() => handleBanUser(selectedUser.id, selectedUserBanReason.trim())}
                    disabled={actionLoading || selectedUserBanReason.trim().length < 3}
                  >
                    <NoSymbolIcon size={16} /> {t('admin.adminPanel.actions.banUser')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {(selectedServer || serverDetailsLoading) && (
        <div className="modal-overlay" onClick={() => !serverDetailsLoading && setSelectedServer(null)}>
          <div className="modal admin-server-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header admin-modal-header">
              <h2>Server Inspection</h2>
              <button className="admin-modal-close" type="button" onClick={() => setSelectedServer(null)} aria-label="Close server inspection"><XMarkIcon size={20} /></button>
            </div>
            <div className="modal-content admin-modal-content">
              {renderSectionStatus('servers', 'Dismiss server moderation status')}
              {serverDetailsLoading || !selectedServer ? (
                <div className="admin-loading inline">
                  <div className="loading-spinner"></div>
                  <p>Loading server details...</p>
                </div>
              ) : (
                <>
                  <div className="admin-server-hero">
                    <div className="server-cell">
                      <div className="server-icon">
                        {selectedServer.icon ? (
                          <img src={selectedServer.icon} alt={selectedServer.name} />
                        ) : (
                          <span>{selectedServer.name?.charAt(0)}</span>
                        )}
                      </div>
                      <div>
                        <h3>{selectedServer.name}</h3>
                        <p>{selectedServer.description || 'No description set.'}</p>
                        <div className="admin-server-meta">
                          <span>Owner: {selectedServer.owner?.username || selectedServer.ownerId}</span>
                          <span>Created: {formatDateTime(selectedServer.createdAt)}</span>
                          <span>Last message: {formatDateTime(selectedServer.metrics?.lastMessageAt)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="admin-server-hero-actions">
                      {!selectedServer.joined && (
                        <button className="btn btn-primary" type="button" onClick={() => handleJoinServerAsAdmin(selectedServer.id)} disabled={actionLoading}>
                          <UserPlusIcon size={16} /> Join Server
                        </button>
                      )}
                      <button className="btn btn-secondary" type="button" onClick={() => loadServerDetails(selectedServer.id)} disabled={serverDetailsLoading}>
                        <ArrowPathIcon size={16} /> Refresh
                      </button>
                    </div>
                  </div>

                  <div className="admin-server-stats-grid">
                    <div className="admin-stat-card">
                      <div className="stat-icon-wrapper">
                        <UsersIcon size={20} />
                      </div>
                      <div className="stat-info">
                        <span className="stat-value">{selectedServer.members?.length || 0}</span>
                        <span className="stat-label">Members</span>
                      </div>
                    </div>
                    <div className="admin-stat-card">
                      <div className="stat-icon-wrapper">
                        <HashtagIcon size={20} />
                      </div>
                      <div className="stat-info">
                        <span className="stat-value">{selectedServer.channels?.length || 0}</span>
                        <span className="stat-label">Channels</span>
                      </div>
                    </div>
                    <div className="admin-stat-card">
                      <div className="stat-icon-wrapper">
                        <ChatBubbleLeftRightIcon size={20} />
                      </div>
                      <div className="stat-info">
                        <span className="stat-value">{formatCompactNumber(selectedServer.metrics?.totalMessages || 0)}</span>
                        <span className="stat-label">Messages</span>
                      </div>
                    </div>
                    <div className="admin-stat-card">
                      <div className="stat-icon-wrapper">
                        <ChartBarIcon size={20} />
                      </div>
                      <div className="stat-info">
                        <span className="stat-value">{formatCompactNumber(selectedServer.metrics?.recentMessages7d || 0)}</span>
                        <span className="stat-label">7 Day Messages</span>
                      </div>
                    </div>
                  </div>

                  <div className="admin-inspection-grid">
                    <section className="inspection-section">
                      <div className="inspection-section-header">
                        <h4>Channels</h4>
                        <span>{selectedServer.channels?.length || 0}</span>
                      </div>
                      <div className="inspection-list">
                        {(selectedServer.channels || []).map(channel => (
                          <div key={channel.id} className="inspection-item">
                            <div>
                              <strong>#{channel.name}</strong>
                              <span>{channel.type || 'text'}{channel.categoryId ? ` | category ${channel.categoryId}` : ''}</span>
                            </div>
                            <div className="inspection-item-meta">
                              <span>{formatCompactNumber(channel.messageCount || 0)} msgs</span>
                              <span>{formatDateTime(channel.lastMessageAt)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="inspection-section">
                      <div className="inspection-section-header">
                        <h4>Members</h4>
                        <span>{selectedServer.members?.length || 0}</span>
                      </div>
                      <div className="inspection-list">
                        {(selectedServer.members || []).map(member => (
                          <div key={member.id} className="inspection-item">
                            <div className="inspection-member-main">
                              <Avatar src={member.avatar} fallback={member.username} size={28} userId={member.id} />
                              <div>
                                <strong>{member.username}</strong>
                                <span>{member.id}</span>
                              </div>
                            </div>
                            <div className="inspection-item-meta">
                              <span>{member.roles?.join(', ') || member.role || 'member'}</span>
                              <span>{formatDateTime(member.joinedAt)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminPanel
