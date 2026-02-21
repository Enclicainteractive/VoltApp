import React, { useState, useEffect } from 'react'
import { 
  Shield, Users, Server, AlertTriangle, Search, RefreshCw, 
  Ban, Trash2, Key, History, BarChart3, Settings, X, Check,
  UserMinus, UserPlus, Lock, Unlock, Gavel, Globe, Activity, CheckCircle, XCircle, Clock, MessageSquare, Zap
} from 'lucide-react'
import { apiService } from '../services/apiService'
import Avatar from './Avatar'
import useTranslation from '../hooks/useTranslation'
import '../assets/styles/AdminPanel.css'

const AdminPanel = ({ onClose }) => {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState('overview')
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [servers, setServers] = useState([])
  const [bannedUsers, setBannedUsers] = useState([])
  const [bannedServers, setBannedServers] = useState([])
  const [logs, setLogs] = useState([])
  const [pendingSubmissions, setPendingSubmissions] = useState([])
  const [approvedDiscovery, setApprovedDiscovery] = useState([])
  const [platformHealth, setPlatformHealth] = useState(null)
  const [platformActivity, setPlatformActivity] = useState(null)
  const [selfVolts, setSelfVolts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)
  
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

  const loadSelfVoltsData = async () => {
    try {
      const res = await apiService.getAllSelfVolts()
      setSelfVolts(Array.isArray(res.data) ? res.data : [])
    } catch (err) {
      console.error('Failed to load self-volts:', err)
    }
  }

  const handleTestSelfVolt = async (voltId) => {
    setActionLoading(true)
    try {
      const res = await apiService.testSelfVoltAdmin(voltId)
      setSelfVolts(prev => prev.map(v => 
        v.id === voltId ? { ...v, status: res.data.status, lastTest: new Date().toISOString() } : v
      ))
    } catch (err) {
      console.error('Failed to test self-volt:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleDeleteSelfVolt = async (voltId) => {
    if (!confirm(t('admin.adminPanel.confirms.deleteSelfVolt'))) return
    setActionLoading(true)
    try {
      await apiService.deleteSelfVoltAdmin(voltId)
      setSelfVolts(prev => prev.filter(v => v.id !== voltId))
    } catch (err) {
      console.error('Failed to delete self-volt:', err)
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
    }
  }

  const handleApproveDiscovery = async (submissionId) => {
    try {
      await apiService.approveDiscovery(submissionId)
      loadDiscoveryData()
    } catch (err) {
      console.error('Failed to approve:', err)
    }
  }

  const handleRejectDiscovery = async (submissionId) => {
    try {
      await apiService.rejectDiscovery(submissionId)
      loadDiscoveryData()
    } catch (err) {
      console.error('Failed to reject:', err)
    }
  }

  const handleRemoveFromDiscovery = async (serverId) => {
    if (!confirm(t('admin.adminPanel.confirms.removeFromDiscovery'))) return
    try {
      await apiService.removeFromDiscoveryAdmin(serverId)
      loadDiscoveryData()
    } catch (err) {
      console.error('Failed to remove:', err)
    }
  }

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const results = await Promise.allSettled([
        apiService.getAdminStats(),
        apiService.getAdminUsers({ limit: 50 }),
        apiService.getAdminServers({ limit: 50 }),
        apiService.getBannedUsers(),
        apiService.getBannedServers(),
        apiService.getAdminLogs(100)
      ])
      
      const hasErrors = results.some(r => r.status === 'rejected')
      if (hasErrors) {
        const firstError = results.find(r => r.status === 'rejected')?.reason
        if (firstError?.response?.status === 403) {
          setError(t('admin.adminPanel.errors.accessDeniedPermissions'))
        } else {
          setError(t('admin.adminPanel.errors.partialData'))
        }
      }
      
      if (results[0].status === 'fulfilled') setStats(results[0].value.data)
      if (results[1].status === 'fulfilled') setUsers(Array.isArray(results[1].value.data?.users) ? results[1].value.data.users : [])
      if (results[2].status === 'fulfilled') setServers(Array.isArray(results[2].value.data?.servers) ? results[2].value.data.servers : [])
      if (results[3].status === 'fulfilled') setBannedUsers(Array.isArray(results[3].value.data) ? results[3].value.data : [])
      if (results[4].status === 'fulfilled') setBannedServers(Array.isArray(results[4].value.data) ? results[4].value.data : [])
      if (results[5].status === 'fulfilled') setLogs(Array.isArray(results[5].value.data) ? results[5].value.data : [])
    } catch (err) {
      console.error('Failed to load admin data:', err)
      setError(t('admin.adminPanel.errors.failedLoadAdminPanel'))
    } finally {
      setLoading(false)
    }
  }

  const handleBanUser = async (userId, reason) => {
    if (!reason) return
    setActionLoading(true)
    try {
      await apiService.banUser(userId, { reason, banType: 'permanent' })
      await loadData()
      setSelectedUser(null)
    } catch (err) {
      console.error('Failed to ban user:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleUnbanUser = async (userId) => {
    setActionLoading(true)
    try {
      await apiService.unbanUser(userId)
      await loadData()
    } catch (err) {
      console.error('Failed to unban user:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleSetRole = async (userId, role) => {
    setActionLoading(true)
    try {
      await apiService.setUserRole(userId, role)
      await loadData()
      setSelectedUser(null)
    } catch (err) {
      console.error('Failed to set role:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleResetPassword = async (userId) => {
    setActionLoading(true)
    try {
      const res = await apiService.resetUserPassword(userId)
      alert(t('admin.adminPanel.alerts.passwordResetToken', { token: res.data.token }))
    } catch (err) {
      console.error('Failed to reset password:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleDeleteUser = async (userId) => {
    if (!confirm(t('admin.adminPanel.confirms.deleteUserPermanently'))) return
    setActionLoading(true)
    try {
      await apiService.deleteUser(userId)
      await loadData()
      setSelectedUser(null)
    } catch (err) {
      console.error('Failed to delete user:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleVerifyAge = async (userId, category) => {
    setActionLoading(true)
    try {
      await apiService.setUserAgeVerification(userId, { 
        category, 
        method: 'admin_manual',
        age: category === 'adult' ? 18 : 13
      })
      await loadData()
      alert(t('admin.adminPanel.alerts.userVerifiedAs', { category: t(`admin.adminPanel.age.categories.${category}`) }))
    } catch (err) {
      console.error('Failed to verify age:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleRemoveAgeVerification = async (userId) => {
    if (!confirm(t('admin.adminPanel.confirms.removeAgeVerification'))) return
    setActionLoading(true)
    try {
      await apiService.removeUserAgeVerification(userId)
      await loadData()
    } catch (err) {
      console.error('Failed to remove age verification:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleSetUserStatus = async (userId, status) => {
    setActionLoading(true)
    try {
      await apiService.setUserStatus(userId, { status })
      await loadData()
    } catch (err) {
      console.error('Failed to set status:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleBanServer = async (serverId, reason) => {
    if (!reason) return
    setActionLoading(true)
    try {
      await apiService.banServer(serverId, reason)
      await loadData()
    } catch (err) {
      console.error('Failed to ban server:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleUnbanServer = async (serverId) => {
    setActionLoading(true)
    try {
      await apiService.unbanServer(serverId)
      await loadData()
    } catch (err) {
      console.error('Failed to unban server:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const filteredUsers = searchQuery 
    ? users.filter(u => u.username?.toLowerCase().includes(searchQuery.toLowerCase()))
    : users

  const filteredServers = searchQuery
    ? servers.filter(s => s.name?.toLowerCase().includes(searchQuery.toLowerCase()))
    : servers

  const tabs = [
    { id: 'overview', labelKey: 'admin.adminPanel.tabs.overview', icon: BarChart3 },
    { id: 'users', labelKey: 'admin.adminPanel.tabs.users', icon: Users },
    { id: 'servers', labelKey: 'admin.adminPanel.tabs.servers', icon: Server },
    { id: 'selfvolts', labelKey: 'admin.adminPanel.tabs.selfvolts', icon: Zap },
    { id: 'discovery', labelKey: 'admin.adminPanel.tabs.discovery', icon: Globe },
    { id: 'platform', labelKey: 'admin.adminPanel.tabs.platform', icon: Activity },
    { id: 'bans', labelKey: 'admin.adminPanel.tabs.bans', icon: Ban },
    { id: 'logs', labelKey: 'admin.adminPanel.tabs.logs', icon: History }
  ]

  const formatRoleLabel = (role) => t(`admin.adminPanel.roles.${role}`, role)
  const formatStatusLabel = (status) => t(`admin.adminPanel.status.${status}`, status)

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <div className="admin-header-title">
          <Shield size={24} />
          <h1>{t('admin.adminPanel.title')}</h1>
        </div>
        <button className="admin-close" onClick={onClose}>
          <X size={24} />
        </button>
      </div>

      <div className="admin-tabs">
        {tabs.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              className={`admin-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={18} />
              {t(tab.labelKey)}
            </button>
          )
        })}
      </div>

      <div className="admin-content">
        {loading ? (
            <div className="admin-loading">
              <div className="loading-spinner"></div>
            <p>{t('admin.adminPanel.loadingData')}</p>
          </div>
        ) : error ? (
          <div className="admin-error">
            <Shield size={48} />
            <h3>{t('admin.adminPanel.accessDenied')}</h3>
            <p>{error}</p>
            <p className="admin-hint">{t('admin.adminPanel.accessHint')}</p>
          </div>
        ) : (
          <>
            {activeTab === 'overview' && stats && (
              <div className="admin-overview">
                <h2>{t('admin.adminPanel.platformStatistics')}</h2>
                <div className="admin-stats-grid">
                  <div className="admin-stat-card">
                    <Users size={24} />
                    <div className="stat-info">
                      <span className="stat-value">{stats.totalUsers}</span>
                      <span className="stat-label">{t('admin.adminPanel.stats.totalUsers')}</span>
                    </div>
                  </div>
                  <div className="admin-stat-card">
                    <Server size={24} />
                    <div className="stat-info">
                      <span className="stat-value">{stats.totalServers}</span>
                      <span className="stat-label">{t('admin.adminPanel.stats.totalServers')}</span>
                    </div>
                  </div>
                  <div className="admin-stat-card">
                    <BarChart3 size={24} />
                    <div className="stat-info">
                      <span className="stat-value">{stats.totalChannels}</span>
                      <span className="stat-label">{t('admin.adminPanel.stats.totalChannels')}</span>
                    </div>
                  </div>
                  <div className="admin-stat-card">
                    <AlertTriangle size={24} />
                    <div className="stat-info">
                      <span className="stat-value">{stats.totalMessages}</span>
                      <span className="stat-label">{t('admin.adminPanel.stats.totalMessages')}</span>
                    </div>
                  </div>
                  <div className="admin-stat-card">
                    <Users size={24} />
                    <div className="stat-info">
                      <span className="stat-value">{stats.totalMembers}</span>
                      <span className="stat-label">{t('admin.adminPanel.stats.totalMembers')}</span>
                    </div>
                  </div>
                  <div className="admin-stat-card danger">
                    <Ban size={24} />
                    <div className="stat-info">
                      <span className="stat-value">{stats.totalBannedUsers + stats.totalBannedServers}</span>
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
                    <Search size={18} />
                    <input
                      type="text"
                      placeholder={t('admin.adminPanel.placeholders.searchUsers')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <button className="btn btn-secondary" onClick={loadData}>
                    <RefreshCw size={16} /> {t('admin.adminPanel.actions.refresh')}
                  </button>
                </div>

                <div className="admin-table">
                  <table>
                    <thead>
                      <tr>
                        <th>{t('admin.adminPanel.table.user')}</th>
                        <th>{t('admin.adminPanel.table.role')}</th>
                        <th>{t('admin.adminPanel.table.status')}</th>
                        <th>{t('admin.adminPanel.table.age')}</th>
                        <th>{t('admin.adminPanel.table.joined')}</th>
                        <th>{t('admin.adminPanel.table.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map(user => (
                        <tr key={user.id}>
                          <td>
                            <div className="user-cell">
                              <Avatar src={user.avatar} fallback={user.username} size={32} />
                              <div>
                                <span className="username">{user.username || user.email}</span>
                                <span className="user-id">{user.id}</span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={`role-badge ${user.adminRole || 'user'}`}>
                              {formatRoleLabel(user.adminRole || 'user')}
                            </span>
                          </td>
                          <td>
                            <span className={`status-badge ${user.status || 'offline'}`}>
                              {formatStatusLabel(user.status || 'offline')}
                            </span>
                          </td>
                          <td>
                            {user.ageVerification?.verified ? (
                              <span className={`status-badge ${user.ageVerification.category === 'adult' ? 'online' : 'offline'}`}>
                                {user.ageVerification.category === 'adult'
                                  ? t('admin.adminPanel.age.adultBadge')
                                  : t('admin.adminPanel.age.childBadge')}
                              </span>
                            ) : (
                              <span className="status-badge offline">{t('admin.adminPanel.age.unverified')}</span>
                            )}
                          </td>
                          <td>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : t('admin.adminPanel.na')}</td>
                          <td>
                            <div className="action-buttons">
                              <button 
                                className="icon-btn" 
                                title={t('admin.adminPanel.actions.viewDetails')}
                                onClick={() => setSelectedUser(user)}
                              >
                                <Settings size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'servers' && (
              <div className="admin-servers">
                <div className="admin-toolbar">
                  <div className="admin-search">
                    <Search size={18} />
                    <input
                      type="text"
                      placeholder={t('admin.adminPanel.placeholders.searchServers')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <button className="btn btn-secondary" onClick={loadData}>
                    <RefreshCw size={16} /> {t('admin.adminPanel.actions.refresh')}
                  </button>
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
                      {filteredServers.map(server => (
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
                          <td>{server.ownerId}</td>
                          <td>{server.members?.length || 0}</td>
                          <td>
                            {server.isBanned ? (
                              <span className="status-badge banned">{t('admin.adminPanel.status.banned')}</span>
                            ) : (
                              <span className="status-badge active">{t('admin.adminPanel.status.active')}</span>
                            )}
                          </td>
                          <td>
                            <div className="action-buttons">
                              {server.isBanned ? (
                                <button 
                                  className="icon-btn success" 
                                  title={t('admin.adminPanel.actions.unbanServer')}
                                  onClick={() => handleUnbanServer(server.id)}
                                >
                                  <Unlock size={16} />
                                </button>
                              ) : (
                                <button 
                                  className="icon-btn danger" 
                                  title={t('admin.adminPanel.actions.banServer')}
                                  onClick={() => {
                                    const reason = prompt(t('admin.adminPanel.prompts.enterBanReason'))
                                    if (reason) handleBanServer(server.id, reason)
                                  }}
                                >
                                  <Lock size={16} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
                            onClick={() => handleUnbanUser(ban.userId)}
                          >
                            <Unlock size={14} /> {t('admin.adminPanel.actions.unban')}
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
                            onClick={() => handleUnbanServer(ban.serverId)}
                          >
                            <Unlock size={14} /> {t('admin.adminPanel.actions.unban')}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'discovery' && (
              <div className="admin-discovery">
                <div className="discovery-section">
                  <h3>{t('admin.adminPanel.sections.pendingSubmissions', { count: pendingSubmissions.length })}</h3>
                  <div className="discovery-list">
                    {pendingSubmissions.length === 0 ? (
                      <p className="no-data">{t('admin.adminPanel.empty.noPendingSubmissions')}</p>
                    ) : (
                      pendingSubmissions.map(sub => (
                        <div key={sub.id} className="discovery-item">
                          <div className="discovery-info">
                            <Globe size={20} />
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
                              onClick={() => handleApproveDiscovery(sub.id)}
                            >
                              <CheckCircle size={14} /> {t('admin.adminPanel.actions.approve')}
                            </button>
                            <button 
                              className="btn btn-sm btn-danger"
                              onClick={() => handleRejectDiscovery(sub.id)}
                            >
                              <XCircle size={14} /> {t('admin.adminPanel.actions.reject')}
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
                            <Globe size={20} />
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
                              onClick={() => handleRemoveFromDiscovery(server.serverId)}
                            >
                              <XCircle size={14} /> {t('admin.adminPanel.actions.remove')}
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
                  <button className="btn btn-secondary" onClick={loadSelfVoltsData}>
                    <RefreshCw size={16} /> {t('admin.adminPanel.actions.refresh')}
                  </button>
                </div>

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
                              <Zap size={24} />
                            )}
                          </div>
                          <div className="selfvolt-info">
                            <h3>{volt.name}</h3>
                            <span className="selfvolt-url">{volt.url}</span>
                          </div>
                          <div className={`selfvolt-status ${volt.status || 'unknown'}`}>
                            {volt.status === 'online' ? <CheckCircle size={16} /> : 
                             volt.status === 'offline' ? <XCircle size={16} /> :
                             <AlertTriangle size={16} />}
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
                            onClick={() => handleTestSelfVolt(volt.id)}
                            disabled={actionLoading}
                          >
                            <Activity size={14} /> {t('admin.adminPanel.actions.test')}
                          </button>
                          <button 
                            className="btn btn-sm btn-danger"
                            onClick={() => handleDeleteSelfVolt(volt.id)}
                            disabled={actionLoading}
                          >
                            <Trash2 size={14} /> {t('admin.adminPanel.actions.delete')}
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
                        <Activity size={24} />
                        <div className="stat-info">
                          <span className="stat-value">{platformHealth.uptime.formatted}</span>
                          <span className="stat-label">{t('admin.adminPanel.platform.uptime')}</span>
                        </div>
                      </div>
                      <div className="platform-stat-card">
                        <Clock size={24} />
                        <div className="stat-info">
                          <span className="stat-value">{new Date(platformHealth.uptime.startTime).toLocaleDateString()}</span>
                          <span className="stat-label">{t('admin.adminPanel.platform.started')}</span>
                        </div>
                      </div>
                      <div className="platform-stat-card">
                        <Globe size={24} />
                        <div className="stat-info">
                          <span className="stat-value">{platformHealth.discovery.approvedServers}</span>
                          <span className="stat-label">{t('admin.adminPanel.platform.discoveryServers')}</span>
                        </div>
                      </div>
                      <div className="platform-stat-card">
                        <Clock size={24} />
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
                        <Users size={24} />
                        <div className="stat-info">
                          <span className="stat-value">{platformActivity.totalUsers}</span>
                          <span className="stat-label">{t('admin.adminPanel.stats.totalUsers')}</span>
                        </div>
                      </div>
                      <div className="platform-stat-card">
                        <Server size={24} />
                        <div className="stat-info">
                          <span className="stat-value">{platformActivity.totalServers}</span>
                          <span className="stat-label">{t('admin.adminPanel.stats.totalServers')}</span>
                        </div>
                      </div>
                      <div className="platform-stat-card">
                        <BarChart3 size={24} />
                        <div className="stat-info">
                          <span className="stat-value">{platformActivity.totalMessages}</span>
                          <span className="stat-label">{t('admin.adminPanel.platform.serverMessages')}</span>
                        </div>
                      </div>
                      <div className="platform-stat-card">
                        <MessageSquare size={24} />
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
                  <button className="btn btn-secondary" onClick={loadData}>
                    <RefreshCw size={16} /> {t('admin.adminPanel.actions.refresh')}
                  </button>
                </div>
                <div className="logs-list">
                  {logs.length === 0 ? (
                    <p className="no-data">{t('admin.adminPanel.empty.noLogs')}</p>
                  ) : (
                    logs.map(log => (
                      <div key={log.id} className="log-item">
                        <div className="log-icon">
                          <Gavel size={16} />
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
            <div className="modal-header">
              <h2>{t('admin.adminPanel.userActions.title')}</h2>
              <button onClick={() => setSelectedUser(null)}><X size={20} /></button>
            </div>
            <div className="modal-content">
              <div className="user-details">
                <Avatar src={selectedUser.avatar} fallback={selectedUser.username} size={64} />
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
                    onClick={() => handleVerifyAge(selectedUser.id, 'adult')}
                    disabled={actionLoading}
                  >
                    {t('admin.adminPanel.age.adultOption')}
                  </button>
                  <button
                    className={`btn btn-sm ${selectedUser.ageVerification?.category === 'child' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => handleVerifyAge(selectedUser.id, 'child')}
                    disabled={actionLoading}
                  >
                    {t('admin.adminPanel.age.childOption')}
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
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
                  </div>
                )}
              </div>

              <div className="user-actions-section">
                <h4>{t('admin.adminPanel.userActions.accountActions')}</h4>
                <div className="action-buttons-group">
                  <button 
                    className="btn btn-secondary"
                    onClick={() => handleResetPassword(selectedUser.id)}
                    disabled={actionLoading}
                  >
                    <Key size={16} /> {t('admin.adminPanel.actions.resetPassword')}
                  </button>
                  <button 
                    className="btn btn-danger"
                    onClick={() => handleDeleteUser(selectedUser.id)}
                    disabled={actionLoading}
                  >
                    <Trash2 size={16} /> {t('admin.adminPanel.actions.deleteUser')}
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
                    id="banReason"
                  />
                  <button 
                    className="btn btn-danger"
                    onClick={() => {
                      const reason = document.getElementById('banReason').value
                      handleBanUser(selectedUser.id, reason)
                    }}
                    disabled={actionLoading}
                  >
                    <Ban size={16} /> {t('admin.adminPanel.actions.banUser')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminPanel
