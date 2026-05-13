"""
LangGraph workflow — assembles the deliberation state machine.

Flow:
  START → facilitator → run_agents → reviewer ──► synthesize → END
                             ▲              │
                             └──(continue)──┘
"""
from langgraph.graph import StateGraph, START, END

from state import DiscussionState
from nodes.facilitator import facilitator_node
from nodes.agents import run_agents_node
from nodes.reviewer import reviewer_node
from nodes.synthesis import synthesis_node


def _route_after_review(state: DiscussionState) -> str:
    if state["should_continue"]:
        return "run_agents"
    return "synthesis"


def build_graph() -> StateGraph:
    g = StateGraph(DiscussionState)

    g.add_node("facilitator", facilitator_node)
    g.add_node("run_agents", run_agents_node)
    g.add_node("reviewer", reviewer_node)
    g.add_node("synthesis", synthesis_node)

    g.add_edge(START, "facilitator")
    g.add_edge("facilitator", "run_agents")
    g.add_edge("run_agents", "reviewer")
    g.add_conditional_edges(
        "reviewer",
        _route_after_review,
        {"run_agents": "run_agents", "synthesis": "synthesis"},
    )
    g.add_edge("synthesis", END)

    return g.compile()
