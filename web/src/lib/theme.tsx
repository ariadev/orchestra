import React, { createContext, useContext, useState, type ReactNode } from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'

export type Theme = 'system' | 'light' | 'dark'

export function initTheme() {
  const stored = localStorage.getItem('theme') as Theme | null
  const t = stored ?? 'system'
  document.documentElement.classList.remove('light', 'dark')
  if (t === 'light') document.documentElement.classList.add('light')
  else if (t === 'dark') document.documentElement.classList.add('dark')
}

const ThemeCtx = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: 'system',
  setTheme: () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(
    () => (localStorage.getItem('theme') as Theme) ?? 'system',
  )

  function setTheme(t: Theme) {
    setThemeState(t)
    if (t === 'system') localStorage.removeItem('theme')
    else localStorage.setItem('theme', t)
    document.documentElement.classList.remove('light', 'dark')
    if (t === 'light') document.documentElement.classList.add('light')
    else if (t === 'dark') document.documentElement.classList.add('dark')
  }

  return <ThemeCtx.Provider value={{ theme, setTheme }}>{children}</ThemeCtx.Provider>
}

export function useTheme() {
  return useContext(ThemeCtx)
}

const NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }
const TITLE: Record<Theme, string> = { system: 'System theme', light: 'Light theme', dark: 'Dark theme' }

const ICON: Record<Theme, React.ReactNode> = {
  system: <Monitor size={14} />,
  light:  <Sun size={14} />,
  dark:   <Moon size={14} />,
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  return (
    <button
      onClick={() => setTheme(NEXT[theme])}
      className="text-[var(--c-muted)] hover:text-[var(--c-muted-2)] transition-colors"
      title={TITLE[theme]}
    >
      {ICON[theme]}
    </button>
  )
}
