"""Ask the offline Skor SLM one question, the way the app would. Used for live field testing.

  python scripts/ask_skor.py request.json [--threads 4]

request.json (fields per task; see prompts.user_prompt):
  {"task": "tutor", "lang": "bm", "subject": "...", "topic": "...", "question": "...",
   "options": ["..", "..", "..", ".."], "student_message": "..."}
  {"task": "evaluator", "lang": "en", "subject": "...", "question": "...", "options": [...],
   "correct_answer": "...", "student_answer": "..."}
  {"task": "generator", "lang": "zh", "subject": "...", "form": 4, "topic": "...", "kbat": "Analyse"}
  {"task": "essay", "lang": "en", "title": "...", "essay": "..."}      # runs pass 1 and pass 2
Prints JSON: {"task", "output", "schema_ok", "seconds", "raw"} (a list of two for essays).
"""
import argparse
import json
import sys
import time
from pathlib import Path

from llama_cpp import Llama, LlamaGrammar
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).parent))
from prompts import SYSTEM, card_text, tutor_messages, user_prompt  # noqa: E402
from schemas import SCHEMAS  # noqa: E402

ROOT = Path(__file__).parent.parent
DEFAULT_MODEL = ROOT / "skor_offline_slm" / "skor_offline_slm.Q4_K_M.gguf"


class SLM:
    def __init__(self, model=DEFAULT_MODEL, threads=4):
        self.llm = Llama(model_path=str(model), n_ctx=2048, n_threads=threads, verbose=False)
        g = ROOT / "grammars"
        self.grammar = {"essay_pass1": LlamaGrammar.from_file(str(g / "essay_pass1.gbnf"), verbose=False),
                        "essay_pass2": LlamaGrammar.from_file(str(g / "essay_pass2.gbnf"), verbose=False)}

    def run(self, task, user):
        return self.run_messages(task, [{"role": "system", "content": SYSTEM[task]},
                                        {"role": "user", "content": user}])

    def run_messages(self, task, msgs):
        t0 = time.time()
        out = self.llm.create_chat_completion(messages=msgs, temperature=0.2, max_tokens=512,
                                              grammar=self.grammar.get(task))
        raw = out["choices"][0]["message"]["content"]
        res = {"task": task, "output": None, "schema_ok": False, "seconds": round(time.time() - t0, 1), "raw": raw}
        try:
            res["output"] = json.loads(raw)
            SCHEMAS[task].model_validate(res["output"])
            res["schema_ok"] = True
        except (json.JSONDecodeError, ValidationError) as e:
            res["error"] = type(e).__name__
        return res


def lookup_context(req):
    """Fact card for the request's topic, as the app would take it from the content pack."""
    path = ROOT / "data" / "fact_cards.json"
    if not path.exists():
        return ""
    cards = json.loads(path.read_text(encoding="utf-8"))
    subj, topic, form = str(req.get("subject", "")).lower(), str(req["topic"]).lower(), str(req.get("form", ""))
    best = None
    for key, card in cards.items():
        s, f, t = key.split("|", 2)
        if card and s.lower() == subj and t.lower() == topic:
            if f == form:
                return card_text(card, req["lang"])
            best = best or card
    return card_text(best, req["lang"]) if best else ""


def main():
    p = argparse.ArgumentParser()
    p.add_argument("request")
    p.add_argument("--threads", type=int, default=4)
    args = p.parse_args()
    req = json.loads(Path(args.request).read_text(encoding="utf-8"))
    if "context" not in req and req.get("topic"):
        req["context"] = lookup_context(req)
    slm = SLM(threads=args.threads)
    if req["task"] == "essay":
        res = [slm.run(t, user_prompt(t, req)) for t in ("essay_pass1", "essay_pass2")]
    elif req["task"] == "tutor":
        hist = [(h["student"], json.dumps(h["tutor"], ensure_ascii=False)) for h in req.get("history", [])]
        res = slm.run_messages("tutor", tutor_messages(req, hist))
    else:
        res = slm.run(req["task"], user_prompt(req["task"], req))
    res = res if isinstance(res, list) else {**res, "context_used": bool(req.get("context"))}
    print(json.dumps(res, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
