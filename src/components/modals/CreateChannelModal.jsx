import React, { useState, useRef, useEffect } from 'react'
import { X, Hash, Volume2, Megaphone, MessageSquare, Image, Video, Lock, Globe, ChevronRight } from 'lucide-react'
import { apiService } from '../../services/apiService'
import { useTranslation } from '../../hooks/useTranslation'
import './Modal.css'
import './CreateChannelModal.css'

const CHANNEL_TYPES = [
  {
    id: 'text',
    icon: Hash,
    label: 'Text Channel',
    description: 'Send messages, images, GIFs, emoji, opinions, and puns',
    color: '#89b4fa',
  },
  {
    id: 'voice',
    icon: Volume2,
    label: 'Voice Channel',
    description: 'Hang out together with voice, video, and screen share',
    color: '#a6e3a1',
  },
  {
    id: 'announcement',
    icon: Megaphone,
    label: 'Announcement',
    description: 'Important updates that members can follow and cross-post',
    color: '#fab387',
  },
  {
    id: 'forum',
    icon: MessageSquare,
    label: 'Forum Channel',
    description: 'Create organized threads for focused discussions',
    color: '#cba6f7',
  },
  {
    id: 'media',
    icon: Image,
    label: 'Media Channel',
    description: 'A place to share images, videos, and other media',
    color: '#f38ba8',
  },
  {
    id: 'video',
    icon: Video,
    label: 'Video Channel',
    description: 'Watch and share videos together in real time',
    color: '#89dceb',
  },
]

const CreateChannelModal = ({ serverId, categories = [], onClose, onSuccess }) => {
  const { t } = useTranslation()
  const [channelName, setChannelName] = useState('')
  const [channelType, setChannelType] = useState('text')
  const [categoryId, setCategoryId] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const nameInputRef = useRef(null)

  useEffect(() => {
    nameInputRef.current?.focus()
  }, [])

  // Auto-format channel name: lowercase, spaces → dashes
  const handleNameChange = (e) => {
    const raw = e.target.value
    // Allow typing freely but show preview of final name
    setChannelName(raw)
    setError('')
  }

  const getFormattedName = () =>
    channelName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '')

  const handleSubmit = async (e) => {
    e.preventDefault()
    const formatted = getFormattedName()
    if (!formatted) {
      setError('Channel name is required')
      return
    }
    if (formatted.length < 2) {
      setError('Channel name must be at least 2 characters')
      return
    }

    setLoading(true)
    setError('')

    try {
      await apiService.createChannel(serverId, {
        name: formatted,
        type: channelType,
        categoryId: categoryId || null,
        isPrivate,
      })
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.error || t('errors.generic', 'Something went wrong'))
    } finally {
      setLoading(false)
    }
  }

  const selectedType = CHANNEL_TYPES.find(t => t.id === channelType)
  const SelectedIcon = selectedType?.icon || Hash
  const formattedPreview = getFormattedName()

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="ccm-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="ccm-header">
          <div className="ccm-header-icon" style={{ background: `color-mix(in srgb, ${selectedType?.color || '#89b4fa'} 20%, transparent)`, borderColor: `color-mix(in srgb, ${selectedType?.color || '#89b4fa'} 40%, transparent)` }}>
            <SelectedIcon size={22} style={{ color: selectedType?.color || '#89b4fa' }} />
          </div>
          <div className="ccm-header-text">
            <h2>Create Channel</h2>
            <p>in {categories.find(c => c.id === categoryId)?.name || 'No Category'}</p>
          </div>
          <button className="ccm-close-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="ccm-form">
          {/* Channel Type Grid */}
          <div className="ccm-section">
            <label className="ccm-section-label">Channel Type</label>
            <div className="ccm-type-grid">
              {CHANNEL_TYPES.map(type => {
                const Icon = type.icon
                const isActive = channelType === type.id
                return (
                  <button
                    key={type.id}
                    type="button"
                    className={`ccm-type-card${isActive ? ' active' : ''}`}
                    onClick={() => setChannelType(type.id)}
                    style={isActive ? {
                      '--type-color': type.color,
                      borderColor: `color-mix(in srgb, ${type.color} 60%, transparent)`,
                      background: `color-mix(in srgb, ${type.color} 12%, var(--volt-bg-tertiary))`,
                    } : {}}
                  >
                    <div className="ccm-type-icon" style={{ color: isActive ? type.color : undefined }}>
                      <Icon size={20} />
                    </div>
                    <div className="ccm-type-info">
                      <span className="ccm-type-name">{type.label}</span>
                      <span className="ccm-type-desc">{type.description}</span>
                    </div>
                    {isActive && (
                      <div className="ccm-type-check" style={{ background: type.color }}>
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="white">
                          <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Channel Name */}
          <div className="ccm-section">
            <label className="ccm-section-label" htmlFor="ccm-name">
              Channel Name
            </label>
            <div className="ccm-name-input-wrapper">
              <span className="ccm-name-prefix">
                <SelectedIcon size={16} style={{ color: selectedType?.color || 'var(--volt-text-muted)' }} />
              </span>
              <input
                ref={nameInputRef}
                id="ccm-name"
                type="text"
                className="ccm-name-input"
                placeholder="new-channel"
                value={channelName}
                onChange={handleNameChange}
                maxLength={100}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            {channelName && formattedPreview !== channelName.trim() && (
              <p className="ccm-name-preview">
                Will be created as: <strong>#{formattedPreview}</strong>
              </p>
            )}
          </div>

          {/* Category */}
          {categories.length > 0 && (
            <div className="ccm-section">
              <label className="ccm-section-label" htmlFor="ccm-category">
                Category <span className="ccm-optional">(optional)</span>
              </label>
              <select
                id="ccm-category"
                className="ccm-select"
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
              >
                <option value="">No Category</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Private toggle */}
          <div className="ccm-section">
            <div className="ccm-privacy-row" onClick={() => setIsPrivate(p => !p)}>
              <div className="ccm-privacy-icon">
                {isPrivate ? <Lock size={18} /> : <Globe size={18} />}
              </div>
              <div className="ccm-privacy-info">
                <span className="ccm-privacy-label">{isPrivate ? 'Private Channel' : 'Public Channel'}</span>
                <span className="ccm-privacy-desc">
                  {isPrivate
                    ? 'Only selected members and roles can view this channel'
                    : 'Everyone in this server can view this channel'}
                </span>
              </div>
              <div className={`ccm-toggle${isPrivate ? ' on' : ''}`}>
                <div className="ccm-toggle-thumb" />
              </div>
            </div>
          </div>

          {error && (
            <div className="ccm-error">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          {/* Footer */}
          <div className="ccm-footer">
            <button type="button" className="ccm-btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="ccm-btn-create"
              disabled={loading || !formattedPreview}
              style={{ '--type-color': selectedType?.color || 'var(--volt-primary)' }}
            >
              {loading ? (
                <span className="ccm-spinner" />
              ) : (
                <>
                  Create Channel
                  <ChevronRight size={16} />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CreateChannelModal
