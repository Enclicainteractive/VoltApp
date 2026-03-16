import axios from 'axios'
import { getStoredServer } from './serverConfig'
import {
  getPreferredAuthToken,
  markLocalTokenAccepted
} from './authToken'
import {
  clearSessionStorage,
  getStoredAccessToken,
  getStoredRefreshToken
} from './authSession'

function getBaseURL() {
  const server = getStoredServer()
  if (server?.apiUrl) {
    return `${server.apiUrl}/api`
  }
  return '/api'
}

const api = axios.create({
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate, proxy-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  }
})

const RETRYABLE_METHODS = new Set(['get', 'head', 'options', 'delete'])
const MAX_RETRIES = 2

const shouldRetryRequest = (error) => {
  const config = error?.config || {}
  const method = String(config.method || 'get').toLowerCase()
  const status = error?.response?.status || 0
  const networkFailure = !error?.response && (
    error?.code === 'ECONNABORTED' ||
    error?.message?.includes('Network Error') ||
    error?.message?.includes('timeout')
  )

  if (networkFailure) return true
  if (status >= 500 && RETRYABLE_METHODS.has(method)) return true
  return false
}

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))

api.interceptors.request.use((config) => {
  config.baseURL = getBaseURL()
  config.headers = config.headers || {}
  
  config.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, proxy-revalidate, max-age=0'
  config.headers['Pragma'] = 'no-cache'
  config.headers['Expires'] = '0'
  config.headers['Surrogate-Control'] = 'no-store'
  
  const method = String(config.method || 'get').toLowerCase()

  if (!config.headers['Content-Type'] && !(config.data instanceof FormData)) {
    config.headers['Content-Type'] = 'application/json'
  }

  if (['post', 'put', 'patch'].includes(method) && config.data === undefined && config.headers['Content-Type'] === 'application/json') {
    config.data = {}
  }

  if (method === 'get' && config.params) {
    config.params['_t'] = Date.now()
  } else if (method === 'get') {
    config.params = { ...config.params, '_t': Date.now() }
  }

  const token = getPreferredAuthToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
    config.__authTokenSource = 'local'
    config.__usedLocalToken = true
  }
  return config
})

api.interceptors.response.use(
  (response) => {
    if (response?.config?.__authTokenSource === 'local') {
      markLocalTokenAccepted()
    }
    return response
  },
  async (error) => {
    const config = error?.config || null

    if (config && shouldRetryRequest(error)) {
      config.__retryCount = (config.__retryCount || 0) + 1
      if (config.__retryCount <= MAX_RETRIES) {
        await wait(300 * config.__retryCount)
        return api.request(config)
      }
    }

    const status = error.response?.status

    if (status === 401) {
      const hasRefreshToken = !!getStoredRefreshToken()
      if (!hasRefreshToken) {
        clearSessionStorage()
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default api

export const apiService = {
  // Servers
  getServers: () => api.get('/servers'),
  getServer: (serverId) => api.get(`/servers/${serverId}`),
  createServer: (data) => api.post('/servers', data),
  updateServer: (serverId, data) => api.put(`/servers/${serverId}`, data),
  deleteServer: (serverId) => api.delete(`/servers/${serverId}`),
  getServerEvents: (serverId) => api.get(`/servers/${serverId}/events`),
  createServerEvent: (serverId, data) => api.post(`/servers/${serverId}/events`, data),
  updateServerEvent: (serverId, eventId, data) => api.put(`/servers/${serverId}/events/${eventId}`, data),
  deleteServerEvent: (serverId, eventId) => api.delete(`/servers/${serverId}/events/${eventId}`),
  getUpcomingEvents: (limit = 20) => api.get('/events/upcoming', { params: { limit } }),
  
  // Server Invites
  getServerInvites: (serverId) => api.get(`/servers/${serverId}/invites`),
  createServerInvite: (serverId, options) => api.post(`/servers/${serverId}/invites`, options),
  deleteServerInvite: (serverId, code) => api.delete(`/servers/${serverId}/invites/${code}`),
  getInvite: (code) => api.get(`/invites/${code}`),
  joinServer: (inviteCode) => api.post(`/invites/${inviteCode}/join`),
  joinServerById: (serverId) => api.post(`/servers/${serverId}/join`),
  getCrossHostInvite: (code) => api.get(`/invites/cross-host/${code}`),
  joinCrossHostInvite: (code) => api.post(`/invites/cross-host/${code}/join`),
  resolveExternalInvite: (host, code) => api.get('/invites/resolve-external', { params: { host, code } }),
  joinExternalInvite: (host, code) => api.post('/invites/resolve-external/join', { host, code }),
  
  // Server Members
  getServerMembers: (serverId) => api.get(`/servers/${serverId}/members`),
  getOnlineMembers: (serverId) => api.get(`/servers/${serverId}/online-members`),
  kickMember: (serverId, memberId) => api.delete(`/servers/${serverId}/members/${memberId}`),
  leaveServer: (serverId) => api.post(`/servers/${serverId}/leave`),
  banMember: (serverId, memberId) => api.post(`/servers/${serverId}/bans/${memberId}`),
  unbanMember: (serverId, memberId) => api.delete(`/servers/${serverId}/bans/${memberId}`),
  updateMemberRoles: (serverId, memberId, roles) => api.put(`/servers/${serverId}/members/${memberId}`, { roles }),
  updateMemberRole: (serverId, memberId, role) => api.put(`/servers/${serverId}/members/${memberId}`, { roles: Array.isArray(role) ? role : [role] }),
  transferServer: (serverId, memberId) => api.post(`/servers/${serverId}/transfer`, { memberId }),
  
  // Roles
  getRoles: (serverId) => api.get(`/servers/${serverId}/roles`),
  createRole: (serverId, data) => api.post(`/servers/${serverId}/roles`, data),
  updateRole: (serverId, roleId, data) => api.put(`/servers/${serverId}/roles/${roleId}`, data),
  deleteRole: (serverId, roleId) => api.delete(`/servers/${serverId}/roles/${roleId}`),
  
  // Channels
  getChannels: (serverId) => api.get(`/servers/${serverId}/channels`),
  createChannel: (serverId, data) => api.post(`/servers/${serverId}/channels`, data),
  updateChannel: (channelId, data) => api.put(`/channels/${channelId}`, data),
  deleteChannel: (channelId) => api.delete(`/channels/${channelId}`),
  updateChannelOrder: (serverId, channelIds) => api.put(`/servers/${serverId}/channels/order`, { channelIds }),
  moveChannel: (channelId, data) => api.put(`/channels/${channelId}/move`, data),
  
  // Channel Permissions
  getChannelPermissions: (channelId) => api.get(`/channels/${channelId}/permissions`).then(res => res.data),
  updateChannelPermissions: (channelId, permissions) => api.put(`/channels/${channelId}/permissions`, permissions).then(res => res.data),
  checkChannelAccess: (channelId) => api.get(`/channels/${channelId}/access-check`),
  
  // Channel Members (for permission-based member list)
  getChannelMembers: (serverId, channelId) => api.get(`/servers/${serverId}/channels/${channelId}/members`),

  // Activities / Activity Apps
  getActivitiesCatalog: () => api.get('/activities/catalog'),
  getPublicActivitiesCatalog: () => api.get('/activities/public'),
  getActivitiesSdkManifest: () => api.get('/activities/sdk/manifest'),
  getMyActivityApps: () => api.get('/activities/apps/my'),
  createActivityApp: (data) => api.post('/activities/apps', data),
  publishPublicActivity: (data) => api.post('/activities/publish', data),
  rotateActivityAppSecret: (appId) => api.post(`/activities/apps/${appId}/rotate-secret`),
  authorizeActivityApp: (params) => api.get('/activities/oauth/authorize', { params }),
  exchangeActivityCode: (data) => api.post('/activities/oauth/token', data),
  introspectActivityToken: (token) => api.get('/activities/oauth/me', {
    headers: { Authorization: `Bearer ${token}` }
  }),
  
  // Categories
  getCategories: (serverId) => api.get(`/servers/${serverId}/categories`),
  createCategory: (serverId, data) => api.post(`/servers/${serverId}/categories`, data),
  updateCategory: (categoryId, data) => api.put(`/categories/${categoryId}`, data),
  deleteCategory: (categoryId) => api.delete(`/categories/${categoryId}`),
  updateCategoryOrder: (serverId, categoryIds) => api.put(`/servers/${serverId}/categories/order`, { categoryIds }),
  
  // Messages
  getMessages: (channelId, params) => api.get(`/channels/${channelId}/messages`, { params }),
  searchMessages: (channelId, query, limit = 50, offset = 0) => api.get(`/channels/${channelId}/messages/search`, { params: { q: query, limit, offset } }),
  getPinnedMessages: (channelId) => api.get(`/channels/${channelId}/pins`),
  pinMessage: (channelId, messageId) => api.put(`/channels/${channelId}/pins/${messageId}`),
  unpinMessage: (channelId, messageId) => api.delete(`/channels/${channelId}/pins/${messageId}`),
  notifyChannelMessage: (channelId, messageId) => api.post(`/channels/${channelId}/messages/${messageId}/notify`),
  sendMessage: (channelId, data) => api.post(`/channels/${channelId}/messages`, data),
  editMessage: (messageId, content) => api.put(`/messages/${messageId}`, { content }),
  deleteMessage: (messageId) => api.delete(`/messages/${messageId}`),
  bulkDeleteMessages: (channelId, messageIds) => api.post(`/channels/${channelId}/messages/bulk-delete`, { messageIds }),
  
  // Direct Messages
  getDirectMessages: (search) => api.get('/dms', { params: { search } }),
  searchDMUsers: (query) => api.get('/dms/search', { params: { q: query } }),
  createDirectMessage: (userId) => api.post('/dms', { userId }),
  createGroupDirectMessage: (participantIds, groupName) => api.post('/dms', { participantIds, groupName }),
  getDMMessages: (conversationId, params) => api.get(`/dms/${conversationId}/messages`, { params }),
  searchDMMessages: (query) => api.get('/dms/search/messages', { params: { q: query } }),
  sendDMMessage: (conversationId, data) => api.post(`/dms/${conversationId}/messages`, data),
  editDMMessage: (conversationId, messageId, content) => api.put(`/dms/${conversationId}/messages/${messageId}`, { content }),
  deleteDMMessage: (conversationId, messageId) => api.delete(`/dms/${conversationId}/messages/${messageId}`),
  
  // User Profile
  getCurrentUser: () => api.get('/user/me'),
  searchUsers: (query) => api.get('/user/search', { params: { q: query } }),
  getUserProfile: (userId) => api.get(`/user/${userId}`),
  updateProfile: (data) => api.put('/user/profile', data),
  uploadAvatar: async (file) => {
    const formData = new FormData()
    formData.append('avatar', file)
    const response = await api.post('/user/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return response
  },
  deleteAvatar: () => api.delete('/user/avatar'),
  updateStatus: (status, customStatus) => api.put('/user/status', { status, customStatus }),
  getAgeVerificationStatus: () => api.get('/user/age-verification/status'),
  setAgeVerificationJurisdiction: (jurisdictionCode) => api.post('/user/age-verification/jurisdiction', { jurisdictionCode }),
  selfAttestAgeVerification: (payload = {}) => api.post('/user/age-verification/self-attest', payload),
  submitAgeVerification: (payload) => api.post('/user/age-verification', payload),
  
  // Profile Customization & Theme
  getProfileTheme: () => api.get('/user/profile/theme'),
  updateProfileTheme: (data) => api.put('/user/profile/theme', data),
  
  // Friends
  getFriends: () => api.get('/user/friends'),
  removeFriend: (friendId) => api.delete(`/user/friends/${friendId}`),
  
  // Friend Requests
  getFriendRequests: () => api.get('/user/friend-requests'),
  sendFriendRequest: (username) => api.post('/user/friend-request', { username }),
  sendFriendRequestById: (userId) => api.post('/user/friend-request', { userId }),
  acceptFriendRequest: (id) => api.post(`/user/friend-request/${id}/accept`, {}),
  rejectFriendRequest: (id) => api.post(`/user/friend-request/${id}/reject`, {}),
  cancelFriendRequest: (id) => api.delete(`/user/friend-request/${id}`),
  cancelFriendRequestByUserId: (userId) => api.delete(`/user/friend-request/user/${userId}`),
  
  // Blocking
  blockUser: (userId) => api.post(`/user/block/${userId}`),
  unblockUser: (userId) => api.delete(`/user/block/${userId}`),
  getBlockedUsers: () => api.get('/user/blocked'),
  
  // File Upload
  uploadFiles: (files, serverId = null, onProgress = null) => {
    const formData = new FormData()
    files.forEach(file => formData.append('files', file))
    if (serverId) {
      formData.append('serverId', serverId)
    }
    
    if (onProgress) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', `${getBaseURL()}/upload`)
        
        xhr.setRequestHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
        xhr.setRequestHeader('Pragma', 'no-cache')
        xhr.setRequestHeader('Expires', '0')
        
        const token = getStoredAccessToken()
        if (token) {
          xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        }
        
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percentComplete = (event.loaded / event.total) * 100
            onProgress(percentComplete)
          }
        })
        
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.response))
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`))
          }
        })
        
        xhr.addEventListener('error', () => {
          reject(new Error('Upload failed'))
        })
        
        xhr.send(formData)
      })
    }
    
    return api.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  deleteFile: (filename) => api.delete(`/upload/${filename}`),

  getDiscovery: (params) => api.get('/discovery', { params }),
  getDiscoveryCategories: () => api.get('/discovery/categories'),
  submitToDiscovery: (serverId, data) => api.post('/discovery/submit', { serverId, ...data }),
  removeFromDiscovery: (serverId) => api.delete(`/discovery/${serverId}`),
  getDiscoveryStatus: (serverId) => api.get(`/discovery/status/${serverId}`),
  getDiscoveryServer: (serverId) => api.get(`/discovery/server/${serverId}`),
  getPendingSubmissions: () => api.get('/discovery/admin/pending'),
  approveSubmission: (submissionId) => api.post(`/discovery/admin/approve/${submissionId}`),
  rejectSubmission: (submissionId) => api.post(`/discovery/admin/reject/${submissionId}`),

  getAdminStats: () => api.get('/admin/stats'),
  getAdminUsers: (params) => api.get('/admin/users', { params }),
  getAdminOnlineUsers: () => api.get('/admin/online-users', {
    params: { _t: Date.now() },
    headers: { 'Cache-Control': 'no-cache' }
  }),
  getAdminOnlineUsersStats: () => api.get('/admin/stats/online-users', {
    params: { _t: Date.now() },
    headers: { 'Cache-Control': 'no-cache' }
  }),
  getAdminUser: (userId) => api.get(`/admin/users/${userId}`),
  setUserRole: (userId, role) => api.put(`/admin/users/${userId}/role`, { role }),
  banUser: (userId, data) => api.post(`/admin/users/${userId}/ban`, data),
  unbanUser: (userId) => api.delete(`/admin/users/${userId}/ban`),
  resetUserPassword: (userId) => api.post(`/admin/users/${userId}/reset-password`),
  deleteUser: (userId) => api.delete(`/admin/users/${userId}`),
  setUserAgeVerification: (userId, data) => api.post(`/admin/users/${userId}/age-verify`, data),
  removeUserAgeVerification: (userId) => api.delete(`/admin/users/${userId}/age-verification`),
  setUserStatus: (userId, data) => api.put(`/admin/users/${userId}/status`, data),
  getAdminServers: (params) => api.get('/admin/servers', { params }),
  banServer: (serverId, reason) => api.post(`/admin/servers/${serverId}/ban`, { reason }),
  unbanServer: (serverId) => api.delete(`/admin/servers/${serverId}/ban`),
  getBannedUsers: () => api.get('/admin/banned-users'),
  getBannedServers: () => api.get('/admin/banned-servers'),
  getSafetyReports: (params) => api.get('/safety/reports', { params }),
  getSafetyReport: (reportId) => api.get(`/safety/reports/${reportId}`),
  submitSafetyReport: (payload) => api.post('/safety/reports', payload),
  submitUserSafetyReport: (payload) => api.post('/safety/reports/user', payload),
  getMySafetyReports: (params) => api.get('/safety/reports/my', { params }),
  getMySafetyReport: (reportId) => api.get(`/safety/reports/my/${reportId}`),
  resolveSafetyReport: (reportId, payload) => api.post(`/safety/reports/${reportId}/resolve`, payload),
  banUserFromSafetyReport: (reportId, payload) => api.post(`/safety/reports/${reportId}/ban-user`, payload),
  banServerFromSafetyReport: (reportId, payload) => api.post(`/safety/reports/${reportId}/ban-server`, payload),
  deleteMessageFromSafetyReport: (reportId, payload) => api.post(`/safety/reports/${reportId}/delete-message`, payload),
  getAdminLogs: (limit) => api.get('/admin/logs', { params: { limit } }),
  getMyAdminRole: () => api.get('/admin/my-role'),
  getDiscoveryPending: () => api.get('/admin/discovery/pending'),
  getDiscoveryApproved: (params) => api.get('/admin/discovery/approved', { params }),
  approveDiscovery: (submissionId) => api.post(`/admin/discovery/approve/${submissionId}`),
  rejectDiscovery: (submissionId) => api.post(`/admin/discovery/reject/${submissionId}`),
  removeFromDiscoveryAdmin: (serverId) => api.delete(`/admin/discovery/remove/${serverId}`),
  getPlatformHealth: () => api.get('/admin/platform/health'),
  getPlatformActivity: () => api.get('/admin/platform/activity'),
  getMaintenanceStatus: () => api.get('/admin/maintenance'),
  setMaintenanceWindow: (payload) => api.put('/admin/maintenance', payload),
  clearMaintenanceWindow: () => api.delete('/admin/maintenance'),
  getAllSelfVolts: () => api.get('/admin/self-volts'),
  getSelfVoltAdmin: (voltId) => api.get(`/admin/self-volts/${voltId}`),
  deleteSelfVoltAdmin: (voltId) => api.delete(`/admin/self-volts/${voltId}`),
  testSelfVoltAdmin: (voltId) => api.post(`/admin/self-volts/${voltId}/test`),

  // Admin Config
  getAdminConfig: () => api.get('/admin/config'),
  getAdminConfigRaw: () => api.get('/admin/config/raw'),
  updateAdminConfig: (config) => api.put('/admin/config', config),
  updateAdminConfigRaw: (config) => api.put('/admin/config/raw', config),
  resetAdminConfig: () => api.post('/admin/config/reset'),
  importAdminConfig: (config) => api.post('/admin/config/import', config),
  validateAdminConfig: (config) => api.post('/admin/config/validate', config),
  getAdminConfigSchema: () => api.get('/admin/config/schema'),
  getAdminConfigTemplate: () => api.get('/admin/config/template'),
  getAdminConfigInfo: () => api.get('/admin/config/info'),
  getAdminConfigIssues: () => api.get('/admin/config/issues'),
  getAdminConfigLogs: (lines = 200, maxFiles = 6) => api.get('/admin/config/logs', { params: { lines, maxFiles } }),
  installAdminConfigDriver: (storageType, packageName) => api.post('/admin/config/install-driver', { storageType, packageName }),
  restartVoltageServer: () => api.post('/admin/config/restart'),

  // Migration
  getStorageInfo: () => api.get('/migration/storage-info'),
  getStorageTypes: () => api.get('/migration/storage-types'),
  checkDependencies: () => api.get('/migration/check-dependencies'),
  testConnection: (type, config) => api.post('/migration/test-connection', { type, config }),
  migrateStorage: (targetType, targetConfig, backup) => api.post('/migration/migrate', { targetType, targetConfig, backup }),
  exportData: () => api.get('/migration/export-data'),

  // E2E Encryption
  getE2eStatus: (serverId) => api.get(`/e2e/status/${serverId}`),
  enableE2e: (serverId) => api.post(`/e2e/enable/${serverId}`),
  disableE2e: (serverId) => api.post(`/e2e/disable/${serverId}`),
  rotateE2eKeys: (serverId) => api.post(`/e2e/rotate/${serverId}`),
  getServerKeys: (serverId) => api.get(`/e2e/keys/${serverId}`),
  joinE2eServer: (serverId, data) => api.post(`/e2e/join/${serverId}`, data),
  leaveE2eServer: (serverId) => api.post(`/e2e/leave/${serverId}`),
  getE2eMemberKeys: (serverId) => api.get(`/e2e/member-keys/${serverId}`),
  getUserKeys: () => api.get('/e2e/user/keys'),
  getUserKeysForServer: (serverId) => api.get(`/e2e/user/keys/${serverId}`),
  backupUserKeys: (password) => api.post('/e2e/user/backup', { password }),
  restoreUserKeys: (backup, password) => api.post('/e2e/user/restore', { backup, password }),
  syncKeyBackup: (encryptedBackup, deviceId, timestamp) => 
    api.post('/e2e/user/backup-keys', { encryptedBackup, deviceId, timestamp }),
  getKeyBackups: () => api.get('/e2e/user/backup-keys'),
  getKeyBackup: (deviceId) => api.get(`/e2e/user/backup-keys/${deviceId}`),
  deleteKeyBackup: (deviceId) => api.delete(`/e2e/user/backup-keys/${deviceId}`),
  
  getDmE2eStatus: (conversationId) => api.get(`/e2e/dm/status/${conversationId}`),
  enableDmE2e: (conversationId) => api.post(`/e2e/dm/enable/${conversationId}`),
  disableDmE2e: (conversationId) => api.post(`/e2e/dm/disable/${conversationId}`),
  getDmE2eKeys: (conversationId) => api.get(`/e2e/dm/keys/${conversationId}`),
  joinDmE2e: (conversationId, data) => api.post(`/e2e/dm/join/${conversationId}`, data),
  getDmUserKeys: (conversationId) => api.get(`/e2e/dm/user-keys/${conversationId}`),
  rotateDmE2eKeys: (conversationId) => api.post(`/e2e/dm/rotate/${conversationId}`),
  
  requestDmEncryption: (conversationId, mode) => api.post(`/e2e/dm/request/${conversationId}`, { mode }),
  respondToEncryptionRequest: (conversationId, accepted, encryptedKey) => 
    api.post(`/e2e/dm/respond/${conversationId}`, { accepted, encryptedKey }),
  respondToDmEncryptionRequest: (conversationId, accepted, encryptedKey) =>
    api.post(`/e2e/dm/respond/${conversationId}`, { accepted, encryptedKey }),
  getDmPendingStatus: (conversationId) => api.get(`/e2e/dm/pending/${conversationId}`),
  setDmMode: (conversationId, mode) => api.post(`/e2e/dm/mode/${conversationId}`, { mode }),
  getDmMode: (conversationId) => api.get(`/e2e/dm/mode/${conversationId}`),
  setDmMasterPassword: (conversationId, passwordHash) => 
    api.post(`/e2e/dm/master-password/${conversationId}`, { passwordHash }),
  encryptDmPreviousMessages: (conversationId) => 
    api.post(`/e2e/dm/encrypt-previous/${conversationId}`),
  getDmEncryptionStatus: (conversationId) => api.get(`/e2e/dm/encryption-status/${conversationId}`),
  confirmDmEncryption: (conversationId, encryptedKey) => 
    api.post(`/e2e/dm/confirm/${conversationId}`, { encryptedKey }),
  declineDmEncryption: (conversationId) => api.post(`/e2e/dm/decline/${conversationId}`),
  disableDmEncryption: (conversationId) => api.post(`/e2e/dm/disable/${conversationId}`),
  disableDmEncryptionRequest: (conversationId) => api.post(`/e2e/dm/disable-request/${conversationId}`),
  respondToDisableRequest: (conversationId, accepted) => api.post(`/e2e/dm/disable-respond/${conversationId}`, { accepted }),

   getNotifications: () => api.get('/notifications'),
   getNotificationSettings: () => api.get('/notifications'),
  muteServer: (serverId, muted, duration) => api.post(`/notifications/server/${serverId}/mute`, { muted, duration }),
  getServerMuteStatus: (serverId) => api.get(`/notifications/server/${serverId}/mute`),
  muteDm: (conversationId, muted, duration) => api.post(`/notifications/dm/${conversationId}/mute`, { muted, duration }),
  getDmMuteStatus: (conversationId) => api.get(`/notifications/dm/${conversationId}/mute`),
  checkMuteStatus: (type, id) => api.get(`/notifications/is-muted/${type}/${id}`),

  getServerE2eAutoEnrollStatus: (serverId) => api.get(`/e2e/status/${serverId}`),
  autoEnrollServerE2e: (serverId, encryptedKey) => api.post(`/e2e/auto-enroll/${serverId}`, { encryptedKey }),
  getServerAutoKey: (serverId) => api.get(`/e2e/auto-key/${serverId}`),
  getServerPublicKey: (serverId) => api.get(`/e2e/public-key/${serverId}`),
  getServerJoinInfo: (serverId) => api.get(`/e2e/join-info/${serverId}`),

  getSelfVolts: () => api.get('/self-volt'),
  getMySelfVolts: () => api.get('/self-volt/my'),
  getSelfVoltByHost: (host) => api.get(`/self-volt/host/${host}`),
  getSelfVolt: (voltId) => api.get(`/self-volt/${voltId}`),
  addSelfVolt: (data) => api.post('/self-volt', data),
  updateSelfVolt: (voltId, data) => api.put(`/self-volt/${voltId}`, data),
  deleteSelfVolt: (voltId) => api.delete(`/self-volt/${voltId}`),
  testSelfVolt: (voltId) => api.post(`/self-volt/${voltId}/test`),
  registerSelfVoltMainline: (voltId, mainlineUrl, apiKey) => 
    api.post(`/self-volt/${voltId}/register-mainline`, { mainlineUrl, apiKey }),
  syncSelfVoltServers: (voltId) => api.post(`/self-volt/${voltId}/servers`),
  getSelfVoltServers: (voltId) => api.get(`/self-volt/${voltId}/servers`),
  createSelfVoltCrossHostInvite: (voltId, serverId, channelId) => 
    api.post(`/self-volt/${voltId}/invite`, { serverId, channelId }),

  generateSelfVoltKey: (voltId, permissions, expiresAt) => 
    api.post('/self-volt/generate-key', { voltId, permissions, expiresAt }),
  getMySelfVoltKeys: () => api.get('/self-volt/my-keys'),
  deleteSelfVoltKey: (keyId) => api.delete(`/self-volt/my-keys/${keyId}`),
  validateSelfVoltKey: (apiKey, permissions) => 
    api.post('/self-volt/validate-key', { apiKey, permissions }),
  
  subscribePush: (subscription) => api.post('/push/subscribe', subscription),
  unsubscribePush: () => api.delete('/push/unsubscribe'),
  getPushConfig: () => api.get('/push/config'),
  updateServerMute: (serverId, muted) => api.put('/user/settings/server-mute', { serverId, muted }),
  getUnreadCounts: () => api.get('/user/unread-counts'),
  getMutualFriends: (userId) => api.get(`/user/${userId}/mutual-friends`),
  getMutualServers: (userId) => api.get(`/user/${userId}/mutual-servers`),
  getServerEmojis: (serverId) => api.get(`/servers/${serverId}/emojis`),
  getGlobalEmojis: () => api.get('/servers/emojis/global'),
  addServerEmoji: (serverId, name, url) => api.post(`/servers/${serverId}/emojis`, { name, url }),
  deleteServerEmoji: (serverId, emojiId) => api.delete(`/servers/${serverId}/emojis/${emojiId}`),

  // Federation
  getFederationPeers: () => api.get('/federation/peers'),
  getFederationPeer: (peerId) => api.get(`/federation/peers/${peerId}`),
  addFederationPeer: (data) => api.post('/federation/peers', data),
  acceptFederationPeer: (peerId) => api.post(`/federation/peers/${peerId}/accept`),
  rejectFederationPeer: (peerId) => api.post(`/federation/peers/${peerId}/reject`),
  removeFederationPeer: (peerId) => api.delete(`/federation/peers/${peerId}`),
  shareFederationInvite: (data) => api.post('/federation/invites/share', data),
  getFederationInvites: () => api.get('/federation/invites'),
  getPublicFederationInvites: (host) => api.get('/federation/invites/public', { params: { host } }),
  useFederationInvite: (inviteId) => api.post(`/federation/invites/${inviteId}/use`),
  removeFederationInvite: (inviteId) => api.delete(`/federation/invites/${inviteId}`),
  sendFederationRelay: (peerId, data) => api.post(`/federation/relay/${peerId}`, data),
  getFederationInfo: () => api.get('/federation/info'),

  // Bots
  getMyBots: () => api.get('/bots/my'),
  createBot: (data) => api.post('/bots', data),
  getBot: (botId) => api.get(`/bots/${botId}`),
  updateBot: (botId, data) => api.put(`/bots/${botId}`, data),
  deleteBot: (botId) => api.delete(`/bots/${botId}`),
  regenerateBotToken: (botId) => api.post(`/bots/${botId}/regenerate-token`),
  addBotToServer: (botId, serverId) => api.post(`/bots/${botId}/servers/${serverId}`),
  removeBotFromServer: (botId, serverId) => api.delete(`/bots/${botId}/servers/${serverId}`),
  getServerBots: (serverId) => api.get(`/bots/server/${serverId}`),
  getPublicBots: () => api.get('/bots/public/browse'),
  getBotCommands: (botId) => api.get(`/bots/${botId}/commands`),
  getBotProfile: (botId) => api.get(`/bots/${botId}/profile`),

  // True E2EE
  uploadDeviceKeys: (data) => api.post('/e2e-true/devices/keys', data),
  getDeviceKeys: (userId, deviceId) => api.get(`/e2e-true/devices/keys/${userId}/${deviceId}`),
  getUserDevices: (userId) => api.get(`/e2e-true/devices/${userId}`),
  removeDevice: (deviceId) => api.delete(`/e2e-true/devices/${deviceId}`),
  getGroupEpoch: (groupId) => api.get(`/e2e-true/groups/${groupId}/epoch`),
  initGroupE2ee: (groupId, deviceId) => api.post(`/e2e-true/groups/${groupId}/init`, { deviceId }),
  advanceEpoch: (groupId, reason) => api.post(`/e2e-true/groups/${groupId}/advance-epoch`, { reason }),
  addGroupMember: (groupId, userId, deviceIds) => api.post(`/e2e-true/groups/${groupId}/members`, { userId, deviceIds }),
  removeGroupMember: (groupId, userId) => api.delete(`/e2e-true/groups/${groupId}/members/${userId}`),
  getGroupMembers: (groupId) => api.get(`/e2e-true/groups/${groupId}/members`),
  storeSenderKey: (groupId, data) => api.post(`/e2e-true/groups/${groupId}/sender-keys`, data),
  distributeSenderKeys: (groupId, data) => api.post(`/e2e-true/groups/${groupId}/sender-keys/distribute`, data),
  getSenderKeys: (groupId, epoch, deviceId) => api.get(`/e2e-true/groups/${groupId}/sender-keys/${epoch}`, { params: { deviceId } }),
  // CRITICAL: Request sender keys - server relays to existing members but never sees the keys
  requestSenderKeys: (groupId, deviceId) => api.post(`/e2e-true/groups/${groupId}/sender-keys/request`, { deviceId }),
  getQueuedKeyUpdates: (deviceId) => api.get('/e2e-true/queue/key-updates', { params: { deviceId } }),
  getQueuedMessages: (deviceId, limit) => api.get('/e2e-true/queue/messages', { params: { deviceId, limit } }),
  computeSafetyNumber: (myKey, theirKey) => api.post('/e2e-true/safety-number', { myIdentityKey: myKey, theirIdentityKey: theirKey }),

  // System messages (in-app inbox)
  getSystemMessages: () => api.get('/system/messages'),
  getSystemUnreadCount: () => api.get('/system/messages/unread-count'),
  markSystemMessageRead: (id) => api.post(`/system/messages/${id}/read`),
  markAllSystemMessagesRead: () => api.post('/system/messages/read-all'),
  deleteSystemMessage: (id) => api.delete(`/system/messages/${id}`),
  clearSystemMessages: () => api.delete('/system/messages'),
  sendSystemMessage: (data) => api.post('/system/send', data),

  // Server Audit Logs
  getAuditLogs: (serverId, params) => api.get(`/servers/${serverId}/audit-logs`, { params }),

  // Server Bans Management
  getServerBans: (serverId, params) => api.get(`/servers/${serverId}/bans`, { params }),
  unbanUser: (serverId, userId) => api.delete(`/servers/${serverId}/bans/${userId}`),

  // AutoMod
  getAutoModConfig: (serverId) => api.get(`/servers/${serverId}/automod`),
  updateAutoModConfig: (serverId, config) => api.put(`/servers/${serverId}/automod`, config),
  toggleAutoMod: (serverId, enabled) => api.post(`/servers/${serverId}/automod/toggle`, { enabled }),
  toggleAutoModTestingMode: (serverId, enabled) => api.post(`/servers/${serverId}/automod/testing-mode`, { enabled }),
  
  // AutoMod Word Filter
  updateWordFilter: (serverId, config) => api.put(`/servers/${serverId}/automod/word-filter`, config),
  addAutoModWord: (serverId, word) => api.post(`/servers/${serverId}/automod/word-filter/words`, { word }),
  removeAutoModWord: (serverId, word) => api.delete(`/servers/${serverId}/automod/word-filter/words/${encodeURIComponent(word)}`),
  
  // AutoMod Spam Protection
  updateSpamProtection: (serverId, config) => api.put(`/servers/${serverId}/automod/spam-protection`, config),
  
  // AutoMod Link Block
  updateLinkBlock: (serverId, config) => api.put(`/servers/${serverId}/automod/link-block`, config),
  addAllowedDomain: (serverId, domain) => api.post(`/servers/${serverId}/automod/link-block/allowlist`, { domain }),
  removeAllowedDomain: (serverId, domain) => api.delete(`/servers/${serverId}/automod/link-block/allowlist/${encodeURIComponent(domain)}`),
  
  // AutoMod Mention Spam
  updateMentionSpam: (serverId, config) => api.put(`/servers/${serverId}/automod/mention-spam`, config),
  
  // AutoMod Caps Filter
  updateCapsFilter: (serverId, config) => api.put(`/servers/${serverId}/automod/caps-filter`, config),
  
  // AutoMod Invite Block
  updateInviteBlock: (serverId, config) => api.put(`/servers/${serverId}/automod/invite-block`, config),
  
  // AutoMod Custom Rules
  getAutoModCustomRules: (serverId) => api.get(`/servers/${serverId}/automod/custom-rules`),
  addAutoModCustomRule: (serverId, rule) => api.post(`/servers/${serverId}/automod/custom-rules`, rule),
  updateAutoModCustomRule: (serverId, ruleId, rule) => api.put(`/servers/${serverId}/automod/custom-rules/${ruleId}`, rule),
  removeAutoModCustomRule: (serverId, ruleId) => api.delete(`/servers/${serverId}/automod/custom-rules/${ruleId}`),
  
  // AutoMod Exemptions
  getAutoModExemptions: (serverId) => api.get(`/servers/${serverId}/automod/exemptions`),
  addAutoModExemption: (serverId, exemption) => api.post(`/servers/${serverId}/automod/exemptions`, exemption),
  removeAutoModExemption: (serverId, exemptionId) => api.delete(`/servers/${serverId}/automod/exemptions/${exemptionId}`),
  
  // AutoMod Warnings
  getAutoModWarnings: (serverId, params) => api.get(`/servers/${serverId}/automod/warnings`, { params }),
  clearAutoModWarnings: (serverId, userId) => api.delete(`/servers/${serverId}/automod/warnings/${userId}`),

  // User Preferences & Customization (New Features)
  getUserPreferences: () => api.get('/users/me/preferences'),
  updateUserPreferences: (prefs) => api.put('/users/me/preferences', prefs),
  getUserActivity: (userId) => api.get(`/users/${userId}/activity`),
  getUserStats: (userId) => api.get(`/users/${userId}/stats`),
  getProfileCustomization: (userId) => api.get(`/users/${userId}/customization`),
  updateProfileCustomization: (userId, data) => api.put(`/users/${userId}/customization`, data),
  
  // Theme & Appearance
  getSavedThemes: () => api.get('/users/me/themes'),
  saveTheme: (theme) => api.post('/users/me/themes', theme),
  deleteTheme: (themeId) => api.delete(`/users/me/themes/${themeId}`),
  setActiveTheme: (themeId) => api.put('/users/me/themes/active', { themeId }),
  
  // Profile Comments
  getProfileComments: (userId, params) => api.get(`/users/${userId}/comments`, { params }),
  addProfileComment: (userId, content) => api.post(`/users/${userId}/comments`, { content }),
  deleteProfileComment: (commentId) => api.delete(`/users/comments/${commentId}`),
  likeProfileComment: (commentId) => api.post(`/users/comments/${commentId}/like`),
  unlikeProfileComment: (commentId) => api.delete(`/users/comments/${commentId}/like`),

  // Discord Import
  importDiscordTemplate: (templateCode, serverId) => api.post('/import/discord/template', { templateCode, serverId }),
  importDiscordData: (templateData, serverId) => api.post('/import/discord/import', { templateData, serverId }),

  // File Upload
  uploadFile: (serverId, formData, options = {}) => api.post(`/upload/file?serverId=${serverId}&channelId=${options.channelId || ''}&type=${options.type || 'file'}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
}
