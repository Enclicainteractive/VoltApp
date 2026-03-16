import React, { useState, useEffect, useCallback, useRef } from 'react'
import { XMarkIcon, DocumentCheckIcon, ArrowUturnDownIcon, ServerStackIcon, ShieldCheckIcon, GlobeAltIcon, CircleStackIcon, LockClosedIcon, BoltIcon, CogIcon, CodeBracketIcon, ExclamationTriangleIcon, CheckIcon, ArrowDownTrayIcon, ArrowUpTrayIcon, ArrowPathIcon, ArrowRightIcon, CubeIcon, PowerIcon, DocumentTextIcon, SignalIcon, CloudIcon, FolderIcon } from '@heroicons/react/24/outline'
import { Server, Shield, Lock, Zap, Globe, Database, Key, Settings, FileText, Code, AlertTriangle, Check, Download, Upload, RefreshCw, ArrowRight, Box, Power, FolderOpen, Network, HardDrive, Layers } from 'lucide-react'
import { apiService } from '../../services/apiService'
import { useTranslation } from '../../hooks/useTranslation'
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

const MIGRATION_FIELD_LOCALIZATION = {
  dataDir: {
    labelKey: 'adminConfig.migration.configFields.dataDir.label',
    labelDefault: 'Data Directory'
  },
  dbPath: {
    labelKey: 'adminConfig.migration.configFields.dbPath.label',
    labelDefault: 'Database Path'
  },
  host: {
    labelKey: 'adminConfig.migration.configFields.host.label',
    labelDefault: 'Host'
  },
  port: {
    labelKey: 'adminConfig.migration.configFields.port.label',
    labelDefault: 'Port'
  },
  database: {
    labelKey: 'adminConfig.migration.configFields.database.label',
    labelDefault: 'Database'
  },
  user: {
    labelKey: 'adminConfig.migration.configFields.user.label',
    labelDefault: 'Username'
  },
  password: {
    labelKey: 'adminConfig.migration.configFields.password.label',
    labelDefault: 'Password'
  },
  connectionLimit: {
    labelKey: 'adminConfig.migration.configFields.connectionLimit.label',
    labelDefault: 'Connection Limit'
  },
  charset: {
    labelKey: 'adminConfig.migration.configFields.charset.label',
    labelDefault: 'Charset'
  },
  ssl: {
    labelKey: 'adminConfig.migration.configFields.ssl.label',
    labelDefault: 'Use SSL'
  },
  encrypt: {
    labelKey: 'adminConfig.migration.configFields.encrypt.label',
    labelDefault: 'Encrypt'
  },
  trustServerCertificate: {
    labelKey: 'adminConfig.migration.configFields.trustServerCertificate.label',
    labelDefault: 'Trust Server Certificate'
  },
  authSource: {
    labelKey: 'adminConfig.migration.configFields.authSource.label',
    labelDefault: 'Auth Source'
  },
  db: {
    labelKey: 'adminConfig.migration.configFields.db.label',
    labelDefault: 'Database Number'
  },
  keyPrefix: {
    labelKey: 'adminConfig.migration.configFields.keyPrefix.label',
    labelDefault: 'Key Prefix'
  }
}

const DRIVER_PACKAGE_BY_STORAGE = {
  sqlite: 'better-sqlite3',
  mysql: 'mysql2',
  mariadb: 'mariadb',
  postgres: 'pg',
  cockroachdb: 'pg',
  mssql: 'mssql',
  mongodb: 'mongodb',
  redis: 'redis'
}

const AdminConfigModal = ({ onClose }) => {
  const { t } = useTranslation()
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

  const [opsState, setOpsState] = useState({
    loading: false,
    issues: null,
    logs: null,
    installingType: null,
    restartPending: false
  })

  const [scaleState, setScaleState] = useState({
    loading: false,
    status: null,
    error: null,
    refreshing: false,
    testingNode: null,
    testResults: {}
  })

  useEffect(() => {
    loadConfig()
    loadMigrationInfo()
    loadOperationsInfo()
  }, [])

  const loadScaleStatus = async () => {
    setScaleState(prev => ({ ...prev, loading: true, error: null }))
    try {
      const res = await apiService.getScaleStatus()
      setScaleState(prev => ({ ...prev, loading: false, status: res.data }))
    } catch (err) {
      setScaleState(prev => ({
        ...prev,
        loading: false,
        error: err.response?.data?.error || err.message || 'Failed to load cluster status'
      }))
    }
  }

  const handleRefreshNodes = async () => {
    setScaleState(prev => ({ ...prev, refreshing: true }))
    try {
      const res = await apiService.refreshScaleNodes()
      setScaleState(prev => ({ ...prev, refreshing: false, status: res.data }))
      setMessage({ type: 'success', text: 'Cluster registry refreshed.' })
    } catch (err) {
      setScaleState(prev => ({ ...prev, refreshing: false }))
      setMessage({ type: 'error', text: err.response?.data?.error || err.message || 'Refresh failed' })
    }
  }

  const handleTestNode = async (nodeId, nodeUrl) => {
    setScaleState(prev => ({ ...prev, testingNode: nodeId }))
    try {
      const start = Date.now()
      const res = await apiService.pingScaleNode(nodeUrl)
      const latency = Date.now() - start
      setScaleState(prev => ({
        ...prev,
        testingNode: null,
        testResults: { ...prev.testResults, [nodeId]: { ok: true, latency, data: res.data } }
      }))
    } catch (err) {
      setScaleState(prev => ({
        ...prev,
        testingNode: null,
        testResults: { ...prev.testResults, [nodeId]: { ok: false, error: err.message } }
      }))
    }
  }

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

  const loadOperationsInfo = async () => {
    setOpsState(prev => ({ ...prev, loading: true }))
    try {
      const [issuesRes, logsRes] = await Promise.all([
        apiService.getAdminConfigIssues(),
        apiService.getAdminConfigLogs(200, 6)
      ])
      setOpsState(prev => ({
        ...prev,
        loading: false,
        issues: issuesRes.data,
        logs: logsRes.data
      }))
    } catch (err) {
      setOpsState(prev => ({ ...prev, loading: false }))
      setMessage({ type: 'error', text: t('adminConfig.operations.loadOpsFailed', 'Failed to load server diagnostics and logs.') })
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
    if (!window.confirm(t('adminConfig.migration.confirmMigrate', 'Migrate from {{from}} to {{to}}? A backup will be created.', {
      from: migrationState.currentType,
      to: migrationState.selectedType
    }))) return
    
    setMigrationState(prev => ({ ...prev, migrating: true, migrationResult: null }))
    try {
      const res = await apiService.migrateStorage(migrationState.selectedType, migrationState.targetConfig, true)
      setMigrationState(prev => ({
        ...prev,
        migrating: false,
        migrationResult: res.data
      }))
      if (res.data.success) {
        setMessage({ type: 'success', text: t('adminConfig.migration.prepared', 'Migration prepared! Server restart required to complete.') })
      }
    } catch (err) {
      setMigrationState(prev => ({
        ...prev,
        migrating: false,
        migrationResult: { success: false, error: err.message }
      }))
    }
  }

  const handleInstallDriver = async (storageType) => {
    setOpsState(prev => ({ ...prev, installingType: storageType }))
    try {
      const res = await apiService.installAdminConfigDriver(storageType, DRIVER_PACKAGE_BY_STORAGE[storageType])
      setMessage({
        type: 'success',
        text: res.data?.alreadyInstalled
          ? t('adminConfig.operations.driverAlreadyInstalled', 'Driver is already installed.')
          : t('adminConfig.operations.driverInstalled', 'Driver installed successfully.')
      })
      await Promise.all([loadMigrationInfo(), loadOperationsInfo()])
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || t('adminConfig.operations.driverInstallFailed', 'Failed to install driver.')
      setMessage({ type: 'error', text: errorMsg })
    } finally {
      setOpsState(prev => ({ ...prev, installingType: null }))
    }
  }

  const handleRestartVoltage = async () => {
    if (!window.confirm(t('adminConfig.operations.restartConfirm', 'Restart Voltage now? Active sessions may disconnect briefly.'))) {
      return
    }
    setOpsState(prev => ({ ...prev, restartPending: true }))
    try {
      await apiService.restartVoltageServer()
      setMessage({ type: 'success', text: t('adminConfig.operations.restartRequested', 'Restart requested. If supervised by PM2/systemd, it should come back automatically.') })
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || t('adminConfig.operations.restartFailed', 'Failed to request server restart.')
      setMessage({ type: 'error', text: errorMsg })
    } finally {
      setOpsState(prev => ({ ...prev, restartPending: false }))
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
      setMessage({ type: 'error', text: t('adminConfig.messages.loadFailed', 'Failed to load config. Owner access required.') })
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
        setMessage({ type: 'success', text: res.data.message || t('adminConfig.messages.saved', 'Config saved!') })
      } else {
        const res = await apiService.updateAdminConfig(config)
        setMessage({ type: 'success', text: res.data.message || t('adminConfig.messages.saved', 'Config saved!') })
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || t('adminConfig.messages.saveFailed', 'Failed to save config')
      setMessage({ type: 'error', text: errorMsg })
    }
    setSaving(false)
  }

  const handleReset = async () => {
    if (!window.confirm(t('adminConfig.messages.resetConfirm', 'Reset config to defaults? This cannot be undone.'))) return
    try {
      await apiService.resetAdminConfig()
      setMessage({ type: 'success', text: t('adminConfig.messages.resetSuccess', 'Config reset to defaults') })
      loadConfig()
    } catch (err) {
      setMessage({ type: 'error', text: t('adminConfig.messages.resetFailed', 'Failed to reset config') })
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
        setMessage({ type: 'success', text: res.data.message || t('adminConfig.messages.imported', 'Config imported!') })
        loadConfig()
      } catch (err) {
        setMessage({ type: 'error', text: t('adminConfig.messages.importFailed', 'Failed to import: {{error}}', { error: err.message || err.response?.data?.error }) })
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
          <div className="modal-loading">{t('adminConfig.messages.loading', 'Loading config...')}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container admin-config-modal large" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2><CogIcon size={20} /> {t('adminConfig.title', 'Server Configuration')}</h2>
          <button className="modal-close" onClick={onClose}><XMarkIcon size={20} /></button>
        </div>

        <div className="admin-config-toolbar">
          <div className="view-toggle">
            <button className={viewMode === 'gui' ? 'active' : ''} onClick={() => setViewMode('gui')}>
              <BoltIcon size={14} /> {t('adminConfig.view.gui', 'GUI')}
            </button>
            <button className={viewMode === 'json' ? 'active' : ''} onClick={() => { setViewMode('json'); loadRawConfig(); }}>
              <CodeBracketIcon size={14} /> {t('adminConfig.view.json', 'JSON')}
            </button>
          </div>
          <div className="toolbar-actions">
            <button className="toolbar-btn" onClick={handleValidate} title={t('adminConfig.actions.validate', 'Validate')}>
              <CheckIcon size={14} /> {t('adminConfig.actions.validate', 'Validate')}
            </button>
            <button className="toolbar-btn" onClick={handleImport} title={t('adminConfig.actions.import', 'Import')}>
              <ArrowUpTrayIcon size={14} /> {t('adminConfig.actions.import', 'Import')}
            </button>
            <button className="toolbar-btn" onClick={handleExport} title={t('adminConfig.actions.export', 'Export')}>
              <ArrowDownTrayIcon size={14} /> {t('adminConfig.actions.export', 'Export')}
            </button>
          </div>
        </div>

        {validation && (
          <div className={`validation-box ${validation.valid ? 'valid' : 'invalid'}`}>
            {validation.errors?.length > 0 && (
              <div className="validation-errors">
                {validation.errors.map((err, i) => (
                  <div key={i} className="validation-error"><ExclamationTriangleIcon size={14} /> {err}</div>
                ))}
              </div>
            )}
            {validation.warnings?.length > 0 && (
              <div className="validation-warnings">
                {validation.warnings.map((warn, i) => (
                  <div key={i} className="validation-warning"><ExclamationTriangleIcon size={14} /> {warn}</div>
                ))}
              </div>
            )}
            {validation.valid && !validation.warnings?.length && (
              <div className="validation-success"><CheckIcon size={14} /> {t('adminConfig.validation.valid', 'Config is valid!')}</div>
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
                { id: 'server',     label: t('adminConfig.nav.server', 'Server'),         icon: Server },
                { id: 'auth',       label: t('adminConfig.nav.auth', 'Auth'),             icon: Shield },
                { id: 'email',      label: t('adminConfig.nav.email', 'Email'),           icon: FileText },
                { id: 'security',   label: t('adminConfig.nav.security', 'Security'),     icon: Lock },
                { id: 'features',   label: t('adminConfig.nav.features', 'Features'),     icon: Zap },
                { id: 'limits',     label: t('adminConfig.nav.limits', 'Limits'),         icon: Layers },
                { id: 'storage',    label: t('adminConfig.nav.storage', 'Storage'),       icon: Database },
                { id: 'cdn',        label: t('adminConfig.nav.cdn', 'CDN & Files'),       icon: HardDrive },
                { id: 'scaling',    label: t('adminConfig.nav.scaling', 'Scaling'),       icon: Network },
                { id: 'federation', label: t('adminConfig.nav.federation', 'Federation'), icon: Globe },
                { id: 'advanced',   label: t('adminConfig.nav.advanced', 'Advanced'),     icon: Settings },
                { id: 'migration',  label: t('adminConfig.nav.migration', 'Migration'),   icon: RefreshCw },
              ].map(tab => {
                const Icon = tab.icon
                const hasNotice = tab.id === 'scaling' && config?.scaling?.enabled
                return (
                  <button
                    key={tab.id}
                    className={`config-nav-btn ${activeTab === tab.id ? 'active' : ''}`}
                    onClick={() => {
                      setActiveTab(tab.id)
                      if (tab.id === 'scaling' && !scaleState.status && !scaleState.loading) {
                        loadScaleStatus()
                      }
                    }}
                  >
                    <Icon size={16} />
                    <span>{tab.label}</span>
                    {hasNotice && <span className="nav-badge-dot" />}
                  </button>
                )
              })}
            </div>

            <div className="admin-config-content">
              {activeTab === 'server' && config?.server && (
                <div className="config-section">
                  <h2 className="config-section-title">{t('adminConfig.sections.server.title', 'Server')}</h2>
                  <p className="config-section-desc">{t('adminConfig.sections.server.desc', 'Core server identity and network settings.')}</p>
                  <div className="config-group">
                    <h3>{t('adminConfig.sections.server.basicSettings', 'Basic Settings')}</h3>
                    <div className="config-field">
                      <label>{t('adminConfig.fields.serverName', 'Server Name')}</label>
                      <input type="text" value={config.server.name || ''} onChange={(e) => updateConfig('server', 'name', e.target.value)} />
                    </div>
                    <div className="config-field">
                      <label>{t('adminConfig.fields.serverUrlPublic', 'Server URL (Public)')}</label>
                      <input type="text" value={config.server.url || ''} onChange={(e) => updateConfig('server', 'url', e.target.value)} placeholder={t('adminConfig.placeholders.serverUrlPublic', 'https://your-server.com')} />
                    </div>
                    <div className="config-field">
                      <label>{t('adminConfig.fields.imageServerUrl', 'Image Server URL (for avatars)')}</label>
                      <input type="text" value={config.server.imageServerUrl || ''} onChange={(e) => updateConfig('server', 'imageServerUrl', e.target.value)} placeholder={t('adminConfig.placeholders.imageServerUrl', 'https://api.your-server.com')} />
                    </div>
                    <div className="config-field">
                      <label>{t('adminConfig.fields.port', 'Port')}</label>
                      <input type="number" value={config.server.port || 5000} onChange={(e) => updateConfig('server', 'port', parseInt(e.target.value))} />
                    </div>
                    <div className="config-field">
                      <label>{t('adminConfig.fields.mode', 'Mode')}</label>
                      <select value={config.server.mode || 'mainline'} onChange={(e) => updateConfig('server', 'mode', e.target.value)}>
                        <option value="mainline">{t('adminConfig.options.mainline', 'Mainline')}</option>
                        <option value="self-volt">{t('adminConfig.options.selfVolt', 'Self-Volt')}</option>
                        <option value="federated">{t('adminConfig.options.federated', 'Federated')}</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'auth' && config?.auth && (
                <div className="config-section">
                  <h2 className="config-section-title">{t('adminConfig.sections.auth.title', 'Authentication')}</h2>
                  <p className="config-section-desc">{t('adminConfig.sections.auth.desc', 'Configure how users sign in and register.')}</p>
                  <div className="config-group">
                    <h3>{t('adminConfig.sections.auth.authenticationType', 'Authentication Type')}</h3>
                    <div className="config-field">
                      <label>{t('adminConfig.fields.authType', 'Auth Type')}</label>
                      <select value={config.auth.type || 'all'} onChange={(e) => updateConfig('auth', 'type', e.target.value)}>
                        <option value="all">{t('adminConfig.options.authTypeAll', 'All (Local + OAuth)')}</option>
                        <option value="local">{t('adminConfig.options.authTypeLocal', 'Local Only')}</option>
                        <option value="oauth">{t('adminConfig.options.authTypeOauth', 'OAuth Only')}</option>
                      </select>
                    </div>
                  </div>
                  
                  {config.auth.local && (
                    <div className="config-group">
                      <h3>{t('adminConfig.sections.auth.localAuthentication', 'Local Authentication')}</h3>
                      <div className="config-field checkbox">
                        <label><input type="checkbox" checked={config.auth.local.enabled || false} onChange={(e) => updateConfig('auth', 'local', { ...config.auth.local, enabled: e.target.checked })} /> {t('adminConfig.fields.enableLocalAuth', 'Enable Local Auth')}</label>
                      </div>
                      <div className="config-field checkbox">
                        <label><input type="checkbox" checked={config.auth.local.allowRegistration || false} onChange={(e) => updateConfig('auth', 'local', { ...config.auth.local, allowRegistration: e.target.checked })} /> {t('adminConfig.fields.allowRegistration', 'Allow Registration')}</label>
                      </div>
                      <div className="config-field">
                        <label>{t('adminConfig.fields.minPasswordLength', 'Min Password Length')}</label>
                        <input type="number" value={config.auth.local.minPasswordLength || 8} onChange={(e) => updateConfig('auth', 'local', { ...config.auth.local, minPasswordLength: parseInt(e.target.value) })} min={4} max={128} />
                      </div>
                    </div>
                  )}
                  
                  {config.auth.oauth && (
                    <div className="config-group">
                      <h3>{t('adminConfig.sections.auth.oauthSettings', 'OAuth Settings')}</h3>
                      <div className="config-field checkbox">
                        <label><input type="checkbox" checked={config.auth.oauth.enabled || false} onChange={(e) => updateConfig('auth', 'oauth', { ...config.auth.oauth, enabled: e.target.checked })} /> {t('adminConfig.fields.enableOAuth', 'Enable OAuth')}</label>
                      </div>
                      <div className="config-field">
                        <label>{t('adminConfig.fields.oauthProvider', 'OAuth Provider')}</label>
                        <select value={config.auth.oauth.provider || 'enclica'} onChange={(e) => updateConfig('auth', 'oauth', { ...config.auth.oauth, provider: e.target.value })}>
                          <option value="enclica">Enclica</option>
                          <option value="discord">Discord</option>
                          <option value="google">Google</option>
                        </select>
                      </div>
                      {config.auth.oauth.enclica && (
                        <>
                          <div className="config-field">
                            <label>{t('adminConfig.fields.enclicaClientId', 'Enclica Client ID')}</label>
                            <input type="text" value={config.auth.oauth.enclica.clientId || ''} disabled placeholder={t('adminConfig.placeholders.setInConfigFile', '(set in config file)')} />
                          </div>
                          <div className="config-field">
                            <label>{t('adminConfig.fields.authUrl', 'Auth URL')}</label>
                            <input type="text" value={config.auth.oauth.enclica.authUrl || ''} onChange={(e) => updateConfig('auth', 'oauth', { ...config.auth.oauth, enclica: { ...config.auth.oauth.enclica, authUrl: e.target.value } })} />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'email' && config?.auth && (
                <div className="config-section">
                  <h2 className="config-section-title">{t('adminConfig.sections.email.title', 'Email Service')}</h2>
                  <p className="config-section-desc">{t('adminConfig.sections.email.desc', 'Configure email delivery for password resets and notifications.')}</p>
                  
                  <div className="config-group">
                    <h3>{t('adminConfig.sections.email.general', 'General')}</h3>
                    <div className="config-field">
                      <label>{t('adminConfig.fields.emailEnabled', 'Enable Email')}</label>
                      <label className="toggle">
                        <input 
                          type="checkbox" 
                          checked={config.auth.email?.enabled || false} 
                          onChange={(e) => updateConfig('auth', 'email', { ...config.auth.email, enabled: e.target.checked })}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>
                    <div className="config-field">
                      <label>{t('adminConfig.fields.emailProvider', 'Email Provider')}</label>
                      <select 
                        value={config.auth.email?.provider || 'smtp'} 
                        onChange={(e) => updateConfig('auth', 'email', { ...config.auth.email, provider: e.target.value })}
                      >
                        <option value="smtp">{t('adminConfig.options.smtp', 'SMTP')}</option>
                        <option value="sendgrid">{t('adminConfig.options.sendgrid', 'SendGrid')}</option>
                        <option value="mailgun">{t('adminConfig.options.mailgun', 'Mailgun')}</option>
                      </select>
                    </div>
                  </div>

                  {config.auth.email?.provider === 'smtp' && (
                    <div className="config-group">
                      <h3>{t('adminConfig.sections.email.smtp', 'SMTP Settings')}</h3>
                      <div className="config-field">
                        <label>{t('adminConfig.fields.smtpHost', 'SMTP Host')}</label>
                        <input 
                          type="text" 
                          value={config.auth.email?.smtp?.host || ''} 
                          onChange={(e) => updateConfig('auth', 'email', { ...config.auth.email, smtp: { ...config.auth.email.smtp, host: e.target.value } })} 
                          placeholder="smtp.gmail.com"
                        />
                      </div>
                      <div className="config-field">
                        <label>{t('adminConfig.fields.smtpPort', 'SMTP Port')}</label>
                        <input 
                          type="number" 
                          value={config.auth.email?.smtp?.port || 587} 
                          onChange={(e) => updateConfig('auth', 'email', { ...config.auth.email, smtp: { ...config.auth.email.smtp, port: parseInt(e.target.value) } })} 
                        />
                      </div>
                      <div className="config-field">
                        <label>{t('adminConfig.fields.smtpSecure', 'Use SSL/TLS')}</label>
                        <label className="toggle">
                          <input 
                            type="checkbox" 
                            checked={config.auth.email?.smtp?.secure || false} 
                            onChange={(e) => updateConfig('auth', 'email', { ...config.auth.email, smtp: { ...config.auth.email.smtp, secure: e.target.checked } })}
                          />
                          <span className="toggle-slider"></span>
                        </label>
                      </div>
                      <div className="config-field">
                        <label>{t('adminConfig.fields.smtpUser', 'SMTP Username')}</label>
                        <input 
                          type="text" 
                          value={config.auth.email?.smtp?.user || ''} 
                          onChange={(e) => updateConfig('auth', 'email', { ...config.auth.email, smtp: { ...config.auth.email.smtp, user: e.target.value } })} 
                        />
                      </div>
                      <div className="config-field">
                        <label>{t('adminConfig.fields.smtpPass', 'SMTP Password')}</label>
                        <input 
                          type="password" 
                          value={config.auth.email?.smtp?.pass || ''} 
                          onChange={(e) => updateConfig('auth', 'email', { ...config.auth.email, smtp: { ...config.auth.email.smtp, pass: e.target.value } })} 
                        />
                      </div>
                      <div className="config-field">
                        <label>{t('adminConfig.fields.emailFrom', 'From Email')}</label>
                        <input 
                          type="email" 
                          value={config.auth.email?.smtp?.from || ''} 
                          onChange={(e) => updateConfig('auth', 'email', { ...config.auth.email, smtp: { ...config.auth.email.smtp, from: e.target.value } })} 
                          placeholder="noreply@yourdomain.com"
                        />
                      </div>
                      <div className="config-field">
                        <label>{t('adminConfig.fields.emailFromName', 'From Name')}</label>
                        <input 
                          type="text" 
                          value={config.auth.email?.smtp?.fromName || 'VoltChat'} 
                          onChange={(e) => updateConfig('auth', 'email', { ...config.auth.email, smtp: { ...config.auth.email.smtp, fromName: e.target.value } })} 
                        />
                      </div>
                    </div>
                  )}

                  {config.auth.email?.provider === 'sendgrid' && (
                    <div className="config-group">
                      <h3>{t('adminConfig.sections.email.sendgrid', 'SendGrid Settings')}</h3>
                      <div className="config-field">
                        <label>{t('adminConfig.fields.sendgridApiKey', 'SendGrid API Key')}</label>
                        <input 
                          type="password" 
                          value={config.auth.email?.sendgrid?.apiKey || ''} 
                          onChange={(e) => updateConfig('auth', 'email', { ...config.auth.email, sendgrid: { ...config.auth.email.sendgrid, apiKey: e.target.value } })} 
                        />
                      </div>
                      <div className="config-field">
                        <label>{t('adminConfig.fields.emailFrom', 'From Email')}</label>
                        <input 
                          type="email" 
                          value={config.auth.email?.sendgrid?.from || ''} 
                          onChange={(e) => updateConfig('auth', 'email', { ...config.auth.email, sendgrid: { ...config.auth.email.sendgrid, from: e.target.value } })} 
                        />
                      </div>
                      <div className="config-field">
                        <label>{t('adminConfig.fields.emailFromName', 'From Name')}</label>
                        <input 
                          type="text" 
                          value={config.auth.email?.sendgrid?.fromName || 'VoltChat'} 
                          onChange={(e) => updateConfig('auth', 'email', { ...config.auth.email, sendgrid: { ...config.auth.email.sendgrid, fromName: e.target.value } })} 
                        />
                      </div>
                    </div>
                  )}

                  {config.auth.email?.provider === 'mailgun' && (
                    <div className="config-group">
                      <h3>{t('adminConfig.sections.email.mailgun', 'Mailgun Settings')}</h3>
                      <div className="config-field">
                        <label>{t('adminConfig.fields.mailgunApiKey', 'Mailgun API Key')}</label>
                        <input 
                          type="password" 
                          value={config.auth.email?.mailgun?.apiKey || ''} 
                          onChange={(e) => updateConfig('auth', 'email', { ...config.auth.email, mailgun: { ...config.auth.email.mailgun, apiKey: e.target.value } })} 
                        />
                      </div>
                      <div className="config-field">
                        <label>{t('adminConfig.fields.mailgunDomain', 'Mailgun Domain')}</label>
                        <input 
                          type="text" 
                          value={config.auth.email?.mailgun?.domain || ''} 
                          onChange={(e) => updateConfig('auth', 'email', { ...config.auth.email, mailgun: { ...config.auth.email.mailgun, domain: e.target.value } })} 
                          placeholder="yourdomain.com"
                        />
                      </div>
                      <div className="config-field">
                        <label>{t('adminConfig.fields.emailFrom', 'From Email')}</label>
                        <input 
                          type="email" 
                          value={config.auth.email?.mailgun?.from || ''} 
                          onChange={(e) => updateConfig('auth', 'email', { ...config.auth.email, mailgun: { ...config.auth.email.mailgun, from: e.target.value } })} 
                        />
                      </div>
                      <div className="config-field">
                        <label>{t('adminConfig.fields.emailFromName', 'From Name')}</label>
                        <input 
                          type="text" 
                          value={config.auth.email?.mailgun?.fromName || 'VoltChat'} 
                          onChange={(e) => updateConfig('auth', 'email', { ...config.auth.email, mailgun: { ...config.auth.email.mailgun, fromName: e.target.value } })} 
                        />
                      </div>
                    </div>
                  )}

                  <div className="config-group">
                    <h3>{t('adminConfig.sections.email.passwordReset', 'Password Reset Settings')}</h3>
                    <div className="config-field">
                      <label>{t('adminConfig.fields.passwordResetEnabled', 'Enable Password Reset')}</label>
                      <label className="toggle">
                        <input 
                          type="checkbox" 
                          checked={config.auth.passwordReset?.enabled !== false} 
                          onChange={(e) => updateConfig('auth', 'passwordReset', { ...config.auth.passwordReset, enabled: e.target.checked })}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>
                    <div className="config-field">
                      <label>{t('adminConfig.fields.tokenExpiry', 'Token Expiry (seconds)')}</label>
                      <input 
                        type="number" 
                        value={config.auth.passwordReset?.tokenExpiry || 3600} 
                        onChange={(e) => updateConfig('auth', 'passwordReset', { ...config.auth.passwordReset, tokenExpiry: parseInt(e.target.value) })} 
                        min={60}
                        max={86400}
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'security' && config?.security && (
                <div className="config-section">
                  <h2 className="config-section-title">{t('adminConfig.sections.security.title', 'Security')}</h2>
                  <p className="config-section-desc">{t('adminConfig.sections.security.desc', 'JWT tokens, encryption, and rate limiting.')}</p>
                  <div className="config-group">
                    <h3>{t('adminConfig.sections.security.jwtSettings', 'JWT Settings')}</h3>
                    <div className="config-field">
                      <label>{t('adminConfig.fields.jwtExpiry', 'JWT Expiry')}</label>
                      <select value={config.security.jwtExpiry || '7d'} onChange={(e) => updateConfig('security', 'jwtExpiry', e.target.value)}>
                        <option value="1h">{t('adminConfig.options.oneHour', '1 Hour')}</option>
                        <option value="6h">{t('adminConfig.options.sixHours', '6 Hours')}</option>
                        <option value="12h">{t('adminConfig.options.twelveHours', '12 Hours')}</option>
                        <option value="1d">{t('adminConfig.options.oneDay', '1 Day')}</option>
                        <option value="7d">{t('adminConfig.options.sevenDays', '7 Days')}</option>
                        <option value="30d">{t('adminConfig.options.thirtyDays', '30 Days')}</option>
                      </select>
                    </div>
                    <div className="config-field">
                      <label>{t('adminConfig.fields.bcryptRounds', 'Bcrypt Rounds (higher = more secure but slower)')}</label>
                      <input type="number" value={config.security.bcryptRounds || 12} onChange={(e) => updateConfig('security', 'bcryptRounds', parseInt(e.target.value))} min={8} max={15} />
                    </div>
                  </div>
                  
                  <div className="config-group">
                    <h3>{t('adminConfig.sections.security.rateLimiting', 'Rate Limiting')}</h3>
                    <div className="config-field">
                      <label>{t('adminConfig.fields.windowMs', 'Window (ms)')}</label>
                      <select value={config.security.rateLimit?.windowMs || 60000} onChange={(e) => updateConfig('security', 'rateLimit', { ...config.security.rateLimit, windowMs: parseInt(e.target.value) })}>
                        <option value={60000}>{t('adminConfig.options.oneMinute', '1 minute')}</option>
                        <option value={120000}>{t('adminConfig.options.twoMinutes', '2 minutes')}</option>
                        <option value={300000}>{t('adminConfig.options.fiveMinutes', '5 minutes')}</option>
                      </select>
                    </div>
                    <div className="config-field">
                      <label>{t('adminConfig.fields.maxRequestsPerWindow', 'Max Requests per Window')}</label>
                      <input type="number" value={config.security.rateLimit?.maxRequests || 100} onChange={(e) => updateConfig('security', 'rateLimit', { ...config.security.rateLimit, maxRequests: parseInt(e.target.value) })} />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'features' && config?.features && (
                <div className="config-section">
                  <h2 className="config-section-title">{t('adminConfig.sections.features.title', 'Features')}</h2>
                  <p className="config-section-desc">{t('adminConfig.sections.features.desc', 'Enable or disable platform capabilities.')}</p>
                  <div className="config-group">
                    <h3>{t('adminConfig.sections.features.coreFeatures', 'Core Features')}</h3>
                    <div className="config-field checkbox">
                      <label><input type="checkbox" checked={config.features.discovery || false} onChange={(e) => updateFeature('discovery', e.target.checked)} /> {t('adminConfig.fields.serverDiscovery', 'Server Discovery')}</label>
                    </div>
                    <div className="config-field checkbox">
                      <label><input type="checkbox" checked={config.features.selfVolt || false} onChange={(e) => updateFeature('selfVolt', e.target.checked)} /> {t('adminConfig.fields.selfVoltServers', 'Self-Volt Servers')}</label>
                    </div>
                    <div className="config-field checkbox">
                      <label><input type="checkbox" checked={config.features.voiceChannels || false} onChange={(e) => updateFeature('voiceChannels', e.target.checked)} /> {t('adminConfig.fields.voiceChannels', 'Voice Channels')}</label>
                    </div>
                    <div className="config-field checkbox">
                      <label><input type="checkbox" checked={config.features.videoChannels || false} onChange={(e) => updateFeature('videoChannels', e.target.checked)} /> {t('adminConfig.fields.videoChannels', 'Video Channels')}</label>
                    </div>
                    <div className="config-field checkbox">
                      <label><input type="checkbox" checked={config.features.e2eEncryption || false} onChange={(e) => updateFeature('e2eEncryption', e.target.checked)} /> {t('adminConfig.fields.e2eEncryption', 'E2E Encryption')}</label>
                    </div>
                    <div className="config-field checkbox">
                      <label><input type="checkbox" checked={config.features.communities || false} onChange={(e) => updateFeature('communities', e.target.checked)} /> {t('adminConfig.fields.communities', 'Communities')}</label>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'limits' && config?.limits && (
                <div className="config-section">
                  <h2 className="config-section-title">{t('adminConfig.sections.limits.title', 'Limits')}</h2>
                  <p className="config-section-desc">{t('adminConfig.sections.limits.desc', 'Resource quotas and usage caps.')}</p>
                  <div className="config-group">
                    <h3>{t('adminConfig.sections.limits.resourceLimits', 'Resource Limits')}</h3>
                    <div className="config-field">
                      <label>{t('adminConfig.fields.maxUploadSizeBytes', 'Max Upload Size (bytes)')}</label>
                      <input type="number" value={config.limits.maxUploadSize || 10485760} onChange={(e) => updateConfig('limits', 'maxUploadSize', parseInt(e.target.value))} />
                      <small>{t('adminConfig.fields.currentSizeMb', 'Current: {{size}} MB', { size: ((config.limits.maxUploadSize || 10485760) / 1048576).toFixed(1) })}</small>
                    </div>
                    <div className="config-field">
                      <label>{t('adminConfig.fields.maxServersPerUser', 'Max Servers Per User')}</label>
                      <input type="number" value={config.limits.maxServersPerUser || 100} onChange={(e) => updateConfig('limits', 'maxServersPerUser', parseInt(e.target.value))} />
                    </div>
                    <div className="config-field">
                      <label>{t('adminConfig.fields.maxMessageLength', 'Max Message Length')}</label>
                      <input type="number" value={config.limits.maxMessageLength || 4000} onChange={(e) => updateConfig('limits', 'maxMessageLength', parseInt(e.target.value))} />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'storage' && config?.storage && (
                <div className="config-section">
                  <h2 className="config-section-title">{t('adminConfig.sections.storage.title', 'Storage')}</h2>
                  <p className="config-section-desc">{t('adminConfig.sections.storage.desc', 'Database engine and file storage settings.')}</p>
                  <div className="config-group">
                    <h3>{t('adminConfig.sections.storage.storageType', 'Storage Type')}</h3>
                    <div className="config-field">
                      <label>{t('adminConfig.fields.databaseType', 'Database Type')}</label>
                      <select value={config.storage.type || 'sqlite'} onChange={(e) => updateConfig('storage', 'type', e.target.value)}>
                        <option value="json">{t('adminConfig.storageTypes.json.name', 'JSON Files')}</option>
                        <option value="sqlite">{t('adminConfig.storageTypes.sqlite.name', 'SQLite')}</option>
                        <option value="mysql">{t('adminConfig.storageTypes.mysql.name', 'MySQL')}</option>
                        <option value="mariadb">{t('adminConfig.storageTypes.mariadb.name', 'MariaDB')}</option>
                        <option value="postgres">{t('adminConfig.storageTypes.postgres.name', 'PostgreSQL')}</option>
                        <option value="cockroachdb">{t('adminConfig.storageTypes.cockroachdb.name', 'CockroachDB')}</option>
                        <option value="mssql">{t('adminConfig.storageTypes.mssql.name', 'SQL Server')}</option>
                        <option value="mongodb">{t('adminConfig.storageTypes.mongodb.name', 'MongoDB')}</option>
                        <option value="redis">{t('adminConfig.storageTypes.redis.name', 'Redis')}</option>
                      </select>
                    </div>
                    
                    {config.storage.json && (
                      <div className="config-field">
                        <label>{t('adminConfig.fields.dataDirectory', 'Data Directory')}</label>
                        <input type="text" value={config.storage.json.dataDir || ''} onChange={(e) => updateConfig('storage', 'json', { ...config.storage.json, dataDir: e.target.value })} />
                      </div>
                    )}
                    
                    {config.storage.sqlite && (
                      <div className="config-field">
                        <label>{t('adminConfig.fields.databasePath', 'Database Path')}</label>
                        <input type="text" value={config.storage.sqlite.dbPath || ''} onChange={(e) => updateConfig('storage', 'sqlite', { ...config.storage.sqlite, dbPath: e.target.value })} />
                      </div>
                    )}
                    
                    {(config.storage.mysql || config.storage.type === 'mysql') && (
                      <>
                        <div className="config-field">
                          <label>{t('adminConfig.fields.mysqlHost', 'MySQL Host')}</label>
                          <input type="text" value={config.storage.mysql?.host || ''} onChange={(e) => updateConfig('storage', 'mysql', { ...config.storage.mysql, host: e.target.value })} placeholder={t('adminConfig.placeholders.localhost', 'localhost')} />
                        </div>
                        <div className="config-field">
                          <label>{t('adminConfig.fields.mysqlPort', 'MySQL Port')}</label>
                          <input type="number" value={config.storage.mysql?.port || 3306} onChange={(e) => updateConfig('storage', 'mysql', { ...config.storage.mysql, port: parseInt(e.target.value) })} />
                        </div>
                        <div className="config-field">
                          <label>{t('adminConfig.fields.mysqlDatabase', 'MySQL Database')}</label>
                          <input type="text" value={config.storage.mysql?.database || ''} onChange={(e) => updateConfig('storage', 'mysql', { ...config.storage.mysql, database: e.target.value })} placeholder={t('adminConfig.placeholders.voltchat', 'voltchat')} />
                        </div>
                        <div className="config-field">
                          <label>{t('adminConfig.fields.mysqlUsername', 'MySQL Username')}</label>
                          <input type="text" value={config.storage.mysql?.user || ''} onChange={(e) => updateConfig('storage', 'mysql', { ...config.storage.mysql, user: e.target.value })} placeholder={t('adminConfig.placeholders.root', 'root')} />
                        </div>
                        <div className="config-field">
                          <label>{t('adminConfig.fields.mysqlPassword', 'MySQL Password')}</label>
                          <input type="password" value={config.storage.mysql?.password || ''} onChange={(e) => updateConfig('storage', 'mysql', { ...config.storage.mysql, password: e.target.value })} placeholder={t('adminConfig.placeholders.enterPassword', 'Enter password')} />
                        </div>
                      </>
                    )}
                    
                    {(config.storage.mariadb || config.storage.type === 'mariadb') && (
                      <>
                        <div className="config-field">
                          <label>{t('adminConfig.fields.mariadbHost', 'MariaDB Host')}</label>
                          <input type="text" value={config.storage.mariadb?.host || ''} onChange={(e) => updateConfig('storage', 'mariadb', { ...config.storage.mariadb, host: e.target.value })} placeholder={t('adminConfig.placeholders.localhost', 'localhost')} />
                        </div>
                        <div className="config-field">
                          <label>{t('adminConfig.fields.mariadbPort', 'MariaDB Port')}</label>
                          <input type="number" value={config.storage.mariadb?.port || 3306} onChange={(e) => updateConfig('storage', 'mariadb', { ...config.storage.mariadb, port: parseInt(e.target.value) })} />
                        </div>
                        <div className="config-field">
                          <label>{t('adminConfig.fields.mariadbDatabase', 'MariaDB Database')}</label>
                          <input type="text" value={config.storage.mariadb?.database || ''} onChange={(e) => updateConfig('storage', 'mariadb', { ...config.storage.mariadb, database: e.target.value })} placeholder={t('adminConfig.placeholders.voltchat', 'voltchat')} />
                        </div>
                        <div className="config-field">
                          <label>{t('adminConfig.fields.mariadbUsername', 'MariaDB Username')}</label>
                          <input type="text" value={config.storage.mariadb?.user || ''} onChange={(e) => updateConfig('storage', 'mariadb', { ...config.storage.mariadb, user: e.target.value })} placeholder={t('adminConfig.placeholders.root', 'root')} />
                        </div>
                        <div className="config-field">
                          <label>{t('adminConfig.fields.mariadbPassword', 'MariaDB Password')}</label>
                          <input type="password" value={config.storage.mariadb?.password || ''} onChange={(e) => updateConfig('storage', 'mariadb', { ...config.storage.mariadb, password: e.target.value })} placeholder={t('adminConfig.placeholders.enterPassword', 'Enter password')} />
                        </div>
                      </>
                    )}
                    
                    {(config.storage.postgres || config.storage.type === 'postgres') && (
                      <>
                        <div className="config-field">
                          <label>{t('adminConfig.fields.postgresqlHost', 'PostgreSQL Host')}</label>
                          <input type="text" value={config.storage.postgres?.host || ''} onChange={(e) => updateConfig('storage', 'postgres', { ...config.storage.postgres, host: e.target.value })} placeholder={t('adminConfig.placeholders.localhost', 'localhost')} />
                        </div>
                        <div className="config-field">
                          <label>{t('adminConfig.fields.postgresqlPort', 'PostgreSQL Port')}</label>
                          <input type="number" value={config.storage.postgres?.port || 5432} onChange={(e) => updateConfig('storage', 'postgres', { ...config.storage.postgres, port: parseInt(e.target.value) })} />
                        </div>
                        <div className="config-field">
                          <label>{t('adminConfig.fields.postgresqlDatabase', 'PostgreSQL Database')}</label>
                          <input type="text" value={config.storage.postgres?.database || ''} onChange={(e) => updateConfig('storage', 'postgres', { ...config.storage.postgres, database: e.target.value })} placeholder={t('adminConfig.placeholders.voltchat', 'voltchat')} />
                        </div>
                        <div className="config-field">
                          <label>{t('adminConfig.fields.postgresqlUsername', 'PostgreSQL Username')}</label>
                          <input type="text" value={config.storage.postgres?.user || ''} onChange={(e) => updateConfig('storage', 'postgres', { ...config.storage.postgres, user: e.target.value })} placeholder={t('adminConfig.placeholders.postgres', 'postgres')} />
                        </div>
                        <div className="config-field">
                          <label>{t('adminConfig.fields.postgresqlPassword', 'PostgreSQL Password')}</label>
                          <input type="password" value={config.storage.postgres?.password || ''} onChange={(e) => updateConfig('storage', 'postgres', { ...config.storage.postgres, password: e.target.value })} placeholder={t('adminConfig.placeholders.enterPassword', 'Enter password')} />
                        </div>
                      </>
                    )}
                    
                    {(config.storage.cockroachdb || config.storage.type === 'cockroachdb') && (
                      <>
                        <div className="config-field">
                          <label>{t('adminConfig.fields.cockroachdbHost', 'CockroachDB Host')}</label>
                          <input type="text" value={config.storage.cockroachdb?.host || ''} onChange={(e) => updateConfig('storage', 'cockroachdb', { ...config.storage.cockroachdb, host: e.target.value })} placeholder={t('adminConfig.placeholders.localhost', 'localhost')} />
                        </div>
                        <div className="config-field">
                          <label>{t('adminConfig.fields.cockroachdbPort', 'CockroachDB Port')}</label>
                          <input type="number" value={config.storage.cockroachdb?.port || 26257} onChange={(e) => updateConfig('storage', 'cockroachdb', { ...config.storage.cockroachdb, port: parseInt(e.target.value) })} />
                        </div>
                        <div className="config-field">
                          <label>{t('adminConfig.fields.cockroachdbDatabase', 'CockroachDB Database')}</label>
                          <input type="text" value={config.storage.cockroachdb?.database || ''} onChange={(e) => updateConfig('storage', 'cockroachdb', { ...config.storage.cockroachdb, database: e.target.value })} placeholder={t('adminConfig.placeholders.voltchat', 'voltchat')} />
                        </div>
                        <div className="config-field">
                          <label>{t('adminConfig.fields.cockroachdbUsername', 'CockroachDB Username')}</label>
                          <input type="text" value={config.storage.cockroachdb?.user || ''} onChange={(e) => updateConfig('storage', 'cockroachdb', { ...config.storage.cockroachdb, user: e.target.value })} placeholder={t('adminConfig.placeholders.root', 'root')} />
                        </div>
                        <div className="config-field">
                          <label>{t('adminConfig.fields.cockroachdbPassword', 'CockroachDB Password')}</label>
                          <input type="password" value={config.storage.cockroachdb?.password || ''} onChange={(e) => updateConfig('storage', 'cockroachdb', { ...config.storage.cockroachdb, password: e.target.value })} placeholder={t('adminConfig.placeholders.enterPassword', 'Enter password')} />
                        </div>
                      </>
                    )}
                    
                    {(config.storage.mssql || config.storage.type === 'mssql') && (
                      <>
                        <div className="config-field">
                          <label>{t('adminConfig.fields.sqlServerHost', 'SQL Server Host')}</label>
                          <input type="text" value={config.storage.mssql?.host || ''} onChange={(e) => updateConfig('storage', 'mssql', { ...config.storage.mssql, host: e.target.value })} placeholder={t('adminConfig.placeholders.localhost', 'localhost')} />
                        </div>
                        <div className="config-field">
                          <label>{t('adminConfig.fields.sqlServerPort', 'SQL Server Port')}</label>
                          <input type="number" value={config.storage.mssql?.port || 1433} onChange={(e) => updateConfig('storage', 'mssql', { ...config.storage.mssql, port: parseInt(e.target.value) })} />
                        </div>
                        <div className="config-field">
                          <label>{t('adminConfig.fields.sqlServerDatabase', 'SQL Server Database')}</label>
                          <input type="text" value={config.storage.mssql?.database || ''} onChange={(e) => updateConfig('storage', 'mssql', { ...config.storage.mssql, database: e.target.value })} placeholder={t('adminConfig.placeholders.voltchat', 'voltchat')} />
                        </div>
                        <div className="config-field">
                          <label>{t('adminConfig.fields.sqlServerUsername', 'SQL Server Username')}</label>
                          <input type="text" value={config.storage.mssql?.user || ''} onChange={(e) => updateConfig('storage', 'mssql', { ...config.storage.mssql, user: e.target.value })} placeholder={t('adminConfig.placeholders.sa', 'sa')} />
                        </div>
                        <div className="config-field">
                          <label>{t('adminConfig.fields.sqlServerPassword', 'SQL Server Password')}</label>
                          <input type="password" value={config.storage.mssql?.password || ''} onChange={(e) => updateConfig('storage', 'mssql', { ...config.storage.mssql, password: e.target.value })} placeholder={t('adminConfig.placeholders.enterPassword', 'Enter password')} />
                        </div>
                      </>
                    )}
                    
                    {(config.storage.mongodb || config.storage.type === 'mongodb') && (
                      <>
                        <div className="config-field">
                          <label>{t('adminConfig.fields.mongodbHost', 'MongoDB Host')}</label>
                          <input type="text" value={config.storage.mongodb?.host || ''} onChange={(e) => updateConfig('storage', 'mongodb', { ...config.storage.mongodb, host: e.target.value })} placeholder={t('adminConfig.placeholders.localhost', 'localhost')} />
                        </div>
                        <div className="config-field">
                          <label>{t('adminConfig.fields.mongodbPort', 'MongoDB Port')}</label>
                          <input type="number" value={config.storage.mongodb?.port || 27017} onChange={(e) => updateConfig('storage', 'mongodb', { ...config.storage.mongodb, port: parseInt(e.target.value) })} />
                        </div>
                        <div className="config-field">
                          <label>{t('adminConfig.fields.mongodbDatabase', 'MongoDB Database')}</label>
                          <input type="text" value={config.storage.mongodb?.database || ''} onChange={(e) => updateConfig('storage', 'mongodb', { ...config.storage.mongodb, database: e.target.value })} placeholder={t('adminConfig.placeholders.voltchat', 'voltchat')} />
                        </div>
                        <div className="config-field">
                          <label>{t('adminConfig.fields.mongodbUsername', 'MongoDB Username')}</label>
                          <input type="text" value={config.storage.mongodb?.user || ''} onChange={(e) => updateConfig('storage', 'mongodb', { ...config.storage.mongodb, user: e.target.value })} placeholder={t('adminConfig.placeholders.enterUsername', 'Enter username')} />
                        </div>
                        <div className="config-field">
                          <label>{t('adminConfig.fields.mongodbPassword', 'MongoDB Password')}</label>
                          <input type="password" value={config.storage.mongodb?.password || ''} onChange={(e) => updateConfig('storage', 'mongodb', { ...config.storage.mongodb, password: e.target.value })} placeholder={t('adminConfig.placeholders.enterPassword', 'Enter password')} />
                        </div>
                      </>
                    )}
                    
                    {(config.storage.redis || config.storage.type === 'redis') && (
                      <>
                        <div className="config-field">
                          <label>{t('adminConfig.fields.redisHost', 'Redis Host')}</label>
                          <input type="text" value={config.storage.redis?.host || ''} onChange={(e) => updateConfig('storage', 'redis', { ...config.storage.redis, host: e.target.value })} placeholder={t('adminConfig.placeholders.localhost', 'localhost')} />
                        </div>
                        <div className="config-field">
                          <label>{t('adminConfig.fields.redisPort', 'Redis Port')}</label>
                          <input type="number" value={config.storage.redis?.port || 6379} onChange={(e) => updateConfig('storage', 'redis', { ...config.storage.redis, port: parseInt(e.target.value) })} />
                        </div>
                        <div className="config-field">
                          <label>{t('adminConfig.fields.redisPasswordOptional', 'Redis Password (optional)')}</label>
                          <input type="password" value={config.storage.redis?.password || ''} onChange={(e) => updateConfig('storage', 'redis', { ...config.storage.redis, password: e.target.value })} placeholder={t('adminConfig.placeholders.enterPassword', 'Enter password')} />
                        </div>
                        <div className="config-field">
                          <label>{t('adminConfig.fields.redisDatabaseNumber', 'Redis Database Number')}</label>
                          <input type="number" value={config.storage.redis?.db || 0} onChange={(e) => updateConfig('storage', 'redis', { ...config.storage.redis, db: parseInt(e.target.value) })} min={0} max={15} />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'cdn' && config?.cdn !== undefined && (
                <div className="config-section">
                  <h2 className="config-section-title">{t('adminConfig.sections.cdn.title', 'CDN & File Storage')}</h2>
                  <p className="config-section-desc">{t('adminConfig.sections.cdn.desc', 'Where uploaded files, avatars, and attachments are stored and served from.')}</p>

                  {/* Provider picker cards */}
                  <div className="config-group">
                    <h3><HardDrive size={16} /> {t('adminConfig.sections.cdn.storageProvider', 'Storage Provider')}</h3>
                    <div className="provider-cards">
                      {[
                        { id: 'local',      label: 'Local Disk',      desc: 'Files stay on this server.', badge: null },
                        { id: 'nfs',        label: 'NFS Shared',      desc: 'Shared folder across all scale nodes. No file-routing needed.', badge: 'Scaling' },
                        { id: 's3',         label: 'Amazon S3',       desc: 'AWS S3 or any S3-compatible store.', badge: null },
                        { id: 'cloudflare', label: 'Cloudflare R2',   desc: 'Zero egress fees.', badge: null },
                      ].map(p => (
                        <button
                          key={p.id}
                          className={`provider-card ${(config.cdn?.provider || 'local') === p.id ? 'selected' : ''}`}
                          onClick={() => updateConfig('cdn', 'provider', p.id)}
                          type="button"
                        >
                          <span className="provider-card-name">{p.label}</span>
                          {p.badge && <span className="provider-card-badge">{p.badge}</span>}
                          <span className="provider-card-desc">{p.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* NFS config */}
                  {config.cdn?.provider === 'nfs' && (
                    <div className="config-group cdn-provider-config">
                      <h3><FolderIcon size={16} /> NFS Shared Folder</h3>
                      <div className="cdn-info-banner">
                        <SignalIcon size={16} />
                        <span>NFS makes all scale nodes read/write the same directory. No application-level file routing is needed. See <strong>Scaling</strong> tab for node setup and the SCALING.md guide for OS-level NFS setup.</span>
                      </div>
                      <div className="config-field">
                        <label>NFS Mount Path</label>
                        <input
                          type="text"
                          value={config.cdn?.nfs?.uploadDir || ''}
                          onChange={(e) => updateNestedConfig('cdn', 'nfs', 'uploadDir', e.target.value)}
                          placeholder="/www/shared_uploads"
                        />
                        <small>The local path on this server where the NFS share is mounted. Must exist and be writable before starting Voltage.</small>
                      </div>
                      <div className="config-field">
                        <label>Public Base URL <span className="label-optional">(optional)</span></label>
                        <input
                          type="text"
                          value={config.cdn?.nfs?.baseUrl || ''}
                          onChange={(e) => updateNestedConfig('cdn', 'nfs', 'baseUrl', e.target.value)}
                          placeholder="https://files.yourdomain.com"
                        />
                        <small>Leave blank to use the standard <code>/api/upload/file/</code> route.</small>
                      </div>
                    </div>
                  )}

                  {/* S3 config */}
                  {config.cdn?.provider === 's3' && (
                    <div className="config-group cdn-provider-config">
                      <h3><CloudIcon size={16} /> Amazon S3 / S3-Compatible</h3>
                      <div className="config-fields-grid">
                        <div className="config-field">
                          <label>Bucket</label>
                          <input type="text" value={config.cdn?.s3?.bucket || ''} onChange={(e) => updateNestedConfig('cdn', 's3', 'bucket', e.target.value)} placeholder="my-volt-media" />
                        </div>
                        <div className="config-field">
                          <label>Region</label>
                          <input type="text" value={config.cdn?.s3?.region || 'us-east-1'} onChange={(e) => updateNestedConfig('cdn', 's3', 'region', e.target.value)} />
                        </div>
                        <div className="config-field">
                          <label>Access Key ID</label>
                          <input type="text" value={config.cdn?.s3?.accessKeyId || ''} onChange={(e) => updateNestedConfig('cdn', 's3', 'accessKeyId', e.target.value)} />
                        </div>
                        <div className="config-field">
                          <label>Secret Access Key</label>
                          <input type="password" value={config.cdn?.s3?.secretAccessKey || ''} onChange={(e) => updateNestedConfig('cdn', 's3', 'secretAccessKey', e.target.value)} />
                        </div>
                        <div className="config-field">
                          <label>Custom Endpoint <span className="label-optional">(MinIO, DO Spaces…)</span></label>
                          <input type="text" value={config.cdn?.s3?.endpoint || ''} onChange={(e) => updateNestedConfig('cdn', 's3', 'endpoint', e.target.value)} placeholder="https://nyc3.digitaloceanspaces.com" />
                        </div>
                        <div className="config-field">
                          <label>Public URL <span className="label-optional">(CDN domain)</span></label>
                          <input type="text" value={config.cdn?.s3?.publicUrl || ''} onChange={(e) => updateNestedConfig('cdn', 's3', 'publicUrl', e.target.value)} placeholder="https://cdn.yourdomain.com" />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Cloudflare R2 config */}
                  {config.cdn?.provider === 'cloudflare' && (
                    <div className="config-group cdn-provider-config">
                      <h3><CloudIcon size={16} /> Cloudflare R2</h3>
                      <div className="config-fields-grid">
                        <div className="config-field">
                          <label>Account ID</label>
                          <input type="text" value={config.cdn?.cloudflare?.accountId || ''} onChange={(e) => updateNestedConfig('cdn', 'cloudflare', 'accountId', e.target.value)} />
                        </div>
                        <div className="config-field">
                          <label>Bucket</label>
                          <input type="text" value={config.cdn?.cloudflare?.bucket || ''} onChange={(e) => updateNestedConfig('cdn', 'cloudflare', 'bucket', e.target.value)} />
                        </div>
                        <div className="config-field">
                          <label>Access Key ID</label>
                          <input type="text" value={config.cdn?.cloudflare?.accessKeyId || ''} onChange={(e) => updateNestedConfig('cdn', 'cloudflare', 'accessKeyId', e.target.value)} />
                        </div>
                        <div className="config-field">
                          <label>Secret Access Key</label>
                          <input type="password" value={config.cdn?.cloudflare?.secretAccessKey || ''} onChange={(e) => updateNestedConfig('cdn', 'cloudflare', 'secretAccessKey', e.target.value)} />
                        </div>
                        <div className="config-field">
                          <label>Public URL <span className="label-optional">(custom domain)</span></label>
                          <input type="text" value={config.cdn?.cloudflare?.publicUrl || ''} onChange={(e) => updateNestedConfig('cdn', 'cloudflare', 'publicUrl', e.target.value)} placeholder="https://media.yourdomain.com" />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="config-group">
                    <h3>Enable CDN</h3>
                    <div className="config-field toggle-row">
                      <div>
                        <span className="toggle-label">Enable CDN Provider</span>
                        <span className="toggle-hint">When disabled, all files are served locally regardless of provider setting.</span>
                      </div>
                      <label className="toggle">
                        <input type="checkbox" checked={config.cdn?.enabled || false} onChange={(e) => updateConfig('cdn', 'enabled', e.target.checked)} />
                        <span className="toggle-slider" />
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'scaling' && (
                <div className="config-section">
                  <h2 className="config-section-title">Horizontal Scaling</h2>
                  <p className="config-section-desc">
                    Run the same Voltage instance across multiple VPS servers behind a load balancer. All nodes share the same database and config — <strong>this is not federation</strong>.
                  </p>

                  {/* Enable toggle */}
                  <div className="config-group">
                    <h3><Network size={16} /> Scaling Mode</h3>
                    <div className="config-field toggle-row">
                      <div>
                        <span className="toggle-label">Enable Multi-Node Scaling</span>
                        <span className="toggle-hint">Activates node registry, heartbeat, and cross-node file routing. Requires a shared database (not SQLite) and Redis.</span>
                      </div>
                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={config?.scaling?.enabled || false}
                          onChange={(e) => updateConfig('scaling', 'enabled', e.target.checked)}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </div>

                    {config?.scaling?.enabled && (
                      <div className="scaling-warning-banner">
                        <ExclamationTriangleIcon size={16} />
                        <span>SQLite does not support multi-node. Use MariaDB, MySQL, PostgreSQL, or CockroachDB in the Storage tab. Redis must also be configured.</span>
                      </div>
                    )}
                  </div>

                  {/* This node identity */}
                  <div className="config-group">
                    <h3><Server size={16} /> This Node</h3>
                    <p className="config-description">These two fields are the <em>only</em> values that differ between nodes. Every other config key should be identical across all your VPS servers.</p>
                    <div className="config-fields-grid">
                      <div className="config-field">
                        <label>Node ID</label>
                        <input
                          type="text"
                          value={config?.scaling?.nodeId || ''}
                          onChange={(e) => updateConfig('scaling', 'nodeId', e.target.value)}
                          placeholder="node-1"
                        />
                        <small>Short unique slug for this VPS. e.g. <code>node-1</code>, <code>vps-nyc</code>, <code>eu-west</code></small>
                      </div>
                      <div className="config-field">
                        <label>Node URL</label>
                        <input
                          type="text"
                          value={config?.scaling?.nodeUrl || ''}
                          onChange={(e) => updateConfig('scaling', 'nodeUrl', e.target.value)}
                          placeholder="http://10.0.0.1:5000"
                        />
                        <small>Internal URL other nodes use to reach this server. Use a private IP, not a public domain.</small>
                      </div>
                    </div>
                  </div>

                  {/* Shared secret */}
                  <div className="config-group">
                    <h3><Key size={16} /> Node Secret</h3>
                    <p className="config-description">All nodes must share the same secret. Node-to-node API calls are rejected without it. Generate with: <code>openssl rand -hex 32</code></p>
                    <div className="config-field secret-field">
                      <label>Node Secret</label>
                      <div className="secret-input-wrap">
                        <input
                          type={showSecrets['nodeSecret'] ? 'text' : 'password'}
                          value={config?.scaling?.nodeSecret || ''}
                          onChange={(e) => updateConfig('scaling', 'nodeSecret', e.target.value)}
                          placeholder="(same on all nodes)"
                        />
                        <button
                          type="button"
                          className="secret-toggle-btn"
                          onClick={() => setShowSecrets(prev => ({ ...prev, nodeSecret: !prev.nodeSecret }))}
                        >
                          {showSecrets['nodeSecret'] ? 'Hide' : 'Show'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Heartbeat & file resolution */}
                  <div className="config-group">
                    <h3><RefreshCw size={16} /> Heartbeat & File Resolution</h3>
                    <div className="config-fields-grid">
                      <div className="config-field">
                        <label>Heartbeat Interval (ms)</label>
                        <input
                          type="number"
                          value={config?.scaling?.heartbeatInterval || 30000}
                          onChange={(e) => updateConfig('scaling', 'heartbeatInterval', parseInt(e.target.value))}
                          min={5000}
                          step={1000}
                        />
                        <small>How often to ping peer nodes. Default: 30000 (30s)</small>
                      </div>
                      <div className="config-field">
                        <label>Heartbeat Timeout (ms)</label>
                        <input
                          type="number"
                          value={config?.scaling?.heartbeatTimeout || 90000}
                          onChange={(e) => updateConfig('scaling', 'heartbeatTimeout', parseInt(e.target.value))}
                          min={10000}
                          step={1000}
                        />
                        <small>Silence before a node is marked offline. Default: 90000 (90s)</small>
                      </div>
                    </div>
                    <div className="config-field">
                      <label>File Resolution Mode</label>
                      <div className="resolution-mode-cards">
                        {[
                          { id: 'proxy',    label: 'Proxy',    desc: 'Stream the file through this node. Peer URLs stay private.' },
                          { id: 'redirect', label: 'Redirect', desc: '302 redirect to the peer node. One fewer hop, but exposes peer URLs.' },
                        ].map(m => (
                          <button
                            key={m.id}
                            type="button"
                            className={`resolution-card ${(config?.scaling?.fileResolutionMode || 'proxy') === m.id ? 'selected' : ''}`}
                            onClick={() => updateConfig('scaling', 'fileResolutionMode', m.id)}
                          >
                            <span className="resolution-card-name">{m.label}</span>
                            <span className="resolution-card-desc">{m.desc}</span>
                          </button>
                        ))}
                      </div>
                      <small>Only relevant when using Local storage. Ignored when NFS or a CDN is configured.</small>
                    </div>
                  </div>

                  {/* Node list config */}
                  <div className="config-group">
                    <h3><Layers size={16} /> All Nodes</h3>
                    <p className="config-description">List every node in the cluster, including this one. This same list goes on every server — only <code>nodeId</code> and <code>nodeUrl</code> at the top change per machine.</p>
                    <div className="nodes-list">
                      {(config?.scaling?.nodes || []).map((node, idx) => (
                        <div key={idx} className="node-config-row">
                          <div className="node-config-fields">
                            <input
                              type="text"
                              value={node.id || ''}
                              onChange={(e) => {
                                const nodes = [...(config.scaling.nodes || [])]
                                nodes[idx] = { ...nodes[idx], id: e.target.value }
                                updateConfig('scaling', 'nodes', nodes)
                              }}
                              placeholder="node-id"
                              className="node-id-input"
                            />
                            <input
                              type="text"
                              value={node.url || ''}
                              onChange={(e) => {
                                const nodes = [...(config.scaling.nodes || [])]
                                nodes[idx] = { ...nodes[idx], url: e.target.value }
                                updateConfig('scaling', 'nodes', nodes)
                              }}
                              placeholder="http://10.0.0.x:5000"
                              className="node-url-input"
                            />
                          </div>
                          <button
                            type="button"
                            className="node-remove-btn"
                            onClick={() => {
                              const nodes = (config.scaling.nodes || []).filter((_, i) => i !== idx)
                              updateConfig('scaling', 'nodes', nodes)
                            }}
                            title="Remove node"
                          >
                            <XMarkIcon size={14} />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="btn btn-secondary node-add-btn"
                        onClick={() => {
                          const nodes = [...(config?.scaling?.nodes || []), { id: '', url: '' }]
                          updateConfig('scaling', 'nodes', nodes)
                        }}
                      >
                        + Add Node
                      </button>
                    </div>
                  </div>

                  {/* Live cluster status */}
                  <div className="config-group">
                    <div className="cluster-status-header">
                      <h3><SignalIcon size={16} /> Live Cluster Status</h3>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={handleRefreshNodes}
                        disabled={scaleState.refreshing || scaleState.loading}
                      >
                        {scaleState.refreshing
                          ? <><ArrowPathIcon size={14} className="spin" /> Refreshing…</>
                          : <><ArrowPathIcon size={14} /> Refresh</>}
                      </button>
                    </div>

                    {!config?.scaling?.enabled && (
                      <div className="cluster-disabled-note">Scaling is disabled. Enable it above to activate the node registry.</div>
                    )}

                    {config?.scaling?.enabled && scaleState.loading && (
                      <div className="cluster-loading"><ArrowPathIcon size={16} className="spin" /> Loading cluster status…</div>
                    )}

                    {config?.scaling?.enabled && scaleState.error && (
                      <div className="cluster-error"><ExclamationTriangleIcon size={16} /> {scaleState.error}</div>
                    )}

                    {config?.scaling?.enabled && scaleState.status && (
                      <>
                        <div className="cluster-summary-row">
                          <div className="cluster-stat">
                            <span className="cluster-stat-value">{scaleState.status.summary?.total ?? '—'}</span>
                            <span className="cluster-stat-label">Total</span>
                          </div>
                          <div className="cluster-stat online">
                            <span className="cluster-stat-value">{scaleState.status.summary?.online ?? '—'}</span>
                            <span className="cluster-stat-label">Online</span>
                          </div>
                          <div className="cluster-stat degraded">
                            <span className="cluster-stat-value">{scaleState.status.summary?.degraded ?? '—'}</span>
                            <span className="cluster-stat-label">Degraded</span>
                          </div>
                          <div className="cluster-stat offline">
                            <span className="cluster-stat-value">{scaleState.status.summary?.offline ?? '—'}</span>
                            <span className="cluster-stat-label">Offline</span>
                          </div>
                          <div className="cluster-stat">
                            <span className="cluster-stat-value">{scaleState.status.fileResolutionMode ?? '—'}</span>
                            <span className="cluster-stat-label">File Mode</span>
                          </div>
                        </div>

                        <div className="node-status-list">
                          {(scaleState.status.nodes || []).map(node => {
                            const testResult = scaleState.testResults[node.id]
                            return (
                              <div key={node.id} className={`node-status-card status-${node.status}`}>
                                <div className="node-status-top">
                                  <div className="node-status-id">
                                    <span className={`node-dot status-${node.status}`} />
                                    <strong>{node.label || node.id}</strong>
                                    {node.isSelf && <span className="node-self-badge">This node</span>}
                                  </div>
                                  <span className={`node-status-pill status-${node.status}`}>{node.status}</span>
                                </div>
                                <div className="node-status-url">{node.url}</div>
                                {node.last_seen > 0 && (
                                  <div className="node-status-seen">
                                    Last seen: {new Date(node.last_seen).toLocaleTimeString()}
                                  </div>
                                )}
                                {testResult && (
                                  <div className={`node-test-result ${testResult.ok ? 'ok' : 'fail'}`}>
                                    {testResult.ok
                                      ? <><CheckIcon size={13} /> Reachable · {testResult.latency}ms</>
                                      : <><ExclamationTriangleIcon size={13} /> {testResult.error}</>}
                                  </div>
                                )}
                                {!node.isSelf && (
                                  <button
                                    type="button"
                                    className="node-test-btn"
                                    onClick={() => handleTestNode(node.id, node.url)}
                                    disabled={scaleState.testingNode === node.id}
                                  >
                                    {scaleState.testingNode === node.id
                                      ? <><ArrowPathIcon size={13} className="spin" /> Testing…</>
                                      : 'Test connection'}
                                  </button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </>
                    )}

                    {config?.scaling?.enabled && !scaleState.status && !scaleState.loading && !scaleState.error && (
                      <div className="cluster-load-prompt">
                        <button type="button" className="btn btn-secondary" onClick={loadScaleStatus}>
                          <SignalIcon size={14} /> Load Cluster Status
                        </button>
                      </div>
                    )}
                  </div>

                  {/* File storage recommendation */}
                  <div className="config-group scaling-storage-tip">
                    <h3><HardDrive size={16} /> File Storage for Scaling</h3>
                    <div className="storage-method-cards">
                      <div className={`storage-method-card ${config?.cdn?.provider === 'nfs' ? 'recommended' : ''}`}>
                        <div className="smc-header">
                          <span className="smc-name">NFS Shared Folder</span>
                          <span className="smc-badge">Recommended</span>
                        </div>
                        <p>Mount a shared folder from your storage master. All nodes write to the same disk. No application changes needed.</p>
                        <button type="button" className="smc-action" onClick={() => setActiveTab('cdn')}>Configure in CDN tab →</button>
                      </div>
                      <div className={`storage-method-card ${(config?.cdn?.provider === 's3' || config?.cdn?.provider === 'cloudflare') ? 'recommended' : ''}`}>
                        <div className="smc-header">
                          <span className="smc-name">Object Storage (S3 / R2)</span>
                          <span className="smc-badge best">Best for large scale</span>
                        </div>
                        <p>Files stored in a bucket. Zero local disk usage. Works across any number of nodes and regions.</p>
                        <button type="button" className="smc-action" onClick={() => setActiveTab('cdn')}>Configure in CDN tab →</button>
                      </div>
                      <div className={`storage-method-card ${config?.cdn?.provider === 'local' && config?.scaling?.enabled ? 'active' : ''}`}>
                        <div className="smc-header">
                          <span className="smc-name">Peer-Proxy (Built-in)</span>
                        </div>
                        <p>No extra infrastructure. When a file isn't on this node, Voltage asks peers and proxies the response. Auto-active when scaling is enabled.</p>
                        <span className="smc-auto">Active automatically when scaling is enabled with local storage</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'federation' && config?.federation && (
                <div className="config-section">
                  <h2 className="config-section-title">{t('adminConfig.sections.federation.title', 'Federation')}</h2>
                  <p className="config-section-desc">{t('adminConfig.sections.federation.desc', 'Connect with other VoltChat instances.')}</p>
                  <div className="config-group">
                    <h3>{t('adminConfig.sections.federation.federationSettings', 'Federation')}</h3>
                    <div className="config-field checkbox">
                      <label><input type="checkbox" checked={config.federation.enabled || false} onChange={(e) => updateConfig('federation', 'enabled', e.target.checked)} /> {t('adminConfig.fields.enableFederation', 'Enable Federation')}</label>
                    </div>
                    {config.federation.enabled && (
                      <>
                        <div className="config-field">
                          <label>{t('adminConfig.fields.federationServerName', 'Server Name')}</label>
                          <input type="text" value={config.federation.serverName || ''} onChange={(e) => updateConfig('federation', 'serverName', e.target.value)} placeholder={t('adminConfig.placeholders.yourServerDomain', 'your-server.com')} />
                        </div>
                        <div className="config-field">
                          <label>{t('adminConfig.fields.maxHops', 'Max Hops')}</label>
                          <input type="number" value={config.federation.maxHops || 3} onChange={(e) => updateConfig('federation', 'maxHops', parseInt(e.target.value))} min={1} max={10} />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'advanced' && (
                <div className="config-section">
                  <h2 className="config-section-title">{t('adminConfig.sections.advanced.title', 'Advanced')}</h2>
                  <p className="config-section-desc">{t('adminConfig.sections.advanced.desc', 'Branding, caching, queues, and monitoring.')}</p>
                  <div className="config-group">
                    <h3>{t('adminConfig.sections.advanced.branding', 'Branding')}</h3>
                    <div className="config-field">
                      <label>{t('adminConfig.fields.primaryColor', 'Primary Color')}</label>
                      <input type="color" value={config.branding?.primaryColor || '#5865f2'} onChange={(e) => updateConfig('branding', 'primaryColor', e.target.value)} />
                    </div>
                    <div className="config-field">
                      <label>{t('adminConfig.fields.accentColor', 'Accent Color')}</label>
                      <input type="color" value={config.branding?.accentColor || '#7289da'} onChange={(e) => updateConfig('branding', 'accentColor', e.target.value)} />
                    </div>
                  </div>
                  
                  {config.cache !== undefined && (
                    <div className="config-group">
                      <h3>{t('adminConfig.sections.advanced.cache', 'Cache')}</h3>
                      <div className="config-field checkbox">
                        <label><input type="checkbox" checked={config.cache?.enabled || false} onChange={(e) => updateConfig('cache', 'enabled', e.target.checked)} /> {t('adminConfig.fields.enableCache', 'Enable Cache')}</label>
                      </div>
                      <div className="config-field">
                        <label>{t('adminConfig.fields.cacheProvider', 'Cache Provider')}</label>
                        <select value={config.cache?.provider || 'memory'} onChange={(e) => updateConfig('cache', 'provider', e.target.value)}>
                          <option value="memory">{t('adminConfig.options.memory', 'Memory')}</option>
                          <option value="redis">{t('adminConfig.storageTypes.redis.name', 'Redis')}</option>
                        </select>
                      </div>
                    </div>
                  )}
                  
                  {config.queue !== undefined && (
                    <div className="config-group">
                      <h3>{t('adminConfig.sections.advanced.queue', 'Queue')}</h3>
                      <div className="config-field checkbox">
                        <label><input type="checkbox" checked={config.queue?.enabled || false} onChange={(e) => updateConfig('queue', 'enabled', e.target.checked)} /> {t('adminConfig.fields.enableQueue', 'Enable Queue')}</label>
                      </div>
                      <div className="config-field">
                        <label>{t('adminConfig.fields.queueProvider', 'Queue Provider')}</label>
                        <select value={config.queue?.provider || 'memory'} onChange={(e) => updateConfig('queue', 'provider', e.target.value)}>
                          <option value="memory">{t('adminConfig.options.memory', 'Memory')}</option>
                          <option value="redis">{t('adminConfig.storageTypes.redis.name', 'Redis')}</option>
                        </select>
                      </div>
                    </div>
                  )}
                  
                  {config.monitoring !== undefined && (
                    <div className="config-group">
                      <h3>{t('adminConfig.sections.advanced.monitoring', 'Monitoring')}</h3>
                      <div className="config-field checkbox">
                        <label><input type="checkbox" checked={config.monitoring?.enabled || false} onChange={(e) => updateConfig('monitoring', 'enabled', e.target.checked)} /> {t('adminConfig.fields.enableMonitoring', 'Enable Monitoring')}</label>
                      </div>
                    </div>
                  )}

                  <div className="config-group">
                    <h3><CogIcon size={18} /> {t('adminConfig.operations.title', 'Server Operations')}</h3>
                    <p className="config-description">{t('adminConfig.operations.desc', 'Restart the server, install missing drivers, and inspect logs/issues in one place.')}</p>

                    <div className="operations-actions">
                      <button
                        className="btn btn-secondary"
                        onClick={loadOperationsInfo}
                        disabled={opsState.loading}
                      >
                        {opsState.loading
                          ? <><ArrowPathIcon size={16} className="spin" /> {t('adminConfig.operations.refreshing', 'Refreshing...')}</>
                          : <><ArrowPathIcon size={16} /> {t('adminConfig.operations.refresh', 'Refresh Diagnostics')}</>}
                      </button>

                      <button
                        className="btn btn-danger"
                        onClick={handleRestartVoltage}
                        disabled={opsState.restartPending}
                      >
                        {opsState.restartPending
                          ? <><ArrowPathIcon size={16} className="spin" /> {t('adminConfig.operations.restarting', 'Restarting...')}</>
                          : <><PowerIcon size={16} /> {t('adminConfig.operations.restart', 'Restart Voltage')}</>}
                      </button>
                    </div>

                    {opsState.issues?.issues && (
                      <div className="ops-issues-grid">
                        <div className="ops-card">
                          <h4>{t('adminConfig.operations.errors', 'Errors')}</h4>
                          {opsState.issues.issues.errors?.length
                            ? opsState.issues.issues.errors.map((err, idx) => <div key={`err-${idx}`} className="ops-line error">{err}</div>)
                            : <div className="ops-line muted">{t('adminConfig.operations.none', 'None')}</div>}
                        </div>
                        <div className="ops-card">
                          <h4>{t('adminConfig.operations.warnings', 'Warnings')}</h4>
                          {opsState.issues.issues.warnings?.length
                            ? opsState.issues.issues.warnings.map((warn, idx) => <div key={`warn-${idx}`} className="ops-line warning">{warn}</div>)
                            : <div className="ops-line muted">{t('adminConfig.operations.none', 'None')}</div>}
                        </div>
                      </div>
                    )}

                    {opsState.logs?.logs?.length > 0 && (
                      <div className="ops-logs-wrap">
                        <h4><DocumentTextIcon size={16} /> {t('adminConfig.operations.logs', 'Server Logs')}</h4>
                        <div className="ops-log-list">
                          {opsState.logs.logs.map((entry) => (
                            <details key={entry.file} className="ops-log-item">
                              <summary>{entry.file} <span>{new Date(entry.updatedAt).toLocaleString()}</span></summary>
                              <pre>{entry.content || ''}</pre>
                            </details>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'migration' && (
                <div className="config-section">
                  <h2 className="config-section-title">{t('adminConfig.migration.title', 'Database Migration')}</h2>
                  <p className="config-section-desc">{t('adminConfig.migration.desc', 'Migrate your data between different database backends.')}</p>
                  <div className="config-group">
                    <h3><CircleStackIcon size={18} /> {t('adminConfig.migration.tool', 'Migration Tool')}</h3>
                    <p className="config-description">
                      {t('adminConfig.migration.toolDesc', 'Migrate your data between different database types. A backup will be created automatically.')}
                    </p>
                    
                    <div className="migration-current">
                      <strong>{t('adminConfig.migration.currentDatabase', 'Current Database')}:</strong> 
                      <span className={`db-badge ${migrationState.currentType}`}>
                        {migrationState.currentType?.toUpperCase() || t('adminConfig.storageTypes.json.name', 'JSON Files')}
                      </span>
                    </div>
                    
                    <div className="migration-types">
                      <h4>{t('adminConfig.migration.selectTarget', 'Select Target Database')}</h4>
                      <p className="config-description" style={{ marginTop: 0 }}>
                        {t('adminConfig.migration.selectTargetDesc', 'All database types are available — the database can be running locally or on a remote server. Select a target and enter connection details below.')}
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
                                <span className="type-name">{t(`adminConfig.storageTypes.${type.id}.name`, type.name)}</span>
                                {isCurrent && <span className="current-badge">{t('adminConfig.migration.current', 'Current')}</span>}
                                {!isCurrent && driverInstalled && <span className="driver-badge ready">{t('adminConfig.migration.driverReady', 'Driver Ready')}</span>}
                                {!isCurrent && !driverInstalled && type.id !== 'json' && <span className="driver-badge needs-install">{t('adminConfig.migration.driverNeeded', 'Driver Needed')}</span>}
                              </div>
                              <p className="type-desc">{t(`adminConfig.storageTypes.${type.id}.desc`, type.desc)}</p>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    
                    {migrationState.showConfigForm && migrationState.selectedType && (
                      <div className="migration-config">
                        <h4>{t('adminConfig.migration.configure', 'Configure {{name}}', { name: t(`adminConfig.storageTypes.${migrationState.selectedType}.name`, STORAGE_TYPES.find(st => st.id === migrationState.selectedType)?.name || migrationState.selectedType) })}</h4>
                        
                        {!migrationState.dependencies[migrationState.selectedType]?.available && migrationState.selectedType !== 'json' && (
                          <div className="migration-driver-warning">
                            <ExclamationTriangleIcon size={16} />
                            <div>
                              <strong>{t('adminConfig.migration.driverNotInstalled', 'Node.js driver not installed locally')}</strong>
                              <p>
                                {t('adminConfig.migration.driverNotInstalledDesc', 'The required npm package for {{name}} is not installed on this server yet. You can still configure the connection details for a remote database.', { name: t(`adminConfig.storageTypes.${migrationState.selectedType}.name`, STORAGE_TYPES.find(st => st.id === migrationState.selectedType)?.name || migrationState.selectedType) })}{' '}
                                {t('adminConfig.migration.installDriver', 'Install the driver before migrating')}: <code>npm install {migrationState.selectedType === 'sqlite' ? 'better-sqlite3' : migrationState.selectedType === 'postgres' || migrationState.selectedType === 'cockroachdb' ? 'pg' : migrationState.selectedType === 'mysql' ? 'mysql2' : migrationState.selectedType}</code>
                              </p>
                              <button
                                className="btn btn-secondary migration-install-btn"
                                onClick={() => handleInstallDriver(migrationState.selectedType)}
                                disabled={opsState.installingType === migrationState.selectedType}
                              >
                                {opsState.installingType === migrationState.selectedType
                                  ? <><ArrowPathIcon size={14} className="spin" /> {t('adminConfig.operations.installingDriver', 'Installing driver...')}</>
                                  : <><CubeIcon size={14} /> {t('adminConfig.operations.installDriverButton', 'Install Driver')}</>}
                              </button>
                            </div>
                          </div>
                        )}
                        
                        <p className="config-description" style={{ marginTop: 0, marginBottom: 16 }}>
                          {t('adminConfig.migration.connectionDetails', 'Enter the connection details below. The database can be on this server or a remote host.')}
                        </p>
                        
                        <div className="config-fields">
                          {getDefaultConfigFields(migrationState.selectedType).map(field => (
                            <div key={field.name} className="config-field">
                              <label>{t(MIGRATION_FIELD_LOCALIZATION[field.name]?.labelKey || '', MIGRATION_FIELD_LOCALIZATION[field.name]?.labelDefault || field.label)}</label>
                              {field.type === 'checkbox' ? (
                                <label className="checkbox-label">
                                  <input 
                                    type="checkbox" 
                                    checked={migrationState.targetConfig[field.name] ?? field.default}
                                    onChange={(e) => handleConfigChange(field.name, e.target.checked)}
                                  />
                                  {t('adminConfig.actions.enable', 'Enable')}
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
                              <><CheckIcon size={16} /> {t('adminConfig.migration.connectionSuccess', 'Connection successful!')}</>
                            ) : (
                              <><ExclamationTriangleIcon size={16} /> {migrationState.testingResult.error || t('adminConfig.migration.connectionFailed', 'Connection failed')}</>
                            )}
                          </div>
                        )}
                        
                        <div className="migration-actions">
                          <button 
                            className="btn btn-secondary"
                            onClick={handleTestConnection}
                            disabled={migrationState.testing}
                          >
                            {migrationState.testing ? <><ArrowPathIcon size={16} className="spin" /> {t('adminConfig.migration.testing', 'Testing...')} </> : t('adminConfig.migration.testConnection', 'Test Connection')}
                          </button>
                          
                          <button 
                            className="btn btn-primary"
                            onClick={handleMigrate}
                            disabled={migrationState.migrating || !migrationState.testingResult?.success}
                          >
                            {migrationState.migrating ? (
                              <><ArrowPathIcon size={16} className="spin" /> {t('adminConfig.migration.migrating', 'Migrating...')} </>
                            ) : (
                              <><ArrowRightIcon size={16} /> {t('adminConfig.migration.migrateDatabase', 'Migrate Database')}</>
                            )}
                          </button>
                        </div>
                        
                        {migrationState.migrationResult && (
                          <div className={`migration-result ${migrationState.migrationResult.success ? 'success' : 'error'}`}>
                            {migrationState.migrationResult.success ? (
                              <>
                                <CheckIcon size={16} />
                                <div>
                                  <strong>{t('adminConfig.migration.complete', 'Migration Complete!')}</strong>
                                  <p>{t('adminConfig.migration.completeDesc', 'The configuration has been updated. Please restart the server to complete the migration.')}</p>
                                  {migrationState.migrationResult.steps?.map((step, i) => (
                                    <div key={i} className="migration-step">
                                      {step.status === 'completed' ? <CheckIcon size={14} /> : <ArrowPathIcon size={14} className="spin" />}
                                      <span>{step.step}: {t(`adminConfig.migration.stepStatus.${step.status}`, step.status)}</span>
                                    </div>
                                  ))}
                                </div>
                              </>
                            ) : (
                              <>
                                <ExclamationTriangleIcon size={16} />
                                <div>
                                  <strong>{t('adminConfig.migration.failed', 'Migration Failed')}</strong>
                                  <p>{migrationState.migrationResult.error || t('adminConfig.migration.failedDesc', 'An error occurred during migration.')}</p>
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
                <div className="json-error"><ExclamationTriangleIcon size={14} /> {jsonError}</div>
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
            <ArrowUturnDownIcon size={16} /> {t('adminConfig.actions.reset', 'Reset')}
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || (viewMode === 'json' && !!jsonError)}>
            <DocumentCheckIcon size={16} /> {saving ? t('adminConfig.actions.saving', 'Saving...') : t('adminConfig.actions.saveChanges', 'Save Changes')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default AdminConfigModal
