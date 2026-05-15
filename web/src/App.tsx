import { useState } from 'react'
import SetupPage from './pages/SetupPage'
import SessionPage from './pages/SessionPage'
import type { SessionConfig } from './types'

type View =
  | { screen: 'setup' }
  | { screen: 'session'; sessionId: string; config: SessionConfig }

export default function App() {
  const [view, setView] = useState<View>({ screen: 'setup' })

  if (view.screen === 'session') {
    return (
      <SessionPage
        sessionId={view.sessionId}
        config={view.config}
        onBack={() => setView({ screen: 'setup' })}
      />
    )
  }

  return (
    <SetupPage
      onStart={(sessionId, config) =>
        setView({ screen: 'session', sessionId, config })
      }
    />
  )
}
