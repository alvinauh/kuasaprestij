import os
import re
import json
import requests
from concurrent.futures import ThreadPoolExecutor
from supabase import create_client, Client
from dotenv import load_dotenv
from agents.llm_client import call_llm, embed_text

load_dotenv(override=True)

supabase: Client = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))


def _extract_json(text: str) -> dict:
    """Parse JSON from an LLM response, tolerating common formatting slips.

    Handles: ```json fences, prose before/after the object, // and /* */
    comments, and trailing commas (LLMs emit these often on longer outputs).
    """
    text = text.strip()
    # Strip ```json ... ``` or ``` ... ``` wrappers
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)

    def _clean(s: str) -> str:
        # Drop // line comments and /* */ block comments
        s = re.sub(r"/\*.*?\*/", "", s, flags=re.DOTALL)
        s = re.sub(r"(?m)//.*$", "", s)
        # Remove trailing commas before } or ]
        s = re.sub(r",(\s*[}\]])", r"\1", s)
        return s

    def _load(s: str):
        data = json.loads(s)
        return data[0] if isinstance(data, list) else data

    for candidate in (text, _clean(text)):
        try:
            return _load(candidate)
        except json.JSONDecodeError:
            pass

    # Slice out the outermost {...} object and retry cleaned.
    start, end = text.find("{"), text.rfind("}")
    sliced = text[start : end + 1] if start != -1 and end > start else text
    if sliced is not text:
        try:
            return _load(_clean(sliced))
        except json.JSONDecodeError:
            pass

    # Last resort: json_repair fixes unescaped quotes / newlines / unterminated
    # strings that regex can't — LLMs emit these on long structured outputs.
    try:
        from json_repair import repair_json

        data = repair_json(sliced, return_objects=True)
        if isinstance(data, list):
            data = data[0] if data else {}
        if isinstance(data, dict) and data:
            print("-> JSON recovered via json_repair.")
            return data
    except Exception as e:  # pragma: no cover - defensive
        print(f"-> json_repair failed: {e}")

    print(f"-> JSON parse error. Raw response (first 300 chars): {text[:300]}")
    return {}


def _dedup_chunks(chunks: list[dict]) -> list[dict]:
    """Remove chunks with duplicate content (exact and near-duplicate by 80-char prefix)."""
    seen = set()
    unique = []
    for chunk in chunks:
        content = chunk.get("content", "")
        key = content[:80].strip()
        if key and key not in seen:
            seen.add(key)
            unique.append(chunk)
    return unique


def _question_context_block(question_draft: dict) -> str:
    """Serialize the question draft into a readable block for the prompt."""
    if not question_draft:
        return ""
    lines = ["QUESTION BEING STUDIED (anchor your notes to explain this question):"]
    if question_draft.get("question"):
        lines.append(f"Question: {question_draft['question']}")
    if question_draft.get("answer"):
        lines.append(f"Correct Answer: {question_draft['answer']}")
    if question_draft.get("explanation"):
        lines.append(f"Explanation: {question_draft['explanation']}")
    if question_draft.get("key_concepts"):
        lines.append(f"Key Concepts: {', '.join(question_draft['key_concepts'])}")
    if question_draft.get("illustrative_notes"):
        lines.append(f"Illustrative Notes: {question_draft['illustrative_notes']}")
    if question_draft.get("marking_rubric"):
        rubric = question_draft["marking_rubric"]
        if isinstance(rubric, list):
            lines.append(f"Marking Rubric: {'; '.join(rubric)}")
    return "\n".join(lines)


def _fetch_dskp_chunks(topic: str, subject: str, form_level: int) -> list[dict]:
    """Run vector search and return deduplicated DSKP chunks. Returns [] on any failure."""
    try:
        query_vector = embed_text(f"KSSM {subject} Form {form_level} Topic: {topic}")

        syllabus_res = supabase.rpc(
            "match_syllabus_embeddings",
            {"query_embedding": query_vector, "match_threshold": 0.35, "match_count": 10}
        ).execute()

        chunks = _dedup_chunks(syllabus_res.data or [])
        print(f"-> {len(chunks)} unique DSKP chunks retrieved (from {len(syllabus_res.data or [])} raw).")
        return chunks
    except Exception as e:
        print(f"-> Vector retrieval error: {e}")
        return []


def _fetch_pexels_photo(query: str) -> str:
    """Return a single landscape stock-photo URL for `query`, or "" on any miss.
    5s timeout, no retries — image enrichment is best-effort and never blocks a lesson."""
    key = os.getenv("PEXELS_API_KEY")
    if not key or not query.strip():
        return ""
    try:
        res = requests.get(
            "https://api.pexels.com/v1/search",
            headers={"Authorization": key},
            params={"query": query, "per_page": 1, "orientation": "landscape"},
            timeout=5,
        ).json()
        photos = res.get("photos") or []
        if photos:
            src = photos[0].get("src", {}) or {}
            return src.get("large") or src.get("landscape") or src.get("medium") or src.get("original") or ""
    except Exception as e:
        print(f"-> Pexels photo fetch failed for '{query}': {e}")
    return ""


def _enrich_slides_with_images(slides: list, topic: str, subject: str) -> None:
    """Attach an `image_url` to slides in place. Best-effort, runs Pexels queries
    concurrently (5s each) so total latency stays ~5s regardless of slide count.
    Query priority: the slide's `visual` hint (concrete → best stock match), else
    the topic+subject for title/concept slides; text-only slides (recap/mistakes) are skipped."""
    if not slides:
        return
    targets = []
    for s in slides:
        if not isinstance(s, dict):
            continue
        # A structured diagram takes precedence over a photo — skip Pexels for it.
        if (s.get("diagram") or "").strip():
            continue
        hint = (s.get("visual") or "").strip()
        if hint:
            query = " ".join(hint.split()[:6])
        elif s.get("layout") in ("title", "concept", "formula"):
            query = f"{topic} {subject}".strip()
        else:
            continue
        targets.append((s, query))
    if not targets:
        return

    def _work(item):
        slide, query = item
        url = _fetch_pexels_photo(query)
        if not url and query != topic:
            url = _fetch_pexels_photo(topic)  # thematic fallback
        if url:
            slide["image_url"] = url

    try:
        with ThreadPoolExecutor(max_workers=6) as ex:
            list(ex.map(_work, targets))
        got = sum(1 for s, _ in targets if s.get("image_url"))
        print(f"-> Slide images: {got}/{len(targets)} enriched via Pexels.")
    except Exception as e:
        print(f"-> Slide image enrichment failed (non-fatal): {e}")


def generate_lesson(
    topic: str,
    subject: str,
    form_level: int,
    language: str = "English",
    question_draft: dict = None,
    cached_chunks: list[dict] = None,
) -> dict:
    """
    Generate and cache concept notes for a topic.
    - If cached_chunks provided, skips vector search (reuses stored chunks).
    - If question_draft provided, anchors notes to the specific concept being tested.
    - Falls back to Gemini KSSM knowledge when no DSKP chunks are available.
    """
    print(f"--- LESSON AGENT: Generating '{topic}' | {subject} Form {form_level} ---")

    # 1. Retrieve or reuse DSKP chunks
    if cached_chunks is not None:
        chunks = cached_chunks
        print(f"-> Reusing {len(chunks)} stored chunks (no vector search needed).")
    else:
        chunks = _fetch_dskp_chunks(topic, subject, form_level)

    dskp_found = len(chunks) > 0
    dskp_context = "\n\n---\n\n".join(c["content"] for c in chunks) if dskp_found else ""

    # 2. Build prompt sections
    question_block = _question_context_block(question_draft)
    anchor_instruction = (
        "IMPORTANT: The notes MUST directly explain the concepts, terms, and reasoning "
        "tested in the QUESTION BEING STUDIED above. A student reading these notes should "
        "immediately understand how to answer that question."
        if question_block else ""
    )

    if dskp_found:
        source_section = f"""DSKP SOURCE MATERIAL (use as primary reference):
{dskp_context}

- Prioritise these excerpts for definitions, formulas, and concepts.
- Fill gaps with your KSSM curriculum knowledge where the excerpts are thin."""
    else:
        source_section = f"""No DSKP excerpts found for this topic.
Use your knowledge of the Malaysian KSSM {subject} Form {form_level} curriculum.
All content must reflect what is taught in Malaysian secondary schools at this level."""

    prompt = f"""You are a master KSSM textbook author writing concept notes for Form {form_level} {subject} students.

{question_block}

{source_section}

TOPIC: {topic} | SUBJECT: {subject} (KSSM Form {form_level}) | LANGUAGE: {language}
Key technical terms may be bilingual (BM / English).

RULES:
- Every section must contain real, specific subject content. No placeholders.
- State all laws and formulas explicitly with variables defined.
- Write in {language}.
- Output MUST be valid JSON. Inside any string value, never use a raw double-quote
  or a line break — write plain text; if you must quote a term, use 'single quotes'.
{anchor_instruction}

Return ONLY a raw JSON object — no markdown fences, no extra text:
{{
    "title": "Exact topic title as taught in KSSM",
    "dskp_code": "Learning standard code if known, else N/A",
    "summary": "2-3 sentences explaining this topic and its importance in {subject}",
    "key_concepts": ["specific concept 1", "specific concept 2"],
    "key_terms": [{{"term": "term", "definition": "precise definition"}}],
    "worked_example": "Fully worked example with steps and/or numerical values.",
    "notes_markdown": "Full Markdown notes. ## for sections, **bold** key terms. Cover: definition, laws/formulas, examples, common mistakes.",
    "slides": [
        {{"layout": "title", "title": "Punchy lesson title", "subtitle": "One-line hook — why this matters", "bullets": [], "visual": "Short description of an ideal image", "diagram": "", "notes": "1 sentence the teacher says to open"}},
        {{"layout": "objectives", "title": "What You'll Learn", "bullets": ["objective 1", "objective 2", "objective 3"], "visual": "", "diagram": "", "notes": "1-2 sentence teacher script"}},
        {{"layout": "concept", "title": "Slide headline (one idea)", "bullets": ["concise point (<= 10 words)", "concise point"], "visual": "image idea", "diagram": "flowchart LR\\n  A[Reactant] --> B[Process] --> C[Product]", "notes": "1-2 sentence teacher script"}},
        {{"layout": "formula", "title": "Key law / formula", "bullets": ["Formula stated with each variable defined", "unit / condition"], "visual": "", "diagram": "", "notes": "teacher script"}},
        {{"layout": "example", "title": "Worked Example", "bullets": ["Step 1 ...", "Step 2 ...", "Answer ..."], "visual": "", "diagram": "", "notes": "teacher script"}},
        {{"layout": "mistakes", "title": "Common Mistakes", "bullets": ["misconception -> correction", "misconception -> correction"], "visual": "", "diagram": "", "notes": "teacher script"}},
        {{"layout": "recap", "title": "Recap & Check", "bullets": ["takeaway 1", "takeaway 2", "quick question to pose to the class"], "visual": "", "diagram": "", "notes": "teacher script"}}
    ],
    "mindmap": {{
        "root": "{topic}",
        "branches": [
            {{"label": "Concept heading", "children": ["detail", "detail"]}}
        ]
    }}
}}
Slides = a presentation-ready deck of 8-12 slides. Rules for slides:
- ONE idea per slide. Keep bullets short and spoken-aloud friendly (aim <= 10 words each, 3-5 bullets).
- Follow this arc: title -> objectives -> several concept/formula slides (the core, teach it step by step)
  -> at least one worked example slide -> common mistakes -> recap with a question to pose.
- Every bullet must be real {subject} content specific to {topic}. No filler, no "etc.", no placeholders.
- "diagram" = a valid Mermaid definition for slides where a STRUCTURED diagram teaches the idea better
  than a photo: a process/cycle, a hierarchy/classification, a comparison, cause->effect, or steps.
  Use `flowchart LR`/`flowchart TD` (or `graph`). Keep 3-8 short nodes; node text must be plain ASCII
  with NO parentheses, quotes, or special characters inside the brackets. Separate lines with \\n.
  Leave "diagram": "" when a structured diagram would not genuinely help (e.g. objectives/recap/pure formula).
- "visual" = a brief description of a photo that would suit the slide (leave "" if text/diagram is enough).
  Prefer a "diagram" over a "visual" whenever the concept is a process, relationship, or classification.
- "notes" = a short teacher script (what to actually say). Speak to Form {form_level} students.
Mindmap: 3-6 branches, 2-5 children each. All content specific to {topic}."""

    # 3. Generate
    try:
        res = call_llm(prompt, want_json=True, temperature=0.2)
        data = _extract_json(res.text)
    except Exception as e:
        print(f"-> LLM generation error: {e}")
        return {}

    if not data.get("notes_markdown"):
        print(f"-> notes_markdown empty after generation for '{topic}'. Raw keys: {list(data.keys())}")
        return {}

    # 3b. Enrich slides with real Pexels imagery (best-effort; cached in notes_json)
    if isinstance(data.get("slides"), list):
        _enrich_slides_with_images(data["slides"], topic, subject)

    # 4. Upsert — store generated content AND the source chunks for future reuse
    try:
        data["_source_chunks"] = [c["content"] for c in chunks]  # store for reuse
        row = {
            "topic": topic,
            "subject": subject,
            "form_level": form_level,
            "language": language,
            "title": data.get("title", topic),
            "dskp_code": data.get("dskp_code", "N/A"),
            "notes_content": data.get("notes_markdown", ""),
            "notes_json": data,
        }
        result = supabase.table("generated_lessons").upsert(
            row, on_conflict="topic,subject,form_level,language"
        ).execute()
        lesson_id = result.data[0]["id"] if result.data else None
        data["id"] = lesson_id
        print(f"-> Lesson saved. ID: {lesson_id}")
    except Exception as e:
        print(f"-> Supabase upsert error: {e}")

    # Ensure notes_content is always present (cache-hit path adds it from DB row;
    # first-generation path must add it here so the caller always sees the same shape)
    data["notes_content"] = data.get("notes_markdown", "")
    return data


def get_cached_lesson(topic: str, subject: str, form_level: int, language: str = "English") -> dict:
    """
    DB-only lookup — no Gemini call. Returns the lesson dict if cached, else {}.
    Use this inside latency-sensitive paths (e.g. /start_session).
    """
    try:
        res = supabase.table("generated_lessons")\
            .select("id, topic, subject, form_level, language, title, dskp_code, notes_content, notes_json")\
            .eq("topic", topic)\
            .eq("subject", subject)\
            .eq("form_level", form_level)\
            .eq("language", language)\
            .execute()
        if res.data:
            row = res.data[0]
            if row.get("notes_content"):
                data = row.get("notes_json") or {}
                data["id"] = row["id"]
                data["notes_content"] = row["notes_content"]
                print(f"-> Lesson cache hit (fast path): '{topic}' | {subject}")
                return data
    except Exception as e:
        print(f"-> Lesson cache lookup error: {e}")
    return {}


def get_or_create_lesson(
    topic: str,
    subject: str,
    form_level: int,
    language: str = "English",
    question_draft: dict = None,
) -> dict:
    """
    Return cached lesson if it has real content.
    On cache miss or empty-notes entry, regenerate — reusing stored chunks if available.
    """
    try:
        existing = supabase.table("generated_lessons")\
            .select("*")\
            .eq("topic", topic)\
            .eq("subject", subject)\
            .eq("form_level", form_level)\
            .eq("language", language)\
            .execute()
    except Exception as e:
        print(f"-> Cache lookup error: {e}. Proceeding to generate.")
        existing = type("R", (), {"data": []})()

    if existing.data:
        row = existing.data[0]
        if row.get("notes_content"):
            print(f"-> Cache hit: '{topic}' | {subject}")
            data = row.get("notes_json") or {}
            data["id"] = row["id"]
            data["notes_content"] = row["notes_content"]
            return data
        # Row exists but has no content — regenerate, reusing any stored chunks
        print(f"-> Cache entry empty for '{topic}'. Regenerating.")
        stored_chunks = []
        notes_json = row.get("notes_json") or {}
        raw_chunks = notes_json.get("_source_chunks", [])
        if raw_chunks:
            stored_chunks = [{"content": c} for c in raw_chunks]
            print(f"-> Reusing {len(stored_chunks)} stored chunks.")
        return generate_lesson(topic, subject, form_level, language,
                               question_draft=question_draft, cached_chunks=stored_chunks)

    return generate_lesson(topic, subject, form_level, language, question_draft=question_draft)


if __name__ == "__main__":
    lesson = get_or_create_lesson(
        topic="Kinematics",
        subject="Physics",
        form_level=4,
        language="English"
    )
    print(json.dumps(lesson, indent=2, ensure_ascii=False))
