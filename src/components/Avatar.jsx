import React from 'react'
import { useAvatar } from '../hooks/useAvatar'

const Avatar = ({ src, alt, fallback, className = '', size = 40, onClick, style = {} }) => {
  const { avatarSrc, loading } = useAvatar(src)

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
