# Field test report: students-en-zh (Priya, Form 5 DLP; Zi Xuan / 陈子轩, Form 4 SMJK)

## Verdict

**Priya (A+ target): would not keep using it.** The essay grader under-rates a genuinely strong essay (B 72 for an A-standard piece) and returns improvements that are generic and sometimes contradict the essay ("include specific data" when the essay already cites UNICEF Malaysia). The evaluator never pinpoints the actual error. For example, it called `k < 6` (the lower bound -6 is missing) "Incomplete Answer, show more steps". The Physics MCQ she asked for has the wrong key. A high achiever would spot these errors within two sessions and stop trusting the app.

**Zi Xuan (Chinese-first learner): would keep chatting, but it would mislead him.** The language is right for him. It replies in natural simplified Chinese, keeps English terms such as `momentum`, `p = mv` and `kg m/s` as he typed them, and quietly maps BM *inersia* to 惯性. That part is a real strength. But on the core physics it told him his wrong answer was correct (live:students-en-zh-11, "你的计算是正确的" for 1200 + 20), it missed his 1200 x 20 = 2400 slip, and the Chinese MCQ it generated teaches that inertia = mass x acceleration with the unit kg m/s. He cannot detect these errors himself, which makes them more harmful for him than for Priya.

**I would not trust it in class without fixes to the evaluator and generator.** The tutor is the most usable job: it is on-language and usually ends with a question. It still sometimes gives away the answer or confirms a misconception.

## Live interactions (14 calls)

| req | student | task | result (short) | wall time* |
|---|---|---|---|---|
| 1 | Priya | essay en, strong ~260 w | B 72; generic feedback | 22 s |
| 2 | Priya | essay en, rushed ~140 w | C 62; generic feedback | 21 s |
| 3 | Priya | generator Physics F5 Bernoulli, Evaluate | wrong key ("inversely proportional") | 11 s |
| 4 | Priya | tutor: subtly wrong pseudo-force argument | did not refute it; misread her stance | 47 s |
| 5 | Priya | evaluator AddMaths discriminant, k<6 | "show more steps", missed the -6 bound | 82 s |
| 9 | Priya | evaluator momentum rebound, picked 0.5 | false claim "magnitude does not change" | 90 s |
| 10 | Priya | generator AddMaths Linear Programming, Create | answer RM1,500; true max is ~RM46 | 223 s |
| 6 | Zi Xuan | tutor zh mixed: "这个 momentum 我不懂…选 B 因为 1200 加 20" | good definitions, did not flag the addition | 71 s |
| 7 | Zi Xuan | tutor zh turn 2 (1200x20=2400? why kg m/s not N?) | missed the arithmetic slip, dodged the units question | 73 s |
| 14 | Zi Xuan | tutor zh+BM: "inersia 是什么意思？" | maps to 惯性, but reveals the answer | 61 s |
| 11 | Zi Xuan | evaluator zh, picked 1220 kg m/s | "你的计算是正确的" (wrong) | 89 s |
| 15 | Zi Xuan | evaluator zh short answer, seatbelt | partial; misses the "extend time" point; label "Language Barrier" | 40 s |
| 12 | Zi Xuan | generator zh Physics Inertia/Momentum | inertia = ma = 2000 kg m/s (wrong concept and wrong unit) | 104 s |
| 13 | Zi Xuan | essay zh 作文 ~280 字 | B 70; feedback generic but in good Chinese | 123 s |

*Wall times were inflated because other testers shared the CPU. The model-reported `seconds` in the pack is the cleaner signal: tutor ~2-3.5 s, evaluator ~4.6 s, generator ~8 s (max 12.2), essay ~5.7 s. On a phone at 2-4x that becomes tutor 5-14 s, evaluator 9-18 s, generator 16-50 s, essay 11-25 s. Tutor and evaluator times are acceptable. A 30-50 s generator on a phone is too slow for "next question" unless it is pre-generated in the background.

## Issues ranked by severity

### Critical
1. **Evaluator calls a wrong answer correct (zh).** live:students-en-zh-11: the student chose 1220 kg m/s (added m + v). The feedback says "你的计算是正确的，但需要更仔细。你可能在单位转换…上有些混淆". It never mentions multiplication or p = mv. The same "correct but…" pattern appears in the pack: evaluator-en-1 praises a correct answer and then files it as "Careless Error"; evaluator-en-7 says "The number is not six or eight, but eight". The reverse also happens: evaluator-zh-2, zh-5, zh-6 and zh-9 treat correct student answers as wrong and label them "Language Barrier".
2. **Generator teaches misconceptions with a wrong key.** live:students-en-zh-12 (zh): "汽车的惯性大小是多少？" is keyed 2000 kg m/s, and the rationale says "惯性是物体抵抗速度变化的力，其大小等于质量乘以加速度". Inertia is not a force, mass x acceleration is not inertia, and kg m/s is the unit of momentum. live:students-en-zh-3 (Bernoulli) is keyed "pressure difference is inversely proportional to velocity", while the v² option is closer to correct, and the object_lesson says the water "seemed to slow down as it hit the lower pressure area" (the reverse of Bernoulli). live:students-en-zh-10 (Linear Programming): with 2x+y<=12, x+3y<=15 and profit 5x+7y, the maximum is about RM46, but the keyed answer is RM1,500. The pack shows the same problems: generator-en-1 has two correct options (44.0 g/mol and 44.0 g·mol⁻¹); generator-en-17 has a photon energy at 500 nm whose true value (~4.0x10⁻¹⁹ J) matches no option; generator-en-15 gives the answer (2.5 m/s²) in the stimulus.
3. **Evaluator states false physics in its feedback.** live:students-en-zh-9: "When the ball rebounds, its momentum changes direction but not magnitude". The ball goes from 4 to 3 m/s, and the actual lesson is Δp = m(v - u) with signs (0.5x(3-(-4)) = 3.5). The feedback is filed as "Careless Error", so the teacher sees nothing useful either.

### Major
4. **Evaluator feedback never names the exact error, which is useless for an A+ student.** live:students-en-zh-5: the student wrote `k^2 < 36, therefore k < 6`. The feedback says "needs more steps … show the complete process". The real error, missing -6 < k (taking the square root of an inequality), is the single most common SPM mark-loss here and the model did not mention it. Pack evaluator-en-3 and evaluator-en-12 are similar ("small mistake… let's go through it step by step together" with no step given).
5. **Essay grading is compressed into the B 65-72 range, so strong essays cannot reach A.** live:students-en-zh-1: a well-structured argumentative essay with a concession, a cited source, a balanced recommendation and controlled register scored B 72. The 140-word rushed version scored C 62, only 10 points lower. In the pack, `B 65` is the modal score (en essay_pass1 items 1, 3 and 4, plus at least 8 essay items), and essays written to D are given B 65-70 (essaytest-essay-en-31, en-15, en-23). For Priya, a ceiling she cannot break through is demotivating, and it does not tell her whether she has reached A+.
6. **Essay pass 2 feedback is templated and sometimes contradicts the essay.** live:students-en-zh-1 asks her to "Include specific data or statistics" (already present) and "Use more varied vocabulary to avoid repetition" (no repetition is quoted). Almost every en essay in the pack gets "Use more varied vocabulary" plus "Clear structure with introduction, body, and conclusion". The zh feedback repeats "句子结构可更丰富，避免重复" and "结尾部分可更有力" (live:students-en-zh-13, essay_pass2-zh-1, zh-3, zh-5). None of it is SPM-rubric specific (format, task fulfilment, paragraphing, register), and none of it quotes a sentence.
7. **Tutor does not engage with a sophisticated wrong argument.** live:students-en-zh-4: Priya argued that the pseudo-force in the bus frame is a real forward force, so B is correct. The reply says "in the bus's frame, it's just a change in momentum… Can you explain why you think inertia is the cause here?" It neither identifies the non-inertial-frame fallacy nor understands that she argued *against* inertia. A strong student reads this as the tutor not following the argument.
8. **Tutor misses arithmetic slips and ignores the student's direct question.** live:students-en-zh-7: Zi Xuan wrote "1200 x 20 是 2400 对吗？… 为什么不是 N？". The reply skips both points (it should be 24000, and kg m/s ≠ N) and asks a vague question about force. Turn 1 (live:students-en-zh-6) also never flagged "1200 加 20".
9. **Tutor gives away the answer.** live:students-en-zh-14: "可能是因为乘客的惯性导致的", which is option A stated outright. Pack tutor-zh-2 says "比如钾" and tutor-en-1 works out the net force for the student. The pack also contains wrong physics in tutor hints: tutor-en-6 "When the amplitude doubles, the energy also doubles" (energy ∝ A², so it quadruples); tutor-zh-5 "质子数是6，这说明原子中有一个质子".

### Minor
10. **error_category "Language Barrier" is over-used in zh** (live:students-en-zh-15, evaluator-zh-2, zh-5, zh-6, zh-7). For a Chinese-medium student answering in Chinese this is not a plausible diagnosis, and the teacher dashboard would wrongly flag language support. In live:15 the actual gap was a missing concept: the seatbelt extends the stopping time and so reduces the impulsive force.
11. **Every tutor reply uses `explain_reasoning`** (live 4, 6, 7, 14 and nearly all pack tutor items). There is no move variety, and replies often open with "That's a good point!" even when the point is wrong.
12. **Generator stems lack context.** For example, "What is the wavelength of the wave?" and "根据题目的描述…" rely on a stimulus. Several object_lessons are a stringified dict (generator-zh-1, zh-5) or contradict the stimulus. generator-zh-6 failed the schema.
13. **The tutor does not explicitly bridge BM terms.** In live:14 Zi Xuan asked "inersia 是什么意思？华小没有学过这个词". The reply used 惯性 but never said "inersia = 惯性 = inertia". A one-line glossary would help SJKC-background students most.

## What works well
- **Language handling is the standout strength.** zh replies are natural simplified Chinese and keep the student's code-switched terms (`momentum`, `p = mv`, `kg m/s`) instead of awkwardly translating them. It never switched to English or BM when the student wrote mostly Chinese, and en replies stayed in en. zh essay feedback reads like a real 华文老师.
- **Definitions in live:students-en-zh-6 are correct and well matched to his level:** "inertia 是指物体抵抗速度变化的倾向，而 momentum 则是速度和质量的乘积".
- The tutor almost always ends with an open question and stays within 1-3 sentences, which makes it quick to read on a phone.
- The rushed essay scored lower than the strong one (62 vs 72), so the ranking direction is right even though the scale is compressed.
- Schema compliance is very high (only generator-zh-6 failed in the zh/en pack), and tutor/evaluator latency in the pack (~2-5 s desktop) is acceptable on phones.

```json
{"persona": "students-en-zh",
 "scores_1to5": {"accuracy": 2, "usefulness": 2, "tone_and_pedagogy": 3, "language_quality": 4, "speed_ux": 3},
 "issues": [
  {"severity": "critical", "type": "accuracy", "task": "evaluator", "lang": "zh", "item_id": "live:students-en-zh-11",
   "evidence": "student chose 1220 kg m/s (1200+20); feedback: \"你的计算是正确的，但需要更仔细\"",
   "fix": "Inject the correct option and the student's option into the prompt and require feedback to state why the chosen option is wrong; add a post-check that rejects 'correct' wording when student_answer != correct_answer; add training rows for wrong-operation errors."},
  {"severity": "critical", "type": "accuracy", "task": "generator", "lang": "zh", "item_id": "live:students-en-zh-12",
   "evidence": "\"汽车的惯性大小是多少？\" keyed \"2000 kg m/s\"; rationale \"惯性是…力，其大小等于质量乘以加速度\"",
   "fix": "Do not serve generator output to students offline without verification; prefer topic_anchors, or mark generated items 'unverified' and route them for cloud checking on sync. For numeric items, compute the key with a deterministic checker."},
  {"severity": "critical", "type": "accuracy", "task": "generator", "lang": "en", "item_id": "live:students-en-zh-10",
   "evidence": "LP 2x+y<=12, x+3y<=15, profit 5x+7y keyed \"RM 1,500\" (true max ~RM46)",
   "fix": "Same as above; filter out generated numeric/optimisation items whose key cannot be verified."},
  {"severity": "critical", "type": "accuracy", "task": "generator", "lang": "en", "item_id": "live:students-en-zh-3",
   "evidence": "keyed \"pressure difference is inversely proportional to the velocity\"; object_lesson \"seemed to slow down as it hit the lower pressure area\"",
   "fix": "Curate Physics F4/F5 generator training rows against DSKP; reject keys that a cloud check disagrees with on sync."},
  {"severity": "critical", "type": "accuracy", "task": "evaluator", "lang": "en", "item_id": "live:students-en-zh-9",
   "evidence": "\"its momentum changes direction but not magnitude\" (4 m/s -> 3 m/s)",
   "fix": "Add vector/sign-convention momentum rows to training; the feedback should show delta p = m(v-u) with signs."},
  {"severity": "major", "type": "pedagogy", "task": "evaluator", "lang": "en", "item_id": "live:students-en-zh-5",
   "evidence": "k^2<36 -> k<6 graded \"needs more steps… show the complete process\"",
   "fix": "Train the evaluator to quote the faulty step and name the missing piece (\"-6 < k\"); ban content-free phrases such as 'show more steps' and 'let's go through it together' unless they are followed by a concrete step."},
  {"severity": "major", "type": "accuracy", "task": "essay", "lang": "en", "item_id": "live:students-en-zh-1",
   "evidence": "strong argumentative essay with source, concession and register scored B 72; rushed 140-word version C 62; pack mode is B 65",
   "fix": "Rebalance essay_pass1 training data with more A and D anchors and penalise score collapse to 65; calibrate against SPM band descriptors; consider showing a band range instead of a point score offline."},
  {"severity": "major", "type": "pedagogy", "task": "essay", "lang": "en", "item_id": "live:students-en-zh-1",
   "evidence": "improvement \"Include specific data or statistics\" although the essay cites UNICEF Malaysia; \"Use more varied vocabulary to avoid repetition\" with no example",
   "fix": "Require each strength/improvement to quote or point to a sentence from the essay; add SPM-rubric dimensions (task fulfilment, organisation, language, register)."},
  {"severity": "major", "type": "pedagogy", "task": "essay", "lang": "zh", "item_id": "live:students-en-zh-13",
   "evidence": "\"句子结构可更丰富，避免重复\" / \"结尾部分可更有力\" (same lines as essay_pass2-zh-1, zh-3, zh-5)",
   "fix": "Diversify zh essay_pass2 targets; require reference to concrete content (e.g. 描写陈老师点头那一段可加入心理描写)."},
  {"severity": "major", "type": "pedagogy", "task": "tutor", "lang": "en", "item_id": "live:students-en-zh-4",
   "evidence": "student argued the pseudo-force is real; reply: \"in the bus's frame, it's just a change in momentum… explain why you think inertia is the cause\"",
   "fix": "Add tutor rows with plausible-but-wrong advanced arguments where the hint targets the faulty premise (non-inertial frame, no agent exerting the force)."},
  {"severity": "major", "type": "pedagogy", "task": "tutor", "lang": "zh", "item_id": "live:students-en-zh-7",
   "evidence": "student: \"1200 x 20 是 2400 对吗？…为什么不是 N？\"; reply ignores both",
   "fix": "Train the tutor to address an explicit student question or an arithmetic slip first (e.g. \"再算一次 1200 x 20，数一数有几个零？\")."},
  {"severity": "major", "type": "pedagogy", "task": "tutor", "lang": "zh", "item_id": "live:students-en-zh-14",
   "evidence": "\"可能是因为乘客的惯性导致的\" names option A directly",
   "fix": "Post-filter tutor replies that contain an option's text verbatim; regenerate or fall back to a generic invite_reasoning prompt."},
  {"severity": "major", "type": "accuracy", "task": "tutor", "lang": "en", "item_id": "tutor-en-6",
   "evidence": "\"When the amplitude doubles, the energy also doubles\"",
   "fix": "Audit tutor training rows for factual errors; energy is proportional to amplitude squared."},
  {"severity": "minor", "type": "accuracy", "task": "evaluator", "lang": "zh", "item_id": "live:students-en-zh-15",
   "evidence": "error_category \"Language Barrier\" for a conceptual gap (missing 'longer stopping time reduces impulsive force')",
   "fix": "Rebalance error_category labels in zh training data; reserve Language Barrier for actual language evidence."},
  {"severity": "minor", "type": "language", "task": "tutor", "lang": "zh", "item_id": "live:students-en-zh-14",
   "evidence": "student asked \"inersia 是什么意思？\"; reply uses 惯性 but never states inersia = 惯性 = inertia",
   "fix": "For zh/mixed input, add a short trilingual term gloss (BM / EN / 中文) when the student asks for a term meaning."},
  {"severity": "minor", "type": "ux", "task": "generator", "lang": "en", "item_id": "pack generator avg 7.8-8.4 s desktop",
   "evidence": "generator 8 s avg / 12 s max on desktop -> ~16-50 s on phone",
   "fix": "Pre-generate the next question in the background while the student answers the current one; show a skeleton or loading state."},
  {"severity": "minor", "type": "pedagogy", "task": "tutor", "lang": "en", "item_id": "live:students-en-zh-4",
   "evidence": "every tutor reply uses seda_move explain_reasoning; many open with \"That's a good point!\" for wrong ideas",
   "fix": "Balance SEDA moves in training data; avoid praising incorrect claims."}
 ]}
```
