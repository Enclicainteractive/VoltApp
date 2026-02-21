import React, { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import { useTranslation } from '../hooks/useTranslation'
import { useAppStore } from '../store/useAppStore'
import '../assets/styles/ChatInput.css'

const CUSTOM_EMOJI_TOKEN_RE = /:([a-zA-Z0-9_]{1,32}|[^|:\s]+\|[^|:\s]+\|[^|:\s]+\|[^:\s]+):/g
const CARET_MARKER = '\uE000'

const buildEmojiLookup = (customEmojis = [], globalEmojis = []) => {
  const byName = {}
  const byId = {}
  ;[...customEmojis, ...globalEmojis].forEach((emoji) => {
    if (!emoji) return
    if (emoji.name && emoji.url && !byName[emoji.name]) byName[emoji.name] = emoji
    if (emoji.id && emoji.url && !byId[emoji.id]) byId[emoji.id] = emoji
  })
  return { byName, byId }
}

const resolveEmojiToken = (tokenInner, lookup) => {
  if (!tokenInner || !lookup) return null
  if (tokenInner.includes('|')) {
    const parts = tokenInner.split('|')
    if (parts.length < 4) return null
    const [host, serverId, emojiId, emojiName] = parts
    const emoji = lookup.byId[emojiId] || lookup.byName[emojiName]
    if (!emoji?.url) return null
    return {
      token: `:${tokenInner}:`,
      url: emoji.url,
      name: emoji.name || emojiName,
      title: `:${emojiName}: (${serverId}@${host})`
    }
  }

  const emoji = lookup.byName[tokenInner]
  if (!emoji?.url) return null
  return {
    token: `:${tokenInner}:`,
    url: emoji.url,
    name: emoji.name || tokenInner,
    title: `:${tokenInner}:`
  }
}

const buildEditorNodes = (text, lookup) => {
  const nodes = []
  if (!text) return [document.createTextNode('')]

  let last = 0
  let match
  const re = new RegExp(CUSTOM_EMOJI_TOKEN_RE.source, 'g')
  while ((match = re.exec(text)) !== null) {
    const tokenInner = match[1]
    const emoji = resolveEmojiToken(tokenInner, lookup)
    if (!emoji) continue

    if (match.index > last) {
      nodes.push(document.createTextNode(text.slice(last, match.index)))
    }

    const chip = document.createElement('span')
    chip.className = 'chat-input-emoji-token'
    chip.setAttribute('data-token', emoji.token)
    chip.setAttribute('contenteditable', 'false')
    chip.setAttribute('title', emoji.title)
    const img = document.createElement('img')
    img.src = emoji.url
    img.alt = emoji.token
    img.draggable = false
    chip.appendChild(img)
    nodes.push(chip)

    last = match.index + match[0].length
  }

  if (last === 0) return [document.createTextNode(text)]
  if (last < text.length) nodes.push(document.createTextNode(text.slice(last)))
  if (!nodes.length) nodes.push(document.createTextNode(''))
  return nodes
}

const serializeNodeToText = (node) => {
  if (!node) return ''
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || ''
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  if (node.hasAttribute('data-caret-marker')) return CARET_MARKER
  if (node.classList.contains('chat-input-emoji-token')) return node.getAttribute('data-token') || ''
  let out = ''
  node.childNodes.forEach((child) => { out += serializeNodeToText(child) })
  return out
}

const ChatInput = forwardRef(({ 
  value, 
  onChange, 
  placeholder, 
  onSubmit,
  onKeyDown,
  disabled,
  onAttachClick,
  onEmojiClick,
  customEmojis = [],
  className = ''
}, ref) => {
  const { t } = useTranslation()
  const globalEmojis = useAppStore(state => state.globalEmojis)
  const editorRef = useRef(null)
  const [isFocused, setIsFocused] = useState(false)
  const [contextMenu, setContextMenu] = useState(null)
  // Track if we're in the middle of a programmatic update to prevent loops
  const isUpdatingRef = useRef(false)
  const emojiLookupRef = useRef(buildEmojiLookup(customEmojis, globalEmojis))

  useEffect(() => {
    emojiLookupRef.current = buildEmojiLookup(customEmojis, globalEmojis)
  }, [customEmojis, globalEmojis])

  const setCaretByPlainOffset = useCallback((offset) => {
    const el = editorRef.current
    if (!el) return
    const selection = window.getSelection()
    if (!selection) return
    let remaining = Math.max(0, offset)

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_ALL)
    let node = walker.nextNode()
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const len = node.textContent?.length || 0
        if (remaining <= len) {
          const range = document.createRange()
          range.setStart(node, remaining)
          range.collapse(true)
          selection.removeAllRanges()
          selection.addRange(range)
          return
        }
        remaining -= len
      } else if (node.nodeType === Node.ELEMENT_NODE && node.classList?.contains('chat-input-emoji-token')) {
        const token = node.getAttribute('data-token') || ''
        if (remaining <= token.length) {
          const range = document.createRange()
          if (remaining === 0) {
            range.setStartBefore(node)
          } else {
            range.setStartAfter(node)
          }
          range.collapse(true)
          selection.removeAllRanges()
          selection.addRange(range)
          return
        }
        remaining -= token.length
      }
      node = walker.nextNode()
    }

    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    selection.removeAllRanges()
    selection.addRange(range)
  }, [])

  const renderEditorFromPlainText = useCallback((text, caretOffset = null) => {
    const el = editorRef.current
    if (!el) return
    const nodes = buildEditorNodes(text, emojiLookupRef.current)
    el.innerHTML = ''
    nodes.forEach(node => el.appendChild(node))
    if (!el.lastChild || el.lastChild.nodeType !== Node.TEXT_NODE) {
      el.appendChild(document.createTextNode(''))
    }
    if (caretOffset != null) setCaretByPlainOffset(caretOffset)
    autoResize()
  }, [setCaretByPlainOffset])

  const readPlainTextAndCaret = useCallback(() => {
    const el = editorRef.current
    if (!el) return { text: '', caret: 0 }
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || !el.contains(selection.anchorNode)) {
      return { text: serializeNodeToText(el), caret: serializeNodeToText(el).length }
    }

    const range = selection.getRangeAt(0).cloneRange()
    range.collapse(true)
    const marker = document.createElement('span')
    marker.setAttribute('data-caret-marker', '1')
    marker.textContent = '\u200b'
    range.insertNode(marker)
    const serialized = serializeNodeToText(el)
    marker.remove()
    const caret = serialized.indexOf(CARET_MARKER)
    const text = serialized.replace(CARET_MARKER, '')
    return { text, caret: caret >= 0 ? caret : text.length }
  }, [])

  // Expose the inner contentEditable node so parent can read cursor position
  useImperativeHandle(ref, () => ({
    getEditor: () => editorRef.current,
    focus: () => editorRef.current?.focus(),
    // Return caret offset within the plain text content
    getCaretPosition: () => readPlainTextAndCaret().caret,
    // Set caret to a specific character offset
    setCaretPosition: (offset) => {
      const el = editorRef.current
      if (!el) return
      el.focus()
      setCaretByPlainOffset(offset)
    },
    // Atomically set the full text content and caret in one operation, bypassing focus guards
    setValueAndCaret: (text, caretOffset) => {
      const el = editorRef.current
      if (!el) return
      isUpdatingRef.current = true
      renderEditorFromPlainText(text, caretOffset ?? text.length)
      el.focus()
      isUpdatingRef.current = false
    }
  }), [readPlainTextAndCaret, setCaretByPlainOffset, renderEditorFromPlainText])

  useEffect(() => {
    // Skip sync if we're in the middle of a programmatic update
    if (isUpdatingRef.current) return
    
    if (editorRef.current) {
      const normalizedCurrent = readPlainTextAndCaret().text
      if (normalizedCurrent !== (value || '')) {
        isUpdatingRef.current = true
        renderEditorFromPlainText(value || '')
        isUpdatingRef.current = false
      }
    }
  }, [value, renderEditorFromPlainText, readPlainTextAndCaret])

  const syncFromDom = useCallback(() => {
    if (isUpdatingRef.current) return
    const { text: rawText, caret } = readPlainTextAndCaret()
    const normalized = rawText.replace(/^\n+(?=```)/, '')
    isUpdatingRef.current = true
    renderEditorFromPlainText(normalized, Math.min(caret, normalized.length))
    isUpdatingRef.current = false
    onChange(normalized)
  }, [onChange, readPlainTextAndCaret, renderEditorFromPlainText])

  const handleInput = (e) => {
    // Skip if we're in the middle of a programmatic update
    if (isUpdatingRef.current) return
    syncFromDom()
  }

  const handleKeyDown = (e) => {
    const selection = window.getSelection()
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null

    if (range && selection?.isCollapsed && (e.key === 'Backspace' || e.key === 'Delete')) {
      const container = range.startContainer
      const offset = range.startOffset
      let tokenNode = null

      if (container.nodeType === Node.TEXT_NODE) {
        const sibling = e.key === 'Backspace'
          ? (offset === 0 ? container.previousSibling : null)
          : (offset === (container.textContent?.length || 0) ? container.nextSibling : null)
        if (sibling?.nodeType === Node.ELEMENT_NODE && sibling.classList?.contains('chat-input-emoji-token')) {
          tokenNode = sibling
        }
      } else if (container.nodeType === Node.ELEMENT_NODE) {
        const children = container.childNodes || []
        const idx = e.key === 'Backspace' ? offset - 1 : offset
        const candidate = idx >= 0 && idx < children.length ? children[idx] : null
        if (candidate?.nodeType === Node.ELEMENT_NODE && candidate.classList?.contains('chat-input-emoji-token')) {
          tokenNode = candidate
        }
      }

      if (tokenNode) {
        e.preventDefault()
        tokenNode.remove()
        syncFromDom()
        return
      }
    }

    // Handle Shift+Enter for newline - let the browser handle it naturally
    // by NOT preventing default for shift+enter
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
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    range.deleteContents()
    range.insertNode(document.createTextNode(text))
    range.collapse(false)
    selection.removeAllRanges()
    selection.addRange(range)
    syncFromDom()
  }

  const handleCopyCut = useCallback((e, isCut = false) => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return
    const range = selection.getRangeAt(0)
    const fragment = range.cloneContents()
    const text = serializeNodeToText(fragment)
    e.preventDefault()
    e.clipboardData.setData('text/plain', text)
    if (isCut) {
      range.deleteContents()
      syncFromDom()
    }
  }, [syncFromDom])

  const handleCopy = useCallback((e) => {
    handleCopyCut(e, false)
  }, [handleCopyCut])

  const handleCut = useCallback((e) => {
    handleCopyCut(e, true)
  }, [handleCopyCut])

  const insertPlainTextAtCaret = useCallback((text) => {
    const el = editorRef.current
    if (!el) return
    el.focus()
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    range.deleteContents()
    const node = document.createTextNode(text)
    range.insertNode(node)
    const newRange = document.createRange()
    newRange.setStartAfter(node)
    newRange.collapse(true)
    selection.removeAllRanges()
    selection.addRange(newRange)
    syncFromDom()
  }, [syncFromDom])

  const getSelectedPlainText = useCallback(() => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return ''
    const range = selection.getRangeAt(0)
    return serializeNodeToText(range.cloneContents())
  }, [])

  const handleContextPaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      insertPlainTextAtCaret(text)
    } catch {
      // Clipboard read can be blocked by permissions; silently ignore.
    }
  }, [insertPlainTextAtCaret])

  const handleContextCopy = useCallback(() => {
    const selected = getSelectedPlainText()
    if (!selected) return
    navigator.clipboard.writeText(selected).catch(() => {})
  }, [getSelectedPlainText])

  const handleContextCut = useCallback(() => {
    const selected = getSelectedPlainText()
    if (!selected) return
    navigator.clipboard.writeText(selected).catch(() => {})
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return
    selection.getRangeAt(0).deleteContents()
    syncFromDom()
  }, [getSelectedPlainText, syncFromDom])

  const handleContextSelectAll = useCallback(() => {
    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(editorRef.current)
    selection.removeAllRanges()
    selection.addRange(range)
  }, [])

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
        label: t('common.cut', 'Cut'),
        icon: '✂️',
        action: () => {
          handleContextCut()
          setContextMenu(null)
        },
        disabled: !hasSelection
      },
      {
        label: t('common.copy', 'Copy'),
        icon: '📋',
        action: () => {
          handleContextCopy()
          setContextMenu(null)
        },
        disabled: !hasSelection
      },
      {
        label: t('common.paste', 'Paste'),
        icon: '📝',
        action: async () => {
          try {
            await handleContextPaste()
          } catch {}
          setContextMenu(null)
        },
        disabled: false
      },
      {
        label: t('common.selectAll', 'Select All'),
        icon: '✓',
        action: () => {
          handleContextSelectAll()
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
  }, [t, handleContextCut, handleContextCopy, handleContextPaste, handleContextSelectAll])

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
        title={t('chat.attachFiles', 'Add Attachment')}
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
          onCopy={handleCopy}
          onCut={handleCut}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onContextMenu={handleContextMenu}
          suppressContentEditableWarning
          disabled={disabled}
          spellCheck={false}
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
          title={t('emoji.title', 'Emojis')}
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
})

ChatInput.displayName = 'ChatInput'

export default ChatInput
