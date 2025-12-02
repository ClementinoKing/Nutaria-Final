import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react'

const STORAGE_KEY = 'nutaria-theme'

interface ThemeContextValue {
  theme: string
  setTheme: (theme: string) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const prefersDark = () =>
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-color-scheme: dark)').matches

function getInitialTheme() {
  if (typeof window === 'undefined') {
    return 'light'
  }

  const stored = window.localStorage.getItem(STORAGE_KEY)
  const resolved = stored === 'light' || stored === 'dark' ? stored : prefersDark() ? 'dark' : 'light'

  if (typeof document !== 'undefined') {
    const root = document.documentElement
    root.classList.toggle('dark', resolved === 'dark')
    root.setAttribute('data-theme', resolved)
  }

  return resolved
}

interface ThemeProviderProps {
  children: ReactNode
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setTheme] = useState(() => getInitialTheme())

  useEffect(() => {
    if (typeof window === 'undefined') return

    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    root.setAttribute('data-theme', theme)
    window.localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (event: MediaQueryListEvent) => {
      const storedPreference = window.localStorage.getItem(STORAGE_KEY)
      if (storedPreference !== 'light' && storedPreference !== 'dark') {
        setTheme(event.matches ? 'dark' : 'light')
      }
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }, [])

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, toggleTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}


