import { useStore } from '../stores/voltverseStore'

let audioContext = null
let audioDevices = {
  input: [],
  output: []
}
let mediaStream = null
let micStream = null

export const setupAudioSystem = async (sdk) => {
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)()
    
    await loadAudioDevices()
    
    console.log('[VoltVerse] Audio system initialized')
    return true
  } catch (err) {
    console.error('[VoltVerse] Audio system init error:', err)
    return false
  }
}

export const loadAudioDevices = async () => {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    
    audioDevices.input = devices.filter(d => d.kind === 'audioinput')
    audioDevices.output = devices.filter(d => d.kind === 'audiooutput')
    
    return audioDevices
  } catch (err) {
    console.error('[VoltVerse] Error loading audio devices:', err)
    return audioDevices
  }
}

export const getAudioDevices = () => audioDevices

export const startMicrophone = async (deviceId = null) => {
  try {
    const constraints = {
      audio: deviceId ? { deviceId: { exact: deviceId } } : true
    }
    
    micStream = await navigator.mediaDevices.getUserMedia(constraints)
    
    const { settings } = useStore.getState()
    useStore.getState().setVoiceChatActive(true)
    
    console.log('[VoltVerse] Microphone started')
    return micStream
  } catch (err) {
    console.error('[VoltVerse] Microphone error:', err)
    throw err
  }
}

export const stopMicrophone = () => {
  if (micStream) {
    micStream.getTracks().forEach(track => track.stop())
    micStream = null
  }
  useStore.getState().setVoiceChatActive(false)
}

export const toggleMicrophone = async () => {
  const { voiceChatActive, settings } = useStore.getState()
  
  if (voiceChatActive) {
    stopMicrophone()
  } else {
    await startMicrophone(settings.audioInputDevice)
  }
}

export const playPositionalSound = (url, position, volume = 1, loop = false) => {
  if (!audioContext) return null
  
  const audio = new Audio(url)
  audio.loop = loop
  audio.volume = volume
  
  const panner = audioContext.createPanner()
  panner.panningModel = 'HRTF'
  panner.distanceModel = 'inverse'
  panner.refDistance = 1
  panner.maxDistance = 100
  panner.rolloffFactor = 1
  panner.coneInnerAngle = 360
  panner.coneOuterAngle = 0
  panner.coneOuterGain = 0
  
  if (position && Array.isArray(position)) {
    panner.positionX.value = position[0] || 0
    panner.positionY.value = position[1] || 0
    panner.positionZ.value = position[2] || 0
  }
  
  const gainNode = audioContext.createGain()
  gainNode.gain.value = volume
  
  try {
    const source = audioContext.createMediaElementSource(audio)
    source.connect(panner)
    panner.connect(gainNode)
    gainNode.connect(audioContext.destination)
  } catch (e) {
    console.warn('[VoltVerse] Audio source error:', e)
  }
  
  audio.play()
  
  return { audio, panner, gainNode }
}

export const playAmbientSound = (url, volume = 0.5, loop = true) => {
  const audio = new Audio(url)
  audio.loop = loop
  audio.volume = volume
  audio.autoplay = true
  
  return audio
}

export const setListenerPosition = (position, forward, up) => {
  if (!audioContext) return
  
  const listener = audioContext.listener
  
  const pos = position || [0, 0, 0]
  const fwd = forward || [0, 0, -1]
  const upVec = up || [0, 1, 0]

  if (listener.positionX) {
    listener.positionX.value = pos[0]
    listener.positionY.value = pos[1]
    listener.positionZ.value = pos[2]
    listener.forwardX.value = fwd[0]
    listener.forwardY.value = fwd[1]
    listener.forwardZ.value = fwd[2]
    listener.upX.value = upVec[0]
    listener.upY.value = upVec[1]
    listener.upZ.value = upVec[2]
  } else {
    listener.setPosition(pos[0], pos[1], pos[2])
    listener.setOrientation(fwd[0], fwd[1], fwd[2], upVec[0], upVec[1], upVec[2])
  }
}

export const createSynthSound = (type = 'sine', frequency = 440, duration = 0.5) => {
  if (!audioContext) return null
  
  const oscillator = audioContext.createOscillator()
  const gainNode = audioContext.createGain()
  
  oscillator.type = type
  oscillator.frequency.value = frequency
  
  gainNode.gain.setValueAtTime(0.5, audioContext.currentTime)
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration)
  
  oscillator.connect(gainNode)
  gainNode.connect(audioContext.destination)
  
  oscillator.start()
  oscillator.stop(audioContext.currentTime + duration)
  
  return { oscillator, gainNode }
}

export const playUISound = (type = 'click') => {
  const sounds = {
    click: { frequency: 800, duration: 0.1 },
    hover: { frequency: 600, duration: 0.05 },
    success: { frequency: 880, duration: 0.2 },
    error: { frequency: 220, duration: 0.3 },
    notification: { frequency: 660, duration: 0.15 }
  }
  
  const sound = sounds[type] || sounds.click
  createSynthSound('sine', sound.frequency, sound.duration)
}

export const setAudioOutputDevice = async (deviceId) => {
  const { settings, updateSettings } = useStore.getState()
  
  try {
    if (typeof HTMLAudioElement.prototype.setSinkId === 'undefined') {
      console.warn('[VoltVerse] setSinkId not supported')
      return false
    }
    
    updateSettings({ audioOutputDevice: deviceId })
    return true
  } catch (err) {
    console.error('[VoltVerse] Error setting audio output:', err)
    return false
  }
}

export const setAudioInputDevice = async (deviceId) => {
  const { settings, updateSettings } = useStore.getState()
  
  try {
    if (micStream) {
      stopMicrophone()
    }
    
    updateSettings({ audioInputDevice: deviceId })
    
    if (useStore.getState().voiceChatActive) {
      await startMicrophone(deviceId)
    }
    
    return true
  } catch (err) {
    console.error('[VoltVerse] Error setting audio input:', err)
    return false
  }
}

export const getAnalyserData = () => {
  if (!audioContext || !micStream) return null
  
  const analyser = audioContext.createAnalyser()
  const source = audioContext.createMediaStreamSource(micStream)
  source.connect(analyser)
  
  analyser.fftSize = 256
  
  const dataArray = new Uint8Array(analyser.frequencyBinCount)
  
  return {
    analyser,
    dataArray,
    getByteFrequencyData: () => {
      analyser.getByteFrequencyData(dataArray)
      return dataArray
    }
  }
}

export const cleanupAudioSystem = () => {
  stopMicrophone()
  
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close()
  }
  
  audioContext = null
  mediaStream = null
}
