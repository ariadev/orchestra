import { useEffect, useState } from 'react'
import { listSessions, getSession, deleteSession } from '../lib/history'
import type { SavedSession, SavedSessionSummary } from '../types'
import { SettingsMenu } from '../lib/settings'
import { Network } from 'lucide-react'

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
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
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

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      await deleteSession(id)
      setSessions(prev => prev.filter(s => s.id !== id))
      setConfirmDelete(null)
    } catch {
      setDeleting(null)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--c-bg)]">
      <header className="border-b border-[var(--c-border)] h-12 px-6 flex items-center justify-between">
        <span className="flex items-center gap-2 text-[13px] font-semibold text-[var(--c-fg)] tracking-tight">
          <Network size={15} className="text-[var(--c-muted-2)]" />
          Orchestra
        </span>
        <div className="flex items-center gap-4">
          <button
            onClick={onNew}
            className="text-[12px] font-medium text-[var(--c-inv-fg)] bg-[var(--c-inv-bg)] rounded px-3 py-1.5 leading-none"
          >
            + New session
          </button>
          <SettingsMenu />
        </div>
      </header>

      <div className="max-w-[680px] mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-[20px] font-semibold text-[var(--c-fg)] tracking-tight">Sessions</h1>
          <p className="text-[13px] text-[var(--c-secondary)] mt-1">Multi-agent deliberation history</p>
        </div>

        {loading && (
          <div className="py-12 text-center text-[12px] text-[var(--c-muted-2)]">Loading…</div>
        )}

        {error && (
          <div className="border border-[var(--c-border)] rounded-md px-4 py-3 bg-[var(--c-surface)]">
            <p className="text-[12px] text-[var(--c-secondary)]">{error}</p>
          </div>
        )}

        {!loading && !error && sessions.length === 0 && (
          <div className="border border-dashed border-[var(--c-border)] rounded-lg py-16 text-center">
            <p className="text-[13px] text-[var(--c-muted-2)] mb-1">No sessions yet</p>
            <p className="text-[12px] text-[var(--c-muted)]">Start a session to see it here</p>
            <button
              onClick={onNew}
              className="mt-5 text-[12px] font-medium text-[var(--c-inv-fg)] bg-[var(--c-inv-bg)] rounded px-4 py-2"
            >
              + New session
            </button>
          </div>
        )}

        {sessions.length > 0 && (
          <div className="border border-[var(--c-border)] rounded-lg divide-y divide-[var(--c-border-subtle)] overflow-hidden">
            {sessions.map(session => {
              const isOpening = opening === session.id
              const isConfirming = confirmDelete === session.id
              const isDeleting = deleting === session.id

              return (
                <div key={session.id} className="flex items-start gap-3 px-5 py-4">
                  {/* Status dot */}
                  <div className="shrink-0 mt-[5px]">
                    <div className={`w-1.5 h-1.5 rounded-full ${session.status === 'done' ? 'bg-[var(--c-muted-2)]' : 'bg-[var(--c-muted)]'}`} />
                  </div>

                  {/* Content — clicking opens the session */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => !isConfirming && !isOpening && handleOpen(session.id)}
                    onKeyDown={e => e.key === 'Enter' && !isConfirming && handleOpen(session.id)}
                    className={`flex-1 min-w-0 text-left ${!isConfirming && !isOpening ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    <div className="flex items-baseline gap-2.5">
                      <span className={`text-[13px] font-medium truncate ${isOpening ? 'text-[var(--c-secondary)]' : 'text-[var(--c-fg)]'}`}>
                        {session.name || session.topic}
                      </span>
                      {isOpening && (
                        <span className="text-[11px] text-[var(--c-muted-2)] shrink-0">opening…</span>
                      )}
                    </div>

                    <p className="text-[12px] text-[var(--c-secondary)] mt-0.5 truncate">{session.topic}</p>

                    {/* Metadata line — swaps for confirm prompt */}
                    {isConfirming ? (
                      <div className="flex items-center gap-2 mt-1.5 text-[11px]">
                        <span className="text-[var(--c-secondary)]">Delete this session?</span>
                        <button
                          onClick={e => { e.stopPropagation(); void handleDelete(session.id) }}
                          disabled={isDeleting}
                          className="text-[var(--c-fg)] disabled:opacity-40"
                        >
                          {isDeleting ? '…' : 'yes'}
                        </button>
                        <span className="text-[var(--c-muted)]">·</span>
                        <button
                          onClick={e => { e.stopPropagation(); setConfirmDelete(null) }}
                          className="text-[var(--c-muted-2)]"
                        >
                          cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mt-1.5 text-[11px] text-[var(--c-muted)]">
                        <span>{session.agent_count} agent{session.agent_count !== 1 ? 's' : ''}</span>
                        <span>·</span>
                        <span>{session.discussion_rounds} round{session.discussion_rounds !== 1 ? 's' : ''}</span>
                        <span>·</span>
                        <span>{session.output_type.replace('_', ' ')}</span>
                        <span>·</span>
                        <span>{relativeTime(session.created_at)}</span>
                      </div>
                    )}
                  </div>

                  {/* × — toggles confirm state */}
                  <button
                    onClick={() => setConfirmDelete(isConfirming ? null : session.id)}
                    disabled={isOpening || isDeleting}
                    className={`shrink-0 text-[15px] leading-none mt-px disabled:opacity-20 ${isConfirming ? 'text-[var(--c-secondary)]' : 'text-[var(--c-muted)]'}`}
                  >
                    ×
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
