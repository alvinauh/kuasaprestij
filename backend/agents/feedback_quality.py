"""
Feedback Quality audit — measures the *dialogic richness* of the teacher-facing
intervention notes the system generates (event_logs.intervention).

Each note is segmented into utterances and every utterance is classified by the
teaching move it performs (invites reasoning, makes a step explicit, guides
direction, …). The output is a distribution across those move-types plus a
coded sample — a design instrument that shows which moves the generated notes
over- or under-produce, so prompt templates can be tuned.

Provenance: the eight move-types are the clusters of the Scheme for Educational
Dialogue Analysis (Hennessy et al., 2016), relabelled in plain language. Kept
generic in all user-facing surfaces — this module is the only place the mapping
lives.

Runs as an on-demand / scheduled admin job (never in the answer hot path):
many short LLM classifications over a corpus, result cached in
`feedback_quality_audit`.
"""

import json
import re
import uuid as _uuid

from agents.llm_client import call_llm
from schemas.assessment import _extract_json_payload

# Move-types (code → plain label + what it looks like in an intervention note).
CATEGORIES: list[dict] = [
    {"code": "invite_reasoning",   "label": "Invites Reasoning",        "desc": "Asks the student to explain, justify, or show their working."},
    {"code": "explain_reasoning",  "label": "Makes Reasoning Explicit", "desc": "Surfaces the underlying logic of a step or concept."},
    {"code": "build_on_ideas",     "label": "Builds on Ideas",          "desc": "Extends or continues from the student's own prior attempt."},
    {"code": "connect",            "label": "Connects Concepts",        "desc": "Links to earlier topics, real examples, or prior content."},
    {"code": "reflect",            "label": "Reflects on Learning",     "desc": "Prompts metacognitive review — which step felt least certain and why."},
    {"code": "invite_ideas",       "label": "Invites Ideas",            "desc": "Invites a prediction, hypothesis, or the student's own idea."},
    {"code": "acknowledge",        "label": "Acknowledges & Positions", "desc": "Acknowledges correct partial work before addressing the error."},
    {"code": "guide_direction",    "label": "Guides Direction",         "desc": "Steers focus to the specific step or part that needs attention."},
]
_VALID_CODES = {c["code"] for c in CATEGORIES}
_LABELS = {c["code"]: c["label"] for c in CATEGORIES}

# Cap the corpus so an audit is bounded and cheap; batch utterances per LLM call.
_MAX_SCRIPTS = 120
_BATCH = 20


def _segment(text: str) -> list[str]:
    """Split a note into utterances on sentence boundaries (EN/BM/ZH punctuation)."""
    if not text:
        return []
    parts = re.split(r"(?<=[.!?。！？])\s+", text.strip())
    return [p.strip() for p in parts if len(p.strip()) >= 3]


UNCLASSIFIED = "unclassified"


def _classify_batch(utterances: list[str]) -> list[str]:
    """
    Classify a batch of utterances → list of category codes (aligned by index).

    Uses a plaintext line format (not JSON) and `free_only=True` on purpose:
    the paid Gemini provider truncates long classification outputs mid-stream
    (spends its output budget "thinking"), while the free chain (Cerebras →
    Groq → OpenRouter) returns the full list — and a batch audit should be cheap.
    Anything the model omits stays a visible `unclassified`, never silently
    folded into a real move-type.
    """
    catalogue = "\n".join(f"- {c['code']}: {c['desc']}" for c in CATEGORIES)
    numbered = "\n".join(f"{i+1}. {u}" for i, u in enumerate(utterances))
    prompt = f"""Code each teacher-feedback utterance by the TEACHING MOVE it performs.
Categories (use the code exactly):
{catalogue}

Utterances:
{numbered}

Output EXACTLY {len(utterances)} lines, one per utterance, format: <number>=<code>
Example:
1=guide_direction
2=invite_reasoning
No other text."""

    code_by_i: dict = {}
    try:
        res = call_llm(prompt, want_json=False, temperature=0.0,
                       max_tokens=1024, free_only=True)
        for line in res.text.splitlines():
            if "=" not in line:
                continue
            num, _, code = line.partition("=")
            code = code.strip().strip(".,;")
            try:
                idx = int(re.sub(r"\D", "", num))
            except ValueError:
                continue
            if code in _VALID_CODES:
                code_by_i[idx] = code
    except Exception as e:
        print(f"[feedback_quality] classify batch failed: {e}")

    return [code_by_i.get(i + 1, UNCLASSIFIED) for i in range(len(utterances))]


def run_feedback_quality_audit(corpus: list[dict], sample_size: int = _MAX_SCRIPTS) -> dict:
    """
    Code every utterance in a corpus of teacher-facing intervention scripts by
    teaching move, and return the distribution + a coded sample. Pure compute —
    caller supplies the corpus and persists the result.

    `corpus` items: {"text": str, "topic": str, "error_category": str}. The
    right corpus is the richer generated scripts from _generate_intervention_scripts
    (dialogic), NOT the one-line directive stored in event_logs.intervention.
    """
    corpus = [c for c in (corpus or []) if (c.get("text") or "").strip()][:max(1, min(sample_size, _MAX_SCRIPTS))]

    # Segment every script, keeping a link back to its source for the sample view.
    utterances: list[str] = []
    origins: list[dict] = []
    for r in corpus:
        for u in _segment(r.get("text") or ""):
            utterances.append(u)
            origins.append({"topic": r.get("topic") or "", "error_category": r.get("error_category") or ""})

    labels = dict(_LABELS)
    labels[UNCLASSIFIED] = "Unclassified"
    counts: dict = {c["code"]: 0 for c in CATEGORIES}
    counts[UNCLASSIFIED] = 0
    coded_sample: list[dict] = []
    for start in range(0, len(utterances), _BATCH):
        batch = utterances[start:start + _BATCH]
        codes = _classify_batch(batch)
        for j, code in enumerate(codes):
            counts[code] += 1
            if len(coded_sample) < 40:
                o = origins[start + j]
                coded_sample.append({
                    "utterance": batch[j], "code": code, "label": labels[code],
                    "topic": o["topic"], "error_category": o["error_category"],
                })

    total_acts = sum(counts.values())
    # Coverage = share of utterances the model actually classified (quality signal).
    classified = total_acts - counts[UNCLASSIFIED]
    coverage_pct = round(classified / total_acts * 100, 1) if total_acts else 0.0

    distribution = [
        {
            "code": c["code"], "label": c["label"], "desc": c["desc"],
            "count": counts[c["code"]],
            "pct": round(counts[c["code"]] / total_acts * 100, 1) if total_acts else 0.0,
        }
        for c in CATEGORIES
    ]
    distribution.sort(key=lambda d: d["count"], reverse=True)
    if counts[UNCLASSIFIED]:
        distribution.append({
            "code": UNCLASSIFIED, "label": "Unclassified", "desc": "Model did not assign a move-type.",
            "count": counts[UNCLASSIFIED],
            "pct": round(counts[UNCLASSIFIED] / total_acts * 100, 1) if total_acts else 0.0,
        })

    # Under-represented among CLASSIFIED acts only (the design signal).
    underrepresented = [
        d["label"] for d in distribution
        if d["code"] != UNCLASSIFIED and classified and (d["count"] / classified * 100) < 5.0
    ]

    return {
        "scripts_analyzed": len(corpus),
        "total_acts": total_acts,
        "coverage_pct": coverage_pct,
        "distribution": distribution,
        "underrepresented": underrepresented,
        "coded_sample": coded_sample,
    }
