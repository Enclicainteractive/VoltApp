import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getStoredServer } from '../services/serverConfig'
import { authService } from '../services/authService'
import { setSessionValue, setStoredUserData } from '../services/authSession'
import { useTranslation } from '../hooks/useTranslation'
import ServerSelector from '../components/ServerSelector'
import LoadingScreen from '../components/LoadingScreen'
import { VoltageLogo } from '../components/LoadingScreen'
import { ServerStackIcon, ChevronDownIcon, ArrowPathIcon, KeyIcon, ShieldCheckIcon } from '@heroicons/react/24/outline'
import '../assets/styles/LoginPage.css'

const LoginPage = () => {
  const { t } = useTranslation()
  const { login, isAuthenticated, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  
  const [showServerSelector, setShowServerSelector] = useState(false)
  const [server, setServer] = useState(null)
  const [authConfig, setAuthConfig] = useState(null)
  const [authConfigLoading, setAuthConfigLoading] = useState(true)
  const [mode, setMode] = useState('oauth')
  const [accountAction, setAccountAction] = useState('login')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [registerUsername, setRegisterUsername] = useState('')
  const [registerEmail, setRegisterEmail] = useState('')
  const [registerBirthDate, setRegisterBirthDate] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')
  const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [modeSwitching, setModeSwitching] = useState(false)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [resetError, setResetError] = useState('')
  const [resetLoading, setResetLoading] = useState(false)

  const authMode = useMemo(() => {
    const serverCfg = authService.getServerConfig()
    const localEnabled = authConfig?.localAuthEnabled ?? true
    const oauthEnabled = authConfig?.oauthEnabled ?? !!serverCfg?.isOAuth
    const canRegister = !!(localEnabled && (authConfig?.canRegister ?? authConfig?.allowRegistration ?? true))
    const minPasswordLength = Number(authConfig?.minPasswordLength || 8)
    const providerName = /enclica/i.test(serverCfg?.authUrl || '') || /enclica/i.test(serverCfg?.host || '')
      ? 'Enclica'
      : 'OAuth'
    return {
      localEnabled,
      oauthEnabled,
      canRegister,
      minPasswordLength,
      providerName
    }
  }, [authConfig])

  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      navigate('/chat', { replace: true })
    }
  }, [isAuthenticated, authLoading, navigate])

  useEffect(() => {
    const stored = getStoredServer()
    setServer(stored)
  }, [])

  useEffect(() => {
    let cancelled = false
    const loadAuthConfig = async () => {
      setAuthConfigLoading(true)
      setError('')
      try {
        const cfg = await authService.getAuthConfig()
        if (!cancelled) setAuthConfig(cfg)
      } catch {
        if (!cancelled) setAuthConfig(null)
      } finally {
        if (!cancelled) setAuthConfigLoading(false)
      }
    }
    loadAuthConfig()
    return () => { cancelled = true }
  }, [server?.apiUrl, server?.socketUrl, server?.host, server?.clientId, server?.authUrl])

  useEffect(() => {
    if (authMode.localEnabled && !authMode.oauthEnabled) {
      setMode('account')
      return
    }
    if (!authMode.localEnabled && authMode.oauthEnabled) {
      setMode('oauth')
      return
    }
    setMode(prev => (prev === 'oauth' || prev === 'account') ? prev : 'oauth')
  }, [authMode.localEnabled, authMode.oauthEnabled])

  // Early return after all hooks are called
  if (authLoading) {
    return <LoadingScreen message="Checking login status..." />
  }

  const selectMode = (nextMode) => {
    const allowed = nextMode === 'oauth' ? authMode.oauthEnabled : authMode.localEnabled
    if (!allowed || nextMode === mode) return
    setModeSwitching(true)
    setMode(nextMode)
    window.setTimeout(() => setModeSwitching(false), 180)
  }

  const persistSessionAndRedirect = async (tokenData) => {
    if (!tokenData?.access_token) {
      throw new Error('Login succeeded but no access token was returned')
    }
    setSessionValue('access_token', tokenData.access_token)
    const oauthToken = tokenData.upstream_access_token || tokenData.oauth_access_token || ''
    setSessionValue('oauth_access_token', oauthToken || null)
    if (tokenData.refresh_token) {
      setSessionValue('refresh_token', tokenData.refresh_token)
    }
    const userData = await authService.getUserInfo(tokenData)
    setStoredUserData(userData)
    window.location.href = '/chat'
  }

  const handleLocalLogin = async (e) => {
    e.preventDefault()
    if (!identifier.trim() || !password) {
      setError(t('auth.missingCredentials', 'Enter username/email and password.'))
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const tokenData = await authService.login(identifier.trim(), password)
      await persistSessionAndRedirect(tokenData)
    } catch (err) {
      setError(err?.message || t('auth.loginFailed', 'Login failed'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleLocalRegister = async (e) => {
    e.preventDefault()
    if (!authMode.canRegister) {
      setError(t('auth.registrationDisabled', 'Account creation is disabled on this server.'))
      return
    }
    if (!registerUsername.trim() || !registerEmail.trim() || !registerBirthDate || !registerPassword) {
      setError('Enter username, email, birth date, and password.')
      return
    }
    if (registerPassword.length < authMode.minPasswordLength) {
      setError(t('auth.passwordTooShort', 'Password must be at least {{min}} characters.', { min: authMode.minPasswordLength }))
      return
    }
    if (registerPassword !== registerPasswordConfirm) {
      setError(t('auth.passwordMismatch', 'Passwords do not match.'))
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const tokenData = await authService.register(registerEmail.trim(), registerPassword, registerUsername.trim(), registerBirthDate)
      await persistSessionAndRedirect(tokenData)
    } catch (err) {
      setError(err?.message || t('auth.registrationFailed', 'Failed to create account'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-background">
        <div className="login-background-image" />
        <div className="login-background-overlay" />
        <div className="login-background-gradient" />
        <div className="grid-overlay" />
        <div className="login-background-particles">
          <div className="particle" />
          <div className="particle" />
          <div className="particle" />
          <div className="particle" />
          <div className="particle" />
          <div className="particle" />
          <div className="particle" />
          <div className="particle" />
          <div className="particle" />
          <div className="particle" />
        </div>
      </div>
      <div className="server-selector-button-container">
        <button 
          className="server-selector-button"
          onClick={() => setShowServerSelector(true)}
        >
          <ServerStackIcon size={16} />
          <span>{server?.name || 'Select Server'}</span>
          <ChevronDownIcon size={14} />
        </button>
      </div>

      <div className="login-container">
        <div className="login-content">
          <div className="login-branding">
            <div className="logo">
              <VoltageLogo size={48} />
            </div>
            <h1 className="brand-name">{t('app.name', 'Volt')}</h1>
            <p className="brand-tagline">{t('app.tagline', 'Real-time chat, voice and video')}</p>
          </div>

          {authConfigLoading ? (
            <div className="login-loading">
              <ArrowPathIcon size={18} className="spin" />
              <span>{t('auth.loadingMethods', 'Loading sign-in methods...')}</span>
            </div>
          ) : (
            <>
              {(authMode.localEnabled || authMode.oauthEnabled) && (
                <div className="login-mode-toggle">
                  <button
                    className={`mode-btn ${mode === 'oauth' ? 'active' : ''}`}
                    onClick={() => selectMode('oauth')}
                    disabled={!authMode.oauthEnabled}
                    title={!authMode.oauthEnabled ? t('auth.modeUnavailable', 'Not available on this server') : ''}
                  >
                    <ShieldCheckIcon size={16} />
                    {authMode.providerName}
                  </button>
                  <button
                    className={`mode-btn ${mode === 'account' ? 'active' : ''}`}
                    onClick={() => selectMode('account')}
                    disabled={!authMode.localEnabled}
                    title={!authMode.localEnabled ? t('auth.modeUnavailable', 'Not available on this server') : ''}
                  >
                    <KeyIcon size={16} />
                    {t('auth.accountLogin', 'Account')}
                  </button>
                </div>
              )}

              <div className={`login-auth-panel ${modeSwitching ? 'switching' : ''}`}>
                {mode === 'oauth' && authMode.oauthEnabled && (
                  <button className="login-button oauth" onClick={login} disabled={submitting}>
                    <VoltageLogo size={18} />
                    <span>{t('auth.continueWithProvider', `Continue with ${authMode.providerName}`, { provider: authMode.providerName })}</span>
                  </button>
                )}

                {mode === 'account' && authMode.localEnabled && (
                  <>
                    <div className="login-submode-toggle">
                      <button
                        className={`submode-btn ${accountAction === 'login' ? 'active' : ''}`}
                        onClick={() => setAccountAction('login')}
                      >
                        {t('auth.signIn', 'Sign in')}
                      </button>
                      <button
                        className={`submode-btn ${accountAction === 'register' ? 'active' : ''}`}
                        onClick={() => setAccountAction('register')}
                        disabled={!authMode.canRegister}
                        title={!authMode.canRegister ? t('auth.registrationDisabled', 'Account creation is disabled on this server.') : ''}
                      >
                        {t('auth.createAccount', 'Create account')}
                      </button>
                    </div>

                    {accountAction === 'login' ? (
                      <form className="login-form" onSubmit={handleLocalLogin}>
                        <input
                          className="login-input"
                          type="text"
                          autoComplete="username"
                          placeholder={t('auth.usernameOrEmail', 'Username or email')}
                          value={identifier}
                          onChange={(e) => setIdentifier(e.target.value)}
                        />
                        <input
                          className="login-input"
                          type="password"
                          autoComplete="current-password"
                          placeholder={t('auth.password', 'Password')}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                        {/* Honeypot field - hidden from users, traps bots */}
                        <input
                          type="text"
                          name="website"
                          autoComplete="off"
                          tabIndex="-1"
                          style={{ position: 'absolute', left: '-9999px', opacity: 0 }}
                          onFocus={() => setPassword('')} // Trap bot if it focuses this
                        />
                        <button className="login-button account" type="submit" disabled={submitting}>
                          {submitting ? <ArrowPathIcon size={18} className="spin" /> : <KeyIcon size={18} />}
                          <span>{submitting ? t('auth.signingIn', 'Signing in...') : t('auth.signIn', 'Sign in')}</span>
                        </button>
                        <button 
                          type="button"
                          className="forgot-password-link"
                          onClick={() => setShowForgotPassword(true)}
                        >
                          {t('auth.forgotPassword', 'Forgot password?')}
                        </button>
                      </form>
                    ) : (
                      <form className="login-form" onSubmit={handleLocalRegister}>
                        <input
                          className="login-input"
                          type="text"
                          autoComplete="username"
                          placeholder={t('auth.username', 'Username')}
                          value={registerUsername}
                          onChange={(e) => setRegisterUsername(e.target.value)}
                        />
                        <input
                          className="login-input"
                          type="email"
                          autoComplete="email"
                          placeholder={t('auth.email', 'Email')}
                          value={registerEmail}
                          onChange={(e) => setRegisterEmail(e.target.value)}
                        />
                        <input
                          className="login-input"
                          type="date"
                          autoComplete="bday"
                          max={new Date().toISOString().slice(0, 10)}
                          value={registerBirthDate}
                          onChange={(e) => setRegisterBirthDate(e.target.value)}
                        />
                        <input
                          className="login-input"
                          type="password"
                          autoComplete="new-password"
                          placeholder={t('auth.passwordMin', 'Password (min {{min}} chars)', { min: authMode.minPasswordLength })}
                          value={registerPassword}
                          onChange={(e) => setRegisterPassword(e.target.value)}
                        />
                        <input
                          className="login-input"
                          type="password"
                          autoComplete="new-password"
                          placeholder={t('auth.confirmPassword', 'Confirm password')}
                          value={registerPasswordConfirm}
                          onChange={(e) => setRegisterPasswordConfirm(e.target.value)}
                        />
                        {/* Honeypot field - hidden from users, traps bots */}
                        <input
                          type="text"
                          name="website"
                          autoComplete="off"
                          tabIndex="-1"
                          style={{ position: 'absolute', left: '-9999px', opacity: 0 }}
                          onFocus={() => { setRegisterUsername(''); setRegisterEmail(''); setRegisterBirthDate('') }} // Trap bot
                        />
                        <button className="login-button account" type="submit" disabled={submitting || !authMode.canRegister}>
                          {submitting ? <ArrowPathIcon size={18} className="spin" /> : <KeyIcon size={18} />}
                          <span>{submitting ? t('auth.creatingAccount', 'Creating account...') : t('auth.createAccount', 'Create account')}</span>
                        </button>
                      </form>
                    )}
                  </>
                )}
              </div>

              {!authMode.localEnabled && !authMode.oauthEnabled && (
                <p className="login-error">{t('auth.noMethodsAvailable', 'No sign-in method is configured for this server.')}</p>
              )}
            </>
          )}

          {!!error && <p className="login-error">{error}</p>}

          <p className="login-footer">
            {t('app.secureAuth', 'Secure authentication enabled')}
          </p>
        </div>
      </div>

      {showServerSelector && (
        <ServerSelector 
          onClose={() => setShowServerSelector(false)} 
        />
      )}

      {showForgotPassword && (
        <div className="modal-overlay" onClick={() => { setShowForgotPassword(false); setResetSent(false); setResetEmail(''); }}>
          <div className="modal-content forgot-password-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => { setShowForgotPassword(false); setResetSent(false); setResetEmail(''); }}>
              ×
            </button>
            
            {!resetSent ? (
              <>
                <h2>{t('auth.forgotPassword', 'Forgot Password')}</h2>
                <p className="forgot-desc">{t('auth.forgotDesc', 'Enter your email address and we\'ll send you a link to reset your password.')}</p>
                
                {resetError && <p className="login-error">{resetError}</p>}
                
                <form onSubmit={async (e) => {
                  e.preventDefault()
                  if (!resetEmail.trim()) {
                    setResetError(t('auth.emailRequired', 'Email is required'))
                    return
                  }
                  setResetLoading(true)
                  setResetError('')
                  try {
                    await authService.forgotPassword(resetEmail.trim())
                    setResetSent(true)
                  } catch (err) {
                    setResetError(err.response?.data?.error || 'Failed to send reset email')
                  } finally {
                    setResetLoading(false)
                  }
                }}>
                  <input
                    className="login-input"
                    type="email"
                    autoComplete="email"
                    placeholder={t('auth.yourEmail', 'Your email')}
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                  />
                  <button className="login-button account" type="submit" disabled={resetLoading}>
                    {resetLoading ? <ArrowPathIcon size={18} className="spin" /> : null}
                    <span>{resetLoading ? t('auth.sending', 'Sending...') : t('auth.sendResetLink', 'Send Reset Link')}</span>
                  </button>
                </form>
              </>
            ) : (
              <>
                <div className="reset-sent-icon">✓</div>
                <h2>{t('auth.checkYourEmail', 'Check your email')}</h2>
                <p className="forgot-desc">{t('auth.resetLinkSent', 'We\'ve sent a password reset link to')}</p>
                <p className="reset-email">{resetEmail}</p>
                <button className="login-button account" onClick={() => { setShowForgotPassword(false); setResetSent(false); setResetEmail(''); }}>
                  {t('common.back', 'Back to Login')}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default LoginPage
