import React, { useState, useEffect } from 'react'
import { XMarkIcon, HashtagIcon, SpeakerWaveIcon, LockClosedIcon, TrashIcon, ShieldCheckIcon, ShieldExclamationIcon } from "@heroicons/react/24/outline";
import { X, Hash, Volume2, Lock, Trash, Shield, Users, Eye, EyeOff, ShieldAlert, ShieldCheck, Download, Upload, Key } from 'lucide-react'
import { apiService } from '../../services/apiService'
import { useTranslation } from '../../hooks/useTranslation'
import { useE2e } from '../../contexts/E2eContext'
import BioEditor from '../BioEditor'
import { EncryptionStatusBadge } from '../EncryptionStatusBadge'
import './Modal.css'
import './ChannelSettingsModal.css'
import '../../assets/styles/RichTextEditor.css'

const ChannelSettingsModal = ({ channel, server, onClose, onUpdate, onDelete }) => {
  const { t } = useTranslation()
  const { isEncryptionEnabled, hasDecryptedKey, getServerEncryptionStatus, exportAllKeysForBackup, importAllKeysFromBackup, fetchMissingKeys, userKeys, serverKeys } = useE2e()

  const [showKeyExport, setShowKeyExport] = useState(false)
  const [showKeyImport, setShowKeyImport] = useState(false)
  const [exportPassword, setExportPassword] = useState('')
  const [importPassword, setImportPassword] = useState('')
  const [importedData, setImportedData] = useState('')
  const [keyActionLoading, setKeyActionLoading] = useState(false)
  const [keyMessage, setKeyMessage] = useState(null)

  const serverId = server?.id
  const encryptionEnabled = serverId ? isEncryptionEnabled(serverId) : false
  const userHasKey = serverId ? hasDecryptedKey(serverId) : false

  // Check encryption status when modal opens
  useEffect(() => {
    if (serverId) {
      console.log('[ChannelSettingsModal] Checking encryption status for server:', serverId)
      getServerEncryptionStatus(serverId)
    }
  }, [serverId, getServerEncryptionStatus])
  const [activeTab, setActiveTab] = useState('overview')
  const [channelData, setChannelData] = useState({
    name: channel?.name || '',
    topic: channel?.topic || '',
    slowMode: channel?.slowMode || 0,
    nsfw: channel?.nsfw || false
  })
  const [permissions, setPermissions] = useState({ overrides: {} })
  const [saving, setSaving] = useState(false)
  const [savingPermissions, setSavingPermissions] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [loadingPermissions, setLoadingPermissions] = useState(false)

  const loadPermissions = async () => {
    if (!channel?.id) return
    setLoadingPermissions(true)
    try {
      const perms = await apiService.getChannelPermissions(channel.id)
      // Ensure we always have a valid permissions object with overrides
      let validPerms = perms
      if (!perms || typeof perms !== 'object' || !perms.overrides) {
        validPerms = { overrides: {} }
      }
      setPermissions(validPerms)
    } catch (err) {
      console.error('Failed to load permissions:', err)
      setPermissions({ overrides: {} })
    }
    setLoadingPermissions(false)
  }

  useEffect(() => {
    console.log('[ChannelSettings] useEffect triggered', { activeTab, channelId: channel?.id, hasServer: !!server })
    if (activeTab === 'permissions') {
      loadPermissions()
    }
  }, [activeTab, channel?.id, server])

  const handleSave = async () => {
    setSaving(true)
    try {
      await apiService.updateChannel(channel.id, channelData)
      onUpdate?.({ ...channel, ...channelData })
      onClose()
    } catch (err) {
      console.error('Failed to save channel:', err)
    }
    setSaving(false)
  }

  const handleSavePermissions = async () => {
    setSavingPermissions(true)
    try {
      console.log('Saving permissions:', permissions)
      const result = await apiService.updateChannelPermissions(channel.id, permissions)
      console.log('Save result:', result)
      // Notify parent to refresh server data (members, channels, etc.)
      onUpdate?.()
      // Also reload permissions in the modal to reflect any server-side changes
      await loadPermissions()
      // Dispatch event so other components (like MemberSidebar) can refresh their channel-specific data
      window.dispatchEvent(new CustomEvent('channel-permissions-updated', { 
        detail: { channelId: channel.id } 
      }))
    } catch (err) {
      console.error('Failed to save permissions:', err)
      if (err.response) {
        console.error('Response data:', err.response.data)
        console.error('Response status:', err.response.status)
      }
    }
    setSavingPermissions(false)
  }

  const handleDelete = async () => {
    try {
      await apiService.deleteChannel(channel.id)
      onDelete?.()
      onClose()
    } catch (err) {
      console.error('Failed to delete channel:', err)
    }
  }

  const handlePermissionChange = (roleId, permission, value) => {
    setPermissions(prev => {
      const overrides = { ...prev.overrides }
      if (!overrides[roleId]) {
        overrides[roleId] = {}
      }
      
      if (value === 'default') {
        delete overrides[roleId][permission]
        if (Object.keys(overrides[roleId]).length === 0) {
          delete overrides[roleId]
        }
      } else {
        overrides[roleId][permission] = value
      }
      
      return { overrides }
    })
  }

  const getPermissionValue = (roleId, permission) => {
    const rolePerms = permissions.overrides?.[roleId]
    if (!rolePerms) return 'default'
    return rolePerms[permission] ?? 'default'
  }

  const tabs = [
    { id: 'overview', label: t('serverSettings.overview') },
    { id: 'permissions', label: t('roles.permissions') || 'Permissions' },
    { id: 'encryption', label: t('serverSettings.encryption') || 'Encryption' }
  ]

  const roles = [
    { id: '@everyone', name: '@everyone', color: '#99aab5' },
    ...(server?.roles || []).filter(r => r && r.id && r.name !== '@member' && r.name !== '@everyone' && r.id !== '@everyone')
  ]

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content channel-settings-modal" onClick={e => e.stopPropagation()}>
        <div className="channel-settings-container">
          <div className="channel-settings-sidebar">
            <div className="channel-settings-header">
              {channel?.type === 'voice' ? <SpeakerWaveIcon size={20} /> : <Hash size={20} />}
              <span>{channel?.name}</span>
            </div>
            <div className="channel-settings-tabs">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  className={`channel-settings-tab ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
              <button
                className="channel-settings-tab danger"
                onClick={() => setConfirmDelete(true)}
              >
                <TrashIcon size={16} />
                {t('channel.deleteChannel', 'Delete Channel')}
              </button>
            </div>
          </div>

          <div className="channel-settings-content">
            <button className="modal-close-btn" onClick={onClose}>
              <XMarkIcon size={24} />
            </button>

            {activeTab === 'overview' && (
              <div className="settings-panel">
                <h2>{t('channel.channelOverview', 'Channel Overview')}</h2>

                <div className="form-group">
                  <label>{t('channel.channelName', 'Channel Name')}</label>
                  <div className="channel-name-input">
                    {channel?.type === 'voice' ? <SpeakerWaveIcon size={18} /> : <Hash size={18} />}
                    <input
                      type="text"
                      className="input"
                      value={channelData.name}
                      onChange={e => setChannelData(p => ({ ...p, name: e.target.value.toLowerCase().replace(/\s+/g, '-') }))}
                    />
                  </div>
                </div>

                {channel?.type === 'text' && (
                  <>
                    <div className="form-group">
                      <label>{t('channel.channelTopic', 'Channel Topic')}</label>
                      <BioEditor
                        value={channelData.topic}
                        onChange={(text) => setChannelData(p => ({ ...p, topic: text }))}
                        placeholder={t('channel.topicPlaceholder', 'Describe what this channel is about')}
                        maxLength={1024}
                      />
                    </div>

                    <div className="setting-row">
                      <div className="setting-info">
                        <h4>{t('channel.slowMode', 'Slow Mode')}</h4>
                        <p>{t('channel.slowModeDesc', 'Limit how often users can send messages')}</p>
                      </div>
                      <select
                        className="input select-small"
                        value={channelData.slowMode}
                        onChange={e => setChannelData(p => ({ ...p, slowMode: parseInt(e.target.value) }))}
                      >
                        <option value={0}>{t('common.off', 'Off')}</option>
                        <option value={5}>{t('common.seconds', { count: 5 }, '5 seconds')}</option>
                        <option value={10}>{t('common.seconds', { count: 10 }, '10 seconds')}</option>
                        <option value={30}>{t('common.seconds', { count: 30 }, '30 seconds')}</option>
                        <option value={60}>{t('common.minute', '1 minute')}</option>
                        <option value={300}>{t('common.minutes', { count: 5 }, '5 minutes')}</option>
                      </select>
                    </div>

                    <div className="setting-row">
                      <div className="setting-info">
                        <h4>{t('channel.ageRestricted', 'Age-Restricted Channel')}</h4>
                        <p>{t('channel.ageRestrictedDesc', 'Users must be 18+ to view this channel')}</p>
                      </div>
                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={channelData.nsfw}
                          onChange={() => setChannelData(p => ({ ...p, nsfw: !p.nsfw }))}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>
                  </>
                )}

                <div className="settings-actions">
                  <button className="btn btn-secondary" onClick={onClose}>{t('common.cancel', 'Cancel')}</button>
                  <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? t('common.saving', 'Saving...') : t('channel.saveChanges', 'Save Changes')}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'permissions' && (
              <div className="settings-panel">
                <h2>{t('channel.channelPermissions', 'Channel Permissions')}</h2>
                <p className="section-desc">
                  {t('channel.permissionsDesc', 'Control who can access and use this channel.')}
                  <br />
                  <small style={{ color: 'var(--text-muted)', marginTop: '8px', display: 'block' }}>
                    Set to "Default" to use server role permissions. Use "Allow" or "Deny" to override.
                  </small>
                </p>

                {loadingPermissions ? (
                  <div className="loading-spinner">Loading permissions...</div>
                ) : (
                  <>
                    <div className="permissions-list">
                      {roles.map(role => (
                        <div key={role.id} className="permission-role">
                          <div className="role-header">
                            <div className="role-color" style={{ backgroundColor: role.color }} />
                            <span className="role-name">{role.name}</span>
                          </div>
                          <div className="permission-toggles">
                            <div className="permission-item">
                              <span>
                                <Eye size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                                {t('channel.viewChannel', 'View Channel')}
                              </span>
                              <select
                                className="input select-small permission-select"
                                value={getPermissionValue(role.id, 'view')}
                                onChange={(e) => handlePermissionChange(role.id, 'view', e.target.value)}
                              >
                                <option value="default">{t('channel.default', 'Default')}</option>
                                <option value="true">{t('channel.allow', 'Allow')}</option>
                                <option value="false">{t('channel.deny', 'Deny')}</option>
                              </select>
                            </div>
                            <div className="permission-item">
                              <span>
                                <Users size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                                {t('channel.sendMessages', 'Send Messages')}
                              </span>
                              <select
                                className="input select-small permission-select"
                                value={getPermissionValue(role.id, 'sendMessages')}
                                onChange={(e) => handlePermissionChange(role.id, 'sendMessages', e.target.value)}
                              >
                                <option value="default">{t('channel.default', 'Default')}</option>
                                <option value="true">{t('channel.allow', 'Allow')}</option>
                                <option value="false">{t('channel.deny', 'Deny')}</option>
                              </select>
                            </div>
                            {channel?.type === 'voice' && (
                              <>
                                <div className="permission-item">
                                  <span>
                                    <Volume2 size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                                    {t('channel.connect', 'Connect')}
                                  </span>
                                  <select
                                    className="input select-small permission-select"
                                    value={getPermissionValue(role.id, 'connect')}
                                    onChange={(e) => handlePermissionChange(role.id, 'connect', e.target.value)}
                                  >
                                    <option value="default">{t('channel.default', 'Default')}</option>
                                    <option value="true">{t('channel.allow', 'Allow')}</option>
                                    <option value="false">{t('channel.deny', 'Deny')}</option>
                                  </select>
                                </div>
                                <div className="permission-item">
                                  <span>
                                    <Shield size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                                    {t('channel.speak', 'Speak')}
                                  </span>
                                  <select
                                    className="input select-small permission-select"
                                    value={getPermissionValue(role.id, 'speak')}
                                    onChange={(e) => handlePermissionChange(role.id, 'speak', e.target.value)}
                                  >
                                    <option value="default">{t('channel.default', 'Default')}</option>
                                    <option value="true">{t('channel.allow', 'Allow')}</option>
                                    <option value="false">{t('channel.deny', 'Deny')}</option>
                                  </select>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                      <div className="settings-actions">
                      <button className="btn btn-secondary" onClick={loadPermissions}>{t('common.reset', 'Reset')}</button>
                      <button className="btn btn-primary" onClick={handleSavePermissions} disabled={savingPermissions}>
                        {savingPermissions ? t('common.saving', 'Saving...') : t('channel.savePermissions', 'Save Permissions')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'encryption' && (
              <div className="settings-panel">
                <h2>{t('channel.channelEncryption', 'Channel Encryption')}</h2>
                <p className="section-desc">
                  {t('channel.encryptionDesc', 'Voice and video calls in this channel can be end-to-end encrypted.')}
                </p>

                {!encryptionEnabled ? (
                  <div className="encryption-disabled">
                    <ShieldAlert size={48} className="encryption-icon warning" />
                    <h3>{t('channel.encryptionDisabled', 'Server Encryption Disabled')}</h3>
                    <p>{t('channel.encryptionServerDisabled', 'End-to-end encryption must be enabled at the server level first. Go to Server Settings to enable it.')}</p>
                    <button className="btn btn-secondary" onClick={() => {
                      onClose()
                      // Could emit event to open server settings
                    }}>
                      {t('channel.openServerSettings', 'Open Server Settings')}
                    </button>
                  </div>
                ) : (
                  <div className="encryption-enabled">
                    <div className="encryption-status-card">
                      <div className="encryption-status-header">
                        {userHasKey ? (
                          <>
                            <ShieldCheck size={32} className="encryption-icon success" />
                            <div>
                              <h3>{t('channel.encryptionActive', 'Encryption Active')}</h3>
                              <p>{t('channel.encryptionActiveDesc', 'Your device has the decryption key. Voice calls are secure.')}</p>
                            </div>
                          </>
                        ) : (
                          <>
                            <ShieldExclamationIcon size={32} className="encryption-icon warning" />
                            <div>
                              <h3>{t('channel.encryptionNoKey', 'No Decryption Key')}</h3>
                              <p>{t('channel.encryptionNoKeyDesc', 'Encryption is enabled. You will automatically join when encryption is available.')}</p>
                            </div>
                          </>
                        )}
                      </div>

                      <EncryptionStatusBadge
                        isEncryptionEnabled={encryptionEnabled}
                        hasDecryptedKey={userHasKey}
                        isJoining={!userHasKey && encryptionEnabled}
                      />
                    </div>

                    <div className="encryption-info-section">
                      <h4>{t('channel.aboutEncryption', 'About End-to-End Encryption')}</h4>
                      <ul>
                        <li>{t('channel.encryptionPoint1', 'Voice calls are encrypted using SRTP (Secure Real-time Transport Protocol)')}</li>
                        <li>{t('channel.encryptionPoint2', 'Only participants with the decryption key can hear the audio')}</li>
                        <li>{t('channel.encryptionPoint3', 'Keys are generated per session and discarded when everyone leaves')}</li>
                        <li>{t('channel.encryptionPoint4', 'Even server admins cannot decrypt voice calls')}</li>
                      </ul>
                    </div>

                    <div className="encryption-key-section">
                      <h4>{t('channel.keyManagement', 'Key Management')}</h4>
                      <p className="section-desc">
                        {t('channel.keyManagementDesc', 'Export your encryption keys to transfer them to another device, or import keys from another user to decrypt their messages.')}
                      </p>

                      <div className="key-actions">
                        <button 
                          className="btn btn-secondary" 
                          onClick={() => setShowKeyExport(!showKeyExport)}
                          disabled={!userKeys?.privateKey}
                        >
                          <Download size={16} />
                          {t('channel.exportKeys', 'Export Keys')}
                        </button>
                        
                        <button 
                          className="btn btn-secondary" 
                          onClick={() => setShowKeyImport(!showKeyImport)}
                        >
                          <Upload size={16} />
                          {t('channel.importKeys', 'Import Keys')}
                        </button>
                      </div>

                      {showKeyExport && (
                        <div className="key-export-import-box">
                          <h5>{t('channel.exportYourKeys', 'Export Your Keys')}</h5>
                          <p>{t('channel.exportKeysDesc', 'Create a password to encrypt your exported keys. Share this with your other devices or users you trust.')}</p>
                          <input
                            type="password"
                            placeholder={t('channel.enterPassword', 'Enter password')}
                            value={exportPassword}
                            onChange={(e) => setExportPassword(e.target.value)}
                            className="input"
                          />
                          <button 
                            className="btn btn-primary"
                            onClick={async () => {
                              if (!exportPassword) {
                                setKeyMessage({ type: 'error', text: t('channel.passwordRequired', 'Password is required') })
                                return
                              }
                              setKeyActionLoading(true)
                              try {
                                const backupData = await exportAllKeysForBackup(exportPassword)
                                const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' })
                                const url = URL.createObjectURL(blob)
                                const a = document.createElement('a')
                                a.href = url
                                a.download = `voltchat-keys-backup-${new Date().toISOString().split('T')[0]}.json`
                                document.body.appendChild(a)
                                a.click()
                                document.body.removeChild(a)
                                URL.revokeObjectURL(url)
                                setKeyMessage({ type: 'success', text: t('channel.keysExported', 'Keys exported successfully!') })
                              } catch (err) {
                                setKeyMessage({ type: 'error', text: err.message })
                              }
                              setKeyActionLoading(false)
                            }}
                            disabled={keyActionLoading}
                          >
                            {keyActionLoading ? t('common.loading', 'Loading...') : t('channel.downloadKeys', 'Download Keys')}
                          </button>
                        </div>
                      )}

                      {showKeyImport && (
                        <div className="key-export-import-box">
                          <h5>{t('channel.importKeysFromOther', 'Import Keys')}</h5>
                          <p>{t('channel.importKeysDesc', 'Paste the exported key data from another user to decrypt their messages.')}</p>
                          <textarea
                            placeholder={t('channel.pasteKeyData', 'Paste exported key data here')}
                            value={importedData}
                            onChange={(e) => setImportedData(e.target.value)}
                            className="input"
                            rows={4}
                          />
                          <input
                            type="password"
                            placeholder={t('channel.enterPassword', 'Enter password')}
                            value={importPassword}
                            onChange={(e) => setImportPassword(e.target.value)}
                            className="input"
                          />
                          <button 
                            className="btn btn-primary"
                            onClick={async () => {
                              if (!importedData || !importPassword) {
                                setKeyMessage({ type: 'error', text: t('channel.dataAndPasswordRequired', 'Both key data and password are required') })
                                return
                              }
                              setKeyActionLoading(true)
                              try {
                                const backupData = JSON.parse(importedData)
                                const result = await importAllKeysFromBackup(backupData, importPassword)
                                if (result.success) {
                                  setKeyMessage({ type: 'success', text: t('channel.keysImported', 'Keys imported successfully!') })
                                  setImportedData('')
                                  setImportPassword('')
                                  setShowKeyImport(false)
                                } else {
                                  setKeyMessage({ type: 'error', text: result.error || t('channel.keysImportFailed', 'Failed to import keys') })
                                }
                              } catch (err) {
                                setKeyMessage({ type: 'error', text: t('channel.invalidKeyData', 'Invalid key data') })
                              }
                              setKeyActionLoading(false)
                            }}
                            disabled={keyActionLoading}
                          >
                            {keyActionLoading ? t('common.loading', 'Loading...') : t('channel.importKeysBtn', 'Import Keys')}
                          </button>
                        </div>
                      )}

                      {keyMessage && (
                        <div className={`key-message ${keyMessage.type}`}>
                          {keyMessage.text}
                          <button onClick={() => setKeyMessage(null)}>×</button>
                        </div>
                      )}

                      <div className="server-keys-section">
                        <h5>{t('channel.serverKeys', 'Server Keys')}</h5>
                        <p>{t('channel.serverKeysDesc', 'Download server keys to share with new members who cannot decrypt messages.')}</p>
                        <button 
                          className="btn btn-secondary"
                          onClick={async () => {
                            if (!serverId || !hasDecryptedKey(serverId)) {
                              setKeyMessage({ type: 'error', text: t('channel.noServerKey', 'You need the server key to export it') })
                              return
                            }
                            const keyData = serverKeys[serverId]
                            if (keyData) {
                              const blob = new Blob([JSON.stringify(keyData, null, 2)], { type: 'application/json' })
                              const url = URL.createObjectURL(blob)
                              const a = document.createElement('a')
                              a.href = url
                              a.download = `voltchat-server-${serverId}-key.json`
                              document.body.appendChild(a)
                              a.click()
                              document.body.removeChild(a)
                              URL.revokeObjectURL(url)
                              setKeyMessage({ type: 'success', text: t('channel.serverKeyExported', 'Server key exported!') })
                            }
                          }}
                          disabled={!serverId || !hasDecryptedKey(serverId)}
                        >
                          <Key size={16} />
                          {t('channel.exportServerKey', 'Export Server Key')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {confirmDelete && (
              <div className="delete-confirm-overlay">
                <div className="delete-confirm-dialog">
                  <h3>{t('channel.deleteChannel', 'Delete Channel')}</h3>
                  <p>{t('channel.deleteConfirm', 'Are you sure you want to delete #{{channel}}? This cannot be undone.', { channel: channel?.name })}</p>
                  <div className="delete-confirm-actions">
                    <button className="btn btn-secondary" onClick={() => setConfirmDelete(false)}>{t('common.cancel', 'Cancel')}</button>
                    <button className="btn btn-danger" onClick={handleDelete}>{t('channel.deleteChannel', 'Delete Channel')}</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ChannelSettingsModal
