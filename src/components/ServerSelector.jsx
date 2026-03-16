import React, { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { 
  addMainServer, 
  removeMainServer,
  discoverMainServer
} from '../services/serverConfig'
import { XMarkIcon, PlusIcon, ServerStackIcon, TrashIcon, CheckIcon } from '@heroicons/react/24/outline'
import './ServerSelector.css'

const ServerSelector = ({ onClose, embedded = false }) => {
  const { mainServers, currentMainServer, setMainServers, setCurrentMainServer } = useAppStore()
  const [showAddForm, setShowAddForm] = useState(false)
  const [discovering, setDiscovering] = useState(false)
  const [discoveryError, setDiscoveryError] = useState('')
  const [manualMode, setManualMode] = useState(false)
  const [newServer, setNewServer] = useState({
    id: '',
    name: '',
    host: '',
    apiUrl: '',
    imageApiUrl: '',
    authUrl: '',
    socketUrl: '',
    clientId: '',
    website: ''
  })

  const resetForm = () => {
    setNewServer({
      id: '',
      name: '',
      host: '',
      apiUrl: '',
      imageApiUrl: '',
      authUrl: '',
      socketUrl: '',
      clientId: '',
      website: ''
    })
    setDiscoveryError('')
    setManualMode(false)
  }

  const handleSelectServer = (server) => {
    setCurrentMainServer(server)
    if (!embedded) {
      window.location.reload()
    }
  }

  const handleDiscoverServer = async () => {
    if (!newServer.host.trim()) {
      setDiscoveryError('Enter a Volt server host, URL, or invite link first.')
      return
    }

    setDiscovering(true)
    setDiscoveryError('')
    try {
      const discovered = await discoverMainServer(newServer.host)
      setNewServer((prev) => ({
        ...prev,
        ...discovered,
        id: prev.id || discovered.id,
        host: discovered.host || prev.host,
        name: discovered.name || prev.name,
        apiUrl: discovered.apiUrl || prev.apiUrl,
        imageApiUrl: discovered.imageApiUrl || prev.imageApiUrl,
        authUrl: discovered.authUrl || prev.authUrl,
        socketUrl: discovered.socketUrl || prev.socketUrl,
        clientId: discovered.clientId || prev.clientId,
        website: discovered.website || prev.website
      }))
    } catch (error) {
      setDiscoveryError(error?.message || 'Unable to verify that server as a Volt mainnet.')
    } finally {
      setDiscovering(false)
    }
  }

  const handleAddServer = async () => {
    if (!newServer.id || !newServer.name || !newServer.host || !newServer.apiUrl || !newServer.socketUrl) {
      setDiscoveryError('Server details are incomplete. Discover the server or fill the fields manually.')
      return
    }

    const serverData = {
      ...newServer,
      id: newServer.id.toLowerCase().replace(/\s+/g, '-')
    }

    try {
      const servers = addMainServer(serverData)
      setMainServers(servers)
      setShowAddForm(false)
      resetForm()
    } catch (e) {
      console.error('Failed to add server:', e)
      setDiscoveryError(e?.message || 'Failed to add server')
    }
  }

  const handleRemoveServer = (serverId) => {
    if (mainServers.length <= 1) {
      return
    }
    const servers = removeMainServer(serverId)
    setMainServers(servers)
    if (currentMainServer?.id === serverId) {
      setCurrentMainServer(servers[0])
    }
  }

  return (
    <div className={`server-selector ${embedded ? 'embedded' : ''}`}>
      {!embedded && (
        <div className="server-selector-header">
          <h2>Select Server</h2>
          <button className="close-button" onClick={onClose}>
            <XMarkIcon size={20} />
          </button>
        </div>
      )}

      <div className="server-selector-content">
        <p className="server-selector-description">
          Choose a main server to connect to. Each server is an independent VoltChat network.
        </p>

        <div className="server-list">
          {mainServers.map((server) => (
            <div 
              key={server.id} 
              className={`server-item ${currentMainServer?.id === server.id ? 'active' : ''}`}
              onClick={() => handleSelectServer(server)}
            >
              <div className="server-icon">
                <ServerStackIcon size={20} />
              </div>
              <div className="server-info">
                <span className="server-name">{server.name}</span>
                <span className="server-url">{server.host}</span>
              </div>
              {currentMainServer?.id === server.id && (
                <div className="server-check">
                  <CheckIcon size={16} />
                </div>
              )}
              {mainServers.length > 1 && (
                <button 
                  className="server-remove"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemoveServer(server.id)
                  }}
                  title="Remove server"
                >
                  <TrashIcon size={14} />
                </button>
              )}
            </div>
          ))}
        </div>

        {showAddForm ? (
          <div className="add-server-form">
            <h3>Add New Server</h3>
            <div className="form-group">
              <label>Server Host, URL, or Invite</label>
              <div className="server-discovery-row">
                <input
                  type="text"
                  value={newServer.host}
                  onChange={(e) => setNewServer({ ...newServer, host: e.target.value })}
                  placeholder="hellscape.org or https://hellscape.org/invite/ABC123"
                />
                <button
                  type="button"
                  className="discover-button"
                  onClick={handleDiscoverServer}
                  disabled={discovering}
                >
                  {discovering ? 'Checking...' : 'Auto Fill'}
                </button>
              </div>
              <span className="field-hint">
                Volt will verify the server, fetch its config, and fill the rest automatically.
              </span>
              {discoveryError ? <div className="form-error">{discoveryError}</div> : null}
            </div>

            <div className="server-discovery-summary">
              <div className={`discovery-pill ${newServer.verified ? 'verified' : ''}`}>
                {newServer.verified ? 'Verified Volt mainnet' : 'Manual entry'}
              </div>
              <button
                type="button"
                className="manual-toggle"
                onClick={() => setManualMode((prev) => !prev)}
              >
                {manualMode ? 'Hide Advanced Fields' : 'Edit Advanced Fields'}
              </button>
            </div>

            <div className="form-group">
              <label>Server ID (unique identifier)</label>
              <input
                type="text"
                value={newServer.id}
                onChange={(e) => setNewServer({ ...newServer, id: e.target.value })}
                placeholder="my-server"
              />
            </div>
            <div className="form-group">
              <label>Server Name</label>
              <input
                type="text"
                value={newServer.name}
                onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
                placeholder="My Server"
              />
            </div>
            {manualMode ? (
              <>
                <div className="form-group">
                  <label>Host (domain)</label>
                  <input
                    type="text"
                    value={newServer.host}
                    onChange={(e) => setNewServer({ ...newServer, host: e.target.value })}
                    placeholder="myserver.com"
                  />
                </div>
                <div className="form-group">
                  <label>API URL</label>
                  <input
                    type="url"
                    value={newServer.apiUrl}
                    onChange={(e) => setNewServer({ ...newServer, apiUrl: e.target.value })}
                    placeholder="https://api.myserver.com"
                  />
                </div>
                <div className="form-group">
                  <label>Image API URL (optional, defaults to API URL)</label>
                  <input
                    type="url"
                    value={newServer.imageApiUrl}
                    onChange={(e) => setNewServer({ ...newServer, imageApiUrl: e.target.value })}
                    placeholder="https://api.myserver.com"
                  />
                </div>
                <div className="form-group">
                  <label>Auth URL (optional)</label>
                  <input
                    type="url"
                    value={newServer.authUrl}
                    onChange={(e) => setNewServer({ ...newServer, authUrl: e.target.value })}
                    placeholder="https://auth.myserver.com/oauth"
                  />
                </div>
                <div className="form-group">
                  <label>Socket URL (required for real-time features)</label>
                  <input
                    type="url"
                    value={newServer.socketUrl}
                    onChange={(e) => setNewServer({ ...newServer, socketUrl: e.target.value })}
                    placeholder="https://chat.myserver.com"
                  />
                </div>
                <div className="form-group">
                  <label>Client ID (optional, for OAuth)</label>
                  <input
                    type="text"
                    value={newServer.clientId}
                    onChange={(e) => setNewServer({ ...newServer, clientId: e.target.value })}
                    placeholder="app_xxx"
                  />
                </div>
                <div className="form-group">
                  <label>Website (optional)</label>
                  <input
                    type="url"
                    value={newServer.website}
                    onChange={(e) => setNewServer({ ...newServer, website: e.target.value })}
                    placeholder="https://myserver.com"
                  />
                </div>
              </>
            ) : null}
            <div className="form-actions">
              <button className="cancel-button" onClick={() => {
                setShowAddForm(false)
                resetForm()
              }}>
                Cancel
              </button>
              <button className="add-button" onClick={handleAddServer}>
                Add Server
              </button>
            </div>
          </div>
        ) : (
          <button className="add-server-button" onClick={() => {
            resetForm()
            setShowAddForm(true)
          }}>
            <PlusIcon size={18} />
            <span>Add Custom Server</span>
          </button>
        )}
      </div>
    </div>
  )
}

export default ServerSelector
