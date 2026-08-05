# Lovable Prompt — Student Coach Report Feature

Paste this into Lovable to add the Study Coach report feature.

---

## Feature: Study Coach Report (triggered after diagnostic)

Add a **Study Coach** report flow. After a student has answered enough questions, show them a button to generate a personalised study plan.

### New API endpoints to integrate

Base URL: `https://api.kuasaprestij.com` (same base URL already used)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/diagnostic_status/{studentId}` | Check if diagnostic is complete |
| POST | `/student_coach/{studentId}` | Generate (or refresh) coaching report |
| GET | `/student_coach/{studentId}` | Fetch cached coaching report |

#### `GET /diagnostic_status/{studentId}` response shape
```json
{
  "student_id": "uuid",
  "questions_answered": 7,
  "threshold": 10,
  "diagnostic_complete": false,
  "report_available": false
}
```

#### `POST /student_coach/{studentId}` response shape (ready)
```json
{
  "ready": true,
  "student_id": "uuid",
  "questions_answered": 12,
  "narrative": {
    "greeting": "You've been putting in real effort — that shows!",
    "strengths": ["Sel Unit dan Organisasi"],
    "focus_areas": [
      {
        "topic": "Daya dan Gerakan",
        "subject": "Sains",
        "why": "You got confused between speed and velocity in 3 questions.",
        "tip": "Draw a diagram showing direction of movement. Speed has no direction, velocity does. Try 5 practice questions on this difference."
      }
    ],
    "next_step": "Start a practice session on Daya dan Gerakan now."
  },
  "focus_areas": [...]
}
```

#### `POST /student_coach/{studentId}` response shape (not ready yet)
```json
{
  "ready": false,
  "questions_answered": 7,
  "threshold": 10,
  "message": "Answer 3 more question(s) to unlock your Study Coach report."
}
```

---

### Where to show the Study Coach button

On the **main dashboard / home screen**, after a student completes a question:

1. Call `GET /diagnostic_status/{studentId}` on page load (and after every answer submission).
2. When `diagnostic_complete === true`:
   - Show a card/banner: **"Your Study Coach report is ready!"** with a button **"Get My Study Report"**
   - If `report_available === true` (a previous report exists), also show a secondary link: **"View last report"** that calls `GET /student_coach/{studentId}`

### "Get My Study Report" button behaviour

1. On click, show a loading state: *"Your AI coach is analysing your answers..."* (the POST may take 5–10 seconds)
2. Call `POST /student_coach/{studentId}`
3. On success (`ready === true`), open a **Study Coach modal/sheet** (see layout below)
4. On error or `ready === false`, show the `message` string as a toast

### Study Coach modal layout

```
┌─────────────────────────────────────────────┐
│  🎯  Your Study Coach Report                │
│─────────────────────────────────────────────│
│  [greeting from narrative.greeting]         │
│                                             │
│  ✅ What you're good at                     │
│     • [strength 1]                          │
│     • [strength 2]                          │
│                                             │
│  📚 Focus areas (most urgent first)         │
│  ┌─────────────────────────────────────┐    │
│  │ 1. [topic]  •  [subject]            │    │
│  │    [why]                            │    │
│  │    💡 Tip: [tip]                    │    │
│  └─────────────────────────────────────┘    │
│  (repeat for up to 3 focus areas)           │
│                                             │
│  👉 Next step:                              │
│     [narrative.next_step]                   │
│                                             │
│  [ Start Practice Session ]  [ Close ]      │
└─────────────────────────────────────────────┘
```

- "Start Practice Session" button should call `/start_session` with the first focus area's `topic` and `subject` pre-filled
- Modal is dismissible; the banner on the home screen should not reappear once the student has viewed the report in the current session (use local state)

### Progress indicator while diagnostic is incomplete

On the home screen, show a subtle progress bar or counter below the question area:

```
Diagnostic progress: 7 / 10 questions answered
[███████░░░]  3 more to unlock your Study Coach report
```

Only show this when `diagnostic_complete === false` and `questions_answered > 0`.

---

### Notes for Lovable

- Use the existing `studentId` from auth context (same as used for `/start_session` and `/mastery_map`)
- The POST endpoint is slow (5–15 seconds) — use a spinner with a friendly message, not a plain loading state
- Treat `narrative.focus_areas` as the display source (student-friendly language); ignore the top-level `focus_areas` array (that's raw data for future use)
- All text in `narrative` is already in English — no translation needed
