import React from 'react'
import { Lock, AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react'

export const EncryptionFallback = ({ 
  status, 
  onRetry, 
  isRetrying = false,
  showDetails = false 
}) => {
  if (!status) return null

  const getStatusConfig = () => {
    switch (status) {
      case 'no_keys':
        return {
          icon: AlertTriangle,
          color: 'text-yellow-500',
          bgColor: 'bg-yellow-500/10',
          borderColor: 'border-yellow-500/20',
          title: 'Encryption Keys Not Found',
          message: 'Your encryption keys are missing. You may need to re-authenticate or generate new keys.',
          action: 'Generate Keys'
        }
      case 'decryption_failed':
        return {
          icon: AlertTriangle,
          color: 'text-red-500',
          bgColor: 'bg-red-500/10',
          borderColor: 'border-red-500/20',
          title: 'Decryption Failed',
          message: 'Could not decrypt this message. The encryption key may have changed.',
          action: 'Retry'
        }
      case 'encryption_failed':
        return {
          icon: AlertTriangle,
          color: 'text-red-500',
          bgColor: 'bg-red-500/10',
          borderColor: 'border-red-500/20',
          title: 'Encryption Failed',
          message: 'Could not encrypt this message. Please check your encryption settings.',
          action: 'Retry'
        }
      case 'key_rotation_in_progress':
        return {
          icon: RefreshCw,
          color: 'text-blue-500',
          bgColor: 'bg-blue-500/10',
          borderColor: 'border-blue-500/20',
          title: 'Key Rotation in Progress',
          message: 'Encryption keys are being rotated. Messages will be re-encrypted automatically.',
          action: null
        }
      case 'not_enabled':
        return {
          icon: Lock,
          color: 'text-gray-500',
          bgColor: 'bg-gray-500/10',
          borderColor: 'border-gray-500/20',
          title: 'Encryption Not Enabled',
          message: 'End-to-end encryption is not enabled for this conversation.',
          action: null
        }
      case 'secure':
        return {
          icon: ShieldCheck,
          color: 'text-green-500',
          bgColor: 'bg-green-500/10',
          borderColor: 'border-green-500/20',
          title: 'End-to-End Encrypted',
          message: 'Messages are secured with end-to-end encryption.',
          action: null
        }
      default:
        return {
          icon: AlertTriangle,
          color: 'text-gray-500',
          bgColor: 'bg-gray-500/10',
          borderColor: 'border-gray-500/20',
          title: 'Encryption Status Unknown',
          message: 'Unable to determine encryption status.',
          action: 'Retry'
        }
    }
  }

  const config = getStatusConfig()
  const Icon = config.icon

  if (status === 'secure' && !showDetails) {
    return null
  }

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${config.bgColor} ${config.borderColor}`}>
      <Icon className={`w-4 h-4 ${config.color} ${status === 'key_rotation_in_progress' ? 'animate-spin' : ''}`} />
      <div className="flex-1">
        <p className={`text-sm font-medium ${config.color}`}>{config.title}</p>
        {showDetails && (
          <p className="text-xs text-gray-400 mt-0.5">{config.message}</p>
        )}
      </div>
      {config.action && onRetry && (
        <button
          onClick={onRetry}
          disabled={isRetrying}
          className={`text-xs px-2 py-1 rounded ${config.bgColor} ${config.color} hover:opacity-80 disabled:opacity-50 transition-opacity`}
        >
          {isRetrying ? 'Retrying...' : config.action}
        </button>
      )}
    </div>
  )
}

export const EncryptionMessagePlaceholder = ({ status }) => {
  const getStatusMessage = () => {
    switch (status) {
      case 'no_keys':
        return '[Encrypted - Keys not available]'
      case 'decryption_failed':
        return '[Encrypted - Could not decrypt]'
      case 'encryption_failed':
        return '[Encryption failed]'
      case 'key_rotation_in_progress':
        return '[Re-encrypting...]'
      default:
        return '[Encrypted message]'
    }
  }

  return (
    <span className="text-gray-500 italic text-sm">
      {getStatusMessage()}
    </span>
  )
}

export const useEncryptionFallback = (serverId, conversationId) => {
  const getEncryptionStatus = () => {
    if (!serverId && !conversationId) {
      return 'not_enabled'
    }
    
    return 'secure'
  }

  const handleRetry = async () => {
    console.log('[EncryptionFallback] Retry requested')
  }

  return {
    status: getEncryptionStatus(),
    handleRetry,
    EncryptionFallback,
    EncryptionMessagePlaceholder
  }
}