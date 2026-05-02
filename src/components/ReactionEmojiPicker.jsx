import React, { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import EmojiPicker from './EmojiPicker'

const DEFAULT_PICKER_SIZE = { width: 320, height: 360 }
const MENU_PADDING = 8

const calculatePickerPosition = (anchorRect, pickerWidth, pickerHeight, viewportWidth, viewportHeight) => {
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

const ReactionEmojiPicker = React.memo(({ isOpen, anchorRect, onSelect, onClose, serverEmojis }) => {
  const pickerRef = useRef(null)
  const [size, setSize] = useState(DEFAULT_PICKER_SIZE)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const focusFrameRef = useRef(null)
  const previouslyFocusedRef = useRef(null)

  const closePicker = useCallback(() => {
    onClose?.()
  }, [onClose])

  const updatePosition = useCallback((pickerWidth = size.width, pickerHeight = size.height) => {
    if (!anchorRect) return

    const nextPosition = calculatePickerPosition(
      anchorRect,
      pickerWidth,
      pickerHeight,
      window.innerWidth,
      window.innerHeight
    )

    setPosition((previous) => (
      previous.x === nextPosition.x && previous.y === nextPosition.y
        ? previous
        : nextPosition
    ))
  }, [anchorRect, size.height, size.width])

  useEffect(() => {
    if (!isOpen || !anchorRect) return
    updatePosition()
  }, [isOpen, anchorRect, size.width, size.height, updatePosition])

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDownOutside = (e) => {
      const picker = pickerRef.current
      if (picker && !picker.contains(e.target)) {
        closePicker()
      }
    }

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closePicker()
      }
    }

    const handleResize = () => {
      updatePosition()
    }

    document.addEventListener('pointerdown', handlePointerDownOutside, true)
    document.addEventListener('keydown', handleEscape, true)
    window.addEventListener('resize', handleResize)
    window.addEventListener('orientationchange', handleResize)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDownOutside, true)
      document.removeEventListener('keydown', handleEscape, true)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleResize)
    }
  }, [isOpen, closePicker, updatePosition])

  useEffect(() => {
    if (!isOpen) {
      const previouslyFocused = previouslyFocusedRef.current
      if (previouslyFocused?.focus) {
        previouslyFocused.focus()
      }
      return undefined
    }

    previouslyFocusedRef.current = document.activeElement
    focusFrameRef.current = requestAnimationFrame(() => {
      const picker = pickerRef.current
      if (!picker) return

      const firstFocusable = picker.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )

      if (firstFocusable?.focus) {
        firstFocusable.focus()
      } else {
        picker.focus()
      }
    })

    return () => {
      if (focusFrameRef.current) {
        cancelAnimationFrame(focusFrameRef.current)
      }
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !pickerRef.current || typeof ResizeObserver === 'undefined') return undefined

    const pickerElement = pickerRef.current
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return

      const { width, height } = entry.contentRect
      const nextWidth = Math.round(width)
      const nextHeight = Math.round(height)

      setSize((previous) => (
        previous.width === nextWidth && previous.height === nextHeight
          ? previous
          : { width: nextWidth, height: nextHeight }
      ))

      updatePosition(nextWidth, nextHeight)
    })

    observer.observe(pickerElement)
    return () => observer.disconnect()
  }, [isOpen, updatePosition])

  if (!isOpen) return null

  const portalRoot = document.getElementById('portal-root') || document.body
  if (!portalRoot) return null

  const pickerContent = (
    <div
      ref={pickerRef}
      className="reaction-emoji-picker-portal"
      role="dialog"
      aria-label="Reaction emoji picker"
      aria-modal="false"
      tabIndex={-1}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 10001,
      }}
    >
      <EmojiPicker 
        onSelect={onSelect} 
        onClose={closePicker}
        serverEmojis={serverEmojis}
        initialWidth={size.width}
        initialHeight={size.height}
        showGifs={false}
      />
    </div>
  )

  return createPortal(pickerContent, portalRoot)
})

// Add display name for debugging
ReactionEmojiPicker.displayName = 'ReactionEmojiPicker'

export default ReactionEmojiPicker
export { calculatePickerPosition }
