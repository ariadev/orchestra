from __future__ import annotations
from pydantic import BaseModel, field_validator

_VALID_MODELS = {"gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano"}
_VALID_OUTPUT_TYPES = {
    "content", "technical_report", "product_spec",
    "strategy", "decision_brief", "general",
}


class AgentConfig(BaseModel):
    name: str
    role: str
    persona: str
    model: str = "gpt-5.4"

    @field_validator("name", "role", "persona")
    @classmethod
    def non_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("field must be non-empty")
        return v

    @field_validator("model")
    @classmethod
    def valid_model(cls, v: str) -> str:
        if v not in _VALID_MODELS:
            raise ValueError(f"unknown model '{v}'. Choose from: {', '.join(sorted(_VALID_MODELS))}")
        return v


class SessionRequest(BaseModel):
    topic: str
    agents: list[AgentConfig]
    discussion_rounds: int = 3
    output_type: str = "general"

    @field_validator("topic")
    @classmethod
    def non_empty_topic(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("topic must be non-empty")
        return v

    @field_validator("agents")
    @classmethod
    def validate_agents(cls, v: list[AgentConfig]) -> list[AgentConfig]:
        if not v:
            raise ValueError("at least one agent is required")
        if len(v) > 10:
            raise ValueError("maximum 10 agents allowed")
        return v

    @field_validator("discussion_rounds")
    @classmethod
    def cap_rounds(cls, v: int) -> int:
        return min(max(1, v), 5)

    @field_validator("output_type")
    @classmethod
    def valid_output_type(cls, v: str) -> str:
        return v if v in _VALID_OUTPUT_TYPES else "general"


class SessionResponse(BaseModel):
    session_id: str
