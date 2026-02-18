import React, { useState, useEffect } from 'react'
import { Bot, Plus, Trash2, RefreshCw, Copy, Eye, EyeOff, Settings, Server, Key, Globe, Code } from 'lucide-react'
import { apiService } from '../services/apiService'
import './BotPanel.css'

const ALL_PERMISSIONS = [
  { id: 'messages:read', label: 'Read Messages' },
  { id: 'messages:send', label: 'Send Messages' },
  { id: 'messages:delete', label: 'Delete Messages' },
  { id: 'channels:read', label: 'Read Channels' },
  { id: 'channels:manage', label: 'Manage Channels' },
  { id: 'members:read', label: 'Read Members' },
  { id: 'members:manage', label: 'Manage Members' },
  { id: 'reactions:add', label: 'Add Reactions' },
  { id: 'voice:connect', label: 'Connect to Voice' },
  { id: 'server:manage', label: 'Manage Server' }
]

const ALL_INTENTS = [
  { id: 'GUILD_MESSAGES', label: 'Server Messages' },
  { id: 'DIRECT_MESSAGES', label: 'Direct Messages' },
  { id: 'GUILD_MEMBERS', label: 'Member Events' },
  { id: 'GUILD_VOICE', label: 'Voice Events' },
  { id: 'GUILD_REACTIONS', label: 'Reaction Events' },
  { id: 'GUILD_CHANNELS', label: 'Channel Events' },
  { id: 'MESSAGE_CONTENT', label: 'Message Content' }
]

const BotPanel = () => {
  const [bots, setBots] = useState([])
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedBot, setSelectedBot] = useState(null)
  const [newToken, setNewToken] = useState(null)
  const [showToken, setShowToken] = useState(false)
  const [form, setForm] = useState({
    name: '',
    description: '',
    prefix: '!',
    permissions: ['messages:read', 'messages:send'],
    intents: ['GUILD_MESSAGES', 'MESSAGE_CONTENT'],
    webhookUrl: '',
    public: false
  })

  const loadBots = async () => {
    setLoading(true)
    try {
      const res = await apiService.getMyBots()
      setBots(res.data || [])
    } catch (err) {
      console.error('Failed to load bots:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadBots() }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.name) return
    try {
      const res = await apiService.createBot(form)
      const created = res.data
      setNewToken(created.token)
      setShowCreate(false)
      setForm({ name: '', description: '', prefix: '!', permissions: ['messages:read', 'messages:send'], intents: ['GUILD_MESSAGES', 'MESSAGE_CONTENT'], webhookUrl: '', public: false })
      loadBots()
    } catch (err) {
      console.error('Failed to create bot:', err)
    }
  }

  const handleDelete = async (botId) => {
    if (!confirm('Delete this bot? This cannot be undone.')) return
    try {
      await apiService.deleteBot(botId)
      setBots(prev => prev.filter(b => b.id !== botId))
      if (selectedBot?.id === botId) setSelectedBot(null)
    } catch (err) {
      console.error('Failed to delete bot:', err)
    }
  }

  const handleRegenToken = async (botId) => {
    if (!confirm('Regenerate token? The old token will stop working immediately.')) return
    try {
      const res = await apiService.regenerateBotToken(botId)
      setNewToken(res.data.token)
    } catch (err) {
      console.error('Failed to regenerate token:', err)
    }
  }

  const handleUpdateBot = async () => {
    if (!selectedBot) return
    try {
      const res = await apiService.updateBot(selectedBot.id, {
        name: selectedBot.name,
        description: selectedBot.description,
        prefix: selectedBot.prefix,
        permissions: selectedBot.permissions,
        intents: selectedBot.intents,
        webhookUrl: selectedBot.webhookUrl,
        public: selectedBot.public
      })
      setBots(prev => prev.map(b => b.id === selectedBot.id ? res.data : b))
      setSelectedBot(res.data)
    } catch (err) {
      console.error('Failed to update bot:', err)
    }
  }

  const togglePermission = (perm) => {
    if (showCreate) {
      setForm(p => ({
        ...p,
        permissions: p.permissions.includes(perm)
          ? p.permissions.filter(pp => pp !== perm)
          : [...p.permissions, perm]
      }))
    } else if (selectedBot) {
      setSelectedBot(p => ({
        ...p,
        permissions: p.permissions.includes(perm)
          ? p.permissions.filter(pp => pp !== perm)
          : [...p.permissions, perm]
      }))
    }
  }

  const toggleIntent = (intent) => {
    if (showCreate) {
      setForm(p => ({
        ...p,
        intents: p.intents.includes(intent)
          ? p.intents.filter(i => i !== intent)
          : [...p.intents, intent]
      }))
    } else if (selectedBot) {
      setSelectedBot(p => ({
        ...p,
        intents: p.intents.includes(intent)
          ? p.intents.filter(i => i !== intent)
          : [...p.intents, intent]
      }))
    }
  }

  const activePerms = showCreate ? form.permissions : (selectedBot?.permissions || [])
  const activeIntents = showCreate ? form.intents : (selectedBot?.intents || [])

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="bot-panel">
      {newToken && (
        <div className="token-reveal">
          <div className="token-header">
            <Key size={16} />
            <strong>Bot Token Created</strong>
          </div>
          <p className="token-warning">Copy this token now. It will not be shown again.</p>
          <div className="token-value">
            <code>{showToken ? newToken : newToken.slice(0, 10) + '...' + newToken.slice(-6)}</code>
            <button className="btn btn-sm btn-ghost" onClick={() => setShowToken(!showToken)}>
              {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => copyToClipboard(newToken)}>
              <Copy size={14} />
            </button>
          </div>
          <button className="btn btn-sm btn-primary" onClick={() => { setNewToken(null); setShowToken(false) }}>Done</button>
        </div>
      )}

      <div className="panel-section">
        <div className="section-header">
          <h3>My Bots</h3>
          <div className="section-actions">
            <button className="btn btn-sm btn-ghost" onClick={loadBots}><RefreshCw size={14} /></button>
            <button className="btn btn-sm btn-primary" onClick={() => { setShowCreate(true); setSelectedBot(null) }}>
              <Plus size={14} /> Create Bot
            </button>
          </div>
        </div>

        {loading ? (
          <div className="loading-state">Loading bots...</div>
        ) : bots.length === 0 && !showCreate ? (
          <div className="empty-state-small">
            <Bot size={32} className="empty-icon" />
            <p>No bots yet. Create one to automate your servers.</p>
          </div>
        ) : (
          <div className="bot-list">
            {bots.map(bot => (
              <div
                key={bot.id}
                className={`bot-item ${selectedBot?.id === bot.id ? 'selected' : ''}`}
                onClick={() => { setSelectedBot(bot); setShowCreate(false) }}
              >
                <div className="bot-avatar">
                  <Bot size={20} />
                </div>
                <div className="bot-info">
                  <div className="bot-name">{bot.name}</div>
                  <div className="bot-meta">
                    <span className={`bot-status ${bot.status}`}>{bot.status}</span>
                    <span className="bot-servers">{bot.servers?.length || 0} servers</span>
                  </div>
                </div>
                <button className="btn btn-sm btn-ghost btn-danger" onClick={(e) => { e.stopPropagation(); handleDelete(bot.id) }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {(showCreate || selectedBot) && (
        <div className="bot-editor">
          <h3>{showCreate ? 'Create Bot' : `Edit: ${selectedBot.name}`}</h3>

          <form onSubmit={showCreate ? handleCreate : (e) => { e.preventDefault(); handleUpdateBot() }}>
            <div className="form-group">
              <label>Name</label>
              <input
                value={showCreate ? form.name : (selectedBot?.name || '')}
                onChange={e => showCreate ? setForm(p => ({ ...p, name: e.target.value })) : setSelectedBot(p => ({ ...p, name: e.target.value }))}
                placeholder="My Bot"
                maxLength={32}
              />
            </div>

            <div className="form-group">
              <label>Description</label>
              <textarea
                value={showCreate ? form.description : (selectedBot?.description || '')}
                onChange={e => showCreate ? setForm(p => ({ ...p, description: e.target.value })) : setSelectedBot(p => ({ ...p, description: e.target.value }))}
                placeholder="What does this bot do?"
                rows={2}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Command Prefix</label>
                <input
                  value={showCreate ? form.prefix : (selectedBot?.prefix || '!')}
                  onChange={e => showCreate ? setForm(p => ({ ...p, prefix: e.target.value })) : setSelectedBot(p => ({ ...p, prefix: e.target.value }))}
                  maxLength={5}
                  style={{ width: 60 }}
                />
              </div>

              <div className="form-group">
                <label>Webhook URL (optional)</label>
                <input
                  value={showCreate ? form.webhookUrl : (selectedBot?.webhookUrl || '')}
                  onChange={e => showCreate ? setForm(p => ({ ...p, webhookUrl: e.target.value })) : setSelectedBot(p => ({ ...p, webhookUrl: e.target.value }))}
                  placeholder="https://my-server.com/webhook"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={showCreate ? form.public : (selectedBot?.public || false)}
                  onChange={e => showCreate ? setForm(p => ({ ...p, public: e.target.checked })) : setSelectedBot(p => ({ ...p, public: e.target.checked }))}
                />
                List in public bot directory
              </label>
            </div>

            <div className="form-group">
              <label>Permissions</label>
              <div className="checkbox-grid">
                {ALL_PERMISSIONS.map(p => (
                  <label key={p.id} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={activePerms.includes(p.id)}
                      onChange={() => togglePermission(p.id)}
                    />
                    {p.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>Intents</label>
              <div className="checkbox-grid">
                {ALL_INTENTS.map(i => (
                  <label key={i.id} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={activeIntents.includes(i.id)}
                      onChange={() => toggleIntent(i.id)}
                    />
                    {i.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary">
                {showCreate ? 'Create Bot' : 'Save Changes'}
              </button>
              {showCreate && (
                <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
              )}
              {!showCreate && selectedBot && (
                <button type="button" className="btn btn-warning" onClick={() => handleRegenToken(selectedBot.id)}>
                  <Key size={14} /> Regenerate Token
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

export default BotPanel
