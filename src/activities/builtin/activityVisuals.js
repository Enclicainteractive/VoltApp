import React from 'react'
import {
  PuzzlePieceIcon,
  PhotoIcon
} from '@heroicons/react/24/outline'
import {
  getActivityIcon as getBuiltinActivityIcon,
  getCategoryIcon
} from './ActivityIcons'

const normalizeBuiltinKey = (value) => {
  if (!value || typeof value !== 'string') return null
  return value.replace(/^builtin:/, '').trim() || null
}

export const getActivityVisualComponent = (activity = {}) => {
  const builtinKey = normalizeBuiltinKey(activity.iconKey || activity.key || activity.id)
  if (builtinKey) {
    const BuiltinIcon = getBuiltinActivityIcon(builtinKey)
    if (BuiltinIcon) return BuiltinIcon
  }

  const CategoryIcon = getCategoryIcon(activity.category || 'custom')
  return CategoryIcon || PuzzlePieceIcon
}

export const renderActivityVisual = (activity = {}, className = 'activity-card-icon') => {
  if (activity.iconUrl) {
    return <img src={activity.iconUrl} alt="" className={`${className}-img`} />
  }

  const IconComponent = getActivityVisualComponent(activity)
  if (!IconComponent) return <PhotoIcon className={className} />
  return <IconComponent className={className} />
}

export const getActivityVisualLabel = (activity = {}) => (
  String(activity.category || activity.name || activity.id || 'activity').toLowerCase()
)
