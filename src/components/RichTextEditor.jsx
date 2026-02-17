import React, { useRef, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import '../assets/styles/RichTextEditor.css'

const RichTextEditor = ({ 
  value, 
  onChange, 
  placeholder, 
  onSubmit,
  disabled,
  attachments = [],
  onAttachClick,
  onEmojiClick,
  className = '',
  minHeight = '44px',
  maxHeight = '200px'
}) => {
  const editorRef = useRef(null)
  const containerRef = useRef(null)
  const [isFocused, setIsFocused] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerText !== value) {
      if (document.activeElement !== editorRef.current) {
        editorRef.current.innerText = value || ''
      }
    }
  }, [value])

  const handleInput = (e) => {
    const text = e.target.innerText
    onChange(text)
  }

  const handlePaste = (e) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && onSubmit) {
      e.preventDefault()
      onSubmit()
    }
    if (e.key === 'b' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      wrapText('**', '**')
    }
    if (e.key === 'i' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      wrapText('*', '*')
    }
    if (e.key === 'u' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      wrapText('~~', '~~')
    }
  }

  const wrapText = (before, after) => {
    const selection = window.getSelection()
    if (!selection.rangeCount) return
    
    const range = selection.getRangeAt(0)
    const selectedText = range.toString()
    
    const newText = before + selectedText + after
    document.execCommand('insertText', false, newText)
    onChange(editorRef.current.innerText)
  }

  const handleFocus = () => {
    setIsFocused(true)
  }

  const handleBlur = () => {
    setIsFocused(false)
    if (editorRef.current) {
      onChange(editorRef.current.innerText)
    }
  }

  const isEmpty = !value || value.trim() === ''
  const canSubmit = !isEmpty || attachments.length > 0

  return (
    <div 
      ref={containerRef}
      className={`rich-text-editor ${className} ${isFocused ? 'focused' : ''} ${isEmpty ? 'empty' : ''}`}
    >
      <div className="rich-text-toolbar">
        <button 
          type="button" 
          className="toolbar-btn" 
          title="Add Attachment (or use +)"
          onClick={onAttachClick}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        
        <div className="toolbar-divider" />
        
        <button 
          type="button" 
          className="toolbar-btn" 
          title="Bold (Ctrl+B)"
          onClick={() => wrapText('**', '**')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/>
          </svg>
        </button>
        
        <button 
          type="button" 
          className="toolbar-btn" 
          title="Italic (Ctrl+I)"
          onClick={() => wrapText('*', '*')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z"/>
          </svg>
        </button>
        
        <button 
          type="button" 
          className="toolbar-btn" 
          title="Strikethrough (Ctrl+U)"
          onClick={() => wrapText('~~', '~~')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 19h4v-3h-4v3zM5 4v3h5v3h4V7h5V4H5zM3 14h18v-2H3v2z"/>
          </svg>
        </button>

        <button 
          type="button" 
          className="toolbar-btn" 
          title="Inline Code"
          onClick={() => wrapText('`', '`')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/>
          </svg>
        </button>

        <button 
          type="button" 
          className="toolbar-btn" 
          title="Code Block"
          onClick={() => wrapText('```\n', '\n```')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H4V5h16v14zM6 17h12v-2H6v2zm0-4h12v-2H6v2zm0-4h12V7H6v2z"/>
          </svg>
        </button>

        <button 
          type="button" 
          className="toolbar-btn" 
          title="Link"
          onClick={() => wrapText('[', '](url)')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
          </svg>
        </button>

        <button 
          type="button" 
          className="toolbar-btn" 
          title="Spoiler"
          onClick={() => wrapText('||', '||')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
          </svg>
        </button>
        
        <div className="toolbar-spacer" />
        
        <button 
          type="button" 
          className={`toolbar-btn ${showPreview ? 'active' : ''}`}
          title="Preview"
          onClick={() => setShowPreview(!showPreview)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </button>
        
        <button 
          type="button" 
          className="toolbar-btn"
          title="Emoji"
          onClick={onEmojiClick}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
            <line x1="9" y1="9" x2="9.01" y2="9" />
            <line x1="15" y1="9" x2="15.01" y2="9" />
          </svg>
        </button>
      </div>

      <div className="rich-text-content" style={{ minHeight, maxHeight }}>
        {showPreview && value ? (
          <div className="rich-text-preview markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {value}
            </ReactMarkdown>
          </div>
        ) : (
          <div
            ref={editorRef}
            contentEditable
            className="rich-text-input"
            placeholder={placeholder}
            onInput={handleInput}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            onBlur={handleBlur}
            suppressContentEditableWarning
            disabled={disabled}
            spellCheck="false"
          />
        )}
      </div>

      {value && (
        <div className="rich-text-live-preview markdown-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {value}
          </ReactMarkdown>
        </div>
      )}
      
      <div className="rich-text-actions">
        <button 
          type="button" 
          className="send-btn"
          disabled={!canSubmit}
          onClick={onSubmit}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default RichTextEditor
