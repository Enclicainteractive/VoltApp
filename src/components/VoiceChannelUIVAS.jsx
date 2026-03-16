import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createVoltUIVAS, UIVAS_ELEMENTS, UIVAS_ANIMATIONS, UIVAS_VOICE_ELEMENTS, UIVAS_VOICE_ANIMATIONS } from '../sdk/activities-sdk'
import './VoiceChannelUIVAS.css'

const VoiceChannelUIVAS = ({
  voiceState = {},
  onError,
  children
}) => {
  const containerRef = useRef(null)
  
  const [uiState, setUiState] = useState({
    open: false,
    activeAnimations: new Set(),
    voiceContextSafe: true,
    callContextSafe: true,
    errorCount: 0,
    maxErrors: 10,
    lastError: null
  })
  
  const [voiceIndicators, setVoiceIndicators] = useState({
    speaking: false,
    muted: false,
    deafened: false,
    connected: false,
    reconnecting: false,
    quality: 'good',
    encryption: false,
    participantCount: 0,
    activity: false
  })
  
  const [participantEvents, setParticipantEvents] = useState([])
  
  const ui = useMemo(() => {
    try {
      return createVoltUIVAS({
        defaultTab: 'discover',
        enableAnimations: true,
        animationDuration: 300,
        maxSecurityFlags: 24
      })
    } catch (err) {
      console.warn('[VoiceChannelUIVAS] Failed to create UIVAS instance:', err)
      return null
    }
  }, [])
  
  useEffect(() => {
    if (!ui) return
    
    const off = ui.subscribe((next) => {
      setUiState({
        open: next.open,
        activeAnimations: next.activeAnimations,
        voiceContextSafe: next.voiceContextSafe,
        callContextSafe: next.callContextSafe,
        errorCount: next.errorCount,
        maxErrors: next.maxErrors,
        lastError: next.lastError
      })
    })
    
    return () => {
      try { off?.() } catch {}
    }
  }, [ui])
  
  useEffect(() => {
    return () => {
      try { ui?.destroy() } catch {}
    }
  }, [ui])
  
  const handleVoiceError = useCallback((error, context = 'voice') => {
    if (!ui) return
    
    const errorMessage = error?.message || String(error || 'Unknown voice error')
    const errorCount = ui.getState().errorCount
    
    if (errorCount >= 10) {
      console.warn(`[VoiceChannelUIVAS] Max errors reached (${errorCount}), entering safe mode`)
      ui.setVoiceContextSafe(false)
      ui.setCallContextSafe(false)
      ui.setError(`Voice context error: ${errorMessage}`)
      onError?.(error)
      return
    }
    
    ui.setError(errorMessage)
    ui.flagSecurity({
      type: 'voice_error',
      severity: 'warning',
      reason: errorMessage,
      source: context,
      meta: { context, errorCount }
    })
    
    onError?.(error)
  }, [ui, onError])
  
  const handleVoiceStateChange = useCallback((newState) => {
    if (!ui) return
    
    setVoiceIndicators(prev => {
      const next = {
        ...prev,
        ...newState
      }
      
      if (newState.connected === false && prev.connected === true) {
        ui.flagSecurity({
          type: 'voice_disconnect',
          severity: 'warning',
          reason: 'Voice connection lost',
          source: 'voice_state',
          meta: { previousState: prev }
        })
        ui.setVoiceContextSafe(false)
      }
      
      if (newState.connected === true && prev.connected === false) {
        ui.setVoiceContextSafe(true)
      }
      
      if (newState.reconnecting === true) {
        ui.setVoiceContextSafe(false)
        ui.playAnimation('voice_reconnect', 'voiceReconnect')
      }
      
      if (newState.reconnecting === false && prev.reconnecting === true) {
        ui.setVoiceContextSafe(true)
      }
      
      if (newState.speaking === true && prev.speaking === false) {
        ui.playAnimation('voice_indicator', 'voicePulse')
      }
      
      return next
    })
  }, [ui])
  
  const handleParticipantJoin = useCallback((participant) => {
    if (!ui) return
    
    setParticipantEvents(prev => [...prev, {
      type: 'join',
      participant,
      timestamp: Date.now()
    }].slice(-20))
    
    ui.playAnimation(`participant_${participant.id}`, 'voiceJoin')
    
    ui.flagSecurity({
      type: 'participant_join',
      severity: 'info',
      reason: `Participant joined: ${participant.id}`,
      source: 'voice_participants',
      meta: { participantId: participant.id }
    })
  }, [ui])
  
  const handleParticipantLeave = useCallback((participant) => {
    if (!ui) return
    
    setParticipantEvents(prev => [...prev, {
      type: 'leave',
      participant,
      timestamp: Date.now()
    }].slice(-20))
    
    ui.playAnimation(`participant_${participant.id}`, 'voiceLeave')
    
    ui.flagSecurity({
      type: 'participant_leave',
      severity: 'info',
      reason: `Participant left: ${participant.id}`,
      source: 'voice_participants',
      meta: { participantId: participant.id }
    })
  }, [ui])
  
  const inspectVoicePacket = useCallback((packet) => {
    if (!ui) return { safe: true }
    
    const size = JSON.stringify(packet).length
    if (size > 96 * 1024) {
      ui.flagSecurity({
        type: 'voice_packet_large',
        severity: 'warning',
        reason: 'Voice packet exceeds size limit',
        source: 'voice_p2p',
        meta: { size, maxSize: 96 * 1024 }
      })
      return { safe: false, reason: 'packet_too_large' }
    }
    
    if (packet?.type === 'suspicious') {
      ui.flagSecurity({
        type: 'voice_packet_suspicious',
        severity: 'high',
        reason: 'Suspicious voice packet detected',
        source: 'voice_p2p',
        meta: { packetType: packet.type }
      })
      return { safe: false, reason: 'suspicious_packet' }
    }
    
    return { safe: true }
  }, [ui])
  
  const getSecurityStatus = useCallback(() => {
    if (!ui) return { safe: true, flags: [] }
    const state = ui.getState()
    return {
      safe: state.voiceContextSafe && state.callContextSafe,
      flags: state.securityFlags,
      errorCount: state.errorCount,
      maxErrors: state.maxErrors
    }
  }, [ui])
  
  const getAnimationPresets = useCallback(() => {
    return UIVAS_ANIMATIONS
  }, [])
  
  const getVoiceAnimations = useCallback(() => {
    return [
      'voicePulse',
      'voiceWave', 
      'voiceConnect',
      'voiceDisconnect',
      'voiceMute',
      'voiceDeafen',
      'voiceJoin',
      'voiceLeave',
      'voiceReconnect',
      'voiceQuality',
      'voiceError',
      'voiceFX'
    ]
  }, [])
  
  const playVoiceAnimation = useCallback((elementId, animation) => {
    if (!ui) return false
    return ui.playAnimation(elementId, animation)
  }, [ui])
  
  const stopVoiceAnimation = useCallback((elementId) => {
    if (!ui) return
    ui.stopAnimation(elementId)
  }, [ui])
  
  const getUIElements = useCallback(() => {
    return UIVAS_ELEMENTS
  }, [])
  
  const renderVoiceIndicator = useCallback((type, active = false) => {
    const animClass = active ? 'voice-active' : 'voice-inactive'
    const animation = active ? 'voicePulse' : ''
    
    return (
      <div 
        className={`uivas-voice-indicator ${type} ${animClass}`}
        data-animation={animation}
      >
        {children?.(type, active)}
      </div>
    )
  }, [children])
  
  const expose = useMemo(() => ({
    ui,
    uiState,
    voiceIndicators,
    handleVoiceError,
    handleVoiceStateChange,
    handleParticipantJoin,
    handleParticipantLeave,
    inspectVoicePacket,
    getSecurityStatus,
    getAnimationPresets,
    getVoiceAnimations,
    playVoiceAnimation,
    stopVoiceAnimation,
    getUIElements,
    renderVoiceIndicator,
    setOpen: (open) => ui?.setOpen(open),
    setTab: (tab) => ui?.setTab(tab),
    setError: (error) => ui?.setError(error),
    clearError: () => ui?.clearError(),
    flagSecurity: (flag) => ui?.flagSecurity(flag),
    clearSecurityFlags: () => ui?.clearSecurityFlags(),
    resetErrors: () => ui?.resetErrors()
  }), [
    ui, 
    uiState, 
    voiceIndicators, 
    handleVoiceError, 
    handleVoiceStateChange,
    handleParticipantJoin,
    handleParticipantLeave,
    inspectVoicePacket,
    getSecurityStatus,
    getAnimationPresets,
    getVoiceAnimations,
    playVoiceAnimation,
    stopVoiceAnimation,
    getUIElements,
    renderVoiceIndicator
  ])
  
  return (
    <div 
      ref={containerRef}
      className="voice-channel-uivas"
      data-safe={uiState.voiceContextSafe}
      data-context={voiceState.contextType || 'voice'}
    >
      {children?.(expose)}
    </div>
  )
}

export const createVoiceUIVAS = (options = {}) => {
  return createVoltUIVAS({
    ...options,
    defaultTab: options.defaultTab || 'discover',
    enableAnimations: options.enableAnimations !== false,
    animationDuration: options.animationDuration || 300
  })
}

export const createVoiceSecurityGuard = (options = {}) => {
  const {
    maxVoicePacketsPerSecond = 60,
    maxVoicePacketSize = 96 * 1024,
    onFlag = null
  } = options
  
  let packetCount = 0
  let lastReset = Date.now()
  
  const resetCounter = () => {
    const now = Date.now()
    if (now - lastReset > 1000) {
      packetCount = 0
      lastReset = now
    }
  }
  
  return {
    inspectVoicePacket(packet) {
      resetCounter()
      packetCount++
      
      if (packetCount > maxVoicePacketsPerSecond) {
        const flag = {
          type: 'voice_rate_limit',
          severity: 'warning',
          reason: 'Voice packet rate exceeded',
          source: 'voice_security',
          meta: { packetCount, maxPerSecond: maxVoicePacketsPerSecond }
        }
        onFlag?.(flag)
        return { safe: false, reason: 'rate_limit_exceeded', flag }
      }
      
      const size = JSON.stringify(packet).length
      if (size > maxVoicePacketSize) {
        const flag = {
          type: 'voice_packet_size',
          severity: 'high',
          reason: 'Voice packet too large',
          source: 'voice_security',
          meta: { size, maxSize: maxVoicePacketSize }
        }
        onFlag?.(flag)
        return { safe: false, reason: 'packet_too_large', flag }
      }
      
      return { safe: true }
    },
    
    inspectVoiceState(state) {
      if (!state || typeof state !== 'object') {
        return { safe: false, reason: 'invalid_state' }
      }
      
      return { safe: true }
    },
    
    getPacketCount() {
      resetCounter()
      return packetCount
    }
  }
}

export { UIVAS_VOICE_ELEMENTS, UIVAS_VOICE_ANIMATIONS }
export default VoiceChannelUIVAS
