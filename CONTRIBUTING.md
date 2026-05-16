# Contributing to Orchestra

This guide covers the project architecture, development setup, and conventions for contributing code.

---

## Architecture overview

Orchestra is three loosely-coupled layers:

```
web/          React + Vite frontend (port 3000)
api/          FastAPI backend       (port 7890)
*.py (root)   LangGraph deliberation engine
```

The frontend talks exclusively to the FastAPI layer. The FastAPI layer owns the session lifecycle and drives the LangGraph engine. The engine emits structured events that flow back to the frontend via Server-Sent Events (SSE).

---

## Deliberation engine

The core of the project lives in the root Python files and `nodes/`.

### State (`state.py`)

All graph state is held in `DiscussionState`, a `TypedDict`. Every node reads from and writes to this dict — there are no side-channel globals between nodes. Key fields:

| Field | Purpose |
|---|---|
| `topic`, `agents_config`, `discussion_rounds`, `output_type` | Session inputs, set once at start |
| `framing` | Facilitator output: definition + key questions |
| `responses` | Append-only list of every agent response across all rounds |
| `current_round` | Which round is active |
| `round_summaries`, `decision_log`, `open_items` | Compact inter-round memory — agents read these instead of raw transcripts |
| `current_agent_index` | Which agent is currently speaking within a round |
| `current_agent_draft`, `current_agent_tokens` | Scratch fields for the agent pipeline (decide → clarify? → commit) |
| `pending_clarification`, `clarification_answer` | Ephemeral clarification state, set and consumed within one agent turn |
| `clarification_history` | Append-only audit trail of all clarification exchanges |

`responses`, `round_summaries`, `decision_log`, and `clarification_history` use `Annotated[List, operator.add]` — LangGraph merges them by appending rather than replacing, which is safe for concurrent-style updates.

### Graph (`graph.py`)

The graph is a `StateGraph` compiled with a checkpointer. The checkpointer is mandatory — it is what makes clarification interrupts resumable.

```
START
  │
  ▼
facilitator
  │
  ▼
agent_decide ──(pending_clarification?)──► agent_clarify
  ▲                                              │
  │                                              ▼
  │ (current_agent_index < len(agents))    agent_commit
  │                                              │
  └──────────────────────────────────────────────┤
                                                 │ (all agents done)
                                                 ▼
                                          round_extractor
                                                 │
                              ┌──────────────────┤
                        (more rounds)       (done)
                              │                  ▼
                              └──► agent_decide synthesis
                                                 │
                                                END
```

Routing is handled by three private functions in `graph.py`:
- `_route_after_decide` — checks `pending_clarification`
- `_route_after_commit` — advances `current_agent_index` or exits the round
- `_route_after_extraction` — checks `current_round >= discussion_rounds`

### Nodes (`nodes/`)

Each file exports a single node function with the signature `(state: DiscussionState) -> dict`.  Nodes return only the fields they modify — LangGraph merges the partial dict into state.

| File | Node | Responsibility |
|---|---|---|
| `facilitator.py` | `facilitator_node` | Parses topic → `framing` (definition + questions + output_type) |
| `agents.py` | `agent_decide_node` | Prompts agent to respond or request clarification |
| `agents.py` | `agent_clarify_node` | Calls `interrupt()`, pauses graph, receives answer |
| `agents.py` | `agent_commit_node` | Finalises response (optionally integrating clarification); increments `current_agent_index` |
| `extractor.py` | `round_extractor_node` | Compacts round transcript → `round_summaries`, `decision_log`, `open_items`; increments `current_round` |
| `synthesis.py` | `synthesis_node` | Reads full transcript and produces the final artifact |

### Clarification interrupt

`agent_clarify_node` calls `langgraph.types.interrupt(pending_clarification)`. This suspends graph execution and saves the checkpoint. The API layer detects `"__interrupt__"` in the result and sets `session["interrupted"] = True`. When the user submits an answer via `POST /sessions/:id/clarify`, `runner.py` calls `graph.invoke(Command(resume=answer), config)` against the same `thread_id`, which restores state and continues from the next node (`agent_commit`).

### Events (`events.py`)

Every node communicates progress by calling typed functions in `events.py` (e.g. `ev.agent_response(...)`, `ev.round_extraction(...)`). These serialize to NDJSON and route to the correct destination:

- **Inside FastAPI**: events go into a per-session `asyncio.Queue`, injected via a `contextvars.ContextVar`. The graph runs in a `ThreadPoolExecutor`; the context var is copied into the thread so it resolves to the right queue.
- **CLI / tests**: falls back to `print()`.

When adding a new node, call the appropriate event function (or add one to `events.py` if needed) rather than printing or logging directly.

### Model registry (`models.py`)

All LLM instantiation goes through `models.py`. System roles (facilitator, extractor, synthesis) have dedicated factory functions with fixed temperatures. Agent nodes call `get_llm(agent_config["model"])`. To add a new model, register it in `AVAILABLE_MODELS`.

---

## API layer

The FastAPI app lives in `api/`. It is thin — no business logic, only session orchestration and persistence.

```
api/
├── main.py          App setup, CORS, lifespan (DB init), router registration
├── runner.py        Session lifecycle: create → start → stream → finalize
├── schemas.py       Pydantic request/response models
├── db.py            SQLite read/write via aiosqlite
└── routers/
    ├── sessions.py  POST /sessions, GET /sessions/:id/events, POST /sessions/:id/clarify, CRUD
    └── ai.py        POST /ai/suggest-agents, POST /ai/generate-persona
```

### Session lifecycle (`runner.py`)

1. `create_session()` — allocates a UUID and an `asyncio.Queue`.
2. `start_session()` — spawns `_run_session()` as an `asyncio.Task`.
3. `_run_session()` — copies the context var, runs `_execute_graph()` in the thread pool. If `__interrupt__` appears in the result, sets `interrupted = True` and returns (SSE stream stays open).
4. `stream_session()` — async generator that reads from the queue and yields SSE frames. When the queue sentinel (`None`) arrives, it saves the session to DB and cleans up in-memory state.
5. `resume_session()` — called by the clarification endpoint. Clears `interrupted`, spawns `_resume_session()`, which runs `_resume_graph()` via the same thread pool.

The singleton `InMemorySaver` checkpointer is shared across all sessions, keyed by `session_id` as `thread_id`. Sessions are ephemeral in memory — a restart loses active sessions.

---

## Frontend

```
web/src/
├── pages/
│   ├── HomePage.tsx     Session history list; replay / delete
│   ├── SetupPage.tsx    Topic + agent configuration; calls /ai/suggest-agents
│   └── SessionPage.tsx  Live stream and replay rendering
├── lib/
│   ├── api.ts           fetch wrappers: createSession, submitClarification, streamSession
│   └── ai.ts            suggestAgents, generatePersona (with AbortController)
├── types.ts             Event type unions, SessionConfig, SavedSession shapes
└── main.tsx / App.tsx   Router setup
```

The frontend uses no state management library — component state and props carry everything. `SessionPage` manages a `useState` array of events and appends to it as SSE frames arrive. Event rendering is a `switch` on `event.type`.

---

## Development setup

```bash
./orchestra --setup   # creates .venv, installs Python deps, installs web deps, scaffolds .env
```

Edit `.env` and add `OPENAI_API_KEY`.

```bash
./orchestra           # starts API on :7890 and Vite dev server on :3000
```

To run only the API:

```bash
source .venv/bin/activate
uvicorn api.main:app --port 7890 --reload
```

To run only the frontend:

```bash
cd web && npm run dev
```

**Python version:** 3.12+  
**Node version:** 18+

---

## Adding a new node

1. Create `nodes/yournode.py` and export `your_node(state: DiscussionState) -> dict`.
2. Return only the fields the node modifies.
3. Emit progress via `events.py` (add a new typed function there if needed).
4. Register the node in `graph.py`: `g.add_node("your_node", your_node)`.
5. Wire edges or conditional edges to and from it.

## Adding a new output type

1. Add the string to `_VALID_OUTPUT_TYPES` in `runner.py` and to `AVAILABLE_OUTPUT_TYPES` in `api/schemas.py`.
2. Add a system prompt branch in `nodes/synthesis.py`.
3. Expose it in the frontend `SetupPage` select options.

## Adding a new event type

1. Add a typed emitter function to `events.py` and a label entry to `_UI`.
2. Call it from the relevant node.
3. Add the type to the event union in `web/src/types.ts`.
4. Handle it in the `SessionPage` event renderer.

---

## Code conventions

- Node functions are pure: they read state and return a partial dict. Side effects (LLM calls, event emission) happen inside the function but do not leak to caller state.
- New LLM calls belong in `nodes/`, not in `api/` or `runner.py`. The API layer does not call LLMs directly — the two exceptions (`/ai/suggest-agents` and `/ai/generate-persona`) are deliberate utility endpoints, not part of the deliberation engine.
- Do not import `api/` from `nodes/` or root-level files. The engine must stay decoupled from the API layer so it can be driven from the CLI or tests without starting FastAPI.
- Keep `state.py` as the single source of truth for the shape of `DiscussionState`. Do not pass ad-hoc dicts between nodes.
- Pydantic models in `api/schemas.py` are for API boundary validation only. Internal graph state uses the `TypedDict` definitions in `state.py`.

---

## Pull requests

- Open an issue before starting large changes.
- Keep PRs focused — one logical change per PR.
- Test the golden path (full session, export) and clarification interrupt flow manually before submitting.
- There is no automated test suite yet; if you add one, place tests in `tests/` and document how to run them here.
