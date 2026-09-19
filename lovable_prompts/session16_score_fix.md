# Lovable Frontend Prompt — Session 16: Fix Score & Question Counter Not Updating

Two targeted bug fixes in `src/routes/index.tsx` and `src/services/api.ts`. Do not change any other behaviour, UI, or flow.

---

## Fix 1 — Score/streak reset to 0 on every answer (critical)

**File:** `src/routes/index.tsx`

**Problem:** The backend returns `streak: 0`, `score: 0`, `points_awarded: 0` when it can't find a valid session. The frontend checks `typeof res.streak === "number"` — `0` passes this check, so the backend's zeros silently override the local score/streak on every answer, keeping them stuck at 0.

**Fix:** Change every `typeof res.X === "number"` guard in `submitToBackend` to `res.X != null` so that a backend `0` is treated as "no data" rather than "reset to 0".

Change these four lines:

```typescript
// BEFORE
const points =
  typeof res.points_awarded === "number"
    ? res.points_awarded
    : isCorrect ? 100 + streak * 20 : 0;

const nextStreak =
  typeof res.streak === "number" ? res.streak : isCorrect ? streak + 1 : 0;

const nextWrongStreak =
  typeof res.wrong_count === "number"
    ? res.wrong_count
    : isCorrect ? 0 : wrongStreak + 1;

const nextScore =
  typeof res.score === "number" ? res.score : score + points;
```

```typescript
// AFTER
const points =
  res.points_awarded != null
    ? res.points_awarded
    : isCorrect ? 100 + streak * 20 : 0;

const nextStreak =
  res.streak != null ? res.streak : isCorrect ? streak + 1 : 0;

const nextWrongStreak =
  res.wrong_count != null
    ? res.wrong_count
    : isCorrect ? 0 : wrongStreak + 1;

const nextScore =
  res.score != null ? res.score : score + points;
```

---

## Fix 2 — submitAnswer sends wrong student ID (secondary)

**File:** `src/routes/index.tsx`

**Problem:** `submitAnswer` is called with the hardcoded fallback `STUDENT_ID` constant instead of the authenticated user's ID. `startSession` correctly uses `user?.id ?? STUDENT_ID`, but the submit call doesn't.

**Fix:** In the `submitToBackend` function, replace the `STUDENT_ID` argument in the `submitAnswer(...)` call with `effectiveStudentId` (which is already defined as `user?.id ?? STUDENT_ID` elsewhere in the component).

```typescript
// BEFORE
const res = await submitAnswer(
  STUDENT_ID,
  session.topic ?? activeTopic,
  ...
);

// AFTER
const res = await submitAnswer(
  effectiveStudentId,
  session.topic ?? activeTopic,
  ...
);
```

---

## What NOT to change

- The `advanceToNext` auto-advance logic (setTimeout calls)
- The `questionNumber` increment in `advanceToNext`
- The penalty game trigger logic
- Any other fields in the `submitAnswer` call
- Teacher dashboard, authentication, or any other screen
