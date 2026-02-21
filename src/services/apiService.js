import axios from 'axios'
import { getStoredServer } from './serverConfig'

function getBaseURL() {
  const server = getStoredServer()
  if (server?.apiUrl) {
    return `${server.apiUrl}/api`
  }
  return '/api'
}

const api = axios.create({
  headers: {
    'Content-Type': 'application/json'
  }
})

api.interceptors.request.use((config) => {
  config.baseURL = getBaseURL()
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token')
      localStorage.removeItem('user_data')
      window.location.href = '/login'
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
  
  // Categories
  getCategories: (serverId) => api.get(`/servers/${serverId}/categories`),
  createCategory: (serverId, data) => api.post(`/servers/${serverId}/categories`, data),
  updateCategory: (categoryId, data) => api.put(`/categories/${categoryId}`, data),
  deleteCategory: (categoryId) => api.delete(`/categories/${categoryId}`),
  updateCategoryOrder: (serverId, categoryIds) => api.put(`/servers/${serverId}/categories/order`, { categoryIds }),
  
  // Messages
  getMessages: (channelId, params) => api.get(`/channels/${channelId}/messages`, { params }),
  searchMessages: (channelId, query) => api.get(`/channels/${channelId}/messages/search`, { params: { q: query } }),
  getPinnedMessages: (channelId) => api.get(`/channels/${channelId}/pins`),
  pinMessage: (channelId, messageId) => api.put(`/channels/${channelId}/pins/${messageId}`),
  unpinMessage: (channelId, messageId) => api.delete(`/channels/${channelId}/pins/${messageId}`),
  sendMessage: (channelId, data) => api.post(`/channels/${channelId}/messages`, data),
  editMessage: (messageId, content) => api.put(`/messages/${messageId}`, { content }),
  deleteMessage: (messageId) => api.delete(`/messages/${messageId}`),
  
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
  updateStatus: (status, customStatus) => api.put('/user/status', { status, customStatus }),
  getAgeVerificationStatus: () => api.get('/user/age-verification/status'),
  submitAgeVerification: (payload) => api.post('/user/age-verification', payload),
  
  // Friends
  getFriends: () => api.get('/user/friends'),
  removeFriend: (friendId) => api.delete(`/user/friends/${friendId}`),
  
  // Friend Requests
  getFriendRequests: () => api.get('/user/friend-requests'),
  sendFriendRequest: (username) => api.post('/user/friend-request', { username }),
  sendFriendRequestById: (userId) => api.post('/user/friend-request', { userId }),
  acceptFriendRequest: (id) => api.post(`/user/friend-request/${id}/accept`),
  rejectFriendRequest: (id) => api.post(`/user/friend-request/${id}/reject`),
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
        
        const token = localStorage.getItem('access_token')
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
  getAdminLogs: (limit) => api.get('/admin/logs', { params: { limit } }),
  getMyAdminRole: () => api.get('/admin/my-role'),
  getDiscoveryPending: () => api.get('/admin/discovery/pending'),
  getDiscoveryApproved: (params) => api.get('/admin/discovery/approved', { params }),
  approveDiscovery: (submissionId) => api.post(`/admin/discovery/approve/${submissionId}`),
  rejectDiscovery: (submissionId) => api.post(`/admin/discovery/reject/${submissionId}`),
  removeFromDiscoveryAdmin: (serverId) => api.delete(`/admin/discovery/remove/${serverId}`),
  getPlatformHealth: () => api.get('/admin/platform/health'),
  getPlatformActivity: () => api.get('/admin/platform/activity'),
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
  
  getDmE2eStatus: (conversationId) => api.get(`/e2e/dm/status/${conversationId}`),
  enableDmE2e: (conversationId) => api.post(`/e2e/dm/enable/${conversationId}`),
  disableDmE2e: (conversationId) => api.post(`/e2e/dm/disable/${conversationId}`),
  getDmE2eKeys: (conversationId) => api.get(`/e2e/dm/keys/${conversationId}`),
  joinDmE2e: (conversationId, data) => api.post(`/e2e/dm/join/${conversationId}`, data),
  getDmUserKeys: (conversationId) => api.get(`/e2e/dm/user-keys/${conversationId}`),
  rotateDmE2eKeys: (conversationId) => api.post(`/e2e/dm/rotate/${conversationId}`),

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
  sendSystemMessage: (data) => api.post('/system/send', data)
}
