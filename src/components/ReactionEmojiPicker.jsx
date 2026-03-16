import React, { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import EmojiPicker from './EmojiPicker'

const MIN_WIDTH = 280
const MAX_WIDTH = 500
const MIN_HEIGHT = 300
const MAX_HEIGHT = 500
const MENU_PADDING = 8

function calculatePickerPosition(anchorRect, pickerWidth, pickerHeight, viewportWidth, viewportHeight) {
  let x = anchorRect?.left ?? 0
  let y = (anchorRect?.bottom ?? 0) + 8

  if (x + pickerWidth > viewportWidth - MENU_PADDING) {
    x = viewportWidth - pickerWidth - MENU_PADDING
  }
  if (x < MENU_PADDING) {
    x = MENU_PADDING
  }

  if (y + pickerHeight > viewportHeight - MENU_PADDING) {
    y = (anchorRect?.top ?? 0) - pickerHeight - 8
  }
  if (y < MENU_PADDING) {
    y = MENU_PADDING
  }

  return { x, y }
}

const ReactionEmojiPicker = ({ isOpen, anchorRect, onSelect, onClose, serverEmojis }) => {
  const pickerRef = useRef(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [size, setSize] = useState({ width: 320, height: 360 })
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 50)
    return () => clearTimeout(timer)
  }, [])

  const updatePosition = useCallback(() => {
    if (!anchorRect) return

    const newPos = calculatePickerPosition(
      anchorRect,
      size.width,
      size.height,
      window.innerWidth,
      window.innerHeight
    )
    setPosition(newPos)
  }, [anchorRect, size])

  useEffect(() => {
    if (!isOpen || !anchorRect || !isReady) return
    updatePosition()
  }, [isOpen, anchorRect, isReady, updatePosition])

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e) => {
      const picker = pickerRef.current
      if (picker && !picker.contains(e.target)) {
        onClose()
      }
    }

    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose()
    }

    const handleResize = () => {
      updatePosition()
    }

    document.addEventListener('mousedown', handleClickOutside, true)
    document.addEventListener('keydown', handleEscape)
    window.addEventListener('resize', handleResize)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true)
      document.removeEventListener('keydown', handleEscape)
      window.removeEventListener('resize', handleResize)
    }
  }, [isOpen, onClose, updatePosition])

  if (!isOpen || !isReady) return null

  const portalRoot = document.getElementById('portal-root')
  if (!portalRoot) return null

  const pickerContent = (
    <div
      ref={pickerRef}
      className="reaction-emoji-picker-portal"
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 10001,
      }}
    >
      <EmojiPicker 
        onSelect={onSelect} 
        onClose={onClose}
        serverEmojis={serverEmojis}
        initialWidth={size.width}
        initialHeight={size.height}
        showGifs={false}
      />
    </div>
  )

  return createPortal(pickerContent, portalRoot)
}

export default ReactionEmojiPicker
export { calculatePickerPosition }
