"""
LangGraph deliberation workflow.

Flow:
  START → facilitator → agent_decide ──(clarification?)──► agent_clarify → agent_commit
                              ↑                    │                              │
                              │              (no clarification)                   │
                              │                    ▼                              │
                              │             agent_commit ◄────────────────────────┘
                              │                    │
                              └──(more agents)─────┤
                                                   │
                                            (round done)
                                                   ▼
                                          round_extractor
                                                   │
                               ┌───────────────────┤
                         (more rounds)        (done)
                               │                   ▼
                               └──► agent_decide  synthesis → END

The graph requires a checkpointer to support interruptible clarification turns.
Use build_graph(checkpointer) — runner.py supplies the singleton InMemorySaver.
"""
from langgraph.graph import StateGraph, START, END

from state import DiscussionState
from nodes.facilitator import facilitator_node
from nodes.agents import agent_decide_node, agent_clarify_node, agent_commit_node
from nodes.extractor import round_extractor_node
from nodes.synthesis import synthesis_node


def _route_after_decide(state: DiscussionState) -> str:
    """Route to clarification interrupt or directly to commit."""
    if state.get("pending_clarification"):
        return "agent_clarify"
    return "agent_commit"


def _route_after_commit(state: DiscussionState) -> str:
    """Route to next agent or round extraction when all agents have spoken."""
    if state["current_agent_index"] < len(state["agents_config"]):
        return "agent_decide"
    return "round_extractor"


def _route_after_extraction(state: DiscussionState) -> str:
    if state["current_round"] >= state["discussion_rounds"]:
        return "synthesis"
    return "agent_decide"


def build_graph(checkpointer=None):
    g = StateGraph(DiscussionState)

    g.add_node("facilitator", facilitator_node)
    g.add_node("agent_decide", agent_decide_node)
    g.add_node("agent_clarify", agent_clarify_node)
    g.add_node("agent_commit", agent_commit_node)
    g.add_node("round_extractor", round_extractor_node)
    g.add_node("synthesis", synthesis_node)

    g.add_edge(START, "facilitator")
    g.add_edge("facilitator", "agent_decide")
    g.add_conditional_edges(
        "agent_decide",
        _route_after_decide,
        ["agent_clarify", "agent_commit"],
    )
    g.add_edge("agent_clarify", "agent_commit")
    g.add_conditional_edges(
        "agent_commit",
        _route_after_commit,
        ["agent_decide", "round_extractor"],
    )
    g.add_conditional_edges(
        "round_extractor",
        _route_after_extraction,
        {"agent_decide": "agent_decide", "synthesis": "synthesis"},
    )
    g.add_edge("synthesis", END)

    return g.compile(checkpointer=checkpointer)
