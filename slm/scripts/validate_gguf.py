"""Run held-out prompts through the exported GGUF and check JSON + schema validity.

  python scripts/validate_gguf.py --model skor_offline_slm/unsloth.Q4_K_M.gguf \
      --data data/skor_slm_eval.jsonl --threads 4

Uses the same thread count as the phone so timings are roughly comparable.
"""
import argparse
import json
import sys
import time
from collections import defaultdict
from pathlib import Path

from llama_cpp import Llama, LlamaGrammar
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).parent))
from schemas import SCHEMAS  # noqa: E402

GRAMMARS = Path(__file__).parent.parent / "grammars"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--model", required=True)
    p.add_argument("--data", default="data/skor_slm_eval.jsonl")
    p.add_argument("--threads", type=int, default=4)
    p.add_argument("--limit", type=int, default=0)
    args = p.parse_args()

    llm = Llama(model_path=args.model, n_ctx=2048, n_threads=args.threads, verbose=False)
    grammars = {f.stem.removeprefix("essay_"): LlamaGrammar.from_file(str(f), verbose=False)
                for f in GRAMMARS.glob("*.gbnf")}
    grammar_for = {"essay_pass1": grammars.get("pass1"), "essay_pass2": grammars.get("pass2")}

    rows = [json.loads(l) for l in open(args.data, encoding="utf-8")]
    if args.limit:
        rows = rows[: args.limit]

    stats = defaultdict(lambda: {"n": 0, "json": 0, "schema": 0, "secs": 0.0})
    for r in rows:
        key = (r["task"], r["lang"])
        prompt = r["messages"][:-1]  # multi-turn tutor rows keep earlier assistant turns as history
        t0 = time.time()
        out = llm.create_chat_completion(messages=prompt, temperature=0.2, max_tokens=512,
                                         grammar=grammar_for.get(r["task"]))
        s = stats[key]
        s["n"] += 1
        s["secs"] += time.time() - t0
        text = out["choices"][0]["message"]["content"]
        try:
            data = json.loads(text)
            s["json"] += 1
            SCHEMAS[r["task"]].model_validate(data)
            s["schema"] += 1
        except (json.JSONDecodeError, ValidationError) as e:
            print(f"[{r['task']}/{r['lang']}] {type(e).__name__}: {text[:160]!r}")

    print(f"\n{'task':12s} {'lang':5s} {'n':>4s} {'json%':>6s} {'schema%':>8s} {'avg s':>6s}")
    for (task, lang), s in sorted(stats.items()):
        n = s["n"]
        print(f"{task:12s} {lang:5s} {n:4d} {100*s['json']/n:6.0f} {100*s['schema']/n:8.0f} {s['secs']/n:6.1f}")


if __name__ == "__main__":
    main()
