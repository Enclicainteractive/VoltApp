import React from 'react'
import { Home, MessageSquare, Compass, Users, Settings, Plus, Hash, Zap } from 'lucide-react'
import { useTranslation } from '../hooks/useTranslation'
import '../assets/styles/MobileNav.css'

const MobileNav = ({ 
  currentTab, 
  onTabChange, 
  onCreateServer, 
  onOpenSettings,
  friendRequestCount = 0,
  dmNotifications = 0,
  serverUnreadCounts = {},
  servers = [],
  onDMClick
}) => {
  const { t } = useTranslation()
  const totalNotifications = friendRequestCount + dmNotifications + 
    Object.values(serverUnreadCounts).reduce((a, b) => a + b, 0)

  const tabs = [
    { id: 'home', icon: Zap, label: t('mobileNav.home', 'Home'), path: '/chat' },
    { id: 'servers', icon: MessageSquare, label: t('mobileNav.servers', 'Servers'), path: '/chat' },
    { id: 'dms', icon: MessageSquare, label: t('mobileNav.messages', 'Messages'), path: '/chat/dms' },
    { id: 'friends', icon: Users, label: t('mobileNav.friends', 'Friends'), path: '/chat/friends' },
    { id: 'discovery', icon: Compass, label: t('mobileNav.discover', 'Discover'), path: '/chat/discovery' },
  ]

  return (
    <nav className="mobile-nav">
      <div className="mobile-nav-tabs">
        {tabs.map(tab => {
          const Icon = tab.icon
          const isActive = currentTab === tab.id
          let badge = 0
          
          if (tab.id === 'friends') badge = friendRequestCount
          else if (tab.id === 'dms') badge = dmNotifications
          else if (tab.id === 'servers') badge = totalNotifications

          return (
            <button
              key={tab.id}
              className={`mobile-nav-tab ${isActive ? 'active' : ''}`}
              onClick={() => onTabChange(tab.id)}
            >
              <div className="mobile-nav-icon-wrapper">
                <Icon size={22} />
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
        <button className="mobile-nav-action" onClick={onCreateServer} title={t('app.createServer', 'Create Server')}>
          <Plus size={20} />
        </button>
        <button className="mobile-nav-action" onClick={onOpenSettings} title={t('nav.settings', 'Settings')}>
          <Settings size={20} />
        </button>
      </div>
    </nav>
  )
}

export default MobileNav
