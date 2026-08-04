# SPECIAL_NEEDS_PLAN.md — Accommodations for ADHD & Other Special-Needs Profiles

> Status: **DRAFT / planning**. Created 2026-07-27. This is the working plan for adding
> evidence-based special-needs accommodations (ADHD-first, then dyslexia, autism spectrum,
> dyscalculia/low working memory, anxiety) on top of the existing KuasaPrestij engine.
>
> Guiding principle from the design discussion: **accommodations are settings a student or
> teacher toggles — never a diagnosis the app infers or a label it displays.** We frame this as
> a `accommodation_profile`, not a "special needs mode."

---

## 0. Execution order (agreed 2026-07-27)

1. **Fix bugs first + commit to GitHub.** ✅ Triaged — no active code bugs (backend imports
   clean, frontend `tsc` clean, known bug list cleared per memory). The real gap was 204
   unpushed commits; pushing branch `cleanup/remove-nested-duplicate-tree` to GitHub.
2. **Research the evidence base** so we build this well. (Running — see §4; findings to be
   appended when the research pass completes.)
3. **Build the per-student `accommodation_profile`** — settings model + plumbing into the
   feed / games / question renderer + one LLM prompt hook.
4. Iterate per profile (ADHD → dyslexia → autism → dyscalculia → anxiety).

---

## 1. Why this is mostly a *reuse* project, not a new product

Most evidence-based special-needs supports are **modes and settings layered on what we already
have**. Existing pieces that already align with the research:

| Existing feature | Research lever it already serves |
|---|---|
| Shorts-style vertical question feed | task **chunking** / short bouts (working-memory load) |
| gameKit juice + instant mastery bar | **immediate, salient feedback** (strongest ADHD lever) |
| Kaplay arcade games (movement, active response) | **active** response instead of passive reading |
| edge-tts audio (currently gated) | **multimodal** input / read-aloud |
| KbatProgressBar | externalized **executive function** (progress visibility) |
| adaptive difficulty (past-mistake tailored) | reduced frustration / appropriate challenge |

New work is comparatively small: a settings object, UI plumbing to honor it, and a prompt hook.

---

## 2. Research → architecture mapping

| Research lever | Reuse what exists | New work |
|---|---|---|
| Immediate feedback | gameKit juice, mastery bar | — |
| Chunking | vertical feed | **focus mode**: one question, hide feed siblings |
| Reduce extraneous load | — | **low-distraction theme**: mute juice, larger type, dyslexia-friendly font, high contrast, no autoplay |
| Multimodal | edge-tts (gated) | **read-aloud toggle** on question stem + options |
| Executive function | KbatProgressBar | session timer, "X of Y", break-after-N prompt, explicit next-step cue |
| Self-pacing | adaptive difficulty | accommodation flag: **disable timed games / extend limits** |
| Reduced frustration | mastery ±0.1 | gentler penalty + "try again" scaffold when flag set |

> ⚠️ **Known tension to resolve:** the arcade games (e.g. Answer Flappy) are *timed / physics
> pressure* — the opposite of the self-pacing that helps ADHD and anxiety profiles. The
> `extended_time` / `no_timed_games` accommodation must route these students to a
> non-timed reinforcement path (e.g. the tap-to-order Sentence Builder, or a plain retry).

---

## 3. Proposed design — `accommodation_profile`

A per-student settings object (**not** a diagnosis), toggled by student or teacher. Stored on
the profile — we already have Supabase prefs sync from the ProfileBanner work.

**Settings (finalized from the research checklist — see `SPECIAL_NEEDS_RESEARCH.md`):**

```
# visual / sensory
reduce_motion            # kill shake/particles/parallax; honour prefers-reduced-motion (WCAG 2.3.3)
no_flashing (default on) # cap effects <3 flashes/sec (WCAG 2.3.1)
mute_sfx                 # mute game SFX; no autoplay sound
high_contrast            # dark text on cream/pastel (NOT pure white); meet contrast min
dyslexia_font            # Arial/Verdana default; OpenDyslexic OPT-IN ONLY (contested evidence)
text_spacing             # 1.5 line spacing, <=70 char/line, left-ragged, no italics/underline
larger_text              # scale to 200% without breakage (WCAG 1.4.4)
# interaction / pacing
read_aloud               # edge-tts read stem + options (BM/EN/ZH)
focus_mode / calm_mode   # strip juice, pin layout, one item at a time
extended_time / no_timed_games  # remove/extend timers; SELF-PACED variant of Flappy
break_reminders          # stretch/movement prompt every N items
announce_difficulty_changes     # signal difficulty jumps (autism predictability)
consistent_help          # persistent help control; no redundant re-entry (WCAG 3.2.6/3.3.7)
# cognitive load / language
simplified_language      # LLM short-stem, one-idea-per-sentence + simplified_stem field
worked_example_first     # precede hard/KBAT with a solved analogue; steps one at a time
show_scratchpad / allow_calculator  # externalise working memory; keep reference data visible
growth_feedback          # "Not yet / try the missed step"; retries + hints; de-emphasise score
```

**Where it reads:**
- Feed components + game components + question renderer (frontend) honor visual/interaction flags.
- `generator_node` (backend) receives a `simplify_language` / `shorter_stem` flag → the LLM
  produces plain-language, one-idea-per-sentence phrasing at a lower reading level when set.

**Effort estimate:** ~80% frontend accommodation plumbing + one settings table/column + one
prompt tweak. Rides on infrastructure already built (ProfileBanner prefs, edge-tts, gameKit,
KbatProgressBar).

**Ethical guardrails:**
- No diagnosis inference. No labels shown to peers/teachers as clinical categories.
- Frame as "learning preferences / accommodations" the student or teacher chooses.
- Do **not** implement "learning styles" matching (not evidence-based).

---

## 4. Evidence base (research briefing)

Full cited briefing is in **`SPECIAL_NEEDS_RESEARCH.md`** (ADHD, dyslexia, autism spectrum,
dyscalculia/low working memory, anxiety; WCAG 2.2 + COGA criteria; LLM plain-language targets
for BM/EN/ZH; ethical framing). Two findings that shaped this plan:

1. **Immediate feedback is NOT universally best for ADHD.** Symptom severity negatively
   correlates with learning from immediate feedback (it shifts learning off reward circuits).
   → give immediate *knowledge-of-result*, but add a brief pause + explanation for concept
   learning; don't rely on reward-flash alone.
2. **Gamification/timed elements carry a real distraction & stress risk.** Simple progress
   tracking (our mastery bar) is low-risk; screen-shake/particles and timed physics (Answer
   Flappy) are the risky parts → **make salient/timed game elements optional, not default-on**,
   and provide a self-paced game variant.

Other load-bearing points: British Dyslexia Association text guidelines (and OpenDyslexic is
contested → opt-in only, not default); WCAG 2.3.3 + `prefers-reduced-motion` for animation
control; worked-examples effect for low working memory; growth-mindset + low-stakes framing for
anxiety; and the ethical rule that accommodations are **toggles, never inferred diagnoses**.

---

## 5. Build phases (proposed)

- **Phase A — Foundations:** `accommodation_profile` schema/column + prefs sync + a settings UI
  panel (student self-serve, teacher override). No behavior change yet.
- **Phase B — ADHD-first accommodations:** `focus_mode`, `reduce_motion`, `break_reminders`,
  `no_timed_games` routing, explicit next-step / progress cues.
- **Phase C — Reading/text:** `dyslexia_font`, `larger_text`, `high_contrast`, `read_aloud`
  (re-enable edge-tts on the answer path).
- **Phase D — Cognitive load / language:** `simplified_language` LLM hook + worked-example /
  step-scaffold emphasis for low-working-memory and dyscalculia.
- **Phase E — Anxiety framing:** low-stakes copy, growth-mindset feedback wording, retry scaffolds.

Each phase: verify with a real walk-through, update WORKSPACE.md, commit atomically.
