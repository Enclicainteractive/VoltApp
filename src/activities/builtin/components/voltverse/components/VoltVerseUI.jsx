import { useRef, useState, useCallback, useMemo } from 'react'
import {
  Mic,
  MicOff,
  Settings,
  FolderOpen,
  User,
  Box,
  Code,
  Trash2,
  Save,
  Grid3X3,
  Move,
  RotateCw,
  Scale,
  Play,
  Send,
  Copy,
  Undo2,
  Redo2,
  Sparkles,
  Zap,
  MapPin
} from 'lucide-react'
import { useStore } from '../stores/voltverseStore'
import './VoltVerseUI.css'

const SHADER_LIBRARY = {
  hologram: {
    label: 'Hologram',
    code: `
varying vec2 vUv;
varying vec3 vNormal;
uniform float time;
uniform vec3 color;

void main() {
  float scan = sin((vUv.y + time * 0.8) * 24.0) * 0.12 + 0.88;
  float rim = pow(1.0 - max(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)), 0.0), 1.5);
  gl_FragColor = vec4(color * scan + rim * 0.35, 0.82);
}
`.trim()
  },
  pulse: {
    label: 'Pulse',
    code: `
varying vec2 vUv;
uniform float time;
uniform vec3 color;

void main() {
  float pulse = 0.6 + 0.4 * sin(time * 4.0 + vUv.x * 18.0);
  gl_FragColor = vec4(color * pulse, 1.0);
}
`.trim()
  }
}

const OBJECT_TYPES = [
  { type: 'cube', label: 'Cube', icon: Box },
  { type: 'sphere', label: 'Sphere', icon: Sparkles },
  { type: 'cylinder', label: 'Cylinder', icon: Box },
  { type: 'cone', label: 'Cone', icon: Box },
  { type: 'portal', label: 'Portal', icon: Sparkles },
  { type: 'trigger', label: 'Trigger', icon: Zap },
  { type: 'spawn', label: 'Spawn', icon: MapPin }
]

const AVATAR_PRESETS = [
  { name: 'Scout', color: '#22c55e' },
  { name: 'Nova', color: '#8b5cf6' },
  { name: 'Forge', color: '#f97316' },
  { name: 'Ghost', color: '#38bdf8' }
]

const VoltVerseUI = ({ mode, onRoomFileLoad, onExportRoom }) => {
  const [chatInput, setChatInput] = useState('')
  const [shaderCode, setShaderCode] = useState(SHADER_LIBRARY.hologram.code)
  const fileInputRef = useRef()

  const {
    connected,
    players,
    localPlayerId,
    voiceChatActive,
    editorMode,
    transformTool,
    selectedObject,
    localAvatar,
    setVoiceChatActive,
    setEditorMode,
    setTransformTool,
    setLocalAvatar,
    addWorldObject,
    addSpawnPoint,
    addPortal,
    addTrigger,
    updateWorldObject,
    removeWorldObject,
    duplicateWorldObject,
    undo,
    redo,
    chatMessages,
    addChatMessage
  } = useStore()

  const selectedObjectLabel = selectedObject?.label || selectedObject?.name || selectedObject?.type || 'Nothing selected'

  const handleMicToggle = useCallback(() => {
    setVoiceChatActive(!voiceChatActive)
  }, [voiceChatActive, setVoiceChatActive])

  const handleSendChat = useCallback(() => {
    if (!chatInput.trim()) return
    addChatMessage({
      id: Date.now(),
      sender: 'You',
      content: chatInput,
      timestamp: new Date().toISOString()
    })
    setChatInput('')
  }, [chatInput, addChatMessage])

  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0]
    if (file) onRoomFileLoad(file)
  }, [onRoomFileLoad])

  const handleAddEntity = useCallback((type) => {
    if (type === 'spawn') {
      addSpawnPoint({ position: [0, 0, -2] })
      return
    }
    if (type === 'portal') {
      addPortal({})
      return
    }
    if (type === 'trigger') {
      addTrigger({
        actions: [{ type: 'message', message: 'Trigger activated' }]
      })
      return
    }
    addWorldObject({
      type,
      label: type.charAt(0).toUpperCase() + type.slice(1)
    })
  }, [addPortal, addSpawnPoint, addTrigger, addWorldObject])

  const selectedPlayer = players.get(localPlayerId)

  const shaderActionsDisabled = selectedObject?.entityType !== 'object'

  const editorHint = useMemo(() => {
    if (editorMode === 'level') return 'Shortcuts: W move, R rotate, T scale, Del delete, Ctrl/Cmd+D duplicate'
    if (editorMode === 'avatar') return 'Choose a preset to update your live avatar identity in VoltVerse'
    if (editorMode === 'shader') return 'Apply shader code to the selected object to preview custom materials'
    return 'Click the scene to lock pointer and move with WASD'
  }, [editorMode])

  return (
    <div className="voltverse-ui">
      <div className="voltverse-top-bar">
        <div className="voltverse-logo">
          <span className="logo-text">VoltVerse</span>
          <span className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
            {connected ? `${players.size} Online` : 'Connecting...'}
          </span>
        </div>

        <div className="voltverse-toolbar">
          <button className={`tool-btn ${voiceChatActive ? 'active' : ''}`} onClick={handleMicToggle} title={voiceChatActive ? 'Mute' : 'Unmute'}>
            {voiceChatActive ? <Mic size={18} /> : <MicOff size={18} />}
          </button>
          <button className="tool-btn" onClick={() => fileInputRef.current?.click()} title="Load World">
            <FolderOpen size={18} />
          </button>
          <button className="tool-btn" onClick={onExportRoom} title="Save World">
            <Save size={18} />
          </button>
          <button className="tool-btn" onClick={undo} title="Undo">
            <Undo2 size={18} />
          </button>
          <button className="tool-btn" onClick={redo} title="Redo">
            <Redo2 size={18} />
          </button>
          <button className="tool-btn" title={editorHint}>
            <Settings size={18} />
          </button>
        </div>

        <div className="editor-badge">
          {editorMode === 'none' ? 'PLAY MODE' : `${editorMode.toUpperCase()} MODE`}
        </div>
      </div>

      {mode === 'desktop' && (
        <>
          <div className="voltverse-left-toolbar">
            <button className={`sidebar-btn ${editorMode === 'level' ? 'active' : ''}`} onClick={() => setEditorMode(editorMode === 'level' ? 'none' : 'level')} title="Level Editor">
              <Grid3X3 size={24} />
            </button>
            <button className={`sidebar-btn ${editorMode === 'avatar' ? 'active' : ''}`} onClick={() => setEditorMode(editorMode === 'avatar' ? 'none' : 'avatar')} title="Avatar Editor">
              <User size={24} />
            </button>
            <button className={`sidebar-btn ${editorMode === 'shader' ? 'active' : ''}`} onClick={() => setEditorMode(editorMode === 'shader' ? 'none' : 'shader')} title="Shader Editor">
              <Code size={24} />
            </button>
          </div>

          <div className="voltverse-chat-panel">
            <div className="chat-messages">
              {chatMessages.map((msg) => (
                <div key={msg.id} className="chat-message">
                  <span className="sender">{msg.sender}:</span>
                  <span className="content">{msg.content}</span>
                </div>
              ))}
            </div>
            <div className="chat-input-wrapper">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                placeholder="Chat..."
              />
              <button onClick={handleSendChat}><Send size={16} /></button>
            </div>
          </div>

          <div className="voltverse-player-list">
            <div className="player-list-header">
              Players ({players.size})
            </div>
            <div className="player-list-items">
              {Array.from(players.values()).map((player) => (
                <div key={player.id} className={`player-item ${player.id === localPlayerId ? 'is-local' : ''}`}>
                  <div className="player-avatar" style={{ background: player.color || '#6366f1' }} />
                  <div className="player-info">
                    <span className="player-name">{player.name || 'Unknown'}</span>
                    <span className="player-status">
                      {player.id === localPlayerId ? `You ${selectedPlayer?.position ? `(${selectedPlayer.position.map((value) => value.toFixed(1)).join(', ')})` : ''}` : player.status || 'Online'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {editorMode !== 'none' && (
            <div className="voltverse-editor-panel">
              <div className="editor-tabs">
                <button className={`tab ${editorMode === 'level' ? 'active' : ''}`} onClick={() => setEditorMode('level')}>Level</button>
                <button className={`tab ${editorMode === 'avatar' ? 'active' : ''}`} onClick={() => setEditorMode('avatar')}>Avatar</button>
                <button className={`tab ${editorMode === 'shader' ? 'active' : ''}`} onClick={() => setEditorMode('shader')}>Shaders</button>
              </div>

              {editorMode === 'level' && (
                <div className="editor-content">
                  <div className="editor-tools">
                    <button className={`tool-btn ${transformTool === 'move' ? 'active' : ''}`} onClick={() => setTransformTool('move')} title="Move">
                      <Move size={16} />
                    </button>
                    <button className={`tool-btn ${transformTool === 'rotate' ? 'active' : ''}`} onClick={() => setTransformTool('rotate')} title="Rotate">
                      <RotateCw size={16} />
                    </button>
                    <button className={`tool-btn ${transformTool === 'scale' ? 'active' : ''}`} onClick={() => setTransformTool('scale')} title="Scale">
                      <Scale size={16} />
                    </button>
                    <button className="tool-btn" onClick={() => selectedObject?.entityType === 'object' && duplicateWorldObject(selectedObject.id)} title="Duplicate">
                      <Copy size={16} />
                    </button>
                    <button className="tool-btn" onClick={() => selectedObject?.entityType === 'object' && removeWorldObject(selectedObject.id)} title="Delete">
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="object-palette">
                    <div className="palette-title">Scene Library</div>
                    <div className="palette-grid">
                      {OBJECT_TYPES.map(({ type, label, icon: Icon }) => (
                        <button key={type} className="palette-item" onClick={() => handleAddEntity(type)}>
                          <Icon size={20} />
                          <span>{label}</span>
                        </button>
                      ))}
                    </div>
                    <div className="palette-title" style={{ marginTop: 14 }}>Selection</div>
                    <div className="library-item" style={{ display: 'block', margin: 0 }}>
                      {selectedObjectLabel}
                    </div>
                  </div>
                </div>
              )}

              {editorMode === 'avatar' && (
                <div className="editor-content">
                  <div className="avatar-presets">
                    {AVATAR_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        className="preset-btn"
                        onClick={() => setLocalAvatar({ ...(localAvatar || {}), preset: preset.name, color: preset.color })}
                      >
                        <User size={20} />
                        <span>{preset.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {editorMode === 'shader' && (
                <div className="editor-content shader-editor">
                  <div className="shader-code">
                    <textarea
                      value={shaderCode}
                      onChange={(e) => setShaderCode(e.target.value)}
                      placeholder="// GLSL fragment shader"
                      rows={8}
                    />
                  </div>
                  <div className="shader-actions">
                    <button
                      className="action-btn primary"
                      disabled={shaderActionsDisabled}
                      onClick={() => selectedObject?.entityType === 'object' && updateWorldObject(selectedObject.id, {
                        material: {
                          ...(selectedObject.material || {}),
                          shader: true,
                          color: selectedObject.material?.color || '#6366f1',
                          fragmentShader: shaderCode
                        }
                      })}
                    >
                      <Play size={14} /> Apply
                    </button>
                    <button
                      className="action-btn"
                      disabled={shaderActionsDisabled}
                      onClick={() => selectedObject?.entityType === 'object' && updateWorldObject(selectedObject.id, {
                        material: {
                          ...(selectedObject.material || {}),
                          shader: false
                        }
                      })}
                    >
                      <Save size={14} /> Reset
                    </button>
                  </div>
                  <div className="shader-library">
                    <div className="library-title">Shader Library</div>
                    {Object.entries(SHADER_LIBRARY).map(([key, shader]) => (
                      <button key={key} className="library-item" onClick={() => setShaderCode(shader.code)}>{shader.label}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".voltroom,.json"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />
    </div>
  )
}

export default VoltVerseUI
