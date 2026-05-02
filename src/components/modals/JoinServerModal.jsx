import React, { useState } from 'react'
import { XMarkIcon, LinkIcon, ArrowRightIcon } from '@heroicons/react/24/outline'
import { apiService } from '../../services/apiService'
import { soundService } from '../../services/soundService'
import { useTranslation } from '../../hooks/useTranslation'
import './Modal.css'
import './JoinServerModal.css'

const JoinServerModal = ({ onClose, onSuccess }) => {
  const { t } = useTranslation()
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const trimmedInviteInput = inviteCode.trim()

  const extractInviteCode = (input) => {
    // Handle full URLs like volt.voltagechat.app/invite/ABC123
    const sanitizedInput = input.trim()
    const urlMatch = sanitizedInput.match(/(?:invite\/|\.gg\/)([a-zA-Z0-9]+)/)
    if (urlMatch) return urlMatch[1]
    // Otherwise just use the raw input (assuming it's a code)
    return sanitizedInput
  }

  const extractedInviteCode = extractInviteCode(inviteCode)
  const hasInviteInput = Boolean(trimmedInviteInput)
  const hasDetectedInviteCode = hasInviteInput && extractedInviteCode !== trimmedInviteInput
  const inviteInputDescribedBy = [
    'join-server-invite-hint',
    error ? 'join-server-error' : null,
    !error && (loading || hasInviteInput) ? 'join-server-invite-status' : null
  ].filter(Boolean).join(' ')

  const handleJoin = async (e) => {
    e.preventDefault()
    
    const code = extractInviteCode(inviteCode)
    if (!code) {
      setError(t('modals.invalidInvite'))
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await apiService.joinServer(code)
      soundService.serverJoined()
      onSuccess?.(res.data)
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || t('modals.invalidInviteError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="join-server-modal-title"
    >
      <div className="modal-content join-server-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="join-server-modal-title">{t('modals.joinServer')}</h2>
          <button type="button" className="modal-close" aria-label={t('modals.close', 'Close')} onClick={onClose}>
            <XMarkIcon size={24} />
          </button>
        </div>

        <form onSubmit={handleJoin} aria-busy={loading}>
          <div className="modal-body join-server-body">
            <div className="join-server-hero">
              <div className="join-server-icon">
                <LinkIcon size={48} />
              </div>
              <p className="join-description">
                {t('modals.enterInvite')}
              </p>
            </div>

            <div className={`form-group join-server-input-group ${error ? 'has-error' : ''}`}>
              <label htmlFor="join-server-invite-input">{t('modals.inviteLink')}</label>
              <input
                id="join-server-invite-input"
                name="inviteCode"
                type="text"
                className={`input join-server-input ${error ? 'is-invalid' : ''}`}
                placeholder={t('modals.invitePlaceholder')}
                value={inviteCode}
                onChange={e => {
                  setInviteCode(e.target.value)
                  if (error) setError('')
                }}
                autoFocus
                required
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
                spellCheck="false"
                inputMode="url"
                disabled={loading}
                aria-invalid={Boolean(error)}
                aria-describedby={inviteInputDescribedBy}
              />
              <span id="join-server-invite-hint" className="input-hint">
                {t('modals.inviteHint')} {t('modals.inviteHintExtra', 'Paste a full invite link or just the code.')}
              </span>

              {!error && (loading || hasInviteInput) && (
                <div id="join-server-invite-status" className={`join-server-status ${loading ? 'is-loading' : 'is-ready'}`} aria-live="polite">
                  {loading && (
                    <>
                      <span className="join-server-status-dot" aria-hidden="true" />
                      {t('modals.joiningServer', 'Joining server...')}
                    </>
                  )}
                  {!loading && hasDetectedInviteCode && (
                    <>
                      {t('modals.detectedInviteCode', 'Detected invite code:')}
                      {' '}
                      <code>{extractedInviteCode}</code>
                    </>
                  )}
                  {!loading && !hasDetectedInviteCode && (
                    t('modals.inviteReadyToJoin', 'Invite looks ready. Press Join Server to continue.')
                  )}
                </div>
              )}
            </div>

            {error && <div id="join-server-error" className="error-message" role="alert" aria-live="assertive">{error}</div>}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              {t('common.cancel')}
            </button>
            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={loading || !trimmedInviteInput}
            >
              {loading ? (
                <>
                  <span className="join-server-btn-spinner" aria-hidden="true" />
                  {t('modals.joiningServer', 'Joining server...')}
                </>
              ) : (
                <>
                  {t('modals.joinServerBtn')}
                  <ArrowRightIcon size={16} />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default JoinServerModal
