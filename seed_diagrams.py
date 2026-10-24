"""
seed_diagrams.py — Generate SVG diagrams for cached topic_anchors.

Palette matches the app's dark purple/neon theme (styles.css):
  #1a1625  dark background  (oklch 0.16 0.02 280)
  #2d2853  card surface     (oklch 0.20 0.025 280)
  #8b5cf6  primary purple   (oklch 0.65 0.24 295)
  #4ade80  neon green       (oklch 0.78 0.24 145)
  #60a5fa  neon blue        (oklch 0.70 0.22 240)
  #e8e3ff  near-white text  (oklch 0.93 0.03 280)

A post-processor snaps any stray LLM colours to the nearest palette entry
so every diagram looks consistent regardless of which LLM generated it.

Usage:
    python seed_diagrams.py              # only missing diagrams
    python seed_diagrams.py --force      # regenerate all
    python seed_diagrams.py --subject Physics
    python seed_diagrams.py --dry-run
"""

import os, sys, re, math
from datetime import datetime
from supabase import create_client
from agents.llm_client import call_llm

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]

# ── Palette ──────────────────────────────────────────────────────────────────
# SVGs use NO background fill — the frontend card/container provides it.
# Only accent colours are baked in, so diagrams look correct on any theme
# (dark purple OR a future light theme) without regeneration.
PALETTE_HEX = [
    "#8b5cf6",  # primary purple  — borders, arrows, headers
    "#4ade80",  # neon green       — key labels, highlights
    "#60a5fa",  # neon blue        — connectors, sub-labels
    "#e8e3ff",  # near-white       — text on dark bg
    "#1e1625",  # near-black       — text/stroke on light bg
    "#2d2853",  # dark node fill   — box backgrounds (semi-transparent in SVG context)
]

# Pre-compute palette as (r, g, b) tuples for colour-snapping
def _hex_to_rgb(h):
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

_PALETTE_RGB = [_hex_to_rgb(h) for h in PALETTE_HEX]

def _nearest_palette(hex_color):
    """Return the palette hex closest (Euclidean RGB distance) to hex_color."""
    try:
        r, g, b = _hex_to_rgb(hex_color)
    except Exception:
        return PALETTE_HEX[5]  # fall back to near-white
    best, best_d = PALETTE_HEX[0], float("inf")
    for ph, (pr, pg, pb) in zip(PALETTE_HEX, _PALETTE_RGB):
        d = math.sqrt((r-pr)**2 + (g-pg)**2 + (b-pb)**2)
        if d < best_d:
            best, best_d = ph, d
    return best

# Named colour substitutions — white/black map to the readable palette entries.
# "none" and "transparent" are preserved so box fills can be skipped intentionally.
_NAMED = {
    "white":   "#e8e3ff",
    "black":   "#2d2853",
    "#fff":    "#e8e3ff",
    "#000":    "#2d2853",
    "#ffffff": "#e8e3ff",
    "#000000": "#2d2853",
    "none":        "none",
    "transparent": "transparent",
}

_HEX_RE = re.compile(r'#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b')

def _snap_color(m):
    val = m.group(0).lower()
    return _nearest_palette(val)

def enforce_palette(svg: str) -> str:
    """Replace all hex colours in the SVG with the nearest palette entry."""
    # Named colours first
    for name, repl in _NAMED.items():
        svg = re.sub(rf'(?<!["\w]){re.escape(name)}(?!["\w])', repl, svg, flags=re.IGNORECASE)
    # Hex colours
    svg = _HEX_RE.sub(_snap_color, svg)
    return svg

# ── Subject style hints ──────────────────────────────────────────────────────
SUBJECT_HINTS = {
    "Physics":                "circuit, ray, force-arrow, or wave diagram",
    "Biology":                "labelled cell, organ system, or life-cycle diagram",
    "Chemistry":              "molecular structure, electrolytic cell, or reaction pathway",
    "Additional Mathematics": "graph with labelled axes, asymptotes, and key points",
    "Mathematics":            "geometric shape or graph with clearly labelled measurements",
    "Science":                "labelled apparatus or step-by-step process diagram",
    "Sejarah":                "chronological timeline or cause-effect flow chart",
    "Geografi":               "cross-section, contour map feature, or water-cycle diagram",
    "Bahasa Melayu":          "text-structure scaffold or KOMSAS element concept map",
    "Bahasa Inggeris":        "genre-structure scaffold or vocabulary web",
    "Pendidikan Moral":       "concept map linking the value to real-life contexts",
    "Prinsip Perakaunan":     "T-account, trial balance layout, or accounting equation",
    "Kimia":                  "molecular structure, electrolytic cell, or reaction pathway",
    "Fizik":                  "circuit, ray, force-arrow, or wave diagram",
    "Biologi":                "labelled cell, organ system, or life-cycle diagram",
}
DEFAULT_HINT = "key concept or process diagram"

SVG_PROMPT = """\
Draw a clean educational SVG diagram for Malaysian SPM students studying {subject} (Form {form_level}).

Topic: {topic}
Diagram style: {hint}

Design rules — follow these EXACTLY:
- viewBox="0 0 520 360"
- NO background rectangle — the diagram is transparent so it works on any theme
- ONLY use these 5 hex colours (no others, no rgb(), no hsl(), no named colours):
    #8b5cf6  borders, box outlines, arrows, section headers
    #4ade80  key term labels, highlighted nodes, important values
    #60a5fa  connectors, secondary labels, sub-steps
    #e8e3ff  all body text and descriptions
    #2d2853  fill for boxes and node backgrounds (dark purple)
- Font: font-family="Arial, sans-serif" font-size between 11 and 14
- Stroke width 1.5–2 for lines and box borders
- Keep it simple: 5–10 elements maximum
- Output ONLY the SVG markup, starting with <svg and ending with </svg>
- No markdown, no explanation, no code fences"""


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def call_claude(prompt):
    try:
        response = call_llm(prompt, max_tokens=4096)
        text = response.text
        if not text:
            log("  Provider returned empty response")
            return None
        return text.strip()
    except RuntimeError as e:
        log(f"  All providers failed: {e}")
        return None
    except Exception as e:
        log(f"  Unexpected error: {e}")
        return None


def extract_svg(raw):
    match = re.search(r'(<svg[\s\S]*?</svg>)', raw, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    # LLM hit token limit and truncated — patch closing tag
    start = re.search(r'(<svg[\s\S]+)', raw, re.IGNORECASE)
    if start:
        return start.group(1).strip() + "\n</svg>"
    return None


def main():
    force          = "--force"   in sys.argv
    dry_run        = "--dry-run" in sys.argv
    subject_filter = None
    if "--subject" in sys.argv:
        idx = sys.argv.index("--subject")
        if idx + 1 < len(sys.argv):
            subject_filter = sys.argv[idx + 1]

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    query = supabase.table("topic_anchors").select("id,subject,topic,language,form_level")
    if subject_filter:
        query = query.eq("subject", subject_filter)
    if not force:
        query = query.is_("diagram_svg", "null")
    rows = query.execute().data or []

    if not rows:
        log("Nothing to do — all diagrams seeded. Use --force to regenerate.")
        return

    total = len(rows)
    log(f"Seeding {total} diagram(s)" + (f" [{subject_filter}]" if subject_filter else "") + (" [DRY RUN]" if dry_run else ""))

    ok = fail = 0
    for i, row in enumerate(rows, 1):
        subject = row.get("subject", "")
        topic   = row.get("topic", "")
        form    = row.get("form_level", 4)
        lang    = row.get("language", "")
        log(f"[{i}/{total}] {subject} / {topic} / F{form} / {lang}")

        prompt = SVG_PROMPT.format(
            subject=subject,
            form_level=form,
            topic=topic,
            hint=SUBJECT_HINTS.get(subject, DEFAULT_HINT),
        )

        if dry_run:
            print(prompt)
            continue

        raw = call_claude(prompt)
        if not raw:
            log("  SKIP — provider returned nothing")
            fail += 1
            continue

        svg = extract_svg(raw)
        if not svg:
            log(f"  SKIP — no <svg> found (got: {raw[:80]!r})")
            fail += 1
            continue

        # Enforce palette: snap any stray colours to the nearest theme entry
        svg = enforce_palette(svg)

        try:
            supabase.table("topic_anchors").update({"diagram_svg": svg}).eq("id", row["id"]).execute()
            log(f"  OK — {len(svg)} chars")
            ok += 1
        except Exception as e:
            log(f"  DB error: {e}")
            fail += 1

    log(f"Done. {ok} OK, {fail} failed out of {total}.")


if __name__ == "__main__":
    main()
