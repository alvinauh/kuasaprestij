import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo } from "react";
import { Flame } from "lucide-react";
import { useI18n, type Lang } from "@/lib/i18n";
import { SparkMascot } from "./SparkMascot";

/**
 * Duolingo-style pop-up: Percik springs up from the bottom-left corner,
 * lands with a squash, and says something in a speech bubble.
 *
 *   kind "correct"  → thumbs-up + short praise
 *   kind "streak"   → two-arm cheer + flame badge with the streak count
 *   kind "mastered" → cheer + "topic mastered"
 *
 * Pass a fresh `id` per event so repeated events retrigger the entrance.
 */
export type SparkEvent = {
  id: number;
  kind: "correct" | "streak" | "mastered";
  streak?: number;
};

const PRAISE: Record<Lang, string[]> = {
  en: ["Nice one!", "You got it!", "Bright idea!", "Great thinking!", "Spot on!"],
  ms: ["Bagus!", "Tepat sekali!", "Idea bernas!", "Hebat!", "Betul!"],
  zh: ["答对了！", "太棒了！", "好主意！", "真聪明！", "完全正确！"],
};

const STREAK: Record<Lang, (n: number) => [string, string]> = {
  en: (n) => [`${n} in a row!`, n >= 10 ? "Unstoppable!" : "You're on fire!"],
  ms: (n) => [`${n} berturut-turut!`, n >= 10 ? "Tak dapat dihalang!" : "Teruskan!"],
  zh: (n) => [`连对 ${n} 题！`, n >= 10 ? "势不可挡！" : "火力全开！"],
};

const MASTERED: Record<Lang, [string, string]> = {
  en: ["Topic mastered!", "That's a big brain move."],
  ms: ["Topik dikuasai!", "Otak geliga!"],
  zh: ["主题已掌握！", "太厉害了！"],
};

/** Streak counts that earn a celebration (then every 5 after 20). */
export function isStreakMilestone(n: number): boolean {
  return n === 3 || n === 5 || n === 10 || n === 15 || n === 20 || (n > 20 && n % 5 === 0);
}

export function SparkCelebration({
  event,
  onDone,
  duration = 2200,
}: {
  event: SparkEvent | null;
  onDone: () => void;
  duration?: number;
}) {
  const { lang } = useI18n();
  const still = !!useReducedMotion();

  useEffect(() => {
    if (!event) return;
    const t = setTimeout(onDone, event.kind === "correct" ? duration : duration + 600);
    return () => clearTimeout(t);
    // onDone identity is irrelevant; only a new event restarts the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id]);

  const copy = useMemo<[string, string | null]>(() => {
    if (!event) return ["", null];
    if (event.kind === "streak") return STREAK[lang](event.streak ?? 0);
    if (event.kind === "mastered") return MASTERED[lang];
    const list = PRAISE[lang];
    return [list[event.id % list.length], null];
  }, [event, lang]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[95] flex justify-start px-3 pb-[max(env(safe-area-inset-bottom),12px)] sm:px-6">
      <AnimatePresence>
        {event && (
          <motion.div
            key={event.id}
            className="flex items-end gap-1"
            initial={still ? { opacity: 0 } : { y: 220, opacity: 1 }}
            animate={still ? { opacity: 1 } : { y: 0, opacity: 1 }}
            exit={still ? { opacity: 0 } : { y: 240, transition: { duration: 0.28, ease: [0.5, 0, 0.75, 0] } }}
            transition={{ type: "spring", stiffness: 420, damping: 22 }}
          >
            <SparkMascot
              pose={event.kind === "correct" ? "thumbsUp" : "cheer"}
              className="h-auto w-[104px] shrink-0 sm:w-[136px]"
            />

            <motion.div
              className="relative mb-[88px] max-w-[60vw] sm:mb-[112px]"
              initial={still ? false : { scale: 0, x: -20 }}
              animate={{ scale: 1, x: 0 }}
              transition={{ type: "spring", stiffness: 600, damping: 18, delay: still ? 0 : 0.18 }}
              style={{ transformOrigin: "0% 100%" }}
            >
              <div className="rounded-2xl border-2 border-[#E5E5E5] border-b-[5px] bg-white px-4 py-2.5 text-[#3C3C3C] shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
                <div className="flex items-center gap-2">
                  {event.kind === "streak" && (
                    <motion.span
                      className="flex items-center gap-0.5 rounded-full bg-gradient-to-b from-[#FFB020] to-[#FF7A1A] px-2 py-0.5 text-sm font-extrabold text-white"
                      initial={still ? false : { scale: 0, rotate: -20 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 700, damping: 12, delay: 0.35 }}
                    >
                      <Flame className="h-4 w-4 fill-current" />
                      {event.streak}
                    </motion.span>
                  )}
                  <span className="font-display text-lg font-extrabold leading-tight sm:text-xl">{copy[0]}</span>
                </div>
                {copy[1] && <div className="mt-0.5 text-sm font-semibold text-[#777]">{copy[1]}</div>}
              </div>
              {/* Bubble tail pointing at Percik */}
              <svg
                className="absolute -left-[13px] bottom-4"
                width="16"
                height="20"
                viewBox="0 0 16 20"
                aria-hidden
              >
                <path d="M16 0 L0 14 L16 18 Z" fill="#E5E5E5" />
                <path d="M16 3 L4 13 L16 15 Z" fill="#fff" />
              </svg>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
