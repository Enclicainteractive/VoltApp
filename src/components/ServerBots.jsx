import React, { useState, useEffect } from 'react'
import { SparklesIcon, PlusIcon, TrashIcon, MagnifyingGlassIcon, CpuChipIcon } from '@heroicons/react/24/outline'
import { apiService } from '../services/apiService'
import { useTranslation } from '../hooks/useTranslation'

const ServerBots = ({ serverId, isOwner, canManage }) => {
  const { t } = useTranslation()
  const hasManageAccess = isOwner || canManage
  const [serverBots, setServerBots] = useState([])
  const [myBots, setMyBots] = useState([])
  const [publicBots, setPublicBots] = useState([])
  const [loading, setLoading] = useState(false)
  const [showBrowse, setShowBrowse] = useState(false)
  const [showMyBots, setShowMyBots] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const loadServerBots = async () => {
    if (!serverId) return
    setLoading(true)
    try {
      const res = await apiService.getServerBots(serverId)
      setServerBots(res.data || [])
    } catch (err) {
      console.error('Failed to load server bots:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadMyBots = async () => {
    try {
      const res = await apiService.getMyBots()
      setMyBots(res.data || [])
    } catch (err) {
      console.error('Failed to load my bots:', err)
    }
  }

  const loadPublicBots = async () => {
    try {
      const res = await apiService.getPublicBots()
      setPublicBots(res.data || [])
    } catch (err) {
      console.error('Failed to load public bots:', err)
    }
  }

  useEffect(() => { 
    loadServerBots() 
    loadMyBots()
  }, [serverId])

  const handleAddBot = async (botId) => {
    try {
      await apiService.addBotToServer(botId, serverId)
      loadServerBots()
      setShowBrowse(false)
    } catch (err) {
      console.error('Failed to add bot:', err)
    }
  }

  const handleRemoveBot = async (botId) => {
    if (!window.confirm(t('serverBots.removeConfirm'))) return
    try {
      await apiService.removeBotFromServer(botId, serverId)
      setServerBots(prev => prev.filter(b => b.id !== botId))
    } catch (err) {
      console.error('Failed to remove bot:', err)
    }
  }

  const filteredPublic = publicBots.filter(b =>
    !serverBots.some(sb => sb.id === b.id) &&
    (!searchQuery || b.name.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  const filteredMyBots = myBots.filter(b =>
    !serverBots.some(sb => sb.id === b.id) &&
    (!searchQuery || b.name.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  const isBotInServer = (botId) => serverBots.some(sb => sb.id === botId)

  return (
    <div className="server-bots">
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{t('serverBots.title')}</h4>
        {hasManageAccess && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => { setShowMyBots(!showMyBots); if (!showMyBots) loadMyBots() }}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 12, borderRadius: 6, cursor: 'pointer' }}
            >
              <CpuChipIcon size={14} /> {t('serverBots.myBots', 'My Bots')}
            </button>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => { setShowBrowse(!showBrowse); if (!showBrowse) loadPublicBots() }}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 12, borderRadius: 6, border: 'none', cursor: 'pointer' }}
            >
              <PlusIcon size={14} /> {t('serverBots.addBot')}
            </button>
          </div>
        )}
      </div>

      {showMyBots && hasManageAccess && (
        <div style={{ marginBottom: 16, padding: 12, background: 'var(--volt-bg-tertiary)', borderRadius: 8, border: '1px solid var(--volt-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <MagnifyingGlassIcon size={14} style={{ color: 'var(--volt-text-muted)' }} />
            <input
              placeholder={t('serverBots.searchMyBots')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--volt-border)', background: 'var(--volt-bg-secondary)', color: 'var(--volt-text-primary)', fontSize: 13 }}
            />
          </div>
          {filteredMyBots.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--volt-text-muted)', fontSize: 13, padding: 10 }}>
              {myBots.length === 0 ? t('serverBots.noBotsCreated', 'You haven\'t created any bots yet') : t('serverBots.allBotsAdded', 'All your bots are already in this server')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filteredMyBots.map(bot => (
                <div key={bot.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--volt-bg-secondary)', borderRadius: 6 }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--volt-text-primary)' }}>{bot.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--volt-text-muted)' }}>{bot.description || t('serverBots.noDescription')}</div>
                  </div>
                  <button
                    onClick={() => handleAddBot(bot.id)}
                    style={{ padding: '4px 10px', fontSize: 12, borderRadius: 6, border: 'none', cursor: 'pointer', background: 'var(--volt-success)', color: '#fff' }}
                  >
                    {t('serverBots.add')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showBrowse && (
        <div style={{ marginBottom: 16, padding: 12, background: 'var(--volt-bg-tertiary)', borderRadius: 8, border: '1px solid var(--volt-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <MagnifyingGlassIcon size={14} style={{ color: 'var(--volt-text-muted)' }} />
            <input
              placeholder={t('serverBots.searchPublicBots')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--volt-border)', background: 'var(--volt-bg-secondary)', color: 'var(--volt-text-primary)', fontSize: 13 }}
            />
          </div>
          {filteredPublic.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--volt-text-muted)', fontSize: 13, padding: 10 }}>
              {t('serverBots.noPublicBotsAvailable')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filteredPublic.map(bot => (
                <div key={bot.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--volt-bg-secondary)', borderRadius: 6 }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--volt-text-primary)' }}>{bot.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--volt-text-muted)' }}>{bot.description || t('serverBots.noDescription')}</div>
                  </div>
                  <button
                    onClick={() => handleAddBot(bot.id)}
                    style={{ padding: '4px 10px', fontSize: 12, borderRadius: 6, border: 'none', cursor: 'pointer', background: 'var(--volt-primary)', color: '#fff' }}
                  >
                    {t('serverBots.add')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--volt-text-muted)', padding: 20, fontSize: 13 }}>{t('common.loading', 'Loading...')}</div>
      ) : serverBots.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--volt-text-muted)', padding: 20, fontSize: 13 }}>
          <SparklesIcon size={28} style={{ marginBottom: 8, opacity: 0.5 }} />
          <p>{t('serverBots.noBotsInServer')}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {serverBots.map(bot => (
            <div key={bot.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--volt-bg-tertiary)', border: '1px solid var(--volt-border)', borderRadius: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--volt-bg-quaternary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--volt-primary)', flexShrink: 0 }}>
                <SparklesIcon size={16} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--volt-text-primary)' }}>
                  {bot.name}
                  <span style={{ marginLeft: 6, fontSize: 11, padding: '1px 6px', borderRadius: 10, background: bot.status === 'online' ? 'rgba(52,211,153,0.15)' : 'rgba(138,143,158,0.15)', color: bot.status === 'online' ? 'var(--volt-success)' : '#8a8f9e' }}>
                    {bot.status}
                  </span>
                </div>
                {bot.description && (
                  <div style={{ fontSize: 11, color: 'var(--volt-text-muted)', marginTop: 2 }}>{bot.description}</div>
                )}
                {bot.commands?.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                    {bot.commands.slice(0, 5).map(cmd => (
                      <span key={cmd.name} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'var(--volt-bg-quaternary)', color: 'var(--volt-text-muted)' }}>
                        {bot.prefix || '!'}{cmd.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {hasManageAccess && (
                <button
                  onClick={() => handleRemoveBot(bot.id)}
                  style={{ padding: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--volt-danger)' }}
                >
                  <TrashIcon size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ServerBots
