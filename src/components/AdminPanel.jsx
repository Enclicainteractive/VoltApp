import React, { useState, useEffect } from 'react'
import { 
  Shield, Users, Server, AlertTriangle, Search, RefreshCw, 
  Ban, Trash2, Key, History, BarChart3, Settings, X, Check,
  UserMinus, UserPlus, Lock, Unlock, Gavel, Globe, Activity, CheckCircle, XCircle, Clock, MessageSquare, Zap
} from 'lucide-react'
import { apiService } from '../services/apiService'
import Avatar from './Avatar'
import '../assets/styles/AdminPanel.css'

const AdminPanel = ({ onClose }) => {
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
      setSelfVolts(res.data || [])
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
    if (!confirm('Are you sure you want to delete this Self-Volt?')) return
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
    if (!confirm('Remove this server from discovery?')) return
    try {
      await apiService.removeFromDiscovery(serverId)
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
          setError('Access denied. Admin permissions required.')
        } else {
          setError('Failed to load some data. Showing partial results.')
        }
      }
      
      if (results[0].status === 'fulfilled') setStats(results[0].value.data)
      if (results[1].status === 'fulfilled') setUsers(results[1].value.data.users || [])
      if (results[2].status === 'fulfilled') setServers(results[2].value.data.servers || [])
      if (results[3].status === 'fulfilled') setBannedUsers(results[3].value.data || [])
      if (results[4].status === 'fulfilled') setBannedServers(results[4].value.data || [])
      if (results[5].status === 'fulfilled') setLogs(results[5].value.data || [])
    } catch (err) {
      console.error('Failed to load admin data:', err)
      setError('Failed to load admin panel data.')
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
      alert(`Password reset token: ${res.data.token}`)
    } catch (err) {
      console.error('Failed to reset password:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleDeleteUser = async (userId) => {
    if (!confirm('Are you sure you want to permanently delete this user?')) return
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
      alert(`User verified as ${category}`)
    } catch (err) {
      console.error('Failed to verify age:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleRemoveAgeVerification = async (userId) => {
    if (!confirm('Remove age verification from this user?')) return
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
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'servers', label: 'Servers', icon: Server },
    { id: 'selfvolts', label: 'Self-Volts', icon: Zap },
    { id: 'discovery', label: 'Discovery', icon: Globe },
    { id: 'platform', label: 'Platform', icon: Activity },
    { id: 'bans', label: 'Bans', icon: Ban },
    { id: 'logs', label: 'Logs', icon: History }
  ]

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <div className="admin-header-title">
          <Shield size={24} />
          <h1>Admin Panel</h1>
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
              {tab.label}
            </button>
          )
        })}
      </div>

      <div className="admin-content">
        {loading ? (
          <div className="admin-loading">
            <div className="loading-spinner"></div>
            <p>Loading admin data...</p>
          </div>
        ) : error ? (
          <div className="admin-error">
            <Shield size={48} />
            <h3>Access Denied</h3>
            <p>{error}</p>
            <p className="admin-hint">Make sure your account has admin/moderator role set in the database.</p>
          </div>
        ) : (
          <>
            {activeTab === 'overview' && stats && (
              <div className="admin-overview">
                <h2>Platform Statistics</h2>
                <div className="admin-stats-grid">
                  <div className="admin-stat-card">
                    <Users size={24} />
                    <div className="stat-info">
                      <span className="stat-value">{stats.totalUsers}</span>
                      <span className="stat-label">Total Users</span>
                    </div>
                  </div>
                  <div className="admin-stat-card">
                    <Server size={24} />
                    <div className="stat-info">
                      <span className="stat-value">{stats.totalServers}</span>
                      <span className="stat-label">Total Servers</span>
                    </div>
                  </div>
                  <div className="admin-stat-card">
                    <BarChart3 size={24} />
                    <div className="stat-info">
                      <span className="stat-value">{stats.totalChannels}</span>
                      <span className="stat-label">Total Channels</span>
                    </div>
                  </div>
                  <div className="admin-stat-card">
                    <AlertTriangle size={24} />
                    <div className="stat-info">
                      <span className="stat-value">{stats.totalMessages}</span>
                      <span className="stat-label">Total Messages</span>
                    </div>
                  </div>
                  <div className="admin-stat-card">
                    <Users size={24} />
                    <div className="stat-info">
                      <span className="stat-value">{stats.totalMembers}</span>
                      <span className="stat-label">Total Members</span>
                    </div>
                  </div>
                  <div className="admin-stat-card danger">
                    <Ban size={24} />
                    <div className="stat-info">
                      <span className="stat-value">{stats.totalBannedUsers + stats.totalBannedServers}</span>
                      <span className="stat-label">Total Bans</span>
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
                      placeholder="Search users..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <button className="btn btn-secondary" onClick={loadData}>
                    <RefreshCw size={16} /> Refresh
                  </button>
                </div>

                <div className="admin-table">
                  <table>
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Age</th>
                        <th>Joined</th>
                        <th>Actions</th>
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
                              {user.adminRole || 'user'}
                            </span>
                          </td>
                          <td>
                            <span className={`status-badge ${user.status || 'offline'}`}>
                              {user.status || 'offline'}
                            </span>
                          </td>
                          <td>
                            {user.ageVerification?.verified ? (
                              <span className={`status-badge ${user.ageVerification.category === 'adult' ? 'online' : 'offline'}`}>
                                {user.ageVerification.category === 'adult' ? 'Adult ✓' : 'Child'}
                              </span>
                            ) : (
                              <span className="status-badge offline">Unverified</span>
                            )}
                          </td>
                          <td>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}</td>
                          <td>
                            <div className="action-buttons">
                              <button 
                                className="icon-btn" 
                                title="View Details"
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
                      placeholder="Search servers..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <button className="btn btn-secondary" onClick={loadData}>
                    <RefreshCw size={16} /> Refresh
                  </button>
                </div>

                <div className="admin-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Server</th>
                        <th>Owner</th>
                        <th>Members</th>
                        <th>Status</th>
                        <th>Actions</th>
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
                              <span className="status-badge banned">Banned</span>
                            ) : (
                              <span className="status-badge active">Active</span>
                            )}
                          </td>
                          <td>
                            <div className="action-buttons">
                              {server.isBanned ? (
                                <button 
                                  className="icon-btn success" 
                                  title="Unban Server"
                                  onClick={() => handleUnbanServer(server.id)}
                                >
                                  <Unlock size={16} />
                                </button>
                              ) : (
                                <button 
                                  className="icon-btn danger" 
                                  title="Ban Server"
                                  onClick={() => {
                                    const reason = prompt('Enter ban reason:')
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
                  <h3>Banned Users ({bannedUsers.length})</h3>
                  <div className="bans-list">
                    {bannedUsers.length === 0 ? (
                      <p className="no-data">No banned users</p>
                    ) : (
                      bannedUsers.map(ban => (
                        <div key={ban.userId} className="ban-item">
                          <div className="ban-info">
                            <span className="ban-user-id">{ban.userId}</span>
                            <span className="ban-reason">{ban.reason}</span>
                            <span className="ban-meta">
                              Banned by {ban.bannedBy} on {new Date(ban.bannedAt).toLocaleDateString()}
                            </span>
                          </div>
                          <button 
                            className="btn btn-sm btn-secondary"
                            onClick={() => handleUnbanUser(ban.userId)}
                          >
                            <Unlock size={14} /> Unban
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="bans-section">
                  <h3>Banned Servers ({bannedServers.length})</h3>
                  <div className="bans-list">
                    {bannedServers.length === 0 ? (
                      <p className="no-data">No banned servers</p>
                    ) : (
                      bannedServers.map(ban => (
                        <div key={ban.serverId} className="ban-item">
                          <div className="ban-info">
                            <span className="ban-server-name">{ban.serverName}</span>
                            <span className="ban-reason">{ban.reason}</span>
                            <span className="ban-meta">
                              {ban.bannedMembers?.length || 0} members banned | By {ban.bannedBy}
                            </span>
                          </div>
                          <button 
                            className="btn btn-sm btn-secondary"
                            onClick={() => handleUnbanServer(ban.serverId)}
                          >
                            <Unlock size={14} /> Unban
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
                  <h3>Pending Submissions ({pendingSubmissions.length})</h3>
                  <div className="discovery-list">
                    {pendingSubmissions.length === 0 ? (
                      <p className="no-data">No pending submissions</p>
                    ) : (
                      pendingSubmissions.map(sub => (
                        <div key={sub.id} className="discovery-item">
                          <div className="discovery-info">
                            <Globe size={20} />
                            <div>
                              <span className="discovery-name">{sub.name}</span>
                              <span className="discovery-meta">
                                Category: {sub.category} | Submitted: {new Date(sub.submittedAt).toLocaleDateString()}
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
                              <CheckCircle size={14} /> Approve
                            </button>
                            <button 
                              className="btn btn-sm btn-danger"
                              onClick={() => handleRejectDiscovery(sub.id)}
                            >
                              <XCircle size={14} /> Reject
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="discovery-section">
                  <h3>Approved Servers ({approvedDiscovery.length})</h3>
                  <div className="discovery-list">
                    {approvedDiscovery.length === 0 ? (
                      <p className="no-data">No approved servers</p>
                    ) : (
                      approvedDiscovery.map(server => (
                        <div key={server.id} className="discovery-item">
                          <div className="discovery-info">
                            <Globe size={20} />
                            <div>
                              <span className="discovery-name">{server.name}</span>
                              <span className="discovery-meta">
                                Category: {server.category} | Members: {server.memberCount}
                              </span>
                            </div>
                          </div>
                          <div className="discovery-actions">
                            <button 
                              className="btn btn-sm btn-danger"
                              onClick={() => handleRemoveFromDiscovery(server.serverId)}
                            >
                              <XCircle size={14} /> Remove
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
                  <h2>Self-Volt Servers</h2>
                  <button className="btn btn-secondary" onClick={loadSelfVoltsData}>
                    <RefreshCw size={16} /> Refresh
                  </button>
                </div>

                {selfVolts.length === 0 ? (
                  <div className="no-data">No Self-Volt servers registered</div>
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
                          <span>Owner: {volt.ownerUsername || volt.ownerId}</span>
                          <span>Added: {new Date(volt.createdAt).toLocaleDateString()}</span>
                          {volt.lastTest && <span>Last test: {new Date(volt.lastTest).toLocaleString()}</span>}
                        </div>
                        
                        <div className="selfvolt-actions">
                          <button 
                            className="btn btn-sm btn-secondary"
                            onClick={() => handleTestSelfVolt(volt.id)}
                            disabled={actionLoading}
                          >
                            <Activity size={14} /> Test
                          </button>
                          <button 
                            className="btn btn-sm btn-danger"
                            onClick={() => handleDeleteSelfVolt(volt.id)}
                            disabled={actionLoading}
                          >
                            <Trash2 size={14} /> Delete
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
                <h2>Self-Volt Platform Monitor</h2>
                
                {platformHealth && (
                  <div className="platform-section">
                    <h3>Server Health</h3>
                    <div className="platform-stats-grid">
                      <div className="platform-stat-card">
                        <Activity size={24} />
                        <div className="stat-info">
                          <span className="stat-value">{platformHealth.uptime.formatted}</span>
                          <span className="stat-label">Uptime</span>
                        </div>
                      </div>
                      <div className="platform-stat-card">
                        <Clock size={24} />
                        <div className="stat-info">
                          <span className="stat-value">{new Date(platformHealth.uptime.startTime).toLocaleDateString()}</span>
                          <span className="stat-label">Started</span>
                        </div>
                      </div>
                      <div className="platform-stat-card">
                        <Globe size={24} />
                        <div className="stat-info">
                          <span className="stat-value">{platformHealth.discovery.approvedServers}</span>
                          <span className="stat-label">Discovery Servers</span>
                        </div>
                      </div>
                      <div className="platform-stat-card">
                        <Clock size={24} />
                        <div className="stat-info">
                          <span className="stat-value">{platformHealth.discovery.pendingSubmissions}</span>
                          <span className="stat-label">Pending Submissions</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {platformActivity && (
                  <div className="platform-section">
                    <h3>Platform Activity</h3>
                    <div className="platform-stats-grid">
                      <div className="platform-stat-card">
                        <Users size={24} />
                        <div className="stat-info">
                          <span className="stat-value">{platformActivity.totalUsers}</span>
                          <span className="stat-label">Total Users</span>
                        </div>
                      </div>
                      <div className="platform-stat-card">
                        <Server size={24} />
                        <div className="stat-info">
                          <span className="stat-value">{platformActivity.totalServers}</span>
                          <span className="stat-label">Total Servers</span>
                        </div>
                      </div>
                      <div className="platform-stat-card">
                        <BarChart3 size={24} />
                        <div className="stat-info">
                          <span className="stat-value">{platformActivity.totalMessages}</span>
                          <span className="stat-label">Server Messages</span>
                        </div>
                      </div>
                      <div className="platform-stat-card">
                        <MessageSquare size={24} />
                        <div className="stat-info">
                          <span className="stat-value">{platformActivity.totalDMMessages}</span>
                          <span className="stat-label">DM Messages</span>
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
                  <h3>Admin Action Logs</h3>
                  <button className="btn btn-secondary" onClick={loadData}>
                    <RefreshCw size={16} /> Refresh
                  </button>
                </div>
                <div className="logs-list">
                  {logs.length === 0 ? (
                    <p className="no-data">No logs yet</p>
                  ) : (
                    logs.map(log => (
                      <div key={log.id} className="log-item">
                        <div className="log-icon">
                          <Gavel size={16} />
                        </div>
                        <div className="log-content">
                          <span className="log-action">{log.action}</span>
                          <span className="log-target">Target: {log.targetId}</span>
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
              <h2>User Actions</h2>
              <button onClick={() => setSelectedUser(null)}><X size={20} /></button>
            </div>
            <div className="modal-content">
              <div className="user-details">
                <Avatar src={selectedUser.avatar} fallback={selectedUser.username} size={64} />
                <h3>{selectedUser.username || selectedUser.email}</h3>
                <p className="user-id">{selectedUser.id}</p>
              </div>
              
              <div className="user-actions-section">
                <h4>Set Role</h4>
                <div className="role-buttons">
                  {['user', 'moderator', 'admin', 'owner'].map(role => (
                    <button
                      key={role}
                      className={`btn btn-sm ${selectedUser.adminRole === role ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => handleSetRole(selectedUser.id, role)}
                      disabled={actionLoading}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>

              <div className="user-actions-section">
                <h4>Set Status</h4>
                <div className="role-buttons">
                  {['online', 'idle', 'dnd', 'offline'].map(status => (
                    <button
                      key={status}
                      className={`btn btn-sm ${selectedUser.status === status ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => handleSetUserStatus(selectedUser.id, status)}
                      disabled={actionLoading}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              <div className="user-actions-section">
                <h4>Age Verification</h4>
                <div className="role-buttons">
                  <button
                    className={`btn btn-sm ${selectedUser.ageVerification?.category === 'adult' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => handleVerifyAge(selectedUser.id, 'adult')}
                    disabled={actionLoading}
                  >
                    ✓ Adult (18+)
                  </button>
                  <button
                    className={`btn btn-sm ${selectedUser.ageVerification?.category === 'child' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => handleVerifyAge(selectedUser.id, 'child')}
                    disabled={actionLoading}
                  >
                    ✓ Child (Under 18)
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => handleRemoveAgeVerification(selectedUser.id)}
                    disabled={actionLoading}
                  >
                    ✗ Remove
                  </button>
                </div>
                {selectedUser.ageVerification && (
                  <div className="user-verification-info">
                    <span>Verified: {selectedUser.ageVerification.verified ? 'Yes' : 'No'}</span>
                    <span>Category: {selectedUser.ageVerification.category}</span>
                    <span>Method: {selectedUser.ageVerification.method}</span>
                  </div>
                )}
              </div>

              <div className="user-actions-section">
                <h4>Account Actions</h4>
                <div className="action-buttons-group">
                  <button 
                    className="btn btn-secondary"
                    onClick={() => handleResetPassword(selectedUser.id)}
                    disabled={actionLoading}
                  >
                    <Key size={16} /> Reset Password
                  </button>
                  <button 
                    className="btn btn-danger"
                    onClick={() => handleDeleteUser(selectedUser.id)}
                    disabled={actionLoading}
                  >
                    <Trash2 size={16} /> Delete User
                  </button>
                </div>
              </div>

              <div className="user-actions-section">
                <h4>Ban User</h4>
                <div className="ban-form">
                  <input
                    type="text"
                    className="input"
                    placeholder="Enter ban reason..."
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
                    <Ban size={16} /> Ban User
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
