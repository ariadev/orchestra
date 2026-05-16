import { useState } from 'react'
import HomePage from './pages/HomePage'
import SetupPage from './pages/SetupPage'
import SessionPage from './pages/SessionPage'
import type { SavedSession, SessionConfig } from './types'
import { ThemeProvider } from './lib/theme'

type View =
  | { screen: 'home' }
  | { screen: 'setup' }
  | { screen: 'live'; sessionId: string; config: SessionConfig }
  | { screen: 'replay'; session: SavedSession }

function AppInner() {
  const [view, setView] = useState<View>({ screen: 'home' })

  switch (view.screen) {
    case 'setup':
      return (
        <SetupPage
          onBack={() => setView({ screen: 'home' })}
          onStart={(sessionId, config) =>
            setView({ screen: 'live', sessionId, config })
          }
        />
      )

    case 'live':
      return (
        <SessionPage
          mode="live"
          sessionId={view.sessionId}
          config={view.config}
          onBack={() => setView({ screen: 'home' })}
        />
      )

    case 'replay':
      return (
        <SessionPage
          mode="replay"
          session={view.session}
          onBack={() => setView({ screen: 'home' })}
        />
      )

    default:
      return (
        <HomePage
          onNew={() => setView({ screen: 'setup' })}
          onOpen={(session) => setView({ screen: 'replay', session })}
        />
      )
  }
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  )
}
