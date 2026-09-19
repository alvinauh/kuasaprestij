# Lovable Frontend Prompt — Session 15: Study Mode Selection + Diagnostic Test

Add a **Study Mode selection screen** that appears before a student starts any questions, giving them two distinct paths: a guided 10-question Diagnostic Test or Free Practice. Do not change the teacher dashboard, authentication, or subject/topic selector screens.

---

## 1. STUDY MODE SELECTION SCREEN

Show this screen **instead of immediately loading a question** when a student first lands on the quiz/home screen (or taps "Start Learning"). It replaces any existing direct-to-question entry point.

### Layout

A centred card (max-width 480 px, `rounded-2xl`, dark indigo background consistent with the existing quiz style) with:

- **Header:** "How do you want to study today?" (`text-2xl font-bold text-white`)
- Two large selectable mode cards stacked vertically, each `rounded-xl p-5 cursor-pointer border-2`:

---

**Card 1 — Diagnostic Test**

```
[ 🎯 ]  Diagnostic Test
        10 questions across all your subjects
        Unlock your AI Study Coach report when done

        [ RECOMMENDED badge if questions_answered === 0 ]
```

- Border: `border-indigo-400` (default), `border-white ring-2 ring-white` (selected)
- If `diagnostic_complete === true`, replace the description with:
  `"✅ Completed! Tap to retake or view your Study Coach."`
- If `0 < questions_answered < 10`, show a mini progress bar beneath the description:
  `"Resume — {questions_answered}/10 done"` + a thin progress bar (`w-full h-1.5 bg-indigo-800 rounded`)

---

**Card 2 — Free Practice**

```
[ 📚 ]  Free Practice
        Pick any subject and topic to practise
```

- Border: `border-indigo-400` (default), `border-white ring-2 ring-white` (selected)

---

- **CTA button** below both cards: `"Let's Go →"` (`w-full py-4 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-bold text-lg`)
- Button is disabled (greyed) until a mode is selected.

---

## 2. NEW API ENDPOINTS TO INTEGRATE

Base URL: same `https://api.kuasaprestij.com` already in use.

### `GET /diagnostic_progress/{studentId}?form_level=4`

Call this **on mount** of the mode selection screen to pre-populate the UI state.

```json
{
  "student_id": "uuid",
  "form_level": 4,
  "questions_answered": 3,
  "total": 10,
  "diagnostic_complete": false,
  "completed_topics": [
    { "subject": "Physics", "topic": "Force and Motion I" },
    ...
  ],
  "next_topic": { "subject": "Biology", "topic": "Cell Biology and Organisation" }
}
```

### `POST /start_diagnostic_session`

Called when the student selects **Diagnostic Test** and taps "Let's Go →".

**Request body:**
```json
{
  "student_id": "uuid",
  "language": "English",
  "form_level": 4
}
```

**Response — in progress:**
```json
{
  "diagnostic_complete": false,
  "diagnostic_progress": {
    "questions_answered": 3,
    "total": 10,
    "topic_index": 3,
    "completed_subjects": ["Physics", "Biology", "Chemistry"]
  },
  "topic": "Mathematics",
  "subject": "Mathematics",
  "question_type": "mcq",
  "question_data": { ... },
  "h5p_content": { ... },
  "media_url": "...",
  "video_broll": "...",
  "mnemonic_lyrics": "...",
  "session_id": "uuid",
  "lesson_id": "uuid",
  "lesson": { ... }
}
```

**Response — all 10 done:**
```json
{
  "diagnostic_complete": true,
  "questions_answered": 10,
  "total": 10,
  "message": "Diagnostic complete! Tap 'Get My Study Report' to unlock your Study Coach."
}
```

---

## 3. DIAGNOSTIC TEST FLOW

When the student enters Diagnostic mode, the existing quiz screen is used **with these additions**:

### A. Diagnostic Header Bar

Replace or augment the existing top bar with a **Diagnostic Progress Bar** for the duration of the diagnostic:

```
🎯  Diagnostic Test   [███████░░░]  7 / 10
                       Subject: Mathematics
```

- Progress bar: `w-full h-2 rounded bg-indigo-800` with a filled portion `bg-indigo-400` animating to the correct width
- Subject label: small grey text below the bar — `"Subject: {subject}"` — updates each question
- No topic-switcher is shown during diagnostic mode (hide any subject/topic selector)

### B. After Each Answer

After `/submit_answer` returns, instead of calling `POST /start_session` for the next question, call `POST /start_diagnostic_session` again (it auto-advances to the next topic).

### C. Diagnostic Complete Screen

When `POST /start_diagnostic_session` returns `diagnostic_complete: true`, show a **completion screen** (replaces the question area):

```
┌─────────────────────────────────────┐
│   🎉  Diagnostic Complete!          │
│                                     │
│   You answered questions across     │
│   10 subjects. Great effort!        │
│                                     │
│   [ ✨ Get My Study Report ]        │  ← primary CTA, indigo-500
│   [ Continue Free Practice ]        │  ← secondary, outlined
└─────────────────────────────────────┘
```

- "Get My Study Report" triggers the existing Study Coach flow (calls `POST /student_coach/{studentId}` then shows the coach modal — this is already implemented; just wire the button here).
- "Continue Free Practice" navigates to the mode selection screen with Free Practice pre-selected.

---

## 4. FREE PRACTICE FLOW

No changes to the existing question flow. When the student selects **Free Practice** and taps "Let's Go →", continue using the existing `POST /start_session` endpoint and subject/topic selector as before.

---

## 5. PERSISTENT STATE

Store `studyMode` (`"diagnostic" | "free_practice" | null`) in React state (or context). Reset to `null` when the student returns to the mode selection screen.

On the mode selection screen, if `studyMode` was previously `"diagnostic"` and `diagnostic_complete === false`, default the pre-selected card to **Diagnostic Test** (so a returning student can resume easily).

---

## 6. WHAT NOT TO CHANGE

- Authentication flow
- Teacher dashboard
- Subject/topic selector (used in Free Practice only)
- `/submit_answer` request shape — no changes
- Gamification overlays (streaks, score, points popup) — these continue to work in both modes
- Study Coach modal — already implemented; just add the entry point from the completion screen
