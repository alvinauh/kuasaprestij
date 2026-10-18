# Field test v2 report: cikgu-bm
Puan Rosnah, SPM Bahasa Melayu teacher (15 years), LPM-appointed SPM BM examiner, also teaches Sains (BM medium) to Form 4. I tested v1 of this model and re-tested v2 with the same method.

Scope:
- All 80 items in `field_test_v2/pack/bm.jsonl`: 30 essays, 7 essay_pass1, 8 essay_pass2, 9 evaluator, 5 tutor and 21 generator items.
- The 21 distinct BM fact cards in the `Context:` blocks.
- 14 live probes, `requests/v2-cikgu-bm-1..14`, each a replay or close variant of a v1 probe.
- I did not re-grade the essays. v2 bands are compared with my blind v1 grades in `field_test/grades/cikgu-bm.json`.

## Verdict

**v2 is a real step forward on one job and has not moved on the rest. I still would not put it in front of students except as before.**

- **Fixed: the evaluator no longer tells a correct student they are wrong.** It handled 2 of 2 correct pack items and 3 of 3 live correct answers, including a paraphrased written answer, with `error_category: "None"`. This was my number one v1 complaint. It is now off the table.
- **Not fixed: the tutor still affirms wrong ideas.**
  - The pada/kepada probe still opens "Kamu betul memahami 'pada' dan 'kepada' sama je".
  - A new osmosis probe gets "Kamu betul, air banyak dalam larutan hipertonik", which is the opposite of the fact.
  - The tutor also now gives away the key more often ("'kepada' lebih tepat", "mengapa oksigen yang dibebaskan adalah air?"). It was told the correct answer and leaks it.
  - `RESULTS.md` claims "the tutor no longer says 'Betul' to wrong BM answers". My live probes do not support that claim (3 of 4 wrong-idea probes were affirmed).
- **Not fixed, arguably worse: the generator.**
  - Usable MCQs: 0 of 21 in the pack and 0 of 2 live.
  - Wrong keys: 6 of 21, against 3 of 20 in v1.
  - 2 of 21 items failed the schema, against 0 in v1.
  - The fact cards did not help. Five of the six wrong keys are on items that had a card.
- **Essays: closer marks, same bands.**
  - Band agreement with me is 14/30 exact, the same as v1. Mean absolute difference fell from 18.3 to 9.9 marks.
  - The model has stopped using band C. It gave no C at all, where I gave 13. It now gives B to 22 of 30 essays, scored 67 or 72 in 17 of them.
  - Pass 2 now quotes the student's sentence and gives a correction. That is the right format. But fewer than half of those corrections are right, and some introduce Indonesian forms ("mengunggah", "merasa lelah", "tidak aman").
- **The fact cards themselves are not ready.** 17 of the 21 BM cards I saw carry at least one wrong fact or wrong DBP/KSSM term. Examples: "Penyedapan" for damping, "Pengkarat an" for weathering, "penguapan" for condensation polymerisation, "Kesatuan Malaya" for the Federation of Malaya, "Gas nobel" for gas adi. In at least one case (generator-bm-13) the model copied the card's error into its output.
- **Language is better on the specific words I flagged in v1.** berpikir, membutuhkan, bisa and kecepatan went from 10 occurrences to 0, and "anda" is gone, so the register is "kamu" throughout. Other Indonesian and English forms persist: invers, diperbolehkan, transparansi, dihitung, menjumlahkan, mengunggah, karakteristik, Jumat, refleksi/incident, kanker, fisik, penelitian.
- **Speed is much better.** Live essays took 23-55 s for both passes, against 28-249 s in v1, where three of four took over 140 s. Tutor and evaluator replies took 3-14 s.

The JSON is still almost always valid, and the evaluator is now safe to show students. For BM teaching specifically, the tutor's grammar handling and the BM fact cards would mislead my pupils.

## v1 -> v2

Pack tallies are over the BM pack. Item counts differ (v1: 81 items, v2: 80) and the item mix differs, so rates are given as x/n. Live tallies are over my own probes (v1 cikgu-bm-1..12, v2 v2-cikgu-bm-1..14).

| measure | v1 | v2 | change |
|---|---|---|---|
| Schema-valid, pack | 81/81 | 78/80 (generator-bm-3, -6 failed, degenerate repetition) | worse |
| **Generator** usable as-is, pack | 0/20 | 0/21 | same |
| Generator usable, live | 0/2 | 0/2 | same |
| Generator wrong key (checkable), pack | 3/20 (bm-15, bm-19, bm-4) | 6/21 (bm-5, bm-8, bm-12, bm-13, bm-16, bm-17) | worse |
| Generator unanswerable or tautological (no stimulus, or options repeat the stem) | not counted separately | 9/21 (bm-2, 3, 9, 10, 14, 15, 19, 20, 21) | - |
| Generator invented terms, pack | 6/20 | 5/21 (bm-4 "perbualahan", bm-7 "Imuniti komplementer", bm-12 "rangkaian elemen", bm-13 "polimer propil", bm-16 "Asid klorida (H₂O)") | about the same |
| Generator invented terms, live | 1/2 ("Imbuhan konjungtif") | 0/2, but both off-topic and false (see probes 13 and 14) | same |
| Generator wrong subject or language (English question for a BM request, BM question for Bahasa Cina) | 3/20 | 5/21 (bm-2, bm-4, bm-9, bm-11, bm-18) | same |
| **Evaluator** criticises a correct answer, pack | 2/13 (2 of 2 correct cases) | 0/9 (0 of 2 correct cases) | **fixed** |
| Evaluator criticises a correct answer, live | 2/2 | 0/3 (probes 1, 2, 4, including a paraphrase) | **fixed** |
| Evaluator states a false fact, pack | 3/13 | 2/9 (bm-7 "Kamu betul menjumlahkan frekuensi dan panjang gelombang" when the student multiplied; bm-5 calls musical sections "baris") | slightly better |
| Evaluator states a false fact, live | 1/3 | 2/4 (probe 2 "dinding sel kuat menghalang sel menjadi segah"; probe 3 "osmosis aktif") | same |
| Evaluator category outside Skor's 3 + None | many ("Misconception", "Insufficient Depth") | 0/9 pack, 0/4 live | **fixed** |
| **Tutor** opens with "Betul"/"Kamu betul", pack | 9/14 | 5/5. All five students were in fact right or nearly right, so the v2 pack does not test this | not testable in pack |
| Tutor affirms a wrong idea, pack | 4/14 | 0/5 (no wrong ideas in the v2 tutor items) | not testable |
| Tutor affirms a wrong idea, live | 2/3 (probes 7, 9) | 3/4 (probes 7, 8, 9; probe 5 only affirms the true "CO2 mempunyai oksigen") | **not fixed** |
| Tutor states something false | pack 2/14; live 1 (pada = kepada) | pack 1/5 (bm-1 "sel fotovoltaik memerlukan suhu yang tepat"); live 3 (pada = kepada; "pada boleh digunakan untuk orang" for a recipient; "air banyak dalam larutan hipertonik") | same |
| Tutor reveals the key | pack 3/14; live 0/3 | pack 0/5; live 3/5 (probes 5, 7, 8) | worse live |
| Indonesian forms in model output: berpikir / membutuhkan / bisa / kecepatan | 10 occurrences | 0 | **fixed** |
| Other Indonesian/English forms in model output, pack | gravitasi, partikel, sepeda, laki-laki, membingungkan ×4, ... | invers, diperbolehkan, membagi, membingungkan, transparansi, dihitung, menjumlahkan, alami, sehat, Jumat, demokratis, absolut, reaksi, diproduksi, refleksi ×3, incident ×4, mengunggah, karakteristik, merasa lelah, tidak aman, keperluan pokok | same level, different words |
| "anda" in model output | 8 items (1 mixes anda + kamu in one item) | 0 items; "kamu" throughout | **fixed** |
| **Essay** band = my blind grade | 14/30 | 14/30 | same |
| Essay within one band of mine | 27/30 | 26/30 | same |
| Essay two bands off | 3/30 (bm-2, bm-5, bm-29) | 4/30 (bm-10 B 67 vs D 44; bm-30 B 68 vs D 40; bm-24 A 85 vs C 62; bm-29 A 85 vs C 52) | same |
| Mean absolute score difference from me | 18.3 | 9.9 | better |
| Model band = `intended_band` | 9/30 | 14/30 | better |
| Band C used | 2/30 | **0/30** (I gave 13 C) | worse |
| Score clustering | 65 ×7, 50 ×3, 0 ×2 | 67 ×10, 72 ×7, 42 ×3; no zeros | different cluster |
| Pass 2 names a specific wrong word and its correction | almost never (generic "Gunakan istilah yang lebih tepat") | quotes "X -> Y" in 27/30 essays, but only ~10/30 have at least one correct, useful correction; essay_pass2 pack items: 4 of 27 suggestions useful | better format, weak content |
| Pass 2 praises an error or suggests a wrong word | about 6/30 | about 11/30 (see issue 5) | worse |
| Injection inside essay changes band | no (live D 42) | no (pack essay_pass1-bm-2 D 42; live D 38) | same |
| Live essay time, both passes (desktop, shared CPU) | 28-249 s (3 of 4 over 140 s) | 23-55 s | **much better** |

## Fact-card errors (BM `Context:` blocks)

21 distinct cards appeared: 20 in the pack plus the Electricity card in tutor-bm-4. I also checked the 3 cards used by my live probes. KSSM/DBP term in brackets is what the card should say.

| card (item) | error |
|---|---|
| Sejarah, Tamadun Awal Dunia (generator-bm-1) | "sebelum zaman perundangan" is meaningless; "peradaban Tengah Timur" (Timur Tengah); "membentuk dasar kehidupan" (asas) |
| Sejarah, Malaysia Merdeka (generator-bm-3) | "Federation of Malaya = Kesatuan Malaya" (Persekutuan Tanah Melayu, 1948); "Perjanjian Kesatuan Malaya" (Perjanjian Persekutuan Tanah Melayu 1948); ZH "马来联邦" means the Federated Malay States 1895 (马来亚联合邦); "Malaysia memperoleh kemerdekaan pada 31 Ogos 1957" (Persekutuan Tanah Melayu merdeka 1957; Malaysia formed 16 Sept 1963); the self-contradictory "Kesatuan Malaya dibentuk melalui Kesatuan Malayan dan kemudiannya Kesatuan Malaya" |
| Geografi, "Cuaca dan Iklim" (generator-bm-5) | the card is about coastal landforms, not weather and climate (wrong topic match); "Weathering = Pengkarat an" (luluhawa; pengkaratan means rusting); "Erosion = Pengikisan" (hakisan); "Laut berkontribusi kepada kitaran air melalui aliran air ... dari kawasan bergunung" is garbled and false; "berpikir" ×2 and "berkontribusi" are Indonesian |
| Kimia, Termokimia (evaluator-bm-4) | "haba prakondensasi, pemindahan, neutralisasi" (haba pemendakan, haba penyesaran, haba peneutralan, haba pembakaran); "haba neutralisasi" (haba peneutralan); "nilai bahan bakar" (nilai bahan api) |
| Pendidikan Muzik (evaluator-bm-5) | "Klef Bes = 高音谱号" (高音谱号 is the treble clef; bass clef is 低音谱号); "Tempo = 节奏" (节奏 is rhythm; tempo is 速度) |
| Fizik, Gelombang (evaluator-bm-7) | "Damping = Penyedapan" (pelembapan; penyedapan means making tasty); "Difraksi" (KSSM: pembelauan); "frekuensi semulajadi" (frekuensi asli); "membingungkan" is Indonesian |
| Matematik, graf gerakan (evaluator-bm-1) | "Larik mendatar" (garis mendatar) |
| Biologi, Immunity in Humans (generator-bm-7) | mixes "Imuniti" and "keimunan" (KSSM: keimunan); "Tiga barisan pertahanan:" then lists five items; "menguraikan antigen" (lisis) |
| Kimia, Jadual Berkala (generator-bm-12) | "Gas nobel" (gas adi); lists "semua unsur Kumpulan 18 adalah gas pada suhu bilik" as a misconception, but it is true |
| Kimia, Polimer (generator-bm-13) | "reaksi penambahan atau penguapan" (pempolimeran penambahan / pempolimeran kondensasi; penguapan means evaporation); "peneambahan polimer" typo; "reaksi" (tindak balas); the diamine in the equation is (CH₂)₅ but 1,6-hexanediamine is (CH₂)₆. **The model copied this error:** the generator-bm-13 rationale says "reaksi penambahan dan penguapan" |
| Sains, Introduction to Science (generator-bm-15) | "Inference = Kesimpulan" (inferens; kesimpulan is conclusion), and the misconception line builds on that error; "keinginan" (sifat ingin tahu); "mengamati" (memerhati) |
| Biologi, Komposisi Kimia dalam Sel (generator-bm-16) | "Lipid terutamanya terdiri daripada karbon dan hidrogen" (C, H and O); misconception "Lipid tidak sentiasa tidak larut dalam air" is a double negative and is actually true |
| Fizik, Cahaya (generator-bm-17) | "total internal reflection = pantulan dalam" (pantulan dalam penuh); "melewati" (melalui); misconception sentence ungrammatical ("Cahaya selalu membengkokkan") |
| Matematik Tambahan, Hukum Linear (generator-bm-19) | "kaedah pemerinyuan" is not a BM word; "garis lurus penyuaian" (garis lurus penyuaian terbaik) |
| Geografi, Petempatan (generator-bm-20) | lists berpusat and berkelompok as two different patterns (KSSM treats them as one); ZH "定居" means "to settle" (聚落) |
| Fizik, Fizik Nuklear (generator-bm-21) | "Radioaktiviti ialah pendedahan spontan" (pereputan/pemancaran spontan; pendedahan means exposure); "Nuclear fusion = Penggabungan nukleus" (pelakuran nukleus); "membingungkan" |
| Kimia, Elektrokimia (generator-bm-8) | minor: "dapat menghantar arus" (mengkonduksikan arus elektrik); the misconception line contradicts the card's own first fact |
| Clean or vague only | AddMath Fungsi (evaluator-bm-2/-9), Pendidikan Moral Integriti (evaluator-bm-6), Sejarah Tamadun Islam (generator-bm-14), Fizik Elektrik (tutor-bm-4). The Electricity card is attached to an F = BIL electromagnetism question, so the topic mapping is wrong |

Live-probe cards:
- **Biology, Movement of Substances.** "larutan isotoni, hipotoni" should be isotonik, hipotonik (the same card says "hipertonik"), and "konsentrasi" should be kepekatan. The card never says what happens to a cell in a hypertonic solution, and that is exactly where the tutor went wrong.
- **Biology, Photosynthesis.** It does not state that the released O₂ comes from water (fotolisis air). "Proses bergantung cahaya" should be "tindak balas bergantung cahaya".
- **Sains, Manusia dan Kesihatan.** "Melepaskan bahawa..." is garbled, and "dikonsumsi" is Indonesian. The card says nothing about body defence, although that topic falls under it.

## Issues ranked by severity

### Critical

1. **The tutor still affirms wrong ideas, including core BM grammar.**
   - v2-cikgu-bm-7: the student says pada = kepada. The tutor replies "Kamu betul memahami 'pada' dan 'kepada' sama je, tetapi dalam ayat ini, 'kepada' lebih tepat. Boleh kamu terangkan kenapa kamu pilih 'kepada'?" That one reply affirms the error, reveals the key, and misstates what the student chose.
   - v2-cikgu-bm-8 (multi-turn): "Betul, 'pada' boleh digunakan untuk orang." That is only true for possession ("ada pada saya"), not for a recipient after *memberikan*. The student's novel sentence goes uncorrected.
   - v2-cikgu-bm-9: "Kamu betul, air banyak dalam larutan hipertonik." This is false; a hypertonic solution has less water. It is the same failure as v1 tutor-bm-14, even with the card in the prompt.

   The v2 pack has no tutor item where the student is wrong, so the pack cannot show this. Add such items to the eval set.
2. **The generator is still unusable, and its keys are wrong more often.**
   - generator-bm-12: atomic number 11 (natrium) with options Klor/Sulfur/Kalsium/Krom, keyed "Sulfur", and the rationale says it has "6 elektron valens".
   - generator-bm-17: the angle of reflection at 30° incidence is keyed 45°.
   - generator-bm-8: the key says Na⁺ "menghasilkan gas hidrogen ... dan membentuk ion H⁺ pada katod".
   - generator-bm-16: "Sel tumbuhan menghasilkan asid sulfat setelah pembakaran karbohidrat", with an option "Asid klorida (H₂O)".
   - generator-bm-13: a polymer from "1,3-propanediol dan propil klorida" keyed "Polypropilene".
   - generator-bm-5: the key "Peningkatan angin laut" contradicts the stimulus "angin berhenti".
   - Live v2-cikgu-bm-13 (Sains, Manusia dan Kesihatan) claims a carbohydrate diet raises breast-cancer risk in "wanita berumah tangga", and uses Indonesian "kanker", "fisik", "penelitian", "kantornya".
   - Live v2-cikgu-bm-14 (BM Imbuhan) is not about imbuhan at all: "Ia merupakan tatabahasa yang mengajarkan cara memohon kepada Allah".
3. **The fact cards contain wrong facts and wrong KSSM/DBP terms (17 of 21 cards).** See the table above. A card that teaches "Penyedapan", "Pengkarat an", "Gas nobel" or "Kesatuan Malaya" is worse than no card, because the model treats it as authority (generator-bm-13 copied "penguapan"). Each card needs a subject-teacher review against the DSKP and the DBP/KSSM glossary before it ships.

### Major

4. **The tutor now leaks the answer it was given.**
   - v2-cikgu-bm-5: "Boleh kamu terangkan lagi mengapa oksigen yang dibebaskan adalah air?" This reveals "Air" and is also nonsense (oxygen "is" water).
   - v2-cikgu-bm-7 and v2-cikgu-bm-8: "'kepada' lebih tepat".

   Fix: check that the reply does not contain the correct option text or its key word, and regenerate if it does.
5. **Essay pass 2 gives wrong corrections and praises errors.**
   - It praises non-words and Indonesian:
     - essaytest-bm-10: "Penggunaan istilah 'keborongan makanan' jelas dan tepat"; keborongan is not a word, it should be pembaziran.
     - essaytest-bm-8: praises "kakek saya" again.
     - essaytest-bm-23: still praises "kaki hantu".
   - It replaces correct BM with Indonesian:
     - bm-23 "upload" -> "mengunggah" (memuat naik).
     - essay_pass2-bm-7 "rasa letih dan tidak berfokus" -> "merasa lelah dan tidak fokus".
     - bm-25 "tidak selamat" -> "tidak aman".
     - bm-24 "keperluan asas" -> "keperluan pokok".
     - bm-30 "keunikan" -> "karakteristik".
   - It "corrects" right words into wrong ones:
     - bm-22 "peperiksaan -> pemeriksaan".
     - essay_pass2-bm-2 "berlebihan -> berlebih".
     - essay_pass2-bm-5 "percaya kepada kepimpinan -> percaya pada kepimpinan". This is the wrong direction on the very kata sendi rule I probed.
     - essay_pass2-bm-3 "saya percayai".
     - bm-11 "Kami ambil gambar -> Kami membeli gambar".
     - bm-12 "'Kedua' -> 'Kedua-ka'".
   - It repeats the v1 error: bm-29 again suggests "kebebasan" and praises "keberagaman", still ignores the racial stereotyping, and is still A 85.
   - It produces no-op and looping corrections:
     - essay_pass2-bm-1 lists "X -> X (sudah betul)" five times.
     - bm-27 says "'jika' berlebihan -> gunakan 'jika'".
   - It misses the real errors:
     - essay_pass2-bm-5 does not flag "Kepimpinan adalah orang yang memimpin" (pemimpin).
     - essay_pass2-bm-4 does not flag "di Masa Depan" (pada masa depan).
     - essay_pass2-bm-6 does not flag "Walaupun ... tetapi".
     - Live v2-cikgu-bm-11 keeps "recycle" in its own correction.
6. **The essay band collapses to B and never uses C.** 22 of 30 essays got B, scored only 67 or 72 in 17 cases, and none got C.
   - Weak essays are lifted to B: bm-10 "keborongan" (my D 44 -> B 67), bm-30 repetitive (my D 40 -> B 68), essay_pass1-bm-4 repetitive with "rilek" (B 67).
   - The mean mark is closer to mine, but the band signal has less information than in v1. A student who writes a C and a student who writes a B see the same "B 67".
7. **Errors in evaluator explanations.**
   - evaluator-bm-7 praises the student for "menjumlahkan" frequency and wavelength; the student multiplied.
   - v2-cikgu-bm-2 marks a correct answer correct but tells the student "dinding sel kuat menghalang sel menjadi segah". In fact the cell does become segah; the wall stops it bursting.
   - v2-cikgu-bm-3: "tidak membezakan antara osmosis aktif dan pengangkutan pasif". There is no "osmosis aktif". It also does not address the student's actual error (salt moving in).
   - evaluator-bm-2: "formula domain", "invers", "diperbolehkan".

### Minor

8. **Generator schema failures and degenerate loops.**
   - generator-bm-3 repeats "dalam negara dan negara" until cut off.
   - generator-bm-6 repeats "Hujung Jalan, jangan lupa membeli kain ini." until cut off.
   - generator-bm-2 and generator-bm-21 have tautological options ("Peningkatan jisim sama dengan peningkatan jisim").
9. **Card-to-topic mismatches.** Geografi "Cuaca dan Iklim" gets a coastal card (generator-bm-5). A Physics F = BIL question gets the Electricity card (tutor-bm-4).
10. **The tutor mirrors student shorthand.** tutor-bm-2: "bahan buangan tu x boleh dibuang dengan betul", which is also self-contradictory. tutor-bm-1/-3/-4 echo "sbb", "camne". A tutor should model standard BM.
11. **Very short essays still score too high.** The 2-sentence injection essay got D 38 (v1: 42); it should be below 15. Its pass 2 contradicts itself ("kata 'sukan' tepat" and "kata 'sukan' tidak tepat").
12. **Pelajar and murid are still mixed in teacher_insight** (evaluator-bm-3 and -6 say "Pelajar", the others say "Murid"). KSSM documents use "murid".

## Live probes (14)

| probe | replays | v1 result | v2 result |
|---|---|---|---|
| v2-cikgu-bm-1 | v1-4: correct osmosis MCQ to evaluator | "Kamu sudah betul... tetapi perlu memahami konsep osmosis", Misconception, wrong explanation | **"Kamu betul, kerana air meresap keluar melalui osmosis"**, None. Fixed. 3 s |
| v2-cikgu-bm-2 | v1-5: correct written answer (dinding sel, segah) | "hampir betul, tetapi terdapat kesalahan", Conceptual Gap | None, praised. But it adds a false line, "dinding sel kuat menghalang sel menjadi segah", and "Air masuk melalui dinding sel melalui osmosis" |
| v2-cikgu-bm-3 | v1-6: wrong MCQ (salt diffuses in) | Reasonable, opened too generously | Conceptual Gap; "air tidak akan meresap masuk" is fine, but it never addresses salt and invents "osmosis aktif"; "konsentrasi" |
| v2-cikgu-bm-4 | new: correct answer in the student's own words | - | None, "Kamu betul menjelaskan..." Correct. Equivalent answers are recognised |
| v2-cikgu-bm-5 | v1-7: tutor, O₂ from CO₂ (correct_answer Air) | "Betul, CO2 memang mengandungi Oksigen...", no reveal | "Kamu betul bahawa CO2 mempunyai oksigen, tetapi oksigen yang dibebaskan bukan dari CO2. ... mengapa oksigen yang dibebaskan adalah air?" **Reveals the key** |
| v2-cikgu-bm-6 | v1-8: "bagi jawapan terus je" | No reveal, "anda", generic | No reveal, "kamu", asks what the student thinks the source is. Good |
| v2-cikgu-bm-7 | v1-9: pada = kepada | "Betul, 'pada' dan 'kepada' mempunyai makna yang sama" | **"Kamu betul memahami 'pada' dan 'kepada' sama je, tetapi ... 'kepada' lebih tepat"**. Still affirms, and now also reveals |
| v2-cikgu-bm-8 | new multi-turn follow-up: student cites "memberikan hadiah pada adiknya" | - | "Betul, 'pada' boleh digunakan untuk orang. Tapi ... 'kepada' lebih tepat." Half right, affirms the wrong usage, reveals the key |
| v2-cikgu-bm-9 | new, mirrors v1 tutor-bm-14: red cell in hypertonic solution | - | **"Kamu betul, air banyak dalam larutan hipertonik."** Affirms a false fact (card was in the prompt) |
| v2-cikgu-bm-10 | v1-3: prompt injection plus 2-sentence essay | D 42; "Jawapan lengkap dan jelas" | D 38, band held; pass 2 self-contradictory; 4 + 19 s |
| v2-cikgu-bm-11 | v1-1: Manglish karangan | D 0; generic pass 2 | D 42; pass 2 now gives "tak jaga -> tidak menjaga", "Lepas tu -> Lepas itu" but keeps "recycle" and misses "gila", "diorang", "so", "confirm", "ok guys". Better |
| v2-cikgu-bm-12 | v1-2: strong A karangan | A 88; 57 + 192 s | **A 85, correct**; 18 + 37 s. One pass-2 improvement is wrong ("RIMUP" renamed "...untuk Perpaduan Malaysia") |
| v2-cikgu-bm-13 | v1-10: Sains F4 health/defence generator (now the card topic "Manusia dan Kesihatan") | Vitamin B12 and heart disease | Carbohydrates cause breast cancer in "wanita berumah tangga"; "kanker", "fisik", "penelitian". Still false, off-topic and Indonesian |
| v2-cikgu-bm-14 | v1-11: BM Imbuhan generator | Invented "Imbuhan konjungtif/subjektif" | Not about imbuhan at all ("tatabahasa yang mengajarkan cara memohon kepada Allah") |

## What works well

- **The evaluator recognises correct answers.** It did so 5 of 5 times (2 pack, 3 live), including a paraphrase, with `error_category: "None"`. Categories are now always within Skor's set. This removes the worst student-facing harm from v1.
- **Wrong-answer feedback names the right answer without harshness.** Examples: evaluator-bm-1, -2, -3, -6, -8, -9, and live probe 3.
- **The register is consistent.** "kamu" is used throughout and "anda" never appears. The Indonesian words I listed in v1 (berpikir, membutuhkan, bisa, kecepatan, Jumat/televisi in the evaluator and tutor) are gone from those tasks.
- **Essay marks are no longer absurd.** There are no zeros; the Manglish essay is now D 42 rather than 0. Pass 1 and pass 2 no longer contradict each other. The extremes still separate: my A karangan scores A 85 and the clear D essays stay D.
- **Prompt injection is resisted** in both the pack (essay_pass1-bm-2) and live.
- **Pass 2 now quotes the student's sentence and gives a correction.** When the correction is right (essaytest-bm-13 "membelikan -> membeli", essaytest-bm-31 "boleh bertanya kepada guru", bm-23 "compare -> membandingkan", essay_pass2-bm-8 "kena -> perlu"), this is exactly what a student needs.
- **Speed.** Live essays take 23-55 s for both passes. The tutor answers in 3 s when the CPU is free.

## Recommendations

1. **Tutor:** add training and eval items where the student's idea is wrong (BM tatabahasa: pada/kepada, di/ke, dari/daripada; science: hypertonic/hypotonic, photosynthesis O₂ source), with replies that do not affirm. Also run an app-side check that rejects any reply containing the correct option text.
2. **Fact cards:** have a subject teacher review every card against the DSKP and the DBP/KSSM glossary. Add a term list (pelembapan, luluhawa, hakisan, gas adi, pempolimeran kondensasi, pelakuran, pereputan, inferens, pantulan dalam penuh, Persekutuan Tanah Melayu) and fail any card that uses a blacklisted form. Fix the topic matching (Cuaca dan Iklim, F = BIL).
3. **Generator:** keep it teacher-only or off. Serve students from the cached bank. Where it is kept, verify computable keys (atomic numbers, angles, arithmetic) in code.
4. **Essay pass 1:** calibrate on examiner-graded essays across all four bands. The model must learn C.
5. **Essay pass 2:** add a DBP lexical filter on the right-hand side of every "X -> Y" (reject mengunggah, aman, lelah, fokus, pokok, karakteristik, kakek, bapak). Drop identity suggestions. Never put a non-word or an Indonesian word in "strengths".
6. **Language:** extend the post-edit list to the v2 leaks: invers -> songsang, diperbolehkan -> dibenarkan, membagi -> membahagi, dihitung -> dikira, transparansi -> ketelusan, refleksi -> pantulan, incident -> tuju, kanker -> kanser, fisik -> fizikal, penelitian -> kajian, Jumat -> Jumaat.

```json
{"persona": "cikgu-bm",
 "scores_1to5": {"accuracy": 2, "usefulness": 2, "tone_and_pedagogy": 2, "language_quality": 3, "speed_ux": 4},
 "issues": [
  {"severity": "critical", "type": "pedagogy", "task": "tutor", "lang": "bm", "item_id": "live:v2-cikgu-bm-7", "evidence": "\"Kamu betul memahami 'pada' dan 'kepada' sama je, tetapi ... 'kepada' lebih tepat\"", "fix": "Train on wrong-idea BM grammar turns with non-affirming replies; answer-leak filter"},
  {"severity": "critical", "type": "accuracy", "task": "tutor", "lang": "bm", "item_id": "live:v2-cikgu-bm-9", "evidence": "\"Kamu betul, air banyak dalam larutan hipertonik\"", "fix": "Add hypertonic/hypotonic misconception turns; add the key fact to the Movement of Substances card"},
  {"severity": "critical", "type": "accuracy", "task": "generator", "lang": "bm", "item_id": "generator-bm-12", "evidence": "atomic number 11 keyed \"Sulfur\", \"6 elektron valens\"", "fix": "Teacher-only generator; verify computable keys in code"},
  {"severity": "critical", "type": "accuracy", "task": "generator", "lang": "bm", "item_id": "generator-bm-8", "evidence": "Na⁺ \"Menghasilkan gas hidrogen ... dan membentuk ion H⁺ pada katod\" as key", "fix": "Serve cached bank to students"},
  {"severity": "critical", "type": "accuracy", "task": "fact_card", "lang": "bm", "item_id": "evaluator-bm-7", "evidence": "\"Damping = Penyedapan\", \"Difraksi\"", "fix": "Teacher review of all cards against DSKP/DBP glossary; term blacklist"},
  {"severity": "critical", "type": "accuracy", "task": "fact_card", "lang": "bm", "item_id": "generator-bm-13", "evidence": "\"reaksi penambahan atau penguapan\" copied into the output rationale", "fix": "Correct to pempolimeran penambahan/kondensasi; review all cards"},
  {"severity": "major", "type": "accuracy", "task": "fact_card", "lang": "bm", "item_id": "generator-bm-3", "evidence": "\"Federation of Malaya = Kesatuan Malaya = 马来联邦\"", "fix": "Persekutuan Tanah Melayu (1948) / 马来亚联合邦"},
  {"severity": "major", "type": "accuracy", "task": "fact_card", "lang": "bm", "item_id": "generator-bm-5", "evidence": "\"Weathering = Pengkarat an\" on a Cuaca dan Iklim prompt", "fix": "luluhawa/hakisan; fix topic matching"},
  {"severity": "major", "type": "pedagogy", "task": "tutor", "lang": "bm", "item_id": "live:v2-cikgu-bm-5", "evidence": "\"mengapa oksigen yang dibebaskan adalah air?\"", "fix": "Reject replies containing correct option text"},
  {"severity": "major", "type": "language", "task": "essay", "lang": "bm", "item_id": "essaytest-essay-bm-23", "evidence": "\"'upload' -> 'mengunggah'\"; still praises \"kaki hantu\"", "fix": "DBP lexical filter on corrections; never praise slang"},
  {"severity": "major", "type": "accuracy", "task": "essay", "lang": "bm", "item_id": "essaytest-essay-bm-10", "evidence": "\"istilah 'keborongan makanan' jelas dan tepat\"; B 67 vs my D 44", "fix": "Dictionary check on quoted words in strengths; calibrated labels"},
  {"severity": "major", "type": "accuracy", "task": "essay_pass2", "lang": "bm", "item_id": "essay_pass2-bm-5", "evidence": "\"'percaya kepada kepimpinan' -> 'percaya pada kepimpinan'\"", "fix": "Reject corrections that change a correct kata sendi; teacher-written pass-2 labels"},
  {"severity": "major", "type": "accuracy", "task": "essay", "lang": "bm", "item_id": "essaytest-essay-bm-29", "evidence": "A 85 again; \"kebebasan\"; stereotyping ignored", "fix": "Penalise stereotyping and factual errors in labels"},
  {"severity": "major", "type": "format", "task": "essay", "lang": "bm", "item_id": "essaytest-essay-bm-30", "evidence": "0 of 30 essays given C; 22/30 B, 17 scored 67 or 72", "fix": "Examiner-calibrated training set covering all bands"},
  {"severity": "major", "type": "accuracy", "task": "evaluator", "lang": "bm", "item_id": "live:v2-cikgu-bm-2", "evidence": "\"dinding sel kuat menghalang sel menjadi segah\"", "fix": "Ground feedback in the correct answer text; do not paraphrase the key into its opposite"},
  {"severity": "major", "type": "accuracy", "task": "evaluator", "lang": "bm", "item_id": "evaluator-bm-7", "evidence": "\"Kamu betul menjumlahkan frekuensi dan panjang gelombang\" (student multiplied)", "fix": "Train on worked-method answers; DBP term check (menjumlahkan/dihitung/dasar)"},
  {"severity": "major", "type": "accuracy", "task": "generator", "lang": "bm", "item_id": "live:v2-cikgu-bm-13", "evidence": "carbohydrates cause breast cancer; \"kanker\", \"fisik\", \"penelitian\"", "fix": "Serve cached bank; DBP lexical filter"},
  {"severity": "minor", "type": "format", "task": "generator", "lang": "bm", "item_id": "generator-bm-6", "evidence": "schema fail; \"Hujung Jalan, jangan lupa membeli kain ini\" repeated", "fix": "Repetition penalty / max-token cap on object_lesson"},
  {"severity": "minor", "type": "language", "task": "tutor", "lang": "bm", "item_id": "tutor-bm-2", "evidence": "\"bahan buangan tu x boleh dibuang dengan betul\"", "fix": "Tutor replies in standard BM regardless of student shorthand"},
  {"severity": "minor", "type": "accuracy", "task": "essay", "lang": "bm", "item_id": "live:v2-cikgu-bm-10", "evidence": "2-sentence essay D 38; pass 2 says 'sukan' both tepat and tidak tepat", "fix": "Length-aware cap; consistency check in pass 2"}
 ]}
```

## Summary

**Verdict:** v2 fixes the evaluator, but I still would not let students use the tutor or the generator. The essay band is still only a rough triage.

**Scores:** accuracy 2, usefulness 2, tone and pedagogy 2, language 3, speed/UX 4. In v1 they were 1/2/2/2/3.

**v1 -> v2:**
- Evaluator criticising a correct answer: 2/2 pack and 2/2 live -> 0/2 and 0/3. Equivalent answers are recognised.
- Evaluator false facts: 3/13 -> 2/9.
- Tutor affirming a wrong idea, live: 2/3 -> 3/4. Tutor revealing the key, live: 0/3 -> 3/5.
- Generator: usable 0/20 -> 0/21; wrong keys 3/20 -> 6/21; schema failures 0 -> 2.
- Essays: exact band 14/30 -> 14/30; within one band 27 -> 26; mean difference 18.3 -> 9.9 marks; band C used 0 times (I gave 13).
- berpikir/membutuhkan/bisa/kecepatan: 10 -> 0; "anda" 8 items -> 0.

**Top remaining issues:**
1. The tutor still says "Kamu betul" to "pada = kepada" and "air banyak dalam larutan hipertonik", and now leaks the key.
2. 17 of 21 BM fact cards have wrong facts or wrong KSSM/DBP terms ("Penyedapan", "Pengkarat an", "penguapan", "Kesatuan Malaya", "Gas nobel"), and the model copies them.
3. Generator keys are wrong even when a card is attached (Na = "Sulfur"; reflection 30° -> 45°).
4. Essay bands collapse to B 67/72 with no C. Pass 2 praises non-words ("keborongan") and "corrects" into Indonesian ("mengunggah", "merasa lelah", "tidak aman") or into wrong kata sendi ("percaya pada").
5. Indonesian and English leaks persist in new words: invers, diperbolehkan, transparansi, menjumlahkan, kanker, fisik, refleksi, incident.
