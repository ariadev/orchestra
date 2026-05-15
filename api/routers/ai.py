from __future__ import annotations
import json
import os

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/ai", tags=["ai"])


class SuggestRequest(BaseModel):
    topic: str


class PersonaRequest(BaseModel):
    topic: str
    role: str


class SuggestedAgent(BaseModel):
    name: str
    role: str
    persona: str


class SuggestResponse(BaseModel):
    agents: list[SuggestedAgent]


class PersonaResponse(BaseModel):
    persona: str


async def _chat(
    messages: list[dict],
    *,
    model: str = "gpt-5.4-nano",
    response_format: dict | None = None,
) -> str:
    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY is not configured")

    payload: dict = {"model": model, "messages": messages, "temperature": 0.7}
    if response_format:
        payload["response_format"] = response_format

    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )

    if not res.is_success:
        raise HTTPException(status_code=502, detail=f"OpenAI error {res.status_code}")

    content = (
        res.json().get("choices", [{}])[0].get("message", {}).get("content", "").strip()
    )
    if not content:
        raise HTTPException(status_code=502, detail="Empty response from model")
    return content


@router.post("/suggest-agents", response_model=SuggestResponse)
async def suggest_agents(req: SuggestRequest) -> SuggestResponse:
    content = await _chat(
        messages=[
            {
                "role": "system",
                "content": (
                    "You design focused AI agent teams for structured discussions. Given a topic, suggest 3–5 agents "
                    "whose perspectives create productive tension and cover the most important angles. "
                    "For each agent: choose a realistic first name, a concise job title, and write a 2–4 sentence persona "
                    "in second person as behavioral instructions covering domain lens, tradeoffs to emphasize, and how to "
                    "engage with other agents when agreeing or pushing back."
                ),
            },
            {"role": "user", "content": f"Discussion topic: {req.topic[:400]}"},
        ],
        response_format={
            "type": "json_schema",
            "json_schema": {
                "name": "agent_suggestions",
                "strict": True,
                "schema": {
                    "type": "object",
                    "properties": {
                        "agents": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "name": {"type": "string"},
                                    "role": {"type": "string"},
                                    "persona": {"type": "string"},
                                },
                                "required": ["name", "role", "persona"],
                                "additionalProperties": False,
                            },
                        },
                    },
                    "required": ["agents"],
                    "additionalProperties": False,
                },
            },
        },
    )

    parsed = json.loads(content)
    agents = [
        SuggestedAgent(**a)
        for a in parsed.get("agents", [])
        if a.get("name") and a.get("role") and a.get("persona")
    ]
    return SuggestResponse(agents=agents[:5])


@router.post("/generate-persona", response_model=PersonaResponse)
async def generate_persona(req: PersonaRequest) -> PersonaResponse:
    content = await _chat(
        messages=[
            {
                "role": "system",
                "content": (
                    "You write high-signal personas for AI participants in structured deliberations. "
                    "Write personas that sound like real expert stances, not generic assistant copy. "
                    "Each persona must encode the participant's domain lens, priorities, decision criteria, "
                    "likely tensions, and contribution style. "
                    "Favor specificity and concrete reasoning. Avoid platitudes, self-reference, vague optimism, "
                    "and empty claims about collaboration. "
                    "The persona should push the agent to ground claims in its role's expertise, surface tradeoffs, "
                    "and respectfully challenge weak reasoning instead of repeating others. "
                    "Write in user language, in second person, as direct behavioral instructions. "
                    "Return only the persona text as a single compact paragraph of 3-5 sentences, with no markdown or labels."
                ),
            },
            {
                "role": "user",
                "content": (
                    "Create the persona for this participant. Make it clearly useful for the actual discussion, "
                    "including what this role should pay attention to, what kinds of tradeoffs it should emphasize, "
                    "and how it should engage with other participants when it agrees or disagrees.\n\n"
                    f"Discussion topic: {req.topic[:400]}\n"
                    f"Agent role: {req.role[:200]}"
                ),
            },
        ],
    )
    return PersonaResponse(persona=content)
