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


class ReviewDecision(TypedDict):
    decision: str   # "continue" | "synthesize"
    reason: str
    round: int


class SynthesisOutput(TypedDict):
    executive_summary: str
    key_insights: List[str]
    convergence_points: List[str]
    divergence_points: List[str]
    recommendations: List[str]
    open_questions: List[str]


class DiscussionState(TypedDict):
    topic: str
    agents_config: List[AgentConfig]
    framing: Optional[FacilitatorOutput]
    responses: Annotated[List[AgentResponse], operator.add]
    current_round: int
    max_rounds: int
    review_decisions: Annotated[List[ReviewDecision], operator.add]
    should_continue: bool
    synthesis: Optional[SynthesisOutput]
