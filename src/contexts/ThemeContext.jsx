import React, { createContext, useContext, useState, useEffect } from 'react'
import { themes } from '../theme/themes'

const CUSTOM_THEMES_KEY = 'voltchat_custom_themes'

const ThemeContext = createContext(null)

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('voltchat_theme')
    return saved || 'dark'
  })
  
  const [customThemes, setCustomThemes] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(CUSTOM_THEMES_KEY)) || []
    } catch {
      return []
    }
  })

  const allThemes = [...themes, ...customThemes]

  const applyThemeVars = (id) => {
    const root = document.documentElement
    const selected = allThemes.find(t => t.id === id) || themes[0]
    const baseMode = selected?.mode === 'auto' ? null : (selected?.mode || 'dark')
    const allKeys = Array.from(new Set(allThemes.flatMap(t => Object.keys(t.vars || {}))))
    const knownKeys = Array.from(new Set([...allKeys, '--volt-bg-gradient']))
    knownKeys.forEach(k => root.style.removeProperty(k))

    Object.keys(selected?.vars || {}).forEach(key => {
      root.style.setProperty(key, selected.vars[key])
    })

    if (selected?.vars) {
      root.setAttribute('data-theme', baseMode || 'dark')
    }

    if (id === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      root.setAttribute('data-theme', prefersDark ? 'dark' : 'light')
    }
  }

  const addCustomTheme = (customTheme) => {
    const newTheme = {
      ...customTheme,
      id: `custom_${Date.now()}`,
      isCustom: true
    }
    const updated = [...customThemes, newTheme]
    setCustomThemes(updated)
    localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(updated))
    return newTheme.id
  }

  const removeCustomTheme = (id) => {
    const updated = customThemes.filter(t => t.id !== id)
    setCustomThemes(updated)
    localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(updated))
    if (theme === id) setTheme('dark')
  }

  useEffect(() => {
    applyThemeVars(theme)
    localStorage.setItem('voltchat_theme', theme)
  }, [theme])

  useEffect(() => {
    if (theme === 'auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = (e) => {
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light')
      }
      mediaQuery.addEventListener('change', handler)
      return () => mediaQuery.removeEventListener('change', handler)
    }
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, customThemes, addCustomTheme, removeCustomTheme, allThemes }}>
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
