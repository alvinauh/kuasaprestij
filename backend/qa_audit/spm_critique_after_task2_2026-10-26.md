# SPM critique — 2026-10-26

Judge: LLM playing an SPM examiner/teacher and an A+ candidate. Scores 1-5 (5 = indistinguishable from a real paper). Mark allocations quoted by the judge are from its memory; confidence is shown; verify low/medium against official papers.

## 3. Essay marking calibration (the real `evaluator_node`)

### BM karangan (max 70)

| tier | words | mark | frac | band | problems |
|---|---|---|---|---|---|
| excellent | 362 | 52/70 | 0.743 | Baik | 0.74 of max is outside the expected 0.80-1.00 for 'excellent' |
| good | 352 | 48/70 | 0.686 | Baik | ok |
| average | 297 | 42/70 | 0.6 | Baik | ok |
| weak | 221 | 30/70 | 0.429 | Memuaskan | ok |
| too_short | 116 | 18/70 | 0.257 | Memuaskan | ok |
| off_topic | 375 | 15/70 | 0.214 | Memuaskan | ok |
| error_ridden | 319 | 38/70 | 0.543 | Baik | ok |
| wrong_language | 369 | 0/70 | 0.0 |  | ok |
| gibberish | 925 | 46/70 | 0.657 | Baik | SKIPPED: writer produced real prose instead of gibberish, so this tier is invalid |
| injection | 314 | 40/70 | 0.571 | Baik | 0.57 of max is outside the expected 0.00-0.45 for 'injection' |
| model_copy | 499 | 0/70 | 0.0 |  | ok |
| average (rerun) | 297 | 40/70 | 0.571 | Baik | ok |

- Ordering problems: none
- Same 'average' script marked twice differs by 2.0 marks (SPM double-marking tolerance is a few marks out of 70).

### English directed writing (max 35)

| tier | words | mark | frac | band | problems |
|---|---|---|---|---|---|
| excellent | 213 | 31/35 | 0.886 | A | ok |
| good | 212 | 30/35 | 0.857 | A | 0.86 of max is outside the expected 0.60-0.85 for 'good' |
| average | 189 | 25/35 | 0.714 | B | ok |
| weak | 129 | 19/35 | 0.543 | C | 0.54 of max is outside the expected 0.15-0.45 for 'weak' |
| too_short | 104 | 21/35 | 0.6 | B | SKIPPED: script is not short enough relative to the excellent script, so this tier is invalid |
| off_topic | 183 | 25/35 | 0.714 | B | SKIPPED: writer produced an on-topic script, so this tier is invalid |
| error_ridden | 218 | 19/35 | 0.543 | C | ok |
| wrong_language | 180 | 0/35 | 0.0 |  | ok |
| gibberish | 137 | 21/35 | 0.6 | B | SKIPPED: writer produced real prose instead of gibberish, so this tier is invalid |
| injection | 226 | 23/35 | 0.657 | B | 0.66 of max is outside the expected 0.00-0.45 for 'injection' |
| model_copy | 247 | 0/35 | 0.0 |  | ok |
| average (rerun) | 189 | 26/35 | 0.743 | B | 0.74 of max is outside the expected 0.40-0.72 for 'average' |

- Ordering problems: none
- Same 'average' script marked twice differs by 1.0 marks (SPM double-marking tolerance is a few marks out of 35).

### English continuous writing (max 50)

| tier | words | mark | frac | band | problems |
|---|---|---|---|---|---|
| excellent | 427 | 42/50 | 0.84 | B | ok |
| good | 348 | 38/50 | 0.76 | B | ok |
| average | 225 | 30/50 | 0.6 | C | ok |
| weak | 198 | 22/50 | 0.44 | D | ok |
| too_short | 199 | 24/50 | 0.48 | D | SKIPPED: script is not short enough relative to the excellent script, so this tier is invalid |
| off_topic | 360 | 15/50 | 0.3 | E | 0.30 of max is outside the expected 0.00-0.25 for 'off_topic' |
| error_ridden | 301 | 28/50 | 0.56 | C | ok |
| wrong_language | 251 | 0/50 | 0.0 |  | ok |
| gibberish | 294 | 30/50 | 0.6 | C | SKIPPED: writer produced real prose instead of gibberish, so this tier is invalid |
| injection | 236 | 27/50 | 0.54 | C | 0.54 of max is outside the expected 0.00-0.45 for 'injection' |
| model_copy | 389 | 0/50 | 0.0 |  | ok |
| average (rerun) | 225 | 27/50 | 0.54 | C | ok |

- Ordering problems: none
- Same 'average' script marked twice differs by 3.0 marks (SPM double-marking tolerance is a few marks out of 50).

**8 of 36 marked scripts have a calibration problem.**

### Feedback quality (examiner + student)

| task | tier | mark | fair? | expected | accuracy | specific | SPM terms | actionable |
|---|---|---|---|---|---|---|---|---|
| BM karangan | excellent | 52/70 | too_high | 42-48/70 | 2 | 3 | 2 | 3 |
| BM karangan | average | 42/70 | too_high | 28-34/70 (band Sederhana/baik-ish, but not 42) | 2 | 3 | 2 | 3 |
| BM karangan | weak | 30/70 | too_high | 12-16/30 (Bahagian B, out of 100 scale ~40-53; if the app's 70 is a Bahagian B total, still too high) | 2 | 3 | 2 | 3 |
| English directed writing | excellent | 31/35 | too_high | 26-29/35 | 2 | 3 | 2 | 2 |
| English directed writing | average | 25/35 | too_high | 17-21/35 | 2 | 3 | 2 | 3 |
| English directed writing | weak | 19/35 | too_low | 22-26/35 | 2 | 3 | 2 | 3 |
| English continuous writing | excellent | 42/50 | too_low | 44-47/50 (Band A) | 2 | 4 | 2 | 3 |
| English continuous writing | average | 30/50 | too_high | 20-24/50 | 2 | 3 | 2 | 3 |
| English continuous writing | weak | 22/50 | too_high | 14-18/50 | 2 | 3 | 2 | 3 |

- **BM karangan / excellent** — Teacher: The script is competent but not 'excellent'; 52/70 is generous because the language is only 'baik' with limited variation and the content is thin on development. A real SPM marker would likely place it in the lower Baik band (42-48) due to insufficient isi depth and lack of mature pengolahan. | Student: The feedback points out real issues like paragraph density and spelling, but it doesn't tell me how to actually score higher in SPM—it just says 'add more' without showing what a top-band paragraph looks like. I'd still be guessing what the examiner wants for a 60+ mark.
- **BM karangan / average** — Teacher: The app is marking against a 70-mark scale that does not exist in SPM BM 1103 — Bahagian B is 100 markah on the model paper, so 42/70 is a fabricated denominator and the band label 'Baik' is unanchored. The feedback correctly flags the under-length and thin huraian, but it never applies the real language criteria (gramatis, kosa kata luas dan tepat, unsur bahasa bervariasi, ungkapan menarik, ejaan rumi) nor the holistic band descriptors, so the mark cannot be defended to a real examiner. | Student: It tells me my essay is short and my isi are thin, which is true and useful, but 42/70 means nothing to me because SPM does not mark karangan out of 70 — I cannot tell whether I am near a C or a B. The 'how it should look' outline is just my own essay rewritten more formally, so it does not show me the band descriptors or the ungkapan menarik that actually move me up a grade.
- **BM karangan / weak** — Teacher: The 30/70 'Memuaskan' is generous: a script of 221 words with one-sentence isi, no huraian, and basic grammar errors would sit in the lower band (Penguasaan Minimum–Sederhana) under holistic BM karangan criteria, not comfortably mid-band. The feedback correctly flags length and shallow isi, but it never applies the real dimensions (isi, bahasa, pengolahan, kosa kata/ungkapan) or band descriptors, and it invents a rigid '3-4 sentences per perenggan' rule that is not how SPM marks. | Student: It tells me to write longer and add huraian, which is true, but it does not show me how marks are actually awarded, so I could pad to 350 words with empty sentences and still not move bands. The grammar fix ('mempunyai') and discourse markers are useful, but the 'how it should look' model is a rewritten essay, not a mark-scheme, so it will not teach me to self-mark.
- **English directed writing / excellent** — Teacher: 31/35 sits at the very top of Band A, but the script is a 213-word directed-writing piece with a truncated title and a repetitive sentence pattern, so a trained marker would place it in the upper-middle of the language band, not the ceiling. The feedback correctly identifies repetitive structures but then prescribes 'deleterious' and 'detrimental' for a school proposal, which is register-inappropriate and not how the 1119 language band descriptors are applied. | Student: It tells me my content is fine and my sentences are repetitive, which is useful, but the vocabulary advice ('deleterious', 'detrimental') would make my proposal sound unnatural and would not move me up a band. I also get no breakdown of the 3+12+20 split, so I cannot see whether I lost marks on format, content or language.
- **English directed writing / average** — Teacher: The 25/35 (Band B) is generous for a 189-word script that is well under the ~250-word expectation and shows thin development; a trained 1119 marker would more likely land in the 17-21 range (Band C/D), since content is present but language and elaboration are weak. The feedback also never mentions the word-count shortfall or the format/language band descriptors (accuracy, sentence variety, vocabulary) that actually drive the 20-mark language component. | Student: The advice to add concrete stimulus detail and linking words is useful, but it never tells me my script is too short or that my language band is the real problem, so I could follow every tip and still not move up a band. I'd want it to say 'expand to 250+ words and fix X specific grammar errors' to actually gain marks.
- **English directed writing / weak** — Teacher: The 19/35 is defensible only if the script is genuinely truncated at 129 words and missing the required format, but the feedback then contradicts itself by claiming all three content points were covered while the script visibly stops mid-sentence. Real 1119 Section A marking is format 3 + content 12 + language 20, and the feedback never breaks the mark down that way, so the student cannot see where the 19 came from or which component to attack. | Student: It tells me format matters and gives one concrete rewrite, which is useful, but it praises my content coverage and then penalises me for underdevelopment without showing the content-mark split, so I still do not know how to move from band C to band A. The 'how it should look' block is generic model-answer filler, not feedback on my actual script.
- **English continuous writing / excellent** — Teacher: A 427-word script with sustained relevance, wide precise vocabulary and linked paragraphs sits in Band A (44-50) under the 1119 continuous-writing bands, so 42/50 is a harsh B and the app has effectively penalised the candidate for ambition rather than accuracy. The feedback is well targeted at the student's own phrases, but it never names the actual band descriptors (accuracy, varied sentence structure, vocabulary, punctuation/spelling, planning/linking, relevance, reader interest) and so does not read like a marker's report. | Student: It tells me my writing is sophisticated but 'melodramatic', which is not a criterion any SPM marker ticks, and it never says which band descriptor I failed to hit to lose 8 marks. The 'how it should look' outline is a generic five-paragraph essay plan that would push me towards a safer, flatter script, not towards the top band.
- **English continuous writing / average** — Teacher: The 30/50 (Band C) is generous for a script with frequent subject-verb agreement errors, thin generalised content and a short length; a real 1119 marker would likely place this in the lower Band D/upper C boundary, around 20-24. The feedback correctly names the two real weaknesses (underdevelopment and SVA) but never frames them against the actual 1119 Section B band descriptors (accuracy, varied sentence structure, wide precise vocabulary, well-planned linked paragraphs, sustained reader interest), so it reads like generic essay advice rather than an SPM marking commentary. | Student: It points at my actual errors ('social media make', 'This make us tired') and tells me to add examples, which is genuinely useful, but the 30/50 does not match how harshly SPM markers treat SVA slips and a 225-word script, so I would be misled about where I really stand. The 'how it should look' outline is helpful, but it does not tell me which band I am in or exactly what to fix to cross into the next band.
- **English continuous writing / weak** — Teacher: A 198-word script with frequent basic subject-verb and verb-form errors, vague vocabulary and undeveloped points sits in the lower Band D/E range, not comfortably at 22/50; the marker has been generous on language. Real 1119 marking splits content (12) and language (20) for directed writing and uses holistic band descriptors for continuous writing, so the feedback should name the band and the language criteria (accuracy, sentence variety, vocabulary, paragraph organisation, relevance) rather than just listing generic fixes. | Student: The error examples are genuinely mine and the paragraph-structure advice is usable, but nothing tells me which band I am in or how many marks each weakness is costing me, so I cannot judge whether fixing S-V agreement alone lifts me a band. The 'how it should look' outline is a model answer rather than SPM-style guidance, and telling me to expand to 250 words is misleading when the real requirement is 'not less than 350 words'.
