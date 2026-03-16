import { createVAS } from '../../../VAS/src/client/vas-sdk.js'
import { createUIVAS, createClientGuard, validatePublicActivityMeta, UIVAS_ELEMENTS, UIVAS_ANIMATIONS } from '../../../VAS/src/ui/index.js'

export const createVoltActivitySDK = (options = {}) => createVAS(options)
export const createVoltUIVAS = (options = {}) => createUIVAS(options)
export const createVoltActivityGuard = (options = {}) => createClientGuard(options)
export { validatePublicActivityMeta, UIVAS_ELEMENTS, UIVAS_ANIMATIONS }

// Voice-specific exports
export const UIVAS_VOICE_ELEMENTS = {
  voiceIndicator: { category: 'voice', animatable: true },
  speakerWave: { category: 'voice', animatable: true },
  voiceLevel: { category: 'voice', animatable: true },
  muteToggle: { category: 'voice', animatable: true },
  deafenToggle: { category: 'voice', animatable: true },
  participantCard: { category: 'voice', animatable: true },
  voiceConnection: { category: 'voice', animatable: true },
  voiceQuality: { category: 'voice', animatable: true },
  voiceEncryption: { category: 'voice', animatable: true },
  voicePermission: { category: 'voice', animatable: true },
  voiceActivity: { category: 'voice', animatable: true },
  voiceJoinLeave: { category: 'voice', animatable: true },
  voiceReconnect: { category: 'voice', animatable: true },
  voicePriority: { category: 'voice', animatable: true },
  voiceResource: { category: 'voice', animatable: true },
  voiceContext: { category: 'voice', animatable: true },
  voiceError: { category: 'voice', animatable: true },
  voiceSettings: { category: 'voice', animatable: true },
  voicePreview: { category: 'voice', animatable: true },
  voiceFXControl: { category: 'voice', animatable: true }
}

export const UIVAS_VOICE_ANIMATIONS = {
  voicePulse: { keyframes: 'box-shadow: inset 0 0 0 rgba(34, 197, 94, 0.08) → inset 0 0 24px rgba(34, 197, 94, 0.18); transform: scale(1) → scale(1.05)', duration: 800, easing: 'ease-in-out', loop: true },
  voiceWave: { keyframes: 'transform: translateY(0) → translateY(-10px) → translateY(0)', duration: 600, easing: 'ease-in-out' },
  voiceConnect: { keyframes: 'opacity: 0, transform: scale(0.8) → opacity: 1, transform: scale(1)', duration: 500, easing: 'ease-out' },
  voiceDisconnect: { keyframes: 'opacity: 1, transform: scale(1) → opacity: 0, transform: scale(0.8)', duration: 300, easing: 'ease-in' },
  voiceMute: { keyframes: 'transform: scale(1) → scale(0.95) → scale(1)', duration: 200, easing: 'ease-in-out' },
  voiceDeafen: { keyframes: 'transform: scale(1) → scale(0.9) → scale(1)', duration: 250, easing: 'ease-out' },
  voiceJoin: { keyframes: 'opacity: 0, transform: translateX(20px) → opacity: 1, transform: translateX(0)', duration: 400, easing: 'ease-out' },
  voiceLeave: { keyframes: 'opacity: 1, transform: translateX(0) → opacity: 0, transform: translateX(20px)', duration: 300, easing: 'ease-in' },
  voiceReconnect: { keyframes: 'transform: rotate(0deg) → rotate(360deg)', duration: 1000, easing: 'linear', loop: true },
  voiceQuality: { keyframes: 'transform: scale(1) → scale(1.1) → scale(1)', duration: 1500, easing: 'ease-in-out', loop: true },
  voiceError: { keyframes: 'transform: translateX(0) → translateX(-5px) → translateX(5px) → translateX(0)', duration: 400, easing: 'ease-in-out' },
  voiceFX: { keyframes: 'transform: scale(1) → scale(1.05) → scale(1)', duration: 1200, easing: 'ease-in-out', loop: true }
}

export default createVoltActivitySDK
