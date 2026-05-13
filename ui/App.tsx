import { useState } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
import { SetupScreen } from "./components/SetupScreen"
import { SessionScreen } from "./components/SessionScreen"
import { C, type SessionConfig, type SessionState } from "./types"
import type { SessionRecord } from "./storage"

interface Props {
  openRecord?: SessionRecord | null
}

export function App({ openRecord }: Props) {
  const renderer = useRenderer()

  const [screen, setScreen]       = useState<"setup" | "session">(openRecord ? "session" : "setup")
  const [config, setConfig]       = useState<SessionConfig | null>(openRecord?.config ?? null)
  const [savedState, setSavedState] = useState<SessionState | null>(openRecord?.state ?? null)
  const [savedMeta, setSavedMeta] = useState<{ key: string; name: string } | null>(
    openRecord ? { key: openRecord.key, name: openRecord.name } : null
  )

  useKeyboard((key) => {
    if (key.ctrl && key.name === "c") {
      renderer.destroy()
      process.exit(0)
    }
  })

  if (screen === "session" && config) {
    return (
      <SessionScreen
        config={config}
        initialState={savedState ?? undefined}
        sessionMeta={savedMeta ?? undefined}
        onBack={() => {
          if (openRecord) {
            renderer.destroy()
            process.exit(0)
          }
          setConfig(null)
          setSavedState(null)
          setSavedMeta(null)
          setScreen("setup")
        }}
      />
    )
  }

  return (
    <SetupScreen
      onStart={(cfg) => {
        setConfig(cfg)
        setSavedState(null)
        setSavedMeta(null)
        setScreen("session")
      }}
    />
  )
}
