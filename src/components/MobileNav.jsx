import React from 'react'
import { Users, Settings, Plus, Hash, CloudLightning, Compass, ArrowUpRight, PhoneCall } from 'lucide-react'
import { ChatBubbleLeftEllipsisIcon } from '@heroicons/react/24/outline'
import { useTranslation } from '../hooks/useTranslation'
import lazyLoadingService from '../services/lazyLoadingService'
import '../assets/styles/MobileNav.css'

const MobileNav = ({ 
  currentTab, 
  onTabChange, 
  onCreateServer, 
  onJoinServer,
  onOpenSettings,
  friendRequestCount = 0,
  dmNotifications = 0,
  serverUnreadCounts = {},
  hasActiveVoice = false,
  onReturnToVoice
}) => {
  const { t } = useTranslation()
  const totalNotifications = friendRequestCount + dmNotifications +
    Object.values(serverUnreadCounts).reduce((a, b) => a + b, 0)

  const tabs = [
    { id: 'home', icon: CloudLightning, label: t('mobileNav.home', 'Home'), path: '/chat' },
    { id: 'servers', icon: Hash, label: t('mobileNav.servers', 'Servers'), path: '/chat' },
    { id: 'dms', icon: ChatBubbleLeftEllipsisIcon, label: t('mobileNav.messages', 'Messages'), path: '/chat/dms' },
    { id: 'friends', icon: Users, label: t('mobileNav.friends', 'Friends'), path: '/chat/friends' },
    { id: 'discovery', icon: Compass, label: t('mobileNav.discover', 'Discover'), path: '/chat/discovery' },
  ]

  const getTabBadgeCount = (tabId) => {
    if (tabId === 'friends') return friendRequestCount
    if (tabId === 'dms') return dmNotifications
    if (tabId === 'servers') return totalNotifications
    return 0
  }

  const handleTabChange = (tabId) => {
    if (typeof onTabChange === 'function') {
      onTabChange(tabId)
    }
  }

  const prefetchTab = (tabId) => {
    lazyLoadingService.preloadRouteChunks(['route:chat'], { idle: true })
    if (tabId === 'friends') {
      lazyLoadingService.preloadComponents(['FriendsPage'], { idle: true })
      return
    }
    if (tabId === 'discovery') {
      lazyLoadingService.preloadComponents(['Discovery'], { idle: true })
      return
    }
    if (tabId === 'dms') {
      lazyLoadingService.preloadComponents(['DMList', 'DMChat'], { idle: true })
      return
    }
    lazyLoadingService.preloadComponents(['ChatArea', 'MessageList', 'ChannelSidebar'], { idle: true })
  }

  const returnToVoiceLabel = t('voicePreview.returnToVoice', 'Return to voice')

  return (
    <nav className="mobile-nav" aria-label={t('mobileNav.primaryNavigation', 'Primary navigation')}>
      {hasActiveVoice && (
        <button
          type="button"
          className="mobile-nav-voice-pill"
          onClick={onReturnToVoice}
          title={returnToVoiceLabel}
          aria-label={returnToVoiceLabel}
        >
          <PhoneCall size={16} />
          <span>{returnToVoiceLabel}</span>
        </button>
      )}
      <div className="mobile-nav-tabs">
        {tabs.map(tab => {
          const Icon = tab.icon
          const isActive = currentTab === tab.id
          const badge = getTabBadgeCount(tab.id)

          return (
            <button
              type="button"
              key={tab.id}
              className={`mobile-nav-tab ${isActive ? 'active' : ''}`}
              onClick={() => handleTabChange(tab.id)}
              onMouseEnter={() => prefetchTab(tab.id)}
              onFocus={() => prefetchTab(tab.id)}
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
              data-active={isActive ? 'true' : 'false'}
              data-has-badge={badge > 0 ? 'true' : 'false'}
              title={tab.label}
            >
              <div className="mobile-nav-icon-wrapper">
                <Icon width={20} height={20} className="mobile-nav-icon" />
                {badge > 0 && (
                  <span className="mobile-nav-badge">{badge > 99 ? '99+' : badge}</span>
                )}
              </div>
              <span className="mobile-nav-label">{tab.label}</span>
            </button>
          )
        })}
      </div>
      <div className="mobile-nav-actions">
        <button
          type="button"
          className="mobile-nav-action"
          onClick={onJoinServer}
          onMouseEnter={() => lazyLoadingService.preloadRouteChunks(['route:invite'], { idle: true })}
          onFocus={() => lazyLoadingService.preloadRouteChunks(['route:invite'], { idle: true })}
          title={t('app.joinServer', 'Join Server')}
          aria-label={t('app.joinServer', 'Join Server')}
        >
          <ArrowUpRight size={18} />
        </button>
        <button
          type="button"
          className="mobile-nav-action"
          onClick={onCreateServer}
          onMouseEnter={() => lazyLoadingService.preloadRouteChunks(['route:invite'], { idle: true })}
          onFocus={() => lazyLoadingService.preloadRouteChunks(['route:invite'], { idle: true })}
          title={t('app.createServer', 'Create Server')}
          aria-label={t('app.createServer', 'Create Server')}
        >
          <Plus size={20} />
        </button>
        <button
          type="button"
          className="mobile-nav-action"
          onClick={onOpenSettings}
          onMouseEnter={() => {
            lazyLoadingService.preloadRouteChunks(['route:settings-modal'], { idle: true })
            lazyLoadingService.preloadComponents(['SettingsModal'], { idle: true })
          }}
          onFocus={() => {
            lazyLoadingService.preloadRouteChunks(['route:settings-modal'], { idle: true })
            lazyLoadingService.preloadComponents(['SettingsModal'], { idle: true })
          }}
          title={t('nav.settings', 'Settings')}
          aria-label={t('nav.settings', 'Settings')}
        >
          <Settings size={20} />
        </button>
      </div>
    </nav>
  )
}

export default MobileNav
