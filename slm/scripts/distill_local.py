"""Local distillation: a bigger model on this GPU writes the training rows Supabase lacks.

No external API. The teacher (default Qwen3-8B, 4-bit) runs on the RTX 5070; the only network
use is the one-time model download from Hugging Face.

Seeds are the curriculum MCQs already exported to data/skor_slm_dataset.jsonl (generator rows).
event_logs content is never shown to the teacher.

  python scripts/distill_local.py                 # full run (resumable)
  python scripts/distill_local.py --scale 0.02    # smoke test: ~2% of the targets

Stages (each appends to data/distill/<stage>.jsonl and skips ids already done):
  gen_zh       translate EN/BM MCQs to Mandarin            -> generator/zh rows + ZH seeds
  evaluator    wrong MCQ choice or flawed short answer      -> evaluator rows
  tutor        student message + SEDA hint                  -> tutor rows
  essay_write  student essay at a target band               -> (input for essay_grade)
  essay_grade  blind grade (filter) + strengths/improvements -> essay_pass1 + essay_pass2 rows
Then writes data/skor_slm_distill.jsonl and data/skor_slm_train.jsonl (export + distill).
"""
import argparse
import json
import random
import re
import sys
import time
from collections import Counter
from pathlib import Path

import torch
from pydantic import ValidationError
from transformers import AutoModelForCausalLM, AutoTokenizer

sys.path.insert(0, str(Path(__file__).parent))
from schemas import SCHEMAS  # noqa: E402
from export_supabase_training_data import detect_lang, row  # noqa: E402
from prompts import SYSTEM  # noqa: E402

# Per-language targets at --scale 1. ZH is ~20%+ of every task (CLAUDE.md section 4).
TARGETS = {
    "gen_zh": {"zh": 220},
    "evaluator": {"bm": 200, "en": 250, "zh": 150},
    "tutor": {"bm": 210, "en": 240, "zh": 150},
    "essay_write": {"bm": 110, "en": 110, "zh": 80},
}
MAX_NEW = {"gen_zh": 900, "evaluator": 450, "tutor": 350, "essay_write": 900, "essay_grade": 600}

LANG_NAME = {"bm": "Bahasa Melayu", "en": "English", "zh": "Simplified Chinese (Malaysian 华文 usage)"}
ERROR_CATEGORIES = ["Conceptual Gap", "Careless Error", "Insufficient Depth", "Incomplete Answer",
                    "Misconception", "Language Barrier"]
SEDA_MOVES = ["invite_reasoning", "explain_reasoning", "build_on_ideas"]
BANDS = {"A": (80, 100), "B": (65, 79), "C": (50, 64), "D": (0, 49)}
BAND_DESC = {
    "A": "excellent: clear thesis, well-developed points with examples, varied vocabulary, almost no errors",
    "B": "good: relevant points with some development, mostly accurate language, a few errors",
    "C": "satisfactory: basic points, thin elaboration, repetitive vocabulary, noticeable errors",
    "D": "weak: off-topic or very short ideas, poor organisation, frequent grammar errors",
}
ESSAY_THEMES = [
    "the impact of social media on teenagers", "protecting the environment in my town",
    "the importance of reading", "a memorable school event", "online learning versus classroom learning",
    "the role of family in a teenager's life", "healthy lifestyle among students",
    "the benefits of learning a third language", "volunteering in the community",
    "technology and the future of jobs", "road safety among young people",
    "the value of Malaysia's cultural diversity", "managing time during examinations",
    "the dangers of cyberbullying", "my ambition and how I plan to achieve it",
    "saving water and electricity at home", "the importance of sports in school",
    "a visit to a historical place", "food waste in Malaysia", "friendship and loyalty",
]

TEACHER_SYSTEM = ("You are an expert Malaysian secondary-school teacher and examiner (KSSM/SPM) who writes "
                  "high-quality training data. Always reply with one valid JSON object and nothing else.")


# ---------------------------------------------------------------- seeds
def parse_user(text):
    out = {}
    for line in text.splitlines():
        if ": " in line:
            k, v = line.split(": ", 1)
            out[k.strip()] = v.strip()
    return out


def load_seeds(path):
    seeds = []
    for line in open(path, encoding="utf-8"):
        r = json.loads(line)
        if r["task"] != "generator":
            continue
        meta = parse_user(r["messages"][1]["content"])
        seeds.append({"lang": r["lang"], "subject": meta.get("Subject"), "form": meta.get("Form"),
                      "topic": meta.get("Topic"), "kbat": meta.get("KBAT level"),
                      "mcq": json.loads(r["messages"][2]["content"])})
    return seeds


# ---------------------------------------------------------------- teacher
class Teacher:
    def __init__(self, name, batch):
        self.tok = AutoTokenizer.from_pretrained(name)
        self.tok.padding_side = "left"
        if self.tok.pad_token is None:
            self.tok.pad_token = self.tok.eos_token
        self.model = AutoModelForCausalLM.from_pretrained(name, device_map="cuda:0", dtype=torch.bfloat16)
        self.model.eval()
        self.batch = batch

    def generate(self, prompts, max_new):
        texts = [self.tok.apply_chat_template(
            [{"role": "system", "content": TEACHER_SYSTEM}, {"role": "user", "content": p}],
            tokenize=False, add_generation_prompt=True, enable_thinking=False) for p in prompts]
        enc = self.tok(texts, return_tensors="pt", padding=True).to("cuda:0")
        with torch.inference_mode():
            out = self.model.generate(**enc, max_new_tokens=max_new, do_sample=True, temperature=0.7,
                                      top_p=0.8, top_k=20, pad_token_id=self.tok.pad_token_id)
        return self.tok.batch_decode(out[:, enc["input_ids"].shape[1]:], skip_special_tokens=True)


def extract_json(text):
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S)
    a, b = text.find("{"), text.rfind("}")
    if a < 0 or b <= a:
        return None
    try:
        return json.loads(text[a:b + 1])
    except json.JSONDecodeError:
        return None


def lang_ok(lang, *texts):
    return detect_lang(*[t for t in texts if isinstance(t, str)]) == lang


# ---------------------------------------------------------------- job builders
def mcq_block(s):
    m = s["mcq"]
    opts = "\n".join(f"{'ABCD'[i]}. {o}" for i, o in enumerate(m["options"]))
    return (f"Subject: {s['subject']} (Form {s['form']}), topic: {s['topic']}\n"
            f"Stimulus: {m.get('stimulus') or '-'}\nQuestion: {m['question']}\n{opts}\n"
            f"Correct answer: {'ABCD'[m['answer_index']]}. {m['options'][m['answer_index']]}")


def jobs_gen_zh(seeds, n, rng):
    pool = [s for s in seeds if s["lang"] in ("en", "bm")]
    for i, s in enumerate(rng.sample(pool, min(n, len(pool)))):
        prompt = ("Translate this multiple-choice question JSON into Simplified Chinese as used in Malaysian "
                  "Chinese-medium schools. Translate every string value (question, options, "
                  "distractor_rationale, stimulus, object_lesson); keep the keys, the option order and "
                  "answer_index unchanged. Output the translated JSON only.\n\n"
                  + json.dumps(s["mcq"], ensure_ascii=False))
        yield {"id": f"gen_zh-{i}", "lang": "zh", "seed": s, "prompt": prompt}


def jobs_evaluator(seeds_by_lang, targets, rng):
    for lang, n in targets.items():
        pool = seeds_by_lang.get(lang, [])
        for i in range(n if pool else 0):
            s = rng.choice(pool)
            cat = rng.choice(ERROR_CATEGORIES)
            short = rng.random() < 0.35
            m = s["mcq"]
            if short:
                task = (f"A Form {s['form']} student answered this question in their own words (no options "
                        f"shown) and made a mistake of type \"{cat}\". Invent that short written answer "
                        f"(1-3 sentences), then evaluate it.")
                keys = '"student_answer": "...", '
            else:
                wrong = rng.choice([j for j in range(4) if j != m["answer_index"]])
                task = (f"The student chose {'ABCD'[wrong]}. {m['options'][wrong]} (wrong). "
                        f"Their error type is \"{cat}\". Evaluate it.")
                keys = ""
            prompt = (f"{mcq_block(s)}\n\n{task}\n\nWrite everything in {LANG_NAME[lang]} except error_category, "
                      f"which must be exactly \"{cat}\". student_feedback: 2-3 encouraging sentences to the "
                      f"student explaining the mistake. root_cause_analysis: 1-2 sentences for the teacher on "
                      f"why the student made it. actionable_intervention: one concrete classroom action.\n"
                      f"Output JSON: {{{keys}\"student_feedback\": \"...\", \"teacher_insight\": "
                      f"{{\"error_category\": \"{cat}\", \"root_cause_analysis\": \"...\", "
                      f"\"actionable_intervention\": \"...\"}}}}")
            yield {"id": f"evaluator-{lang}-{i}", "lang": lang, "seed": s, "short": short,
                   "wrong": None if short else wrong, "prompt": prompt}


def jobs_tutor(seeds_by_lang, targets, rng):
    for lang, n in targets.items():
        pool = seeds_by_lang.get(lang, [])
        for i in range(n if pool else 0):
            s = rng.choice(pool)
            move = SEDA_MOVES[i % 3]
            prompt = (f"{mcq_block(s)}\n\nWrite one turn of a tutoring chat in {LANG_NAME[lang]}.\n"
                      f"student_message: what a Form {s['form']} student types to the tutor about this question "
                      f"- a guess with shaky reasoning, a confusion, or a request for help (1-2 sentences).\n"
                      f"reply: the tutor's reply using the SEDA move \"{move}\" "
                      f"(invite_reasoning = ask them to explain their thinking; explain_reasoning = give a short "
                      f"reasoning hint; build_on_ideas = build on what they said). 1-3 sentences, never reveal the "
                      f"correct option, and end with an open question.\n"
                      f"Output JSON: {{\"student_message\": \"...\", \"seda_move\": \"{move}\", \"reply\": \"...\"}}")
            yield {"id": f"tutor-{lang}-{i}", "lang": lang, "seed": s, "move": move, "prompt": prompt}


def jobs_essay_write(targets, rng):
    for lang, n in targets.items():
        for i in range(n):
            band = "ABCD"[i % 4]
            theme = rng.choice(ESSAY_THEMES)
            length = "300-450 Chinese characters" if lang == "zh" else "180-280 words"
            prompt = (f"Write an essay by a Malaysian Form 4/5 student in {LANG_NAME[lang]} on: {theme}. "
                      f"Give it a title in the same language. Length: {length}. The writing must genuinely be "
                      f"SPM band {band} quality ({BAND_DESC[band]}), including the kind of mistakes such a "
                      f"student makes. Output JSON: {{\"title\": \"...\", \"essay\": \"...\"}}")
            yield {"id": f"essay-{lang}-{i}", "lang": lang, "band": band, "prompt": prompt}


def jobs_essay_grade(essays):
    for e in essays:
        prompt = (f"Grade this SPM essay strictly and fairly. Bands: A 80-100, B 65-79, C 50-64, D 0-49.\n\n"
                  f"Title: {e['title']}\n\n{e['essay']}\n\n"
                  f"Give 2-4 specific strengths and 2-4 specific, actionable improvements, each under 200 "
                  f"characters, written in the essay's language. Output JSON: {{\"band\": \"A|B|C|D\", "
                  f"\"score\": 0-100, \"strengths\": [\"...\"], \"improvements\": [\"...\"]}}")
        yield {"id": e["id"], "lang": e["lang"], "essay": e, "prompt": prompt}


# ---------------------------------------------------------------- output checks -> stored records
def check(stage, job, out):
    lang = job["lang"]
    if out is None:
        return None
    if stage == "gen_zh":
        try:
            m = SCHEMAS["generator"].model_validate(out).model_dump()
        except ValidationError:
            return None
        if m["answer_index"] != job["seed"]["mcq"]["answer_index"] or not lang_ok("zh", m["question"]):
            return None
        return {"mcq": m}
    if stage == "evaluator":
        target = {"student_feedback": out.get("student_feedback"), "teacher_insight": out.get("teacher_insight")}
        try:
            target = SCHEMAS["evaluator"].model_validate(target).model_dump()
        except ValidationError:
            return None
        sa = out.get("student_answer") if job["short"] else None
        if job["short"] and not (isinstance(sa, str) and sa.strip()):
            return None
        if not lang_ok(lang, target["student_feedback"], target["teacher_insight"]["root_cause_analysis"]):
            return None
        return {"target": target, "student_answer": sa}
    if stage == "tutor":
        msg, target = out.get("student_message"), {"seda_move": job["move"], "reply": out.get("reply")}
        try:
            target = SCHEMAS["tutor"].model_validate(target).model_dump()
        except ValidationError:
            return None
        reply = target["reply"].strip()
        if not (isinstance(msg, str) and msg.strip()) or not reply.endswith(("?", "？")):
            return None
        if not lang_ok(lang, msg, reply):
            return None
        return {"student_message": msg.strip(), "target": target}
    if stage == "essay_write":
        title, essay = out.get("title"), out.get("essay")
        if not (isinstance(title, str) and isinstance(essay, str)) or len(essay) < 150:
            return None
        if not lang_ok(lang, essay):
            return None
        return {"title": title.strip(), "essay": essay.strip()}
    if stage == "essay_grade":
        try:
            score = int(out.get("score"))
        except (TypeError, ValueError):
            return None
        # The teacher's blind scores cluster around B 72-75, so they would teach "always B".
        # The label is the band the essay was written to; the blind grade only filters out
        # essays that missed it by more than one band.
        graded = next(b for b, (lo, hi) in BANDS.items() if lo <= max(0, min(100, score)) <= hi)
        band = job["essay"]["band"]
        if abs("ABCD".index(graded) - "ABCD".index(band)) > 1:
            return None
        score = random.Random(job["id"]).randint(*BANDS[band])
        p2 = {"strengths": [s.strip()[:400] for s in out.get("strengths") or [] if isinstance(s, str) and s.strip()][:5],
              "improvements": [s.strip()[:400] for s in out.get("improvements") or [] if isinstance(s, str) and s.strip()][:5]}
        try:
            SCHEMAS["essay_pass2"].model_validate(p2)
        except ValidationError:
            return None
        if not lang_ok(lang, " ".join(p2["strengths"] + p2["improvements"])):
            return None
        return {"pass1": {"band": band, "score": score}, "pass2": p2}
    raise ValueError(stage)


# ---------------------------------------------------------------- runner
def run_stage(teacher, stage, jobs, out_dir, check_fn=None, max_new=None):
    check_fn = check_fn or check
    max_new = max_new or MAX_NEW[stage]
    path = out_dir / f"{stage}.jsonl"
    done = {json.loads(l)["id"] for l in open(path, encoding="utf-8")} if path.exists() else set()
    todo = [j for j in jobs if j["id"] not in done]
    print(f"== {stage}: {len(done)} done, {len(todo)} to generate", flush=True)
    todo.sort(key=lambda j: len(j["prompt"]))  # similar lengths per batch -> less padding
    kept = tried = 0
    t0 = time.time()
    with open(path, "a", encoding="utf-8") as f:
        for b in range(0, len(todo), teacher.batch):
            batch = todo[b:b + teacher.batch]
            outs = teacher.generate([j["prompt"] for j in batch], max_new)
            for j, text in zip(batch, outs):
                tried += 1
                rec = check_fn(stage, j, extract_json(text))
                if rec is not None:
                    kept += 1
                    rec = {"id": j["id"], **{k: v for k, v in j.items() if k not in ("prompt",)}, **rec}
                    f.write(json.dumps(rec, ensure_ascii=False) + "\n")
                    f.flush()
            rate = tried / (time.time() - t0)
            print(f"   {stage}: {b + len(batch)}/{len(todo)}  kept {kept}/{tried}  "
                  f"{rate * 60:.0f}/min", flush=True)
    return [json.loads(l) for l in open(path, encoding="utf-8")]


def build_examples(recs):
    ex = []
    for r in recs["gen_zh"]:
        s = r["seed"]
        user = (f"Subject: {s['subject']}\nForm: {s['form']}\nTopic: {s['topic']}\n"
                f"KBAT level: {s['kbat'] or 'Apply'}\nLanguage: zh\nGenerate one KBAT MCQ.")
        ex.append(row("generator", "zh", SYSTEM["generator"], user, r["mcq"]))
    for r in recs["evaluator"]:
        s, m = r["seed"], r["seed"]["mcq"]
        user = f"Subject: {s['subject'] or '-'}\nQuestion: {m['question']}\n"
        if r["short"]:
            user += f"Correct answer: {m['options'][m['answer_index']]}\nStudent answer: {r['student_answer']}"
        else:
            user += ("Options: " + " | ".join(m["options"]) + "\n"
                     f"Correct answer: {m['options'][m['answer_index']]}\n"
                     f"Student answer: {m['options'][r['wrong']]}")
        ex.append(row("evaluator", r["lang"], SYSTEM["evaluator"], user, r["target"]))
    for r in recs["tutor"]:
        s, m = r["seed"], r["seed"]["mcq"]
        user = (f"Subject: {s['subject']}\nTopic: {s['topic']}\nQuestion: {m['question']}\n"
                "Options: " + " | ".join(m["options"]) + f"\nStudent: {r['student_message']}")
        ex.append(row("tutor", r["lang"], SYSTEM["tutor"], user, r["target"]))
    for r in recs["essay_grade"]:
        e = r["essay"]
        user = f"Essay title: {e['title']}\nLanguage: {r['lang']}\nEssay:\n{e['essay']}"
        ex.append(row("essay_pass1", r["lang"], SYSTEM["essay_pass1"], user, r["pass1"]))
        ex.append(row("essay_pass2", r["lang"], SYSTEM["essay_pass2"], user, r["pass2"]))
    return ex


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--teacher", default="unsloth/Qwen3-8B-unsloth-bnb-4bit")
    p.add_argument("--seeds", default="data/skor_slm_dataset.jsonl")
    p.add_argument("--out-dir", default="data/distill")
    p.add_argument("--out", default="data/skor_slm_distill.jsonl")
    p.add_argument("--train-out", default="data/skor_slm_train.jsonl")
    p.add_argument("--scale", type=float, default=1.0)
    p.add_argument("--batch", type=int, default=24)
    p.add_argument("--seed", type=int, default=3407)
    p.add_argument("--essays-only", action="store_true",
                   help="only write + grade essays (fresh test sets); skips the dataset files")
    args = p.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    tg = {st: {l: max(1, round(n * args.scale)) for l, n in d.items()} for st, d in TARGETS.items()}
    rng = random.Random(args.seed)
    seeds = load_seeds(args.seeds)
    print(f"seeds: {dict(Counter(s['lang'] for s in seeds))}; teacher {args.teacher}", flush=True)

    teacher = Teacher(args.teacher, args.batch)
    if args.essays_only:
        essays = run_stage(teacher, "essay_write", list(jobs_essay_write(tg["essay_write"], rng)), out_dir)
        run_stage(teacher, "essay_grade", list(jobs_essay_grade(essays)), out_dir)
        return
    recs = {}
    recs["gen_zh"] = run_stage(teacher, "gen_zh", list(jobs_gen_zh(seeds, tg["gen_zh"]["zh"], rng)), out_dir)

    by_lang = {}
    for s in seeds:
        by_lang.setdefault(s["lang"], []).append(s)
    by_lang["zh"] = by_lang.get("zh", []) + [{**r["seed"], "lang": "zh", "mcq": r["mcq"]} for r in recs["gen_zh"]]

    recs["evaluator"] = run_stage(teacher, "evaluator", list(jobs_evaluator(by_lang, tg["evaluator"], rng)), out_dir)
    recs["tutor"] = run_stage(teacher, "tutor", list(jobs_tutor(by_lang, tg["tutor"], rng)), out_dir)
    essays = run_stage(teacher, "essay_write", list(jobs_essay_write(tg["essay_write"], rng)), out_dir)
    recs["essay_grade"] = run_stage(teacher, "essay_grade", list(jobs_essay_grade(essays)), out_dir)

    examples = build_examples(recs)
    with open(args.out, "w", encoding="utf-8") as f:
        for e in examples:
            f.write(json.dumps(e, ensure_ascii=False) + "\n")
    base = [l for l in open(args.seeds, encoding="utf-8") if l.strip()]
    with open(args.train_out, "w", encoding="utf-8") as f:
        f.writelines(base)
        for e in examples:
            f.write(json.dumps(e, ensure_ascii=False) + "\n")

    print(f"\nwrote {len(examples)} distilled examples to {args.out}; "
          f"{len(base) + len(examples)} total in {args.train_out}")
    allrows = [json.loads(l) for l in open(args.train_out, encoding="utf-8")]
    counts = Counter((r["task"], r["lang"]) for r in allrows)
    for task in sorted({t for t, _ in counts}):
        n = {l: counts.get((task, l), 0) for l in ("bm", "en", "zh")}
        tot = sum(n.values())
        print(f"  {task:12s} bm {n['bm']:4d}  en {n['en']:4d}  zh {n['zh']:4d}  ({100 * n['zh'] / tot:.0f}% zh)")


if __name__ == "__main__":
    main()
