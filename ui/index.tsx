import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { App } from "./App"

const renderer = await createCliRenderer({
  exitOnCtrlC: false,   // handled in App.tsx for clean subprocess teardown
  screenMode: "alternate-screen",
  backgroundColor: "#0d1117",
  targetFps: 30,
})

renderer.setTerminalTitle("Orchestra — Discussion Room")

createRoot(renderer).render(<App />)
