"""
Stratified synthetic flagged-student cases for the SEDA audit corpus.

50 cases = 10 English error_categories x 5 topics each (every error type appears
5 times, well above the "at least twice" floor). Topics are paired with error
types where they realistically co-occur in KSSM Bahasa Inggeris. Each case carries
a specific, plausible root_cause so the real triage generator has something
concrete to scaffold against.

No real students are involved — student_ids are synthetic (SYNTH-###).
"""

# (error_category, [(topic, root_cause), x5])
STRATA = [
    ("Conceptual Gap", [
        ("Literature: Poems", "cannot distinguish literal meaning from figurative or thematic meaning in poems"),
        ("Literature: Novel", "confuses plot events with the underlying themes when analysing the novel"),
        ("Global Issues and Current Affairs", "misreads the writer's stance, treating opinion as fact"),
        ("Science and Technology", "does not grasp the cause-and-effect relationships described in the text"),
        ("Media and Communication", "cannot identify bias or the intended audience in media texts"),
    ]),
    ("Careless Error", [
        ("Grammar in Context", "knows the rule but slips on subject-verb agreement under time pressure"),
        ("Vocabulary Building", "chooses the right word family but the wrong form (noun instead of adjective)"),
        ("Directed Writing", "omits one or two required content points despite understanding the task"),
        ("Continuous Writing", "frequent punctuation slips (commas, capital letters) in otherwise sound sentences"),
        ("Listening", "mishears specific details such as numbers, dates and names"),
    ]),
    ("Language Barrier", [
        ("Listening", "struggles to follow spoken English at natural pace and misses key details"),
        ("Global Issues and Current Affairs", "limited vocabulary blocks understanding of the passage"),
        ("Grammar in Context", "L1 (Bahasa Melayu) sentence structure interferes with English word order"),
        ("Health and Wellness", "cannot paraphrase and copies chunks verbatim due to limited expression"),
        ("Vocabulary Building", "narrow vocabulary range restricts both comprehension and expression"),
    ]),
    ("Incomplete Answer", [
        ("Directed Writing", "answers only part of the task and omits format or purpose requirements"),
        ("Global Issues and Current Affairs", "gives one reason where two are required and loses marks"),
        ("Health and Wellness", "states a point but never develops or explains it"),
        ("Society and Community", "answers the 'what' but ignores the 'why' and 'how' in the question"),
        ("People and Work", "does not use evidence from the text to support the answer"),
    ]),
    ("Content Weakness", [
        ("Continuous Writing", "ideas are generic and undeveloped, lacking specific examples"),
        ("Directed Writing", "content drifts off-task and does not address the prompt's scenario"),
        ("Global Issues and Current Affairs", "arguments lack supporting detail or evidence"),
        ("Environment and Nature", "repeats the same idea in different words rather than developing new points"),
        ("Society and Community", "opinions are stated without justification or elaboration"),
    ]),
    ("Language Accuracy", [
        ("Continuous Writing", "frequent tense and subject-verb agreement errors reduce clarity"),
        ("Grammar in Context", "recurring errors with articles and prepositions"),
        ("Directed Writing", "sentence fragments and run-on sentences throughout"),
        ("Health and Wellness", "limited and repetitive vocabulary with imprecise word choice"),
        ("Technology and Innovation", "spelling and punctuation errors distract from the meaning"),
    ]),
    ("Organisation/Register", [
        ("Continuous Writing", "paragraphs lack topic sentences and logical progression"),
        ("Directed Writing", "wrong register for the text type (too informal for a formal letter)"),
        ("Media and Communication", "ideas are not grouped logically and there is no clear paragraphing"),
        ("Friendships and Relationships", "no clear introduction or conclusion framing the piece"),
        ("People and Work", "weak cohesion with missing linking devices between ideas"),
    ]),
    ("Below Length Requirement", [
        ("Continuous Writing", "writes well under the minimum word count, leaving points undeveloped"),
        ("Directed Writing", "runs out of ideas and stops before completing all required points"),
        ("Global Issues and Current Affairs", "essay is too brief to develop a sustained argument"),
        ("Travel and Adventure", "descriptive piece is too short to create vivid imagery"),
        ("Arts and Culture", "response ends abruptly, well below the expected length"),
    ]),
    ("Structural Issue", [
        ("Literature: Drama", "response has no clear point-evidence-explanation structure"),
        ("Literature: Novel", "jumps between ideas without organising the essay around the question"),
        ("Continuous Writing", "narrative lacks a coherent beginning-middle-end structure"),
        ("Literature: Short Stories", "answer is a plot summary rather than a structured analysis"),
        ("Directed Writing", "information is not ordered logically for the reader"),
    ]),
    ("Insufficient Depth", [
        ("Literature: Poems", "identifies poetic devices but does not explain their effect"),
        ("Literature: Short Stories", "describes characters but does not analyse their significance"),
        ("Global Issues and Current Affairs", "states a position but does not explore its implications"),
        ("Literature: Novel", "surface-level reading with no engagement with themes or the writer's craft"),
        ("Science and Technology", "explanations stop at 'what' without exploring 'why it matters'"),
    ]),
]

# Deterministic wrong_count spread (2-4) so the "repeated failure" signal varies.
_WRONG_CYCLE = [2, 3, 4, 3, 2]


def build_cases():
    """Return the 50 synthetic flagged-student records, deterministic order."""
    cases = []
    idx = 0
    for error_category, pairs in STRATA:
        for j, (topic, root_cause) in enumerate(pairs):
            idx += 1
            cases.append({
                "script_id": f"S{idx:03d}",
                "student_id": f"SYNTH-{idx:03d}",
                "subject": "Bahasa Inggeris",
                "topic": topic,
                "error_category": error_category,
                "wrong_count": _WRONG_CYCLE[j % len(_WRONG_CYCLE)],
                "root_cause": root_cause,
                "last_seen": "2026-07-21",
                "intervention_script": "",
                "suggested_activity": "",
            })
    return cases


if __name__ == "__main__":
    cs = build_cases()
    from collections import Counter
    print(f"{len(cs)} cases")
    print("per error_category:", dict(Counter(c["error_category"] for c in cs)))
    print("distinct topics:", len({c["topic"] for c in cs}))
