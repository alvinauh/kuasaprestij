import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { Lang } from "@/lib/i18n";

export type ThemeKey = "purple" | "blue" | "green" | "orange" | "red";
export type FontSize = "sm" | "md" | "lg";
export type ExamFont = "serif" | "sans";
export type PaperColour = "white" | "cream" | "blue";
export type LineStyle = "ruled" | "plain" | "graph";

export interface ExamPrefs {
  font: ExamFont;
  paperColour: PaperColour;
  showMarks: boolean;
  lineStyle: LineStyle;
  bilingualLabels: boolean;
}

/**
 * Comfort & accessibility accommodations. These are NEUTRAL, user/teacher-toggleable
 * preferences — never a diagnosis the app infers. All default OFF so adding them changes
 * no existing behaviour (Phase A). Later phases wire each flag into the feed / games /
 * question generator. See SPECIAL_NEEDS_PLAN.md / SPECIAL_NEEDS_RESEARCH.md.
 */
export interface AccommodationPrefs {
  reduce_motion: boolean;       // fewer animations / no screen-shake or particles
  high_contrast: boolean;       // higher-contrast, calmer colours
  dyslexia_font: boolean;       // dyslexia-friendly typeface + wider spacing
  read_aloud: boolean;          // read questions & options aloud (edge-tts)
  focus_mode: boolean;          // one thing on screen at a time, fewer distractions
  extended_time: boolean;       // remove countdowns / extra time
  no_timed_games: boolean;      // skip timed arcade games; use a calm reinforcement instead
  break_reminders: boolean;     // suggest a short break every so often
  simplified_language: boolean; // shorter, plainer question wording
  worked_example_first: boolean;// show a worked example before harder questions
}

/** Condition-derived pacing (set by a teacher via /derive_accommodations). Read-only on the
 * student side; the assessment engine + client honour it. Defaults = current app behaviour. */
export interface PaceProfile {
  session_length: number;                              // questions before a suggested break
  break_cadence: number;                               // suggest a break every N (0 = off)
  difficulty_ramp: "gentle" | "normal" | "fast";
  time_limits: "off" | "extended" | "normal";
  feedback_style: "instant" | "paused_explanation";
}

export interface StudentPrefs {
  avatar: string;
  theme: ThemeKey;
  fontSize: FontSize;
  soundOn: boolean;
  examMode: boolean;
  examPrefs: ExamPrefs;
  banner: string;
  lang: Lang;
  accommodations: AccommodationPrefs;
  pace_profile: PaceProfile;
}

const DEFAULT_EXAM_PREFS: ExamPrefs = {
  font: "serif",
  paperColour: "white",
  showMarks: true,
  lineStyle: "ruled",
  bilingualLabels: true,
};

export const DEFAULT_ACCOMMODATIONS: AccommodationPrefs = {
  reduce_motion: false,
  high_contrast: false,
  dyslexia_font: false,
  read_aloud: false,
  focus_mode: false,
  extended_time: false,
  no_timed_games: false,
  break_reminders: false,
  simplified_language: false,
  worked_example_first: false,
};

export const DEFAULT_PACE_PROFILE: PaceProfile = {
  session_length: 10,
  break_cadence: 0,
  difficulty_ramp: "normal",
  time_limits: "normal",
  feedback_style: "instant",
};

const DEFAULT: StudentPrefs = {
  avatar: "🎓",
  theme: "purple",
  fontSize: "md",
  soundOn: true,
  examMode: false,
  examPrefs: DEFAULT_EXAM_PREFS,
  banner: "galaxy",
  lang: "en",
  accommodations: DEFAULT_ACCOMMODATIONS,
  pace_profile: DEFAULT_PACE_PROFILE,
};

/**
 * Presentation metadata for the accommodation toggles — shared by the student settings
 * sheet and the teacher's per-student editor so both stay in sync. Neutral labels only.
 */
export const ACCOMMODATION_GROUPS: {
  group: string;
  items: { key: keyof AccommodationPrefs; label: string; hint: string }[];
}[] = [
  {
    group: "Display",
    items: [
      { key: "reduce_motion", label: "Reduce motion", hint: "Fewer animations and effects" },
      { key: "high_contrast", label: "High contrast", hint: "Calmer, higher-contrast colours" },
      { key: "dyslexia_font", label: "Easy-reading font", hint: "Clearer letters and spacing" },
    ],
  },
  {
    group: "Reading & questions",
    items: [
      { key: "read_aloud", label: "Read aloud", hint: "Hear the question and answers" },
      { key: "simplified_language", label: "Simpler wording", hint: "Shorter, plainer questions" },
      { key: "worked_example_first", label: "Show an example first", hint: "See a worked example before hard questions" },
    ],
  },
  {
    group: "Pacing & focus",
    items: [
      { key: "focus_mode", label: "Focus mode", hint: "One thing on screen at a time" },
      { key: "extended_time", label: "Extra time", hint: "Remove countdowns and timers" },
      { key: "no_timed_games", label: "Skip timed games", hint: "Use a calm activity instead" },
      { key: "break_reminders", label: "Break reminders", hint: "Suggest a short break now and then" },
    ],
  },
];

const STORAGE_KEY = "kp_prefs";

export const THEMES: Record<ThemeKey, Record<string, string>> = {
  purple: {
    "--primary": "oklch(0.65 0.24 295)",
    "--primary-glow": "oklch(0.72 0.22 285)",
    "--ring": "oklch(0.65 0.24 295)",
    "--gradient-primary": "linear-gradient(135deg, oklch(0.65 0.24 295), oklch(0.70 0.22 240))",
    "--shadow-glow": "0 0 32px oklch(0.65 0.24 295 / 0.45)",
  },
  blue: {
    "--primary": "oklch(0.62 0.22 240)",
    "--primary-glow": "oklch(0.70 0.20 235)",
    "--ring": "oklch(0.62 0.22 240)",
    "--gradient-primary": "linear-gradient(135deg, oklch(0.62 0.22 240), oklch(0.65 0.20 220))",
    "--shadow-glow": "0 0 32px oklch(0.62 0.22 240 / 0.45)",
  },
  green: {
    "--primary": "oklch(0.62 0.22 145)",
    "--primary-glow": "oklch(0.70 0.20 150)",
    "--ring": "oklch(0.62 0.22 145)",
    "--gradient-primary": "linear-gradient(135deg, oklch(0.62 0.22 145), oklch(0.68 0.18 160))",
    "--shadow-glow": "0 0 32px oklch(0.62 0.22 145 / 0.45)",
  },
  orange: {
    "--primary": "oklch(0.68 0.20 55)",
    "--primary-glow": "oklch(0.74 0.18 60)",
    "--ring": "oklch(0.68 0.20 55)",
    "--gradient-primary": "linear-gradient(135deg, oklch(0.68 0.20 55), oklch(0.65 0.22 30))",
    "--shadow-glow": "0 0 32px oklch(0.68 0.20 55 / 0.45)",
  },
  red: {
    "--primary": "oklch(0.62 0.24 20)",
    "--primary-glow": "oklch(0.70 0.22 25)",
    "--ring": "oklch(0.62 0.24 20)",
    "--gradient-primary": "linear-gradient(135deg, oklch(0.62 0.24 20), oklch(0.60 0.20 0))",
    "--shadow-glow": "0 0 32px oklch(0.62 0.24 20 / 0.45)",
  },
};

export const FONT_SIZE_CLASS: Record<FontSize, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg",
};

export const AVATARS = [
  "🎓", "🦁", "🐯", "🦊", "🐺", "🦅",
  "⚡", "🔥", "🌟", "💎", "🚀", "🎯",
  "🐼", "🐨", "🦉", "🦋", "🐬", "🦈",
  "🐸", "🐙", "🦄", "🐲", "🤖", "👾",
  "🧙", "🦸", "🌺", "🎮", "🏆", "🎨",
];

export const BANNERS: { key: string; label: string; gradient: string }[] = [
  { key: "galaxy",  label: "Galaxy",  gradient: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)" },
  { key: "ocean",   label: "Ocean",   gradient: "linear-gradient(135deg, #1a6dff 0%, #00c6fb 100%)" },
  { key: "forest",  label: "Forest",  gradient: "linear-gradient(135deg, #134e5e, #71b280)" },
  { key: "sunset",  label: "Sunset",  gradient: "linear-gradient(135deg, #f7971e, #ffd200)" },
  { key: "fire",    label: "Fire",    gradient: "linear-gradient(135deg, #f12711, #f5af19)" },
  { key: "sakura",  label: "Sakura",  gradient: "linear-gradient(135deg, #f8c0c0, #e886a9)" },
  { key: "royal",   label: "Royal",   gradient: "linear-gradient(135deg, #141e30, #243b55)" },
  { key: "aurora",  label: "Aurora",  gradient: "linear-gradient(135deg, #00c9ff, #92fe9d)" },
  { key: "dusk",    label: "Dusk",    gradient: "linear-gradient(135deg, #2c3e50, #fd746c)" },
  { key: "jade",    label: "Jade",    gradient: "linear-gradient(135deg, #11998e, #38ef7d)" },
];

function readFromStorage(): StudentPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<StudentPrefs>;
    return {
      ...DEFAULT,
      ...parsed,
      // nested objects: always fill missing keys from defaults
      accommodations: { ...DEFAULT_ACCOMMODATIONS, ...(parsed.accommodations ?? {}) },
      pace_profile: { ...DEFAULT_PACE_PROFILE, ...(parsed.pace_profile ?? {}) },
    };
  } catch {
    return DEFAULT;
  }
}

export function useStudentPrefs() {
  const [prefs, setPrefs] = useState<StudentPrefs>(readFromStorage);
  const userIdRef = useRef<string | null>(null);

  // On mount: resolve user id, then merge DB prefs over localStorage
  useEffect(() => {
    let cancelled = false;

    async function loadFromDb() {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled || !user) return;

      userIdRef.current = user.id;

      const { data, error } = await supabase
        .from("profiles")
        .select("preferences")
        .eq("id", user.id)
        .maybeSingle();

      if (cancelled || error || !data?.preferences) return;

      // DB wins for avatar / theme / banner; merge over localStorage values
      const dbPrefs = data.preferences as Partial<StudentPrefs>;
      setPrefs((prev) => {
        const merged: StudentPrefs = {
          ...prev,
          ...dbPrefs,
          accommodations: {
            ...DEFAULT_ACCOMMODATIONS,
            ...prev.accommodations,
            ...(dbPrefs.accommodations ?? {}),
          },
          pace_profile: {
            ...DEFAULT_PACE_PROFILE,
            ...prev.pace_profile,
            ...(dbPrefs.pace_profile ?? {}),
          },
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        return merged;
      });
    }

    loadFromDb();
    return () => { cancelled = true; };
  }, []);

  // Apply CSS variables whenever theme changes
  useEffect(() => {
    const vars = THEMES[prefs.theme];
    const root = document.documentElement;
    Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
  }, [prefs.theme]);

  // Apply sensory/presentation accommodations globally via <html> classes + a data flag
  // (gameKit reads data-reduce-motion to skip particles/shake). See styles.css.
  useEffect(() => {
    const a = prefs.accommodations;
    const root = document.documentElement;
    root.classList.toggle("reduce-motion", !!a.reduce_motion);
    root.classList.toggle("high-contrast", !!a.high_contrast);
    root.classList.toggle("dyslexia-font", !!a.dyslexia_font);
    root.classList.toggle("focus-mode", !!a.focus_mode);
    if (a.reduce_motion) root.dataset.reduceMotion = "1";
    else delete root.dataset.reduceMotion;
  }, [
    prefs.accommodations.reduce_motion,
    prefs.accommodations.high_contrast,
    prefs.accommodations.dyslexia_font,
    prefs.accommodations.focus_mode,
  ]);

  const save = (next: Partial<StudentPrefs>) => {
    setPrefs((prev) => {
      const merged: StudentPrefs = { ...prev, ...next };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));

      // Fire-and-forget upsert to Supabase — don't block the UI
      const userId = userIdRef.current;
      if (userId) {
        supabase
          .from("profiles")
          .upsert({ id: userId, preferences: merged as unknown as Json }, { onConflict: "id" })
          .then(() => { /* intentionally ignored */ });
      }

      return merged;
    });
  };

  const setAccommodation = (key: keyof AccommodationPrefs, value: boolean) => {
    setPrefs((prev) => {
      const accommodations = { ...prev.accommodations, [key]: value };
      const merged: StudentPrefs = { ...prev, accommodations };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      const userId = userIdRef.current;
      if (userId) {
        supabase
          .from("profiles")
          .upsert({ id: userId, preferences: merged as unknown as Json }, { onConflict: "id" })
          .then(() => { /* intentionally ignored */ });
      }
      return merged;
    });
  };

  return { prefs, save, setAccommodation };
}
