import React, { useRef, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import '../assets/styles/RichTextEditor.css'

const BioEditor = ({ 
  value, 
  onChange, 
  placeholder, 
  maxLength = 500,
  onSubmit,
  className = ''
}) => {
  const editorRef = useRef(null)
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
    const text = e.target.innerText.slice(0, maxLength)
    onChange(text)
  }

  const handlePaste = (e) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    const currentText = editorRef.current.innerText
    const newText = (currentText + text).slice(0, maxLength)
    editorRef.current.innerText = newText
    onChange(newText)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && onSubmit) {
      e.preventDefault()
      onSubmit()
    }
  }

  const handleFocus = () => {
    setIsFocused(true)
  }

  const handleBlur = () => {
    setIsFocused(false)
    if (editorRef.current) {
      onChange(editorRef.current.innerText.slice(0, maxLength))
    }
  }

  return (
    <div className={`rich-text-editor bio-input ${className} ${isFocused ? 'focused' : ''}`}>
      <div className="rich-text-toolbar">
        <button 
          type="button" 
          className="toolbar-btn" 
          title="Bold (Ctrl+B)"
          onClick={() => {
            const selection = window.getSelection()
            if (!selection.rangeCount) return
            const range = selection.getRangeAt(0)
            const selectedText = range.toString()
            const newText = '**' + selectedText + '**'
            document.execCommand('insertText', false, newText)
            onChange(editorRef.current.innerText)
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/>
          </svg>
        </button>
        
        <button 
          type="button" 
          className="toolbar-btn" 
          title="Italic (Ctrl+I)"
          onClick={() => {
            const selection = window.getSelection()
            if (!selection.rangeCount) return
            const range = selection.getRangeAt(0)
            const selectedText = range.toString()
            const newText = '*' + selectedText + '*'
            document.execCommand('insertText', false, newText)
            onChange(editorRef.current.innerText)
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z"/>
          </svg>
        </button>
        
        <button 
          type="button" 
          className="toolbar-btn" 
          title="Strikethrough"
          onClick={() => {
            const selection = window.getSelection()
            if (!selection.rangeCount) return
            const range = selection.getRangeAt(0)
            const selectedText = range.toString()
            const newText = '~~' + selectedText + '~~'
            document.execCommand('insertText', false, newText)
            onChange(editorRef.current.innerText)
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 19h4v-3h-4v3zM5 4v3h5v3h4V7h5V4H5zM3 14h18v-2H3v2z"/>
          </svg>
        </button>

        <button 
          type="button" 
          className="toolbar-btn" 
          title="Inline Code"
          onClick={() => {
            const selection = window.getSelection()
            if (!selection.rangeCount) return
            const range = selection.getRangeAt(0)
            const selectedText = range.toString()
            const newText = '`' + selectedText + '`'
            document.execCommand('insertText', false, newText)
            onChange(editorRef.current.innerText)
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/>
          </svg>
        </button>

        <button 
          type="button" 
          className="toolbar-btn" 
          title="Code Block"
          onClick={() => {
            const selection = window.getSelection()
            if (!selection.rangeCount) return
            const range = selection.getRangeAt(0)
            const selectedText = range.toString()
            const newText = '```\n' + selectedText + '\n```'
            document.execCommand('insertText', false, newText)
            onChange(editorRef.current.innerText)
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H4V5h16v14zM6 17h12v-2H6v2zm0-4h12v-2H6v2zm0-4h12V7H6v2z"/>
          </svg>
        </button>

        <button 
          type="button" 
          className="toolbar-btn" 
          title="Link"
          onClick={() => {
            const selection = window.getSelection()
            if (!selection.rangeCount) return
            const range = selection.getRangeAt(0)
            const selectedText = range.toString()
            const newText = '[' + selectedText + '](url)'
            document.execCommand('insertText', false, newText)
            onChange(editorRef.current.innerText)
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
          </svg>
        </button>

        <button 
          type="button" 
          className="toolbar-btn" 
          title="Spoiler"
          onClick={() => {
            const selection = window.getSelection()
            if (!selection.rangeCount) return
            const range = selection.getRangeAt(0)
            const selectedText = range.toString()
            const newText = '||' + selectedText + '||'
            document.execCommand('insertText', false, newText)
            onChange(editorRef.current.innerText)
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
          </svg>
        </button>
        
        <div className="toolbar-spacer" />
        
        <span className="char-count">{value?.length || 0}/{maxLength}</span>
        
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
      </div>

      <div className="rich-text-content" style={{ minHeight: '100px', maxHeight: '200px' }}>
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
            spellCheck="false"
          />
        )}
      </div>

      {value && !showPreview && (
        <div className="rich-text-live-preview markdown-body">
          <span className="preview-label">Live Preview:</span>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {value}
          </ReactMarkdown>
        </div>
      )}
    </div>
  )
}

export default BioEditor
