# v1 vs v2: offline SLM benchmark

v2 = DSKP/textbook fact cards in prompts (177 content topics) + the v2 data fixes (`scripts/distill_v2.py`).
Same base model (Qwen2.5-1.5B, Q4_K_M, 986 MB), all local. Probes use 20 curriculum MCQs per language.
Probes run both models with the v2 prompts (context + correct answer), which is what the app will send.

| check | v1 | v2 |
|---|---|---|
| Evaluator recognises a correct answer (bm / en / zh) | 5% / 20% / 15% | **100% / 100% / 100%** |
| Evaluator: wrong answer gets one of Skor's 3 categories | 100% | 95-100% |
| Tutor does not affirm a wrong answer (bm / en / zh) | 30% / 100% / 95% | **100% / 100% / 100%** |
| Tutor does not reveal the key | 85-95% | 95-100% |
| Error category = Skor cloud's, real student rows* | 16% | **67%** |
| Error category inside Skor's enum, real rows | 41% | **100%** |
| Essay band = examiners' blind band (81 fresh essays) | 48% | 47% (baseline 40%) |
| Essay score error vs examiners (MAE) | 13.4 | **8.5** |
| Essays predicted as B | 49/81 | 60/81 |
| Valid JSON + schema, held-out pack | 99-100% | 97-100% (generator bm 90%) |
| Desktop latency: tutor / evaluator / essay (both passes) | 2-3 / 5 / 6 s | 2-3 / 5 / 7-12 s |

\* 39 of the 40 real rows were also training rows in both versions, so this measures consistency with the
cloud engine's labels more than generalisation.

## Correction after the v2 persona re-test (tuition + BM examiner, `reports/`)
My automatic probe overstated the tutor fix. It only caught "Betul/Correct" as the **first** word and only
an exact copy of the correct option. The examiners found "Kamu betul memahami 'pada' dan 'kepada' sama je",
3/4 live BM tutor replies affirming a wrong idea, and the tutor leaking the answer it is now given (3/5 BM
live). Human-style tallies:

| tally (tuition, all languages) | v1 | v2 |
|---|---|---|
| MCQ wrong key / no correct option | 63% (34/54) | 51% (36/70) |
| correct answers criticised by the evaluator | 14/14 | 2/10 (equivalent units still rejected) |
| evaluator feedback with a false fact | ~15% | 25% (7/28) |
| tutor hints wrong or misleading | 28% | 27% |
| tutor answer giveaways | 14% | 5% (BM examiner: 3/5 live) |

- **Fact cards:** about 33 errors (tuition) and 17 of 21 BM cards wrong (BM examiner): mostly bad BM/ZH
  terms from the local teacher ("Penyedapan" for damping, "Gas nobel", "Kesatuan Malaya", 高音谱号 for bass
  clef), true facts listed as misconceptions, and the Reid Commission omitted. Cards need subject-teacher review.
- **Generator:** printed formulas are ignored (1/14 numeric items correct with the formula on the card).
  Needs a deterministic key checker, or should not be used.
- **Language hygiene worked:** Indonesian forms 10 -> 0, "anda" 8 -> 0 in the BM pack.

## Read-out (before the persona re-test; see the correction above)
- **Fixed:** the evaluator no longer marks correct answers wrong, the tutor no longer says "Betul" to wrong
  BM answers, and error categories now match Skor's dashboard enum.
- **Not fixed: essay bands.** v2 is no better than v1 (47% vs examiners, barely above always-B).
  Scores are closer (MAE 8.5) only because absurd scores like 0/100 are gone. The bottleneck is labels:
  the local teacher grades almost every essay A (rubric diagnostics: 129/150 B-intended and 58/138
  C-intended essays came out A), and its BM/ZH essays only match their intended band 47-48% of the time.
- **Not measured yet:** whether the fact cards cut the false facts and wrong MCQ keys the tuition teacher
  found (63% wrong keys). That needs a human-style accuracy check, as in field test v1.

## Recommendation
- Offline essay grades: show only "Provisional" with a wide range (e.g. "B-ish") and confirm on resync.
  To improve them, get a calibration set graded by real teachers (or, with your OK, by examiner agents)
  and train on that instead of local-teacher labels.
- Keep the generator teacher-only; serve the cached question bank to students.
- Fact cards: `data/fact_cards.json` (key `subject|form|topic`) goes in the content pack; the app puts
  `prompts.card_text(card, lang)` into the prompt. Prompts and system strings: `scripts/prompts.py`.
