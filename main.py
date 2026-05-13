#!/usr/bin/env python3
"""
Orchestra — multi-agent deliberation backend for opentui.

Input  (stdin):  one JSON object (see schema below)
Output (stdout): newline-delimited JSON events, one per line

Input schema:
{
  "topic": "string — the question or problem to deliberate on",
  "agents": [
    {
      "name":    "string — agent display name",
      "role":    "string — professional or functional role",
      "persona": "string — behavioural description / perspective",
      "model":   "gpt-5.4" | "gpt-5.4-mini" | "gpt-5.4-nano"   (default: gpt-5.4)
    }
  ],
  "max_rounds": 3   (optional, default 3, max 5)
}
"""
import json
import sys
import os

from dotenv import load_dotenv

load_dotenv()

import events
from graph import build_graph
from models import AVAILABLE_MODELS
from state import DiscussionState


_MAX_ROUNDS_HARD_CAP = 5
_DEFAULT_MAX_ROUNDS = 3


def _validate(cfg: dict) -> str | None:
    """Return an error string or None if valid."""
    if not cfg.get("topic", "").strip():
        return "Field 'topic' is required and must be non-empty."
    agents = cfg.get("agents", [])
    if not agents:
        return "Field 'agents' must contain at least one agent."
    if len(agents) > 10:
        return "A maximum of 10 agents is supported."
    for i, a in enumerate(agents):
        for field in ("name", "role", "persona"):
            if not a.get(field, "").strip():
                return f"Agent {i}: field '{field}' is required."
        model = a.get("model", "gpt-5.4")
        if model not in AVAILABLE_MODELS:
            return (
                f"Agent {i}: unknown model '{model}'. "
                f"Choose from: {', '.join(AVAILABLE_MODELS)}."
            )
    return None


def main() -> None:
    raw = sys.stdin.read()
    try:
        cfg = json.loads(raw)
    except json.JSONDecodeError as exc:
        events.error(f"Invalid JSON input: {exc}")
        sys.exit(1)

    err = _validate(cfg)
    if err:
        events.error(err)
        sys.exit(1)

    topic: str = cfg["topic"].strip()
    agents_config: list = cfg["agents"]
    max_rounds: int = min(
        int(cfg.get("max_rounds", _DEFAULT_MAX_ROUNDS)),
        _MAX_ROUNDS_HARD_CAP,
    )

    # Normalise agent models.
    for a in agents_config:
        a.setdefault("model", "gpt-5.4")

    events.session_start(topic, agents_config, max_rounds)

    initial_state: DiscussionState = {
        "topic": topic,
        "agents_config": agents_config,
        "framing": None,
        "responses": [],
        "current_round": 0,
        "max_rounds": max_rounds,
        "review_decisions": [],
        "should_continue": True,
        "synthesis": None,
    }

    try:
        graph = build_graph()
        graph.invoke(initial_state)
    except Exception as exc:  # noqa: BLE001
        events.error(str(exc))
        sys.exit(1)


if __name__ == "__main__":
    main()
