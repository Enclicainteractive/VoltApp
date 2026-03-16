import React, { useEffect, useRef, useState, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { 
  Reply, Copy, Trash2, Edit3, Share, Smile,
  Bell, BellOff, Lock, Unlock, Key, Shield, ShieldOff, 
  Settings, X
} from 'lucide-react'

const DEFAULT_MENU_WIDTH = 180
const DEFAULT_MENU_HEIGHT = 250

const MessageContextMenu = ({ 
  position, 
  onClose, 
  message,
  onReply,
  onCopy,
  onEdit,
  onDelete,
  onAddReaction,
  canEdit = false,
  canDelete = false,
  isOwn = false
}) => {
  const menuRef = useRef(null)
  const [adjustedPosition, setAdjustedPosition] = useState(position)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  // Calculate position to keep menu on screen
  useLayoutEffect(() => {
    if (!position) return
    
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    
    let menuWidth = DEFAULT_MENU_WIDTH
    let menuHeight = DEFAULT_MENU_HEIGHT
    
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect()
      menuWidth = rect.width || DEFAULT_MENU_WIDTH
      menuHeight = rect.height || DEFAULT_MENU_HEIGHT
    }

    let newX = position.x
    let newY = position.y

    // Right edge: flip to left of cursor if needed
    if (position.x + menuWidth > viewportWidth - 8) {
      newX = position.x - menuWidth
    }
    // Left edge: ensure minimum padding
    if (newX < 8) {
      newX = 8
    }

    // Bottom edge: flip above cursor if needed
    if (position.y + menuHeight > viewportHeight - 8) {
      newY = position.y - menuHeight
    }
    // Top edge: ensure minimum padding
    if (newY < 8) {
      newY = 8
    }

    setAdjustedPosition({ x: newX, y: newY })
  }, [position])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose()
      }
    }

    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('mousedown', handleClickOutside, true)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  if (!position || !message || !mounted) return null

  const handleClick = (action) => {
    action()
    onClose()
  }

  const menuContent = (
    <div 
      ref={menuRef}
      className="message-context-menu"
      style={{ 
        left: adjustedPosition?.x || position.x, 
        top: adjustedPosition?.y || position.y,
        position: 'fixed'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="context-menu-section">
        <button onClick={() => handleClick(() => onAddReaction && onAddReaction(message))}>
          <Smile size={16} />
          Add Reaction
        </button>
        <button onClick={() => handleClick(() => onReply && onReply(message))}>
          <Reply size={16} />
          Reply
        </button>
        <button onClick={() => handleClick(() => onCopy && onCopy(message))}>
          <Copy size={16} />
          Copy Text
        </button>
      </div>

      {(canEdit || canDelete) && (
        <>
          <div className="context-menu-divider" />
          <div className="context-menu-section">
            {canEdit && isOwn && (
              <button onClick={() => handleClick(() => onEdit && onEdit(message))}>
                <Edit3 size={16} />
                Edit Message
              </button>
            )}
            {canDelete && (
              <button 
                onClick={() => handleClick(() => onDelete && onDelete(message))}
                className="danger"
              >
                <Trash2 size={16} />
                Delete Message
              </button>
            )}
          </div>
        </>
      )}

      <style>{`
        .message-context-menu {
          min-width: 180px;
          background: var(--volt-bg-tertiary);
          border: 1px solid var(--volt-border);
          border-radius: 8px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
          z-index: 10000;
        }

        .context-menu-section {
          padding: 4px;
        }

        .context-menu-section button {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 10px 12px;
          background: none;
          border: none;
          border-radius: 6px;
          color: var(--volt-text-primary);
          font-size: 14px;
          cursor: pointer;
          transition: background 0.15s;
          text-align: left;
        }

        .context-menu-section button:hover {
          background: var(--volt-hover);
        }

        .context-menu-section button.danger {
          color: var(--volt-danger);
        }

        .context-menu-section button.danger:hover {
          background: rgba(239, 68, 68, 0.1);
        }

        .context-menu-divider {
          height: 1px;
          background: var(--volt-border);
          margin: 4px 0;
        }
      `}</style>
    </div>
  )

  const portalRoot = document.getElementById('portal-root')
  if (!portalRoot) return null

  return createPortal(menuContent, portalRoot)
}

export default MessageContextMenu
