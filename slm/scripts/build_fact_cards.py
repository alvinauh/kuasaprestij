"""Build per-topic fact cards from DSKP/textbook chunks, fully locally.

  python scripts/build_fact_cards.py                     # all topics in the exported dataset
  python scripts/build_fact_cards.py --limit 10          # smoke test

1. Embed data/syllabus/chunks.jsonl with a local multilingual embedder (GPU).
2. For each (subject, form, topic): retrieve the best chunks from the same subject (same form first).
3. The local teacher condenses them into a card: facts in BM/EN/ZH, a trilingual key-term glossary,
   formulas and common misconceptions, using only what the sources support.
Output: data/fact_cards.json {"<subject>|<form>|<topic>": card}. Ship it in the content pack; the app
looks the card up by topic and puts card_text(card, lang) into the prompt (no retrieval on the phone).
"""
import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).parent))
from syllabus_cache import canon_subject  # noqa: E402

EMBEDDER = "intfloat/multilingual-e5-base"
# Language subjects get no card: their "facts" would be about the syllabus, not content to check against.
NO_CARD_SUBJECTS = {"English", "Bahasa Melayu", "Bahasa Cina", "English Literature", "Chinese Literature",
                    "Bahasa Iban"}
FRONT_MATTER = re.compile(r"RUKUN NEGARA|FALSAFAH PENDIDIKAN|Bahagian Pembangunan Kurikulum|PENULIS|EDITOR\b|"
                          r"ISBN|Hak Cipta|KATA PENGANTAR|PENDAHULUAN|Kandungan\s*\n|CONTENTS", re.I)
from prompts import CARD_LIMITS, card_text, topic_key  # noqa: E402,F401 (re-exported)


def load_topics(dataset):
    topics = {}
    for line in open(dataset, encoding="utf-8"):
        r = json.loads(line)
        if r["task"] != "generator":
            continue
        meta = dict(l.split(": ", 1) for l in r["messages"][1]["content"].splitlines() if ": " in l)
        subj, form, topic = meta.get("Subject"), meta.get("Form"), meta.get("Topic")
        if subj and topic:
            topics[topic_key(subj, form, topic)] = (subj, form, topic)
    return topics


def embed(model, tok, texts, prefix, bs=64):
    out = []
    for i in range(0, len(texts), bs):
        enc = tok([prefix + t for t in texts[i:i + bs]], max_length=512, truncation=True, padding=True,
                  return_tensors="pt").to("cuda")
        with torch.inference_mode():
            h = model(**enc).last_hidden_state
        m = enc["attention_mask"].unsqueeze(-1).to(h.dtype)
        v = (h * m).sum(1) / m.sum(1)
        out.append(torch.nn.functional.normalize(v.float(), dim=-1).cpu())
    return torch.cat(out)


def retrieve(topics, chunks, k):
    from transformers import AutoModel, AutoTokenizer
    tok = AutoTokenizer.from_pretrained(EMBEDDER)
    model = AutoModel.from_pretrained(EMBEDDER, dtype=torch.float16).to("cuda").eval()
    usable = [c for c in chunks if len(c["content"]) > 300 and not FRONT_MATTER.search(c["content"][:600])]
    cache = Path("data/syllabus/e5_vectors.pt")
    if cache.exists() and torch.load(cache)["n"] == len(usable):
        cv = torch.load(cache)["v"]
    else:
        print(f"embedding {len(usable)} chunks...", flush=True)
        cv = embed(model, tok, [c["content"][:1500] for c in usable], "passage: ")
        torch.save({"n": len(usable), "v": cv}, cache)
    by_subj = defaultdict(list)
    for i, c in enumerate(usable):
        by_subj[c["subject"]].append(i)
    keys = list(topics)
    qv = embed(model, tok, [f"KSSM {topics[k][0]} Form {topics[k][1]}: {topics[k][2]}" for k in keys], "query: ")
    hits = {}
    for key, q in zip(keys, qv):
        subj, form, _ = topics[key]
        cs = canon_subject(subj)
        idx = by_subj.get(cs) or list(range(len(usable)))
        sims = cv[idx] @ q
        # same form and textbook prose first: small bonuses, so a strong other match can still win.
        # DSKP matrix pages list standards ("Murid boleh..."), which say little about the content itself.
        bonus = torch.tensor([(0.03 if str(usable[i]["form"]) == str(form) else 0.0)
                              + (0.03 if usable[i]["kind"] == "textbook_prose" else 0.0) for i in idx])
        top = torch.topk(sims + bonus, min(k, len(idx))).indices.tolist()
        hits[key] = [usable[idx[t]] for t in top]
    del model
    torch.cuda.empty_cache()
    return hits


CARD_PROMPT = """You are preparing a fact card for a Malaysian KSSM/SPM topic, used to ground a small offline tutor.
Subject: {subj}   Form: {form}   Topic: {topic}

Source excerpts from the DSKP and KPM textbooks (may be partly irrelevant or noisy OCR):
{sources}

Write the card using ONLY facts the excerpts support, plus standard KSSM knowledge that is consistent with
them. Never invent numbers, dates or names. Facts must be SUBJECT CONTENT a student must know for this
topic (definitions, laws, processes, formulas with units, key events with dates, causes and effects), never
statements about the curriculum, DSKP, KPM or what students will learn. If the excerpts are not about this
topic's content, return {{"relevant": false}}.
Use standard Malaysian terminology: Bahasa Melayu per DBP (not Indonesian: use "berfikir" not "berpikir",
"memerlukan" not "membutuhkan", "boleh" not "bisa"), Simplified Chinese as used in Malaysian schools.
Keep every item under 160 characters.
Output JSON:
{{"relevant": true,
  "facts": {{"en": ["4-6 key facts"], "bm": ["same facts in BM"], "zh": ["same facts in Chinese"]}},
  "formulas": ["0-4 formulas with units, if the topic has any"],
  "terms": [{{"en": "...", "bm": "...", "zh": "..."}}],
  "misconceptions": {{"en": ["1-3 common student misconceptions"], "bm": ["..."], "zh": ["..."]}}}}"""


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--dataset", default="data/skor_slm_dataset.jsonl")
    p.add_argument("--chunks", default="data/syllabus/chunks.jsonl")
    p.add_argument("--out", default="data/fact_cards.json")
    p.add_argument("--teacher", default="unsloth/Qwen3-8B-unsloth-bnb-4bit")
    p.add_argument("--k", type=int, default=6)
    p.add_argument("--limit", type=int, default=0)
    p.add_argument("--batch", type=int, default=12)
    a = p.parse_args()

    topics = {k: v for k, v in load_topics(a.dataset).items() if canon_subject(v[0]) not in NO_CARD_SUBJECTS}
    if a.limit:
        topics = dict(list(topics.items())[:a.limit])
    out = Path(a.out)
    cards = json.loads(out.read_text(encoding="utf-8")) if out.exists() else {}
    todo = {k: v for k, v in topics.items() if k not in cards}
    print(f"{len(topics)} topics, {len(cards)} cards exist, {len(todo)} to build", flush=True)
    if not todo:
        return
    chunks = [json.loads(l) for l in open(a.chunks, encoding="utf-8")]
    hits = retrieve(todo, chunks, a.k)

    from distill_local import Teacher, extract_json
    teacher = Teacher(a.teacher, a.batch)
    keys = list(todo)
    built = irrelevant = 0
    for b in range(0, len(keys), a.batch):
        batch = keys[b:b + a.batch]
        prompts = []
        for key in batch:
            subj, form, topic = todo[key]
            src = "\n\n".join(f"[{i + 1}] ({c['kind']}, Form {c['form']}) {re.sub(r'\s+', ' ', c['content'])[:700]}"
                              for i, c in enumerate(hits[key]))
            prompts.append(CARD_PROMPT.format(subj=subj, form=form, topic=topic, sources=src))
        for key, text in zip(batch, teacher.generate(prompts, 1400)):
            card = extract_json(text)
            if not card or not card.get("relevant"):
                cards[key] = None
                irrelevant += 1
                continue
            facts = card.get("facts") or {}
            if not all(isinstance(facts.get(l), list) and facts[l] for l in ("en", "bm", "zh")):
                continue  # malformed; retried on the next run
            cards[key] = {"facts": {l: [str(f) for f in facts[l]][:CARD_LIMITS["facts"]] for l in ("en", "bm", "zh")},
                          "formulas": [str(f) for f in card.get("formulas") or []][:CARD_LIMITS["formulas"]],
                          "terms": [t for t in card.get("terms") or [] if isinstance(t, dict)][:CARD_LIMITS["terms"]],
                          "misconceptions": {l: [str(m) for m in (card.get("misconceptions") or {}).get(l) or []]
                                             [:CARD_LIMITS["misconceptions"]] for l in ("en", "bm", "zh")},
                          "sources": [c["id"] for c in hits[key]]}
            built += 1
        out.write_text(json.dumps(cards, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"   cards: {b + len(batch)}/{len(keys)}  built {built}  no-source {irrelevant}", flush=True)
    have = sum(1 for k in topics if cards.get(k))
    print(f"\n{have}/{len(topics)} topics have a card ({100 * have / len(topics):.0f}%)")


if __name__ == "__main__":
    main()
