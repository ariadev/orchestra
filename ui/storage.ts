import path from "path"
import { existsSync, mkdirSync } from "fs"
import type { SessionConfig, SessionState } from "./types"

export interface SessionRecord {
  key: string
  name: string
  date: string
  config: SessionConfig
  state: SessionState
}

const SESSIONS_DIR = path.join(
  process.env.HOME ?? process.env.USERPROFILE ?? ".",
  ".orchestra",
  "sessions",
)

function ensureDir() {
  if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR, { recursive: true })
}

export function getSessionsDir(): string {
  ensureDir()
  return SESSIONS_DIR
}

export function generateKey(): string {
  const d = new Date()
  const date =
    `${d.getFullYear()}` +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0")
  const rand = Math.random().toString(36).slice(2, 6)
  return `${date}-${rand}`
}

export async function saveSession(record: SessionRecord): Promise<void> {
  ensureDir()
  const file = path.join(SESSIONS_DIR, `${record.key}.json`)
  await Bun.write(file, JSON.stringify(record, null, 2))
}

export async function listSessions(): Promise<SessionRecord[]> {
  ensureDir()
  const glob = new Bun.Glob("*.json")
  const files = [...glob.scanSync(SESSIONS_DIR)].sort().reverse()
  const records: SessionRecord[] = []
  for (const f of files) {
    try {
      const data = await Bun.file(path.join(SESSIONS_DIR, f)).json()
      records.push(data as SessionRecord)
    } catch {}
  }
  return records
}

export async function loadSession(key: string): Promise<SessionRecord | null> {
  const file = path.join(SESSIONS_DIR, `${key}.json`)
  if (!existsSync(file)) return null
  try {
    return (await Bun.file(file).json()) as SessionRecord
  } catch {
    return null
  }
}
