import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const PLAYBACK_MODES = [
  { id: 'bytebeat', name: 'Bytebeat', description: 'Unsigned 8-bit (0-255)', color: '#7c9cff' },
  { id: 'signed', name: 'Signed Bytebeat', description: 'Signed 8-bit (-128 to 127)', color: '#ffab00' },
  { id: 'bitbeat', name: 'Bitbeat', description: 'Binary bit operations', color: '#ff6b6b' },
  { id: '2048', name: '2048', description: '0-2047 range output', color: '#4ecdc4' },
  { id: 'logmode', name: 'Logmode', description: 'Logarithmic amplitude', color: '#a78bfa' },
  { id: 'loghack', name: 'LogHack', description: 'Logarithmic hack', color: '#f472b6' },
  { id: 'loghack2', name: 'LogHack2', description: 'Logarithmic hack v2', color: '#34d399' },
  { id: 'float', name: 'Floatbeat', description: '-1..1 floating output', color: '#5eead4' },
  { id: 'func', name: 'Funcbeat', description: 'JS returning a function', color: '#e040fb' }
]

const BYTEBEAT_LIBRARY = [
  { id: 'viznut-first', name: 'Viznut First', code: 't', mode: 'bytebeat' },
  { id: 'viznut-original', name: 'Viznut Original', code: 't*(t>>9&10)', mode: 'bytebeat' },
  { id: '42-melody', name: '42 Melody', code: 't*(42&t>>10)', mode: 'bytebeat' },
  { id: 'sierpinski', name: 'Sierpinski', code: 't&t>>8', mode: 'bytebeat' },
  { id: 'tejeez-1', name: 'Tejeez 1', code: 't*(t>>5|t>>8)', mode: 'bytebeat' },
  { id: 'tejeez-2', name: 'Tejeez 2', code: '(t*(t>>5|t>>8))>>(t>>16)', mode: 'bytebeat' },
  { id: 'tejeez-3', name: 'Tejeez 3', code: 't*(((t>>11)&(t>>8))&(123&(t>>3)))', mode: 'bytebeat' },
  { id: 'visy-1', name: 'Visy 1', code: 't*(((t>>12)|(t>>8))&(63&(t>>4)))', mode: 'bytebeat' },
  { id: 'visy-2', name: 'Visy 2', code: 't*(((t>>9)|(t>>13))&(25&(t>>6)))', mode: 'bytebeat' },
  { id: 'space-invaders', name: 'Space Invaders', code: 't*(t>>((t>>9)|(t>>8))&(63&(t>>4)))', mode: 'bytebeat' },
  { id: 'xpansive', name: 'Lost in Space', code: '((t*(t>>8|t>>9)&46&t>>8))^(t&t>>13|t>>6)', mode: 'bytebeat' },
  { id: 'viznut-2nd-1', name: 'Viznut 2nd A', code: '(t>>6|t|t>>(t>>16))*10+((t>>11)&7)', mode: 'bytebeat' },
  { id: 'viznut-2nd-2', name: 'Viznut 2nd B', code: '(t>>7|t|t>>6)*10+4*(t&t>>13|t>>6)', mode: 'bytebeat' },
  { id: 'red', name: 'Red-', code: '(t|(t>>9|t>>7))*t&(t>>11|t>>9)', mode: 'bytebeat' },
  { id: 'miiro', name: 'Miiro', code: 't*5&(t>>7)|t*3&(t>>10)', mode: 'bytebeat' },
  { id: 'viznut-3rd-1', name: 'Viznut 3rd A', code: '(t*5&t>>7)|(t*3&t>>10)', mode: 'bytebeat' },
  { id: 'bst', name: 'BST', code: '(int)(t/1e7*t*t+t)%127|t>>4|t>>5|t%127+(t>>16)|t', mode: 'bytebeat' },
  { id: 'stephth', name: 'Stephth', code: '(t*9&t>>4|t*5&t>>7|t*3&t/1024)-1', mode: 'bytebeat' },
  { id: 'dante-short', name: "Dante's Inferno (short)", code: '((t*(t>>12)&(201*t/100)&(199*t/100))&(t*(t>>14)&(t*301/100)&(t*399/100)))+((t*(t>>16)&(t*202/100)&(t*198/100))-(t*(t>>17)&(t*302/100)&(t*298/100)))', mode: 'bytebeat' },
  { id: '216', name: '216', code: 't*(t^t+(t>>15|1)^(t-1280^t)>>10)', mode: 'bytebeat' },
  { id: 'harism', name: 'Harism', code: '((t>>1%128)+20)*3*t>>14*t>>18', mode: 'bytebeat' },
  { id: 'tangent', name: 'Tangent128', code: 't*(((t>>9)&10)|((t>>11)&24)^((t>>10)&15&(t>>15)))', mode: 'bytebeat' },
  { id: 'ultrageranium', name: 'Ultrageranium', code: '(t*t/256)&(t>>((t/1024)%16))^t%64*(0xC0D3DE4D69>>(t>>9&30)&t%32)*t>>18', mode: 'bytebeat' },
  { id: 'kb', name: 'KB', code: '((t/2*(15&(0x234568a0>>(t>>8&28))))|t/2>>(t>>11)^t>>12)+(t/16&t&24)', mode: 'bytebeat' },
  { id: 'ryg', name: 'RYG', code: '((t*("36364689"[t>>13&7]&15))/12&128)+(((((t>>12)^(t>>12)-2)%11*t)/4|t>>13)&127)', mode: 'bytebeat' },
  { id: 'mu6k', name: 'MU6K', code: '(3e3/(y=t&16383)&1)*35+(x=t*"6689"[t>>16&3]/24&127)*y/4e4+((t>>8^t>>10|t>>14|x)&63)', mode: 'bytebeat' },
  { id: 'marmakoide-1', name: 'Marmakoide 1', code: '(t>>5)|(t<<4)|((t&1023)^1981)|((t-67)>>4)', mode: 'bytebeat' },
  { id: 'marmakoide-2', name: 'Marmakoide 2', code: '(t>>(t&7))|(t<<(t&42))|(t>>7)|(t<<5)', mode: 'bytebeat' },
  { id: 'lucasvb', name: 'LucasVB', code: '(t>>6|t<<1)+(t>>5|t<<3|t>>3)|t>>2|t<<1', mode: 'bytebeat' },
  { id: 'freefull', name: 'FreeFull', code: '(~t/100|(t*3))^(t*3&(t>>5))&t', mode: 'bytebeat' },
  { id: 'robert', name: 'Robert', code: '(t>>7|t%45)&(t>>8|t%35)&(t>>11|t%20)', mode: 'bytebeat' },
  { id: 'niklas', name: 'Niklas Roy', code: 't*(t>>9|t>>13)&16', mode: 'bytebeat' },
  { id: 'krcko-1', name: 'Krcko 1', code: '(t&t>>12)*(t>>4|t>>8)', mode: 'bytebeat' },
  { id: 'krcko-2', name: 'Krcko 2', code: '(t&t>>12)*(t>>4|t>>8)^t>>6', mode: 'bytebeat' },
  { id: 'yumeji', name: 'Yumeji', code: '(t>>1)*(0xbad2dea1>>(t>>13)&3)|t>>5', mode: 'bytebeat' },
  { id: 'lokori', name: 'Lokori', code: '(t+(t>>2)|(t>>5))+(t>>3)|((t>>13)|(t>>7)|(t>>11))', mode: 'bytebeat' },
  { id: 'jounim', name: 'Jounim', code: '((t&((t>>5)))+(t|((t>>7))))&(t>>6)|(t>>5)&(t*(t>>7))', mode: 'bytebeat' },
  { id: 'spikey', name: 'Spikey', code: '((t&((t>>23)))+(t|(t>>2)))&(t>>3)|(t>>5)&(t*(t>>7))', mode: 'bytebeat' },
  { id: 'skurk', name: 'Skurk', code: 't*(t>>((t&4096)?((t*t)/4096):(t/4096)))|(t<<(t/256))|(t>>4)', mode: 'bytebeat' },
  { id: 'a1k0n', name: 'A1K0N', code: 'SS=function(s,o,r,p){var c=s.charCodeAt((t>>r)%p);return c==32?0:31&t*Math.pow(2,c/12-o)},SS("0 0     7 7     037:<<",6,10,32)+(t&4096?SS("037",4,8,3)*(4096-(t&4095))>>12:0)', mode: 'bytebeat' },
  { id: 'signed-sin', name: 'Signed Sine', code: 'Math.sin(t*0.05)*127', mode: 'signed' },
  { id: 'signed-basic', name: 'Signed Basic', code: '(t*(t>>8&255)-128)', mode: 'signed' },
  { id: 'signed-tri', name: 'Signed Triangle', code: '(t%128-64)*2', mode: 'signed' },
  { id: 'bit-mix', name: 'Bit Mix', code: 't|(t>>8)|(t>>16)', mode: 'bitbeat' },
  { id: 'bit-beat', name: 'Bit Beat', code: 't&(t>>8)', mode: 'bitbeat' },
  { id: 'bit-pulse', name: 'Bit Pulse', code: '(t>>10)&1', mode: 'bitbeat' },
  { id: '2048-saw', name: '2048 Saw', code: 't%2048', mode: '2048' },
  { id: '2048-melody', name: '2048 Melody', code: '(t*(t>>10&255))%2048', mode: '2048' },
  { id: '2048-fractal', name: '2048 Fractal', code: '(t*t)%2048', mode: '2048' },
  { id: 'logmode-basic', name: 'Logmode Basic', code: 'Math.log(t+1)*20', mode: 'logmode' },
  { id: 'logmode-saw', name: 'Logmode Saw', code: 'Math.log((t%128)+1)*50', mode: 'logmode' },
  { id: 'loghack-basic', name: 'LogHack Basic', code: 't*(Math.log(t+1)%1)', mode: 'loghack' },
  { id: 'loghack-disto', name: 'LogHack Disto', code: 't*(Math.log(t+1)%0.5)', mode: 'loghack' },
  { id: 'loghack2-basic', name: 'LogHack2 Basic', code: 't*((Math.log2(t+1))%1)', mode: 'loghack2' },
  { id: 'loghack2-disto', name: 'LogHack2 Disto', code: 't*((Math.log2(t+1)%0.5)', mode: 'loghack2' },
  { id: 'float-synth', name: 'Float Synth', code: 'Math.sin(t*0.03)*0.4', mode: 'float' },
  { id: 'fm-basic', name: 'FM Basic', code: 'Math.sin(t*200+Math.sin(t*5)*10)*0.5', mode: 'float' },
  { id: 'float-chord', name: 'Float Chord', code: 'Math.sin(t*262)+Math.sin(t*330)/2+Math.sin(t*392)/3', mode: 'float' },
  { id: 'float-pad', name: 'Float Pad', code: 'Math.sin(t*220)*0.3+Math.sin(t*277)*0.3+Math.sin(t*330)*0.3', mode: 'float' },
  { id: 'func-stereo', name: 'Func Stereo', code: '(t) => [Math.sin(t*440*6.28)*0.3, Math.sin(t*554*6.28)*0.3]', mode: 'func' },
  { id: 'func-adsr', name: 'Func ADSR', code: 'return function (t) { const phase=t%2; const env=phase<0.1?phase*10:phase<0.3?1:phase<1.5?1-(phase-0.3)/1.2:0; return Math.sin(t*440*6.28)*env*0.5 }', mode: 'func' },
  { id: 'func-arpeggio', name: 'Func Arpeggio', code: 'return function (t) { const notes=[261,329,392,523,392,329]; const n=Math.floor(t*8)%6; const freq=notes[n]; return Math.sin(t*freq*6.28)*0.3*((t*16)%1) }', mode: 'func' },
  { id: 'func-bass', name: 'Func Bass', code: 'return function (t) { const f=55*Math.pow(2,Math.floor(t*4)%4/3); return Math.sin(t*f*6.28)*(0.8-t%1*0.8) }', mode: 'func' }
]

function formatTime(t, format, sr) {
  switch (format) {
    case 'seconds':
      return (t / sr).toFixed(2) + 's'
    case 'mm:ss': {
      const s = (t / sr) | 0
      const m = (s / 60) | 0
      const sec = s % 60
      return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
    }
    case 'hh:mm:ss': {
      const s = (t / sr) | 0
      const h = (s / 3600) | 0
      const m = ((s % 3600) / 60) | 0
      const sec = s % 60
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
    }
    default:
      return t.toLocaleString()
  }
}

const BYTEBEAT_WORKLET_PATH = `${import.meta.env.BASE_URL}bytebeat-worklet.js`

export default function BytebeatActivity({ sdk, rawState, updateState }) {
  const [code, setCode] = useState(rawState?.code || '(t*(t>>5|t>>8))')
  const [mode, setMode] = useState(rawState?.mode || 'bytebeat')
  const [sampleRate, setSampleRate] = useState(Number(rawState?.sampleRate) || 8000)
  const [volume, setVolume] = useState(Number(rawState?.volume) || 0.5)
  const [status, setStatus] = useState('Stopped')
  const [error, setError] = useState(null)
  const [showLibrary, setShowLibrary] = useState(false)
  const [remoteCursors, setRemoteCursors] = useState({})
  const [participants, setParticipants] = useState([])
  const [username, setUsername] = useState('')
  const [visualizerType, setVisualizerType] = useState('grid')
  const [timeDisplayFormat, setTimeDisplayFormat] = useState('samples')
  const [diagramMode, setDiagramMode] = useState('drawing')
  const [isPlaying, setIsPlaying] = useState(false)
  const [syncFlash, setSyncFlash] = useState({ code: null, mode: null, sampleRate: null })

  const timeDisplayRef = useRef(null)
  const isPlayingRef = useRef(false)

  const audioCtxRef = useRef(null)
  const workletNodeRef = useRef(null)
  const analyserRef = useRef(null)
  const gainRef = useRef(null)
  const sampleCursorRef = useRef(0)
  const animationRef = useRef(null)
  const isRemoteUpdateRef = useRef(false)
  const seenEventsRef = useRef(new Set())
  const workletLoadedRef = useRef(false)
  const lastDrawBufferRef = useRef([])
  const participantTimeoutsRef = useRef({})
  const codeRef = useRef(code)

  const visualLRef = useRef(new Float32Array(2048))
  const visualRRef = useRef(new Float32Array(2048))

  const scopeRef = useRef(null)
  const barsRef = useRef(null)
  const specRef = useRef(null)
  const lissaRef = useRef(null)
  const diagramRef = useRef(null)
  const diagramDataRef = useRef(new Uint8Array(256 * 8))
  const waveformImageRef = useRef(new Uint8Array(512 * 256))
  const waveformImageIndexRef = useRef(0)
  const drawingHistoryRef = useRef([])
  const drawingGradientRef = useRef(0)

  const normalizedState = useMemo(() => ({
    code,
    mode,
    sampleRate,
    volume
  }), [code, mode, sampleRate, volume])

  const triggerSyncFlash = useCallback((field, userId) => {
    const colors = ['#f472b6', '#34d399', '#60a5fa', '#fbbf24', '#a78bfa', '#fb923c']
    const color = colors[userId.charCodeAt(0) % colors.length]
    setSyncFlash(prev => ({ ...prev, [field]: color }))
    setTimeout(() => {
      setSyncFlash(prev => ({ ...prev, [field]: null }))
    }, 500)
  }, [])

  useEffect(() => {
    if (sdk && normalizedState) {
      updateState?.({ bytebeat: normalizedState }, { serverRelay: true })
    }
  }, [sdk, normalizedState, updateState])

  useEffect(() => {
    codeRef.current = code
  }, [code])

  // Load AudioWorklet
  const loadWorklet = useCallback(async () => {
    if (workletLoadedRef.current) return true
    
    const audioCtx = audioCtxRef.current
    if (!audioCtx) return false
    
    try {
      await audioCtx.audioWorklet.addModule(BYTEBEAT_WORKLET_PATH)
      workletLoadedRef.current = true
      return true
    } catch (e) {
      console.error('Failed to load AudioWorklet:', e)
      return false
    }
  }, [])

  // Emit join event when connected and request sync
  useEffect(() => {
    if (!sdk) return

    const ownId = sdk?.session?.user?.id || sdk?.user?.id
    const userName = sdk?.session?.user?.username || sdk?.user?.username || 'Anonymous'
    setUsername(userName)

    sdk.emitEvent('bytebeat:join', { userId: ownId, username: userName }, { serverRelay: true })

    setTimeout(() => {
      sdk.emitEvent('bytebeat:request-sync', { userId: ownId }, { serverRelay: true })
    }, 1000)

    return () => {
      sdk.emitEvent('bytebeat:leave', { userId: ownId }, { serverRelay: true })
    }
  }, [sdk])

  // Sync: Subscribe to server state for remote updates
  useEffect(() => {
    if (!sdk) return

    const offState = sdk.subscribeServerState((state) => {
      if (state?.bytebeat) {
        const remote = state.bytebeat
        if (remote.code !== code || remote.mode !== mode || remote.sampleRate !== sampleRate) {
          isRemoteUpdateRef.current = true
          if (remote.code) setCode(remote.code)
          if (remote.mode) setMode(remote.mode)
          if (remote.sampleRate) setSampleRate(remote.sampleRate)
          if (remote.volume !== undefined) setVolume(remote.volume)
          isRemoteUpdateRef.current = false
        }
      }
    })

    const offEvent = sdk.on('event', (evt) => {
      if (!evt?.eventType) return
      const eventId = `${evt.eventType}-${evt.payload?.userId}-${evt.timestamp}`
      if (seenEventsRef.current.has(eventId)) return
      seenEventsRef.current.add(eventId)

      if (evt.eventType === 'bytebeat:sync') {
        const { code: newCode, mode: newMode, sampleRate: newRate, volume: newVol, userId } = evt.payload || {}
        const ownId = sdk?.session?.user?.id || sdk?.user?.id
        if (newCode || newMode) {
          isRemoteUpdateRef.current = true
          if (newCode) {
            setCode(newCode)
            if (userId && userId !== ownId) triggerSyncFlash('code', userId)
          }
          if (newMode) {
            setMode(newMode)
            if (userId && userId !== ownId) triggerSyncFlash('mode', userId)
          }
          if (newRate) {
            setSampleRate(newRate)
            if (userId && userId !== ownId) triggerSyncFlash('sampleRate', userId)
          }
          if (newVol !== undefined) setVolume(newVol)
          isRemoteUpdateRef.current = false
        }
      }

      if (evt.eventType === 'bytebeat:cursor') {
        const { userId, position, username } = evt.payload || {}
        if (userId && position !== undefined) {
          const ownId = sdk?.session?.user?.id || sdk?.user?.id
          if (userId !== ownId) {
            const colors = ['#f472b6', '#34d399', '#60a5fa', '#fbbf24', '#a78bfa', '#fb923c']
            const color = colors[userId.charCodeAt(0) % colors.length]
            setRemoteCursors(prev => ({ ...prev, [userId]: { position, username, color } }))
          }
        }
      }

      if (evt.eventType === 'bytebeat:chunk') {
        const { chunkId, idx, total, chunk, mode: newMode, sampleRate: newRate, volume: newVol, userId } = evt.payload || {}
        const ownId = sdk?.session?.user?.id || sdk?.user?.id
        if (chunkId && chunk !== undefined) {
          if (!pendingChunksRef.current[chunkId]) {
            pendingChunksRef.current[chunkId] = { chunks: [], total, mode: newMode, sampleRate: newRate, volume: newVol, userId }
          }
          const pending = pendingChunksRef.current[chunkId]
          pending.chunks[idx] = chunk
          
          if (pending.chunks.filter(Boolean).length === total) {
            const fullCode = pending.chunks.join('')
            isRemoteUpdateRef.current = true
            setCode(fullCode)
            if (pending.mode) setMode(pending.mode)
            if (pending.sampleRate !== undefined) setSampleRate(pending.sampleRate)
            if (pending.volume !== undefined) setVolume(pending.volume)
            if (pending.userId && pending.userId !== ownId) triggerSyncFlash('code', pending.userId)
            isRemoteUpdateRef.current = false
            delete pendingChunksRef.current[chunkId]
          }
        }
      }

      if (evt.eventType === 'bytebeat:play') {
        const { sampleRate: newRate, mode: newMode, code: newCode, startTime } = evt.payload || {}
        isRemoteUpdateRef.current = true
        if (newMode) setMode(newMode)
        if (newRate) setSampleRate(newRate)
        if (newCode) setCode(newCode)
        isRemoteUpdateRef.current = false
        ensureAudio().then(() => {
          if (newCode) {
            sendToWorklet({ setFunction: newCode, mode: newMode, sampleRate: newRate, sampleRatio: newRate / audioCtxRef.current.sampleRate })
          }
          sendToWorklet({ isPlaying: true, byteSample: startTime || 0, resetTime: !startTime })
          isPlayingRef.current = true
          setIsPlaying(true)
          setStatus('Playing')
        })
      }

      if (evt.eventType === 'bytebeat:pause') {
        sendToWorklet({ isPlaying: false })
        isPlayingRef.current = false
        setIsPlaying(false)
        visualLRef.current.fill(0)
        visualRRef.current.fill(0)
        setStatus('Paused')
      }

      if (evt.eventType === 'bytebeat:stop') {
        sendToWorklet({ isPlaying: false, resetTime: true })
        isPlayingRef.current = false
        setIsPlaying(false)
        sampleCursorRef.current = 0
        visualLRef.current.fill(0)
        visualRRef.current.fill(0)
        setStatus('Stopped')
      }

      if (evt.eventType === 'bytebeat:seek') {
        const { position } = evt.payload || {}
        if (position !== undefined) {
          sendToWorklet({ byteSample: position })
          sampleCursorRef.current = position
        }
      }

      if (evt.eventType === 'bytebeat:join') {
        const { userId, username } = evt.payload || {}
        if (userId) {
          clearTimeout(participantTimeoutsRef.current[userId])
          delete participantTimeoutsRef.current[userId]
          setParticipants(prev => {
            if (prev.find(p => p.id === userId)) return prev
            const colors = ['#f472b6', '#34d399', '#60a5fa', '#fbbf24', '#a78bfa', '#fb923c']
            const color = colors[userId.charCodeAt(0) % colors.length]
            return [...prev, { id: userId, username: username || 'Unknown', color }]
          })
        }
      }

      if (evt.eventType === 'bytebeat:leave') {
        const { userId } = evt.payload || {}
        if (userId) {
          clearTimeout(participantTimeoutsRef.current[userId])
          delete participantTimeoutsRef.current[userId]
          setParticipants(prev => prev.filter(p => p.id !== userId))
          setRemoteCursors(prev => {
            const next = { ...prev }
            delete next[userId]
            return next
          })
        }
      }

      if (evt.eventType === 'bytebeat:request-sync') {
        const { userId: requesterId } = evt.payload || {}
        if (requesterId && sdk) {
          const ownId = sdk?.session?.user?.id || sdk?.user?.id
          if (requesterId !== ownId) {
            sdk.emitEvent('bytebeat:sync', {
              code,
              mode,
              sampleRate,
              volume
            }, { serverRelay: true })
          }
        }
      }
    })

    return () => {
      offState?.()
      offEvent?.()
    }
  }, [sdk, code, mode, sampleRate])

  const broadcastTimeoutRef = useRef(null)
  const pendingChunksRef = useRef({})

  const broadcastChange = useCallback((updates) => {
    if (!sdk || isRemoteUpdateRef.current) return
    
    const ownId = sdk?.session?.user?.id || sdk?.user?.id
    
    if (broadcastTimeoutRef.current) {
      clearTimeout(broadcastTimeoutRef.current)
    }
    
    broadcastTimeoutRef.current = setTimeout(() => {
      const code = updates.code
      const maxChunkSize = 48000
      
      if (code && code.length > maxChunkSize) {
        const chunks = []
        for (let i = 0; i < code.length; i += maxChunkSize) {
          chunks.push(code.slice(i, i + maxChunkSize))
        }
        
        const chunkId = Date.now().toString(36)
        
        chunks.forEach((chunk, idx) => {
          setTimeout(() => {
            sdk.emitEvent('bytebeat:chunk', {
              chunkId,
              idx,
              total: chunks.length,
              chunk,
              mode: idx === 0 ? updates.mode : undefined,
              sampleRate: idx === 0 ? updates.sampleRate : undefined,
              volume: idx === 0 ? updates.volume : undefined,
              userId: ownId
            }, { serverRelay: true })
          }, idx * 50)
        })
      } else {
        sdk.emitEvent('bytebeat:sync', { ...updates, userId: ownId }, { serverRelay: true })
      }
    }, 300)
  }, [sdk])

  // Create audio context and worklet
  const ensureAudio = useCallback(async () => {
    if (audioCtxRef.current) {
      if (!workletNodeRef.current && workletLoadedRef.current) {
        await createWorkletNode()
      }
      return
    }

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    audioCtxRef.current = audioCtx

    const workletLoaded = await loadWorklet()
    if (!workletLoaded) {
      console.error('Could not load AudioWorklet')
      return
    }

    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.85
    analyserRef.current = analyser

    const gain = audioCtx.createGain()
    gain.gain.value = volume
    gainRef.current = gain

    await createWorkletNode(audioCtx, gain, analyser)
  }, [volume, loadWorklet])

  const createWorkletNode = useCallback(async (audioCtx, gainNode, analyserNode) => {
    const ctx = audioCtx || audioCtxRef.current
    const gain = gainNode || gainRef.current
    const analyser = analyserNode || analyserRef.current
    
    if (!ctx || !gain || !workletLoadedRef.current) return

    try {
      const worklet = new AudioWorkletNode(ctx, 'audioProcessor', {
        numberOfOutputs: 2
      })
      workletNodeRef.current = worklet

      worklet.port.onmessage = (e) => {
        const { byteSample, drawBuffer, error } = e.data
        
        if (typeof byteSample === 'number') {
          sampleCursorRef.current = byteSample
        }
        
        if (error && error.message !== undefined) {
          if (error.isCompiled === false) {
            setError(error.message)
            setStatus('Compile error')
          } else if (error.isRuntime) {
            setError(error.message)
            setStatus('Playing')
          } else if (error.isCompiled === true) {
            setError(null)
            setStatus('Playing')
          }
          sendToWorklet({ errorDisplayed: true })
        }
        
        if (Array.isArray(drawBuffer)) {
          lastDrawBufferRef.current = drawBuffer
        }
      }

      worklet.connect(gain)
      gain.connect(analyser)
      analyser.connect(ctx.destination)

      // Set initial parameters
      sendToWorklet({
        mode,
        sampleRate,
        sampleRatio: sampleRate / ctx.sampleRate,
        setFunction: code,
        isPlaying: false,
        resetTime: true
      })

    } catch (e) {
      console.error('Failed to create worklet node:', e)
    }
  }, [code, mode, sampleRate])

  const sendToWorklet = useCallback((data) => {
    if (workletNodeRef.current) {
      try {
        workletNodeRef.current.port.postMessage(data)
      } catch (e) {
        console.error('Failed to send to worklet:', e)
      }
    }
  }, [])

  const broadcastPlayState = useCallback((action, extra = {}) => {
    if (!sdk || isRemoteUpdateRef.current) return
    sdk.emitEvent(`bytebeat:${action}`, {
      code,
      mode,
      sampleRate,
      volume,
      ...extra
    }, { serverRelay: true })
  }, [sdk, code, mode, sampleRate, volume])

  const play = useCallback(async () => {
    await ensureAudio()
    if (!audioCtxRef.current) return
    
    if (audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume()
    }

    sendToWorklet({
      mode,
      sampleRate,
      sampleRatio: sampleRate / audioCtxRef.current.sampleRate,
      setFunction: code,
      isPlaying: true
    })
    
    isPlayingRef.current = true
    setIsPlaying(true)
    setStatus('Playing')
    setError(null)
    broadcastPlayState('play', { startTime: sampleCursorRef.current })
  }, [ensureAudio, code, mode, sampleRate, sendToWorklet, broadcastPlayState])

  const pause = useCallback(() => {
    sendToWorklet({ isPlaying: false })
    isPlayingRef.current = false
    setIsPlaying(false)
    visualLRef.current.fill(0)
    visualRRef.current.fill(0)
    diagramDataRef.current.fill(0)
    waveformImageRef.current.fill(0)
    waveformImageIndexRef.current = 0
    drawingHistoryRef.current = []
    setStatus('Paused')
    broadcastPlayState('pause')
  }, [sendToWorklet, broadcastPlayState])

  const stop = useCallback(() => {
    sendToWorklet({ isPlaying: false, resetTime: true })
    isPlayingRef.current = false
    setIsPlaying(false)
    sampleCursorRef.current = 0
    visualLRef.current.fill(0)
    visualRRef.current.fill(0)
    diagramDataRef.current.fill(0)
    waveformImageRef.current.fill(0)
    waveformImageIndexRef.current = 0
    drawingHistoryRef.current = []
    if (timeDisplayRef.current) {
      timeDisplayRef.current.textContent = 'T: 0'
    }
    setStatus('Stopped')
    broadcastPlayState('stop')
  }, [sendToWorklet, broadcastPlayState])

  const handleVolumeChange = useCallback((val) => {
    setVolume(val)
    if (gainRef.current) {
      gainRef.current.gain.value = val
    }
    broadcastChange({ code, mode, sampleRate, volume: val })
  }, [code, mode, sampleRate, broadcastChange])

  const loadPreset = useCallback(async (preset) => {
    setCode(preset.code)
    setMode(preset.mode)
    setShowLibrary(false)
    broadcastChange({ code: preset.code, mode: preset.mode, sampleRate, volume })
    
    await ensureAudio()
    if (audioCtxRef.current?.state === 'suspended') {
      await audioCtxRef.current.resume()
    }
    
    sendToWorklet({
      mode: preset.mode,
      sampleRate,
      sampleRatio: sampleRate / audioCtxRef.current.sampleRate,
      setFunction: preset.code,
      isPlaying: true,
      resetTime: true
    })
    
    isPlayingRef.current = true
    setIsPlaying(true)
    setStatus('Playing')
    setError(null)
    broadcastPlayState('play', { startTime: 0 })
  }, [ensureAudio, sampleRate, volume, broadcastChange, sendToWorklet, broadcastPlayState])

  const emitCursor = useCallback((position) => {
    if (!sdk) return
    const username = sdk?.session?.user?.username || sdk?.user?.username || 'Anonymous'
    sdk.emitEvent('bytebeat:cursor', { 
      position, 
      username,
      userId: sdk?.session?.user?.id || sdk?.user?.id 
    }, { serverRelay: true })
  }, [sdk])

  // Visualizer animation loop - throttled
  useEffect(() => {
    let frame = 0
    let lastDrawTime = 0
    const FRAME_THROTTLE = 33
    
    const draw = (timestamp) => {
      animationRef.current = requestAnimationFrame(draw)
      
      if (timestamp - lastDrawTime < FRAME_THROTTLE) return
      lastDrawTime = timestamp
      frame++

      const t = sampleCursorRef.current
      if (timeDisplayRef.current && frame % 2 === 0) {
        timeDisplayRef.current.textContent = 'T: ' + formatTime(t, timeDisplayFormat, sampleRate)
      }

      if (!isPlayingRef.current) return
      if (frame % 2 !== 0) return
      if (!analyserRef.current) return

      const freq = new Uint8Array(64)
      try {
        analyserRef.current.getByteFrequencyData(freq)
      } catch (e) {
        return
      }

      const visualL = visualLRef.current
      const visualR = visualRRef.current

      try {
        const timeData = new Float32Array(analyserRef.current.fftSize)
        analyserRef.current.getFloatTimeDomainData(timeData)
        for (let i = 0; i < Math.min(2048, timeData.length); i++) {
          visualL[i] = timeData[i]
          visualR[i] = timeData[i]
        }
      } catch (e) {}

      if (visualizerType === 'grid') {
        const scope = scopeRef.current?.getContext('2d')
        if (scope) {
          const w = scope.canvas.width || 400
          const h = scope.canvas.height || 200
          scope.fillStyle = '#060a18'
          scope.fillRect(0, 0, w, h)
          scope.beginPath()
          scope.strokeStyle = '#7c9cff'
          scope.lineWidth = 1.5
          for (let i = 0; i < Math.min(512, w); i += 2) {
            const x = (i / 512) * w
            const idx = (i * 4) & 2047
            const y = (1 - (visualL[idx] * 0.5 + 0.5)) * h
            if (i === 0) scope.moveTo(x, y)
            else scope.lineTo(x, y)
          }
          scope.stroke()
        }

        const bars = barsRef.current?.getContext('2d')
        if (bars) {
          const w = bars.canvas.width || 400
          const h = bars.canvas.height || 200
          bars.fillStyle = '#060a18'
          bars.fillRect(0, 0, w, h)
          const bw = w / 32
          for (let i = 0; i < 32; i++) {
            const val = freq[i * 2]
            const bh = (val / 255) * h * 0.9
            bars.fillStyle = `hsl(${i * 8}, 70%, 55%)`
            bars.fillRect(i * bw, h - bh, bw - 1, bh)
          }
        }

        const spec = specRef.current?.getContext('2d')
        if (spec) {
          const w = spec.canvas.width || 400
          const h = spec.canvas.height || 200
          spec.fillStyle = 'rgba(10,10,18,0.3)'
          spec.fillRect(0, 0, w, h)
          spec.fillStyle = '#a78bfa'
          for (let y = 0; y < h; y += 4) {
            const idx = ((1 - y / h) * 64) | 0
            const v = freq[idx] / 255
            if (v > 0.1) {
              spec.fillRect(w - 4, y, 3, 3)
            }
          }
        }

        const lissa = lissaRef.current?.getContext('2d')
        if (lissa) {
          const w = lissa.canvas.width || 400
          const h = lissa.canvas.height || 200
          lissa.fillStyle = '#060a18'
          lissa.fillRect(0, 0, w, h)
          lissa.beginPath()
          lissa.strokeStyle = '#5eead4'
          lissa.lineWidth = 1.5
          for (let i = 0; i < Math.min(512, w); i += 2) {
            const idx = (i * 4) & 2047
            const x = (visualL[idx] * 0.5 + 0.5) * w
            const y = (1 - (visualR[idx] * 0.5 + 0.5)) * h
            if (i === 0) lissa.moveTo(x, y)
            else lissa.lineTo(x, y)
          }
          lissa.stroke()
        }
      }

      if (visualizerType === 'diagram') {
        const diagram = diagramRef.current?.getContext('2d')
        if (diagram) {
          const w = diagram.canvas.width || 800
          const h = diagram.canvas.height || 400
          const cellW = w / 256
          const cellH = h / 8
          
          if (diagramMode === 'drawing') {
            const history = drawingHistoryRef.current
            const sampleCursor = sampleCursorRef.current
            
            diagram.fillStyle = 'rgba(10, 10, 18, 0.15)'
            diagram.fillRect(0, 0, w, h)
            
            if (history.length > 1) {
              for (let i = 1; i < history.length; i++) {
                const age = (sampleCursor - history[i].sample) / sampleRate
                const alpha = Math.max(0, 1 - age * 2)
                if (alpha <= 0) continue
                
                const hue = (history[i].hue + drawingGradientRef.current) % 360
                const x = ((i / history.length) * w) % w
                const prevX = (((i - 1) / history.length) * w) % w
                
                const y1 = h / 2 - (history[i - 1].value * h / 2)
                const y2 = h / 2 - (history[i].value * h / 2)
                
                diagram.beginPath()
                diagram.strokeStyle = `hsla(${hue}, 85%, 60%, ${alpha})`
                diagram.lineWidth = 2 + (1 - age) * 2
                diagram.lineCap = 'round'
                diagram.moveTo(prevX, y1)
                diagram.lineTo(x, y2)
                diagram.stroke()
              }
            }
            
            if (visualLRef.current.length > 0) {
              const latestVal = visualLRef.current[0]
              const byteVal = ((latestVal + 1) * 127.5) | 0
              const normVal = byteVal / 255
              history.push({ sample: sampleCursor, value: normVal, hue: (byteVal / 255) * 120 + 180 })
              drawingGradientRef.current = (drawingGradientRef.current + 0.5) % 360
              
              while (history.length > 2000 && history[0].sample < sampleCursor - sampleRate * 2) {
                history.shift()
              }
            }
            
            diagram.strokeStyle = 'rgba(255, 80, 80, 0.6)'
            diagram.lineWidth = 1
            diagram.setLineDash([5, 5])
            diagram.beginPath()
            diagram.moveTo(w - 2, 0)
            diagram.lineTo(w - 2, h)
            diagram.stroke()
            diagram.setLineDash([])
            
          } else {
            diagram.fillStyle = '#0a0a12'
            diagram.fillRect(0, 0, w, h)
            
            const diagramData = diagramDataRef.current
            
            for (let x = 0; x < 256; x++) {
              const idx = (x * 8) & 2047
              const val = visualL[idx]
              const byteVal = ((val + 1) * 127.5) | 0
              
              if (byteVal > 0) {
                const hue = 180 + (byteVal / 255) * 120
                const brightness = 45 + (byteVal / 255) * 15
                diagram.fillStyle = `hsla(${hue}, 80%, ${brightness}%, 0.9)`
                const barHeight = (byteVal / 255) * h
                diagram.fillRect(x * cellW, h - barHeight, Math.ceil(cellW), barHeight)
              }
            }
            
            diagram.strokeStyle = 'rgba(255,255,255,0.12)'
            diagram.lineWidth = 1
            for (let y = 1; y < 8; y++) {
              diagram.beginPath()
              diagram.moveTo(0, y * cellH)
              diagram.lineTo(w, y * cellH)
              diagram.stroke()
            }
            
            diagram.fillStyle = 'rgba(255,255,255,0.5)'
            diagram.font = '10px monospace'
            diagram.fillText('7', 2, cellH - 2)
            diagram.fillText('0', 2, h - 2)
            
            if (diagramMode === 'waveform') {
              diagram.strokeStyle = 'rgba(99, 102, 241, 0.7)'
              diagram.lineWidth = 2
              diagram.beginPath()
              for (let x = 0; x < 256; x++) {
                const idx = (x * 8) & 2047
                const val = ((visualL[idx] + 1) * 127.5) | 0
                const y = h - (val / 255) * h
                if (x === 0) diagram.moveTo(x * (w / 256), y)
                else diagram.lineTo(x * (w / 256), y)
              }
              diagram.stroke()
            } else if (diagramMode === 'spectrum') {
              const freq = new Uint8Array(64)
              try {
                analyserRef.current.getByteFrequencyData(freq)
              } catch (e) {}
              
              const barWidth = w / 64
              for (let i = 0; i < 64; i++) {
                const val = freq[i]
                const barHeight = (val / 255) * h * 0.9
                const hue = (i / 64) * 300
                diagram.fillStyle = `hsla(${hue}, 70%, 55%, 0.8)`
                diagram.fillRect(i * barWidth, h - barHeight, barWidth - 1, barHeight)
              }
            }
            
            const currentPos = (sampleCursorRef.current / sampleRate * 60) % 256
            diagram.strokeStyle = 'rgba(255, 80, 80, 0.8)'
            diagram.lineWidth = 2
            diagram.beginPath()
            diagram.moveTo(currentPos * (w / 256), 0)
            diagram.lineTo(currentPos * (w / 256), h)
            diagram.stroke()
          }
        }
      }
    }

    draw(0)

    return function cleanup() {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [visualizerType, diagramMode, timeDisplayFormat, sampleRate])

  // Auto-compile on code change
  const lastCodeRef = useRef(code)
  useEffect(() => {
    if (code !== lastCodeRef.current) {
      lastCodeRef.current = code
      if (diagramMode === 'drawing') {
        drawingHistoryRef.current = []
      }
      const timer = setTimeout(() => {
        if (isPlayingRef.current && audioCtxRef.current) {
          sendToWorklet({
            setFunction: code,
            mode,
            sampleRate,
            sampleRatio: sampleRate / audioCtxRef.current.sampleRate
          })
        }
      }, 800)
      return () => clearTimeout(timer)
    }
  }, [code, mode, sampleRate, sendToWorklet])

  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        audioCtxRef.current.close()
        audioCtxRef.current = null
      }
      workletNodeRef.current = null
      analyserRef.current = null
      gainRef.current = null
    }
  }, [])

  // Sync position periodically while playing
  useEffect(() => {
    if (!sdk) return
    
    const interval = setInterval(() => {
      if (isPlayingRef.current && !isRemoteUpdateRef.current) {
        sdk.emitEvent('bytebeat:seek', {
          position: sampleCursorRef.current
        }, { serverRelay: true })
      }
    }, 500)
    
    return () => clearInterval(interval)
  }, [sdk])

  return (
    <div className="bytebeat-activity">
      <div className="bytebeat-header">
        <div className="bytebeat-title">
          <h1>Bytebeat Lab</h1>
          <span className="bytebeat-subtitle">Bytebeat • Floatbeat • Funcbeat</span>
        </div>
        <div className={`bytebeat-status ${status.toLowerCase()}`}>
          {status}
        </div>
        <div className="bytebeat-participants" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px', background: 'var(--volt-bg-tertiary)', borderRadius: '6px' }}>
          <span className="participant-count" style={{ fontSize: '12px', color: 'var(--volt-text-secondary)', fontWeight: 500 }}>
            {participants.length + 1} user{participants.length !== 0 ? 's' : ''} connected
          </span>
          <div className="participant-avatars" style={{ display: 'flex', gap: '2px' }}>
            <div 
              key="self" 
              className="participant-avatar active" 
              style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#5865f2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#fff', fontWeight: 600 }} 
              title="You"
            >
              {(username || 'Y')[0].toUpperCase()}
            </div>
            {participants.map(p => {
              const cursor = remoteCursors[p.id]
              return (
                <div 
                  key={p.id} 
                  className={`participant-avatar ${cursor ? 'active' : ''}`} 
                  style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#fff', fontWeight: 600 }} 
                  title={cursor ? `${p.username} - cursor at position ${cursor.position}` : p.username}
                >
                  {(p.username || 'U')[0].toUpperCase()}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="bytebeat-toolbar">
        <div className="bytebeat-vis-selector">
          <button
            className={visualizerType === 'grid' ? 'active' : ''}
            onClick={() => setVisualizerType('grid')}
          >
            Grid View
          </button>
          <button
            className={visualizerType === 'diagram' ? 'active' : ''}
            onClick={() => setVisualizerType('diagram')}
          >
            Diagram View
          </button>
        </div>
        {visualizerType === 'diagram' && (
          <div className="bytebeat-diagram-mode">
            <button
              className={diagramMode === 'drawing' ? 'active' : ''}
              onClick={() => { setDiagramMode('drawing'); drawingHistoryRef.current = [] }}
            >
              Drawing
            </button>
            <button
              className={diagramMode === 'waveform' ? 'active' : ''}
              onClick={() => setDiagramMode('waveform')}
            >
              Waveform
            </button>
            <button
              className={diagramMode === 'spectrum' ? 'active' : ''}
              onClick={() => setDiagramMode('spectrum')}
            >
              Spectrum
            </button>
            {diagramMode === 'drawing' && (
              <button onClick={() => drawingHistoryRef.current = []} title="Clear drawing">
                Clear
              </button>
            )}
          </div>
        )}
        <div className="bytebeat-time-display" onClick={() => {
          const formats = ['samples', 'seconds', 'mm:ss', 'hh:mm:ss']
          const idx = formats.indexOf(timeDisplayFormat)
          setTimeDisplayFormat(formats[(idx + 1) % formats.length])
          if (timeDisplayRef.current) {
            timeDisplayRef.current.textContent = 'T: ' + formatTime(sampleCursorRef.current, formats[(idx + 1) % formats.length], sampleRate)
          }
        }} title="Click to change format" ref={timeDisplayRef}>
          T: 0
        </div>
      </div>

      {visualizerType === 'grid' ? (
        <div className="bytebeat-visualizers">
          <canvas ref={scopeRef} width="400" height="200" className="bytebeat-canvas" />
          <canvas ref={barsRef} width="400" height="200" className="bytebeat-canvas" />
          <canvas ref={specRef} width="400" height="200" className="bytebeat-canvas" />
          <canvas ref={lissaRef} width="400" height="200" className="bytebeat-canvas" />
        </div>
      ) : (
        <div className="bytebeat-diagram-container" onClick={() => isPlayingRef.current ? pause() : play()}>
          <div className="bytebeat-canvas-wrapper">
            <canvas ref={diagramRef} width="800" height="400" className="bytebeat-canvas bytebeat-diagram" />
            <div className="bytebeat-canvas-overlay">
              <button className={`canvas-play-btn ${isPlaying ? 'playing' : ''}`}>
                {isPlaying ? '⏸' : '▶'}
              </button>
            </div>
            {isPlaying && <div className="bytebeat-time-cursor" style={{
              left: `${(sampleCursorRef.current / sampleRate * 60) % 256 / 256 * 100}%`
            }} />}
          </div>
          <div className="bytebeat-diagram-labels">
            <span>Bit 7 (MSB)</span>
            <span>Time →</span>
            <span>Bit 0 (LSB)</span>
          </div>
        </div>
      )}

      <div className="bytebeat-transport">
        <button className="primary" onClick={play}>
          Play
        </button>
        <button onClick={pause}>
          Pause
        </button>
        <button onClick={stop}>
          Stop
        </button>
        <button onClick={() => setShowLibrary(!showLibrary)}>
          Presets
        </button>
      </div>

      <div className="bytebeat-controls">
        <select 
          value={mode} 
          onChange={(e) => {
            setMode(e.target.value)
            broadcastChange({ code, mode: e.target.value, sampleRate, volume })
            if (isPlayingRef.current) {
              sendToWorklet({ mode: e.target.value })
            }
          }}
          style={syncFlash.mode ? { boxShadow: `0 0 10px 2px ${syncFlash.mode}`, transition: 'box-shadow 0.1s ease-out' } : {}}
        >
          {PLAYBACK_MODES.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <input
          type="number"
          value={sampleRate}
          onChange={(e) => {
            setSampleRate(Number(e.target.value))
            broadcastChange({ code, mode, sampleRate: Number(e.target.value), volume })
          }}
          min="1000"
          max="192000"
          style={syncFlash.sampleRate ? { boxShadow: `0 0 10px 2px ${syncFlash.sampleRate}`, transition: 'box-shadow 0.1s ease-out' } : {}}
        />
        <select
          value={sampleRate}
          onChange={(e) => {
            setSampleRate(Number(e.target.value))
            broadcastChange({ code, mode, sampleRate: Number(e.target.value), volume })
          }}
          style={syncFlash.sampleRate ? { boxShadow: `0 0 10px 2px ${syncFlash.sampleRate}`, transition: 'box-shadow 0.1s ease-out' } : {}}
        >
          <option value="8000">8000Hz</option>
          <option value="11025">11025Hz</option>
          <option value="16000">16000Hz</option>
          <option value="22050">22050Hz</option>
          <option value="32000">32000Hz</option>
          <option value="44100">44100Hz</option>
          <option value="48000">48000Hz</option>
          <option value="96000">96000Hz</option>
        </select>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={(e) => handleVolumeChange(Number(e.target.value))}
        />
        <span className="bytebeat-volume">{Math.round(volume * 100)}%</span>
      </div>

      {showLibrary && (
        <div className="modal-overlay" onClick={() => setShowLibrary(false)}>
          <div className="modal-content bytebeat-library-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Bytebeat Library</h2>
              <button className="modal-close" onClick={() => setShowLibrary(false)}>×</button>
            </div>
            <div className="bytebeat-library-content">
              <div className="bytebeat-library-grid">
                {BYTEBEAT_LIBRARY.map(preset => (
                  <button
                    key={preset.id}
                    onClick={() => loadPreset(preset)}
                  >
                    <span className="preset-name">{preset.name}</span>
                    <span className="preset-mode">{preset.mode}</span>
                  </button>
                ))}
              </div>
              <div className="bytebeat-library-credits">
                <a href="http://viznut.fi/demos/unix/bytebeat_formulas.txt" target="_blank" rel="noopener noreferrer">
                  Original formulas by Viznut ↗
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      <textarea
        value={code}
        onChange={(e) => {
          const newCode = e.target.value
          setCode(newCode)
          broadcastChange({ code: newCode, mode, sampleRate, volume })
          if (isPlayingRef.current && audioCtxRef.current) {
            sendToWorklet({
              setFunction: newCode,
              mode,
              sampleRate,
              sampleRatio: sampleRate / audioCtxRef.current.sampleRate
            })
          }
        }}
        onPaste={(e) => {
          e.preventDefault()
          const pastedText = e.clipboardData.getData('text/plain')
          const textarea = e.target
          const start = textarea.selectionStart
          const end = textarea.selectionEnd
          const currentCode = codeRef.current
          const before = currentCode.substring(0, start)
          const after = currentCode.substring(end)
          const newCode = before + pastedText + after
          setCode(newCode)
          
          const ownId = sdk?.session?.user?.id || sdk?.user?.id
          if (newCode.length > 48000) {
            const maxChunkSize = 48000
            const chunks = []
            for (let i = 0; i < newCode.length; i += maxChunkSize) {
              chunks.push(newCode.slice(i, i + maxChunkSize))
            }
            const chunkId = Date.now().toString(36)
            chunks.forEach((chunk, idx) => {
              setTimeout(() => {
                sdk.emitEvent('bytebeat:chunk', {
                  chunkId,
                  idx,
                  total: chunks.length,
                  chunk,
                  mode: idx === 0 ? mode : undefined,
                  sampleRate: idx === 0 ? sampleRate : undefined,
                  volume: idx === 0 ? volume : undefined,
                  userId: ownId
                }, { serverRelay: true })
              }, idx * 50)
            })
          } else {
            sdk.emitEvent('bytebeat:sync', { code: newCode, mode, sampleRate, volume, userId: ownId }, { serverRelay: true })
          }
          
          if (isPlayingRef.current && audioCtxRef.current) {
            sendToWorklet({
              setFunction: newCode,
              mode,
              sampleRate,
              sampleRatio: sampleRate / audioCtxRef.current.sampleRate
            })
          }
        }}
        onSelect={(e) => {
          emitCursor(e.target.selectionStart)
        }}
        onClick={(e) => {
          emitCursor(e.target.selectionStart)
        }}
        onKeyUp={(e) => {
          emitCursor(e.target.selectionStart)
        }}
        className="bytebeat-editor"
        style={syncFlash.code ? { boxShadow: `0 0 10px 2px ${syncFlash.code}`, transition: 'box-shadow 0.1s ease-out' } : {}}
      />

      {error && (
        <div className="bytebeat-error">
          {error}
        </div>
      )}

      <div className="bytebeat-help">
        Bytebeat → integer expressions using t • Floatbeat → -1..1 floating output • Funcbeat → JS returning a function
      </div>
    </div>
  )
}
