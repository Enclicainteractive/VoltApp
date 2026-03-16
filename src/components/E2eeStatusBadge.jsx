import React from 'react'
import { Lock, Unlock, Loader2 } from 'lucide-react'

const E2eeStatusBadge = ({ enabled, mode, pending, needsKey = false, size = 16, showLabel = false }) => {
  const isPending = pending === 'pending' || pending === 'pending_key' || pending === true
  const needsKeyState = needsKey && !enabled
  
  const shouldShow = enabled || needsKeyState || isPending
  
  if (!shouldShow) return null

  const getColor = () => {
    if (needsKeyState) return 'var(--volt-danger)'
    if (isPending) return 'var(--volt-warning)'
    switch (mode) {
      case 'transparent': return 'var(--volt-warning)'
      case 'standard': return 'var(--volt-success)'
      case 'local': return 'var(--volt-primary)'
      default: return 'var(--volt-success)'
    }
  }

  const getIcon = () => {
    if (needsKeyState) return Unlock
    if (isPending) return Loader2
    return Lock
  }

  const getLabel = () => {
    if (needsKeyState) return 'Key Required'
    if (isPending) return 'Pending'
    switch (mode) {
      case 'transparent': return 'Transparent'
      case 'standard': return 'Encrypted'
      case 'local': return 'Local'
      default: return 'Encrypted'
    }
  }

  const color = getColor()
  const Icon = getIcon()

  return (
    <span 
      className={`e2ee-badge ${needsKeyState ? 'needs-key' : ''} ${isPending ? 'pending' : ''} ${enabled && !needsKeyState ? 'active' : ''}`}
      style={{ '--badge-color': color }}
      title={needsKeyState ? 'E2EE key required - click to enter key' : isPending ? 'E2EE pending confirmation' : `E2EE Enabled (${mode || 'Standard'})`}
    >
      {isPending && !needsKeyState ? (
        <Loader2 size={size} className="badge-spin" />
      ) : (
        <Icon size={size} />
      )}
      {showLabel && <span className="badge-label">{getLabel()}</span>}
      <style>{`
        .e2ee-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          color: var(--badge-color);
          cursor: help;
        }
        
        .e2ee-badge.needs-key {
          cursor: pointer;
          animation: pulse 2s infinite;
        }
        
        .badge-label {
          font-size: 12px;
          font-weight: 500;
        }
        
        .badge-spin {
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </span>
  )
}

export default E2eeStatusBadge
