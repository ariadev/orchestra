from __future__ import annotations
import json
import os
from pathlib import Path

import aiosqlite
import httpx

DB_PATH = Path("orchestra.db")


async def init_db() -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL DEFAULT '',
                topic       TEXT NOT NULL,
                config      TEXT NOT NULL,
                events      TEXT NOT NULL DEFAULT '[]',
                status      TEXT NOT NULL DEFAULT 'done',
                created_at  TEXT NOT NULL
            )
        """)
        await db.commit()


async def save_session(
    session_id: str,
    topic: str,
    config: dict,
    raw_events: list[str],
    status: str,
    created_at: str,
) -> None:
    name = await _generate_name(topic)
    events = []
    for raw in raw_events:
        try:
            events.append(json.loads(raw))
        except Exception:
            pass

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT OR REPLACE INTO sessions (id, name, topic, config, events, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (session_id, name, topic, json.dumps(config), json.dumps(events), status, created_at),
        )
        await db.commit()


async def list_sessions() -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT id, name, topic, config, status, created_at FROM sessions ORDER BY created_at DESC"
        ) as cursor:
            rows = await cursor.fetchall()

    result = []
    for row in rows:
        d = dict(row)
        cfg = json.loads(d["config"])
        result.append({
            "id": d["id"],
            "name": d["name"],
            "topic": d["topic"],
            "status": d["status"],
            "created_at": d["created_at"],
            "agent_count": len(cfg.get("agents", [])),
            "discussion_rounds": cfg.get("discussion_rounds", 0),
            "output_type": cfg.get("output_type", "general"),
        })
    return result


async def get_session(session_id: str) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT id, name, topic, config, events, status, created_at FROM sessions WHERE id = ?",
            (session_id,),
        ) as cursor:
            row = await cursor.fetchone()

    if not row:
        return None
    d = dict(row)
    return {
        "id": d["id"],
        "name": d["name"],
        "topic": d["topic"],
        "config": json.loads(d["config"]),
        "events": json.loads(d["events"]),
        "status": d["status"],
        "created_at": d["created_at"],
    }


async def _generate_name(topic: str) -> str:
    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        return _fallback_name(topic)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": "gpt-5.4-nano",
                    "messages": [{
                        "role": "user",
                        "content": (
                            "Create a short memorable title (3–6 words) for a discussion session "
                            "about the following topic. Reply with only the title — no quotes, "
                            f"no trailing punctuation.\n\nTopic: {topic[:300]}"
                        ),
                    }],
                    "temperature": 0.7,
                },
            )
        if not res.is_success:
            return _fallback_name(topic)
        name = res.json().get("choices", [{}])[0].get("message", {}).get("content", "").strip()
        return name or _fallback_name(topic)
    except Exception:
        return _fallback_name(topic)


def _fallback_name(topic: str) -> str:
    words = topic.strip().split()
    return " ".join(words[:5]) if words else "Untitled session"
