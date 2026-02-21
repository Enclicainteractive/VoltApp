import React, { useState } from 'react'
import { X } from 'lucide-react'
import { apiService } from '../../services/apiService'
import { useTranslation } from '../../hooks/useTranslation'
import './Modal.css'

const CreateServerModal = ({ onClose, onSuccess }) => {
  const { t } = useTranslation()
  const [serverName, setServerName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!serverName.trim()) {
      setError(t('modals.serverNameRequired'))
      return
    }

    setLoading(true)
    setError('')

    try {
      await apiService.createServer({ name: serverName.trim() })
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
          <h2>{t('modals.createServer')}</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p className="modal-description">
              Give your new server a name. You can always change it later.
            </p>

            <div className="form-group">
              <label>{t('modals.serverName')}</label>
              <input
                type="text"
                className="input"
                placeholder={t('modals.serverNamePlaceholder')}
                value={serverName}
                onChange={e => setServerName(e.target.value)}
                autoFocus
                maxLength={100}
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
            <button type="submit" className="btn btn-primary" disabled={loading || !serverName.trim()}>
              {loading ? t('modals.creatingServer') : t('modals.createServer')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CreateServerModal
