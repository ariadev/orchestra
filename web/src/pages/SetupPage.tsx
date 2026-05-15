import { useEffect, useRef, useState } from 'react'
import { createSession } from '../lib/api'
import { generatePersona, suggestAgents, type SuggestedAgent } from '../lib/ai'
import type { AgentConfig, ModelId, OutputType, SessionConfig } from '../types'

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
}

export default function SetupPage({ onStart }: Props) {
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
    <div className="min-h-screen bg-[#09090b]">
      <header className="border-b border-[#27272a] h-12 px-6 flex items-center">
        <span className="text-[13px] font-semibold text-[#fafafa] tracking-tight">Orchestra</span>
      </header>

      <div className="max-w-[600px] mx-auto px-6 py-10">
        <div className="mb-9">
          <h1 className="text-[20px] font-semibold text-[#fafafa] tracking-tight leading-tight">
            New session
          </h1>
          <p className="text-[13px] text-[#71717a] mt-1">Configure a multi-agent deliberation</p>
        </div>

        {/* ── Topic ─────────────────────────────────────────── */}
        <section className="mb-8">
          <Label>Topic</Label>
          <textarea
            value={topic}
            onChange={e => setTopic(e.target.value)}
            onBlur={handleTopicBlur}
            placeholder="What problem or question should the agents deliberate on?"
            rows={3}
            className="w-full bg-transparent border border-[#27272a] rounded-md px-3 py-2.5 text-[13px] text-[#fafafa] placeholder-[#52525b] resize-none focus:border-[#3f3f46]"
          />
        </section>

        {/* ── Members ───────────────────────────────────────── */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <Label noMargin>Members</Label>
            {!showForm && (
              <button
                onClick={openAdd}
                className="text-[12px] text-[#a1a1aa] border border-[#27272a] rounded px-2.5 py-1 leading-none"
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
            <p className="text-[11px] text-[#52525b] mb-2">{suggestionError}</p>
          )}

          {/* Agent list */}
          {agents.length > 0 && (
            <div className="border border-[#27272a] rounded-md divide-y divide-[#1f1f1f] mb-3">
              {agents.map((agent, idx) => (
                <div key={agent.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="text-[11px] text-[#3f3f46] font-mono w-4 shrink-0 tabular-nums">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-[13px] text-[#fafafa] font-medium">{agent.name}</span>
                    <span className="text-[13px] text-[#3f3f46] mx-2">·</span>
                    <span className="text-[13px] text-[#a1a1aa]">{agent.role}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[11px] text-[#52525b] font-mono">{agent.model}</span>
                    <button onClick={() => openEdit(agent)} className="text-[11px] text-[#52525b]">
                      edit
                    </button>
                    <button onClick={() => removeAgent(agent.id)} className="text-[11px] text-[#52525b]">
                      remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {agents.length === 0 && !showForm && suggestionState !== 'loading' && suggestionState !== 'ready' && (
            <div className="border border-dashed border-[#27272a] rounded-md px-4 py-6 text-center">
              <p className="text-[12px] text-[#52525b]">No members yet</p>
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
                className={`text-left px-3 py-2.5 rounded border text-[12px] ${
                  outputType === ot.value
                    ? 'border-[#52525b] bg-[#18181b] text-[#fafafa]'
                    : 'border-[#27272a] text-[#71717a]'
                }`}
              >
                <div className="font-medium">{ot.label}</div>
                <div className="text-[11px] mt-0.5 text-[#52525b]">{ot.description}</div>
              </button>
            ))}
          </div>
        </section>

        {/* ── Rounds ────────────────────────────────────────── */}
        <section className="mb-10">
          <div className="flex items-baseline justify-between mb-2">
            <Label noMargin>Discussion rounds</Label>
            <div className="text-right">
              <span className="text-[13px] font-medium text-[#fafafa] tabular-nums">{rounds}</span>
              <span className="text-[11px] text-[#52525b] ml-1.5">{ROUND_LABELS[rounds]}</span>
            </div>
          </div>
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={rounds}
            onChange={e => setRounds(Number(e.target.value))}
            className="w-full h-0.5 bg-[#27272a] rounded"
          />
          <div className="flex justify-between mt-1.5">
            {[1, 2, 3, 4, 5].map(n => (
              <span
                key={n}
                className={`text-[10px] tabular-nums ${n === rounds ? 'text-[#a1a1aa]' : 'text-[#3f3f46]'}`}
              >
                {n}
              </span>
            ))}
          </div>
        </section>

        {/* ── Error ─────────────────────────────────────────── */}
        {error && (
          <div className="mb-4 border border-[#27272a] rounded-md px-3 py-2.5 bg-[#18181b]">
            <p className="text-[12px] text-[#a1a1aa]">{error}</p>
          </div>
        )}

        {/* ── Start ─────────────────────────────────────────── */}
        <button
          onClick={handleStart}
          disabled={!canStart}
          className="w-full h-11 bg-[#fafafa] text-[#09090b] text-[13px] font-semibold rounded-md disabled:opacity-25 disabled:cursor-not-allowed"
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
    <div className="border border-[#27272a] rounded-md mb-3 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[#1f1f1f]">
        <span className="text-[11px] text-[#71717a]">✦</span>
        <span className="text-[11px] text-[#71717a]">suggested agents</span>
        {state === 'loading' && (
          <span className="text-[11px] text-[#3f3f46]">— thinking…</span>
        )}
        {state === 'ready' && (
          <span className="text-[11px] text-[#3f3f46]">— from your topic</span>
        )}
        <button onClick={onDismiss} className="ml-auto text-[11px] text-[#3f3f46]">
          dismiss
        </button>
      </div>

      {/* Loading skeleton */}
      {state === 'loading' && (
        <div className="px-3 py-3 space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="space-y-1.5">
              <div className="h-2.5 bg-[#1f1f1f] rounded w-2/5" />
              <div className="h-2 bg-[#1a1a1a] rounded w-full" />
              <div className="h-2 bg-[#1a1a1a] rounded w-4/5" />
            </div>
          ))}
        </div>
      )}

      {/* Suggested agents list */}
      {state === 'ready' && (
        <>
          <div className="divide-y divide-[#1a1a1a]">
            {agents.map((agent, i) => (
              <div key={i} className="px-3 py-2.5">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-[13px] text-[#fafafa] font-medium">{agent.name}</span>
                  <span className="text-[12px] text-[#71717a]">{agent.role}</span>
                </div>
                <p className="text-[11px] text-[#52525b] leading-relaxed line-clamp-2">
                  {agent.persona}
                </p>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-t border-[#1f1f1f]">
            <button
              onClick={onAccept}
              className="text-[12px] text-[#09090b] bg-[#fafafa] rounded px-3 py-1.5 font-medium"
            >
              Use these agents
            </button>
            <button
              onClick={onDismiss}
              className="text-[12px] text-[#71717a] border border-[#27272a] rounded px-3 py-1.5"
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
    'w-full bg-transparent border border-[#27272a] rounded px-2.5 py-1.5 text-[13px] text-[#fafafa] focus:border-[#3f3f46]'

  return (
    <div className="border border-[#27272a] rounded-md p-4">
      <p className="text-[11px] uppercase tracking-widest text-[#71717a] font-medium mb-4">
        {editingId ? 'Edit member' : 'Add member'}
      </p>

      <div className="space-y-3">
        {/* Name */}
        <div>
          <label className="block text-[11px] text-[#71717a] mb-1">Name</label>
          <input
            value={form.name}
            onChange={e => onNameChange(e.target.value)}
            placeholder="e.g. Alice"
            className={inputCls}
          />
        </div>

        {/* Role */}
        <div>
          <label className="block text-[11px] text-[#71717a] mb-1">Role</label>
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
            <label className="text-[11px] text-[#71717a]">Persona</label>
            {isGeneratingPersona && (
              <button
                onClick={onCancelGeneration}
                className="text-[10px] text-[#3f3f46]"
              >
                cancel
              </button>
            )}
            {!editingId && !isGeneratingPersona && !form.persona && form.role.trim() && (
              <span className="text-[10px] text-[#3f3f46]">auto-fills on role blur</span>
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
            rows={3}
            readOnly={isGeneratingPersona}
            className={`${inputCls} resize-none ${isGeneratingPersona ? 'text-[#52525b] cursor-default' : ''}`}
          />
          {isGeneratingPersona && (
            <div className="flex items-center gap-1.5 mt-1">
              <span className="dot-blink text-[10px] text-[#52525b]">.</span>
              <span className="dot-blink text-[10px] text-[#52525b]">.</span>
              <span className="dot-blink text-[10px] text-[#52525b]">.</span>
              <span className="text-[10px] text-[#3f3f46] ml-0.5">generating persona</span>
            </div>
          )}
        </div>

        {/* Model */}
        <div>
          <label className="block text-[11px] text-[#71717a] mb-1">Model</label>
          <select
            value={form.model}
            onChange={e => onModelChange(e.target.value as ModelId)}
            className="bg-[#09090b] border border-[#27272a] rounded px-2.5 py-1.5 text-[13px] text-[#fafafa] focus:border-[#3f3f46] cursor-pointer"
          >
            {MODELS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      {formError && (
        <p className="mt-2.5 text-[11px] text-[#a1a1aa]">{formError}</p>
      )}

      <div className="flex justify-end gap-2 mt-4">
        <button
          onClick={onCancel}
          className="text-[12px] text-[#71717a] border border-[#27272a] rounded px-3 py-1.5"
        >
          Cancel
        </button>
        <button
          onClick={onSubmit}
          className="text-[12px] text-[#09090b] bg-[#fafafa] rounded px-3 py-1.5 font-medium"
        >
          {editingId ? 'Save' : 'Add'}
        </button>
      </div>
    </div>
  )
}

function Label({ children, noMargin }: { children: React.ReactNode; noMargin?: boolean }) {
  return (
    <label className={`block text-[11px] uppercase tracking-widest text-[#71717a] font-medium ${noMargin ? '' : 'mb-2'}`}>
      {children}
    </label>
  )
}
