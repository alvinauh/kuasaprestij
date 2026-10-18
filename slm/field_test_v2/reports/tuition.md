# Field test v2 report: `tuition` (Mr. Lim Wei Jie, SPM tuition centre, Johor Bahru)

Subjects I teach: Physics, Chemistry, Biology, Mathematics, Additional Mathematics, Sejarah (Form 4-5, English and BM).
Scope:
- Every generator, evaluator and tutor item in `field_test_v2/pack/{bm,en,zh}.jsonl` (essays skipped): 62 generator MCQs, 22 evaluator items and 19 tutor items. I solved every MCQ myself.
- 17 live probes (`requests/v2-tuition-1..17`), replaying my v1 probes with fact-card topic names.
- For every item I recorded whether a `Context:` fact card was present, and I checked each card I saw for accuracy.

## Verdict

**The evaluator is now usable with a human in the loop. The generator is still not safe, and the fact cards do not fix its keys.**

- **Evaluator: a big improvement.**
  - In v1 it criticised 14 of 14 correct answers. In v2 it criticised 2 of 10: 0 of 4 in the pack and 2 of 6 in my live probes.
  - It now praises 0.009 kJ = 9.0 J, the exact keyed option 2.5 m/s², the exact 6(2x+1)², and the full Tunku / 31 Ogos 1957 / Stadium Merdeka answer.
  - It still fails on equivalent numbers written differently:
    - 2000 Ω vs 2.0 kΩ. It says "without converting the current", but the student wrote 0.003 A.
    - 1.0 × 10⁻¹ mol vs 0.1 mol. It says "结果应为0.1 mol，而不是1.0 × 10⁻¹ mol".
  - False statements in feedback did not go down: 7 of 28 items in v2, against about 6 of 40 in v1.
- **Generator: no real change.**
  - **51% of the MCQs have a wrong key or no correct option** (36 of 70). In v1 it was 63%.
  - Only 26% are usable as written.
  - The fact cards do not stop the arithmetic errors. The card prints v = fλ, p = mv, n = mass / molar mass or ∫(ax+b)dx = (a/2)x² + bx + C, and the model still keys the wrong number:
    - generator-en-33 keys λ = 0.5 m for 10 m/s and 2.5 Hz. This is the exact v1 error.
    - live:v2-tuition-7 keys p = 18 kg·m/s for 3 kg at 4 m/s.
    - live:v2-tuition-3 keys 3.0 g for 0.50 mol of C-12.
  - **Of the 14 numeric items whose card held the needed formula, 1 had a correct key.**
  - **Wrong keys are more common with a card (55%) than without (15%).** This is because cards attach to the science and maths topics where keys can be checked.
- **Tutor: same wrong-hint rate as v1 (27% vs 28%), with fewer giveaways (5% vs 14%).**
  - New regression: live:v2-tuition-13 says "You're right that weight affects acceleration" to a student who thinks the 5 kg ball falls faster in a vacuum. The v1 reply to the same question was correct.
- **The fact cards have their own errors.**
  - I found 30+ problems in the cards I saw. Most are wrong BM terms (Damping = "Penyedapan", pollination = "pembiakan", covalent bond = "Bekal kovalen", inference = "Kesimpulan", turning point = "Titik belok").
  - Three cards list true facts as misconceptions (all Group 18 elements are gases; enzymes can work outside cells; non-metals bond covalently with each other).
  - The Sejarah cards contain history errors ("Malaysia memperoleh kemerdekaan pada 31 Ogos 1957"; Federation of Malaya = "Kesatuan Malaya"; constitution drafted by a "Federal Constitution Committee" instead of the Reid Commission).
  - About 5 wrong outputs trace back to a wrong card.

Would I use it in class? Yes for evaluator feedback on MCQs, provided a teacher can see it and there is a unit-equivalence check first. I would still not use generated MCQs, and I would not use offline Sejarah generation at all.

## v1 -> v2

| Tally | v1 | v2 | Change |
|---|---|---|---|
| Generator MCQs checked (pack + live) | 54 (47 + 7) | 70 (62 + 8) | |
| **Wrong key / no correct option** | **34 (63%)** | **36 (51%)** | slightly better, still unusable |
| Ambiguous (2+ correct, duplicates, data insufficient or inconsistent) | 10 (19%) | 16 (23%) | |
| Acceptable key | 10 (19%) | 18 (26%) | |
| — pack en / bm / zh wrong | 8/20 (40%) · 17/20 (85%) · 3/7 (43%) | 14/34 (41%) · 12/21 (57%) · 3/7 (43%) | BM better, EN same |
| — live wrong | 6/7 (86%) | 7/8 (88%) | no change |
| **Correct answers sent to evaluator that were criticised** | **14/14 (100%)** | **2/10 (20%)** | fixed except unit and notation equivalence |
| — pack | 8/8 | 0/4 | |
| — live | 6/6 | 2/6 (v2-tuition-9, -12) | |
| **Evaluator items stating a false fact** | ~6/40 (15%) (bm-3, bm-7, zh-4, zh-7, live-9, live-12) | **7/28 (25%)** (en-2, en-9, en-10, bm-7, zh-2, live-9, live-12) | not better |
| Evaluator substantive errors (wrong verdict, science or diagnosis) | 23/40 (58%) | 7/28 (25%) | better |
| **Tutor hints scientifically wrong or misleading** | **10/36 (28%)** | **6/22 (27%)** (en-2, zh-1, zh-2, zh-3, live-13, live-17) | no change |
| **Tutor answer giveaways** | **5/36 (14%)** | **1/22 (5%)** (en-5) | better |
| Tutor says "Betul"/"right" to a wrong answer | 2 (bm-5, bm-14) | 2 (live-13 "You're right that weight affects acceleration", live-17 "on the right track" to E ∝ A) | |
| Schema failures (non-essay items I read) | 1 | 3 (generator-en-23, bm-3, bm-6) | worse, all generator |
| Live generator latency (shared CPU) | 80-200 s | 16-29 s | much better |

### Fact card presence vs errors

| Task | Items with card | Errors with card | Items without card | Errors without card |
|---|---|---|---|---|
| Generator, wrong key (pack) | 49 | 27 (55%) | 13 | 2 (15%), plus 7 ambiguous (all language subjects) |
| Generator, wrong key (live) | 8 | 7 | 0 | – |
| Evaluator, false fact or criticised correct answer (pack + live) | 28 | 7 | 2 | 0 |
| Tutor, wrong hint (pack + live) | 12 | 5 (zh-1, zh-2, zh-3, live-13, live-17) | 10 | 1 (en-2) |

How the card relates to each error:
- **The model ignores or contradicts a correct card.** This covers most errors.
  - generator-en-3: the card says "fruits from ovary", but the key says the ovary is where the embryo develops.
  - generator-en-13: the card says "wave action creates landforms", but the key is "Glacial erosion" for a Malaysian coastline.
  - generator-en-27: the card says "ionic bonds form between metals and non-metals", but the key says Na + Cl gives a covalent bond.
  - generator-en-29: the card states wave-particle duality, but the key is "Particles and waves are fundamentally different phenomena".
  - zh-1 tutor: the card says "原子是保持元素特性的最小单位", but the tutor says atoms cannot keep a substance's properties.
  - The numeric items listed above, where the formula is on the card.
- **The card's own error leads to the wrong output** (about 5 items):
  - generator-bm-3: the card's wrong "Kesatuan Malaya / Perjanjian Kesatuan Malaya" terms appear in the stem and options.
  - generator-bm-5: the "Cuaca dan Iklim" card is actually about weathering and coastal erosion.
  - generator-zh-6: the card maps klef bes (bass clef) to 高音谱号 (treble clef), and the key picks the bass line as the main melody.
  - generator-en-15: the card's equation has no water on the product side, and the key says water is "NOT a product of photosynthesis". The correct answer, CO₂, is also an option.
  - generator-zh-2: the card lists the defences without grouping them into lines, and the rationale says the third line is phagocytosis.
- **No card (language subjects):** few verifiable wrong keys, but mostly ambiguous items (all four options are similes; three valid antonyms; "selama satu minggu" vs "selama seminggu").

## Item-by-item findings (pack)

### Generator: wrong key / no correct option (29)
EN (14, all with card):
- **en-2**: "NOT a function of the nervous system" keys "Regulating body temperature". The nervous system does regulate it (hypothalamus), and its own rationale says so. No correct option.
- **en-3**: ovary keyed as "where the embryo develops and stores nutrients". The ovary becomes the fruit and the embryo develops in the ovule. Contradicts the card.
- **en-10**: forces of 12 N right and 8 N left give a net 4.0 N. The key is "12.0 N". 4.0 N is an option.
- **en-13**: a rugged Malaysian coastline with cliffs is keyed "Glacial erosion". The answer is wave action.
- **en-14**: "reactivity from Li to Kr decreases as the atomic number increases" mixes three periods and contradicts the Group 1 trend. No correct option.
- **en-15**: "NOT a product of photosynthesis" keys "Water". CO₂ is the unambiguous answer, and the rationale itself lists water as a product.
- **en-16**: v = 2.0 m/s and f = 0.5 Hz give λ = 4.0 m. The options are 0.5/0.25/1.0/2.0 and the key is 0.5 m.
- **en-22**: 3x − 7 = 11 gives x = 6. The options are 2/3/4/5 and the key is 3.
- **en-23** (schema fail): U = {1..7} and B = {2..6} give B′ = {1, 7}. The key is the whole of U, and there are 5 options.
- **en-27**: sodium + chlorine keyed "covalent bond".
- **en-29**: "Particles and waves are fundamentally different phenomena" keyed as the wave nature of particles. Quantum Physics is again generated as Form 4.
- **en-31** (Music): all four options are the same "C – E – G – C – E – G – C".
- **en-32**: F = GMm/r² for 1000 kg at 2.0 × 10⁷ m is about 1.0 × 10³ N. The key is 2.0 × 10⁷ N. The object lesson says "200,000,000 m" and that gravity "can lift a car or a house".
- **en-33**: f = 2.5 Hz and v = 10 m/s give 4.0 m. The key is 0.5 m. **This is the same error as v1 generator-en-7, now with v = fλ printed in the card.**

BM (12):
- **bm-2** and **bm-4** (Bahasa Cina, no card): tautological options ("…konteks sosial dan politik merupakan contoh … konteks sosial dan politik").
- **bm-3** (card, schema fail): options "dalam negara", "dalam negara dan negara", "dalam negara, negara, dan negara". The stimulus invents "raja Melayu meminta bantuan rakyat… 1946".
- **bm-5** (wrong card): "cuaca cerah dan angin berhenti" is keyed "Peningkatan angin laut".
- **bm-8**: "peranan ion Na⁺" is keyed "menghasilkan gas hidrogen dan membentuk ion H⁺ pada katod". Na⁺ is not discharged, and H⁺ is consumed at the cathode, not formed.
- **bm-12**: atomic number 11 (natrium) is keyed "Sulfur". The options are Cl/S/Ca/Cr, so the correct element is not offered.
- **bm-13**: 1,3-propanediol + "propil klorida" is keyed "Polypropilene".
- **bm-16**: "Sel tumbuhan menghasilkan asid sulfat setelah pembakaran karbohidrat" is fabricated, and an option reads "Asid klorida (H₂O)".
- **bm-17**: the angle of reflection for 30° incidence is 30°, and the key is 45°. (Refraction into water would give 22°, which is not an option either.)
- **bm-19**: the object lesson's data (2→1.5, 4→3.0) give m = 0.75. The key is 0.5.
- **bm-20**: a settlement along a road and river is keyed "berpusat". It should be berjajar.
- **bm-21**: options are "Peningkatan jisim berbanding dengan peningkatan jisim…". The stimulus says 235 → 141 + 139, which is impossible.

ZH (3):
- **zh-4**: ∫(2x+3)dx is keyed "2x + 3", and no option gives x² + 3x + C. The card prints ∫(ax+b)dx = (a/2)x² + bx + C.
- **zh-5**: f = 50 Hz and λ = 0.4 m give 20 m/s. The key is 40 m/s, and 20 m/s is option A.
- **zh-6**: the main melody is keyed to the bass-clef line. The card swaps bass and treble clef.

### Generator: ambiguous (16)
- en-1, en-4 (four similes), en-5 (exponential "rate" data; no single rate), en-7 (three true statements about fertilisation), en-9, en-11, en-21 ("voltage divider" with resistors "in parallel"), en-25 (algae is the likely cause but not an option), en-26, en-34.
- bm-1, bm-7, bm-9, bm-14, bm-15 (no text given), bm-18 (three antonyms).

### Generator: acceptable (17)
- en-6, en-8, en-12, en-17, en-18, en-19 (but the stimulus states the answer), en-20, en-24, en-28, en-30.
- bm-6 (schema fail), bm-10, bm-11.
- zh-1, zh-2 (but the rationale says the third line of defence is phagocytosis), zh-3 (25 m/s correct, but the rationale says wave speed is "振幅、频率和波长的乘积"), zh-7.
- Still almost no real multi-step KBAT.

### Evaluator (22 pack items)
All 4 correct answers were recognised with error_category "None": en-2, bm-4, bm-7, zh-1. In v1 the evaluator criticised all of them.

False facts:
- **en-10 (critical)**: the correct answer is 16√3 m, and the feedback ends "the angle of elevation is 30°, so the height of the flagpole is 24 m". That is the student's wrong answer, stated as the correct one.
- **zh-2 (major)**: "当距离 r 增加到原来的四倍时，重力加速度 g 会减小到原来的四分之一". It should be 1/16. The same feedback also says g "会四倍".
- **bm-7 (major)**: praises the student for "menjumlahkan frekuensi dan panjang gelombang" (adding them). The student multiplied.
- **en-9 (major, bank-derived)**: repeats the bank key "states retained autonomy over… education". Education is a federal matter. The Sejarah card is also wrong here (see the card list).
- **en-2 (minor)**: "root pressure… creates a pull". Root pressure is a push; transpiration is the pull.

Other points:
- en-7 labels a nucleon-count slip "Careless Error" and does not mention conservation of nucleon number (235 + 1 = 141 + 92 + 3).
- en-8 suggests "a pedigree chart" to teach continuous variation, which is the wrong tool.
- bm-9 invents "fungsi komposit" for a question that gives no function.

### Tutor (19 pack items)
Wrong or misleading hints:
- **en-2**: the student correctly got 12 × 25 × 4 = 1,200. The tutor says "You're close! … she works 12 hours a week, not 25… What's 48 times 12?" This is wrong arithmetic, and it treats a correct student as wrong.
- **zh-2**: the student's working gives exactly the key (24 − 4 = 20 m). The tutor says "你可能在代入上下限时出现了小错误".
- **zh-1**: "为什么分子能保持物质的特性，而原子不能呢？" Atoms do keep an element's properties, and the card says exactly that.
- **zh-3**: "质子和电子是成对出现的". They are equal in number in a neutral atom, not "paired". This plants a misconception.

Giveaway:
- **en-5**: "So the correct answer is 4x - 22, not 4x + 22".

Good replies:
- bm-1 to bm-5 contain no "Betul" for a wrong answer. This is fixed from v1.
- zh-6 does not hand over A when asked "那我是不是应该选A？".
- zh-7 and zh-9 are good.

Bank defects passed to the model:
- tutor-zh-4: option A answers the question better than the key.
- tutor-zh-1: the key says atoms are "无法再分割".
- evaluator-en-9: the education key (see above).

## Live probes v2-tuition-1..17 (all `context_used: true`)

| Probe | v1 result | v2 result | Verdict |
|---|---|---|---|
| 1 gen en F&M I | 10 N net keyed 4.0 N | forces 6−4+8−2 = 8 N; keyed "12.0 N", 8 N not offered | still wrong |
| 2 gen en Electricity | 12 V / 10 Ω keyed 1.0 A | 12 V, 4 Ω **and a 2.0 H inductor** (not in SPM); steady state 3 A, I(1 s) ≈ 2.6 A; keyed 1.0 A; rationale uses I = Q/t | still wrong, out of syllabus |
| 3 gen en Mole | C₂H₃ keyed 90 g/mol | 0.50 mol C-12 keyed **3.0 g** (6.0 g is option C) | still wrong, with n = m/M on the card |
| 4 gen en Differentiation | f′(2) = 7 keyed 8 | f(x) = 3x² + 2x − 5, f′(2) = 14; options 4/8/12/16, keyed 8 | still wrong |
| 5 gen bm Sejarah Malaysia Merdeka | 4 identical "Kedaulatan" | a question about "virus CoronaVie pada tahun 2020"; Indonesian terms (investasi, kesehatan, masker) | still fabricated, off-topic |
| 6 gen bm Mole (H₂SO₄) | keyed 36.0 g | correct number now (98.08) but keyed "98.08 g/mol" for a mass; "98.08 g" is option A; options 2 and 3 identical | still wrong key, closer |
| 7 gen zh F&M I | 1.5 m/s² (only acceptable v1 live item) | p = 3 kg × 4 m/s = 12; keyed **18 kg·m/s**; card prints p = mv | worse |
| 16 gen en Linear Inequalities | (new; standing in for linear programming, which has no card) | 2x + 3 > 7 → x > 2, keyed correctly | acceptable but one-variable recall, not two-variable KBAT |
| 8 eval 0.009 kJ | "close, units need to be consistent" | "Your answer is correct", None | **fixed** |
| 9 eval 2000 Ω | "correct unit is kiloohms" | "Your answer is incorrect… without converting the current" (the student did convert); Careless Error | **still broken** |
| 10 eval 6(2x+1)² | "not 6(2x+1)³", Careless Error | "Great job… chain rule", None | **fixed** |
| 11 eval Tunku / Stadium Merdeka | "Jangan lupa… Tunku" | "Kamu betul…", None; the card's "Malaysia" error did not leak | **fixed** |
| 12 eval 1.0×10⁻¹ mol | "摩尔质量的单位是摩尔/摩尔" | "结果应为0.1 mol，而不是1.0 × 10⁻¹ mol… 你应将质量除以摩尔质量" (the student did exactly that) | **still broken** |
| 15 eval exact "2.5 m/s²" | "you may have made a mistake" | "Great job!", None | **fixed** |
| 13 tutor free fall | correct hint | "**You're right that weight affects acceleration**, but what happens when there's no air resistance?" | **regression**: affirms the misconception |
| 14 tutor 0.5 mol water | near-giveaway "0.5 darab pemalar Avogadro" | no giveaway; "kamu tidak memahami cara mengira" is a little blunt | better |
| 17 tutor amplitude ×2 | (v1 pack tutor-en-6 said "energy also doubles") | "You're on the right track!" to "energy is proportional to the amplitude"; no false statement, but affirms a wrong idea; the card has no E ∝ A² | misleading |

## Fact-card errors (topic: error → correction)

Science and history content:
1. **Sejarah | Malaysia Merdeka (F4 bm card and F5 card)**: "Malaysia memperoleh kemerdekaan pada 31 Ogos 1957" / "Malaysia gained independence on 31 August 1957". Persekutuan Tanah Melayu became independent on that date; Malaysia was formed on 16.9.1963. The F4 card also gives "Federation of Malaya = Kesatuan Malaya" and "Perjanjian Kesatuan Malaya", which should be Persekutuan Tanah Melayu / Perjanjian Persekutuan Tanah Melayu 1948. It also has "Kesatuan Malaya dibentuk melalui Kesatuan Malayan dan kemudiannya Kesatuan Malaya" (circular), and the zh terms are confused (马来联合邦 / 马来联邦; Malayan Union is 马来亚联邦 and the Federation is 马来亚联合邦).
2. **Sejarah | Malaysia Merdeka (F5)**: "Tunku Abdul Rahman announced Merdeka via Radio Malaya". The proclamation was read at Stadium Merdeka, and the card omits that.
3. **Sejarah | Kemerdekaan Tanah Melayu**: the constitution was "drafted by the Federal Constitution Committee / Jawatankuasa Perlembagaan Persekutuan". It was the Reid Commission (Suruhanjaya Reid). The card also says "Malaysia's independence", and the zh "马来西亚联邦宪法" should be 马来亚联合邦宪法.
4. **Chemistry | The Periodic Table (en, bm)**: lists "believe that all elements in Group 18 are gases at room temperature" as a misconception. It is true. "Gas nobel" should be gas adi (KSSM).
5. **Biology | Metabolism and Enzymes**: lists "Enzymes can work outside cells" as a misconception. Extracellular enzymes are in the syllabus. "Hipotesis kunci dan kunci" should be hipotesis mangga dan kunci.
6. **Chemistry | Chemical Bond**: lists "all non-metals form covalent bonds with each other" as a misconception (essentially true). "Bekal kovalen / Bekal ionic" should be ikatan kovalen / ikatan ion.
7. **Geografi | Bentuk Muka Bumi**: "V-shaped valleys with steep banks called waterfalls". Steep banks are not waterfalls.
8. **Geografi | Cuaca dan Iklim (bm)**: the card is about weathering and coasts, which is the wrong topic. "Weathering = Pengkarat an" should be luluhawa (pengkaratan means rusting). "Laut berkontribusi kepada kitaran air melalui aliran air… dari kawasan bergunung" is nonsense.
9. **Chemistry | Polymer Chemistry (bm)**: condensation polymerisation = "penguapan" (evaporation) and addition = "peneambahan". They should be pempolimeran kondensasi / penambahan. The nylon equation writes H₂N–(CH₂)₅–NH₂ for 1,6-hexanediamine while the product shows (CH₂)₆. The topic is also F5, not F4.
10. **Biology | Photosynthesis**: 6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂. KSSM Biology uses 6CO₂ + 12H₂O → C₆H₁₂O₆ + 6O₂ + 6H₂O, and the simplified form fed the wrong key in generator-en-15.
11. **Biology | Homeostasis and Human Urinary System (zh)**: "Homeostasis = 体温调节" (thermoregulation) should be 体内平衡/稳态. This makes fact 1 and misconception 1 wrong.
12. **Biology | Chemical Composition in a Cell (bm)**: "Lipid terutamanya terdiri daripada karbon dan hidrogen". It should be C, H and O.
13. **Biology | Immunity in Humans**: the "three lines of defence" are listed as five items with no grouping (1st: skin/mucus; 2nd: phagocytosis, inflammation, fever; 3rd: lymphocytes and antibodies). This seeded generator-zh-2's "third line = phagocytosis".
14. **Pendidikan Muzik | Notasi Muzik (zh)**: "klef bes = 高音谱号" is wrong; bass clef is 低音谱号. "krocet = 十六分音符" is wrong; a crotchet is a 四分音符. Music appreciation card (bm): "Klef Bes = 高音谱号" and "Tempo = 节奏"; tempo is 速度.
15. **Additional Mathematics | Differentiation**: "Turning point = Titik belok = 拐点". Those terms mean point of inflection; it should be titik pusingan / 驻点. "Lokus tangen", and "turunan" should be terbitan.
16. **General Elective | Core Material**: an incoherent card ("Students learn to translate between classical and modern Malay texts" on a Chinese-literature card).
17. **Mathematics | Vectors**: includes dot and cross products, which are outside SPM. "vektor hasil tambah" should be vektor paduan.

BM / ZH terminology:
18. Physics | Waves: Damping = "Penyedapan" (flavouring) should be pelembapan.
19. Biology | Sexual Reproduction in Plants: pollination = "pembiakan" and fertilization = "pembiakan" should be pendebungaan and persenyawaan.
20. Science | Introduction to Science: Inference = "Kesimpulan" should be inferens (kesimpulan means conclusion).
21. Science | Microorganisms: sterilization = "pemutihan" (bleaching) should be pensterilan.
22. Physics | Light and Optics: total internal reflection = "pantulan dalam" should be pantulan dalam penuh.
23. Physics | Quantum Physics: "Konstanta Planck" should be pemalar Planck. The topic is filed as Form 4; it is F5.
24. Physics | Nuclear Physics (bm): "pendedahan spontan" (exposure) should be pancaran/pereputan; "reaksi nukleus" should be tindak balas nukleus.
25. Physics | Force and Motion I (bm): the misconception "Murid mungkin **membezakan** kelajuan dan halaju" says "distinguish". It should be "keliru antara".
26. Mathematics | Angles of Elevation and Depression: "Sudut elevasi / depresi" should be sudut dongakan / sudut tunduk.
27. Mathematics | Linear Inequalities: "menggelarkan" (to nickname) for shading should be melorek.
28. Additional Mathematics | Linear Law: "garis lurus penyuaian" should be garis lurus penyuaian terbaik; "kaedah pemerinyuan" is garbled.
29. Additional Mathematics | Integration: "Antiturunan", "Integrasi tentu" and "pemsubstitusi" are Indonesian or garbled. They should be kamiran tentu / tak tentu / pengamiran secara penggantian.
30. Biology | Sexual Reproduction in Humans: "Siklus haid" should be kitaran haid.
31. Geografi (urban card, zh): Rural-Urban Migration = "Pemindahan Dalam Bandar" should be penghijrahan desa ke bandar.
32. Chemistry | Introduction to Chemistry (zh): Matter = "Bahan" should be jirim; Particle = "Partikel" should be zarah.
33. History | Independence (EN request): the card is served in BM. This is a language mismatch.

Gaps (not errors, but they matter):
- The Electricity card has no V = IR.
- The Force and Motion I card has no F = ma.
- The Wave Motion card has no E ∝ A².
- The Differentiation card has no power rule.
- There is no Linear Programming card.

## Issues ranked by severity

### Critical
1. **Generator arithmetic keys are wrong even with the formula on the card.** Of 14 numeric items with the formula on the card, 1 had a correct key.
   - Examples: en-33, en-16, zh-5 (v = fλ); live-7 (p = mv); live-3 (n = m/M); zh-4 (∫(ax+b)dx); en-32 (F = GMm/r²); en-22; en-23; bm-12; live-1; live-4.
   - Cards do not replace a numeric checker.
2. **Generator concept keys contradict the card.** en-27 (NaCl covalent), en-13 (glacial erosion in Malaysia), en-15 (water "not a product"), en-29, en-3, en-2, bm-8.
3. **Sejarah generation is still fabricated.** live-5 (COVID "CoronaVie" for Malaysia Merdeka), bm-3, bm-1. The Sejarah cards themselves contain wrong history (card errors 1-3).
4. **The evaluator still states false facts.**
   - en-10 states the student's wrong 24 m as the answer.
   - zh-2: 4× distance gives "1/4".
   - bm-7: "menjumlahkan".
   - live-9 and live-12 tell students they did not convert units or did not divide by molar mass, when they did.
5. **The evaluator rejects equivalent numeric forms.** live-9 (2000 Ω ≡ 2.0 kΩ) and live-12 (1.0 × 10⁻¹ ≡ 0.1 mol).
6. **The tutor affirms the heavier-falls-faster misconception** (live-13). This is a regression from v1.

### Major
7. **The fact cards have about 33 errors.** Three of them invert true facts into "misconceptions", three are history errors, and the rest are wrong BM/ZH terms. Some feed straight into outputs (bm-3, bm-5, zh-6, en-15).
8. **The tutor treats correct working as wrong** (en-2, zh-2) and states misleading chemistry (zh-1, zh-3).
9. **Out-of-syllabus and form drift continue.**
   - An inductor in F4 Electricity (live-2).
   - Quantum Physics, Nuclear Physics, Light and Optics, Polymer Chemistry and Differentiation are carded as Form 4; they are F5 in KSSM.
10. **Duplicate options and malformed items.** en-31 (4 identical), live-6 (2 identical), en-23 (5 options). There were 3 generator schema failures in the pack.
11. **Indonesian forms persist in BM** (kesehatan, investasi, masker, Jumat, imuniti alami, membutuhkan). The cards add more (Antiturunan, Siklus haid, Konstanta).

### Minor
12. Error categories sometimes do not fit the reasoning: en-7 is labelled "Careless" while its root cause says "misunderstood"; live-9 is labelled "Careless".
13. object_lesson text is still often incoherent, Indonesian-flavoured, or wrong:
    - en-32 ("200,000,000 m", "lift a house").
    - en-6 ("kayangan (satchel)").
    - bm-9 ("A *kajian* is a *kajian*…").
14. en-19 and live-16 are trivial recall questions with the answer in the stimulus. They carry KBAT labels.

## What works well
- **The evaluator's correct-answer path is fixed.** 8 of 10 correct answers got "correct" with error_category "None" (pack en-2, bm-4, bm-7, zh-1; live 8, 10, 11, 15).
- **Evaluator error categories now use Skor's three labels.** There are no more "Insufficient Depth" or "Misconception" labels.
- **No "Betul" for a wrong BM answer** in the pack tutors. Giveaways are down to 1 in 22, and the live-14 Avogadro hint no longer gives the answer.
- **The tutor handles multi-turn chats** (zh-6 holds back the answer across 3 turns), and the tone is still good.
- **Live latency dropped from 80-200 s to 16-29 s** for the generator, and to 3-17 s for the evaluator.
- **BM generator wrong-key rate fell from 85% to 57%**, and the usable items are slightly more frequent (en-12, en-24, en-28, en-30, zh-1, zh-3, zh-7, live-16).
- **Most card science facts are correct.** The errors are concentrated in terms, "misconceptions" and Sejarah.

## Recommended fixes (in order of impact)
1. **Numeric equivalence gate before the evaluator.** Parse numbers with SI prefixes and scientific notation (2000 Ω = 2.0 kΩ, 1.0 × 10⁻¹ = 0.1, 0.009 kJ = 9.0 J). Then bypass the model with a praise template.
2. **Deterministic key checker for generated items.** Recompute λ = v/f, p = mv, n = m/M, F_net, F = GMm/r², derivatives, integrals, set complements and atomic-number lookups. Reject the item if the key is not within tolerance or an option is duplicated. The card does not do this job.
3. **Have a subject teacher review fact_cards.json before shipping it.**
   - Fix every BM/ZH term against the KSSM glossary (items 18-32 above).
   - Remove the true-fact "misconceptions" (items 4-6).
   - Fix the Sejarah cards (items 1-3).
   - Re-map wrong-topic cards (Cuaca dan Iklim).
   - Serve the card in the request's language.
   - Add the missing core formulas: V = IR, F = ma, E ∝ A², the power rule.
4. **Turn off Sejarah free generation.** Serve bank items only.
5. **Tutor post-filter.** Block "You're right", "on the right track" and "betul" when the student's stated option ≠ correct_answer. Block replies that contain the correct option text.
6. **Validate the topic and form against the KSSM map.** For example, Quantum/Nuclear/Light/Electricity are F5 Physics, Differentiation and Integration are F5 Additional Mathematics, and inductors are out of syllabus.

```json
{"persona": "tuition",
 "scores_1to5": {"accuracy": 2, "usefulness": 2, "tone_and_pedagogy": 3, "language_quality": 2, "speed_ux": 3},
 "issues": [
  {"severity": "critical", "type": "accuracy", "task": "generator", "lang": "en", "item_id": "generator-en-33", "evidence": "f = 2.5 Hz, v = 10 m/s keyed \"0.5 m\" (correct 4.0 m, not offered) with v = fλ in the card", "fix": "Deterministic numeric key check; reject when no option matches"},
  {"severity": "critical", "type": "accuracy", "task": "generator", "lang": "zh", "item_id": "live:v2-tuition-7", "evidence": "3 kg at 4 m/s keyed \"18 kg·m/s\" (correct 12, option A); card prints p = mv", "fix": "Formula-based key verifier; regenerate or fall back to topic_anchors"},
  {"severity": "critical", "type": "accuracy", "task": "generator", "lang": "en", "item_id": "live:v2-tuition-3", "evidence": "0.50 mol C-12 keyed \"3.0 g\" (6.0 g offered)", "fix": "Molar-mass/mole calculator check"},
  {"severity": "critical", "type": "accuracy", "task": "generator", "lang": "en", "item_id": "live:v2-tuition-4", "evidence": "f(x)=3x^2+2x-5, f'(2)=14; options 4/8/12/16 keyed 8", "fix": "Symbolic derivative check before release"},
  {"severity": "critical", "type": "accuracy", "task": "generator", "lang": "en", "item_id": "generator-en-27", "evidence": "sodium + chlorine keyed \"Metal-non-metal covalent bond\" despite card saying ionic", "fix": "Concept-consistency check against card facts; human review of concept items"},
  {"severity": "critical", "type": "accuracy", "task": "generator", "lang": "en", "item_id": "generator-en-15", "evidence": "\"NOT a product of photosynthesis\" keyed \"Water\" (CO2 is an option); card equation omits water product", "fix": "Use KSSM equation (12H2O ... + 6H2O) in card; reject NOT-items with more than one valid option"},
  {"severity": "critical", "type": "accuracy", "task": "generator", "lang": "bm", "item_id": "live:v2-tuition-5", "evidence": "Sejarah 'Malaysia Merdeka' produced a question on \"virus CoronaVie pada tahun 2020\"", "fix": "Disable free generation for Sejarah; serve bank items"},
  {"severity": "critical", "type": "accuracy", "task": "evaluator", "lang": "en", "item_id": "evaluator-en-10", "evidence": "correct 16√3 m; feedback \"the height of the flagpole is 24 m\"", "fix": "Force feedback to quote correct_answer verbatim; reject outputs that assert the student's answer as correct"},
  {"severity": "critical", "type": "accuracy", "task": "evaluator", "lang": "zh", "item_id": "live:v2-tuition-12", "evidence": "\"结果应为0.1 mol，而不是1.0 × 10⁻¹ mol\"", "fix": "Numeric equivalence gate (scientific notation) before calling the model"},
  {"severity": "critical", "type": "accuracy", "task": "evaluator", "lang": "en", "item_id": "live:v2-tuition-9", "evidence": "2000 Ω vs 2.0 kΩ: \"Your answer is incorrect... without converting the current\" (student used 0.003 A)", "fix": "SI-prefix-aware equivalence gate"},
  {"severity": "critical", "type": "accuracy", "task": "tutor", "lang": "en", "item_id": "live:v2-tuition-13", "evidence": "\"You're right that weight affects acceleration\" (free fall in vacuum)", "fix": "Block affirmations when chosen option != correct_answer; misconception contrastive pairs"},
  {"severity": "major", "type": "accuracy", "task": "evaluator", "lang": "zh", "item_id": "evaluator-zh-2", "evidence": "\"距离 r 增加到原来的四倍时，重力加速度 g 会减小到原来的四分之一\"", "fix": "Inverse-square training pairs; numeric sanity check on stated ratios"},
  {"severity": "major", "type": "accuracy", "task": "evaluator", "lang": "bm", "item_id": "evaluator-bm-7", "evidence": "\"Kamu betul menjumlahkan frekuensi dan panjang gelombang\" (student multiplied)", "fix": "Praise template that restates the student's own method"},
  {"severity": "major", "type": "accuracy", "task": "tutor", "lang": "en", "item_id": "tutor-en-2", "evidence": "student correct (RM1,200); tutor \"12 times 4 weeks is 48 hours. What's 48 times 12?\"", "fix": "Pass whether the student's current answer equals correct_answer; arithmetic check on hints"},
  {"severity": "major", "type": "accuracy", "task": "tutor", "lang": "zh", "item_id": "tutor-zh-2", "evidence": "student's 24 - 4 = 20 (= key); tutor \"你可能在代入上下限时出现了小错误\"", "fix": "Same as above"},
  {"severity": "major", "type": "accuracy", "task": "fact_card", "lang": "bm", "item_id": "card:Sejarah|Malaysia Merdeka", "evidence": "\"Malaysia memperoleh kemerdekaan pada 31 Ogos 1957\"; Federation of Malaya = \"Kesatuan Malaya\"", "fix": "Persekutuan Tanah Melayu (1957) vs Malaysia (16.9.1963); teacher review of all Sejarah cards"},
  {"severity": "major", "type": "accuracy", "task": "fact_card", "lang": "en", "item_id": "card:Chemistry|The Periodic Table of Elements", "evidence": "misconception: \"all elements in Group 18 are gases at room temperature\" (true)", "fix": "Remove true statements from misconception lists (also enzymes outside cells, non-metal covalent bonding)"},
  {"severity": "major", "type": "language", "task": "fact_card", "lang": "bm", "item_id": "card:Physics|Waves", "evidence": "Damping = \"Penyedapan\"", "fix": "Validate all BM terms against the KSSM glossary (pelembapan, pendebungaan, ikatan kovalen, inferens, titik pusingan, sudut dongakan, melorek...)"},
  {"severity": "major", "type": "accuracy", "task": "fact_card", "lang": "zh", "item_id": "card:Pendidikan Muzik|Notasi Muzik", "evidence": "\"klef bes = 高音谱号\"; \"krocet = 十六分音符\"", "fix": "Bass clef 低音谱号; crotchet 四分音符"},
  {"severity": "major", "type": "accuracy", "task": "generator", "lang": "en", "item_id": "live:v2-tuition-2", "evidence": "F4 Electricity item with \"a 2.0 H inductor\", keyed 1.0 A (steady state 3 A)", "fix": "Topic/form validation and syllabus blocklist"},
  {"severity": "major", "type": "format", "task": "generator", "lang": "en", "item_id": "generator-en-31", "evidence": "four identical options \"C – E – G – C – E – G – C\"", "fix": "Reject duplicate options"},
  {"severity": "minor", "type": "pedagogy", "task": "tutor", "lang": "en", "item_id": "tutor-en-5", "evidence": "\"So the correct answer is 4x - 22, not 4x + 22\"", "fix": "Post-filter replies containing correct option text"},
  {"severity": "minor", "type": "pedagogy", "task": "tutor", "lang": "en", "item_id": "live:v2-tuition-17", "evidence": "\"You're on the right track!\" to \"energy is proportional to the amplitude\"", "fix": "Add E ∝ A² to the Waves cards; ban affirmation of wrong reasoning"}
 ]}
```
