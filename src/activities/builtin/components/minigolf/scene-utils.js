import { getSurfacePreset } from './courses'

export const getSurfaceColor = (surfaceType, palette = {}) => {
  if (surfaceType === 'rough') return palette.rough || '#3f7f49'
  if (surfaceType === 'ice') return '#abebff'
  if (surfaceType === 'sand') return '#cab27b'
  if (surfaceType === 'boost') return '#7af7d6'
  if (surfaceType === 'sticky') return '#756682'
  return palette.fairway || getSurfacePreset(surfaceType).color
}

export const getHazardColor = (hazardType, palette = {}) => {
  if (hazardType === 'lava') return '#ff6b2d'
  if (hazardType === 'void') return '#0e1321'
  return palette.hazard || '#42c8ff'
}

export const boxArgs = (entity) => [
  Number(entity?.size?.x || 1),
  Number(entity?.height || 0.5),
  Number(entity?.size?.z || 1)
]

export const toVector3 = (point, y = 0) => [Number(point?.x || 0), y, Number(point?.z || 0)]

export const getEntityPosition = (entity) => [Number(entity?.position?.x || 0), Number(entity?.y || 0), Number(entity?.position?.z || 0)]

export const buildAimLinePoints = (origin, angle, power) => {
  const length = 2.5 + power * 8
  const points = []
  for (let i = 0; i <= 14; i += 1) {
    const t = i / 14
    const distance = t * length
    points.push([
      origin.x + Math.cos(angle) * distance,
      0.22 + Math.sin(t * Math.PI) * 0.15,
      origin.z + Math.sin(angle) * distance
    ])
  }
  return points
}
