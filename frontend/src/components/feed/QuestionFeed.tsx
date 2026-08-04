import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { Loader2 } from "lucide-react";
import { startSession, type QuestionType, type SessionResponse } from "@/services/api";
import { StreakMeter } from "./StreakMeter";
import { XpBar } from "./XpBar";
import { MasteryBar } from "./MasteryBar";
import { QuestionSlide, type SlideResult } from "./QuestionSlide";
import { PenaltyGameModal } from "@/components/PenaltyGameModal";
import { WritingGameModal } from "@/components/WritingGameModal";
import { PlayModeGame } from "@/components/games/PlayModeGame";
import { LoadingGame } from "@/components/LoadingGame";
import type { GameChallenge } from "@/components/games/CatchStarsGame";
import { isWritingComposition } from "@/components/games/writing";

interface FeedSlide {
  key: string;
  session: SessionResponse;
}

interface QuestionFeedProps {
  seed: SessionResponse;
  studentId: string;
  subject: string;
  topic: string;
  apiLang: string;
  lang: string;
  formLevel: number;
  questionType: QuestionType;
  timerEnabled: boolean;
  headerRight?: ReactNode;
  onOpenTutor: (sessionId?: string) => void;
}

function isRateLimited(s: SessionResponse): boolean {
  const q = s.question ?? "";
  return q.includes("API Rate Limit") || !q.trim();
}

// Streaks survive a reload (per student, this device) so a refresh mid-run
// doesn't wipe the combo. Cross-device sync is a backend follow-up.
function readStoredStreak(key: string): number {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

export function QuestionFeed({
  seed, studentId, subject, topic, apiLang, lang, formLevel, questionType, timerEnabled,
  headerRight, onOpenTutor,
}: QuestionFeedProps) {
  const streakKey = `kp_streak_${studentId}`;
  const bestKey = `kp_beststreak_${studentId}`;
  const [slides, setSlides] = useState<FeedSlide[]>([{ key: "seed", session: seed }]);
  const [current, setCurrent] = useState(0);
  const [streak, setStreak] = useState<number>(() => readStoredStreak(streakKey));
  const [bestStreak, setBestStreak] = useState<number>(() => readStoredStreak(bestKey));
  const [xp, setXp] = useState(0);
  const [score, setScore] = useState(0);
  const [mastery, setMastery] = useState<number | null>(
    typeof seed.mastery_score === "number" ? seed.mastery_score : null,
  );
  const [penalty, setPenalty] = useState<{
    open: boolean;
    sessionId?: string;
    challenge?: GameChallenge | null;
    topic?: string;
    subject?: string;
  }>({ open: false });
  // Composition penalties (essays have no correct-letter) run a writing-native game.
  const [writingPenalty, setWritingPenalty] = useState<{
    open: boolean;
    sessionId?: string;
    topic?: string;
    subject?: string;
  }>({ open: false });
  // A triggered penalty is held here (not auto-opened) until the student taps to
  // play — so the graded feedback stays readable first. Scoped to the slide it
  // belongs to via slideIndex, so it never leaks onto a later slide.
  const [pending, setPending] = useState<
    | { slideIndex: number; kind: "mcq"; sessionId?: string; challenge?: GameChallenge | null; topic?: string; subject?: string }
    | { slideIndex: number; kind: "writing"; sessionId?: string; topic?: string; subject?: string }
    | null
  >(null);
  const [mode, setMode] = useState<"read" | "play">("read");
  const seqRef = useRef(0);
  const loadingRef = useRef(false);

  const [emblaRef, embla] = useEmblaCarousel({ axis: "y", loop: false, align: "start", dragFree: false });

  const fetchNext = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      // Up to 2 attempts to skip a transient rate-limited payload.
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await startSession(studentId, topic, "KSSM", apiLang, subject, undefined, true, questionType, formLevel);
        if (!isRateLimited(res)) {
          seqRef.current += 1;
          setSlides((prev) => [...prev, { key: `q${seqRef.current}`, session: res }]);
          return;
        }
      }
    } catch {
      /* swallow — feed stays on current slide, user can retry by swiping */
    } finally {
      loadingRef.current = false;
    }
  }, [studentId, topic, apiLang, subject, questionType, formLevel]);

  // Track the active slide + prefetch when near the end.
  useEffect(() => {
    if (!embla) return;
    const onSelect = () => {
      const idx = embla.selectedScrollSnap();
      setCurrent(idx);
      if (idx >= slides.length - 2) void fetchNext();
    };
    embla.on("select", onSelect);
    onSelect();
    return () => { embla.off("select", onSelect); };
  }, [embla, slides.length, fetchNext]);

  // Re-init embla when slides are appended so it registers the new snap points.
  useEffect(() => { embla?.reInit(); }, [embla, slides.length]);

  // Ensure at least one lookahead question is ready on mount.
  useEffect(() => { if (slides.length < 2) void fetchNext(); /* eslint-disable-next-line */ }, []);

  // Persist the running streak + personal best across reloads.
  useEffect(() => {
    try { localStorage.setItem(streakKey, String(streak)); } catch { /* storage disabled */ }
    setBestStreak((b) => (streak > b ? streak : b));
  }, [streak, streakKey]);

  useEffect(() => {
    if (bestStreak <= 0) return;
    try { localStorage.setItem(bestKey, String(bestStreak)); } catch { /* storage disabled */ }
  }, [bestStreak, bestKey]);

  const handleResult = (r: SlideResult) => {
    setScore((s) => s + r.points);
    if (typeof r.mastery === "number") setMastery(r.mastery);
    if (r.correct) {
      setStreak((s) => s + 1);
      setXp((x) => x + r.points);
    } else {
      setStreak(0);
      // Every 3rd consecutive wrong answer the backend asks for a mini-game break.
      // Replay the just-wrong MCQ (rebuilt from feedback, which keeps the correct
      // answer) so a win credits mastery recovery.
      if (r.triggerPenalty) {
        const wrong = slides[current]?.session;
        const wTopic = wrong?.topic ?? topic;
        const wSubject = wrong?.subject ?? subject;
        // Queue the game — don't open it yet. The student reads their graded
        // feedback first, then taps the in-slide button to play (or swipes on).
        if (isWritingComposition(wSubject, wTopic)) {
          // Essays have no correct-letter → reinforce with a writing-native game.
          setPending({ slideIndex: current, kind: "writing", sessionId: r.sessionId, topic: wTopic, subject: wSubject });
        } else {
          setPending({ slideIndex: current, kind: "mcq", sessionId: r.sessionId, challenge: r.challenge ?? null, topic: wTopic, subject: wSubject });
        }
      }
    }
  };

  // Student tapped "play to recover" — now open the queued game over the feedback.
  const launchPenalty = () => {
    if (!pending) return;
    if (pending.kind === "writing") {
      setWritingPenalty({ open: true, sessionId: pending.sessionId, topic: pending.topic, subject: pending.subject });
    } else {
      setPenalty({ open: true, sessionId: pending.sessionId, challenge: pending.challenge ?? null, topic: pending.topic, subject: pending.subject });
    }
    setPending(null);
  };

  // Play mode bubbles each resolved question up to the same HUD as the feed.
  const handlePlayResult = (r: { correct: boolean; points: number; mastery?: number | null }) => {
    setScore((s) => s + r.points);
    if (typeof r.mastery === "number") setMastery(r.mastery);
    if (r.correct) {
      setStreak((s) => s + 1);
      setXp((x) => x + r.points);
    } else {
      setStreak(0);
    }
  };

  const handlePenaltyComplete = (won: boolean, masteryScore?: number | null) => {
    // A game win credits partial mastery recovery — reflect it live, no refetch.
    if (typeof masteryScore === "number") setMastery(masteryScore);
    setPenalty({ open: false });
    // Advance only on a win; on a loss the student stays on the (answered) slide
    // and swipes on when ready — matches the modal's "back to the question" copy.
    if (won) embla?.scrollNext();
  };

  const handleWritingComplete = (won: boolean, masteryScore?: number | null) => {
    if (typeof masteryScore === "number") setMastery(masteryScore);
    setWritingPenalty({ open: false });
    if (won) embla?.scrollNext();
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Gamification HUD */}
      <div className="flex items-center gap-3">
        <StreakMeter streak={streak} best={bestStreak} />
        <span className="rounded-full border border-border bg-card/70 px-3 py-1.5 text-sm font-bold tabular-nums text-foreground">
          {score.toLocaleString()}
        </span>
        {/* Read vs Play — same question stream, two ways to learn it. */}
        <div className="ml-auto flex items-center gap-1 rounded-full border border-border bg-card/70 p-0.5 text-xs font-semibold">
          <button
            onClick={() => setMode("read")}
            className={mode === "read"
              ? "rounded-full bg-primary px-3 py-1 text-primary-foreground"
              : "rounded-full px-3 py-1 text-muted-foreground"}
          >
            {lang === "ms" ? "Baca" : "Read"}
          </button>
          <button
            onClick={() => setMode("play")}
            className={mode === "play"
              ? "rounded-full bg-primary px-3 py-1 text-primary-foreground"
              : "rounded-full px-3 py-1 text-muted-foreground"}
          >
            🎮 {lang === "ms" ? "Main" : "Play"}
          </button>
        </div>
        {headerRight && <div>{headerRight}</div>}
      </div>
      <XpBar xp={xp} />
      <MasteryBar mastery={mastery} lang={lang} />

      {/* Play mode — the learn-through-play game over the same question stream. */}
      {mode === "play" ? (
        <div
          className="flex items-center justify-center overflow-hidden rounded-3xl bg-[#0b1022] p-4"
          style={{ height: "76vh" }}
        >
          <PlayModeGame
            studentId={studentId}
            topic={topic}
            subject={subject}
            apiLang={apiLang}
            lang={lang}
            formLevel={formLevel}
            questionType={questionType}
            onResult={handlePlayResult}
            onExit={() => setMode("read")}
          />
        </div>
      ) : (
      /* Vertical swipe feed — touch-action must NOT include pan-y or the browser
          claims the vertical drag as native scroll and embla's drag handler bails
          (non-cancelable touchmove). pan-x lets embla capture the vertical swipe. */
      <div className="touch-pan-x overflow-hidden rounded-3xl" ref={emblaRef}>
        <div className="flex touch-pan-x flex-col" style={{ height: "76vh" }}>
          {slides.map((s, i) => (
            <div key={s.key} className="relative min-h-0 shrink-0 grow-0 basis-full pb-3">
              <QuestionSlide
                session={s.session}
                isActive={i === current}
                studentId={studentId}
                subject={subject}
                apiLang={apiLang}
                streak={streak}
                lang={lang}
                timerEnabled={timerEnabled}
                penaltyPending={pending?.slideIndex === i}
                onResult={handleResult}
                onOpenTutor={onOpenTutor}
                onRequestNext={() => embla?.scrollNext()}
                onLaunchPenalty={launchPenalty}
              />
            </div>
          ))}
          {/* trailing loader slide while the next question streams in — play a
              quick game to pass the wait. The game (with its window-level key
              handler) only mounts when this loader is the ACTIVE slide, so it
              never steals the spacebar while an essay is being typed above. */}
          <div className="flex min-h-0 shrink-0 grow-0 basis-full items-center justify-center pb-3">
            {current >= slides.length ? (
              <LoadingGame
                lang={lang}
                footer={lang === "ms" ? "Leret ke atas apabila soalan sedia" : "Swipe up when your question is ready"}
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="text-xs">{lang === "ms" ? "Memuatkan soalan…" : "Loading question…"}</span>
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      <PenaltyGameModal
        open={penalty.open}
        studentId={studentId}
        sessionId={penalty.sessionId}
        onComplete={handlePenaltyComplete}
        challenge={penalty.challenge}
        topic={penalty.topic}
        subject={penalty.subject}
      />

      <WritingGameModal
        open={writingPenalty.open}
        studentId={studentId}
        sessionId={writingPenalty.sessionId}
        onComplete={handleWritingComplete}
        topic={writingPenalty.topic}
        subject={writingPenalty.subject}
        language={apiLang}
      />
    </div>
  );
}
