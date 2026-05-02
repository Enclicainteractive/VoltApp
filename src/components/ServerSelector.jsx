import React, { useEffect, useId, useRef, useState } from 'react'
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
  const hostInputRef = useRef(null)
  const idBase = useId()
  const hostFieldId = `${idBase}-host`
  const hostHintId = `${idBase}-host-hint`
  const discoveryErrorId = `${idBase}-discovery-error`
  const serverIdFieldId = `${idBase}-server-id`
  const serverNameFieldId = `${idBase}-server-name`
  const manualHostFieldId = `${idBase}-manual-host`
  const apiUrlFieldId = `${idBase}-api-url`
  const imageApiUrlFieldId = `${idBase}-image-api-url`
  const authUrlFieldId = `${idBase}-auth-url`
  const socketUrlFieldId = `${idBase}-socket-url`
  const clientIdFieldId = `${idBase}-client-id`
  const websiteFieldId = `${idBase}-website`
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

  useEffect(() => {
    if (embedded) return undefined

    const handleEscapeClose = (event) => {
      if (event.key === 'Escape') {
        onClose?.()
      }
    }

    document.addEventListener('keydown', handleEscapeClose)
    return () => {
      document.removeEventListener('keydown', handleEscapeClose)
    }
  }, [embedded, onClose])

  useEffect(() => {
    if (!showAddForm) return
    const focusFrame = requestAnimationFrame(() => {
      hostInputRef.current?.focus()
    })
    return () => cancelAnimationFrame(focusFrame)
  }, [showAddForm])

  const handleServerItemKeyDown = (event, server) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleSelectServer(server)
    }
  }

  const handleSelectServer = (server) => {
    setCurrentMainServer(server)
    if (!embedded) {
      window.location.reload()
    }
  }

  const handleDiscoverServer = async () => {
    const host = newServer.host.trim()
    if (!host) {
      setDiscoveryError('Enter a Volt server host, URL, or invite link first.')
      return
    }

    setDiscovering(true)
    setDiscoveryError('')
    try {
      const discovered = await discoverMainServer(host)
      setNewServer((prev) => ({
        ...prev,
        ...discovered,
        id: prev.id.trim() || discovered.id,
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
    const normalizedServer = {
      ...newServer,
      id: newServer.id.trim().toLowerCase().replace(/\s+/g, '-'),
      name: newServer.name.trim(),
      host: newServer.host.trim(),
      apiUrl: newServer.apiUrl.trim(),
      imageApiUrl: (newServer.imageApiUrl || newServer.apiUrl).trim(),
      authUrl: newServer.authUrl.trim(),
      socketUrl: newServer.socketUrl.trim(),
      clientId: newServer.clientId.trim(),
      website: newServer.website.trim()
    }

    if (!normalizedServer.id || !normalizedServer.name || !normalizedServer.host || !normalizedServer.apiUrl || !normalizedServer.socketUrl) {
      setDiscoveryError('Server details are incomplete. Discover the server or fill the fields manually.')
      return
    }

    try {
      const servers = addMainServer(normalizedServer)
      setMainServers(servers)
      setShowAddForm(false)
      resetForm()
    } catch (e) {
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
          <button type="button" className="close-button" onClick={onClose} aria-label="Close server selector">
            <XMarkIcon size={20} aria-hidden="true" />
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
              onKeyDown={(event) => handleServerItemKeyDown(event, server)}
              role="button"
              tabIndex={0}
              aria-pressed={currentMainServer?.id === server.id}
              aria-label={`Switch to server ${server.name}`}
            >
              <div className="server-icon">
                <ServerStackIcon size={20} aria-hidden="true" />
              </div>
              <div className="server-info">
                <span className="server-name">{server.name}</span>
                <span className="server-url">{server.host}</span>
              </div>
              {currentMainServer?.id === server.id && (
                <div className="server-check">
                  <CheckIcon size={16} aria-hidden="true" />
                </div>
              )}
              {mainServers.length > 1 && (
                <button 
                  type="button"
                  className="server-remove"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemoveServer(server.id)
                  }}
                  title="Remove server"
                  aria-label={`Remove server ${server.name}`}
                >
                  <TrashIcon size={14} aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
        </div>

        {showAddForm ? (
          <form
            className="add-server-form"
            onSubmit={(event) => {
              event.preventDefault()
              handleAddServer()
            }}
          >
            <h3>Add New Server</h3>
            <div className="form-group">
              <label htmlFor={hostFieldId}>Server Host, URL, or Invite</label>
              <div className="server-discovery-row">
                <input
                  id={hostFieldId}
                  ref={hostInputRef}
                  type="text"
                  value={newServer.host}
                  onChange={(e) => setNewServer({ ...newServer, host: e.target.value })}
                  placeholder="hellscape.org or https://hellscape.org/invite/ABC123"
                  aria-describedby={discoveryError ? `${hostHintId} ${discoveryErrorId}` : hostHintId}
                />
                <button
                  type="button"
                  className="discover-button"
                  onClick={handleDiscoverServer}
                  disabled={discovering}
                  aria-label={discovering ? 'Checking server details' : 'Auto fill server details'}
                >
                  {discovering ? 'Checking...' : 'Auto Fill'}
                </button>
              </div>
              <span id={hostHintId} className="field-hint">
                Volt will verify the server, fetch its config, and fill the rest automatically.
              </span>
              {discoveryError ? (
                <div id={discoveryErrorId} className="form-error" role="alert">
                  {discoveryError}
                </div>
              ) : null}
            </div>

            <div className="server-discovery-summary">
              <div className={`discovery-pill ${newServer.verified ? 'verified' : ''}`} aria-live="polite">
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
              <label htmlFor={serverIdFieldId}>Server ID (unique identifier)</label>
              <input
                id={serverIdFieldId}
                type="text"
                value={newServer.id}
                onChange={(e) => setNewServer({ ...newServer, id: e.target.value })}
                placeholder="my-server"
              />
            </div>
            <div className="form-group">
              <label htmlFor={serverNameFieldId}>Server Name</label>
              <input
                id={serverNameFieldId}
                type="text"
                value={newServer.name}
                onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
                placeholder="My Server"
              />
            </div>
            {manualMode ? (
              <>
                <div className="form-group">
                  <label htmlFor={manualHostFieldId}>Host (domain)</label>
                  <input
                    id={manualHostFieldId}
                    type="text"
                    value={newServer.host}
                    onChange={(e) => setNewServer({ ...newServer, host: e.target.value })}
                    placeholder="myserver.com"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor={apiUrlFieldId}>API URL</label>
                  <input
                    id={apiUrlFieldId}
                    type="url"
                    value={newServer.apiUrl}
                    onChange={(e) => setNewServer({ ...newServer, apiUrl: e.target.value })}
                    placeholder="https://api.myserver.com"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor={imageApiUrlFieldId}>Image API URL (optional, defaults to API URL)</label>
                  <input
                    id={imageApiUrlFieldId}
                    type="url"
                    value={newServer.imageApiUrl}
                    onChange={(e) => setNewServer({ ...newServer, imageApiUrl: e.target.value })}
                    placeholder="https://api.myserver.com"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor={authUrlFieldId}>Auth URL (optional)</label>
                  <input
                    id={authUrlFieldId}
                    type="url"
                    value={newServer.authUrl}
                    onChange={(e) => setNewServer({ ...newServer, authUrl: e.target.value })}
                    placeholder="https://auth.myserver.com/oauth"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor={socketUrlFieldId}>Socket URL (required for real-time features)</label>
                  <input
                    id={socketUrlFieldId}
                    type="url"
                    value={newServer.socketUrl}
                    onChange={(e) => setNewServer({ ...newServer, socketUrl: e.target.value })}
                    placeholder="https://chat.myserver.com"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor={clientIdFieldId}>Client ID (optional, for OAuth)</label>
                  <input
                    id={clientIdFieldId}
                    type="text"
                    value={newServer.clientId}
                    onChange={(e) => setNewServer({ ...newServer, clientId: e.target.value })}
                    placeholder="app_xxx"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor={websiteFieldId}>Website (optional)</label>
                  <input
                    id={websiteFieldId}
                    type="url"
                    value={newServer.website}
                    onChange={(e) => setNewServer({ ...newServer, website: e.target.value })}
                    placeholder="https://myserver.com"
                  />
                </div>
              </>
            ) : null}
            <div className="form-actions">
              <button type="button" className="cancel-button" onClick={() => {
                setShowAddForm(false)
                resetForm()
              }}>
                Cancel
              </button>
              <button type="submit" className="add-button">
                Add Server
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="add-server-button" onClick={() => {
            resetForm()
            setShowAddForm(true)
          }}>
            <PlusIcon size={18} aria-hidden="true" />
            <span>Add Custom Server</span>
          </button>
        )}
      </div>
    </div>
  )
}

export default ServerSelector
