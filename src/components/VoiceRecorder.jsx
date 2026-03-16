import React, { useState, useRef, useCallback, useEffect } from 'react'
import { MicrophoneIcon, StopIcon, XMarkIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline'
import { Mic, Square, Send, X } from 'lucide-react'
import useIsMobile from '../hooks/useIsMobile'
import { compressAudio, formatDuration } from '../services/audioCompression'
import { apiService } from '../services/apiService'
import '../assets/styles/VoiceRecorder.css'

const VoiceRecorder = ({ onVoiceMessageSent, disabled }) => {
  const isMobile = useIsMobile()
  const [isRecording, setIsRecording] = useState(false)
  const [recordedBlob, setRecordedBlob] = useState(null)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [isCompressing, setIsCompressing] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState(null)

  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const timerRef = useRef(null)
  const streamRef = useRef(null)

  const startRecording = useCallback(async () => {
    try {
      setError(null)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus' 
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4'

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType
      })

      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        setRecordedBlob(blob)
        
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop())
          streamRef.current = null
        }
      }

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start(100)

      setIsRecording(true)
      setRecordingDuration(0)

      console.log('[VoiceRecorder] Recording started, mimeType:', mimeType)
      
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => {
          const newDuration = prev + 1
          console.log('[VoiceRecorder] Timer tick:', newDuration)
          return newDuration
        })
      }, 1000)
    } catch (err) {
      console.error('Failed to start recording:', err)
      setError('Microphone access denied')
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      clearInterval(timerRef.current)
      setIsRecording(false)
    }
  }, [isRecording])

  const cancelRecording = useCallback(() => {
    if (isRecording) {
      stopRecording()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setRecordedBlob(null)
    setRecordingDuration(0)
    audioChunksRef.current = []
  }, [isRecording, stopRecording])

  const sendVoiceMessage = useCallback(async () => {
    if (!recordedBlob || isCompressing || isUploading) return

    setIsCompressing(true)
    setError(null)

    try {
      let fileToUpload = recordedBlob

      try {
        const compressedBlob = await compressAudio(recordedBlob, {
          bitRate: 128000,
          sampleRate: 44100,
          channels: 1,
        })
        
        if (compressedBlob.size < recordedBlob.size) {
          fileToUpload = compressedBlob
        }
      } catch (compressErr) {
        console.warn('Audio compression failed, using original:', compressErr)
      }

      setIsCompressing(false)
      setIsUploading(true)

      const duration = recordingDuration
      const fileName = `voice_message_${Date.now()}.wav`
      const file = new File([fileToUpload], fileName, { type: 'audio/wav' })

      const result = await apiService.uploadFiles([file])

      if (result.attachments && result.attachments.length > 0) {
        const attachment = {
          ...result.attachments[0],
          duration: Math.round(duration),
          isVoiceMessage: true,
        }
        onVoiceMessageSent(attachment)
      }

      setRecordedBlob(null)
      setRecordingDuration(0)
      audioChunksRef.current = []
    } catch (err) {
      console.error('Failed to send voice message:', err)
      setError(err?.message || 'Failed to send voice message')
      setRecordedBlob(null)
      setRecordingDuration(0)
      audioChunksRef.current = []
    } finally {
      setIsCompressing(false)
      setIsUploading(false)
    }
  }, [recordedBlob, isCompressing, isUploading, onVoiceMessageSent, recordingDuration])

  const handleMouseDown = useCallback(() => {
    if (disabled || recordedBlob) return
    startRecording()
  }, [disabled, recordedBlob, startRecording])

  const handleMouseUp = useCallback(() => {
    if (!isMobile || !isRecording) return
    if (recordingDuration < 0.5) {
      cancelRecording()
      return
    }
    stopRecording()
  }, [isMobile, isRecording, recordingDuration, cancelRecording, stopRecording])

  const handleTouchStart = useCallback((e) => {
    if (disabled || recordedBlob) return
    e.preventDefault()
    startRecording()
  }, [disabled, recordedBlob, startRecording])

  const handleTouchEnd = useCallback((e) => {
    if (!isMobile || !isRecording) return
    e.preventDefault()
    if (recordingDuration < 0.5) {
      cancelRecording()
      return
    }
    stopRecording()
  }, [isMobile, isRecording, recordingDuration, cancelRecording, stopRecording])

  const handleClick = useCallback(() => {
    if (disabled) return
    
    if (recordedBlob) {
      return
    }

    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }, [disabled, recordedBlob, isRecording, startRecording, stopRecording])

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  if (recordedBlob) {
    return (
      <div className="voice-recorder-preview">
        <div className="voice-recorder-preview-info">
          <div className="voice-recorder-wave">
            <div className="wave-bar"></div>
            <div className="wave-bar"></div>
            <div className="wave-bar"></div>
            <div className="wave-bar"></div>
            <div className="wave-bar"></div>
          </div>
          <span className="voice-recorder-duration">
            {formatDuration(recordingDuration)}
          </span>
        </div>
        
        <div className="voice-recorder-preview-actions">
          <button 
            className="voice-recorder-btn cancel"
            onClick={cancelRecording}
            disabled={isCompressing || isUploading}
            title="Cancel"
          >
            <X size={18} />
          </button>
          
          <button 
            className="voice-recorder-btn send"
            onClick={sendVoiceMessage}
            disabled={isCompressing || isUploading}
            title="Send"
          >
            {isCompressing || isUploading ? (
              <div className="voice-recorder-spinner"></div>
            ) : (
              <Send size={18} />
            )}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div 
      className={`voice-recorder ${isRecording ? 'recording' : ''} ${disabled ? 'disabled' : ''}`}
    >
      <button 
        className={`voice-recorder-btn record ${isRecording ? 'active' : ''}`}
        disabled={disabled}
        onMouseDown={(e) => {
          if (isMobile) return
          e.preventDefault()
          if (isRecording) {
            stopRecording()
          } else {
            startRecording()
          }
        }}
        onMouseUp={(e) => {
          if (isMobile) return
        }}
        onTouchStart={(e) => {
          if (!isMobile) return
          e.preventDefault()
          startRecording()
        }}
        onTouchEnd={(e) => {
          if (!isMobile) return
          e.preventDefault()
          if (recordingDuration < 0.5) {
            cancelRecording()
          } else {
            stopRecording()
          }
        }}
      >
        {isRecording ? (
          <div className="recording-indicator">
            <div className="recording-pulse"></div>
            <Mic size={20} />
          </div>
        ) : (
          <Mic size={20} />
        )}
      </button>
      
      {isRecording && (
        <div className="voice-recorder-timer">
          <span className="recording-dot"></span>
          <span>{formatDuration(recordingDuration)}</span>
        </div>
      )}
      
      {error && <span className="voice-recorder-error">{error}</span>}
    </div>
  )
}

export default VoiceRecorder
