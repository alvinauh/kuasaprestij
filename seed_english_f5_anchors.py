#!/usr/bin/env python3
"""
Bahasa Inggeris F4/F5 anchor repair + F5 seed
==============================================
Run: python seed_english_f5_anchors.py

What this script does:
  1. Fixes subject name: "English" → "Bahasa Inggeris" (2 legacy rows)
  2. Fixes Sejarah F5 topics stored at form_level=4
  3. Deletes 4 null Continuous Writing / Directed Writing shell rows
  4. Upserts Continuous Writing + Directed Writing for F4 (replacing nulls)
  5. Seeds all missing Bahasa Inggeris F5 anchors with form_level=5

Unique constraint: (topic, language, form_level)
on_conflict key used: "topic,language,form_level"
"""

import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from dotenv import load_dotenv
    load_dotenv(override=True)
except ImportError:
    pass

from agents.orchestrator import supabase

SUBJECT  = "Bahasa Inggeris"
LANGUAGE = "English"
FALLBACK_AUDIO = "https://cdn.kuasaprestij.tech/assets/fallback_beat.mp3"
FALLBACK_VIDEO = "https://cdn.kuasaprestij.tech/assets/fallback_video.mp4"

# ---------------------------------------------------------------------------
# F4 REPAIRS — Continuous Writing & Directed Writing (were null)
# ---------------------------------------------------------------------------

F4_REPAIRS = [
    {
        "topic": "Continuous Writing",
        "form_level": 4,
        "mnemonic_lyrics": (
            "Hook them first with one strong line,\n"
            "Build your story, scene by scene by scene,\n"
            "Paragraph breaks — let each idea shine,\n"
            "End with impact, not just 'The End' routine."
        ),
        "anchor_question": {
            "question_type": "mcq",
            "kbat_level": "Menganalisis",
            "illustrative_notes": (
                "Continuous writing in SPM Paper 1 Section B asks for a narrative, descriptive, "
                "or reflective essay of 200–250 words. Key skills: a strong opening hook, "
                "coherent paragraph structure (topic sentence + supporting details + link), "
                "vivid descriptive language, and a satisfying conclusion. "
                "Avoid plot summaries — show, don't tell."
            ),
            "question": (
                "A student begins their narrative essay with: "
                "'It was a normal Tuesday morning — until the phone rang.' "
                "Why is this an effective opening sentence?"
            ),
            "options": [
                "It immediately introduces all the main characters",
                "It creates suspense by hinting that something unexpected will happen",
                "It tells the reader exactly what the story will be about",
                "It uses a formal, academic tone appropriate for SPM essays",
            ],
            "correct_answer": "It creates suspense by hinting that something unexpected will happen",
            "distractor_rationale": {
                "It immediately introduces all the main characters": (
                    "Opening sentences rarely introduce all characters; "
                    "the power here is the contrast between 'normal' and what the phone call disrupts."
                ),
                "It tells the reader exactly what the story will be about": (
                    "Effective narrative hooks create mystery — they withhold the outcome, not reveal it."
                ),
                "It uses a formal, academic tone appropriate for SPM essays": (
                    "Narrative essays use a personal, vivid tone, not a formal academic one."
                ),
            },
        },
    },
    {
        "topic": "Directed Writing",
        "form_level": 4,
        "mnemonic_lyrics": (
            "Format first — letter, article, or speech,\n"
            "Hit every point the question puts in reach,\n"
            "Formal tone and cohesion, start to end,\n"
            "Check your layout — marks are there to spend."
        ),
        "anchor_question": {
            "question_type": "mcq",
            "kbat_level": "Mengaplikasi",
            "illustrative_notes": (
                "Directed writing (SPM Paper 1 Section A) requires you to produce a specific text type "
                "— formal letter, article, report, speech, or notice — using ALL given content points. "
                "Marks are split between language accuracy and content coverage. "
                "Each text type has a required format: letters need addresses, date, salutation, and sign-off; "
                "articles need a headline and the writer's name; speeches need an appropriate greeting."
            ),
            "question": (
                "You are writing a formal letter of complaint to a hotel manager "
                "about poor service during your stay. "
                "Which opening salutation is MOST appropriate?"
            ),
            "options": [
                "Dear Friend,",
                "Hi Manager,",
                "Dear Sir / Madam,",
                "To Whom It May Concern:",
            ],
            "correct_answer": "Dear Sir / Madam,",
            "distractor_rationale": {
                "Dear Friend,": (
                    "A complaint letter is a formal document; 'Dear Friend' is informal and inappropriate."
                ),
                "Hi Manager,": (
                    "'Hi' is informal and unsuitable for a formal written complaint."
                ),
                "To Whom It May Concern:": (
                    "This is used when the recipient is completely unknown; "
                    "since you are writing specifically to the hotel manager, 'Dear Sir / Madam' is preferred."
                ),
            },
        },
    },
]

# ---------------------------------------------------------------------------
# F5 ANCHORS — full set including topics not in F4 + higher-KBAT variants
# ---------------------------------------------------------------------------

F5_ANCHORS = [
    {
        "topic": "Continuous Writing",
        "mnemonic_lyrics": (
            "Argue your point, then prove it clear,\n"
            "Topic sentence leads each idea here,\n"
            "Evidence, example — build your case,\n"
            "Conclude with power, leave no empty space."
        ),
        "anchor_question": {
            "question_type": "mcq",
            "kbat_level": "Menilai",
            "illustrative_notes": (
                "F5 continuous writing often requires argumentative or discursive essays. "
                "A strong argument has a clear thesis, well-developed body paragraphs (point–evidence–explanation), "
                "acknowledgement of counterarguments, and a conclusion that reinforces the thesis. "
                "Vary sentence structure; use discourse markers (furthermore, however, consequently) "
                "to show logical flow."
            ),
            "question": (
                "A student writes an argumentative essay on social media. "
                "Paragraph 3 states: 'Social media causes depression among teenagers.' "
                "The paragraph then gives three examples of teens feeling sad after scrolling. "
                "What is MISSING from this paragraph to make it fully developed?"
            ),
            "options": [
                "A counterargument acknowledging that social media also has benefits",
                "A topic sentence that introduces the main point",
                "More examples of teenagers feeling sad",
                "A formal salutation at the start",
            ],
            "correct_answer": "A counterargument acknowledging that social media also has benefits",
            "distractor_rationale": {
                "A topic sentence that introduces the main point": (
                    "'Social media causes depression' IS a topic sentence — "
                    "the paragraph already has one."
                ),
                "More examples of teenagers feeling sad": (
                    "Three examples is sufficient evidence; adding more without analysis weakens the argument."
                ),
                "A formal salutation at the start": (
                    "Essays do not require salutations — those belong in letters."
                ),
            },
        },
    },
    {
        "topic": "Directed Writing",
        "mnemonic_lyrics": (
            "Speech or report — know your text type well,\n"
            "Every content point you must address and tell,\n"
            "Formal flows from greeting down to close,\n"
            "Language accuracy matters most."
        ),
        "anchor_question": {
            "question_type": "mcq",
            "kbat_level": "Menilai",
            "illustrative_notes": (
                "F5 directed writing tasks often involve speeches, reports, or formal articles. "
                "A speech requires: an appropriate greeting ('Ladies and gentlemen'), "
                "all content points addressed in order, a formal register throughout, "
                "and a closing thank-you. Reports require a title, introduction, findings "
                "under subheadings, and a recommendation section."
            ),
            "question": (
                "You have written a speech for your school's Anti-Bullying Campaign. "
                "You addressed all five content points but ended with: "
                "'OK, that's all I have to say. Bye!' "
                "Why will this closing REDUCE your marks?"
            ),
            "options": [
                "It is too short and should have a longer conclusion",
                "It uses informal language that breaks the formal register required",
                "It does not repeat all five content points",
                "It fails to include the speaker's full name",
            ],
            "correct_answer": "It uses informal language that breaks the formal register required",
            "distractor_rationale": {
                "It is too short and should have a longer conclusion": (
                    "Length is not the main issue — register is. "
                    "A formal closing like 'Thank you for your attention' can be brief and still score full marks."
                ),
                "It does not repeat all five content points": (
                    "Conclusions summarise — they do not re-present every point in full."
                ),
                "It fails to include the speaker's full name": (
                    "SPM speech tasks do not require you to state your own name in the closing."
                ),
            },
        },
    },
    {
        "topic": "Summary Writing",
        "mnemonic_lyrics": (
            "Find the main points — three, four, or five,\n"
            "Paraphrase the text to keep it alive,\n"
            "No opinion, no extras, just what is there,\n"
            "Count your words — 80 to 130, be fair."
        ),
        "anchor_question": {
            "question_type": "mcq",
            "kbat_level": "Menganalisis",
            "illustrative_notes": (
                "Summary writing (SPM Paper 2 Section A) requires you to identify and paraphrase "
                "the main points from a given passage in 80–130 words. "
                "Rules: use your OWN words (do not lift sentences), do NOT include your opinion, "
                "do NOT include examples or minor details — only main ideas. "
                "Marks are for content points identified AND language accuracy."
            ),
            "question": (
                "A student summarises a passage about recycling. "
                "She writes: 'Recycling is very important and we should all do it.' "
                "Why would this sentence NOT earn a content mark?"
            ),
            "options": [
                "It is too short to be a valid point",
                "It expresses the student's personal opinion rather than paraphrasing the text",
                "It uses informal language",
                "It does not mention specific recycling methods from the passage",
            ],
            "correct_answer": "It expresses the student's personal opinion rather than paraphrasing the text",
            "distractor_rationale": {
                "It is too short to be a valid point": (
                    "Length is not the criterion — a short, accurate paraphrase can earn a mark."
                ),
                "It uses informal language": (
                    "The sentence is grammatically standard — the problem is it's an opinion, not a text point."
                ),
                "It does not mention specific recycling methods from the passage": (
                    "The issue is the opinion expressed ('we should all do it'), "
                    "not whether methods were named."
                ),
            },
        },
    },
    {
        "topic": "Reading Comprehension F5",
        "mnemonic_lyrics": (
            "Skim for gist, then scan for detail,\n"
            "Inference lives beyond the line's veil,\n"
            "Author's purpose — inform, persuade, entertain,\n"
            "Evidence in text, go back again."
        ),
        "anchor_question": {
            "question_type": "mcq",
            "kbat_level": "Menilai",
            "illustrative_notes": (
                "F5 reading comprehension requires higher-order skills: "
                "inferring implied meaning, identifying the author's purpose and tone, "
                "evaluating the effectiveness of arguments, and synthesising information "
                "across paragraphs. Look for signal words (however, despite, consequently) "
                "that show the author's stance."
            ),
            "question": (
                "The writer of a magazine article states: "
                "'While social media connects millions, the evidence overwhelmingly shows "
                "it corrodes genuine human connection.' "
                "Which word BEST describes the author's tone?"
            ),
            "options": [
                "Neutral",
                "Pessimistic",
                "Critical",
                "Enthusiastic",
            ],
            "correct_answer": "Critical",
            "distractor_rationale": {
                "Neutral": (
                    "'Overwhelmingly shows it corrodes' reveals a clear negative judgement — "
                    "a neutral writer would not use such strong language."
                ),
                "Pessimistic": (
                    "Pessimism implies hopelessness about the future; "
                    "the author is making a reasoned critique, not expressing despair."
                ),
                "Enthusiastic": (
                    "Enthusiasm would suggest the author supports social media — "
                    "the opposite is evident here."
                ),
            },
        },
    },
    {
        "topic": "Friendships and Relationships",
        "mnemonic_lyrics": (
            "Deeper bonds take time to grow,\n"
            "Peer pressure tests what true friends know,\n"
            "Loyalty shown in words and deeds,\n"
            "A real friend helps when someone needs."
        ),
        "anchor_question": {
            "question_type": "mcq",
            "kbat_level": "Menilai",
            "illustrative_notes": (
                "At F5 level, friendship themes involve evaluating the impact of peer pressure, "
                "loyalty under difficult circumstances, and the long-term consequences of "
                "relationship decisions. Questions require you to judge characters' choices "
                "and justify your view with evidence."
            ),
            "question": (
                "Rina knows her best friend Farah is copying homework every day. "
                "She says nothing because she does not want to lose the friendship. "
                "Which value does Rina's silence FAIL to demonstrate?"
            ),
            "options": [
                "Courage",
                "Empathy",
                "Loyalty",
                "Respect",
            ],
            "correct_answer": "Courage",
            "distractor_rationale": {
                "Empathy": (
                    "Rina is considering Farah's feelings by not reporting her — "
                    "this shows empathy, not a lack of it."
                ),
                "Loyalty": (
                    "Rina is choosing the friendship over honesty — this is an act of loyalty, "
                    "though arguably misplaced."
                ),
                "Respect": (
                    "Rina is respecting Farah's feelings and avoiding confrontation — "
                    "she is not being disrespectful."
                ),
            },
        },
    },
    {
        "topic": "Environment and Nature",
        "mnemonic_lyrics": (
            "Carbon rises, glaciers melt away,\n"
            "Biodiversity lost — who'll have to pay?\n"
            "Reduce, reuse — your choices count today,\n"
            "A greener future starts with what you say."
        ),
        "anchor_question": {
            "question_type": "mcq",
            "kbat_level": "Menilai",
            "illustrative_notes": (
                "F5 environment topics focus on evaluating human impact on ecosystems, "
                "assessing the effectiveness of conservation policies, and proposing solutions. "
                "Go beyond describing the problem — evaluate trade-offs and justify recommendations."
            ),
            "question": (
                "A government proposes banning single-use plastics entirely by next year. "
                "A critic argues this will harm low-income communities who rely on cheap plastic packaging. "
                "What does this debate BEST illustrate?"
            ),
            "options": [
                "That environmental protection is less important than economic concerns",
                "That effective environmental policy must balance ecological and social equity considerations",
                "That plastic should never be banned under any circumstances",
                "That governments should not make environmental decisions",
            ],
            "correct_answer": "That effective environmental policy must balance ecological and social equity considerations",
            "distractor_rationale": {
                "That environmental protection is less important than economic concerns": (
                    "The debate is about BALANCE, not prioritising economics over the environment."
                ),
                "That plastic should never be banned under any circumstances": (
                    "The critic raises one concern about timing and impact — "
                    "not a blanket rejection of all bans."
                ),
                "That governments should not make environmental decisions": (
                    "The argument is about HOW the policy is implemented, not whether governments should act."
                ),
            },
        },
    },
    {
        "topic": "Health and Wellness",
        "mnemonic_lyrics": (
            "Mental load is real — don't ignore,\n"
            "Sleep and balance open every door,\n"
            "Stress unchecked becomes a heavy weight,\n"
            "Seek help early — never leave it late."
        ),
        "anchor_question": {
            "question_type": "mcq",
            "kbat_level": "Menilai",
            "illustrative_notes": (
                "F5 health topics extend beyond physical health to mental wellness, "
                "the pressures of academic performance, and the importance of help-seeking behaviour. "
                "Evaluate the causes and consequences of health issues and assess strategies for wellbeing."
            ),
            "question": (
                "Danial studies 14 hours a day for SPM, skips meals, and sleeps only 4 hours a night. "
                "His grades improve slightly but he develops severe anxiety. "
                "What does this scenario MOST effectively illustrate?"
            ),
            "options": [
                "That academic success always requires physical sacrifice",
                "That high study hours are the only reliable path to SPM success",
                "That neglecting holistic wellbeing can undermine both health and long-term performance",
                "That anxiety is a normal and harmless part of SPM preparation",
            ],
            "correct_answer": "That neglecting holistic wellbeing can undermine both health and long-term performance",
            "distractor_rationale": {
                "That academic success always requires physical sacrifice": (
                    "The scenario shows costs (anxiety) without proportional gains — "
                    "it does not validate sacrifice as universally necessary."
                ),
                "That high study hours are the only reliable path to SPM success": (
                    "Research shows diminishing returns on sleep-deprived study; "
                    "quality and rest matter as much as hours."
                ),
                "That anxiety is a normal and harmless part of SPM preparation": (
                    "'Severe anxiety' is presented as a negative outcome, not as harmless or normal."
                ),
            },
        },
    },
    {
        "topic": "People and Work",
        "mnemonic_lyrics": (
            "Career paths diverge — tech or trade,\n"
            "Soft skills matter, don't let them fade,\n"
            "Workplace ethics — honesty pays,\n"
            "Future jobs will change in countless ways."
        ),
        "anchor_question": {
            "question_type": "mcq",
            "kbat_level": "Menilai",
            "illustrative_notes": (
                "F5 people and work topics focus on evaluating career choices, "
                "the impact of automation on employment, workplace ethics, "
                "and the value of technical versus interpersonal skills. "
                "Consider multiple perspectives when answering — employer, employee, society."
            ),
            "question": (
                "A factory automates 60% of its assembly line, reducing its workforce from 500 to 200 workers. "
                "The company claims this increases efficiency and lowers product prices for consumers. "
                "Which perspective is MISSING from the company's claim?"
            ),
            "options": [
                "The perspective of shareholders who benefit from higher profits",
                "The perspective of the 300 workers who lost their jobs and their families",
                "The perspective of consumers who enjoy lower prices",
                "The perspective of the technology companies that built the machines",
            ],
            "correct_answer": "The perspective of the 300 workers who lost their jobs and their families",
            "distractor_rationale": {
                "The perspective of shareholders who benefit from higher profits": (
                    "The company's efficiency argument implicitly benefits shareholders — "
                    "this is included, not missing."
                ),
                "The perspective of consumers who enjoy lower prices": (
                    "Lower prices for consumers is explicitly mentioned in the company's claim."
                ),
                "The perspective of the technology companies that built the machines": (
                    "Technology companies are not directly affected parties in this employment decision."
                ),
            },
        },
    },
    {
        "topic": "Arts and Culture",
        "mnemonic_lyrics": (
            "Heritage passed from hand to hand,\n"
            "Art speaks the things words cannot brand,\n"
            "Preserve the old while making new,\n"
            "Culture lives in what we value too."
        ),
        "anchor_question": {
            "question_type": "mcq",
            "kbat_level": "Menilai",
            "illustrative_notes": (
                "F5 arts and culture topics require evaluating the role of cultural heritage "
                "in a globalised world, the tension between tradition and modernity, "
                "and the responsibilities of individuals and governments in cultural preservation."
            ),
            "question": (
                "A village community plans to demolish a 200-year-old traditional hall "
                "to build a modern community centre. Older residents oppose the plan; "
                "younger residents support it. "
                "Which argument BEST supports preserving the old hall?"
            ),
            "options": [
                "Old buildings are always more beautiful than modern ones",
                "The hall represents an irreplaceable link to the community's identity and shared history",
                "Modern buildings are too expensive to maintain in the long term",
                "Young people's opinions should not be considered in heritage decisions",
            ],
            "correct_answer": "The hall represents an irreplaceable link to the community's identity and shared history",
            "distractor_rationale": {
                "Old buildings are always more beautiful than modern ones": (
                    "'Always' is an absolute claim that cannot be universally justified."
                ),
                "Modern buildings are too expensive to maintain in the long term": (
                    "This is a practical economic argument, not a cultural heritage argument."
                ),
                "Young people's opinions should not be considered in heritage decisions": (
                    "Excluding any group's perspective weakens democratic community decision-making."
                ),
            },
        },
    },
    {
        "topic": "Technology and Innovation",
        "mnemonic_lyrics": (
            "AI thinks fast but wisdom's slow,\n"
            "Ethics shape where progress should go,\n"
            "Digital divides leave some behind,\n"
            "Innovation needs a human mind."
        ),
        "anchor_question": {
            "question_type": "mcq",
            "kbat_level": "Menilai",
            "illustrative_notes": (
                "F5 technology topics require evaluating the ethical implications of AI and automation, "
                "digital inequality, data privacy, and the balance between innovation and human oversight. "
                "Move beyond description — assess impact and justify a position."
            ),
            "question": (
                "A hospital uses an AI system to help doctors diagnose cancer. "
                "The AI is 94% accurate; experienced doctors are 89% accurate. "
                "A patient insists on having a human doctor make the final decision. "
                "Which right is the patient MOST likely exercising?"
            ),
            "options": [
                "The right to reject all forms of medical technology",
                "The right to human accountability and oversight in decisions that affect their life",
                "The right to a faster diagnosis process",
                "The right to a cheaper treatment option",
            ],
            "correct_answer": "The right to human accountability and oversight in decisions that affect their life",
            "distractor_rationale": {
                "The right to reject all forms of medical technology": (
                    "The patient is not rejecting the AI's assistance — "
                    "they want a human to make the FINAL call, not remove AI entirely."
                ),
                "The right to a faster diagnosis process": (
                    "Human oversight may slow the process; speed is not the patient's stated concern."
                ),
                "The right to a cheaper treatment option": (
                    "Cost is not mentioned — the patient's concern is about who is responsible for the decision."
                ),
            },
        },
    },
    {
        "topic": "Global Issues and Current Affairs",
        "mnemonic_lyrics": (
            "Climate, conflict, inequality rise,\n"
            "Nations must cooperate — no compromise,\n"
            "SDGs map the path we share,\n"
            "Global citizens — we all must care."
        ),
        "anchor_question": {
            "question_type": "mcq",
            "kbat_level": "Mencipta",
            "illustrative_notes": (
                "F5 global issues tasks require synthesising multiple perspectives "
                "and proposing justified solutions. Consider economic, social, environmental, "
                "and political dimensions simultaneously. "
                "Reference frameworks like the UN SDGs where appropriate."
            ),
            "question": (
                "Climate change, poverty, and lack of education are described as "
                "'interconnected global challenges.' "
                "What does 'interconnected' MOST accurately imply for finding solutions?"
            ),
            "options": [
                "Each problem must be solved separately with its own dedicated task force",
                "Solving one challenge in isolation will automatically fix the others",
                "Addressing these challenges requires integrated strategies that recognise how each affects the others",
                "Countries should focus only on the challenge that affects them most",
            ],
            "correct_answer": "Addressing these challenges requires integrated strategies that recognise how each affects the others",
            "distractor_rationale": {
                "Each problem must be solved separately with its own dedicated task force": (
                    "'Interconnected' means the opposite — isolated solutions miss the relationships between problems."
                ),
                "Solving one challenge in isolation will automatically fix the others": (
                    "Interconnectedness means they influence each other, not that fixing one automatically fixes all."
                ),
                "Countries should focus only on the challenge that affects them most": (
                    "Global challenges require international cooperation — "
                    "a country-only focus contradicts the 'global' nature of the issues."
                ),
            },
        },
    },
    {
        "topic": "Literature: Poems",
        "mnemonic_lyrics": (
            "Voice and imagery deeper now,\n"
            "Symbolism shows us what, and how,\n"
            "Structural choices — why this form?\n"
            "Meaning hidden in each line's norm."
        ),
        "anchor_question": {
            "question_type": "mcq",
            "kbat_level": "Menilai",
            "illustrative_notes": (
                "F5 poetry analysis moves beyond identifying devices to evaluating "
                "how structural and language choices contribute to the poem's overall effect. "
                "Consider: why did the poet choose this form (sonnet, free verse, ballad)? "
                "How do line breaks, enjambment, and stanza length reinforce meaning?"
            ),
            "question": (
                "A poem about loss uses very short, fragmented lines throughout, "
                "with long gaps of white space between stanzas. "
                "What effect does this structure MOST LIKELY create?"
            ),
            "options": [
                "It makes the poem easier and faster to read",
                "It mimics the broken, halting nature of grief — pauses reflect emotional emptiness",
                "It shows that the poet ran out of ideas for each stanza",
                "It is a mistake that the poet should have corrected",
            ],
            "correct_answer": "It mimics the broken, halting nature of grief — pauses reflect emotional emptiness",
            "distractor_rationale": {
                "It makes the poem easier and faster to read": (
                    "Short lines slow the reader down — each word carries more weight."
                ),
                "It shows that the poet ran out of ideas for each stanza": (
                    "Deliberate fragmentation is a sophisticated technique, not a sign of limited ideas."
                ),
                "It is a mistake that the poet should have corrected": (
                    "Published poets make conscious structural choices; "
                    "dismissing technique as error misses the craft."
                ),
            },
        },
    },
    {
        "topic": "Literature: Short Stories",
        "mnemonic_lyrics": (
            "Foreshadowing hides what's yet to come,\n"
            "Irony twists what seems like sum,\n"
            "Narrator's lens — reliable or not?\n"
            "Trace the thread to tie the plot."
        ),
        "anchor_question": {
            "question_type": "mcq",
            "kbat_level": "Menilai",
            "illustrative_notes": (
                "F5 short story analysis requires evaluating narrative techniques: "
                "unreliable narrators, foreshadowing, irony (situational, dramatic, verbal), "
                "and how the author builds tension. "
                "Always support your analysis with specific quotations from the text."
            ),
            "question": (
                "In a short story, the narrator describes his neighbour as "
                "'perfectly honest and trustworthy.' "
                "Later, the neighbour is revealed to have been stealing from him. "
                "What narrative technique does this BEST illustrate?"
            ),
            "options": [
                "Foreshadowing",
                "Dramatic irony",
                "An unreliable narrator",
                "A flashback",
            ],
            "correct_answer": "An unreliable narrator",
            "distractor_rationale": {
                "Foreshadowing": (
                    "Foreshadowing hints at future events; "
                    "this narrator presents false information, not a subtle clue."
                ),
                "Dramatic irony": (
                    "Dramatic irony occurs when the READER knows more than the character; "
                    "here, both the narrator and reader are misled until the reveal."
                ),
                "A flashback": (
                    "A flashback shows an earlier event; this passage describes a current (false) belief."
                ),
            },
        },
    },
    {
        "topic": "Literature: Drama",
        "mnemonic_lyrics": (
            "Subtext hides beneath each spoken line,\n"
            "Dramatic irony — the audience sees the sign,\n"
            "Character arcs rise, fall, then turn,\n"
            "What the play teaches — that's what you earn."
        ),
        "anchor_question": {
            "question_type": "mcq",
            "kbat_level": "Menilai",
            "illustrative_notes": (
                "F5 drama analysis requires evaluating how playwrights use dramatic irony, "
                "subtext (what characters mean vs what they say), and stagecraft "
                "to build themes and tension. "
                "Evaluate the moral or social message the playwright communicates."
            ),
            "question": (
                "In a play, the audience has seen a character hide a letter "
                "that would clear an innocent man. "
                "Another character then tells the innocent man, 'You have nothing to worry about — "
                "the truth always comes to light.' "
                "What technique makes this moment powerful?"
            ),
            "options": [
                "Foreshadowing",
                "Soliloquy",
                "Dramatic irony",
                "Alliteration",
            ],
            "correct_answer": "Dramatic irony",
            "distractor_rationale": {
                "Foreshadowing": (
                    "Foreshadowing hints at what will happen; "
                    "dramatic irony creates tension because the audience ALREADY knows the hidden truth."
                ),
                "Soliloquy": (
                    "A soliloquy is a character speaking alone to reveal inner thoughts; "
                    "this is a dialogue between two characters."
                ),
                "Alliteration": (
                    "Alliteration is a sound device (repeated consonants); "
                    "the power here is the gap between what is said and what the audience knows."
                ),
            },
        },
    },
    {
        "topic": "Literature: Novel",
        "mnemonic_lyrics": (
            "Themes weave through chapter after chapter's turn,\n"
            "Symbolism shows what characters must learn,\n"
            "Author's message — social, moral, real,\n"
            "Every chapter deepens what you feel."
        ),
        "anchor_question": {
            "question_type": "mcq",
            "kbat_level": "Menilai",
            "illustrative_notes": (
                "F5 novel analysis requires evaluating the author's social or moral message, "
                "how symbols reinforce themes across the whole text, "
                "and how the protagonist's arc embodies the novel's central argument. "
                "Consider: what does the author want readers to question or reconsider?"
            ),
            "question": (
                "In a novel, a broken clock appears in three key scenes: "
                "when the protagonist is abandoned as a child, "
                "when he fails to help a friend in need, "
                "and when he finally reconciles with his family. "
                "What does the broken clock MOST LIKELY symbolise?"
            ),
            "options": [
                "The protagonist's wealth and social status",
                "Time wasted and the possibility of healing and second chances",
                "The author's interest in antique objects",
                "The unreliable nature of all narrators",
            ],
            "correct_answer": "Time wasted and the possibility of healing and second chances",
            "distractor_rationale": {
                "The protagonist's wealth and social status": (
                    "A broken clock relates to time and repair, not wealth."
                ),
                "The author's interest in antique objects": (
                    "Symbols serve the theme — objects are not chosen for biographical reasons."
                ),
                "The unreliable nature of all narrators": (
                    "The clock appears at emotional turning points, not to signal narrative unreliability."
                ),
            },
        },
    },
    {
        "topic": "Grammar in Context",
        "mnemonic_lyrics": (
            "Conditionals unlock the might-have-been,\n"
            "Passive voice when doer's not the scene,\n"
            "Relative clauses add without a break,\n"
            "Choose the right word for precision's sake."
        ),
        "anchor_question": {
            "question_type": "mcq",
            "kbat_level": "Menganalisis",
            "illustrative_notes": (
                "F5 grammar in context focuses on more complex structures: "
                "conditional sentences (Type 2 and 3), passive voice in formal writing, "
                "non-restrictive relative clauses, and reported speech. "
                "Errors are identified by checking form AND meaning in the context of the sentence."
            ),
            "question": (
                "Choose the grammatically CORRECT sentence for a formal report."
            ),
            "options": [
                "If the new policy was implemented last year, fewer complaints would of been filed.",
                "If the new policy had been implemented last year, fewer complaints would have been filed.",
                "If the new policy would have been implemented, less complaints were filed.",
                "Had the new policy implemented last year, fewer complaints would been filed.",
            ],
            "correct_answer": "If the new policy had been implemented last year, fewer complaints would have been filed.",
            "distractor_rationale": {
                "If the new policy was implemented last year, fewer complaints would of been filed.": (
                    "'Would of' is incorrect — it should be 'would have'. "
                    "Also, Type 3 conditional requires 'had been', not 'was'."
                ),
                "If the new policy would have been implemented, less complaints were filed.": (
                    "'Would have been' cannot appear in the if-clause of a Type 3 conditional. "
                    "Also, 'complaints' is countable — use 'fewer', not 'less'."
                ),
                "Had the new policy implemented last year, fewer complaints would been filed.": (
                    "The inverted form requires the past participle: 'Had the policy been implemented'. "
                    "'Would been' is also missing 'have'."
                ),
            },
        },
    },
    {
        "topic": "Media and Communication",
        "mnemonic_lyrics": (
            "Deepfakes blur what's real and fake,\n"
            "Every share — what stakes are at stake?\n"
            "Algorithms feed you what you know,\n"
            "Break the bubble, let your thinking grow."
        ),
        "anchor_question": {
            "question_type": "mcq",
            "kbat_level": "Mencipta",
            "illustrative_notes": (
                "F5 media topics focus on evaluating algorithmic media bias, "
                "the ethics of deepfakes and misinformation, "
                "and proposing frameworks for responsible digital citizenship. "
                "Apply critical thinking to design solutions, not just identify problems."
            ),
            "question": (
                "A social media platform's algorithm shows users only content that matches "
                "their existing views, creating what researchers call an 'echo chamber.' "
                "You are advising the platform on ONE change to reduce this effect. "
                "Which recommendation is MOST directly targeted at the root cause?"
            ),
            "options": [
                "Ban all political content from the platform",
                "Adjust the algorithm to occasionally surface high-quality content that challenges the user's viewpoint",
                "Require users to verify their identity before posting",
                "Limit users to 30 minutes of screen time per day",
            ],
            "correct_answer": "Adjust the algorithm to occasionally surface high-quality content that challenges the user's viewpoint",
            "distractor_rationale": {
                "Ban all political content from the platform": (
                    "This removes content without addressing the algorithmic filtering that creates echo chambers."
                ),
                "Require users to verify their identity before posting": (
                    "Identity verification tackles anonymity and accountability, not algorithmic filtering."
                ),
                "Limit users to 30 minutes of screen time per day": (
                    "Time limits reduce exposure overall but do not change what content users see."
                ),
            },
        },
    },
    {
        "topic": "Society and Community",
        "mnemonic_lyrics": (
            "Civic duty calls each one of us,\n"
            "Volunteering builds the trust we discuss,\n"
            "Marginalised voices — amplify,\n"
            "Community flourishes when none are left behind."
        ),
        "anchor_question": {
            "question_type": "mcq",
            "kbat_level": "Menilai",
            "illustrative_notes": (
                "F5 society topics require evaluating the responsibilities of individuals, "
                "communities, and governments in addressing social issues. "
                "Consider equity versus equality, the rights of marginalised groups, "
                "and the role of civic participation in a democratic society."
            ),
            "question": (
                "A city provides identical sports facilities in all neighbourhoods. "
                "However, residents in low-income areas still participate less in sports. "
                "A policy analyst argues this shows equality without equity. "
                "What does she MOST LIKELY mean?"
            ),
            "options": [
                "Low-income residents do not value sports as much as wealthy residents",
                "Providing the same resources does not account for different barriers — transport, cost, time — that prevent equal access",
                "The sports facilities in low-income areas must be of lower quality",
                "The government should not provide sports facilities at all",
            ],
            "correct_answer": "Providing the same resources does not account for different barriers — transport, cost, time — that prevent equal access",
            "distractor_rationale": {
                "Low-income residents do not value sports as much as wealthy residents": (
                    "This assumes a deficit in values rather than examining structural barriers."
                ),
                "The sports facilities in low-income areas must be of lower quality": (
                    "The question states facilities are identical — quality is not the issue here."
                ),
                "The government should not provide sports facilities at all": (
                    "The analyst is arguing for better-designed provision, not for removal of facilities."
                ),
            },
        },
    },
    {
        "topic": "Science and Technology",
        "mnemonic_lyrics": (
            "CRISPR edits the code of life,\n"
            "But ethics cut like a double-edged knife,\n"
            "Evaluate the gain against the cost,\n"
            "In science's march, what must not be lost?"
        ),
        "anchor_question": {
            "question_type": "mcq",
            "kbat_level": "Menilai",
            "illustrative_notes": (
                "F5 science and technology topics require evaluating the ethical dimensions "
                "of scientific advancement — gene editing, AI in medicine, space exploration. "
                "Weigh benefits against risks; consider who benefits and who bears the risk."
            ),
            "question": (
                "Scientists can now edit the genes of human embryos to eliminate "
                "inherited diseases like cystic fibrosis. "
                "Critics warn this could lead to 'designer babies' chosen for non-medical traits. "
                "Which principle does this concern MOST directly invoke?"
            ),
            "options": [
                "The principle of scientific progress above all other values",
                "The principle that medical intervention should remain strictly profit-driven",
                "The principle that scientific power must be governed by ethical boundaries to prevent misuse",
                "The principle that all genetic diseases must be eliminated regardless of consequences",
            ],
            "correct_answer": "The principle that scientific power must be governed by ethical boundaries to prevent misuse",
            "distractor_rationale": {
                "The principle of scientific progress above all other values": (
                    "The critic's concern shows that progress is NOT to be prioritised above all — "
                    "ethics must constrain it."
                ),
                "The principle that medical intervention should remain strictly profit-driven": (
                    "Profit is not mentioned; the concern is about misuse of genetic power."
                ),
                "The principle that all genetic diseases must be eliminated regardless of consequences": (
                    "This is the opposite of the critic's position — they argue FOR considering consequences."
                ),
            },
        },
    },
    {
        "topic": "Travel and Adventure",
        "mnemonic_lyrics": (
            "Sustainable travel — tread with care,\n"
            "Overtourism strips what once was rare,\n"
            "Explore with respect for every place,\n"
            "Leave only footprints, never waste."
        ),
        "anchor_question": {
            "question_type": "mcq",
            "kbat_level": "Menilai",
            "illustrative_notes": (
                "F5 travel topics extend to evaluating the impact of tourism on local communities "
                "and ecosystems, the ethics of adventure tourism, and sustainable travel practices. "
                "Consider economic benefits versus cultural and environmental costs."
            ),
            "question": (
                "A fishing village becomes a popular tourist destination. "
                "Within five years, house prices triple, traditional fishing families are priced out, "
                "and the village's cultural identity fades. "
                "This process is known as gentrification. "
                "Which statement BEST evaluates this outcome?"
            ),
            "options": [
                "Tourism always benefits every member of a community equally",
                "Economic growth from tourism is an unambiguous good that communities should pursue",
                "Tourism-driven development can harm the very communities and cultures that made the place attractive",
                "Fishing villages should ban all tourists to protect their way of life",
            ],
            "correct_answer": "Tourism-driven development can harm the very communities and cultures that made the place attractive",
            "distractor_rationale": {
                "Tourism always benefits every member of a community equally": (
                    "'Always' and 'equally' are absolutes the scenario directly disproves."
                ),
                "Economic growth from tourism is an unambiguous good that communities should pursue": (
                    "'Unambiguous good' ignores displacement and cultural erasure — "
                    "the scenario shows real costs."
                ),
                "Fishing villages should ban all tourists to protect their way of life": (
                    "This overcorrects — balanced, sustainable tourism can coexist with community welfare."
                ),
            },
        },
    },
    {
        "topic": "Vocabulary Building",
        "mnemonic_lyrics": (
            "Connotation colours every word,\n"
            "Precise diction makes your meaning heard,\n"
            "Collocations flow — words that pair,\n"
            "Rich vocabulary shows you care."
        ),
        "anchor_question": {
            "question_type": "mcq",
            "kbat_level": "Menganalisis",
            "illustrative_notes": (
                "F5 vocabulary questions test connotation (positive/negative associations), "
                "collocation (words that naturally pair), register (formal vs informal), "
                "and precise word choice in complex contexts. "
                "Choose words that are accurate in meaning AND appropriate in register."
            ),
            "question": (
                "Choose the word that BEST completes this formal report sentence: "
                "'The committee ________ the proposed merger after reviewing all financial data.'"
            ),
            "options": [
                "okayed",
                "gave the green light to",
                "ratified",
                "said yes to",
            ],
            "correct_answer": "ratified",
            "distractor_rationale": {
                "okayed": (
                    "'Okayed' is informal slang — inappropriate in a formal report context."
                ),
                "gave the green light to": (
                    "This idiom is too informal for a formal report about a committee decision."
                ),
                "said yes to": (
                    "Colloquial phrasing — a formal report requires precise, elevated vocabulary like 'ratified'."
                ),
            },
        },
    },
]


# ---------------------------------------------------------------------------
# Sejarah F5 form_level corrections
# ---------------------------------------------------------------------------

SEJARAH_F5_TOPICS = [
    "Malaysia Merdeka",
    "Pembangunan Negara Bangsa",
]


def main():
    print("=" * 60)
    print("  Bahasa Inggeris F4/F5 Repair + F5 Seed")
    print("=" * 60)

    # ── 1. Fix legacy "English" subject name ───────────────────────────────
    print("\n[1] Fixing legacy subject name 'English' → 'Bahasa Inggeris'...")
    legacy = supabase.table("topic_anchors").select("id").eq("subject", "English").execute()
    if legacy.data:
        for row in legacy.data:
            supabase.table("topic_anchors").update({"subject": "Bahasa Inggeris"}).eq("id", row["id"]).execute()
        print(f"    Fixed {len(legacy.data)} row(s).")
    else:
        print("    Nothing to fix.")

    # ── 2. Fix Sejarah F5 form_level ──────────────────────────────────────
    print("\n[2] Fixing Sejarah F5 topics stored at form_level=4...")
    for topic in SEJARAH_F5_TOPICS:
        res = supabase.table("topic_anchors").select("id, form_level").eq("subject", "Sejarah").eq("topic", topic).execute()
        fixed = 0
        for row in (res.data or []):
            if row["form_level"] == 4:
                supabase.table("topic_anchors").update({"form_level": 5}).eq("id", row["id"]).execute()
                fixed += 1
        print(f"    {topic}: {fixed} row(s) updated to form_level=5")

    # ── 3. Delete null Continuous Writing / Directed Writing shells ────────
    print("\n[3] Removing null shell rows (Continuous Writing / Directed Writing)...")
    for topic in ("Continuous Writing", "Directed Writing"):
        res = supabase.table("topic_anchors").select("id, anchor_question") \
            .eq("subject", SUBJECT).eq("topic", topic).execute()
        deleted = 0
        for row in (res.data or []):
            if row.get("anchor_question") is None:
                supabase.table("topic_anchors").delete().eq("id", row["id"]).execute()
                deleted += 1
        print(f"    {topic}: {deleted} null row(s) deleted")

    # ── 4. Upsert F4 repairs (Continuous Writing + Directed Writing) ──────
    print("\n[4] Upserting F4 repairs (Continuous Writing + Directed Writing)...")
    ok = fail = 0
    for anchor in F4_REPAIRS:
        topic = anchor["topic"]
        print(f"    F4 → {topic} ...", end=" ", flush=True)
        try:
            supabase.table("topic_anchors").upsert({
                "subject":          SUBJECT,
                "topic":            topic,
                "language":         LANGUAGE,
                "form_level":       anchor["form_level"],
                "mnemonic_lyrics":  anchor["mnemonic_lyrics"],
                "anchor_question":  anchor["anchor_question"],
                "audio_url":        FALLBACK_AUDIO,
                "video_broll":      FALLBACK_VIDEO,
            }, on_conflict="topic,language,form_level").execute()
            print("✓"); ok += 1
        except Exception as e:
            print(f"✗  {e}"); fail += 1
    print(f"    F4 repairs: {ok} ok, {fail} failed")

    # ── 5. Seed F5 anchors ────────────────────────────────────────────────
    print(f"\n[5] Seeding {len(F5_ANCHORS)} F5 Bahasa Inggeris anchors...")
    ok = fail = skip = 0
    for anchor in F5_ANCHORS:
        topic = anchor["topic"]
        print(f"    F5 → {topic} ...", end=" ", flush=True)
        try:
            supabase.table("topic_anchors").upsert({
                "subject":          SUBJECT,
                "topic":            topic,
                "language":         LANGUAGE,
                "form_level":       5,
                "mnemonic_lyrics":  anchor["mnemonic_lyrics"],
                "anchor_question":  anchor["anchor_question"],
                "audio_url":        FALLBACK_AUDIO,
                "video_broll":      FALLBACK_VIDEO,
            }, on_conflict="topic,language,form_level").execute()
            print("✓"); ok += 1
        except Exception as e:
            print(f"✗  {e}"); fail += 1

    print(f"\n    F5 seed: {ok} inserted/updated, {fail} failed")
    print("\nDone.")


if __name__ == "__main__":
    main()
