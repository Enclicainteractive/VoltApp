import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTranslation } from '../hooks/useTranslation'
import { ArrowPathIcon } from '@heroicons/react/24/outline'

const CallbackPage = () => {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { handleCallback } = useAuth()
  const [error, setError] = useState(null)
  const hasProcessedRef = useRef(false)

  useEffect(() => {
    const processCallback = async () => {
      if (hasProcessedRef.current) return
      hasProcessedRef.current = true
      const code = searchParams.get('code')
      const verifier = sessionStorage.getItem('pkce_verifier')

      if (!code) {
        setError(t('callback.noAuthCode', 'No authorization code received'))
        return
      }

      if (!verifier) {
        setError(t('callback.noPkceVerifier', 'No PKCE verifier found'))
        return
      }

      try {
        await handleCallback(code, verifier)
        sessionStorage.removeItem('pkce_verifier')
        navigate('/chat')
      } catch (err) {
        setError(err.message || t('callback.authFailed', 'Authentication failed'))
      }
    }

    processCallback()
  }, [handleCallback, navigate, searchParams, t])

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      gap: '16px',
      color: '#b5bac1'
    }}>
      {error ? (
        <>
          <div style={{ color: 'var(--volt-danger)', fontSize: '18px' }}>
            {error}
          </div>
          <button 
            className="btn btn-primary"
            onClick={() => navigate('/login')}
          >
            {t('callback.backToLogin', 'Back to Login')}
          </button>
        </>
      ) : (
        <>
          <ArrowPathIcon size={48} className="pulse" />
          <div>{t('callback.completingAuth', 'Completing authentication...')}</div>
        </>
      )}
    </div>
  )
}

export default CallbackPage
