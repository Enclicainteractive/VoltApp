import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDownIcon, MoonIcon, MinusCircleIcon, EyeIcon } from "@heroicons/react/24/outline";
import { ChevronDown, Circle, Moon, MinusCircle, Eye, X } from 'lucide-react'
import { useSocket } from '../contexts/SocketContext'
import { apiService } from '../services/apiService'
import { updateStoredUserData } from '../services/authSession'
import { useTranslation } from '../hooks/useTranslation'
import '../assets/styles/StatusSelector.css'

const StatusSelector = ({ currentStatus = 'online', customStatus = '', onStatusChange }) => {
  const { t } = useTranslation()
  const { socket } = useSocket()
  const [isOpen, setIsOpen] = useState(false)
  const [customInput, setCustomInput] = useState(customStatus)

  const STATUSES = [
    { id: 'online', label: t('status.online'), color: 'var(--volt-success)', icon: Circle, description: t('status.onlineDesc') || 'Active and available' },
    { id: 'idle', label: t('status.idle'), color: 'var(--volt-warning)', icon: MoonIcon, description: t('status.idleDesc') || 'Away from keyboard' },
    { id: 'dnd', label: t('status.dnd'), color: 'var(--volt-danger)', icon: MinusCircleIcon, description: t('status.dndDesc') || 'Do not disturb' },
    { id: 'invisible', label: t('status.invisible'), color: '#6b7280', icon: EyeIcon, description: t('status.invisibleDesc') || 'Appear offline' }
  ]

  const currentStatusData = STATUSES.find(s => s.id === currentStatus) || STATUSES[0]

  const handleStatusChange = async (statusId) => {
    try {
      await apiService.updateStatus(statusId, customStatus)
      updateStoredUserData((parsedUser) => ({ ...parsedUser, status: statusId, customStatus }))
      socket?.emit('status:change', { status: statusId, customStatus })
      onStatusChange?.({ status: statusId, customStatus })
    } catch (err) {
      console.error('Failed to update status:', err)
    }
    setIsOpen(false)
  }

  const handleCustomStatusSave = async () => {
    try {
      await apiService.updateStatus(currentStatus, customInput)
      updateStoredUserData((parsedUser) => ({ ...parsedUser, status: currentStatus, customStatus: customInput }))
      socket?.emit('status:change', { status: currentStatus, customStatus: customInput })
      onStatusChange?.({ status: currentStatus, customStatus: customInput })
    } catch (err) {
      console.error('Failed to update custom status:', err)
    }
  }

  const handleClearCustomStatus = async () => {
    try {
      await apiService.updateStatus(currentStatus, '')
      updateStoredUserData((parsedUser) => ({ ...parsedUser, status: currentStatus, customStatus: '' }))
      socket?.emit('status:change', { status: currentStatus, customStatus: '' })
      onStatusChange?.({ status: currentStatus, customStatus: '' })
      setCustomInput('')
    } catch (err) {
      console.error('Failed to clear custom status:', err)
    }
  }

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [isOpen])

  return (
    <div className="status-selector">
      <button className="status-trigger" onClick={() => setIsOpen(true)}>
        <span
          className="status-indicator"
          style={{ backgroundColor: currentStatusData.color }}
        />
        <span className="status-label">
          {customStatus || currentStatusData.label}
        </span>
        <ChevronDown size={14} className="chevron" />
      </button>

      {isOpen && createPortal(
        <div className="status-modal-overlay" onClick={() => setIsOpen(false)}>
          <div className="status-modal" onClick={e => e.stopPropagation()}>
            <div className="status-modal-header">
              <h3>{t('status.setStatus') || 'Set Status'}</h3>
              <button className="modal-close-btn" onClick={() => setIsOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="status-modal-body">
              <div className="status-options">
                {STATUSES.map(status => {
                  const Icon = status.icon
                  return (
                    <button
                      key={status.id}
                      className={`status-option-card ${currentStatus === status.id ? 'active' : ''}`}
                      onClick={() => handleStatusChange(status.id)}
                    >
                      <div className="status-option-icon" style={{ backgroundColor: `${status.color}20`, color: status.color }}>
                        <Icon size={20} />
                      </div>
                      <div className="status-option-info">
                        <span className="status-option-label">{status.label}</span>
                        <span className="status-option-desc">{status.description}</span>
                      </div>
                      {currentStatus === status.id && (
                        <span className="status-check">✓</span>
                      )}
                    </button>
                  )
                })}
              </div>

              <div className="status-divider" />

              <div className="custom-status-section">
                <label className="custom-status-label">
                  {t('status.customStatus') || 'Custom Status'}
                </label>
                <div className="custom-status-input-wrapper">
                  <span className="custom-status-emoji">✏️</span>
                  <input
                    type="text"
                    className="custom-status-input"
                    placeholder={t('status.whatsHappening') || "What's happening?"}
                    value={customInput}
                    onChange={e => setCustomInput(e.target.value)}
                    maxLength={128}
                  />
                  <span className="char-count">{customInput.length}/128</span>
                </div>
                <div className="custom-status-actions">
                  {customStatus && (
                    <button className="btn-clear" onClick={handleClearCustomStatus}>
                      {t('common.clear') || 'Clear'}
                    </button>
                  )}
                  <button
                    className="btn-save"
                    onClick={handleCustomStatusSave}
                    disabled={customInput === customStatus}
                  >
                    {t('common.save') || 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

export default StatusSelector
