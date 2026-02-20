import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Mic, MicOff, Headphones, VolumeX, PhoneOff, Settings, Volume2, Video, VideoOff, Monitor, MonitorOff, Ghost, Music } from 'lucide-react'
import { useSocket } from '../contexts/SocketContext'
import { useAuth } from '../contexts/AuthContext'
import { settingsService } from '../services/settingsService'
import { soundService } from '../services/soundService'
import Avatar from './Avatar'
import VoiceFX from './VoiceFX'
import '../assets/styles/VoiceChannel.css'

// Fallback ICE servers used only before server provides its list
// Priority order: self-hosted STUN first, then Google's reliable STUN, then Open Relay Project TURN
// Once the server sends its ICE servers, we use ONLY those for consistency
const FALLBACK_ICE_SERVERS = [
  // Self-hosted STUN (volt.voltagechat.app)
  { urls: 'stun:volt.voltagechat.app:32768' },
  
  // Google's STUN servers - most reliable public STUN
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  
  // Additional reliable public STUN servers
  { urls: 'stun:stun.ekiga.net' },
  { urls: 'stun:stun.xten.com' },
  { urls: 'stun:stun.schlund.de' },
  
  // Open Relay Project - ONLY reliable free TURN service
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turns:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
]

const buildPeerConfig = (serverIceServers = []) => {
  // Use ONLY the server's ICE servers if available - this ensures everyone
  // uses the same configuration for consistent connectivity
  const iceServers = serverIceServers.length > 0 ? serverIceServers : FALLBACK_ICE_SERVERS
  
  const stunCount = iceServers.filter(s => s.urls.startsWith('stun')).length
  const turnCount = iceServers.filter(s => s.urls.startsWith('turn')).length
  const source = serverIceServers.length > 0 ? 'server' : 'fallback'
  console.log(`[WebRTC] Building peer config with ${iceServers.length} ICE servers from ${source} (${stunCount} STUN, ${turnCount} TURN)`)
  console.log(`[WebRTC] ICE servers:`, iceServers.map(s => s.urls))
  
  return {
    iceServers,
    bundlePolicy: 'max-bundle',   // all m-lines in one bundle — fixes m-line order errors
    rtcpMuxPolicy: 'require',
    iceCandidatePoolSize: 10,
    // FIX: Add more aggressive ICE settings for global connectivity
    iceTransports: 'all',         // Use all transport types (UDP, TCP, TLS)
    // Increase timeouts for global connections (high latency)
    // Note: These are not standard RTCConfig options but some browsers support them
  }
}

// Global flag to track if we're intentionally leaving the voice channel
// This prevents cleanup from emitting voice:leave when switching views
let isIntentionalLeave = false

export const setVoiceIntentionalLeave = (value) => {
  isIntentionalLeave = value
}

const VoiceChannel = ({ channel, joinKey, onLeave, isMuted: externalMuted, isDeafened: externalDeafened, onMuteChange, onDeafenChange, onOpenSettings, onParticipantsChange, onShowConnectionInfo }) => {
  const { socket, connected } = useSocket()
  const { user } = useAuth()
  const [participants, setParticipants] = useState([])
  const [localIsMuted, setLocalIsMuted] = useState(false)
  const [localIsDeafened, setLocalIsDeafened] = useState(false)
  const [isVideoOn, setIsVideoOn] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [localStream, setLocalStream] = useState(null)
  const [localVideoStream, setLocalVideoStream] = useState(null)
  const [screenStream, setScreenStream] = useState(null)
  const [connectionState, setConnectionState] = useState('connecting')
  const [speaking, setSpeaking] = useState({})
  // Per-peer WebRTC connection state: peerId -> 'connecting'|'connected'|'failed'|'disconnected'
  const [peerStates, setPeerStates] = useState({})
  
  // ICE connection info - track which ICE server we're connected to
  const [iceConnectionInfo, setIceConnectionInfo] = useState({
    selectedServer: null,
    candidatePairs: [],
    connectionType: null, // 'host', 'srflx', 'relay'
  })
  // VoiceFX state
  const [showVoiceFX, setShowVoiceFX] = useState(false)
  const [voiceFXEnabled, setVoiceFXEnabled] = useState(false)
  const [voiceFXEffect, setVoiceFXEffect] = useState('none')
  const [voiceFXParams, setVoiceFXParams] = useState({})
  const voiceFXNodesRef = useRef({})
  const voiceFXDryGainRef = useRef(null)
  const voiceFXWetGainRef = useRef(null)
  const voiceFXDestinationRef = useRef(null)
  const voiceFXSourceRef = useRef(null)
  const originalAudioTrackRef = useRef(null)
// Remote audio analysers for speaking detection: peerId -> { analyser, dataArray }
const remoteAnalysersRef = useRef({})
// Local per-user overrides: { [userId]: { muted: bool, volume: 0-100 } }
const [localUserSettings, setLocalUserSettings] = useState(() => {
  try { return JSON.parse(localStorage.getItem('voltchat_local_user_settings')) || {} } catch { return {} }
})
// Right-click context menu state
const [participantMenu, setParticipantMenu] = useState(null) // { userId, username, x, y }
// Video stream management state
const [videoStreams, setVideoStreams] = useState({})
  const peerConnections = useRef({})   // peerId -> RTCPeerConnection
  const remoteStreams = useRef({})
  const audioElements = useRef({})
  const videoElements = useRef({})
  const localVideoRef = useRef(null)
  const analyserRef = useRef(null)
  const channelIdRef = useRef(channel?.id)
  const localStreamRef = useRef(null)
  const localVideoStreamRef = useRef(null)
  const screenStreamRef = useRef(null)
  const hasJoinedRef = useRef(false)
  const hasLeftRef = useRef(false)
  const isInitializingRef = useRef(false)
  const initializedChannelIdRef = useRef(null)

  // Perfect negotiation state per peer
  const makingOfferRef  = useRef({})   // peerId -> bool
  const ignoreOfferRef  = useRef({})   // peerId -> bool
  const remoteDescSetRef = useRef({})  // peerId -> bool
  const pendingCandidatesRef = useRef({}) // peerId -> RTCIceCandidateInit[]
  const lastOfferTimeRef = useRef({})  // peerId -> timestamp of last offer received
  const negotiationLockRef = useRef({}) // peerId -> bool (prevents concurrent negotiations)
  const negotiationCompleteRef = useRef({}) // peerId -> bool (track if initial negotiation done)

  // ICE server list received from the Voltage server on voice:participants
  const serverIceServersRef = useRef([])
  
  // Notify parent of participants changes (for sidebar display)
  useEffect(() => {
    onParticipantsChange?.(channel?.id, participants)
  }, [participants, channel?.id])

  // Apply local user setting (volume/mute) to a peer's audio element
  const applyLocalUserSetting = useCallback((userId, settings) => {
    const el = audioElements.current[userId]
    if (!el) return
    el.muted = settings.muted ?? false
    el.volume = Math.max(0, Math.min(1, (settings.volume ?? 100) / 100))
  }, [])

  const setLocalUserSetting = useCallback((userId, patch) => {
    setLocalUserSettings(prev => {
      const next = { ...prev, [userId]: { ...(prev[userId] || { muted: false, volume: 100 }), ...patch } }
      try { localStorage.setItem('voltchat_local_user_settings', JSON.stringify(next)) } catch {}
      applyLocalUserSetting(userId, next[userId])
      return next
    })
  }, [applyLocalUserSetting])

  // Apply VoiceFX effect to the audio chain
  const applyVoiceFXEffect = useCallback((effectName, effectParams) => {
    console.log('[VoiceFX] Applying effect:', effectName, effectParams)
    
    const audioContext = analyserRef.current?.audioContext
    const source = voiceFXSourceRef.current
    const destination = voiceFXDestinationRef.current
    const dryGain = voiceFXDryGainRef.current
    const wetGain = voiceFXWetGainRef.current
    
    if (!audioContext || !source || !destination || !dryGain || !wetGain) {
      console.log('[VoiceFX] Missing audio nodes, cannot apply effect')
      return
    }

    // Stop any oscillators BEFORE clearing nodes
    const nodes = voiceFXNodesRef.current
    const oscNames = [
      'osc', 'lfo', 'robotOsc', 'robotLfo', 'robotMod', 'alienOsc', 'alienOsc1', 'alienOsc2', 'alienOsc3',
      'tremoloLfo', 'vibratoLfo', 'chorusLfo0', 'chorusLfo1', 'chorusLfo2', 'flangerLfo'
    ]
    oscNames.forEach(name => {
      if (nodes[name]) {
        try { nodes[name].stop() } catch {}
      }
    })

    // Disconnect all existing effect nodes
    Object.values(nodes).forEach(node => {
      try { node.disconnect() } catch {}
    })
    voiceFXNodesRef.current = {}

    // Reset gains
    dryGain.disconnect()
    wetGain.disconnect()

    if (effectName === 'none' || !effectName) {
      // No effect - direct passthrough
      source.connect(dryGain)
      dryGain.connect(destination)
      dryGain.gain.value = 1
      wetGain.gain.value = 0
      
      // Replace with original track
      const originalTrack = originalAudioTrackRef.current
      if (originalTrack && localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach(t => localStreamRef.current.removeTrack(t))
        localStreamRef.current.addTrack(originalTrack)
        updateAllPeerTracks(originalTrack)
      }
      console.log('[VoiceFX] Effect disabled, using original audio')
      return
    }

    const wet = effectParams.wet ?? 0.5
    dryGain.gain.value = 1 - wet
    wetGain.gain.value = wet

    // Connect both dry and wet paths from source
    source.connect(dryGain)
    source.connect(wetGain)
    dryGain.connect(destination)

    // Build effect chain on wet path
    let wetChainEnd = wetGain
    
    switch (effectName) {
      case 'pitch': {
        const pitchValue = Math.max(0.25, Math.min(4, effectParams.pitch || 1))
        const sourceProcessor = audioContext.createScriptProcessor(4096, 1, 1)
        const BUFFER_SIZE = 8192
        const buffer = new Float32Array(BUFFER_SIZE * 2)
        let writePos = 0
        let readPos = 0
        let samplesInBuffer = 0
        
        sourceProcessor.onaudioprocess = (e) => {
          const inputData = e.inputBuffer.getChannelData(0)
          const outputData = e.outputBuffer.getChannelData(0)
          const bufferLen = buffer.length
          
          for (let i = 0; i < inputData.length; i++) {
            buffer[writePos] = inputData[i]
            writePos = (writePos + 1) % bufferLen
            if (samplesInBuffer < bufferLen) {
              samplesInBuffer++
            }
          }
          
          const step = pitchValue
          let outputIdx = 0
          
          while (outputIdx < outputData.length) {
            if (samplesInBuffer < 2) {
              outputData[outputIdx++] = 0
              continue
            }
            
            const r = Math.floor(readPos)
            const frac = readPos - r
            const r1 = r % bufferLen
            const r2 = (r + 1) % bufferLen
            
            outputData[outputIdx] = buffer[r1] * (1 - frac) + buffer[r2] * frac
            
            readPos += step
            outputIdx++
            
            while (readPos >= samplesInBuffer && samplesInBuffer > 0) {
              readPos -= samplesInBuffer
            }
          }
          
          readPos = readPos % bufferLen
        }
        
        wetGain.disconnect()
        wetGain.connect(sourceProcessor)
        sourceProcessor.connect(destination)
        voiceFXNodesRef.current.pitch = sourceProcessor
        break
      }
      case 'reverb': {
        const decay = effectParams.decay || 2
        const sampleRate = audioContext.sampleRate
        const length = sampleRate * decay
        const impulse = audioContext.createBuffer(2, length, sampleRate)
        
        for (let ch = 0; ch < 2; ch++) {
          const data = impulse.getChannelData(ch)
          for (let i = 0; i < length; i++) {
            const t = i / length
            const envelope = Math.exp(-3 * t)
            const diffusion = (Math.random() * 2 - 1) * 0.5
            const early = i < sampleRate * 0.1 ? Math.sin(i * 0.01) * 0.3 : 0
            data[i] = (diffusion + early) * envelope
          }
        }
        
        const convolver = audioContext.createConvolver()
        convolver.buffer = impulse
        
        const wet = audioContext.createGain()
        wet.gain.value = 0.6
        
        const dry = audioContext.createGain()
        dry.gain.value = 0.4
        
        wetGain.connect(convolver)
        convolver.connect(wet)
        wet.connect(destination)
        wetGain.connect(dry)
        dry.connect(destination)
        
        voiceFXNodesRef.current.reverb = convolver
        voiceFXNodesRef.current.reverbWet = wet
        voiceFXNodesRef.current.reverbDry = dry
        break
      }
      case 'delay': {
        const delayTime = effectParams.time || 0.3
        const feedback = effectParams.feedback || 0.4
        
        const delay1 = audioContext.createDelay(1)
        delay1.delayTime.value = delayTime
        
        const delay2 = audioContext.createDelay(1)
        delay2.delayTime.value = delayTime * 1.5
        
        const feedbackGain = audioContext.createGain()
        feedbackGain.gain.value = feedback
        
        const wet = audioContext.createGain()
        wet.gain.value = 0.5
        
        const dry = audioContext.createGain()
        dry.gain.value = 0.6
        
        wetGain.connect(delay1)
        wetGain.connect(delay2)
        delay1.connect(feedbackGain)
        delay2.connect(feedbackGain)
        feedbackGain.connect(delay1)
        feedbackGain.connect(delay2)
        delay1.connect(wet)
        delay2.connect(wet)
        wet.connect(destination)
        wetGain.connect(dry)
        dry.connect(destination)
        
        voiceFXNodesRef.current.delay1 = delay1
        voiceFXNodesRef.current.delay2 = delay2
        voiceFXNodesRef.current.feedback = feedbackGain
        break
      }
      case 'distortion': {
        const amount = effectParams.amount || 20
        const k = amount / 100
        const n_samples = 256
        const curve = new Float32Array(n_samples)
        
        for (let i = 0; i < n_samples; i++) {
          const x = (i * 2) / n_samples - 1
          if (x > 0) {
            curve[i] = 1 - Math.exp(-x / k)
          } else {
            curve[i] = -1 + Math.exp(x / k)
          }
        }
        
        const waveshaper = audioContext.createWaveShaper()
        waveshaper.curve = curve
        waveshaper.oversample = '4x'
        
        const drive = audioContext.createGain()
        drive.gain.value = 1 + amount / 20
        
        const output = audioContext.createGain()
        output.gain.value = 0.7
        
        wetGain.connect(drive)
        drive.connect(waveshaper)
        waveshaper.connect(output)
        output.connect(destination)
        
        voiceFXNodesRef.current.distortion = waveshaper
        voiceFXNodesRef.current.distortionDrive = drive
        break
      }
      case 'chorus': {
        const rate = effectParams.rate || 1.5
        const depth = effectParams.depth || 0.5
        
        const delays = []
        const lfos = []
        
        for (let i = 0; i < 3; i++) {
          const delay = audioContext.createDelay(1)
          delay.delayTime.value = 0.02 + i * 0.005
          
          const lfo = audioContext.createOscillator()
          lfo.type = 'sine'
          lfo.frequency.value = rate + i * 0.3
          
          const lfoGain = audioContext.createGain()
          lfoGain.gain.value = depth * 0.01
          
          lfo.connect(lfoGain)
          lfoGain.connect(delay.delayTime)
          
          wetGain.connect(delay)
          delay.connect(destination)
          
          lfo.start()
          
          delays.push(delay)
          lfos.push(lfo)
          voiceFXNodesRef.current[`chorusDelay${i}`] = delay
          voiceFXNodesRef.current[`chorusLfo${i}`] = lfo
        }
        break
      }
      case 'flanger': {
        const rate = effectParams.rate || 0.5
        const depth = effectParams.depth || 0.5
        
        const delay = audioContext.createDelay(1)
        delay.delayTime.value = 0.005
        
        const lfo = audioContext.createOscillator()
        lfo.type = 'sine'
        lfo.frequency.value = rate
        
        const lfoGain = audioContext.createGain()
        lfoGain.gain.value = depth * 0.004
        
        const feedback = audioContext.createGain()
        feedback.gain.value = 0.5
        
        lfo.connect(lfoGain)
        lfoGain.connect(delay.delayTime)
        
        wetGain.connect(delay)
        delay.connect(feedback)
        feedback.connect(delay)
        delay.connect(destination)
        
        lfo.start()
        
        voiceFXNodesRef.current.flangerDelay = delay
        voiceFXNodesRef.current.flangerLfo = lfo
        voiceFXNodesRef.current.flangerFeedback = feedback
        break
      }
      case 'tremolo': {
        const rate = effectParams.rate || 5
        const depth = effectParams.depth || 0.5
        
        const lfo = audioContext.createOscillator()
        lfo.type = 'sine'
        lfo.frequency.value = rate
        
        const lfoGain = audioContext.createGain()
        const baseGain = 1 - depth * 0.5
        lfoGain.gain.value = depth * 0.5
        
        const processor = audioContext.createScriptProcessor(2048, 1, 1)
        let phase = 0
        const twoPi = Math.PI * 2
        
        processor.onaudioprocess = (e) => {
          const input = e.inputBuffer.getChannelData(0)
          const output = e.outputBuffer.getChannelData(0)
          const phaseInc = twoPi * rate / audioContext.sampleRate
          
          for (let i = 0; i < input.length; i++) {
            const mod = baseGain + lfoGain.gain.value * Math.sin(phase)
            output[i] = input[i] * mod
            phase += phaseInc
            if (phase > twoPi) phase -= twoPi
          }
        }
        
        wetGain.connect(processor)
        processor.connect(destination)
        
        lfo.start()
        
        voiceFXNodesRef.current.tremoloLfo = lfo
        voiceFXNodesRef.current.tremoloProcessor = processor
        break
      }
      case 'vibrato': {
        const rate = effectParams.rate || 5
        const depth = effectParams.depth || 0.3
        
        const delay = audioContext.createDelay(1)
        delay.delayTime.value = 0.01
        
        const lfo = audioContext.createOscillator()
        lfo.type = 'sine'
        lfo.frequency.value = rate
        
        const lfoGain = audioContext.createGain()
        lfoGain.gain.value = depth * 0.02
        
        lfo.connect(lfoGain)
        lfoGain.connect(delay.delayTime)
        
        wetGain.connect(delay)
        delay.connect(destination)
        
        lfo.start()
        
        voiceFXNodesRef.current.vibratoLfo = lfo
        voiceFXNodesRef.current.vibratoDelay = delay
        break
      }
      case 'robot': {
        const freq = effectParams.freq || 55
        const modDepth = effectParams.modDepth || 0.7
        
        const osc = audioContext.createOscillator()
        osc.type = 'square'
        osc.frequency.value = freq
        
        const processor = audioContext.createScriptProcessor(2048, 1, 1)
        let phase = 0
        const twoPi = Math.PI * 2
        
        processor.onaudioprocess = (e) => {
          const input = e.inputBuffer.getChannelData(0)
          const output = e.outputBuffer.getChannelData(0)
          const phaseInc = twoPi * freq / audioContext.sampleRate
          
          for (let i = 0; i < input.length; i++) {
            const mod = (1 - modDepth) + modDepth * Math.sin(phase)
            output[i] = input[i] * mod
            phase += phaseInc
            if (phase > twoPi) phase -= twoPi
          }
        }
        
        const filter = audioContext.createBiquadFilter()
        filter.type = 'lowpass'
        filter.frequency.value = 2500
        filter.Q.value = 3
        
        wetGain.connect(processor)
        processor.connect(filter)
        filter.connect(destination)
        
        osc.start()
        
        voiceFXNodesRef.current.robotOsc = osc
        voiceFXNodesRef.current.robotProcessor = processor
        voiceFXNodesRef.current.robotFilter = filter
        break
      }
      case 'alien': {
        const freq = effectParams.freq || 100
        const wetValue = effectParams.wet || 0.6
        
        const osc = audioContext.createOscillator()
        osc.type = 'sine'
        osc.frequency.value = freq
        
        const processor = audioContext.createScriptProcessor(2048, 1, 1)
        let phase = 0
        const twoPi = Math.PI * 2
        
        processor.onaudioprocess = (e) => {
          const input = e.inputBuffer.getChannelData(0)
          const output = e.outputBuffer.getChannelData(0)
          const phaseInc = twoPi * freq / audioContext.sampleRate
          const mix1 = 1 - wetValue
          const mix2 = wetValue
          
          for (let i = 0; i < input.length; i++) {
            const mod = Math.sin(phase)
            const dry = input[i] * mix1
            const wet = input[i] * mod * mix2
            output[i] = dry + wet
            phase += phaseInc
            if (phase > twoPi) phase -= twoPi
          }
        }
        
        const highpass = audioContext.createBiquadFilter()
        highpass.type = 'highpass'
        highpass.frequency.value = 200
        
        const lowpass = audioContext.createBiquadFilter()
        lowpass.type = 'lowpass'
        lowpass.frequency.value = 4000
        
        wetGain.connect(processor)
        processor.connect(highpass)
        highpass.connect(lowpass)
        lowpass.connect(destination)
        
        osc.start()
        
        voiceFXNodesRef.current.alienOsc = osc
        voiceFXNodesRef.current.alienProcessor = processor
        break
      }
      case 'radio': {
        const highpass = audioContext.createBiquadFilter()
        highpass.type = 'highpass'
        highpass.frequency.value = 400
        
        const lowpass = audioContext.createBiquadFilter()
        lowpass.type = 'lowpass'
        lowpass.frequency.value = 2600
        
        const bandpass = audioContext.createBiquadFilter()
        bandpass.type = 'bandpass'
        bandpass.frequency.value = 1200
        bandpass.Q.value = 1
        
        const compressor = audioContext.createDynamicsCompressor()
        compressor.threshold.value = -20
        compressor.knee.value = 10
        compressor.ratio.value = 4
        compressor.attack.value = 0.005
        compressor.release.value = 0.1
        
        const processor = audioContext.createScriptProcessor(2048, 1, 1)
        processor.onaudioprocess = (e) => {
          const input = e.inputBuffer.getChannelData(0)
          const output = e.outputBuffer.getChannelData(0)
          
          for (let i = 0; i < input.length; i++) {
            const s = input[i]
            output[i] = Math.tanh(s * 2) * 0.8
          }
        }
        
        wetGain.connect(highpass)
        highpass.connect(lowpass)
        lowpass.connect(bandpass)
        bandpass.connect(compressor)
        compressor.connect(processor)
        processor.connect(destination)
        
        voiceFXNodesRef.current.radioHighpass = highpass
        voiceFXNodesRef.current.radioLowpass = lowpass
        voiceFXNodesRef.current.radioBand = bandpass
        voiceFXNodesRef.current.radioCompressor = compressor
        break
      }
      case 'vocoder': {
        const processor = audioContext.createScriptProcessor(4096, 1, 1)
        
        const bandFreqs = [300, 500, 700, 1000, 1400, 2000, 2800, 4000]
        
        const filters = bandFreqs.map(freq => {
          const filter = audioContext.createBiquadFilter()
          filter.type = 'bandpass'
          filter.frequency.value = freq
          filter.Q.value = 8
          return filter
        })
        
        const envs = new Array(bandFreqs.length).fill(0)
        const envAttack = 0.15
        const envRelease = 0.3
        
        processor.onaudioprocess = (e) => {
          const input = e.inputBuffer.getChannelData(0)
          const output = e.outputBuffer.getChannelData(0)
          const frameSize = Math.floor(input.length / bandFreqs.length)
          
          for (let b = 0; b < bandFreqs.length; b++) {
            let sum = 0
            const start = b * frameSize
            const end = Math.min(start + frameSize, input.length)
            for (let i = start; i < end; i++) {
              sum += Math.abs(input[i])
            }
            const level = sum / (end - start)
            
            const target = level * 4
            if (target > envs[b]) {
              envs[b] = envs[b] + (target - envs[b]) * envAttack
            } else {
              envs[b] = envs[b] + (target - envs[b]) * envRelease
            }
          }
          
          for (let i = 0; i < output.length; i++) {
            const bandIdx = Math.floor((i / input.length) * bandFreqs.length)
            const env = envs[Math.min(bandIdx, bandFreqs.length - 1)]
            output[i] = input[i] * (0.3 + env * 0.7) * 0.8
          }
        }
        
        wetGain.connect(processor)
        processor.connect(destination)
        
        voiceFXNodesRef.current.vocoderProcessor = processor
        break
      }
      case 'phone': {
        const lowpass = audioContext.createBiquadFilter()
        lowpass.type = 'lowpass'
        lowpass.frequency.value = 1800
        
        const highpass = audioContext.createBiquadFilter()
        highpass.type = 'highpass'
        highpass.frequency.value = 300
        
        const processor = audioContext.createScriptProcessor(2048, 1, 1)
        processor.onaudioprocess = (e) => {
          const input = e.inputBuffer.getChannelData(0)
          const output = e.outputBuffer.getChannelData(0)
          
          for (let i = 0; i < input.length; i++) {
            output[i] = Math.round(input[i] * 127) / 128
          }
        }
        
        wetGain.connect(highpass)
        highpass.connect(lowpass)
        lowpass.connect(processor)
        processor.connect(destination)
        
        voiceFXNodesRef.current.phoneLowpass = lowpass
        voiceFXNodesRef.current.phoneHighpass = highpass
        break
      }
      default:
        break
    }

    // Get the processed audio track and replace in stream + peers
    const processedTrack = destination.stream.getAudioTracks()[0]
    if (!processedTrack) {
      console.warn('[VoiceFX] No processed track found in destination stream')
      return
    }
    if (localStreamRef.current) {
      // Replace in local stream
      localStreamRef.current.getAudioTracks().forEach(t => localStreamRef.current.removeTrack(t))
      localStreamRef.current.addTrack(processedTrack)
      setLocalStream(localStreamRef.current)
      
      // Update all peer connections
      updateAllPeerTracks(processedTrack)
    }
    
    console.log('[VoiceFX] Applied effect:', effectName)
  }, [])

  // Helper to update all peer connections with a new audio track
  const updateAllPeerTracks = useCallback((track) => {
    Object.values(peerConnections.current).forEach(pc => {
      try {
        const senders = pc.getSenders()
        const audioSender = senders.find(s => s.track?.kind === 'audio')
        if (audioSender && track) {
          audioSender.replaceTrack(track).catch(() => {})
        }
      } catch (e) {
        console.warn('[VoiceFX] Failed to update peer track:', e)
      }
    })
  }, [])

  // Re-apply saved local user settings whenever audio elements are (re)created
  useEffect(() => {
    Object.entries(localUserSettings).forEach(([userId, settings]) => {
      applyLocalUserSetting(userId, settings)
    })
  }, [peerStates]) // runs when peer connections change

  // Live settings — apply output volume + output device changes immediately
  useEffect(() => {
    const unsub = settingsService.subscribe((newSettings) => {
      const vol = Math.max(0, Math.min(1, (newSettings.volume ?? 100) / 100))
      // Apply to all active remote audio elements
      Object.entries(audioElements.current).forEach(([key, el]) => {
        if (key.includes('__webaudio')) return
        if (el instanceof HTMLMediaElement) {
          el.volume = vol
          // Switch output device if supported (Chrome/Edge)
          if (newSettings.outputDevice && newSettings.outputDevice !== 'default' && el.setSinkId) {
            el.setSinkId(newSettings.outputDevice).catch(() => {})
          }
        }
      })
      // Apply input volume via gain node if available
      if (analyserRef.current?.gainNode) {
        analyserRef.current.gainNode.gain.value = Math.max(0, Math.min(2, (newSettings.inputVolume ?? 100) / 100))
      }
    })
    return unsub
  }, [])

  // When externalDeafened changes (e.g. from sidebar button), apply audio muting
  useEffect(() => {
    if (externalDeafened === undefined) return
    const deafened = externalDeafened
    Object.entries(audioElements.current).forEach(([key, el]) => {
      if (key.includes('__webaudio')) return
      if (el instanceof HTMLMediaElement) el.muted = deafened
    })
    if (deafened) {
      localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = false })
    } else {
      // Restore mic based on current mute state
      const muted = externalMuted !== undefined ? externalMuted : localIsMuted
      localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !muted })
    }
  }, [externalDeafened])

  // Keep refs updated
  useEffect(() => {
    channelIdRef.current = channel?.id
  }, [channel?.id])
  
  useEffect(() => {
    localStreamRef.current = localStream
  }, [localStream])

  useEffect(() => {
    localVideoStreamRef.current = localVideoStream
  }, [localVideoStream])

  useEffect(() => {
    screenStreamRef.current = screenStream
  }, [screenStream])

  // Determine if we are the "polite" peer — lower user ID loses a collision
  const isPolite = useCallback((remoteId) => {
    return (user?.id || '') < remoteId
  }, [user?.id])

  // Tiered connection management helpers for scaling to 100 peers
  const getTierConfig = useCallback(() => {
    const peerCount = Object.keys(peerConnections.current).length + connectionQueueRef.current.length
    if (peerCount <= TIER_CONFIG.small.maxPeers) return TIER_CONFIG.small
    if (peerCount <= TIER_CONFIG.medium.maxPeers) return TIER_CONFIG.medium
    if (peerCount <= TIER_CONFIG.large.maxPeers) return TIER_CONFIG.large
    return TIER_CONFIG.massive
  }, [])

  // Always accept all peer connections - no limit
  const canAcceptPeer = useCallback((peerId) => {
    return true
  }, [])

  // Report peer connection state to server for consensus monitoring
  const reportPeerState = useCallback((targetPeerId, state) => {
    if (!socket?.connected || !channelIdRef.current) return
    socket.emit('voice:peer-state-report', {
      channelId: channelIdRef.current,
      targetPeerId,
      state,
      timestamp: Date.now()
    })
  }, [socket])

  // Multi-peer connection management for stability - supports up to 100 peers
  const connectionQueueRef = useRef([])      // Queue of peer IDs waiting to connect
  const isProcessingQueueRef = useRef(false) // Whether currently processing queue
  const activeNegotiationsRef = useRef(0)    // Current active negotiations
  const connectionCooldownsRef = useRef(new Map()) // peerId -> timestamp of last attempt
  const isMassJoinInProgressRef = useRef(false) // Flag for batch processing
  const pendingPeerCountRef = useRef(0)      // Track expected peer count during mass joins

  // Tiered configuration for scaling to 100+ peers
  const TIER_CONFIG = {
    small: { maxPeers: 10, concurrent: 2, cooldown: 1000, staggerBase: 400, staggerPerPeer: 300, batchSize: 10 },
    medium: { maxPeers: 25, concurrent: 2, cooldown: 1500, staggerBase: 800, staggerPerPeer: 500, batchSize: 15 },
    large: { maxPeers: 50, concurrent: 1, cooldown: 2000, staggerBase: 1500, staggerPerPeer: 700, batchSize: 20 },
    massive: { maxPeers: 100, concurrent: 1, cooldown: 3000, staggerBase: 2500, staggerPerPeer: 900, batchSize: 25 }
  }

  // No peer limit - allow all connections
  const priorityPeersRef = useRef(new Set()) // High priority peer IDs (speakers)

  const createPeerConnection = useCallback((targetUserId) => {
    // Destroy stale closed/failed connection before creating a new one
    const existing = peerConnections.current[targetUserId]
    if (existing) {
      const state = existing.connectionState
      if (state !== 'closed' && state !== 'failed') return existing
      try { existing.close() } catch {}
    }

    // Reset perfect-negotiation state for this peer
    makingOfferRef.current[targetUserId]    = false
    ignoreOfferRef.current[targetUserId]    = false
    remoteDescSetRef.current[targetUserId]  = false
    pendingCandidatesRef.current[targetUserId] = []
    negotiationCompleteRef.current[targetUserId] = false

    const pc = new RTCPeerConnection(buildPeerConfig(serverIceServersRef.current))
    peerConnections.current[targetUserId] = pc

    // --- ICE candidates ---
    pc.onicecandidate = (event) => {
      if (!event.candidate || !channelIdRef.current) return
      socket?.emit('voice:ice-candidate', {
        to: targetUserId,
        candidate: event.candidate.toJSON(),
        channelId: channelIdRef.current
      })
    }

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE state with ${targetUserId}:`, pc.iceConnectionState)
      if (pc.iceConnectionState === 'failed') {
        console.log(`[WebRTC] ICE failed with ${targetUserId} — restarting ICE`)
        pc.restartIce()
      }
      if (pc.iceConnectionState === 'disconnected') {
        // Browser may recover on its own; give it 4 s then restart ICE
        const pcAtCheck = pc
        setTimeout(() => {
          if (pcAtCheck.iceConnectionState === 'disconnected' ||
              pcAtCheck.iceConnectionState === 'failed') {
            console.log(`[WebRTC] ICE still disconnected for ${targetUserId} — restarting`)
            pcAtCheck.restartIce()
          }
        }, 4000)
      }
    }

    // Track selected ICE candidate pair for connection info display
    pc.onicecandidatepair = (event) => {
      if (event && event.candidatePair) {
        const pair = event.candidatePair
        const selectedServer = pair.remote?.candidate || pair.local?.candidate || null
        let connectionType = 'unknown'
        
        // Determine connection type from candidate types
        if (selectedServer) {
          const candType = pair.remote?.candidate?.type || pair.local?.candidate?.type
          if (candType === 'host') connectionType = 'host'
          else if (candType === 'srflx') connectionType = 'srflx'  // Server reflexive (STUN)
          else if (candType === 'relay') connectionType = 'relay'  // TURN relay
        }
        
        // Update ICE connection info
        const iceInfo = {
          selectedServer: selectedServer?.split(' ')[4] || selectedServer?.split(' ')[5] || 'unknown',
          candidatePairs: [...iceConnectionInfo.candidatePairs, {
            local: pair.local?.candidate?.ip || 'unknown',
            remote: pair.remote?.candidate?.ip || 'unknown',
            type: connectionType,
            state: pair.state
          }].slice(-10), // Keep last 10
          connectionType
        }
        setIceConnectionInfo(iceInfo)
        console.log(`[WebRTC] ICE candidate pair selected for ${targetUserId}: ${connectionType} (${iceInfo.selectedServer})`)
      }
    }

    pc.onicegatheringstatechange = () => {
      console.log(`[WebRTC] ICE gathering with ${targetUserId}:`, pc.iceGatheringState)
    }

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState
      console.log(`[WebRTC] Connection state with ${targetUserId}:`, s)

      // Mirror into React state so the UI reflects real peer status
      setPeerStates(prev => ({ ...prev, [targetUserId]: s }))

      // Report peer state to server for consensus monitoring
      reportPeerState(targetUserId, s)

      if (s === 'connected') {
        const receivers = pc.getReceivers()
        receivers.forEach(r => {
          const t = r.track
          console.log(`[WebRTC] Receiver track: kind=${t?.kind} id=${t?.id?.slice(0,8)} readyState=${t?.readyState} enabled=${t?.enabled} muted=${t?.muted}`)
        })

        // If this PC connected but we have no audio element yet (ontrack fired on
        // a previous PC that was replaced), build the audio pipeline from the
        // receivers directly.  This handles the renegotiation case where the bot
        // creates a new RTCPeerConnection after a collision, and ontrack fires
        // again — but also the case where it doesn't because receivers were
        // inherited from the old PC.
        const audioReceiver = receivers.find(r => r.track?.kind === 'audio')
        if (audioReceiver) {
          const track = audioReceiver.track
          let stream = remoteStreams.current[targetUserId]
          if (!stream) {
            stream = new MediaStream([track])
            remoteStreams.current[targetUserId] = stream
          } else if (!stream.getTracks().find(t => t.id === track.id)) {
            stream.addTrack(track)
          }

          let audio = audioElements.current[targetUserId]
          if (!audio) {
            audio = document.createElement('audio')
            audio.autoplay = true
            audio.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none;opacity:0'
            document.body.appendChild(audio)
            audioElements.current[targetUserId] = audio
            console.log(`[WebRTC] Created audio element on connect for ${targetUserId}`)
          }

          const settings = settingsService.getSettings()
          audio.srcObject = stream
          audio.volume = Math.max(0, Math.min(1, (settings.volume ?? 100) / 100))
          audio.muted = false

          console.log(`[WebRTC] Audio element on connect: paused=${audio.paused} volume=${audio.volume} trackMuted=${track.muted}`)

          const tryPlay = () => {
            audio.play().then(() => {
              console.log(`[WebRTC] play() OK on connect for ${targetUserId}`)
            }).catch(err => {
              console.warn(`[WebRTC] play() blocked on connect: ${err.message}`)
              const retry = () => {
                audio.play().catch(() => {})
                document.removeEventListener('pointerdown', retry, true)
                document.removeEventListener('keydown', retry, true)
              }
              document.addEventListener('pointerdown', retry, true)
              document.addEventListener('keydown', retry, true)
            })
          }

          track.onunmute = () => {
            console.log(`[WebRTC] track.onunmute on connect for ${targetUserId}`)
            audio.srcObject = stream
            tryPlay()
          }

          if (!track.muted) tryPlay()

          // Ensure the audio element is playing when we reach connected state.
          // This handles the case where onunmute fired before connection was ready.
          const audioEl = audioElements.current[targetUserId]
          if (audioEl && audioEl.paused) {
            audioEl.play().catch(() => {})
          }
        } else {
          console.warn(`[WebRTC] No audio receiver found for ${targetUserId} at connected state`)
        }
      }
      if (s === 'failed') {
        console.log(`[WebRTC] Connection failed with ${targetUserId} — will wait for peer to reconnect`)
        // Don't auto-reconnect - the peer who initiated will retry, or we'll get an offer from them
        try { pc.close() } catch {}
        delete peerConnections.current[targetUserId]
        makingOfferRef.current[targetUserId] = false
        ignoreOfferRef.current[targetUserId] = false
        remoteDescSetRef.current[targetUserId] = false
      }
      // Handle 'new' state that gets stuck - just restart ICE
      if (s === 'new') {
        console.log(`[WebRTC] Connection stuck in 'new' state for ${targetUserId} — restarting ICE`)
        pc.restartIce()
      }
      if (s === 'closed') {
        delete peerConnections.current[targetUserId]
        setTimeout(() => {
          setPeerStates(prev => {
            const next = { ...prev }
            delete next[targetUserId]
            return next
          })
        }, 1000)
      }
    }

    // --- Perfect negotiation: onnegotiationneeded ---
    // This fires when tracks are added/removed. We need to handle both initial
    // negotiation and track-change renegotiations.
    pc.onnegotiationneeded = async () => {
      // Skip if offer already in flight
      if (makingOfferRef.current[targetUserId]) {
        console.log(`[WebRTC] Skipping onnegotiationneeded for ${targetUserId} — offer in flight`)
        return
      }
      // Skip if not in stable state (e.g. waiting for an answer)
      if (pc.signalingState !== 'stable') {
        console.log(`[WebRTC] Skipping onnegotiationneeded for ${targetUserId} — state: ${pc.signalingState}`)
        return
      }
      try {
        makingOfferRef.current[targetUserId] = true
        const offer = await pc.createOffer()
        // Re-check state after async createOffer — may have changed
        if (pc.signalingState !== 'stable') {
          console.log(`[WebRTC] Aborting offer for ${targetUserId} — state changed to ${pc.signalingState}`)
          return
        }
        await pc.setLocalDescription(offer)
        socket?.emit('voice:offer', {
          to: targetUserId,
          offer: pc.localDescription,
          channelId: channelIdRef.current
        })
        console.log(`[WebRTC] Sent offer to ${targetUserId} (connectionState: ${pc.connectionState})`)
        negotiationCompleteRef.current[targetUserId] = true
      } catch (err) {
        console.error(`[WebRTC] onnegotiationneeded error for ${targetUserId}:`, err.message)
      } finally {
        makingOfferRef.current[targetUserId] = false
      }
    }

    // --- Incoming tracks ---
    pc.ontrack = (event) => {
      const track = event.track
      console.log(`[WebRTC] ontrack from ${targetUserId}: kind=${track.kind} readyState=${track.readyState} streams=${event.streams.length} enabled=${track.enabled} muted=${track.muted}`)

      // Use event.streams[0] if present; otherwise build a synthetic stream from the track.
      // @roamhq/wrtc (bot) may send addTrack(track) without a stream, giving event.streams=[].
      let remoteStream = event.streams[0]
      if (!remoteStream) {
        console.log(`[WebRTC] No stream in event for ${targetUserId}, building synthetic MediaStream`)
        if (!remoteStreams.current[targetUserId]) {
          remoteStreams.current[targetUserId] = new MediaStream()
        }
        remoteStream = remoteStreams.current[targetUserId]
        if (!remoteStream.getTracks().find(t => t.id === track.id)) {
          remoteStream.addTrack(track)
          console.log(`[WebRTC] Added track to synthetic stream for ${targetUserId}, stream tracks:`, remoteStream.getTracks().length)
        }
      } else {
        remoteStreams.current[targetUserId] = remoteStream
        console.log(`[WebRTC] Using stream from event for ${targetUserId}, stream active=${remoteStream.active} tracks=${remoteStream.getTracks().length}`)
      }

      if (track.kind === 'audio') {
        const settings = settingsService.getSettings()
        console.log(`[WebRTC] Audio track: readyState=${track.readyState} trackMuted=${track.muted} enabled=${track.enabled} volume=${settings.volume}`)

        // Create or reuse a DOM-attached audio element.
        // DOM-attached elements satisfy autoplay policy and persist.
        let audio = audioElements.current[targetUserId]
        if (!audio) {
          audio = document.createElement('audio')
          audio.autoplay = true
          audio.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none;opacity:0'
          document.body.appendChild(audio)
          audioElements.current[targetUserId] = audio
          console.log(`[WebRTC] Created DOM audio element for ${targetUserId}`)
        }

        audio.srcObject = remoteStream
        audio.volume    = Math.max(0, Math.min(1, (settings.volume ?? 100) / 100))
        audio.muted     = false

        console.log(`[WebRTC] Audio element: volume=${audio.volume} trackMuted=${track.muted}`)

        // Helper — call play() and retry on autoplay rejection
        const tryPlay = () => {
          if (audio.srcObject !== remoteStream) audio.srcObject = remoteStream
          audio.play().then(() => {
            console.log(`[WebRTC] play() OK for ${targetUserId} readyState=${audio.readyState}`)
          }).catch(err => {
            console.warn(`[WebRTC] play() blocked: ${err.message} — retrying on next gesture`)
            const retry = () => {
              audio.play().catch(e2 => console.warn(`[WebRTC] retry play() failed: ${e2.message}`))
              document.removeEventListener('pointerdown', retry, true)
              document.removeEventListener('keydown',     retry, true)
            }
            document.addEventListener('pointerdown', retry, true)
            document.addEventListener('keydown',     retry, true)
          })
        }

        // Always set onunmute — this is the correct trigger for when RTP
        // packets start flowing (track goes from receive-muted to live).
        track.onunmute = () => {
          console.log(`[WebRTC] track.onunmute for ${targetUserId} — starting playback`)
          tryPlay()
        }

        track.onended = () => console.log(`[WebRTC] track ended for ${targetUserId}`)

        // Play immediately if track already has audio flowing.
        if (!track.muted) {
          console.log(`[WebRTC] Track already unmuted for ${targetUserId}`)
          tryPlay()
        }

        // No WebAudio bypass here — the <audio> element above is sufficient.
        // WebAudio contexts created before a user gesture are suspended and
        // produce no output; using them causes silent audio. The <audio> element
        // with autoplay + srcObject works correctly after the first user gesture.
        
        // Create an analyser for remote audio to detect speaking
        // Use a timeout to ensure the stream is fully active before creating analyser
        setTimeout(() => {
          try {
            // Check if stream is still active
            if (!remoteStream.active) {
              console.log(`[WebRTC] Stream no longer active for ${targetUserId}, skipping analyser creation`)
              return
            }
            
            const remoteAudioContext = new (window.AudioContext || window.webkitAudioContext)()
            const remoteAnalyser = remoteAudioContext.createAnalyser()
            remoteAnalyser.fftSize = 256
            remoteAnalyser.smoothingTimeConstant = 0.3 // More responsive to changes
            const remoteSource = remoteAudioContext.createMediaStreamSource(remoteStream)
            remoteSource.connect(remoteAnalyser)
            
            // Resume the audio context if it's suspended (needs user gesture)
            if (remoteAudioContext.state === 'suspended') {
              // Try to resume on next user interaction
              const resumeOnInteraction = () => {
                remoteAudioContext.resume().then(() => {
                  console.log(`[WebRTC] Resumed remote audio context for ${targetUserId}`)
                }).catch(err => {
                  console.warn(`[WebRTC] Failed to resume remote audio context for ${targetUserId}:`, err.message)
                })
                document.removeEventListener('click', resumeOnInteraction)
                document.removeEventListener('keydown', resumeOnInteraction)
              }
              document.addEventListener('click', resumeOnInteraction)
              document.addEventListener('keydown', resumeOnInteraction)
            }
            
            remoteAnalysersRef.current[targetUserId] = { 
              analyser: remoteAnalyser, 
              audioContext: remoteAudioContext,
              stream: remoteStream
            }
            console.log(`[WebRTC] Created remote analyser for ${targetUserId} (state: ${remoteAudioContext.state})`)
          } catch (analyserErr) {
            console.warn(`[WebRTC] Failed to create remote analyser for ${targetUserId}:`, analyserErr.message)
          }
        }, 500) // Give the stream time to become active
      }

      if (track.kind === 'video') {
        console.log(`[WebRTC] ========== VIDEO TRACK RECEIVED from ${targetUserId} ==========`)
        console.log(`[WebRTC] Video track details: id=${track.id}, readyState=${track.readyState}, enabled=${track.enabled}, muted=${track.muted}`)
        
        // Get or create the remote stream for this user
        let videoStream = remoteStreams.current[targetUserId]
        
        if (!videoStream) {
          // Create a new stream with this video track
          videoStream = new MediaStream([track])
          remoteStreams.current[targetUserId] = videoStream
          console.log(`[WebRTC] Created NEW video stream for ${targetUserId}`)
        } else {
          // Check if this video track is already in the stream
          const existingVideoTrack = videoStream.getVideoTracks()?.find(t => t.id === track.id)
          if (existingVideoTrack) {
            console.log(`[WebRTC] Video track already in stream for ${targetUserId}`)
          } else {
            // Add the video track to the existing stream
            videoStream.addTrack(track)
            console.log(`[WebRTC] Added video track to existing stream for ${targetUserId}, stream now has ${videoStream.getTracks().length} tracks`)
          }
        }
        
        // Log the stream state
        console.log(`[WebRTC] Video stream for ${targetUserId}: active=${videoStream.active}, tracks=${videoStream.getTracks().map(t => `${t.kind}:${t.readyState}`).join(',')}`)
        
        // Determine if this is a screen share or camera based on track settings
        // Screen shares typically have different aspect ratios or are marked
        const isScreenShare = track.label?.toLowerCase().includes('screen') || 
                              track.label?.toLowerCase().includes('monitor') ||
                              event.streams[0]?.id?.includes('screen') ||
                              false
        
        console.log(`[WebRTC] Video type for ${targetUserId}: ${isScreenShare ? 'screen share' : 'camera'}`)
        
        // Update video streams state with the video stream
        setVideoStreams(prev => ({ ...prev, [targetUserId]: videoStream }))
        
        // Force update participants state with the video stream
        setParticipants(prev => {
          const existingIndex = prev.findIndex(p => p.id === targetUserId)
          
          if (existingIndex === -1) {
            // Participant not in list yet - add them with video
            console.log(`[WebRTC] Adding NEW participant ${targetUserId} with video`)
            return [...prev, { 
              id: targetUserId, 
              hasVideo: true, 
              videoStream: videoStream,
              isScreenSharing: isScreenShare
            }]
          }
          
          // Update existing participant
          const existing = prev[existingIndex]
          const updatedParticipant = {
            ...existing,
            hasVideo: true,
            videoStream: videoStream,
            // If this is a screen share, mark it
            ...(isScreenShare ? { isScreenSharing: true } : {})
          }
          
          console.log(`[WebRTC] Updating participant ${targetUserId}: hasVideo=true, isScreenSharing=${isScreenShare}`)
          
          const newParticipants = [...prev]
          newParticipants[existingIndex] = updatedParticipant
          return newParticipants
        })
        
        // Also emit a local event to notify any video elements
        // This helps when the video element is already mounted
        window.dispatchEvent(new CustomEvent('voltchat:video-track', {
          detail: { userId: targetUserId, stream: videoStream, isScreenShare }
        }))
        
        console.log(`[WebRTC] ========== VIDEO TRACK PROCESSING COMPLETE for ${targetUserId} ==========`)
      }
    }

    // Add our local audio tracks
    const addTracks = () => {
      const audioStream = localStreamRef.current
      if (audioStream) {
        audioStream.getTracks().forEach(track => {
          const senders = pc.getSenders()
          if (!senders.find(s => s.track === track)) {
            pc.addTrack(track, audioStream)
          }
        })
      }
      const videoStream = localVideoStreamRef.current
      if (videoStream) {
        videoStream.getVideoTracks().forEach(track => {
          const senders = pc.getSenders()
          if (!senders.find(s => s.track === track)) {
            pc.addTrack(track, videoStream)
          }
        })
      }
      const screen = screenStreamRef.current
      if (screen) {
        screen.getTracks().forEach(track => {
          const senders = pc.getSenders()
          if (!senders.find(s => s.track === track)) {
            pc.addTrack(track, screen)
          }
        })
      }
    }

    addTracks()

    return pc
  }, [socket, user?.id, isPolite])

  const initiateCall = useCallback((targetUserId) => {
    if (!targetUserId || targetUserId === user?.id) return
    const existing = peerConnections.current[targetUserId]
    if (existing) {
      const state = existing.connectionState
      // Already connected, connecting, or completed (wrtc uses 'completed') — skip
      if (state === 'connected' || state === 'connecting' || state === 'completed') {
        activeNegotiationsRef.current = Math.max(0, activeNegotiationsRef.current - 1)
        return
      }
      // Offer already in flight for this peer — skip
      if (makingOfferRef.current[targetUserId]) {
        console.log('[WebRTC] Skipping initiateCall for', targetUserId, '— offer in flight')
        activeNegotiationsRef.current = Math.max(0, activeNegotiationsRef.current - 1)
        return
      }
    }
    console.log('[WebRTC] Connecting to peer:', targetUserId)
    createPeerConnection(targetUserId)
  }, [createPeerConnection, user?.id])

  // Process the connection queue with tiered concurrency for scaling to 100 peers
  const processConnectionQueue = useCallback(async () => {
    if (isProcessingQueueRef.current) return
    isProcessingQueueRef.current = true

    const tier = getTierConfig()
    const maxConcurrent = tier.concurrent

    while (connectionQueueRef.current.length > 0 && activeNegotiationsRef.current < maxConcurrent) {
      const targetUserId = connectionQueueRef.current.shift()

      // Double-check state before connecting
      const existing = peerConnections.current[targetUserId]
      if (existing) {
        const state = existing.connectionState
        if (state === 'connected' || state === 'connecting' || state === 'completed' || makingOfferRef.current[targetUserId]) {
          console.log(`[WebRTC] Skipping ${targetUserId} — already connecting/connected`)
          continue
        }
      }

      activeNegotiationsRef.current++
      connectionCooldownsRef.current.set(targetUserId, Date.now())

      console.log(`[WebRTC] Processing connection to ${targetUserId} (${activeNegotiationsRef.current}/${maxConcurrent} active, tier: ${tier.maxPeers} max)`)

      try {
        initiateCall(targetUserId)
        
        // Decrement counter after a delay to allow negotiation to complete
        setTimeout(() => {
          activeNegotiationsRef.current = Math.max(0, activeNegotiationsRef.current - 1)
          // Try to process more queued connections
          processConnectionQueue()
        }, 4000)
      } catch (err) {
        console.error(`[WebRTC] Error initiating connection to ${targetUserId}:`, err.message)
        activeNegotiationsRef.current = Math.max(0, activeNegotiationsRef.current - 1)
      }

      // Tiered delay between starting connections to prevent flooding
      if (connectionQueueRef.current.length > 0) {
        await new Promise(r => setTimeout(r, tier.staggerPerPeer))
      }
    }

    isProcessingQueueRef.current = false

    // If queue still has items, schedule another processing round
    if (connectionQueueRef.current.length > 0) {
      setTimeout(() => processConnectionQueue(), tier.staggerBase)
    }
  }, [initiateCall, getTierConfig])

  // Queue a connection with tiered cooldown management for 100+ peer support
  const queueConnection = useCallback((targetUserId) => {
    if (!targetUserId || targetUserId === user?.id) return

    // Check capacity
    if (!canAcceptPeer(targetUserId)) {
      console.log(`[WebRTC] Cannot queue ${targetUserId}: at capacity`)
      return
    }

    // Check cooldown to prevent rapid reconnection attempts
    const tier = getTierConfig()
    const lastAttempt = connectionCooldownsRef.current.get(targetUserId)
    if (lastAttempt && Date.now() - lastAttempt < tier.cooldown) {
      console.log(`[WebRTC] Connection to ${targetUserId} on cooldown, skipping`)
      return
    }

    // Check if already in queue
    if (connectionQueueRef.current.includes(targetUserId)) {
      console.log(`[WebRTC] Connection to ${targetUserId} already queued`)
      return
    }

    // Check if already connected
    const existing = peerConnections.current[targetUserId]
    if (existing) {
      const state = existing.connectionState
      if (state === 'connected' || state === 'connecting' || state === 'completed') {
        console.log(`[WebRTC] Already connected to ${targetUserId}, skipping queue`)
        return
      }
    }

    connectionQueueRef.current.push(targetUserId)
    console.log(`[WebRTC] Queued connection to ${targetUserId} (queue length: ${connectionQueueRef.current.length})`)
    processConnectionQueue()
  }, [user?.id, canAcceptPeer, getTierConfig])

  // Process large groups in batches to prevent overwhelming the system
  const processPeerBatches = useCallback((peerIds, tier) => {
    const batchSize = tier.batchSize
    const batches = []
    
    // Split into batches
    for (let i = 0; i < peerIds.length; i += batchSize) {
      batches.push(peerIds.slice(i, i + batchSize))
    }
    
    console.log(`[WebRTC] Split ${peerIds.length} peers into ${batches.length} batches of ~${batchSize}`)
    
    // Process batches with delays
    batches.forEach((batch, batchIndex) => {
      const batchDelay = batchIndex * 6000 // 6 seconds between batches
      
      setTimeout(() => {
        console.log(`[WebRTC] Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} peers)`)
        
        batch.forEach((peerId, index) => {
          // Skip if at capacity
          if (!canAcceptPeer(peerId)) return
          
          // Skip if already connected
          const existing = peerConnections.current[peerId]
          if (existing) {
            const s = existing.connectionState
            if (s === 'connected' || s === 'connecting' || s === 'completed') return
          }
          
          const delay = tier.staggerBase + (index * tier.staggerPerPeer) + (Math.random() * 200)
          setTimeout(() => queueConnection(peerId), delay)
        })
        
        // Mark mass join complete after last batch
        if (batchIndex === batches.length - 1) {
          setTimeout(() => {
            isMassJoinInProgressRef.current = false
            pendingPeerCountRef.current = 0
            console.log('[WebRTC] Mass join processing complete')
          }, 12000)
        }
      }, batchDelay)
    })
  }, [canAcceptPeer, queueConnection])

  useEffect(() => {
    if (!socket || !channel) return

    // joinKey increments every time the user explicitly joins (including rejoins).
    // Without it, rejoining the same channel after leave would be a no-op because
    // channel.id hasn't changed and the effect deps haven't changed.
    const channelChanged = initializedChannelIdRef.current !== channel.id
    const isRejoin = !hasJoinedRef.current && !isInitializingRef.current && initializedChannelIdRef.current === null

    // Prevent double-init when already live in this channel
    if ((hasJoinedRef.current || isInitializingRef.current) && !channelChanged) {
      console.log('[Voice] Skipping init - already joined or initializing, channel unchanged')
      return
    }
    
    // If we're joining a different channel, do full cleanup first
    if (hasJoinedRef.current && channelChanged) {
      console.log('[Voice] Channel changed, cleaning up previous session')
      Object.values(peerConnections.current).forEach(pc => { try { pc.close() } catch {} })
      peerConnections.current = {}
      Object.entries(audioElements.current).forEach(([key, node]) => {
        if (key.includes('__webaudio')) {
          try { node?.disconnect() } catch {}
        } else if (node && node.pause) {
          node.pause(); node.srcObject = null
          if (node.parentNode) node.parentNode.removeChild(node)
        }
      })
      audioElements.current = {}
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop())
        localStreamRef.current = null
      }
      if (analyserRef.current?.audioContext && analyserRef.current.audioContext.state !== 'closed') {
        analyserRef.current.audioContext.close().catch(() => {})
      }
      analyserRef.current = null
      // Reset perfect-negotiation state
      makingOfferRef.current  = {}
      ignoreOfferRef.current  = {}
      remoteDescSetRef.current = {}
      pendingCandidatesRef.current = {}
      lastOfferTimeRef.current = {}
      negotiationLockRef.current = {}
      serverIceServersRef.current = []
      setLocalStream(null)
      setLocalVideoStream(null)
      setScreenStream(null)
      setParticipants([])
      setConnectionState('connecting')
      hasJoinedRef.current = false
      hasLeftRef.current = false
    }
    
    let cancelled = false
    isInitializingRef.current = true
    initializedChannelIdRef.current = channel.id

    // Hoisted to effect scope so the cleanup return() can removeEventListener
    let resumeThrottle = null
    const resumeAudio = () => {
      if (resumeThrottle) return
      resumeThrottle = setTimeout(() => { resumeThrottle = null }, 500)
      if (analyserRef.current?.audioContext?.state === 'suspended') {
        analyserRef.current.audioContext.resume().catch(() => {})
      }
      Object.values(audioElements.current).forEach(audio => {
        if (audio.paused && audio.srcObject) {
          audio.play().catch(() => {})
        }
      })
    }
    document.addEventListener('click',   resumeAudio)
    document.addEventListener('keydown', resumeAudio)

    const initVoice = async () => {
      const settings = settingsService.getSettings()
      
      const tryGetMicrophone = async (deviceId) => {
        const constraints = {
          audio: {
            echoCancellation: settings.echoCancellation ?? true,
            noiseSuppression: settings.noiseSuppression ?? true,
            autoGainControl: settings.autoGainControl ?? true,
            ...(deviceId && deviceId !== 'default' ? { deviceId: { exact: deviceId } } : {})
          }
        }
        return navigator.mediaDevices.getUserMedia(constraints)
      }
      
      try {
        let stream
        try {
          stream = await tryGetMicrophone(settings.inputDevice)
        } catch (err) {
          if (err.name === 'OverconstrainedError') {
            console.log('[Voice] Saved mic device not found, using default')
            settingsService.saveSettings({ ...settings, inputDevice: 'default' })
            stream = await tryGetMicrophone(null)
          } else {
            throw err
          }
        }
        
        // Check if cancelled after async operation
        if (cancelled) {
          console.log('[Voice] Init cancelled, stopping stream')
          stream.getTracks().forEach(t => t.stop())
          return
        }
        
        setLocalStream(stream)
        localStreamRef.current = stream
        setConnectionState('connected')
        
        soundService.callConnected()

        const audioContext = new (window.AudioContext || window.webkitAudioContext)()
        const analyser = audioContext.createAnalyser()
        const source = audioContext.createMediaStreamSource(stream)
        source.connect(analyser)
        analyserRef.current = { audioContext, analyser }
        
        // Initialize VoiceFX audio processing chain
        const voiceFXDestination = audioContext.createMediaStreamDestination()
        const voiceFXDryGain = audioContext.createGain()
        const voiceFXWetGain = audioContext.createGain()
        voiceFXDryGain.gain.value = 1
        voiceFXWetGain.gain.value = 0
        
        voiceFXDestinationRef.current = voiceFXDestination
        voiceFXDryGainRef.current = voiceFXDryGain
        voiceFXWetGainRef.current = voiceFXWetGain
        voiceFXSourceRef.current = source
        
        // Connect: source -> dry path -> destination (initially no effects)
        source.connect(voiceFXDryGain)
        voiceFXDryGain.connect(voiceFXDestination)
        
        // Store original audio track reference
        const audioTrack = stream.getAudioTracks()[0]
        originalAudioTrackRef.current = audioTrack
        
        if (audioContext.state === 'suspended') {
          audioContext.resume().catch(err => {
            console.log('[Voice] AudioContext resume failed:', err)
          })
        }

        // Mark as joined BEFORE emitting
        hasJoinedRef.current = true
        hasLeftRef.current = false
        
        // Play join sound for self (callConnected plays when connection is established)
        // soundService.callJoin() - removed to avoid duplicate sounds
        
        // resumeAudio is registered at effect scope above — no need to add again here
        
        // voice:join already returns voice:participants from the server.
        // Do NOT emit voice:get-participants here — it causes a second participants
        // response which triggers duplicate initiateCall calls and m-line order errors.
        socket.emit('voice:join', { 
          channelId: channel.id,
          peerId: user.id
        })
        console.log('[Voice] Emitted voice:join for channel:', channel.id)
      } catch (err) {
        console.error('[Voice] Failed to get microphone:', err)
        if (!cancelled) {
          setConnectionState('error')
          soundService.error()
        }
      } finally {
        isInitializingRef.current = false
      }
    }

    initVoice()

    const onReconnectJoin = () => {
      if (hasJoinedRef.current && channelIdRef.current) {
        socket.emit('voice:join', {
          channelId: channelIdRef.current,
          peerId: user.id
        })
        console.log('[Voice] Re-emitted voice:join after reconnect for channel:', channelIdRef.current)
      }
    }

    socket.on('connect', onReconnectJoin)

    socket.on('voice:participants', (data) => {
      if (data.channelId !== channelIdRef.current) return
      // Store ICE servers from server for subsequent peer connections
      if (data.iceServers?.length) serverIceServersRef.current = data.iceServers
      
      const peerIds = (data.participants || [])
        .filter(p => p.id !== user.id)
        .map(p => p.id)
      
      console.log(`[WebRTC] Received participants list: ${peerIds.length} peers —`, peerIds)
      setParticipants(data.participants || [])
      
      // Detect mass join scenario (>10 peers joining at once)
      if (peerIds.length > 10) {
        isMassJoinInProgressRef.current = true
        pendingPeerCountRef.current = peerIds.length
        console.log(`[WebRTC] Mass join detected: ${peerIds.length} peers. Using batch processing.`)
      }
      
      // Get tier configuration based on peer count
      const tier = getTierConfig()
      console.log(`[WebRTC] Using tier config: concurrent=${tier.concurrent}, cooldown=${tier.cooldown}ms`)
      
      // For massive groups, process in batches
      if (peerIds.length > tier.batchSize) {
        console.log(`[WebRTC] Large group (${peerIds.length} peers), processing in batches of ${tier.batchSize}`)
        processPeerBatches(peerIds, tier)
        return
      }
      
      // Use tiered staggered delays
      // IMPORTANT: As the joining peer, we wait LONGER before initiating to give
      // existing participants priority. This reduces offer collisions during reconnection.
      // Existing peers will initiate first, and we'll respond with answers.
      const baseDelay = tier.staggerBase + 1500  // Extra 1.5s for joining peer
      const staggerMs = tier.staggerPerPeer
      
      peerIds.forEach((peerId, index) => {
        // Skip if already connected or connecting - don't retry if connection in progress
        const existing = peerConnections.current[peerId]
        if (existing) {
          const s = existing.connectionState
          if (s === 'connected' || s === 'completed') return
          // If connecting or new, skip - let the existing connection attempt continue
          if (s === 'connecting' || s === 'new') {
            console.log(`[WebRTC] Skipping ${peerId} - already ${s}`)
            return
          }
          // If failed/closed, will create new connection below
        }
        
        // Skip if at capacity
        if (!canAcceptPeer(peerId)) return
        
        // Simple staggered connections - no retry spam
        const delay = baseDelay + (index * staggerMs) + (Math.random() * 300)
        console.log(`[WebRTC] Queuing connection to ${peerId} in ${Math.round(delay)}ms`)
        setTimeout(() => queueConnection(peerId), delay)
      })
    })

    // Simple user-joined handler - don't spam connections
    socket.on('voice:user-joined', (userInfo) => {
      setParticipants(prev => {
        if (prev.find(p => p.id === userInfo.id)) return prev
        return [...prev, userInfo]
      })
      if (userInfo.id !== user.id) {
        soundService.userJoined()
        
        // Check if already connected - don't reconnect if we already have a good connection
        const existing = peerConnections.current[userInfo.id]
        if (existing) {
          const s = existing.connectionState
          if (s === 'connected' || s === 'completed') {
            console.log(`[WebRTC] Already connected to ${userInfo.id}, skipping`)
            return
          }
          if (s === 'connecting' || s === 'new') {
            console.log(`[WebRTC] Already connecting to ${userInfo.id}, skipping`)
            return
          }
          // If failed/closed, will try to reconnect below
        }
        
        // Check capacity before connecting
        if (!canAcceptPeer(userInfo.id)) {
          console.log(`[WebRTC] Cannot accept peer ${userInfo.id}: at capacity`)
          return
        }
        
        // Simple delay - no retry spam
        const tier = getTierConfig()
        const delay = 800 + Math.random() * 400
        console.log(`[WebRTC] Scheduling connection to new peer ${userInfo.id} in ${Math.round(delay)}ms`)
        setTimeout(() => queueConnection(userInfo.id), delay)
      }
    })

    // Handle user reconnection - don't treat as new join, just reconnect WebRTC
    socket.on('voice:user-reconnected', (userInfo) => {
      console.log(`[WebRTC] User reconnected: ${userInfo.id} (${userInfo.username})`)
      
      // Update participants list (user was already there, just updating)
      setParticipants(prev => prev.map(p => 
        p.id === userInfo.id ? { ...p, ...userInfo } : p
      ))
      
      // Don't play join sound for reconnections - they were never really gone
      
      if (userInfo.id !== user.id) {
        // Check if we already have a connection to this peer
        const existing = peerConnections.current[userInfo.id]
        if (existing) {
          const state = existing.connectionState
          // If connection is still good, no need to reconnect
          if (state === 'connected' || state === 'connecting' || state === 'completed') {
            console.log(`[WebRTC] Already connected to reconnected peer ${userInfo.id}, no action needed`)
            return
          }
        }
        
        // Reconnect to the peer with a small delay
        const delay = 500 + (Math.random() * 500)
        console.log(`[WebRTC] Reconnecting to peer ${userInfo.id} in ${Math.round(delay)}ms`)
        setTimeout(() => queueConnection(userInfo.id), delay)
      }
    })

    // Perfect negotiation — handle incoming offers
    // FIX: Always process ALL offers regardless of collision to prevent deadlocks
    // The original "ignore colliding offers when impolite" logic caused connection issues
    // when both peers tried to connect simultaneously
    socket.on('voice:offer', async (data) => {
      const { from, offer, channelId } = data
      if (channelId && channelId !== channelIdRef.current) return
      
      // Debounce rapid offers from the same peer (prevents loops)
      const now = Date.now()
      const lastOffer = lastOfferTimeRef.current[from] || 0
      if (now - lastOffer < 300) {
        console.log('[WebRTC] Debouncing rapid offer from', from)
        return
      }
      lastOfferTimeRef.current[from] = now
      
      // Check if we're already in a negotiation with this peer
      if (negotiationLockRef.current[from]) {
        console.log('[WebRTC] Negotiation already in progress for', from, '- queuing offer')
        // Queue this offer for later instead of ignoring
        setTimeout(() => {
          if (negotiationLockRef.current[from]) {
            // Still locked, try again
            lastOfferTimeRef.current[from] = 0 // Reset debounce
          }
        }, 500)
        return
      }
      
      console.log('[WebRTC] Received offer from:', from)
      negotiationLockRef.current[from] = true

      const pc = createPeerConnection(from)
      const offerCollision = makingOfferRef.current[from] || pc.signalingState !== 'stable'
      const polite = isPolite(from)

      // FIX: Never ignore offers - always respond to ensure connectivity
      // Original logic caused deadlocks when both peers ignored each other
      if (offerCollision) {
        console.log('[WebRTC] Handling offer collision for', from, '- polite:', polite)
        // If we're already making an offer, we need to handle the collision
        if (makingOfferRef.current[from]) {
          // We're also trying to connect - let the polite peer win
          // Wait a bit then proceed anyway to ensure connection
          if (!polite) {
            // Give polite peer time to complete their offer
            await new Promise(r => setTimeout(r, 200))
          }
        }
        // Regardless of politeness, rollback if needed to accept the offer
        if (pc.signalingState !== 'stable') {
          console.log('[WebRTC] Rolling back for', from)
          try {
            await pc.setLocalDescription({ type: 'rollback' })
          } catch (e) {
            // Rollback might fail if we're already in stable state - that's ok
          }
          makingOfferRef.current[from] = false
        }
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer))
        remoteDescSetRef.current[from] = true

        // Flush buffered ICE candidates
        const pending = pendingCandidatesRef.current[from] || []
        pendingCandidatesRef.current[from] = []
        for (const c of pending) {
          try { await pc.addIceCandidate(new RTCIceCandidate(c)) } catch {}
        }
        if (pending.length) console.log(`[WebRTC] Flushed ${pending.length} buffered ICE for ${from}`)

        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)

        socket.emit('voice:answer', {
          to: from,
          answer: pc.localDescription,
          channelId: channelIdRef.current
        })
        console.log('[WebRTC] Sent answer to:', from)
        // Don't initiate return connection - it creates collisions
        // The peer who sent the offer will maintain the connection to us
        
      } catch (err) {
        console.error('[WebRTC] Failed to handle offer from', from, ':', err.message)
      } finally {
        // Release the lock after a short delay to allow the answer to be processed
        setTimeout(() => {
          negotiationLockRef.current[from] = false
        }, 1000)
      }
    })

    // FIX: Improved answer handling - always process and ensure bidirectional connectivity
    socket.on('voice:answer', async (data) => {
      const { from, answer, channelId } = data
      if (channelId && channelId !== channelIdRef.current) return
      const pc = peerConnections.current[from]
      if (!pc) {
        console.log('[WebRTC] No peer connection for answer from', from, '- creating one')
        // FIX: Create a new connection if we don't have one
        const newPc = createPeerConnection(from)
        try {
          await newPc.setRemoteDescription(new RTCSessionDescription(answer))
          remoteDescSetRef.current[from] = true
          // Flush any buffered ICE candidates
          const pending = pendingCandidatesRef.current[from] || []
          pendingCandidatesRef.current[from] = []
          for (const c of pending) {
            try { await newPc.addIceCandidate(new RTCIceCandidate(c)) } catch {}
          }
          if (pending.length) console.log(`[WebRTC] Flushed ${pending.length} buffered ICE for ${from}`)
        } catch (err) {
          console.error('[WebRTC] Failed to set answer from', from, ':', err.message)
        }
        return
      }
      if (pc.signalingState === 'stable') {
        console.log('[WebRTC] Already stable with', from, '- ignoring duplicate answer')
        return
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer))
        remoteDescSetRef.current[from] = true
        // Clear ignoreOffer now that we have a valid answer — ICE candidates
        // from this peer must be processed from this point forward.
        ignoreOfferRef.current[from] = false
        // Mark negotiation as complete to prevent spurious renegotiation
        negotiationCompleteRef.current[from] = true
        console.log('[WebRTC] Set remote answer from:', from)
        // Flush buffered ICE candidates
        const pending = pendingCandidatesRef.current[from] || []
        pendingCandidatesRef.current[from] = []
        for (const c of pending) {
          try { await pc.addIceCandidate(new RTCIceCandidate(c)) } catch {}
        }
        if (pending.length) console.log(`[WebRTC] Flushed ${pending.length} buffered ICE for ${from}`)
        // Don't retry - let the connection establish naturally
      } catch (err) {
        console.error('[WebRTC] Failed to set answer from', from, ':', err.message)
      }
    })

    // FIX: Improved ICE candidate handling - always process candidates
    // regardless of ignoreOffer state to ensure connectivity
    socket.on('voice:ice-candidate', async (data) => {
      const { from, candidate, channelId } = data
      if (channelId && channelId !== channelIdRef.current) return
      if (!from || !candidate) return

      const pc = peerConnections.current[from]

      if (!pc) {
        // No peer connection yet - buffer the candidate
        if (!pendingCandidatesRef.current[from]) pendingCandidatesRef.current[from] = []
        pendingCandidatesRef.current[from].push(candidate)
        console.log('[WebRTC] Buffered ICE candidate from', from, '- no PC yet')
        return
      }

      // FIX: Always try to add candidates even if remote desc isn't set
      // This ensures we don't miss candidates during connection setup
      if (!remoteDescSetRef.current[from]) {
        // Buffer if remote description not yet set
        if (!pendingCandidatesRef.current[from]) pendingCandidatesRef.current[from] = []
        pendingCandidatesRef.current[from].push(candidate)
        console.log('[WebRTC] Buffered ICE candidate from', from, '- waiting for remote desc')
        return
      }

      // FIX: Remove ignoreOfferRef check - we should always accept ICE candidates
      // to ensure connectivity with all peers regardless of negotiation state
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (err) {
        console.warn('[WebRTC] Failed to add ICE candidate from', from, ':', err.message)
        // Don't treat this as fatal - ICE can fail for various reasons
      }
    })

    socket.on('voice:user-left', (data) => {
      const userId = data?.userId || data?.id
      if (!userId) return
      setParticipants(prev => prev.filter(p => p.id !== userId))
      setPeerStates(prev => { const n = { ...prev }; delete n[userId]; return n })
      soundService.userLeft()

      if (peerConnections.current[userId]) {
        try { peerConnections.current[userId].close() } catch {}
        delete peerConnections.current[userId]
      }
      if (audioElements.current[userId]) {
        const el = audioElements.current[userId]
        el.pause()
        el.srcObject = null
        if (el.parentNode) el.parentNode.removeChild(el)
        delete audioElements.current[userId]
      }
      // Disconnect Web Audio bypass nodes
      try { audioElements.current[`${userId}__webaudio_source`]?.disconnect() } catch {}
      try { audioElements.current[`${userId}__webaudio_gain`]?.disconnect() } catch {}
      delete audioElements.current[`${userId}__webaudio_source`]
      delete audioElements.current[`${userId}__webaudio_gain`]
      delete audioElements.current[`${userId}__webaudio_ctx`]
      delete remoteStreams.current[userId]
      // Clear perfect-negotiation state
      delete makingOfferRef.current[userId]
      delete ignoreOfferRef.current[userId]
      delete remoteDescSetRef.current[userId]
      delete pendingCandidatesRef.current[userId]
      delete lastOfferTimeRef.current[userId]
      delete negotiationLockRef.current[userId]
      delete negotiationCompleteRef.current[userId]
      // Clean up remote audio analyser
      if (remoteAnalysersRef.current[userId]) {
        try { 
          remoteAnalysersRef.current[userId].audioContext?.close()?.catch(() => {}) 
        } catch {}
        delete remoteAnalysersRef.current[userId]
      }
      // Clear speaking state for this user
      setSpeaking(prev => {
        const next = { ...prev }
        delete next[userId]
        return next
      })
    })

    // Handle force-reconnect command from server (consensus broken)
    socket.on('voice:force-reconnect', (data) => {
      const { channelId, reason, targetPeer, failurePercent, timestamp } = data
      if (channelId !== channelIdRef.current) return

      console.log(`[Voice] Force-reconnect received: ${reason}, target=${targetPeer}, failures=${failurePercent}%`)

      if (targetPeer === user?.id) {
        // I am the problematic peer - perform full reconnect
        console.log('[Voice] I am the target peer - performing full reconnect in 1s')
        soundService.error()
        // Trigger leave and rejoin
        handleLeave()
        setTimeout(() => {
          if (channelIdRef.current === channelId) {
            console.log('[Voice] Rejoining after force-reconnect')
            // The effect will handle rejoining via joinKey change
          }
        }, 1000)
      } else if (targetPeer === 'all' || targetPeer === '*') {
        // Everyone reconnect
        console.log('[Voice] Full channel reconnect requested - performing full reconnect in 1s')
        soundService.error()
        handleLeave()
        setTimeout(() => {
          if (channelIdRef.current === channelId) {
            console.log('[Voice] Rejoining after full channel reconnect')
          }
        }, 1000)
      } else {
        // Reconnect to specific peer only
        console.log(`[Voice] Reconnecting to specific peer ${targetPeer}`)
        if (peerConnections.current[targetPeer]) {
          try { peerConnections.current[targetPeer].close() } catch {}
          delete peerConnections.current[targetPeer]
        }
        // Clear state and requeue
        delete makingOfferRef.current[targetPeer]
        delete ignoreOfferRef.current[targetPeer]
        delete remoteDescSetRef.current[targetPeer]
        delete pendingCandidatesRef.current[targetPeer]
        setTimeout(() => queueConnection(targetPeer), 1000)
      }
    })

    socket.on('voice:user-updated', (data) => {
      setParticipants(prev => prev.map(p => 
        p.id === data.userId ? { ...p, ...data } : p
      ))
    })

    socket.on('voice:screen-share-update', (data) => {
      if (data.userId !== user?.id) {
        if (data.enabled) soundService.screenShareStart()
        else soundService.screenShareStop()
      }
      setParticipants(prev => prev.map(p => 
        p.id === data.userId ? { ...p, isScreenSharing: data.enabled } : p
      ))
      console.log(`[WebRTC] User ${data.userId} ${data.enabled ? 'started' : 'stopped'} screen sharing`)
    })

    socket.on('voice:video-update', (data) => {
      const { userId, username, enabled } = data
      console.log(`[WebRTC] User ${userId} (${username}) ${enabled ? 'enabled' : 'disabled'} video`)
      
      // Update participants state to reflect video status
      setParticipants(prev => prev.map(p => 
        p.id === userId ? { ...p, hasVideo: enabled } : p
      ))
      
      // Play a sound for video toggle (optional)
      if (userId !== user?.id) {
        if (enabled) {
          soundService.cameraOn()
        } else {
          soundService.cameraOff()
        }
      }
    })

    return () => {
      // Mark as cancelled to stop in-flight init
      cancelled = true
      isInitializingRef.current = false

      // Remove document audio resume listeners
      document.removeEventListener('click',   resumeAudio)
      document.removeEventListener('keydown', resumeAudio)
      
      // Check if this is a channel change (component will remount with new channel)
      // A channel change is when we're switching to a DIFFERENT voice channel
      const currentChannel = channelIdRef.current
      const nextChannel = channel?.id
      const isChannelChange = currentChannel && nextChannel && currentChannel !== nextChannel
      // Leaving voice entirely (nextChannel is undefined) also requires cleanup
      const isLeavingVoice = currentChannel && !nextChannel
      
      console.log('[Voice] Cleanup running, hasJoinedRef:', hasJoinedRef.current, 'currentChannel:', currentChannel, 'nextChannel:', nextChannel, 'channelChange:', isChannelChange, 'leavingVoice:', isLeavingVoice)
      
      // Unsubscribe from socket events
      socket.off('voice:participants')
      socket.off('voice:user-joined')
      socket.off('voice:user-reconnected')
      socket.off('voice:user-left')
      socket.off('voice:user-updated')
      socket.off('voice:offer')
      socket.off('voice:answer')
      socket.off('voice:ice-candidate')
      socket.off('voice:screen-share-update')
      socket.off('voice:video-update')
      socket.off('voice:force-reconnect')
      socket.off('connect', onReconnectJoin)
      
      // Clean up if we joined and are either:
      // 1. Switching to a different voice channel (isChannelChange)
      // 2. Leaving the voice channel view entirely (isLeavingVoice)
      // But NOT if this is an intentional leave (handleLeave already emitted voice:leave)
      const shouldCleanup = hasJoinedRef.current && (isChannelChange || isLeavingVoice) && !isIntentionalLeave
      
      // Reset the intentional leave flag after checking (for next time)
      isIntentionalLeave = false
      
      if (shouldCleanup) {
        // Close peer connections
        Object.values(peerConnections.current).forEach(pc => {
          try { pc.close() } catch (e) {}
        })
        peerConnections.current = {}
        
        // Clean up audio elements (also remove from DOM) and Web Audio nodes
        Object.entries(audioElements.current).forEach(([key, node]) => {
          if (key.includes('__webaudio')) {
            try { node?.disconnect() } catch {}
          } else if (node && node.pause) {
            node.pause()
            node.srcObject = null
            if (node.parentNode) node.parentNode.removeChild(node)
          }
        })
        audioElements.current = {}
        
        // Stop local stream
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(track => track.stop())
          localStreamRef.current = null
        }
        
        // Clean up audio context
        if (analyserRef.current?.audioContext && analyserRef.current.audioContext.state !== 'closed') {
          analyserRef.current.audioContext.close().catch(() => {})
        }
        analyserRef.current = null
        
        // Emit leave only if we haven't already and socket is connected
        if (!hasLeftRef.current && channelIdRef.current) {
          // Play self-leave sound (callLeft = melancholic descending arpeggio)
          soundService.callLeft()
          
          if (socket?.connected) {
            socket.emit('voice:leave', channelIdRef.current)
            console.log('[Voice] Emitted voice:leave for channel:', channelIdRef.current)
          } else {
            console.log('[Voice] Skip voice:leave emit because socket is disconnected')
          }
          hasLeftRef.current = true
        }
        hasJoinedRef.current = false
        initializedChannelIdRef.current = null
      }
    }
  }, [socket, channel?.id, user?.id, joinKey])

  // Expose peer connections for the VoiceInfoModal stats panel
  useEffect(() => {
    window.__vcGetPCs = () => ({ ...peerConnections.current })
    return () => { delete window.__vcGetPCs }
  }, [])

  // Connection watchdog — gentle monitoring, minimal interference
  // Only restart ICE for disconnected peers, don't aggressively reconnect
  
  useEffect(() => {
    if (!socket) return
    const watchdog = setInterval(() => {
      if (!hasJoinedRef.current) return
      
      Object.entries(peerConnections.current).forEach(([peerId, pc]) => {
        const s = pc.connectionState
        const iceS = pc.iceConnectionState
        
        // Only handle completely failed connections - close them cleanly
        if (s === 'failed' || s === 'closed') {
          console.log(`[WebRTC] Watchdog: ${peerId} is ${s}`)
          try { pc.close() } catch {}
          delete peerConnections.current[peerId]
          makingOfferRef.current[peerId] = false
          // Don't auto-reconnect - let the peer reconnect to us naturally
          return
        }
        
        // Only restart ICE for truly stuck connections, don't reconnect
        if (s === 'disconnected' && iceS === 'disconnected') {
          console.log(`[WebRTC] Watchdog: ${peerId} disconnected — restarting ICE`)
          pc.restartIce()
        }
      })
    }, 10000) // Check less frequently - every 10 seconds
    return () => clearInterval(watchdog)
  }, [socket])

  // Heartbeat to keep backend session alive and allow grace on reconnects
  useEffect(() => {
    if (!socket) return

    const interval = setInterval(() => {
      if (socket.connected && hasJoinedRef.current && channelIdRef.current) {
        socket.emit('voice:heartbeat', { channelId: channelIdRef.current })
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [socket, channel?.id])

  // Connect local video stream to video element
  useEffect(() => {
    if (localVideoRef.current && localVideoStream && isVideoOn) {
      localVideoRef.current.srcObject = localVideoStream
    }
  }, [localVideoStream, isVideoOn])

  // ── Global debug helper (accessible from browser console as window.__vcDebug()) ──
  useEffect(() => {
    window.__vcDebug = () => {
      console.group('[VoiceChannel Debug]')
      console.log('Channel:', channel?.id, channel?.name)
      console.log('Participants:', participants.map(p => p.username))
      console.log('Local stream tracks:', localStreamRef.current?.getTracks().map(t => `${t.kind}:${t.readyState}:enabled=${t.enabled}`))
      console.log('Peer connections:')
      Object.entries(peerConnections.current).forEach(([id, pc]) => {
        console.log(`  ${id}: conn=${pc.connectionState} ice=${pc.iceConnectionState} sig=${pc.signalingState}`)
        pc.getReceivers().forEach(r => {
          const t = r.track
          console.log(`    receiver: kind=${t?.kind} readyState=${t?.readyState} enabled=${t?.enabled} muted=${t?.muted}`)
        })
      })
      console.log('Audio elements:')
      Object.entries(audioElements.current).forEach(([id, el]) => {
        const tracks = el.srcObject?.getTracks() || []
        console.log(`  ${id}: paused=${el.paused} volume=${el.volume} muted=${el.muted} readyState=${el.readyState} srcObject=${!!el.srcObject} tracks=${tracks.map(t => `${t.kind}:${t.readyState}`).join(',')}`)
        // Try to force-play if paused
        if (el.paused && el.srcObject) {
          console.log(`  ${id}: attempting force play...`)
          el.play().then(() => console.log(`  ${id}: force play OK`)).catch(e => console.warn(`  ${id}: force play failed:`, e.message))
        }
      })
      console.log('Remote streams:')
      Object.entries(remoteStreams.current).forEach(([id, stream]) => {
        console.log(`  ${id}: active=${stream.active} tracks=${stream.getTracks().map(t => `${t.kind}:${t.readyState}:enabled=${t.enabled}`).join(',')}`)
      })
      console.groupEnd()
    }
    console.log('[VoiceChannel] Debug helper ready — run window.__vcDebug() in console for audio diagnostics')
    return () => { delete window.__vcDebug }
  }, [participants, channel?.id])

  const currentMuted = externalMuted !== undefined ? externalMuted : localIsMuted
  const currentDeafened = externalDeafened !== undefined ? externalDeafened : localIsDeafened

  const toggleMute = () => {
    // Can't unmute while deafened
    if (currentDeafened && currentMuted) return

    const newMuted = !currentMuted
    // Enable/disable the actual mic track
    localStream?.getAudioTracks().forEach(track => {
      track.enabled = !newMuted
    })
    localStreamRef.current?.getAudioTracks().forEach(track => {
      track.enabled = !newMuted
    })

    setLocalIsMuted(newMuted)
    onMuteChange?.(newMuted)
    socket?.emit('voice:mute', { channelId: channel.id, muted: newMuted })

    if (newMuted) {
      soundService.mute()
    } else {
      soundService.unmute()
    }
  }

  const toggleDeafen = () => {
    const newDeafened = !currentDeafened
    setLocalIsDeafened(newDeafened)
    onDeafenChange?.(newDeafened)

    // Only mute/unmute real <audio> HTMLMediaElements — skip WebAudio nodes
    Object.entries(audioElements.current).forEach(([key, el]) => {
      if (key.includes('__webaudio')) return
      if (el && el instanceof HTMLMediaElement) {
        el.muted = newDeafened
      }
    })

    // Deafening also mutes the mic so you don't send audio while deaf
    if (newDeafened && !currentMuted) {
      setLocalIsMuted(true)
      onMuteChange?.(true)
      localStream?.getAudioTracks().forEach(track => { track.enabled = false })
      socket?.emit('voice:mute', { channelId: channel.id, muted: true })
    }

    // Un-deafening restores mic to whatever mute state was before
    if (!newDeafened) {
      const shouldBeEnabled = !currentMuted
      localStream?.getAudioTracks().forEach(track => { track.enabled = shouldBeEnabled })
    }

    socket?.emit('voice:deafen', { channelId: channel.id, deafened: newDeafened })

    if (newDeafened) {
      soundService.deafen()
    } else {
      soundService.undeafen()
    }
  }

  // Track change debouncing to prevent rapid renegotiation
  const pendingRenegotiationRef = useRef(null)
  const RENEGOTIATION_DELAY = 500 // ms to wait before renegotiating

  // Trigger renegotiation for a specific peer after track changes
  const renegotiateWithPeer = async (peerId) => {
    const pc = peerConnections.current[peerId]
    if (!pc) {
      console.log(`[WebRTC] Cannot renegotiate with ${peerId} - no peer connection`)
      return
    }
    
    // Check if connection is in a usable state
    const connState = pc.connectionState
    const iceState = pc.iceConnectionState
    const sigState = pc.signalingState
    
    // Skip if connection is closed, failed, or disconnected
    if (connState === 'closed' || connState === 'failed' || connState === 'disconnected') {
      console.log(`[WebRTC] Skipping renegotiation with ${peerId} - connection state: ${connState}`)
      return
    }
    
    // Skip if ICE is failed or disconnected
    if (iceState === 'failed' || iceState === 'disconnected') {
      console.log(`[WebRTC] Skipping renegotiation with ${peerId} - ICE state: ${iceState}`)
      return
    }
    
    if (sigState !== 'stable') {
      console.log(`[WebRTC] Cannot renegotiate with ${peerId} - signaling state: ${sigState}`)
      return
    }
    
    // Skip if already making an offer
    if (makingOfferRef.current[peerId]) {
      console.log(`[WebRTC] Skipping renegotiation for ${peerId} - offer already in flight`)
      return
    }
    
    try {
      makingOfferRef.current[peerId] = true
      const offer = await pc.createOffer()
      
      // Double-check state after async createOffer
      if (pc.signalingState !== 'stable') {
        console.log(`[WebRTC] Aborting renegotiation for ${peerId} - state changed to ${pc.signalingState}`)
        return
      }
      
      await pc.setLocalDescription(offer)
      socket?.emit('voice:offer', {
        to: peerId,
        offer: pc.localDescription,
        channelId: channelIdRef.current
      })
      console.log(`[WebRTC] Sent renegotiation offer to ${peerId}`)
    } catch (err) {
      console.error(`[WebRTC] Renegotiation failed for ${peerId}:`, err.message)
    } finally {
      makingOfferRef.current[peerId] = false
    }
  }

  // Trigger renegotiation with all connected peers (debounced)
  const renegotiateWithAllPeers = useCallback(async () => {
    // Clear any pending renegotiation
    if (pendingRenegotiationRef.current) {
      clearTimeout(pendingRenegotiationRef.current)
    }
    
    // Debounce renegotiation to prevent rapid fire
    pendingRenegotiationRef.current = setTimeout(async () => {
      const peerIds = Object.keys(peerConnections.current)
      console.log(`[WebRTC] Renegotiating with ${peerIds.length} peers for track change`)
      
      for (const peerId of peerIds) {
        const pc = peerConnections.current[peerId]
        if (pc?.connectionState === 'connected' && pc.signalingState === 'stable') {
          // Stagger to avoid flooding
          await new Promise(r => setTimeout(r, 150))
          await renegotiateWithPeer(peerId)
        }
      }
      
      pendingRenegotiationRef.current = null
    }, RENEGOTIATION_DELAY)
  }, [])

  const toggleVideo = async () => {
    if (isVideoOn) {
      // Stop all tracks first so the camera LED turns off
      localVideoStream?.getTracks().forEach(track => track.stop())
      setLocalVideoStream(null)
      setIsVideoOn(false)
      soundService.cameraOff()

      // Remove the video sender entirely rather than replaceTrack(null).
      // replaceTrack(null) leaves a broken sender that can destabilise the PC.
      Object.values(peerConnections.current).forEach(pc => {
        const videoSender = pc.getSenders().find(s => s.track?._senderTag === 'camera')
        if (videoSender) {
          try { pc.removeTrack(videoSender) } catch {}
        }
      })

      // Renegotiate to remove video track from all peers
      await renegotiateWithAllPeers()

      socket?.emit('voice:video', { channelId: channel.id, enabled: false })
    } else {
      const settings = settingsService.getSettings()

      const tryGetCamera = async (deviceId) => {
        const constraints = {
          video: deviceId && deviceId !== 'default'
            ? { deviceId: { exact: deviceId } }
            : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
        }
        return navigator.mediaDevices.getUserMedia(constraints)
      }

      try {
        let videoStream
        try {
          videoStream = await tryGetCamera(settings.videoDevice)
        } catch (err) {
          if (err.name === 'OverconstrainedError') {
            settingsService.saveSettings({ ...settings, videoDevice: 'default' })
            videoStream = await tryGetCamera(null)
          } else {
            throw err
          }
        }

        setLocalVideoStream(videoStream)
        setIsVideoOn(true)
        soundService.cameraOn()

        const videoTrack = videoStream.getVideoTracks()[0]
        // Tag this track so we can find it later
        videoTrack._senderTag = 'camera'

        // Add video track to all peer connections that are in a good state
        Object.entries(peerConnections.current).forEach(([peerId, pc]) => {
          // Skip connections that aren't in a usable state
          const connState = pc.connectionState
          const iceState = pc.iceConnectionState
          if (connState === 'closed' || connState === 'failed' || connState === 'disconnected') {
            console.log(`[Video] Skipping track add to ${peerId} - connection state: ${connState}`)
            return
          }
          if (iceState === 'failed' || iceState === 'disconnected') {
            console.log(`[Video] Skipping track add to ${peerId} - ICE state: ${iceState}`)
            return
          }
          
          // Camera and screen share each get their OWN sender — don't reuse
          const existing = pc.getSenders().find(s => s.track?._senderTag === 'camera')
          if (existing) {
            existing.replaceTrack(videoTrack)
          } else {
            const sender = pc.addTrack(videoTrack, videoStream)
            if (sender) sender.track._senderTag = 'camera'
          }
        })

        // Renegotiate to send video track to all peers
        await renegotiateWithAllPeers()

        socket?.emit('voice:video', { channelId: channel.id, enabled: true })
      } catch (err) {
        console.error('[Video] Failed to get camera:', err)
      }
    }
  }

  // Remove senders that belong to a specific stream without touching others
  const _removeSendersForStream = (stream) => {
    if (!stream) return
    const trackIds = new Set(stream.getTracks().map(t => t.id))
    Object.values(peerConnections.current).forEach(pc => {
      pc.getSenders().forEach(sender => {
        if (sender.track && trackIds.has(sender.track.id)) {
          try { pc.removeTrack(sender) } catch {}
        }
      })
    })
  }

  const _stopScreenShare = (stream) => {
    stream?.getTracks().forEach(track => track.stop())
    _removeSendersForStream(stream)
    setScreenStream(null)
    setIsScreenSharing(false)
    soundService.screenShareStop()
    socket?.emit('voice:screen-share', { channelId: channel.id, enabled: false })
  }

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      _stopScreenShare(screenStream)
      // Renegotiate to remove screen share track from all peers
      await renegotiateWithAllPeers()
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 30 } },
          audio: false
        })

        setScreenStream(stream)
        setIsScreenSharing(true)
        soundService.screenShareStart()

        const videoTrack = stream.getVideoTracks()[0]
        videoTrack._senderTag = 'screen'

        // Add screen share track to all peer connections that are in a good state
        Object.entries(peerConnections.current).forEach(([peerId, pc]) => {
          // Skip connections that aren't in a usable state
          const connState = pc.connectionState
          const iceState = pc.iceConnectionState
          if (connState === 'closed' || connState === 'failed' || connState === 'disconnected') {
            console.log(`[Screen] Skipping track add to ${peerId} - connection state: ${connState}`)
            return
          }
          if (iceState === 'failed' || iceState === 'disconnected') {
            console.log(`[Screen] Skipping track add to ${peerId} - ICE state: ${iceState}`)
            return
          }
          
          // Screen share gets its own dedicated sender — camera sender is untouched
          const existing = pc.getSenders().find(s => s.track?._senderTag === 'screen')
          if (existing) {
            existing.replaceTrack(videoTrack)
          } else {
            pc.addTrack(videoTrack, stream)
          }
        })

        // Renegotiate to send screen share track to all peers
        await renegotiateWithAllPeers()

        videoTrack.onended = () => {
          _stopScreenShare(stream)
          // Renegotiate after stopping screen share
          renegotiateWithAllPeers()
        }

        socket?.emit('voice:screen-share', { channelId: channel.id, enabled: true })
      } catch (err) {
        if (err.name !== 'NotAllowedError') {
          console.error('[Screen] Failed to share screen:', err)
        }
      }
    }
  }

  const handleLeave = () => {
    // Mark as intentional leave so cleanup doesn't re-emit voice:leave
    isIntentionalLeave = true
    
    // soundService.callLeft() - removed, cleanup handles this

    // Stop all media tracks
    localStream?.getTracks().forEach(t => t.stop())
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    localStreamRef.current = null
    localVideoStream?.getTracks().forEach(t => t.stop())
    screenStream?.getTracks().forEach(t => t.stop())

    // Close all peer connections
    Object.values(peerConnections.current).forEach(pc => { try { pc.close() } catch {} })
    peerConnections.current = {}

    // Remove all audio DOM elements
    Object.entries(audioElements.current).forEach(([key, node]) => {
      if (key.includes('__webaudio')) { try { node?.disconnect() } catch {} }
      else if (node?.pause) { node.pause(); node.srcObject = null; node.parentNode?.removeChild(node) }
    })
    audioElements.current = {}

    // Close analyser context
    if (analyserRef.current?.audioContext?.state !== 'closed') {
      analyserRef.current?.audioContext?.close().catch(() => {})
    }
    analyserRef.current = null

    // Reset all negotiation state so a fresh join works without page reload
    makingOfferRef.current  = {}
    ignoreOfferRef.current  = {}
    remoteDescSetRef.current = {}
    pendingCandidatesRef.current = {}
    lastOfferTimeRef.current = {}
    negotiationLockRef.current = {}
    serverIceServersRef.current = []
    initializedChannelIdRef.current = null
    isInitializingRef.current = false

    // Reset React state
    setLocalStream(null)
    setLocalVideoStream(null)
    setScreenStream(null)
    setParticipants([])
    setPeerStates({})
    setConnectionState('connecting')
    setIsVideoOn(false)
    setIsScreenSharing(false)

    // Emit leave
    if (hasJoinedRef.current && !hasLeftRef.current) {
      if (socket?.connected) {
        socket.emit('voice:leave', channel.id)
        console.log('[Voice] Manual leave - emitted voice:leave')
      }
      hasJoinedRef.current = false
      hasLeftRef.current = true
    }

    onLeave()
  }

  const otherParticipants = participants.filter(p => p.id !== user?.id)
  
  // Create self participant if not in list yet
  const selfParticipant = participants.find(p => p.id === user?.id) || {
    id: user?.id,
    username: user?.username || user?.email,
    avatar: user?.avatar,
    muted: currentMuted,
    deafened: currentDeafened
  }

  // All participants including self
  const displayParticipants = participants.find(p => p.id === user?.id)
    ? participants
    : [selfParticipant, ...participants]

  // Derive a single overall header status from mic state + peer states
  const overallStatus = (() => {
    if (connectionState === 'error') return 'error'
    if (connectionState === 'connecting') return 'connecting'
    const peerList = Object.values(peerStates)
    if (peerList.length === 0) return 'connected'          // mic acquired, no peers yet
    if (peerList.some(s => s === 'connected')) return 'connected'
    if (peerList.every(s => s === 'failed'))   return 'degraded'
    if (peerList.some(s => s === 'failed'))    return 'degraded'
    if (peerList.some(s => s === 'connecting' || s === 'new')) return 'connecting'
    return 'connected'
  })()

  const statusLabel = {
    connecting: 'Connecting…',
    connected:  'Voice Connected',
    degraded:   'Connection Issues',
    error:      'Connection Error',
  }[overallStatus] ?? 'Connecting…'

  // Close participant context menu on outside click
  useEffect(() => {
    if (!participantMenu) return
    
    const close = (e) => {
      // Don't close if clicking inside the menu
      const menuEl = document.querySelector('.voice-participant-menu')
      if (menuEl && menuEl.contains(e.target)) return
      setParticipantMenu(null)
    }
    
    const closeOnKey = (e) => {
      if (e.key === 'Escape') setParticipantMenu(null)
    }
    
    // Use bubbling phase (false) so menu handlers can stop propagation if needed
    window.addEventListener('pointerdown', close, false)
    window.addEventListener('keydown', closeOnKey, true)
    return () => {
      window.removeEventListener('pointerdown', close, false)
      window.removeEventListener('keydown', closeOnKey, true)
    }
  }, [participantMenu])

  // Speaking detection with smoothing to prevent rapid flashing
  // Uses a hysteresis approach: must be speaking for 150ms to show, must be silent for 300ms to hide
  const speakingStateRef = useRef({}) // Raw speaking state from audio analysis
  const speakingTimersRef = useRef({}) // Timers for debouncing state changes
  const SPEAKING_ON_DELAY = 150  // ms to wait before showing speaking indicator
  const SPEAKING_OFF_DELAY = 300 // ms to wait before hiding speaking indicator

  // Speaking detection based on audio levels (local user)
  useEffect(() => {
    const analyser = analyserRef.current
    if (!analyser) return
    
    const audioAnalyser = analyser.analyser
    const audioContext = analyser.audioContext
    const dataArray = new Uint8Array(audioAnalyser.frequencyBinCount)
    
    const checkSpeaking = () => {
      if (!hasJoinedRef.current) return
      // Guard against closed AudioContext
      if (audioContext?.state === 'closed') return
      
      try {
        audioAnalyser.getByteFrequencyData(dataArray)
      } catch (e) {
        // AudioContext may have been closed, ignore
        return
      }
      
      let sum = 0
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i]
      }
      const average = sum / dataArray.length
      const isSpeakingRaw = average > 20 && !currentMuted
      
      if (user?.id) {
        const userId = user.id
        const wasSpeaking = speakingStateRef.current[userId]
        speakingStateRef.current[userId] = isSpeakingRaw
        
        // Clear any existing timer for this user
        if (speakingTimersRef.current[userId]) {
          clearTimeout(speakingTimersRef.current[userId])
          delete speakingTimersRef.current[userId]
        }
        
        // If transitioning to speaking, wait a bit before showing
        if (isSpeakingRaw && !wasSpeaking) {
          speakingTimersRef.current[userId] = setTimeout(() => {
            setSpeaking(prev => ({ ...prev, [userId]: true }))
          }, SPEAKING_ON_DELAY)
        }
        // If transitioning to not speaking, wait longer before hiding
        else if (!isSpeakingRaw && wasSpeaking) {
          speakingTimersRef.current[userId] = setTimeout(() => {
            setSpeaking(prev => ({ ...prev, [userId]: false }))
          }, SPEAKING_OFF_DELAY)
        }
        // If state hasn't changed, just update immediately
        else if (isSpeakingRaw === wasSpeaking) {
          setSpeaking(prev => ({ ...prev, [userId]: isSpeakingRaw }))
        }
      }
    }
    
    const speakingInterval = setInterval(checkSpeaking, 100)
    checkSpeaking()
    
    return () => {
      clearInterval(speakingInterval)
      // Clear all timers
      Object.values(speakingTimersRef.current).forEach(timer => clearTimeout(timer))
    }
  }, [currentMuted, user?.id])

  // Remote speaking detection based on remote audio analysers
  useEffect(() => {
    const checkRemoteSpeaking = () => {
      if (!hasJoinedRef.current) return
      
      // Check each remote analyser
      Object.entries(remoteAnalysersRef.current).forEach(([peerId, { analyser, audioContext, stream }]) => {
        if (!analyser) return
        // Guard against closed AudioContext
        if (audioContext?.state === 'closed') return
        // Check if stream is still active
        if (stream && !stream.active) return
        
        // Create a fresh dataArray each time
        let dataArray
        try {
          dataArray = new Uint8Array(analyser.frequencyBinCount)
          analyser.getByteFrequencyData(dataArray)
        } catch (e) {
          // AudioContext may have been closed, ignore
          return
        }
        
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i]
        }
        const average = sum / dataArray.length
        
        // Check if participant is muted (from participants state)
        const participant = participants.find(p => p.id === peerId)
        const isMuted = participant?.muted || false
        
        // Speaking threshold - audio level above 10 and not muted
        const isSpeakingRaw = average > 10 && !isMuted
        
        const wasSpeaking = speakingStateRef.current[peerId]
        speakingStateRef.current[peerId] = isSpeakingRaw
        
        // Clear any existing timer for this peer
        if (speakingTimersRef.current[peerId]) {
          clearTimeout(speakingTimersRef.current[peerId])
          delete speakingTimersRef.current[peerId]
        }
        
        // If transitioning to speaking, wait a bit before showing
        if (isSpeakingRaw && !wasSpeaking) {
          speakingTimersRef.current[peerId] = setTimeout(() => {
            setSpeaking(prev => ({ ...prev, [peerId]: true }))
          }, SPEAKING_ON_DELAY)
        }
        // If transitioning to not speaking, wait longer before hiding
        else if (!isSpeakingRaw && wasSpeaking) {
          speakingTimersRef.current[peerId] = setTimeout(() => {
            setSpeaking(prev => ({ ...prev, [peerId]: false }))
          }, SPEAKING_OFF_DELAY)
        }
      })
    }
    
    const remoteSpeakingInterval = setInterval(checkRemoteSpeaking, 100)
    checkRemoteSpeaking()
    
    return () => {
      clearInterval(remoteSpeakingInterval)
      // Clear all timers
      Object.values(speakingTimersRef.current).forEach(timer => clearTimeout(timer))
    }
  }, [participants])

  const [pinnedParticipant, setPinnedParticipant] = useState(null)
  
  // Stable video element refs to prevent flashing on re-renders
  const videoRefsRef = useRef({}) // participantId -> video element
  const lastVideoStreamRef = useRef({}) // participantId -> stream id to detect changes
  
  // Stable video ref callback that only updates srcObject when stream actually changes
  const getVideoRefCallback = useCallback((participantId) => {
    return (el) => {
      if (!el) return
      
      const currentStream = el.srcObject
      const lastStreamId = lastVideoStreamRef.current[participantId]
      
      // Get the expected stream for this participant from videoStreams state
      const expectedStream = videoStreams[participantId]
      const expectedStreamId = expectedStream?.id || null
      
      // Only update if stream actually changed
      if (lastStreamId !== expectedStreamId) {
        lastVideoStreamRef.current[participantId] = expectedStreamId
        videoRefsRef.current[participantId] = el
        el.srcObject = expectedStream
        console.log(`[Video] Updated video element for ${participantId}, stream: ${expectedStreamId}`)
      }
    }
  }, [videoStreams])

  const getScreenShareStream = (participant) => {
    if (participant.id === user?.id && isScreenSharing) return screenStream
    return participant.isScreenSharing ? participant.videoStream : null
  }

  const getCameraStream = (participant) => {
    if (participant.id === user?.id && isVideoOn) return localVideoStream
    return participant.hasVideo && !participant.isScreenSharing ? participant.videoStream : null
  }

  const hasAnyVideo = displayParticipants.some(p => {
    if (p.id === user?.id) return isVideoOn || isScreenSharing
    return !!p.videoStream
  })

  const hasScreenShare = displayParticipants.some(p => getScreenShareStream(p))

  const mainVideoParticipant = pinnedParticipant || displayParticipants.find(p => {
    if (p.id === user?.id) return isScreenSharing
    return p.isScreenSharing
  }) || displayParticipants.find(p => {
    if (p.id === user?.id) return isVideoOn
    return p.hasVideo
  })

  const mainVideoStream = mainVideoParticipant ? (
    mainVideoParticipant.id === user?.id
      ? (isScreenSharing ? screenStream : localVideoStream)
      : videoStreams[mainVideoParticipant.id]
  ) : null

  const mainVideoType = mainVideoParticipant ? (
    mainVideoParticipant.id === user?.id
      ? (isScreenSharing ? 'screen' : 'camera')
      : mainVideoParticipant.isScreenSharing
        ? 'screen'
        : 'camera'
  ) : null

  return (
    <div className="voice-channel-view">
      <div className="voice-header">
        <Volume2 size={24} />
        <span className="voice-channel-name">{channel?.name || 'Voice Channel'}</span>
        <span
          className={`connection-status ${overallStatus} clickable`}
          onClick={() => onShowConnectionInfo?.()}
          title="Click for connection details"
          style={{ cursor: 'pointer' }}
        >
          {statusLabel}
        </span>
      </div>

      <div className={`voice-main-area ${hasAnyVideo ? 'has-video' : ''}`}>
        {hasAnyVideo && mainVideoStream && mainVideoParticipant ? (
          <div 
            className="voice-main-video"
            onClick={() => setPinnedParticipant(pinnedParticipant ? null : mainVideoParticipant)}
          >
            <video
              autoPlay
              playsInline
              className="main-video-element"
              muted={mainVideoParticipant.id !== user?.id}
              ref={el => { if (el && mainVideoStream) el.srcObject = mainVideoStream }}
            />
            <div className="main-video-overlay">
              <span className="main-video-name">
                {mainVideoParticipant.id === user?.id ? 'You' : mainVideoParticipant.username}
                {mainVideoType === 'screen' && ' · Screen'}
              </span>
              {pinnedParticipant && (
                <span className="pinned-badge">Pinned</span>
              )}
            </div>
            {hasScreenShare && mainVideoType !== 'screen' && (
              <div className="screen-share-notice">
                <Monitor size={14} />
                <span>Someone is sharing their screen</span>
              </div>
            )}
          </div>
        ) : (
          <div className="voice-participants-grid" data-count={displayParticipants.length}>
            {displayParticipants.map(participant => {
              const isSelf = participant.id === user?.id
              const isMuted = participant.muted || (isSelf && currentMuted)
              const isSpeaking = !!speaking[participant.id]
              
              const participantCameraStream = getCameraStream(participant)
              const participantScreenStream = getScreenShareStream(participant)
              const participantHasVideo = !!participantCameraStream || !!participantScreenStream
              
              return (
                <div
                  key={participant.id}
                  className={`participant-grid-tile ${isSpeaking ? 'speaking' : ''} ${isMuted ? 'muted' : ''} ${participantHasVideo ? 'has-video' : ''}`}
                >
                  {participantHasVideo ? (
                    <video
                      autoPlay
                      playsInline
                      muted={isSelf}
                      className="participant-grid-video"
                      ref={getVideoRefCallback(participant.id)}
                    />
                  ) : (
                    <div className="participant-grid-avatar">
                      <Avatar
                        src={participant.avatar}
                        fallback={participant.username}
                        size={64}
                      />
                      {isMuted && (
                        <div className="participant-grid-muted-icon">
                          <MicOff size={14} />
                        </div>
                      )}
                    </div>
                  )}
                  <div className="participant-grid-name">
                    {participant.username}
                    {isSelf && ' (You)'}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="voice-participants-strip">
        <div className="participants-scrollable">
          {displayParticipants.map(participant => {
            const isSelf = participant.id === user?.id
            const isMuted = participant.muted || (isSelf && currentMuted)
            const isDeafened = participant.deafened || (isSelf && currentDeafened)
            const isSpeaking = !!speaking[participant.id]
            const peerState = isSelf ? 'connected' : (peerStates[participant.id] ?? 'connecting')

            const participantCameraStream = getCameraStream(participant)
            const participantScreenStream = getScreenShareStream(participant)
            const participantHasVideo = !!participantCameraStream || !!participantScreenStream
            const isPinned = pinnedParticipant?.id === participant.id
            const isMain = mainVideoParticipant?.id === participant.id

            const localSetting = localUserSettings[participant.id] || { muted: false, volume: 100 }
            const isLocalMuted = !isSelf && localSetting.muted

            return (
              <div
                key={participant.id}
                className={[
                  'participant-tile',
                  isSelf ? 'self' : '',
                  isMuted ? 'muted' : '',
                  isLocalMuted ? 'local-muted' : '',
                  isSpeaking ? 'speaking' : '',
                  participantHasVideo ? 'has-video' : '',
                  isPinned ? 'pinned' : '',
                  isMain ? 'main' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => setPinnedParticipant(isPinned ? null : participant)}
                onContextMenu={!isSelf ? (e) => {
                  e.preventDefault()
                  setParticipantMenu({ userId: participant.id, username: participant.username, x: e.clientX, y: e.clientY })
                } : undefined}
              >
                {participantHasVideo ? (
                  <div className="tile-video-container">
                    <video
                      autoPlay
                      playsInline
                      className="tile-video"
                      muted={isSelf}
                      ref={getVideoRefCallback(participant.id)}
                    />
                    <div className="tile-name-overlay">
                      {participant.username}
                      {participantScreenStream ? ' · Screen' : ''}
                    </div>
                  </div>
                ) : (
                  <div className="tile-avatar-container">
                    <Avatar
                      src={participant.avatar}
                      alt={participant.username}
                      fallback={participant.username}
                      size={48}
                      className="tile-avatar"
                    />
                    {isMuted && <div className="tile-mute-icon"><MicOff size={14} /></div>}
                    {isDeafened && <div className="tile-deafen-icon"><VolumeX size={14} /></div>}
                    {!isSelf && peerState !== 'connected' && (
                      <div className={`tile-peer-badge peer-state-${peerState}`}>
                        {peerState === 'connecting' ? '⟳' : peerState === 'failed' ? '✕' : '!'}
                      </div>
                    )}
                  </div>
                )}
                <span className="tile-name">
                  {participant.username}
                  {isSelf && ' (You)'}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="voice-controls">
        <button 
          className={`voice-control-btn ${currentMuted ? 'active' : ''}`}
          onClick={toggleMute}
          title={currentMuted ? 'Unmute' : 'Mute'}
        >
          {currentMuted ? <MicOff size={24} /> : <Mic size={24} />}
        </button>
        
        <button 
          className={`voice-control-btn ${currentDeafened ? 'active' : ''}`}
          onClick={toggleDeafen}
          title={currentDeafened ? 'Undeafen' : 'Deafen'}
        >
          {currentDeafened ? <VolumeX size={24} /> : <Headphones size={24} />}
        </button>

        <button 
          className={`voice-control-btn ${isVideoOn ? 'active-video' : ''}`}
          onClick={toggleVideo}
          title={isVideoOn ? 'Turn Off Camera' : 'Turn On Camera'}
        >
          {isVideoOn ? <Video size={24} /> : <VideoOff size={24} />}
        </button>

        <button 
          className={`voice-control-btn ${isScreenSharing ? 'active-screen' : ''}`}
          onClick={toggleScreenShare}
          title={isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
        >
          {isScreenSharing ? <Monitor size={24} /> : <MonitorOff size={24} />}
        </button>

        <button 
          className="voice-control-btn leave"
          onClick={handleLeave}
          title="Leave Voice Channel"
        >
          <PhoneOff size={24} />
        </button>

        <button 
          className="voice-control-btn settings"
          title="Voice Settings"
          onClick={onOpenSettings}
        >
          <Settings size={24} />
        </button>

        <button 
          className={`voice-control-btn ${showVoiceFX ? 'active' : ''}`}
          title="Voice Effects"
          onClick={() => setShowVoiceFX(true)}
        >
          <Music size={24} />
        </button>
      </div>

      {/* Participant right-click context menu */}
      {participantMenu && (() => {
        const ls = localUserSettings[participantMenu.userId] || { muted: false, volume: 100 }
        const menuW = 220, menuH = 160
        const x = Math.min(participantMenu.x, window.innerWidth  - menuW - 8)
        const y = Math.min(participantMenu.y, window.innerHeight - menuH - 8)
        return (
          <>
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
              onClick={() => setParticipantMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault()
                setParticipantMenu(null)
              }}
            />
            <div
              className="voice-participant-menu"
              style={{ position: 'fixed', left: x, top: y, zIndex: 9999 }}
              onClick={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.preventDefault()}
              onMouseDown={(e) => e.stopPropagation()}
              onMouseUp={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
            >
              <div className="vpm-header">{participantMenu.username}</div>
              <button
                className="vpm-item"
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  setLocalUserSetting(participantMenu.userId, { muted: !ls.muted })
                }}
              >
                {ls.muted ? <Volume2 size={14} /> : <VolumeX size={14} />}
                {ls.muted ? 'Unmute for me' : 'Mute for me'}
              </button>
              <div 
                className="vpm-volume" 
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onMouseUp={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
              >
                <span>Volume</span>
                <input
                  type="range"
                  min={0}
                  max={200}
                  value={ls.volume}
                  onChange={(e) => {
                    e.stopPropagation()
                    setLocalUserSetting(participantMenu.userId, { volume: Number(e.target.value) })
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onMouseUp={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onPointerUp={(e) => e.stopPropagation()}
                />
                <span>{ls.volume}%</span>
              </div>
              <button
                className="vpm-item vpm-reset"
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  setLocalUserSetting(participantMenu.userId, { muted: false, volume: 100 })
                  setParticipantMenu(null)
                }}
              >
                Reset to default
              </button>
            </div>
          </>
        )
      })()}

      {/* VoiceFX Modal */}
      <VoiceFX 
        isOpen={showVoiceFX}
        onClose={() => setShowVoiceFX(false)}
        applyEffect={applyVoiceFXEffect}
        currentEffect={voiceFXEffect}
        currentParams={voiceFXParams}
        isEnabled={voiceFXEnabled}
        onToggle={(enabled) => {
          setVoiceFXEnabled(enabled)
          if (!enabled) {
            applyVoiceFXEffect('none', {})
          }
        }}
        onReset={() => {
          setVoiceFXEffect('none')
          setVoiceFXParams({})
          setVoiceFXEnabled(false)
          applyVoiceFXEffect('none', {})
        }}
      />
    </div>
  )
}

export default VoiceChannel
