from __future__ import annotations
import asyncio
import contextvars
import json
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import AsyncGenerator

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command

import events as ev_module
from graph import build_graph
from state import DiscussionState
from api import db

_executor = ThreadPoolExecutor(max_workers=10)

# Singleton checkpointer — persists graph state across initial run and resumes.
# Sessions are keyed by session_id used as thread_id.
_checkpointer = InMemorySaver()
_graph = None


def _get_graph():
    global _graph
    if _graph is None:
        _graph = build_graph(_checkpointer)
    return _graph


# Each entry: {
#   "queue": Queue,
#   "config": dict | None,
#   "created_at": str,
#   "interrupted": bool,   # True while waiting for a clarification answer
# }
_sessions: dict[str, dict] = {}

_VALID_OUTPUT_TYPES = {
    "content", "technical_report", "product_spec",
    "strategy", "decision_brief", "general",
}


def create_session() -> tuple[str, asyncio.Queue]:
    session_id = str(uuid.uuid4())
    queue: asyncio.Queue = asyncio.Queue()
    _sessions[session_id] = {
        "queue": queue,
        "config": None,
        "created_at": datetime.utcnow().isoformat(),
        "interrupted": False,
    }
    return session_id, queue


def session_exists(session_id: str) -> bool:
    return session_id in _sessions


def session_is_interrupted(session_id: str) -> bool:
    session = _sessions.get(session_id)
    return session is not None and session.get("interrupted", False)


async def start_session(session_id: str, config: dict) -> None:
    session = _sessions.get(session_id)
    if session is None:
        return
    session["config"] = config

    loop = asyncio.get_running_loop()
    asyncio.create_task(_run_session(session_id, config, loop))


async def _run_session(
    session_id: str,
    config: dict,
    loop: asyncio.AbstractEventLoop,
) -> None:
    """Execute the graph from the beginning. Handles interrupt (pause) vs. completion."""
    session = _sessions.get(session_id)
    if session is None:
        return
    queue = session["queue"]

    token = ev_module._queue_ctx.set((queue, loop))
    ctx = contextvars.copy_context()
    ev_module._queue_ctx.reset(token)

    completed = False
    try:
        completed = await loop.run_in_executor(
            _executor, ctx.run, _execute_graph, config, session_id
        )
    except Exception as exc:  # noqa: BLE001
        _emit_error(queue, loop, str(exc))
        completed = True

    if completed:
        await _finalize_session(session_id)
    else:
        # Graph paused at interrupt — stream stays open, waiting for clarification answer.
        session["interrupted"] = True


async def resume_session(session_id: str, answer: str) -> None:
    """Resume a graph paused at a clarification interrupt with the user's answer."""
    session = _sessions.get(session_id)
    if session is None:
        raise ValueError(f"Session {session_id} not found")

    session["interrupted"] = False
    loop = asyncio.get_running_loop()
    asyncio.create_task(_resume_session(session_id, answer, loop))


async def _resume_session(
    session_id: str,
    answer: str,
    loop: asyncio.AbstractEventLoop,
) -> None:
    """Run Command(resume=answer) against the checkpointed graph state."""
    session = _sessions.get(session_id)
    if session is None:
        return
    queue = session["queue"]

    token = ev_module._queue_ctx.set((queue, loop))
    ctx = contextvars.copy_context()
    ev_module._queue_ctx.reset(token)

    completed = False
    try:
        completed = await loop.run_in_executor(
            _executor, ctx.run, _resume_graph, session_id, answer
        )
    except Exception as exc:  # noqa: BLE001
        _emit_error(queue, loop, str(exc))
        completed = True

    if completed:
        await _finalize_session(session_id)
    else:
        # Another clarification was requested (rare but possible if graph loops).
        session["interrupted"] = True


async def _finalize_session(session_id: str) -> None:
    """Signal stream end and persist events to DB."""
    session = _sessions.get(session_id)
    if session is None:
        return
    await session["queue"].put(None)


def _execute_graph(config: dict, session_id: str) -> bool:
    """
    Run the graph from scratch with the supplied config.
    Returns True if the graph completed, False if it paused at an interrupt.
    """
    topic: str = config["topic"].strip()
    agents_config: list = [dict(a) for a in config["agents"]]
    discussion_rounds: int = min(int(config.get("discussion_rounds", 3)), 5)
    output_type: str = config.get("output_type", "general")
    if output_type not in _VALID_OUTPUT_TYPES:
        output_type = "general"

    for a in agents_config:
        a.setdefault("model", "gpt-5.4")

    ev_module.session_start(topic, agents_config, discussion_rounds)

    initial_state: DiscussionState = {
        "topic": topic,
        "agents_config": agents_config,
        "output_type": output_type,
        "framing": None,
        "responses": [],
        "current_round": 0,
        "discussion_rounds": discussion_rounds,
        "synthesis": None,
        "round_summaries": [],
        "decision_log": [],
        "open_items": [],
        # Per-agent turn orchestration
        "current_agent_index": 0,
        "current_agent_draft": None,
        "current_agent_tokens": 0,
        "pending_clarification": None,
        "clarification_answer": None,
        "clarification_history": [],
    }

    graph = _get_graph()
    graph_config = {"configurable": {"thread_id": session_id}}
    result = graph.invoke(initial_state, graph_config)
    return "__interrupt__" not in result


def _resume_graph(session_id: str, answer: str) -> bool:
    """
    Resume the graph from its checkpoint using the user's clarification answer.
    Returns True if the graph completed, False if it paused again.
    """
    graph = _get_graph()
    graph_config = {"configurable": {"thread_id": session_id}}
    result = graph.invoke(Command(resume=answer), graph_config)
    return "__interrupt__" not in result


def _emit_error(queue: asyncio.Queue, loop: asyncio.AbstractEventLoop, message: str) -> None:
    payload = json.dumps({"type": "error", "message": message, "ts": datetime.utcnow().isoformat()})
    loop.call_soon_threadsafe(queue.put_nowait, payload)


async def stream_session(session_id: str) -> AsyncGenerator[str, None]:
    session = _sessions.get(session_id)
    if session is None:
        return

    queue = session["queue"]
    collected: list[str] = []
    final_status = "done"

    try:
        while True:
            item = await queue.get()
            if item is None:
                break
            collected.append(item)
            try:
                if json.loads(item).get("type") == "error":
                    final_status = "error"
            except Exception:
                pass
            yield f"data: {item}\n\n"
    finally:
        config = session.get("config") or {}
        created_at = session.get("created_at", datetime.utcnow().isoformat())
        _sessions.pop(session_id, None)

        if collected and config:
            asyncio.create_task(
                db.save_session(
                    session_id,
                    config.get("topic", ""),
                    config,
                    collected,
                    final_status,
                    created_at,
                )
            )
