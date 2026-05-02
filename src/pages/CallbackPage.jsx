import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTranslation } from '../hooks/useTranslation'
import lazyLoadingService from '../services/lazyLoadingService'
import { ArrowPathIcon } from '@heroicons/react/24/outline'

const CallbackPage = () => {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { handleCallback } = useAuth()
  const [error, setError] = useState(null)
  const [retryTick, setRetryTick] = useState(0)
  const [stepText, setStepText] = useState('')
  const hasProcessedRef = useRef(false)

  useEffect(() => {
    lazyLoadingService.preloadRouteChunks(['route:chat', 'route:login'], { idle: true })
  }, [])

  useEffect(() => {
    const processCallback = async () => {
      if (hasProcessedRef.current) return
      hasProcessedRef.current = true
      setStepText(t('callback.validatingResponse', 'Validating login response...'))
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
        setStepText(t('callback.exchangingToken', 'Exchanging secure token...'))
        await handleCallback(code, verifier)
        sessionStorage.removeItem('pkce_verifier')
        setStepText(t('callback.redirecting', 'Redirecting to VoltChat...'))
        lazyLoadingService.preloadRouteChunks(['route:chat'], { idle: false })
        lazyLoadingService.preloadComponents(['ChatArea', 'ServerSidebar', 'ChannelSidebar', 'MessageList'], { idle: false })
        navigate('/chat')
      } catch (err) {
        setError(err.message || t('callback.authFailed', 'Authentication failed'))
      }
    }

    processCallback()
  }, [handleCallback, navigate, retryTick, searchParams, t])

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
            type="button"
            onClick={() => navigate('/login')}
          >
            {t('callback.backToLogin', 'Back to Login')}
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => {
              hasProcessedRef.current = false
              setError(null)
              setRetryTick((prev) => prev + 1)
            }}
          >
            {t('common.retry', 'Retry')}
          </button>
        </>
      ) : (
        <>
          <ArrowPathIcon size={48} className="pulse" />
          <div aria-live="polite">
            {stepText || t('callback.completingAuth', 'Completing authentication...')}
          </div>
        </>
      )}
    </div>
  )
}

export default CallbackPage
