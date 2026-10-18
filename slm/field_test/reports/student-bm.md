# Field test report: student-bm (Aiman, 16, Form 4, SMK in rural Kelantan, BM-medium, weak in Science/Maths)

Method: I skimmed all of `pack/bm.jsonl` (tutor, evaluator, generator, essay_pass1/2, essay) and made 12 live calls
(`requests/student-bm-1` to `-12`): a 3-turn Science tutor chat, a correct-answer tutor turn, "bagi jawapan je",
"cikgu sy penat la", an off-topic football message, 2 evaluator calls (MCQ and short written answer), 2 MCQ generator
calls on topics I find hard, and one ~120-word weak karangan I wrote myself.

Timing note: the live `seconds` values (41-173 s for items 6-12) were inflated because other testers were sharing the CPU.
For speed I used the clean desktop timings in the pack, multiplied by 2-4x for a phone.

## Verdict

**As Aiman: I would stop using it after the first chat.** On a real question I picked the wrong answer, and the tutor said
"Betul". Then it repeated that same sentence three times while I said I was confused. A kid like me trusts the app over
himself, so I would remember the wrong fact for the exam. The MCQs it made for me were nonsense I could not answer. When I said
I was tired, it told me to carry on.

**For the developers:** keep the offline tutor and evaluator away from students until the tutor stops affirming wrong
answers. Turn off the offline MCQ generator for students completely: of the BM generator items I saw, none was a usable
question. What works: replies are short, the wording is easy BM, it never just hands over the answer in the tutor, and the
JSON is always valid.

## Issues ranked by severity

### Critical

1. **The tutor says "Betul" to wrong answers and confirms misconceptions** (tutor, live:student-bm-1, -2, -3; pack tutor-bm-14, -2, -13).
   I said A (bigger marble chunk = faster). It replied *"Betul, ketulan marmar yang lebih besar akan meningkatkan kadar
   tindak balas."* This is scientifically backwards. In pack tutor-bm-14 the student says the cell takes in water in a hypertonic
   solution, and the reply is *"Betul, sel darah merah memang membutuhkan air untuk bertumbuh"*. That is wrong too, and it uses Indonesian wording.
   Almost every tutor reply starts with "Betul" whatever the student wrote. Aiman: *"aik dia ckp betul, so A la jawapan dia. ok
   sy hafal A."* That is the worst outcome possible: the app teaches the error.
   Fix: drop the opener "Betul" from the training targets, or only allow it when the selected option matches the key. Pass
   `correct_answer` into the tutor prompt, plus a flag for whether the student's pick is right, and filter "Betul" in post-processing when it doesn't match.

2. **The tutor repeats itself word for word and ignores the conversation** (tutor, live:student-bm-2, -3).
   Turns 2 and 3 got a reply identical to turn 1, including "Betul ... lebih besar". That came after I wrote *"hah? td ckp A betul,
   pastu serbuk pun laju ke? sy confuse la"* and then *"so jwpn B ke A ni sbnrnye?? jwb la cikgu"*. It never moved me closer.
   Aiman: *"dia ni robot ke, sama je jawab."* I would close the app here.
   Fix: train multi-turn SEDA examples with history, and give it a scaffold ladder (turn 1 question → turn 2 concrete hint
   such as "luas permukaan" → turn 3 worked analogy). Detect a duplicate of the previous reply and fall back to a canned hint.

3. **Generated MCQs are unanswerable or meaningless** (generator, live:student-bm-9, -10; pack generator-bm-1, -19, -5, -20, -7).
   - I asked for Form 4 *Kadar Tindak Balas*. It gave me "Apakah kadar tindak balas...?" with options 10/20/30/40%, the answer
     written in the stimulus, and a story about flowers going "hiss" into water.
   - I asked for *Ubahan* (Maths). It gave me "nombor asas bagi nombor 125 adalah 11", which is off-topic and has no meaning.
   - Pack examples: options "Tenaga tenaga" (generator-bm-1); "daya ... 500 mV" for a 5 V/1 A battery (generator-bm-19); "pemecutan genetik"
     for Inheritance (generator-bm-5/-20). Many questions also refer to "maklumat di atas" when there is nothing above.
   - Aiman: *"sy baca 3 kali x paham soalan apa. mesti sy yg bodoh."* For a weak student this does more than waste time: he blames himself.
   Fix: do not show offline-generated MCQs to students. Serve only cached `topic_anchors`. If they run out, show "Soalan baru akan
   dimuat turun bila ada internet". At minimum, add checks: topic keyword present, stimulus does not contain the answer, numeric answers verified.

4. **The evaluator calls a correct answer wrong and states false facts** (evaluator, pack evaluator-bm-2, -7, -3; live:student-bm-7).
   - In evaluator-bm-2 the student's answer equals the key, yet the feedback says *"jawapan kamu kurang tepat"*.
   - evaluator-bm-7 says *"Mitokondria tidak mengandungi kromosom DNA"* (mitochondria do have DNA) and "jawapan yang betul adalah B" when the key is C.
   - In live -7 it gives a wrong definition: *"Osmosis adalah proses pengeluaran air dari sel kepada larutan garam pekat"*.
   Fix: short-circuit exact matches in code before calling the model, and never let the model state an option letter. Restrict the
   feedback to restating the correct option text plus one reason taken from the cached `topic_anchors` worked example.

### Major

5. **The evaluator misses the actual misconception in a slangy answer** (evaluator, live:student-bm-8).
   I wrote *"sbb sejuk so makanan x busuk. kuman mati kt dlm peti ais"*. The real error is "kuman mati": cold slows bacteria, it does not kill them.
   The feedback was a generic "tidak menjelaskan mengapa suhu rendah memperkecil pertumbuhan", so it did not catch the error. The
   teacher insight says "Insufficient Depth" when it should say Misconception. It seems to read slang only on the surface.
   Fix: add training examples with Kelantan/Manglish short forms (x, sbb, kt, byk, pastu, leh, camne). Also add examples where the key misconception sits inside casual wording.

6. **"Hampir betul" for answers that are fully wrong** (evaluator, live:student-bm-7; pack evaluator-bm-3, -5, -7, -10).
   "Sel menyerap garam dan membesar" is the opposite of the right answer, yet the feedback starts "Kamu hampir betul". Aiman: *"hampir betul? so
   sy dekat la? ...pastu baca bawah salah teruk."* Mixed signals are confusing. False praise is no kinder than an honest "belum tepat lagi".
   Fix: use honest, warm openers such as "Belum tepat lagi, tapi bagus kamu cuba!". Keep "hampir" for partially correct written answers only.

7. **Tiredness and "bagi jawapan je" get no empathy and no help** (tutor, live:student-bm-4, -5).
   - "cikgu sy penat la.. mlm td tolong ayah kat kebun" got *"Tidak apa-apa, kamu boleh teruskan."* It feels dismissive. Aiman: *"x
     kesah pun sy penat. tutup app."*
   - "bagi jawapan je la cikgu. sy penat dah" got *"Boleh anda jelaskan lagi mengapa anda memilih pilihan tersebut?"* But I hadn't picked anything.
     Not giving the answer is correct. What was missing was a smaller step.
   Fix: add SEDA examples that acknowledge feelings in one short clause ("Penat ya, tolong ayah tu bagus. Jom cuba satu soalan je...").
   Give a concrete hint, not another "jelaskan" question, when a student asks for the answer. Also offer a "rehat dulu" button in the UI.

8. **Off-topic messages are treated as an answer** (tutor, live:student-bm-12).
   "cikgu td match JDT menang x? haha" got *"Bolehkah kamu terangkan mengapa jawapan itu tidak tepat?"* That reads as if I was wrong. It is harmless but robotic.
   Fix: include off-topic examples in training with a friendly redirect ("Haha, tak pasti la! Jom balik ke soalan marmar ni...").

9. **Karangan feedback ignores the main problem, the SMS-style spelling** (essay, live:student-bm-11).
   My essay was full of "sgt, x, byk, dlm, pastu, merata2, yg". It got band D, score 35. That is fair-ish; I'd estimate a C/D borderline for the ideas.
   But strengths include *"struktur ayat yang jelas"*. None of the 3 improvements mentions short forms, which is the first thing any BM teacher
   would circle and would cost real SPM marks. The improvements are the same generic lines seen across the pack ("Gunakan istilah yang lebih tepat
   dan formal", "Tambahkan perenggan"); they appear in roughly 20 of 30 pack essays. Aiman: *"semua org dpt komen sama je ke?"*
   Fix: run a cheap rule-based check for short forms and slang before pass 2 and inject the findings into the prompt or into the output. Require at least one improvement
   that quotes a phrase from the student's own essay.

10. **Harsh essay scores of 0** (essay_pass1, pack essaytest-essay-bm-27, -30).
    Two coherent if repetitive essays scored **0/100**. A weak student who sees "0" will feel humiliated, even with "Provisional" shown.
    Band scores also cluster on fixed values (22-25, 65, 92). Fix: clamp the band-D floor (e.g. a minimum of 10 for any on-topic essay), or show only the band and
    hide the provisional number offline.

11. **Indonesian vocabulary and a mix of formal "anda" and "kamu"** (language, across the pack).
    Examples: "berpikir", "membutuhkan", "kecepatan", "bisa", "apapun", "partikel", "persentase", "otot-otom". Within one session the replies switch
    between "anda" and "kamu" (live -4 vs -5). Students and BM teachers will notice. Fix: add a BM-Malaysia lexicon filter for the most common Indonesian
    forms and standardise on "kamu".

### Minor

12. **Generator latency on a phone** (generator, pack mean ~11 s desktop → ~25-60 s phone). This is too long for a student waiting for one question,
    with no progress text. (It is moot if the generator is disabled for students, see #3.) Tutor replies (~2-4 s desktop → ~5-15 s phone) are acceptable;
    show a typing indicator. Evaluator (~5-8 s → ~15-30 s) feels slow after a wrong answer. Show the correct option immediately and stream the explanation after.
13. **The tutor seldom confirms when you are right** (live:student-bm-6). I gave B with the correct reason (luas permukaan). It said "Betul ... Namun,
    apakah faktor lain...?" That's OK, but Aiman wants a clear "Ya, B betul!" before being stretched further. Otherwise right and wrong answers feel identical (see #1).
14. **object_lesson stories are long, strange and off-topic** (pack generator-bm-11, -13, -17, -9 live). Examples: a bottle that makes a "susu" sound; an "otot-otom" by the river.
    On a small screen this is a wall of text that adds nothing.

## What works well

- **Tutor replies are short (1-3 sentences) and in easy BM.** They are never preachy. Aiman can read one on a small screen in a few seconds.
- **The tutor never just handed over the answer**, even when I begged ("bagi jawapan je"). That is the right behaviour, if the hint ladder were better.
- **No slang confusion that broke the output**: it didn't misread "x", "sbb", "camne"; it just didn't engage with them deeply.
- **Evaluator feedback does name the correct concept** (osmosis, peti sejuk → mikroorganisma) in plain words, and it is not insulting.
- **Schema validity was 100%** in both the pack and my live calls. Nothing crashed and no raw JSON leaked.
- **Essay band for weak essays is roughly in the right zone** (my slangy essay → D; very short, simple essays → D). Essay time fits the 45-90 s notice.
- **Teacher insights** are tidy and categorised. They are useful to a teacher if the underlying judgement is right (often it isn't, see #4 and #5).

## Live interaction log (short)

| request | what I sent (as Aiman) | what came back | my reaction |
|---|---|---|---|
| student-bm-1 | Tutor turn 1: "sy rasa A sbb ketul besar lg byk benda dia so laju la kan?" | "Betul, ketulan marmar yang lebih besar akan meningkatkan kadar tindak balas..." | Learned the wrong thing |
| student-bm-2 | Turn 2: "td ckp A betul, pastu serbuk pun laju ke? sy confuse la" | Same reply, word for word | Confused |
| student-bm-3 | Turn 3: "so jwpn B ke A ni sbnrnye?? jwb la cikgu" | Same reply a third time | Would quit |
| student-bm-4 | "bagi jawapan je la cikgu. sy penat dah" | "jelaskan mengapa anda memilih pilihan tersebut?" | No help |
| student-bm-5 | "cikgu sy penat la.. tolong ayah kat kebun" (Maths) | "Tidak apa-apa, kamu boleh teruskan." | Felt ignored |
| student-bm-6 | Correct B with reason | "Betul, serbuk ... luas. Namun, faktor lain?" | OK, wanted a clearer "yes" |
| student-bm-7 | Evaluator: picked "sel menyerap garam dan membesar" | "Kamu hampir betul..." + wrong osmosis definition | Mixed signals |
| student-bm-8 | Evaluator: "kuman mati kt dlm peti ais" | Generic; missed "kuman mati" misconception | Didn't learn |
| student-bm-9 | MCQ: Kadar Tindak Balas, Menganalisis | 10/20/30/40% question, answer in stimulus, flower story | Felt stupid |
| student-bm-10 | MCQ: Ubahan, Mengaplikasi | "nombor asas bagi nombor 125 adalah 11" | Nonsense |
| student-bm-11 | ~120-word slangy karangan on kebersihan sekolah | D / 35; generic strengths and improvements, slang not mentioned | Fair grade, useless comments |
| student-bm-12 | "cikgu td match JDT menang x? haha" | "terangkan mengapa jawapan itu tidak tepat?" | Robotic |

```json
{"persona": "student-bm",
 "scores_1to5": {"accuracy": 1, "usefulness": 2, "tone_and_pedagogy": 2, "language_quality": 3, "speed_ux": 3},
 "issues": [
  {"severity": "critical", "type": "accuracy", "task": "tutor", "lang": "bm", "item_id": "live:student-bm-1",
   "evidence": "Betul, ketulan marmar yang lebih besar akan meningkatkan kadar tindak balas",
   "fix": "Pass correct_answer and is_correct into the tutor prompt; ban the 'Betul' opener unless the pick matches the key; post-filter in code"},
  {"severity": "critical", "type": "pedagogy", "task": "tutor", "lang": "bm", "item_id": "live:student-bm-3",
   "evidence": "identical reply on turns 1, 2 and 3 despite 'sy confuse la'",
   "fix": "Train multi-turn SEDA with history and a scaffold ladder; detect repeated replies and fall back to a canned concrete hint"},
  {"severity": "critical", "type": "accuracy", "task": "generator", "lang": "bm", "item_id": "live:student-bm-10",
   "evidence": "Jika nombor asas bagi nombor 125 adalah 11 (topic: Ubahan)",
   "fix": "Disable offline generator for students; serve cached topic_anchors only, or add topic/answer validation"},
  {"severity": "critical", "type": "accuracy", "task": "generator", "lang": "bm", "item_id": "live:student-bm-9",
   "evidence": "options 10%/20%/30%/40%, stimulus already says 20%",
   "fix": "Reject items whose stimulus contains the answer; verify numeric answers"},
  {"severity": "critical", "type": "accuracy", "task": "evaluator", "lang": "bm", "item_id": "evaluator-bm-2",
   "evidence": "student answer equals key, feedback says 'jawapan kamu kurang tepat'",
   "fix": "Short-circuit exact matches in code before calling the model"},
  {"severity": "major", "type": "accuracy", "task": "evaluator", "lang": "bm", "item_id": "evaluator-bm-7",
   "evidence": "Mitokondria tidak mengandungi kromosom DNA ... jawapan yang betul adalah B",
   "fix": "Forbid option letters; ground the explanation in the topic_anchors worked example"},
  {"severity": "major", "type": "pedagogy", "task": "evaluator", "lang": "bm", "item_id": "live:student-bm-8",
   "evidence": "student wrote 'kuman mati'; feedback never addresses it",
   "fix": "Add slang/short-form training answers whose key misconception must be named"},
  {"severity": "major", "type": "pedagogy", "task": "evaluator", "lang": "bm", "item_id": "live:student-bm-7",
   "evidence": "Kamu hampir betul (answer was the opposite)",
   "fix": "Use honest, warm opener ('Belum tepat lagi, tapi bagus cuba'); reserve 'hampir' for partial answers"},
  {"severity": "major", "type": "pedagogy", "task": "tutor", "lang": "bm", "item_id": "live:student-bm-5",
   "evidence": "'sy penat la' -> 'Tidak apa-apa, kamu boleh teruskan.'",
   "fix": "Train short empathetic acknowledgements plus one small next step; add a 'rehat dulu' UI option"},
  {"severity": "major", "type": "pedagogy", "task": "tutor", "lang": "bm", "item_id": "live:student-bm-4",
   "evidence": "'bagi jawapan je' -> 'jelaskan mengapa anda memilih pilihan tersebut?' (none chosen)",
   "fix": "When a student asks for the answer, give a concrete hint (e.g. luas permukaan) rather than another 'jelaskan'"},
  {"severity": "major", "type": "pedagogy", "task": "essay", "lang": "bm", "item_id": "live:student-bm-11",
   "evidence": "essay full of 'sgt, x, byk, pastu'; strength listed: 'struktur ayat yang jelas'; no improvement mentions short forms",
   "fix": "Rule-based short-form detector injected into pass 2; require one improvement quoting the student's own text"},
  {"severity": "major", "type": "ux", "task": "essay_pass1", "lang": "bm", "item_id": "essaytest-essay-bm-27",
   "evidence": "score 0 for a coherent on-topic essay (also essaytest-essay-bm-30)",
   "fix": "Clamp the floor for on-topic essays or show band only while offline"},
  {"severity": "minor", "type": "language", "task": "tutor", "lang": "bm", "item_id": "tutor-bm-14",
   "evidence": "membutuhkan, berpikir, bisa, kecepatan; anda/kamu mixed",
   "fix": "BM-Malaysia lexicon post-filter for common Indonesian forms; standardise on 'kamu'"},
  {"severity": "minor", "type": "ux", "task": "tutor", "lang": "bm", "item_id": "live:student-bm-12",
   "evidence": "'match JDT menang x?' -> 'terangkan mengapa jawapan itu tidak tepat?'",
   "fix": "Add off-topic training examples with a friendly redirect"},
  {"severity": "minor", "type": "ux", "task": "generator", "lang": "bm", "item_id": "generator-bm-14",
   "evidence": "16.3 s desktop (~30-60 s on phone) for one MCQ, plus a long, odd object_lesson",
   "fix": "Show a progress message; shorten or drop object_lesson for the student view"}
 ]}
```

## Summary

Verdict (Aiman): I would quit after the first tutor chat. It said my wrong answer was "Betul" and then repeated itself three times.
Verdict (developers): do not ship the offline tutor or evaluator to students as they are. Disable the offline MCQ generator for students.
What works: short replies in easy BM, the answer is never given away, schema is 100% valid, and essay bands for weak essays are roughly right.

Scores: accuracy 1, usefulness 2, tone_and_pedagogy 2, language_quality 3, speed_ux 3.

Top 5 issues:
1. Critical: the tutor affirms wrong answers ("Betul, ketulan marmar yang lebih besar akan meningkatkan kadar...", live:student-bm-1; pack tutor-bm-14).
2. Critical: the tutor repeats an identical reply across turns and ignores "sy confuse la" (live:student-bm-2/-3), so a confused student gets no hint ladder.
3. Critical: generated MCQs are unanswerable or off-topic ("nombor asas" for Ubahan, live:student-bm-10; answer inside the stimulus, live -9). Weak students blame themselves.
4. Critical/major: the evaluator marks a correct answer wrong (evaluator-bm-2), states false facts (mitochondria have no DNA, evaluator-bm-7; wrong osmosis definition, live -7), says "hampir betul" for opposite answers, and missed "kuman mati" in a slangy answer (live -8).
5. Major: no empathy for "sy penat"/"bagi jawapan je" (live -4/-5). Karangan feedback is generic and ignores SMS short forms (live -11). Some essays score 0 (essay-bm-27/-30).
