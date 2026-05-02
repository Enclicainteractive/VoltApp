import React, { useEffect, useMemo, useState } from 'react'
import { useAvatar } from '../hooks/useAvatar'
import { getStoredServer } from '../services/serverConfig'

const normalizeStatus = (status) => {
  switch ((status || '').toLowerCase()) {
    case 'online':
      return 'online'
    case 'away':
    case 'idle':
      return 'idle'
    case 'dnd':
    case 'do-not-disturb':
    case 'busy':
      return 'dnd'
    case 'invisible':
    case 'offline':
    default:
      return 'offline'
  }
}

const Avatar = React.memo(({ src, alt, fallback, className = '', size = 40, onClick, style = {}, userId, showStatus = false, status = 'offline', loading: externalLoading = false }) => {
  const currentServer = getStoredServer()
  const apiUrl = currentServer?.apiUrl || ''
  const imageApiUrl = currentServer?.imageApiUrl || apiUrl
  const [imageLoadFailed, setImageLoadFailed] = useState(false)
  
  const fallbackUrls = useMemo(() => {
    if (!src && userId) {
      const encodedId = encodeURIComponent(userId)
      const urls = []
      const nativeUrl = apiUrl ? `${apiUrl}/api/images/users/${encodedId}/profile` : null
      const externalUrl = imageApiUrl ? `${imageApiUrl}/api/images/users/${encodedId}/profile` : null
      if (nativeUrl) urls.push(nativeUrl)
      if (externalUrl && externalUrl !== nativeUrl) urls.push(externalUrl)
      return urls
    }
    return []
  }, [src, userId, apiUrl, imageApiUrl])
  
  const { avatarSrc, loading } = useAvatar(src, fallbackUrls)

  useEffect(() => {
    setImageLoadFailed(false)
  }, [avatarSrc])

  const avatarStyle = useMemo(() => ({
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
    position: 'relative',
    ...style
  }), [size, onClick, style])
  
  const normalizedStatus = useMemo(() => normalizeStatus(status), [status])
  const statusColor = useMemo(() => {
    if (normalizedStatus === 'online') return 'var(--volt-success, #3ba55d)'
    if (normalizedStatus === 'idle') return 'var(--volt-warning, #f0b232)'
    if (normalizedStatus === 'dnd') return 'var(--volt-danger, #ed4245)'
    return 'var(--volt-text-muted, #747f8d)'
  }, [normalizedStatus])

  const statusStyle = useMemo(() => ({
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: Math.max(8, Math.round(size * 0.3)),
    height: Math.max(8, Math.round(size * 0.3)),
    borderRadius: '50%',
    border: '2px solid var(--volt-bg-secondary, var(--volt-background))',
    backgroundColor: statusColor,
    boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.2)'
  }), [size, statusColor])
  
  const fallbackChar = useMemo(() => 
    fallback?.[0]?.toUpperCase() || alt?.[0]?.toUpperCase() || 'U',
    [fallback, alt]
  )

  const statusLabel = useMemo(() => {
    if (normalizedStatus === 'idle') return 'idle'
    if (normalizedStatus === 'dnd') return 'do not disturb'
    return normalizedStatus
  }, [normalizedStatus])

  const label = useMemo(() => alt || fallback || 'User avatar', [alt, fallback])
  const isLoading = loading || externalLoading
  const isClickable = typeof onClick === 'function'
  const showImage = Boolean(avatarSrc) && !isLoading && !imageLoadFailed

  const containerClassName = useMemo(() => {
    const baseClass = `avatar-container${showImage ? '' : ' avatar-fallback'}`
    return className ? `${baseClass} ${className}` : baseClass
  }, [className, showImage])

  const containerStyle = useMemo(() => {
    if (!isClickable) return avatarStyle

    return {
      ...avatarStyle,
      padding: 0,
      border: 'none',
      appearance: 'none'
    }
  }, [avatarStyle, isClickable])

  const statusBadge = showStatus ? (
    <div
      className="avatar-status"
      style={statusStyle}
      title={statusLabel}
      aria-label={`Status: ${statusLabel}`}
    />
  ) : null

  const content = showImage ? (
    <img
      src={avatarSrc}
      alt={label}
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        borderRadius: '50%'
      }}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setImageLoadFailed(true)}
    />
  ) : (
    isLoading ? (
      <div className="avatar-loading-spinner" style={{ fontSize: size * 0.3 }} aria-label="Loading avatar">
        ⟳
      </div>
    ) : (
      <>{fallbackChar}</>
    )
  )

  if (isClickable) {
    return (
      <button
        type="button"
        className={containerClassName}
        style={containerStyle}
        onClick={onClick}
        aria-label={showStatus ? `${label}, status ${statusLabel}` : label}
      >
        {content}
        {statusBadge}
      </button>
    )
  }

  return (
    <div className={containerClassName} style={containerStyle} aria-label={showStatus ? `${label}, status ${statusLabel}` : label}>
      {content}
      {statusBadge}
    </div>
  )
})

Avatar.displayName = 'Avatar'

export default Avatar
