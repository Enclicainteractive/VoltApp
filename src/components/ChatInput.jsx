import React, { useRef, useEffect, useState, useCallback } from 'react'
import '../assets/styles/ChatInput.css'

const ChatInput = ({ 
  value, 
  onChange, 
  placeholder, 
  onSubmit,
  onKeyDown,
  disabled,
  onAttachClick,
  onEmojiClick,
  className = ''
}) => {
  const editorRef = useRef(null)
  const [isFocused, setIsFocused] = useState(false)
  const [contextMenu, setContextMenu] = useState(null)

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerText !== value) {
      if (document.activeElement !== editorRef.current) {
        editorRef.current.innerText = value || ''
      }
    }
  }, [value])

  useEffect(() => {
    if (value === '' && editorRef.current && editorRef.current.innerText) {
      editorRef.current.innerText = ''
      editorRef.current.style.height = 'auto'
    }
  }, [value])

  const handleInput = (e) => {
    const text = e.target.innerText
    onChange(text)
    autoResize()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (onSubmit) onSubmit()
    }
    if (onKeyDown) {
      onKeyDown(e)
    }
  }

  const handlePaste = (e) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
  }

  const handleFocus = () => setIsFocused(true)
  const handleBlur = () => setIsFocused(false)

  const autoResize = () => {
    if (editorRef.current) {
      editorRef.current.style.height = 'auto'
      editorRef.current.style.height = Math.min(editorRef.current.scrollHeight, 200) + 'px'
    }
  }

  const handleContextMenu = useCallback((e) => {
    e.preventDefault()
    
    const selection = window.getSelection()
    const hasSelection = selection && selection.toString().length > 0
    
    const menuItems = [
      {
        label: 'Cut',
        icon: '✂️',
        action: () => {
          document.execCommand('cut')
          setContextMenu(null)
        },
        disabled: !hasSelection
      },
      {
        label: 'Copy',
        icon: '📋',
        action: () => {
          document.execCommand('copy')
          setContextMenu(null)
        },
        disabled: !hasSelection
      },
      {
        label: 'Paste',
        icon: '📝',
        action: async () => {
          try {
            const text = await navigator.clipboard.readText()
            document.execCommand('insertText', false, text)
          } catch (err) {
            const text = e.clipboardData.getData('text/plain')
            document.execCommand('insertText', false, text)
          }
          setContextMenu(null)
        },
        disabled: false
      },
      {
        label: 'Select All',
        icon: '✓',
        action: () => {
          const range = document.createRange()
          range.selectNodeContents(editorRef.current)
          selection.removeAllRanges()
          selection.addRange(range)
          setContextMenu(null)
        },
        disabled: false
      }
    ]
    
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: menuItems
    })
  }, [])

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  useEffect(() => {
    const handleClickOutside = () => closeContextMenu()
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [contextMenu, closeContextMenu])

  return (
    <div className={`chat-input-container ${className} ${isFocused ? 'focused' : ''}`}>
      <button 
        type="button" 
        className="chat-input-action-btn"
        title="Add Attachment"
        onClick={onAttachClick}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="16" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
      </button>

      <div className="chat-input-wrapper">
        <div
          ref={editorRef}
          contentEditable
          className="chat-input-editor"
          placeholder={placeholder}
          onInput={handleInput}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onContextMenu={handleContextMenu}
          suppressContentEditableWarning
          disabled={disabled}
          spellCheck="true"
        />
      </div>

      {contextMenu && (
        <div 
          className="custom-context-menu"
          style={{ 
            left: contextMenu.x, 
            top: contextMenu.y 
          }}
        >
          {contextMenu.items.map((item, index) => (
            <button
              key={index}
              className={`context-menu-item ${item.disabled ? 'disabled' : ''}`}
              onClick={item.disabled ? undefined : item.action}
              disabled={item.disabled}
            >
              <span className="context-menu-icon">{item.icon}</span>
              <span className="context-menu-label">{item.label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="chat-input-actions">
        <button 
          type="button" 
          className="chat-input-action-btn"
          title="Emoji"
          onClick={onEmojiClick}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
            <line x1="9" y1="9" x2="9.01" y2="9" />
            <line x1="15" y1="9" x2="15.01" y2="9" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default ChatInput
