import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  MINIGOLF_CAMERA_MODES,
  buildMiniGolfCameraFrame,
  cloneMiniGolfCameraOffset,
  getMiniGolfCameraInteractionPause,
  shouldResetMiniGolfCamera,
  syncMiniGolfCameraOffset
} from './camera'

describe('minigolf camera helpers', () => {
  it('only resets when booting or the reset key changes', () => {
    expect(shouldResetMiniGolfCamera({ hasBooted: false, lastResetKey: 'a', nextResetKey: 'a' })).toBe(true)
    expect(shouldResetMiniGolfCamera({ hasBooted: true, lastResetKey: 'a', nextResetKey: 'a' })).toBe(false)
    expect(shouldResetMiniGolfCamera({ hasBooted: true, lastResetKey: 'a', nextResetKey: 'b' })).toBe(true)
  })

  it('computes a follow frame that moves target and camera toward the ball', () => {
    const frame = buildMiniGolfCameraFrame({
      cameraMode: MINIGOLF_CAMERA_MODES.FOLLOW,
      liveTarget: { x: 12, z: -6 },
      controlsTarget: new THREE.Vector3(0, 0.1, 0),
      cameraPosition: new THREE.Vector3(0, 12, 14),
      offset: cloneMiniGolfCameraOffset(MINIGOLF_CAMERA_MODES.FOLLOW),
      now: 1000,
      pauseFollowUntil: 0
    })

    expect(frame.nextTarget.x).toBeGreaterThan(0)
    expect(frame.nextTarget.z).toBeLessThan(0)
    expect(frame.nextCameraPosition.x).toBeGreaterThan(0)
  })

  it('preserves manual positioning while follow is paused', () => {
    const controlsTarget = new THREE.Vector3(4, 0.1, 2)
    const cameraPosition = new THREE.Vector3(10, 14, 18)
    const frame = buildMiniGolfCameraFrame({
      cameraMode: MINIGOLF_CAMERA_MODES.FOLLOW,
      liveTarget: { x: 12, z: 8 },
      controlsTarget,
      cameraPosition,
      offset: cloneMiniGolfCameraOffset(MINIGOLF_CAMERA_MODES.FOLLOW),
      isInteracting: true,
      now: 1000,
      pauseFollowUntil: 2000
    })

    expect(frame.nextTarget.equals(controlsTarget)).toBe(true)
    expect(frame.nextCameraPosition.equals(cameraPosition)).toBe(true)
    expect(frame.nextOffset.toArray()).toEqual(syncMiniGolfCameraOffset(cameraPosition, controlsTarget).toArray())
  })

  it('uses zero pause for free and overhead modes', () => {
    expect(getMiniGolfCameraInteractionPause(MINIGOLF_CAMERA_MODES.FREE)).toBe(0)
    expect(getMiniGolfCameraInteractionPause(MINIGOLF_CAMERA_MODES.OVERHEAD)).toBe(0)
    expect(getMiniGolfCameraInteractionPause(MINIGOLF_CAMERA_MODES.FOLLOW)).toBeGreaterThan(0)
  })
})
