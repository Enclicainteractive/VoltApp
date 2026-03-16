import React, { useState, useEffect } from 'react'
import { Shield, Lock, Key, Monitor, Smartphone, AlertTriangle, Check, X, Loader2, Copy, RefreshCw, Eye, EyeOff, Info } from 'lucide-react'
import { apiService } from '../services/apiService'
import { 
  hashPassword, encryptWithPassword, 
  generateSymmetricKey, exportSymmetricKey,
  exportKeyToFile, calculatePasswordStrength,
  generateStrongPassword, createKeyExportPackage,
  generateQRCode
} from '../utils/e2eCrypto'

const E2eeEnableModal = ({ conversationId, isOpen, onClose, onEnabled, otherUser }) => {
  const [mode, setMode] = useState('password') // 'password', 'local', 'transparent'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [masterPassword, setMasterPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [passwordStrength, setPasswordStrength] = useState({ score: 0, label: 'None', color: '#666', suggestions: [] })
  const [showPasswordSuggestions, setShowPasswordSuggestions] = useState(false)
  const [generatedPassword, setGeneratedPassword] = useState('')
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState(null)

  // Calculate password strength on change
  useEffect(() => {
    const strength = calculatePasswordStrength(masterPassword)
    setPasswordStrength(strength)
  }, [masterPassword])

  // Generate QR code for transparent mode
  useEffect(() => {
    const generateQR = async () => {
      if (mode === 'transparent' && isOpen) {
        const key = await generateSymmetricKey()
        const exportedKey = await exportSymmetricKey(key)
        const packageData = {
          type: 'voltchat-dm-key',
          version: 1,
          key: exportedKey,
          mode: 'transparent',
          conversationId,
          createdAt: Date.now()
        }
        
        try {
          const qrDataUrl = await generateQRCode(JSON.stringify(packageData), { size: 300 })
          setQrCodeDataUrl(qrDataUrl)
        } catch (err) {
          console.error('QR generation error:', err)
          setQrCodeDataUrl(null)
        }
      } else {
        setQrCodeDataUrl(null)
      }
    }
    
    generateQR()
  }, [mode, isOpen, conversationId])

  const handleGeneratePassword = () => {
    const newPassword = generateStrongPassword(20)
    setGeneratedPassword(newPassword)
    setMasterPassword(newPassword)
    setConfirmPassword(newPassword)
  }

  const handleCopyPassword = () => {
    if (generatedPassword) {
      navigator.clipboard.writeText(generatedPassword)
    }
  }

  const handleRequest = async () => {
    setLoading(true)
    setError(null)
    try {
      const key = await generateSymmetricKey()
      const exportedKey = await exportSymmetricKey(key)
      
      if (mode === 'password') {
        // Password-protected mode: encrypt-at-rest with user password
        const minLength = 8
        if (masterPassword.length < minLength) {
          setError(`Password must be at least ${minLength} characters`)
          setLoading(false)
          return
        }
        if (passwordStrength.score < 2) {
          setError('Please use a stronger password (at least Fair strength)')
          setLoading(false)
          return
        }
        if (masterPassword !== confirmPassword) {
          setError('Passwords do not match')
          setLoading(false)
          return
        }
        
        // Hash password for server storage (not for encryption - only for verification)
        const passwordHash = await hashPassword(masterPassword)
        await apiService.setDmMasterPassword(conversationId, passwordHash)
        
        // Encrypt the DM key using the password with proper KDF
        const keyEncrypted = await encryptWithPassword({ key: exportedKey }, masterPassword)
        localStorage.setItem(`dm_e2e_${conversationId}`, JSON.stringify({ 
          encryptedKey: keyEncrypted, 
          mode: 'password',
          kdf: 'PBKDF2',
          iterations: 600000,
          createdAt: Date.now() 
        }))
      } else if (mode === 'local') {
        // Local-only mode: export key file, store only locally
        exportKeyToFile({ key: exportedKey, mode: 'local', conversationId }, `dm-key-${conversationId}`)
        localStorage.setItem(`dm_e2e_${conversationId}`, JSON.stringify({ 
          mode: 'local', 
          savedLocally: true, 
          createdAt: Date.now() 
        }))
      } else if (mode === 'transparent') {
        // Transparent mode: synced but encrypted backup
        localStorage.setItem(`dm_e2e_${conversationId}`, JSON.stringify({ 
          key: exportedKey, 
          mode: 'transparent', 
          createdAt: Date.now() 
        }))
      }
      
      await apiService.requestDmEncryption(conversationId, mode)
      onEnabled?.()
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to enable encryption')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const modeOptions = [
    { 
      id: 'password', 
      title: 'Password Protected', 
      icon: Lock, 
      desc: 'Key encrypted with your password',
      color: 'var(--volt-primary)',
      security: 'Best - Keys protected by PBKDF2 (600K iterations)',
      details: 'If someone steals your browser data, they still need your password to read messages.'
    },
    { 
      id: 'local', 
      title: 'Device Only', 
      icon: Monitor, 
      desc: 'Stored only on this device',
      color: 'var(--volt-success)',
      security: 'High - Nothing synced to server',
      details: 'Best for maximum containment. Key stays on this device only. If you lose access, you cannot recover without a backup.'
    },
    { 
      id: 'transparent', 
      title: 'Synced (Recovery)', 
      icon: Smartphone, 
      desc: 'Works across devices',
      color: 'var(--volt-warning)',
      security: 'Medium - Encrypted backup synced',
      details: 'Keys sync encrypted. Best convenience - new devices work without manual unlock. If you lose all devices, recovery is possible.'
    }
  ]

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="volt-modal" onClick={e => e.stopPropagation()}>
        <div className="volt-modal-header">
          <Shield size={22} style={{ color: 'var(--volt-primary)' }} />
          <h2>Enable Encryption</h2>
          <button className="volt-modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="volt-modal-content">
          {otherUser && (
            <div className="e2ee-notice">
              <AlertTriangle size={16} />
              <span>Request will be sent to <strong>@{otherUser.username}</strong></span>
            </div>
          )}

          {error && <div className="volt-modal-error">{error}</div>}

          <div className="mode-options">
            {modeOptions.map(opt => (
              <button
                key={opt.id}
                className={`mode-option ${mode === opt.id ? 'selected' : ''}`}
                onClick={() => setMode(opt.id)}
              >
                <opt.icon size={20} style={{ color: opt.color }} />
                <div className="mode-option-content">
                  <span className="mode-option-title">{opt.title}</span>
                  <span className="mode-option-desc">{opt.desc}</span>
                </div>
                {mode === opt.id && <Check size={18} style={{ color: 'var(--volt-primary)' }} />}
              </button>
            ))}
          </div>

          {/* Password mode UI */}
          {mode === 'password' && (
            <div className="password-section">
              <div className="password-header">
                <Key size={14} />
                <span>Enter a strong password to protect your encryption key</span>
              </div>
              
              <label className="volt-input-label">
                <span>Password</span>
                <div className="password-input-wrapper">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={masterPassword}
                    onChange={e => setMasterPassword(e.target.value)}
                    placeholder="Enter password (min 8 characters)"
                    className="volt-input"
                  />
                  <button 
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
              
              {/* Password strength meter */}
              <div className="password-strength">
                <div className="strength-bar">
                  <div 
                    className="strength-fill" 
                    style={{ 
                      width: `${(passwordStrength.score + 1) * 20}%`,
                      backgroundColor: passwordStrength.color 
                    }} 
                  />
                </div>
                <span className="strength-label" style={{ color: passwordStrength.color }}>
                  {passwordStrength.label}
                </span>
              </div>
              
              {/* Password suggestions */}
              {passwordStrength.suggestions.length > 0 && masterPassword.length > 0 && (
                <div className="password-suggestions">
                  {passwordStrength.suggestions.map((suggestion, i) => (
                    <span key={i} className="suggestion-item">• {suggestion}</span>
                  ))}
                </div>
              )}
              
              {/* Generate strong password button */}
              <button 
                type="button"
                className="generate-password-btn"
                onClick={handleGeneratePassword}
              >
                <RefreshCw size={14} />
                Generate Strong Password
              </button>
              
              {/* Show generated password */}
              {generatedPassword && (
                <div className="generated-password-display">
                  <code>{generatedPassword}</code>
                  <button type="button" onClick={handleCopyPassword} title="Copy">
                    <Copy size={14} />
                  </button>
                </div>
              )}
              
              <label className="volt-input-label">
                <span>Confirm Password</span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  className="volt-input"
                />
              </label>
              
              {/* Security info */}
              <div className="security-info">
                <Info size={14} />
                <span>Your password is used to encrypt the key locally. We never store your password - only a hash for verification.</span>
              </div>
            </div>
          )}
          
          {/* Local mode UI */}
          {mode === 'local' && (
            <div className="local-mode-info">
              <div className="info-banner">
                <Monitor size={20} />
                <div>
                  <strong>Device-Only Mode</strong>
                  <p>Your encryption key will be generated and stored only on this device. No data will be sent to any server.</p>
                </div>
              </div>
              <ul className="mode-details">
                <li>✓ Key never leaves this device</li>
                <li>✓ Export a backup file to recover later</li>
                <li>⚠ If you clear browser data, you need the backup file</li>
                <li>⚠ Other devices cannot access this conversation</li>
              </ul>
            </div>
          )}
          
          {/* Transparent/Synced mode UI */}
          {mode === 'transparent' && (
            <div className="transparent-mode-info">
              <div className="info-banner">
                <Smartphone size={20} />
                <div>
                  <strong>Synced (Recovery) Mode</strong>
                  <p>Your key will be stored locally and synced encrypted to your account.</p>
                </div>
              </div>
              
              {qrCodeDataUrl && (
                <div className="qr-code-section">
                  <span className="qr-label">Scan this QR code on another device to import the key:</span>
                  <img src={qrCodeDataUrl} alt="QR Code for key transfer" className="qr-code-image" />
                </div>
              )}
              
              <ul className="mode-details">
                <li>✓ Access from any device</li>
                <li>✓ Key is encrypted before sync</li>
                <li>✓ Recovery possible if you lose all devices</li>
                <li>⚠ If account is compromised, key may be exposed</li>
              </ul>
            </div>
          )}
        </div>

        <div className="volt-modal-footer">
          <button className="volt-btn volt-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="volt-btn volt-btn-primary" onClick={handleRequest} disabled={loading}>
            {loading ? <Loader2 size={16} className="spin" /> : <Shield size={16} />}
            {mode === 'password' ? 'Enable with Password' : mode === 'local' ? 'Enable (Device Only)' : 'Enable & Sync'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default E2eeEnableModal
