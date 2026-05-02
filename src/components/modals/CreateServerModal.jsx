import React, { useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { apiService } from '../../services/apiService'
import { useTranslation } from '../../hooks/useTranslation'
import './Modal.css'

const CreateServerModal = ({ onClose, onSuccess }) => {
  const { t } = useTranslation()
  const [serverName, setServerName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const trimmedServerName = serverName.trim()
  const nameCharsLeft = 100 - serverName.length
  const hasError = Boolean(error)
  const isNearLimit = nameCharsLeft <= 15
  const isAtLimit = nameCharsLeft === 0

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!trimmedServerName) {
      setError(t('modals.serverNameRequired'))
      return
    }

    setLoading(true)
    setError('')

    try {
      await apiService.createServer({ name: trimmedServerName })
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.error || t('errors.generic'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="modal-overlay create-server-overlay"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-server-modal-title"
    >
      <div className="modal-content create-server-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="create-server-modal-title">{t('modals.createServer')}</h2>
          <button type="button" className="modal-close" aria-label={t('modals.close', 'Close')} onClick={onClose}>
            <XMarkIcon size={24} />
          </button>
        </div>

        <form className="create-server-form" onSubmit={handleSubmit} aria-busy={loading}>
          <div className="modal-body create-server-body">
            <p className="modal-description create-server-description">
              {t('modals.createServerDescription', 'Give your new server a name. You can always change it later.')}
            </p>

            <div className={`form-group create-server-name-group${hasError ? ' is-invalid' : ''}`}>
              <div className="create-server-field-meta">
                <label htmlFor="create-server-name">{t('modals.serverName')}</label>
                <span
                  className={`create-server-char-count${isNearLimit ? ' is-warning' : ''}${isAtLimit ? ' is-limit' : ''}`}
                  aria-live="polite"
                >
                  {nameCharsLeft} {t('common.charactersLeft', 'characters left')}
                </span>
              </div>
              <input
                id="create-server-name"
                name="serverName"
                type="text"
                className={`input create-server-input${hasError ? ' is-invalid' : ''}`}
                placeholder={t('modals.serverNamePlaceholder')}
                value={serverName}
                onChange={e => {
                  setServerName(e.target.value)
                  if (error) setError('')
                }}
                autoFocus
                maxLength={100}
                required
                disabled={loading}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={hasError}
                aria-describedby={hasError ? 'create-server-name-hint create-server-error' : 'create-server-name-hint'}
              />
              <span id="create-server-name-hint" className={`input-hint create-server-input-hint${hasError ? ' is-error' : ''}`}>
                {t('modals.serverNameGuidance', 'Use 1-100 characters. You can rename it any time.')}
              </span>
            </div>

            {hasError && (
              <div id="create-server-error" className="error-message create-server-error" role="alert" aria-live="assertive">{error}</div>
            )}
          </div>

          <div className="modal-footer create-server-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading || !trimmedServerName}>
              {loading ? t('modals.creatingServer') : t('modals.createServer')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CreateServerModal
