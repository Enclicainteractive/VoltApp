import React, { useState } from 'react'
import { X, Hash, Volume2, Folder } from 'lucide-react'
import { apiService } from '../../services/apiService'
import { useTranslation } from '../../hooks/useTranslation'
import './Modal.css'

const CreateChannelModal = ({ serverId, categories = [], onClose, onSuccess }) => {
  const { t } = useTranslation()
  const [channelName, setChannelName] = useState('')
  const [channelType, setChannelType] = useState('text')
  const [categoryId, setCategoryId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!channelName.trim()) {
      setError(t('modals.channelNameRequired'))
      return
    }

    setLoading(true)
    setError('')

    try {
      await apiService.createChannel(serverId, {
        name: channelName.trim().toLowerCase().replace(/\s+/g, '-'),
        type: channelType,
        categoryId: categoryId || null
      })
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.error || t('errors.generic'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t('modals.createChannel')}</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label>{t('modals.channelType')}</label>
              <div className="channel-type-options">
                <button
                  type="button"
                  className={`channel-type-btn ${channelType === 'text' ? 'active' : ''}`}
                  onClick={() => setChannelType('text')}
                >
                  <Hash size={20} />
                  <div>
                    <div className="type-label">{t('modals.text')}</div>
                    <div className="type-description">{t('modals.textDesc')}</div>
                  </div>
                </button>
                <button
                  type="button"
                  className={`channel-type-btn ${channelType === 'voice' ? 'active' : ''}`}
                  onClick={() => setChannelType('voice')}
                >
                  <Volume2 size={20} />
                  <div>
                    <div className="type-label">{t('modals.voice')}</div>
                    <div className="type-description">{t('modals.voiceDesc')}</div>
                  </div>
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>{t('modals.category')}</label>
              <select
                className="input"
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
              >
                <option value="">{t('modals.noCategory')}</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>{t('modals.channelName')}</label>
              <input
                type="text"
                className="input"
                placeholder={t('modals.channelNamePlaceholder')}
                value={channelName}
                onChange={e => setChannelName(e.target.value)}
                autoFocus
              />
            </div>

            {error && (
              <div className="error-message">{error}</div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? t('common.loading') : t('modals.createChannel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CreateChannelModal
