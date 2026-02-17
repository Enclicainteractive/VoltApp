import React, { useState } from 'react'
import { Server, Plus, Trash2, RefreshCw, CheckCircle, XCircle, Settings, Globe, Lock, Mic, FileText, Database, Key, Shield, Users } from 'lucide-react'
import { useSelfVolt } from '../contexts/SelfVoltContext'
import './SelfVoltPanel.css'

const SelfVoltPanel = () => {
  const { 
    selfVolts = [], 
    loading, 
    addSelfVolt, 
    updateSelfVolt, 
    deleteSelfVolt, 
    testSelfVolt,
    syncSelfVoltServers 
  } = useSelfVolt()

  const [showAddModal, setShowAddModal] = useState(false)
  const [editingVolt, setEditingVolt] = useState(null)
  const [selectedVolt, setSelectedVolt] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    description: ''
  })

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!formData.name || !formData.url) return

    await addSelfVolt(formData)
    setShowAddModal(false)
    setFormData({ name: '', url: '', description: '' })
  }

  const handleUpdate = async (e) => {
    e.preventDefault()
    if (!editingVolt || !formData.name || !formData.url) return

    await updateSelfVolt(editingVolt.id, formData)
    setEditingVolt(null)
    setFormData({ name: '', url: '', description: '' })
  }

  const handleDelete = async (voltId) => {
    if (!confirm('Are you sure you want to remove this Self-Volt server?')) return
    await deleteSelfVolt(voltId)
    setSelectedVolt(null)
  }

  const handleTest = async (voltId) => {
    await testSelfVolt(voltId)
  }

  const handleSync = async (voltId) => {
    await syncSelfVoltServers(voltId)
  }

  const openEdit = (volt) => {
    setEditingVolt(volt)
    setFormData({
      name: volt.name,
      url: volt.url,
      description: volt.description || ''
    })
  }

  const getVoltStatus = (volt) => {
    if (volt.status === 'OK') return 'online'
    if (volt.status === 'ERROR') return 'offline'
    return 'unknown'
  }

  return (
    <div className="self-volt-panel">
      <div className="self-volt-header">
        <div className="self-volt-title">
          <Globe size={24} />
          <h2>Self-Volt Servers</h2>
        </div>
        <button 
          className="btn btn-primary"
          onClick={() => setShowAddModal(true)}
        >
          <Plus size={16} />
          Add Self-Volt
        </button>
      </div>

      <p className="self-volt-desc">
        Manage your self-hosted VoltChat servers. Each Self-Volt stores its own messages, files, members, and handles encryption. 
        This provides complete privacy as data never touches the main VoltChat servers.
      </p>

      {loading && <div className="self-volt-loading">Loading...</div>}

      <div className="self-volt-layout">
        <div className="self-volt-list">
          {selfVolts.length === 0 && !loading && (
            <div className="self-volt-empty">
              <Server size={48} />
              <p>No self-hosted servers added yet</p>
              <button 
                className="btn btn-secondary"
                onClick={() => setShowAddModal(true)}
              >
                <Plus size={16} />
                Add Your First Self-Volt
              </button>
            </div>
          )}

          {selfVolts.map(volt => (
            <div 
              key={volt.id} 
              className={`self-volt-card ${volt.status} ${selectedVolt?.id === volt.id ? 'selected' : ''}`}
              onClick={() => setSelectedVolt(volt)}
            >
              <div className="self-volt-card-header">
                <div className="self-volt-icon">
                  {volt.icon ? (
                    <img src={volt.icon} alt={volt.name} />
                  ) : (
                    <Server size={24} />
                  )}
                </div>
                <div className="self-volt-info">
                  <h3>{volt.name}</h3>
                  <span className="self-volt-url">{volt.url}</span>
                </div>
                <div className={`self-volt-status ${volt.status}`}>
                  {volt.status === 'OK' ? (
                    <><CheckCircle size={16} /> Online</>
                  ) : (
                    <><XCircle size={16} /> Offline</>
                  )}
                </div>
              </div>

              {volt.servers && volt.servers.length > 0 && (
                <div className="self-volt-servers-count">
                  <Server size={14} />
                  <span>{volt.servers.length} server{volt.servers.length !== 1 ? 's' : ''}</span>
                </div>
              )}

              <div className="self-volt-actions" onClick={e => e.stopPropagation()}>
                <button 
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleTest(volt.id)}
                  title="Test Connection"
                >
                  <RefreshCw size={14} />
                </button>
                <button 
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleSync(volt.id)}
                  title="Sync Servers"
                >
                  <RefreshCw size={14} />
                </button>
                <button 
                  className="btn btn-secondary btn-sm"
                  onClick={() => openEdit(volt)}
                  title="Edit"
                >
                  <Settings size={14} />
                </button>
                <button 
                  className="btn btn-danger btn-sm"
                  onClick={() => handleDelete(volt.id)}
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {selectedVolt && (
          <div className="self-volt-details">
            <div className="details-header">
              <h3>{selectedVolt.name}</h3>
              <span className={`status-badge ${getVoltStatus(selectedVolt)}`}>
                {getVoltStatus(selectedVolt)}
              </span>
            </div>

            <div className="details-section">
              <h4>Server Features</h4>
              <div className="features-grid">
                <div className="feature-item">
                  <Shield size={20} />
                  <span>End-to-End Encryption</span>
                  <span className="feature-status enabled">Enabled</span>
                </div>
                <div className="feature-item">
                  <Mic size={20} />
                  <span>Voice Channels</span>
                  <span className="feature-status enabled">Enabled</span>
                </div>
                <div className="feature-item">
                  <FileText size={20} />
                  <span>File Storage</span>
                  <span className="feature-status enabled">Enabled</span>
                </div>
                <div className="feature-item">
                  <Database size={20} />
                  <span>Local Storage</span>
                  <span className="feature-status enabled">JSON</span>
                </div>
              </div>
            </div>

            {selectedVolt.servers && selectedVolt.servers.length > 0 && (
              <div className="details-section">
                <h4>Hosted Servers</h4>
                <div className="hosted-servers-list">
                  {selectedVolt.servers.map(server => (
                    <div key={server.id} className="hosted-server-item">
                      <div className="server-icon">
                        {server.icon ? (
                          <img src={server.icon} alt={server.name} />
                        ) : (
                          <Server size={16} />
                        )}
                      </div>
                      <div className="server-info">
                        <span className="server-name">{server.name}</span>
                        <span className="server-members">{server.memberCount} members</span>
                      </div>
                      <button className="btn btn-secondary btn-sm">
                        Manage
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="details-section">
              <h4>Quick Actions</h4>
              <div className="quick-actions">
                <button 
                  className="btn btn-secondary"
                  onClick={async () => {
                    if (confirm('Sync servers from this Self-Volt? This will fetch the latest server list.')) {
                      await syncSelfVoltServers(selectedVolt.id)
                    }
                  }}
                >
                  <RefreshCw size={16} />
                  Sync Servers
                </button>
                <button 
                  className="btn btn-secondary"
                  onClick={async () => {
                    if (confirm('Rotate encryption keys? All members will need to rejoin encryption.')) {
                      alert('Key rotation not yet implemented for Self-Volt')
                    }
                  }}
                >
                  <Key size={16} />
                  Rotate Encryption Keys
                </button>
                <button 
                  className="btn btn-secondary"
                  onClick={() => {
                    alert('Manage Members: This would open a member management interface')
                  }}
                >
                  <Users size={16} />
                  Manage Members
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content self-volt-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Self-Volt Server</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>
                <XCircle size={20} />
              </button>
            </div>
            <form onSubmit={handleAdd} className="self-volt-form">
              <div className="form-group">
                <label>Server Name</label>
                <input
                  type="text"
                  className="input"
                  placeholder="My Self-Hosted Server"
                  value={formData.name}
                  onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                  required
                />
              </div>
              <div className="form-group">
                <label>Server URL</label>
                <input
                  type="url"
                  className="input"
                  placeholder="https://my-server.example.com:3001"
                  value={formData.url}
                  onChange={e => setFormData(p => ({ ...p, url: e.target.value }))}
                  required
                />
                <span className="field-hint">The URL where your self-volt server is running (include port)</span>
              </div>
              <div className="form-group">
                <label>Description (optional)</label>
                <textarea
                  className="input"
                  placeholder="A brief description of your server..."
                  value={formData.description}
                  onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                  rows={3}
                />
              </div>
              <div className="form-actions">
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  <Plus size={16} />
                  Add Server
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingVolt && (
        <div className="modal-overlay" onClick={() => setEditingVolt(null)}>
          <div className="modal-content self-volt-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Self-Volt Server</h3>
              <button className="modal-close" onClick={() => setEditingVolt(null)}>
                <XCircle size={20} />
              </button>
            </div>
            <form onSubmit={handleUpdate} className="self-volt-form">
              <div className="form-group">
                <label>Server Name</label>
                <input
                  type="text"
                  className="input"
                  placeholder="My Self-Hosted Server"
                  value={formData.name}
                  onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                  required
                />
              </div>
              <div className="form-group">
                <label>Server URL</label>
                <input
                  type="url"
                  className="input"
                  placeholder="https://my-server.example.com:3001"
                  value={formData.url}
                  onChange={e => setFormData(p => ({ ...p, url: e.target.value }))}
                  required
                />
              </div>
              <div className="form-group">
                <label>Description (optional)</label>
                <textarea
                  className="input"
                  placeholder="A brief description of your server..."
                  value={formData.description}
                  onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                  rows={3}
                />
              </div>
              <div className="form-actions">
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={() => setEditingVolt(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  <Settings size={16} />
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default SelfVoltPanel
