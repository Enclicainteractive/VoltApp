import React from 'react'
import { Lock, ShieldCheck, RefreshCw, AlertTriangle } from 'lucide-react'

export const EncryptionStatusBadge = ({ 
  isEncryptionEnabled, 
  hasDecryptedKey, 
  isJoining = false 
}) => {
  if (!isEncryptionEnabled) {
    return (
      <div className="encryption-status-badge not-enabled">
        <Lock size={16} />
        <span>Encryption Not Enabled</span>
      </div>
    )
  }

  if (isJoining) {
    return (
      <div className="encryption-status-badge joining">
        <RefreshCw size={16} className="animate-spin" />
        <span>Joining Encryption...</span>
      </div>
    )
  }

  if (hasDecryptedKey) {
    return (
      <div className="encryption-status-badge secure">
        <ShieldCheck size={16} />
        <span>End-to-End Encrypted</span>
      </div>
    )
  }

  return (
    <div className="encryption-status-badge pending">
      <AlertTriangle size={16} />
      <span>Encryption Pending</span>
    </div>
  )
}