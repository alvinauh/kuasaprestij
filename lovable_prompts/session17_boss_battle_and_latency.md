# Lovable Frontend Prompt — Session 17: Boss Battle UI + Praise Overlay Latency Fix

Two targeted improvements to the quiz flow. Do not change the teacher dashboard, authentication, subject selector, diagnostic mode, or any screen other than the active quiz screen.

**Prerequisite:** Session 14 gamification prompt (streak bar, praise overlay, penalty game) must already be applied.

---

## Fix 1 — Fire loadSession DURING the praise overlay, not after (latency fix)

**File:** `src/routes/index.tsx` (or wherever the praise overlay setTimeout and `loadSession`/`startSession` call live)

**Problem:** The 1500ms praise overlay delays the next question load. The backend call to `POST /start_session` fires AFTER the overlay closes, adding 3–5s wait time that could be invisible to the student.

**Fix:** Fire the `startSession` (or `loadSession`) API call immediately when the praise overlay appears, run it concurrently with the 1500ms countdown, so the next question is ready (or nearly ready) by the time the overlay dismisses.

```typescript
// BEFORE — fires after overlay
const handleCorrect = () => {
  setShowPraiseOverlay(true);
  setTimeout(() => {
    setShowPraiseOverlay(false);
    loadNextQuestion();   // ← API call starts here, AFTER 1500ms
  }, 1500);
};

// AFTER — fires during overlay
const handleCorrect = () => {
  setShowPraiseOverlay(true);
  loadNextQuestion();     // ← API call starts immediately (runs in parallel)
  setTimeout(() => {
    setShowPraiseOverlay(false);
    // Question is already in-flight or done — just reveal it
  }, 1500);
};
```

**Important:** Make sure `loadNextQuestion` / `startSession` writes the result into state (e.g. `setNextSession(data)`) and that the quiz screen reads from that state when the overlay dismisses. If the API call hasn't finished yet when the overlay closes, keep the existing loading spinner — the student only waits for the remaining delta, not the full 3–5s.

---

## Fix 2 — Topic Boss Battle UI

**Context:** The `/submit_answer` response already returns `mastery_score` (a float 0–1). This is the student's mastery of the current topic. No backend changes needed.

**Behaviour:** When the backend returns `mastery_score >= 0.7` in a `/submit_answer` response, and the student is about to receive their next question on the same topic, show a **Boss Battle intro screen** (a dramatic 2-second overlay) before the question renders.

### A. Boss Battle Intro Overlay

Trigger: `is_correct === true && mastery_score >= 0.7 && !topic_complete`

Show a full-screen overlay (same dark indigo background as the quiz) for **2 seconds** with:

```
┌────────────────────────────────────────┐
│                                        │
│          ⚔️  BOSS BATTLE ⚔️            │
│                                        │
│    You're at {Math.round(mastery*100)}% mastery!    │
│    One more push to MASTER this topic! │
│                                        │
│   [ animated sword-slash or lightning  │
│     CSS keyframe — left to right ]     │
│                                        │
└────────────────────────────────────────┘
```

- Background: dark red-to-purple gradient `from-[#3b0000] to-[#2d0a6e]` instead of the normal indigo
- Title: `text-3xl font-black text-yellow-400 tracking-widest`
- Subtitle: `text-white text-lg`
- Animation: a simple CSS `@keyframes slideIn` on a sword emoji or a horizontal lightning bolt div (`w-full h-1 bg-yellow-400 animate-[slideIn_0.5s_ease-in-out]`)
- Auto-dismiss after 2 seconds (no button needed)

After the 2-second overlay dismisses, render the next question with a **red-tinted question card border** (`ring-2 ring-red-500`) to signal "boss mode" for that question only.

### B. Boss Battle answer feedback

If the student answers the boss-mode question correctly:
- In addition to the normal praise overlay, show "🏆 Topic Mastered!" in gold text beneath the praise message.

If wrong:
- Normal wrong feedback as usual (no special treatment — the boss mode flag resets).

### C. State management

Add a boolean `isBossMode` to component state (default `false`). Set it `true` when `mastery_score >= 0.7 && !topic_complete`. Reset it to `false` after the next question loads (win or lose).

---

## What NOT to change

- The `advanceToNext` / `questionNumber` increment logic
- The penalty game trigger (fires independently of boss mode)
- Streak, score, wrong count logic
- Diagnostic mode flow
- Teacher dashboard or any other screen
