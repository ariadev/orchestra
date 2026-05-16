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


class RoundSummary(TypedDict):
    round: int
    summary: str           # 3-4 sentence digest of what happened
    decisions_added: List[str]
    items_resolved: List[str]
    items_added: List[str]


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


class ClarificationRequest(TypedDict):
    """A paused agent turn waiting for user input. Not a completed deliberation message."""
    agent_name: str
    agent_role: str
    question: str
    why_it_matters: str
    round: int


class ClarificationRecord(TypedDict):
    """Audit record of a completed clarification exchange."""
    agent_name: str
    agent_role: str
    question: str
    why_it_matters: str
    answer: str
    round: int


class DiscussionState(TypedDict):
    topic: str
    agents_config: List[AgentConfig]
    output_type: str  # user-selected mode; overrides facilitator auto-detection
    framing: Optional[FacilitatorOutput]
    responses: Annotated[List[AgentResponse], operator.add]
    current_round: int
    discussion_rounds: int
    synthesis: Optional[SynthesisOutput]
    # Inter-round memory — replaces raw history forwarding
    round_summaries: Annotated[List[RoundSummary], operator.add]
    decision_log: Annotated[List[str], operator.add]  # append-only settled conclusions
    open_items: List[str]                             # maintained: resolved items drop off

    # Per-agent-turn orchestration (replaces monolithic run_agents_node)
    current_agent_index: int          # which agent is currently speaking (0-indexed)
    current_agent_draft: Optional[str]   # scratch: response text from agent_decide → agent_commit
    current_agent_tokens: int            # scratch: token count for the emitted agent_response

    # Clarification state (ephemeral per agent turn)
    pending_clarification: Optional[ClarificationRequest]  # set by agent_decide, cleared by agent_clarify
    clarification_answer: Optional[str]                    # set by agent_clarify, consumed by agent_commit

    # Structured audit trail of all clarification exchanges
    clarification_history: Annotated[List[ClarificationRecord], operator.add]
