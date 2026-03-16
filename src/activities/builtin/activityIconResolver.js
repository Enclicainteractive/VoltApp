import {
  ActivityIconMap,
  getActivityIcon as getBuiltinActivityIcon,
  getCategoryIcon as getBuiltinCategoryIcon
} from './ActivityIcons'
import {
  getBuiltinActivityDefinition,
  normalizeBuiltinDefinitionId
} from './definitions'

const getActivityRecord = (activity = {}) => {
  const rawId = activity.activityId || activity.id || activity.key || activity.iconKey
  const builtinId = normalizeBuiltinDefinitionId(rawId)
  const builtinDefinition = builtinId ? getBuiltinActivityDefinition(builtinId) : null
  return {
    builtinId,
    builtinDefinition
  }
}

export const resolveActivityCategoryKey = (activity = {}) => {
  const { builtinDefinition } = getActivityRecord(activity)
  return String(activity.category || builtinDefinition?.category || 'custom').toLowerCase()
}

export const resolveActivityIconComponent = (activity = {}) => {
  const { builtinDefinition } = getActivityRecord(activity)
  if (builtinDefinition?.iconKey || builtinDefinition?.key) {
    return getBuiltinActivityIcon(builtinDefinition.iconKey || builtinDefinition.key)
  }

  const customKey = String(activity.iconKey || activity.key || '').replace(/^builtin:/, '')
  if (customKey && ActivityIconMap[customKey]) {
    return getBuiltinActivityIcon(customKey)
  }

  return getBuiltinCategoryIcon(resolveActivityCategoryKey(activity))
}
