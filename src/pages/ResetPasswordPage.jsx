import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { authService } from '../services/authService'
import lazyLoadingService from '../services/lazyLoadingService'
import { ArrowPathIcon, KeyIcon } from '@heroicons/react/24/outline'
import { VoltageLogo } from '../components/LoadingScreen'
import '../assets/styles/LoginPage.css'

const ResetPasswordPage = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  
  const token = searchParams.get('token')
  const userId = searchParams.get('id')
  
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [validating, setValidating] = useState(true)
  const [validToken, setValidToken] = useState(false)
  const [redirectSeconds, setRedirectSeconds] = useState(3)
  const minPasswordLength = 8

  useEffect(() => {
    lazyLoadingService.preloadRouteChunks(['route:login', 'route:chat'], { idle: true })
  }, [])

  useEffect(() => {
    const verifyToken = async () => {
      if (!token || !userId) {
        setError('Invalid reset link')
        setValidating(false)
        return
      }
      
      try {
        const result = await authService.verifyResetToken(token, userId)
        if (result.valid) {
          setValidToken(true)
        } else {
          setError(result.error || 'Invalid or expired token')
        }
      } catch (err) {
        setError('Failed to verify token')
      } finally {
        setValidating(false)
      }
    }
    
    verifyToken()
  }, [token, userId])

  useEffect(() => {
    if (!success) return undefined
    const intervalId = window.setInterval(() => {
      setRedirectSeconds(prev => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => window.clearInterval(intervalId)
  }, [success])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    
    if (!newPassword || newPassword.length < minPasswordLength) {
      setError(`Password must be at least ${minPasswordLength} characters`)
      return
    }
    
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    
    setLoading(true)
    
    try {
      await authService.resetPassword(token, userId, newPassword)
      setSuccess(true)
      setRedirectSeconds(3)
      setTimeout(() => {
        navigate('/login')
      }, 3000)
    } catch (err) {
      setError(err.message || 'Failed to reset password')
    } finally {
      setLoading(false)
    }
  }

  const passwordTooShort = newPassword.length > 0 && newPassword.length < minPasswordLength
  const passwordMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword
  const canSubmit = !loading && !passwordTooShort && !passwordMismatch && newPassword.length >= minPasswordLength && confirmPassword.length > 0
  const passwordStrength = newPassword.length >= 14
    ? 'Strong'
    : newPassword.length >= 10
      ? 'Good'
      : newPassword.length >= minPasswordLength
        ? 'Valid'
        : 'Too short'
  const helperMessage = passwordTooShort
    ? `Password must be at least ${minPasswordLength} characters`
    : passwordMismatch
      ? 'Passwords do not match'
      : `Password strength: ${passwordStrength}`
  const helperInvalid = passwordTooShort || passwordMismatch

  const renderShell = (content) => (
    <div className="login-page">
      <div className="login-background">
        <div className="login-background-image" />
        <div className="login-background-overlay" />
        <div className="login-background-gradient" />
        <div className="grid-overlay" />
      </div>

      <div className="login-container reset-shell-container">
        <div className="login-content reset-password-content">
          <div className="login-branding">
            <div className="logo">
              <VoltageLogo size={48} />
            </div>
            <h1 className="brand-name">Volt</h1>
            <p className="brand-tagline">Secure account recovery</p>
          </div>
          {content}
          <p className="login-footer">Reset links expire automatically for account safety</p>
        </div>
      </div>
    </div>
  )

  if (validating) {
    return renderShell(
      <div className="login-loading" role="status" aria-live="polite">
        <ArrowPathIcon size={18} className="spin" />
        <span>Verifying reset link...</span>
      </div>
    )
  }

  if (!validToken) {
    return renderShell(
      <div className="reset-status-panel">
          <p className="login-error login-error-inline" role="alert">{error || 'Invalid reset link'}</p>
          <button type="button" className="login-button account reset-action-button" onClick={() => navigate('/login')}>
            Back to Login
          </button>
      </div>
    )
  }

  if (success) {
    return renderShell(
          <div className="reset-status-panel reset-success-panel">
            <div className="reset-sent-icon">✓</div>
            <h2 className="reset-title">Password Reset!</h2>
            <p className="reset-description">
              Your password has been reset successfully.
            </p>
            <p className="reset-redirect-text" role="status" aria-live="polite">
              Redirecting to login in {redirectSeconds}s...
            </p>
          </div>
    )
  }

  return renderShell(
      <>
        <h2 className="reset-title">Reset Password</h2>
        <p className="reset-description">
          Create a new password for your account.
        </p>
        
        {error && <p className="login-error login-error-inline" role="alert">{error}</p>}
        
        <form onSubmit={handleSubmit} className="login-form" aria-busy={loading}>
          <input
            className="login-input"
            type="password"
            autoComplete="new-password"
            placeholder={`New password (min ${minPasswordLength} chars)`}
            aria-label="New password"
            aria-invalid={passwordTooShort || Boolean(error)}
            value={newPassword}
            disabled={loading}
            onChange={(e) => {
              setNewPassword(e.target.value)
              if (error) setError('')
            }}
            autoFocus
            required
          />
          <input
            className="login-input"
            type="password"
            autoComplete="new-password"
            placeholder="Confirm new password"
            aria-label="Confirm new password"
            aria-invalid={passwordMismatch || Boolean(error)}
            value={confirmPassword}
            disabled={loading}
            onChange={(e) => {
              setConfirmPassword(e.target.value)
              if (error) setError('')
            }}
            required
          />
          <p role="status" aria-live="polite" className={`login-form-helper ${helperInvalid ? 'invalid' : ''}`}>
            {helperMessage}
          </p>
          <button className="login-button account reset-action-button" type="submit" disabled={!canSubmit} aria-busy={loading}>
            {loading ? <ArrowPathIcon size={18} className="spin" /> : <KeyIcon size={18} />}
            <span>{loading ? 'Resetting...' : 'Reset Password'}</span>
          </button>
        </form>

        <button
          type="button"
          className="forgot-password-link reset-back-link"
          onClick={() => navigate('/login')}
        >
          Back to Login
        </button>
      </>
  )
}

export default ResetPasswordPage
