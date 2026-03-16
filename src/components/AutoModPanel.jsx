import React, { useEffect, useMemo, useState } from 'react'
import { ShieldAlert, AlertTriangle, CheckCircle2, Globe2, Link2, MessageSquareWarning, Megaphone, Plus, ShieldCheck, Trash2, Wrench } from 'lucide-react'
import { apiService } from '../services/apiService'
import { useTranslation } from '../hooks/useTranslation'
import './AutoModPanel.css'

const getDefaultConfig = () => ({
  enabled: false,
  testingMode: false,
  botsExempt: true,
  rules: {
    wordFilter: { enabled: false, words: [], action: 'delete', warnMessage: 'Blocked word used' },
    spamProtection: { enabled: false, maxMessages: 5, timeWindow: 5000, action: 'mute', warnMessage: 'Spam detected' },
    linkBlock: { enabled: false, allowlist: [], action: 'delete', warnMessage: 'Links not allowed' },
    mentionSpam: { enabled: false, maxMentions: 5, action: 'delete', warnMessage: 'Too many mentions' },
    capsFilter: { enabled: false, minPercent: 70, minLength: 5, action: 'delete', warnMessage: 'Excessive caps' },
    inviteBlock: { enabled: false, action: 'delete', warnMessage: 'Discord invites not allowed' },
    customRules: []
  },
  warnSettings: { enabled: true, maxWarns: 3, warnAction: 'mute', warnDuration: 3600000, decayTime: 86400000 },
  exemptions: { roles: [], channels: [] },
  logChannelId: null
})

const mergeWithDefaults = (loadedConfig) => {
  const defaults = getDefaultConfig()
  return {
    ...defaults,
    ...loadedConfig,
    rules: {
      ...defaults.rules,
      ...(loadedConfig?.rules || {}),
      wordFilter: { ...defaults.rules.wordFilter, ...((loadedConfig?.rules?.wordFilter || loadedConfig?.wordFilter) || {}) },
      spamProtection: { ...defaults.rules.spamProtection, ...((loadedConfig?.rules?.spamProtection || loadedConfig?.spamProtection) || {}) },
      linkBlock: { ...defaults.rules.linkBlock, ...((loadedConfig?.rules?.linkBlock || loadedConfig?.linkBlock) || {}) },
      mentionSpam: { ...defaults.rules.mentionSpam, ...((loadedConfig?.rules?.mentionSpam || loadedConfig?.mentionSpam) || {}) },
      capsFilter: { ...defaults.rules.capsFilter, ...((loadedConfig?.rules?.capsFilter || loadedConfig?.capsFilter) || {}) },
      inviteBlock: { ...defaults.rules.inviteBlock, ...((loadedConfig?.rules?.inviteBlock || loadedConfig?.inviteBlock) || {}) },
      customRules: loadedConfig?.rules?.customRules || loadedConfig?.customRules || defaults.rules.customRules
    },
    warnSettings: { ...defaults.warnSettings, ...(loadedConfig?.warnSettings || {}) },
    exemptions: {
      roles: loadedConfig?.exemptions?.roles || [],
      channels: loadedConfig?.exemptions?.channels || []
    }
  }
}

const Toggle = ({ checked, onChange, disabled }) => (
  <button
    type="button"
    className={`automod-toggle ${checked ? 'checked' : ''}`}
    onClick={() => !disabled && onChange(!checked)}
    disabled={disabled}
  >
    <span />
  </button>
)

const Field = ({ label, hint, children }) => (
  <label className="automod-field">
    <span className="automod-field-label">{label}</span>
    {hint ? <span className="automod-field-hint">{hint}</span> : null}
    {children}
  </label>
)

const AutoModPanel = ({ serverId, isOwner, canManage }) => {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState(getDefaultConfig())
  const [roles, setRoles] = useState([])
  const [channels, setChannels] = useState([])
  const [newWord, setNewWord] = useState('')
  const [newDomain, setNewDomain] = useState('')
  const [newCustomRule, setNewCustomRule] = useState({ name: '', pattern: '', action: 'delete', reason: '' })
  const [newExemption, setNewExemption] = useState({ type: 'role', id: '' })

  const canManageAutoMod = isOwner || canManage

  const actionOptions = useMemo(() => ([
    { value: 'delete', label: t('automod.actions.delete', 'Delete Message') },
    { value: 'warn', label: t('automod.actions.warn', 'Warn User') },
    { value: 'mute', label: t('automod.actions.mute', 'Mute User') },
    { value: 'kick', label: t('automod.actions.kick', 'Kick User') },
    { value: 'ban', label: t('automod.actions.ban', 'Ban User') }
  ]), [t])

  const activeRuleCount = useMemo(() => {
    const rules = config?.rules || {}
    return ['wordFilter', 'spamProtection', 'linkBlock', 'mentionSpam', 'capsFilter', 'inviteBlock']
      .filter((key) => rules[key]?.enabled)
      .length
  }, [config])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [configRes, rolesRes, channelsRes] = await Promise.all([
          apiService.getAutoModConfig(serverId).catch(() => ({ data: getDefaultConfig() })),
          apiService.getRoles(serverId).catch(() => ({ data: [] })),
          apiService.getChannels(serverId).catch(() => ({ data: [] }))
        ])
        setConfig(mergeWithDefaults(configRes.data))
        setRoles(Array.isArray(rolesRes.data) ? rolesRes.data : [])
        setChannels(Array.isArray(channelsRes.data) ? channelsRes.data : [])
      } catch (error) {
        console.error('Failed to load automod panel:', error)
        setConfig(getDefaultConfig())
        setRoles([])
        setChannels([])
      } finally {
        setLoading(false)
      }
    }

    if (serverId) {
      load()
    }
  }, [serverId])

  const saveConfig = async (updates) => {
    if (!canManageAutoMod) return
    setSaving(true)
    try {
      await apiService.updateAutoModConfig(serverId, updates)
    } catch (error) {
      console.error('Failed to update automod config:', error)
    } finally {
      setSaving(false)
    }
  }

  const updateRoot = async (updates) => {
    const next = { ...config, ...updates }
    setConfig(next)
    await saveConfig(updates)
  }

  const updateRule = async (ruleName, updates) => {
    const nextRules = {
      ...config.rules,
      [ruleName]: {
        ...config.rules[ruleName],
        ...updates
      }
    }
    setConfig((prev) => ({ ...prev, rules: nextRules }))
    await saveConfig({ rules: nextRules })
  }

  const updateWarnSettings = async (updates) => {
    const nextWarnSettings = { ...config.warnSettings, ...updates }
    setConfig((prev) => ({ ...prev, warnSettings: nextWarnSettings }))
    await saveConfig({ warnSettings: nextWarnSettings })
  }

  const toggleEnabled = async (enabled) => {
    setConfig((prev) => ({ ...prev, enabled }))
    setSaving(true)
    try {
      await apiService.toggleAutoMod(serverId, enabled)
    } catch (error) {
      console.error('Failed to toggle automod:', error)
    } finally {
      setSaving(false)
    }
  }

  const toggleTestingMode = async (enabled) => {
    if (!isOwner) return
    setConfig((prev) => ({ ...prev, testingMode: enabled }))
    setSaving(true)
    try {
      await apiService.toggleAutoModTestingMode(serverId, enabled)
    } catch (error) {
      console.error('Failed to toggle testing mode:', error)
    } finally {
      setSaving(false)
    }
  }

  const addWord = async () => {
    const word = newWord.trim().toLowerCase()
    if (!word || !canManageAutoMod) return
    try {
      await apiService.addAutoModWord(serverId, word)
      const words = [...(config.rules.wordFilter.words || []), word]
      setConfig((prev) => ({
        ...prev,
        rules: {
          ...prev.rules,
          wordFilter: { ...prev.rules.wordFilter, words }
        }
      }))
      setNewWord('')
    } catch (error) {
      console.error('Failed to add word:', error)
    }
  }

  const removeWord = async (word) => {
    if (!canManageAutoMod) return
    try {
      await apiService.removeAutoModWord(serverId, word)
      const words = (config.rules.wordFilter.words || []).filter((item) => item !== word)
      setConfig((prev) => ({
        ...prev,
        rules: {
          ...prev.rules,
          wordFilter: { ...prev.rules.wordFilter, words }
        }
      }))
    } catch (error) {
      console.error('Failed to remove word:', error)
    }
  }

  const addDomain = async () => {
    const domain = newDomain.trim().toLowerCase()
    if (!domain || !canManageAutoMod) return
    try {
      await apiService.addAllowedDomain(serverId, domain)
      const allowlist = [...(config.rules.linkBlock.allowlist || []), domain]
      setConfig((prev) => ({
        ...prev,
        rules: {
          ...prev.rules,
          linkBlock: { ...prev.rules.linkBlock, allowlist }
        }
      }))
      setNewDomain('')
    } catch (error) {
      console.error('Failed to add allowed domain:', error)
    }
  }

  const removeDomain = async (domain) => {
    if (!canManageAutoMod) return
    try {
      await apiService.removeAllowedDomain(serverId, domain)
      const allowlist = (config.rules.linkBlock.allowlist || []).filter((item) => item !== domain)
      setConfig((prev) => ({
        ...prev,
        rules: {
          ...prev.rules,
          linkBlock: { ...prev.rules.linkBlock, allowlist }
        }
      }))
    } catch (error) {
      console.error('Failed to remove allowed domain:', error)
    }
  }

  const addCustomRule = async () => {
    if (!newCustomRule.name.trim() || !newCustomRule.pattern.trim() || !canManageAutoMod) return
    const rule = {
      id: `rule_${Date.now()}`,
      ...newCustomRule,
      enabled: true
    }
    try {
      await apiService.addAutoModCustomRule(serverId, rule)
      setConfig((prev) => ({
        ...prev,
        rules: {
          ...prev.rules,
          customRules: [...(prev.rules.customRules || []), rule]
        }
      }))
      setNewCustomRule({ name: '', pattern: '', action: 'delete', reason: '' })
    } catch (error) {
      console.error('Failed to add custom rule:', error)
    }
  }

  const removeCustomRule = async (ruleId) => {
    if (!canManageAutoMod) return
    try {
      await apiService.removeAutoModCustomRule(serverId, ruleId)
      setConfig((prev) => ({
        ...prev,
        rules: {
          ...prev.rules,
          customRules: (prev.rules.customRules || []).filter((rule) => rule.id !== ruleId)
        }
      }))
    } catch (error) {
      console.error('Failed to remove custom rule:', error)
    }
  }

  const addExemption = async () => {
    if (!newExemption.id || !canManageAutoMod) return
    try {
      await apiService.addAutoModExemption(serverId, newExemption)
      const key = newExemption.type === 'role' ? 'roles' : 'channels'
      setConfig((prev) => ({
        ...prev,
        exemptions: {
          ...prev.exemptions,
          [key]: [...(prev.exemptions?.[key] || []), newExemption.id]
        }
      }))
      setNewExemption({ type: 'role', id: '' })
    } catch (error) {
      console.error('Failed to add exemption:', error)
    }
  }

  const removeExemption = async (type, id) => {
    if (!canManageAutoMod) return
    try {
      await apiService.removeAutoModExemption(serverId, `${type}_${id}`)
      const key = type === 'role' ? 'roles' : 'channels'
      setConfig((prev) => ({
        ...prev,
        exemptions: {
          ...prev.exemptions,
          [key]: (prev.exemptions?.[key] || []).filter((item) => item !== id)
        }
      }))
    } catch (error) {
      console.error('Failed to remove exemption:', error)
    }
  }

  const ruleCards = [
    {
      key: 'wordFilter',
      title: t('automod.wordFilter', 'Word Filter'),
      icon: ShieldCheck,
      description: t('automod.wordFilterDesc', 'Block specific words or phrases before they spread.'),
      render: () => (
        <>
          <Field label={t('automod.action', 'Action')}>
            <select className="input" value={config.rules.wordFilter.action} onChange={(event) => updateRule('wordFilter', { action: event.target.value })} disabled={!canManageAutoMod}>
              {actionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
          <Field label={t('automod.warnMessage', 'Warning Message')}>
            <input className="input" value={config.rules.wordFilter.warnMessage || ''} onChange={(event) => setConfig((prev) => ({ ...prev, rules: { ...prev.rules, wordFilter: { ...prev.rules.wordFilter, warnMessage: event.target.value } } }))} onBlur={(event) => updateRule('wordFilter', { warnMessage: event.target.value })} disabled={!canManageAutoMod} />
          </Field>
          <div className="automod-token-editor">
            <div className="automod-token-input">
              <input className="input" value={newWord} onChange={(event) => setNewWord(event.target.value)} placeholder={t('automod.addWordPlaceholder', 'Add a word...')} disabled={!canManageAutoMod} />
              <button className="btn btn-primary" type="button" onClick={addWord} disabled={!newWord.trim() || !canManageAutoMod}>
                <Plus size={16} />
              </button>
            </div>
            <div className="automod-token-list">
              {(config.rules.wordFilter.words || []).map((word) => (
                <span key={word} className="automod-token">
                  {word}
                  {canManageAutoMod ? <button type="button" onClick={() => removeWord(word)}><Trash2 size={12} /></button> : null}
                </span>
              ))}
            </div>
          </div>
        </>
      )
    },
    {
      key: 'spamProtection',
      title: t('automod.spamProtection', 'Spam Protection'),
      icon: MessageSquareWarning,
      description: t('automod.spamDesc', 'Catch rapid floods before a channel gets overwhelmed.'),
      render: () => (
        <>
          <Field label={t('automod.maxMessages', 'Max Messages')}>
            <input className="input" type="number" min="1" max="50" value={config.rules.spamProtection.maxMessages} onChange={(event) => setConfig((prev) => ({ ...prev, rules: { ...prev.rules, spamProtection: { ...prev.rules.spamProtection, maxMessages: Number(event.target.value) || 1 } } }))} onBlur={(event) => updateRule('spamProtection', { maxMessages: Number(event.target.value) || 1 })} disabled={!canManageAutoMod} />
          </Field>
          <Field label={t('automod.interval', 'Interval (seconds)')}>
            <input className="input" type="number" min="1" max="60" value={Math.round((config.rules.spamProtection.timeWindow || 5000) / 1000)} onChange={(event) => setConfig((prev) => ({ ...prev, rules: { ...prev.rules, spamProtection: { ...prev.rules.spamProtection, timeWindow: (Number(event.target.value) || 1) * 1000 } } }))} onBlur={(event) => updateRule('spamProtection', { timeWindow: (Number(event.target.value) || 1) * 1000 })} disabled={!canManageAutoMod} />
          </Field>
          <Field label={t('automod.action', 'Action')}>
            <select className="input" value={config.rules.spamProtection.action} onChange={(event) => updateRule('spamProtection', { action: event.target.value })} disabled={!canManageAutoMod}>
              {actionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
        </>
      )
    },
    {
      key: 'linkBlock',
      title: t('automod.linkFilter', 'Link Filter'),
      icon: Link2,
      description: t('automod.linksDesc', 'Block links by default and allow only trusted domains.'),
      render: () => (
        <>
          <Field label={t('automod.action', 'Action')}>
            <select className="input" value={config.rules.linkBlock.action} onChange={(event) => updateRule('linkBlock', { action: event.target.value })} disabled={!canManageAutoMod}>
              {actionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
          <Field label={t('automod.warnMessage', 'Warning Message')}>
            <input className="input" value={config.rules.linkBlock.warnMessage || ''} onChange={(event) => setConfig((prev) => ({ ...prev, rules: { ...prev.rules, linkBlock: { ...prev.rules.linkBlock, warnMessage: event.target.value } } }))} onBlur={(event) => updateRule('linkBlock', { warnMessage: event.target.value })} disabled={!canManageAutoMod} />
          </Field>
          <div className="automod-token-editor">
            <div className="automod-token-input">
              <input className="input" value={newDomain} onChange={(event) => setNewDomain(event.target.value)} placeholder={t('automod.addDomainPlaceholder', 'e.g. youtube.com')} disabled={!canManageAutoMod} />
              <button className="btn btn-primary" type="button" onClick={addDomain} disabled={!newDomain.trim() || !canManageAutoMod}>
                <Plus size={16} />
              </button>
            </div>
            <div className="automod-token-list">
              {(config.rules.linkBlock.allowlist || []).map((domain) => (
                <span key={domain} className="automod-token automod-token-link">
                  {domain}
                  {canManageAutoMod ? <button type="button" onClick={() => removeDomain(domain)}><Trash2 size={12} /></button> : null}
                </span>
              ))}
            </div>
          </div>
        </>
      )
    },
    {
      key: 'mentionSpam',
      title: t('automod.mentionSpam', 'Mention Spam'),
      icon: Megaphone,
      description: t('automod.mentionsDesc', 'Limit how many people can be pinged in a single message.'),
      render: () => (
        <>
          <Field label={t('automod.maxMentions', 'Max Mentions')}>
            <input className="input" type="number" min="1" max="50" value={config.rules.mentionSpam.maxMentions} onChange={(event) => setConfig((prev) => ({ ...prev, rules: { ...prev.rules, mentionSpam: { ...prev.rules.mentionSpam, maxMentions: Number(event.target.value) || 1 } } }))} onBlur={(event) => updateRule('mentionSpam', { maxMentions: Number(event.target.value) || 1 })} disabled={!canManageAutoMod} />
          </Field>
          <Field label={t('automod.warnMessage', 'Warning Message')}>
            <input className="input" value={config.rules.mentionSpam.warnMessage || ''} onChange={(event) => setConfig((prev) => ({ ...prev, rules: { ...prev.rules, mentionSpam: { ...prev.rules.mentionSpam, warnMessage: event.target.value } } }))} onBlur={(event) => updateRule('mentionSpam', { warnMessage: event.target.value })} disabled={!canManageAutoMod} />
          </Field>
          <Field label={t('automod.action', 'Action')}>
            <select className="input" value={config.rules.mentionSpam.action} onChange={(event) => updateRule('mentionSpam', { action: event.target.value })} disabled={!canManageAutoMod}>
              {actionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
        </>
      )
    },
    {
      key: 'capsFilter',
      title: t('automod.capsFilter', 'Caps Filter'),
      icon: AlertTriangle,
      description: t('automod.capsDesc', 'Catch shouting without blocking normal emphasis.'),
      render: () => (
        <>
          <Field label={t('automod.capsThreshold', 'Caps Threshold (%)')}>
            <input className="input" type="number" min="50" max="100" value={config.rules.capsFilter.minPercent} onChange={(event) => setConfig((prev) => ({ ...prev, rules: { ...prev.rules, capsFilter: { ...prev.rules.capsFilter, minPercent: Number(event.target.value) || 50 } } }))} onBlur={(event) => updateRule('capsFilter', { minPercent: Number(event.target.value) || 50 })} disabled={!canManageAutoMod} />
          </Field>
          <Field label={t('automod.minLength', 'Min Length')}>
            <input className="input" type="number" min="1" max="80" value={config.rules.capsFilter.minLength} onChange={(event) => setConfig((prev) => ({ ...prev, rules: { ...prev.rules, capsFilter: { ...prev.rules.capsFilter, minLength: Number(event.target.value) || 1 } } }))} onBlur={(event) => updateRule('capsFilter', { minLength: Number(event.target.value) || 1 })} disabled={!canManageAutoMod} />
          </Field>
          <Field label={t('automod.action', 'Action')}>
            <select className="input" value={config.rules.capsFilter.action} onChange={(event) => updateRule('capsFilter', { action: event.target.value })} disabled={!canManageAutoMod}>
              {actionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
        </>
      )
    },
    {
      key: 'inviteBlock',
      title: t('automod.discordInvites', 'Discord Invites'),
      icon: Globe2,
      description: t('automod.invitesDesc', 'Stop external server invites from bypassing your onboarding flow.'),
      render: () => (
        <>
          <Field label={t('automod.warnMessage', 'Warning Message')}>
            <input className="input" value={config.rules.inviteBlock.warnMessage || ''} onChange={(event) => setConfig((prev) => ({ ...prev, rules: { ...prev.rules, inviteBlock: { ...prev.rules.inviteBlock, warnMessage: event.target.value } } }))} onBlur={(event) => updateRule('inviteBlock', { warnMessage: event.target.value })} disabled={!canManageAutoMod} />
          </Field>
          <Field label={t('automod.action', 'Action')}>
            <select className="input" value={config.rules.inviteBlock.action} onChange={(event) => updateRule('inviteBlock', { action: event.target.value })} disabled={!canManageAutoMod}>
              {actionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
        </>
      )
    }
  ]

  if (loading) {
    return <div className="automod-loading">{t('common.loading', 'Loading...')}</div>
  }

  return (
    <div className="automod-panel">
      <section className="automod-hero">
        <div>
          <span className="automod-kicker">{t('automod.title', 'AutoMod')}</span>
          <h3>{t('automod.description', 'Automatically moderate messages and protect your server.')}</h3>
        </div>
        <div className="automod-stats">
          <div className="automod-stat-card">
            <strong>{activeRuleCount}</strong>
            <span>{t('automod.liveRules', 'live rules')}</span>
          </div>
          <div className="automod-stat-card">
            <strong>{config.rules.wordFilter.words?.length || 0}</strong>
            <span>{t('automod.blockedWords', 'Blocked Words')}</span>
          </div>
          <div className="automod-stat-card">
            <strong>{config.rules.customRules?.length || 0}</strong>
            <span>{t('automod.customRules', 'Custom Rules')}</span>
          </div>
        </div>
      </section>

      <section className="automod-overview">
        <div className="automod-overview-card">
          <div>
            <strong>{t('automod.enabled', 'Enabled')}</strong>
            <p>{t('automod.disabledNotice', 'Turn AutoMod on to start protecting the server.')}</p>
          </div>
          <Toggle checked={config.enabled} onChange={toggleEnabled} disabled={!canManageAutoMod || saving} />
        </div>
        <div className="automod-overview-card">
          <div>
            <strong>{t('automod.botsExempt', 'Bots Exempt')}</strong>
            <p>{t('automod.botsExemptDesc', 'Bots skip all rules unless you explicitly test against them.')}</p>
          </div>
          <Toggle checked={config.botsExempt !== false} onChange={(value) => updateRoot({ botsExempt: value })} disabled={!canManageAutoMod || saving} />
        </div>
        {isOwner ? (
          <div className="automod-overview-card automod-overview-warning">
            <div>
              <strong>{t('automod.testingMode', 'Testing Mode')}</strong>
              <p>{t('automod.testingModeDesc', 'Let your own account pass through AutoMod so you can verify the rules safely.')}</p>
            </div>
            <Toggle checked={Boolean(config.testingMode)} onChange={toggleTestingMode} disabled={saving} />
          </div>
        ) : null}
      </section>

      <section className="automod-rule-grid">
        {ruleCards.map((rule) => {
          const Icon = rule.icon
          return (
            <article key={rule.key} className={`automod-rule-card ${config.rules[rule.key]?.enabled ? 'active' : ''}`}>
              <div className="automod-rule-header">
                <div className="automod-rule-title">
                  <Icon size={18} />
                  <div>
                    <strong>{rule.title}</strong>
                    <p>{rule.description}</p>
                  </div>
                </div>
                <Toggle checked={Boolean(config.rules[rule.key]?.enabled)} onChange={(value) => updateRule(rule.key, { enabled: value })} disabled={!canManageAutoMod || !config.enabled} />
              </div>
              {config.rules[rule.key]?.enabled ? <div className="automod-rule-body">{rule.render()}</div> : null}
            </article>
          )
        })}
      </section>

      <section className="automod-split-grid">
        <article className="automod-panel-card">
          <div className="automod-panel-card-header">
            <div className="automod-panel-card-title">
              <CheckCircle2 size={18} />
              <strong>{t('automod.warningSystem', 'Warning System')}</strong>
            </div>
            <Toggle checked={Boolean(config.warnSettings.enabled)} onChange={(value) => updateWarnSettings({ enabled: value })} disabled={!canManageAutoMod || !config.enabled} />
          </div>
          {config.warnSettings.enabled ? (
            <div className="automod-rule-body">
              <Field label={t('automod.maxWarnings', 'Max Warnings')}>
                <input className="input" type="number" min="1" max="10" value={config.warnSettings.maxWarns} onChange={(event) => setConfig((prev) => ({ ...prev, warnSettings: { ...prev.warnSettings, maxWarns: Number(event.target.value) || 1 } }))} onBlur={(event) => updateWarnSettings({ maxWarns: Number(event.target.value) || 1 })} disabled={!canManageAutoMod} />
              </Field>
              <Field label={t('automod.decayHours', 'Decay Time (hours)')}>
                <input className="input" type="number" min="1" max="168" value={Math.round((config.warnSettings.decayTime || 86400000) / 3600000)} onChange={(event) => setConfig((prev) => ({ ...prev, warnSettings: { ...prev.warnSettings, decayTime: (Number(event.target.value) || 1) * 3600000 } }))} onBlur={(event) => updateWarnSettings({ decayTime: (Number(event.target.value) || 1) * 3600000 })} disabled={!canManageAutoMod} />
              </Field>
              <Field label={t('automod.maxWarnAction', 'Max Warn Action')}>
                <select className="input" value={config.warnSettings.warnAction} onChange={(event) => updateWarnSettings({ warnAction: event.target.value })} disabled={!canManageAutoMod}>
                  {actionOptions.filter((option) => option.value !== 'delete' && option.value !== 'warn').map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </Field>
            </div>
          ) : null}
        </article>

        <article className="automod-panel-card">
          <div className="automod-panel-card-header">
            <div className="automod-panel-card-title">
              <Wrench size={18} />
              <strong>{t('automod.customRules', 'Custom Rules')}</strong>
            </div>
          </div>
          <div className="automod-custom-list">
            {(config.rules.customRules || []).map((rule) => (
              <div key={rule.id} className="automod-custom-item">
                <div>
                  <strong>{rule.name}</strong>
                  <code>{rule.pattern}</code>
                  <span>{actionOptions.find((option) => option.value === rule.action)?.label || rule.action}</span>
                </div>
                {canManageAutoMod ? <button type="button" className="icon-btn danger" onClick={() => removeCustomRule(rule.id)}><Trash2 size={16} /></button> : null}
              </div>
            ))}
          </div>
          {canManageAutoMod ? (
            <div className="automod-rule-body">
              <Field label={t('automod.name', 'Name')}>
                <input className="input" value={newCustomRule.name} onChange={(event) => setNewCustomRule((prev) => ({ ...prev, name: event.target.value }))} placeholder={t('automod.ruleName', 'Spoiler scam')} />
              </Field>
              <Field label={t('automod.pattern', 'Pattern')}>
                <input className="input" value={newCustomRule.pattern} onChange={(event) => setNewCustomRule((prev) => ({ ...prev, pattern: event.target.value }))} placeholder={t('automod.regexPattern', 'Regex pattern')} />
              </Field>
              <Field label={t('automod.action', 'Action')}>
                <select className="input" value={newCustomRule.action} onChange={(event) => setNewCustomRule((prev) => ({ ...prev, action: event.target.value }))}>
                  {actionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </Field>
              <Field label={t('automod.warnMessage', 'Warning Message')}>
                <input className="input" value={newCustomRule.reason} onChange={(event) => setNewCustomRule((prev) => ({ ...prev, reason: event.target.value }))} placeholder={t('automod.reasonPlaceholder', 'Reason shown to user')} />
              </Field>
              <button className="btn btn-primary" type="button" onClick={addCustomRule} disabled={!newCustomRule.name.trim() || !newCustomRule.pattern.trim()}>
                <Plus size={16} />
                {t('automod.addRule', 'Add Rule')}
              </button>
            </div>
          ) : null}
        </article>
      </section>

      <section className="automod-panel-card">
        <div className="automod-panel-card-header">
          <div className="automod-panel-card-title">
            <ShieldAlert size={18} />
            <strong>{t('automod.exemptions', 'Exemptions')}</strong>
          </div>
        </div>
        <div className="automod-exemptions-grid">
          <div>
            <h4>{t('automod.exemptRoles', 'Exempt Roles')}</h4>
            <div className="automod-token-list">
              {(config.exemptions?.roles || []).map((roleId) => {
                const role = roles.find((item) => item.id === roleId)
                return (
                  <span key={roleId} className="automod-token">
                    {role?.name || roleId}
                    {canManageAutoMod ? <button type="button" onClick={() => removeExemption('role', roleId)}><Trash2 size={12} /></button> : null}
                  </span>
                )
              })}
            </div>
          </div>
          <div>
            <h4>{t('automod.exemptChannels', 'Exempt Channels')}</h4>
            <div className="automod-token-list">
              {(config.exemptions?.channels || []).map((channelId) => {
                const channel = channels.find((item) => item.id === channelId)
                return (
                  <span key={channelId} className="automod-token automod-token-link">
                    #{channel?.name || channelId}
                    {canManageAutoMod ? <button type="button" onClick={() => removeExemption('channel', channelId)}><Trash2 size={12} /></button> : null}
                  </span>
                )
              })}
            </div>
          </div>
        </div>
        {canManageAutoMod ? (
          <div className="automod-rule-body">
            <Field label={t('automod.type', 'Type')}>
              <select className="input" value={newExemption.type} onChange={(event) => setNewExemption({ type: event.target.value, id: '' })}>
                <option value="role">{t('automod.role', 'Role')}</option>
                <option value="channel">{t('automod.channel', 'Channel')}</option>
              </select>
            </Field>
            <Field label={t('common.select', 'Select...')}>
              <select className="input" value={newExemption.id} onChange={(event) => setNewExemption((prev) => ({ ...prev, id: event.target.value }))}>
                <option value="">{t('common.select', 'Select...')}</option>
                {(newExemption.type === 'role'
                  ? roles.filter((role) => !(config.exemptions?.roles || []).includes(role.id)).map((role) => ({ value: role.id, label: role.name }))
                  : channels.filter((channel) => !(config.exemptions?.channels || []).includes(channel.id)).map((channel) => ({ value: channel.id, label: channel.name }))
                ).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
            <button className="btn btn-primary" type="button" onClick={addExemption} disabled={!newExemption.id}>
              <Plus size={16} />
              {t('automod.addExemption', 'Add Exemption')}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  )
}

export default AutoModPanel
