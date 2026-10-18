"""Automatic probes for the field-test failure modes, runnable on any GGUF (A/B v1 vs v2).

  python scripts/probe.py --model skor_offline_slm/skor_offline_slm.Q4_K_M.gguf --n 20

- evaluator, correct answer given  -> must be error_category "None"
- evaluator, wrong answer given    -> must be one of Skor's 3 categories
- tutor, student commits to a wrong option -> must not affirm it, must not reveal the key, must end with "?"
Uses curriculum bank MCQs (no student data) with the topic's fact card as context.
"""
import argparse
import json
import random
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from ask_skor import SLM  # noqa: E402
from distill_local import load_seeds  # noqa: E402
from distill_v2 import AFFIRM, Grounding  # noqa: E402
from prompts import ERROR_CATEGORIES, tutor_messages, user_prompt  # noqa: E402

WRONG_MSG = {"en": "I think the answer is {w} because it sounds right.",
             "bm": "Saya rasa jawapan dia {w} sbb macam betul je.",
             "zh": "我觉得答案是{w}，因为看起来比较对。"}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--model", required=True)
    p.add_argument("--n", type=int, default=20)
    p.add_argument("--threads", type=int, default=12)
    p.add_argument("--out", default="")
    a = p.parse_args()
    slm, ground, rng = SLM(a.model, a.threads), Grounding("data/fact_cards.json"), random.Random(7)
    seeds = load_seeds("data/skor_slm_dataset.jsonl")
    zh = [{**r["seed"], "lang": "zh", "mcq": r["mcq"]} for r in map(json.loads, open("data/distill/gen_zh.jsonl", encoding="utf-8"))]
    pools = {"bm": [s for s in seeds if s["lang"] == "bm"], "en": [s for s in seeds if s["lang"] == "en"], "zh": zh}
    stats = defaultdict(lambda: defaultdict(int))
    for lang, pool in pools.items():
        for s in rng.sample(pool, a.n):
            m = s["mcq"]
            right = m["options"][m["answer_index"]]
            wrong = m["options"][rng.choice([i for i in range(4) if i != m["answer_index"]])]
            base = {"context": ground(s, lang), "subject": s["subject"], "topic": s["topic"], "lang": lang,
                    "question": m["question"], "options": m["options"], "correct_answer": right}
            st = stats[lang]
            for ans, ok_if in ((right, "correct"), (wrong, "wrong")):
                res = slm.run("evaluator", user_prompt("evaluator", {**base, "student_answer": ans}))
                cat = (res["output"] or {}).get("teacher_insight", {}).get("error_category") if res["schema_ok"] else None
                st[f"eval_{ok_if}_n"] += 1
                st[f"eval_{ok_if}_ok"] += (cat == "None") if ok_if == "correct" else (cat in ERROR_CATEGORIES)
            res = slm.run_messages("tutor", tutor_messages({**base, "student_message": WRONG_MSG[lang].format(w=wrong)}))
            reply = (res["output"] or {}).get("reply", "") if res["schema_ok"] else ""
            st["tutor_n"] += 1
            st["tutor_no_affirm"] += bool(reply) and not AFFIRM.search(reply)
            st["tutor_no_reveal"] += bool(reply) and not (len(right) >= 4 and right.lower() in reply.lower())
            st["tutor_ends_q"] += reply.strip().endswith(("?", "？"))
            print(f"  {lang} done {st['tutor_n']}", end="\r", flush=True)
    rows = {}
    for lang, st in stats.items():
        rows[lang] = {"correct_answer_recognised%": round(100 * st["eval_correct_ok"] / st["eval_correct_n"]),
                      "wrong_answer_skor_category%": round(100 * st["eval_wrong_ok"] / st["eval_wrong_n"]),
                      "tutor_no_false_affirm%": round(100 * st["tutor_no_affirm"] / st["tutor_n"]),
                      "tutor_no_answer_reveal%": round(100 * st["tutor_no_reveal"] / st["tutor_n"]),
                      "tutor_ends_with_question%": round(100 * st["tutor_ends_q"] / st["tutor_n"])}
    print(json.dumps({"model": a.model, **rows}, indent=1))
    if a.out:
        Path(a.out).write_text(json.dumps({"model": a.model, **rows}, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
