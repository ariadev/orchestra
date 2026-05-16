# Orchestra

A multi-agent deliberation system built on [LangChain](https://github.com/langchain-ai/langchain) and [LangGraph](https://github.com/langchain-ai/langgraph), with a web frontend powered by React + Vite.

Agents collaborate in a structured "meeting room": a facilitator frames the topic, user-defined agents deliberate across one or more rounds, a review agent decides when the discussion is mature, and a synthesis agent produces clean, actionable output.

---

## Quick start

**Requirements:** Python 3.12+, Node.js + npm

```bash
# 1. First-time setup (venv, Python deps, web deps, .env scaffold)
./orchestra --setup

# 2. Add your OpenAI API key
$EDITOR .env

# 3. Launch
./orchestra
```

The API server starts on port 7890 and the web dev server opens at `http://localhost:3000`.

---

## `orchestra`

```
./orchestra [--setup]
```

| Flag | Effect |
|---|---|
| *(none)* | Pre-flight checks then launch API + web dev server |
| `--setup` | Create `.env`, create Python venv, install all dependencies |

**Pre-flight checks** (run every launch):
- `OPENAI_API_KEY` is set (from `.env` or environment)
- `.venv/bin/python3` exists
- `web/node_modules` exists

Any failure prints a clear error and exits.

---

## Project structure

```
orchestra/
├── orchestra            ← single entry point (start here)
├── .env.example         ← copy to .env and add OPENAI_API_KEY
│
├── events.py            ← NDJSON event emitter (routes to SSE queue)
├── state.py             ← LangGraph TypedDict state
├── models.py            ← model registry (gpt-5.4 / mini / nano)
├── graph.py             ← LangGraph StateGraph wiring
├── nodes/
│   ├── facilitator.py   ← frames topic → definition + 3-5 key questions
│   ├── agents.py        ← runs user agents sequentially per round
│   ├── reviewer.py      ← continue vs. synthesize decision
│   └── synthesis.py     ← final structured output
│
├── api/                 ← FastAPI backend
│   ├── main.py          ← app setup, CORS, routers
│   ├── runner.py        ← session lifecycle, graph execution, SSE streaming
│   ├── schemas.py       ← Pydantic request/response models
│   ├── db.py            ← SQLite session persistence
│   └── routers/
│       ├── sessions.py  ← /sessions endpoints
│       └── ai.py        ← /ai/suggest-agents, /ai/generate-persona
│
├── web/                 ← React + Vite frontend
│   └── src/
│       ├── pages/       ← HomePage, SetupPage, SessionPage
│       └── lib/         ← api.ts (fetch/SSE), settings, history
│
├── sample_input.json    ← example backend config for CLI testing
└── requirements.txt
```

---

## Architecture

### Agent pipeline

```
START
  │
  ▼
Facilitator          Refines topic → crisp definition + 3-5 key questions
  │
  ▼
Run Agents ◄─────┐   Each agent speaks in turn; later speakers see earlier ones
  │               │
  ▼               │ (continue)
Reviewer          │   Decides: synthesize (preferred) or another round?
  │               │
  ├───────────────┘
  │ (synthesize)
  ▼
Synthesis            Merges all rounds → structured, de-duplicated output
  │
END
```

### Web ↔ backend

```
React web app (Vite, port 3000)
  └── SetupPage    user fills topic + agents, submits
  └── SessionPage
       └── POST /sessions           → starts graph execution
       └── GET  /sessions/:id/events → SSE stream of NDJSON events
       └── POST /sessions/:id/clarify → resumes after clarification interrupt
```

---

## Backend: input schema

POST `/sessions` accepts:

```json
{
  "topic":            "The question or problem the agents should deliberate on.",
  "discussion_rounds": 3,
  "output_type":      "general",
  "agents": [
    {
      "name":    "Display name",
      "role":    "Professional or functional role",
      "persona": "Behavioural description — perspective, biases, expertise style",
      "model":   "gpt-5.4"
    }
  ]
}
```

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `topic` | string | yes | — | The deliberation subject |
| `discussion_rounds` | integer | no | `3` | Capped at `5` |
| `output_type` | string | no | `general` | See output types below |
| `agents` | array | yes | — | 1–10 agents |
| `agents[].name` | string | yes | — | — |
| `agents[].role` | string | yes | — | — |
| `agents[].persona` | string | yes | — | — |
| `agents[].model` | string | no | `gpt-5.4` | See model options below |

### Available models

| Model | Use for |
|---|---|
| `gpt-5.4` | Highest quality; default for facilitator, reviewer, synthesis |
| `gpt-5.4-mini` | Balanced quality / cost |
| `gpt-5.4-nano` | Fastest, lowest cost |

### Output types

`general`, `content`, `technical_report`, `product_spec`, `strategy`, `decision_brief`

---

## Backend: NDJSON event stream

GET `/sessions/:id/events` returns a Server-Sent Events stream. Each `data:` payload is a JSON object:

```
session_start
facilitator_framing
round_start
  agent_thinking
  agent_response
  ...
round_end
review                  ← decision: "continue" or "synthesize"
[round_start … round_end … review]  ← repeated if continuing
synthesis
session_end
```

### Clarification interrupts

When an agent needs user input, the stream emits `clarification_request` and pauses. Submit the answer via POST `/sessions/:id/clarify` to resume:

```json
{ "answer": "your answer here" }
```

---

## CLI testing (backend only)

```bash
cat sample_input.json | .venv/bin/python3 -c "
import json, sys
sys.path.insert(0, '.')
from dotenv import load_dotenv; load_dotenv()
import events, graph, state
cfg = json.load(sys.stdin)
# ... (use api/runner.py logic directly or drive via HTTP)
"
```

Or drive via HTTP after `./orchestra` is running:

```bash
curl -s -X POST http://localhost:7890/sessions \
  -H 'Content-Type: application/json' \
  -d @sample_input.json | jq .

# Then stream events:
curl -N http://localhost:7890/sessions/<session_id>/events
```

---

## Notes

- The **reviewer prefers synthesis**: it only triggers another round when a key question is genuinely unaddressed or the output is too vague to act on.
- Agents within a round speak **sequentially** — each agent sees what previous agents in the same round said, enabling real back-and-forth rather than parallel monologues.
