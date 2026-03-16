import React, { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import '../assets/styles/ContextMenu.css'

const MENU_PADDING = 8

function calculateMenuPosition(x, y, menuWidth, menuHeight, viewportWidth, viewportHeight) {
  let newX = x
  let newY = y

  if (x + menuWidth > viewportWidth - MENU_PADDING) {
    newX = x - menuWidth
  }
  if (newX < MENU_PADDING) {
    newX = MENU_PADDING
  }

  if (y + menuHeight > viewportHeight - MENU_PADDING) {
    newY = y - menuHeight
  }
  if (newY < MENU_PADDING) {
    newY = MENU_PADDING
  }

  return { x: newX, y: newY }
}

const ContextMenu = ({ x, y, items, onClose, menuId }) => {
  const menuRef = useRef(null)
  const [position, setPosition] = useState(null)
  const [menuSize, setMenuSize] = useState({ width: 0, height: 0 })
  const isPositioned = useRef(false)
  const prevCoords = useRef({ x, y })

  useEffect(() => {
    if (x === prevCoords.current.x && y === prevCoords.current.y && isPositioned.current) return
    prevCoords.current = { x, y }
    isPositioned.current = false
  }, [x, y])

  useEffect(() => {
    if (!menuRef.current || isPositioned.current) return

    const updatePosition = () => {
      const rect = menuRef.current.getBoundingClientRect()
      const width = rect.width || 200
      const height = rect.height || 300

      if (width === 0 || height === 0) return

      setMenuSize({ width, height })
      
      const newPos = calculateMenuPosition(
        x, y, width, height,
        window.innerWidth,
        window.innerHeight
      )
      
      setPosition(newPos)
      isPositioned.current = true
    }

    const rafId = requestAnimationFrame(() => {
      requestAnimationFrame(updatePosition)
    })

    return () => cancelAnimationFrame(rafId)
  }, [x, y])

  useEffect(() => {
    if (!position || !menuRef.current || menuSize.width === 0) return

    const rect = menuRef.current.getBoundingClientRect()
    if (rect.width === 0) return

    const newPos = calculateMenuPosition(
      x, y, rect.width, rect.height,
      window.innerWidth,
      window.innerHeight
    )

    if (newPos.x !== position.x || newPos.y !== position.y) {
      setPosition(newPos)
    }
  }, [x, y, position, menuSize])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose()
      }
    }

    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose()
    }

    const handleResize = () => {
      if (!menuRef.current || !position) return
      const rect = menuRef.current.getBoundingClientRect()
      const newPos = calculateMenuPosition(
        x, y, rect.width, rect.height,
        window.innerWidth,
        window.innerHeight
      )
      setPosition(newPos)
    }

    document.addEventListener('mousedown', handleClickOutside, true)
    document.addEventListener('keydown', handleEscape)
    window.addEventListener('resize', handleResize)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true)
      document.removeEventListener('keydown', handleEscape)
      window.removeEventListener('resize', handleResize)
    }
  }, [onClose, x, y, position])

  useEffect(() => {
    return () => {
      isPositioned.current = false
    }
  }, [])

  const renderMenuItems = useCallback(() => {
    return items.map((item, index) => {
      if (item.type === 'separator') {
        return <div key={index} className="context-menu-separator" />
      }

      if (item.type === 'header') {
        return (
          <div key={index} className="context-menu-header">
            {item.label}
          </div>
        )
      }

      return (
        <button
          key={index}
          className={`context-menu-item ${item.danger ? 'danger' : ''} ${item.disabled ? 'disabled' : ''}`}
          onClick={() => {
            if (!item.disabled) {
              item.onClick?.()
              onClose()
            }
          }}
          disabled={item.disabled}
        >
          {item.icon && <span className="context-menu-icon">{item.icon}</span>}
          <span className="context-menu-label">{item.label}</span>
          {item.shortcut && <span className="context-menu-shortcut">{item.shortcut}</span>}
        </button>
      )
    })
  }, [items, onClose])

  if (x === null || y === null || !items) return null

  const portalRoot = document.getElementById('portal-root')
  if (!portalRoot) return null

  return createPortal(
    <div
      ref={menuRef}
      className="context-menu"
      style={{
        left: position?.x ?? x,
        top: position?.y ?? y,
        position: 'fixed',
        opacity: position ? 1 : 0,
        pointerEvents: position ? 'auto' : 'none'
      }}
    >
      {renderMenuItems()}
    </div>,
    portalRoot
  )
}

export default ContextMenu

export { calculateMenuPosition }
