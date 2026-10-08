# Session 21 — Competitive Games: Leaderboard + Mini-Game Scores + Richer H5P

Apply these changes to the KuasaPrestij frontend. Do not change anything unrelated.

---

## 1. POST penalty game result to backend

After `PenaltyGameModal` closes (whether the student wins or loses), call a new endpoint to record the result and earn bonus leaderboard points.

In `src/components/PenaltyGameModal.tsx`, after the game ends and `onClose()` is about to be called, add:

```ts
const recordGameResult = async (result: 'win' | 'loss', durationMs?: number) => {
  try {
    await fetch(`${API_BASE}/penalty_game_result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: studentId,        // prop passed from parent
        quiz_session_id: sessionId,   // prop passed from parent
        game_type: activeGame,        // 'catch_stars' | 'dino_runner' | 'flappy_bird'
        result,
        duration_ms: durationMs,
      }),
    });
  } catch (_) { /* non-fatal */ }
};
```

Call `recordGameResult('win', elapsed)` on game win, `recordGameResult('loss')` on game loss/timeout before closing.

Add props to `PenaltyGameModal`: `studentId: string`, `sessionId?: string`.
Update all usages of `<PenaltyGameModal>` to pass these props from the quiz session state.

If the response returns `points_awarded: 50`, briefly show a toast: **"+50 Leaderboard Points!"** in gold color before closing the modal.

---

## 2. Leaderboard screen

Create a new page `src/routes/leaderboard.tsx` (or add as a tab on the teacher dashboard).

### API call
```ts
GET /leaderboard?subject=Physics&limit=10
// or all subjects: GET /leaderboard?limit=10

Response:
{
  "subject": "Physics" | null,
  "leaderboard": [
    {
      "rank": 1,
      "student_id": "uuid",
      "total_score": 2350,
      "quiz_sessions": 12,
      "game_wins": 3
    },
    ...
  ]
}
```

### UI layout
- Full-width card with title **"Class Leaderboard 🏆"**
- Optional subject filter dropdown (uses the existing `/subjects` endpoint list)
- Top-3 students shown as podium (gold/silver/bronze medal emoji: 🥇 🥈 🥉)
- Remaining students in a ranked list: rank number · anonymised name (show last 4 chars of UUID or "Student #N") · score · quiz sessions · game wins (🎮 badge count)
- Highlight the current user's row in primary color
- Auto-refresh every 30 seconds

### Navigation
- Add a **"Leaderboard"** button to the main nav bar (trophy icon)
- Accessible to both students and teachers

---

## 3. H5P DragText interaction in InteractiveVideoPlayer

The backend now generates richer H5P content for language subjects (Bahasa Melayu, Bahasa Inggeris, Bahasa Cina). These blobs have **three interactions** instead of two:

```
interaction[0] = H5P.Audio   (TTS mnemonic — same as before)
interaction[1] = H5P.DragText (new drag-the-words teaching step)
interaction[2] = H5P.MultiChoice (graded MCQ — same as before)
```

Old MCQ-only blobs still have two interactions (Audio + MultiChoice) — handle both.

### In `src/components/InteractiveVideoPlayer.tsx`

Detect whether a DragText interaction is present:

```ts
const interactions = h5pContent.interactiveVideo.assets.interactions;
const dragInteraction = interactions.find(i => i.action?.library?.startsWith('H5P.DragText'));
const mcqInteraction  = interactions.find(i => i.action?.library?.startsWith('H5P.MultiChoice'));
```

**Phase 2b — DragText (new, only when dragInteraction exists):**

After the audio plays and video pauses at `dragInteraction.duration.from`:

1. Fade in an overlay panel with title **"Fill in the Blanks 📝"**
2. Parse `dragInteraction.action.params.textField` — a string where draggable words are wrapped in `*asterisks*`
   - Extract blanked words: all `*word*` patterns
   - Render the sentence with `___` in place of each `*word*`
   - Build a shuffled word bank: extracted words + distractors from `dragInteraction.action.params.distractors` (newline-separated)
3. Render word bank as tap-to-place chips (mobile-friendly, min 48px tap target)
4. When a chip is tapped, place it in the next empty `___`; tapping a placed word removes it back to bank
5. On "Semak / Check" button tap:
   - Compare placed words to the extracted correct words in order
   - Show green ✓ for correct positions, red ✗ for wrong
   - Show a brief animated result (1.5s) then auto-resume video to the MCQ phase
6. If the student skips (taps "Skip →" button in top-right corner), also resume to MCQ phase immediately

**Phase 3 — MCQ (existing, triggered at `mcqInteraction.duration.from`):**

No change to existing MCQ rendering logic — it's the same graded question sent to `/submit_answer`.

### Styling notes
- Word chips: `rounded-full px-4 py-2 bg-primary text-white font-medium shadow` when in bank; `bg-green-500` when placed
- Blank slots: `inline-block min-w-[80px] border-b-2 border-primary mx-1 text-center`
- Overlay: same dark semi-transparent style as existing MCQ overlay

---

## 4. Teacher dashboard leaderboard widget

On the existing teacher dashboard (`/teacher` route), add a small **"Top 5 Students"** widget in the sidebar or bottom section:

- Shows rank, student ID (last 4 chars), and score
- Link to full leaderboard page
- Refresh on page load only (no polling)
