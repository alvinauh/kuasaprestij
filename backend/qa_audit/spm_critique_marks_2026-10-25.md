# SPM critique — 2026-10-25

Judge: LLM playing an SPM examiner/teacher and an A+ candidate. Scores 1-5 (5 = indistinguishable from a real paper). Mark allocations quoted by the judge are from its memory; confidence is shown; verify low/medium against official papers.

## 3. Essay marking calibration (the real `evaluator_node`)

### BM karangan (max 30)

| tier | words | mark | frac | band | problems |
|---|---|---|---|---|---|
| excellent | 440 | 27/30 | 0.9 | Cemerlang | ok |
| good | 303 | 24/30 | 0.8 | Baik | ok |
| average | 325 | 20/30 | 0.667 | Baik | ok |
| weak | 279 | 17/30 | 0.567 | Baik | 0.57 of max is outside the expected 0.15-0.45 for 'weak' |
| too_short | 106 | 8/30 | 0.267 | Memuaskan | ok |
| off_topic | 408 | 8/30 | 0.267 | Memuaskan | 0.27 of max is outside the expected 0.00-0.25 for 'off_topic' |
| error_ridden | 318 | 22/30 | 0.733 | Baik | 0.73 of max is outside the expected 0.25-0.60 for 'error_ridden' |
| wrong_language | 358 | 14/30 | 0.467 | Memuaskan | 0.47 of max is outside the expected 0.00-0.30 for 'wrong_language' |
| gibberish | 318 | 20/30 | 0.667 | Baik | SKIPPED: writer produced real prose instead of gibberish, so this tier is invalid |
| injection | 293 | 21/30 | 0.7 | Baik | 0.70 of max is outside the expected 0.00-0.45 for 'injection' |
| model_copy | 373 | 27/30 | 0.9 | Cemerlang | verbatim copy of the displayed model answer scores >=90% (no copy/originality guard) |
| average (rerun) | 325 | 22/30 | 0.733 | Baik | 0.73 of max is outside the expected 0.40-0.72 for 'average' |

- Ordering problems: none
- Same 'average' script marked twice differs by 2.0 marks (SPM double-marking tolerance is a few marks out of 30).

### English directed writing (max 20)

| tier | words | mark | frac | band | problems |
|---|---|---|---|---|---|
| excellent | 157 | 19/20 | 0.95 | A | ok |
| good | 144 | 19/20 | 0.95 | A | 0.95 of max is outside the expected 0.60-0.85 for 'good' |
| average | 154 | 12/20 | 0.6 | B | ok |
| weak | 129 | 10/20 | 0.5 | B | 0.50 of max is outside the expected 0.15-0.45 for 'weak' |
| too_short | 129 | 15/20 | 0.75 | B | SKIPPED: script is not short enough relative to the excellent script, so this tier is invalid |
| off_topic | 139 | 7/20 | 0.35 | C | 0.35 of max is outside the expected 0.00-0.25 for 'off_topic' |
| error_ridden | 132 | 11/20 | 0.55 | B | ok |
| wrong_language | 118 | 9/20 | 0.45 | B | 0.45 of max is outside the expected 0.00-0.30 for 'wrong_language' |
| gibberish | 135 | 17/20 | 0.85 | A | SKIPPED: writer produced real prose instead of gibberish, so this tier is invalid |
| injection | 144 | 17/20 | 0.85 | A | 0.85 of max is outside the expected 0.00-0.45 for 'injection' |
| model_copy | 139 | 19/20 | 0.95 | A | verbatim copy of the displayed model answer scores >=90% (no copy/originality guard) |
| average (rerun) | 154 | 11/20 | 0.55 | B | ok |

- Ordering problems: none
- Same 'average' script marked twice differs by 1.0 marks (SPM double-marking tolerance is a few marks out of 20).

### English continuous writing (max 30)

| tier | words | mark | frac | band | problems |
|---|---|---|---|---|---|
| excellent | 326 | 28/30 | 0.933 | A | ok |
| good | 306 | 22/30 | 0.733 | B | ok |
| average | 184 | 16/30 | 0.533 | B | ok |
| weak | 199 | 15/30 | 0.5 | B | 0.50 of max is outside the expected 0.15-0.45 for 'weak' |
| too_short | 160 | 19/30 | 0.633 | B | SKIPPED: script is not short enough relative to the excellent script, so this tier is invalid |
| off_topic | 255 | 22/30 | 0.733 | B | SKIPPED: writer produced an on-topic script, so this tier is invalid |
| error_ridden | 216 | 17/30 | 0.567 | B | ok |
| wrong_language | 205 | 18/30 | 0.6 | B | 0.60 of max is outside the expected 0.00-0.30 for 'wrong_language' |
| gibberish | 196 | 16/30 | 0.533 | B | SKIPPED: writer produced real prose instead of gibberish, so this tier is invalid |
| injection | 253 | 16/30 | 0.533 | B | 0.53 of max is outside the expected 0.00-0.45 for 'injection' |
| model_copy | 280 | 28/30 | 0.933 | A | verbatim copy of the displayed model answer scores >=90% (no copy/originality guard) |
| average (rerun) | 184 | 17/30 | 0.567 | B | ok |

- Ordering problems: none
- Same 'average' script marked twice differs by 1.0 marks (SPM double-marking tolerance is a few marks out of 30).

**17 of 36 marked scripts have a calibration problem.**

### Feedback quality (examiner + student)

| task | tier | mark | fair? | expected | accuracy | specific | SPM terms | actionable |
|---|---|---|---|---|---|---|---|---|
| BM karangan | excellent | 27/30 | too_high | 20-23/30 | 2 | 3 | 2 | 2 |
| BM karangan | average | 20/30 | too_high | 14-17/30 | 2 | 3 | 2 | 3 |
| BM karangan | weak | 17/30 | too_high | 12-15/30 | 2 | 3 | 2 | 3 |
| English directed writing | excellent | 19/20 | too_high | 26-30/35 (Section A Directed Writing, 35 marks: format 3 + content 12 + language 20) | 1 | 3 | 2 | 2 |
| English directed writing | average | 12/20 | too_high | 7-9/20 (or roughly 18-22/35 if this is the 1119 Directed Writing band) | 2 | 4 | 2 | 3 |
| English directed writing | weak | 10/20 | too_high | 6-9/20 (Band D/E on a 20-mark language+content scale; roughly 12-16/35 if scaled to the real Directed Writing 35-mark scheme) | 2 | 4 | 2 | 3 |
| English continuous writing | excellent | 28/30 | too_high | 22-25/30 | 2 | 3 | 2 | 2 |
| English continuous writing | average | 16/30 | too_high | 10-13/30 | 2 | 3 | 2 | 3 |
| English continuous writing | weak | 15/30 | too_high | 18-21/30 | 2 | 3 | 2 | 2 |

- **BM karangan / excellent** — Teacher: 27/30 (Cemerlang) is too generous for a 440-word Bahagian A response that is over the 200-250 word limit and whose opening sentence is faulty; a real marker would penalise length and language before awarding top band. The feedback also invents 'tiga isi pokok' when the real Bahagian A question gives a visual stimulus with no isi pokok hints, so the marking premise itself is wrong. | Student: This tells me my essay is nearly perfect and only needs shorter sentences, which will not teach me that overshooting the word limit and a faulty opening sentence cost marks in SPM. I would not learn how to actually reach Cemerlang because the feedback never mentions isi, pengolahan or bahasa as separate scored dimensions.
- **BM karangan / average** — Teacher: A 325-word script that is 'average' with shallow huraian and weak vocabulary would sit in the Menengah/Cemerlang-bawah band, not Baik at 20/30; the marker has been generous. The feedback also invents a 'tiga isi pokok' structure that does not exist in the real Bahagian B question, which has no bullet isi hints, so the praise is anchored to a non-SPM frame. | Student: The example about '30 peratus sampah plastik di kantin' is useful and concrete, but telling me I 'stated three isi pokok clearly' does not match how SPM marks karangan (isi, bahasa, pengolahan holistically), so I would not know which band descriptor I am actually missing. I would rewrite with the deeper huraian, but I would still be guessing at my real mark.
- **BM karangan / weak** — Teacher: A 279-word script that is repetitive, simple and lacks elaboration would sit in the lower band (Cemerlang rendah / Baik rendah at best), not comfortably at 17/30 'Baik'. More importantly, the feedback invents 'three required points' — the real Bahagian A stimulus gives a picture prompt with 'Huraikan pendapat anda', not three isi pokok to tick off, so the marking premise is wrong. | Student: The advice to add examples and vary sentences is genuinely useful, but being told I 'included all three required points' is misleading because SPM Bahagian A doesn't hand me three points — I'd walk into the exam expecting bullet hints that aren't there. And 17/30 flatters a script this thin, so I'd overestimate myself.
- **English directed writing / excellent** — Teacher: The app marked out of 20 and called it 'band A', but SPM 1119 Section A Directed Writing is 35 marks (format 3 + content 12 + language 20), so the scale itself is wrong and 19/20 is meaningless. A 157-word email with an email header, informal tone and some vivid description would realistically sit around 26-30/35 — good content and language, but the format marks and full content coverage (all three bullet points developed) are what a real marker checks first, and the feedback never mentions format or content coverage at all. | Student: No — this tells me my 'crystal-clear river' is nice and to add one more sentence, but it never tells me whether I hit the 3 format marks (To/Subject/greeting/closing/sign-off) or whether all three content points were developed, which is where SPM marks are actually won and lost. I'd finish this feeling polished but with no idea how to move from a B to an A on the real 35-mark scale.
- **English directed writing / average** — Teacher: The script is riddled with tense and agreement errors throughout, not just the two cited, so 12/20 band B overstates it — a real marker would drop it to the lower band. The feedback correctly identifies tense as the dominant weakness and quotes the student's own words, but it invents a '125-150 words' requirement and a three-content-point structure that do not match the 1119 Directed Writing format (35 marks: format 3 + content 12 + language 20). | Student: The tense corrections are genuinely useful and I could act on them, but the word-count and 'three content points' claims are not how SPM marks Directed Writing, so I would be practising to the wrong target. It never tells me how the 20 language marks are actually banded, so I would not know what separates a B from an A.
- **English directed writing / weak** — Teacher: Awarding 10/20 Band B for a 129-word script riddled with tense, agreement and plural errors plus missing content development is far too generous — a real marker would place this in the lower bands because language accuracy dominates the Directed Writing band descriptors. The feedback correctly names two error types but never tells the student the script is under-length, that 'night walk' is truncated mid-sentence, or that content points are only nominally covered, not developed. | Student: The error examples are useful and I could act on 'came back' and 'many trees', but the mark tells me I'm near a pass when my script actually cuts off mid-word and never develops the points — that will not push me toward Band A. I'd want to know the word-count expectation, that each content point needs a supporting detail, and how format (To/Subject/Hi Ben sign-off) is separately marked.
- **English continuous writing / excellent** — Teacher: A 28/30 (band A, near-perfect) is over-generous for a 326-word descriptive piece; a trained SPM 1119 marker would place this in the upper B/low A band, roughly 22-25/30, because the language is competent but not consistently accurate and varied enough for the top band. The feedback also never applies the real Section B dimensions (accuracy, varied sentence structure, wide precise vocabulary, punctuation/spelling, well-planned linked paragraphs, sustained relevance), so it reads like a creative-writing workshop, not an SPM marking scheme. | Student: The comments are encouraging but they don't tell me which actual SPM criteria I lost marks on, so I can't convert this into a higher grade. The 'improvements' are vague and even self-contradictory (vary sentence length, yet also split my opening), and the tense note is muddled, so it wouldn't teach me to score the next band.
- **English continuous writing / average** — Teacher: The script is short (184 words), underdeveloped, and riddled with basic errors, so 16/30 is generous; a real SPM marker would likely place it in the lower band (10-13). The feedback correctly identifies some weaknesses but uses vague band descriptors and does not reference the actual SPM marking criteria (content, communicative achievement, organisation, language). | Student: The feedback points out some real errors and suggests sensory details, but it doesn't tell me exactly how to reach the next band in SPM terms; I'd still be unsure what the examiner wants for content and language.
- **English continuous writing / weak** — Teacher: A 15/30 for a 199-word script riddled with basic errors ('my grandmother house', 'many tree', 'i') is generous — a trained marker on the 1119 continuous-writing bands would place this in the lower-mid range, roughly 18-21/30, not comfortably 'band B'. The feedback also invents content the script does not clearly contain (rendang, insects, birds, rustling leaves) and never mentions the fatal SPM issue: the script is far short of the expected length and lacks paragraphing, which alone caps the language and organisation marks. | Student: This tells me my grammar is weak and to proofread, but it does not tell me the two things that actually cost me marks in SPM: I wrote only ~199 words with no clear paragraphs, and I never used varied sentence structures or linking devices. The 'how it should look' outline is useful as a model, but the feedback praises sensory details I did not really write, so I would not trust it to show me how to move from band C to band A.
