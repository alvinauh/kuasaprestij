#!/usr/bin/env python3
"""
SPM F4/F5 Anchor Seeder — Mathematics, Sains, Bahasa Melayu F5
===============================================================
Run: python seed_spm_f4f5_anchors.py

Seeds topic_anchors rows for the three subjects still missing F4/F5 coverage.
Topic names match simulate_personas.py SUBJECT_MISCONCEPTIONS exactly so the
simulation's Supabase query will find and use these rows.

Unique constraint: UNIQUE(topic, language, form_level)
on_conflict used:  "topic,language,form_level"
"""

import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from dotenv import load_dotenv
    load_dotenv(override=True)
except ImportError:
    pass

from agents.orchestrator import supabase

FALLBACK_AUDIO = "https://cdn.kuasaprestij.tech/assets/fallback_beat.mp3"
FALLBACK_VIDEO = "https://cdn.kuasaprestij.tech/assets/fallback_video.mp4"

# ============================================================
# MATHEMATICS — F4 & F5  (language: English for DLP / BM for Non-DLP)
# Topic names must match MATH_MISCONCEPTIONS keys in simulate_personas.py
# ============================================================

MATH_ANCHORS = [
    # ── F4 ──────────────────────────────────────────────────
    {
        "topic": "Quadratic Functions", "form_level": 4,
        "mnemonic_lyrics": (
            "a, b, c shape the parabola's curve,\n"
            "Vertex at the peak — that's what you deserve,\n"
            "Roots where y is zero, axis in the middle,\n"
            "Discriminant solves the real-roots riddle."
        ),
        "anchor_question": {
            "question_type": "mcq", "kbat_level": "Menganalisis",
            "illustrative_notes": (
                "A quadratic function f(x) = ax² + bx + c forms a parabola. "
                "The vertex (turning point) is at x = -b/(2a). "
                "The discriminant b²-4ac determines the number of real roots: "
                ">0 means two roots, =0 means one repeated root, <0 means no real roots."
            ),
            "question": (
                "The quadratic function f(x) = 2x² - 8x + k has a minimum value of 3. "
                "What is the value of k?"
            ),
            "options": ["k = 3", "k = 5", "k = 11", "k = -5"],
            "correct_answer": "k = 11",
            "distractor_rationale": {
                "k = 3": "3 is the minimum VALUE of f(x), not the value of k.",
                "k = 5": "Vertex x = -(-8)/(2·2) = 2; f(2) = 2(4)-8(2)+k = k-8 = 3, so k = 11.",
                "k = -5": "Sign error — subtracting instead of adding 8.",
            },
        },
    },
    {
        "topic": "Algebra", "form_level": 4,
        "mnemonic_lyrics": (
            "Variables dance on both sides of the sign,\n"
            "Expand, collect, simplify — you'll be fine,\n"
            "Flip the inequality when dividing by minus,\n"
            "Check your answer — that's how you find us."
        ),
        "anchor_question": {
            "question_type": "mcq", "kbat_level": "Mengaplikasi",
            "illustrative_notes": (
                "When expanding expressions, distribute carefully across all terms. "
                "Key pitfalls: forgetting to change the sign of every term inside brackets "
                "when a negative is outside, and combining unlike terms."
            ),
            "question": "Simplify: 3(2x - 4) - 2(x + 5)",
            "options": ["4x - 22", "4x + 22", "8x - 22", "4x - 2"],
            "correct_answer": "4x - 22",
            "distractor_rationale": {
                "4x + 22": "Sign error — -2×5 = -10, not +10.",
                "8x - 22": "Error expanding 3(2x): result is 6x not 9x; 6x-2x = 4x.",
                "4x - 2": "-12 - 10 = -22, not -2.",
            },
        },
    },
    {
        "topic": "Linear Inequalities", "form_level": 4,
        "mnemonic_lyrics": (
            "Greater than, less than — place on the line,\n"
            "Open circle means the endpoint's not mine,\n"
            "Multiply by negative — flip the sign,\n"
            "Shade the region where solutions align."
        ),
        "anchor_question": {
            "question_type": "mcq", "kbat_level": "Mengaplikasi",
            "illustrative_notes": (
                "Solving linear inequalities follows the same steps as equations, "
                "EXCEPT: when multiplying or dividing both sides by a NEGATIVE number, "
                "the inequality sign reverses."
            ),
            "question": "Solve: -3x + 6 > 0",
            "options": ["x > 2", "x < 2", "x > -2", "x < -2"],
            "correct_answer": "x < 2",
            "distractor_rationale": {
                "x > 2": "Sign was not flipped when dividing by -3.",
                "x > -2": "-3x > -6 → x < 2, not x > -2.",
                "x < -2": "Arithmetic error: 6/3 = 2, not -2.",
            },
        },
    },
    {
        "topic": "Coordinate Geometry", "form_level": 4,
        "mnemonic_lyrics": (
            "Midpoint splits the segment fair,\n"
            "Gradient = rise over run — compare,\n"
            "Perpendicular lines — slopes multiply to -1,\n"
            "Distance formula — square, sum, then root it done."
        ),
        "anchor_question": {
            "question_type": "mcq", "kbat_level": "Menganalisis",
            "illustrative_notes": (
                "The gradient of a line through (x₁,y₁) and (x₂,y₂) is m = (y₂-y₁)/(x₂-x₁). "
                "Two lines are perpendicular if m₁ × m₂ = -1. "
                "Midpoint = ((x₁+x₂)/2, (y₁+y₂)/2)."
            ),
            "question": (
                "A line passes through P(1, 3) and Q(5, 7). "
                "What is the gradient of a line perpendicular to PQ?"
            ),
            "options": ["1", "-1", "4", "-4"],
            "correct_answer": "-1",
            "distractor_rationale": {
                "1": "m_PQ = (7-3)/(5-1) = 1; perpendicular gradient = -1/1 = -1.",
                "4": "4 is the rise (numerator), not the gradient.",
                "-4": "-4 would be the negative of the rise, not the perpendicular gradient.",
            },
        },
    },
    {
        "topic": "Vectors", "form_level": 4,
        "mnemonic_lyrics": (
            "Direction and magnitude — two things a vector holds,\n"
            "Position from origin — that's the story told,\n"
            "Add tip to tail, subtract changes direction,\n"
            "Parallel vectors share the same connection."
        ),
        "anchor_question": {
            "question_type": "mcq", "kbat_level": "Menganalisis",
            "illustrative_notes": (
                "A position vector gives the location of a point relative to the origin O. "
                "Vector AB = position vector of B − position vector of A. "
                "Two vectors are parallel if one is a scalar multiple of the other."
            ),
            "question": (
                "Given position vectors: OA = 3i + 4j and OB = 9i + 12j. "
                "What can be concluded about A, O, and B?"
            ),
            "options": [
                "OA and OB are equal vectors",
                "OA and OB are perpendicular",
                "O, A, and B are collinear",
                "B is the midpoint of OA",
            ],
            "correct_answer": "O, A, and B are collinear",
            "distractor_rationale": {
                "OA and OB are equal vectors": "Equal vectors have same magnitude AND direction; OB = 3×OA, so same direction but different magnitude.",
                "OA and OB are perpendicular": "OB = 3·OA means they are parallel, not perpendicular.",
                "B is the midpoint of OA": "B is 3 times as far from O as A — A is between O and B, not B between O and A.",
            },
        },
    },
    # ── F5 ──────────────────────────────────────────────────
    {
        "topic": "Differentiation", "form_level": 5,
        "mnemonic_lyrics": (
            "Power rule: bring down, then minus one,\n"
            "Chain rule wraps a function — when it's done,\n"
            "Product and quotient — two functions in play,\n"
            "Gradient at a point tells the slope of the way."
        ),
        "anchor_question": {
            "question_type": "mcq", "kbat_level": "Mengaplikasi",
            "illustrative_notes": (
                "Power rule: d/dx(xⁿ) = nxⁿ⁻¹. "
                "Chain rule: d/dx[f(g(x))] = f'(g(x)) · g'(x). "
                "The gradient of a curve at a point is the value of dy/dx at that x."
            ),
            "question": "Find dy/dx if y = (3x² + 1)⁴.",
            "options": ["4(3x² + 1)³", "24x(3x² + 1)³", "4(6x)³", "12x(3x² + 1)⁴"],
            "correct_answer": "24x(3x² + 1)³",
            "distractor_rationale": {
                "4(3x² + 1)³": "Chain rule missing — inner derivative d/dx(3x²+1) = 6x was not applied.",
                "4(6x)³": "Incorrect — the outer function gives (3x²+1)³, not (6x)³.",
                "12x(3x² + 1)⁴": "Exponent not reduced — power rule requires n-1, giving ³ not ⁴.",
            },
        },
    },
    {
        "topic": "Integration", "form_level": 5,
        "mnemonic_lyrics": (
            "Add one to power, divide by new,\n"
            "Plus C for indefinite — always true,\n"
            "Definite integral: limits top and below,\n"
            "F(b) minus F(a) — watch the flow."
        ),
        "anchor_question": {
            "question_type": "mcq", "kbat_level": "Mengaplikasi",
            "illustrative_notes": (
                "Indefinite integral: ∫xⁿ dx = xⁿ⁺¹/(n+1) + C (n ≠ -1). "
                "Definite integral ∫ₐᵇ f(x) dx = F(b) - F(a). "
                "Always add the constant C for indefinite integrals."
            ),
            "question": "Find ∫(6x² - 4x + 3) dx.",
            "options": [
                "2x³ - 2x² + 3x",
                "2x³ - 2x² + 3x + C",
                "12x - 4 + C",
                "6x³ - 4x² + 3x + C",
            ],
            "correct_answer": "2x³ - 2x² + 3x + C",
            "distractor_rationale": {
                "2x³ - 2x² + 3x": "Missing constant of integration C — required for indefinite integrals.",
                "12x - 4 + C": "This is the derivative of the integrand, not the integral.",
                "6x³ - 4x² + 3x + C": "Coefficients not divided by new powers: 6/3=2 not 6, 4/2=2 not 4.",
            },
        },
    },
    {
        "topic": "Trigonometry", "form_level": 5,
        "mnemonic_lyrics": (
            "CAST tells which quadrant's positive sign,\n"
            "Sin, cos, tan — know their baseline design,\n"
            "Reference angle, then adjust for the quad,\n"
            "Solve in range given — every solution count."
        ),
        "anchor_question": {
            "question_type": "mcq", "kbat_level": "Menganalisis",
            "illustrative_notes": (
                "Use the CAST diagram to determine signs in each quadrant: "
                "Q1=All positive, Q2=Sin positive, Q3=Tan positive, Q4=Cos positive. "
                "Reference angle is always the acute angle with the x-axis. "
                "When solving trig equations, find all angles in the given range."
            ),
            "question": "Solve sin θ = -0.5 for 0° ≤ θ ≤ 360°.",
            "options": [
                "θ = 30° only",
                "θ = 150° and 210°",
                "θ = 210° and 330°",
                "θ = 30° and 150°",
            ],
            "correct_answer": "θ = 210° and 330°",
            "distractor_rationale": {
                "θ = 30° only": "sin 30° = +0.5; the question asks for -0.5, which is in Q3 and Q4.",
                "θ = 150° and 210°": "sin 150° = +0.5 (Q2, positive); only Q3 and Q4 give negative sin.",
                "θ = 30° and 150°": "These give +0.5, not -0.5.",
            },
        },
    },
    {
        "topic": "Probability", "form_level": 5,
        "mnemonic_lyrics": (
            "Equally likely — count outcomes with care,\n"
            "P(A and B) — are they dependent? Beware,\n"
            "P(A or B) = P(A) + P(B) minus the pair,\n"
            "At least / at most — complement's there."
        ),
        "anchor_question": {
            "question_type": "mcq", "kbat_level": "Menganalisis",
            "illustrative_notes": (
                "P(A ∪ B) = P(A) + P(B) - P(A ∩ B). "
                "Independent events: P(A ∩ B) = P(A) × P(B). "
                "Complement rule: P(at least one) = 1 - P(none). "
                "Watch for 'with replacement' vs 'without replacement' — the latter changes P."
            ),
            "question": (
                "A bag contains 4 red and 6 blue marbles. "
                "Two marbles are drawn WITHOUT replacement. "
                "What is the probability that both are red?"
            ),
            "options": ["4/25", "2/15", "12/90", "16/100"],
            "correct_answer": "2/15",
            "distractor_rationale": {
                "4/25": "This assumes WITH replacement: (4/10)² = 16/100 = 4/25.",
                "12/90": "12/90 = 2/15 — same answer expressed unsimplified; the intended trap is selecting this thinking it differs.",
                "16/100": "With replacement calculation — does not account for the reduced sample space after first draw.",
            },
        },
    },
    {
        "topic": "Permutations and Combinations", "form_level": 5,
        "mnemonic_lyrics": (
            "Order matters for permutation's count,\n"
            "nPr = n! divided by what's left out,\n"
            "Combination — order doesn't care,\n"
            "nCr divides by r! — the answer's there."
        ),
        "anchor_question": {
            "question_type": "mcq", "kbat_level": "Mengaplikasi",
            "illustrative_notes": (
                "Permutation nPr = n!/(n-r)! — used when ORDER matters. "
                "Combination nCr = n!/(r!(n-r)!) — used when ORDER does NOT matter. "
                "Ask: does swapping positions create a different outcome? Yes → permutation."
            ),
            "question": (
                "A committee of 3 must be selected from 8 candidates. "
                "How many different committees are possible?"
            ),
            "options": ["336", "56", "24", "512"],
            "correct_answer": "56",
            "distractor_rationale": {
                "336": "336 = 8P3 (permutation) — used when order matters; committee members have equal status, so order does not matter.",
                "24": "24 = 4! — unrelated calculation.",
                "512": "2⁸ — would apply if each candidate was independently included/excluded, not a selection of exactly 3.",
            },
        },
    },
]

# ============================================================
# SAINS — F4 & F5  (language: Bahasa Melayu for Non-DLP / English for DLP)
# Seeds as subject="Sains", language="Bahasa Melayu"
# ============================================================

SAINS_ANCHORS = [
    # ── F4 ──────────────────────────────────────────────────
    {
        "topic": "Sel dan Organisasi Hidup", "form_level": 4,
        "mnemonic_lyrics": (
            "Sel prokariot — tiada nukleus nyata,\n"
            "Sel eukariot — nukleus ada selaput pula,\n"
            "Organel sel — setiap satu ada tugas,\n"
            "Osmosis ikut kecerunan larutan tuntas."
        ),
        "anchor_question": {
            "question_type": "mcq", "kbat_level": "Menganalisis",
            "illustrative_notes": (
                "Sel prokariot (bakteria) tidak mempunyai nukleus bermembran. "
                "Sel eukariot (tumbuhan, haiwan, fungi) mempunyai nukleus bermembran. "
                "Sel tumbuhan unik: ada dinding sel, vakuol besar, dan kloroplas. "
                "Osmosis ialah pergerakan air melalui membran separa telap dari larutan cair ke larutan pekat."
            ),
            "question": (
                "Sel darah merah dimasukkan ke dalam larutan garam pekat (hipertonik). "
                "Apakah yang berlaku kepada sel darah merah tersebut?"
            ),
            "options": [
                "Sel membengkak dan meletup (lisis)",
                "Sel mengecut (krenasi) kerana kehilangan air melalui osmosis",
                "Sel kekal saiz yang sama",
                "Sel menyerap garam dan membesar",
            ],
            "correct_answer": "Sel mengecut (krenasi) kerana kehilangan air melalui osmosis",
            "distractor_rationale": {
                "Sel membengkak dan meletup (lisis)": "Lisis berlaku dalam larutan hipotonik (cair), bukan hipertonik.",
                "Sel kekal saiz yang sama": "Ini berlaku dalam larutan isottonik — larutan pekat menyebabkan kehilangan air.",
                "Sel menyerap garam dan membesar": "Membran sel separa telap — air bergerak keluar, bukan garam masuk.",
            },
        },
    },
    {
        "topic": "Jirim dan Perubahannya", "form_level": 4,
        "mnemonic_lyrics": (
            "Fizikal kekal identiti, kimia ubah segalanya,\n"
            "Eksoterm keluarkan haba, endoterm serap tenaga,\n"
            "Pepejal, cecair, gas — susunan zarah bezanya,\n"
            "Perubahan keadaan jirim — tenaga mengubahnya."
        ),
        "anchor_question": {
            "question_type": "mcq", "kbat_level": "Menganalisis",
            "illustrative_notes": (
                "Perubahan fizik: identiti bahan kekal (cair ais → air). "
                "Perubahan kimia: terbentuk bahan baharu (pembakaran, pengoksidaan). "
                "Tanda perubahan kimia: perubahan warna, gas, mendakan, perubahan haba."
            ),
            "question": (
                "Besi berkarat apabila terdedah kepada air dan oksigen. "
                "Mengapakah ini merupakan perubahan KIMIA dan bukan perubahan fizik?"
            ),
            "options": [
                "Kerana besi berubah warna sahaja",
                "Kerana bahan baharu (ferum(III) oksida) terbentuk dan proses ini tidak boleh dibalikkan dengan mudah",
                "Kerana besi menjadi lebih ringan",
                "Kerana air diserap oleh besi",
            ],
            "correct_answer": "Kerana bahan baharu (ferum(III) oksida) terbentuk dan proses ini tidak boleh dibalikkan dengan mudah",
            "distractor_rationale": {
                "Kerana besi berubah warna sahaja": "Perubahan warna sahaja tidak mencukupi — perubahan kimia memerlukan pembentukan bahan baharu.",
                "Kerana besi menjadi lebih ringan": "Besi berkarat sebenarnya LEBIH BERAT kerana oksigen bergabung dengannya.",
                "Kerana air diserap oleh besi": "Air bertindak sebagai perantara, bukan diserap — bahan baharu yang terbentuk adalah ferum(III) oksida.",
            },
        },
    },
    {
        "topic": "Tenaga", "form_level": 4,
        "mnemonic_lyrics": (
            "Kinetik bergerak, potensi dalam kedudukan,\n"
            "Jumlah tenaga kekal — tiada yang hilang ketentuan,\n"
            "Fotosintesis tukar cahaya jadi kimia,\n"
            "Kebakaran tukar kimia jadi haba dan cahaya."
        ),
        "anchor_question": {
            "question_type": "mcq", "kbat_level": "Menganalisis",
            "illustrative_notes": (
                "Hukum Keabadian Tenaga: tenaga tidak boleh dicipta atau dimusnahkan, "
                "hanya bertukar bentuk. "
                "Tenaga kinetik = ½mv². Tenaga potensi graviti = mgh. "
                "Di puncak bukit: TK=0, TP=maksimum. Di dasar: TK=maksimum, TP=0."
            ),
            "question": (
                "Sebiji bola jatuh bebas dari ketinggian 20 m. "
                "Apabila bola berada di ketinggian 10 m, "
                "apakah pernyataan yang BENAR tentang tenaganya?"
            ),
            "options": [
                "Tenaga kinetik = 0, tenaga potensi = maksimum",
                "Tenaga kinetik = tenaga potensi (pada ketinggian 10 m)",
                "Jumlah tenaga mekanik berkurang",
                "Tenaga potensi = 0, tenaga kinetik = maksimum",
            ],
            "correct_answer": "Tenaga kinetik = tenaga potensi (pada ketinggian 10 m)",
            "distractor_rationale": {
                "Tenaga kinetik = 0, tenaga potensi = maksimum": "Ini adalah keadaan di puncak (20 m), bukan 10 m.",
                "Jumlah tenaga mekanik berkurang": "Mengabaikan geseran udara — tenaga mekanik kekal (Hukum Keabadian Tenaga).",
                "Tenaga potensi = 0, tenaga kinetik = maksimum": "Ini berlaku apabila bola mencecah tanah (h=0), bukan di 10 m.",
            },
        },
    },
    {
        "topic": "Elektrik dan Magnet", "form_level": 4,
        "mnemonic_lyrics": (
            "Arus mengalir dari positif ke negatif,\n"
            "Elektron bergerak terbalik — positif ke negatif jauh,\n"
            "V = IR — Ohm punya hukum,\n"
            "Medan magnet lingkari wayar arus yang faham."
        ),
        "anchor_question": {
            "question_type": "mcq", "kbat_level": "Mengaplikasi",
            "illustrative_notes": (
                "Hukum Ohm: V = IR (voltan = arus × rintangan). "
                "Untuk perintang selari: 1/R_jumlah = 1/R₁ + 1/R₂. "
                "Arus (I) mengalir dari terminal positif ke negatif dalam litar luar. "
                "Elektron sebenarnya mengalir dari negatif ke positif."
            ),
            "question": (
                "Dua perintang, 4Ω dan 12Ω, disambungkan secara SELARI. "
                "Berapakah rintangan paduan mereka?"
            ),
            "options": ["16Ω", "8Ω", "3Ω", "6Ω"],
            "correct_answer": "3Ω",
            "distractor_rationale": {
                "16Ω": "16Ω adalah jumlah rintangan bersiri (4+12), bukan selari.",
                "8Ω": "Ralat pengiraan — 1/R = 1/4 + 1/12 = 3/12 + 1/12 = 4/12, jadi R = 3Ω.",
                "6Ω": "6Ω adalah purata aritmetik, bukan formula rintangan selari.",
            },
        },
    },
    # ── F5 ──────────────────────────────────────────────────
    {
        "topic": "Genetik dan Pembiakan", "form_level": 5,
        "mnemonic_lyrics": (
            "Mitosis bagi dua sel yang sama,\n"
            "Meiosis hasilkan gamet — separuh kromosom kita,\n"
            "Dominant tutup resesif dalam fenotip,\n"
            "Kotak Punnett tunjuk nisbah genotip."
        ),
        "anchor_question": {
            "question_type": "mcq", "kbat_level": "Menganalisis",
            "illustrative_notes": (
                "Mitosis: pembelahan sel untuk pertumbuhan — 2 sel anak dengan bilangan kromosom sama (2n). "
                "Meiosis: pembelahan sel untuk pembiakan seksual — 4 gamet dengan separuh kromosom (n). "
                "Alel dominan (R) menutupi alel resesif (r) dalam fenotip. "
                "Genotip Rr → fenotip dominan."
            ),
            "question": (
                "Pokok bunga merah (RR) dikacuk dengan pokok bunga putih (rr). "
                "Apakah nisbah fenotip yang dijangka pada generasi F₂ "
                "jika F₁ dikacukkan sesama sendiri?"
            ),
            "options": [
                "3 merah : 1 putih",
                "1 merah : 1 putih",
                "Semua merah",
                "1 merah : 2 merah jambu : 1 putih",
            ],
            "correct_answer": "3 merah : 1 putih",
            "distractor_rationale": {
                "1 merah : 1 putih": "Nisbah 1:1 berlaku dalam kacukan ujian (Rr × rr), bukan F₁ × F₁.",
                "Semua merah": "Ini adalah hasil F₁ (semua Rr), bukan F₂.",
                "1 merah : 2 merah jambu : 1 putih": "Nisbah 1:2:1 hanya berlaku dalam kodominan — soal ini menggunakan dominan penuh.",
            },
        },
    },
    {
        "topic": "Ekosistem", "form_level": 5,
        "mnemonic_lyrics": (
            "Pengeluar tangkap cahaya untuk tenaga,\n"
            "Pengguna makan, rantai makanan terjaga,\n"
            "Nitrogen ditetapkan, dinitrifikasi pula,\n"
            "Ekosistem seimbang — biodiversiti terpelihara."
        ),
        "anchor_question": {
            "question_type": "mcq", "kbat_level": "Menganalisis",
            "illustrative_notes": (
                "Kitaran nitrogen: fiksasi nitrogen (N₂ → ammonia) → nitrifikasi (ammonia → nitrat) → "
                "penyerapan tumbuhan → denitrifikasi (nitrat → N₂). "
                "Piramid ekologi: pengeluar di bawah, pengguna peringkat tertinggi di atas. "
                "Biomass berkurang ke atas piramid."
            ),
            "question": (
                "Dalam kitaran nitrogen, bakteria NITRIFIKASI menjalankan proses:"
            ),
            "options": [
                "Menukarkan gas N₂ atmosfera kepada ammonia",
                "Menukarkan ammonia kepada nitrit dan nitrat",
                "Menukarkan nitrat kepada gas N₂",
                "Menyerap nitrat dari tanah untuk pertumbuhan",
            ],
            "correct_answer": "Menukarkan ammonia kepada nitrit dan nitrat",
            "distractor_rationale": {
                "Menukarkan gas N₂ atmosfera kepada ammonia": "Ini adalah FIKSASI nitrogen — dilakukan oleh bakteria Rhizobium.",
                "Menukarkan nitrat kepada gas N₂": "Ini adalah DENITRIFIKASI — mengembalikan nitrogen ke atmosfera.",
                "Menyerap nitrat dari tanah untuk pertumbuhan": "Ini dilakukan oleh TUMBUHAN (pengeluar), bukan bakteria nitrifikasi.",
            },
        },
    },
    {
        "topic": "Cahaya dan Optik", "form_level": 5,
        "mnemonic_lyrics": (
            "Pantulan: sudut tuju = sudut pantulan,\n"
            "Biasan: cahaya bengkok apabila memasuki medium,\n"
            "Kanta cembung konvergen, cekung divergen,\n"
            "Indeks biasan: nisbah halaju cahaya dalam dua medium."
        ),
        "anchor_question": {
            "question_type": "mcq", "kbat_level": "Mengaplikasi",
            "illustrative_notes": (
                "Indeks biasan n = sin θ_tuju / sin θ_biasan = v₁/v₂. "
                "Cahaya membelok MENDEKATI normal apabila memasuki medium lebih tumpat. "
                "Sudut genting berlaku apabila sudut biasan = 90°. "
                "Pantulan dalam penuh berlaku apabila sudut tuju > sudut genting."
            ),
            "question": (
                "Sinar cahaya bergerak dari air (n=1.33) ke udara (n=1.00) "
                "pada sudut tuju 50°. "
                "Apakah yang berlaku kepada sinar cahaya tersebut?"
            ),
            "options": [
                "Ia terus lurus tanpa biasan",
                "Ia membiaskan mendekati normal",
                "Ia mengalami pantulan dalam penuh kerana 50° mungkin melebihi sudut genting air",
                "Ia membiaskan dengan sudut 50° dalam udara",
            ],
            "correct_answer": "Ia mengalami pantulan dalam penuh kerana 50° mungkin melebihi sudut genting air",
            "distractor_rationale": {
                "Ia terus lurus tanpa biasan": "Biasan berlaku apabila cahaya merentasi sempadan dua medium yang berbeza.",
                "Ia membiaskan mendekati normal": "Cahaya MENJAUH dari normal apabila memasuki medium kurang tumpat (air ke udara).",
                "Ia membiaskan dengan sudut 50° dalam udara": "Sudut biasan tidak sama dengan sudut tuju kerana indeks biasan berbeza.",
            },
        },
    },
    {
        "topic": "Asid, Bes dan Garam", "form_level": 5,
        "mnemonic_lyrics": (
            "Asid: H⁺ dilepaskan dalam larutan,\n"
            "Bes: OH⁻ dilepaskan — peneutralan,\n"
            "Garam + air: asid + bes bertemu,\n"
            "pH < 7 asid, > 7 alkali — ingat selalu."
        ),
        "anchor_question": {
            "question_type": "mcq", "kbat_level": "Mengaplikasi",
            "illustrative_notes": (
                "Peneutralan: asid + alkali → garam + air. "
                "Asid kuat (HCl, H₂SO₄) terion sepenuhnya. "
                "Asid lemah (CH₃COOH) terion separa. "
                "Indikator: litmus merah bertukar biru dalam alkali; phenolphthalein merah jambu dalam alkali."
            ),
            "question": (
                "Asid hidroklorik (HCl) bertindak balas dengan natrium hidroksida (NaOH). "
                "Apakah produk tindak balas ini?"
            ),
            "options": [
                "Natrium klorida dan hidrogen",
                "Natrium klorida dan air",
                "Natrium oksida dan air",
                "Hidrogen klorida dan natrium oksida",
            ],
            "correct_answer": "Natrium klorida dan air",
            "distractor_rationale": {
                "Natrium klorida dan hidrogen": "Hidrogen dihasilkan apabila asid bertindak balas dengan LOGAM, bukan alkali.",
                "Natrium oksida dan air": "NaOH ialah natrium hidroksida, bukan natrium oksida — produk adalah garam + air.",
                "Hidrogen klorida dan natrium oksida": "Ini bukan produk — HCl + NaOH → NaCl + H₂O (peneutralan).",
            },
        },
    },
    {
        "topic": "Tekanan", "form_level": 5,
        "mnemonic_lyrics": (
            "Tekanan = daya per luas kawasan,\n"
            "Cecair kedalaman — tekanan bertambahan,\n"
            "Archimedes: daya apung = berat cecair teranjak,\n"
            "Pascal: tekanan tersebar sama rata segenap penjak."
        ),
        "anchor_question": {
            "question_type": "mcq", "kbat_level": "Menganalisis",
            "illustrative_notes": (
                "Tekanan cecair P = ρgh (ketumpatan × gravity × kedalaman). "
                "Prinsip Archimedes: daya apung = berat cecair yang disisihkan. "
                "Prinsip Pascal: tekanan dalam cecair tertutup disebarkan sama rata ke semua arah. "
                "Objek terapung jika tumpatan < tumpatan cecair."
            ),
            "question": (
                "Seekor ikan berenang lebih dalam di dalam air. "
                "Bagaimana tekanan air terhadap ikan berubah?"
            ),
            "options": [
                "Berkurang kerana isipadu air di atas ikan berkurang",
                "Kekal sama kerana tekanan cecair tidak bergantung kepada kedalaman",
                "Bertambah kerana lebih banyak air berada di atas ikan",
                "Bertambah dan berkurang secara berselang-seli",
            ],
            "correct_answer": "Bertambah kerana lebih banyak air berada di atas ikan",
            "distractor_rationale": {
                "Berkurang kerana isipadu air di atas ikan berkurang": "Isipadu di atas ikan BERTAMBAH apabila ikan berenang lebih dalam.",
                "Kekal sama kerana tekanan cecair tidak bergantung kepada kedalaman": "Ini tidak tepat — P = ρgh menunjukkan tekanan BERTAMBAH dengan kedalaman.",
                "Bertambah dan berkurang secara berselang-seli": "Tidak ada mekanisme yang menyebabkan tekanan bertukar-tukar semasa turun secara seragam.",
            },
        },
    },
    {
        "topic": "Daya dan Gerakan", "form_level": 5,
        "mnemonic_lyrics": (
            "Hukum Newton pertama: benda pegun terus pegun,\n"
            "Kedua: F=ma — daya bagi jisim kali pecutan,\n"
            "Ketiga: setiap tindakan ada tindak balas setara,\n"
            "Berat = mg — jisim beza daripada bera."
        ),
        "anchor_question": {
            "question_type": "mcq", "kbat_level": "Mengaplikasi",
            "illustrative_notes": (
                "Hukum Newton Kedua: F = ma. "
                "Berat W = mg (g = 10 m/s² atau 9.8 m/s²). "
                "Jisim (kg) adalah sifat jirim; berat (N) adalah daya graviti ke atas jisim itu. "
                "Pasangan tindakan-tindak balas (Newton 3) bertindak ke atas objek BERBEZA."
            ),
            "question": (
                "Sebuah kereta berjisim 1000 kg dipercepatkan dari pegun kepada 20 m/s "
                "dalam masa 10 saat. Berapakah daya paduan yang bertindak ke atas kereta?"
            ),
            "options": ["200 N", "2000 N", "20000 N", "200000 N"],
            "correct_answer": "2000 N",
            "distractor_rationale": {
                "200 N": "200 = 1000 × 0.2 — salah mengira pecutan: a = (20-0)/10 = 2 m/s², bukan 0.2.",
                "20000 N": "Terbalik: F = 1000×2 = 2000, bukan 1000×20.",
                "200000 N": "Berlaku jika v dimasukkan terus sebagai pecutan — a = Δv/t, bukan v sahaja.",
            },
        },
    },
]

# ============================================================
# BAHASA MELAYU — F5 only (F4 already has 39 rows)
# ============================================================

BM_F5_ANCHORS = [
    {
        "topic": "Karangan Ekspositori", "form_level": 5,
        "mnemonic_lyrics": (
            "Pendahuluan nyatakan pendirian dengan jelas,\n"
            "Isi satu isi — huraian dan contoh tak lelas,\n"
            "Setiap perenggan ada topik dan huraian,\n"
            "Penutup simpulkan kembali perbincangan."
        ),
        "anchor_question": {
            "question_type": "mcq", "kbat_level": "Menilai",
            "illustrative_notes": (
                "Karangan ekspositori/huraian mesti ada: pendahuluan (pengenalan isu + pendirian), "
                "isi-isi utama (setiap isi = topik + huraian + contoh + penegasan), "
                "dan penutup (rumusan + harapan/cadangan). "
                "Setiap isi ditulis dalam perenggan berasingan."
            ),
            "question": (
                "Seorang pelajar menulis perenggan isi: "
                "'Remaja perlu menjaga kesihatan. Mereka boleh bersenam. Bersenam itu bagus.' "
                "Mengapakah perenggan ini LEMAH dari segi isi karangan?"
            ),
            "options": [
                "Perenggan terlalu pendek sahaja",
                "Tiada ayat topik yang jelas",
                "Isi tidak dihuraikan dengan contoh atau bukti yang spesifik, dan tidak ada penegasan",
                "Bahasa yang digunakan terlalu formal",
            ],
            "correct_answer": "Isi tidak dihuraikan dengan contoh atau bukti yang spesifik, dan tidak ada penegasan",
            "distractor_rationale": {
                "Perenggan terlalu pendek sahaja": "Panjang bukan ukuran kualiti — isi yang cetek tidak menjadi baik dengan dipanjangkan.",
                "Tiada ayat topik yang jelas": "'Remaja perlu menjaga kesihatan' ialah ayat topik — masalahnya ialah huraian dan contoh yang tiada.",
                "Bahasa yang digunakan terlalu formal": "Bahasa sasaran karangan SPM memang formal — ini bukan kelemahan.",
            },
        },
    },
    {
        "topic": "Rumusan", "form_level": 5,
        "mnemonic_lyrics": (
            "Isi penting — tangkap dari teks,\n"
            "Ayat sendiri — jangan salin teks,\n"
            "Pendapat sendiri dilarang sama sekali,\n"
            "120 patah kata — kira dan jaga teliti."
        ),
        "anchor_question": {
            "question_type": "mcq", "kbat_level": "Menganalisis",
            "illustrative_notes": (
                "Rumusan SPM: kenal pasti 6-8 isi penting dari petikan, "
                "tulis dalam ayat SENDIRI (parafrase), TIDAK masukkan pendapat, "
                "tidak melebihi 120 patah kata. "
                "Markah diberi untuk isi tepat DAN bahasa yang betul."
            ),
            "question": (
                "Petikan menyebut: 'Penggunaan plastik pakai-buang menyebabkan pencemaran laut yang serius.' "
                "Seorang pelajar merumuskan: 'Plastik pakai-buang menyebabkan pencemaran laut yang serius.' "
                "Mengapakah rumusan ini tidak mendapat markah penuh?"
            ),
            "options": [
                "Isi yang dipilih tidak tepat",
                "Pelajar menyalin ayat asal petikan tanpa memparafrasaikannya",
                "Ayat terlalu panjang untuk rumusan",
                "Pelajar memasukkan pendapat sendiri",
            ],
            "correct_answer": "Pelajar menyalin ayat asal petikan tanpa memparafrasaikannya",
            "distractor_rationale": {
                "Isi yang dipilih tidak tepat": "Isi adalah tepat — masalahnya adalah cara penyampaian (salin terus).",
                "Ayat terlalu panjang untuk rumusan": "Ayat ini pendek — panjang bukan isu di sini.",
                "Pelajar memasukkan pendapat sendiri": "Tiada unsur pendapat dalam ayat ini — isu utama ialah plagiat teks.",
            },
        },
    },
    {
        "topic": "Pemahaman Petikan F5", "form_level": 5,
        "mnemonic_lyrics": (
            "Baca soalan dulu, kemudian cari jawapan,\n"
            "Makna tersirat — fikir di luar perkataan,\n"
            "Bukti dalam teks sokong setiap jawapan,\n"
            "Ayat sendiri — markah lebih diberikan."
        ),
        "anchor_question": {
            "question_type": "mcq", "kbat_level": "Menilai",
            "illustrative_notes": (
                "Soalan pemahaman F5 kerap meminta makna tersirat, tujuan penulis, "
                "dan penilaian terhadap pendapat dalam teks. "
                "Jawab berdasarkan TEKS — elakkan andaian dari luar. "
                "Cari kata isyarat: 'namun', 'walau bagaimanapun', 'sebaliknya'."
            ),
            "question": (
                "Petikan menyebut: 'Walaupun teknologi memudahkan kehidupan, "
                "kita tidak seharusnya lupa bahawa hubungan manusia adalah asas kemasyarakatan.' "
                "Apakah TUJUAN UTAMA penulis menyertakan klausa pertama ('Walaupun teknologi...')?"
            ),
            "options": [
                "Untuk menunjukkan bahawa penulis menentang teknologi",
                "Untuk memberi konsesi sebelum menegaskan hujah utama tentang kepentingan hubungan manusia",
                "Untuk membuktikan bahawa teknologi lebih penting daripada hubungan manusia",
                "Untuk mengakui bahawa kemudahan hidup adalah matlamat utama masyarakat",
            ],
            "correct_answer": "Untuk memberi konsesi sebelum menegaskan hujah utama tentang kepentingan hubungan manusia",
            "distractor_rationale": {
                "Untuk menunjukkan bahawa penulis menentang teknologi": "Penulis mengakui manfaat teknologi — dia tidak menentangnya.",
                "Untuk membuktikan bahawa teknologi lebih penting daripada hubungan manusia": "Hujah utama adalah SEBALIKNYA — hubungan manusia ditekankan.",
                "Untuk mengakui bahawa kemudahan hidup adalah matlamat utama masyarakat": "Penulis tidak menyatakan kemudahan sebagai matlamat utama.",
            },
        },
    },
    {
        "topic": "Tatabahasa F5", "form_level": 5,
        "mnemonic_lyrics": (
            "Ayat pasif — objek ke hadapan, imbuhan 'di-' di muka,\n"
            "Kata hubung pilih yang tepat mengikut makna,\n"
            "Klausa komplemen ikut kata kerja tertentu,\n"
            "Tanda baca: koma, noktah — guna dengan tepat selalu."
        ),
        "anchor_question": {
            "question_type": "mcq", "kbat_level": "Mengaplikasi",
            "illustrative_notes": (
                "Ayat pasif: OBJEK + kata kerja pasif ('di-' + kata kerja) + 'oleh' + subjek asal. "
                "Kata hubung 'walaupun/meskipun' menunjukkan pertentangan. "
                "Kata hubung 'kerana/sebab' menunjukkan sebab. "
                "Klausa relatif: 'yang' digunakan untuk menerangkan kata nama."
            ),
            "question": (
                "Tukarkan ayat aktif ini kepada ayat pasif: "
                "'Guru besar mengumumkan keputusan peperiksaan itu.'"
            ),
            "options": [
                "Keputusan peperiksaan itu mengumumkan oleh guru besar.",
                "Keputusan peperiksaan itu diumumkan oleh guru besar.",
                "Guru besar telah diumumkan keputusan peperiksaan.",
                "Keputusan peperiksaan itu sudah diumumkan guru besar.",
            ],
            "correct_answer": "Keputusan peperiksaan itu diumumkan oleh guru besar.",
            "distractor_rationale": {
                "Keputusan peperiksaan itu mengumumkan oleh guru besar.": "Kata kerja 'mengumumkan' (aktif) tidak bertukar kepada bentuk pasif 'diumumkan'.",
                "Guru besar telah diumumkan keputusan peperiksaan.": "Subjek asal (guru besar) tidak boleh kekal di hadapan dalam ayat pasif — objek mesti di hadapan.",
                "Keputusan peperiksaan itu sudah diumumkan guru besar.": "Tanpa 'oleh', ayat ini kurang gramatis dalam konteks formal SPM.",
            },
        },
    },
    {
        "topic": "Komsas F5 - Novel & Drama", "form_level": 5,
        "mnemonic_lyrics": (
            "Novel: watak berkembang bab demi bab,\n"
            "Tema dan persoalan — tafsir dengan bijak,\n"
            "Drama: dialog dan arahan pentas bercantum,\n"
            "Nilai murni diambil — bukan sekadar diingat faham."
        ),
        "anchor_question": {
            "question_type": "mcq", "kbat_level": "Menilai",
            "illustrative_notes": (
                "Analisis Komsas: tema (mesej utama), persoalan (isu-isi yang dikemukakan), "
                "watak (protagonist/antagonis — sifat dan perkembangan), "
                "nilai murni (moral yang dipelajari), dan latar (masa, tempat, masyarakat). "
                "Sokongan dengan bukti teks (petikan) adalah WAJIB."
            ),
            "question": (
                "Dalam sebuah novel, watak utama awalnya bersifat mementingkan diri sendiri "
                "tetapi akhirnya berkorban untuk menyelamatkan rakan-rakannya. "
                "Apakah NILAI MURNI yang paling jelas dipamerkan oleh perkembangan watak ini?"
            ),
            "options": [
                "Keberanian",
                "Pengorbanan dan keikhlasan",
                "Kerajinan",
                "Kejujuran",
            ],
            "correct_answer": "Pengorbanan dan keikhlasan",
            "distractor_rationale": {
                "Keberanian": "Walaupun pengorbanan memerlukan keberanian, nilai UTAMA yang dipamerkan adalah sanggup berkorban demi orang lain.",
                "Kerajinan": "Kerajinan berkaitan dengan usaha dan kerja keras — bukan tema perkembangan watak ini.",
                "Kejujuran": "Kejujuran berkaitan dengan kebenaran — bukan yang ditekankan dalam perubahan watak dari mementingkan diri kepada berkorban.",
            },
        },
    },
]


def seed_batch(label, anchors, subject, language, form_level_field=True):
    print(f"\n── {label} ──")
    ok = fail = 0
    for a in anchors:
        topic = a["topic"]
        fl = a.get("form_level", 4)
        print(f"  F{fl} → {topic} ...", end=" ", flush=True)
        payload = {
            "subject":         subject,
            "topic":           topic,
            "language":        language,
            "form_level":      fl,
            "mnemonic_lyrics": a["mnemonic_lyrics"],
            "anchor_question": a["anchor_question"],
            "audio_url":       FALLBACK_AUDIO,
            "video_broll":     FALLBACK_VIDEO,
        }
        try:
            supabase.table("topic_anchors").upsert(
                payload, on_conflict="topic,language,form_level"
            ).execute()
            print("✓"); ok += 1
        except Exception as e:
            print(f"✗  {e}"); fail += 1
    print(f"  {ok} ok, {fail} failed")


def main():
    print("=" * 60)
    print("  SPM F4/F5 Anchor Seed — Math · Sains · BM F5")
    print("=" * 60)

    seed_batch("Mathematics F4 + F5 (English)",
               MATH_ANCHORS, subject="Mathematics", language="English")

    seed_batch("Sains F4 + F5 (Bahasa Melayu)",
               SAINS_ANCHORS, subject="Sains", language="Bahasa Melayu")

    seed_batch("Bahasa Melayu F5",
               BM_F5_ANCHORS, subject="Bahasa Melayu", language="Bahasa Melayu")

    print("\n" + "=" * 60)
    print("  All done.")


if __name__ == "__main__":
    main()
