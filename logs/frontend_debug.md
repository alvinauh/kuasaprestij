# Frontend Debug Log — KuasaPrestij
> Updated automatically. Add entries at the top with date + symptom.

---

## 2026-06-07 — Subjects & Topics Not Displaying on Lovable

### Symptom
Lovable subject/topic dropdowns blank; `/subjects` returning 404 for calls made before 11:06 MYT.

### Root Cause
The `/subjects` endpoint and `subject` field in `AgentState` were added as uncommitted working-directory
changes. The VPS service was still running the **previous committed code** (which had no `/subjects` route).

Timeline from `journalctl`:
```
10:34:45  GET /subjects → 404   ← old process, endpoint didn't exist
11:06:03  Service restarted via auto-pull timer
11:06:06  New process started, picks up working-directory changes
11:06:06  GET /subjects → 200   ← fixed
11:56:56  Lovable hits /subjects → 200 OK
11:57:05  Lovable hits /start_session (Kinematics) → 200 OK
```

### Fix Applied
1. Committed all pending changes (subject field, illustrative_notes, /subjects endpoint).
2. Resolved `curriculum` vs `subject` naming ambiguity (see below).

### Curriculum / Subject Ambiguity (resolved 2026-06-07)
**Before:** `AgentState` had both `curriculum` and `subject` fields storing the same value (subject name).
`orchestrator.py` used `state['curriculum']` internally; `subject` was unused.

**After:**
- `AgentState` has only `subject` (e.g., `"Physics"`, `"Biology"`).
- `orchestrator.py` uses `state['subject']` everywhere.
- `StartSessionRequest` and `SubmitAnswerRequest` keep `curriculum` as an **optional deprecated alias**
  (`curriculum: str = ""`). If a caller sends only `curriculum`, the backend resolves
  `effective_subject = req.subject or req.curriculum` so old Lovable calls don't break.
- DB column `curriculum_tag` in `dskp_mastery` is unchanged (still stores subject name).

### Lovable Action Required
- Send `subject` (not `curriculum`) in all `/start_session` and `/submit_answer` calls.
- `curriculum` can be omitted entirely going forward.

---

## 2026-06-10 — Concept Note Showing "Generation Fail / No Data"

### Symptom
Clicking the concept note above the question shows "no data, please retry".

### Root Cause
Two bugs in the backend:
1. `POST /generate_lesson` was returning `notes_json` as a **nested object** — so `notes_markdown`,
   `key_terms`, `worked_example`, `mindmap` were buried and invisible to the frontend.
2. `LessonRequest.form_level` had no default — if Lovable omitted it, the backend returned 422
   which Lovable interpreted as a generation failure.

### Fix Applied (2026-06-10)
- `POST /generate_lesson`, `GET /lesson/{id}`, and the `lesson` field in `/start_session`
  all now return a **flat** object. See lesson response shape below.
- `form_level` now defaults to `4` so it is optional in the request.

### Lovable Action Required
When calling `POST /generate_lesson` or `GET /lesson/{lesson_id}`, read these top-level fields:
- `notes_markdown` — full Markdown content for the concept note slides
- `key_terms` — `[{term, definition}]` — show as a glossary/flashcard list
- `worked_example` — step-by-step worked example string
- `mindmap` — `{root, branches: [{label, children}]}` — render as mind map
- `summary` — 2–3 sentence overview
- `title` — topic title

---

## Open Issues
- None currently tracked. Add new issues below this line.

---

## API Quick-Reference for Lovable Frontend

### GET /subjects
Returns all KSSM subjects and their topic lists for populating dropdowns.
```json
{
  "subjects": [
    { "subject": "Physics", "topics": ["Kinematics", "Forces", "..."] },
    { "subject": "Biology", "topics": ["Cell Biology", "..."] }
  ]
}
```

### POST /start_session — request
```json
{
  "student_id": "uuid-or-undefined",
  "topic": "Kinematics",
  "subject": "Physics",
  "language": "English",
  "is_adaptive": false,
  "question_type": "mcq"
}
```

### POST /start_session — response
```json
{
  "topic": "Kinematics",
  "subject": "Physics",
  "question_type": "mcq",
  "media_url": "https://...",
  "video_broll": "https://...",
  "mnemonic_lyrics": "...",
  "session_id": "uuid",
  "lesson_id": "uuid",
  "question_data": {
    "question_type": "mcq",
    "kbat_level": "Memahami",
    "illustrative_notes": "2-3 sentence teaching note — show above question",
    "question": "Which formula ...",
    "options": ["A", "B", "C", "D"],
    "correct_answer": "B",
    "distractor_rationale": {}
  },
  "lesson": {
    "id": "uuid",
    "title": "Kinematics",
    "summary": "...",
    "notes_markdown": "## Kinematics\n**Displacement** is...",
    "key_terms": [{"term": "Velocity", "definition": "Rate of change of displacement"}],
    "worked_example": "A car travels...",
    "mindmap": {"root": "Kinematics", "branches": [{"label": "Motion", "children": ["speed", "velocity"]}]}
  }
}
```

### POST /generate_lesson — request
```json
{ "topic": "Kinematics", "subject": "Physics", "language": "English" }
```
`form_level` defaults to 4. `force_regenerate` defaults to false.

### POST /generate_lesson — response (same shape as `lesson` in /start_session above)
```json
{
  "id": "uuid",
  "title": "Kinematics",
  "summary": "...",
  "notes_markdown": "...",
  "key_terms": [{"term": "...", "definition": "..."}],
  "worked_example": "...",
  "mindmap": {"root": "...", "branches": []}
}
```

### POST /submit_answer — request
```json
{
  "student_id": "uuid",
  "topic": "Kinematics",
  "subject": "Physics",
  "student_answer": "B",
  "draft": { /* the full question_data object received from /start_session */ },
  "language": "English",
  "question_type": "mcq"
}
```

### POST /submit_answer — response
```json
{
  "is_correct": true,
  "partial_credit": null,
  "marks_awarded": null,
  "max_marks": null,
  "feedback": "...",
  "teacher_action_plan": "...",
  "new_mastery_score": 0.7,
  "topic_complete": false
}
```
For `short_answer` / `essay`, `partial_credit` (0.0–1.0), `marks_awarded`, and `max_marks` are populated.
