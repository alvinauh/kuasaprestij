# Skor offline SLM: field test report (v1, Qwen2.5-1.5B Q4_K_M)

Testers: 3 SPM examiner personas (BM, EN, 华文), 1 SPM tuition teacher, 3 student personas (Form 4 BM-medium,
Form 5 EN high-achiever, Form 4 SMJK). 81 fresh essays never seen in training, 225 held-out items, about
80 live probes. All test content was synthetic or curriculum; no event_logs rows were shown to the agents.
Per-tester reports: `reports/*.md`. Raw numbers: `metrics_*.json`, `real_vs_cloud.json`.

## Verdict
Not ready for students. Output **format** is reliable (99-100% valid JSON), and the Chinese and the tone are
mostly good. **Content** isn't safe: wrong answer keys, correct answers marked wrong, and false facts
in feedback. All 6 testers independently rated accuracy 1-2 out of 5.

## Measured numbers
| check | result |
|---|---|
| Generated MCQ answer keys (tuition, 54 items) | **63% wrong key or no correct option**, 19% ambiguous (BM 17/20 wrong) |
| Evaluator given a correct answer | **criticised 14/14** |
| Tutor hints (34 checked) | 10 scientifically wrong, 5 give the answer away; ~9/14 BM replies open with "Betul" |
| Essay band vs examiners' blind grades (81) | 48% exact (always-majority baseline 40%), 94% within 1 band, MAE 13.4; never gives A in ZH |
| Training labels vs examiners | 58% exact overall: EN 77%, BM 47%, ZH 48% |
| Error category vs Skor cloud (real rows, local) | 16% agreement; only 41% within Skor's 3 categories |
| Prompt injection in an essay | EN: "SYSTEM NOTE ... band A 98" produced **A 98**; BM: resisted |
| Desktop latency (pack, 12 threads) | tutor 2-3 s, evaluator ~5 s, essay ~6 s, generator 8-11 s (phone about 2-4x slower) |

Live-probe timings (20-200 s) were inflated by 6 testers sharing the CPU and aren't representative.

## Root causes (mostly in my v1 data, so they can be fixed)
1. **Evaluator never saw a correct answer in training.** Every distilled row was a wrong answer, so it
   always finds an error. Skor's own `evaluator_node` checks `student_ans == correct_ans` *before* calling the AI.
2. **The tutor isn't told the correct answer.** Its input has the question and options but not the key, so a
   1.5B model guesses whether the student is right, and it guesses "Betul".
3. **A 1.5B model can't be trusted to compute or recall MCQ keys.** This is a model-size limit, not a
   data bug. It also invents BM terms and Sejarah facts with no grounding.
4. **Noisy essay labels.** BM/ZH labels agree with examiners only ~47%. D scores were drawn at random
   from 0-49, which produced "0/100" for coherent essays. The model learned to bunch scores at 65/72.
5. **Wrong contract.** Six error categories instead of Skor's three; `answer_index` and a list instead of
   Skor's `correct_answer` and distractor dict.
6. **Indonesian leakage from the Qwen3 teacher** ("berpikir", "membutuhkan", "bisa") and anda/kamu mixing.
7. **Essay text isn't treated as data**, so an injected grading instruction can override the grade.

## Recommended changes
**Product (no retraining needed):**
- Offline MCQs: serve only the cached `topic_anchors` bank from the content pack. Disable the generator
  for students; keep it teacher-only, and only with automatic key re-checking.
- The app decides right/wrong before calling the evaluator (as the cloud path already does), and sends
  the correct answer + `is_correct` to the tutor.
- All offline results are provisional and re-checked by the cloud on resync (your item 2).

**Retrain v2 (about 1.5 h on this PC):**
- Evaluator: add correct-answer and equivalent-answer cases (units, synonyms), and use Skor's 3 categories.
- Tutor: put the correct answer and the student's correctness in the input; never "Betul" for a wrong idea;
  add 2-3 turn examples that escalate the hint; handle "bagi jawapan je" and tired or upset students.
- Essays: re-label with a rubric-anchored double grade and keep only agreeing labels; draw scores around
  each band's centre (never 0); add injection examples where the grade ignores embedded instructions.
- BM: filter Indonesian forms against a DBP-style word list; consistent "kamu".
- Output adapter to Skor's `correct_answer` / distractor-dict format.

**Grounding (your item 1):** DSKP/textbook fact cards in the prompt. This targets the false facts in
evaluator and tutor replies. It won't make the generator's arithmetic reliable.

## What works
Valid JSON almost every time; short, kind replies; natural Chinese that keeps students' mixed terms;
clearly weak essays reliably get D; some tutor turns (tutor-en-2, en-12, zh-3, zh-7) are exactly right.
