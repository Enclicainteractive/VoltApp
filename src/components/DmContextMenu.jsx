import React from 'react'
import { 
  Bell, BellOff, Lock, Unlock, Key, Shield, ShieldOff, 
  MessageSquare, MessageSquareOff, Settings, Trash2 
} from 'lucide-react'

const DmContextMenu = ({ 
  position, 
  onClose, 
  conversation, 
  onMute, 
  onUnmute,
  onEnableE2ee,
  onDisableE2ee,
  onEnterKey,
  e2eeStatus,
  isMuted 
}) => {
  if (!position) return null

  const handleClick = (action) => {
    action()
    onClose()
  }

  return (
    <div 
      className="context-menu dm-context-menu"
      style={{ left: position.x, top: position.y }}
    >
      <div className="context-menu-section">
        <button onClick={() => handleClick(isMuted ? onUnmute : onMute)}>
          {isMuted ? <Bell size={16} /> : <BellOff size={16} />}
          {isMuted ? 'Unmute Notifications' : 'Mute Notifications'}
        </button>
      </div>

      <div className="context-menu-divider" />

      {e2eeStatus?.enabled ? (
        <>
          <div className="context-menu-section">
            <div className="context-menu-header">
              <Lock size={14} />
              <span>Encryption</span>
              <span className="e2ee-badge enabled">Enabled</span>
            </div>
            <button onClick={() => handleClick(onDisableE2ee)}>
              <ShieldOff size={16} />
              Disable Encryption
            </button>
            <button onClick={() => handleClick(onEnterKey)}>
              <Key size={16} />
              Enter/Update Key
            </button>
          </div>
        </>
      ) : (
        <div className="context-menu-section">
          <div className="context-menu-header">
            <Lock size={14} />
            <span>Encryption</span>
            <span className="e2ee-badge disabled">Disabled</span>
          </div>
          <button onClick={() => handleClick(onEnableE2ee)}>
            <Shield size={16} />
            Enable E2EE
          </button>
        </div>
      )}

      <div className="context-menu-divider" />

      <div className="context-menu-section">
        <button onClick={() => handleClick(onClose)}>
          <Settings size={16} />
          Conversation Settings
        </button>
      </div>

      <style>{`
        .dm-context-menu {
          min-width: 220px;
        }

        .context-menu-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          font-size: 12px;
          color: var(--text-muted, #949ba4);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .e2ee-badge {
          margin-left: auto;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
        }

        .e2ee-badge.enabled {
          background: rgba(16, 185, 129, 0.15);
          color: var(--volt-success);
        }

        .e2ee-badge.disabled {
          background: var(--bg-tertiary, #2b2d31);
          color: var(--text-muted, #949ba4);
        }
      `}</style>
    </div>
  )
}

export default DmContextMenu
