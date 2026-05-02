import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Text, Html, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import GameCanvasShell from './shared/GameCanvasShell'

// MiniGolf - Optimized 3D with Web Worker and Lobby System
// Features:
// - Web Worker for physics calculations (no lag!)
// - Lobby system with player join/leave
// - Course voting and color selection
// - Optimized rendering for smooth performance
// - Multiple themed courses

// Audio system (simplified)
class MiniGolfAudio {
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

  playTone(frequency, duration = 0.1, type = 'sine') {
    if (!this.enabled || !this.context) return

    try {
      const oscillator = this.context.createOscillator()
      const gainNode = this.context.createGain()
      
      oscillator.connect(gainNode)
      gainNode.connect(this.context.destination)
      
      oscillator.frequency.setValueAtTime(frequency, this.context.currentTime)
      oscillator.type = type
      
      gainNode.gain.setValueAtTime(0, this.context.currentTime)
      gainNode.gain.linearRampToValueAtTime(this.volume * 0.2, this.context.currentTime + 0.01)
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + duration)
      
      oscillator.start(this.context.currentTime)
      oscillator.stop(this.context.currentTime + duration)
    } catch (e) {
      console.warn('Audio playback failed:', e)
    }
  }

  play(soundName) {
    const sounds = {
      'putt': () => this.playTone(200, 0.1, 'square'),
      'hole-in': () => this.playTone(660, 0.5, 'sine'),
      'wall-hit': () => this.playTone(300, 0.08, 'sawtooth'),
      'join': () => this.playTone(440, 0.2, 'sine'),
      'ready': () => this.playTone(550, 0.15, 'square'),
      'start': () => this.playTone(880, 0.3, 'sine')
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

// Available player colors
const PLAYER_COLORS = [
  { name: 'White', value: 0xFFFFFF, hex: '#FFFFFF' },
  { name: 'Red', value: 0xFF4444, hex: '#FF4444' },
  { name: 'Blue', value: 0x4444FF, hex: '#4444FF' },
  { name: 'Green', value: 0x44FF44, hex: '#44FF44' },
  { name: 'Yellow', value: 0xFFFF44, hex: '#FFFF44' },
  { name: 'Purple', value: 0xFF44FF, hex: '#FF44FF' },
  { name: 'Orange', value: 0xFF8844, hex: '#FF8844' },
  { name: 'Cyan', value: 0x44FFFF, hex: '#44FFFF' }
]

// Course definitions with preview info
const COURSES = {
  1: {
    name: "Garden Valley",
    par: 3,
    theme: "Outdoor",
    description: "A peaceful course with gentle ramps and sand traps",
    difficulty: "Easy",
    preview: "🌱"
  },
  2: {
    name: "Neon Circuit", 
    par: 4,
    theme: "Cyberpunk",
    description: "High-tech course with moving platforms and lasers",
    difficulty: "Medium",
    preview: "⚡"
  },
  3: {
    name: "Volcanic Valley",
    par: 5,
    theme: "Volcanic",
    description: "Dangerous lava pits and narrow bridges",
    difficulty: "Hard",
    preview: "🌋"
  }
}

// Lobby component
function LobbyUI({ gameData, worker, audio, currentUser }) {
  const [selectedColor, setSelectedColor] = useState(0xFFFFFF)
  const [selectedCourse, setSelectedCourse] = useState(1)
  
  const players = gameData?.players || {}
  const currentPlayer = players[currentUser.id] || null
  const playerList = Object.values(players)
  const readyCount = playerList.filter(p => p.isReady && !p.isSpectator).length
  const totalCount = playerList.filter(p => !p.isSpectator).length

  const handleColorChange = useCallback((color) => {
    setSelectedColor(color)
    worker?.postMessage({
      type: 'setPlayerColor',
      data: {
        playerId: currentUser.id,
        color: color
      }
    })
    audio?.play('ready')
  }, [worker, currentUser.id, audio])

  const handleReadyToggle = useCallback(() => {
    worker?.postMessage({
      type: 'setPlayerReady',
      data: {
        playerId: currentUser.id,
        ready: !currentPlayer?.isReady
      }
    })
    audio?.play(currentPlayer?.isReady ? 'ready' : 'join')
  }, [worker, currentUser.id, currentPlayer, audio])

  const handleCourseVote = useCallback((courseId) => {
    setSelectedCourse(courseId)
    worker?.postMessage({
      type: 'voteForCourse',
      data: {
        playerId: currentUser.id,
        courseId: courseId
      }
    })
    audio?.play('ready')
  }, [worker, currentUser.id, audio])

  return (
    <div style={{ 
      position: 'absolute', 
      inset: 0, 
      background: 'linear-gradient(135deg, rgba(34,139,34,0.9) 0%, rgba(0,100,0,0.8) 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      
      {/* Title */}
      <div style={{
        fontSize: '32px',
        fontWeight: 'bold',
        color: 'white',
        marginBottom: '30px',
        textShadow: '2px 2px 4px rgba(0,0,0,0.8)'
      }}>
        🏌️ Mini Golf Lobby
      </div>

      {/* Main content area */}
      <div style={{
        display: 'flex',
        gap: '30px',
        maxWidth: '1200px',
        width: '100%'
      }}>
        
        {/* Player list */}
        <div style={{
          background: 'rgba(0,0,0,0.8)',
          borderRadius: '15px',
          padding: '20px',
          minWidth: '300px'
        }}>
          <h3 style={{ color: 'white', marginTop: 0, marginBottom: '15px' }}>
            Players ({totalCount}/4)
          </h3>
          
          {playerList.map(player => (
            <div 
              key={player.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px',
                background: player.id === currentUser.id ? 'rgba(255,255,255,0.1)' : 'transparent',
                borderRadius: '8px',
                marginBottom: '8px'
              }}
            >
              {/* Color indicator */}
              <div style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                backgroundColor: `#${player.color.toString(16).padStart(6, '0')}`,
                border: '2px solid white'
              }} />
              
              {/* Player name */}
              <div style={{ 
                color: 'white', 
                flex: 1,
                fontWeight: player.id === currentUser.id ? 'bold' : 'normal'
              }}>
                {player.username} {player.id === currentUser.id && '(You)'}
              </div>
              
              {/* Ready status */}
              <div style={{
                color: player.isReady ? '#00FF00' : '#FF6666',
                fontSize: '12px',
                fontWeight: 'bold'
              }}>
                {player.isSpectator ? 'SPEC' : player.isReady ? 'READY' : 'NOT READY'}
              </div>
            </div>
          ))}
          
          {/* Ready status summary */}
          <div style={{
            marginTop: '15px',
            padding: '10px',
            background: 'rgba(255,255,255,0.1)',
            borderRadius: '8px',
            color: 'white',
            textAlign: 'center'
          }}>
            {readyCount === totalCount && totalCount > 0 
              ? '🎉 All players ready!' 
              : `${readyCount}/${totalCount} players ready`}
          </div>
        </div>

        {/* Settings panel */}
        <div style={{
          background: 'rgba(0,0,0,0.8)',
          borderRadius: '15px',
          padding: '20px',
          minWidth: '400px',
          flex: 1
        }}>
          
          {/* Color selection */}
          <div style={{ marginBottom: '25px' }}>
            <h4 style={{ color: 'white', marginBottom: '10px' }}>Choose Your Color:</h4>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {PLAYER_COLORS.map(color => (
                <div
                  key={color.value}
                  onClick={() => handleColorChange(color.value)}
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    backgroundColor: color.hex,
                    border: selectedColor === color.value ? '3px solid white' : '2px solid #666',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  title={color.name}
                />
              ))}
            </div>
          </div>

          {/* Course voting */}
          <div style={{ marginBottom: '25px' }}>
            <h4 style={{ color: 'white', marginBottom: '10px' }}>Vote for Course:</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {Object.entries(COURSES).map(([id, course]) => (
                <div
                  key={id}
                  onClick={() => handleCourseVote(parseInt(id))}
                  style={{
                    padding: '15px',
                    background: selectedCourse === parseInt(id) 
                      ? 'rgba(34, 139, 34, 0.5)' 
                      : 'rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    border: selectedCourse === parseInt(id) ? '2px solid #22AA22' : '2px solid transparent',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ 
                    color: 'white', 
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    marginBottom: '5px'
                  }}>
                    <span style={{ fontSize: '20px' }}>{course.preview}</span>
                    {course.name}
                    <span style={{ 
                      fontSize: '12px', 
                      background: 'rgba(255,255,255,0.2)',
                      padding: '2px 6px',
                      borderRadius: '10px'
                    }}>
                      Par {course.par}
                    </span>
                  </div>
                  <div style={{ 
                    color: '#DDD', 
                    fontSize: '12px',
                    marginBottom: '5px'
                  }}>
                    {course.description}
                  </div>
                  <div style={{ 
                    color: course.difficulty === 'Easy' ? '#90EE90' : 
                          course.difficulty === 'Medium' ? '#FFD700' : '#FF6B6B',
                    fontSize: '11px',
                    fontWeight: 'bold'
                  }}>
                    {course.difficulty} • {course.theme}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Ready button */}
          <button
            onClick={handleReadyToggle}
            style={{
              width: '100%',
              padding: '15px',
              fontSize: '18px',
              fontWeight: 'bold',
              borderRadius: '10px',
              border: 'none',
              cursor: 'pointer',
              background: currentPlayer?.isReady ? '#FF6666' : '#22AA22',
              color: 'white',
              transition: 'all 0.2s'
            }}
          >
            {currentPlayer?.isReady ? '❌ Not Ready' : '✅ Ready to Play!'}
          </button>
        </div>
      </div>

      {/* Status message */}
      <div style={{
        marginTop: '20px',
        padding: '15px 30px',
        background: 'rgba(0,0,0,0.8)',
        borderRadius: '25px',
        color: 'white',
        textAlign: 'center',
        fontSize: '14px'
      }}>
        {totalCount === 0 
          ? 'Waiting for players to join...'
          : readyCount === totalCount && totalCount > 0
            ? '🎮 Starting game...'
            : `Waiting for ${totalCount - readyCount} more player${totalCount - readyCount !== 1 ? 's' : ''} to be ready`}
      </div>
    </div>
  )
}

// 3D Ball component (optimized for performance)
const Ball = React.memo(function Ball({ ballData }) {
  const meshRef = useRef()
  const { camera } = useThree()
  
  // Use lower poly count for distant balls
  const [polyCount, setPolyCount] = useState(12)
  
  useFrame(() => {
    if (meshRef.current && ballData) {
      meshRef.current.position.set(
        ballData.position.x, 
        ballData.position.y + 0.02, 
        ballData.position.z
      )
      
      // Dynamic LOD based on distance to camera
      const distance = meshRef.current.position.distanceTo(camera.position)
      const newPolyCount = distance > 10 ? 8 : distance > 5 ? 10 : 12
      if (newPolyCount !== polyCount) {
        setPolyCount(newPolyCount)
      }
    }
  })

  if (!ballData) return null

  // Memoized geometry creation
  const geometry = useMemo(() => new THREE.SphereGeometry(0.02, polyCount, polyCount), [polyCount])
  const material = useMemo(() => new THREE.MeshStandardMaterial({ 
    color: ballData.color,
    metalness: 0.1, 
    roughness: 0.2
  }), [ballData.color])

  return (
    <mesh ref={meshRef} castShadow geometry={geometry} material={material} />
  )
})

// Optimized course renderer with memoization and instancing
const CourseRenderer = React.memo(function CourseRenderer({ courseId }) {
  const course = COURSES[courseId]
  if (!course) return null

  const backgroundColor = course.theme === 'Cyberpunk' ? 0x001122 :
                         course.theme === 'Volcanic' ? 0x331100 :
                         0x87CEEB

  // Memoized geometries and materials
  const skyGeometry = useMemo(() => new THREE.SphereGeometry(50, 16, 16), [])
  const skyMaterial = useMemo(() => new THREE.MeshBasicMaterial({ 
    color: backgroundColor, 
    side: THREE.BackSide 
  }), [backgroundColor])
  
  const courseGeometry = useMemo(() => new THREE.PlaneGeometry(30, 20), [])
  const courseMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: course.theme === 'Cyberpunk' ? 0x404040 : 0x228B22,
    roughness: 0.8
  }), [course.theme])
  
  const teeGeometry = useMemo(() => new THREE.CircleGeometry(0.5, 12), [])
  const teeMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x32CD32 }), [])
  
  const holeGeometry = useMemo(() => new THREE.CircleGeometry(0.05, 12), [])
  const holeMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x000000 }), [])
  
  const flagPoleGeometry = useMemo(() => new THREE.CylinderGeometry(0.02, 0.02, 2, 6), [])
  const flagPoleMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x8B4513 }), [])
  
  const flagGeometry = useMemo(() => new THREE.PlaneGeometry(0.4, 0.3), [])
  const flagMaterial = useMemo(() => new THREE.MeshBasicMaterial({ 
    color: 0xFF0000, 
    side: THREE.DoubleSide 
  }), [])
  
  const wallGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  const wallMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x8B4513 }), [])

  // Wall instances for better performance
  const wallInstances = useMemo(() => [
    { pos: [0, 0.2, -10], scale: [30, 0.4, 0.2] },
    { pos: [0, 0.2, 10], scale: [30, 0.4, 0.2] },
    { pos: [-15, 0.2, 0], scale: [0.2, 0.4, 20] },
    { pos: [15, 0.2, 0], scale: [0.2, 0.4, 20] }
  ], [])

  return (
    <group>
      {/* Sky - reduced complexity for performance */}
      <mesh position={[0, 10, 0]} geometry={skyGeometry} material={skyMaterial} />

      {/* Course surface */}
      <mesh 
        position={[0, 0, 0]} 
        rotation={[-Math.PI / 2, 0, 0]} 
        receiveShadow
        geometry={courseGeometry}
        material={courseMaterial}
      />

      {/* Tee area */}
      <mesh 
        position={[-8, 0.01, 0]} 
        rotation={[-Math.PI / 2, 0, 0]} 
        receiveShadow
        geometry={teeGeometry}
        material={teeMaterial}
      />

      {/* Hole area */}
      <group position={[8, 0, 0]}>
        <mesh 
          position={[0, 0.02, 0]} 
          rotation={[-Math.PI / 2, 0, 0]}
          geometry={holeGeometry}
          material={holeMaterial}
        />
        {/* Flag pole - reduced cylinder segments for performance */}
        <mesh 
          position={[0, 1, 0]} 
          castShadow
          geometry={flagPoleGeometry}
          material={flagPoleMaterial}
        />
        <mesh 
          position={[0.2, 1.7, 0]}
          geometry={flagGeometry}
          material={flagMaterial}
        />
      </group>

      {/* Optimized boundaries with instanced geometry */}
      {wallInstances.map((wall, index) => (
        <mesh 
          key={index} 
          position={wall.pos} 
          scale={wall.scale}
          castShadow 
          receiveShadow
          geometry={wallGeometry}
          material={wallMaterial}
        />
      ))}
    </group>
  )
})

// Optimized 3D Scene component with selective rendering
const MiniGolfScene = React.memo(function MiniGolfScene({ gameData, worker, audio }) {
  const controlsRef = useRef()
  const lightRef = useRef()
  
  // Optimize shadow map size based on device performance
  const shadowMapSize = useMemo(() => {
    const pixelRatio = window.devicePixelRatio || 1
    return pixelRatio > 1.5 ? 1024 : 2048 // Reduce shadow quality on high DPI displays
  }, [])

  // Memoize camera controls configuration
  const controlsConfig = useMemo(() => ({
    enablePan: true,
    enableZoom: true,
    enableRotate: true,
    minDistance: 3,
    maxDistance: 15,
    minPolarAngle: 0,
    maxPolarAngle: Math.PI / 2,
    enableDamping: true,
    dampingFactor: 0.1
  }), [])

  return (
    <>
      {/* Optimized camera controls with damping for smoother movement */}
      <OrbitControls ref={controlsRef} {...controlsConfig} />

      {/* Optimized lighting setup */}
      <ambientLight intensity={0.6} />
      <directionalLight 
        ref={lightRef}
        position={[10, 15, 5]} 
        intensity={0.8}
        castShadow
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-camera-near={0.5}
        shadow-camera-far={30}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
        shadow-bias={-0.0005}
      />

      {/* Course - memoized to prevent unnecessary re-renders */}
      <CourseRenderer courseId={gameData.currentCourse} />

      {/* Balls - only render visible balls for performance */}
      {Object.entries(gameData.balls || {}).map(([playerId, ballData]) => (
        <Ball key={playerId} ballData={ballData} />
      ))}
      
      {/* Performance monitoring (removed in production) */}
      {process.env.NODE_ENV === 'development' && (
        <Html position={[10, 5, 0]}>
          <div style={{ 
            background: 'rgba(0,0,0,0.7)', 
            color: 'white', 
            padding: '5px',
            fontSize: '10px'
          }}>
            Balls: {Object.keys(gameData.balls || {}).length}<br/>
            Course: {gameData.currentCourse}<br/>
            Shadow: {shadowMapSize}px
          </div>
        </Html>
      )}
    </>
  )
})

// Game UI (when playing)
function GameUI({ gameData, worker, audio, currentUser }) {
  const [power, setPower] = useState(0)
  const [isCharging, setIsCharging] = useState(false)
  
  const currentPlayer = gameData.players[currentUser.id]
  const isMyTurn = gameData.currentTurn === currentUser.id
  const currentBall = gameData.balls?.[currentUser.id]

  const handleMouseDown = useCallback((e) => {
    if (!isMyTurn || !currentBall || isCharging) return
    
    setIsCharging(true)
    setPower(0)
    
    const powerInterval = setInterval(() => {
      setPower(prev => Math.min(prev + 3, 100))
    }, 50)
    
    const handleMouseUp = () => {
      clearInterval(powerInterval)
      setIsCharging(false)
      
      if (power > 5) {
        // Simple forward direction for now
        worker?.postMessage({
          type: 'shootBall',
          data: {
            playerId: currentUser.id,
            direction: { x: 1, y: 0, z: 0 },
            power: power / 10
          }
        })
        audio?.play('putt')
      }
      
      setPower(0)
      document.removeEventListener('mouseup', handleMouseUp)
    }
    
    document.addEventListener('mouseup', handleMouseUp)
  }, [isMyTurn, currentBall, isCharging, power, worker, currentUser.id, audio])

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
      
      {/* Course info */}
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        background: 'rgba(0,0,0,0.8)',
        color: 'white',
        padding: '15px',
        borderRadius: '10px'
      }}>
        <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '5px' }}>
          {COURSES[gameData.currentCourse]?.name || 'Golf Course'}
        </div>
        <div style={{ fontSize: '14px', opacity: 0.8 }}>
          Par: {COURSES[gameData.currentCourse]?.par || 3}
        </div>
      </div>

      {/* Player info */}
      <div style={{
        position: 'absolute',
        top: '20px',
        right: '20px',
        background: 'rgba(0,0,0,0.8)',
        color: 'white',
        padding: '15px',
        borderRadius: '10px'
      }}>
        <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '5px' }}>
          {currentPlayer?.username || 'Player'}
        </div>
        <div style={{ fontSize: '14px' }}>
          Shots: {currentPlayer?.shots || 0}
        </div>
        <div style={{ fontSize: '14px' }}>
          Score: {currentPlayer?.score || 0}
        </div>
        {isMyTurn && <div style={{ fontSize: '12px', color: '#00FF00', marginTop: '5px' }}>
          Your Turn
        </div>}
      </div>

      {/* Power meter */}
      {isMyTurn && (
        <div style={{
          position: 'absolute',
          right: '20px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '50px',
          height: '200px',
          background: 'rgba(0,0,0,0.8)',
          border: '2px solid white',
          borderRadius: '25px',
          pointerEvents: 'auto',
          cursor: 'pointer'
        }}
        onMouseDown={handleMouseDown}
        >
          <div style={{
            position: 'absolute',
            bottom: '4px',
            left: '4px',
            right: '4px',
            height: `${(power / 100) * (200 - 8)}px`,
            background: power < 30 ? '#00FF00' : 
                       power < 70 ? '#FFFF00' : '#FF0000',
            borderRadius: '20px',
            transition: isCharging ? 'none' : 'height 0.2s'
          }} />
          
          <div style={{
            position: 'absolute',
            bottom: '-25px',
            left: '50%',
            transform: 'translateX(-50%)',
            color: 'white',
            fontSize: '10px'
          }}>
            {Math.round(power)}%
          </div>
        </div>
      )}

      {/* Status */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.8)',
        color: 'white',
        padding: '10px 20px',
        borderRadius: '20px',
        textAlign: 'center'
      }}>
        {isMyTurn 
          ? 'Click and hold power meter to shoot!' 
          : `Waiting for ${gameData.players[gameData.currentTurn]?.username || 'player'}...`}
      </div>
    </div>
  )
}

// Main activity component
const MiniGolfActivity = ({ sdk, session, currentUser, participants }) => {
  const [gameData, setGameData] = useState({
    phase: 'initializing', // initializing, lobby, playing, complete
    players: {},
    balls: {},
    currentCourse: 1,
    currentTurn: null
  })

  const workerRef = useRef(null)
  const audioRef = useRef(null)

  // Initialize worker and systems
  useEffect(() => {
    audioRef.current = new MiniGolfAudio()
    
    // Create worker
    workerRef.current = new Worker('/minigolf-worker.js')
    
    // Handle worker messages
    workerRef.current.onmessage = (e) => {
      const { type, data } = e.data
      
      switch (type) {
        case 'playerAdded':
          if (!data?.player?.id) break
          setGameData(prev => ({
            ...prev,
            phase: 'lobby',
            players: {
              ...prev.players,
              [data.player.id]: data.player
            }
          }))
          audioRef.current?.play('join')
          break
          
        case 'playerRemoved':
          if (!data?.playerId) break
          setGameData(prev => {
            const newPlayers = { ...prev.players }
            delete newPlayers[data.playerId]
            return { ...prev, players: newPlayers }
          })
          break
          
        case 'playerListUpdate':
          if (!data?.players || typeof data.players !== 'object') break
          setGameData(prev => ({
            ...prev,
            players: data.players,
            ...(data.gameState || {})
          }))
          break
          
        case 'gameStarted':
          setGameData(prev => ({
            ...prev,
            phase: 'playing',
            ...(data?.gameState || {})
          }))
          audioRef.current?.play('start')
          break
          
        case 'physicsUpdate':
          setGameData(prev => ({
            ...prev,
            balls: data?.balls || prev.balls,
            ...(data?.gameState || {})
          }))
          break
          
        case 'holeCompleted':
          audioRef.current?.play('hole-in')
          break
          
        case 'turnChanged':
          if (!data) break
          setGameData(prev => ({
            ...prev,
            currentTurn: data.currentTurn
          }))
          break
          
        case 'error':
          console.error('Worker error:', data.error)
          break
      }
    }
    
    // Add current user as player
    workerRef.current.postMessage({
      type: 'addPlayer',
      data: {
        id: currentUser.id,
        username: currentUser.username,
        color: 0xFFFFFF
      }
    })

    return () => {
      try { audioRef.current?.dispose?.() } catch {}
      try { workerRef.current?.terminate() } catch {}
    }
  }, [currentUser])

  // Game update loop
  useEffect(() => {
    let animationFrame

    const gameLoop = () => {
      if (workerRef.current && gameData.phase === 'playing') {
        workerRef.current.postMessage({
          type: 'update',
          data: { deltaTime: 1/60 }
        })
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
  }, [gameData.phase])

  if (gameData.phase === 'initializing') {
    return (
      <GameCanvasShell
        title="Mini Golf"
        subtitle="Loading..."
        skin="sport"
      >
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'white'
        }}>
          <div style={{ fontSize: '24px', marginBottom: '20px' }}>Loading Mini Golf...</div>
          <div style={{ fontSize: '14px', opacity: 0.7 }}>Setting up lobby...</div>
        </div>
      </GameCanvasShell>
    )
  }

  if (gameData.phase === 'lobby') {
    return (
      <GameCanvasShell
        title="Mini Golf"
        subtitle="Lobby"
        skin="sport"
        layout="stretch"
      >
        <LobbyUI 
          gameData={gameData}
          worker={workerRef.current}
          audio={audioRef.current}
          currentUser={currentUser}
        />
      </GameCanvasShell>
    )
  }

  return (
    <GameCanvasShell
      title="Mini Golf"
      subtitle={`${COURSES[gameData.currentCourse]?.name} • ${Object.keys(gameData.players).length} players`}
      status="Optimized with Web Workers"
      skin="sport"
      layout="stretch"
    >
      <Canvas
        camera={{ 
          position: [-8, 6, 8], 
          fov: 75,
          near: 0.1,
          far: 100
        }}
        shadows
        style={{ width: '100%', height: '100%' }}
        onCreated={({ gl, camera }) => {
          // Enhanced performance optimizations
          gl.shadowMap.enabled = true
          gl.shadowMap.type = THREE.PCFSoftShadowMap
          gl.shadowMap.autoUpdate = true
          
          // Optimize pixel ratio based on device capabilities
          const pixelRatio = Math.min(window.devicePixelRatio, 2)
          gl.setPixelRatio(pixelRatio)
          
          // Enable performance optimizations
          gl.setClearColor(0x87CEEB, 1)
          gl.antialias = false // Disable for better performance on mobile
          gl.logarithmicDepthBuffer = false
          
          // Optimize camera frustum
          camera.updateProjectionMatrix()
          
          // Enable tone mapping for better visuals
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.2
        }}
      >
        <MiniGolfScene 
          gameData={gameData}
          worker={workerRef.current}
          audio={audioRef.current}
        />
      </Canvas>
      
      <GameUI 
        gameData={gameData}
        worker={workerRef.current}
        audio={audioRef.current}
        currentUser={currentUser}
      />
    </GameCanvasShell>
  )
}

export default MiniGolfActivity
