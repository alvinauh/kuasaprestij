# SPM critique — 2026-10-26

Judge: LLM playing an SPM examiner/teacher and an A+ candidate. Scores 1-5 (5 = indistinguishable from a real paper). Mark allocations quoted by the judge are from its memory; confidence is shown; verify low/medium against official papers.

## 2. Essay / composition tasks

| Task | src | authentic | marks | length | theme | model ans | rubric |
|---|---|---|---|---|---|---|---|
| Biology content essay | generator_node | 3 | 3 | 3 | 4 | 3 | 2 |

### Biology content essay (generator_node)
- Real equivalent: SPM Biology 4551 Kertas 2 (structured/essay), Bahagian B essay-style item with a stimulus diagram — real Biology Paper 2 is 2h30m, 100 marks total (Section A structured ~40-50, Section B essay choice ~50-60); a 20-mark multi-part stimulus question with an 8-mark 'suggest a field study' part is closest to a Section B essay question, but real SPM Biology does not usually bundle (a)-(d) sub-parts with individual mark tags inside one essay — that layout is more like a trial-paper or textbook 'structured essay'. _(confidence medium)_
- Task: _(a) State two biotic components and two abiotic components in the garden ecosystem shown in Diagram 1. [4 marks]
(b) Describe the flow of energy in the food web that includes grass, caterpillars, butterflies and small bi_
- Teacher: The content (ecosystem components, energy flow, food web disruption, quadrat field study) is squarely SPM Biology and the stimulus is the right kind. But the (a)-(d) sub-part layout with per-part mark tags reads like a school worksheet, not a Lembaga Peperiksaan Section B essay, and the rubric is a generic 3-band holistic scale — real Biology Kertas 2 is marked by Peraturan Pemarkahan point-by-point (isi/huraian), not by 'Cemerlang/Baik/Memuaskan' bands. The model answer is competent but thin on the 8-mark part (no labelled diagram, no explicit 'controlled variable kept constant' justification, no mention of random sampling technique beyond 'randomly').
- Student: Part (d) says 'state the variables, apparatus, procedure and analysis' but the model answer's analysis is cut off mid-sentence ('number of gr') — I can't check whether it earns all 8 marks. Also, if this is meant to be an essay, why am I given four labelled sub-questions with mark tags? Real SPM essay questions give me one stem and let me structure the answer myself.
- Fixes: Reformat as a single Section B essay stem (e.g. 'Diagram 1 shows a garden ecosystem. Based on the diagram, discuss the biotic and abiotic components, the flow of energy, and the effect of a decrease in caterpillars on the garden. Suggest a field study...') with one 20-mark tag, OR keep sub-parts but label them as a 'structured question' (Section A style) and drop the essay framing.; Replace the 3-band Cemerlang/Baik/Memuaskan rubric with a point-based Peraturan Pemarkahan: list the specific isi/huraian points per part (e.g. (a) 1 mark per correct component ×4; (b) 1 mark per correct trophic link + 1 for 'energy lost as heat'; (d) 1 mark each for manipulated/responding/fixed variables, apparatus, random quadrat procedure, and analysis).; Complete the model answer for (d) — the current text is truncated at 'number of gr' — and add the missing SPM-expected points: random sampling method (random number table / throw quadrat), why light intensity is the manipulated variable, and a labelled bar chart or table as the analysis output.; Tighten (c): the model answer says 'rose bushes may grow more leaves and thrive' but does not explicitly link to the observation 'fewer leaves' — add the causal chain (fewer caterpillars → less defoliation → more leaves retained) and note the bird population effect with a term like 'carrying capacity' or 'competition' to justify the 4 marks.

## 3. Essay marking calibration (the real `evaluator_node`)

### Biology content essay (max 20)

| tier | words | mark | frac | band | problems |
|---|---|---|---|---|---|
| excellent | 753 | 18/20 | 0.9 | Cemerlang | ok |
| good | 408 | 18/20 | 0.9 | Cemerlang | 0.90 of max is outside the expected 0.60-0.85 for 'good' |
| average | 356 | 15/20 | 0.75 | Baik | 0.75 of max is outside the expected 0.40-0.72 for 'average' |
| weak | 200 | 11/20 | 0.55 | Baik | 0.55 of max is outside the expected 0.15-0.45 for 'weak' |
| off_topic | 430 | 0/20 | 0.0 |  | ok |
| model_copy | 234 | 0/20 | 0.0 |  | ok |
| average (rerun) | 356 | 15/20 | 0.75 | Baik | 0.75 of max is outside the expected 0.40-0.72 for 'average' |

- Ordering problems: none
- Same 'average' script marked twice differs by 0.0 marks (SPM double-marking tolerance is a few marks out of 20).

**4 of 7 marked scripts have a calibration problem.**

### Feedback quality (examiner + student)

| task | tier | mark | fair? | expected | accuracy | specific | SPM terms | actionable |
|---|---|---|---|---|---|---|---|---|
| Biology content essay | excellent | 18/20 | too_high | 13-16/20 | 2 | 4 | 2 | 3 |
| Biology content essay | average | 15/20 | too_high | 9-12/20 | 2 | 3 | 2 | 3 |
| Biology content essay | weak | 11/20 | too_high | 7-9/20 | 2 | 3 | 2 | 3 |

- **Biology content essay / excellent** — Teacher: The app's 18/20 is inflated: a real SPM Biology marker would not award near-full marks when the manipulated variable in (d) is conceptually wrong (area shaded instead of a light-meter reading in lux) and the control is missing, because these are standard experimental-design marks. The feedback is specific to the script, but it uses generic 'components' language rather than SPM Biology marking terms (pemboleh ubah dimanipulasikan/dimalarkan/bergerak balas, hipotesis, kaedah, keputusan) and does not show the mark breakdown per section. | Student: It tells me exactly which line to rewrite and what to add, which is useful, but the 18/20 would mislead me into thinking I am near full marks when the manipulated-variable and control errors would cost real SPM marks. I would want the app to show the mark allocation per part (a)-(d) and use the actual SPM Biology command words so I can practise to the scheme.
- **Biology content essay / average** — Teacher: The script is a Biology content essay, not an SPM Bahasa Melayu or English paper, so the 20-mark band 'Baik' scale is being applied to something with no official SPM weighting; if this is meant as a school essay, 15/20 is generous because the answer is largely recall and the experiment design is incomplete. A real marker would deduct for the missing controlled variables, the unstated measurement method, and the conclusion not tied to the hypothesis, giving roughly 9-12/20. | Student: The feedback does point at real gaps (fixed variables, light meter, quadrat, conclusion), but it does not tell me how many marks each gap is worth or show the exact sentence I should write, so I cannot tell whether fixing all four gets me from 15 to 18 or only to 16. It also never says which SPM paper or mark scheme this is, so I would not trust it as exam training.
- **Biology content essay / weak** — Teacher: The 11/20 is generous: part (d) is a full experimental-design question and the script shows no fixed variables, no random sampling, no replicates and no analysis, so a real marker would cap it well below half marks even if (a)-(c) are sound. The feedback correctly spots the (d) gaps but then invents a 'soil pH'/'bar chart of light intensity' expectation and never anchors marks to a per-point scheme, which is not how SPM Biology Kertas 2 is marked. | Student: It tells me part (d) is where I lost marks, which is useful, but it doesn't tell me how many marks each part is worth or exactly which sentences earned credit, so I can't tell what '11/20' is built from. The 'how it should look' outline is cut off mid-sentence at Isi 3, so I can't actually use it to rewrite the answer.
