"""Field-test the offline SLM and measure essay grading quality.

  python scripts/field_test.py pack --out-dir field_test    # run held-out + fresh essays, write the pack
  python scripts/field_test.py real                         # compare with Skor's cloud outputs (local only)
  python scripts/field_test.py essays --grades field_test/grades   # SLM vs examiner-agent essay grades

The pack contains only synthetic and curriculum items. Real event_logs rows (student work) are
never written to the pack; `real` prints aggregate numbers only.
"""
import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from ask_skor import SLM  # noqa: E402
from export_supabase_training_data import detect_lang  # noqa: E402
from prompts import user_prompt  # noqa: E402

BANDS = "ABCD"


def load(path):
    return [json.loads(l) for l in open(path, encoding="utf-8") if l.strip()]


def real_users(dataset):
    return {r["messages"][1]["content"] for r in load(dataset) if r["task"] == "evaluator"}


def essay_metrics(pairs):
    """pairs: dicts with lang, ref_band, ref_score, pred_band, pred_score."""
    def summary(ps):
        n = len(ps)
        if not n:
            return {}
        exact = sum(p["ref_band"] == p["pred_band"] for p in ps)
        adj = sum(abs(BANDS.index(p["ref_band"]) - BANDS.index(p["pred_band"])) <= 1 for p in ps)
        mae = sum(abs(p["ref_score"] - p["pred_score"]) for p in ps) / n
        majority = Counter(p["ref_band"] for p in ps).most_common(1)[0][1]
        conf = {rb: {pb: sum(p["ref_band"] == rb and p["pred_band"] == pb for p in ps) for pb in BANDS}
                for rb in BANDS}
        return {"n": n, "band_exact%": round(100 * exact / n), "band_within1%": round(100 * adj / n),
                "score_MAE": round(mae, 1), "majority_baseline%": round(100 * majority / n),
                "pred_band_dist": dict(Counter(p["pred_band"] for p in ps)), "confusion_ref_x_pred": conf}
    out = {"all": summary(pairs)}
    for lang in ("bm", "en", "zh"):
        out[lang] = summary([p for p in pairs if p["lang"] == lang])
    return out


def print_essay(title, m):
    print(f"\n{title}")
    print(f"  {'lang':4s} {'n':>3s} {'exact%':>7s} {'±1band%':>8s} {'MAE':>5s} {'baseline%':>9s}  predicted bands")
    for k in ("all", "bm", "en", "zh"):
        s = m.get(k) or {}
        if s:
            print(f"  {k:4s} {s['n']:3d} {s['band_exact%']:7d} {s['band_within1%']:8d} {s['score_MAE']:5.1f} "
                  f"{s['majority_baseline%']:9d}  {s['pred_band_dist']}")


def cmd_pack(a):
    out = Path(a.out_dir)
    (out / "pack").mkdir(parents=True, exist_ok=True)
    slm = SLM(threads=a.threads)
    hide = real_users(a.dataset)
    items, n_by = [], Counter()

    for r in load(a.eval):
        user = r["messages"][1]["content"]
        if user in hide:
            continue  # real student row: never leaves this machine
        task, lang = r["task"], r["lang"]
        n_by[(task, lang)] += 1
        res = slm.run_messages(task, r["messages"][:-1])  # keeps tutor chat history
        items.append({"id": f"{task}-{lang}-{n_by[(task, lang)]}", "task": task, "lang": lang,
                      "input": user if len(r["messages"]) <= 3 else r["messages"][1:-1],
                      "slm_output": res["output"] if res["schema_ok"] else res["raw"],
                      "schema_ok": res["schema_ok"], "seconds": res["seconds"],
                      "reference": json.loads(r["messages"][2]["content"]), "source": "held-out eval split"})
        print(f"  {items[-1]['id']}: ok={res['schema_ok']} {res['seconds']}s", flush=True)

    pairs, blind = [], defaultdict(list)
    for e in load(a.essays):
        ess = e["essay"]
        req = {"title": ess["title"], "essay": ess["essay"], "lang": e["lang"]}
        p1 = slm.run("essay_pass1", user_prompt("essay_pass1", req))
        p2 = slm.run("essay_pass2", user_prompt("essay_pass2", req))
        eid = f"essaytest-{e['id']}"
        items.append({"id": eid, "task": "essay", "lang": e["lang"], "input": req,
                      "slm_output": {"pass1": p1["output"], "pass2": p2["output"]},
                      "schema_ok": p1["schema_ok"] and p2["schema_ok"], "seconds": p1["seconds"] + p2["seconds"],
                      "reference": {"intended_band": ess["band"], "label": e["pass1"], "teacher_pass2": e["pass2"]},
                      "source": "fresh essay test set (not in training)"})
        blind[e["lang"]].append({"id": eid, "title": ess["title"], "essay": ess["essay"]})
        if p1["schema_ok"]:
            pairs.append({"id": eid, "lang": e["lang"], "ref_band": e["pass1"]["band"],
                          "ref_score": e["pass1"]["score"], "pred_band": p1["output"]["band"],
                          "pred_score": p1["output"]["score"]})
        print(f"  {eid}: ref {e['pass1']['band']} pred {p1['output'] if p1['schema_ok'] else 'INVALID'}", flush=True)

    for lang in ("bm", "en", "zh"):
        with open(out / "pack" / f"{lang}.jsonl", "w", encoding="utf-8") as f:
            for it in items:
                if it["lang"] == lang:
                    f.write(json.dumps(it, ensure_ascii=False) + "\n")
        (out / "pack" / f"essays_blind_{lang}.json").write_text(
            json.dumps(blind[lang], ensure_ascii=False, indent=1), encoding="utf-8")
    (out / "slm_essay_preds.json").write_text(json.dumps(pairs, indent=1), encoding="utf-8")

    stats = defaultdict(lambda: [0, 0, 0.0])
    for it in items:
        s = stats[(it["task"], it["lang"])]
        s[0] += 1
        s[1] += it["schema_ok"]
        s[2] += it["seconds"]
    print(f"\n{'task':12s} {'lang':4s} {'n':>4s} {'schema%':>8s} {'avg s':>6s}")
    for (t, l), (n, ok, secs) in sorted(stats.items()):
        print(f"{t:12s} {l:4s} {n:4d} {100 * ok / n:8.0f} {secs / n:6.1f}")
    m = essay_metrics(pairs)
    (out / "metrics_essay_vs_labels.json").write_text(json.dumps(m, indent=1), encoding="utf-8")
    print_essay("Essay pass 1 vs intended band (fresh test set)", m)


def cmd_real(a):
    """SLM vs Skor's cloud evaluator (Gemini) on real event_logs rows. Aggregates only."""
    slm = SLM(threads=a.threads)
    rows = [r for r in load(a.dataset) if r["task"] == "evaluator"]
    held_out = {r["messages"][1]["content"] for r in load(a.eval)}
    agg = defaultdict(Counter)
    for r in rows:
        user = r["messages"][1]["content"]
        ref = json.loads(r["messages"][2]["content"])
        res = slm.run("evaluator", user)
        split = "held_out" if user in held_out else "seen_in_training"
        c = agg[split]
        c["n"] += 1
        c["schema_ok"] += res["schema_ok"]
        if res["schema_ok"]:
            o = res["output"]
            c["same_error_category"] += o["teacher_insight"]["error_category"] == ref["teacher_insight"]["error_category"]
            c["in_skor_category_set"] += o["teacher_insight"]["error_category"] in (
                "Conceptual Gap", "Careless Error", "Language Barrier")
            c["feedback_lang_matches"] += detect_lang(o["student_feedback"]) == r["lang"]
            c["slm_feedback_chars"] += len(o["student_feedback"])
            c["cloud_feedback_chars"] += len(ref["student_feedback"])
        c["seconds_x10"] += int(res["seconds"] * 10)
    result = {}
    for split, c in agg.items():
        n, ok = c["n"], max(c["schema_ok"], 1)
        result[split] = {"n": n, "schema%": round(100 * c["schema_ok"] / n),
                         "same_error_category_as_cloud%": round(100 * c["same_error_category"] / ok),
                         "category_in_skor_enum%": round(100 * c["in_skor_category_set"] / ok),
                         "feedback_language_matches%": round(100 * c["feedback_lang_matches"] / ok),
                         "avg_feedback_chars_slm": c["slm_feedback_chars"] // ok,
                         "avg_feedback_chars_cloud": c["cloud_feedback_chars"] // ok,
                         "avg_seconds": round(c["seconds_x10"] / 10 / n, 1)}
    print(json.dumps(result, indent=1))
    Path(a.out_dir).mkdir(parents=True, exist_ok=True)
    (Path(a.out_dir) / "real_vs_cloud.json").write_text(json.dumps(result, indent=1), encoding="utf-8")


def cmd_essays(a):
    """Compare SLM and intended labels against examiner-agent blind grades."""
    out = Path(a.out_dir)
    preds = {p["id"]: p for p in json.loads((out / "slm_essay_preds.json").read_text(encoding="utf-8"))}
    grades = {}
    for f in Path(a.grades).glob("*.json"):
        for g in json.loads(f.read_text(encoding="utf-8")):
            grades[g["id"]] = g
    slm_vs, lab_vs = [], []
    for gid, g in grades.items():
        p = preds.get(gid)
        if not p or g.get("band") not in BANDS:
            continue
        ref = {"lang": p["lang"], "ref_band": g["band"], "ref_score": int(g["score"])}
        slm_vs.append({**ref, "pred_band": p["pred_band"], "pred_score": p["pred_score"]})
        lab_vs.append({**ref, "pred_band": p["ref_band"], "pred_score": p["ref_score"]})
    m = {"slm_vs_examiners": essay_metrics(slm_vs), "training_labels_vs_examiners": essay_metrics(lab_vs)}
    (out / "metrics_essay_vs_examiners.json").write_text(json.dumps(m, indent=1), encoding="utf-8")
    print_essay("SLM band vs examiner agents", m["slm_vs_examiners"])
    print_essay("Training labels (intended band) vs examiner agents", m["training_labels_vs_examiners"])


def main():
    p = argparse.ArgumentParser()
    p.add_argument("mode", choices=["pack", "real", "essays"])
    p.add_argument("--out-dir", default="field_test")
    p.add_argument("--eval", default="data/skor_slm_eval.jsonl")
    p.add_argument("--dataset", default="data/skor_slm_dataset.jsonl")
    p.add_argument("--essays", default="data/essay_test/essay_grade.jsonl")
    p.add_argument("--grades", default="field_test/grades")
    p.add_argument("--threads", type=int, default=8)
    a = p.parse_args()
    {"pack": cmd_pack, "real": cmd_real, "essays": cmd_essays}[a.mode](a)


if __name__ == "__main__":
    main()
