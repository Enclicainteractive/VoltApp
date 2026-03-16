import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { authService } from '../services/authService'
import { ArrowPathIcon, KeyIcon } from '@heroicons/react/24/outline'
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    
    if (!newPassword || newPassword.length < 8) {
      setError('Password must be at least 8 characters')
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
      setTimeout(() => {
        navigate('/login')
      }, 3000)
    } catch (err) {
      setError(err.message || 'Failed to reset password')
    } finally {
      setLoading(false)
    }
  }

  if (validating) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-header">
            <div className="logo">V</div>
            <h1 className="brand-name">VoltChat</h1>
          </div>
          <p style={{ textAlign: 'center', color: 'var(--volt-text-secondary)' }}>
            Verifying reset link...
          </p>
        </div>
      </div>
    )
  }

  if (!validToken) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-header">
            <div className="logo">V</div>
            <h1 className="brand-name">VoltChat</h1>
          </div>
          <p className="login-error">{error || 'Invalid reset link'}</p>
          <button className="login-button account" onClick={() => navigate('/login')}>
            Back to Login
          </button>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-header">
            <div className="logo">V</div>
            <h1 className="brand-name">VoltChat</h1>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div className="reset-sent-icon">✓</div>
            <h2>Password Reset!</h2>
            <p style={{ color: 'var(--volt-text-secondary)', marginBottom: 20 }}>
              Your password has been reset successfully.
            </p>
            <p style={{ color: 'var(--volt-text-secondary)', fontSize: 14 }}>
              Redirecting to login...
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div className="logo">V</div>
          <h1 className="brand-name">VoltChat</h1>
        </div>
        
        <h2 style={{ textAlign: 'center', marginBottom: 24 }}>Reset Password</h2>
        
        {error && <p className="login-error">{error}</p>}
        
        <form onSubmit={handleSubmit}>
          <input
            className="login-input"
            type="password"
            autoComplete="new-password"
            placeholder="New password (min 8 chars)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <input
            className="login-input"
            type="password"
            autoComplete="new-password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          <button className="login-button account" type="submit" disabled={loading}>
            {loading ? <ArrowPathIcon size={18} className="spin" /> : <KeyIcon size={18} />}
            <span>{loading ? 'Resetting...' : 'Reset Password'}</span>
          </button>
        </form>
        
        <button 
          className="forgot-password-link" 
          onClick={() => navigate('/login')}
          style={{ display: 'block', textAlign: 'center', marginTop: 16 }}
        >
          Back to Login
        </button>
      </div>
    </div>
  )
}

export default ResetPasswordPage
