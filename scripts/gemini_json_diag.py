#!/usr/bin/env python3
"""
Diagnose WHY Gemini truncates JSON while Cerebras doesn't.
Uses the isolated Gemini test key (won't touch the primary quota or the seed run).
Prints finish_reason + token usage (thinking vs visible output) for 3 configs.
"""
import os, json
from dotenv import load_dotenv
load_dotenv(override=True)
from openai import OpenAI

MODEL = os.getenv("GEMINI_MODEL") or "gemini-3-flash-preview"
KEY = os.getenv("GEMINI_TEST_API_KEY") or os.getenv("GEMINI_API_KEY")
client = OpenAI(base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
                api_key=KEY, timeout=60.0)

PROMPT = (
    "Create ONE SPM Form 4 Physics multiple-choice question about Force and Motion. "
    "Return ONLY a JSON object with keys: question (string), options (array of 4 strings), "
    "correct_answer (string), distractor_rationale (object mapping each option to why a "
    "student might pick it), illustrative_notes (2-3 sentences)."
)

def run(label, **kw):
    try:
        r = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": PROMPT}],
            response_format={"type": "json_object"},
            temperature=0.7,
            **kw,
        )
        content = r.choices[0].message.content or ""
        fr = r.choices[0].finish_reason
        u = r.usage
        det = getattr(u, "completion_tokens_details", None)
        reasoning = getattr(det, "reasoning_tokens", None) if det else None
        try:
            json.loads(content); parsed = "OK"
        except Exception as e:
            parsed = f"FAIL ({e})"
        print(f"\n[{label}]  kwargs={kw}")
        print(f"  finish_reason = {fr}")
        print(f"  usage: prompt={u.prompt_tokens} completion={u.completion_tokens} "
              f"reasoning_tokens={reasoning}")
        print(f"  content chars = {len(content)}  | JSON parse: {parsed}")
        print(f"  content preview: {content[:120]!r}")
    except Exception as e:
        print(f"\n[{label}] REQUEST ERROR: {type(e).__name__}: {e}")

print(f"Model: {MODEL}  | key: {'TEST' if os.getenv('GEMINI_TEST_API_KEY') else 'primary'}")
run("A: reproduce (max_tokens=2048)", max_tokens=2048)
run("B: higher budget (max_tokens=8192)", max_tokens=8192)
run("C: reasoning_effort=low, max_tokens=2048", max_tokens=2048, reasoning_effort="low")
run("D: reasoning_effort=none, max_tokens=2048", max_tokens=2048, reasoning_effort="none")
