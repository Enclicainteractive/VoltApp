import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { themes as builtInThemes } from '../theme/themes'

const DEFAULT_THEME_ID = 'dark'
const LEGACY_THEME_KEY = 'voltchat_theme'
const LEGACY_CUSTOM_THEMES_KEY = 'voltchat_custom_themes'
const LEGACY_THEME_CONFIGS_KEY = 'voltchat_theme_configs'
const STORAGE_KEY = 'voltchat_theme_state_v2'

const ThemeContext = createContext(null)

const CONTROLLED_VARS = [
  '--volt-primary', '--volt-primary-dark', '--volt-primary-light',
  '--volt-success', '--volt-warning', '--volt-danger',
  '--volt-bg-primary', '--volt-bg-secondary', '--volt-bg-tertiary', '--volt-bg-quaternary',
  '--volt-bg-type', '--volt-bg-image', '--volt-bg-opacity',
  '--volt-bg-overlay', '--volt-bg-overlay-opacity',
  '--volt-bg-pattern', '--volt-bg-pattern-opacity',
  '--volt-bg-gradient-angle', '--volt-bg-gradient-from', '--volt-bg-gradient-to',
  '--volt-surface-primary-alpha', '--volt-surface-secondary-alpha',
  '--volt-surface-tertiary-alpha', '--volt-surface-quaternary-alpha',
  '--volt-text-primary', '--volt-text-secondary', '--volt-text-muted',
  '--volt-border', '--volt-hover', '--volt-active', '--volt-shadow',
  '--volt-bg-gradient',
  '--volt-font',
  '--volt-animation-speed', '--volt-animation-duration',
  '--volt-entrance-animation', '--volt-exit-animation',
  '--volt-smooth-transitions', '--volt-reduced-motion',
  '--volt-stagger-children', '--volt-parallax-effects'
]

const safeParse = (raw, fallback) => {
  if (!raw) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

const safeLocalStorageSet = (key, value) => {
  try {
    localStorage.setItem(key, value)
  } catch (e) {
    console.warn('Failed to save to localStorage:', e.message)
  }
}

const findTheme = (allThemes, themeId) => {
  if (!allThemes || !themeId) return null
  return allThemes.find((theme) => theme.id === themeId) || null
}

const hexToRgb = (hex) => {
  if (!hex || typeof hex !== 'string') return null
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      }
    : null
}

const hexToRgbaString = (hex, alpha, fallback) => {
  if (!hex || typeof hex !== 'string') return fallback
  const rgb = hexToRgb(hex)
  if (!rgb) return fallback
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha / 100})`
}

const loadThemeState = (allThemes) => {
  const v2 = safeParse(localStorage.getItem(STORAGE_KEY), null)
  if (v2 && typeof v2 === 'object' && v2.version === 2) {
    return {
      version: 2,
      activeThemeId: v2.activeThemeId || DEFAULT_THEME_ID,
      customThemes: Array.isArray(v2.customThemes) ? v2.customThemes : [],
      themeConfigs: v2.themeConfigs && typeof v2.themeConfigs === 'object' ? v2.themeConfigs : {}
    }
  }

  const legacyThemeId = localStorage.getItem(LEGACY_THEME_KEY) || DEFAULT_THEME_ID
  const legacyCustomThemes = safeParse(localStorage.getItem(LEGACY_CUSTOM_THEMES_KEY), [])
  const legacyConfigs = safeParse(localStorage.getItem(LEGACY_THEME_CONFIGS_KEY), {})

  return {
    version: 2,
    activeThemeId: legacyThemeId,
    customThemes: Array.isArray(legacyCustomThemes) ? legacyCustomThemes : [],
    themeConfigs: legacyConfigs && typeof legacyConfigs === 'object' ? legacyConfigs : {}
  }
}

const applyThemeToDocument = ({ allThemes, activeThemeId, themeConfigs }) => {
  const root = document.documentElement
  const body = document.body
  if (!root || !body) return

  const activeTheme = findTheme(allThemes, activeThemeId)
  if (!activeTheme) return

  const config = themeConfigs?.[activeTheme.id] || {}
  const mergedVars = {
    ...(activeTheme.vars || {}),
    ...(config.vars || {})
  }

  CONTROLLED_VARS.forEach((key) => root.style.removeProperty(key))
  Object.entries(mergedVars).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      root.style.setProperty(key, String(value))
    }
  })

  if (config.font && config.font !== 'default') {
    root.style.setProperty('--volt-font', `var(--font-${config.font})`)
  }

  const mode = config.mode || activeTheme.mode || 'dark'
  const resolvedMode = mode === 'auto'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : mode
  root.setAttribute('data-theme', resolvedMode === 'light' ? 'light' : 'dark')

  const primaryRgb = hexToRgb(mergedVars['--volt-primary'])
  const successRgb = hexToRgb(mergedVars['--volt-success'])
  const warningRgb = hexToRgb(mergedVars['--volt-warning'])
  const dangerRgb = hexToRgb(mergedVars['--volt-danger'])

  if (primaryRgb) root.style.setProperty('--volt-primary-rgb', `${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}`)
  if (successRgb) root.style.setProperty('--volt-success-rgb', `${successRgb.r}, ${successRgb.g}, ${successRgb.b}`)
  if (warningRgb) root.style.setProperty('--volt-warning-rgb', `${warningRgb.r}, ${warningRgb.g}, ${warningRgb.b}`)
  if (dangerRgb) root.style.setProperty('--volt-danger-rgb', `${dangerRgb.r}, ${dangerRgb.g}, ${dangerRgb.b}`)

  root.style.setProperty(
    '--volt-bg-primary-transparent',
    hexToRgbaString(mergedVars['--volt-bg-primary'], mergedVars['--volt-surface-primary-alpha'] ?? 82, 'rgba(11, 18, 32, 0.82)')
  )
  root.style.setProperty(
    '--volt-bg-secondary-transparent',
    hexToRgbaString(mergedVars['--volt-bg-secondary'], mergedVars['--volt-surface-secondary-alpha'] ?? 78, 'rgba(15, 24, 40, 0.78)')
  )
  root.style.setProperty(
    '--volt-bg-tertiary-transparent',
    hexToRgbaString(mergedVars['--volt-bg-tertiary'], mergedVars['--volt-surface-tertiary-alpha'] ?? 75, 'rgba(22, 33, 56, 0.75)')
  )
  root.style.setProperty(
    '--volt-bg-quaternary-transparent',
    hexToRgbaString(mergedVars['--volt-bg-quaternary'], mergedVars['--volt-surface-quaternary-alpha'] ?? 72, 'rgba(29, 42, 66, 0.72)')
  )

  root.style.setProperty('--primary', 'var(--volt-primary)')
  root.style.setProperty('--primary-hover', 'var(--volt-primary-dark)')
  root.style.setProperty('--accent-color', 'var(--volt-primary)')
  root.style.setProperty('--success', 'var(--volt-success)')
  root.style.setProperty('--warning', 'var(--volt-warning)')
  root.style.setProperty('--danger', 'var(--volt-danger)')
  root.style.setProperty('--bg-primary', 'var(--volt-bg-primary)')
  root.style.setProperty('--bg-secondary', 'var(--volt-bg-secondary)')
  root.style.setProperty('--bg-tertiary', 'var(--volt-bg-tertiary)')
  root.style.setProperty('--bg-quaternary', 'var(--volt-bg-quaternary)')
  root.style.setProperty('--surface', 'var(--volt-bg-secondary)')
  root.style.setProperty('--surface-2', 'var(--volt-bg-tertiary)')
  root.style.setProperty('--card-bg', 'var(--volt-bg-tertiary)')
  root.style.setProperty('--modal-bg', 'var(--volt-bg-secondary)')
  root.style.setProperty('--text-primary', 'var(--volt-text-primary)')
  root.style.setProperty('--text-secondary', 'var(--volt-text-secondary)')
  root.style.setProperty('--text-muted', 'var(--volt-text-muted)')
  root.style.setProperty('--border-color', 'var(--volt-border)')

  const animationSpeed = mergedVars['--volt-animation-speed'] || 'normal'
  const reducedMotion = mergedVars['--volt-reduced-motion'] === '1'

  const transitions = reducedMotion
    ? { fast: '0.01ms linear', medium: '0.01ms linear', slow: '0.01ms linear' }
    : animationSpeed === 'slow'
      ? { fast: '0.24s ease', medium: '0.4s ease', slow: '0.6s ease' }
      : animationSpeed === 'fast'
        ? { fast: '0.09s ease', medium: '0.16s ease', slow: '0.24s ease' }
        : animationSpeed === 'instant'
          ? { fast: '0s linear', medium: '0s linear', slow: '0s linear' }
          : { fast: '0.15s ease', medium: '0.25s ease', slow: '0.4s ease' }

  root.style.setProperty('--transition-fast', transitions.fast)
  root.style.setProperty('--transition-medium', transitions.medium)
  root.style.setProperty('--transition-slow', transitions.slow)
  root.style.setProperty('--volt-transition-fast', transitions.fast)
  root.style.setProperty('--volt-transition-medium', transitions.medium)
  root.style.setProperty('--volt-transition-slow', transitions.slow)

  const bgType = mergedVars['--volt-bg-type'] || 'solid'
  const bgPattern = mergedVars['--volt-bg-pattern'] || 'dots'
  body.setAttribute('data-bg-type', bgType)
  body.setAttribute('data-bg-pattern', bgPattern)
  body.classList.toggle('has-background-image', bgType !== 'solid')
}

export const ThemeProvider = ({ children }) => {
  const [state, setState] = useState(() => loadThemeState(builtInThemes))

  const allThemes = useMemo(
    () => [...builtInThemes, ...state.customThemes],
    [state.customThemes]
  )

  const theme = state.activeThemeId
  const activeThemeConfig = state.themeConfigs[state.activeThemeId] || null

  const persistState = useCallback((nextState) => {
    const normalized = {
      version: 2,
      activeThemeId: nextState.activeThemeId || DEFAULT_THEME_ID,
      customThemes: Array.isArray(nextState.customThemes) ? nextState.customThemes : [],
      themeConfigs: nextState.themeConfigs && typeof nextState.themeConfigs === 'object' ? nextState.themeConfigs : {}
    }
    setState(normalized)
    safeLocalStorageSet(STORAGE_KEY, JSON.stringify(normalized))
    safeLocalStorageSet(LEGACY_THEME_KEY, normalized.activeThemeId)
    safeLocalStorageSet(LEGACY_CUSTOM_THEMES_KEY, JSON.stringify(normalized.customThemes))
    safeLocalStorageSet(LEGACY_THEME_CONFIGS_KEY, JSON.stringify(normalized.themeConfigs))
  }, [])

  const setTheme = useCallback((nextTheme) => {
    setState((current) => {
      const themeId = typeof nextTheme === 'function' ? nextTheme(current.activeThemeId) : nextTheme
      const nextState = {
        ...current,
        activeThemeId: themeId || DEFAULT_THEME_ID
      }
      safeLocalStorageSet(STORAGE_KEY, JSON.stringify(nextState))
      safeLocalStorageSet(LEGACY_THEME_KEY, nextState.activeThemeId)
      return nextState
    })
  }, [])

  const saveThemeConfig = useCallback((themeId, config) => {
    const id = themeId || DEFAULT_THEME_ID
    setState((current) => {
      const nextState = {
        ...current,
        themeConfigs: {
          ...current.themeConfigs,
          [id]: {
            ...(current.themeConfigs[id] || {}),
            ...(config || {}),
            vars: {
              ...(current.themeConfigs[id]?.vars || {}),
              ...(config?.vars || {})
            },
            id
          }
        }
      }
      safeLocalStorageSet(STORAGE_KEY, JSON.stringify(nextState))
      safeLocalStorageSet(LEGACY_THEME_CONFIGS_KEY, JSON.stringify(nextState.themeConfigs))
      return nextState
    })
  }, [])

  const saveActiveThemeConfig = useCallback((config) => {
    const id = config?.id || state.activeThemeId || DEFAULT_THEME_ID
    saveThemeConfig(id, config)
  }, [saveThemeConfig, state.activeThemeId])

  const applyThemeVars = useCallback((themeId, config) => {
    if (config) {
      saveThemeConfig(themeId, config)
      return
    }
    setTheme(themeId)
  }, [saveThemeConfig, setTheme])

  const addCustomTheme = useCallback((customTheme) => {
    const id = customTheme?.id || `custom_${Date.now()}`
    const themeToAdd = {
      ...customTheme,
      id,
      isCustom: true
    }

    setState((current) => {
      const nextCustomThemes = [...current.customThemes.filter((t) => t.id !== id), themeToAdd]
      const nextState = {
        ...current,
        customThemes: nextCustomThemes
      }
      safeLocalStorageSet(STORAGE_KEY, JSON.stringify(nextState))
      safeLocalStorageSet(LEGACY_CUSTOM_THEMES_KEY, JSON.stringify(nextCustomThemes))
      return nextState
    })

    return id
  }, [])

  const removeCustomTheme = useCallback((themeId) => {
    setState((current) => {
      const nextCustomThemes = current.customThemes.filter((themeItem) => themeItem.id !== themeId)
      const nextConfigs = { ...current.themeConfigs }
      delete nextConfigs[themeId]

      const nextState = {
        ...current,
        customThemes: nextCustomThemes,
        themeConfigs: nextConfigs,
        activeThemeId: current.activeThemeId === themeId ? DEFAULT_THEME_ID : current.activeThemeId
      }

      safeLocalStorageSet(STORAGE_KEY, JSON.stringify(nextState))
      safeLocalStorageSet(LEGACY_CUSTOM_THEMES_KEY, JSON.stringify(nextCustomThemes))
      safeLocalStorageSet(LEGACY_THEME_CONFIGS_KEY, JSON.stringify(nextConfigs))
      safeLocalStorageSet(LEGACY_THEME_KEY, nextState.activeThemeId)
      return nextState
    })
  }, [])

  const resetThemeSystem = useCallback(() => {
    persistState({
      version: 2,
      activeThemeId: DEFAULT_THEME_ID,
      customThemes: [],
      themeConfigs: {}
    })
  }, [persistState])

  const exportThemeState = useCallback(() => {
    return {
      version: 2,
      activeThemeId: state.activeThemeId,
      customThemes: state.customThemes,
      themeConfigs: state.themeConfigs,
      exportedAt: new Date().toISOString()
    }
  }, [state])

  const importThemeState = useCallback((incoming) => {
    if (!incoming || typeof incoming !== 'object') {
      throw new Error('Invalid theme file')
    }

    const nextState = {
      version: 2,
      activeThemeId: incoming.activeThemeId || DEFAULT_THEME_ID,
      customThemes: Array.isArray(incoming.customThemes) ? incoming.customThemes : [],
      themeConfigs: incoming.themeConfigs && typeof incoming.themeConfigs === 'object' ? incoming.themeConfigs : {}
    }

    persistState(nextState)
  }, [persistState])

  useEffect(() => {
    applyThemeToDocument({
      allThemes,
      activeThemeId: state.activeThemeId,
      themeConfigs: state.themeConfigs
    })
  }, [allThemes, state.activeThemeId, state.themeConfigs])

  useEffect(() => {
    const active = findTheme(allThemes, state.activeThemeId)
    if (!active) {
      setTheme(DEFAULT_THEME_ID)
    }
  }, [allThemes, state.activeThemeId, setTheme])

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        customThemes: state.customThemes,
        addCustomTheme,
        removeCustomTheme,
        allThemes,
        activeThemeConfig,
        saveActiveThemeConfig,
        applyThemeVars,
        resetThemeSystem,
        exportThemeState,
        importThemeState
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}
