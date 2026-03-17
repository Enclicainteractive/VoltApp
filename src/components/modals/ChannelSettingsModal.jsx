/**
 * ChannelSettingsModal.jsx — complete rewrite
 *
 * A polished channel settings modal with:
 *  - Overview (name, topic, slow mode, NSFW toggle)
 *  - Permissions (per-role overrides with Allow/Deny/Default)
 *  - Encryption (E2EE status, key export/import)
 *  - Delete channel (with confirmation overlay)
 */

import React, { useState, useEffect } from 'react'
import {
  X, Hash, Volume2, Lock, Trash2, Shield, Users, Eye, EyeOff,
  ShieldAlert, ShieldCheck, Download, Upload, Key, Settings,
  Megaphone, MessageSquare, Film, Rss, Clock, AlertTriangle
} from 'lucide-react'
import { apiService } from '../../services/apiService'
import { useTranslation } from '../../hooks/useTranslation'
import { useE2e } from '../../contexts/E2eContext'
import { EncryptionStatusBadge } from '../EncryptionStatusBadge'
import './ChannelSettingsModal.css'

// ── Helpers ──────────────────────────────────────────────────────────────────

const CHANNEL_TYPE_ICONS = {
  text: Hash,
  voice: Volume2,
  announcement: Megaphone,
  forum: MessageSquare,
  media: Film,
  video: Film,
}

const CHANNEL_TYPE_LABELS = {
  text: 'Text',
  voice: 'Voice',
  announcement: 'Announcement',
  forum: 'Forum',
  media: 'Media',
  video: 'Video',
}

const SLOW_MODE_OPTIONS = [
  { value: 0,   label: 'Off' },
  { value: 5,   label: '5 seconds' },
  { value: 10,  label: '10 seconds' },
  { value: 30,  label: '30 seconds' },
  { value: 60,  label: '1 minute' },
  { value: 300, label: '5 minutes' },
  { value: 900, label: '15 minutes' },
]

const PERM_KEYS_TEXT  = ['view', 'sendMessages']
const PERM_KEYS_VOICE = ['view', 'connect', 'speak']

const PERM_LABELS = {
  view:         { icon: Eye,          label: 'View Channel' },
  sendMessages: { icon: MessageSquare, label: 'Send Messages' },
  connect:      { icon: Volume2,       label: 'Connect' },
  speak:        { icon: Shield,        label: 'Speak' },
}

// ── Component ─────────────────────────────────────────────────────────────────

const ChannelSettingsModal = ({ channel, server, onClose, onUpdate, onDelete }) => {
  const { t } = useTranslation()
  const {
    isEncryptionEnabled, hasDecryptedKey, getServerEncryptionStatus,
    exportAllKeysForBackup, importAllKeysFromBackup, userKeys, serverKeys
  } = useE2e()

  const serverId = server?.id
  const encryptionEnabled = serverId ? isEncryptionEnabled(serverId) : false
  const userHasKey        = serverId ? hasDecryptedKey(serverId)     : false

  const [activeTab, setActiveTab] = useState('overview')
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Overview state
  const [channelData, setChannelData] = useState({
    name:     channel?.name     || '',
    topic:    channel?.topic    || '',
    slowMode: channel?.slowMode || 0,
    nsfw:     channel?.nsfw     || false,
  })
  const [saving, setSaving] = useState(false)

  // Permissions state
  const [permissions, setPermissions] = useState({ overrides: {} })
  const [loadingPerms, setLoadingPerms] = useState(false)
  const [savingPerms, setSavingPerms] = useState(false)

  // Encryption / key state
  const [showKeyExport, setShowKeyExport] = useState(false)
  const [showKeyImport, setShowKeyImport] = useState(false)
  const [exportPassword, setExportPassword] = useState('')
  const [importPassword, setImportPassword] = useState('')
  const [importedData, setImportedData] = useState('')
  const [keyLoading, setKeyLoading] = useState(false)
  const [keyMessage, setKeyMessage] = useState(null)

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (serverId) getServerEncryptionStatus(serverId)
  }, [serverId, getServerEncryptionStatus])

  useEffect(() => {
    if (activeTab === 'permissions') loadPermissions()
  }, [activeTab, channel?.id])

  // ── Handlers ──────────────────────────────────────────────────────────────

  const loadPermissions = async () => {
    if (!channel?.id) return
    setLoadingPerms(true)
    try {
      const res = await apiService.getChannelPermissions(channel.id)
      setPermissions(res && res.overrides ? res : { overrides: {} })
    } catch {
      setPermissions({ overrides: {} })
    }
    setLoadingPerms(false)
  }

  const handleSaveOverview = async () => {
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
    setSavingPerms(true)
    try {
      await apiService.updateChannelPermissions(channel.id, permissions)
      onUpdate?.()
      await loadPermissions()
      window.dispatchEvent(new CustomEvent('channel-permissions-updated', {
        detail: { channelId: channel.id }
      }))
    } catch (err) {
      console.error('Failed to save permissions:', err)
    }
    setSavingPerms(false)
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

  const setPermOverride = (roleId, perm, value) => {
    setPermissions(prev => {
      const overrides = { ...prev.overrides }
      if (!overrides[roleId]) overrides[roleId] = {}
      if (value === 'default') {
        delete overrides[roleId][perm]
        if (Object.keys(overrides[roleId]).length === 0) delete overrides[roleId]
      } else {
        overrides[roleId][perm] = value
      }
      return { overrides }
    })
  }

  const getPermOverride = (roleId, perm) =>
    permissions.overrides?.[roleId]?.[perm] ?? 'default'

  // ── Derived ────────────────────────────────────────────────────────────────

  const isVoice = channel?.type === 'voice'
  const permKeys = isVoice ? PERM_KEYS_VOICE : PERM_KEYS_TEXT

  const roles = [
    { id: '@everyone', name: '@everyone', color: '#99aab5' },
    ...(server?.roles || []).filter(r => r?.id && r.name !== '@member' && r.name !== '@everyone' && r.id !== '@everyone')
  ]

  const TypeIcon = CHANNEL_TYPE_ICONS[channel?.type] || Hash
  const typeLabel = CHANNEL_TYPE_LABELS[channel?.type] || 'Channel'

  // ── Tab definitions ────────────────────────────────────────────────────────

  const TABS = [
    { id: 'overview',    label: 'Overview',    icon: Settings },
    { id: 'permissions', label: 'Permissions', icon: Shield },
    { id: 'encryption',  label: 'Encryption',  icon: Lock },
  ]

  // ── Render helpers ─────────────────────────────────────────────────────────

  const renderOverview = () => (
    <>
      <div className="csm-form-group">
        <label className="csm-label">Channel Name</label>
        <div className="csm-input-row">
          <span className="csm-input-prefix"><TypeIcon size={16} /></span>
          <input
            className="csm-input"
            value={channelData.name}
            onChange={e => setChannelData(p => ({ ...p, name: e.target.value.toLowerCase().replace(/\s+/g, '-') }))}
            placeholder="channel-name"
          />
        </div>
      </div>

      {!isVoice && (
        <div className="csm-form-group">
          <label className="csm-label">Channel Topic</label>
          <p className="csm-hint">Shown at the top of the channel. Supports basic markdown.</p>
          <textarea
            className="csm-textarea"
            value={channelData.topic}
            onChange={e => setChannelData(p => ({ ...p, topic: e.target.value }))}
            placeholder="What's this channel about?"
            rows={3}
          />
        </div>
      )}

      {!isVoice && (
        <div className="csm-form-group">
          <label className="csm-label">Slow Mode</label>
          <p className="csm-hint">Limit how often members can send messages.</p>
          <select
            className="csm-select"
            value={channelData.slowMode}
            onChange={e => setChannelData(p => ({ ...p, slowMode: parseInt(e.target.value) }))}
          >
            {SLOW_MODE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      )}

      {!isVoice && (
        <div className="csm-setting-row">
          <div className="csm-setting-info">
            <span className="csm-setting-label">Age-Restricted Channel</span>
            <span className="csm-setting-desc">Only users who have verified their age (18+) can view this channel.</span>
          </div>
          <label className="csm-toggle">
            <input
              type="checkbox"
              checked={channelData.nsfw}
              onChange={() => setChannelData(p => ({ ...p, nsfw: !p.nsfw }))}
            />
            <span className="csm-toggle-slider" />
          </label>
        </div>
      )}
    </>
  )

  const renderPermissions = () => (
    <>
      <p className="csm-hint">
        Override server-level permissions for this channel. <strong>Allow</strong> grants access regardless of role defaults.
        <strong> Deny</strong> blocks access. <strong>Default</strong> inherits from the server role.
      </p>

      {loadingPerms ? (
        <div className="csm-loading">
          <span className="csm-spinner" />
          Loading permissions…
        </div>
      ) : (
        <div className="csm-permissions-list">
          {roles.map(role => (
            <div key={role.id} className="csm-perm-role">
              <div className="csm-perm-role-header">
                <span className="csm-role-dot" style={{ backgroundColor: role.color }} />
                <span className="csm-role-name">{role.name}</span>
              </div>
              <div className="csm-perm-rows">
                {permKeys.map(perm => {
                  const { icon: PIcon, label } = PERM_LABELS[perm]
                  return (
                    <div key={perm} className="csm-perm-row">
                      <span className="csm-perm-label">
                        <PIcon size={14} />
                        {label}
                      </span>
                      <select
                        className="csm-perm-select"
                        value={getPermOverride(role.id, perm)}
                        onChange={e => setPermOverride(role.id, perm, e.target.value)}
                      >
                        <option value="default">Default</option>
                        <option value="true">Allow</option>
                        <option value="false">Deny</option>
                      </select>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )

  const renderEncryption = () => {
    if (!encryptionEnabled) {
      return (
        <div className="csm-enc-status-card">
          <div className="csm-enc-icon muted">
            <ShieldAlert size={24} />
          </div>
          <div className="csm-enc-text">
            <h3>Server Encryption Disabled</h3>
            <p>End-to-end encryption must be enabled at the server level first. Go to Server Settings → Security to enable it.</p>
          </div>
        </div>
      )
    }

    return (
      <>
        <div className="csm-enc-status-card">
          <div className={`csm-enc-icon ${userHasKey ? 'success' : 'warning'}`}>
            {userHasKey ? <ShieldCheck size={24} /> : <ShieldAlert size={24} />}
          </div>
          <div className="csm-enc-text">
            <h3>{userHasKey ? 'Encryption Active' : 'No Decryption Key'}</h3>
            <p>
              {userHasKey
                ? 'Your device has the decryption key. Voice calls in this channel are end-to-end encrypted.'
                : 'Encryption is enabled but you don\'t have the key yet. You\'ll be able to join once a key is available.'}
            </p>
          </div>
        </div>

        <div className="csm-enc-info-list">
          <h4>About End-to-End Encryption</h4>
          <ul>
            <li>Voice calls are encrypted using SRTP (Secure Real-time Transport Protocol)</li>
            <li>Only participants with the decryption key can hear the audio</li>
            <li>Keys are generated per session and discarded when everyone leaves</li>
            <li>Even server admins cannot decrypt voice calls</li>
          </ul>
        </div>

        <div className="csm-form-group">
          <label className="csm-label">Key Management</label>
          <p className="csm-hint">Export your encryption keys to transfer them to another device, or import keys from a backup.</p>
          <div className="csm-key-actions">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => { setShowKeyExport(v => !v); setShowKeyImport(false) }}
              disabled={!userKeys?.privateKey}
            >
              <Download size={14} /> Export Keys
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => { setShowKeyImport(v => !v); setShowKeyExport(false) }}
            >
              <Upload size={14} /> Import Keys
            </button>
            {serverId && hasDecryptedKey(serverId) && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={async () => {
                  const keyData = serverKeys?.[serverId]
                  if (!keyData) return
                  const blob = new Blob([JSON.stringify(keyData, null, 2)], { type: 'application/json' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `voltchat-server-${serverId}-key.json`
                  a.click()
                  URL.revokeObjectURL(url)
                  setKeyMessage({ type: 'success', text: 'Server key exported!' })
                }}
              >
                <Key size={14} /> Export Server Key
              </button>
            )}
          </div>
        </div>

        {showKeyExport && (
          <div className="csm-key-box">
            <h5>Export Your Keys</h5>
            <p>Set a password to encrypt the exported key file. Keep it safe.</p>
            <input
              type="password"
              className="csm-textarea"
              style={{ minHeight: 'unset', resize: 'none' }}
              placeholder="Enter password"
              value={exportPassword}
              onChange={e => setExportPassword(e.target.value)}
            />
            <button
              className="btn btn-primary btn-sm"
              disabled={keyLoading}
              onClick={async () => {
                if (!exportPassword) { setKeyMessage({ type: 'error', text: 'Password is required' }); return }
                setKeyLoading(true)
                try {
                  const data = await exportAllKeysForBackup(exportPassword)
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `voltchat-keys-${new Date().toISOString().split('T')[0]}.json`
                  a.click()
                  URL.revokeObjectURL(url)
                  setKeyMessage({ type: 'success', text: 'Keys exported successfully!' })
                  setShowKeyExport(false)
                  setExportPassword('')
                } catch (err) {
                  setKeyMessage({ type: 'error', text: err.message })
                }
                setKeyLoading(false)
              }}
            >
              {keyLoading ? 'Exporting…' : 'Download Keys'}
            </button>
          </div>
        )}

        {showKeyImport && (
          <div className="csm-key-box">
            <h5>Import Keys</h5>
            <p>Paste the exported key JSON and enter the password used when exporting.</p>
            <textarea
              className="csm-textarea"
              placeholder="Paste exported key data here"
              value={importedData}
              onChange={e => setImportedData(e.target.value)}
              rows={4}
            />
            <input
              type="password"
              className="csm-textarea"
              style={{ minHeight: 'unset', resize: 'none' }}
              placeholder="Enter password"
              value={importPassword}
              onChange={e => setImportPassword(e.target.value)}
            />
            <button
              className="btn btn-primary btn-sm"
              disabled={keyLoading}
              onClick={async () => {
                if (!importedData || !importPassword) {
                  setKeyMessage({ type: 'error', text: 'Both key data and password are required' })
                  return
                }
                setKeyLoading(true)
                try {
                  const parsed = JSON.parse(importedData)
                  const result = await importAllKeysFromBackup(parsed, importPassword)
                  if (result.success) {
                    setKeyMessage({ type: 'success', text: 'Keys imported successfully!' })
                    setImportedData('')
                    setImportPassword('')
                    setShowKeyImport(false)
                  } else {
                    setKeyMessage({ type: 'error', text: result.error || 'Failed to import keys' })
                  }
                } catch {
                  setKeyMessage({ type: 'error', text: 'Invalid key data — check the JSON format' })
                }
                setKeyLoading(false)
              }}
            >
              {keyLoading ? 'Importing…' : 'Import Keys'}
            </button>
          </div>
        )}

        {keyMessage && (
          <div className={`csm-key-message ${keyMessage.type}`}>
            <span>{keyMessage.text}</span>
            <button onClick={() => setKeyMessage(null)}>×</button>
          </div>
        )}
      </>
    )
  }

  // ── Tab content map ────────────────────────────────────────────────────────

  const TAB_TITLES = {
    overview:    'Channel Overview',
    permissions: 'Channel Permissions',
    encryption:  'Encryption',
  }

  const showFooter = activeTab === 'overview' || activeTab === 'permissions'

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="csm-overlay" onClick={onClose}>
      <div className="csm-modal" onClick={e => e.stopPropagation()}>

        {/* ── Sidebar ── */}
        <div className="csm-sidebar">
          <div className="csm-sidebar-header">
            <div className="csm-channel-name">
              <TypeIcon size={16} />
              <span>{channel?.name}</span>
              <span className="csm-channel-type-badge">{typeLabel}</span>
            </div>
          </div>

          <nav className="csm-nav">
            {TABS.map(tab => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  className={`csm-nav-item ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              )
            })}

            <div className="csm-nav-divider" />

            <button
              className="csm-nav-item danger"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={16} />
              Delete Channel
            </button>
          </nav>
        </div>

        {/* ── Content ── */}
        <div className="csm-content">
          <div className="csm-content-header">
            <h2 className="csm-content-title">{TAB_TITLES[activeTab]}</h2>
            <button className="csm-close-btn" onClick={onClose}>
              <X size={18} />
            </button>
          </div>

          <div className="csm-panel">
            {activeTab === 'overview'    && renderOverview()}
            {activeTab === 'permissions' && renderPermissions()}
            {activeTab === 'encryption'  && renderEncryption()}
          </div>

          {showFooter && (
            <div className="csm-footer">
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              {activeTab === 'overview' && (
                <button className="btn btn-primary" onClick={handleSaveOverview} disabled={saving}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              )}
              {activeTab === 'permissions' && (
                <>
                  <button className="btn btn-secondary" onClick={loadPermissions}>Reset</button>
                  <button className="btn btn-primary" onClick={handleSavePermissions} disabled={savingPerms}>
                    {savingPerms ? 'Saving…' : 'Save Permissions'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Delete confirmation overlay */}
          {confirmDelete && (
            <div className="csm-delete-overlay">
              <div className="csm-delete-dialog">
                <h3>Delete #{channel?.name}?</h3>
                <p>
                  This will permanently delete the channel and all its messages.
                  <strong> This action cannot be undone.</strong>
                </p>
                <div className="csm-delete-actions">
                  <button className="btn btn-secondary" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </button>
                  <button className="btn btn-danger" onClick={handleDelete}>
                    <Trash2 size={14} /> Delete Channel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ChannelSettingsModal
