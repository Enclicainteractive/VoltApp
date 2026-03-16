import { getMiniGolfCourse } from './courses'

const PROGRESSION_STORAGE_KEY = 'volt_minigolf_progress'

const DEFAULT_PROGRESS = {
  version: 1,
  unlockedCourses: ['skyline'],
  courseStars: {},
  holeBestScores: {},
  totalStars: 0
}

export const loadProgression = () => {
  if (typeof window === 'undefined') return { ...DEFAULT_PROGRESS }
  try {
    const stored = window.localStorage.getItem(PROGRESSION_STORAGE_KEY)
    if (!stored) return { ...DEFAULT_PROGRESS }
    const parsed = JSON.parse(stored)
    return {
      ...DEFAULT_PROGRESS,
      ...parsed,
      unlockedCourses: parsed.unlockedCourses || ['skyline']
    }
  } catch {
    return { ...DEFAULT_PROGRESS }
  }
}

export const saveProgression = (progress) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PROGRESSION_STORAGE_KEY, JSON.stringify(progress))
  } catch {
    console.warn('Failed to save minigolf progression')
  }
}

export const calculateStars = (strokes, par) => {
  const diff = strokes - par
  if (diff <= -1) return 3
  if (diff === 0) return 2
  if (diff <= 2) return 1
  return 0
}

export const isCourseUnlocked = (progress, courseId) => {
  return progress.unlockedCourses.includes(courseId)
}

export const isCourseComplete = (progress, courseId, holeCount) => {
  const stars = progress.courseStars[courseId]
  if (!stars) return false
  return Object.keys(stars).length >= holeCount
}

export const getCourseStars = (progress, courseId) => {
  const stars = progress.courseStars[courseId] || {}
  return Object.values(stars).reduce((sum, s) => sum + (s || 0), 0)
}

export const getUnlockRequirement = (courseOrder, courseId) => {
  const index = courseOrder.indexOf(courseId)
  if (index <= 0) return null
  const prevCourse = courseOrder[index - 1]
  return { courseId: prevCourse, courseName: getCourseName(prevCourse) }
}

const getCourseName = (courseId) => {
  return getMiniGolfCourse(courseId)?.name || courseId
}

export const unlockCourse = (progress, courseId) => {
  if (progress.unlockedCourses.includes(courseId)) return progress
  return {
    ...progress,
    unlockedCourses: [...progress.unlockedCourses, courseId]
  }
}

export const recordHoleScore = (progress, courseId, holeId, strokes, par) => {
  const newStars = calculateStars(strokes, par)
  const existingStars = progress.courseStars[courseId]?.[holeId] || 0
  const newBest = Math.min(
    progress.holeBestScores[`${courseId}:${holeId}`] || Infinity,
    strokes
  )

  const courseStars = { ...(progress.courseStars[courseId] || {}) }
  if (newStars > existingStars) {
    courseStars[holeId] = newStars
  }

  const holeBest = { ...progress.holeBestScores }
  holeBest[`${courseId}:${holeId}`] = newBest

  const nextCourseStars = {
    ...progress.courseStars,
    [courseId]: courseStars
  }
  const totalStars = Object.values(nextCourseStars)
    .flatMap((entry) => Object.values(entry || {}))
    .reduce((sum, s) => sum + (s || 0), 0)

  return {
    ...progress,
    courseStars: nextCourseStars,
    holeBestScores: holeBest,
    totalStars
  }
}

export const getProgressSummary = (progress, courseOrder) => {
  return courseOrder.map((courseId, index) => ({
    id: courseId,
    unlocked: progress.unlockedCourses.includes(courseId),
    stars: progress.courseStars[courseId] || {},
    totalStars: Object.values(progress.courseStars[courseId] || {}).reduce((a, b) => a + (b || 0), 0),
    isComplete: isCourseComplete(progress, courseId, getMiniGolfCourse(courseId)?.holeCount || 0),
    unlockRequired: index > 0 ? courseOrder[index - 1] : null
  }))
}
