import React from 'react'
import { useAvatar } from '../hooks/useAvatar'
import { getStoredServer } from '../services/serverConfig'

const Avatar = ({ src, alt, fallback, className = '', size = 40, onClick, style = {}, userId }) => {
  const currentServer = getStoredServer()
  const apiUrl = currentServer?.apiUrl || ''
  const imageApiUrl = currentServer?.imageApiUrl || apiUrl
  
  let fallbackUrls = []
  if (!src && userId) {
    const encodedId = encodeURIComponent(userId)
    const nativeUrl = apiUrl ? `${apiUrl}/api/images/users/${encodedId}/profile` : null
    const externalUrl = imageApiUrl ? `${imageApiUrl}/api/images/users/${encodedId}/profile` : null
    if (nativeUrl) fallbackUrls.push(nativeUrl)
    if (externalUrl && externalUrl !== nativeUrl) fallbackUrls.push(externalUrl)
  }
  
  const { avatarSrc, loading } = useAvatar(src, fallbackUrls)

  const avatarStyle = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: size * 0.4,
    fontWeight: 600,
    backgroundColor: 'var(--volt-primary)',
    color: 'white',
    overflow: 'hidden',
    cursor: onClick ? 'pointer' : 'default',
    ...style
  }

  if (avatarSrc && !loading) {
    return (
      <img 
        src={avatarSrc} 
        alt={alt || fallback || ''} 
        className={className}
        style={{ ...avatarStyle, objectFit: 'cover' }}
        onClick={onClick}
      />
    )
  }

  const fallbackChar = fallback?.[0]?.toUpperCase() || alt?.[0]?.toUpperCase() || 'U'

  return (
    <div className={className} style={avatarStyle} onClick={onClick}>
      {fallbackChar}
    </div>
  )
}

export default Avatar
