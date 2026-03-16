export const compressAudio = async (audioBlob, options = {}) => {
  const {
    bitRate = 128000,
    sampleRate = 44100,
    channels = 1,
  } = options

  return new Promise((resolve, reject) => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      const reader = new FileReader()

      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target.result
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

          const numberOfSamples = audioBuffer.length
          const duration = numberOfSamples / audioBuffer.sampleRate

          const offlineContext = new OfflineAudioContext(
            channels,
            numberOfSamples,
            sampleRate
          )

          const source = offlineContext.createBufferSource()
          source.buffer = audioBuffer

          const gainNode = offlineContext.createGain()
          gainNode.gain.value = 0.9

          source.connect(gainNode)
          gainNode.connect(offlineContext.destination)
          source.start(0)

          const renderedBuffer = await offlineContext.startRendering()

          const wavBlob = audioBufferToWav(renderedBuffer, {
            bitDepth: 16,
            sampleRate,
            channels,
          })

          resolve(wavBlob)
        } catch (err) {
          reject(err)
        }
      }

      reader.onerror = reject
      reader.readAsArrayBuffer(audioBlob)
    } catch (err) {
      reject(err)
    }
  })
}

const audioBufferToWav = (buffer, options = {}) => {
  const {
    bitDepth = 16,
    sampleRate = 44100,
    channels = 1,
  } = options

  const numChannels = buffer.numberOfChannels
  const sampleRateOutput = sampleRate
  const bytesPerSample = bitDepth / 8
  const blockAlign = numChannels * bytesPerSample

  const dataLength = buffer.length * blockAlign
  const bufferLength = 44 + dataLength

  const arrayBuffer = new ArrayBuffer(bufferLength)
  const view = new DataView(arrayBuffer)

  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i))
    }
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataLength, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRateOutput, true)
  view.setUint32(28, sampleRateOutput * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitDepth, true)
  writeString(36, 'data')
  view.setUint32(40, dataLength, true)

  const channelData = []
  for (let i = 0; i < numChannels; i++) {
    channelData.push(buffer.getChannelData(i))
  }

  let offset = 44
  const volume = 0.9
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      let sample = channelData[channel][i]
      sample = Math.max(-1, Math.min(1, sample))
      sample = sample < 0 ? sample * 32768 : sample * 32767
      sample = sample * volume
      view.setInt16(offset, sample, true)
      offset += 2
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' })
}

export const formatDuration = (seconds) => {
  if (!seconds || !isFinite(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export const getAudioDuration = (file) => {
  return new Promise((resolve) => {
    try {
      const audio = new Audio()
      const objectUrl = URL.createObjectURL(file)
      audio.src = objectUrl
      
      const cleanup = () => {
        URL.revokeObjectURL(objectUrl)
      }
      
      audio.addEventListener('loadedmetadata', () => {
        cleanup()
        resolve(audio.duration || 0)
      })
      
      audio.addEventListener('error', () => {
        cleanup()
        resolve(0)
      })
      
      setTimeout(() => {
        cleanup()
        resolve(0)
      }, 5000)
    } catch (err) {
      resolve(0)
    }
  })
}
