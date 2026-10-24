# SPECIAL_NEEDS_RESEARCH.md — Evidence-Based Design Briefing

> Compiled 2026-07-27 via a web-research pass. Cited briefing that grounds
> `SPECIAL_NEEDS_PLAN.md`. Scope: actionable web/mobile UI + LLM-question-generation guidance
> for ADHD, dyslexia, autism spectrum, dyscalculia/low working memory, and anxiety, for KSSM
> students aged ~13–17 in BM/EN/ZH. Design guidance, **not** clinical treatment.

---

## 1. ADHD in digital learning

- ADHD learners do best with **movement, novelty, immediate feedback, and structured
  environments** ([neurolaunch](https://neurolaunch.com/how-do-students-with-adhd-learn-best/)).
- **Nuance — immediate feedback is not universally optimal.** In probabilistic learning, ADHD
  performance *diminished* with immediate feedback; symptom severity negatively correlated with
  learning from it (shifts learning off striatal/reward circuits)
  ([Nature Sci Rep](https://www.nature.com/articles/s41598-018-33551-3);
  [PMC6195519](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6195519/)). → Give immediate
  *knowledge-of-result*, but for concept learning add a brief pause + explanation, not just a
  reward flash.
- **Movement helps** attention/behaviour/academics; permit low-level movement + break prompts
  ([Frontiers meta-analysis](https://www.frontiersin.org/journals/psychiatry/articles/10.3389/fpsyt.2021.706625/full)).
- **Gamification has real risks:** game elements can boost motivation *or* act as a distraction
  that outweighs the benefit ([JMIR Serious Games](https://games.jmir.org/2020/3/e18644);
  [PMC7445616](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7445616/)). Simple progress
  tracking/avatars showed *no* significant negative cognitive-load effect — so the live mastery
  bar is low-risk; screen-shake/particles and timed physics are the risky elements → make them
  optional.
- **UI:** keep feed chunking; per-block movement/break prompt; gate juice behind
  focus/reduce-motion; offer a **non-timed variant of the Flappy game**.

## 2. Dyslexia — UI text guidelines (British Dyslexia Association style guide)

Source: [BDA Style Guide](https://www2.worc.ac.uk/disabilityanddyslexia/documents/British%20Dyslexia%20Association%20Style%20Guide.pdf),
[Dyslexia Scotland summary](https://dyslexiascotland.org.uk/dyslexia-friendly-typed-formats/).
- Sans-serif (Arial, Verdana, Tahoma, Calibri, Open Sans); size 12–14pt (~16–19px);
  line spacing ~1.5; line length 60–70 chars; **left-aligned ragged-right, never full
  justification**; **bold** for emphasis, avoid italics/underline/ALL-CAPS.
- Dark text on **cream/soft pastel, not pure white** (white dazzles); avoid red/green combos.
- **Text-to-speech is recommended support** → our edge-tts serves this directly.
- **OpenDyslexic is contested** — studies show no reliable reading-rate/accuracy benefit and no
  student preference ([PMC5629233](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5629233/);
  [Nessy](https://www.nessy.com/en-us/dyslexia-explained/understanding-dyslexia/dyslexia-fonts-do-they-work);
  [Edutopia](https://www.edutopia.org/article/do-dyslexia-fonts-actually-work/)). → **Default**
  dyslexia mode = well-spaced Arial/Verdana with BDA spacing/contrast; offer OpenDyslexic as
  **opt-in only**.

## 3. Autism spectrum — sensory load & predictability

- Reduce motion/animation; give autoplay control; flashing/motion/unexpected sound are
  sensory-overload triggers ([UXPA](https://uxpa.org/designing-for-autism-in-ux/);
  [Scope](https://business.scope.org.uk/article/designing-for-people-on-the-autism-spectrum/)).
- **WCAG 2.3.3 Animation from Interactions (AAA)** — non-essential interaction motion must be
  disable-able; implement via **`prefers-reduced-motion`** + in-app toggle. **WCAG 2.3.1 Three
  Flashes** — no content flashing >3×/sec (relevant to particles/juice)
  ([W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/)).
- **Predictability:** pin layout/controls; **announce difficulty jumps in advance** instead of
  surprising the learner.
- **Literal language:** no idiom/sarcasm/jargon; label all icons (feeds §7 LLM prompt).
- Independently mutable TTS + SFX; never autoplay sound. → "calm mode".

## 4. Dyscalculia / low working memory (Cognitive Load Theory)

Working memory ≈ 4 chunks (Cowan);
[CLT guide](https://www.structural-learning.com/post/cognitive-load-theory-a-teachers-guide).
- Reduce **simultaneous** load — one thing at a time; chunk & sequence.
- **Worked-examples effect** — novices learn faster from studied step-by-step solutions than
  unguided problem-solving
  ([Tandfonline](https://www.tandfonline.com/doi/full/10.1080/01443410.2023.2273762)).
- **Fade scaffolding:** worked → completion → independent; pair each example with a matched
  practice item.
- **Externalise working memory:** allow calculator/scratchpad; keep reference data on screen;
  reveal one sub-step at a time.

## 5. Anxiety / learned helplessness

- **Low-stakes framing lowers test anxiety**
  ([PMC12812151](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12812151/)); autonomy/competence
  support buffers it ([ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0361476X24000183)).
- Fixed mindset amplifies threat & disengagement; growth mindset + self-efficacy lowers anxiety
  ([NYIT](https://blogs.nyit.edu/cfe-weekly-teaching-notes/conquering_test_anxiety_a_growth_mindset_game_plan);
  [Tandfonline](https://doi.org/10.1080/2331186x.2018.1492337)). Teacher motivational support
  moderates the anxiety→helplessness link
  ([Educational Psychology](https://www.tandfonline.com/doi/full/10.1080/01443410.2017.1304532)).
- **UI:** no punishing timers; **growth-mindset wording** ("Not yet — try the step you missed",
  add "yet"); retry scaffolds + on-demand hints + reveal a worked step after error; de-emphasise
  raw scores, emphasise forward mastery movement.

## 6. WCAG 2.2 & COGA — most relevant success criteria

[WCAG 2.2](https://www.w3.org/TR/WCAG22/) · [COGA (supplemental)](https://www.w3.org/TR/coga-usable/)
- **1.4.3 / 1.4.6** Contrast · **1.4.8** Visual Presentation (≤80 char/line, no full justify,
  ≥1.5 spacing) · **1.4.12** Text Spacing · **1.4.4** Resize Text (200%).
- **2.2.1** Timing Adjustable · **2.2.3** No Timing → extended-time / no-timed-games.
- **2.3.1** Three Flashes · **2.3.3** Animation from Interactions → particles/juice.
- **3.1.3/3.1.4/3.1.5** Unusual Words / Abbreviations / Reading Level → plain language (§7).
- **3.2.3/3.2.4** Consistent Navigation/Identification · **3.2.6** Consistent Help (new 2.2) ·
  **3.3.7** Redundant Entry (new 2.2) · **2.4.11** Focus Not Obscured (new 2.2).
- **3.3.1/3.3.3** Error Identification & Suggestion → supportive errors (§5).
- COGA objectives (clear words, orient/predictable structure, avoid errors, provide help,
  personalization/user control, keep focus, clear feedback, allow enough time) map 1:1 onto the
  toggle set.

## 7. LLM question-generation implications

- Readability ≈ words/sentence + syllables/word (Flesch-Kincaid); "one idea per sentence" is a
  core plain-language rule ([IHS](https://www.ihs.gov/healthcommunications/plain-language/measuring-readability/);
  [MSKTC](https://msktc.org/sites/default/files/2023-05/MSKTC-PlainLanguageTool-508.pdf)).
- LLMs can be steered to grade-specific readability via prompt templates
  ([arXiv](https://arxiv.org/pdf/2601.06225)).
- **FK is English-tuned — do NOT port it to BM/ZH**; use multilingual readability
  ([ReadMe++ arXiv](https://arxiv.org/pdf/2305.14463)).
- **Prompt rules for `simplified_language` mode:** target ~2 grades below the student's grade
  for the *stem* (concept stays at grade level, only language simplifies); one idea/sentence,
  ≤~15 words; short stem with the question front-loaded in its own sentence; plain literal words,
  no idiom/double-negative; common vocab, define unavoidable terms inline; parallel MCQ options,
  no "all/none of the above"; per-language native-simple wording (for ZH avoid rare
  characters/chengyu). Emit a `simplified_stem` + `reading_grade` field so the UI can toggle a
  "simpler version" without a second round-trip (also feeds read-aloud). Optional readability
  gate → regenerate if stem exceeds target. Guard with existing `parse_llm_json`.

## 8. Ethical framing — toggles, not diagnoses

- Accommodations must be **user/teacher-selectable settings, never app-inferred diagnoses**
  (clinically invalid + stigma/data-protection risk). Aligns with COGA personalization/user
  control ([W3C COGA](https://www.w3.org/TR/coga-usable/)).
- **No diagnostic labels in the UI** — neutral comfort options ("Reduce motion", "Read aloud",
  "Larger text", "Calm mode", "Show a worked example"), not "ADHD mode"/"Dyslexia mode"
  ([accessibilitychecker](https://www.accessibilitychecker.org/blog/neurodivergent-ux-design/)).
- Teacher may enable per student, stored as **preferences not health data**, student-overridable,
  private to student/teacher (not shown to peers). Autonomy also supports the anxiety evidence (§5).

---

## Design checklist — toggleable accommodation settings

Per-student prefs (student- or teacher-set, student-overridable), surfaced as **neutral comfort
options**, syncable to Supabase like existing profile prefs.

| Toggle | What it does | Evidence |
|---|---|---|
| `reduce_motion` | kill shake/particles/parallax; honour `prefers-reduced-motion` | WCAG 2.3.3; motion = overload trigger |
| `no_flashing` (default on) | cap effects <3 flashes/sec | WCAG 2.3.1 |
| `mute_sfx` | mute game SFX; no autoplay sound | autism/ADHD sound trigger |
| `high_contrast` / `tinted_background` | dark text on cream/pastel, meet contrast min | BDA; WCAG 1.4.3/1.4.6 |
| `dyslexia_font` (opt-in) | Arial/Verdana default; OpenDyslexic only if user opts in | BDA; OpenDyslexic contested |
| `text_spacing` | 1.5 spacing, ≤70 char/line, left-ragged, no italics/underline | BDA; WCAG 1.4.8/1.4.12 |
| `larger_text` | scale text to 200% without breakage | WCAG 1.4.4 |
| `read_aloud` | edge-tts read stem + options (BM/EN/ZH) | TTS = dyslexia support |
| `focus_mode` / `calm_mode` | strip juice, pin layout, one item at a time | ADHD/CLT load; autism predictability |
| `extended_time` / `no_timed_games` | remove/extend timers; self-paced Flappy variant | WCAG 2.2.1/2.2.3; timers raise anxiety |
| `break_reminders` / `movement_break` | stretch/movement prompt every N items | movement aids ADHD attention |
| `simplified_language` | LLM short-stem, one-idea-per-sentence + `simplified_stem` field | plain language; WCAG 3.1.5 |
| `worked_example_first` | precede hard/KBAT with a solved analogue; steps one at a time | worked-examples effect |
| `show_scratchpad` / `allow_calculator` | on-screen scratchpad/calc; keep reference data visible | externalise working memory |
| `growth_feedback` | "Not yet / try the missed step"; retries; hints; de-emphasise score | growth mindset + low-stakes |
| `announce_difficulty_changes` | signal upcoming difficulty jumps | autism predictability |
| `consistent_help` | persistent help control; don't require re-entry | WCAG 3.2.6 / 3.3.7 |

**Stack mapping:** these ride on existing per-student Supabase prefs + `ProfileBanner`.
`simplified_language`/`worked_example_first` extend `schemas/assessment.py` (add `reading_grade`,
`simplified_stem`, reuse `worked_example`), guarded by `parse_llm_json`.
`reduce_motion`/`no_flashing`/`calm_mode` gate the gameKit juice engine + feed HUD. `read_aloud`
reuses the edge-tts layer.

---

### Limitations
`WebFetch` was blocked in the research environment; primary sources (full COGA text, BDA PDF)
were gathered via search summaries — URLs point to primaries for verification. The two most
important non-obvious results: (1) immediate feedback is **not** universally best for ADHD, and
(2) gamification/timed elements carry a real distraction/stress risk → both argue for making
salient/timed game elements **optional, not default-on**.
