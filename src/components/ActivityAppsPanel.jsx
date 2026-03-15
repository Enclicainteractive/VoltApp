import React, { useState, useEffect, useRef } from 'react'
import { PuzzlePieceIcon, PlusIcon, TrashIcon, ArrowPathIcon, ClipboardDocumentIcon, EyeIcon, EyeSlashIcon, KeyIcon, GlobeAltIcon, RocketLaunchIcon } from '@heroicons/react/24/outline'
import { useTranslation } from '../hooks/useTranslation'
import { apiService } from '../services/apiService'
import './BotPanel.css'

const defaultForm = {
  name: '',
  description: '',
  launchUrl: '',
  iconUrl: '',
  category: 'Custom',
  participantCap: 16,
  redirectUris: '',
  scopes: 'activities:read activities:state:write',
  visibility: 'public',
  federated: true
}

const ActivityAppsPanel = () => {
  const { t } = useTranslation()
  const [myApps, setMyApps] = useState([])
  const [catalog, setCatalog] = useState([])
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedApp, setSelectedApp] = useState(null)
  const [createdCreds, setCreatedCreds] = useState(null)
  const [showSecret, setShowSecret] = useState(false)
  const [form, setForm] = useState(defaultForm)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const editorRef = useRef(null)

  const loadApps = async () => {
    setLoading(true)
    try {
      const [appsRes, catRes] = await Promise.all([
        apiService.getMyActivityApps(),
        apiService.getActivitiesCatalog()
      ])
      setMyApps(Array.isArray(appsRes?.data?.items) ? appsRes.data.items : [])
      setCatalog(Array.isArray(catRes?.data?.items) ? catRes.data.items : [])
    } catch (err) {
      if (err?.response?.status !== 404) {
        console.error('Failed to load activity apps:', err)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadApps() }, [])

  useEffect(() => {
    if (showCreate || selectedApp) {
      requestAnimationFrame(() => {
        editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }, [showCreate, selectedApp])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.name || !form.launchUrl) return
    setBusy(true)
    setError('')
    setCreatedCreds(null)
    try {
      const payload = {
        ...form,
        redirectUris: form.redirectUris
          .split(/[\n,]/)
          .map(v => v.trim())
          .filter(Boolean),
        scopes: form.scopes
          .split(/[\s,]+/)
          .map(v => v.trim())
          .filter(Boolean)
      }
      const res = await apiService.createActivityApp(payload)
      const data = res?.data || {}
      setCreatedCreds({
        app: data.app,
        clientSecret: data.clientSecret
      })
      setForm(defaultForm)
      loadApps()
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to create activity app')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (appId) => {
    if (!confirm(t('botsPanel.deleteConfirm', 'Delete this app? This cannot be undone.'))) return
    try {
      await apiService.deleteActivityApp(appId)
      setMyApps(prev => prev.filter(a => a.id !== appId))
      if (selectedApp?.id === appId) setSelectedApp(null)
    } catch (err) {
      console.error('Failed to delete app:', err)
    }
  }

  const handleRotateSecret = async (appId) => {
    if (!confirm(t('botsPanel.regenerateConfirm', 'Regenerate secret? The old secret will stop working immediately.'))) return
    try {
      const res = await apiService.rotateActivityAppSecret(appId)
      setCreatedCreds({ app: res?.data?.app || selectedApp, clientSecret: res?.data?.clientSecret || '' })
    } catch (err) {
      console.error('Failed to rotate secret:', err)
    }
  }

  const handlePublish = async (app) => {
    try {
      await apiService.publishPublicActivity({
        name: app.name,
        description: app.description,
        launchUrl: app.launchUrl,
        iconUrl: app.iconUrl,
        category: app.category,
        participantCap: app.participantCap,
        scopes: app.scopes,
        federated: app.federated
      })
      loadApps()
    } catch (err) {
      console.error('Failed to publish:', err)
    }
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
  }

  const publishedApps = myApps.filter(a => a.isPublic)
  const unpublishedApps = myApps.filter(a => !a.isPublic)

  return (
    <div className="bot-panel">
      {createdCreds && (
        <div className="token-reveal">
          <div className="token-header">
            <KeyIcon size={16} />
            <strong>Activity App Created</strong>
          </div>
          <p className="token-warning">Copy these credentials now. The secret will not be shown again.</p>
          <div className="token-field">
            <label>Client ID</label>
            <div className="token-value">
              <code>{createdCreds?.app?.clientId || 'N/A'}</code>
              <button className="btn btn-sm btn-ghost" onClick={() => createdCreds?.app?.clientId && copyToClipboard(createdCreds.app.clientId)}>
                <ClipboardDocumentIcon size={14} />
              </button>
            </div>
          </div>
          <div className="token-field">
            <label>Client Secret</label>
            <div className="token-value">
              <code>{showSecret ? createdCreds.clientSecret : createdCreds.clientSecret.slice(0, 8) + '...' + createdCreds.clientSecret.slice(-4)}</code>
              <button className="btn btn-sm btn-ghost" onClick={() => setShowSecret(!showSecret)}>
                {showSecret ? <EyeSlashIcon size={14} /> : <EyeIcon size={14} />}
              </button>
              <button className="btn btn-sm btn-ghost" onClick={() => copyToClipboard(createdCreds.clientSecret)}>
                <ClipboardDocumentIcon size={14} />
              </button>
            </div>
          </div>
          <button className="btn btn-sm btn-primary" onClick={() => { setCreatedCreds(null); setShowSecret(false) }}>Done</button>
        </div>
      )}

      <div className="panel-section">
        <div className="section-header">
          <h3>My Activity Apps</h3>
          <div className="section-actions">
            <button type="button" className="btn btn-sm btn-ghost" onClick={loadApps} title="Refresh"><ArrowPathIcon size={14} /></button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => {
                setShowCreate(true)
                setSelectedApp(null)
                setCreatedCreds(null)
                setShowSecret(false)
                setError('')
              }}
            >
              <PlusIcon size={14} /> Create Activity App
            </button>
          </div>
        </div>

        {loading ? (
          <div className="loading-state">Loading apps...</div>
        ) : myApps.length === 0 && !showCreate ? (
          <div className="empty-state-small">
            <RocketLaunchIcon size={32} className="empty-icon" />
            <p>No activity apps yet. Create one to add activities to voice channels.</p>
          </div>
        ) : (
          <div className="bot-list">
            {unpublishedApps.map(app => (
              <div
                key={app.id}
                className={`bot-item ${selectedApp?.id === app.id ? 'selected' : ''}`}
                onClick={() => { setSelectedApp(app); setShowCreate(false) }}
              >
                <div className="bot-avatar">
                  <PuzzlePieceIcon size={20} />
                </div>
                <div className="bot-info">
                  <div className="bot-name">{app.name}</div>
                  <div className="bot-meta">
                    <span className="bot-status draft">Draft</span>
                    <span className="bot-servers">{app.participantCap || 16} participants</span>
                  </div>
                </div>
                <button className="btn btn-sm btn-ghost btn-danger" onClick={(e) => { e.stopPropagation(); handleDelete(app.id) }}>
                  <TrashIcon size={14} />
                </button>
              </div>
            ))}
            {publishedApps.map(app => (
              <div
                key={app.id}
                className={`bot-item ${selectedApp?.id === app.id ? 'selected' : ''}`}
                onClick={() => { setSelectedApp(app); setShowCreate(false) }}
              >
                <div className="bot-avatar">
                  <GlobeAltIcon size={20} />
                </div>
                <div className="bot-info">
                  <div className="bot-name">{app.name}</div>
                  <div className="bot-meta">
                    <span className="bot-status live">Published</span>
                    <span className="bot-servers">{app.participantCap || 16} participants</span>
                  </div>
                </div>
                <button className="btn btn-sm btn-ghost btn-danger" onClick={(e) => { e.stopPropagation(); handleDelete(app.id) }}>
                  <TrashIcon size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {(showCreate || selectedApp) && (
        <div className="bot-editor" ref={editorRef}>
          <h3>{showCreate ? 'Create Activity App' : `Edit: ${selectedApp.name}`}</h3>

          {error && <div className="form-error">{error}</div>}

          <form onSubmit={showCreate ? handleCreate : (e) => { e.preventDefault() }}>
            <div className="form-group">
              <label>App Name</label>
              <input
                value={showCreate ? form.name : (selectedApp?.name || '')}
                onChange={e => showCreate ? setForm(p => ({ ...p, name: e.target.value })) : setSelectedApp(p => ({ ...p, name: e.target.value }))}
                placeholder="My Awesome Activity"
                maxLength={32}
              />
            </div>

            <div className="form-group">
              <label>Description</label>
              <textarea
                value={showCreate ? form.description : (selectedApp?.description || '')}
                onChange={e => showCreate ? setForm(p => ({ ...p, description: e.target.value })) : setSelectedApp(p => ({ ...p, description: e.target.value }))}
                placeholder="What does this activity do?"
                rows={2}
              />
            </div>

            <div className="form-group">
              <label>Launch URL</label>
              <input
                value={showCreate ? form.launchUrl : (selectedApp?.launchUrl || '')}
                onChange={e => showCreate ? setForm(p => ({ ...p, launchUrl: e.target.value })) : setSelectedApp(p => ({ ...p, launchUrl: e.target.value }))}
                placeholder="https://my-site.com/activity"
              />
            </div>

            <div className="form-group">
              <label>Icon URL (optional)</label>
              <input
                value={showCreate ? form.iconUrl : (selectedApp?.iconUrl || '')}
                onChange={e => showCreate ? setForm(p => ({ ...p, iconUrl: e.target.value })) : setSelectedApp(p => ({ ...p, iconUrl: e.target.value }))}
                placeholder="https://my-site.com/icon.png"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Category</label>
                <select
                  value={showCreate ? form.category : (selectedApp?.category || 'Custom')}
                  onChange={e => showCreate ? setForm(p => ({ ...p, category: e.target.value })) : setSelectedApp(p => ({ ...p, category: e.target.value }))}
                >
                  <option value="Custom">Custom</option>
                  <option value="collab">Collaboration</option>
                  <option value="party">Party</option>
                  <option value="utility">Utility</option>
                  <option value="media">Media</option>
                  <option value="creative">Creative</option>
                </select>
              </div>

              <div className="form-group">
                <label>Participant Cap</label>
                <input
                  type="number"
                  value={showCreate ? form.participantCap : (selectedApp?.participantCap || 16)}
                  onChange={e => showCreate ? setForm(p => ({ ...p, participantCap: parseInt(e.target.value) || 16 })) : setSelectedApp(p => ({ ...p, participantCap: parseInt(e.target.value) || 16 }))}
                  min={2}
                  max={100}
                  style={{ width: 80 }}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Redirect URIs (one per line)</label>
              <textarea
                value={showCreate ? form.redirectUris : (selectedApp?.redirectUris?.join('\n') || '')}
                onChange={e => showCreate ? setForm(p => ({ ...p, redirectUris: e.target.value })) : setSelectedApp(p => ({ ...p, redirectUris: e.target.value.split('\n').filter(Boolean) }))}
                placeholder="https://my-site.com/callback"
                rows={2}
              />
            </div>

            <div className="form-group">
              <label>Scopes</label>
              <input
                value={showCreate ? form.scopes : (selectedApp?.scopes?.join(' ') || '')}
                onChange={e => showCreate ? setForm(p => ({ ...p, scopes: e.target.value })) : setSelectedApp(p => ({ ...p, scopes: e.target.value.split(' ').filter(Boolean) }))}
                placeholder="activities:read activities:state:write"
              />
            </div>

            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={showCreate ? form.federated : (selectedApp?.federated ?? true)}
                  onChange={e => showCreate ? setForm(p => ({ ...p, federated: e.target.checked })) : setSelectedApp(p => ({ ...p, federated: e.target.checked }))}
                />
                Allow federation (cross-server usage)
              </label>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Creating...' : (showCreate ? 'Create Activity App' : 'Save Changes')}
              </button>
              {showCreate && (
                <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
              )}
              {!showCreate && selectedApp && !selectedApp.isPublic && (
                <button type="button" className="btn btn-secondary" onClick={() => handlePublish(selectedApp)}>
                  <GlobeAltIcon size={14} /> Publish to Directory
                </button>
              )}
              {!showCreate && selectedApp && (
                <button type="button" className="btn btn-warning" onClick={() => handleRotateSecret(selectedApp.id)}>
                  <KeyIcon size={14} /> Rotate Secret
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

export default ActivityAppsPanel
