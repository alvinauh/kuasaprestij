# Field test report: `tuition` (Mr. Lim Wei Jie, SPM tuition centre, Johor Bahru)

Subjects I teach: Physics, Chemistry, Biology, Mathematics, Additional Mathematics, Sejarah (Form 4-5, English and BM).
Focus: factual and exam accuracy of the generator, evaluator and tutor outputs in bm, en and zh. Essays were skipped.

## Verdict

**I would not use this in class, and I would not let a student use it on their own.** In its current state the offline model is not safe for exam preparation:

- **Generator: 63% of the MCQs it produced had a wrong answer key** (34 of 54, counting the pack and my live probes). Most of the rest were ambiguous or not real questions. Only about 1 MCQ in 5 could go to a student unedited. In BM it is close to 0: 17 of 20 pack MCQs have a wrong key, and many use invented concepts ("Tenaga tenaga", "pemecutan genetik", "pengangkutan terbuka").
- **Evaluator: it cannot recognise a correct answer.** In 6 of my 6 live probes I sent a correct answer, and every time it told the student they were "close", "almost right" or had "a careless error". This happened even when the student picked exactly the keyed option (live:tuition-15) or wrote a correct unit conversion (2000 Ω vs 2.0 kΩ, 0.009 kJ vs 9.0 J). The pack shows the same thing in all three languages. A student who is right and is told they are wrong learns to distrust correct working. For a tuition teacher that is the worst failure possible.
- **Tutor: about 1 hint in 3 is scientifically wrong or gives away the answer.** Examples: "When the amplitude doubles, the energy also doubles" (energy is proportional to amplitude squared), "This spreading out affects the wavelength" (diffraction does not change the wavelength), and "sel darah merah memang membutuhkan air untuk bertumbuh", which affirms a student's wrong osmosis answer. The tone is good. The physics is not.

Before this model generates or grades anything without a human in the loop, every generated item needs a deterministic numeric check of its key, and every evaluator call needs an "is the student answer equivalent to the correct answer?" gate. Today it is a liability for exam content.

## Tallies

### MCQ key check (generator outputs; I solved every one myself)

| Source | MCQs checked | Wrong key / no correct option | Ambiguous (2+ correct, duplicate options, data insufficient or inconsistent) | Acceptable key |
|---|---|---|---|---|
| pack en | 20 | 8 (40%) | 7 | 5 |
| pack bm | 20 | 17 (85%) | 2 | 1 |
| pack zh | 7 | 3 (43%) | 1 | 3 |
| **pack total** | **47** | **28 (60%)** | **10 (21%)** | **9 (19%)** |
| live (en 4, bm 2, zh 1) | 7 | 6 (86%) | 0 | 1 |
| **grand total** | **54** | **34 (63%)** | **10 (19%)** | **10 (19%)** |

Wrong keys:
- en: generator-en-5, 7, 8, 9, 11, 14, 17, 20
- bm: generator-bm-1, 2, 3, 4, 5, 7, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20
- zh: generator-zh-3, 6, 7
- live: tuition-1 to tuition-6

Ambiguous:
- en: generator-en-1, 3, 4, 6, 13, 18, 19
- bm: generator-bm-6, 8
- zh: generator-zh-2

Only acceptable live item: tuition-7. Even the "acceptable" items are almost all recall questions labelled KBAT Apply/Analyse. Real KBAT (multi-step, data interpretation) appeared 0 times with a correct key.

### Evaluator

| Lang | Items | Substantive error (wrong verdict, wrong science, or wrong diagnosis) | Correct student answer wrongly criticised |
|---|---|---|---|
| en | 12 | 5 (en-1, en-2, en-7, en-9, en-12) | en-1 (insight says "Careless Error"), en-2 (2.5 N·kg⁻¹ is the same as 2.5 m/s²) |
| bm | 13 | 6 (bm-2, bm-3, bm-4, bm-6, bm-7, bm-9) | bm-2, bm-9 |
| zh | 9 | 6 (zh-2, zh-4, zh-5, zh-6, zh-7, zh-9) | zh-2, zh-5, zh-6, zh-9 |
| live | 6 (all correct answers) | 6 | **6 of 6** (tuition-8, 9, 10, 11, 12, 15) |

Across the pack and the live probes, **14 correct or equivalent student answers were sent and 14 were criticised (100%).**

### Tutor

| Lang | Items | Scientifically wrong or misleading | Gives away answer |
|---|---|---|---|
| en | 12 | 4 (en-1, en-5, en-6, en-8) | 1 (en-7) |
| bm | 14 | 3 (bm-2, bm-5, bm-14) | 2 (bm-3, bm-13) |
| zh | 8 | 3 (zh-1, zh-4, zh-5) | 1 (zh-2) |
| live | 2 | 0 | 1 near-giveaway (tuition-14) |

## Issues ranked by severity

### Critical

1. **Generator keys arithmetic and science wrongly, often with no correct option at all** (all langs). The model writes a stimulus, then picks a number that does not follow from it.
   - generator-en-7: v = 10 m/s, f = 2.5 Hz, so λ = 4.0 m. The options are 0.5/0.2/1.0/2.0 m and the key is "0.5 m".
   - generator-en-14: f(x) = 2x² − 8x + 6 has roots x = 1, 3. The key is "(-2, 0)". The correct (1, 0) is an option but is not keyed.
   - generator-en-17: λ = 500 nm gives E = hc/λ ≈ 4.0 × 10⁻¹⁹ J. The key is "3.0 × 10^−21 J".
   - generator-bm-15: ∫₁³(2x+3)dx = 14. The options are 12/15/18/21 and the key is 12.
   - generator-zh-3: T₂ = 3, T₅ = 15, so T₅ is 5 times T₂. The key is "4倍".
   - live:tuition-1: a 10 N horizontal force on a frictionless surface gives net 10 N. The key is "4.0 N".
   - live:tuition-2: 12 V across 10 Ω gives 1.2 A. The key is "1.0 A".
   - live:tuition-3: C₂H₃ has M ≈ 27 g/mol. The key is "90.0 g/mol".
   - live:tuition-4: f'(2) for 2x³ − 5x² + 3x − 7 is 7. The key is "8".
   - live:tuition-6: M(H₂SO₄) = 98 g/mol. The key is "36.0 g".
2. **Generator teaches wrong science in the key itself.**
   - generator-en-9 (electrolysis) keys "anions move towards the cathode". Anions move to the anode, and none of the 4 options is fully correct.
   - generator-zh-7 keys palisade and spongy cells as part of the 表皮 (epidermis). They are mesophyll (叶肉), and two other options are correct.
   - generator-bm-11 keys "Mitokondria" for a stimulus describing a membrane-bound organelle that contains information, which is the nucleus. The rationale says "mitokondria dalam pembakaran gliserol".
   - generator-bm-9 and generator-bm-19 use "daya" (force) for power (should be kuasa) and give the formula "daya = tenaga × jarak". generator-bm-19 keys "500 mV" as the power for 5 V and 1 A, when P = 5 W.
3. **Generator Sejarah content is fabricated** (en and bm).
   - generator-en-11 invents "three main causes of the Malay uprising" ("granting Malay rulers titles such as 'Raja' and 'Sultan'"). Its rationale lists the keyed "NOT a cause" option as a cause.
   - generator-bm-10 keys "Kedudukan sebagai negara bersejarah" as the main factor behind nationalism. The textbook factors are education, the press, Islamic reform and external influences.
   - live:tuition-5 (Usaha ke Arah Kemerdekaan) returned 4 identical options, all "Kedaulatan", and drifted to economics.
4. **The evaluator criticises correct answers, including correct unit conversions.**
   - live:tuition-9: the student computed R = 6.0/0.003 = 2000 Ω, which equals 2.0 kΩ. The feedback says "the correct unit for resistance is in kiloohms… Make sure to convert the current from mA to A", which the student had already done.
   - live:tuition-8: "0.009 kJ" is the same as 9.0 J. The feedback says "Your answer is close, but the units need to be consistent… The correct answer is 9.0 J, which is 0.009 kJ".
   - live:tuition-15: the student chose exactly "2.5 m/s²", which is the keyed option. The feedback says "you may have made a mistake in substituting the values".
   - live:tuition-10: the student wrote exactly 6(2x+1)². The feedback opens "let's double-check the steps… not 6(2x + 1)^3" and the insight is "Careless Error".
   - live:tuition-11: the student gave the full correct answer, Tunku, 31 Ogos 1957, Stadium Merdeka. The feedback says "hampir betul… Jangan lupa untuk menambahkan nama Tunku Abdul Rahman", although the name is already in the answer.
   - live:tuition-12: 1.0 × 10⁻¹ mol is correct. The feedback says "摩尔质量的单位是摩尔/摩尔", which is wrong (the unit is g/mol).
   - pack: bm-2 (the student answer matches the key exactly, yet the feedback says "jawapan kamu kurang tepat"), bm-9, zh-2, zh-5, zh-6, zh-9, and en-2 (N·kg⁻¹ ≡ m·s⁻²).
5. **Evaluator feedback teaches false facts.**
   - evaluator-bm-3: "Fungsi ginjal… juga mengawal tahap glukosa dalam darah". Blood glucose is regulated by the pancreas and liver (insulin and glucagon), not the kidney's osmoregulation. The model has also misread a NOT question.
   - evaluator-zh-7: "柱头是雌性配子产生的部位". The stigma does not produce gametes; the female gamete forms in the embryo sac in the ovule (子房/胚珠).
   - evaluator-zh-4: "细胞呼吸发生在气孔关闭时". Respiration happens continuously.
   - evaluator-bm-7: "Mitokondria tidak mengandungi kromosom DNA", and it cites the wrong option letter ("jawapan yang betul adalah B"; the correct option is the 3rd one).
6. **Tutor hints state wrong physics.**
   - tutor-en-6: "When the amplitude doubles, the energy also doubles". Energy is proportional to A², so it quadruples, and the hint reinforces exactly the misconception the student was unsure about.
   - tutor-en-5: "This spreading out affects the wavelength". Wavelength is unchanged by diffraction.
   - tutor-zh-4: "能量的分布会改变，而不是振幅". Amplitude does decrease after diffraction.
   - tutor-en-1 invents "weight 50 N, normal force 20 N, net force 30 N" for a sled where 50 N ÷ 20 kg = 2.5 m/s².
   - tutor-zh-1 implies the student's correct hρg ≈ 2.0 × 10⁵ Pa is wrong ("需要注意单位和乘法顺序").
7. **The tutor affirms wrong answers with "Betul".**
   - tutor-bm-14: the student's A (cell bursts in hypertonic solution) is wrong, and the reply is "Betul, sel darah merah memang membutuhkan air untuk bertumbuh".
   - tutor-bm-5: "Betul, sudut tunduk 30° berlaku… trigonometri tanah dalam sistem koordinat" is gibberish attached to a wrong answer.

### Major

8. **The generator accepts any subject and form without checking the syllabus.**
   - Quantum Physics is generated as Form 4 (generator-en-17, generator-bm-4). In KSSM it is Physics Form 5, and "quantum tunneling" is not in the DSKP at all.
   - Integration is generated as Add Maths Form 4 (generator-bm-15). It is in Form 5.
   - "Subject: KSSM" items were generated without complaint.
   - generator-bm-12 uses *The House on Mango Street*, which is not an SPM literature text.
   - The prompt should validate the topic against the form, or the topic_anchors list should constrain it.
9. **"KBAT" is almost always plain recall or a single substitution.**
   - Items labelled Analyse/Menganalisis are one-line recall questions ("Which of the following is NOT a unit of force?", generator-en-13, which also has 3 correct options).
   - generator-en-15 gives the acceleration in the stimulus and then asks for it.
   - None of the 54 items needs two or more reasoning steps with a correct key.
10. **The evaluator misdiagnoses the error type for teachers.**
    - evaluator-en-12: the student wrote 4(6x)³ for d/dx(3x²+1)⁴. That is a chain-rule misconception, not "a small mistake in expanding" or a Careless Error.
    - evaluator-en-3: the slip in 3(2x−4) − 2(x+5) is the classic −2 × +5 sign error, but the feedback does not name it.
    - evaluator-bm-6: a sequence-order error is labelled "kurang lengkap".
    - error_category is "Careless Error" or "Misconception" almost at random, so the teacher dashboard data would mislead.
11. **The tutor gives away the answer.**
    - tutor-bm-3: "Tahap prestasi 3 mempunyai konsep tekanan…"
    - tutor-en-7: "it's not explicitly listed as a component of computational thinking"
    - tutor-zh-2: "比如钾"
    - tutor-bm-13: "…tetapi juga tentang kejujuran"
    - live:tuition-14 is borderline: "Bilangan molekul ialah 0.5 darab pemalar Avogadro".
12. **Wrong or invented terminology in BM.**
    - "ion hidroklorik (Cl⁻)" in tutor-bm-2; it should be ion klorida.
    - "Fungsi satu kepada" in generator-bm-8; the term is fungsi satu kepada satu.
    - "pemecutan genetik" (acceleration!) in generator-bm-5 and generator-bm-20.
    - "Tenaga tenaga" in generator-bm-1.
    - Indonesian forms throughout: membutuhkan, memperoleh, laki-laki, kecepatan, gravitasi.
13. **Duplicate options.**
    - generator-en-1 has "44.0 g/mol" and "44.0 g·mol⁻¹", which are the same answer.
    - generator-zh-2 has options 0 and 1 identical, and its stimulus does not say whether the machine was bought for cash or on credit.
    - live:tuition-5 has all four options identical.
    - A trivial post-check would catch all of these.
14. **object_lesson sometimes contradicts or garbles the science, or is unsafe.**
    - generator-zh-2: "燃料是机器的资产，而燃料的费用是机器的负债".
    - generator-en-1: a sabun box "says it's 44 kg".
    - live:tuition-6 has a BM story with "air… keluar dengan sedikit darah" in a school canteen.
    - live:tuition-7 puts the full worked answer ("15 m/s ÷ 10 s = 1.5 m/s²") in the object lesson, which gives the answer away.
    - Some object_lessons are Python dict strings (generator-zh-1, generator-zh-5).

### Minor

15. **live:tuition-7** keys the deceleration from 15 m/s to 0 in 10 s as "1.5 m/s²". SPM markers expect −1.5 m/s² or "deceleration of 1.5 m/s²". The sign convention is not handled.
16. **generator-en-18** is physically inconsistent: a frictionless 30° incline gives a = g sin 30° ≈ 4.9 m/s², not the 2.0 m/s² implied by the stated speeds. A strong student will be confused.
17. **generator-en-19 and generator-zh-2** use US accounting terms ("Accounts Receivable") instead of the KSSM Prinsip Perakaunan terms (Akaun Belum Terima / Penghutang).
18. **Speed.** Under shared CPU the live generator calls took 80-200 s, and evaluator calls took 20-40 s at first. Pack timings are 6-10 s on desktop for the generator, which means roughly 15-40 s on a mid-range phone. That is acceptable only if the output is correct.
19. **Bank items fed to the model are themselves defective.** This is not the SLM's fault, but it should be cleaned:
    - evaluator-bm-2 has options A and C identical.
    - tutor-zh-6 has options C and D identical.
    - tutor-bm-6 has two correct "bukan ciri" options (large vacuoles *and* thick cell wall).
    - evaluator-en-8 keys the interneuron as "initiating" the withdrawal movement, which is debatable.
    - tutor-bm-2 (dilute HCl electrolysis) is ambiguous on concentration.

## What works well

- **JSON and schema reliability is excellent.** 1 schema failure out of all non-essay items I read (generator-zh-6). Fields are always present.
- **Tutor tone and form are right.** Replies are short, warm, end with an open question, and often use a sensible SEDA move.
  - tutor-en-2 (sin θ negative, "where the sine function is negative") is a model hint.
  - live:tuition-13 (free fall in a vacuum: "the only force acting on them is gravity… how gravity affects the acceleration of each ball?") is correct and does not give the answer away.
  - tutor-zh-3 (|r| < 1 for the sum to infinity), tutor-zh-7 (diode rectification) and tutor-bm-11 (proton number 31) are fine.
- **When the student is clearly wrong on a recall MCQ, the evaluator usually names the correct answer and the right concept** (evaluator-en-5, en-10, bm-1, bm-11, bm-13, zh-3, zh-8).
- **Language register is reasonably age-appropriate in en and zh.** Simplified Chinese is fluent.
- **Some generated items are usable:** generator-en-2 (selective permeability), generator-en-12, generator-en-16, generator-zh-1, generator-zh-5 (environmental variation) and live:tuition-7.

## Recommended fixes (in order of impact)

1. **Equivalence gate before the evaluator.**
   - Normalise both answers (strip whitespace and option letters, compare to the correct option text, parse numbers with SI prefixes and units such as mA→A, kΩ→Ω, kJ→J, N/kg ≡ m/s², 1.0×10⁻¹ = 0.1).
   - If the answers match, do not call the "wrong answer" evaluator at all; return a praise template.
   - Also add training examples where the correct answer is praised with error_category "None".
2. **Generator key verification.**
   - For any numeric stimulus, recompute the answer with a small symbolic or numeric checker (λ = v/f, V = IR, F = ma, molar mass from a periodic-table lookup, polynomial roots and derivatives, definite integrals, AP/GP terms).
   - Reject the item if the keyed option is not within tolerance or if no option matches.
   - Reject duplicate options, and reject "NOT" questions unless exactly one option is false.
   - Regenerate up to N times, then fall back to topic_anchors.
3. **Do not ship the BM generator** until it is retrained with grounded DSKP terms. Inject syllabus_embeddings and topic_anchors as context, and keep a glossary blocklist (daya vs kuasa, Indonesian forms).
4. **Sejarah: do not free-generate.** Use only bank or anchor items, because the model fabricates history.
5. **Validate subject, form and topic against a KSSM topic map** before generation. Examples: Quantum Physics → F5, Differentiation and Integration → Add Maths F5.
6. **Tutor post-filter.**
   - Block replies containing an option's text or its key term.
   - Block openers like "Betul"/"That's right" when the student's chosen option is not the key.
   - Add contrastive training pairs for known misconceptions: energy ∝ A², wavelength unchanged in diffraction, osmosis direction, neutralisation 57 kJ per mol of water.

```json
{"persona": "tuition",
 "scores_1to5": {"accuracy": 1, "usefulness": 1, "tone_and_pedagogy": 2, "language_quality": 2, "speed_ux": 2},
 "issues": [
  {"severity": "critical", "type": "accuracy", "task": "generator", "lang": "en", "item_id": "generator-en-7", "evidence": "f = 2.5 Hz, v = 10 m/s; key \"0.5 m\" (correct 4.0 m, not among options)", "fix": "Numerically recompute the key from the stimulus and reject the item if no option matches"},
  {"severity": "critical", "type": "accuracy", "task": "generator", "lang": "en", "item_id": "generator-en-14", "evidence": "f(x)=2x^2-8x+6 keyed x-intercept \"(-2, 0)\"; roots are 1 and 3", "fix": "Symbolic check of roots, derivatives and integrals before release"},
  {"severity": "critical", "type": "accuracy", "task": "generator", "lang": "bm", "item_id": "generator-bm-15", "evidence": "∫1^3 (2x+3)dx keyed 12; correct 14 (not among options)", "fix": "Numeric key verification; fall back to topic_anchors on failure"},
  {"severity": "critical", "type": "accuracy", "task": "generator", "lang": "zh", "item_id": "generator-zh-3", "evidence": "T2=3, T5=15, keyed \"4倍\"; correct 5倍", "fix": "Arithmetic verifier for progression items"},
  {"severity": "critical", "type": "accuracy", "task": "generator", "lang": "en", "item_id": "live:tuition-2", "evidence": "10 Ω with 12 V keyed \"1.0 A\"; correct 1.2 A not offered", "fix": "Ohm's law and other formula checkers in the post-processing step"},
  {"severity": "critical", "type": "accuracy", "task": "generator", "lang": "en", "item_id": "live:tuition-3", "evidence": "C2H3 molar mass keyed \"90.0 g/mol\" (actual ~27)", "fix": "Molar-mass calculator from a periodic-table lookup to validate chemistry keys"},
  {"severity": "critical", "type": "accuracy", "task": "generator", "lang": "en", "item_id": "generator-en-9", "evidence": "keyed \"anions move towards the cathode\" in electrolysis", "fix": "Add contrastive training data on ion migration; human review for concept items"},
  {"severity": "critical", "type": "accuracy", "task": "generator", "lang": "en", "item_id": "generator-en-11", "evidence": "invented \"three main causes of the Malay uprising\"; rationale contradicts key", "fix": "Disable free generation for Sejarah; serve bank/topic_anchor items only"},
  {"severity": "critical", "type": "accuracy", "task": "generator", "lang": "bm", "item_id": "live:tuition-5", "evidence": "all four options \"Kedaulatan\"", "fix": "Reject items with duplicate options; regenerate or fall back"},
  {"severity": "critical", "type": "accuracy", "task": "generator", "lang": "bm", "item_id": "generator-bm-5", "evidence": "\"Apakah jenis pemecutan yang berlaku kepada anak berumur 10 tahun?\" key \"Pemecutan genetik\"", "fix": "Do not ship BM generator until retrained with DSKP-grounded terminology"},
  {"severity": "critical", "type": "accuracy", "task": "evaluator", "lang": "en", "item_id": "live:tuition-9", "evidence": "student R = 2000 Ω (= 2.0 kΩ) told \"correct unit for resistance is in kiloohms\"", "fix": "Unit-aware equivalence gate before the evaluator; praise path for correct answers"},
  {"severity": "critical", "type": "accuracy", "task": "evaluator", "lang": "en", "item_id": "live:tuition-15", "evidence": "student picked the keyed \"2.5 m/s²\"; feedback \"you may have made a mistake in substituting\"", "fix": "Exact-match check vs correct option; never call the wrong-answer evaluator on a match"},
  {"severity": "critical", "type": "accuracy", "task": "evaluator", "lang": "bm", "item_id": "live:tuition-11", "evidence": "full correct answer incl. Tunku; told \"Jangan lupa untuk menambahkan nama Tunku Abdul Rahman\"", "fix": "Semantic equivalence check; training rows with correct answers and error_category None"},
  {"severity": "critical", "type": "accuracy", "task": "evaluator", "lang": "bm", "item_id": "evaluator-bm-2", "evidence": "student answer identical to key; \"jawapan kamu kurang tepat\"", "fix": "String-equality short-circuit before the model"},
  {"severity": "critical", "type": "accuracy", "task": "evaluator", "lang": "bm", "item_id": "evaluator-bm-3", "evidence": "\"Fungsi ginjal ... juga mengawal tahap glukosa dalam darah\"", "fix": "Ground feedback on the correct option text and syllabus chunk; penalise unsupported facts"},
  {"severity": "critical", "type": "accuracy", "task": "evaluator", "lang": "zh", "item_id": "evaluator-zh-7", "evidence": "\"柱头是雌性配子产生的部位\"", "fix": "Ground feedback in DSKP text; restrict feedback to contrasting the chosen vs correct option"},
  {"severity": "critical", "type": "accuracy", "task": "tutor", "lang": "en", "item_id": "tutor-en-6", "evidence": "\"When the amplitude doubles, the energy also doubles\"", "fix": "Contrastive training pairs for known misconceptions (E ∝ A²); misconception blocklist"},
  {"severity": "critical", "type": "accuracy", "task": "tutor", "lang": "en", "item_id": "tutor-en-5", "evidence": "\"This spreading out affects the wavelength\" (diffraction)", "fix": "Same as above: misconception-aware training data"},
  {"severity": "critical", "type": "pedagogy", "task": "tutor", "lang": "bm", "item_id": "tutor-bm-14", "evidence": "student wrong (cell bursts in hypertonic); reply \"Betul, sel darah merah memang membutuhkan air\"", "fix": "Pass correctness of the student's option to the tutor; ban affirmations when the student is wrong"},
  {"severity": "major", "type": "accuracy", "task": "evaluator", "lang": "zh", "item_id": "evaluator-zh-4", "evidence": "\"细胞呼吸发生在气孔关闭时\"", "fix": "Fact-grounded feedback; reviewer pass on Biology evaluator data"},
  {"severity": "major", "type": "accuracy", "task": "tutor", "lang": "zh", "item_id": "tutor-zh-5", "evidence": "\"质子数是6，这说明原子中有一个质子\"", "fix": "More ZH science tutor data reviewed by a subject teacher"},
  {"severity": "major", "type": "accuracy", "task": "tutor", "lang": "en", "item_id": "tutor-en-8", "evidence": "heat of neutralisation \"usually given per mole of acid neutralized\"", "fix": "Correct to per mole of water formed; add to misconception pairs"},
  {"severity": "major", "type": "pedagogy", "task": "evaluator", "lang": "en", "item_id": "evaluator-en-12", "evidence": "4(6x)^3 diagnosed as \"small mistake in expanding\" / Careless Error", "fix": "Map common distractors to named misconceptions (chain rule) in the training data"},
  {"severity": "major", "type": "pedagogy", "task": "generator", "lang": "en", "item_id": "generator-en-15", "evidence": "stimulus gives \"accelerates uniformly at 2.5 m/s²\", question asks the acceleration", "fix": "Reject items whose key string appears verbatim in the stimulus; enforce multi-step KBAT"},
  {"severity": "major", "type": "accuracy", "task": "generator", "lang": "en", "item_id": "generator-en-17", "evidence": "Quantum Physics generated as Form 4; key 3.0×10^-21 J (actual ~4.0×10^-19 J)", "fix": "Validate topic against KSSM form map before generating"},
  {"severity": "major", "type": "pedagogy", "task": "tutor", "lang": "bm", "item_id": "tutor-bm-3", "evidence": "\"Tahap prestasi 3 mempunyai konsep tekanan...\"", "fix": "Post-filter replies that contain an option's text"},
  {"severity": "major", "type": "language", "task": "generator", "lang": "bm", "item_id": "generator-bm-19", "evidence": "\"Berapa daya yang diterima oleh bateri?\" keyed \"500 mV\" for 5 V, 1 A", "fix": "BM physics glossary (kuasa = power, daya = force) enforced in data and post-checks"},
  {"severity": "major", "type": "format", "task": "generator", "lang": "en", "item_id": "generator-en-1", "evidence": "options \"44.0 g/mol\" and \"44.0 g·mol⁻¹\" both present", "fix": "Unit-normalised duplicate-option rejection"},
  {"severity": "minor", "type": "accuracy", "task": "generator", "lang": "zh", "item_id": "live:tuition-7", "evidence": "deceleration keyed \"1.5 m/s²\"; object_lesson reveals \"15 m/s ÷ 10 s = 1.5 m/s²\"", "fix": "Handle sign/deceleration wording; forbid the worked answer in object_lesson"},
  {"severity": "minor", "type": "ux", "task": "generator", "lang": "en", "item_id": "live:tuition-3", "evidence": "generator calls took 80-200 s under shared CPU", "fix": "Generate in the background ahead of time and cache; use topic_anchors first"}
 ]}
```
