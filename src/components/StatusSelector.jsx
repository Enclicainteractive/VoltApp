import React, { useState } from 'react'
import { ChevronDown, Circle, Moon, MinusCircle, Eye } from 'lucide-react'
import { useSocket } from '../contexts/SocketContext'
import { apiService } from '../services/apiService'
import { useTranslation } from '../hooks/useTranslation'
import '../assets/styles/StatusSelector.css'

const StatusSelector = ({ currentStatus = 'online', customStatus = '', onStatusChange }) => {
  const { t } = useTranslation()
  const { socket } = useSocket()
  const [isOpen, setIsOpen] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const [customInput, setCustomInput] = useState(customStatus)

  const STATUSES = [
    { id: 'online', label: t('status.online'), color: '#22c55e', icon: Circle },
    { id: 'idle', label: t('status.idle'), color: '#f59e0b', icon: Moon },
    { id: 'dnd', label: t('status.dnd'), color: '#ef4444', icon: MinusCircle },
    { id: 'invisible', label: t('status.invisible'), color: '#6b7280', icon: Eye }
  ]

  const currentStatusData = STATUSES.find(s => s.id === currentStatus) || STATUSES[0]

  const handleStatusChange = async (statusId) => {
    try {
      await apiService.updateStatus(statusId, customStatus)
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
      socket?.emit('status:change', { status: currentStatus, customStatus: customInput })
      onStatusChange?.({ status: currentStatus, customStatus: customInput })
    } catch (err) {
      console.error('Failed to update custom status:', err)
    }
    setShowCustom(false)
  }

  const handleClearCustomStatus = async () => {
    try {
      await apiService.updateStatus(currentStatus, '')
      socket?.emit('status:change', { status: currentStatus, customStatus: '' })
      onStatusChange?.({ status: currentStatus, customStatus: '' })
      setCustomInput('')
    } catch (err) {
      console.error('Failed to clear custom status:', err)
    }
    setShowCustom(false)
  }

  return (
    <div className="status-selector">
      <button className="status-trigger" onClick={() => setIsOpen(!isOpen)}>
        <span 
          className="status-indicator"
          style={{ backgroundColor: currentStatusData.color }}
        />
        <span className="status-label">
          {customStatus || currentStatusData.label}
        </span>
        <ChevronDown size={16} className={`chevron ${isOpen ? 'open' : ''}`} />
      </button>

      {isOpen && (
        <div className="status-dropdown">
          {STATUSES.map(status => {
            const Icon = status.icon
            return (
              <button
                key={status.id}
                className={`status-option ${currentStatus === status.id ? 'active' : ''}`}
                onClick={() => handleStatusChange(status.id)}
              >
                <span 
                  className="status-dot"
                  style={{ backgroundColor: status.color }}
                />
                <span className="status-text">{status.label}</span>
                {currentStatus === status.id && <span className="status-check">✓</span>}
              </button>
            )
          })}
          
          <div className="status-divider" />
          
          <button 
            className="status-option custom"
            onClick={() => { setShowCustom(true); setIsOpen(false) }}
          >
            <span className="status-emoji">✏️</span>
            <span className="status-text">
              {customStatus ? t('status.editCustomStatus') : t('status.setCustomStatus')}
            </span>
          </button>
          
          {customStatus && (
            <button 
              className="status-option clear"
              onClick={handleClearCustomStatus}
            >
              <span className="status-emoji">🗑️</span>
              <span className="status-text">{t('status.clearStatus')}</span>
            </button>
          )}
        </div>
      )}

      {showCustom && (
        <div className="custom-status-modal">
          <div className="custom-status-content">
            <h4>{t('status.setCustomStatus')}</h4>
            <div className="custom-status-input-group">
              <input
                type="text"
                className="input"
                placeholder={t('status.customStatusPlaceholder') || "What's happening?"}
                value={customInput}
                onChange={e => setCustomInput(e.target.value)}
                maxLength={128}
                autoFocus
              />
              <span className="char-count">{customInput.length}/128</span>
            </div>
            <div className="custom-status-actions">
              <button className="btn btn-secondary" onClick={() => setShowCustom(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-primary" onClick={handleCustomStatusSave}>
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default StatusSelector
