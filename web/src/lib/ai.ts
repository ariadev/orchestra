import type { ModelId } from '../types'

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? ''

export interface SuggestedAgent {
  name: string
  role: string
  persona: string
  model: ModelId
}

export async function suggestAgents(
  topic: string,
  signal?: AbortSignal,
): Promise<SuggestedAgent[]> {
  const res = await fetch(`${API_BASE}/ai/suggest-agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic }),
    signal,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { detail?: string }).detail ?? 'Failed to suggest agents')
  }
  const data = await res.json() as { agents: Array<{ name: string; role: string; persona: string }> }
  return data.agents.map(a => ({ ...a, model: 'gpt-5.4-mini' as ModelId }))
}

export async function generatePersona(
  topic: string,
  role: string,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(`${API_BASE}/ai/generate-persona`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, role }),
    signal,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { detail?: string }).detail ?? 'Failed to generate persona')
  }
  const data = await res.json() as { persona: string }
  return data.persona
}
