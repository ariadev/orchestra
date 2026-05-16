import type { ModelId, OutputType, SessionEvent } from '../types'

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? ''

interface AgentPayload {
  name: string
  role: string
  persona: string
  model: ModelId
}

interface SessionPayload {
  topic: string
  agents: AgentPayload[]
  discussion_rounds: number
  output_type: OutputType
}

export async function createSession(payload: SessionPayload): Promise<string> {
  const res = await fetch(`${API_BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    let message = res.statusText
    try {
      const body = await res.json()
      if (body.detail) {
        message = Array.isArray(body.detail)
          ? body.detail.map((d: { msg: string }) => d.msg).join(', ')
          : String(body.detail)
      }
    } catch {
      // ignore
    }
    throw new Error(message)
  }

  const data = await res.json()
  return data.session_id as string
}

export async function submitClarification(sessionId: string, answer: string): Promise<void> {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/clarify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answer }),
  })
  if (!res.ok) {
    let message = res.statusText
    try {
      const body = await res.json()
      if (body.detail) message = String(body.detail)
    } catch { /* ignore */ }
    throw new Error(message)
  }
}

export function streamSession(
  sessionId: string,
  onEvent: (event: SessionEvent) => void,
  onError: (err: Error) => void,
): () => void {
  const es = new EventSource(`${API_BASE}/sessions/${sessionId}/events`)

  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data as string) as SessionEvent
      onEvent(data)
      if (data.type === 'session_end' || data.type === 'error') {
        es.close()
      }
    } catch {
      // ignore parse errors
    }
  }

  es.onerror = () => {
    onError(new Error('Stream connection lost'))
    es.close()
  }

  return () => es.close()
}
