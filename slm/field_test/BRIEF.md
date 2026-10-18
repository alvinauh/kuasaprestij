# Skor offline SLM field test: brief for persona testers

## What you are testing
Skor (KuasaPrestij) is an adaptive assessment and teaching app for Malaysian secondary schools (KSSM/SPM),
in Bahasa Melayu (bm), English (en) and Mandarin (zh). When the phone is offline, a small on-device model
(Qwen2.5-1.5B, 4-bit GGUF, run by llama.cpp) replaces the cloud AI. It does five jobs, and each returns JSON:

| task | what the student/teacher sees |
|---|---|
| generator | a new KBAT multiple-choice question: question, 4 options, answer_index (0-3), distractor_rationale, stimulus, object_lesson |
| evaluator | after a wrong answer: `student_feedback` shown to the student, and `teacher_insight` {error_category, root_cause_analysis, actionable_intervention} shown on the teacher dashboard |
| tutor | SEDA chat hint: `seda_move` + a 1-3 sentence `reply` that should NOT reveal the answer and should end with an open question |
| essay pass 1 | provisional band A-D + score 0-100 (A 80-100, B 65-79, C 50-64, D 0-49), shown as "Provisional Grade (Offline)" |
| essay pass 2 | 1-5 `strengths` + 1-5 `improvements` |

Phone timing context: the app tells students essays take ~45-90 s offline; other replies should feel quick.
Desktop timings in these files are roughly 2-4x faster than a mid-range phone.

All content here is synthetic or from the curriculum question bank. There is no real student data.

## Files (Windows paths)
- `D:\kuasaprestij\skor_slm\skor_slm\field_test\pack\{bm,en,zh}.jsonl`: one JSON item per line:
  `id, task, lang, input` (what the app sent), `slm_output` (what the model returned), `schema_ok`, `seconds`,
  `reference` (the training-data answer for the same input, written by a larger teacher model; it is a
  reference, not ground truth), `source`.
  Essay items (`task: "essay"`) carry `reference.intended_band`: the band the essay was written to.
- `D:\kuasaprestij\skor_slm\skor_slm\field_test\pack\essays_blind_{bm,en,zh}.json`: the same essays with no grades.

## Live tool: talk to the model yourself
1. Write a request file with the Write tool to
   `D:\kuasaprestij\skor_slm\skor_slm\field_test\requests\<your-persona>-<n>.json`
   (always prefix with your persona name so testers don't collide), for example:
   ```json
   {"task": "tutor", "lang": "bm", "subject": "Physics", "topic": "Force and Motion",
    "question": "...", "options": ["...", "...", "...", "..."], "student_message": "..."}
   {"task": "evaluator", "lang": "en", "subject": "Biology", "question": "...", "options": ["..","..","..",".."],
    "correct_answer": "<option text>", "student_answer": "<what the student picked or wrote>"}
   {"task": "generator", "lang": "zh", "subject": "Chemistry", "form": 4, "topic": "...", "kbat": "Analyse"}
   {"task": "essay", "lang": "en", "title": "...", "essay": "..."}
   ```
   For a short written answer to the evaluator, leave out `options`.
2. Run it with the PowerShell tool (not Bash):
   `wsl.exe -d Ubuntu-24.04 -- bash /mnt/d/kuasaprestij/skor_slm/skor_slm/field_test/ask.sh <your-persona>-<n>`
3. Read the result with the Read tool: `...\field_test\requests\<your-persona>-<n>.result.json`
   (use this rather than the console output, which can garble Chinese).
Each call takes ~5-15 s because other testers share the CPU. Keep to about 15 live calls.
The tutor is single-turn: to simulate a follow-up, put the earlier exchange into `student_message`.

## Rules
- Only write inside `D:\kuasaprestij\skor_slm\skor_slm\field_test\` (requests/, reports/, grades/). Do not
  edit scripts or anything else, and do not use web search or any external service.
- Stay in character, but report like a professional reviewer: specific, with item ids and short quotes.
- Judge accuracy against the KSSM/SPM curriculum and real classroom practice, not against `reference`.

## Deliverables
1. Report: `field_test\reports\<your-persona>.md`. Lead with your verdict (would you trust it in class /
   would you keep using it?), then your issues ranked by severity, then what works well. End with this
   JSON block:
   ```json
   {"persona": "...",
    "scores_1to5": {"accuracy": 0, "usefulness": 0, "tone_and_pedagogy": 0, "language_quality": 0, "speed_ux": 0},
    "issues": [{"severity": "critical|major|minor", "type": "accuracy|pedagogy|ux|language|format|safety",
                "task": "...", "lang": "...", "item_id": "... or live:<request name>",
                "evidence": "short quote", "fix": "concrete suggestion"}]}
   ```
2. Your final message back: a 10-15 line summary — verdict, the scores, and the top 5 issues.
