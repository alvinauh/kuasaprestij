# Theme / Wallpaper / Classroom Branding — Work Status

_Snapshot: 2026-07-11. Captured after a frontend editor freeze to preserve progress._

## TL;DR
Feature is ~10% done. Only the **schema + TypeScript types** exist. All UI, recoloring,
wallpaper preference, and branding-render work is **not written yet** (nothing was lost in
the freeze — that code had not been created).

---

## ✅ Done / Saved

- **DB migration applied (live in Supabase)** — `public.classrooms` now has:
  - `theme` — `text`, nullable
  - `wallpaper` — `text`, nullable
- **TS types regenerated** — `src/integrations/supabase/types.ts` includes `theme` / `wallpaper`
  in the `classrooms` Row / Insert / Update definitions.

## ❌ Not built (no code exists in `src/`)

1. **Teacher UI to set theme/wallpaper** in `src/components/teacher/ClassroomsPanel.tsx`.
   (Note: this file *was* modified, but the diff has **zero** theme/wallpaper references —
   that change is unrelated and still uncommitted.)
2. **Deepen theme presets → recolor whole app** — no `applyTheme`, `--wallpaper` CSS var,
   `data-theme` attribute, or preset palette logic anywhere.
3. **App-wide wallpaper preference** — `profiles.preferences` (jsonb) exists but has no
   `wallpaper` / `theme` key wiring.
4. **Classroom branding render** — on the teacher panel AND the student `feed/` slides.

---

## Planned implementation (when resuming)

- **Theme presets + wallpaper picker** in `ClassroomsPanel` (write to `classrooms.theme` / `.wallpaper`).
- **`ThemeProvider` / CSS-var applier** that reads the active classroom's `theme` + `wallpaper`
  and sets CSS custom properties on `:root` (recolor whole app).
- **App-wide wallpaper preference** stored on `profiles.preferences` jsonb (per-user override).
- **Render branding** in:
  - Teacher UI (`ClassroomsPanel.tsx`)
  - Student feed slides (`src/components/feed/QuestionFeed.tsx` / `QuestionSlide.tsx`)
- Existing `src/styles.css` additions are Shorts-feed **animations only** — not theme presets.

---

## Related uncommitted frontend work (separate from this feature)

Live repo: `/root/frontend/learn-play-shine-96` — **nothing committed yet**, all on disk only.

Modified (10): `.env`, `InteractiveVideoPlayer.tsx`, `teacher/ClassroomsPanel.tsx`,
`integrations/supabase/types.ts`, `lib/auth.tsx`, `routes/__root.tsx`, `routes/index.tsx`,
`routes/login.tsx`, `services/api.ts`, `styles.css`.

New / untracked:
- `src/components/feed/` — `QuestionFeed.tsx` (139), `QuestionSlide.tsx` (246),
  `SpeedTimer.tsx`, `StreakMeter.tsx`, `XpBar.tsx` (Shorts-style vertical feed)
- `src/lib/gameProgress.ts` (29)

➡️ **TODO:** commit this diff so it's durable (exclude `.env`).

---

## ⚠️ Security note (unrelated, but flagged critical by Supabase)

RLS is **disabled** on 9 tables: `syllabus_embeddings`, `students`, `topic_anchors`,
`quiz_sessions`, `generated_lessons`, `quizzes`, `user_feedback`, `chat_history`, `media_cache`.
Anyone with the anon key can read/write every row. Enable RLS **with policies** — do not just
`ENABLE ROW LEVEL SECURITY` (that locks out all access).
