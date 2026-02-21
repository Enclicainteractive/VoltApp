import React, { useState } from 'react'
import { X, Hash, Volume2, Lock, Trash2, Shield } from 'lucide-react'
import { apiService } from '../../services/apiService'
import { useTranslation } from '../../hooks/useTranslation'
import BioEditor from '../BioEditor'
import './Modal.css'
import './ChannelSettingsModal.css'
import '../../assets/styles/RichTextEditor.css'

const ChannelSettingsModal = ({ channel, server, onClose, onUpdate, onDelete }) => {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState('overview')
  const [channelData, setChannelData] = useState({
    name: channel?.name || '',
    topic: channel?.topic || '',
    slowMode: channel?.slowMode || 0,
    nsfw: channel?.nsfw || false
  })
  const [permissions, setPermissions] = useState(channel?.permissions || {})
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

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

  const handleDelete = async () => {
    try {
      await apiService.deleteChannel(channel.id)
      onDelete?.()
      onClose()
    } catch (err) {
      console.error('Failed to delete channel:', err)
    }
  }

  const tabs = [
    { id: 'overview', label: t('serverSettings.overview') },
    { id: 'permissions', label: t('roles.permissions') || 'Permissions' }
  ]

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content channel-settings-modal" onClick={e => e.stopPropagation()}>
        <div className="channel-settings-container">
          <div className="channel-settings-sidebar">
            <div className="channel-settings-header">
              {channel?.type === 'voice' ? <Volume2 size={20} /> : <Hash size={20} />}
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
                <Trash2 size={16} />
                {t('channel.deleteChannel', 'Delete Channel')}
              </button>
            </div>
          </div>

          <div className="channel-settings-content">
            <button className="modal-close-btn" onClick={onClose}>
              <X size={24} />
            </button>

            {activeTab === 'overview' && (
              <div className="settings-panel">
                <h2>{t('channel.channelOverview', 'Channel Overview')}</h2>

                <div className="form-group">
                  <label>{t('channel.channelName', 'Channel Name')}</label>
                  <div className="channel-name-input">
                    {channel?.type === 'voice' ? <Volume2 size={18} /> : <Hash size={18} />}
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
                <p className="section-desc">{t('channel.permissionsDesc', 'Control who can access and use this channel')}</p>

                <div className="permissions-list">
                  {(server?.roles || [{ id: 'everyone', name: '@everyone', color: '#99aab5' }]).map(role => (
                    <div key={role.id} className="permission-role">
                      <div className="role-header">
                        <div className="role-color" style={{ backgroundColor: role.color }} />
                        <span className="role-name">{role.name}</span>
                      </div>
                      <div className="permission-toggles">
                        <label className="permission-item">
                          <span>{t('channel.viewChannel', 'View Channel')}</span>
                          <input type="checkbox" defaultChecked />
                        </label>
                        <label className="permission-item">
                          <span>{t('channel.sendMessages', 'Send Messages')}</span>
                          <input type="checkbox" defaultChecked />
                        </label>
                        {channel?.type === 'voice' && (
                          <>
                            <label className="permission-item">
                              <span>{t('channel.connect', 'Connect')}</span>
                              <input type="checkbox" defaultChecked />
                            </label>
                            <label className="permission-item">
                              <span>{t('channel.speak', 'Speak')}</span>
                              <input type="checkbox" defaultChecked />
                            </label>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
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
