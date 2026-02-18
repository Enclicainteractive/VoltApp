import { getStoredServer } from './serverConfig'

function getServerConfig() {
  const server = getStoredServer()
  if (server) {
    return {
      clientId: server.clientId,
      redirectUri: server.socketUrl ? `${server.socketUrl}/callback` : null,
      authUrl: server.authUrl,
      tokenUrl: server.tokenUrl || (server.apiUrl ? `${server.apiUrl}/api/oauth/token` : '/api/auth/proxy/token'),
      revokeUrl: server.revokeUrl || (server.apiUrl ? `${server.apiUrl}/api/oauth/revoke` : '/api/auth/proxy/revoke'),
      localAuthUrl: server.apiUrl ? `${server.apiUrl}/api/auth` : '/api/auth',
      apiUrl: server.apiUrl,
      socketUrl: server.socketUrl,
      host: server.host,
      isOAuth: !!server.clientId && !!server.authUrl,
      isLocal: !server.clientId
    }
  }
  
  return {
    clientId: 'app_54f92e4d526840789998b4cca492aea1',
    redirectUri: 'https://volt.voltagechat.app/callback',
    authUrl: 'https://enclicainteractive.com/oauth/authorize',
    tokenUrl: 'https://api.enclicainteractive.com/api/oauth/token',
    revokeUrl: 'https://api.enclicainteractive.com/api/oauth/revoke',
    localAuthUrl: 'https://volt.voltagechat.app/api/auth',
    apiUrl: 'https://volt.voltagechat.app',
    socketUrl: 'https://volt.voltagechat.app',
    host: 'enclicainteractive.com',
    isOAuth: true,
    isLocal: false
  }
}

async function generateCodeVerifier() {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return base64UrlEncode(array)
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(new Uint8Array(digest))
}

function base64UrlEncode(arrayBuffer) {
  return btoa(String.fromCharCode(...arrayBuffer))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export const authService = {
  async startOAuthFlow() {
    const config = getServerConfig()
    
    if (!config.isOAuth) {
      throw new Error('OAuth is not configured for this server. Use local login.')
    }
    
    const verifier = await generateCodeVerifier()
    const challenge = await generateCodeChallenge(verifier)
    sessionStorage.setItem('pkce_verifier', verifier)
    sessionStorage.setItem('oauth_server', JSON.stringify(config))

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: 'profile email',
      state: crypto.randomUUID(),
      code_challenge: challenge,
      code_challenge_method: 'S256'
    })

    window.location.href = `${config.authUrl}?${params.toString()}`
  },

  async register(email, password, username) {
    const config = getServerConfig()
    
    const response = await fetch(`${config.localAuthUrl}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        password,
        username
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Registration failed')
    }

    const data = await response.json()
    data._serverConfig = config
    return data
  },

  async login(usernameOrEmail, password) {
    const config = getServerConfig()
    
    const response = await fetch(`${config.localAuthUrl}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: usernameOrEmail,
        password
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Login failed')
    }

    const data = await response.json()
    data._serverConfig = config
    return data
  },

  async forgotPassword(email) {
    const config = getServerConfig()
    
    const response = await fetch(`${config.localAuthUrl}/forgot-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email })
    })

    return response.ok
  },

  async resetPassword(token, password) {
    const config = getServerConfig()
    
    const response = await fetch(`${config.localAuthUrl}/reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token, password })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Password reset failed')
    }

    return true
  },

  async getAuthConfig() {
    const config = getServerConfig()
    
    const response = await fetch(`${config.localAuthUrl}/config`)
    return response.json()
  },

  async exchangeCodeForToken(code, codeVerifier) {
    const config = getServerConfig()
    console.log('Exchanging code for token via backend proxy')
    
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: config.redirectUri,
        client_id: config.clientId,
        code_verifier: codeVerifier
      })
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Token exchange failed:', error)
      throw new Error(error.message || 'Token exchange failed')
    }

    const data = await response.json()
    console.log('Token exchange successful, user:', data.user?.username)
    data._serverConfig = config
    return data
  },

  async getUserInfo(tokenData) {
    if (tokenData.user) {
      return {
        id: tokenData.user.id,
        username: tokenData.user.username,
        displayName: tokenData.user.displayName || tokenData.user.username,
        email: tokenData.user.email,
        avatar: tokenData.user.avatar,
        host: tokenData.user.host
      }
    }

    const config = getServerConfig()
    const response = await fetch(`${config.apiUrl}/api/user/me`, {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`
      }
    })

    if (!response.ok) {
      throw new Error('Failed to fetch user info')
    }

    return response.json()
  },

  async revokeToken(token) {
    const config = getServerConfig()
    try {
      await fetch(config.revokeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token: token,
          token_type_hint: 'access_token'
        })
      })
    } catch (error) {
      console.error('Token revoke error:', error)
    }
  },

  getServerConfig
}
