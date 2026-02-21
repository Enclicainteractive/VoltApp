import en from './locales/en.json'
import es from './locales/es.json'
import de from './locales/de.json'

export const languages = {
  en: { name: 'English', nativeName: 'English', flag: '🇬🇧' },
  es: { name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  de: { name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' }
}

export const translations = {
  en,
  es,
  de
}

export const defaultLanguage = 'en'

// Track warned keys to avoid duplicate warnings
const warnedKeys = new Set()

// Check for duplicate keys within each translation file
const checkForDuplicates = () => {
  const checkFile = (lang, data) => {
    const seen = new Map()
    const duplicates = []
    
    const scan = (obj, prefix = '') => {
      for (const key in obj) {
        const fullKey = prefix ? `${prefix}.${key}` : key
        if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
          scan(obj[key], fullKey)
        } else {
          if (seen.has(fullKey)) {
            duplicates.push(`${lang}: ${fullKey}`)
          } else {
            seen.set(fullKey, true)
          }
        }
      }
    }
    
    scan(data)
    return duplicates
  }
  
  const allDuplicates = [
    ...checkFile('en', en),
    ...checkFile('es', es),
    ...checkFile('de', de)
  ]
  
  if (allDuplicates.length > 0) {
    console.warn('[i18n] Duplicate translation keys found:', allDuplicates)
  }
}

// Run duplicate check once on load
if (typeof window !== 'undefined') {
  setTimeout(checkForDuplicates, 1000)
}

// Get nested value from object using dot notation
export const getNestedValue = (obj, path) => {
  return path.split('.').reduce((acc, part) => acc && acc[part], obj)
}

// Translation function
export const translate = (lang, key, replacements = {}) => {
  const translation = getNestedValue(translations[lang], key) || getNestedValue(translations[defaultLanguage], key)
  
  // Warn if translation is missing (key not found in any language)
  if (translation === undefined && !warnedKeys.has(key)) {
    warnedKeys.add(key)
    console.warn(`[i18n] Missing translation: "${key}" for language "${lang}"`)
  }
  
  // If no translation found, return the key itself
  const result = translation !== undefined ? translation : key
  
  // Handle replacements like {name} -> value or {{name}} -> value
  if (typeof result === 'string' && Object.keys(replacements).length > 0) {
    // Replace double-brace tokens first so "{{name}}" doesn't become "{value}".
    return result.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return replacements[key] !== undefined ? replacements[key] : match
    }).replace(/\{(\w+)\}/g, (match, key) => {
      return replacements[key] !== undefined ? replacements[key] : match
    })
  }
  
  return result
}

export default { languages, translations, defaultLanguage, translate }
