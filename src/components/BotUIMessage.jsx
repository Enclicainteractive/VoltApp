import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useSocket } from '../contexts/SocketContext'
import './BotUIMessage.css'

const BotButton = ({ button, onClick, disabled }) => {
  const variantClass = `bot-ui-button-${button.variant || 'primary'}`

  return (
    <button
    className={`bot-ui-button ${variantClass}`}
    onClick={() => onClick(button)}
    disabled={disabled || button.disabled}
    >
    {button.emoji && <span className="bot-ui-button-emoji">{button.emoji}</span>}
    <span className="bot-ui-button-label">{button.label}</span>
    </button>
  )
}

const BotInput = ({ input, onSubmit }) => {
  const [value, setValue] = useState(input.value || '')
  const [error, setError] = useState('')

  const handleSubmit = () => {
    if (input.required && !value.trim()) {
      setError('This field is required')
      return
    }
    if (input.minLength && value.length < input.minLength) {
      setError(`Minimum ${input.minLength} characters required`)
      return
    }
    if (input.maxLength && value.length > input.maxLength) {
      setError(`Maximum ${input.maxLength} characters allowed`)
      return
    }
    setError('')
    onSubmit(input.id, value, input.action)
    setValue('')
  }

  return (
    <div className="bot-ui-input-container">
    {input.label && <label className="bot-ui-input-label">{input.label}</label>}
    <div className="bot-ui-input-row">
    <input
    type="text"
    className="bot-ui-input"
    placeholder={input.placeholder}
    value={value}
    onChange={(e) => setValue(e.target.value)}
    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
    disabled={input.disabled}
    />
    <button
    className="bot-ui-input-submit"
    onClick={handleSubmit}
    disabled={input.disabled}
    >
    Send
    </button>
    </div>
    {error && <span className="bot-ui-input-error">{error}</span>}
    </div>
  )
}

const BotSelect = ({ select, onChange, disabled }) => {
  const [value, setValue] = useState('')

  const handleChange = (e) => {
    const newValue = e.target.value
    setValue(newValue)
    if (select.action && newValue) {
      onChange(select.id, newValue, select.action)
    }
  }

  return (
    <div className="bot-ui-select-container">
    {select.placeholder && <label className="bot-ui-select-label">{select.placeholder}</label>}
    <select
    className="bot-ui-select"
    value={value}
    onChange={handleChange}
    disabled={disabled || select.disabled}
    multiple={select.multiple}
    >
    <option value="">{select.placeholder || 'Select an option'}</option>
    {select.options.map((opt, idx) => (
      <option key={idx} value={opt.value}>
      {opt.emoji ? `${opt.emoji} ${opt.label}` : opt.label}
      </option>
    ))}
    </select>
    </div>
  )
}

const BotCanvas = ({ canvas, onPixelClick, disabled }) => {
  const canvasRef = useRef(null)
  const [pixels, setPixels] = useState(canvas.pixels || [])
  const [bulkPixelData, setBulkPixelData] = useState(null)
  const isDragging = useRef(false)
  const lastPos = useRef({ x: -1, y: -1 })

  const gunzip = (bytes) => {
    const CHUNK_SIZE = 65536
    const parts = []
    let offset = 0
    
    while (offset < bytes.length) {
      const chunkSize = Math.min(CHUNK_SIZE, bytes.length - offset)
      parts.push(bytes.slice(offset, offset + chunkSize))
      offset += chunkSize
    }
    
    const combined = new Uint8Array(bytes.length)
    let pos = 0
    for (const part of parts) {
      combined.set(part, pos)
      pos += part.length
    }
    
    const { inflateSync } = window?.pako || null
    if (inflateSync) {
      return inflateSync(combined)
    }
    
    if (typeof DecompressionStream !== 'undefined') {
      return null
    }
    
    throw new Error('No decompression available')
  }

  const decompressBulkPixels = async (bulkPixels) => {
    if (!bulkPixels) return null
    try {
      const binaryString = atob(bulkPixels.data)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      if (bulkPixels.compressed) {
        if (typeof DecompressionStream !== 'undefined') {
          const ds = new DecompressionStream('gzip')
          const writer = ds.writable.getWriter()
          writer.write(bytes)
          writer.close()
          const response = new Response(ds.readable)
          const decompressed = await response.arrayBuffer()
          return new Uint8ClampedArray(decompressed)
        }
        const decompressed = gunzip(bytes)
        if (decompressed) return new Uint8ClampedArray(decompressed)
      }
      return new Uint8ClampedArray(bytes)
    } catch (err) {
      console.error('[BotUI] Failed to decompress bulk pixels:', err)
      return null
    }
  }

  useEffect(() => {
    if (canvas.bulkPixels) {
      decompressBulkPixels(canvas.bulkPixels).then(decompressed => {
        setBulkPixelData(decompressed)
      })
    } else {
      setBulkPixelData(null)
    }
  }, [canvas.bulkPixels])

  useEffect(() => {
    setPixels(canvas.pixels || [])
  }, [canvas.pixels])

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    if (bulkPixelData && bulkPixelData.length > 0) {
      const rgbaArray = new Uint8ClampedArray(bulkPixelData.buffer, bulkPixelData.byteOffset, canvas.width * canvas.height * 4)
      const imageData = new ImageData(rgbaArray, canvas.width, canvas.height)
      ctx.putImageData(imageData, 0, 0)
    } else {
      for (const pixel of pixels) {
        ctx.fillStyle = pixel.color || '#ffffff'
        ctx.fillRect(pixel.x, pixel.y, 1, 1)
      }
    }
  }, [pixels, bulkPixelData, canvas.width, canvas.height])

  const getPixelCoords = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const x = Math.floor((e.clientX - rect.left) * scaleX)
    const y = Math.floor((e.clientY - rect.top) * scaleY)
    return { x, y }
  }

  const handleMouseDown = (e) => {
    if (!canvas.interactive || disabled) return
    isDragging.current = true
    const { x, y } = getPixelCoords(e)
    lastPos.current = { x, y }
    console.log('[BotUI] Canvas mouse down at', x, y)
    onPixelClick(canvas.id, x, y, canvas.action)
  }

  const handleMouseMove = (e) => {
    if (!isDragging.current || !canvas.interactive || disabled) return
    const { x, y } = getPixelCoords(e)
    if (x === lastPos.current.x && y === lastPos.current.y) return
    lastPos.current = { x, y }
    console.log('[BotUI] Canvas drag at', x, y)
    onPixelClick(canvas.id, x, y, canvas.action)
  }

  const handleMouseUp = () => {
    isDragging.current = false
    lastPos.current = { x: -1, y: -1 }
  }

  const handleClick = (e) => {
    if (!canvas.interactive || disabled) return

      const { x, y } = getPixelCoords(e)

      console.log('[BotUI] Canvas clicked at', x, y)
      onPixelClick(canvas.id, x, y, canvas.action)
  }

  return (
    <div className="bot-ui-canvas-container">
    <canvas
      ref={canvasRef}
      width={canvas.width}
      height={canvas.height}
      className="bot-ui-canvas"
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ cursor: canvas.interactive ? 'crosshair' : 'default' }}
    />
    {canvas.interactive && !disabled && (
      <p className="bot-ui-canvas-hint">Click or drag to interact</p>
    )}
    </div>
  )
}

const BotText = ({ text }) => {
  const formatClass = text.format === 'markdown' ? 'bot-ui-text-markdown' : ''

  return (
    <div className={`bot-ui-text ${formatClass}`}>
    {text.format === 'markdown' ? (
      <span dangerouslySetInnerHTML={{ __html: text.content }} />
    ) : (
      <span>{text.content}</span>
    )}
    </div>
  )
}

const BotImage = ({ image, onClick }) => {
  return (
    <div className="bot-ui-image-container">
    <img
    src={image.url}
    alt={image.alt}
    className="bot-ui-image"
    onClick={() => image.action && onClick(image)}
    style={{ cursor: image.action ? 'pointer' : 'default' }}
    />
    </div>
  )
}

const BotDivider = ({ divider }) => {
  return (
    <hr
    className="bot-ui-divider"
    style={{
      borderStyle: divider.style || 'solid',
      borderColor: 'var(--volt-separator)'
    }}
    />
  )
}

const BotSpacer = ({ spacer }) => {
  const sizeMap = {
    small: '4px',
    medium: '12px',
    large: '24px',
    xl: '48px'
  }

  return (
    <div
    className="bot-ui-spacer"
    style={{ height: sizeMap[spacer.size] || sizeMap.medium }}
    />
  )
}

const BotActionRow = ({ row, onComponentAction, disabled }) => {
  return (
    <div className="bot-ui-action-row">
    {row.components.map((component, idx) => {
      switch (component.type) {
        case 'button':
          return (
            <BotButton
            key={component.id || idx}
            button={component}
            onClick={(btn) => onComponentAction('button', btn)}
            disabled={disabled}
            />
          )
        case 'input':
          return (
            <BotInput
            key={component.id || idx}
            input={component}
            onSubmit={(id, value, action) => onComponentAction('input', { id, value, action })}
            disabled={disabled}
            />
          )
        case 'select':
          return (
            <BotSelect
            key={component.id || idx}
            select={component}
            onChange={(id, value, action) => onComponentAction('select', { id, value, action })}
            disabled={disabled}
            />
          )
        default:
          return null
      }
    })}
    </div>
  )
}

const BotUIMessage = ({ ui, messageId, channelId }) => {
  const { socket } = useSocket()
  const [localPixels, setLocalPixels] = useState(ui.canvas?.pixels || [])

  // Update local pixels when the parent component passes new canvas data
  useEffect(() => {
    if (ui?.canvas?.pixels) {
      setLocalPixels(ui.canvas.pixels)
    }
  }, [ui?.canvas?.pixels])

  const handleComponentAction = useCallback((type, data) => {
    console.log('[BotUI] Component action:', type, data)
    if (!socket?.connected) {
      console.log('[BotUI] Socket not connected, cannot send action')
      return
    }

    switch (type) {
      case 'button':
        if (data.confirm && !window.confirm(data.confirm.message)) {
          return
        }
        console.log('[BotUI] Emitting buttonClick:', { messageId, channelId, componentId: data.id, action: data.action })
        socket.emit('ui:buttonClick', {
          messageId,
          channelId,
          componentId: data.id,
          componentType: 'button',
          action: data.action,
          label: data.label,
          value: data.value
        })
        break

      case 'input':
        console.log('[BotUI] Emitting inputSubmit:', { messageId, channelId, componentId: data.id, action: data.action })
        socket.emit('ui:inputSubmit', {
          messageId,
          channelId,
          componentId: data.id,
          componentType: 'input',
          action: data.action,
          value: data.value
        })
        break

      case 'select':
        console.log('[BotUI] Emitting selectChange:', { messageId, channelId, componentId: data.id, action: data.action })
        socket.emit('ui:selectChange', {
          messageId,
          channelId,
          componentId: data.id,
          componentType: 'select',
          action: data.action,
          value: data.value
        })
        break

      default:
        break
    }
  }, [socket, messageId, channelId])

  const handleCanvasPixelClick = useCallback((componentId, x, y, action) => {
    if (!socket?.connected) return

      console.log('[BotUI] Emitting canvasClick:', { messageId, channelId, componentId, x, y, action })
      socket.emit('ui:canvasClick', {
        messageId,
        channelId,
        componentId,
        componentType: 'canvas',
        action,
        x,
        y
      })

      setLocalPixels(prev => [...prev, { x, y, color: '#00ff00' }])
  }, [socket, messageId, channelId])

  if (!ui) return null

    const hasElements = ui.elements?.length > 0 || ui.canvas || ui.components?.length > 0

    if (!hasElements) return null

      return (
        <div className="bot-ui-container">
        {ui.elements?.map((element, idx) => {
          switch (element.type) {
            case 'button':
              return (
                <BotButton
                key={element.id || `btn-${idx}`}
                button={element}
                onClick={(btn) => handleComponentAction('button', btn)}
                />
              )
            case 'input':
              return (
                <BotInput
                key={element.id || `input-${idx}`}
                input={element}
                onSubmit={(id, value, action) => handleComponentAction('input', { id, value, action })}
                />
              )
            case 'select':
              return (
                <BotSelect
                key={element.id || `select-${idx}`}
                select={element}
                onChange={(id, value, action) => handleComponentAction('select', { id, value, action })}
                />
              )
            case 'canvas':
              return (
                <BotCanvas
                key={element.id || `canvas-${idx}`}
                canvas={{ ...element, pixels: localPixels }}
                onPixelClick={handleCanvasPixelClick}
                />
              )
            case 'text':
              return <BotText key={element.id || `text-${idx}`} text={element} />
            case 'image':
              return (
                <BotImage
                key={element.id || `img-${idx}`}
                image={element}
                onClick={(img) => handleComponentAction('image', img)}
                />
              )
            case 'divider':
              return <BotDivider key={element.id || `div-${idx}`} divider={element} />
            case 'spacer':
              return <BotSpacer key={element.id || `space-${idx}`} spacer={element} />
            default:
              return null
          }
        })}

        {ui.canvas && (
          <BotCanvas
          canvas={{ ...ui.canvas, pixels: localPixels }}
          onPixelClick={handleCanvasPixelClick}
          />
        )}

        {ui.components?.map((row, idx) => (
          <BotActionRow
          key={row.id || `row-${idx}`}
          row={row}
          onComponentAction={handleComponentAction}
          />
        ))}
        </div>
      )
}

export default BotUIMessage
