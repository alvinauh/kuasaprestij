# SPM Format Alignment Guide

Documents every format change made to align KuasaPrestij question generation with real SPM paper structure. Use this as the reference when reviewing generated questions or writing new prompt updates.

---

## Subjects with definite SPM format examples (implemented)

| Subject | SPM Code | Papers |
|---|---|---|
| Bahasa Melayu | 1103 | Kertas 1 (Karangan), Kertas 2 (Pemahaman, Rumusan, KOMSAS, Tatabahasa) |
| Bahasa Inggeris | 1119 | Paper 1 (Directed Writing, Continuous Writing), Paper 2 (Reading, Grammar, Literature) |
| Physics | 4531 | Paper 1 (MCQ), Paper 2 (Structured, Essay) |
| Biology | 4551 | Paper 1 (MCQ), Paper 2 (Structured, Essay) |
| Chemistry | 4541 | Paper 1 (MCQ), Paper 2 (Structured, Essay) |
| Mathematics | 1449 | Paper 1 (MCQ), Paper 2 (Structured, show working) |
| Additional Mathematics | 3472 | Paper 1 (Short answer, no options), Paper 2 (Structured sub-parts) |
| Sejarah | 1249 | MCQ with stimulus, Structured, Essay |
| Geografi | — | MCQ with map/data stimulus, Structured |

---

## SPM Paper Format Reference

### MCQ (All Paper 1 Objective questions)

**Real format:**
```
Diagram 1 shows a spring balance with a load attached. 
The reading is 5.0 N and the spring extends 10 cm.
What is the spring constant?

A  0.5 N cm⁻¹
B  5.0 N cm⁻¹
C  50 N cm⁻¹
D  500 N cm⁻¹
```

**Rules implemented in prompts:**
- Stimulus FIRST (scenario, described diagram, data table) — then question stem
- Exactly 4 options, no A./B./C./D. prefix in the option text itself
- Correct SI units and realistic values for science/maths
- Distractors from real misconceptions (unit errors, sign errors, direction confusion)
- Options parallel in structure and similar in length
- Correct answer must NOT be obviously longer or differently styled

---

### Short Answer / Structured (Paper 2 Section A)

**Real format:**
```
Diagram 2 shows a ball thrown horizontally from a cliff of height 20 m.
The ball lands 15 m from the base of the cliff.

(a) State the type of motion of the ball in the horizontal direction.    [1 mark]
(b) Calculate the time taken for the ball to reach the ground.           [2 marks]
(c) Determine the initial horizontal velocity of the ball.               [2 marks]
```

**Rules implemented in prompts:**
- Stem contains scenario/observation (described diagram, experiment result)
- Sub-parts labeled (a), (b), (c) with `[x marks]` in square brackets
- Sub-parts progress: recall → application → analysis/evaluation
- Sum of sub-part marks = max_marks (currently 4 for structured)
- Marking scheme is per sub-part, not global
- Students must SHOW WORKING for maths (method marks + accuracy marks)

**New JSON field added:** `sub_parts` array
```json
"sub_parts": [
  {"label": "(a)", "question": "...", "marks": 2, "sample_answer": "..."},
  {"label": "(b)", "question": "...", "marks": 2, "sample_answer": "..."}
]
```
The evaluator still uses `key_concepts` + `marking_rubric` for grading. `sub_parts` is for frontend display only.

---

### Essay (Paper 2 Section B / Section C)

**Real format:**
```
Based on the following information:

A student places a copper wire in a solution of silver nitrate. 
After 30 minutes, the student observes that a grey layer forms on the copper wire 
and the blue colour of the solution fades.

Explain the observations above using your knowledge of redox reactions.   [10 marks]
```

**Rules implemented in prompts:**
- Opens with "Based on the following information:" stimulus (2-4 sentences)
- Task instruction is separate from stimulus
- Marking bands: A (8-10) / B (5-7) / C (1-4) — aligned with SPM marking
- Content marks (for correct points) + communication marks (language clarity)
- Model answer: 150-200 words, intro + body points + conclusion

**New JSON field added:** `stimulus`
```json
"stimulus": "Based on the following information: [scenario text]",
"question": "Explain the process described above... [10 marks]"
```

---

## Bahasa Melayu Format Details (SPM 1103)

### Kertas 1 Bahagian B — Karangan Bebas
- Type must be specified: rencana, surat rasmi, artikel, pidato, dialog
- Provide tajuk/tema and bahan rangsangan (stimulus)
- 3 isi pokok as guiding hints
- Minimum 350 patah perkataan
- Question type: essay only, no MCQ options

### Kertas 2 Bahagian B — Pemahaman dan Rumusan
- 150-200 word teks (passage)
- Sub-parts: (a) pemahaman tersurat [3 marks], (b) pemahaman tersirat [3 marks], (c) rumusan ≤80 patah perkataan [4 marks]
- Teks included in `illustrative_notes` for student reference

### Kertas 2 Bahagian D — KOMSAS
- Tests: watak/perwatakan, tema/persoalan, nilai murni, latar, plot, gaya bahasa
- NEVER invent specific text titles or character names — frame generically
- Sub-parts: (a)[3 marks] + (b)[4 marks]

### Kertas 2 Bahagian A — Tatabahasa
- Always embed in sentence context (never test grammar in isolation)
- Tests: imbuhan, pembinaan ayat, peribahasa/simpulan bahasa, kata, sintaksis
- MCQ: 4 options A, B, C, D

---

## Bahasa Inggeris Format Details (SPM 1119)

### Paper 2 Section C — Literature

| Genre | Sub-parts |
|---|---|
| Poems | (a) word/phrase meaning [2 marks], (b) poetic device + effect [2 marks], (c) theme with evidence [4 marks] |
| Short Stories | (a) character trait + evidence [3 marks], (b) theme with event reference [4 marks] |
| Drama | (a) character + motivation [3 marks], (b) theme/moral value + justification [4 marks] |
| Novel | (a) character description + role [4 marks], (b) moral value + evidence [3 marks] |

**Critical rule:** NEVER name real SPM set texts (Parable of the Old Man and the Young, etc.) — frame generically.

### Paper 2 Section B — Language Awareness (Grammar)
- Always in sentence context — never isolated
- Tested points: tenses, SVA, prepositions, conjunctions, active/passive, reported speech, modals, articles
- MCQ with 4 options

### Paper 2 Reading Comprehension (Thematic Topics)
- 4-6 sentence passage provided as stimulus
- Question requires INFERENCE or EVALUATION — not direct retrieval
- Passage goes in `illustrative_notes` field
- MCQ for adaptive mode; sub-parts (a)[2 marks]+(b)[3 marks] for structured mode

---

## Sciences Format Details (Physics / Biology / Chemistry)

### Paper 1 — 50 MCQ (1h 15min)
- Always stimulus-based (described diagram, scenario, data)
- Correct SI units: N, J, W, m/s², mol, mol/L, °C/K, etc.
- Distractors: unit confusion, sign errors, direction errors, formula misapplication

### Paper 2 Section A — 7 Compulsory Structured Questions (60 marks)
- Each question: 8-10 marks total across (a)(b)(c)(d) sub-parts
- Marks shown in square brackets per sub-part
- Progression: state → explain → calculate → evaluate

### Paper 2 Section B/C — Essay (10-20 marks)
- Opens with "Based on the following information:" stimulus
- Asks to explain/describe/compare/evaluate
- Marking: content points (science knowledge) + communication (language quality)

---

## Mathematics / Additional Mathematics Format Details

### Mathematics 1449 — Paper 2 Section A
- Show full working — method marks even if final answer wrong
- Sub-parts clearly labelled with marks
- Given values clearly stated in stem

### Additional Mathematics 3472 — Paper 1
- Short answer, NO multiple choice options
- Students write answers with full working
- Mark scheme: M (method) + A (accuracy) marks

---

## Files Changed

| File | Lines Changed | What Changed |
|---|---|---|
| `agents/orchestrator.py` | `_subject_topic_hint()` | Expanded from 5 hints to 16 detailed SPM format hints covering all major subjects |
| `agents/orchestrator.py` | `studio_node` TASK 2 | Added SPM Paper 1 MCQ format instruction (stimulus, parallel options, misconception distractors) |
| `agents/orchestrator.py` | `generator_node` listening | Added SPM 1119 inference-based listening requirement |
| `agents/orchestrator.py` | `generator_node` short_answer | Added SPM Paper 2 sub-parts (a)(b)(c) format; new `sub_parts` JSON field |
| `agents/orchestrator.py` | `generator_node` essay | Added SPM stimulus ("Based on the following information:"); new `stimulus` JSON field; aligned marking bands |
| `agents/orchestrator.py` | `generator_node` MCQ | Added SPM Paper 1 format (stimulus, parallel options, realistic units, parallel structure rule) |
| `agents/quiz_agent.py` | `_SHORT_ANSWER_PROMPT` | Same sub-parts format as generator_node |
| `agents/quiz_agent.py` | `_ESSAY_PROMPT` | Same stimulus + aligned marking bands |
| `agents/quiz_agent.py` | `_MCQ_PROMPT` | Same SPM Paper 1 format instruction |

---

## Frontend Display — Mode 1 (Exam Paper) vs Mode 2 (Feedback)

### Mode 1: Exam Paper Section (while answering)

The question `<section>` card in `src/routes/index.tsx` is forced to a **white paper** aesthetic regardless of the app's dark theme. This creates a clear visual separation: white paper = exam content, dark background = game shell.

**Elements within the white paper card:**
| Element | Styling decision |
|---|---|
| Card background | `bg-white text-zinc-900 border-zinc-200 shadow-md` — forced white even in dark mode |
| Card when feedback visible | `opacity-75` — dims slightly to let the feedback Sheet draw attention |
| Concept note button | `bg-amber-50 border-amber-200 hover:bg-amber-100` — warm note-card feel |
| Stimulus material | Left purple accent bar (`w-1 bg-primary`), `bg-primary/5`, `text-zinc-700` |
| Paper/Section label | `Paper 1 · Section A` / `Kertas 2 · Bahagian B` chip, colour `text-primary` |
| KBAT level badge | Colour-coded: C1 zinc, C2 blue, C3 emerald, C4 amber, C5 orange, C6 red (all on white) |
| Question h1 | `text-xl font-semibold text-zinc-900` (inherits from section) |

**Stimulus fix:** Now shows for ALL question types (not just essay). Before it only triggered on `question_type === "essay"`.

**Sub-parts display (SPM format):**
- Flat list inside one card, separated by dividers (no card-per-part)
- Label **(a)** in `text-primary`, bold, inline before question text
- Marks right-aligned in bracket notation: `[2 markah]` / `[2 marks]`
- Textarea height: `min-h-[44px]` for 1-mark, `min-h-[72px]` for multi-mark

**MCQ options (exam answer-sheet style):**
- Neutral white card per option, `bg-card border-border/40`
- Circular letter badge (A/B/C/D) — neutral grey when unselected, coloured when tapped/flashing
- No full-button colour fill (removed red/blue/yellow/green blocks — too gamified for exam)
- Correct flash = green pulse on border; wrong = red shake

**Essay textarea:**
- Live word count shown bottom-right (`N patah perkataan` / `N words`)

### Mode 2: Gamified Feedback (after answer)

The `<Sheet side="bottom">` slides up with the existing gamified design:
- Correct: `border-neon-green`, `🎉 Spot On!`
- Wrong: `border-destructive`, `💡 Not quite…`
- Partial/essay: marks scored bar with `📝 Graded` + progress bar
- Level up: green gradient animation with `🚀 Level Up!`
- Source excerpt (textbook grounding) shown in amber card if present
- "Next Question" button → dismisses sheet, loads new question

The exam card dims slightly during Mode 2 to keep focus on the Sheet.

---

## Student Personalization (localStorage, no DB schema change)

Saved under key `kp_prefs` in localStorage. Persistent per device.

| Feature | Options | Implementation |
|---|---|---|
| Avatar emoji | 12 options: 🎓🦁🐯🦊🐺🦅⚡🔥🌟💎🚀🎯 | Shown next to username in side-actions row |
| Accent colour | Purple / Blue / Green / Orange / Red | Swaps `--primary`, `--primary-glow`, `--ring`, `--gradient-primary`, `--shadow-glow` CSS vars on `:root` |
| Text size | Small / Medium / Large | Adds `text-sm` / `text-base` / `text-lg` class to `<main>` |
| Sound effects | On / Off toggle | Saved to prefs; actual sound gate to be wired when SFX added |

**Files added:**
- `src/hooks/useStudentPrefs.ts` — hook, THEMES map, FONT_SIZE_CLASS map
- `src/components/StudentSettingsSheet.tsx` — Sheet UI with avatar grid, colour swatches, size buttons, sound toggle

**Access:** Settings gear icon (⚙) in top-right header, next to sign-out button.

---

## Subjects NOT yet aligned (insufficient format certainty)

- Pendidikan Moral — specific SPM format not certain enough to implement
- Prinsip Perakaunan — paper structure varies, not implemented
- Pendidikan Muzik / Pendidikan Seni Visual — very small student base, low priority
- Bahasa Cina — implemented general hints but SPM 华文 exact paper structure less certain; review with a subject matter expert

---

## What's still missing (next steps for full SPM alignment)

1. **Past year questions** — AI-generated questions still cannot replace SPM past years. Seed `topic_anchors.question_bank` with actual public-domain past year questions reviewed by a subject expert.
2. **Mark allocations** — `max_marks` is hardcoded (4 for structured, 10 for essay). Real SPM Paper 2 Section A questions range from 8-12 marks; Section B/C from 10-20 marks. Make `max_marks` configurable per session.
3. **Directed Writing format (English Paper 1 Section A)** — Currently classified as essay (10 marks). Real SPM Paper 1 Section A is 35 marks (directed writing: letter, article, report, speech). Needs a separate `directed_writing` question type.
4. **Karangan stimulus (BM Paper 1 Section A)** — Real SPM Kertas 1 Bahagian A is guided writing based on a visual stimulus (table, infographic). Needs `guided_writing` question type.
5. **Science diagrams** — Currently described in text. Frontend needs to render actual diagram images for full SPM Paper 1 fidelity.
6. **Additional Maths Paper 1 (no-option short answer)** — Currently forces MCQ mode. Needs a `short_answer_noOptions` type for AMath Paper 1.
