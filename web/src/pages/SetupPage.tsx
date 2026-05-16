import { useEffect, useRef, useState } from 'react'
import { createSession } from '../lib/api'
import { generatePersona, suggestAgents, type SuggestedAgent } from '../lib/ai'
import type { AgentConfig, ModelId, OutputType, SessionConfig } from '../types'
import { SettingsMenu } from '../lib/settings'
import {ArrowLeft, Network} from 'lucide-react'

const OUTPUT_TYPES: Array<{ value: OutputType; label: string; description: string }> = [
  { value: 'general', label: 'General', description: 'Deliberation synthesis' },
  { value: 'content', label: 'Content', description: 'Article, blog, copy, script' },
  { value: 'technical_report', label: 'Technical', description: 'ADR, spec, design doc' },
  { value: 'product_spec', label: 'Product', description: 'PRD, feature brief, UX spec' },
  { value: 'strategy', label: 'Strategy', description: 'GTM, campaign, SEO plan' },
  { value: 'decision_brief', label: 'Decision', description: 'Recommendation memo' },
]

const MODELS: Array<{ value: ModelId; label: string }> = [
  { value: 'gpt-5.4', label: 'gpt-5.4' },
  { value: 'gpt-5.4-mini', label: 'gpt-5.4-mini' },
  { value: 'gpt-5.4-nano', label: 'gpt-5.4-nano' },
]

const ROUND_LABELS: Record<number, string> = {
  1: 'minimal', 2: 'light', 3: 'standard', 4: 'extended', 5: 'thorough',
}

let _nextId = 1
function uid() { return String(_nextId++) }

type SuggestionState = 'idle' | 'loading' | 'ready' | 'dismissed'

interface FormState {
  name: string
  role: string
  persona: string
  model: ModelId
}

const EMPTY_FORM: FormState = { name: '', role: '', persona: '', model: 'gpt-5.4' }
const GENERATING_TEXT = 'Generating persona…'

interface Props {
  onStart: (sessionId: string, config: SessionConfig) => void
  onBack?: () => void
}

export default function SetupPage({ onStart, onBack }: Props) {
  const [topic, setTopic] = useState('')
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [outputType, setOutputType] = useState<OutputType>('general')
  const [rounds, setRounds] = useState(3)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Agent form
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [isGeneratingPersona, setIsGeneratingPersona] = useState(false)

  // Agent suggestions
  const [suggestionState, setSuggestionState] = useState<SuggestionState>('idle')
  const [suggestedAgents, setSuggestedAgents] = useState<SuggestedAgent[]>([])
  const [suggestionError, setSuggestionError] = useState<string | null>(null)

  const personaAbortRef = useRef<AbortController | null>(null)
  const suggestionAbortRef = useRef<AbortController | null>(null)

  const canStart = topic.trim().length > 0 && agents.length > 0 && !loading

  // ── Suggestion ───────────────────────────────────────────────────────────

  async function triggerSuggestion(topicText: string) {
    if (suggestionState !== 'idle') return
    setSuggestionState('loading')
    setSuggestionError(null)

    const ctrl = new AbortController()
    suggestionAbortRef.current = ctrl

    try {
      const result = await suggestAgents(topicText, ctrl.signal)
      if (result.length === 0) { setSuggestionState('dismissed'); return }
      setSuggestedAgents(result)
      setSuggestionState('ready')
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setSuggestionState('dismissed')
      setSuggestionError(e instanceof Error ? e.message : 'Suggestion failed')
    }
  }

  function handleTopicBlur() {
    const t = topic.trim()
    if (t && agents.length === 0 && suggestionState === 'idle') {
      void triggerSuggestion(t)
    }
  }

  function acceptSuggestions() {
    const withIds = suggestedAgents.map(a => ({ ...a, id: uid() }))
    setAgents(withIds)
    setSuggestionState('dismissed')
  }

  function dismissSuggestions() {
    suggestionAbortRef.current?.abort()
    setSuggestionState('dismissed')
  }

  // ── Persona generation ───────────────────────────────────────────────────

  async function triggerPersonaGeneration() {
    const t = topic.trim()
    const r = form.role.trim()
    if (!t || !r || editingId || isGeneratingPersona) return

    cancelPersonaGeneration()

    const ctrl = new AbortController()
    personaAbortRef.current = ctrl
    setIsGeneratingPersona(true)
    setForm(f => ({ ...f, persona: GENERATING_TEXT }))

    try {
      const result = await generatePersona(t, r, ctrl.signal)
      setForm(f => ({ ...f, persona: result }))
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setForm(f => ({ ...f, persona: '' }))
    } finally {
      setIsGeneratingPersona(false)
    }
  }

  function cancelPersonaGeneration() {
    personaAbortRef.current?.abort()
    personaAbortRef.current = null
    setIsGeneratingPersona(false)
  }

  function handleRoleBlur() {
    if (!editingId && form.role.trim() && !form.persona.trim()) {
      void triggerPersonaGeneration()
    }
  }

  function handlePersonaChange(value: string) {
    if (isGeneratingPersona) {
      cancelPersonaGeneration()
    }
    setForm(f => ({ ...f, persona: value }))
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      personaAbortRef.current?.abort()
      suggestionAbortRef.current?.abort()
    }
  }, [])

  // ── Agent form ───────────────────────────────────────────────────────────

  function openAdd() {
    cancelPersonaGeneration()
    setForm(EMPTY_FORM)
    setEditingId(null)
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(agent: AgentConfig) {
    cancelPersonaGeneration()
    setForm({ name: agent.name, role: agent.role, persona: agent.persona, model: agent.model })
    setEditingId(agent.id)
    setFormError(null)
    setShowForm(true)
  }

  function closeForm() {
    cancelPersonaGeneration()
    setShowForm(false)
    setEditingId(null)
    setFormError(null)
    setForm(EMPTY_FORM)
  }

  function submitForm() {
    if (!form.name.trim()) { setFormError('Name is required'); return }
    if (!form.role.trim()) { setFormError('Role is required'); return }
    const personaValue = form.persona === GENERATING_TEXT ? '' : form.persona.trim()
    if (!personaValue) { setFormError('Persona is required'); return }
    if (isGeneratingPersona) { setFormError('Wait for persona generation to finish'); return }

    const finalForm = { ...form, persona: personaValue }

    if (editingId) {
      setAgents(prev => prev.map(a => a.id === editingId ? { id: editingId, ...finalForm } : a))
    } else {
      setAgents(prev => [...prev, { id: uid(), ...finalForm }])
    }
    closeForm()
  }

  function removeAgent(id: string) {
    setAgents(prev => prev.filter(a => a.id !== id))
  }

  // ── Session start ────────────────────────────────────────────────────────

  async function handleStart() {
    if (!canStart) return
    setLoading(true)
    setError(null)
    try {
      const config: SessionConfig = {
        topic: topic.trim(),
        agents,
        output_type: outputType,
        discussion_rounds: rounds,
      }
      const sessionId = await createSession({
        topic: config.topic,
        agents: config.agents.map(a => ({
          name: a.name, role: a.role, persona: a.persona, model: a.model,
        })),
        output_type: config.output_type,
        discussion_rounds: config.discussion_rounds,
      })
      onStart(sessionId, config)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start session')
      setLoading(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[var(--c-bg)]">
      <header className="border-b border-[var(--c-border)] h-12 px-6 flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-[13px] font-semibold text-[var(--c-fg)] tracking-tight"
        >
          <Network size={15} className="text-[var(--c-muted-2)]" />
          Orchestra
        </button>
        <div className="flex items-center gap-4">
          {onBack && (
            <button onClick={onBack} className="text-[var(--c-muted-2)] flex items-center gap-1.5 shrink-0">
              <ArrowLeft size={14} />
              <span className="text-[12px]">Sessions</span>
            </button>
          )}
          <SettingsMenu />
        </div>
      </header>

      <div className="max-w-[600px] mx-auto px-6 py-10">
        <div className="mb-9">
          <h1 className="text-[20px] font-semibold text-[var(--c-fg)] tracking-tight leading-tight">
            New session
          </h1>
          <p className="text-[13px] text-[var(--c-secondary)] mt-1">Configure a multi-agent deliberation</p>
        </div>

        {/* ── Topic ─────────────────────────────────────────── */}
        <section className="mb-8">
          <Label>Topic</Label>
          <textarea
            value={topic}
            onChange={e => setTopic(e.target.value)}
            onBlur={handleTopicBlur}
            placeholder="What problem or question should the agents deliberate on?"
            rows={5}
            className="w-full bg-transparent border border-[var(--c-border)] rounded-md px-3 py-2.5 text-[13px] text-[var(--c-fg)] placeholder-[var(--c-muted-2)] resize-none focus:border-[var(--c-muted)]"
          />
        </section>

        {/* ── Members ───────────────────────────────────────── */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <Label noMargin>Members</Label>
            {!showForm && (
              <button
                onClick={openAdd}
                className="text-[12px] text-[var(--c-secondary)] border border-[var(--c-border)] rounded px-2.5 py-1 leading-none"
              >
                + Add
              </button>
            )}
          </div>

          {/* Suggestion panel */}
          {(suggestionState === 'loading' || suggestionState === 'ready') && (
            <SuggestionPanel
              state={suggestionState}
              agents={suggestedAgents}
              onAccept={acceptSuggestions}
              onDismiss={dismissSuggestions}
            />
          )}

          {/* Suggestion error */}
          {suggestionError && suggestionState === 'dismissed' && (
            <p className="text-[11px] text-[var(--c-muted-2)] mb-2">{suggestionError}</p>
          )}

          {/* Agent list */}
          {agents.length > 0 && (
            <div className="border border-[var(--c-border)] rounded-md divide-y divide-[var(--c-border-subtle)] mb-3">
              {agents.map((agent, idx) => (
                <div key={agent.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="text-[11px] text-[var(--c-muted)] font-mono w-4 shrink-0 tabular-nums">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-[13px] text-[var(--c-fg)] font-medium">{agent.name}</span>
                    <span className="text-[13px] text-[var(--c-muted)] mx-2">·</span>
                    <span className="text-[13px] text-[var(--c-secondary)]">{agent.role}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[11px] text-[var(--c-muted-2)] font-mono">{agent.model}</span>
                    <button onClick={() => openEdit(agent)} className="text-[11px] text-[var(--c-muted-2)]">
                      edit
                    </button>
                    <button onClick={() => removeAgent(agent.id)} className="text-[11px] text-[var(--c-muted-2)]">
                      remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {agents.length === 0 && !showForm && suggestionState !== 'loading' && suggestionState !== 'ready' && (
            <div className="border border-dashed border-[var(--c-border)] rounded-md px-4 py-6 text-center">
              <p className="text-[12px] text-[var(--c-muted-2)]">No members yet</p>
            </div>
          )}

          {/* Add / edit form */}
          {showForm && (
            <AgentForm
              form={form}
              editingId={editingId}
              isGeneratingPersona={isGeneratingPersona}
              formError={formError}
              onNameChange={v => setForm(f => ({ ...f, name: v }))}
              onRoleChange={v => setForm(f => ({ ...f, role: v }))}
              onRoleBlur={handleRoleBlur}
              onPersonaChange={handlePersonaChange}
              onModelChange={v => setForm(f => ({ ...f, model: v }))}
              onCancelGeneration={cancelPersonaGeneration}
              onSubmit={submitForm}
              onCancel={closeForm}
            />
          )}
        </section>

        {/* ── Output type ───────────────────────────────────── */}
        <section className="mb-8">
          <Label>Output type</Label>
          <div className="grid grid-cols-3 gap-1.5">
            {OUTPUT_TYPES.map(ot => (
              <button
                key={ot.value}
                onClick={() => setOutputType(ot.value)}
                className={`text-left px-3 py-2.5 rounded border text-[12px] ${outputType === ot.value
                  ? 'border-[var(--c-muted-2)] bg-[var(--c-surface)] text-[var(--c-fg)]'
                  : 'border-[var(--c-border)] text-[var(--c-secondary)]'
                  }`}
              >
                <div className="font-medium">{ot.label}</div>
                <div className="text-[11px] mt-0.5 text-[var(--c-muted-2)]">{ot.description}</div>
              </button>
            ))}
          </div>
        </section>

        {/* ── Rounds ────────────────────────────────────────── */}
        <section className="mb-10">
          <div className="flex items-baseline justify-between mb-2">
            <Label noMargin>Discussion rounds</Label>
            <div className="text-right">
              <span className="text-[13px] font-medium text-[var(--c-fg)] tabular-nums">{rounds}</span>
              <span className="text-[11px] text-[var(--c-muted-2)] ml-1.5">{ROUND_LABELS[rounds]}</span>
            </div>
          </div>
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={rounds}
            onChange={e => setRounds(Number(e.target.value))}
            className="w-full h-0.5 bg-[var(--c-border)] rounded"
          />
          <div className="flex justify-between mt-1.5">
            {[1, 2, 3, 4, 5].map(n => (
              <span
                key={n}
                className={`text-[10px] tabular-nums ${n === rounds ? 'text-[var(--c-secondary)]' : 'text-[var(--c-muted)]'}`}
              >
                {n}
              </span>
            ))}
          </div>
        </section>

        {/* ── Error ─────────────────────────────────────────── */}
        {error && (
          <div className="mb-4 border border-[var(--c-border)] rounded-md px-3 py-2.5 bg-[var(--c-surface)]">
            <p className="text-[12px] text-[var(--c-secondary)]">{error}</p>
          </div>
        )}

        {/* ── Start ─────────────────────────────────────────── */}
        <button
          onClick={handleStart}
          disabled={!canStart}
          className="w-full h-11 bg-[var(--c-inv-bg)] text-[var(--c-inv-fg)] text-[13px] font-semibold rounded-md disabled:opacity-25 disabled:cursor-not-allowed"
        >
          {loading ? 'Starting...' : 'Start session'}
        </button>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SuggestionPanel({
  state,
  agents,
  onAccept,
  onDismiss,
}: {
  state: 'loading' | 'ready'
  agents: SuggestedAgent[]
  onAccept: () => void
  onDismiss: () => void
}) {
  return (
    <div className="border border-[var(--c-border)] rounded-md mb-3 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--c-border-subtle)]">
        <span className="text-[11px] text-[var(--c-secondary)]">✦</span>
        <span className="text-[11px] text-[var(--c-secondary)]">suggested agents</span>
        {state === 'loading' && (
          <span className="text-[11px] text-[var(--c-muted)]">— thinking…</span>
        )}
        {state === 'ready' && (
          <span className="text-[11px] text-[var(--c-muted)]">— from your topic</span>
        )}
        <button onClick={onDismiss} className="ml-auto text-[11px] text-[var(--c-muted)]">
          dismiss
        </button>
      </div>

      {/* Loading skeleton */}
      {state === 'loading' && (
        <div className="px-3 py-3 space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="space-y-1.5">
              <div className="h-2.5 bg-[var(--c-border-subtle)] rounded w-2/5" />
              <div className="h-2 bg-[var(--c-surface-skeleton)] rounded w-full" />
              <div className="h-2 bg-[var(--c-surface-skeleton)] rounded w-4/5" />
            </div>
          ))}
        </div>
      )}

      {/* Suggested agents list */}
      {state === 'ready' && (
        <>
          <div className="divide-y divide-[var(--c-surface-skeleton)]">
            {agents.map((agent, i) => (
              <div key={i} className="px-3 py-2.5">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-[13px] text-[var(--c-fg)] font-medium">{agent.name}</span>
                  <span className="text-[12px] text-[var(--c-secondary)]">{agent.role}</span>
                </div>
                <p className="text-[11px] text-[var(--c-muted-2)] leading-relaxed line-clamp-2">
                  {agent.persona}
                </p>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-t border-[var(--c-border-subtle)]">
            <button
              onClick={onAccept}
              className="text-[12px] text-[var(--c-inv-fg)] bg-[var(--c-inv-bg)] rounded px-3 py-1.5 font-medium"
            >
              Use these agents
            </button>
            <button
              onClick={onDismiss}
              className="text-[12px] text-[var(--c-secondary)] border border-[var(--c-border)] rounded px-3 py-1.5"
            >
              Create manually
            </button>
          </div>
        </>
      )}
    </div>
  )
}

interface AgentFormProps {
  form: FormState
  editingId: string | null
  isGeneratingPersona: boolean
  formError: string | null
  onNameChange: (v: string) => void
  onRoleChange: (v: string) => void
  onRoleBlur: () => void
  onPersonaChange: (v: string) => void
  onModelChange: (v: ModelId) => void
  onCancelGeneration: () => void
  onSubmit: () => void
  onCancel: () => void
}

function AgentForm({
  form,
  editingId,
  isGeneratingPersona,
  formError,
  onNameChange,
  onRoleChange,
  onRoleBlur,
  onPersonaChange,
  onModelChange,
  onCancelGeneration,
  onSubmit,
  onCancel,
}: AgentFormProps) {
  const inputCls =
    'w-full bg-transparent border border-[var(--c-border)] rounded px-2.5 py-1.5 text-[13px] text-[var(--c-fg)] focus:border-[var(--c-muted)]'

  return (
    <div className="border border-[var(--c-border)] rounded-md p-4">
      <p className="text-[11px] uppercase tracking-widest text-[var(--c-secondary)] font-medium mb-4">
        {editingId ? 'Edit member' : 'Add member'}
      </p>

      <div className="space-y-3">
        {/* Name */}
        <div>
          <label className="block text-[11px] text-[var(--c-secondary)] mb-1">Name</label>
          <input
            value={form.name}
            onChange={e => onNameChange(e.target.value)}
            placeholder="e.g. Alice"
            className={inputCls}
          />
        </div>

        {/* Role */}
        <div>
          <label className="block text-[11px] text-[var(--c-secondary)] mb-1">Role</label>
          <input
            value={form.role}
            onChange={e => onRoleChange(e.target.value)}
            onBlur={onRoleBlur}
            placeholder="e.g. Product Manager"
            className={inputCls}
          />
        </div>

        {/* Persona */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] text-[var(--c-secondary)]">Persona</label>
            {isGeneratingPersona && (
              <button
                onClick={onCancelGeneration}
                className="text-[10px] text-[var(--c-muted)]"
              >
                cancel
              </button>
            )}
            {!editingId && !isGeneratingPersona && !form.persona && form.role.trim() && (
              <span className="text-[10px] text-[var(--c-muted)]">auto-fills on role blur</span>
            )}
          </div>
          <textarea
            value={form.persona}
            onChange={e => onPersonaChange(e.target.value)}
            placeholder={
              isGeneratingPersona
                ? GENERATING_TEXT
                : 'Expertise, perspective, and communication style…'
            }
            rows={4}
            readOnly={isGeneratingPersona}
            className={`${inputCls} resize-none ${isGeneratingPersona ? 'text-[var(--c-muted-2)] cursor-default' : ''}`}
          />
          {isGeneratingPersona && (
            <div className="flex items-center gap-1.5 mt-1">
              <span className="dot-blink text-[10px] text-[var(--c-muted-2)]">.</span>
              <span className="dot-blink text-[10px] text-[var(--c-muted-2)]">.</span>
              <span className="dot-blink text-[10px] text-[var(--c-muted-2)]">.</span>
              <span className="text-[10px] text-[var(--c-muted)] ml-0.5">generating persona</span>
            </div>
          )}
        </div>

        {/* Model */}
        <div>
          <label className="block text-[11px] text-[var(--c-secondary)] mb-1">Model</label>
          <select
            value={form.model}
            onChange={e => onModelChange(e.target.value as ModelId)}
            className="bg-[var(--c-bg)] border border-[var(--c-border)] rounded px-2.5 py-1.5 text-[13px] text-[var(--c-fg)] focus:border-[var(--c-muted)] cursor-pointer"
          >
            {MODELS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      {formError && (
        <p className="mt-2.5 text-[11px] text-[var(--c-secondary)]">{formError}</p>
      )}

      <div className="flex justify-end gap-2 mt-4">
        <button
          onClick={onCancel}
          className="text-[12px] text-[var(--c-secondary)] border border-[var(--c-border)] rounded px-3 py-1.5"
        >
          Cancel
        </button>
        <button
          onClick={onSubmit}
          className="text-[12px] text-[var(--c-inv-fg)] bg-[var(--c-inv-bg)] rounded px-3 py-1.5 font-medium"
        >
          {editingId ? 'Save' : 'Add'}
        </button>
      </div>
    </div>
  )
}

function Label({ children, noMargin }: { children: React.ReactNode; noMargin?: boolean }) {
  return (
    <label className={`block text-[11px] uppercase tracking-widest text-[var(--c-secondary)] font-medium ${noMargin ? '' : 'mb-2'}`}>
      {children}
    </label>
  )
}
