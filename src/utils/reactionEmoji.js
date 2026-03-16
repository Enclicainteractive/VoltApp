const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value)

export const isCustomReactionEmoji = (emoji) => {
  if (!isPlainObject(emoji)) return false
  if (emoji.type === 'custom') return true
  return typeof emoji.id === 'string' && typeof emoji.name === 'string' && typeof emoji.url === 'string'
}

export const normalizeReactionEmoji = (emoji) => {
  if (!isCustomReactionEmoji(emoji)) return emoji

  return {
    type: 'custom',
    id: emoji.id,
    name: emoji.name,
    url: emoji.url,
    host: emoji.host || null,
    serverId: emoji.serverId || null
  }
}

export const serializeReactionEmoji = (emoji) => {
  const normalized = normalizeReactionEmoji(emoji)
  if (isCustomReactionEmoji(normalized)) {
    return JSON.stringify(normalized)
  }
  return typeof normalized === 'string' ? normalized : String(normalized || '')
}

export const deserializeReactionEmoji = (emojiValue) => {
  if (isCustomReactionEmoji(emojiValue)) {
    return normalizeReactionEmoji(emojiValue)
  }

  if (typeof emojiValue !== 'string') {
    return emojiValue
  }

  try {
    const parsed = JSON.parse(emojiValue)
    if (isCustomReactionEmoji(parsed)) {
      return normalizeReactionEmoji(parsed)
    }
  } catch {}

  return emojiValue
}
