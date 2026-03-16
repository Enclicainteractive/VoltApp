import { describe, expect, it } from 'vitest'
import { buildShotVector, sampleMovingHazardPosition, simulateShot } from './physics'

const basicHole = {
  tee: { x: -8, z: 0 },
  cup: { x: 8, z: 0, radius: 0.6 },
  bounds: { minX: -10, maxX: 10, minZ: -6, maxZ: 6 },
  surfaces: [
    { id: 'fairway', type: 'fairway', shape: 'box', position: { x: 0, z: 0 }, size: { x: 20, z: 12 } }
  ],
  obstacles: [],
  hazards: [],
  checkpoints: []
}

describe('minigolf physics', () => {
  it('builds a shot vector from angle and power', () => {
    const vector = buildShotVector({ angle: 0, power: 0.5, powerScale: 10 })
    expect(vector.x).toBeCloseTo(5)
    expect(vector.z).toBeCloseTo(0)
  })

  it('captures a slow shot into the cup', () => {
    const result = simulateShot({
      hole: basicHole,
      start: { x: 7.6, z: 0 },
      shot: { velocity: { x: 0.4, z: 0 } }
    })

    expect(result.inHole).toBe(true)
    expect(result.resultType).toBe('cup')
    expect(result.finalPosition.x).toBeCloseTo(8)
  })

  it('resets to the checkpoint when a hazard is hit', () => {
    const result = simulateShot({
      hole: {
        ...basicHole,
        hazards: [
          { id: 'water', type: 'water', shape: 'box', position: { x: -1, z: 0 }, size: { x: 3, z: 3 } }
        ]
      },
      start: { x: -8, z: 0 },
      shot: { velocity: { x: 8, z: 0 } }
    })

    expect(result.inHole).toBe(false)
    expect(result.resultType).toBe('hazard-reset')
    expect(result.finalPosition).toEqual({ x: -8, z: 0 })
  })

  it('bounces off box obstacles and stays inside bounds', () => {
    const result = simulateShot({
      hole: {
        ...basicHole,
        obstacles: [
          { id: 'wall', shape: 'box', position: { x: 0, z: 0 }, size: { x: 2, z: 10 } }
        ]
      },
      start: { x: -6, z: 0 },
      shot: { velocity: { x: 10, z: 0 } }
    })

    expect(result.collisionCount).toBeGreaterThan(0)
    expect(result.finalPosition.x).toBeLessThan(0)
  })

  it('samples moving hazards along the configured axis', () => {
    const position = sampleMovingHazardPosition({
      position: { x: 2, z: 3 },
      movement: { axis: 'z', amplitude: 4, speed: 1 }
    }, Math.PI / 2)

    expect(position.x).toBe(2)
    expect(position.z).toBeGreaterThan(3)
  })
})
