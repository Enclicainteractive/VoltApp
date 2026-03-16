import React, { useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowPathIcon } from '@heroicons/react/24/outline'

const PROVIDER_AUTHORIZE_URL = 'https://enclicainteractive.com/oauth/authorize'

const OAuthAuthorizePage = () => {
  const [searchParams] = useSearchParams()
  const queryString = useMemo(() => searchParams.toString(), [searchParams])
  const hasCoreParams = !!(searchParams.get('client_id') && searchParams.get('redirect_uri') && searchParams.get('response_type'))
  const forwardUrl = queryString ? `${PROVIDER_AUTHORIZE_URL}?${queryString}` : PROVIDER_AUTHORIZE_URL

  useEffect(() => {
    if (!hasCoreParams) return
    const timer = setTimeout(() => {
      window.location.replace(forwardUrl)
    }, 220)
    return () => clearTimeout(timer)
  }, [forwardUrl, hasCoreParams])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '24px',
        gap: '14px',
        textAlign: 'center',
        color: '#c7d7f5',
        background: 'radial-gradient(1200px 700px at 10% 10%, #1b2a47 0%, #0b1220 50%, #050914 100%)'
      }}
    >
      <ArrowPathIcon size={44} className="pulse" />
      <h1 style={{ margin: 0, fontSize: '20px', color: '#e8f0ff' }}>Preparing OAuth Sign-in</h1>
      <p style={{ margin: 0, maxWidth: '560px', color: '#9fb5da' }}>
        Volt is preparing your secure authorization request and forwarding you to the sign-in provider.
      </p>
      {!hasCoreParams && (
        <p style={{ margin: 0, color: '#f57c71' }}>
          Missing OAuth parameters. Please return to login and try again.
        </p>
      )}
      {hasCoreParams && (
        <a href={forwardUrl} className="btn btn-primary">
          Continue
        </a>
      )}
    </div>
  )
}

export default OAuthAuthorizePage
