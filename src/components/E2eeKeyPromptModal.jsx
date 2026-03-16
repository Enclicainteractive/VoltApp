import React, { useState, useRef, useEffect } from 'react'
import { Unlock, Key, Upload, Check, X, Loader2, Camera, Eye, EyeOff } from 'lucide-react'
import { importKeyFromFile, decryptWithPassword, parseKeyInput } from '../utils/e2eCrypto'
import QrScanner from 'qr-scanner'

const E2eeKeyPromptModal = ({ isOpen, onClose, mode, onKeyProvided, encryptedKeyData }) => {
  const [step, setStep] = useState('select')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [scanningQR, setScanningQR] = useState(false)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const qrScannerRef = useRef(null)

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('select')
      setError(null)
      setKeyInput('')
      setPassword('')
      setScanningQR(false)
    }
  }, [isOpen])

  // Handle password mode decryption
  const handlePasswordDecrypt = async () => {
    if (!password.trim()) {
      setError('Please enter your password')
      return
    }
    if (!encryptedKeyData) {
      setError('No encrypted key data found')
      return
    }
    
    setLoading(true)
    setError(null)
    
    try {
      const decrypted = await decryptWithPassword(encryptedKeyData, password)
      if (decrypted?.key) {
        onKeyProvided(decrypted.key)
      } else {
        throw new Error('Invalid key after decryption')
      }
    } catch (err) {
      console.error('Decryption error:', err)
      setError('Failed to decrypt with password. Please check your password.')
    } finally {
      setLoading(false)
    }
  }

  const handleImportKeyFile = async () => {
    setLoading(true)
    setError(null)
    try {
      const keyData = await importKeyFromFile()
      if (!keyData?.key) throw new Error('Invalid key file')
      
      // If the key file is password-protected, handle differently
      if (keyData.encrypted) {
        setStep('password')
        return
      }
      
      onKeyProvided(keyData.key)
    } catch (err) {
      setError(err.message || 'Failed to import key')
    } finally {
      setLoading(false)
    }
  }

  const handleEnterKey = async () => {
    if (!keyInput.trim()) {
      setError('Please enter a key')
      return
    }
    setLoading(true)
    setError(null)
    
    try {
      const parsed = await parseKeyInput(keyInput)
      if (parsed?.key) {
        onKeyProvided(parsed.key)
      } else {
        onKeyProvided(keyInput)
      }
    } catch (err) {
      setError('Invalid key format')
    } finally {
      setLoading(false)
    }
  }

  // QR Code scanning using camera
  const startQRScan = async () => {
    setError(null)
    try {
      if (!videoRef.current) {
        throw new Error('Video element not available')
      }

      const scanner = new QrScanner(
        videoRef.current,
        async (result) => {
          try {
            const parsed = await parseKeyInput(result.data)
            if (parsed?.key) {
              stopQRScan()
              onKeyProvided(parsed.key)
            } else {
              setError('Invalid QR code data')
            }
          } catch (err) {
            setError('Failed to parse QR code')
          }
        },
        {
          highlightScanRegion: true,
          highlightCodeOutline: true,
        }
      )

      await scanner.start()
      qrScannerRef.current = scanner
      setScanningQR(true)
    } catch (err) {
      console.error('Camera error:', err)
      setError('Could not access camera. Please enter key manually.')
    }
  }

  const stopQRScan = () => {
    if (qrScannerRef.current) {
      qrScannerRef.current.stop()
      qrScannerRef.current = null
    }
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop())
    }
    setScanningQR(false)
  }

  // Handle manual QR code paste (for QR data)
  const handleQRPaste = async () => {
    try {
      const pasted = await navigator.clipboard.readText()
      const parsed = await parseKeyInput(pasted)
      if (parsed?.key) {
        onKeyProvided(parsed.key)
      } else {
        setError('Invalid QR code data')
      }
    } catch {
      setError('Could not read clipboard')
    }
  }

  useEffect(() => {
    return () => {
      stopQRScan()
    }
  }, [])

  if (!isOpen) return null

  // Determine which UI to show based on mode
  const isPasswordMode = mode === 'password' || (encryptedKeyData?.encryptedKey)
  const isLocalMode = mode === 'local'
  const isTransparentMode = mode === 'transparent'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="volt-modal" onClick={e => e.stopPropagation()}>
        <div className="volt-modal-header">
          <Unlock size={22} style={{ color: 'var(--volt-warning)' }} />
          <h2>Encryption Key Required</h2>
          <button className="volt-modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="volt-modal-content">
          <p className="key-desc">
            {isPasswordMode 
              ? 'Enter your password to decrypt the encryption key and read messages.'
              : isLocalMode
              ? 'Import your encryption key file to decrypt messages.'
              : 'Enter or scan your encryption key to decrypt messages.'}
          </p>

          {error && <div className="volt-modal-error">{error}</div>}

          {/* Password Mode UI */}
          {isPasswordMode && step === 'select' && (
            <>
              <div className="key-mode-badge" style={{ backgroundColor: 'var(--volt-primary)', color: 'white' }}>
                🔐 Password Protected
              </div>
              
              <div className="key-options vertical">
                <div className="password-input-section">
                  <label>Enter your password:</label>
                  <div className="password-input-wrapper">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Enter password"
                      className="volt-input"
                      onKeyDown={e => e.key === 'Enter' && handlePasswordDecrypt()}
                    />
                    <button 
                      className="password-toggle"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                
                <button 
                  className="volt-btn volt-btn-primary" 
                  onClick={handlePasswordDecrypt}
                  disabled={loading || !password.trim()}
                >
                  {loading ? <Loader2 size={16} className="spin" /> : <Unlock size={16} />}
                  Decrypt Messages
                </button>
              </div>
              
              <div className="divider-text">
                <span>or</span>
              </div>
              
              <div className="key-options">
                <button className="key-option" onClick={() => setStep('import')}>
                  <Upload size={20} />
                  <span>Import Key File</span>
                </button>
                <button className="key-option" onClick={() => setStep('enter')}>
                  <Key size={20} />
                  <span>Enter Key Manually</span>
                </button>
              </div>
            </>
          )}

          {/* Local Mode UI */}
          {isLocalMode && step === 'select' && (
            <>
              <div className="key-mode-badge" style={{ backgroundColor: 'var(--volt-success)', color: 'white' }}>
                💾 Device Only
              </div>
              
              <div className="key-options vertical">
                <button className="key-option large" onClick={handleImportKeyFile} disabled={loading}>
                  <Upload size={32} />
                  <span>Import Key File</span>
                  <small>Select the .json file you exported</small>
                </button>
              </div>
              
              <div className="divider-text">
                <span>or</span>
              </div>
              
              <button className="key-option" onClick={() => setStep('enter')} disabled={loading}>
                <Key size={20} />
                <span>Enter Key Manually</span>
              </button>
            </>
          )}

          {/* Transparent/Synced Mode UI */}
          {isTransparentMode && step === 'select' && (
            <>
              <div className="key-mode-badge" style={{ backgroundColor: 'var(--volt-warning)', color: 'white' }}>
                🔄 Synced
              </div>
              
              <div className="key-options vertical">
                <button className="key-option large" onClick={handleImportKeyFile} disabled={loading}>
                  <Upload size={32} />
                  <span>Import Key File</span>
                </button>
                
                <button className="key-option large" onClick={startQRScan} disabled={loading}>
                  <Camera size={32} />
                  <span>Scan QR Code</span>
                </button>
                
                <button className="key-option large" onClick={handleQRPaste} disabled={loading}>
                  <Key size={32} />
                  <span>Paste from Clipboard</span>
                </button>
              </div>
              
              <div className="divider-text">
                <span>or</span>
              </div>
              
              <button className="key-option" onClick={() => setStep('enter')} disabled={loading}>
                <Key size={20} />
                <span>Enter Key Manually</span>
              </button>
            </>
          )}

          {/* Import Step */}
          {step === 'import' && (
            <>
              <div className="key-input-area">
                <button className="key-option large" onClick={handleImportKeyFile} disabled={loading}>
                  <Upload size={32} />
                  <span>Select Key File</span>
                </button>
              </div>
              <div className="volt-modal-footer" style={{ marginTop: '16px', paddingTop: '0', border: 'none' }}>
                <button className="volt-btn volt-btn-ghost" onClick={() => setStep('select')}>Back</button>
              </div>
            </>
          )}

          {/* Enter Key Step */}
          {step === 'enter' && (
            <>
              <div className="key-input-area">
                <label>Paste your encryption key:</label>
                <textarea
                  value={keyInput}
                  onChange={e => setKeyInput(e.target.value)}
                  placeholder='{"key": "..."} or raw key string'
                  rows={4}
                  className="volt-input"
                />
              </div>
              <div className="volt-modal-footer" style={{ marginTop: '16px', paddingTop: '0', border: 'none' }}>
                <button className="volt-btn volt-btn-ghost" onClick={() => setStep('select')}>Back</button>
                <button className="volt-btn volt-btn-primary" onClick={handleEnterKey} disabled={loading || !keyInput.trim()}>
                  <Check size={16} /> Decrypt
                </button>
              </div>
            </>
          )}

          {/* QR Scanner */}
          {scanningQR && (
            <div className="qr-scanner">
              <video ref={videoRef} className="qr-video" />
              <div className="qr-overlay">
                <p>Point your camera at a QR code</p>
                <button className="volt-btn volt-btn-ghost" onClick={stopQRScan}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {step === 'select' && (
          <div className="volt-modal-footer">
            <button className="skip-link" onClick={onClose}>
              Skip for now (messages stay hidden)
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default E2eeKeyPromptModal
