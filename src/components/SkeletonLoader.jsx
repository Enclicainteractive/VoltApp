import React from 'react'
import './SkeletonLoader.css'

// Base skeleton component
const SkeletonLoader = ({ 
  width = '100%', 
  height = '1rem', 
  borderRadius = '4px',
  variant = 'pulse',
  className = '',
  style = {},
  ...props 
}) => {
  const skeletonClasses = [
    'skeleton-loader',
    `skeleton-loader--${variant}`,
    className
  ].filter(Boolean).join(' ')

  const skeletonStyle = {
    width,
    height,
    borderRadius,
    ...style
  }

  return (
    <div 
      className={skeletonClasses} 
      style={skeletonStyle}
      aria-label="Loading..."
      role="presentation"
      {...props}
    />
  )
}

// Message skeleton
export const MessageSkeleton = ({ showAvatar = true, compact = false }) => (
  <div className={`message-skeleton ${compact ? 'message-skeleton--compact' : ''}`}>
    {showAvatar && (
      <div className="message-skeleton__avatar">
        <SkeletonLoader width="40px" height="40px" borderRadius="50%" />
      </div>
    )}
    <div className="message-skeleton__content">
      <div className="message-skeleton__header">
        <SkeletonLoader width="120px" height="16px" />
        <SkeletonLoader width="60px" height="12px" />
      </div>
      <div className="message-skeleton__body">
        <SkeletonLoader width="85%" height="14px" />
        <SkeletonLoader width="70%" height="14px" />
        {!compact && <SkeletonLoader width="40%" height="14px" />}
      </div>
    </div>
  </div>
)

// Server list skeleton
export const ServerSkeleton = () => (
  <div className="server-skeleton">
    {Array.from({ length: 5 }, (_, i) => (
      <div key={i} className="server-skeleton__item">
        <SkeletonLoader width="48px" height="48px" borderRadius="50%" />
      </div>
    ))}
  </div>
)

// Channel list skeleton
export const ChannelSkeleton = () => (
  <div className="channel-skeleton">
    <div className="channel-skeleton__header">
      <SkeletonLoader width="150px" height="20px" />
    </div>
    {Array.from({ length: 8 }, (_, i) => (
      <div key={i} className="channel-skeleton__item">
        <SkeletonLoader width="16px" height="16px" borderRadius="2px" />
        <SkeletonLoader width="120px" height="16px" />
      </div>
    ))}
  </div>
)

// Member list skeleton
export const MemberSkeleton = () => (
  <div className="member-skeleton">
    <div className="member-skeleton__header">
      <SkeletonLoader width="100px" height="14px" />
    </div>
    {Array.from({ length: 12 }, (_, i) => (
      <div key={i} className="member-skeleton__item">
        <SkeletonLoader width="24px" height="24px" borderRadius="50%" />
        <SkeletonLoader width="90px" height="14px" />
      </div>
    ))}
  </div>
)

// Profile skeleton
export const ProfileSkeleton = () => (
  <div className="profile-skeleton">
    <div className="profile-skeleton__avatar">
      <SkeletonLoader width="80px" height="80px" borderRadius="50%" />
    </div>
    <div className="profile-skeleton__info">
      <SkeletonLoader width="150px" height="20px" />
      <SkeletonLoader width="200px" height="14px" />
      <SkeletonLoader width="180px" height="14px" />
    </div>
  </div>
)

// Settings skeleton
export const SettingsSkeleton = () => (
  <div className="settings-skeleton">
    {Array.from({ length: 6 }, (_, i) => (
      <div key={i} className="settings-skeleton__section">
        <SkeletonLoader width="200px" height="18px" />
        <div className="settings-skeleton__controls">
          <SkeletonLoader width="100%" height="40px" borderRadius="8px" />
          <SkeletonLoader width="60%" height="14px" />
        </div>
      </div>
    ))}
  </div>
)

// Activity skeleton
export const ActivitySkeleton = () => (
  <div className="activity-skeleton">
    <div className="activity-skeleton__header">
      <SkeletonLoader width="120px" height="18px" />
    </div>
    <div className="activity-skeleton__content">
      <SkeletonLoader width="100%" height="200px" borderRadius="8px" />
      <div className="activity-skeleton__controls">
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonLoader key={i} width="80px" height="32px" borderRadius="6px" />
        ))}
      </div>
    </div>
  </div>
)

// File attachment skeleton
export const AttachmentSkeleton = ({ type = 'image' }) => (
  <div className="attachment-skeleton">
    {type === 'image' && (
      <SkeletonLoader width="250px" height="200px" borderRadius="8px" />
    )}
    {type === 'audio' && (
      <div className="attachment-skeleton__audio">
        <SkeletonLoader width="40px" height="40px" borderRadius="50%" />
        <div className="attachment-skeleton__audio-info">
          <SkeletonLoader width="150px" height="16px" />
          <SkeletonLoader width="100px" height="12px" />
        </div>
      </div>
    )}
    {type === 'file' && (
      <div className="attachment-skeleton__file">
        <SkeletonLoader width="32px" height="32px" borderRadius="4px" />
        <div className="attachment-skeleton__file-info">
          <SkeletonLoader width="120px" height="14px" />
          <SkeletonLoader width="60px" height="12px" />
        </div>
      </div>
    )}
  </div>
)

// Search results skeleton
export const SearchSkeleton = () => (
  <div className="search-skeleton">
    <div className="search-skeleton__filters">
      {Array.from({ length: 3 }, (_, i) => (
        <SkeletonLoader key={i} width="80px" height="28px" borderRadius="14px" />
      ))}
    </div>
    {Array.from({ length: 5 }, (_, i) => (
      <div key={i} className="search-skeleton__result">
        <SkeletonLoader width="32px" height="32px" borderRadius="50%" />
        <div className="search-skeleton__result-content">
          <SkeletonLoader width="180px" height="16px" />
          <SkeletonLoader width="250px" height="14px" />
          <SkeletonLoader width="200px" height="14px" />
        </div>
      </div>
    ))}
  </div>
)

// Voice channel skeleton
export const VoiceChannelSkeleton = () => (
  <div className="voice-channel-skeleton">
    <div className="voice-channel-skeleton__header">
      <SkeletonLoader width="140px" height="18px" />
    </div>
    {Array.from({ length: 4 }, (_, i) => (
      <div key={i} className="voice-channel-skeleton__participant">
        <SkeletonLoader width="32px" height="32px" borderRadius="50%" />
        <SkeletonLoader width="90px" height="14px" />
        <SkeletonLoader width="16px" height="16px" borderRadius="50%" variant="wave" />
      </div>
    ))}
  </div>
)

// Page skeleton wrapper
export const PageSkeleton = ({ children, loading = true }) => {
  if (!loading) return children

  return (
    <div className="page-skeleton">
      <div className="page-skeleton__header">
        <SkeletonLoader width="200px" height="24px" />
        <SkeletonLoader width="100px" height="16px" />
      </div>
      <div className="page-skeleton__content">
        {children}
      </div>
    </div>
  )
}

// List skeleton for generic lists
export const ListSkeleton = ({ 
  itemCount = 10, 
  itemHeight = '48px', 
  showAvatar = true, 
  showSecondary = true 
}) => (
  <div className="list-skeleton">
    {Array.from({ length: itemCount }, (_, i) => (
      <div key={i} className="list-skeleton__item" style={{ height: itemHeight }}>
        {showAvatar && (
          <SkeletonLoader width="40px" height="40px" borderRadius="50%" />
        )}
        <div className="list-skeleton__content">
          <SkeletonLoader width="60%" height="16px" />
          {showSecondary && (
            <SkeletonLoader width="40%" height="14px" />
          )}
        </div>
      </div>
    ))}
  </div>
)

export default SkeletonLoader