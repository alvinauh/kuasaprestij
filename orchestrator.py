from typing import TypedDict, Annotated, List
from langgraph.graph import StateGraph, END
from schemas.assessment import ValidatedQuestion

# 1. Define the "State" (What the agents share)
class AgentState(TypedDict):
    topic: str
    curriculum: str
    draft_question: Optional[ValidatedQuestion]
    audit_feedback: str
    iterations: int

# 2. Node: The Generator (Creates the question)
def question_generator(state: AgentState):
    print(f"--- GENERATING QUESTION FOR {state['topic']} ---")
    # In reality, this is where you call your LLM (Groq/OpenRouter)
    # and provide the Syllabus context from Supabase.
    return {"iterations": state["iterations"] + 1}

# 3. Node: The Auditor (Checks quality)
def quality_auditor(state: AgentState):
    print("--- AUDITING QUESTION QUALITY ---")
    # This node applies Narciss's Model or KSSM constraints.
    # If bad, return feedback. If good, move to END.
    if state["iterations"] < 2:
        return {"audit_feedback": "Needs more cognitive depth."}
    return {"audit_feedback": "PASSED"}

# 4. Construct the Graph
workflow = StateGraph(AgentState)

workflow.add_node("generator", question_generator)
workflow.add_node("auditor", quality_auditor)

workflow.set_entry_point("generator")

# Logic: After generator, always audit.
workflow.add_edge("generator", "auditor")

# Logic: If auditor says PASSED, go to END. Otherwise, loop back to generator.
workflow.add_conditional_edges(
    "auditor",
    lambda x: "passed" if x["audit_feedback"] == "PASSED" else "failed",
    {
        "passed": END,
        "failed": "generator"
    }
)

app_engine = workflow.compile()