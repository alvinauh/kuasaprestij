from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict

# Import the individual agent nodes and the state definition
from agents.orchestrator import (
    retriever_node,
    studio_node,
    generator_node,
    evaluator_node,
    mastery_updater_node,
    AgentState
)

app = FastAPI(title="KuasaPrestij Intelligence Core")

# CORS setup is mandatory for Lovable/Vercel to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 1. Pydantic Input Schemas ---
class StartSessionRequest(BaseModel):
    student_id: str
    topic: str
    curriculum: str
    subject: str

class SubmitAnswerRequest(BaseModel):
    student_id: str
    topic: str
    curriculum: str
    student_answer: str
    draft: dict  # The question data sent back from the frontend

# --- 2. API Endpoints ---

@app.post("/start_session")
async def start_session(req: StartSessionRequest):
    print(f"\n[API Hit] Starting Session for {req.student_id} on {req.topic}")
    
    # Initialize a fresh state
    state = AgentState(
        student_id=req.student_id,
        topic=req.topic,
        curriculum=req.curriculum,
        context="",
        draft=None,
        student_answer=None,
        is_correct=False,
        mastery_score=0.0,
        feedback="",
        media_url=None
    )
    
    # Run Phase 1: Retrieval & Generation
    state.update(retriever_node(state))
    state.update(studio_node(state))
    state.update(generator_node(state))
    
    # Return ONLY what the frontend needs to show the user
    return {
        "media_url": state.get("media_url"),
        "question_data": state.get("draft")
    }

@app.post("/submit_answer")
async def submit_answer(req: SubmitAnswerRequest):
    print(f"\n[API Hit] Grading Answer for {req.student_id} on {req.topic}")
    
    # Reconstruct the state using the data sent from the frontend
    state = AgentState(
        student_id=req.student_id,
        topic=req.topic,
        curriculum=req.curriculum,
        context="",
        draft=req.draft, 
        student_answer=req.student_answer,
        is_correct=False,
        mastery_score=0.0,
        feedback="",
        media_url=None
    )
    
    # Run Phase 2: Evaluation & Database Update
    state.update(evaluator_node(state))
    state.update(mastery_updater_node(state))
    
    # Return the diagnostic feedback and new score
    return {
        "is_correct": state.get("is_correct"),
        "feedback": state.get("feedback"),
        "new_mastery_score": state.get("mastery_score")
    }

@app.get("/")
async def root():
    return {"status": "KuasaPrestij Engine is Online", "version": "2.0"}