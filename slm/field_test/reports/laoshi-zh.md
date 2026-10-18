# Field-test report: laoshi-zh (林老师, SMJK 华文 teacher, SPM 作文 examiner)

Scope: blind-graded all 21 zh essays first (`grades/laoshi-zh.json`), then reviewed all 57 items in `pack/zh.jsonl`, then ran 13 live probes (`requests/laoshi-zh-1..13`).

## Verdict

**I would not trust it in class in its current form, and I would not keep using it except as a JSON-shape demo.**

- **Essay grading** is close to random within the B band. It does reasonably at the extremes: very weak essays get D, and it is almost never off by two bands. But it cannot tell a polished essay from a plain one. It **never awarded an A** in 21 test essays plus 7 held-out essays plus my own A-standard probe. My best essay (zh-4) got 65, and one of my two weakest (zh-23) got 72. Eight of the 21 test essays got exactly 72 and five got exactly 65.
- The **优点/改进** feedback is a template. "可加入更多数据或研究结果增强说服力" appears in about two-thirds of essays, including narratives where "数据" makes no sense. It never once noticed a 错别字, a code-mixed sentence or a logical contradiction.
- **The evaluator is the most dangerous part.** It repeatedly tells students with a *correct* answer that they are "接近正确" and need to fix something. It logs a fake error on the teacher dashboard, and in two cases it teaches wrong biology.
- **Generated MCQs** have wrong answer keys in 4 of 9 cases I checked, one with duplicate options, and they are not KBAT.
- **The tutor** sounds natural and usually ends with a question. But it leaks the answer, and it treated a student who was right as if they were wrong.

The Chinese itself is fluent, uses correct Simplified characters, and mostly uses standard science terms. Language quality is the model's strongest point. Accuracy and judgement are its weakest.

## Essay grading: my blind grades vs the SLM

| id | mine | SLM | note |
|---|---|---|---|
| zh-4 线上学习与课堂学习之比较 | **A 82** | B 65 | Best essay in the set ("不可一概而论", "取长补短") got one of the lowest B scores |
| zh-0 运动在学校的重要性 | B 78 | B 72 | |
| zh-16 节约用水用电 | B 76 | B 72 | |
| zh-9 网络霸凌的危险 | B 75 | **C 53** | Clear argument with examples and solutions, under-scored |
| zh-20 考试时间管理真重要 | B 74 | **C 53** | Well organised and reflective, under-scored |
| zh-1 / zh-12 / zh-2 | B 72 / B 72 / B 72 | B 70 / B 65 / B 65 | |
| zh-13 / zh-8 / zh-21 / zh-18 | B 70 / B 69 / B 68 / B 66 | B 65 / B 72 / B 71 / B 72 | |
| zh-22 参观历史遗迹 | C 64 | B 72 | |
| zh-10 / zh-5 / zh-11 | C 63 / C 60 / C 60 | B 72 / B 70 / B 72 | Plain, list-like essays inflated |
| zh-3 / zh-6 / zh-15 | C 58 / C 54 / C 52 | C 52 / **B 71** / **B 65** | zh-6 has the 错别字 "重性" in the title |
| zh-23 运动在学校的重要性 | **D 48** | **B 72** | Childish repeated "运动可以…" short sentences given B |
| zh-19 参观历史遗迹 | D 44 | D 20 | |

- **Agreement with my grades:** exact band 11/21 (52%); within one band 20/21.
- **Ranking:** essentially no rank agreement in the B/C range. The model's scores collapse onto 65 / 72 / 70-71.
- **Agreement with `intended_band`:** 5/21. The pack's own labels look unreliable too: zh-23 is labelled "D 0" and zh-3 "D 3", which no examiner would give a coherent on-topic essay.
- **Held-out pass 1:**
  - `essay_pass1-zh-5` (a solid, organised 时间管理 essay; I would give it about B 75) got **D 34**. Telling a B student they failed is a serious error.
  - `essay_pass1-zh-1` (B 65) is also under-scored.

**Live probes**
- `laoshi-zh-1`: my own A-standard narrative (雨中花伞, with simile, a cross-race kindness theme and 升华) got **B 65**.
- `laoshi-zh-2`: a code-mixed weak essay ("很sad", "nasi lemak", "完。") got D 25. That band is right, but pass 2 praised "结尾部分简洁有力" for an ending that is literally "完。", and never mentioned the BM/English mixing.
- `laoshi-zh-3`: an essay full of 错别字 (我门, 保户, 垃极桶, 浪废, 种数, 二氧化炭) got D 25. That band is fine, but pass 2 **did not mention a single wrong character**. It also **invented content**: "提出具体行动建议如垃圾分类", although the essay never mentions 垃圾分类.

## Issues ranked by severity

### Critical

1. **Evaluator marks correct answers as wrong or incomplete and logs false errors for teachers.**
   - `evaluator-zh-2`: the student correctly said "团结合作". The model replied "需要更仔细检查句子结构" and logged a "Language Barrier … 翻译" error.
   - `evaluator-zh-5`: the student answered "公民参与", which is the key. The model then invented a definition contradicting the key: "公民参与指的是个人直接参与政府决策…而志愿者活动更多是个人自发的贡献".
   - `evaluator-zh-9`: the student said "强调", which is the key. The model invented a "设计原则 vs 设计方法" Careless Error.
   - `evaluator-zh-6`: the student's answer is essentially the key. The model's root cause says the student "混淆了昆虫和鱼类的循环系统类型", which is false.
   - `live:laoshi-zh-8`: a fully correct written answer was told "接近正确，但需要更详细".
   - `live:laoshi-zh-7`: a correct MCQ was still logged as `Insufficient Depth`.
   - Result: the teacher dashboard fills with phantom misconceptions.
2. **Evaluator teaches wrong science.**
   - `evaluator-zh-4`: "细胞呼吸发生在气孔关闭时". This is wrong: respiration happens all the time.
   - `evaluator-zh-7`: "柱头是雌性配子产生的部位". Wrong: the female gamete forms in the 胚珠 inside the 子房.
   - `live:laoshi-zh-7` and `live:laoshi-zh-9`: "细胞呼吸是植物进行光合作用和呼吸作用的共同过程", which is meaningless.
   - `evaluator-zh-8`: told a clearly wrong answer ("放大电流") that it was "接近正确".
3. **Generator answer keys are wrong.**
   - `generator-zh-3`: the stimulus gives T2 = 3 and T5 = 15, so T5 is **5倍** T2, but the key is "4倍".
   - `generator-zh-7`: the key "表皮：表皮细胞，保卫细胞，栅栏细胞和海绵细胞" is wrong. 栅栏/海绵细胞 belong to the 叶肉, which is option B.
   - `generator-zh-2`: options A and B are identical, and the object lesson says "燃料是机器的资产，而燃料的费用是机器的负债".
   - `live:laoshi-zh-10`: the stimulus has 100 g falling to 72 g in 24 days, and the key gives a half-life of "24天". The real half-life is about 50 days, and the stimulus itself gives away the wrong number.
4. **Essay pass 1 cannot recognise quality.**
   - No A was given in any of 29 essays.
   - Scores collapse to 65 or 72.
   - `essay_pass1-zh-5` gave D 34 to an essay of about B standard.
   - `essaytest-essay-zh-23` gave B 72 to a D/C-borderline essay.
   - "Provisional Grade" will mislead students about their real SPM standing.

### Major

5. **Tutor leaks the answer or confuses correct students.**
   - `tutor-zh-2` names the answer: "边缘黄化可能是因为缺乏其他营养素，比如钾".
   - `live:laoshi-zh-4` states it outright: "最终产物是葡萄糖和氧气".
   - `live:laoshi-zh-5`: the student chose the correct A with perfect reasoning. The tutor said "你的想法有道理，但光合作用的产物是葡萄糖和氧气，而不是二氧化碳和水", implying they were wrong.
   - `tutor-zh-1`: the student's working is correct (about 2.0×10⁵ Pa), but the tutor hinted at an error in "乘法顺序".
   - `tutor-zh-4`: affirms a wrong idea ("这确实和衍射现象有关") and says energy distribution changes "而不是振幅". This is wrong: amplitude does decrease after diffraction.
6. **Tutor gives factually wrong statements.**
   - `tutor-zh-5`: "质子数是6，这说明原子中有一个质子".
   - `tutor-zh-6`: misreads the student, asking "你为什么认为是超过三对脚" when the student said three pairs. It also missed the student's real misconception that all arthropods (节肢动物) have three pairs of legs; only insects do.
7. **Pass 2 feedback is template-driven and blind to real errors.**
   - "可加入更多数据或研究结果" appears for narratives (`essaytest-essay-zh-19`, `-15`, `-23`).
   - It never flags the title typo "重性" (`essaytest-essay-zh-6`).
   - It never flags the contradiction "拍了很多照片，但忘记带相机" (`-19`).
   - It never flags the logic flaw in `-8`: the essay says 忠诚 is "劝他改正", then gives an example of "没有责怪他".
   - It praises "语言流畅" for weak essays.
   - It suggests "可加入个人感受" to essays that are already full of personal feelings (`-22`, `-18`).
   - It repeatedly calls the level "初中". SPM candidates are 高中 (Form 4-5).
8. **Code-mixing and language leaks.**
   - `live:laoshi-zh-4`: the tutor replied with "光合作用确实需要碳 dioxide", half Chinese and half English. This is exactly the habit a 华文 teacher is trying to correct.
   - `live:laoshi-zh-2`: the model never flags "很sad", "pasar malam" or "nasi lemak" inside a 华文 essay.
   - `generator-zh-6` leaks the untranslated subject name "KSSM Pendidikan Seni Visual" (should be 视觉艺术).
   - `generator-zh-2` uses "马币"; textbooks use 令吉/RM.
9. **Generator is not KBAT and object lessons are nonsense.**
   - `generator-zh-4` asks "属于哪种类型的氧化还原反应?" with the answer "氧化还原反应", which is tautological. Its distractors are "酸性反应/碱性反应" and the object lesson has stray `**bold**`.
   - `generator-zh-5` has a cat whose fur turns from gold to "银色的金属" within one afternoon.
   - `live:laoshi-zh-12` asked for an "Evaluate"-level 成语 item. It produced pure recall with the answer in the stimulus, an invented "双全" comparison, and an object lesson that does not illustrate 一箭双雕.
   - `distractor_rationale` is always one generic sentence, not a reason per distractor.
10. **Speed.** Essays took 144-174 s of wall time on desktop (pass 1 13-26 s, pass 2 69-146 s). The CPU was shared with other testers, but at 2-4x slower on a phone this is far beyond the "45-90 s" notice. Tutor replies took 40-58 s and evaluator replies about 70 s on desktop, which is not "quick".

### Minor

11. **Format bugs.**
    - `object_lesson` is sometimes a stringified Python dict ("{'scenario': ...}") in `generator-zh-1`, `-5` and `-6`.
    - Options come prefixed with "A." in `generator-zh-5`.
    - `generator-zh-6` fails the schema and contains an `answer: "A"` that contradicts `answer_index: 1`.
    - `live:laoshi-zh-11` (Science F2 electricity) returned a JSONDecodeError after 134 s.
12. **error_category is overused.** "Language Barrier" is applied with "中文翻译" explanations to SJKC-background students for whom Chinese is the first language (`evaluator-zh-6`, `-7`, `live:laoshi-zh-13`). For a 成语 taken literally, "Misconception" or "vocabulary" fits better.
13. **No variety in `seda_move`.** It is always `explain_reasoning` (8 of 8 pack items, 3 of 3 live). `live:laoshi-zh-6` ("直接告诉我答案啦") got a slightly scolding "你为什么觉得不需要想呢?" and did not end on a real question.
14. **Pack input data problems.**
    - `evaluator-zh-1` is labelled Subject "Bahasa Melayu" and `evaluator-zh-2` "Bahasa Inggeris", but both are Chinese-language content items.
    - `tutor-zh-6` has duplicate options C and D.
    - "纯正价值观" is a BM calque of *nilai murni*.

## What works well

- The Chinese prose is fluent and natural, with correct Simplified characters. I found no Traditional characters in any output.
- Standard terms are used correctly most of the time: 光合作用, 细胞呼吸, 配子, 花药, 整流, 静水压, 公比.
- Every reply was valid JSON, except one generator item and one live generator call.
- Student-facing tone is warm and age-appropriate. Most tutor replies end with a question, and `tutor-zh-3`, `-7` and `-8` are genuinely good SEDA hints.
- Essay pass 1 places truly weak essays in D (`zh-19`, `live:laoshi-zh-2`, `live:laoshi-zh-3`) and is almost never off by two bands.
- `live:laoshi-zh-13` (半途而废) was a good, clear correction.

```json
{"persona": "laoshi-zh",
 "scores_1to5": {"accuracy": 1, "usefulness": 2, "tone_and_pedagogy": 3, "language_quality": 4, "speed_ux": 2},
 "issues": [
  {"severity": "critical", "type": "accuracy", "task": "evaluator", "lang": "zh", "item_id": "evaluator-zh-5", "evidence": "公民参与指的是个人直接参与政府决策…而志愿者活动更多是个人自发的贡献", "fix": "Add an exact/semantic-match check against correct_answer before calling the model; if it matches, return a fixed 'correct' template and no error_category. Add many correct-answer examples to training."},
  {"severity": "critical", "type": "accuracy", "task": "evaluator", "lang": "zh", "item_id": "live:laoshi-zh-8", "evidence": "你的回答接近正确，但需要更详细一些 (answer was fully correct)", "fix": "Train on correct and paraphrased-correct short answers labelled correct; do not emit teacher_insight errors for correct answers."},
  {"severity": "critical", "type": "accuracy", "task": "evaluator", "lang": "zh", "item_id": "evaluator-zh-7", "evidence": "柱头是雌性配子产生的部位", "fix": "Ground feedback in the DSKP/textbook chunk for the topic; filter outputs that make claims not in the key or the retrieved context."},
  {"severity": "critical", "type": "accuracy", "task": "evaluator", "lang": "zh", "item_id": "evaluator-zh-4", "evidence": "细胞呼吸发生在气孔关闭时", "fix": "Same as above; add a science-fact review pass on zh distilled data."},
  {"severity": "critical", "type": "accuracy", "task": "generator", "lang": "zh", "item_id": "generator-zh-3", "evidence": "第2项是3，第5项是15 … key '4倍'", "fix": "Do not show offline-generated MCQs to students without verification; at minimum compute numeric keys programmatically or queue for cloud check."},
  {"severity": "critical", "type": "accuracy", "task": "generator", "lang": "zh", "item_id": "live:laoshi-zh-10", "evidence": "100 克 … 24 天后 … 72 克; key 半衰期 24天", "fix": "Same; reject items whose stimulus contains the keyed answer."},
  {"severity": "critical", "type": "accuracy", "task": "generator", "lang": "zh", "item_id": "generator-zh-7", "evidence": "key: 表皮：表皮细胞，保卫细胞，栅栏细胞和海绵细胞", "fix": "Prefer topic_anchors; mark generated items provisional and hide until synced."},
  {"severity": "critical", "type": "accuracy", "task": "essay", "lang": "zh", "item_id": "essay_pass1-zh-5", "evidence": "solid organised essay scored D 34 (examiner ~B 75)", "fix": "Retrain pass1 with balanced A/B/C/D zh essays and examiner-verified labels; current labels (e.g. 'D 0' for coherent essays) are noisy. Consider showing band only, not score."},
  {"severity": "major", "type": "accuracy", "task": "essay", "lang": "zh", "item_id": "essaytest-essay-zh-4", "evidence": "best essay in set (不可一概而论, 取长补短) scored B 65; zh-23 scored B 72", "fix": "Add rubric-anchored exemplars per band (内容/语言/结构) to the prompt; calibrate so A is reachable; evaluate with rank correlation, not just schema_ok."},
  {"severity": "major", "type": "pedagogy", "task": "essay_pass2", "lang": "zh", "item_id": "live:laoshi-zh-3", "evidence": "no mention of 我门/保户/垃极/浪废/种数/二氧化炭; invents '垃圾分类'", "fix": "Train pass2 to cite concrete errors (错别字, 病句, 逻辑矛盾) quoted from the essay; ban generic '数据或研究结果' for narrative genres."},
  {"severity": "major", "type": "pedagogy", "task": "tutor", "lang": "zh", "item_id": "live:laoshi-zh-4", "evidence": "最终产物是葡萄糖和氧气，而不是二氧化碳和水", "fix": "Post-filter replies containing any option text (esp. the correct one); regenerate."},
  {"severity": "major", "type": "pedagogy", "task": "tutor", "lang": "zh", "item_id": "live:laoshi-zh-5", "evidence": "student correct (A); tutor: 你的想法有道理，但光合作用的产物是葡萄糖和氧气", "fix": "Pass correctness of the student's choice to the tutor prompt and train an 'affirm and extend' path for correct students."},
  {"severity": "major", "type": "accuracy", "task": "tutor", "lang": "zh", "item_id": "tutor-zh-5", "evidence": "质子数是6，这说明原子中有一个质子", "fix": "Add fact-check examples; shorter, question-only replies reduce room for false statements."},
  {"severity": "major", "type": "language", "task": "tutor", "lang": "zh", "item_id": "live:laoshi-zh-4", "evidence": "光合作用确实需要碳 dioxide", "fix": "Train with code-mixed student inputs (Chinese + English/BM terms) whose replies use pure Chinese with the English term in brackets once, e.g. 二氧化碳 (carbon dioxide)."},
  {"severity": "major", "type": "pedagogy", "task": "essay_pass2", "lang": "zh", "item_id": "live:laoshi-zh-2", "evidence": "praises '结尾部分简洁有力' for an ending '完。'; ignores '很sad', 'nasi lemak'", "fix": "Teach pass2 to flag 夹杂英文/马来文 in 华文作文 as an improvement point."},
  {"severity": "major", "type": "ux", "task": "essay", "lang": "zh", "item_id": "live:laoshi-zh-1", "evidence": "pass1 13.6 s + pass2 129.7 s on desktop", "fix": "Cap pass2 max_tokens, shorten items, or only run pass1 offline; update the 45-90 s notice to match real phone timings."},
  {"severity": "minor", "type": "format", "task": "generator", "lang": "zh", "item_id": "generator-zh-1", "evidence": "object_lesson: \"{'scenario': '…'}\"", "fix": "Add a GBNF grammar for the generator so object_lesson is a plain string; strip 'A.' prefixes and markdown."},
  {"severity": "minor", "type": "language", "task": "generator", "lang": "zh", "item_id": "generator-zh-6", "evidence": "根据KSSM Pendidikan Seni Visual课程", "fix": "Map subject names to Malaysian Chinese names (视觉艺术, 道德教育, 会计原理) before prompting."},
  {"severity": "minor", "type": "pedagogy", "task": "evaluator", "lang": "zh", "item_id": "evaluator-zh-7", "evidence": "Language Barrier … 中文翻译理解有误", "fix": "Do not default to Language Barrier for Chinese-medium students; balance error_category labels in training."}
 ]}
```
