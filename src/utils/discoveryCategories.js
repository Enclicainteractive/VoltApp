export const DEFAULT_DISCOVERY_CATEGORIES = [
  { id: 'community', name: 'Community' },
  { id: 'gaming', name: 'Gaming' },
  { id: 'music', name: 'Music' },
  { id: 'art', name: 'Art' },
  { id: 'science', name: 'Science' },
  { id: 'education', name: 'Education' },
  { id: 'entertainment', name: 'Entertainment' },
  { id: 'sports', name: 'Sports' },
  { id: 'business', name: 'Business' },
  { id: 'general', name: 'General' }
]

const titleCase = (value = '') =>
  value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

export const normalizeDiscoveryCategories = (rawCategories) => {
  const seed = Array.isArray(rawCategories) && rawCategories.length > 0
    ? rawCategories
    : DEFAULT_DISCOVERY_CATEGORIES

  const normalized = seed
    .map(cat => {
      if (typeof cat === 'string') {
        const id = cat.trim().toLowerCase()
        return id ? { id, name: titleCase(id) } : null
      }
      if (!cat || typeof cat !== 'object') return null
      const id = String(cat.id || cat.value || '').trim().toLowerCase()
      if (!id) return null
      const name = String(cat.name || '').trim() || titleCase(id)
      return { ...cat, id, name }
    })
    .filter(Boolean)

  const deduped = []
  const seen = new Set()
  for (const cat of normalized) {
    if (seen.has(cat.id)) continue
    seen.add(cat.id)
    deduped.push(cat)
  }
  return deduped
}
