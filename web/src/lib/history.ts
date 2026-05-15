import type { SavedSession, SavedSessionSummary } from '../types'

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? ''

export async function listSessions(): Promise<SavedSessionSummary[]> {
  const res = await fetch(`${API_BASE}/sessions`)
  if (!res.ok) throw new Error('Failed to load sessions')
  return res.json() as Promise<SavedSessionSummary[]>
}

export async function getSession(id: string): Promise<SavedSession> {
  const res = await fetch(`${API_BASE}/sessions/${id}`)
  if (!res.ok) throw new Error('Session not found')
  return res.json() as Promise<SavedSession>
}
