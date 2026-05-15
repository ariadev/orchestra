import { useEffect, useState } from 'react'
import { listSessions, getSession } from '../lib/history'
import type { SavedSession, SavedSessionSummary } from '../types'

function relativeTime(iso: string): string {
  const date = new Date(iso + 'Z')
  const diff = Date.now() - date.getTime()
  const m = Math.floor(diff / 60_000)
  const h = Math.floor(diff / 3_600_000)
  const d = Math.floor(diff / 86_400_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  if (d < 7) return `${d}d ago`
  return date.toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

interface Props {
  onNew: () => void
  onOpen: (session: SavedSession) => void
}

export default function HomePage({ onNew, onOpen }: Props) {
  const [sessions, setSessions] = useState<SavedSessionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [opening, setOpening] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listSessions()
      .then(setSessions)
      .catch(() => setError('Failed to load sessions'))
      .finally(() => setLoading(false))
  }, [])

  async function handleOpen(id: string) {
    setOpening(id)
    try {
      const session = await getSession(id)
      onOpen(session)
    } catch {
      setOpening(null)
    }
  }

  return (
    <div className="min-h-screen bg-[#09090b]">
      {/* Header */}
      <header className="border-b border-[#27272a] h-12 px-6 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[#fafafa] tracking-tight">Orchestra</span>
        <button
          onClick={onNew}
          className="text-[12px] font-medium text-[#09090b] bg-[#fafafa] rounded px-3 py-1.5 leading-none"
        >
          + New session
        </button>
      </header>

      <div className="max-w-[680px] mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-[20px] font-semibold text-[#fafafa] tracking-tight">Sessions</h1>
          <p className="text-[13px] text-[#71717a] mt-1">Multi-agent deliberation history</p>
        </div>

        {/* Loading */}
        {loading && (
          <div className="py-12 text-center text-[12px] text-[#52525b]">Loading…</div>
        )}

        {/* Error */}
        {error && (
          <div className="border border-[#27272a] rounded-md px-4 py-3 bg-[#18181b]">
            <p className="text-[12px] text-[#a1a1aa]">{error}</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && sessions.length === 0 && (
          <div className="border border-dashed border-[#27272a] rounded-lg py-16 text-center">
            <p className="text-[13px] text-[#52525b] mb-1">No sessions yet</p>
            <p className="text-[12px] text-[#3f3f46]">
              Start a session to see it here
            </p>
            <button
              onClick={onNew}
              className="mt-5 text-[12px] font-medium text-[#09090b] bg-[#fafafa] rounded px-4 py-2"
            >
              + New session
            </button>
          </div>
        )}

        {/* Session list */}
        {sessions.length > 0 && (
          <div className="border border-[#27272a] rounded-lg divide-y divide-[#1f1f1f] overflow-hidden">
            {sessions.map(session => (
              <button
                key={session.id}
                onClick={() => handleOpen(session.id)}
                disabled={opening === session.id}
                className="w-full text-left px-5 py-4 flex items-start gap-4 disabled:opacity-60"
              >
                {/* Status dot */}
                <div className="mt-1 shrink-0">
                  <div
                    className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                      session.status === 'done' ? 'bg-[#52525b]' : 'bg-[#3f3f46]'
                    }`}
                  />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-3">
                    <span className="text-[13px] font-medium text-[#fafafa] truncate">
                      {session.name || session.topic}
                    </span>
                    {opening === session.id && (
                      <span className="text-[11px] text-[#52525b] shrink-0">opening…</span>
                    )}
                  </div>
                  <p className="text-[12px] text-[#71717a] mt-0.5 truncate">{session.topic}</p>
                  <div className="flex items-center gap-2.5 mt-1.5 text-[11px] text-[#3f3f46]">
                    <span>{session.agent_count} agent{session.agent_count !== 1 ? 's' : ''}</span>
                    <span>·</span>
                    <span>{session.discussion_rounds} round{session.discussion_rounds !== 1 ? 's' : ''}</span>
                    <span>·</span>
                    <span>{session.output_type.replace('_', ' ')}</span>
                    <span>·</span>
                    <span>{relativeTime(session.created_at)}</span>
                  </div>
                </div>

                {/* Arrow */}
                <span className="text-[#3f3f46] text-[12px] shrink-0 mt-0.5">→</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
