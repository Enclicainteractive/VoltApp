import { useI18n } from '../contexts/I18nContext'

// Convenience hook for translations - simplifies using the i18n context
export const useTranslation = () => {
  const { t, language, setLanguage, languages, availableLanguages, translations, isLoaded } = useI18n()
  
  return {
    t,
    language,
    setLanguage,
    languages,
    availableLanguages,
    translations,
    isLoaded
  }
}

export default useTranslation
