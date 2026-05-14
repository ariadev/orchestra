"""
Model registry and ChatOpenAI factory.
"""
from langchain_openai import ChatOpenAI

AVAILABLE_MODELS = {
    "gpt-5.4":      "gpt-5.4",
    "gpt-5.4-mini": "gpt-5.4-mini",
    "gpt-5.4-nano": "gpt-5.4-nano",
}

# System roles always run on the most capable model.
FACILITATOR_MODEL = "gpt-5.4"
REVIEWER_MODEL    = "gpt-5.4"
SYNTHESIS_MODEL   = "gpt-5.4"
EXTRACTOR_MODEL   = "gpt-5.4"


def get_llm(model_id: str, temperature: float = 0.7) -> ChatOpenAI:
    resolved = AVAILABLE_MODELS.get(model_id, model_id)
    return ChatOpenAI(model=resolved, temperature=temperature)


def get_facilitator_llm() -> ChatOpenAI:
    return get_llm(FACILITATOR_MODEL, temperature=0.3)


def get_reviewer_llm() -> ChatOpenAI:
    return get_llm(REVIEWER_MODEL, temperature=0.1)


def get_synthesis_llm() -> ChatOpenAI:
    return get_llm(SYNTHESIS_MODEL, temperature=0.3)


def get_extractor_llm() -> ChatOpenAI:
    return get_llm(EXTRACTOR_MODEL, temperature=0.2)
