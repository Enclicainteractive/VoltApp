import * as THREE from 'three'

export const MINIGOLF_CAMERA_MODES = {
  FOLLOW: 'follow',
  OVERHEAD: 'overhead',
  FREE: 'free'
}

export const MINIGOLF_CAMERA_PRESETS = {
  [MINIGOLF_CAMERA_MODES.FOLLOW]: {
    offset: new THREE.Vector3(0, 12, 14),
    targetLerp: 0.08,
    cameraLerp: 0.08,
    interactionPauseMs: 1800
  },
  [MINIGOLF_CAMERA_MODES.OVERHEAD]: {
    offset: new THREE.Vector3(0.01, 24, 0.01),
    targetLerp: 0.14,
    cameraLerp: 0.14,
    interactionPauseMs: 0
  },
  [MINIGOLF_CAMERA_MODES.FREE]: {
    offset: new THREE.Vector3(-8, 10, 18),
    targetLerp: 0,
    cameraLerp: 0,
    interactionPauseMs: 0
  }
}

const FALLBACK_OFFSET = MINIGOLF_CAMERA_PRESETS[MINIGOLF_CAMERA_MODES.FOLLOW].offset

export const getMiniGolfCameraPreset = (mode) => (
  MINIGOLF_CAMERA_PRESETS[mode] || MINIGOLF_CAMERA_PRESETS[MINIGOLF_CAMERA_MODES.FOLLOW]
)

export const cloneMiniGolfCameraOffset = (mode) => getMiniGolfCameraPreset(mode).offset.clone()

export const syncMiniGolfCameraOffset = (cameraPosition, controlsTarget, fallback = FALLBACK_OFFSET) => {
  if (!cameraPosition || !controlsTarget) return fallback.clone()
  return new THREE.Vector3().copy(cameraPosition).sub(controlsTarget)
}

export const shouldResetMiniGolfCamera = ({ hasBooted = false, lastResetKey = null, nextResetKey = null } = {}) => (
  !hasBooted || lastResetKey !== nextResetKey
)

export const getMiniGolfCameraInteractionPause = (mode) => (
  getMiniGolfCameraPreset(mode).interactionPauseMs
)

export const getMiniGolfCameraTargetVector = (target) => (
  new THREE.Vector3(target?.x || 0, 0.1, target?.z || 0)
)

export const buildMiniGolfCameraFrame = ({
  cameraMode = MINIGOLF_CAMERA_MODES.FOLLOW,
  liveTarget,
  cup = null,
  holeBounds = null,
  controlsTarget,
  cameraPosition,
  offset,
  isInteracting = false,
  pauseFollowUntil = 0,
  now = 0
}) => {
  const preset = getMiniGolfCameraPreset(cameraMode)
  const safeOffset = offset?.clone?.() || cloneMiniGolfCameraOffset(cameraMode)

  if (cameraMode === MINIGOLF_CAMERA_MODES.FREE || !liveTarget || !controlsTarget || !cameraPosition) {
    return {
      mode: cameraMode,
      nextTarget: controlsTarget?.clone?.() || new THREE.Vector3(),
      nextCameraPosition: cameraPosition?.clone?.() || safeOffset.clone(),
      nextOffset: safeOffset
    }
  }

  // Only blend toward the cup when the ball is actively moving (playback).
  // During idle/aiming keep the camera centered on the ball so it stays
  // in the middle of the screen rather than drifting toward the flag.
  const framingPoint = liveTarget
  const desiredTarget = getMiniGolfCameraTargetVector(framingPoint)
  const boundsWidth = Math.max(20, Number(holeBounds?.maxX || 18) - Number(holeBounds?.minX || -18))
  const boundsDepth = Math.max(12, Number(holeBounds?.maxZ || 12) - Number(holeBounds?.minZ || -12))
  const desiredDistance = Math.max(11, Math.min(26, Math.max(boundsWidth, boundsDepth) * 0.58))
  const desiredHeight = Math.max(9, Math.min(24, Math.max(boundsWidth, boundsDepth) * 0.44))
  const planar = new THREE.Vector3(safeOffset.x, 0, safeOffset.z)
  if (planar.lengthSq() < 0.0001) planar.set(preset.offset.x || 10, 0, preset.offset.z || 12)
  planar.normalize().multiplyScalar(desiredDistance)
  const desiredOffset = new THREE.Vector3(planar.x, desiredHeight, planar.z)

  if (cameraMode === MINIGOLF_CAMERA_MODES.OVERHEAD) {
    const nextOffset = safeOffset.lerp(new THREE.Vector3(0.01, Math.max(20, desiredHeight * 1.45), 0.01), 0.1)
    const nextTarget = controlsTarget.clone().lerp(desiredTarget, preset.targetLerp)
    const nextCameraPosition = nextTarget.clone().add(nextOffset)
    return {
      mode: cameraMode,
      nextTarget,
      nextCameraPosition,
      nextOffset
    }
  }

  if (isInteracting || now < pauseFollowUntil) {
    return {
      mode: cameraMode,
      nextTarget: controlsTarget.clone(),
      nextCameraPosition: cameraPosition.clone(),
      nextOffset: syncMiniGolfCameraOffset(cameraPosition, controlsTarget, safeOffset)
    }
  }

  const nextTarget = controlsTarget.clone().lerp(desiredTarget, preset.targetLerp)
  const nextOffset = safeOffset.clone().lerp(desiredOffset, 0.06)
  const nextCameraPosition = cameraPosition.clone().lerp(nextTarget.clone().add(nextOffset), preset.cameraLerp)
  return {
    mode: cameraMode,
    nextTarget,
    nextCameraPosition,
    nextOffset
  }
}
