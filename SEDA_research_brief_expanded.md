# Auditing the dialogic quality of AI-authored teacher scaffolds with SEDA
### A research brief

**Dr Alvin Auh Min Han** — Institute of Teacher Education, Gaya Campus, Sabah · Ministry of Education
Malaysia · PhD, comparative education policy. *In Cambridge Aug–Sept (Møller Institute, Churchill
College) on a government agentic-AI-for-education programme.* · alvinauh@hotmail.com

---

**The problem.** Malaysian SPM (national-exam) candidates in English are an exam-conditioned,
low-metacognition cohort. I argue that the dominant "AI-as-autonomous-Socratic-tutor" vision is a
poor fit for them: relentless machine questioning risks reinforcing learned helplessness rather than
relieving it.

**The system.** So the system I built is deliberately *not* a conversational tutor. It detects
repeated failure and generates a **teacher-facing intervention script** that hands the learner to a
human — *escalating the person, not the dialogue*. The teacher, not the model, conducts the dialogue.

The audited component is a triage engine. It reads the answer log and flags a student when the *same
error category* recurs on the *same topic*; the current default fires on the **second** such failure
(`threshold = 2` in `_get_flagged_students`). Flagged cases — subject, topic, error category and the
system's own root-cause diagnosis — are batched to the LLM, which returns one intervention script and
one suggested hands-on activity per case. Nothing is auto-sent to the student: the output is a note
for the teacher. The corpus audited here is scoped to **Form 4–5 English (Bahasa Inggeris)**.

Concretely the platform is four components, of which only the last is the SEDA object of study:

1. **Generation pipeline** — a FastAPI + LangGraph multi-agent chain (retrieve syllabus → serve or
   generate a question → evaluate the answer → update mastery) that also auto-marks the response.
2. **Learner frontend** — a React/TanStack Router web app the student actually practises in.
3. **Mastery-tracking service** — a per-student, per-topic mastery score (`+0.1` on a correct answer,
   `−0.05` on a wrong one, partial-credit-scaled for open items), with a topic marked complete at a
   score ≥ 0.9 or after 10 questions on it in a day.
4. **Triage engine** — the failure-detection + script-generation step described above. This is the
   only part that produces the machine-authored teacher text the SEDA audit codes.

**Two representative scripts** (drawn from the audit corpus — 50 synthetic flagged-student cases run
through the production generator; no real student data). Note the recurring
acknowledge → invite-reasoning → directive-activity shape and the English/Malay code-switching:

> *Grammar in Context (diagnosed "Language Barrier"):* "I see what you're trying to say, tapi susunan
> ayat ni nampak macam 'direct translation' dari Bahasa Melayu. If we look at the English
> Subject-Verb-Object pattern, where do you think the action word should go?"
> **Activity:** "Sentence Scramble — give the student their own sentence cut into individual word
> cards and ask them to rearrange the cards into an English S-V-O pattern, comparing the physical
> layout to their original BM-influenced draft."

> *Continuous Writing (diagnosed "Structural Issue"):* "Cerita awak menarik, tapi pembaca mungkin
> keliru tentang susunan kejadiannya. Boleh tak kita cuba petakan apa yang berlaku pada permulaan,
> tengah, dan pengakhiran cerita ini?"
> **Activity:** "Draw a 'Story Mountain' and ask the student to plot the three most important events
> from their narrative onto the start, the peak (climax) and the base (resolution)."

**The wider platform.** The triage engine sits inside a broader KSSM practice application (the
learner app is branded *Skor*). It ingests DSKP KSSM syllabus PDFs into a vector store and drives
adaptive practice across school subjects, serving three item types — MCQ, short-answer and
essay/composition — and auto-marking all three, including SPM-style composition against a
multi-band content/language/organisation rubric that returns a worked "how it should be structured"
outline alongside the mark. Practice runs in two modes: an *anchor* mode that serves cached,
syllabus-grounded questions, and an *adaptive* mode that generates fresh items tailored to a
student's past mistakes. Mastery is tracked per topic (the `±0.1 / ∓0.05` model above), and a
teacher-facing insights view plus Telegram alerting surface class mastery and the flagged-student
list. For this study the corpus is held to English only; the audit concerns the intervention scripts,
not the practice engine.

**The evaluation problem — and the novel move.** How do you evaluate the *dialogic quality* of a
system that never talks to the student? My approach is to treat **SEDA as an artifact audit**:
instead of coding live classroom talk, I code the machine-authored scripts against the eight SEDA
clusters. This asks whether dialogic richness can be *engineered into* a scaffold even when the
deployment itself is non-dialogic. The wider study is Technical Action Research (a zero-respondent,
telemetry-driven reliability-engineering account) with this SEDA audit as its pedagogical-quality
strand; a single-expert teacher appraisal is still to come.

**What the coding shows (a stratified corpus; 167 communicative acts, double-coded).**
- The scripts concentrate heavily in **Invite elaboration/reasoning (IRE)** and **Guide direction
  (GD)**. *Make-reasoning-explicit, Build-on-ideas, and reflective moves are largely absent* — an
  actionable signal that prompt templates should add metacognitive and reasoning-surfacing moves.
- **Inter-rater reliability is low** (Cohen's κ in the slight range; analysis being finalised) and,
  more informatively, the disagreement is **systematic**: coders cannot cleanly separate IRE from
  GD, and imperative/activity acts ("cut the draft into paragraphs", "draw a story mountain") do not
  map onto a scheme built for live utterances.

**The claim I'm testing.** I read that low, patterned reliability not as coder error but as a
**genuine boundary condition** — SEDA applied to directive, non-conversational, AI-authored
instructional text. If so, it says something about the scheme's transfer as much as about my scripts.

**What I'd value your view on**
1. Is the *artifact-audit* application of SEDA defensible — coding machine-generated scaffolds rather
   than enacted talk?
2. How would you interpret the low, systematic reliability on directive text — a coding problem to
   train out, or a real limit of a live-talk scheme on non-conversational text?
3. Would you adapt the clusters (or add a directive/activity category) for text of this kind?

**Scope, stated plainly.** This is a *design evaluation*, not an efficacy study. It makes no claim
about student learning; that awaits a later, IRB-approved classroom phase. The reliability figure is
being finalised and is reported honestly, low value and all — the low kappa is treated as a finding,
not hidden.
