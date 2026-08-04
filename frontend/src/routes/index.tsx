import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  Volume2,
  Heart,
  MessageCircle,
  BarChart3,
  Loader2,
  Sparkles,
  X,
  AlertTriangle,
  Trophy,
  Settings,
  SlidersHorizontal,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  ApiResponseError,
  startSession,
  submitAnswer,
  fetchSubjects,
  fetchDiagnosticStatus,
  requestStudentCoach,
  fetchStudentCoach,
  startDiagnosticSession,
  joinClassroom,
  type SessionResponse,
  type AnswerResponse,
  type MockBundle,
  type QuestionType,
  type SubjectWithTopics,
  type DiagnosticStatus,
  type CoachNarrative,
} from "@/services/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useI18n, type Lang } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useAuth } from "@/lib/auth";
import { useStudentPrefs, FONT_SIZE_CLASS } from "@/hooks/useStudentPrefs";
import { StudentSettingsSheet } from "@/components/StudentSettingsSheet";
import { ExamPaperCard } from "@/components/ExamPaperCard";
import { ExamPrefsSheet } from "@/components/ExamPrefsSheet";
import { LogOut, BookOpen, Gamepad2 } from "lucide-react";
import { LessonNotesModal } from "@/components/LessonNotesModal";
import { TutorChatDrawer } from "@/components/TutorChatDrawer";
import { InteractiveVideoPlayer } from "@/components/InteractiveVideoPlayer";
import { QuestionFeed } from "@/components/feed/QuestionFeed";
import { LoadingGame, useWaitGame } from "@/components/LoadingGame";
import { GameTopBar } from "@/components/GameTopBar";
import { PraiseOverlay } from "@/components/PraiseOverlay";
import { BossBattleIntro } from "@/components/BossBattleIntro";
import { PenaltyGameModal } from "@/components/PenaltyGameModal";
import { buildChallenge } from "@/lib/challenge";
import { isViewingAsStudent, setViewAsStudent } from "@/lib/viewAs";
import { StudyCoachModal } from "@/components/StudyCoachModal";
import { StudyModeSelect, type StudyMode } from "@/components/StudyModeSelect";
import { ProfileBanner } from "@/components/ProfileBanner";
import { DiagnosticHeaderBar } from "@/components/DiagnosticHeaderBar";
import { DiagnosticCompleteScreen } from "@/components/DiagnosticCompleteScreen";
import { KbatProgressBar } from "@/components/KbatProgressBar";
import { EssayMarkingCountdown } from "@/components/EssayMarkingCountdown";
import { toast } from "sonner";



export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Skor — Learn KSSM the TikTok way" },
      {
        name: "description",
        content:
          "Gamified AI learning for Malaysian high school students. Swipe, answer, master the KSSM syllabus.",
      },
      { property: "og:title", content: "Skor — Learn KSSM the TikTok way" },
      {
        property: "og:description",
        content: "Gamified AI learning for Malaysian high school students.",
      },
    ],
  }),
  component: StudentFeed,
});

const LETTERS = ["A", "B", "C", "D"] as const;
type Letter = (typeof LETTERS)[number];

// Royalty-free Lo-Fi loop (Pixabay CDN, CC0)
const LOFI_AUDIO_URL =
  "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3";

function isValidUrl(u: unknown): u is string {
  return typeof u === "string" && u.trim().length > 0 && u !== "null" && u !== "undefined";
}

function KineticLyrics({
  lines,
  videoBroll,
  voiceoverUrl,
}: {
  lines: unknown;
  videoBroll?: string | null;
  voiceoverUrl?: string | null;
}) {
  const safeLines = Array.isArray(lines)
    ? lines.filter((l): l is string => typeof l === "string" && l.trim().length > 0)
    : [];
  const lyricsKey = safeLines.join("\n");
  const safeVideo = isValidUrl(videoBroll) ? videoBroll : undefined;
  const safeVoice = isValidUrl(voiceoverUrl) ? voiceoverUrl : undefined;
  const [visible, setVisible] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const beatRef = useRef<HTMLAudioElement | null>(null);
  const voiceRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const showLyrics = safeLines.length > 0;
  const showPlayOverlay = !playing;

  // Animate lyrics line-by-line; restart whenever lyrics change OR playback starts
  useEffect(() => {
    setVisible(0);
    if (!safeLines.length || !playing) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    safeLines.forEach((_, i) => {
      timers.push(setTimeout(() => setVisible((v) => Math.max(v, i + 1)), 600 + i * 900));
    });
    return () => timers.forEach(clearTimeout);
  }, [lyricsKey, playing]);

  // Reset playback state when source changes
  useEffect(() => {
    setPlaying(false);
    setVideoError(false);
    setVisible(0);
    if (beatRef.current) {
      beatRef.current.pause();
      beatRef.current.currentTime = 0;
    }
    if (voiceRef.current) {
      voiceRef.current.pause();
      voiceRef.current.currentTime = 0;
    }
  }, [safeVideo, safeVoice, lyricsKey]);

  const handlePlayAudio = async () => {
    const beat = beatRef.current;
    const voice = voiceRef.current;
    try {
      if (beat) {
        beat.volume = 0.3;
        beat.loop = true;
        beat.muted = false;
        await beat.play();
      }
      if (voice && safeVoice) {
        voice.volume = 1;
        voice.muted = false;
        await voice.play();
      }
      videoRef.current?.play().catch(() => {});
      setPlaying(true);
    } catch (e) {
      console.warn("Audio playback failed", e);
    }
  };

  const handlePauseAudio = () => {
    beatRef.current?.pause();
    voiceRef.current?.pause();
    setPlaying(false);
  };

  return (
    <div className="relative aspect-[9/14] sm:aspect-[16/10] overflow-hidden rounded-3xl border border-primary/40 bg-black shadow-glow">
      {/* Layer 1 — Video b-roll background */}
      {safeVideo && !videoError ? (
        <video
          key={safeVideo}
          ref={videoRef}
          src={safeVideo}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          onError={() => {
            console.warn("video b-roll failed to load");
            setVideoError(true);
          }}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,oklch(0.55_0.28_300/0.5),transparent_60%),radial-gradient(circle_at_80%_80%,oklch(0.55_0.28_240/0.5),transparent_60%)]" />
      )}

      {/* Dark gradient overlay for legibility */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/30 to-black/80" />

      {/* Layer 2a — AI voiceover (hidden) */}
      {safeVoice ? (
        <audio
          ref={voiceRef}
          src={safeVoice}
          preload="auto"
          className="hidden"
          onEnded={() => setPlaying(false)}
          onError={() => {
            console.warn("voiceover failed to load");
          }}
        />
      ) : null}
      {/* Layer 2b — Lo-Fi beat loop (hidden) */}
      <audio
        ref={beatRef}
        src={LOFI_AUDIO_URL}
        loop
        preload="auto"
        className="hidden"
        onError={() => console.warn("beat failed to load")}
      />

      {/* Layer 3 — Kinetic lyrics */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 sm:px-6 text-center">
        {showLyrics && safeLines.map((line, i) => (
          <div
            key={i}
            className={cn(
              "font-display text-lg sm:text-xl md:text-2xl font-extrabold tracking-tight text-white leading-tight max-w-full break-words [text-wrap:balance] transition-all duration-700",
              i < visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-3 scale-95",
            )}
            style={{ textShadow: "0 2px 12px rgba(0,0,0,0.85), 0 0 28px rgba(236,72,153,0.55)" }}
          >
            {line}
          </div>
        ))}
      </div>

      <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-background/40 px-3 py-1 text-xs font-medium text-white backdrop-blur">
        <span className="h-2 w-2 rounded-full bg-neon-green animate-pulse" />
        Mnemonic Hook
      </div>

      {/* Master Play/Pause button */}
      {showPlayOverlay && (
        <button
          onClick={handlePlayAudio}
          className="absolute inset-0 z-10 grid place-items-center bg-black/40 backdrop-blur-[2px] transition hover:bg-black/50"
          aria-label="Tap to play audio"
        >
          <span className="flex flex-col items-center gap-3">
            <span className="grid h-20 w-20 place-items-center rounded-full bg-white/95 text-black shadow-2xl transition group-hover:scale-105">
              <Play className="h-9 w-9 translate-x-0.5" fill="currentColor" />
            </span>
            <span className="rounded-full bg-black/70 px-4 py-1.5 text-sm font-bold uppercase tracking-wider text-white shadow-lg">
              Tap to Play Audio
            </span>
          </span>
        </button>
      )}
      {playing && (
        <button
          onClick={handlePauseAudio}
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-background/50 text-white backdrop-blur transition hover:scale-105"
          aria-label="Pause mnemonic"
        >
          <Pause className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function RateLimitWaitingCard({
  lang,
  onRetry,
}: {
  lang: Lang;
  onRetry: () => void;
}) {
  const WAIT_SECONDS = 15;
  const [secondsLeft, setSecondsLeft] = useState(WAIT_SECONDS);

  useEffect(() => {
    setSecondsLeft(WAIT_SECONDS);
    const id = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const isMs = lang === "ms";
  const canRetry = secondsLeft === 0;

  return (
    <section className="rounded-3xl border border-[oklch(0.7_0.16_75/0.45)] bg-[oklch(0.3_0.08_75/0.18)] p-5 backdrop-blur">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[oklch(0.7_0.16_75/0.2)]">
          <AlertTriangle className="h-5 w-5 text-[oklch(0.82_0.17_75)]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-widest text-[oklch(0.82_0.17_75)]">
            {isMs ? "Sila Tunggu" : "Please Wait"}
          </div>
          <h2 className="mt-1 font-display text-xl font-semibold leading-snug text-[oklch(0.95_0.04_75)]">
            Sedang menjana soalan... sila tunggu sebentar.
          </h2>
          <p className="mt-1 text-sm text-[oklch(0.85_0.04_75)]">
            Generating question, please wait a moment.
          </p>

          <div className="mt-4 flex items-center gap-3">
            {canRetry ? (
              <Sparkles className="h-5 w-5 text-[oklch(0.82_0.17_75)]" />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin text-[oklch(0.82_0.17_75)]" />
            )}
            <span className="text-sm text-[oklch(0.88_0.04_75)]">
              {canRetry
                ? isMs
                  ? "Sedia untuk cuba semula"
                  : "Ready to try again"
                : isMs
                  ? `Cuba semula dalam ${secondsLeft}s`
                  : `Retry in ${secondsLeft}s`}
            </span>
          </div>

          <Button
            onClick={onRetry}
            disabled={!canRetry}
            size="lg"
            className="mt-5 h-12 rounded-2xl bg-gradient-primary px-6 font-bold shadow-glow hover:opacity-95 disabled:opacity-60"
          >
            {isMs ? "Cuba Semula" : "Try Again"}
          </Button>
        </div>
      </div>
    </section>
  );
}



function StudentFeed() {
  const { t, lang, setLang } = useI18n();
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Teachers/admins are normally bounced to their dashboard, unless they've
    // switched to "view as student" via the swap toggle.
    if (
      !authLoading &&
      profile &&
      (profile.role === "teacher" || profile.role === "admin") &&
      !isViewingAsStudent()
    ) {
      void navigate({ to: "/teacher" });
    }
  }, [authLoading, profile, navigate]);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [videoBroll, setVideoBroll] = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mnemonicLyrics, setMnemonicLyrics] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<Letter | null>(null);
  const [checking, setChecking] = useState<Letter | null>(null);
  const [feedback, setFeedback] = useState<AnswerResponse | null>(null);
  const [streak, setStreak] = useState(0);
  const [score, setScore] = useState(0);
  const [wrongStreak, setWrongStreak] = useState(0);
  const [questionNumber, setQuestionNumber] = useState(1);
  const [lastPoints, setLastPoints] = useState(0);
  const [praiseOn, setPraiseOn] = useState(false);
  const [praiseMastered, setPraiseMastered] = useState(false);
  const [isBossMode, setIsBossMode] = useState(false);
  const [bossIntroOpen, setBossIntroOpen] = useState(false);
  const [bossIntroMastery, setBossIntroMastery] = useState(0);
  const [penaltyOpen, setPenaltyOpen] = useState(false);
  // A penalty game is available for the just-answered (wrong) question, but it's
  // NOT auto-opened — the graded feedback stays on screen and the student taps
  // "Play a game" in the feedback sheet (or "Next Question" to skip it).
  const [penaltyAvailable, setPenaltyAvailable] = useState(false);
  const [wrongFlash, setWrongFlash] = useState<Letter | null>(null);
  const [correctFlash, setCorrectFlash] = useState<Letter | null>(null);
  const [diagramSvg, setDiagramSvg] = useState<string | null>(null);
  const [hasSeenIntro, setHasSeenIntro] = useState(false);
  const [kbatLevelSeen, setKbatLevelSeen] = useState<string | null>(null);
  const [levelUpLabel, setLevelUpLabel] = useState<string | null>(null);
  
  const [error, setError] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<SubjectWithTopics[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(true);
  const [activeSubject, setActiveSubject] = useState<string>("");
  const [activeTopic, setActiveTopic] = useState<string>("");
  const [activeLanguage, setActiveLanguage] = useState<Lang>(lang);
  const [dynamicTopic, setDynamicTopic] = useState<string | null>(null);
  const [questionType, setQuestionType] = useState<QuestionType>("mcq");
  const [textAnswer, setTextAnswer] = useState<string>("");
  const [studyPackOpen, setStudyPackOpen] = useState(false);
  const [tutorChatOpen, setTutorChatOpen] = useState(false);
  const [formLevel, setFormLevel] = useState<4 | 5>(4);

  // Play-a-game-while-loading gate for the free-practice question fetch: after a
  // 6s wait it shows the game, and once the question is ready it keeps running
  // until the student loses, then reveals the feed.
  const loadGate = useWaitGame(loading && !session);

  // ===== Study Mode =====
  const [studyMode, setStudyMode] = useState<StudyMode | null>(null);
  const [diagAnswered, setDiagAnswered] = useState(0);
  const [diagTotal, setDiagTotal] = useState(10);
  const [diagnosticComplete, setDiagnosticComplete] = useState(false);

  // ===== Study Coach =====
  const [diagStatus, setDiagStatus] = useState<DiagnosticStatus | null>(null);
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachNarrative, setCoachNarrative] = useState<CoachNarrative | null>(null);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [coachBannerDismissed, setCoachBannerDismissed] = useState(false);

  const effectiveStudentId = user?.id ?? "00000000-0000-0000-0000-000000000001";

  const refreshDiagnosticStatus = async () => {
    const s = await fetchDiagnosticStatus(effectiveStudentId);
    if (s) setDiagStatus(s);
  };

  useEffect(() => {
    void refreshDiagnosticStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveStudentId]);

  const handleOpenCoach = async () => {
    setCoachOpen(true);
    setCoachLoading(true);
    setCoachError(null);
    setCoachNarrative(null);
    try {
      const res = await requestStudentCoach(effectiveStudentId);
      if (res.ready) {
        setCoachNarrative(res.narrative);
        setCoachBannerDismissed(true);
      } else {
        setCoachOpen(false);
        toast.message(res.message);
      }
    } catch (err) {
      console.error("[Skor] requestStudentCoach failed", err);
      setCoachError("Couldn't generate your report. Please try again in a moment.");
    } finally {
      setCoachLoading(false);
    }
  };

  const handleViewLastCoach = async () => {
    setCoachOpen(true);
    setCoachLoading(true);
    setCoachError(null);
    setCoachNarrative(null);
    try {
      const res = await fetchStudentCoach(effectiveStudentId);
      if (res && res.ready) {
        setCoachNarrative(res.narrative);
        setCoachBannerDismissed(true);
      } else {
        setCoachError("No previous report found.");
      }
    } finally {
      setCoachLoading(false);
    }
  };

  const handleCoachStartPractice = (topic: string, subject: string) => {
    setCoachOpen(false);
    const subjectExists = subjects.some((s) => s.subject === subject);
    const targetSubject = subjectExists ? subject : activeSubject;
    if (!subjectExists) setDynamicTopic(topic);
    setActiveSubject(targetSubject);
    setActiveTopic(topic);
    void loadSession(targetSubject, topic, activeLanguage, false);
  };

  const initialLoadAttempted = useRef(false);
  const latestLoadRequestRef = useRef(0);

  const topicsForSubject = (subject: string): string[] => {
    const found = subjects.find((s) => s.subject === subject);
    return found?.topics ?? [];
  };

  const essayTopicsForSubject = (subject: string): string[] => {
    const found = subjects.find((s) => s.subject === subject);
    return found?.essay_topics ?? [];
  };

  // In essay mode, language subjects expose a SEPARATE curated set of writing
  // themes (not the general syllabus topics, which aren't essay-appropriate).
  // Falls back to the general topic list for content subjects / other modes.
  const selectableTopics = (subject: string, qType: QuestionType): string[] => {
    if (qType === "essay") {
      const essay = essayTopicsForSubject(subject);
      if (essay.length > 0) return essay;
    }
    return topicsForSubject(subject);
  };

  const mock: MockBundle = {
    question: t.mockQuestion,
    optionA: t.mockOptionA,
    optionB: t.mockOptionB,
    optionC: t.mockOptionC,
    optionD: t.mockOptionD,
    topic: t.mockTopic,
    subject: t.mockSubject,
    feedbackCorrect: t.feedbackCorrect,
    feedbackWrong: t.feedbackWrong,
    misconception: t.feedbackMisconception,
  };

  const langToApi = (l: string): string =>
    l === "ms" ? "Bahasa Melayu" : l === "zh" ? "Chinese" : "English";

  const handleLanguageChange = (nextLanguage: Lang) => {
    setActiveLanguage(nextLanguage);
    setLang(nextLanguage);
    save({ lang: nextLanguage });
  };

  const loadSession = async (
    subjectOverride?: string,
    topicOverride?: string,
    languageOverride?: Lang,
    isAdaptive: boolean = false,
    questionTypeOverride?: QuestionType,
  ) => {
    const requestId = ++latestLoadRequestRef.current;
    const subject = subjectOverride ?? activeSubject;
    const target = topicOverride ?? activeTopic;
    const nextActiveLanguage = languageOverride ?? activeLanguage;
    const qType = questionTypeOverride ?? questionType;
    const apiLanguage = langToApi(nextActiveLanguage);
    if (!subject || !target || authLoading) {
      // Nothing to load yet (subjects still loading or auth not resolved).
      return;
    }
    const introKey = `kp_intro_${effectiveStudentId}_${subject}_${target}`;
    const alreadySeenIntro = localStorage.getItem(introKey) === "1";
    setHasSeenIntro(alreadySeenIntro);
    setLoading(true);
    setError(null);
    setFeedback(null);
    setSelected(null);
    setVideoBroll(null);
    setMediaUrl(null);
    setMnemonicLyrics(null);
    setDiagramSvg(null);
    setTextAnswer("");
    setSubPartAnswers({});
    setSession(null);
    try {
      const data = await startSession(
        effectiveStudentId,
        target,
        "KSSM",
        apiLanguage,
        subject,
        mock,
        isAdaptive,
        qType,
        formLevel,
      );
      if (requestId !== latestLoadRequestRef.current) return;
      console.log("[Skor] startSession response:", data);
      setVideoBroll(data.video_broll ?? null);
      setMediaUrl(data.media_url ?? null);
      setMnemonicLyrics(data.mnemonic_lyrics ?? null);
      // Preserve diagram across Q1→Q2+ transitions; only clear on topic change
      if (data.diagram_svg) {
        setDiagramSvg(data.diagram_svg);
      } else if (data.topic !== activeTopic || data.subject !== activeSubject) {
        setDiagramSvg(null);
      }
      // Detect KBAT level-up and show a brief celebration chip
      if (data.kbat_level && kbatLevelSeen && data.kbat_level !== kbatLevelSeen) {
        setLevelUpLabel(data.kbat_level);
        setTimeout(() => setLevelUpLabel(null), 2500);
      }
      setKbatLevelSeen(data.kbat_level ?? null);
      // Mark this topic's intro as seen so next question skips it
      localStorage.setItem(introKey, "1");
      setSession(data);
    } catch (err) {
      if (requestId !== latestLoadRequestRef.current) return;
      console.error("[Skor] startSession error:", err);
      setError(
        err instanceof ApiResponseError
          ? "System maintenance — questions are temporarily unavailable."
          : "Couldn't load the next question. Please try again.",
      );
      setSession(null);
    } finally {
      if (requestId === latestLoadRequestRef.current) {
        setLoading(false);
      }
    }
  };

  const handleSubjectChange = (subject: string) => {
    if (subject === activeSubject) return;
    const firstTopic = selectableTopics(subject, questionType)[0] ?? "";
    setActiveSubject(subject);
    setActiveTopic(firstTopic);
    setDynamicTopic(null);
    if (firstTopic) void loadSession(subject, firstTopic, activeLanguage, false);
  };

  const handleTopicChange = (topic: string) => {
    if (topic === activeTopic) return;
    setActiveTopic(topic);
    void loadSession(activeSubject, topic, undefined, false);
  };

  const loadSubjectsForLevel = async (
    level: number,
    { autoStart = true }: { autoStart?: boolean } = {},
  ) => {
    setSubjectsLoading(true);
    let list: SubjectWithTopics[] = [];
    try {
      list = (await fetchSubjects(level)) ?? [];
      console.log("[Skor] fetched subjects (form", level, "):", list);
    } catch (err) {
      console.error("[Skor] fetchSubjects failed:", err);
      list = [];
    }
    setSubjects(list);
    setSubjectsLoading(false);
    if (list.length === 0) {
      setActiveSubject("");
      setActiveTopic("");
      return;
    }
    const randomIndex = Math.floor(Math.random() * list.length);
    const picked = list[randomIndex];
    const firstSubject = picked.subject;
    const topics = picked.topics ?? [];
    const firstTopic = topics.length > 0
      ? topics[Math.floor(Math.random() * topics.length)]
      : "";
    setActiveSubject(firstSubject);
    setActiveTopic(firstTopic);
    if (autoStart && firstTopic) void loadSession(firstSubject, firstTopic, undefined, false);
  };

  const handleFormLevelChange = (level: 4 | 5) => {
    if (level === formLevel) return;
    setFormLevel(level);
    setDynamicTopic(null);
    void loadSubjectsForLevel(level, { autoStart: false });
  };

  // Load diagnostic question (or detect completion).
  const loadDiagnosticSession = async () => {
    const requestId = ++latestLoadRequestRef.current;
    setLoading(true);
    setError(null);
    setFeedback(null);
    setSelected(null);
    setVideoBroll(null);
    setMediaUrl(null);
    setMnemonicLyrics(null);
    setTextAnswer("");
    setSubPartAnswers({});
    setSession(null);
    try {
      const res = await startDiagnosticSession(
        effectiveStudentId,
        langToApi(activeLanguage),
        formLevel,
      );
      if (requestId !== latestLoadRequestRef.current) return;
      if (res.diagnostic_complete) {
        setDiagnosticComplete(true);
        setDiagAnswered(res.questions_answered ?? diagTotal);
        setDiagTotal(res.total ?? diagTotal);
        setSession(null);
        return;
      }
      setDiagnosticComplete(false);
      setDiagAnswered(res.diagnostic_progress.questions_answered);
      setDiagTotal(res.diagnostic_progress.total);
      setVideoBroll(res.video_broll ?? null);
      setMediaUrl(res.media_url ?? null);
      setMnemonicLyrics(res.mnemonic_lyrics ?? null);
      setActiveSubject(res.subject ?? "");
      setActiveTopic(res.topic ?? "");
      setSession(res);
    } catch (err) {
      if (requestId !== latestLoadRequestRef.current) return;
      console.error("[Skor] startDiagnosticSession error:", err);
      setError(
        err instanceof ApiResponseError
          ? "System maintenance — diagnostic is temporarily unavailable."
          : "Couldn't load the next diagnostic question. Please try again.",
      );
      setSession(null);
    } finally {
      if (requestId === latestLoadRequestRef.current) setLoading(false);
    }
  };

  const handleStudyModeStart = (mode: StudyMode) => {
    if (mode === "join_class") return;
    setStudyMode(mode);
    setDiagnosticComplete(false);
    setQuestionNumber(1);
    if (mode === "diagnostic") {
      void loadDiagnosticSession();
    } else {
      // Free practice — make sure we have subjects and start session
      if (subjects.length === 0) {
        void loadSubjectsForLevel(formLevel, { autoStart: true });
      } else if (activeSubject && activeTopic) {
        void loadSession(activeSubject, activeTopic, activeLanguage, false);
      } else {
        void loadSubjectsForLevel(formLevel, { autoStart: true });
      }
    }
  };

  const handleJoinClass = async (code: string) => {
    const res = await joinClassroom(effectiveStudentId, code);
    if (res.success) {
      toast.success(res.message);
    } else {
      toast.error(res.message);
    }
  };

  const handleExitToModeSelect = () => {
    setStudyMode(null);
    setSession(null);
    setFeedback(null);
    setDiagnosticComplete(false);
  };

  useEffect(() => {
    if (initialLoadAttempted.current) return;
    initialLoadAttempted.current = true;

    // Check for a practice intent set by MasteryPanel (dashboard → quiz deep-link)
    const intentRaw = sessionStorage.getItem("kp_practice_intent");
    if (intentRaw) {
      sessionStorage.removeItem("kp_practice_intent");
      try {
        const { subject, topic } = JSON.parse(intentRaw) as { subject: string; topic: string };
        if (subject && topic) {
          setStudyMode("free_practice");
          setActiveSubject(subject);
          setActiveTopic(topic);
          void loadSession(subject, topic, activeLanguage, false);
          return;
        }
      } catch {
        // malformed intent — fall through to normal preload
      }
    }

    // Preload subjects in the background (no autostart) — used by Free Practice.
    void loadSubjectsForLevel(formLevel, { autoStart: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once auth resolves (authLoading flips false), retry loadSession if a
  // topic is already selected but no session exists yet (the earlier call
  // was skipped because effectiveStudentId was null).
  useEffect(() => {
    if (authLoading || session || !activeSubject || !activeTopic) return;
    void loadSession(activeSubject, activeTopic, activeLanguage, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  useEffect(() => {
    setActiveLanguage(lang);
  }, [lang]);

  const advanceToNext = async (completedFeedback: AnswerResponse | null) => {
    const nextTopic = completedFeedback?.topic_complete ? completedFeedback.next_topic : null;
    setFeedback(null);
    setSelected(null);
    setCorrectFlash(null);
    setWrongFlash(null);
    setPenaltyAvailable(false);
    setLastPoints(0);
    setQuestionNumber((q) => q + 1);
    if (studyMode === "diagnostic") {
      await loadDiagnosticSession();
      return;
    }
    if (nextTopic) {
      let targetSubject: string = activeSubject;
      let found = false;
      for (const s of subjects) {
        if (s.topics.includes(nextTopic)) {
          targetSubject = s.subject;
          found = true;
          break;
        }
      }
      if (!found) setDynamicTopic(nextTopic);
      else setDynamicTopic(null);
      setActiveSubject(targetSubject);
      setActiveTopic(nextTopic);
      await loadSession(targetSubject, nextTopic, activeLanguage, false);
    } else {
      await loadSession(activeSubject, activeTopic, undefined, true);
    }
  };

  const submitToBackend = async (answerText: string, letter?: Letter) => {
    if (!session || authLoading) return;
    setError(null);
    try {
      const apiLanguage = langToApi(activeLanguage);
      const res = await submitAnswer(
        effectiveStudentId,
        session.topic ?? activeTopic,
        "",
        answerText,
        {},
        mock,
        apiLanguage,
        session.subject ?? activeSubject,
        session.session_id,
        session.question_type ?? "mcq",
      );

      const isCorrect = res.is_correct ?? res.correct;
      const points =
        res.points_awarded != null
          ? res.points_awarded
          : isCorrect
            ? 100 + streak * 20
            : 0;
      const nextStreak =
        res.streak != null ? res.streak : isCorrect ? streak + 1 : 0;
      const nextWrongStreak =
        res.wrong_count != null
          ? res.wrong_count
          : isCorrect
            ? 0
            : wrongStreak + 1;
      const nextScore =
        res.score != null ? res.score : score + points;
      const trigger =
        typeof res.trigger_penalty_game === "boolean"
          ? res.trigger_penalty_game
          : nextWrongStreak > 0 && nextWrongStreak % 3 === 0;

      setStreak(nextStreak);
      setWrongStreak(nextWrongStreak);
      setScore(nextScore);
      setLastPoints(points);

      const enriched: AnswerResponse = { ...res, correct: isCorrect };
      setFeedback(enriched);
      void refreshDiagnosticStatus();

      const mastery = typeof res.mastery_score === "number" ? res.mastery_score : null;
      const wasBoss = isBossMode;
      const enterBoss =
        !!isCorrect &&
        mastery !== null &&
        mastery >= 0.7 &&
        !res.topic_complete &&
        !wasBoss;
      const masteredNow = !!isCorrect && wasBoss;

      if (isCorrect) {
        if (letter) setCorrectFlash(letter);
        setPraiseMastered(masteredNow);
        setPraiseOn(true);
        // Fire next-question load in parallel with the praise overlay so the
        // student doesn't wait the full 3–5s after the overlay dismisses.
        const nextLoad = advanceToNext(enriched);
        setTimeout(() => {
          setPraiseOn(false);
          setPraiseMastered(false);
          if (wasBoss) setIsBossMode(false);
          if (enterBoss) {
            setBossIntroMastery((mastery ?? 0) * 100);
            setBossIntroOpen(true);
          }
          // Make sure any rejection on the parallel load doesn't get swallowed.
          void nextLoad.catch((e) => console.error("[Skor] advanceToNext error:", e));
        }, 1500);
      } else {
        if (letter) setWrongFlash(letter);
        if (wasBoss) setIsBossMode(false);
        // Keep the graded feedback on screen — the student reads it, then taps
        // "Next Question" to proceed or "Play a game" (when a penalty is earned)
        // to recover. Never flash the feedback away into an auto-opened game or
        // an auto-advance.
        setPenaltyAvailable(trigger);
      }
    } catch (err) {
      console.error("[Skor] submitAnswer error:", err);
      setError(
        err instanceof ApiResponseError
          ? "System maintenance — answer checking is temporarily unavailable."
          : "Couldn't submit your answer. Please try again.",
      );
      setSelected(null);
    }
  };

  const handleAnswer = async (letter: Letter) => {
    if (checking || feedback || !session) return;
    setChecking(letter);
    setSelected(letter);
    try {
      await submitToBackend(session.options[letter], letter);
    } finally {
      setChecking(null);
    }
  };

  const [submittingText, setSubmittingText] = useState(false);
  const [subPartAnswers, setSubPartAnswers] = useState<Record<string, string>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [examPrefsOpen, setExamPrefsOpen] = useState(false);
  const [practiceBarOpen, setPracticeBarOpen] = useState(false);
  const { prefs, save } = useStudentPrefs();

  // When Supabase prefs load (cross-device), apply the saved language once.
  const prefLangApplied = useRef(false);
  useEffect(() => {
    if (prefLangApplied.current) return;
    if (prefs.lang && prefs.lang !== "en") {
      prefLangApplied.current = true;
      setLang(prefs.lang);
    } else if (prefs.lang === "en") {
      prefLangApplied.current = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.lang]);

  const handleTextSubmit = async () => {
    if (submittingText || feedback || !session) return;
    const trimmed = textAnswer.trim();
    if (!trimmed) return;
    setSubmittingText(true);
    try {
      await submitToBackend(trimmed);
    } finally {
      setSubmittingText(false);
    }
  };

  const handleSubPartsSubmit = async () => {
    if (submittingText || feedback || !session) return;
    const combined = (session.sub_parts ?? [])
      .map((p) => `${p.label} ${(subPartAnswers[p.label] ?? "").trim()}`)
      .filter((s) => s.split(" ").slice(1).join(" ").trim().length > 0)
      .join("\n");
    if (!combined) return;
    setSubmittingText(true);
    try {
      await submitToBackend(combined);
    } finally {
      setSubmittingText(false);
    }
  };

  const handleQuestionTypeChange = (next: QuestionType) => {
    if (next === questionType) return;
    setQuestionType(next);
    // Essay mode may swap the topic list to the curated writing themes. If the
    // current topic isn't valid for the new mode, snap to the first available one.
    const nextTopics = selectableTopics(activeSubject, next);
    const nextTopic =
      nextTopics.includes(activeTopic) ? activeTopic : (nextTopics[0] ?? activeTopic);
    if (nextTopic !== activeTopic) setActiveTopic(nextTopic);
    void loadSession(activeSubject, nextTopic, activeLanguage, false, next);
  };

  const handleNext = async () => {
    await advanceToNext(feedback);
  };

  const handlePenaltyComplete = (won: boolean, _mastery?: number | null) => {
    setPenaltyOpen(false);
    if (won) {
      void advanceToNext(feedback);
      return;
    }
    // Loss: send the student back to the SAME question. They must answer it
    // correctly before earning another game round — clear the wrong-answer
    // feedback so the question is answerable again.
    setFeedback(null);
    setSelected(null);
    setChecking(null);
    setCorrectFlash(null);
    setWrongFlash(null);
    setPenaltyAvailable(false);
    setTextAnswer("");
    setSubPartAnswers({});
    toast.message("Let's nail this question first 💪", {
      description: "Answer it correctly to keep going.",
    });
  };

  const showMaintenanceState = !loading && !session && !!error;

  // Guard: detect rate-limit / empty question payloads from /start_session.
  // Treat all of these as "still generating, please wait":
  //   - question text contains "API Rate Limit Hit"
  //   - question_data was null (session.question ends up empty)
  //   - question is an empty / whitespace-only string
  const rawQuestion = typeof session?.question === "string" ? session.question : "";
  const isAwaitingQuestion =
    !loading &&
    !!session &&
    (rawQuestion.includes("API Rate Limit Hit") || rawQuestion.trim().length === 0);


  // Study Mode selection screen — show before any question loads
  if (studyMode === null) {
    const displayName =
      profile?.full_name ??
      user?.email?.split("@")[0] ??
      "Student";
    return (
      <div className="min-h-[100dvh] bg-[linear-gradient(180deg,#1a0533_0%,#2d0a6e_100%)]">
        <div className="mx-auto max-w-lg">
          <ProfileBanner
            banner={prefs.banner}
            avatar={prefs.avatar}
            name={displayName}
          />
          {/* offset for the overflowing avatar circle */}
          <div className="mt-10">
            <StudyModeSelect
              studentId={effectiveStudentId}
              formLevel={formLevel}
              onStart={handleStudyModeStart}
              onJoinClass={handleJoinClass}
              onStartAssignment={(a) => {
                if (a.subject && a.topic) {
                  setStudyMode("free_practice");
                  void loadSession(a.subject, a.topic, activeLanguage, false);
                } else {
                  setStudyMode("free_practice");
                }
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  const inDiagnostic = studyMode === "diagnostic";

  return (
    <div className="relative min-h-[100dvh] bg-[linear-gradient(180deg,#1a0533_0%,#2d0a6e_100%)] text-foreground overflow-hidden">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,oklch(0.65_0.24_295/0.35),transparent_60%)]" />

      {/* Essay marking countdown — live LLM grading can take minutes; show the
          remaining time before the 5-min timeout instead of a bare spinner. */}
      <EssayMarkingCountdown
        active={submittingText && session?.question_type === "essay"}
        lang={activeLanguage}
      />

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-5 pt-5">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-primary shadow-glow">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-display text-xl font-bold tracking-tight">Skor</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <LanguageSwitcher
            compact
            lang={activeLanguage}
            languages={["en", "ms"]}
            onLangChange={(next) => {
              handleLanguageChange(next);
              void loadSession(activeSubject, activeTopic, next, false);
            }}
          />
          {(profile?.role === "teacher" || profile?.role === "admin") && (
            <button
              onClick={() => {
                setViewAsStudent(false);
                void navigate({ to: "/teacher" });
              }}
              className="flex items-center gap-1.5 rounded-full border border-primary/50 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary-glow hover:bg-primary/20 transition"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              {activeLanguage === "ms" ? "Papan Guru" : "Teacher view"}
            </button>
          )}
          <Link
            to="/leaderboard"
            className="grid h-9 w-9 place-items-center rounded-full border border-border/60 bg-card/60 text-yellow-400 hover:text-yellow-300 transition"
            aria-label="Leaderboard"
          >
            <Trophy className="h-4 w-4" />
          </Link>
          <Link
            to={profile?.role === "teacher" || profile?.role === "admin" ? "/teacher" : "/dashboard"}
            className="grid h-9 w-9 place-items-center rounded-full border border-border/60 bg-card/60 text-muted-foreground hover:text-foreground transition"
          >
            <BarChart3 className="h-4 w-4" />
          </Link>
          <button
            onClick={() => void signOut()}
            className="grid h-9 w-9 place-items-center rounded-full border border-border/60 bg-card/60 text-muted-foreground hover:text-foreground transition"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="grid h-9 w-9 place-items-center rounded-full border border-border/60 bg-card/60 text-muted-foreground hover:text-foreground transition"
            aria-label="Personalize"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </header>

      {(() => { console.log("[Skor] dropdown render → subjects state:", subjects, "activeSubject:", activeSubject, "activeTopic:", activeTopic, "topics for active:", activeSubject ? topicsForSubject(activeSubject) : []); return null; })()}
      <main className={cn("relative z-10 mx-auto flex max-w-md flex-col gap-4 px-4 pb-8 pt-6", FONT_SIZE_CLASS[prefs.fontSize])}>
        <GameTopBar
          streak={streak}
          score={score}
          questionNumber={questionNumber}
          pointsAwarded={lastPoints}
        />

        {inDiagnostic && (
          <DiagnosticHeaderBar
            answered={diagAnswered}
            total={diagTotal}
            subject={session?.subject ?? activeSubject}
            onExit={handleExitToModeSelect}
          />
        )}

        {/* Study Coach banner — diagnostic complete */}
        {diagStatus?.diagnostic_complete && !coachBannerDismissed && (
          <section className="rounded-2xl border border-[oklch(0.65_0.22_300/0.55)] bg-[linear-gradient(135deg,oklch(0.35_0.18_300/0.5),oklch(0.3_0.18_260/0.5))] p-4 backdrop-blur shadow-glow">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-primary text-lg">
                🎯
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-display text-base font-bold leading-snug">
                  Your Study Coach report is ready!
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  A personalised study plan based on your answers.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    onClick={handleOpenCoach}
                    size="sm"
                    className="h-9 rounded-xl bg-gradient-primary px-4 text-sm font-bold shadow-glow"
                  >
                    Get My Study Report
                  </Button>
                  {diagStatus.report_available && (
                    <button
                      onClick={handleViewLastCoach}
                      className="text-xs font-semibold text-primary-glow underline-offset-2 hover:underline"
                    >
                      View last report
                    </button>
                  )}
                  <button
                    onClick={() => setCoachBannerDismissed(true)}
                    className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                    aria-label="Dismiss"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Diagnostic progress — only when incomplete and started */}
        {diagStatus && !diagStatus.diagnostic_complete && diagStatus.questions_answered > 0 && (
          <section className="rounded-2xl border border-border/60 bg-card/60 px-4 py-3 backdrop-blur">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-semibold uppercase tracking-widest text-primary-glow">
                Diagnostic progress
              </span>
              <span>
                {diagStatus.questions_answered} / {diagStatus.threshold} answered
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-background/50">
              <div
                className="h-full rounded-full bg-gradient-primary transition-all"
                style={{
                  width: `${Math.min(100, (diagStatus.questions_answered / Math.max(1, diagStatus.threshold)) * 100)}%`,
                }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {Math.max(0, diagStatus.threshold - diagStatus.questions_answered)} more to unlock your Study Coach report
            </p>
          </section>
        )}

        {!inDiagnostic && (
        <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur">
          {/* Compact summary trigger — collapses the setup chrome into one line */}
          <button
            type="button"
            onClick={() => setPracticeBarOpen((v) => !v)}
            aria-expanded={practiceBarOpen}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left"
          >
            <SlidersHorizontal className="h-4 w-4 shrink-0 text-primary-glow" />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
              {(subjects.find((s) => s.subject === activeSubject)?.display_label ?? activeSubject) || (activeLanguage === "ms" ? "Pilih subjek" : "Choose a subject")}
              {activeTopic ? <span className="text-muted-foreground"> · {activeTopic}</span> : null}
            </span>
            <span className="hidden shrink-0 text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:inline">
              {activeLanguage === "ms" ? "Tkt" : "Form"} {formLevel} · {activeLanguage === "ms" ? "BM" : "EN"}
            </span>
            <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", practiceBarOpen && "rotate-180")} />
          </button>

          {practiceBarOpen && (
          <div className="flex flex-col gap-2 border-t border-border/60 p-3">
        {/* Form level segmented control */}
        <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-card/40 p-1">
          <span className="px-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {activeLanguage === "ms" ? "Tingkatan" : "Form"}
          </span>
          {([4, 5] as const).map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => handleFormLevelChange(lvl)}
              disabled={loading || subjectsLoading}
              aria-pressed={formLevel === lvl}
              className={cn(
                "flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition disabled:opacity-50",
                formLevel === lvl
                  ? "bg-gradient-primary text-primary-foreground shadow-glow"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {activeLanguage === "ms" ? `Tingkatan ${lvl}` : `Form ${lvl}`}
            </button>
          ))}
        </div>

        {/* Subject + Topic selectors */}
        <div className="grid grid-cols-2 gap-2">
          <Select
            value={activeSubject}
            onValueChange={(v) => handleSubjectChange(v)}
            disabled={loading || subjectsLoading || subjects.length === 0}
          >
            <SelectTrigger className="h-11 rounded-2xl border-border/60 bg-card/60 backdrop-blur">
              <SelectValue placeholder={subjectsLoading ? "Loading subjects…" : "Subject"} />
            </SelectTrigger>
            <SelectContent>
              {subjects.map((s) => (
                <SelectItem key={`${s.curriculum}-${s.subject}-${s.form}`} value={s.subject}>
                  {s.display_label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={activeTopic}
            onValueChange={handleTopicChange}
            disabled={loading || !activeSubject}
          >
            <SelectTrigger className="h-11 rounded-2xl border-border/60 bg-card/60 backdrop-blur">
              <SelectValue placeholder="Topic" />
            </SelectTrigger>
            <SelectContent>
              {[
                ...(activeSubject ? selectableTopics(activeSubject, questionType) : []),
                ...(dynamicTopic &&
                activeSubject &&
                questionType !== "essay" &&
                !selectableTopics(activeSubject, questionType).includes(dynamicTopic)
                  ? [dynamicTopic]
                  : []),
              ].map((topic) => (
                <SelectItem key={topic} value={topic}>
                  {topic}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Question type selector */}
        <Select
          value={questionType}
          onValueChange={(v) => handleQuestionTypeChange(v as QuestionType)}
          disabled={loading}
        >
          <SelectTrigger className="h-11 rounded-2xl border-border/60 bg-card/60 backdrop-blur">
            <SelectValue placeholder="Question type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mcq">Multiple Choice</SelectItem>
            <SelectItem value="short_answer">Short Answer</SelectItem>
            <SelectItem value="essay">Essay</SelectItem>
            <SelectItem value="listening">Listening</SelectItem>

          </SelectContent>
        </Select>

        {/* Language toggle */}
        <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-card/40 px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
            <span className={cn(activeLanguage === "en" && "text-foreground font-semibold")}>English</span>
            <span className="opacity-40">/</span>
            <span className={cn(activeLanguage === "ms" && "text-foreground font-semibold")}>Bahasa Melayu</span>
          </div>
          <Switch
            checked={activeLanguage === "ms"}
            onCheckedChange={(checked) => {
              const next: Lang = checked ? "ms" : "en";
              handleLanguageChange(next);
              void loadSession(activeSubject, activeTopic, next, false);
            }}
            aria-label="Toggle language"
          />
        </div>
          </div>
          )}
        </div>
        )}

        {/* Language toggle — diagnostic */}
        {inDiagnostic && (
        <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-card/60 px-4 py-2.5 backdrop-blur">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
            <span className={cn(activeLanguage === "en" && "text-foreground font-semibold")}>English</span>
            <span className="opacity-40">/</span>
            <span className={cn(activeLanguage === "ms" && "text-foreground font-semibold")}>Bahasa Melayu</span>
          </div>
          <Switch
            checked={activeLanguage === "ms"}
            onCheckedChange={(checked) => {
              const next: Lang = checked ? "ms" : "en";
              handleLanguageChange(next);
              void loadDiagnosticSession();
            }}
            aria-label="Toggle language"
          />
        </div>
        )}

        {/* Mnemonic intro — only for non-interactive Q1 with actual lyrics/video content */}
        {session && !session.interactive && !session.h5p_content && !hasSeenIntro && (
          (Array.isArray(mnemonicLyrics) && mnemonicLyrics.some((l) => typeof l === "string" && l.trim().length > 0)) ||
          isValidUrl(videoBroll) ||
          isValidUrl(mediaUrl)
        ) ? (
          <KineticLyrics
            lines={mnemonicLyrics}
            videoBroll={videoBroll}
            voiceoverUrl={mediaUrl}
          />
        ) : session && !session.interactive && !session.h5p_content && diagramSvg ? (
          /* Compact diagram panel — Q2+ continuity reference */
          <div className="rounded-2xl border border-border bg-card p-3 shadow-card">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {activeLanguage === "ms" ? "Rajah Konsep" : "Concept Diagram"}
              </span>
              {(Array.isArray(mnemonicLyrics) && mnemonicLyrics.some((l) => typeof l === "string" && l.trim().length > 0)) || isValidUrl(videoBroll) ? (
                <button
                  onClick={() => setHasSeenIntro(false)}
                  className="text-[10px] font-medium text-primary hover:underline"
                >
                  🎵 {activeLanguage === "ms" ? "Ulang intro" : "Review intro"}
                </button>
              ) : null}
            </div>
            <div
              className="overflow-hidden rounded-xl bg-white p-2 [&_svg]:h-auto [&_svg]:w-full"
              dangerouslySetInnerHTML={{ __html: diagramSvg }}
            />
          </div>
        ) : null}


        {/* Side actions row (TikTok-style) */}
        <div className="flex items-center gap-3 px-1 text-sm text-muted-foreground">
          <button className="flex items-center gap-1.5 hover:text-foreground transition">
            <Heart className="h-5 w-5" /> 1.2k
          </button>
          <button
            onClick={() => session?.session_id && setTutorChatOpen(true)}
            disabled={!session?.session_id}
            className="flex items-center gap-1.5 hover:text-primary-glow transition disabled:opacity-50"
            aria-label={activeLanguage === "ms" ? "Tanya Tutor" : "Ask Tutor"}
          >
            <MessageCircle className="h-5 w-5" />
            {activeLanguage === "ms" ? "Tanya Tutor" : "Ask Tutor"}
          </button>
          <span className="ml-auto flex items-center gap-1.5 text-xs">
            <span className="text-base leading-none">{prefs.avatar}</span>
            {profile?.full_name
              ? `@${profile.full_name.split(" ")[0].toLowerCase()}`
              : user?.email?.split("@")[0]
                ? `@${user.email!.split("@")[0]}`
                : "@you"}
          </span>
        </div>


        {error && session && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-xs font-semibold uppercase tracking-wider hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {inDiagnostic && diagnosticComplete ? (
          <DiagnosticCompleteScreen
            total={diagTotal}
            onGetReport={handleOpenCoach}
            onContinueFreePractice={() => {
              setStudyMode("free_practice");
              setDiagnosticComplete(false);
              if (subjects.length === 0) void loadSubjectsForLevel(formLevel, { autoStart: true });
              else if (activeSubject && activeTopic) void loadSession(activeSubject, activeTopic, activeLanguage, false);
              else void loadSubjectsForLevel(formLevel, { autoStart: true });
            }}
          />
        ) : showMaintenanceState ? (
          <section className="rounded-3xl border border-border/70 bg-card/70 p-5 backdrop-blur">
            <div className="text-xs uppercase tracking-widest text-primary-glow">
              System Maintenance
            </div>
            <h1 className="mt-2 font-display text-2xl font-semibold leading-snug">
              We’re having trouble loading your next question right now.
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Please try again in a moment. Your streak and progress are safe.
            </p>
            <Button
              onClick={() => void loadSession()}
              size="lg"
              className="mt-5 h-12 rounded-2xl bg-gradient-primary px-6 font-bold shadow-glow hover:opacity-95"
            >
              Retry
            </Button>
          </section>
        ) : isAwaitingQuestion ? (
          <RateLimitWaitingCard
            lang={activeLanguage}
            onRetry={() => inDiagnostic ? void loadDiagnosticSession() : void loadSession(activeSubject, activeTopic, activeLanguage, false)}
          />
        ) : loadGate.active && !inDiagnostic && !prefs.examMode ? (
          /* Question is still generating. Under 6s → a brief spinner; past 6s →
             a game to play. Once the question arrives the game keeps running
             until the student loses (loadGate stays active while holding), then
             the feed below takes over. */
          loadGate.showGame ? (
            <LoadingGame
              key={loadGate.round}
              lang={activeLanguage}
              onRoundEnd={loadGate.onGameEnd}
            />
          ) : (
            <div className="flex h-[76vh] flex-col items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-xs">{activeLanguage === "ms" ? "Memuatkan soalan…" : "Loading question…"}</span>
            </div>
          )
        ) : session && !inDiagnostic && !prefs.examMode ? (
          /* Shorts-style vertical feed — the primary free-practice loop */
          <QuestionFeed
            key={`${activeSubject}|${activeTopic}|${formLevel}`}
            seed={session}
            studentId={effectiveStudentId}
            subject={session.subject ?? activeSubject}
            topic={session.topic ?? activeTopic}
            apiLang={langToApi(activeLanguage)}
            lang={activeLanguage}
            formLevel={formLevel}
            questionType={session.question_type ?? "mcq"}
            timerEnabled={true}
            onOpenTutor={() => setTutorChatOpen(true)}
            headerRight={
              <button
                onClick={() => save({ examMode: true })}
                className="flex items-center gap-1.5 rounded-full border border-border bg-card/80 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
              >
                <BookOpen className="h-3.5 w-3.5" />
                {activeLanguage === "ms" ? "Mod Peperiksaan" : "SPM Exam"}
              </button>
            }
          />
        ) : session && (session.interactive || session.h5p_content) && !inDiagnostic && !prefs.examMode ? (
          <InteractiveVideoPlayer
            h5pContent={session.h5p_content as Parameters<typeof InteractiveVideoPlayer>[0]["h5pContent"]}
            interactive={session.interactive as Parameters<typeof InteractiveVideoPlayer>[0]["interactive"]}
            questionData={(session.question_data ?? {}) as Record<string, unknown>}
            sessionId={session.session_id ?? ""}
            studentId={effectiveStudentId}
            topic={session.topic ?? activeTopic}
            subject={session.subject ?? activeSubject}
            language={langToApi(activeLanguage)}
            correctAnswer={session.correct}
            mnemonicLyrics={mnemonicLyrics}
            skipIntro={hasSeenIntro}
            diagramSvg={diagramSvg}
            onIntroComplete={() => {
              const key = `kp_intro_${effectiveStudentId}_${activeSubject}_${activeTopic}`;
              localStorage.setItem(key, "1");
              setHasSeenIntro(true);
            }}
            onAnswerSubmit={(res) => {
              if (res.correct) {
                setStreak((s) => s + 1);
                setScore((x) => x + 100);
              }
              setQuestionNumber((q) => q + 1);
              void refreshDiagnosticStatus();
              if (inDiagnostic) {
                void loadDiagnosticSession();
              } else {
                void loadSession(activeSubject, activeTopic, activeLanguage, true);
              }
            }}
          />
        ) : (
          <>
            {/* Game ↔ Exam mode toggle pill */}
            <div className="flex justify-end">
              <div className="inline-flex rounded-full border border-border bg-card/80 p-0.5 shadow-sm">
                <button
                  onClick={() => save({ examMode: false })}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all",
                    !prefs.examMode
                      ? "bg-primary text-primary-foreground shadow"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Gamepad2 className="h-3.5 w-3.5" />
                  Game
                </button>
                <button
                  onClick={() => save({ examMode: true })}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all",
                    prefs.examMode
                      ? "bg-primary text-primary-foreground shadow"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  SPM Exam
                </button>
              </div>
            </div>

            {/* Exam Paper mode */}
            {prefs.examMode ? (
              <ExamPaperCard
                session={session}
                examPrefs={prefs.examPrefs}
                formLevel={formLevel}
                activeLanguage={activeLanguage}
                activeSubject={activeSubject}
                questionNumber={questionNumber}
                subPartAnswers={subPartAnswers}
                setSubPartAnswers={setSubPartAnswers}
                textAnswer={textAnswer}
                setTextAnswer={setTextAnswer}
                feedback={feedback}
                submittingText={submittingText}
                selected={selected}
                checking={checking}
                correctFlash={correctFlash}
                wrongFlash={wrongFlash}
                loading={loading}
                onSubPartsSubmit={handleSubPartsSubmit}
                onTextSubmit={handleTextSubmit}
                onAnswer={handleAnswer}
              />
            ) : (
            <>

            {levelUpLabel && (
              <div className="animate-in slide-in-from-top fade-in duration-300 flex justify-center">
                <div className="flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-1.5 text-sm font-bold text-white shadow-lg">
                  <span>↑</span>
                  <span>{activeLanguage === "ms" ? "Tahap Baru" : "Level Up"} — {levelUpLabel}</span>
                </div>
              </div>
            )}
            {session && session.kbat_level && (
              <KbatProgressBar
                kbatLevel={session.kbat_level}
                language={langToApi(activeLanguage)}
              />
            )}

            <section className={cn(
              "rounded-2xl border-2 p-5 transition-all bg-white text-zinc-900 shadow-md",
              feedback && !isBossMode && "opacity-75",
              isBossMode ? "ring-2 ring-red-500 border-red-500/60 shadow-[0_0_24px_rgba(239,68,68,0.35)]" : "border-zinc-200",
            )}>
              {isBossMode && (
                <div className="-mt-1 mb-2 inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-red-300">
                  ⚔️ Boss Mode
                </div>
              )}
              {loading || !session ? (
                <div className="space-y-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-4/5" />
                </div>
              ) : (
                <>
                  {(() => {
                    const previewText =
                      (typeof session.lesson?.summary === "string" && session.lesson.summary.trim().length > 0
                        ? session.lesson.summary
                        : session.illustrative_notes) ?? "";
                    return (
                      <button
                        type="button"
                        onClick={() => setStudyPackOpen(true)}
                        className="group mb-3 block w-full rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-left transition hover:border-amber-300 hover:bg-amber-100"
                        aria-label={activeLanguage === "ms" ? "Buka nota konsep" : "Open concept note"}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                            📖 {activeLanguage === "ms" ? "Nota Konsep" : "Concept Note"}
                          </div>
                          <div className="text-[10px] font-medium uppercase tracking-wider text-amber-600 opacity-70 group-hover:opacity-100">
                            {activeLanguage === "ms" ? "Ketuk untuk belajar →" : "Tap to study →"}
                          </div>
                        </div>
                        {previewText && (
                          <p className="mt-1 text-sm leading-relaxed text-zinc-600 line-clamp-2">
                            {previewText}
                          </p>
                        )}
                      </button>
                    );
                  })()}
                  {session.stimulus && (
                    <div className="mb-4 flex overflow-hidden rounded-xl border border-primary/25 bg-primary/5">
                      <div className="w-1 shrink-0 bg-primary" />
                      <div className="p-4">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-primary mb-2">
                          {activeLanguage === "ms" ? "Bahan Rangsangan" : "Stimulus Material"}
                        </div>
                        <p className="text-sm leading-relaxed text-zinc-700 whitespace-pre-wrap">{session.stimulus}</p>
                      </div>
                    </div>
                  )}
                  {(() => {
                    const paperLabel: Record<string, string> = {
                      mcq: activeLanguage === "ms" ? "Kertas 1 · Bahagian A" : "Paper 1 · Section A",
                      short_answer: activeLanguage === "ms" ? "Kertas 2 · Bahagian A" : "Paper 2 · Section A",
                      essay: activeLanguage === "ms" ? "Kertas 2 · Bahagian B" : "Paper 2 · Section B",
                      listening: activeLanguage === "ms" ? "Kertas 3" : "Paper 3",
                    };
                    const kbatColorMap: Record<string, string> = {
                      C1: "bg-zinc-100 text-zinc-600 border-zinc-300",
                      C2: "bg-blue-50 text-blue-600 border-blue-200",
                      C3: "bg-emerald-50 text-emerald-700 border-emerald-200",
                      C4: "bg-amber-50 text-amber-700 border-amber-200",
                      C5: "bg-orange-50 text-orange-600 border-orange-200",
                      C6: "bg-red-50 text-red-600 border-red-200",
                    };
                    const kbatKey = (session.kbat_level ?? "").toUpperCase().replace(/\s.*/, "");
                    const kbatClass = kbatColorMap[kbatKey] ?? "bg-zinc-100 text-zinc-500 border-zinc-300";
                    const label = paperLabel[session.question_type ?? "mcq"] ?? "Paper 1";
                    return (
                      <>
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <span className="rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-primary">
                            {label}
                          </span>
                          {session.kbat_level && (
                            <span className={cn("rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest", kbatClass)}>
                              {session.kbat_level}
                            </span>
                          )}
                          <span className="ml-auto text-[10px] uppercase tracking-wider text-zinc-400">
                            {(session.subject ?? activeSubject) || ""} · {activeLanguage === "ms" ? `T${formLevel}` : `F${formLevel}`}
                          </span>
                        </div>
                        <h1 className="text-xl font-semibold leading-snug tracking-tight">
                          {session.question}
                        </h1>
                      </>
                    );
                  })()}
                </>
              )}
            </section>

            {session?.question_type === "listening" && (
              <section className="rounded-3xl border border-primary/40 bg-card/60 p-4 backdrop-blur space-y-3">
                <div className="text-xs uppercase tracking-widest text-primary-glow">
                  🎧 {activeLanguage === "ms" ? "Audio Mendengar" : "Listening Audio"}
                </div>
                {isValidUrl(session.audio_url) ? (
                  <audio
                    key={session.audio_url}
                    src={session.audio_url}
                    controls
                    className="w-full"
                  />
                ) : (
                  <div className="rounded-xl border border-dashed border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                    {activeLanguage === "ms"
                      ? "Audio tidak tersedia untuk soalan ini."
                      : "Audio is not available for this question."}
                  </div>
                )}
                {typeof session.passage === "string" && session.passage.trim().length > 0 && (
                  <div className="rounded-xl border border-border/60 bg-background/40 p-3">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {activeLanguage === "ms" ? "Petikan" : "Passage"}
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                      {session.passage}
                    </p>
                  </div>
                )}
              </section>
            )}


            {(() => {
              const qt: QuestionType = session?.question_type ?? "mcq";
              if (loading || !session) {
                return (
                  <div className="grid gap-3">
                    {LETTERS.map((l) => (
                      <Skeleton key={l} className="h-16 w-full rounded-2xl" />
                    ))}
                  </div>
                );
              }
              if (qt === "short_answer") {
                const subParts = session.sub_parts;
                if (subParts && subParts.length > 0) {
                  const hasAnyAnswer = subParts.some((p) => (subPartAnswers[p.label] ?? "").trim().length > 0);
                  return (
                    <div className="flex flex-col gap-3">
                      <div className="rounded-2xl border-2 border-border/40 bg-card overflow-hidden">
                        {subParts.map((part, idx) => (
                          <div key={part.label} className={cn("p-4", idx < subParts.length - 1 && "border-b border-border/30")}>
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <p className="flex-1 text-sm leading-relaxed text-foreground">
                                <span className="font-bold text-primary mr-1.5">{part.label}</span>
                                {part.question}
                              </p>
                              <span className="mt-0.5 shrink-0 rounded border border-border/40 bg-muted/40 px-2 py-0.5 text-[10px] font-bold text-muted-foreground whitespace-nowrap">
                                [{part.marks} {activeLanguage === "ms" ? "markah" : part.marks === 1 ? "mark" : "marks"}]
                              </span>
                            </div>
                            <Textarea
                              value={subPartAnswers[part.label] ?? ""}
                              onChange={(e) => setSubPartAnswers((prev) => ({ ...prev, [part.label]: e.target.value }))}
                              disabled={!!feedback || submittingText}
                              placeholder={activeLanguage === "ms" ? "Tulis jawapan di sini…" : "Write your answer here…"}
                              className={cn(
                                "rounded-lg border-2 border-border/40 bg-background/60 px-3 py-2 text-sm leading-relaxed transition focus:border-primary",
                                part.marks === 1 ? "min-h-[44px]" : "min-h-[72px]",
                              )}
                            />
                          </div>
                        ))}
                      </div>
                      <Button
                        onClick={() => void handleSubPartsSubmit()}
                        disabled={!!feedback || submittingText || !hasAnyAnswer}
                        size="lg"
                        className="h-12 rounded-2xl bg-gradient-primary font-bold shadow-glow"
                      >
                        {submittingText ? <Loader2 className="h-5 w-5 animate-spin" /> : activeLanguage === "ms" ? "Hantar Jawapan" : "Submit Answers"}
                      </Button>
                    </div>
                  );
                }
                return (
                  <div className="flex flex-col gap-3">
                    <Input
                      value={textAnswer}
                      onChange={(e) => setTextAnswer(e.target.value)}
                      disabled={!!feedback || submittingText}
                      placeholder="Type your answer…"
                      className="h-14 rounded-2xl border-2 border-border bg-card/60 px-4 text-base"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleTextSubmit();
                      }}
                    />
                    <Button
                      onClick={() => void handleTextSubmit()}
                      disabled={!!feedback || submittingText || !textAnswer.trim()}
                      size="lg"
                      className="h-12 rounded-2xl bg-gradient-primary font-bold shadow-glow"
                    >
                      {submittingText ? <Loader2 className="h-5 w-5 animate-spin" /> : activeLanguage === "ms" ? "Hantar Jawapan" : "Submit Answer"}
                    </Button>
                  </div>
                );
              }
              if (qt === "essay") {
                const wordCount = textAnswer.trim() ? textAnswer.trim().split(/\s+/).length : 0;
                return (
                  <div className="flex flex-col gap-3">
                    <div className="relative">
                      <Textarea
                        value={textAnswer}
                        onChange={(e) => setTextAnswer(e.target.value)}
                        disabled={!!feedback || submittingText}
                        placeholder={activeLanguage === "ms" ? "Tulis karangan anda di sini…" : "Write your essay response here…"}
                        className="min-h-[220px] rounded-xl border-2 border-border/50 bg-card px-4 pb-8 pt-3 text-sm leading-relaxed"
                      />
                      <div className="pointer-events-none absolute bottom-2.5 right-3 text-[10px] font-medium tabular-nums text-muted-foreground">
                        {wordCount} {activeLanguage === "ms" ? "patah perkataan" : "words"}
                      </div>
                    </div>
                    <Button
                      onClick={() => void handleTextSubmit()}
                      disabled={!!feedback || submittingText || !textAnswer.trim()}
                      size="lg"
                      className="h-12 rounded-2xl bg-gradient-primary font-bold shadow-glow"
                    >
                      {submittingText ? <Loader2 className="h-5 w-5 animate-spin" /> : activeLanguage === "ms" ? "Hantar Karangan" : "Submit Essay"}
                    </Button>
                  </div>
                );
              }
              // mcq (default)
              if (!LETTERS.every((l) => session.options?.[l])) {
                return (
                  <div className="grid gap-3">
                    {LETTERS.map((l) => (
                      <Skeleton key={l} className="h-16 w-full rounded-2xl" />
                    ))}
                  </div>
                );
              }
              const LETTER_CIRCLE: Record<Letter, string> = {
                A: "border-red-400/80 bg-red-500 text-white",
                B: "border-blue-400/80 bg-blue-500 text-white",
                C: "border-amber-400/80 bg-amber-500 text-white",
                D: "border-emerald-400/80 bg-emerald-500 text-white",
              };
              return (
                <div className="grid gap-2.5">
                  {LETTERS.map((letter) => {
                    const isChecking = checking === letter;
                    const isSelected = selected === letter;
                    const isFlashCorrect = correctFlash === letter;
                    const isFlashWrong = wrongFlash === letter;
                    const active = isSelected || isFlashCorrect || isFlashWrong;
                    return (
                      <button
                        key={letter}
                        onClick={() => handleAnswer(letter)}
                        disabled={!!checking || !!feedback || !session}
                        className={cn(
                          "group flex items-center gap-3 rounded-xl border-2 bg-card px-4 py-3.5 text-left transition-all",
                          "border-border/40 hover:border-primary/50 hover:bg-primary/5",
                          "disabled:cursor-not-allowed disabled:opacity-60",
                          isSelected && !feedback && "border-primary bg-primary/10 scale-[1.02] shadow-sm",
                          isFlashCorrect && "border-emerald-400 bg-emerald-500/10 animate-pulse",
                          isFlashWrong && "border-destructive bg-destructive/10 animate-[shake_0.4s_ease-in-out]",
                        )}
                      >
                        <span className={cn(
                          "grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 text-sm font-extrabold transition-colors",
                          active ? LETTER_CIRCLE[letter] : "border-border/50 bg-muted/50 text-foreground",
                        )}>
                          {isChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : letter}
                        </span>
                        <span className="flex-1 text-sm font-medium leading-snug text-foreground">
                          {session?.options[letter]}
                        </span>
                      </button>
                    );
                  })}
                  <style>{`
                    @keyframes shake {
                      0%, 100% { transform: translateX(0); }
                      25% { transform: translateX(-8px); }
                      75% { transform: translateX(8px); }
                    }
                  `}</style>
                </div>
              );
            })()}
            </> /* end game-mode fragment */
            )} {/* end exam/game ternary */}
          </>
        )}
      </main>

      {/* Feedback bottom sheet — only dismissable via Next Question button */}
      <Sheet open={!!feedback && !feedback.correct && !penaltyOpen}>
        <SheetContent
          side="bottom"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className={cn(
            "rounded-t-3xl border-t-2 backdrop-blur-xl",
            feedback?.topic_complete
              ? "border-neon-green bg-[linear-gradient(135deg,oklch(0.35_0.18_150/0.95),oklch(0.25_0.12_180/0.95))] animate-pulse-glow"
              : typeof feedback?.max_marks === "number"
                ? "border-primary bg-card/95"
                : feedback?.correct
                  ? "border-neon-green bg-card/95"
                  : "border-destructive bg-card/95",
          )}
        >
          <SheetHeader className="text-left">
            <div className="flex items-center justify-between">
              <SheetTitle className="flex items-center gap-2 font-display text-2xl">
                {feedback?.topic_complete ? (
                  <>
                    <span className="text-3xl animate-bounce">🚀</span>
                    <span className="text-neon-green">Level Up!</span>
                  </>
                ) : typeof feedback?.max_marks === "number" ? (
                  <>
                    <span className="text-2xl">📝</span>
                    <span className="text-primary-glow">Graded</span>
                  </>
                ) : feedback?.correct ? (
                  <>
                    <span className="text-2xl">🎉</span>
                    <span className="text-neon-green">{t.spotOn}</span>
                  </>
                ) : (
                  <>
                    <span className="text-2xl">💡</span>
                    <span className="text-destructive">{t.notQuite}</span>
                  </>
                )}
              </SheetTitle>
            </div>
          </SheetHeader>
          <div className="mx-auto max-w-md space-y-4 pb-2 pt-3">
            {typeof feedback?.max_marks === "number" && (
              <div className="rounded-2xl border border-primary/40 bg-primary/10 p-4">
                <div className="text-xs uppercase tracking-widest text-primary-glow">
                  Score
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-display text-3xl font-bold text-foreground">
                    {(feedback.marks_awarded ?? 0).toFixed(1)}
                  </span>
                  <span className="text-lg text-muted-foreground">
                    / {feedback.max_marks}
                  </span>
                  {typeof feedback.partial_credit === "number" && (
                    <span className="ml-auto rounded-full bg-background/60 px-3 py-1 text-xs font-semibold text-foreground">
                      {Math.round(feedback.partial_credit * 100)}%
                    </span>
                  )}
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-background/50">
                  <div
                    className="h-full rounded-full bg-gradient-primary transition-all"
                    style={{
                      width: `${Math.max(0, Math.min(1, feedback.partial_credit ?? (feedback.max_marks ? (feedback.marks_awarded ?? 0) / feedback.max_marks : 0))) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}
            <div className="rounded-2xl border border-border bg-background/50 p-4">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                {t.diagnosticFeedback}
              </div>
              <p className="mt-2 text-base leading-relaxed">{feedback?.feedback}</p>
            </div>
            {feedback?.misconception && !feedback.correct && (
              <div className="rounded-2xl border border-warning/40 bg-warning/10 p-4">
                <div className="text-xs uppercase tracking-widest text-warning">
                  {t.commonMisconception}
                </div>
                <p className="mt-1 text-sm text-foreground/90">{feedback.misconception}</p>
              </div>
            )}
            {session?.worked_example && !feedback?.correct && (
              <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-4">
                <div className="text-xs font-semibold uppercase tracking-widest text-indigo-400">
                  📐 {activeLanguage === "ms" ? "Cara menyelesaikan:" : "How to work through it:"}
                </div>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                  {session.worked_example}
                </p>
              </div>
            )}
            {session?.source_excerpt && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-widest text-amber-400">
                  📖 {activeLanguage === "ms" ? "Dari buku teks" : "From the textbook"}
                </div>
                <div className="mt-1 border-t border-amber-500/20 pt-2">
                  <p className="text-sm italic text-amber-100/90">"{session.source_excerpt}"</p>
                </div>
              </div>
            )}
            {/* Penalty earned (every 3rd wrong) — offered as a tap, never
                auto-opened, so the graded feedback above stays readable. */}
            {penaltyAvailable && !feedback?.topic_complete && (
              <Button
                onClick={() => setPenaltyOpen(true)}
                size="lg"
                variant="outline"
                className="h-14 w-full rounded-2xl border-2 border-fuchsia-400/60 bg-gradient-to-r from-fuchsia-500/15 to-indigo-500/15 text-base font-bold text-fuchsia-100 hover:from-fuchsia-500/25 hover:to-indigo-500/25"
              >
                <Gamepad2 className="mr-1 h-5 w-5" />
                {activeLanguage === "ms" ? "Main untuk pulih 🎮" : "Play to recover 🎮"}
              </Button>
            )}
            <Button
              onClick={handleNext}
              size="lg"
              className={cn(
                "h-14 w-full rounded-2xl text-base font-bold shadow-glow hover:opacity-95",
                feedback?.topic_complete
                  ? "bg-[linear-gradient(135deg,oklch(0.78_0.24_145),oklch(0.65_0.22_175))] text-background"
                  : penaltyAvailable
                    ? "bg-card/80 text-foreground/90 hover:bg-card"
                    : "bg-gradient-primary",
              )}
            >
              {feedback?.topic_complete && feedback.next_topic
                ? `Advance to ${feedback.next_topic} →`
                : t.nextQuestion}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
      {session && (
        <LessonNotesModal
          open={studyPackOpen}
          onClose={() => setStudyPackOpen(false)}
          lesson={session.lesson ?? null}
          subject={session.subject ?? activeSubject}
          topic={session.topic ?? activeTopic}
          language={activeLanguage}
          formLevel={formLevel}
          onLessonUpdate={(fresh) => setSession((s) => s ? { ...s, lesson: fresh } : s)}
        />
      )}
      {session?.session_id && (
        <TutorChatDrawer
          open={tutorChatOpen}
          onClose={() => setTutorChatOpen(false)}
          studentId={effectiveStudentId}
          lessonId={session.lesson_id ?? null}
          questionContext={{
            session_id: session.session_id,
            question: session.question,
            options: session.options,
            correct_answer: session.correct,
            topic: session.topic,
            subject: session.subject,
            passage: session.passage ?? session.stimulus,
          }}
          language={activeLanguage}
        />
      )}

      <StudentSettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onOpenExamPrefs={() => setExamPrefsOpen(true)}
      />
      <ExamPrefsSheet open={examPrefsOpen} onClose={() => setExamPrefsOpen(false)} />

      <PraiseOverlay
        show={praiseOn}
        pointsAwarded={lastPoints}
        onFire={streak >= 3}
        mastered={praiseMastered}
      />
      <BossBattleIntro
        show={bossIntroOpen}
        masteryPct={bossIntroMastery}
        onDone={() => {
          setBossIntroOpen(false);
          setIsBossMode(true);
        }}
      />
      <PenaltyGameModal
        open={penaltyOpen}
        studentId={effectiveStudentId}
        sessionId={session?.session_id}
        onComplete={handlePenaltyComplete}
        challenge={buildChallenge(session)}
        topic={session?.topic}
        subject={session?.subject}
      />
      <StudyCoachModal
        open={coachOpen}
        loading={coachLoading}
        narrative={coachNarrative}
        errorMessage={coachError}
        onClose={() => setCoachOpen(false)}
        onStartPractice={handleCoachStartPractice}
      />

    </div>
  );
}
