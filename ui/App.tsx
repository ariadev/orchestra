import { useState } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
import { SetupScreen } from "./components/SetupScreen"
import { SessionScreen } from "./components/SessionScreen"
import { C, type SessionConfig } from "./types"

export function App() {
  const renderer = useRenderer()
  const [screen, setScreen] = useState<"setup" | "session">("setup")
  const [config, setConfig] = useState<SessionConfig | null>(null)

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
        onBack={() => {
          setConfig(null)
          setScreen("setup")
        }}
      />
    )
  }

  return (
    <SetupScreen
      onStart={(cfg) => {
        setConfig(cfg)
        setScreen("session")
      }}
    />
  )
}
