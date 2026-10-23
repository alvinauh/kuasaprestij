// KBAT (Bloom) level labels. The server stores the Malay name ("Menganalisis"); an English or Chinese UI
// should not show it untranslated. Unknown levels pass through unchanged.
const LEVELS: Record<string, { en: string; zh: string }> = {
  mengingat: { en: "Remember · C1", zh: "记忆 · C1" },
  memahami: { en: "Understand · C2", zh: "理解 · C2" },
  mengaplikasi: { en: "Apply · C3", zh: "应用 · C3" },
  menganalisis: { en: "Analyse · C4", zh: "分析 · C4" },
  menilai: { en: "Evaluate · C5", zh: "评价 · C5" },
  mencipta: { en: "Create · C6", zh: "创造 · C6" },
};

export function kbatLabel(level: string | null | undefined, lang: string): string {
  if (!level) return "";
  if (lang === "ms") return level;
  const hit = LEVELS[level.trim().toLowerCase()];
  return hit ? hit[lang === "zh" ? "zh" : "en"] : level;
}

/** An object-lesson hook that would render as junk (a dict/list printed as text, a placeholder) is hidden. */
export function usableHook(text: string | null | undefined): string | null {
  const t = (text ?? "").trim();
  if (t.length < 40 || t[0] === "{" || t[0] === "[") return null;
  return t;
}
