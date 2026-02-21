import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { languages, translations, defaultLanguage, getNestedValue, translate as translateFn } from '../i18n'

const I18nContext = createContext(null)

// Get saved language from localStorage or use default
const getSavedLanguage = () => {
  try {
    const saved = localStorage.getItem('volt_language')
    if (saved && languages[saved]) {
      return saved
    }
  } catch (e) {
    console.warn('Could not get saved language:', e)
  }
  return defaultLanguage
}

export const I18nProvider = ({ children }) => {
  const [language, setLanguageState] = useState(getSavedLanguage)
  const [isLoaded, setIsLoaded] = useState(true)

  const normalizeTranslateArgs = useCallback((fallbackOrReplacements = {}, maybeReplacements = {}) => {
    if (typeof fallbackOrReplacements === 'string') {
      return {
        fallback: fallbackOrReplacements,
        replacements: (maybeReplacements && typeof maybeReplacements === 'object') ? maybeReplacements : {}
      }
    }

    return {
      fallback: null,
      replacements: (fallbackOrReplacements && typeof fallbackOrReplacements === 'object') ? fallbackOrReplacements : {}
    }
  }, [])

  // Save language to localStorage whenever it changes
  const setLanguage = useCallback((lang) => {
    if (languages[lang]) {
      setLanguageState(lang)
      try {
        localStorage.setItem('volt_language', lang)
      } catch (e) {
        console.warn('Could not save language:', e)
      }
    }
  }, [])

  // Translation function - gets translation for current language
  const t = useCallback((key, fallbackOrReplacements = {}, maybeReplacements = {}) => {
    const { fallback, replacements } = normalizeTranslateArgs(fallbackOrReplacements, maybeReplacements)
    const translated = translateFn(language, key, replacements)
    return translated === key && typeof fallback === 'string' ? fallback : translated
  }, [language, normalizeTranslateArgs])

  // Get translation for a specific language (useful for language selector)
  const tFor = useCallback((lang, key, fallbackOrReplacements = {}, maybeReplacements = {}) => {
    const { fallback, replacements } = normalizeTranslateArgs(fallbackOrReplacements, maybeReplacements)
    const translated = translateFn(lang, key, replacements)
    return translated === key && typeof fallback === 'string' ? fallback : translated
  }, [normalizeTranslateArgs])

  // Get current translations object
  const currentTranslations = translations[language] || translations[defaultLanguage]

  // Get nested value directly
  const get = useCallback((key) => {
    return getNestedValue(currentTranslations, key)
  }, [currentTranslations])

  const value = {
    language,
    setLanguage,
    t,
    tFor,
    get,
    languages,
    translations: currentTranslations,
    isLoaded,
    availableLanguages: Object.entries(languages).map(([code, info]) => ({
      code,
      ...info
    }))
  }

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  )
}

export const useI18n = () => {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider')
  }
  return context
}

// Higher-order component for components that need translation
export const withTranslation = (Component) => {
  return (props) => {
    const i18n = useI18n()
    return <Component {...props} t={i18n.t} language={i18n.language} />
  }
}

export default I18nContext
