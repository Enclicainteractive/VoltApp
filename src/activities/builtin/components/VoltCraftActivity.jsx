import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Text, Html } from '@react-three/drei'
import * as THREE from 'three'
import GameCanvasShell from './shared/GameCanvasShell'

// VoltCraft - Optimized 3D with Web Worker
// Features:
// - Web Worker for physics and world generation (no lag!)
// - Simplified rendering for smooth performance
// - First-person movement with mouse controls
// - Block placement and breaking system
// - Optimized chunk loading

// Audio system (simplified)
class VoltCraftAudio {
  constructor() {
    this.context = null
    this.volume = 0.7
    this.enabled = true
    this.init()
  }

  init() {
    try {
      this.context = new (window.AudioContext || window.webkitAudioContext)()
    } catch (e) {
      console.warn('Audio initialization failed:', e)
    }
  }

  playTone(frequency, duration = 0.1, type = 'square') {
    if (!this.enabled || !this.context) return

    try {
      const oscillator = this.context.createOscillator()
      const gainNode = this.context.createGain()
      
      oscillator.connect(gainNode)
      gainNode.connect(this.context.destination)
      
      oscillator.frequency.setValueAtTime(frequency, this.context.currentTime)
      oscillator.type = type
      
      gainNode.gain.setValueAtTime(0, this.context.currentTime)
      gainNode.gain.linearRampToValueAtTime(this.volume * 0.1, this.context.currentTime + 0.01)
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + duration)
      
      oscillator.start(this.context.currentTime)
      oscillator.stop(this.context.currentTime + duration)
    } catch (e) {
      console.warn('Audio playback failed:', e)
    }
  }

  play(soundName) {
    const sounds = {
      'block_place': () => this.playTone(440, 0.1, 'square'),
      'block_break': () => this.playTone(220, 0.15, 'sawtooth'),
      'footstep': () => this.playTone(120, 0.05, 'sawtooth'),
      'jump': () => this.playTone(400, 0.2, 'sine')
    }
    
    const sound = sounds[soundName]
    if (sound) sound()
  }

  dispose() {
    if (this.context) {
      this.context.close()
      this.context = null
    }
  }
}

// Simplified chunk renderer
function ChunkRenderer({ chunkData }) {
  const geometry = useMemo(() => {
    if (!chunkData?.blocks?.length) return null

    const geo = new THREE.BufferGeometry()
    const vertices = []
    const colors = []
    const indices = []
    let vertexIndex = 0

    const blockColors = {
      1: [0.5, 0.5, 0.5], // Stone
      2: [0.2, 0.8, 0.2], // Grass  
      3: [0.6, 0.4, 0.2], // Dirt
      7: [0.1, 0.1, 0.1]  // Bedrock
    }

    chunkData.blocks.forEach(({ key, blockType }) => {
      const [x, y, z] = key.split(',').map(Number)
      const worldX = chunkData.x * 16 + x
      const worldY = y
      const worldZ = chunkData.z * 16 + z
      
      const color = blockColors[blockType] || [1, 1, 1]
      
      // Simplified - just render top face for performance
      const faceVertices = [
        [worldX, worldY + 1, worldZ],
        [worldX + 1, worldY + 1, worldZ],
        [worldX + 1, worldY + 1, worldZ + 1],
        [worldX, worldY + 1, worldZ + 1]
      ]
      
      faceVertices.forEach(vertex => {
        vertices.push(...vertex)
        colors.push(...color)
      })
      
      const start = vertexIndex
      indices.push(start, start + 1, start + 2)
      indices.push(start, start + 2, start + 3)
      
      vertexIndex += 4
    })

    if (vertices.length > 0) {
      geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
      geo.setIndex(indices)
      geo.computeVertexNormals()
    }

    return geo
  }, [chunkData])

  if (!geometry) return null

  return (
    <mesh geometry={geometry}>
      <meshLambertMaterial vertexColors={true} />
    </mesh>
  )
}

// First-person controls
function FirstPersonControls({ gameData, worker, audio }) {
  const { camera, gl } = useThree()
  const [keys, setKeys] = useState({})
  const [mouseButtons, setMouseButtons] = useState({})
  const lastMoveTime = useRef(0)

  // Handle keyboard input
  useEffect(() => {
    const handleKeyDown = (e) => {
      setKeys(prev => ({ ...prev, [e.key.toLowerCase()]: true }))
    }

    const handleKeyUp = (e) => {
      setKeys(prev => ({ ...prev, [e.key.toLowerCase()]: false }))
    }

    const handleMouseDown = (e) => {
      setMouseButtons(prev => ({ ...prev, [e.button]: true }))
    }

    const handleMouseUp = (e) => {
      setMouseButtons(prev => ({ ...prev, [e.button]: false }))
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  // Handle mouse look
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (document.pointerLockElement === gl.domElement) {
        const sensitivity = 0.002
        gameData.player.rotation.y -= e.movementX * sensitivity
        gameData.player.rotation.x -= e.movementY * sensitivity
        gameData.player.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, gameData.player.rotation.x))
        
        camera.rotation.copy(gameData.player.rotation)
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    return () => document.removeEventListener('mousemove', handleMouseMove)
  }, [camera, gl.domElement, gameData.player])

  // Handle pointer lock
  useEffect(() => {
    const handleClick = () => {
      gl.domElement.requestPointerLock()
    }

    gl.domElement.addEventListener('click', handleClick)
    return () => gl.domElement.removeEventListener('click', handleClick)
  }, [gl.domElement])

  // Send movement to worker
  useFrame((state, deltaTime) => {
    const now = performance.now()
    if (now - lastMoveTime.current < 16) return // Limit to ~60fps
    lastMoveTime.current = now

    let moved = false

    if (keys['w']) {
      worker.postMessage({
        type: 'movePlayer',
        data: {
          playerId: gameData.player.id,
          direction: 'forward',
          rotation: gameData.player.rotation,
          deltaTime,
          flying: gameData.player.flying
        }
      })
      moved = true
    }
    
    if (keys['s']) {
      worker.postMessage({
        type: 'movePlayer',
        data: {
          playerId: gameData.player.id,
          direction: 'backward',
          rotation: gameData.player.rotation,
          deltaTime,
          flying: gameData.player.flying
        }
      })
      moved = true
    }
    
    if (keys['a']) {
      worker.postMessage({
        type: 'movePlayer',
        data: {
          playerId: gameData.player.id,
          direction: 'left',
          rotation: gameData.player.rotation,
          deltaTime,
          flying: gameData.player.flying
        }
      })
      moved = true
    }
    
    if (keys['d']) {
      worker.postMessage({
        type: 'movePlayer',
        data: {
          playerId: gameData.player.id,
          direction: 'right',
          rotation: gameData.player.rotation,
          deltaTime,
          flying: gameData.player.flying
        }
      })
      moved = true
    }
    
    if (keys[' ']) {
      worker.postMessage({
        type: 'movePlayer',
        data: {
          playerId: gameData.player.id,
          direction: 'jump',
          rotation: gameData.player.rotation,
          deltaTime,
          flying: gameData.player.flying
        }
      })
      audio?.play('jump')
      moved = true
    }
    
    if (keys['shift']) {
      worker.postMessage({
        type: 'movePlayer',
        data: {
          playerId: gameData.player.id,
          direction: 'crouch',
          rotation: gameData.player.rotation,
          deltaTime,
          flying: gameData.player.flying
        }
      })
      moved = true
    }

    if (keys['f'] && gameData.player) {
      gameData.player.flying = !gameData.player.flying
      setKeys(prev => ({ ...prev, 'f': false })) // Prevent rapid toggle
    }

    if (moved && Math.random() < 0.1) {
      audio?.play('footstep')
    }

    // Update camera position
    if (gameData.player.position) {
      camera.position.set(
        gameData.player.position.x,
        gameData.player.position.y + 1.6,
        gameData.player.position.z
      )
    }

    // Handle block breaking/placing
    if (mouseButtons[0] || mouseButtons[2]) {
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera({ x: 0, y: 0 }, camera)
      
      const direction = raycaster.ray.direction
      const origin = camera.position.clone()
      
      for (let i = 5; i < 50; i++) { // Start further out, check fewer points
        const testPos = origin.clone().add(direction.clone().multiplyScalar(i * 0.1))
        
        worker.postMessage({
          type: 'blockAction',
          data: {
            x: Math.floor(testPos.x),
            y: Math.floor(testPos.y),
            z: Math.floor(testPos.z),
            blockType: mouseButtons[0] ? 0 : 1, // Break or place stone
            action: mouseButtons[0] ? 'break' : 'place'
          }
        })
        
        setMouseButtons(prev => ({ ...prev, 0: false, 2: false }))
        
        if (mouseButtons[0]) {
          audio?.play('block_break')
        } else {
          audio?.play('block_place')
        }
        break
      }
    }
  })

  return null
}

// 3D Scene component
function VoltCraftScene({ gameData, worker, audio }) {
  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[10, 20, 10]}
        intensity={0.8}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      
      {/* Sky */}
      <mesh>
        <sphereGeometry args={[500, 16, 16]} />
        <meshBasicMaterial color={0x87CEEB} side={THREE.BackSide} />
      </mesh>
      
      {/* Controls */}
      <FirstPersonControls 
        gameData={gameData}
        worker={worker}
        audio={audio}
      />
      
      {/* Render chunks */}
      {gameData.chunks.map(chunk => (
        <ChunkRenderer 
          key={`${chunk.x},${chunk.z}`} 
          chunkData={chunk}
        />
      ))}
    </>
  )
}

// UI overlay
function VoltCraftUI({ gameData }) {
  if (!gameData.player) return null

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
      {/* Crosshair */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        color: 'white',
        fontSize: '20px',
        fontWeight: 'bold',
        textShadow: '2px 2px 4px rgba(0,0,0,0.8)'
      }}>
        +
      </div>
      
      {/* Debug info */}
      <div style={{
        position: 'absolute',
        top: '20px',
        right: '20px',
        background: 'rgba(0,0,0,0.8)',
        color: 'white',
        padding: '10px',
        fontSize: '12px',
        fontFamily: 'monospace',
        borderRadius: '5px'
      }}>
        <div>X: {gameData.player.position?.x?.toFixed(1) || 0}</div>
        <div>Y: {gameData.player.position?.y?.toFixed(1) || 0}</div>
        <div>Z: {gameData.player.position?.z?.toFixed(1) || 0}</div>
        <div>Flying: {gameData.player.flying ? 'Yes' : 'No'}</div>
        <div>Chunks: {gameData.chunks.length}</div>
      </div>
      
      {/* Instructions */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '20px',
        background: 'rgba(0,0,0,0.8)',
        color: 'white',
        padding: '10px',
        fontSize: '12px',
        borderRadius: '5px'
      }}>
        <div>🖱️ Click to capture mouse</div>
        <div>WASD: Move</div>
        <div>Space: Jump/Fly up</div>
        <div>Shift: Fly down</div>
        <div>F: Toggle flying</div>
        <div>Left click: Break block</div>
        <div>Right click: Place block</div>
      </div>
    </div>
  )
}

// Main activity component
const VoltCraftActivity = ({ sdk, session, currentUser, participants }) => {
  const [gameData, setGameData] = useState({
    phase: 'initializing',
    player: {
      id: currentUser.id,
      username: currentUser.username,
      position: { x: 0, y: 70, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      flying: false
    },
    chunks: [],
    players: {}
  })

  const workerRef = useRef(null)
  const audioRef = useRef(null)

  // Initialize worker and systems
  useEffect(() => {
    audioRef.current = new VoltCraftAudio()
    
    // Create worker
    workerRef.current = new Worker('/voltcraft-worker.js')
    
    // Handle worker messages
    workerRef.current.onmessage = (e) => {
      const { type, data } = e.data
      
      switch (type) {
        case 'initialized':
          // Add player to worker
          workerRef.current.postMessage({
            type: 'addPlayer',
            data: {
              id: currentUser.id,
              username: currentUser.username,
              position: { x: 0, y: 70, z: 0 }
            }
          })
          break
          
        case 'playerAdded':
          setGameData(prev => ({
            ...prev,
            phase: 'playing'
          }))
          break
          
        case 'update':
          if (!data?.players || typeof data.players !== 'object') break
          setGameData(prev => ({
            ...prev,
            players: data.players,
            player: {
              ...prev.player,
              ...(data.players[currentUser.id] || {})
            }
          }))
          break
          
        case 'chunkData':
          if (!Array.isArray(data?.chunks)) break
          setGameData(prev => ({
            ...prev,
            chunks: data.chunks
          }))
          break
          
        case 'blockActionResult':
          if (data.success) {
            // Request updated chunk data around the changed block
            workerRef.current.postMessage({
              type: 'getChunkData',
              data: {
                centerX: data.x,
                centerZ: data.z,
                range: 1,
                requestId: Date.now()
              }
            })
          }
          break
          
        case 'error':
          console.error('Worker error:', data.error)
          break
      }
    }
    
    // Initialize worker
    workerRef.current.postMessage({
      type: 'initialize',
      data: {
        seed: Math.random()
      }
    })

    return () => {
      try { audioRef.current?.dispose() } catch {}
      try { workerRef.current?.terminate() } catch {}
    }
  }, [currentUser])

  // Game update loop
  useEffect(() => {
    let animationFrame

    const gameLoop = (currentTime) => {
      if (workerRef.current && gameData.phase === 'playing') {
        const deltaTime = 1/60 // Fixed timestep
        
        workerRef.current.postMessage({
          type: 'update',
          data: { deltaTime }
        })
        
        // Request chunk data around player
        if (gameData.player.position) {
          workerRef.current.postMessage({
            type: 'getChunkData',
            data: {
              centerX: gameData.player.position.x,
              centerZ: gameData.player.position.z,
              range: 2,
              requestId: currentTime
            }
          })
        }
      }
      
      animationFrame = requestAnimationFrame(gameLoop)
    }

    if (gameData.phase === 'playing') {
      animationFrame = requestAnimationFrame(gameLoop)
    }

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame)
      }
    }
  }, [gameData.phase, gameData.player.position])

  if (gameData.phase === 'initializing') {
    return (
      <GameCanvasShell
        title="VoltCraft"
        subtitle="Loading..."
        skin="noir"
      >
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'white'
        }}>
          <div style={{ fontSize: '24px', marginBottom: '20px' }}>Loading VoltCraft...</div>
          <div style={{ fontSize: '14px', opacity: 0.7 }}>Initializing world generator...</div>
        </div>
      </GameCanvasShell>
    )
  }

  return (
    <GameCanvasShell
      title="VoltCraft"
      subtitle={`3D Voxel World • ${participants?.length || 0} players`}
      status="Optimized with Web Workers"
      skin="noir"
      layout="stretch"
    >
      <Canvas
        camera={{ position: [0, 70, 0], fov: 75 }}
        style={{ width: '100%', height: '100%' }}
        onCreated={({ gl }) => {
          gl.setPixelRatio(Math.min(window.devicePixelRatio, 1)) // Limit pixel ratio for performance
        }}
      >
        <VoltCraftScene 
          gameData={gameData}
          worker={workerRef.current}
          audio={audioRef.current}
        />
      </Canvas>
      
      <VoltCraftUI gameData={gameData} />
    </GameCanvasShell>
  )
}

export default VoltCraftActivity
