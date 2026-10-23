// Display-only text clean-up for generated questions and feedback.
//
// Generated text sometimes contains LaTeX-ish markup ("f^{-1}(x)", "x^2", "\frac{a}{b}", "$...$") or an
// option that already starts with its own letter ("A) x = 2"). Phones showed it raw. This converts the
// common cases to Unicode (x², f⁻¹(x), a/b, √) WITHOUT changing the underlying data: the text that is
// submitted as the answer must stay exactly what the server stored, so only call these when rendering.

const SUP: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "−": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ", x: "ˣ", y: "ʸ", a: "ᵃ", b: "ᵇ",
  c: "ᶜ", k: "ᵏ", m: "ᵐ", t: "ᵗ", T: "ᵀ",
};
const SUB: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "−": "₋", "=": "₌", "(": "₍", ")": "₎", n: "ₙ", i: "ᵢ", x: "ₓ", a: "ₐ", e: "ₑ", o: "ₒ",
  m: "ₘ", k: "ₖ", t: "ₜ",
};

const COMMANDS: [RegExp, string][] = [
  [/\\times\b/g, "×"], [/\\div\b/g, "÷"], [/\\pm\b/g, "±"], [/\\cdot\b/g, "·"],
  [/\\leq?\b/g, "≤"], [/\\geq?\b/g, "≥"], [/\\neq\b/g, "≠"], [/\\approx\b/g, "≈"],
  [/\\pi\b/g, "π"], [/\\theta\b/g, "θ"], [/\\alpha\b/g, "α"], [/\\beta\b/g, "β"], [/\\Delta\b/g, "Δ"],
  [/\\lambda\b/g, "λ"], [/\\mu\b/g, "μ"], [/\\omega\b/g, "ω"], [/\\Omega\b/g, "Ω"], [/\\infty\b/g, "∞"],
  [/\\circ\b/g, "°"], [/\\degree\b/g, "°"], [/\\(?:rightarrow|to)\b/g, "→"], [/\\therefore\b/g, "∴"],
];

function mapAll(s: string, table: Record<string, string>): string | null {
  let out = "";
  for (const ch of s) {
    const m = table[ch];
    if (!m) return null;
    out += m;
  }
  return out;
}

const isSimple = (s: string) => /^[A-Za-z0-9.]+$/.test(s);

export function formatMath(input: string | null | undefined): string {
  if (!input) return input ?? "";
  let t = input;

  // $...$ / $$...$$ that really holds markup (not "RM5 and $10"): unwrap.
  t = t.replace(/\$\$?([^$\n]{1,120})\$\$?/g, (m, inner: string) => (/[\\^_{}]/.test(inner) ? inner : m));

  t = t.replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, (_m, a: string, b: string) =>
    `${isSimple(a) ? a : `(${a})`}/${isSimple(b) ? b : `(${b})`}`);
  t = t.replace(/\\sqrt\s*\{([^{}]+)\}/g, (_m, a: string) => (isSimple(a) ? `√${a}` : `√(${a})`));
  for (const [re, rep] of COMMANDS) t = t.replace(re, rep);

  // Superscripts: x^{-1}, x^2, x^n  (only when every character has a Unicode form)
  t = t.replace(/\^\{([^{}]+)\}/g, (m, e: string) => mapAll(e, SUP) ?? m);
  t = t.replace(/\^(-?[0-9]+|[nxyabckmtT])(?![A-Za-z0-9])/g, (m, e: string) => mapAll(e, SUP) ?? m);
  // Subscripts after a letter/digit/paren: a_n, x_{1}, H_2 O (not snake_case words)
  t = t.replace(/(?<=[A-Za-z0-9)])_\{([^{}]+)\}/g, (m, e: string) => mapAll(e, SUB) ?? m);
  t = t.replace(/(?<=[A-Za-z0-9)])_([0-9]+)/g, (m, e: string) => mapAll(e, SUB) ?? m);
  t = t.replace(/(?<=[A-Za-z0-9)])_([nixaeomkt])(?![A-Za-z0-9])/g, (m, e: string) => mapAll(e, SUB) ?? m);

  // Stray braces left over from {…} groups
  t = t.replace(/\{([^{}]*)\}/g, "$1");
  return t;
}

/** "A) x = 2" -> "x = 2". The exam card/option button already shows the letter. Display only. */
export function cleanOption(text: string | null | undefined): string {
  return (text ?? "").replace(/^\s*\(?[A-Da-d][).:]{1,2}\s+/, "");
}

/** Convenience: strip a baked-in option letter, then format maths. */
export const displayOption = (text: string | null | undefined) => formatMath(cleanOption(text));
