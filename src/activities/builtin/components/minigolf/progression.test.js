import { describe, expect, it } from 'vitest'
import { getProgressSummary, recordHoleScore } from './progression'

describe('minigolf progression', () => {
  it('keeps total stars aggregated across multiple courses', () => {
    const progress = {
      version: 1,
      unlockedCourses: ['skyline', 'forge'],
      courseStars: {
        skyline: { 'skyline-1': 2 },
        forge: { 'forge-1': 1 }
      },
      holeBestScores: {},
      totalStars: 3
    }

    const updated = recordHoleScore(progress, 'skyline', 'skyline-2', 3, 3)

    expect(updated.courseStars.skyline['skyline-2']).toBe(2)
    expect(updated.totalStars).toBe(5)
  })

  it('uses actual course hole counts in progress summaries', () => {
    const progress = {
      version: 1,
      unlockedCourses: ['skyline', 'canyon'],
      courseStars: {
        canyon: {
          'canyon-1': 2,
          'canyon-2': 2,
          'canyon-3': 1
        }
      },
      holeBestScores: {},
      totalStars: 5
    }

    const summary = getProgressSummary(progress, ['skyline', 'canyon'])
    const canyon = summary.find((entry) => entry.id === 'canyon')

    expect(canyon.isComplete).toBe(false)
  })
})
