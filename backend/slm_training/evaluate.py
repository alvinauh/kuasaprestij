"""Gate: compare a candidate against the stock base on the held-out eval split.
Writes eval.json {passed, ...}. publish_offline_model.py on the VPS refuses a model with passed=false.
  json_valid_rate : share of MCQ generations the PWA's extractJson() accepts (4 options, key letter A-D)
  eval_loss       : mean loss on the held-out assistant replies (mcq + hint)
Pass = json_valid >= 0.90 and >= base, and eval_loss < base."""
import argparse, json, math, os
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from common import BASE, load_jsonl, prompt_text, full_text, extract_json

ap = argparse.ArgumentParser()
ap.add_argument("--data", required=True)
ap.add_argument("--model", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--n_gen", type=int, default=60)
a = ap.parse_args()
dev = "cuda" if torch.cuda.is_available() else "cpu"
rows = load_jsonl(os.path.join(a.data, "eval.jsonl"))
tok = AutoTokenizer.from_pretrained(BASE)


def score(path):
    m = AutoModelForCausalLM.from_pretrained(path, torch_dtype=torch.float32).to(dev).eval()
    losses = []
    for r in rows:
        p = len(tok(prompt_text(r["messages"]), add_special_tokens=False)["input_ids"])
        ids = tok(full_text(r["messages"]), add_special_tokens=False, return_tensors="pt", truncation=True, max_length=768)["input_ids"].to(dev)
        lab = ids.clone(); lab[:, :p] = -100
        with torch.no_grad():
            losses.append(m(input_ids=ids, labels=lab).loss.item())
    valid = tried = 0
    for r in [x for x in rows if x["task"] == "mcq"][: a.n_gen]:
        ids = tok(prompt_text(r["messages"]), add_special_tokens=False, return_tensors="pt")["input_ids"].to(dev)
        with torch.no_grad():
            out = m.generate(ids, max_new_tokens=300, do_sample=False, repetition_penalty=1.1)
        o = extract_json(tok.decode(out[0][ids.shape[1]:], skip_special_tokens=True))
        tried += 1
        valid += bool(o and len(o["options"]) == 4 and o["correct_answer"].strip()[:1] in "ABCD")
    del m
    return {"eval_loss": sum(losses) / len(losses), "json_valid_rate": valid / max(1, tried), "n_gen": tried}


base, cand = score(BASE), score(a.model)
res = {"base": base, "candidate": cand, "eval_examples": len(rows),
       "passed": bool(cand["json_valid_rate"] >= 0.90 and cand["json_valid_rate"] >= base["json_valid_rate"]
                      and cand["eval_loss"] < base["eval_loss"] and math.isfinite(cand["eval_loss"]))}
json.dump(res, open(a.out, "w"), indent=2)
print(json.dumps(res, indent=2))
