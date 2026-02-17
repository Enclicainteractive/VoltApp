import React, { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { 
  getMainServers, 
  addMainServer, 
  removeMainServer, 
  testServerConnection,
  storeServer 
} from '../services/serverConfig'
import { X, Plus, Server, Trash2, RefreshCw, Check, Loader } from 'lucide-react'
import './ServerSelector.css'

const ServerSelector = ({ onClose, embedded = false }) => {
  const { mainServers, currentMainServer, setMainServers, setCurrentMainServer } = useAppStore()
  const [showAddForm, setShowAddForm] = useState(false)
  const [testingId, setTestingId] = useState(null)
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

  const handleSelectServer = (server) => {
    setCurrentMainServer(server)
    if (!embedded) {
      window.location.reload()
    }
  }

  const handleTestServer = async (server) => {
    setTestingId(server.id)
    const result = await testServerConnection(server)
    setTestingId(null)
    return result
  }

  const handleAddServer = async () => {
    if (!newServer.id || !newServer.name || !newServer.host || !newServer.apiUrl || !newServer.socketUrl) {
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
    } catch (e) {
      console.error('Failed to add server:', e)
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
            <X size={20} />
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
                <Server size={20} />
              </div>
              <div className="server-info">
                <span className="server-name">{server.name}</span>
                <span className="server-url">{server.host}</span>
              </div>
              {currentMainServer?.id === server.id && (
                <div className="server-check">
                  <Check size={16} />
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
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>

        {showAddForm ? (
          <div className="add-server-form">
            <h3>Add New Server</h3>
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
            <div className="form-actions">
              <button className="cancel-button" onClick={() => setShowAddForm(false)}>
                Cancel
              </button>
              <button className="add-button" onClick={handleAddServer}>
                Add Server
              </button>
            </div>
          </div>
        ) : (
          <button className="add-server-button" onClick={() => setShowAddForm(true)}>
            <Plus size={18} />
            <span>Add Custom Server</span>
          </button>
        )}
      </div>
    </div>
  )
}

export default ServerSelector
