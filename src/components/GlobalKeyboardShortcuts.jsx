import React, { useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { settingsService } from '../services/settingsService'
import { useVoice } from '../contexts/VoiceContext'
import { useAppStore } from '../store/useAppStore'

const shouldIgnoreShortcut = () => {
  if (typeof window === 'undefined') return true
  
  const activeElement = document.activeElement
  if (!activeElement) return false
  
  const tagName = activeElement.tagName
  const isInput = tagName === 'INPUT' || tagName === 'TEXTAREA' || activeElement.isContentEditable
  
  if (isInput && !activeElement.dataset.allowShortcut) {
    return true
  }
  
  if (document.querySelector('.modal-overlay') || document.querySelector('[role="dialog"]')) {
    return true
  }
  
  return false
}

export const getShortcutDisplay = (shortcut) => {
  if (!shortcut) return ''
  
  const parts = []
  if (shortcut.ctrl) parts.push('Ctrl')
  if (shortcut.alt) parts.push('Alt')
  if (shortcut.shift) parts.push('Shift')
  parts.push(shortcut.key.toUpperCase())
  
  return parts.join('+')
}

export const getAllShortcuts = () => {
  return settingsService.getSetting('keyboardShortcuts') || {}
}

export const GlobalKeyboardShortcutsInner = ({ children }) => {
  const navigate = useNavigate()
  const { toggleMute, toggleDeafen, toggleVideo, toggleScreenShare, startScreenShare, stopScreenShare, isScreenSharing } = useVoice()
  const lastPushToTalkRef = useRef(false)
  const shortcutsConfig = useRef(settingsService.getSetting('keyboardShortcuts'))
  const showChannelDrawer = useAppStore(state => state.showChannelDrawer)
  const setShowChannelDrawer = useAppStore(state => state.setShowChannelDrawer)
  const sidebarVisible = useAppStore(state => state.sidebarVisible)
  const setSidebarVisible = useAppStore(state => state.setSidebarVisible)

  useEffect(() => {
    const unsubscribe = settingsService.subscribe((settings) => {
      shortcutsConfig.current = settings.keyboardShortcuts
    })
    return unsubscribe
  }, [])

  const matchShortcut = useCallback((e, shortcut) => {
    if (!shortcut) return false
    
    const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase()
    const ctrlMatch = (e.ctrlKey || e.metaKey) === shortcut.ctrl
    const shiftMatch = e.shiftKey === shortcut.shift
    const altMatch = e.altKey === shortcut.alt
    
    return keyMatch && ctrlMatch && shiftMatch && altMatch
  }, [])

  const openSettings = useCallback(() => {
    window.dispatchEvent(new CustomEvent('volt:open-settings'))
  }, [])

  const handleKeyDown = useCallback((e) => {
    if (shouldIgnoreShortcut()) return

    const shortcuts = shortcutsConfig.current
    if (!shortcuts) return

    const matchedShortcut = Object.entries(shortcuts).find(([_, config]) => 
      matchShortcut(e, config)
    )

    if (!matchedShortcut) return

    const [action] = matchedShortcut
    e.preventDefault()
    e.stopPropagation()

    switch (action) {
      case 'toggleMute':
        toggleMute()
        break
      case 'toggleDeafen':
        toggleDeafen()
        break
      case 'toggleSelfVideo':
        toggleVideo()
        break
      case 'toggleScreenShare':
        if (isScreenSharing) {
          stopScreenShare()
        } else {
          startScreenShare()
        }
        break
      case 'openSettings':
        openSettings()
        break
      case 'quickSwitcher':
        break
      case 'markAllRead':
        window.dispatchEvent(new CustomEvent('volt:mark-all-read'))
        break
      case 'focusChat':
        const chatInput = document.querySelector('.chat-input [contenteditable], .chat-input input, .chat-input textarea')
        if (chatInput) {
          chatInput.focus()
        }
        break
      case 'toggleSidebar':
        setSidebarVisible(!sidebarVisible)
        break
      case 'goToHome':
        navigate('/chat')
        break
      case 'goToDMs':
        navigate('/chat/dms')
        break
      case 'goToFriends':
        navigate('/chat/friends')
        break
      case 'goToDiscovery':
        navigate('/chat/discovery')
        break
      case 'toggleServerDrawer':
        setShowChannelDrawer(!showChannelDrawer)
        break
      case 'pushToTalk':
        lastPushToTalkRef.current = true
        break
      default:
        break
    }
  }, [matchShortcut, toggleMute, toggleDeafen, toggleVideo, startScreenShare, stopScreenShare, 
      isScreenSharing, openSettings, navigate, sidebarVisible, setSidebarVisible, 
      showChannelDrawer, setShowChannelDrawer])

  const handleKeyUp = useCallback((e) => {
    if (shouldIgnoreShortcut()) return

    const shortcuts = shortcutsConfig.current
    if (!shortcuts?.pushToTalk) return

    if (matchShortcut(e, shortcuts.pushToTalk)) {
      lastPushToTalkRef.current = false
    }
  }, [matchShortcut])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('keyup', handleKeyUp, true)
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('keyup', handleKeyUp, true)
    }
  }, [handleKeyDown, handleKeyUp])

  return children
}

const GlobalKeyboardShortcuts = ({ children }) => {
  return (
    <GlobalKeyboardShortcutsInner>
      {children}
    </GlobalKeyboardShortcutsInner>
  )
}

export default GlobalKeyboardShortcuts
