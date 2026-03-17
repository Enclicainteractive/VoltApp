import { useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { settingsService } from '../services/settingsService'
import { useAppStore } from '../store/useAppStore'
import { useVoice } from '../contexts/VoiceContext'

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
  
  const isInFullVoiceWithActivity = document.body.classList.contains('voice-full-mode')
  if (isInFullVoiceWithActivity) {
    return true
  }
  
  return false
}

export const useGlobalKeyboardShortcuts = (options = {}) => {
  const { 
    onToggleMute, 
    onToggleDeafen, 
    onToggleVideo,
    onToggleScreenShare,
    onOpenSettings,
    onQuickSwitcher,
    onMarkAllRead,
    onFocusChat,
    onToggleSidebar,
    onGoToHome,
    onGoToDMs,
    onGoToFriends,
    onGoToDiscovery,
    onToggleServerDrawer,
    onPushToTalk
  } = options

  const navigate = useNavigate()
  const lastPushToTalkRef = useRef(false)
  const shortcutsConfig = useRef(settingsService.getSetting('keyboardShortcuts'))

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
        onToggleMute?.()
        break
      case 'toggleDeafen':
        onToggleDeafen?.()
        break
      case 'toggleSelfVideo':
        onToggleVideo?.()
        break
      case 'toggleScreenShare':
        onToggleScreenShare?.()
        break
      case 'openSettings':
        onOpenSettings?.()
        break
      case 'quickSwitcher':
        onQuickSwitcher?.()
        break
      case 'markAllRead':
        onMarkAllRead?.()
        break
      case 'focusChat':
        onFocusChat?.()
        break
      case 'toggleSidebar':
        onToggleSidebar?.()
        break
      case 'goToHome':
        onGoToHome?.()
        break
      case 'goToDMs':
        onGoToDMs?.()
        break
      case 'goToFriends':
        onGoToFriends?.()
        break
      case 'goToDiscovery':
        onGoToDiscovery?.()
        break
      case 'toggleServerDrawer':
        onToggleServerDrawer?.()
        break
      case 'pushToTalk':
        lastPushToTalkRef.current = true
        onPushToTalk?.(true)
        break
      default:
        break
    }
  }, [matchShortcut, onToggleMute, onToggleDeafen, onToggleVideo, onToggleScreenShare, 
      onOpenSettings, onQuickSwitcher, onMarkAllRead, onFocusChat, onToggleSidebar,
      onGoToHome, onGoToDMs, onGoToFriends, onGoToDiscovery, onToggleServerDrawer, onPushToTalk])

  const handleKeyUp = useCallback((e) => {
    if (shouldIgnoreShortcut()) return

    const shortcuts = shortcutsConfig.current
    if (!shortcuts?.pushToTalk) return

    if (matchShortcut(e, shortcuts.pushToTalk)) {
      lastPushToTalkRef.current = false
      onPushToTalk?.(false)
    }
  }, [matchShortcut, onPushToTalk])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('keyup', handleKeyUp, true)
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('keyup', handleKeyUp, true)
    }
  }, [handleKeyDown, handleKeyUp])

  return { matchShortcut }
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
