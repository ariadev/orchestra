# Orchestra

A multi-agent deliberation system built on [LangChain](https://github.com/langchain-ai/langchain) and [LangGraph](https://github.com/langchain-ai/langgraph), with a full terminal UI powered by [opentui](https://github.com/anomalyco/opentui).

Agents collaborate in a structured "meeting room": a facilitator frames the topic, user-defined agents deliberate across one or more rounds, a review agent decides when the discussion is mature, and a synthesis agent produces clean, actionable output.

---

## Quick start

**Requirements:** Python 3.12+, [uv](https://github.com/astral-sh/uv), [bun](https://bun.sh)

```bash
# 1. First-time setup (venv, Python deps, UI deps, .env scaffold)
./run.sh --setup

# 2. Add your OpenAI API key
$EDITOR .env

# 3. Launch
./run.sh
```

That's it. The TUI opens and you can configure agents interactively.

---

## `run.sh`

```
./run.sh [--setup]
```

| Flag | Effect |
|---|---|
| *(none)* | Pre-flight checks then launch the opentui TUI |
| `--setup` | Create `.env`, create Python venv, install all dependencies |

The script locates `bun` automatically (checks `~/.bun/bin`, `/usr/local/bin`, `$PATH`). You can override with `BUN_PATH=/path/to/bun ./run.sh`.

**Pre-flight checks** (run every launch):
- `OPENAI_API_KEY` is set (from `.env` or environment)
- `.venv/bin/python3` exists
- `ui/node_modules` exists

Any failure prints a clear error and exits before touching the terminal.

---

## Project structure

```
orchestra/
├── run.sh               ← single entry point (start here)
├── .env.example         ← copy to .env and add OPENAI_API_KEY
│
├── main.py              ← Python backend entry point (stdin → NDJSON stdout)
├── state.py             ← LangGraph TypedDict state
├── events.py            ← NDJSON emitter with Persian ui.* labels
├── models.py            ← model registry (gpt-5.4 / mini / nano)
├── graph.py             ← LangGraph StateGraph wiring
├── nodes/
│   ├── facilitator.py   ← frames topic → definition + 3-5 key questions
│   ├── agents.py        ← runs user agents sequentially per round
│   ├── reviewer.py      ← continue vs. synthesize decision
│   └── synthesis.py     ← final structured output
│
├── ui/                  ← opentui frontend (Bun + React)
│   ├── index.tsx        ← createCliRenderer → mount <App>
│   ├── App.tsx          ← screen router: setup ↔ session
│   ├── types.ts         ← shared types, colour palette, event shapes
│   └── components/
│       ├── SetupScreen.tsx   ← interactive form (topic, agents, rounds)
│       └── SessionScreen.tsx ← live event feed, spawns Python subprocess
│
├── sample_input.json    ← example backend input for CLI testing
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

### UI ↔ backend

```
opentui TUI (Bun)
  └── SetupScreen   user fills topic + agents, presses ▶ شروع بحث
  └── SessionScreen
       └── Bun.spawn(.venv/bin/python3 main.py)
            ├── stdin:  JSON session config
            └── stdout: NDJSON events → live rendered in scrollbox
```

---

## TUI keyboard reference

### Setup screen

| Key | Action |
|---|---|
| `Tab` / `Shift+Tab` | Move between fields |
| `Enter` | Confirm current field / activate button |
| `← →` | Cycle model (on model field) or adjust max rounds |
| `Ctrl+D` | Remove last agent (when name field is empty) |
| `Ctrl+C` | Quit |

### Session screen

| Key | Action |
|---|---|
| `↑ ↓` (or mouse scroll) | Scroll the event feed |
| `b` | Back to setup (only when session is done) |
| `Ctrl+C` | Kill backend subprocess and return to setup |

---

## Backend: input schema

The Python backend reads one JSON object from stdin and streams NDJSON to stdout. The UI does this automatically; you can also drive it directly.

```json
{
  "topic":      "The question or problem the agents should deliberate on.",
  "max_rounds": 3,
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
| `max_rounds` | integer | no | `3` | Capped at `5` |
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

Facilitator, reviewer, and synthesis agents always use `gpt-5.4` regardless of per-agent config.

---

## Backend: NDJSON event stream

Every line of stdout is a complete JSON object. Events arrive in this order:

```
session_start
facilitator_framing
round_start
  agent_thinking
  agent_response
  agent_thinking
  agent_response
  ...
round_end
review                  ← decision: "continue" or "synthesize"
[round_start … round_end … review]  ← repeated if continuing
synthesis
session_end
```

Every event carries a `ui` object with Persian-language strings for all labels, ready for opentui rendering without a translation layer.

### Event reference

#### `session_start`
```json
{
  "type": "session_start",
  "topic": "How should a startup balance features vs. technical debt?",
  "agents": [{ "name": "Aria", "role": "CTO", "model": "gpt-5.4" }],
  "max_rounds": 3,
  "ts": "2026-05-13T10:00:00.000000",
  "ui": { "label": "Start meeting", "topic_label": "موضوع", "agents_label": "شرکت‌کنندگان" }
}
```

#### `facilitator_framing`
```json
{
  "type": "facilitator_framing",
  "definition": "A crisp, actionable definition of the topic.",
  "questions": [
    "What criteria should drive the prioritisation decision?",
    "At what debt threshold does velocity start to degrade?",
    "How should this ratio shift with company growth stage?"
  ],
  "ts": "...",
  "ui": { "label": "تعریف موضوع توسط تسهیلگر", "definition_label": "تعریف", "questions_label": "سؤالات کلیدی" }
}
```

#### `agent_thinking`
```json
{
  "type": "agent_thinking",
  "agent": "Aria",
  "role": "CTO",
  "ts": "...",
  "ui": { "label": "Aria — در حال تفکر..." }
}
```

#### `agent_response`
```json
{
  "type": "agent_response",
  "agent": "Aria",
  "role": "CTO",
  "content": "Full multi-paragraph response text …",
  "round": 1,
  "ts": "...",
  "ui": { "label": "پاسخ: Aria", "role_label": "CTO" }
}
```

#### `review`
```json
{
  "type": "review",
  "decision": "synthesize",
  "reason": "All key questions addressed; further rounds unlikely to add value.",
  "round": 1,
  "ts": "...",
  "ui": { "label": "بررسی تسهیلگر", "decision_label": "جمع‌بندی", "reason_label": "دلیل" }
}
```

#### `synthesis`
```json
{
  "type": "synthesis",
  "executive_summary": "3–5 sentence brief …",
  "key_insights": ["Insight 1", "Insight 2"],
  "convergence_points": ["All agents agreed that …"],
  "divergence_points": ["Aria prioritised X while Darius argued Y …"],
  "recommendations": ["Adopt a 70/30 feature-to-debt ratio reviewed quarterly."],
  "open_questions": ["How should the ratio change post-Series A?"],
  "ts": "...",
  "ui": {
    "label": "جمع‌بندی نهایی",
    "summary_label": "خلاصه اجرایی",
    "insights_label": "بینش‌های کلیدی",
    "convergence_label": "نقاط توافق",
    "divergence_label": "نقاط اختلاف",
    "recommendations_label": "توصیه‌ها",
    "open_questions_label": "سؤالات باز"
  }
}
```

#### `session_end`
```json
{
  "type": "session_end",
  "total_rounds": 1,
  "ts": "...",
  "ui": { "label": "پایان جلسه", "rounds_label": "تعداد دورها: ۱" }
}
```

#### `error`
```json
{
  "type": "error",
  "message": "Field 'topic' is required and must be non-empty.",
  "ts": "...",
  "ui": { "label": "خطا" }
}
```

---

## CLI usage (backend only)

You can drive the backend directly without the TUI — useful for scripting or testing.

```bash
cat sample_input.json | .venv/bin/python3 main.py
```

### Session config examples

**Minimal — two agents**
```json
{
  "topic": "Should we adopt a microservices architecture for our monolithic Rails app?",
  "agents": [
    {
      "name": "Morgan",
      "role": "Staff Engineer",
      "persona": "Has migrated two monoliths to microservices. Knows both the wins and the pain."
    },
    {
      "name": "Casey",
      "role": "Engineering Manager",
      "persona": "Focused on team cognitive load and delivery speed. Skeptical of complexity."
    }
  ]
}
```

**Mixed models — cost-conscious panel**
```json
{
  "topic": "What pricing model maximises LTV for a B2B SaaS product?",
  "max_rounds": 2,
  "agents": [
    {
      "name": "Leila",
      "role": "Pricing Strategist",
      "persona": "Former consultant. Believes every product has a natural value metric.",
      "model": "gpt-5.4"
    },
    {
      "name": "Sam",
      "role": "Head of Sales",
      "persona": "Cares about deal velocity. Simpler pricing closes faster.",
      "model": "gpt-5.4-mini"
    },
    {
      "name": "Priya",
      "role": "CFO",
      "persona": "Focused on revenue predictability and churn.",
      "model": "gpt-5.4-mini"
    }
  ]
}
```

**High-stakes deep dive — up to 5 rounds**
```json
{
  "topic": "How should an AI startup handle data privacy when training on user-generated content?",
  "max_rounds": 5,
  "agents": [
    {
      "name": "Darius",
      "role": "Legal Counsel",
      "persona": "Specialises in GDPR and CCPA. Risk-averse but pragmatic.",
      "model": "gpt-5.4"
    },
    {
      "name": "Nour",
      "role": "ML Research Lead",
      "persona": "Needs data to ship. Champions differential privacy and federated learning.",
      "model": "gpt-5.4"
    },
    {
      "name": "Saba",
      "role": "Product Manager",
      "persona": "Owns user trust metrics. Believes transparency is a competitive advantage.",
      "model": "gpt-5.4-mini"
    },
    {
      "name": "Ryo",
      "role": "Security Engineer",
      "persona": "Threat-model thinker. Focused on minimising what's collected.",
      "model": "gpt-5.4"
    }
  ]
}
```

### Parsing the stream (Python)

```python
import subprocess, json

proc = subprocess.Popen(
    [".venv/bin/python3", "main.py"],
    stdin=open("sample_input.json"),
    stdout=subprocess.PIPE,
    text=True,
)

for line in proc.stdout:
    event = json.loads(line)
    match event["type"]:
        case "facilitator_framing":
            print("Definition:", event["definition"])
        case "agent_response":
            print(f"  [{event['agent']}] round {event['round']}: {event['content'][:80]}…")
        case "review":
            print(f"Review → {event['decision']}: {event['reason']}")
        case "synthesis":
            print("Summary:", event["executive_summary"])
        case "session_end":
            print(f"Done in {event['total_rounds']} round(s).")
```

### Parsing the stream (shell)

```bash
cat sample_input.json | .venv/bin/python3 main.py \
  | while IFS= read -r line; do
      type=$(echo "$line" | python3 -c "import sys,json; print(json.load(sys.stdin)['type'])")
      echo "[$type]"
    done
```

---

## Notes

- The **reviewer prefers synthesis**: it only triggers another round when a key question is genuinely unaddressed or the output is too vague to act on.
- Agents within a round speak **sequentially** — each agent sees what previous agents in the same round said, enabling real back-and-forth rather than parallel monologues.
- All analysis content is in **English**; all `ui.*` label strings are in **Persian** for opentui rendering.
