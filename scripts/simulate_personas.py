#!/usr/bin/env python3
"""
Multi-Demographic Synthetic Persona Simulation Benchmark — v2 (F4/F5 Edition)
==============================================================================
Simulates 300 synthetic SPM sessions across a 2×2 demographic matrix:
  - Geography:  Urban  vs  Rural
  - Programme:  DLP    vs  Non-DLP
  = 4 demographic profiles × 75 agents = 300 total

Subjects covered (F4 & F5 only):
  Mathematics · Sejarah · Sains · Bahasa Melayu · Bahasa Inggeris

Features:
  - Form level (F4/F5) tracked on every question and telemetry record
  - Monte Carlo item response (accuracy / latency / mastery vector)
  - Subject-medium logic: BM & English language barriers modelled distinctly
  - Realistic chat samples in Manglish, urban BM, rural/dialectal BM
  - SEDA IRE-structured triage scripts on 3 consecutive sub-topic failures
  - Subject-specific Initiation prompts (BM karangan vs English writing vs Math)
  - CriticAgent evaluation loop: re-rolls invalid scripts up to 5 times
  - Full telemetry + critic statistics in JSON exports

Outputs (per target):
  data/{target}_f4f5/synthetic_telemetry.json   — item-level response records
  data/{target}_f4f5/seda_triage_corpus.json    — SEDA teacher intervention scripts
  data/{target}_f4f5/critic_agent_stats.json    — CriticAgent statistics

Usage:
    cd /root/kuasaprestij
    python scripts/simulate_personas.py --target vps [--n 300] [--seed 42]
    python scripts/simulate_personas.py --target gcp [--n 300] [--seed 99]
    python scripts/simulate_personas.py --target vps --offline
"""

import asyncio
import json
import os
import random
import sys
import time
import argparse
from collections import defaultdict, Counter
from typing import Dict, List, Tuple, Any, Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
try:
    from dotenv import load_dotenv
    load_dotenv(override=True)
except ImportError:
    pass

# ---------------------------------------------------------------------------
# Demographic Profiles — 2×2 matrix (Geography × Programme)
# ---------------------------------------------------------------------------

DEMOGRAPHIC_PROFILES = {
    "URBAN_DLP": {
        "profile_id": "URBAN_DLP",
        "region": "Urban",
        "programme": "DLP",
        "medium": "English",
        "base_accuracy": 0.72,
        "latency_mean_s": 30.0,
        "latency_sd_s": 9.0,
        "guessing_rate": 0.08,
        "drop_off_rate": 0.05,
        "language_barrier_risk": 0.08,
        "literacy_barrier_risk": 0.05,
        "bm_literacy_risk": 0.06,      # slight formal-BM writing gap for DLP Urban
        "eng_literacy_risk": 0.06,     # very low — DLP is English-medium
        "chat_samples": {
            "confusion": "Teacher, why step 2 need to invert the sign ah? I thought both sides same.",
            "give_up": "Alamak, I totally lost already lah. Can give hint or not?",
            "correct": "Oh I see! So x equals negative three, betul ke?",
            "triage": "Cikgu, this topic I really don't understand la. Can explain again from the start?",
        },
        "chat_style": "Fluent English with minor Manglish slang",
    },
    "URBAN_NON_DLP": {
        "profile_id": "URBAN_NON_DLP",
        "region": "Urban",
        "programme": "Non-DLP",
        "medium": "Bahasa_Melayu",
        "base_accuracy": 0.62,
        "latency_mean_s": 36.0,
        "latency_sd_s": 11.0,
        "guessing_rate": 0.12,
        "drop_off_rate": 0.08,
        "language_barrier_risk": 0.12,
        "literacy_barrier_risk": 0.10,
        "bm_literacy_risk": 0.04,      # BM is their primary medium — very low
        "eng_literacy_risk": 0.22,     # English not primary medium
        "chat_samples": {
            "confusion": "Cikgu, saya tak faham langkah kedua. Macam mana nak kembang kurungan?",
            "give_up": "Susah lah cikgu. Tak reti dah.",
            "correct": "Jawapan dia 5x + 3 ke cikgu? Betul tak?",
            "triage": "Cikgu, tiga soalan dah salah. Boleh jelaskan balik dari awal?",
        },
        "chat_style": "Fluent Bahasa Melayu, urban register",
    },
    "RURAL_DLP": {
        "profile_id": "RURAL_DLP",
        "region": "Rural",
        "programme": "DLP",
        "medium": "English",
        "base_accuracy": 0.52,
        "latency_mean_s": 46.0,
        "latency_sd_s": 14.0,
        "guessing_rate": 0.20,
        "drop_off_rate": 0.14,
        "language_barrier_risk": 0.28,
        "literacy_barrier_risk": 0.25,
        "bm_literacy_risk": 0.14,      # rural DLP: dialectal BM interference in formal writing
        "eng_literacy_risk": 0.20,     # DLP but rural — limited English exposure outside school
        "chat_samples": {
            "confusion": "Teacher, this... I don't understand. The formula how?",
            "give_up": "I try already but wrong. Don't know lah.",
            "correct": "Answer is 3 ah teacher? Correct or not?",
            "triage": "Cikgu, I keep getting wrong. Can show me the steps?",
        },
        "chat_style": "Struggles with English syntax, brief responses, code-switches to BM",
    },
    "RURAL_NON_DLP": {
        "profile_id": "RURAL_NON_DLP",
        "region": "Rural",
        "programme": "Non-DLP",
        "medium": "Bahasa_Melayu",
        "base_accuracy": 0.38,
        "latency_mean_s": 54.0,
        "latency_sd_s": 15.0,
        "guessing_rate": 0.35,
        "drop_off_rate": 0.22,
        "language_barrier_risk": 0.40,
        "literacy_barrier_risk": 0.40,
        "bm_literacy_risk": 0.18,      # rural Non-DLP: dialectal interference in formal written BM
        "eng_literacy_risk": 0.52,     # highest English barrier
        "chat_samples": {
            "confusion": "Cikgu, x faham. Macam mana eh?",
            "give_up": "Tak tahu dah. Susah sangat.",
            "correct": "Ini betul ke cikgu?",
            "triage": "Cikgu, boleh tolong? Tak faham langsung.",
        },
        "chat_style": "Casual/dialectal Bahasa Melayu, very short phrases",
    },
}

# ---------------------------------------------------------------------------
# SEDA Error Taxonomy
# ---------------------------------------------------------------------------

SEDA_ERROR_CATEGORIES = [
    "Conceptual Gap",
    "Careless Error",
    "Language Barrier",
    "Incomplete Answer",
    "Content Weakness",
    "Language Accuracy",
    "Organisation/Register",
    "Structural Issue",
    "Insufficient Depth",
]

SEDA_CLUSTER_MAP = {
    "Conceptual Gap":        "C1 — Procedural-Conceptual Disconnect",
    "Careless Error":        "C2 — Attention/Working-Memory Lapse",
    "Language Barrier":      "C3 — L1-Interference / Vocabulary Gap",
    "Incomplete Answer":     "C4 — Strategic Omission",
    "Content Weakness":      "C5 — Foundational Knowledge Deficit",
    "Language Accuracy":     "C3 — L1-Interference / Vocabulary Gap",
    "Organisation/Register": "C4 — Strategic Omission",
    "Structural Issue":      "C1 — Procedural-Conceptual Disconnect",
    "Insufficient Depth":    "C5 — Foundational Knowledge Deficit",
}

# ---------------------------------------------------------------------------
# Form Level Map — every topic tagged to F4 or F5
# ---------------------------------------------------------------------------

FORM_LEVEL_MAP: Dict[str, str] = {
    # Mathematics F4
    "Quadratic Functions":          "F4",
    "Algebra":                      "F4",
    "Linear Inequalities":          "F4",
    "Coordinate Geometry":          "F4",
    "Vectors":                      "F4",
    # Mathematics F5
    "Differentiation":              "F5",
    "Integration":                  "F5",
    "Trigonometry":                 "F5",
    "Probability":                  "F5",
    "Permutations and Combinations": "F5",
    # Sejarah F4
    "Warisan Negara":               "F4",
    "Tamadun Islam":                "F4",
    "Tamadun Awal":                 "F4",
    "Kesultanan Melaka":            "F4",
    "Kesultanan Melayu Melaka":     "F4",
    # Sejarah F5
    "Malaysia Merdeka":             "F5",
    "Pembangunan Bangsa":           "F5",
    "Nasionalisme Malaysia":        "F5",
    "Kebangkitan Nasionalisme":     "F5",
    "Perkembangan di Eropah":       "F5",
    "Gerakan Nasionalisme di Asia Tenggara": "F5",
    "Pembangunan Negara Bangsa":    "F5",
    # Sains F4
    "Sel dan Organisasi Hidup":     "F4",
    "Jirim dan Perubahannya":       "F4",
    "Tenaga":                       "F4",
    "Elektrik dan Magnet":          "F4",
    # Sains F5
    "Genetik dan Pembiakan":        "F5",
    "Ekosistem":                    "F5",
    "Cahaya dan Optik":             "F5",
    "Asid, Bes dan Garam":         "F5",
    "Tekanan":                      "F5",
    "Daya dan Gerakan":             "F5",
    # Bahasa Melayu F4
    "Karangan Narratif":            "F4",
    "Pemahaman Petikan F4":         "F4",
    "Tatabahasa F4":                "F4",
    "Komsas F4 - Cerpen & Puisi Tradisional": "F4",
    # Bahasa Melayu F5
    "Karangan Ekspositori":         "F5",
    "Rumusan":                      "F5",
    "Pemahaman Petikan F5":         "F5",
    "Tatabahasa F5":                "F5",
    "Komsas F5 - Novel & Drama":    "F5",
    # Bahasa Inggeris F4
    "Reading Comprehension F4":     "F4",
    "Directed Writing":             "F4",
    "Language Use F4":              "F4",
    "Literature in English F4":     "F4",
    # Bahasa Inggeris F5
    "Reading Comprehension F5":     "F5",
    "Continuous Writing":           "F5",
    "Summary Writing":              "F5",
    "Literature in English F5":     "F5",
    "Language Use F5":              "F5",
}

# ---------------------------------------------------------------------------
# Misconception banks — F4 & F5 per subject
# ---------------------------------------------------------------------------

MATH_MISCONCEPTIONS = {
    # F4
    "Quadratic Functions": [
        "confuses roots (x-intercepts) with vertex coordinates",
        "applies completing-the-square formula incorrectly when a≠1",
        "misidentifies axis of symmetry when b is negative",
    ],
    "Algebra": [
        "fails to invert inequality sign when dividing by a negative coefficient",
        "treats like terms incorrectly — adds coefficients but keeps wrong variable",
        "drops the negative sign when distributing across brackets",
    ],
    "Linear Inequalities": [
        "fails to flip inequality sign when multiplying or dividing by negative value",
        "represents solution on number line with wrong open/closed circle",
        "errors in simultaneous inequalities — wrong intersection region",
    ],
    "Coordinate Geometry": [
        "errors in midpoint formula — averages coordinates incorrectly",
        "misapplies perpendicular bisector slope — forgets to negate and invert",
        "errors in distance formula — does not square individual differences",
    ],
    "Vectors": [
        "confuses position vector with displacement vector",
        "errors in scalar multiplication — distributes incorrectly across components",
        "misapplies parallel vector condition",
    ],
    # F5
    "Differentiation": [
        "applies power rule but forgets to decrement the exponent",
        "differentiates a constant as 1 rather than 0",
        "confuses chain rule application for composite functions",
    ],
    "Integration": [
        "forgets the constant of integration in indefinite integrals",
        "inverts limits when computing definite integrals",
        "applies power rule incorrectly — does not add 1 to exponent before dividing",
    ],
    "Trigonometry": [
        "confuses sin and cos graphs — shifts amplitude incorrectly",
        "uses degree mode instead of radian when required",
        "misremembers CAST quadrant signs for negative angles",
    ],
    "Probability": [
        "treats dependent events as independent — does not update sample space",
        "confuses P(A or B) with P(A) + P(B) without subtracting the intersection",
        "misreads 'at least' or 'at most' conditions",
    ],
    "Permutations and Combinations": [
        "applies permutation formula when combination is required",
        "double-counts arrangements of identical items",
        "errors in multiplication principle for multi-stage selection",
    ],
}

SEJARAH_MISCONCEPTIONS = {
    # F4
    "Warisan Negara": [
        "confuses zaman prasejarah artifacts with colonial-era objects",
        "misattributes Orang Asli cultural practices to later Malay kingdoms",
        "errors in chronological ordering of pre-Melaka polities",
    ],
    "Tamadun Islam": [
        "confuses the Golden Age of Islam timeline (8th–13th c.) with modern period",
        "misattributes major scientific contributions to wrong scholars",
        "errors in naming the Abbasid vs Umayyad caliphates' capital cities",
    ],
    "Tamadun Awal": [
        "confuses Mesopotamian and Egyptian river valley civilisations",
        "misattributes cuneiform script to the wrong civilisation",
        "errors in identifying the significance of Hammurabi's Code",
    ],
    "Kesultanan Melaka": [
        "reverses the reign sequence of Melaka Sultans",
        "conflates Parameswara's conversion to Islam with the founding of Melaka",
        "misidentifies Zheng He's voyages as Portuguese rather than Chinese expeditions",
    ],
    "Kesultanan Melayu Melaka": [
        "confuses the roles of Bendahara and Temenggung in the Melaka court",
        "errors in describing the Undang-Undang Melaka provisions",
        "misidentifies trade goods and ports in the Melaka Straits trade network",
    ],
    # F5
    "Malaysia Merdeka": [
        "confuses 31 August 1957 with 16 September 1963 (Malaysia Day)",
        "misidentifies the Alliance coalition partners at independence",
        "errors in the role of the Reid Commission vs the Cobbold Commission",
    ],
    "Pembangunan Bangsa": [
        "confuses NEP (1970) with NDP (1991) objectives",
        "misidentifies Vision 2020's launch year and prime minister",
        "errors in describing the Bumiputera equity target percentages",
    ],
    "Nasionalisme Malaysia": [
        "conflates vernacular school resistance with Malay-language activism",
        "misidentifies PKMM vs PUTERA coalition composition",
        "errors in chronology of constitutional negotiations 1945–1957",
    ],
    "Kebangkitan Nasionalisme": [
        "conflates the 1946 Malayan Union protests with the 1948 Emergency",
        "misidentifies key figures — attributes UMNO founding to wrong leader",
        "confuses the role of Chinese and Indian nationalist movements",
    ],
    "Perkembangan di Eropah": [
        "confuses the causes of World War I with World War II triggers",
        "misidentifies which nations formed the Triple Entente vs Triple Alliance",
        "errors in dating the Industrial Revolution's spread beyond Britain",
    ],
    "Gerakan Nasionalisme di Asia Tenggara": [
        "confuses Vietnamese and Indonesian nationalist leaders",
        "misidentifies which colonial power controlled which SEA territory",
        "errors in chronology of independence movements across SEA",
    ],
    "Pembangunan Negara Bangsa": [
        "confuses Rukun Negara with Rukun Islam",
        "misidentifies the year and context of the 13 May 1969 incident",
        "errors in describing the Dasar Ekonomi Baru's two-prong objectives",
    ],
}

SAINS_MISCONCEPTIONS = {
    # F4
    "Sel dan Organisasi Hidup": [
        "confuses plant cell chloroplast with mitochondria function",
        "misidentifies prokaryotic vs eukaryotic cell defining features",
        "errors in describing osmosis direction based on solute concentration",
    ],
    "Jirim dan Perubahannya": [
        "confuses physical change with chemical change criteria",
        "errors in identifying exothermic vs endothermic reactions from signs",
        "misidentifies states of matter from particle arrangement diagrams",
    ],
    "Tenaga": [
        "confuses kinetic and potential energy in mid-trajectory problems",
        "errors in applying conservation of energy — ignores friction losses",
        "misidentifies the energy transformation in photosynthesis",
    ],
    "Elektrik dan Magnet": [
        "confuses current direction with electron flow direction",
        "errors in applying V=IR when parallel resistors are involved",
        "misidentifies electromagnet polarity based on current direction using right-hand rule",
    ],
    # F5
    "Genetik dan Pembiakan": [
        "confuses mitosis and meiosis product chromosome numbers",
        "misidentifies dominant vs recessive allele expression in Punnett squares",
        "errors in predicting F2 phenotypic ratios for monohybrid crosses",
    ],
    "Ekosistem": [
        "confuses food chain with food web directionality",
        "misidentifies producer vs primary consumer in a pyramid",
        "errors in describing nitrogen cycle steps — reverses nitrification and denitrification",
    ],
    "Cahaya dan Optik": [
        "confuses reflection and refraction angle reference lines — uses surface not normal",
        "errors in identifying converging vs diverging lens image properties",
        "misapplies refractive index formula — inverts the ratio",
    ],
    "Asid, Bes dan Garam": [
        "confuses neutralisation product — omits water in the equation",
        "errors in identifying strong vs weak acid from pH alone",
        "misidentifies the indicator colour change for alkali vs acid",
    ],
    "Tekanan": [
        "confuses gauge pressure with absolute pressure",
        "errors in Archimedes' principle — uses volume of object vs fluid displaced",
        "misapplies Pascal's principle — ignores area ratio in hydraulic press",
    ],
    "Daya dan Gerakan": [
        "confuses mass (kg) with weight (N) in calculations",
        "applies Newton's 2nd law with wrong units — mixes kg and g",
        "misidentifies the reaction force pair in Newton's 3rd law",
    ],
    # F4 — additional topics
    "Biodiversiti": [
        "confuses binomial nomenclature rules — genus not capitalised",
        "errors in classification hierarchy — swaps Order and Family levels",
        "misidentifies dichotomous key branching — applies wrong trait at each node",
    ],
    "Manusia dan Kesihatan": [
        "confuses active immunity (self-produced antibodies) with passive immunity (received antibodies)",
        "errors in identifying BMI category boundaries for Malaysian health norms",
        "misidentifies the target organ of a specific hormone — e.g. glucagon acts on liver not pancreas",
    ],
    # F5 — additional topics
    "Kimia Organik": [
        "confuses alkane and alkene distinguishing tests — bromine water decolourisation",
        "errors in writing homologous series general formulae — off-by-one carbon count",
        "misidentifies addition vs substitution reaction for a given organic compound",
    ],
    "Astronomi": [
        "confuses solar eclipse and lunar eclipse geometry — Moon/Earth/Sun positions",
        "errors in planet order from Sun — transposes inner and outer planets",
        "misidentifies the phase of the Moon from a diagram — confuses waxing and waning",
    ],
}

BM_MISCONCEPTIONS = {
    # F4 — Bahasa Melayu
    "Karangan Narratif": [
        "fails to develop a coherent narrative arc — events not causally linked",
        "uses informal/dialectal BM in formal karangan — 'dia orang' instead of 'mereka'",
        "weak introduction paragraph — no contextualisation of theme or setting",
    ],
    "Pemahaman Petikan F4": [
        "copies verbatim instead of paraphrasing — loses marks for own words",
        "misidentifies main idea — picks detail sentence instead of tema utama",
        "errors in citing supporting evidence — quotes out of context",
    ],
    "Tatabahasa F4": [
        "confuses imbuhan 'me-' and 'ber-' verb prefixes",
        "errors in ayat majmuk — misplaces 'yang' and 'dan'",
        "incorrect use of kata sendi nama — 'kepada' vs 'untuk' vs 'bagi'",
    ],
    "Komsas F4 - Cerpen & Puisi Tradisional": [
        "misidentifies tema vs persoalan in cerpen analysis",
        "confuses watak protagonist and antagonist in nilai-nilai murni discussion",
        "errors in pantun analysis — misinterprets pembayang vs maksud",
    ],
    # F5 — Bahasa Melayu
    "Karangan Ekspositori": [
        "weak thesis statement — no clear pendirian stated in the pendahuluan",
        "huraian without elaboration — bukti and contoh missing per isi",
        "poor penutup — no synthesis of main arguments back to thesis",
    ],
    "Rumusan": [
        "exceeds 120-word limit — does not apply word economy",
        "includes own opinion — rumusan must paraphrase source text only",
        "misses key isi penting — focuses on minor details rather than main points",
    ],
    "Pemahaman Petikan F5": [
        "fails to infer implied meaning — only restates surface information",
        "misreads complex ayat — misses subject-verb relationship in long sentences",
        "errors in vocabulary-in-context — picks dictionary meaning over contextual meaning",
    ],
    "Tatabahasa F5": [
        "confuses klausa relatif vs klausa komplemen in complex sentences",
        "errors in passive voice (ayat pasif) — fails to invert subject-object with 'di-' prefix",
        "misuses kata hubung — 'walaupun' / 'meskipun' / 'sungguhpun' used interchangeably",
    ],
    "Komsas F5 - Novel & Drama": [
        "misidentifies plot turning point — confuses rising action with klimaks",
        "unable to discuss watak secara mendalam — only describes actions without motivations",
        "errors in citing bukti teks — quotes but does not analyse relevance to persoalan",
    ],
}

ENGLISH_MISCONCEPTIONS = {
    # F4 — Bahasa Inggeris
    "Reading Comprehension F4": [
        "selects distractor with similar keywords rather than paraphrased correct answer",
        "cannot distinguish literal comprehension from inferential question types",
        "errors in pronoun reference tracking — confuses 'he'/'she'/'they' referents in passage",
    ],
    "Directed Writing": [
        "uses informal register in formal letter — 'Hi' instead of 'Dear' salutation",
        "fails to include all required content points from the task stimulus",
        "errors in cohesive devices — overuses 'and'/'but', lacks 'furthermore'/'however'",
    ],
    "Language Use F4": [
        "tense inconsistency — shifts between past and present within same paragraph",
        "subject-verb agreement errors — 'the students was' instead of 'the students were'",
        "incorrect preposition usage — 'interested on' vs 'interested in'",
    ],
    "Literature in English F4": [
        "describes poem's rhyme scheme without analysing how it reinforces meaning",
        "identifies theme without citing textual evidence from the poem/short story",
        "confuses narrative perspective — misidentifies first vs third person narrator",
    ],
    # F5 — Bahasa Inggeris
    "Reading Comprehension F5": [
        "cannot identify author's purpose or tone from complex literary passage",
        "errors in vocabulary inference — substitutes incorrect synonym in context",
        "fails to synthesise information from multiple paragraphs for extended answer",
    ],
    "Continuous Writing": [
        "weak narrative hook — begins story with 'One day...' cliché opener",
        "insufficient paragraphing — long blocks of text without clear topic sentences",
        "limited vocabulary range — overuses basic adjectives (good, bad, nice, sad)",
    ],
    "Summary Writing": [
        "includes personal opinion — summary must be objective paraphrase only",
        "exceeds 130-word limit — summary not concise enough",
        "misses key supporting details — selects minor points over main arguments",
    ],
    "Literature in English F5": [
        "cannot connect theme across chapters/acts — analyses scenes in isolation",
        "errors in character motivation — describes what character does not why",
        "fails to use correct literary terminology — says 'comparison' instead of 'metaphor'",
    ],
    "Language Use F5": [
        "errors in conditional clauses — 'If I would go' instead of 'If I went'",
        "passive voice construction errors — 'was being given' misused for simple past passive",
        "punctuation errors in complex sentences — missing commas in non-restrictive clauses",
    ],
}

SUBJECT_MISCONCEPTIONS = {
    "Mathematics":      MATH_MISCONCEPTIONS,
    "Sejarah":          SEJARAH_MISCONCEPTIONS,
    "Sains":            SAINS_MISCONCEPTIONS,
    "Bahasa Melayu":    BM_MISCONCEPTIONS,
    "Bahasa Inggeris":  ENGLISH_MISCONCEPTIONS,
}

ALL_SUBJECTS = list(SUBJECT_MISCONCEPTIONS.keys())

KBAT_DIFFICULTY = {
    "Memahami":      0.25,
    "Mengaplikasi":  0.45,
    "Menganalisis":  0.65,
    "Menilai":       0.80,
    "Mencipta":      0.90,
}

# Medium of each subject (used by item simulator)
SUBJECT_MEDIUM = {
    "Mathematics":     "either",   # English for DLP, BM for Non-DLP
    "Sains":           "either",
    "Sejarah":         "BM",       # always BM
    "Bahasa Melayu":   "BM",       # always BM
    "Bahasa Inggeris": "English",  # always English
}

# ---------------------------------------------------------------------------
# Critic Agent
# ---------------------------------------------------------------------------

class CriticAgent:
    """
    Secondary agent: validates triage scripts for ecological validity and
    SEDA compliance. Uses rule-based heuristics plus stochastic drift simulation
    (the latter models LLM hallucination/off-persona drift in production).
    """

    _COMPLEX_ENGLISH_MARKERS = [
        "complex conceptual framework",
        "epistemological",
        "metacognitive scaffolding",
        "pedagogical affordance",
        "henceforth", "aforementioned", "pursuant to",
        "in accordance with the stipulated",
    ]

    _FORMAL_BM_MARKERS = [
        "selaras dengan", "berdasarkan peruntukan", "dalam konteks",
        "memandangkan hakikat", "daripada perspektif akademik",
    ]

    # Stochastic drift rates — higher for rural profiles (more LLM off-persona risk)
    _DRIFT_RATES = {
        "URBAN_DLP":     0.08,
        "URBAN_NON_DLP": 0.12,
        "RURAL_DLP":     0.22,
        "RURAL_NON_DLP": 0.32,
    }

    def __init__(self):
        self.total_evaluated: int = 0
        self.approvals: int = 0
        self.rejections: int = 0
        self._approvals_by_profile: Dict[str, int] = defaultdict(int)
        self._rejections_by_profile: Dict[str, int] = defaultdict(int)
        self._rejection_reasons: List[str] = []

    def evaluate(self, persona: Dict, script: str) -> Tuple[bool, str]:
        """Return (is_valid, rejection_reason)."""
        self.total_evaluated += 1
        pid = persona.get("profile_id", "UNKNOWN")

        # Rule 1: Non-DLP scripts must not use complex English academic register
        if persona["programme"] == "Non-DLP":
            for marker in self._COMPLEX_ENGLISH_MARKERS:
                if marker in script.lower():
                    return self._reject(pid, f"Register mismatch: '{marker}' in Non-DLP script")

        # Rule 2: Rural students — reject overly formal BM markers
        if persona["region"] == "Rural":
            for m in self._FORMAL_BM_MARKERS:
                if m in script.lower():
                    return self._reject(pid, f"Formal BM marker '{m}' inappropriate for Rural persona")

        # Rule 3: IRE structure must be complete
        for component in ["[I —", "[R —", "[E —"]:
            if component not in script:
                return self._reject(pid, f"Incomplete IRE structure: missing {component}")

        # Rule 4: SEDA header must be present
        if "[SEDA TRIAGE" not in script:
            return self._reject(pid, "Missing [SEDA TRIAGE ...] header")

        # Rule 5: BM subject scripts should not open in English for Non-DLP
        subject = persona.get("subject_focus", "")
        if subject == "Bahasa Melayu" and persona["programme"] == "Non-DLP":
            if "Show me step by step" in script:
                return self._reject(pid, "BM subject script opened in English for Non-DLP persona")

        # Rule 6: English subject scripts for Non-DLP should acknowledge BM scaffolding
        if subject == "Bahasa Inggeris" and persona["programme"] == "Non-DLP":
            if "Conduct entirely in Bahasa Melayu" not in script and "rephrase" not in script.lower():
                if persona["region"] == "Rural":
                    return self._reject(pid, "English subject script missing BM scaffolding note for Rural Non-DLP")

        # Rule 7: Stochastic drift (simulates LLM off-persona drift)
        drift_chance = self._DRIFT_RATES.get(pid, 0.15)
        if random.random() < drift_chance:
            return self._reject(pid, "Stochastic content drift: script not aligned with persona literacy constraints")

        self.approvals += 1
        self._approvals_by_profile[pid] += 1
        return True, ""

    def _reject(self, profile_id: str, reason: str) -> Tuple[bool, str]:
        self.rejections += 1
        self._rejections_by_profile[profile_id] += 1
        self._rejection_reasons.append(reason)
        return False, reason

    def stats(self) -> Dict:
        all_profiles = set(
            list(self._approvals_by_profile.keys()) +
            list(self._rejections_by_profile.keys())
        )
        by_profile = {}
        for pid in sorted(all_profiles):
            a = self._approvals_by_profile[pid]
            r = self._rejections_by_profile[pid]
            total = a + r
            by_profile[pid] = {
                "approvals": a,
                "rejections": r,
                "total_evaluated": total,
                "rejection_rate_pct": round(r / max(1, total) * 100, 1),
            }
        return {
            "total_evaluated": self.total_evaluated,
            "approvals": self.approvals,
            "rejections": self.rejections,
            "overall_rejection_rate_pct": round(self.rejections / max(1, self.total_evaluated) * 100, 1),
            "by_profile": by_profile,
        }

# ---------------------------------------------------------------------------
# SEDA triage script generator — IRE structure, subject-aware
# ---------------------------------------------------------------------------

_SUBJECT_INITIATION = {
    "Mathematics": (
        "\"Tunjuk cikgu langkah demi langkah — di mana betul-betul awak tersangkut dalam {topic}?\"",
        "\"Show me step by step — where exactly did you get stuck in {topic}?\""
    ),
    "Sejarah": (
        "\"Ceritakan kepada cikgu apa yang awak faham tentang {topic}. Bermula dari fakta yang awak tahu dulu.\"",
        "\"Tell me what you know about {topic} — start with any fact you're sure about.\""
    ),
    "Sains": (
        "\"Perihalkan apa yang berlaku dalam proses {topic} mengikut urutan. Di mana awak mula rasa keliru?\"",
        "\"Describe what happens in {topic} step by step. Where do you start feeling confused?\""
    ),
    "Bahasa Melayu": (
        "\"Tunjukkan cikgu perenggan pertama karangan awak. Baca dengan kuat — kita cari di mana masalahnya.\"",
        "\"Show cikgu your opening paragraph. Read it aloud — we'll find where it breaks down.\""
    ),
    "Bahasa Inggeris": (
        "\"Read your answer aloud from the beginning. Stop where you're not sure — that's where we'll focus.\"",
        "\"Read your answer aloud from the beginning. Stop where you're not sure — that's where we'll focus.\""
    ),
}

def _seda_script(persona: Dict, item: Dict, root_cause: str, error_cat: str) -> str:
    medium_label = "English (DLP)" if persona["programme"] == "DLP" else "Bahasa Melayu"
    region = persona["region"]
    topic = item["topic"]
    subject = item["subject"]
    form_level = item.get("form_level", "F4/F5")
    triage_phrase = persona["chat_samples"]["triage"]
    seda_cluster = SEDA_CLUSTER_MAP.get(error_cat, "C5 — Foundational Knowledge Deficit")

    # Language/register note
    if persona["programme"] == "Non-DLP" and region == "Rural":
        lang_note = (
            "Note: Use familiar dialectal BM — avoid textbook formal phrasing. "
            "Short sentences, visual demonstration preferred over verbal explanation."
        )
    elif persona["programme"] == "Non-DLP":
        lang_note = "Note: Conduct entirely in Bahasa Melayu; minimise English terminology."
    elif region == "Rural":
        lang_note = (
            "Note: Student may code-switch to BM when confused. "
            "Accept BM responses; re-model in English after understanding is confirmed."
        )
    else:
        lang_note = "Note: Manglish code-switching is acceptable and familiar to this urban DLP student."

    # Subject-specific scaffolding note
    if subject == "Bahasa Melayu":
        scaffold_note = (
            "Focus on BM conventions: isi-huraian-contoh structure for karangan, "
            "correct imbuhan usage in tatabahasa, or pembayang-maksud for puisi."
        )
    elif subject == "Bahasa Inggeris":
        scaffold_note = (
            "Focus on English language strategies: paraphrase in own words, "
            "identify text signals (however/therefore), and model topic sentence structure."
        )
    else:
        scaffold_note = (
            "Use a parallel worked example with simpler numbers/facts first. "
            "Confirm understanding before returning to the original item."
        )

    bm_initiation, eng_initiation = _SUBJECT_INITIATION.get(subject, (
        "\"Tunjuk cikgu di mana awak tersangkut dalam {topic}?\"",
        "\"Show me where exactly you got stuck in {topic}?\""
    ))
    bm_initiation = bm_initiation.format(topic=topic)
    eng_initiation = eng_initiation.format(topic=topic)

    return (
        f"[SEDA TRIAGE — {error_cat}]\n"
        f"Profile: {persona['profile_id']} | Medium: {medium_label} | Region: {region}\n"
        f"Subject: {subject} ({form_level}) | Topic: {topic}\n"
        f"Root cause: {root_cause}\n"
        f"SEDA cluster: {seda_cluster}\n"
        f"Typical utterance: \"{triage_phrase}\"\n"
        f"{lang_note}\n\n"
        f"[I — Initiation] (Teacher opens in {medium_label}):\n"
        f"  {bm_initiation}\n"
        f"  [If DLP: rephrase — {eng_initiation}]\n\n"
        f"[R — Response scaffold] (Expected / elicited student move):\n"
        f"  Student identifies the stuck step or section. Wait ≥8 seconds before prompting.\n"
        f"  If silent: \"Boleh tunjuk cikgu mana bahagian yang awak tulis dahulu? Kita tengok sama-sama.\"\n\n"
        f"[E — Evaluation + Re-teach] (Targeted corrective feedback):\n"
        f"  Address the specific misconception: {root_cause}.\n"
        f"  {scaffold_note}\n"
        f"  Confirm understanding before returning to the original item.\n\n"
        f"[Guided Practice] Assign one parallel item at reduced difficulty (diff −0.2).\n"
        f"  ✓ Correct → advance to next sub-topic.\n"
        f"  ✗ Still wrong → escalate to small-group pull-out or remediation session.\n"
        f"[SEDA: {seda_cluster}]"
    )

# ---------------------------------------------------------------------------
# Question bank — synthetic (F4/F5 only) + optional Supabase extension
# ---------------------------------------------------------------------------

def _build_synthetic_bank() -> List[Dict]:
    """Generate a synthetic F4/F5 question bank covering all 5 subjects."""
    bank = []
    kbat_levels = list(KBAT_DIFFICULTY.keys())
    for subject, topic_map in SUBJECT_MISCONCEPTIONS.items():
        subj_medium = SUBJECT_MEDIUM[subject]
        for topic, misconceptions in topic_map.items():
            form_level = FORM_LEVEL_MAP.get(topic, "F4")  # default F4 if unmapped
            for i, kbat in enumerate(kbat_levels):
                base_diff = KBAT_DIFFICULTY[kbat]
                diff = min(0.95, max(0.05, base_diff + random.gauss(0, 0.04)))
                bank.append({
                    "id": f"SYN_{subject[:3].upper()}_{topic[:8].replace(' ', '_')}_{kbat[:3]}",
                    "topic": topic,
                    "subject": subject,
                    "form_level": form_level,
                    "kbat_level": kbat,
                    "difficulty_index": round(diff, 3),
                    "medium": subj_medium,
                    "misconceptions": misconceptions,
                    "variant": i + 1,
                    "source": "synthetic",
                })
    return bank

def load_question_bank(sb=None, postgrest_url: str = None) -> List[Dict]:
    """
    Load F4/F5 questions from Supabase (or GCP PostgREST proxy) and extend with
    synthetic items. Falls back to fully synthetic bank if offline.
    """
    bank: List[Dict] = []

    # Try Supabase direct (VPS mode) or PostgREST proxy (GCP mode)
    if sb is not None:
        try:
            res = sb.table("topic_anchors").select(
                "id, topic, subject, form_level, anchor_question"
            ).in_("subject", [
                "Mathematics", "Additional Mathematics", "Sejarah", "Sains",
                "Bahasa Melayu", "Bahasa Inggeris"
            ]).in_("form_level", [4, 5]).execute()

            for row in res.data:
                aq = row.get("anchor_question") or {}
                if isinstance(aq, str):
                    try:
                        aq = json.loads(aq)
                    except Exception:
                        aq = {}
                kbat = aq.get("kbat_level", "Memahami")
                diff = KBAT_DIFFICULTY.get(kbat, 0.50)
                diff = min(0.95, max(0.05, diff + random.gauss(0, 0.05)))
                topic = row["topic"]
                raw_fl = str(row.get("form_level") or "4")
                form_level = f"F{raw_fl}" if not raw_fl.startswith("F") else raw_fl

                # Normalise subject name
                subject_raw = row["subject"]
                subject_key = "Mathematics" if subject_raw == "Additional Mathematics" else subject_raw
                topic_map = SUBJECT_MISCONCEPTIONS.get(subject_key, {})
                misconceptions = topic_map.get(topic, ["general conceptual gap"])
                subj_medium = SUBJECT_MEDIUM.get(subject_key, "either")

                for variant_idx, diff_offset in enumerate([-0.18, 0.0, 0.18]):
                    bank.append({
                        "id": f"{row['id']}_v{variant_idx+1}",
                        "topic": topic,
                        "subject": subject_key,
                        "form_level": form_level,
                        "kbat_level": kbat,
                        "difficulty_index": round(min(0.95, max(0.05, diff + diff_offset)), 3),
                        "medium": subj_medium,
                        "misconceptions": misconceptions,
                        "variant": variant_idx + 1,
                        "source": "supabase",
                    })
        except Exception as e:
            print(f"  [warn] Supabase query failed ({e}); extending synthetic bank only")

    elif postgrest_url is not None:
        # GCP PostgREST proxy mode
        try:
            import urllib.request
            url = (
                postgrest_url.rstrip("/") +
                "/rest/v1/topic_anchors"
                "?select=id,topic,subject,form_level,anchor_question"
                "&subject=in.(Mathematics,Sejarah,Sains,"
                "Bahasa%20Melayu,Bahasa%20Inggeris)"
                "&form_level=in.(4,5)"
            )
            req = urllib.request.Request(url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                rows = json.loads(resp.read())
            print(f"  [gcp] Loaded {len(rows)} rows from GCP PostgREST proxy")
            for row in rows:
                aq = row.get("anchor_question") or {}
                if isinstance(aq, str):
                    try:
                        aq = json.loads(aq)
                    except Exception:
                        aq = {}
                kbat = aq.get("kbat_level", "Memahami")
                diff = KBAT_DIFFICULTY.get(kbat, 0.50)
                topic = row["topic"]
                raw_fl = str(row.get("form_level") or "4")
                form_level = f"F{raw_fl}" if not raw_fl.startswith("F") else raw_fl
                subject_key = "Mathematics" if row["subject"] == "Additional Mathematics" else row["subject"]
                misconceptions = SUBJECT_MISCONCEPTIONS.get(subject_key, {}).get(topic, ["general gap"])
                for vi, do in enumerate([-0.18, 0.0, 0.18]):
                    bank.append({
                        "id": f"{row['id']}_v{vi+1}",
                        "topic": topic,
                        "subject": subject_key,
                        "form_level": form_level,
                        "kbat_level": kbat,
                        "difficulty_index": round(min(0.95, max(0.05, diff + do)), 3),
                        "medium": SUBJECT_MEDIUM.get(subject_key, "either"),
                        "misconceptions": misconceptions,
                        "variant": vi + 1,
                        "source": "gcp_postgrest",
                    })
        except Exception as e:
            print(f"  [warn] GCP PostgREST query failed ({e}); extending synthetic bank only")

    # Always augment with synthetic items for full coverage
    synthetic = _build_synthetic_bank()
    existing_keys = {(b["topic"], b["subject"], b["kbat_level"]) for b in bank}
    for item in synthetic:
        key = (item["topic"], item["subject"], item["kbat_level"])
        if key not in existing_keys:
            bank.append(item)
        else:
            item["id"] += "_SYN"
            bank.append(item)

    random.shuffle(bank)
    return bank

# ---------------------------------------------------------------------------
# Cohort generator
# ---------------------------------------------------------------------------

def build_cohort(n: int) -> List[Dict]:
    """Generate n agents, 25% per profile, across all 5 SPM subjects (F4/F5)."""
    cohort: List[Dict] = []
    profiles = list(DEMOGRAPHIC_PROFILES.values())
    per_profile = n // len(profiles)

    for profile in profiles:
        for i in range(per_profile):
            acc_variance = random.uniform(-0.10, 0.12)
            lat_variance = random.uniform(0.88, 1.12)
            cohort.append({
                **profile,
                "agent_id": f"{profile['profile_id']}_{i+1:03d}",
                "base_accuracy": max(0.05, min(0.95, profile["base_accuracy"] + acc_variance)),
                "latency_mean_s": profile["latency_mean_s"] * lat_variance,
                "subject_focus": random.choice(ALL_SUBJECTS),
                "form_focus": random.choice(["F4", "F5"]),
            })

    remainder = n - len(cohort)
    for i in range(remainder):
        profile = random.choice(profiles)
        cohort.append({
            **profile,
            "agent_id": f"{profile['profile_id']}_X{i+1:03d}",
            "base_accuracy": max(0.05, min(0.95, profile["base_accuracy"] + random.uniform(-0.10, 0.12))),
            "latency_mean_s": profile["latency_mean_s"] * random.uniform(0.88, 1.12),
            "subject_focus": random.choice(ALL_SUBJECTS),
            "form_focus": random.choice(["F4", "F5"]),
        })

    random.shuffle(cohort)
    return cohort

# ---------------------------------------------------------------------------
# Item response simulation
# ---------------------------------------------------------------------------

def simulate_item(persona: Dict, item: Dict) -> Dict:
    diff = item["difficulty_index"]
    item_medium = item.get("medium", "either")
    subject = item["subject"]

    # Determine effective medium for this student × item combination
    if item_medium == "English":
        is_english = True
    elif item_medium == "BM":
        is_english = False
    else:  # "either" — Math/Sains
        is_english = (persona["programme"] == "DLP")

    # Language penalty
    lang_penalty = 0.0
    if subject == "Bahasa Inggeris":
        # English subject: Non-DLP carries full eng_literacy_risk
        lang_penalty = persona["eng_literacy_risk"] * (1.0 if persona["programme"] == "Non-DLP" else 0.15)
    elif subject == "Bahasa Melayu":
        # BM subject: DLP carries bm_literacy_risk (less familiar with formal written BM)
        lang_penalty = persona["bm_literacy_risk"] * (1.0 if persona["programme"] == "DLP" else 0.0)
    elif is_english and persona["programme"] == "Non-DLP":
        # Math/Sains in English medium for Non-DLP student
        lang_penalty = persona["language_barrier_risk"] * 0.45

    # Literacy barrier (compounds with difficulty)
    lit_penalty = persona["literacy_barrier_risk"] * diff * 0.30

    effective_acc = max(0.05, persona["base_accuracy"] * (1.25 - diff * 0.55) - lang_penalty - lit_penalty)

    # Guessing floor
    guess_bonus = persona["guessing_rate"] * 0.25
    is_correct = random.random() < (effective_acc + guess_bonus)

    # Latency
    if not is_correct and diff > 0.65:
        latency = max(4.0, random.gauss(persona["latency_mean_s"] * 0.65, persona["latency_sd_s"] * 0.8))
    else:
        latency = max(4.0, random.gauss(persona["latency_mean_s"], persona["latency_sd_s"]))

    mastery_delta = 0.10 if is_correct else -0.05

    # Error classification
    if not is_correct:
        if subject == "Bahasa Inggeris" and persona["eng_literacy_risk"] > 0.25:
            error_cat = "Language Barrier"
        elif subject == "Bahasa Melayu" and persona["region"] == "Rural":
            error_cat = random.choice(["Organisation/Register", "Language Accuracy", "Conceptual Gap"])
        elif is_english and persona["language_barrier_risk"] > 0.20:
            error_cat = "Language Barrier"
        elif diff > 0.68:
            error_cat = "Conceptual Gap"
        elif random.random() < 0.28:
            error_cat = "Careless Error"
        elif persona["literacy_barrier_risk"] > 0.25 and random.random() < 0.4:
            error_cat = "Content Weakness"
        else:
            error_cat = random.choice(SEDA_ERROR_CATEGORIES)
    else:
        error_cat = None

    return {
        "agent_id": persona["agent_id"],
        "profile_id": persona["profile_id"],
        "region": persona["region"],
        "programme": persona["programme"],
        "medium": "English" if is_english else "BM",
        "subject": subject,
        "form_level": item.get("form_level", "F?"),
        "topic": item["topic"],
        "kbat_level": item["kbat_level"],
        "difficulty_index": item["difficulty_index"],
        "is_correct": is_correct,
        "latency_seconds": round(latency, 2),
        "error_category": error_cat,
        "mastery_delta": mastery_delta,
        "effective_accuracy_used": round(effective_acc, 3),
        "lang_penalty_applied": round(lang_penalty, 3),
        "session_dropped": False,
        "timestamp": time.time() + random.uniform(-3600, 0),
    }

# ---------------------------------------------------------------------------
# Main simulation runner
# ---------------------------------------------------------------------------

ITEMS_PER_SESSION = 40
MAX_CRITIC_ROLLS = 5

async def run_simulation(
    n: int,
    bank: List[Dict],
    critic: CriticAgent,
    target: str = "vps",
) -> Tuple[List[Dict], List[Dict]]:
    cohort = build_cohort(n)
    telemetry: List[Dict] = []
    triage_corpus: List[Dict] = []
    triage_counter = 0

    topics_in_bank = len(set(i["topic"] for i in bank))
    f4_items = sum(1 for i in bank if i.get("form_level") == "F4")
    f5_items = sum(1 for i in bank if i.get("form_level") == "F5")

    print(f"\nRunning Monte Carlo simulation [{target.upper()} target]:")
    print(f"  Agents:        {len(cohort):,}  (4 profiles × {n//4} each)")
    print(f"  Subjects:      {len(ALL_SUBJECTS)} ({', '.join(ALL_SUBJECTS)})")
    print(f"  Bank items:    {len(bank):,}  ({topics_in_bank} topics; F4={f4_items}, F5={f5_items})")
    print(f"  Items/session: {ITEMS_PER_SESSION}")
    print(f"  Critic rolls:  max {MAX_CRITIC_ROLLS}\n")

    by_subject_form: Dict[str, List[Dict]] = defaultdict(list)
    for item in bank:
        key = f"{item['subject']}|{item.get('form_level','F?')}"
        by_subject_form[key].append(item)

    for agent_idx, persona in enumerate(cohort):
        if agent_idx % 60 == 0:
            print(f"  Progress: {agent_idx}/{n} agents simulated...")

        subject = persona["subject_focus"]
        form = persona["form_focus"]
        pool_key = f"{subject}|{form}"
        pool = by_subject_form.get(pool_key) or by_subject_form.get(f"{subject}|F4") or list(bank)
        if len(pool) < ITEMS_PER_SESSION:
            pool = [i for i in bank if i["subject"] == subject] or list(bank)
        session_items = random.sample(pool, min(ITEMS_PER_SESSION, len(pool)))

        # Pass the subject_focus into persona for Critic subject-specific rules
        persona = {**persona, "subject_focus": subject}

        mastery: Dict[str, float] = defaultdict(lambda: 0.30)
        consecutive_failures = 0
        session_dropped = False

        for item in session_items:
            attempt = simulate_item(persona, item)
            attempt["mastery_before"] = round(mastery[item["topic"]], 3)
            mastery[item["topic"]] = min(1.0, max(0.0, mastery[item["topic"]] + attempt["mastery_delta"]))
            attempt["mastery_after"] = round(mastery[item["topic"]], 3)
            telemetry.append(attempt)

            if not attempt["is_correct"]:
                consecutive_failures += 1
                # Drop-off is failure-conditional: only triggers after consecutive failures,
                # weighted by the profile's drop_off_rate. Prevents inflated quit rates from
                # compounding per-item probability over 40 items (was ~87% for Urban DLP).
                if consecutive_failures >= 2 and random.random() < persona["drop_off_rate"]:
                    session_dropped = True
                    break
                if consecutive_failures >= 3:
                    triage_counter += 1
                    topic = item["topic"]
                    misconceptions = item.get("misconceptions", ["general conceptual gap"])
                    root_cause = random.choice(misconceptions)
                    error_cat = attempt["error_category"] or "Conceptual Gap"

                    valid_script = False
                    critic_rolls = 0
                    final_script = ""
                    final_rejection_reason = ""

                    while not valid_script and critic_rolls < MAX_CRITIC_ROLLS:
                        draft = _seda_script(persona, item, root_cause, error_cat)
                        is_valid, rejection_reason = critic.evaluate(persona, draft)
                        critic_rolls += 1
                        if is_valid:
                            valid_script = True
                            final_script = draft
                        else:
                            final_rejection_reason = rejection_reason
                            root_cause = random.choice(misconceptions)

                    triage_corpus.append({
                        "triage_id": f"TR_{triage_counter:05d}",
                        "agent_id": persona["agent_id"],
                        "profile_id": persona["profile_id"],
                        "region": persona["region"],
                        "programme": persona["programme"],
                        "medium": persona["medium"],
                        "subject": item["subject"],
                        "form_level": item.get("form_level", "F?"),
                        "topic": topic,
                        "error_category": error_cat,
                        "root_cause": root_cause,
                        "seda_cluster": SEDA_CLUSTER_MAP.get(error_cat, "C5 — Foundational Knowledge Deficit"),
                        "chat_sample": persona["chat_samples"]["triage"],
                        "intervention_script": final_script if valid_script else None,
                        "critic_rerolls": critic_rolls - 1,
                        "validated": valid_script,
                        "final_rejection_reason": "" if valid_script else final_rejection_reason,
                        "timestamp": time.time(),
                    })
                    consecutive_failures = 0
            else:
                consecutive_failures = 0

        if session_dropped:
            telemetry.append({
                "agent_id": persona["agent_id"],
                "profile_id": persona["profile_id"],
                "region": persona["region"],
                "programme": persona["programme"],
                "medium": persona["medium"],
                "subject": subject,
                "form_level": form,
                "topic": None,
                "kbat_level": None,
                "difficulty_index": None,
                "is_correct": None,
                "latency_seconds": None,
                "error_category": "Session Drop-Off",
                "mastery_delta": 0,
                "mastery_before": None,
                "mastery_after": None,
                "effective_accuracy_used": None,
                "lang_penalty_applied": None,
                "session_dropped": True,
                "timestamp": time.time(),
            })

    print(f"\n  Simulation complete.")
    print(f"  Telemetry records: {len(telemetry):,}")
    print(f"  Triage scripts:    {len(triage_corpus):,}")
    print(f"  Critic evaluations: {critic.total_evaluated:,}  "
          f"(approved: {critic.approvals:,} / rejected: {critic.rejections:,})\n")
    return telemetry, triage_corpus

# ---------------------------------------------------------------------------
# Summary report
# ---------------------------------------------------------------------------

def print_summary(telemetry: List[Dict], triage: List[Dict], critic: CriticAgent, target: str):
    real = [r for r in telemetry if not r.get("session_dropped")]
    drops = [r for r in telemetry if r.get("session_dropped")]
    critic_stats = critic.stats()

    sep = "─" * 90
    print(f"\n{'═'*90}")
    print(f"  SIMULATION SUMMARY — Multi-Demographic SPM Benchmark [{target.upper()}]")
    print(f"  Subjects: {' · '.join(ALL_SUBJECTS)}")
    print(f"  Forms: F4 & F5 (KSSM SPM target cohort)")
    print(f"{'═'*90}")
    print(f"  Total item attempts : {len(real):,}")
    print(f"  Session drop-offs   : {len(drops):,}")
    print(f"  Triage triggers     : {len(triage):,}  (validated: {sum(1 for t in triage if t['validated'])})")
    print(f"  Critic evaluations  : {critic_stats['total_evaluated']:,}")
    print(f"  Critic rejection %  : {critic_stats['overall_rejection_rate_pct']:.1f}%")
    print()

    # ── 4-Profile demographic cross-tab ──────────────────────────────────────
    print(f"{'═'*90}")
    print("  DEMOGRAPHIC PROFILE BREAKDOWN  (4-profile 2×2 matrix)")
    print(f"{'═'*90}")
    header = f"{'Profile':<18} {'N':>5} {'Pass%':>7} {'LatMean':>9} {'Drop%':>8} {'Triage':>7} {'CriticRej%':>12}"
    print(header)
    print(sep)

    for pid in ["URBAN_DLP", "URBAN_NON_DLP", "RURAL_DLP", "RURAL_NON_DLP"]:
        recs = [r for r in real if r.get("profile_id") == pid]
        dr   = [r for r in drops if r.get("profile_id") == pid]
        tr   = [t for t in triage if t.get("profile_id") == pid]
        n_rec = len(recs)
        if n_rec == 0:
            print(f"  {pid:<16}  {'—':>5} {'—':>7} {'—':>9} {'—':>8} {'—':>7} {'—':>12}")
            continue
        pass_rate = sum(1 for r in recs if r["is_correct"]) / n_rec * 100
        lats = [r["latency_seconds"] for r in recs if r.get("latency_seconds") is not None]
        mean_lat = sum(lats) / len(lats) if lats else 0
        agents = len(set(r["agent_id"] for r in recs + dr))
        drop_pct = len(dr) / max(1, agents) * 100
        cs = critic_stats["by_profile"].get(pid, {})
        rej_rate = cs.get("rejection_rate_pct", 0.0)
        print(f"  {pid:<16}  {n_rec:>5,} {pass_rate:>6.1f}%  {mean_lat:>7.1f}s  {drop_pct:>7.1f}%  {len(tr):>6,}  {rej_rate:>11.1f}%")

    print(sep)
    print()

    # ── By Subject ───────────────────────────────────────────────────────────
    print(f"{'═'*90}")
    print("  SUBJECT BREAKDOWN  (all 5 SPM papers)")
    print(f"{'═'*90}")
    subj_header = f"{'Subject':<22} {'N':>6} {'Pass%':>7} {'LatMean':>9} {'F4 Pass%':>10} {'F5 Pass%':>10} {'Triage':>8}"
    print(subj_header)
    print(sep)

    for subj in ALL_SUBJECTS:
        srecs = [r for r in real if r.get("subject") == subj]
        f4recs = [r for r in srecs if r.get("form_level") == "F4"]
        f5recs = [r for r in srecs if r.get("form_level") == "F5"]
        str_ = [t for t in triage if t.get("subject") == subj]
        n_s = len(srecs)
        if n_s == 0:
            continue
        pr = sum(1 for r in srecs if r["is_correct"]) / n_s * 100
        lats = [r["latency_seconds"] for r in srecs if r.get("latency_seconds") is not None]
        ml = sum(lats) / len(lats) if lats else 0
        f4pr = (sum(1 for r in f4recs if r["is_correct"]) / len(f4recs) * 100) if f4recs else 0
        f5pr = (sum(1 for r in f5recs if r["is_correct"]) / len(f5recs) * 100) if f5recs else 0
        print(f"  {subj:<22} {n_s:>6,} {pr:>6.1f}%  {ml:>7.1f}s  {f4pr:>9.1f}%  {f5pr:>9.1f}%  {len(str_):>8,}")

    print(sep)
    print()

    # ── Form Level Breakdown ──────────────────────────────────────────────────
    print(f"{'═'*90}")
    print("  FORM LEVEL BREAKDOWN")
    print(f"{'═'*90}")
    for fl in ["F4", "F5"]:
        fl_recs = [r for r in real if r.get("form_level") == fl]
        if not fl_recs:
            continue
        pr = sum(1 for r in fl_recs if r["is_correct"]) / len(fl_recs) * 100
        lats = [r["latency_seconds"] for r in fl_recs if r.get("latency_seconds") is not None]
        ml = sum(lats) / len(lats) if lats else 0
        print(f"  {fl}:  N={len(fl_recs):,}  Pass={pr:.1f}%  LatMean={ml:.1f}s")
    print(sep)
    print()

    # ── Profile × Subject Matrix ──────────────────────────────────────────────
    print(f"{'═'*90}")
    print("  PROFILE × SUBJECT PASS RATE MATRIX")
    print(f"{'═'*90}")
    col_w = 14
    header_row = f"  {'Profile':<18}" + "".join(f"{s[:col_w-1]:>{col_w}}" for s in ALL_SUBJECTS)
    print(header_row)
    print(sep)
    for pid in ["URBAN_DLP", "URBAN_NON_DLP", "RURAL_DLP", "RURAL_NON_DLP"]:
        row = f"  {pid:<18}"
        for subj in ALL_SUBJECTS:
            recs = [r for r in real if r.get("profile_id") == pid and r.get("subject") == subj]
            if recs:
                pr = sum(1 for r in recs if r["is_correct"]) / len(recs) * 100
                row += f"{pr:>{col_w-2}.1f}% "
            else:
                row += f"{'—':>{col_w}}"
        print(row)
    print(sep)
    print()

    # ── SEDA Cluster Distribution ─────────────────────────────────────────────
    print(f"{'═'*90}")
    print("  SEDA CLUSTER DISTRIBUTION")
    print(f"{'═'*90}")
    cluster_counts = Counter(t["seda_cluster"] for t in triage)
    for cluster, count in sorted(cluster_counts.items(), key=lambda x: -x[1]):
        pct = count / max(1, len(triage)) * 100
        bar = "█" * int(pct / 2)
        print(f"  {cluster:<50} {count:>5,} ({pct:>5.1f}%) {bar}")
    print(sep)
    print()

    # ── Critic Agent Statistics ───────────────────────────────────────────────
    print(f"{'═'*90}")
    print("  CRITIC AGENT — REJECTION RATES BY PROFILE")
    print(f"{'═'*90}")
    crit_header = f"{'Profile':<18} {'Evaluated':>10} {'Approved':>10} {'Rejected':>10} {'Rej%':>8}"
    print(crit_header)
    print(sep)
    for pid, cs in sorted(critic_stats["by_profile"].items()):
        print(f"  {pid:<16}  {cs['total_evaluated']:>9,}  {cs['approvals']:>9,}  "
              f"{cs['rejections']:>9,}  {cs['rejection_rate_pct']:>7.1f}%")
    print(f"\n  Overall: {critic_stats['total_evaluated']:,} evaluated, "
          f"{critic_stats['overall_rejection_rate_pct']:.1f}% rejected")
    print(sep)

# ---------------------------------------------------------------------------
# Backend health check
# ---------------------------------------------------------------------------

def check_backend(target: str) -> str:
    """Return backend status string for the given target."""
    urls = {
        "vps":  "http://localhost:8000/docs",
        "gcp":  "https://kuasaprestij-api-746801891568.asia-southeast1.run.app/docs",
    }
    url = urls.get(target)
    if not url:
        return "unknown target"
    try:
        import urllib.request
        code = urllib.request.urlopen(url, timeout=6).getcode()
        return f"HTTP {code} ✓"
    except Exception as e:
        return f"unreachable ({e})"

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description="SPM F4/F5 demographic simulation benchmark")
    ap.add_argument("--target",  choices=["vps", "gcp"], default="vps",
                    help="Backend target: vps (Supabase direct) or gcp (PostgREST proxy)")
    ap.add_argument("--n",       type=int, default=300, help="Number of synthetic agents")
    ap.add_argument("--seed",    type=int, default=None,
                    help="Random seed (default: 42 for vps, 99 for gcp)")
    ap.add_argument("--offline", action="store_true", help="Skip remote DB; use synthetic bank only")
    args = ap.parse_args()

    seed = args.seed if args.seed is not None else (42 if args.target == "vps" else 99)
    random.seed(seed)

    print(f"\n{'='*60}")
    print(f"  SPM F4/F5 Demographic Simulation — target: {args.target.upper()}")
    print(f"  Seed: {seed}  |  Agents: {args.n}  |  Subjects: {len(ALL_SUBJECTS)}")
    print(f"{'='*60}")

    # Health check
    status = check_backend(args.target)
    print(f"  Backend [{args.target.upper()}] status: {status}")

    # Output directory
    outdir = f"data/{args.target}_f4f5"
    os.makedirs(outdir, exist_ok=True)
    print(f"  Output dir: {outdir}/\n")

    critic = CriticAgent()
    bank: List[Dict] = []

    GCP_POSTGREST = "https://kuasaprestij-supabase-proxy-746801891568.asia-southeast1.run.app"

    if args.offline:
        print("Offline mode: building fully synthetic F4/F5 question bank...")
        bank = load_question_bank(sb=None)
    else:
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_KEY")

        if args.target == "vps":
            if url and key:
                try:
                    from supabase import create_client
                    sb = create_client(url, key)
                    print("Loading F4/F5 question bank from Supabase [VPS direct]...")
                    bank = load_question_bank(sb=sb)
                except Exception as e:
                    print(f"Supabase failed ({e}); using synthetic bank")
                    bank = load_question_bank(sb=None)
            else:
                print("SUPABASE_URL/KEY not set — using synthetic bank")
                bank = load_question_bank(sb=None)
        else:
            # GCP target: try PostgREST proxy first, fall back to direct Supabase
            print("Loading F4/F5 question bank via GCP PostgREST proxy...")
            bank = load_question_bank(postgrest_url=GCP_POSTGREST)
            if not any(i["source"] == "gcp_postgrest" for i in bank):
                print("  PostgREST unavailable — falling back to Supabase direct...")
                if url and key:
                    try:
                        from supabase import create_client
                        sb = create_client(url, key)
                        bank = load_question_bank(sb=sb)
                    except Exception as e:
                        print(f"  Supabase also failed ({e}); using synthetic bank")
                        bank = load_question_bank(sb=None)

    # Summary of bank
    f4_n = sum(1 for i in bank if i.get("form_level") == "F4")
    f5_n = sum(1 for i in bank if i.get("form_level") == "F5")
    subj_counts = Counter(i["subject"] for i in bank)
    print(f"  Bank: {len(bank):,} items  [F4={f4_n}, F5={f5_n}]")
    for s, c in sorted(subj_counts.items()):
        print(f"    {s:<25} {c:>4,} items")
    print()

    telemetry, triage_corpus = asyncio.run(run_simulation(args.n, bank, critic, args.target))

    # Export
    out_tel = f"{outdir}/synthetic_telemetry.json"
    out_tri = f"{outdir}/seda_triage_corpus.json"
    out_cri = f"{outdir}/critic_agent_stats.json"

    with open(out_tel, "w", encoding="utf-8") as f:
        json.dump(telemetry, f, indent=2, ensure_ascii=False)
    with open(out_tri, "w", encoding="utf-8") as f:
        json.dump(triage_corpus, f, indent=2, ensure_ascii=False)
    with open(out_cri, "w", encoding="utf-8") as f:
        json.dump(critic.stats(), f, indent=2, ensure_ascii=False)

    print(f"\nExported: {out_tel}  ({len(telemetry):,} records)")
    print(f"Exported: {out_tri}  ({len(triage_corpus):,} scripts)")
    print(f"Exported: {out_cri}")

    print_summary(telemetry, triage_corpus, critic, args.target)


if __name__ == "__main__":
    main()
