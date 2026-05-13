from typing import TypedDict, List, Optional, Annotated
import operator


class AgentConfig(TypedDict):
    name: str
    role: str
    persona: str
    model: str  # gpt-5.4 | gpt-5.4-mini | gpt-5.4-nano


class AgentResponse(TypedDict):
    agent_name: str
    role: str
    content: str
    round: int


class FacilitatorOutput(TypedDict):
    definition: str
    questions: List[str]
    output_type: str  # "content" | "technical_report" | "product_spec" | "strategy" | "decision_brief" | "general"


class SynthesisOutput(TypedDict):
    output_type: str       # mirrors framing.output_type
    deliverable: str       # the actual artifact in markdown
    summary: str           # 2–3 sentences describing what was produced
    key_decisions: List[str]
    open_questions: List[str]


class DiscussionState(TypedDict):
    topic: str
    agents_config: List[AgentConfig]
    output_type: str  # user-selected mode; overrides facilitator auto-detection
    framing: Optional[FacilitatorOutput]
    responses: Annotated[List[AgentResponse], operator.add]
    current_round: int
    discussion_rounds: int
    synthesis: Optional[SynthesisOutput]
