"""
test_gemini.py — isolated Gemini smoke test.

Calls ONLY the Gemini test provider (GEMINI_TEST_API_KEY) via call_llm(gemini_only=True).
Never touches Cerebras / OpenRouter / Groq / DeepSeek quotas.

Usage:
    python test_gemini.py                 # plain text prompt
    python test_gemini.py --json          # JSON-mode prompt
    python test_gemini.py "your prompt"   # custom prompt
"""

import sys

from agents.llm_client import call_llm, _GEMINI_TEST_MODEL, _gemini, _has_key


def main() -> int:
    want_json = "--json" in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    prompt = args[0] if args else (
        'Return a JSON object: {"greeting": "...", "model": "..."}'
        if want_json else
        "In one sentence, what is the capital of Malaysia?"
    )

    print(f"Model:      {_GEMINI_TEST_MODEL}")
    print(f"Key set:    {_has_key(_gemini)}")
    print(f"JSON mode:  {want_json}")
    print(f"Prompt:     {prompt}\n")

    if not _has_key(_gemini):
        print("ERROR: no Gemini test key configured (set GEMINI_TEST_API_KEY in .env).")
        return 1

    try:
        res = call_llm(prompt, want_json=want_json, gemini_only=True, temperature=0.4)
    except Exception as e:
        print(f"FAILED: {type(e).__name__}: {e}")
        return 1

    print("--- Gemini response ---")
    print(res.text)
    print("-----------------------")
    print("OK" if res.text else "EMPTY RESPONSE")
    return 0 if res.text else 1


if __name__ == "__main__":
    raise SystemExit(main())
