import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { App } from "./App"
import { listSessions, loadSession, getSessionsDir, type SessionRecord } from "./storage"

const args = process.argv.slice(2)

// ── --list ─────────────────────────────────────────────────────────────────────

if (args[0] === "--list") {
  const sessions = await listSessions()
  const dir = getSessionsDir().replace(process.env.HOME ?? "", "~")

  if (sessions.length === 0) {
    console.log(`\nNo sessions saved yet.\n`)
  } else {
    const COL_KEY  = 17
    const COL_NAME = 38
    const COL_DATE = 13

    const hr = `  ${"─".repeat(COL_KEY)} ${"─".repeat(COL_NAME)} ${"─".repeat(COL_DATE)}`
    const hdr = `  ${"KEY".padEnd(COL_KEY)} ${"NAME".padEnd(COL_NAME)} DATE`

    console.log()
    console.log(hdr)
    console.log(hr)

    for (const s of sessions) {
      const key  = s.key.padEnd(COL_KEY)
      const name = (s.name || "(unnamed)").slice(0, COL_NAME).padEnd(COL_NAME)
      const date = new Date(s.date).toLocaleDateString("en-US", {
        year: "numeric", month: "short", day: "numeric",
      })
      console.log(`  ${key} ${name} ${date}`)
    }

    const plural = sessions.length === 1 ? "session" : "sessions"
    console.log(`\n  ${sessions.length} ${plural}  •  ${dir}\n`)
  }

  process.exit(0)
}

// ── --open <key> ───────────────────────────────────────────────────────────────

let openRecord: SessionRecord | null = null

if (args[0] === "--open") {
  const key = args[1]
  if (!key) {
    console.error(`\nUsage: orchestra --open <key>\nRun with --list to see saved sessions.\n`)
    process.exit(1)
  }

  openRecord = await loadSession(key)
  if (!openRecord) {
    const dir = getSessionsDir().replace(process.env.HOME ?? "", "~")
    console.error(`\nSession '${key}' not found in ${dir}`)
    console.error(`Run with --list to see available sessions.\n`)
    process.exit(1)
  }
}

// ── TUI ────────────────────────────────────────────────────────────────────────

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
  screenMode: "alternate-screen",
  backgroundColor: "#0d1117",
  targetFps: 30,
})

renderer.setTerminalTitle("Orchestra — Discussion Room")

createRoot(renderer).render(<App openRecord={openRecord} />)
