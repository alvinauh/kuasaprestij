import os
import json
from datetime import datetime, timedelta
from typing import TypedDict, Optional, List
from langgraph.graph import StateGraph, END
from supabase import create_client, Client
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv(override=True)

# Initialize Clients
supabase: Client = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

# 1. Enhanced State
class AgentState(TypedDict):
    student_id: str
    topic: str
    curriculum: str
    context: str
    draft: Optional[dict]
    student_answer: Optional[str]
    is_correct: bool
    mastery_score: float
    feedback: str
    media_url: Optional[str] # NEW: Added to hold the Lyria/Veo link

# --- RETRIEVER & GENERATOR NODES (From your earlier steps) ---
def retriever_node(state: AgentState):
    print(f"--- RETRIEVING SYLLABUS: {state['topic']} ---")
    # Your existing vector search logic goes here...
    return {"context": "Mock retrieved syllabus text for " + state['topic']}

def generator_node(state: AgentState):
    print("--- GENERATING REAL DIAGNOSTIC FROM TEXTBOOK ---")
    
    # We use Gemini to turn the retrieved textbook context into a question
    prompt = f"""
    Based on this KSSM textbook excerpt: "{state['context']}"
    Create ONE high-quality multiple-choice question for Form 4/5 students.
    
    Return ONLY a JSON object with this exact structure:
    {{
        "kbat_level": "string",
        "question": "string",
        "options": ["option1", "option2", "option3", "option4"],
        "correct_answer": "the exact string of the correct option",
        "distractor_rationale": {{
            "optionX": "why this is a common mistake"
        }}
    }}
    """
    
    res = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=prompt,
        config=types.GenerateContentConfig(response_mime_type="application/json")
    )
    
    return {"draft": json.loads(res.text)}

# --- NEW: STUDIO NODE ---
def studio_node(state: AgentState):
    print(f"--- STUDIO AGENT: GENERATING MEDIA FOR {state['topic']} ---")
    
    # 1. Check Media Cache First
    cache_res = supabase.table("media_cache")\
        .select("asset_url, media_type")\
        .eq("topic", state['topic'])\
        .execute()
    
    if cache_res.data:
        print(f"-> Using Cached Media: {cache_res.data[0]['media_type']}")
        return {"media_url": cache_res.data[0]['asset_url']}

    # 2. Decision Logic (Mocked API call for Lyria/Veo)
    media_type = "audio_lyria" 
    asset_url = f"https://cdn.kuasaprestij.tech/assets/{state['topic'].replace(' ', '_')}.mp3"

    # 3. Save to Cache for future students
    supabase.table("media_cache").upsert({
        "curriculum_tag": state['curriculum'],
        "topic": state['topic'],
        "media_type": media_type,
        "asset_url": asset_url
    }).execute()

    return {"media_url": asset_url}

# --- EVALUATOR NODE ---
def evaluator_node(state: AgentState):
    print(f"--- EVALUATING: {state['student_answer']} ---")
    
    draft = state['draft']
    # Clean up whitespace/case to ensure the comparison is fair
    student_ans = str(state.get('student_answer', '')).strip()
    correct_ans = str(draft.get('correct_answer', '')).strip()
    
    is_correct = student_ans == correct_ans
    
    # Logic to find the specific rationale for the feedback
    misconception = "Great job! That's correct."
    if not is_correct:
        # If the student's answer exists in our rationale map, use it
        misconception = draft.get('distractor_rationale', {}).get(student_ans, "Check your formula and try again!")

    return {"is_correct": is_correct, "feedback": misconception}
# --- MASTERY UPDATER NODE ---
def mastery_updater_node(state: AgentState):
    print("--- UPDATING STUDENT MASTERY SCORE ---")
    draft = state.get('draft', {}) # BUG FIX: Needed to pull draft from state
    
    adjustment = 0.1 if state['is_correct'] else -0.05
    
    res = supabase.table("dskp_mastery").select("mastery_level")\
        .eq("student_id", state['student_id'])\
        .eq("topic", state['topic']).execute()
    
    current_val = res.data[0]['mastery_level'] if res.data else 0.0
    new_mastery = max(0, min(1.0, current_val + adjustment))
    
    review_days = 3 if state['is_correct'] else 1
    next_review = datetime.now() + timedelta(days=review_days)
    
    supabase.table("dskp_mastery").upsert({
        "student_id": state['student_id'],
        "curriculum_tag": state['curriculum'],
        "topic": state['topic'],
        "mastery_level": new_mastery,
        "last_assessed_at": datetime.now().isoformat(),
        "next_review_at": next_review.isoformat()
    }, on_conflict="student_id,curriculum_tag,topic").execute()

    supabase.table("event_logs").insert({
        "student_id": state['student_id'],
        "topic": state['topic'],
        "kbat_level": draft.get('kbat_level', 'Unknown'),
        "is_correct": state['is_correct'],
        "diagnostic_tag": state['feedback']
    }).execute()

    return {"mastery_score": new_mastery}

# --- BUILD THE GRAPH ---
builder = StateGraph(AgentState)

builder.add_node("retriever", retriever_node)
builder.add_node("studio", studio_node) # NEW
builder.add_node("generator", generator_node)
builder.add_node("evaluator", evaluator_node)
builder.add_node("updater", mastery_updater_node)

builder.set_entry_point("retriever")
builder.add_edge("retriever", "studio") # Wiring the Studio Agent
builder.add_edge("studio", "generator")

# Simulation Loop (In production, the graph pauses here to wait for user input)
builder.add_edge("generator", "evaluator")
builder.add_edge("evaluator", "updater")
builder.add_edge("updater", END)

kuasa_engine = builder.compile()