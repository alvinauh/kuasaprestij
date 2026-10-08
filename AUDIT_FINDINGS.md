# Audit Findings & Fixes — 2026-07-14

Audit run against `AUDIT_FRAMEWORK.md` (student "Hook" + teacher utility). Framework
reframed: we optimize for **engagement through mastery**, not "addiction" — the app
targets minors and is sold to schools, so dark-pattern framing is off the table. The
mechanics audited (fast feedback, flow-state difficulty, low friction, actionable
teacher data) are the defensible version of the same goals.

Grounded in the actual codebase, not the framework's assumptions.

- **Student Hook layer:** already strong (8/10) — vertical Embla feed, per-slide
  micro-nuggets, backend adaptive KBAT (C2→C5) + Boss mode, confetti/mastery-bar
  rewards, question prefetch, penalty/gamify mini-games.
- **Teacher layer:** the real gap (4/10) — the backend already computes the insight
  the framework calls the flagship feature, but the UI buried it.

Three fixes shipped this session. All frontend-only; each surfaces data/behavior that
already existed rather than building a new subsystem.

---

## Issue 1 — Teacher dashboard has no "class pulse"

**Framework check:** *Formative Insight — "70% of the class is stuck on Concept X" to
pivot instruction in real time.* ❌ before this fix.

**Problem.** `_compute_insights()` (`app/main.py`) already returns
`misconception_clusters` with a per-cluster `student_count`, plus `weakest_topic`. The
backend literally knew *"N students are stuck on concept X."* But the frontend only
rendered it inside a **collapsible** "Class-Wide Patterns" panel below the fold — a
teacher had to scan and expand cards to find the biggest blocker. The framework's
"pivot in real time" goal was unmet despite the data being present.

**Fix.** Added a `ClassPulseBanner` at the **top** of the Insights tab
(`src/routes/teacher.tsx`). It picks the cluster with the highest `student_count` and
renders it as a single glanceable alert — *"N students stuck on {error_category}"* —
with a one-tap **"Assign fix to all N"** button wired to the existing
`/teacher/generate_differentiated_plan` endpoint (`handleGenerateDifferentiatedPlan`).
Shows a spinner while assigning and a *"✅ N tasks assigned"* confirmation after.

**Files:** `src/routes/teacher.tsx` (banner render + `ClassPulseBanner` component).
**Backend work:** none — pure consumption of the existing `/teacher_insights` payload.
**Effect:** decision-support, one glance + one tap. Moves teacher score 4 → ~7.

---

## Issue 2 — Reward waits on the network round-trip

**Framework check:** *Instant Feedback Loop — immediate visual/haptic reward on
interaction, rather than waiting for a "grade."* / *Time-to-Dopamine < 2s.* ⚠️ before.

**Problem.** In `QuestionSlide.tsx`, all reward visuals (green/red glow, points burst,
"Correct! 🎉" strip) were gated on the `await submitAnswer(...)` POST resolving. On a
typical Malaysian mobile connection that's a visible lag between tap and dopamine — the
one real friction point in an otherwise strong feed.

**Fix.** The correct answer for the current MCQ is **already prefetched** into
`readyChallenge` (via `fetchSessionChallenge`, used by the "gamify this" game). We now
use it to fire an **optimistic verdict** the instant a choice is tapped:
- new `instant` state holds the optimistic correct/wrong verdict;
- `navigator.vibrate(...)` haptic fires immediately (short buzz correct / triple wrong);
- points burst fires immediately on an optimistic-correct;
- a `verdict` value (`feedback ? server : instant`) drives the button glow, feedback
  strip header, and speed badge, so they appear with zero network wait;
- the server response still lands as the **authoritative** reconcile — it overrides the
  verdict if the prefetch guess was stale, and the explanation text streams into the
  strip when it arrives;
- timer freezes on answer; network error clears `instant`/selection for a clean retry.

Graceful degradation: if the prefetch hasn't landed (e.g. first seed slide), it falls
back to the old server-gated behavior.

**Files:** `src/components/feed/QuestionSlide.tsx`.
**Effect:** tap → reward is instant. Hits the <2s rule. Student score 8 → ~9.

---

## Issue 3 — Streaks reset on reload, no personal best

**Framework check:** *Social "Ghosting" / streaks to foster healthy self-competition.*
⚠️ before — streak was local component state only.

**Problem.** `streak` lived in `QuestionFeed` `useState(0)`; a page refresh mid-run
wiped the combo, and there was no "personal best" to chase. The single best *healthy*
retention hook (compete with yourself, not peer pressure) was effectively disabled.

**Fix.** Persist current streak and best streak to `localStorage`, keyed per student
(`kp_streak_{id}`, `kp_beststreak_{id}`):
- lazy-initialize both from storage on mount, so a refresh restores the run;
- effects write current streak on every change and lift/store the personal best;
- `StreakMeter` now takes a `best` prop and shows a **"PB {n}"** pill (or **"PB!"** when
  the current run ties/beats the best).

**Files:** `src/components/feed/QuestionFeed.tsx`, `src/components/feed/StreakMeter.tsx`.
**Follow-up (not done):** cross-device sync via a Supabase column — deliberately
deferred; would need a schema change on the production DB, which wasn't in scope for
this session. localStorage fully solves the stated "resets on reload" bug on-device.

---

## Spotted, not fixed (pre-existing, out of scope)

- ~~`QuestionFeed.tsx` `handlePenaltyComplete` ignores the `won` argument~~ — no longer
  present; resolved since this section was written.
- ~~`src/lib/auth.tsx` has 3 pre-existing type errors around the Supabase
  `PostgrestBuilder` promise.~~ **FIXED 2026-07-14** (see Issue 4 below).

---

## Issue 4 — auth.tsx type errors on the Supabase thenable

**Problem.** `withTimeout<T>(promise: Promise<T>, ...)` typed its argument as a strict
`Promise<T>`, but Supabase's query builder is a `PostgrestBuilder` — a *thenable*
(`PromiseLike`), not a real `Promise`. Passing the `profiles` query to `withTimeout`
raised TS2345 at line 64, which cascaded into TS2339 (`.data`/`.error` on `{}`) at line
76. Three pre-existing errors, present since the timeout hardening.

**Fix.** Widened the `withTimeout` parameter to `PromiseLike<T>`. `Promise.race` already
accepts `PromiseLike`, so this is a **type-only** change — zero runtime behavior change.

**Files:** `src/lib/auth.tsx` (+ synced to secondary clone `/root/learn-play-shine-96`).
**Effect:** all 3 auth.tsx errors cleared.

## Verification

`npx tsc --noEmit` after this session: **0 errors** across the whole tree (down from the
4 pre-existing errors noted above). The edited files — `teacher.tsx`, `QuestionSlide.tsx`,
`QuestionFeed.tsx`, `StreakMeter.tsx`, `auth.tsx` — introduce **no** new type errors.
