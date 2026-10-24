#!/usr/bin/env python3
"""Reproduce the Gemini JSON truncation with a REAL large generator context."""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
load_dotenv(override=True)
from openai import OpenAI
from agents.orchestrator import retriever_node

MODEL = os.getenv("GEMINI_MODEL") or "gemini-3-flash-preview"
client = OpenAI(base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
                api_key=os.getenv("GEMINI_TEST_API_KEY") or os.getenv("GEMINI_API_KEY"), timeout=60.0)

st = {'topic':'Friendships and Relationships','subject':'Bahasa Inggeris','language':'English',
      'is_adaptive':False,'question_type':'mcq','context':'','student_history':'','student_id':'x',
      'draft':None,'student_answer':None,'is_correct':False,'partial_credit':None,'mastery_score':0.0,
      'feedback':'','teacher_action_plan':'','mnemonic_lyrics':None,'media_url':None,'video_broll':None,
      'h5p_content':None,'topic_complete':False,'next_topic':'x','error_category':None,'root_cause':None,
      'intervention_plan':None}
out = retriever_node(st)
ctx = (out.get('context','') or '') + "\n" + (out.get('dskp_criteria','') or '')
print(f"context tokens ~{len(ctx)//4}")

PROMPT = f"""TEXTBOOK CONTENT:
{ctx}

TASK: Create ONE high-quality SPM Form 4 MCQ grounded strictly in the content above.
Return ONLY a JSON object with keys: source_excerpt, question_type, kbat_level,
illustrative_notes (2-3 sentences), question, options (4 strings), correct_answer,
distractor_rationale (object: each option -> why a student might wrongly pick it)."""

def run(i, **kw):
    r = client.chat.completions.create(model=MODEL, messages=[{"role":"user","content":PROMPT}],
        response_format={"type":"json_object"}, temperature=0.7, **kw)
    c = r.choices[0].message.content or ""
    fr = r.choices[0].finish_reason
    det = getattr(r.usage,"completion_tokens_details",None)
    rt = getattr(det,"reasoning_tokens",None) if det else None
    try: json.loads(c); p="OK"
    except Exception as e: p=f"FAIL({e})"
    print(f"  run{i} mt={kw.get('max_tokens')} eff={kw.get('reasoning_effort','-')}: "
          f"finish={fr} completion={r.usage.completion_tokens} reasoning={rt} chars={len(c)} json={p}")

print("--- max_tokens=2048 (reproduce), 4 trials ---")
for i in range(4): run(i, max_tokens=2048)
print("--- max_tokens=8192, 3 trials ---")
for i in range(3): run(i, max_tokens=8192)
print("--- reasoning_effort=none, max_tokens=2048, 3 trials ---")
for i in range(3): run(i, max_tokens=2048, reasoning_effort="none")
