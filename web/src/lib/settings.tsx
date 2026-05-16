import { useEffect, useRef, useState } from 'react'
import { Settings, Sun, Moon, Monitor } from 'lucide-react'
import { useTheme, type Theme } from './theme'

const NEXT_THEME: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }
const THEME_LABEL: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' }
const THEME_ICON: Record<Theme, React.ReactNode> = {
  system: <Monitor size={13} />,
  light:  <Sun size={13} />,
  dark:   <Moon size={13} />,
}

export function SettingsMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  return (
    <div ref={ref} className="relative flex items-center gap-2">
      <div className="w-px h-4 bg-[var(--c-border)] shrink-0" />

      <button
          onClick={() => setOpen(v => !v)}
          className={`transition-colors ${open ? 'text-[var(--c-muted-2)]' : 'text-[var(--c-muted)] hover:text-[var(--c-muted-2)]'}`}
        title="Settings"
      >
        <Settings size={15} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-44 border border-[var(--c-border)] rounded-lg bg-[var(--c-surface)] shadow-md py-1 z-50">
          <button
            onClick={() => setTheme(NEXT_THEME[theme])}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-[12px] text-[var(--c-secondary)] hover:text-[var(--c-fg)] hover:bg-[var(--c-border-subtle)] transition-colors rounded-[5px] mx-auto"
            style={{ width: 'calc(100% - 8px)', marginLeft: 4 }}
          >
            <span>Theme</span>
            <span className="flex items-center gap-1.5 text-[var(--c-muted-2)]">
              {THEME_ICON[theme]}
              <span className="text-[11px] font-mono">{THEME_LABEL[theme]}</span>
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
