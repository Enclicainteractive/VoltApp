import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getStoredServer } from '../services/serverConfig'
import { authService } from '../services/authService'
import { useTranslation } from '../hooks/useTranslation'
import ServerSelector from '../components/ServerSelector'
import { Zap, Server, ChevronDown, Loader2, KeyRound, ShieldCheck } from 'lucide-react'
import '../assets/styles/LoginPage.css'

const LoginPage = () => {
  const { t } = useTranslation()
  const { login } = useAuth()
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
  const [registerPassword, setRegisterPassword] = useState('')
  const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [modeSwitching, setModeSwitching] = useState(false)

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

  const selectMode = (nextMode) => {
    const allowed = nextMode === 'oauth' ? authMode.oauthEnabled : authMode.localEnabled
    if (!allowed || nextMode === mode) return
    setModeSwitching(true)
    setMode(nextMode)
    window.setTimeout(() => setModeSwitching(false), 180)
  }

  const persistSessionAndRedirect = async (tokenData) => {
    localStorage.setItem('access_token', tokenData.access_token)
    if (tokenData.refresh_token) {
      localStorage.setItem('refresh_token', tokenData.refresh_token)
    }
    const userData = await authService.getUserInfo(tokenData)
    localStorage.setItem('user_data', JSON.stringify(userData))
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
    if (!registerUsername.trim() || !registerEmail.trim() || !registerPassword) {
      setError(t('auth.registerMissingFields', 'Enter username, email, and password.'))
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
      const tokenData = await authService.register(registerEmail.trim(), registerPassword, registerUsername.trim())
      await persistSessionAndRedirect(tokenData)
    } catch (err) {
      setError(err?.message || t('auth.registrationFailed', 'Failed to create account'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <div className="server-selector-button-container">
        <button 
          className="server-selector-button"
          onClick={() => setShowServerSelector(true)}
        >
          <Server size={16} />
          <span>{server?.name || 'Select Server'}</span>
          <ChevronDown size={14} />
        </button>
      </div>

      <div className="login-container">
        <div className="login-content">
          <div className="login-branding">
            <div className="logo">
              <Zap size={48} strokeWidth={2.5} />
            </div>
            <h1 className="brand-name">{t('app.name', 'Volt')}</h1>
            <p className="brand-tagline">{t('app.tagline', 'Real-time chat, voice and video')}</p>
          </div>

          {authConfigLoading ? (
            <div className="login-loading">
              <Loader2 size={18} className="spin" />
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
                    <ShieldCheck size={16} />
                    {authMode.providerName}
                  </button>
                  <button
                    className={`mode-btn ${mode === 'account' ? 'active' : ''}`}
                    onClick={() => selectMode('account')}
                    disabled={!authMode.localEnabled}
                    title={!authMode.localEnabled ? t('auth.modeUnavailable', 'Not available on this server') : ''}
                  >
                    <KeyRound size={16} />
                    {t('auth.accountLogin', 'Account')}
                  </button>
                </div>
              )}

              <div className={`login-auth-panel ${modeSwitching ? 'switching' : ''}`}>
                {mode === 'oauth' && authMode.oauthEnabled && (
                  <button className="login-button oauth" onClick={login} disabled={submitting}>
                    <Zap size={18} />
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
                        <button className="login-button account" type="submit" disabled={submitting}>
                          {submitting ? <Loader2 size={18} className="spin" /> : <KeyRound size={18} />}
                          <span>{submitting ? t('auth.signingIn', 'Signing in...') : t('auth.signIn', 'Sign in')}</span>
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
                        <button className="login-button account" type="submit" disabled={submitting || !authMode.canRegister}>
                          {submitting ? <Loader2 size={18} className="spin" /> : <KeyRound size={18} />}
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
    </div>
  )
}

export default LoginPage
