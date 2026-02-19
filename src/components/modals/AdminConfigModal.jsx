import React, { useState, useEffect, useCallback, useRef } from 'react'
import { X, Save, RotateCcw, Server, Shield, Globe, Database, Lock, Bell, Zap, Settings, Code, Eye, EyeOff, AlertTriangle, Check, Download, Upload, RefreshCw, ArrowRight, Loader } from 'lucide-react'
import { apiService } from '../../services/apiService'
import './Modal.css'
import './AdminConfigModal.css'

const STORAGE_TYPES = [
  { id: 'json', name: 'JSON Files', desc: 'Simple file-based storage, no setup required' },
  { id: 'sqlite', name: 'SQLite', desc: 'Lightweight file-based SQL database' },
  { id: 'mysql', name: 'MySQL', desc: 'Popular open-source relational database' },
  { id: 'mariadb', name: 'MariaDB', desc: 'MySQL-compatible enhanced database' },
  { id: 'postgres', name: 'PostgreSQL', desc: 'Advanced open-source relational database' },
  { id: 'cockroachdb', name: 'CockroachDB', desc: 'Distributed SQL database for global apps' },
  { id: 'mssql', name: 'SQL Server', desc: 'Microsoft enterprise database' },
  { id: 'mongodb', name: 'MongoDB', desc: 'Flexible document database' },
  { id: 'redis', name: 'Redis', desc: 'In-memory data store (cache layer)' }
]

const AdminConfigModal = ({ onClose }) => {
  const [config, setConfig] = useState(null)
  const [rawConfig, setRawConfig] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [activeTab, setActiveTab] = useState('server')
  const [viewMode, setViewMode] = useState('gui')
  const [jsonError, setJsonError] = useState(null)
  const [showSecrets, setShowSecrets] = useState({})
  const [validation, setValidation] = useState(null)
  
  const jsonEditorRef = useRef(null)
  const jsonHighlightRef = useRef(null)

  const highlightJson = useCallback((json) => {
    return json
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/("(?:\\.|[^"\\])*")\s*:/g, '<span class="json-key">$1</span>:')
      .replace(/:\s*("(?:\\.|[^"\\])*")/g, ': <span class="json-string">$1</span>')
      .replace(/:\s*(\d+\.?\d*)/g, ': <span class="json-number">$1</span>')
      .replace(/:\s*(true|false)/g, ': <span class="json-boolean">$1</span>')
      .replace(/:\s*(null)/g, ': <span class="json-null">$1</span>')
  }, [])

  const syncScroll = useCallback(() => {
    if (jsonEditorRef.current && jsonHighlightRef.current) {
      jsonHighlightRef.current.scrollTop = jsonEditorRef.current.scrollTop
      jsonHighlightRef.current.scrollLeft = jsonEditorRef.current.scrollLeft
    }
  }, [])

  // Migration state
  const [migrationState, setMigrationState] = useState({
    currentType: null,
    availableTypes: [],
    dependencies: {},
    selectedType: null,
    targetConfig: {},
    testing: false,
    testingResult: null,
    migrating: false,
    migrationResult: null,
    showConfigForm: false
  })

  useEffect(() => {
    loadConfig()
    loadMigrationInfo()
  }, [])

  const loadMigrationInfo = async () => {
    try {
      const [storageInfo, typesRes, depsRes] = await Promise.all([
        apiService.getStorageInfo(),
        apiService.getStorageTypes(),
        apiService.checkDependencies()
      ])
      
      setMigrationState(prev => ({
        ...prev,
        currentType: storageInfo.data.current?.type || 'json',
        availableTypes: typesRes.data.types || STORAGE_TYPES,
        dependencies: depsRes.data.dependencies || {}
      }))
    } catch (err) {
      console.error('Failed to load migration info:', err)
    }
  }

  const handleSelectStorageType = (typeId) => {
    setMigrationState(prev => ({
      ...prev,
      selectedType: typeId,
      targetConfig: {},
      testingResult: null,
      showConfigForm: typeId !== prev.currentType
    }))
  }

  const handleConfigChange = (field, value) => {
    setMigrationState(prev => ({
      ...prev,
      targetConfig: { ...prev.targetConfig, [field]: value }
    }))
  }

  const handleTestConnection = async () => {
    setMigrationState(prev => ({ ...prev, testing: true, testingResult: null }))
    try {
      const res = await apiService.testConnection(migrationState.selectedType, migrationState.targetConfig)
      setMigrationState(prev => ({
        ...prev,
        testing: false,
        testingResult: res.data
      }))
    } catch (err) {
      setMigrationState(prev => ({
        ...prev,
        testing: false,
        testingResult: { success: false, error: err.message }
      }))
    }
  }

  const handleMigrate = async () => {
    if (!window.confirm(`Migrate from ${migrationState.currentType} to ${migrationState.selectedType}? A backup will be created.`)) return
    
    setMigrationState(prev => ({ ...prev, migrating: true, migrationResult: null }))
    try {
      const res = await apiService.migrateStorage(migrationState.selectedType, migrationState.targetConfig, true)
      setMigrationState(prev => ({
        ...prev,
        migrating: false,
        migrationResult: res.data
      }))
      if (res.data.success) {
        setMessage({ type: 'success', text: 'Migration prepared! Server restart required to complete.' })
      }
    } catch (err) {
      setMigrationState(prev => ({
        ...prev,
        migrating: false,
        migrationResult: { success: false, error: err.message }
      }))
    }
  }

  const getDefaultConfigFields = (typeId) => {
    switch (typeId) {
      case 'json':
        return [
          { name: 'dataDir', label: 'Data Directory', type: 'text', default: './data' }
        ]
      case 'sqlite':
        return [
          { name: 'dbPath', label: 'Database Path', type: 'text', default: './data/voltage.db' }
        ]
      case 'mysql':
      case 'mariadb':
        return [
          { name: 'host', label: 'Host', type: 'text', default: 'localhost' },
          { name: 'port', label: 'Port', type: 'number', default: 3306 },
          { name: 'database', label: 'Database', type: 'text', default: 'voltchat' },
          { name: 'user', label: 'Username', type: 'text', default: 'root' },
          { name: 'password', label: 'Password', type: 'password', default: '' },
          { name: 'connectionLimit', label: 'Connection Limit', type: 'number', default: 10 },
          { name: 'charset', label: 'Charset', type: 'text', default: 'utf8mb4' }
        ]
      case 'postgres':
      case 'cockroachdb':
        return [
          { name: 'host', label: 'Host', type: 'text', default: 'localhost' },
          { name: 'port', label: 'Port', type: 'number', default: typeId === 'cockroachdb' ? 26257 : 5432 },
          { name: 'database', label: 'Database', type: 'text', default: 'voltchat' },
          { name: 'user', label: 'Username', type: 'text', default: 'postgres' },
          { name: 'password', label: 'Password', type: 'password', default: '' },
          { name: 'ssl', label: 'Use SSL', type: 'checkbox', default: typeId === 'cockroachdb' }
        ]
      case 'mssql':
        return [
          { name: 'host', label: 'Host', type: 'text', default: 'localhost' },
          { name: 'port', label: 'Port', type: 'number', default: 1433 },
          { name: 'database', label: 'Database', type: 'text', default: 'voltchat' },
          { name: 'user', label: 'Username', type: 'text', default: 'sa' },
          { name: 'password', label: 'Password', type: 'password', default: '' },
          { name: 'encrypt', label: 'Encrypt', type: 'checkbox', default: false },
          { name: 'trustServerCertificate', label: 'Trust Server Certificate', type: 'checkbox', default: true }
        ]
      case 'mongodb':
        return [
          { name: 'host', label: 'Host', type: 'text', default: 'localhost' },
          { name: 'port', label: 'Port', type: 'number', default: 27017 },
          { name: 'database', label: 'Database', type: 'text', default: 'voltchat' },
          { name: 'user', label: 'Username', type: 'text', default: '' },
          { name: 'password', label: 'Password', type: 'password', default: '' },
          { name: 'authSource', label: 'Auth Source', type: 'text', default: 'admin' }
        ]
      case 'redis':
        return [
          { name: 'host', label: 'Host', type: 'text', default: 'localhost' },
          { name: 'port', label: 'Port', type: 'number', default: 6379 },
          { name: 'password', label: 'Password', type: 'password', default: '' },
          { name: 'db', label: 'Database Number', type: 'number', default: 0 },
          { name: 'keyPrefix', label: 'Key Prefix', type: 'text', default: 'voltchat:' }
        ]
      default:
        return []
    }
  }

  const loadConfig = async () => {
    try {
      const res = await apiService.getAdminConfig()
      setConfig(res.data)
      setRawConfig(JSON.stringify(res.data, null, 2))
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to load config. Owner access required.' })
    }
    setLoading(false)
  }

  const loadRawConfig = async () => {
    try {
      const res = await apiService.getAdminConfigRaw()
      setRawConfig(JSON.stringify(res.data, null, 2))
    } catch (err) {
      console.error('Failed to load raw config:', err)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      if (viewMode === 'json') {
        const res = await apiService.updateAdminConfigRaw(JSON.parse(rawConfig))
        setMessage({ type: 'success', text: res.data.message || 'Config saved!' })
      } else {
        const res = await apiService.updateAdminConfig(config)
        setMessage({ type: 'success', text: res.data.message || 'Config saved!' })
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Failed to save config'
      setMessage({ type: 'error', text: errorMsg })
    }
    setSaving(false)
  }

  const handleReset = async () => {
    if (!window.confirm('Reset config to defaults? This cannot be undone.')) return
    try {
      await apiService.resetAdminConfig()
      setMessage({ type: 'success', text: 'Config reset to defaults' })
      loadConfig()
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to reset config' })
    }
  }

  const handleImport = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = e.target.files[0]
      if (!file) return
      
      try {
        const text = await file.text()
        const json = JSON.parse(text)
        const res = await apiService.importAdminConfig(json)
        setMessage({ type: 'success', text: res.data.message || 'Config imported!' })
        loadConfig()
      } catch (err) {
        setMessage({ type: 'error', text: 'Failed to import: ' + (err.message || err.response?.data?.error) })
      }
    }
    input.click()
  }

  const handleExport = () => {
    const blob = new Blob([rawConfig], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'voltage-config.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleValidate = async () => {
    try {
      const data = viewMode === 'json' ? JSON.parse(rawConfig) : config
      const res = await apiService.validateAdminConfig(data)
      setValidation(res.data)
    } catch (err) {
      setValidation({ valid: false, errors: [err.message], warnings: [] })
    }
  }

  const handleJsonChange = (e) => {
    setRawConfig(e.target.value)
    try {
      JSON.parse(e.target.value)
      setJsonError(null)
    } catch (err) {
      setJsonError(err.message)
    }
  }

  const updateConfig = (section, field, value) => {
    setConfig(prev => {
      const sectionData = prev[section] || {}
      if (typeof field === 'object' && !Array.isArray(field)) {
        return {
          ...prev,
          [section]: {
            ...sectionData,
            ...field
          }
        }
      }
      return {
        ...prev,
        [section]: {
          ...sectionData,
          [field]: value
        }
      }
    })
  }

  const updateNestedConfig = (section, subsection, field, value) => {
    setConfig(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [subsection]: {
          ...prev[section]?.[subsection],
          [field]: value
        }
      }
    }))
  }

  const updateFeature = (feature, value) => {
    setConfig(prev => ({
      ...prev,
      features: {
        ...prev.features,
        [feature]: value
      }
    }))
  }

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-container" onClick={e => e.stopPropagation()}>
          <div className="modal-loading">Loading config...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container admin-config-modal large" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2><Settings size={20} /> Server Configuration</h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="admin-config-toolbar">
          <div className="view-toggle">
            <button className={viewMode === 'gui' ? 'active' : ''} onClick={() => setViewMode('gui')}>
              <Zap size={14} /> GUI
            </button>
            <button className={viewMode === 'json' ? 'active' : ''} onClick={() => { setViewMode('json'); loadRawConfig(); }}>
              <Code size={14} /> JSON
            </button>
          </div>
          <div className="toolbar-actions">
            <button className="toolbar-btn" onClick={handleValidate} title="Validate">
              <Check size={14} /> Validate
            </button>
            <button className="toolbar-btn" onClick={handleImport} title="Import">
              <Upload size={14} /> Import
            </button>
            <button className="toolbar-btn" onClick={handleExport} title="Export">
              <Download size={14} /> Export
            </button>
          </div>
        </div>

        {validation && (
          <div className={`validation-box ${validation.valid ? 'valid' : 'invalid'}`}>
            {validation.errors?.length > 0 && (
              <div className="validation-errors">
                {validation.errors.map((err, i) => (
                  <div key={i} className="validation-error"><AlertTriangle size={14} /> {err}</div>
                ))}
              </div>
            )}
            {validation.warnings?.length > 0 && (
              <div className="validation-warnings">
                {validation.warnings.map((warn, i) => (
                  <div key={i} className="validation-warning"><AlertTriangle size={14} /> {warn}</div>
                ))}
              </div>
            )}
            {validation.valid && !validation.warnings?.length && (
              <div className="validation-success"><Check size={14} /> Config is valid!</div>
            )}
          </div>
        )}

        {message && (
          <div className={`config-message ${message.type}`}>{message.text}</div>
        )}

        {viewMode === 'gui' ? (
          <div className="admin-config-body">
            <div className="admin-config-sidebar">
              {[
                { id: 'server', label: 'Server', icon: Server },
                { id: 'auth', label: 'Auth', icon: Shield },
                { id: 'security', label: 'Security', icon: Lock },
                { id: 'features', label: 'Features', icon: Zap },
                { id: 'limits', label: 'Limits', icon: Globe },
                { id: 'storage', label: 'Storage', icon: Database },
                { id: 'cdn', label: 'CDN', icon: Globe },
                { id: 'federation', label: 'Federation', icon: Globe },
                { id: 'advanced', label: 'Advanced', icon: Settings },
                { id: 'migration', label: 'Migration', icon: RefreshCw },
              ].map(tab => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    className={`config-nav-btn ${activeTab === tab.id ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <Icon size={16} />
                    <span>{tab.label}</span>
                  </button>
                )
              })}
            </div>

            <div className="admin-config-content">
              {activeTab === 'server' && config?.server && (
                <div className="config-section">
                  <h2 className="config-section-title">Server</h2>
                  <p className="config-section-desc">Core server identity and network settings.</p>
                  <div className="config-group">
                    <h3>Basic Settings</h3>
                    <div className="config-field">
                      <label>Server Name</label>
                      <input type="text" value={config.server.name || ''} onChange={(e) => updateConfig('server', 'name', e.target.value)} />
                    </div>
                    <div className="config-field">
                      <label>Server URL (Public)</label>
                      <input type="text" value={config.server.url || ''} onChange={(e) => updateConfig('server', 'url', e.target.value)} placeholder="https://your-server.com" />
                    </div>
                    <div className="config-field">
                      <label>Image Server URL (for avatars)</label>
                      <input type="text" value={config.server.imageServerUrl || ''} onChange={(e) => updateConfig('server', 'imageServerUrl', e.target.value)} placeholder="https://api.your-server.com" />
                    </div>
                    <div className="config-field">
                      <label>Port</label>
                      <input type="number" value={config.server.port || 5000} onChange={(e) => updateConfig('server', 'port', parseInt(e.target.value))} />
                    </div>
                    <div className="config-field">
                      <label>Mode</label>
                      <select value={config.server.mode || 'mainline'} onChange={(e) => updateConfig('server', 'mode', e.target.value)}>
                        <option value="mainline">Mainline</option>
                        <option value="self-volt">Self-Volt</option>
                        <option value="federated">Federated</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'auth' && config?.auth && (
                <div className="config-section">
                  <h2 className="config-section-title">Authentication</h2>
                  <p className="config-section-desc">Configure how users sign in and register.</p>
                  <div className="config-group">
                    <h3>Authentication Type</h3>
                    <div className="config-field">
                      <label>Auth Type</label>
                      <select value={config.auth.type || 'all'} onChange={(e) => updateConfig('auth', 'type', e.target.value)}>
                        <option value="all">All (Local + OAuth)</option>
                        <option value="local">Local Only</option>
                        <option value="oauth">OAuth Only</option>
                      </select>
                    </div>
                  </div>
                  
                  {config.auth.local && (
                    <div className="config-group">
                      <h3>Local Authentication</h3>
                      <div className="config-field checkbox">
                        <label><input type="checkbox" checked={config.auth.local.enabled || false} onChange={(e) => updateConfig('auth', 'local', { ...config.auth.local, enabled: e.target.checked })} /> Enable Local Auth</label>
                      </div>
                      <div className="config-field checkbox">
                        <label><input type="checkbox" checked={config.auth.local.allowRegistration || false} onChange={(e) => updateConfig('auth', 'local', { ...config.auth.local, allowRegistration: e.target.checked })} /> Allow Registration</label>
                      </div>
                      <div className="config-field">
                        <label>Min Password Length</label>
                        <input type="number" value={config.auth.local.minPasswordLength || 8} onChange={(e) => updateConfig('auth', 'local', { ...config.auth.local, minPasswordLength: parseInt(e.target.value) })} min={4} max={128} />
                      </div>
                    </div>
                  )}
                  
                  {config.auth.oauth && (
                    <div className="config-group">
                      <h3>OAuth Settings</h3>
                      <div className="config-field checkbox">
                        <label><input type="checkbox" checked={config.auth.oauth.enabled || false} onChange={(e) => updateConfig('auth', 'oauth', { ...config.auth.oauth, enabled: e.target.checked })} /> Enable OAuth</label>
                      </div>
                      <div className="config-field">
                        <label>OAuth Provider</label>
                        <select value={config.auth.oauth.provider || 'enclica'} onChange={(e) => updateConfig('auth', 'oauth', { ...config.auth.oauth, provider: e.target.value })}>
                          <option value="enclica">Enclica</option>
                          <option value="discord">Discord</option>
                          <option value="google">Google</option>
                        </select>
                      </div>
                      {config.auth.oauth.enclica && (
                        <>
                          <div className="config-field">
                            <label>Enclica Client ID</label>
                            <input type="text" value={config.auth.oauth.enclica.clientId || ''} disabled placeholder="(set in config file)" />
                          </div>
                          <div className="config-field">
                            <label>Auth URL</label>
                            <input type="text" value={config.auth.oauth.enclica.authUrl || ''} onChange={(e) => updateConfig('auth', 'oauth', { ...config.auth.oauth, enclica: { ...config.auth.oauth.enclica, authUrl: e.target.value } })} />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'security' && config?.security && (
                <div className="config-section">
                  <h2 className="config-section-title">Security</h2>
                  <p className="config-section-desc">JWT tokens, encryption, and rate limiting.</p>
                  <div className="config-group">
                    <h3>JWT Settings</h3>
                    <div className="config-field">
                      <label>JWT Expiry</label>
                      <select value={config.security.jwtExpiry || '7d'} onChange={(e) => updateConfig('security', 'jwtExpiry', e.target.value)}>
                        <option value="1h">1 Hour</option>
                        <option value="6h">6 Hours</option>
                        <option value="12h">12 Hours</option>
                        <option value="1d">1 Day</option>
                        <option value="7d">7 Days</option>
                        <option value="30d">30 Days</option>
                      </select>
                    </div>
                    <div className="config-field">
                      <label>Bcrypt Rounds (higher = more secure but slower)</label>
                      <input type="number" value={config.security.bcryptRounds || 12} onChange={(e) => updateConfig('security', 'bcryptRounds', parseInt(e.target.value))} min={8} max={15} />
                    </div>
                  </div>
                  
                  <div className="config-group">
                    <h3>Rate Limiting</h3>
                    <div className="config-field">
                      <label>Window (ms)</label>
                      <select value={config.security.rateLimit?.windowMs || 60000} onChange={(e) => updateConfig('security', 'rateLimit', { ...config.security.rateLimit, windowMs: parseInt(e.target.value) })}>
                        <option value={60000}>1 minute</option>
                        <option value={120000}>2 minutes</option>
                        <option value={300000}>5 minutes</option>
                      </select>
                    </div>
                    <div className="config-field">
                      <label>Max Requests per Window</label>
                      <input type="number" value={config.security.rateLimit?.maxRequests || 100} onChange={(e) => updateConfig('security', 'rateLimit', { ...config.security.rateLimit, maxRequests: parseInt(e.target.value) })} />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'features' && config?.features && (
                <div className="config-section">
                  <h2 className="config-section-title">Features</h2>
                  <p className="config-section-desc">Enable or disable platform capabilities.</p>
                  <div className="config-group">
                    <h3>Core Features</h3>
                    <div className="config-field checkbox">
                      <label><input type="checkbox" checked={config.features.discovery || false} onChange={(e) => updateFeature('discovery', e.target.checked)} /> Server Discovery</label>
                    </div>
                    <div className="config-field checkbox">
                      <label><input type="checkbox" checked={config.features.selfVolt || false} onChange={(e) => updateFeature('selfVolt', e.target.checked)} /> Self-Volt Servers</label>
                    </div>
                    <div className="config-field checkbox">
                      <label><input type="checkbox" checked={config.features.voiceChannels || false} onChange={(e) => updateFeature('voiceChannels', e.target.checked)} /> Voice Channels</label>
                    </div>
                    <div className="config-field checkbox">
                      <label><input type="checkbox" checked={config.features.videoChannels || false} onChange={(e) => updateFeature('videoChannels', e.target.checked)} /> Video Channels</label>
                    </div>
                    <div className="config-field checkbox">
                      <label><input type="checkbox" checked={config.features.e2eEncryption || false} onChange={(e) => updateFeature('e2eEncryption', e.target.checked)} /> E2E Encryption</label>
                    </div>
                    <div className="config-field checkbox">
                      <label><input type="checkbox" checked={config.features.communities || false} onChange={(e) => updateFeature('communities', e.target.checked)} /> Communities</label>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'limits' && config?.limits && (
                <div className="config-section">
                  <h2 className="config-section-title">Limits</h2>
                  <p className="config-section-desc">Resource quotas and usage caps.</p>
                  <div className="config-group">
                    <h3>Resource Limits</h3>
                    <div className="config-field">
                      <label>Max Upload Size (bytes)</label>
                      <input type="number" value={config.limits.maxUploadSize || 10485760} onChange={(e) => updateConfig('limits', 'maxUploadSize', parseInt(e.target.value))} />
                      <small>Current: {((config.limits.maxUploadSize || 10485760) / 1048576).toFixed(1)} MB</small>
                    </div>
                    <div className="config-field">
                      <label>Max Servers Per User</label>
                      <input type="number" value={config.limits.maxServersPerUser || 100} onChange={(e) => updateConfig('limits', 'maxServersPerUser', parseInt(e.target.value))} />
                    </div>
                    <div className="config-field">
                      <label>Max Message Length</label>
                      <input type="number" value={config.limits.maxMessageLength || 4000} onChange={(e) => updateConfig('limits', 'maxMessageLength', parseInt(e.target.value))} />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'storage' && config?.storage && (
                <div className="config-section">
                  <h2 className="config-section-title">Storage</h2>
                  <p className="config-section-desc">Database engine and file storage settings.</p>
                  <div className="config-group">
                    <h3>Storage Type</h3>
                    <div className="config-field">
                      <label>Database Type</label>
                      <select value={config.storage.type || 'sqlite'} onChange={(e) => updateConfig('storage', 'type', e.target.value)}>
                        <option value="json">JSON Files</option>
                        <option value="sqlite">SQLite</option>
                        <option value="mysql">MySQL</option>
                        <option value="mariadb">MariaDB</option>
                        <option value="postgres">PostgreSQL</option>
                        <option value="cockroachdb">CockroachDB</option>
                        <option value="mssql">SQL Server</option>
                        <option value="mongodb">MongoDB</option>
                        <option value="redis">Redis</option>
                      </select>
                    </div>
                    
                    {config.storage.json && (
                      <div className="config-field">
                        <label>Data Directory</label>
                        <input type="text" value={config.storage.json.dataDir || ''} onChange={(e) => updateConfig('storage', 'json', { ...config.storage.json, dataDir: e.target.value })} />
                      </div>
                    )}
                    
                    {config.storage.sqlite && (
                      <div className="config-field">
                        <label>Database Path</label>
                        <input type="text" value={config.storage.sqlite.dbPath || ''} onChange={(e) => updateConfig('storage', 'sqlite', { ...config.storage.sqlite, dbPath: e.target.value })} />
                      </div>
                    )}
                    
                    {(config.storage.mysql || config.storage.type === 'mysql') && (
                      <>
                        <div className="config-field">
                          <label>MySQL Host</label>
                          <input type="text" value={config.storage.mysql?.host || ''} onChange={(e) => updateConfig('storage', 'mysql', { ...config.storage.mysql, host: e.target.value })} placeholder="localhost" />
                        </div>
                        <div className="config-field">
                          <label>MySQL Port</label>
                          <input type="number" value={config.storage.mysql?.port || 3306} onChange={(e) => updateConfig('storage', 'mysql', { ...config.storage.mysql, port: parseInt(e.target.value) })} />
                        </div>
                        <div className="config-field">
                          <label>MySQL Database</label>
                          <input type="text" value={config.storage.mysql?.database || ''} onChange={(e) => updateConfig('storage', 'mysql', { ...config.storage.mysql, database: e.target.value })} placeholder="voltchat" />
                        </div>
                        <div className="config-field">
                          <label>MySQL Username</label>
                          <input type="text" value={config.storage.mysql?.user || ''} onChange={(e) => updateConfig('storage', 'mysql', { ...config.storage.mysql, user: e.target.value })} placeholder="root" />
                        </div>
                        <div className="config-field">
                          <label>MySQL Password</label>
                          <input type="password" value={config.storage.mysql?.password || ''} onChange={(e) => updateConfig('storage', 'mysql', { ...config.storage.mysql, password: e.target.value })} placeholder="Enter password" />
                        </div>
                      </>
                    )}
                    
                    {(config.storage.mariadb || config.storage.type === 'mariadb') && (
                      <>
                        <div className="config-field">
                          <label>MariaDB Host</label>
                          <input type="text" value={config.storage.mariadb?.host || ''} onChange={(e) => updateConfig('storage', 'mariadb', { ...config.storage.mariadb, host: e.target.value })} placeholder="localhost" />
                        </div>
                        <div className="config-field">
                          <label>MariaDB Port</label>
                          <input type="number" value={config.storage.mariadb?.port || 3306} onChange={(e) => updateConfig('storage', 'mariadb', { ...config.storage.mariadb, port: parseInt(e.target.value) })} />
                        </div>
                        <div className="config-field">
                          <label>MariaDB Database</label>
                          <input type="text" value={config.storage.mariadb?.database || ''} onChange={(e) => updateConfig('storage', 'mariadb', { ...config.storage.mariadb, database: e.target.value })} placeholder="voltchat" />
                        </div>
                        <div className="config-field">
                          <label>MariaDB Username</label>
                          <input type="text" value={config.storage.mariadb?.user || ''} onChange={(e) => updateConfig('storage', 'mariadb', { ...config.storage.mariadb, user: e.target.value })} placeholder="root" />
                        </div>
                        <div className="config-field">
                          <label>MariaDB Password</label>
                          <input type="password" value={config.storage.mariadb?.password || ''} onChange={(e) => updateConfig('storage', 'mariadb', { ...config.storage.mariadb, password: e.target.value })} placeholder="Enter password" />
                        </div>
                      </>
                    )}
                    
                    {(config.storage.postgres || config.storage.type === 'postgres') && (
                      <>
                        <div className="config-field">
                          <label>PostgreSQL Host</label>
                          <input type="text" value={config.storage.postgres?.host || ''} onChange={(e) => updateConfig('storage', 'postgres', { ...config.storage.postgres, host: e.target.value })} placeholder="localhost" />
                        </div>
                        <div className="config-field">
                          <label>PostgreSQL Port</label>
                          <input type="number" value={config.storage.postgres?.port || 5432} onChange={(e) => updateConfig('storage', 'postgres', { ...config.storage.postgres, port: parseInt(e.target.value) })} />
                        </div>
                        <div className="config-field">
                          <label>PostgreSQL Database</label>
                          <input type="text" value={config.storage.postgres?.database || ''} onChange={(e) => updateConfig('storage', 'postgres', { ...config.storage.postgres, database: e.target.value })} placeholder="voltchat" />
                        </div>
                        <div className="config-field">
                          <label>PostgreSQL Username</label>
                          <input type="text" value={config.storage.postgres?.user || ''} onChange={(e) => updateConfig('storage', 'postgres', { ...config.storage.postgres, user: e.target.value })} placeholder="postgres" />
                        </div>
                        <div className="config-field">
                          <label>PostgreSQL Password</label>
                          <input type="password" value={config.storage.postgres?.password || ''} onChange={(e) => updateConfig('storage', 'postgres', { ...config.storage.postgres, password: e.target.value })} placeholder="Enter password" />
                        </div>
                      </>
                    )}
                    
                    {(config.storage.cockroachdb || config.storage.type === 'cockroachdb') && (
                      <>
                        <div className="config-field">
                          <label>CockroachDB Host</label>
                          <input type="text" value={config.storage.cockroachdb?.host || ''} onChange={(e) => updateConfig('storage', 'cockroachdb', { ...config.storage.cockroachdb, host: e.target.value })} placeholder="localhost" />
                        </div>
                        <div className="config-field">
                          <label>CockroachDB Port</label>
                          <input type="number" value={config.storage.cockroachdb?.port || 26257} onChange={(e) => updateConfig('storage', 'cockroachdb', { ...config.storage.cockroachdb, port: parseInt(e.target.value) })} />
                        </div>
                        <div className="config-field">
                          <label>CockroachDB Database</label>
                          <input type="text" value={config.storage.cockroachdb?.database || ''} onChange={(e) => updateConfig('storage', 'cockroachdb', { ...config.storage.cockroachdb, database: e.target.value })} placeholder="voltchat" />
                        </div>
                        <div className="config-field">
                          <label>CockroachDB Username</label>
                          <input type="text" value={config.storage.cockroachdb?.user || ''} onChange={(e) => updateConfig('storage', 'cockroachdb', { ...config.storage.cockroachdb, user: e.target.value })} placeholder="root" />
                        </div>
                        <div className="config-field">
                          <label>CockroachDB Password</label>
                          <input type="password" value={config.storage.cockroachdb?.password || ''} onChange={(e) => updateConfig('storage', 'cockroachdb', { ...config.storage.cockroachdb, password: e.target.value })} placeholder="Enter password" />
                        </div>
                      </>
                    )}
                    
                    {(config.storage.mssql || config.storage.type === 'mssql') && (
                      <>
                        <div className="config-field">
                          <label>SQL Server Host</label>
                          <input type="text" value={config.storage.mssql?.host || ''} onChange={(e) => updateConfig('storage', 'mssql', { ...config.storage.mssql, host: e.target.value })} placeholder="localhost" />
                        </div>
                        <div className="config-field">
                          <label>SQL Server Port</label>
                          <input type="number" value={config.storage.mssql?.port || 1433} onChange={(e) => updateConfig('storage', 'mssql', { ...config.storage.mssql, port: parseInt(e.target.value) })} />
                        </div>
                        <div className="config-field">
                          <label>SQL Server Database</label>
                          <input type="text" value={config.storage.mssql?.database || ''} onChange={(e) => updateConfig('storage', 'mssql', { ...config.storage.mssql, database: e.target.value })} placeholder="voltchat" />
                        </div>
                        <div className="config-field">
                          <label>SQL Server Username</label>
                          <input type="text" value={config.storage.mssql?.user || ''} onChange={(e) => updateConfig('storage', 'mssql', { ...config.storage.mssql, user: e.target.value })} placeholder="sa" />
                        </div>
                        <div className="config-field">
                          <label>SQL Server Password</label>
                          <input type="password" value={config.storage.mssql?.password || ''} onChange={(e) => updateConfig('storage', 'mssql', { ...config.storage.mssql, password: e.target.value })} placeholder="Enter password" />
                        </div>
                      </>
                    )}
                    
                    {(config.storage.mongodb || config.storage.type === 'mongodb') && (
                      <>
                        <div className="config-field">
                          <label>MongoDB Host</label>
                          <input type="text" value={config.storage.mongodb?.host || ''} onChange={(e) => updateConfig('storage', 'mongodb', { ...config.storage.mongodb, host: e.target.value })} placeholder="localhost" />
                        </div>
                        <div className="config-field">
                          <label>MongoDB Port</label>
                          <input type="number" value={config.storage.mongodb?.port || 27017} onChange={(e) => updateConfig('storage', 'mongodb', { ...config.storage.mongodb, port: parseInt(e.target.value) })} />
                        </div>
                        <div className="config-field">
                          <label>MongoDB Database</label>
                          <input type="text" value={config.storage.mongodb?.database || ''} onChange={(e) => updateConfig('storage', 'mongodb', { ...config.storage.mongodb, database: e.target.value })} placeholder="voltchat" />
                        </div>
                        <div className="config-field">
                          <label>MongoDB Username</label>
                          <input type="text" value={config.storage.mongodb?.user || ''} onChange={(e) => updateConfig('storage', 'mongodb', { ...config.storage.mongodb, user: e.target.value })} placeholder="Enter username" />
                        </div>
                        <div className="config-field">
                          <label>MongoDB Password</label>
                          <input type="password" value={config.storage.mongodb?.password || ''} onChange={(e) => updateConfig('storage', 'mongodb', { ...config.storage.mongodb, password: e.target.value })} placeholder="Enter password" />
                        </div>
                      </>
                    )}
                    
                    {(config.storage.redis || config.storage.type === 'redis') && (
                      <>
                        <div className="config-field">
                          <label>Redis Host</label>
                          <input type="text" value={config.storage.redis?.host || ''} onChange={(e) => updateConfig('storage', 'redis', { ...config.storage.redis, host: e.target.value })} placeholder="localhost" />
                        </div>
                        <div className="config-field">
                          <label>Redis Port</label>
                          <input type="number" value={config.storage.redis?.port || 6379} onChange={(e) => updateConfig('storage', 'redis', { ...config.storage.redis, port: parseInt(e.target.value) })} />
                        </div>
                        <div className="config-field">
                          <label>Redis Password (optional)</label>
                          <input type="password" value={config.storage.redis?.password || ''} onChange={(e) => updateConfig('storage', 'redis', { ...config.storage.redis, password: e.target.value })} placeholder="Enter password" />
                        </div>
                        <div className="config-field">
                          <label>Redis Database Number</label>
                          <input type="number" value={config.storage.redis?.db || 0} onChange={(e) => updateConfig('storage', 'redis', { ...config.storage.redis, db: parseInt(e.target.value) })} min={0} max={15} />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'cdn' && config?.cdn !== undefined && (
                <div className="config-section">
                  <h2 className="config-section-title">CDN</h2>
                  <p className="config-section-desc">Content delivery and file hosting provider.</p>
                  <div className="config-group">
                    <h3>CDN Settings</h3>
                    <div className="config-field checkbox">
                      <label><input type="checkbox" checked={config.cdn?.enabled || false} onChange={(e) => updateConfig('cdn', 'enabled', e.target.checked)} /> Enable CDN</label>
                    </div>
                    <div className="config-field">
                      <label>CDN Provider</label>
                      <select value={config.cdn?.provider || 'local'} onChange={(e) => updateConfig('cdn', 'provider', e.target.value)}>
                        <option value="local">Local Storage</option>
                        <option value="s3">Amazon S3</option>
                        <option value="cloudflare">Cloudflare R2</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'federation' && config?.federation && (
                <div className="config-section">
                  <h2 className="config-section-title">Federation</h2>
                  <p className="config-section-desc">Connect with other VoltChat instances.</p>
                  <div className="config-group">
                    <h3>Federation</h3>
                    <div className="config-field checkbox">
                      <label><input type="checkbox" checked={config.federation.enabled || false} onChange={(e) => updateConfig('federation', 'enabled', e.target.checked)} /> Enable Federation</label>
                    </div>
                    {config.federation.enabled && (
                      <>
                        <div className="config-field">
                          <label>Server Name</label>
                          <input type="text" value={config.federation.serverName || ''} onChange={(e) => updateConfig('federation', 'serverName', e.target.value)} placeholder="your-server.com" />
                        </div>
                        <div className="config-field">
                          <label>Max Hops</label>
                          <input type="number" value={config.federation.maxHops || 3} onChange={(e) => updateConfig('federation', 'maxHops', parseInt(e.target.value))} min={1} max={10} />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'advanced' && (
                <div className="config-section">
                  <h2 className="config-section-title">Advanced</h2>
                  <p className="config-section-desc">Branding, caching, queues, and monitoring.</p>
                  <div className="config-group">
                    <h3>Branding</h3>
                    <div className="config-field">
                      <label>Primary Color</label>
                      <input type="color" value={config.branding?.primaryColor || '#5865f2'} onChange={(e) => updateConfig('branding', 'primaryColor', e.target.value)} />
                    </div>
                    <div className="config-field">
                      <label>Accent Color</label>
                      <input type="color" value={config.branding?.accentColor || '#7289da'} onChange={(e) => updateConfig('branding', 'accentColor', e.target.value)} />
                    </div>
                  </div>
                  
                  {config.cache !== undefined && (
                    <div className="config-group">
                      <h3>Cache</h3>
                      <div className="config-field checkbox">
                        <label><input type="checkbox" checked={config.cache?.enabled || false} onChange={(e) => updateConfig('cache', 'enabled', e.target.checked)} /> Enable Cache</label>
                      </div>
                      <div className="config-field">
                        <label>Cache Provider</label>
                        <select value={config.cache?.provider || 'memory'} onChange={(e) => updateConfig('cache', 'provider', e.target.value)}>
                          <option value="memory">Memory</option>
                          <option value="redis">Redis</option>
                        </select>
                      </div>
                    </div>
                  )}
                  
                  {config.queue !== undefined && (
                    <div className="config-group">
                      <h3>Queue</h3>
                      <div className="config-field checkbox">
                        <label><input type="checkbox" checked={config.queue?.enabled || false} onChange={(e) => updateConfig('queue', 'enabled', e.target.checked)} /> Enable Queue</label>
                      </div>
                      <div className="config-field">
                        <label>Queue Provider</label>
                        <select value={config.queue?.provider || 'memory'} onChange={(e) => updateConfig('queue', 'provider', e.target.value)}>
                          <option value="memory">Memory</option>
                          <option value="redis">Redis</option>
                        </select>
                      </div>
                    </div>
                  )}
                  
                  {config.monitoring !== undefined && (
                    <div className="config-group">
                      <h3>Monitoring</h3>
                      <div className="config-field checkbox">
                        <label><input type="checkbox" checked={config.monitoring?.enabled || false} onChange={(e) => updateConfig('monitoring', 'enabled', e.target.checked)} /> Enable Monitoring</label>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'migration' && (
                <div className="config-section">
                  <h2 className="config-section-title">Database Migration</h2>
                  <p className="config-section-desc">Migrate your data between different database backends.</p>
                  <div className="config-group">
                    <h3><Database size={18} /> Migration Tool</h3>
                    <p className="config-description">
                      Migrate your data between different database types. A backup will be created automatically.
                    </p>
                    
                    <div className="migration-current">
                      <strong>Current Database:</strong> 
                      <span className={`db-badge ${migrationState.currentType}`}>
                        {migrationState.currentType?.toUpperCase() || 'JSON'}
                      </span>
                    </div>
                    
                    <div className="migration-types">
                      <h4>Select Target Database</h4>
                      <p className="config-description" style={{ marginTop: 0 }}>
                        All database types are available — the database can be running locally or on a remote server. 
                        Select a target and enter connection details below.
                      </p>
                      <div className="migration-grid">
                        {STORAGE_TYPES.map(type => {
                          const isCurrent = migrationState.currentType === type.id
                          const driverInstalled = migrationState.dependencies[type.id]?.available
                          
                          return (
                            <div 
                              key={type.id}
                              className={`migration-type-card ${migrationState.selectedType === type.id ? 'selected' : ''} ${isCurrent ? 'current' : ''}`}
                              onClick={() => handleSelectStorageType(type.id)}
                            >
                              <div className="type-header">
                                <span className="type-name">{type.name}</span>
                                {isCurrent && <span className="current-badge">Current</span>}
                                {!isCurrent && driverInstalled && <span className="driver-badge ready">Driver Ready</span>}
                                {!isCurrent && !driverInstalled && type.id !== 'json' && <span className="driver-badge needs-install">Driver Needed</span>}
                              </div>
                              <p className="type-desc">{type.desc}</p>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    
                    {migrationState.showConfigForm && migrationState.selectedType && (
                      <div className="migration-config">
                        <h4>Configure {STORAGE_TYPES.find(t => t.id === migrationState.selectedType)?.name}</h4>
                        
                        {!migrationState.dependencies[migrationState.selectedType]?.available && migrationState.selectedType !== 'json' && (
                          <div className="migration-driver-warning">
                            <AlertTriangle size={16} />
                            <div>
                              <strong>Node.js driver not installed locally</strong>
                              <p>
                                The required npm package for {STORAGE_TYPES.find(t => t.id === migrationState.selectedType)?.name} is not installed on this server yet. 
                                You can still configure the connection details for a remote database. 
                                Install the driver before migrating: <code>npm install {migrationState.selectedType === 'sqlite' ? 'better-sqlite3' : migrationState.selectedType === 'postgres' || migrationState.selectedType === 'cockroachdb' ? 'pg' : migrationState.selectedType === 'mysql' ? 'mysql2' : migrationState.selectedType}</code>
                              </p>
                            </div>
                          </div>
                        )}
                        
                        <p className="config-description" style={{ marginTop: 0, marginBottom: 16 }}>
                          Enter the connection details below. The database can be on this server or a remote host.
                        </p>
                        
                        <div className="config-fields">
                          {getDefaultConfigFields(migrationState.selectedType).map(field => (
                            <div key={field.name} className="config-field">
                              <label>{field.label}</label>
                              {field.type === 'checkbox' ? (
                                <label className="checkbox-label">
                                  <input 
                                    type="checkbox" 
                                    checked={migrationState.targetConfig[field.name] ?? field.default}
                                    onChange={(e) => handleConfigChange(field.name, e.target.checked)}
                                  />
                                  Enable
                                </label>
                              ) : field.type === 'number' ? (
                                <input 
                                  type="number" 
                                  value={migrationState.targetConfig[field.name] ?? field.default}
                                  onChange={(e) => handleConfigChange(field.name, field.type === 'number' ? parseInt(e.target.value) : e.target.value)}
                                />
                              ) : (
                                <input 
                                  type={field.type}
                                  value={migrationState.targetConfig[field.name] ?? ''}
                                  onChange={(e) => handleConfigChange(field.name, e.target.value)}
                                  placeholder={field.default}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                        
                        {migrationState.testingResult && (
                          <div className={`migration-test-result ${migrationState.testingResult.success ? 'success' : 'error'}`}>
                            {migrationState.testingResult.success ? (
                              <><Check size={16} /> Connection successful!</>
                            ) : (
                              <><AlertTriangle size={16} /> {migrationState.testingResult.error || 'Connection failed'}</>
                            )}
                          </div>
                        )}
                        
                        <div className="migration-actions">
                          <button 
                            className="btn btn-secondary"
                            onClick={handleTestConnection}
                            disabled={migrationState.testing}
                          >
                            {migrationState.testing ? <><Loader size={16} className="spin" /> Testing... </> : 'Test Connection'}
                          </button>
                          
                          <button 
                            className="btn btn-primary"
                            onClick={handleMigrate}
                            disabled={migrationState.migrating || !migrationState.testingResult?.success}
                          >
                            {migrationState.migrating ? (
                              <><Loader size={16} className="spin" /> Migrating... </>
                            ) : (
                              <><ArrowRight size={16} /> Migrate Database</>
                            )}
                          </button>
                        </div>
                        
                        {migrationState.migrationResult && (
                          <div className={`migration-result ${migrationState.migrationResult.success ? 'success' : 'error'}`}>
                            {migrationState.migrationResult.success ? (
                              <>
                                <Check size={16} />
                                <div>
                                  <strong>Migration Complete!</strong>
                                  <p>The configuration has been updated. Please restart the server to complete the migration.</p>
                                  {migrationState.migrationResult.steps?.map((step, i) => (
                                    <div key={i} className="migration-step">
                                      {step.status === 'completed' ? <Check size={14} /> : <Loader size={14} className="spin" />}
                                      <span>{step.step}: {step.status}</span>
                                    </div>
                                  ))}
                                </div>
                              </>
                            ) : (
                              <>
                                <AlertTriangle size={16} />
                                <div>
                                  <strong>Migration Failed</strong>
                                  <p>{migrationState.migrationResult.error || 'An error occurred during migration.'}</p>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="admin-config-json">
            <div className="json-editor-wrapper">
              {jsonError ? (
                <div className="json-error"><AlertTriangle size={14} /> {jsonError}</div>
              ) : null}
              <div className="json-editor-container">
                <pre
                  ref={jsonHighlightRef}
                  className="json-highlight"
                  aria-hidden="true"
                  dangerouslySetInnerHTML={{ __html: highlightJson(rawConfig) + '\n' }}
                />
                <textarea
                  ref={jsonEditorRef}
                  className={jsonError ? 'error' : ''}
                  value={rawConfig}
                  onChange={handleJsonChange}
                  onScroll={syncScroll}
                  spellCheck="false"
                />
              </div>
            </div>
          </div>
        )}

        <div className="modal-footer">
          <button className="btn btn-danger" onClick={handleReset}>
            <RotateCcw size={16} /> Reset
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || (viewMode === 'json' && !!jsonError)}>
            <Save size={16} /> {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default AdminConfigModal
