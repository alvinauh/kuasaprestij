# SPM critique — 2026-10-26

Judge: LLM playing an SPM examiner/teacher and an A+ candidate. Scores 1-5 (5 = indistinguishable from a real paper). Mark allocations quoted by the judge are from its memory; confidence is shown; verify low/medium against official papers.

## 2. Essay / composition tasks

| Task | src | authentic | marks | length | theme | model ans | rubric |
|---|---|---|---|---|---|---|---|
| Sejarah content essay | generator_node | 4 | 5 | 3 | 5 | 3 | 2 |

### Sejarah content essay (generator_node)
- Real equivalent: Sejarah 1249 Kertas 2, Bahagian B (esai berstruktur), soalan esai 20 markah — real format: Bahagian B 60 markah, jawab 3 daripada 7 soalan, jadi setiap esai ~20 markah. Soalan esai Sejarah SPM lazimnya berbentuk 'Huraikan faktor...' / 'Jelaskan kesan...' dengan 1-2 ayat stimulus pendek, tiada bullet isi pokok. Ini padan dengan format itu. _(confidence medium)_
- Task: _Kebangkitan nasionalisme di Tanah Melayu dan Asia Tenggara didorong oleh pelbagai faktor dalaman dan luaran. Huraikan faktor-faktor yang mencetuskan kebangkitan nasionalisme di Tanah Melayu dan Asia Tenggara. [20 markah]_
- Teacher: Soalan dan peruntukan 20 markah adalah tepat untuk esai Bahagian B Sejarah Kertas 2, dan tema nasionalisme memang dalam sukatan Tingkatan 4/5. Tetapi rubrik tidak meniru Peraturan Pemarkahan Sejarah yang sebenar: SPM memberi markah mengikut isi + huraian + contoh (biasanya 1+1+1 atau isi/huraian), bukan band 'Cemerlang/Baik/Memuaskan' dengan 'lima isi atau lebih'. Model jawapan pula hanya ~2600 aksara (lebih kurang 400-450 patah perkataan) untuk esai 20 markah yang sepatutnya boleh mencapai 5-6 isi lengkap dengan huraian dan contoh — ia terhenti selepas Isi 3 tanpa penutup, jadi tidak layak Cemerlang mengikut rubriknya sendiri.
- Student: Soalan ini rasa macam soalan esai Sejarah SPM yang betul, dan 20 markah pun masuk akal. Tapi rubrik band tu bukan macam skema Sejarah yang saya biasa lihat — skema Sejarah kira isi, huraian, contoh satu-satu, bukan band. Dan model jawapan tak habis; mana penutup dan isi 4-5?
- Fixes: Ganti rubrik band dengan Peraturan Pemarkahan gaya Sejarah: senaraikan isi (F) + huraian (H) + contoh (C) setiap satu, dengan agihan markah jelas (contoh: 5 isi × 4 markah = 20, atau 1 markah isi + 1 huraian + 1 contoh).; Lengkapkan model jawapan kepada 5-6 isi penuh dengan huraian dan contoh, serta tambah perenggan penutup, supaya ia benar-benar mencapai band Cemerlang mengikut rubrik yang diberi.; Pastikan panjang model jawapan sepadan dengan esai 20 markah SPM (biasanya 350-500 patah perkataan bergantung bilangan isi); nyatakan bilangan patah perkataan sasaran dalam arahan.; Semak ketepatan fakta contoh: 'Kaum Muda dipimpin Sheikh Tahir Jalaluddin dan Syed Sheikh Al-Hadi' boleh diterima, tetapi 'Madrasah Al-Idrisiah' dan 'Sarekat Islam' perlu dipastikan berada dalam sukatan KSSM Sejarah Tingkatan 4/5 dan bukan fakta luar sukatan yang mengelirukan pelajar.

## 3. Essay marking calibration (the real `evaluator_node`)

### Sejarah content essay (max 20)

| tier | words | mark | frac | band | problems |
|---|---|---|---|---|---|
| excellent | 1159 | 20/20 | 1.0 | Cemerlang | ok |
| good | 503 | 16/20 | 0.8 | Baik | ok |
| average | 225 | 13/20 | 0.65 | Baik | ok |
| weak | 177 | 9/20 | 0.45 | Memuaskan | ok |
| off_topic | 344 | 0/20 | 0.0 | Memuaskan | band 'Memuaskan' (1-10) does not contain the mark 0 |
| model_copy | 345 | 0/20 | 0.0 |  | ok |
| error_ridden | 423 | 14/20 | 0.7 | Baik | 0.70 of max is outside the expected 0.25-0.60 for 'error_ridden' |
| average (rerun) | 225 | 12/20 | 0.6 | Baik | ok |

- Ordering problems: none
- Same 'average' script marked twice differs by 1.0 marks (SPM double-marking tolerance is a few marks out of 20).

**2 of 8 marked scripts have a calibration problem.**

### Feedback quality (examiner + student)

| task | tier | mark | fair? | expected | accuracy | specific | SPM terms | actionable |
|---|---|---|---|---|---|---|---|---|
| Sejarah content essay | excellent | 20/20 | too_high | 12-15/20 (or 8-10/20 if the essay is only one of three required Bahagian B answers) | 2 | 3 | 2 | 2 |
| Sejarah content essay | average | 13/20 | too_high | 8-11/20 | 2 | 4 | 2 | 3 |
| Sejarah content essay | weak | 9/20 | too_high | 5-8/20 | 2 | 3 | 2 | 3 |

- **Sejarah content essay / excellent** — Teacher: The app awarded full marks for a response that is not an SPM Sejarah essay: it is a generic 1159-word content dump with no question stem, no explicit isi/huraian/contoh structure per point, and no alignment to the actual Bahagian B requirement (three essays, 20 marks each, from a 7-question choice). The feedback praises 'ten isi' and 'tiada isi penting tertinggal' without ever checking whether the essay answers a real SPM question or follows the Peraturan Pemarkahan point-by-point allocation. | Student: This would not help me score higher in SPM because it rewards length and breadth over the actual exam demand: answering a specific question with 3-4 developed isi, each with huraian and a precise contoh, within the time and mark constraints. The feedback also fails to flag that a 1159-word essay is far beyond what an SPM candidate can write for one 20-mark question in a 2h30m paper covering three essays.
- **Sejarah content essay / average** — Teacher: The feedback correctly identifies the missing specific examples and the absent media/intelektual content, which is genuinely the weakness of this script. But 13/20 (Baik) is generous for a 225-word essay with vague, under-developed isi and no dated/named examples — a real Sejarah marker working from Peraturan Pemarkahan would land this in the 8-11 band, and the app never states the actual isi/huraian/contoh mark breakdown it used. | Student: The 'how it should look' outline and the named examples (SITC, Utusan Melayu, Sheikh Tahir Jalaluddin) are genuinely useful for me to fix this essay. But the mark itself is inflated and the feedback never tells me how many marks each isi is worth or how many isi I actually need, so I can't tell whether adding examples alone gets me to the top band.
- **Sejarah content essay / weak** — Teacher: A 177-word script that is mostly one-line isi with almost no huraian or contoh cannot reach 'Memuaskan' 9/20 in a Sejarah Kertas 2 essay marked by Peraturan Pemarkahan; that is roughly 2-3 isi with thin huraian, so 5-8/20 is realistic. The feedback also invents content the script does not contain (agama, media, pengaruh luar, pendidikan are asserted as 'disentuh' when the visible text only covers penjajahan British), which is fatal for a point-based scheme. | Student: The improvements list is genuinely useful because it names SITC, Madrasah Al-Idrisiah, akhbar and PD2 as the missing specifics, but the mark of 9/20 and the claim that I 'touched' agama/media/pengaruh luar do not match what I actually wrote, so I would not trust the score. I would rewrite using the isi-huraian-contoh outline, but I would not learn from this that my real problem is zero huraian, not just 'kurang mendalam'.
