import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Loader2 } from 'lucide-react'

const CallbackPage = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { handleCallback } = useAuth()
  const [error, setError] = useState(null)

  useEffect(() => {
    const processCallback = async () => {
      const code = searchParams.get('code')
      const verifier = sessionStorage.getItem('pkce_verifier')

      if (!code) {
        setError('No authorization code received')
        return
      }

      if (!verifier) {
        setError('No PKCE verifier found')
        return
      }

      try {
        await handleCallback(code, verifier)
        navigate('/chat')
      } catch (err) {
        setError(err.message || 'Authentication failed')
      }
    }

    processCallback()
  }, [])

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
          <div style={{ color: '#ed4245', fontSize: '18px' }}>
            {error}
          </div>
          <button 
            className="btn btn-primary"
            onClick={() => navigate('/login')}
          >
            Back to Login
          </button>
        </>
      ) : (
        <>
          <Loader2 size={48} className="pulse" />
          <div>Completing authentication...</div>
        </>
      )}
    </div>
  )
}

export default CallbackPage
