import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  Send,
  Loader2,
  BookOpen,
  ListChecks,
  ClipboardCheck,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  MessageSquare,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  BASE_URL,
  sendTeacherChat,
  fetchTeacherChatHistory,
  fetchLessonById,
  type TeacherChatMessage,
  type TeacherChatArtifact,
  type Lesson,
} from "@/services/api";
import { LessonSlideDeck } from "@/components/LessonSlideDeck";

/**
 * AI Controller — the teacher talks to the platform in plain language.
 * It reads what students are weak at, generates slides/questions grounded in the
 * DSKP syllabus, assigns tasks, and remembers what was already assigned.
 * Backed by POST /teacher/chat (agents/teacher_agent.py planner loop).
 */

const SUGGESTIONS = [
  "Which topics is the class weakest on right now?",
  "Make a 5-question MCQ quiz on Photosynthesis for Form 4 Biology.",
  "Generate slides on Kinematics, then assign a practice task to the weak students.",
  "What have I assigned so far this week?",
];

const VOICE_MODE_KEY = "kp_ai_controller_voice_mode";

function getSpeechRecognition() {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/gs, "$1")
    .replace(/\*(.+?)\*/gs, "$1")
    .replace(/#{1,6}\s+/g, "")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/[-*_]{3,}/g, "")
    .trim();
}

function pickVoice(voices: SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | undefined {
  const prefix = lang.split("-")[0];
  const neural = (v: SpeechSynthesisVoice) =>
    v.name.toLowerCase().includes("neural") || v.name.toLowerCase().includes("enhanced");
  return (
    voices.find((v) => v.lang === lang && neural(v)) ||
    voices.find((v) => v.lang === lang) ||
    voices.find((v) => v.lang.startsWith(prefix) && neural(v)) ||
    voices.find((v) => v.lang.startsWith(prefix))
  );
}

function ArtifactCard({
  a,
  onOpenLesson,
  loading,
}: {
  a: TeacherChatArtifact;
  onOpenLesson?: (a: TeacherChatArtifact) => void;
  loading?: boolean;
}) {
  if (a.type === "lesson") {
    const clickable = !!a.lesson_id && !!onOpenLesson;
    return (
      <button
        type="button"
        disabled={!clickable || loading}
        onClick={clickable ? () => onOpenLesson!(a) : undefined}
        className={cn(
          "mt-2 flex w-full items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3 text-left transition",
          clickable && "hover:border-primary/60 hover:bg-primary/10",
        )}
      >
        {loading ? (
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary-glow" />
        ) : (
          <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-primary-glow" />
        )}
        <div className="text-sm">
          <div className="font-semibold text-foreground">Slides / notes ready</div>
          <div className="text-muted-foreground">{a.title || a.topic}</div>
          {clickable && (
            <div className="mt-0.5 text-xs text-primary-glow">
              {loading ? "Opening…" : "Tap to preview"}
            </div>
          )}
        </div>
      </button>
    );
  }
  if (a.type === "quiz") {
    return (
      <div className="mt-2 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/5 p-3">
        <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <div className="text-sm">
          <div className="font-semibold text-foreground">
            {a.num_questions ?? ""} {a.question_type?.toUpperCase() || "quiz"} question(s)
          </div>
          <div className="text-muted-foreground">{a.topic}</div>
          {a.quiz_id && (
            <div className="mt-0.5 text-xs text-muted-foreground/70">Quiz ID: {a.quiz_id}</div>
          )}
        </div>
      </div>
    );
  }
  // assignment
  return (
    <div className="mt-2 flex items-start gap-3 rounded-xl border border-success/30 bg-success/5 p-3">
      <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
      <div className="text-sm">
        <div className="font-semibold text-foreground">
          Assigned to {a.student_count ?? 0} student(s)
        </div>
        <div className="text-muted-foreground">
          {a.task_type} · {a.topic}
        </div>
        {a.students && a.students.length > 0 && (
          <div className="mt-0.5 text-xs text-muted-foreground/70">{a.students.join(", ")}</div>
        )}
      </div>
    </div>
  );
}

export function AiControllerPanel() {
  const [messages, setMessages] = useState<TeacherChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Voice mode
  const [voiceMode, setVoiceMode] = useState<boolean>(
    () => localStorage.getItem(VOICE_MODE_KEY) === "true",
  );
  const [listening, setListening] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Lesson preview
  const [previewLesson, setPreviewLesson] = useState<Lesson | null>(null);
  const [previewMeta, setPreviewMeta] = useState<{ topic: string; subject: string } | null>(null);
  const [loadingLessonId, setLoadingLessonId] = useState<string | null>(null);

  // Cache TTS voices
  useEffect(() => {
    if (!window.speechSynthesis) return;
    const load = () => { voicesRef.current = window.speechSynthesis.getVoices(); };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  useEffect(() => {
    localStorage.setItem(VOICE_MODE_KEY, String(voiceMode));
  }, [voiceMode]);

  // Stop audio/listening on unmount
  useEffect(() => {
    return () => {
      stopAllAudio();
      stopListening();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openLesson = async (a: TeacherChatArtifact) => {
    if (!a.lesson_id) return;
    setLoadingLessonId(a.lesson_id);
    setError(null);
    try {
      const lesson = await fetchLessonById(a.lesson_id);
      setPreviewLesson(lesson);
      setPreviewMeta({ topic: a.topic || lesson.title || "", subject: a.subject || "" });
    } catch (e) {
      console.error("[AiController] lesson preview failed", e);
      setError("Couldn't open that lesson. Try again in a moment.");
    } finally {
      setLoadingLessonId(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const hist = await fetchTeacherChatHistory();
        if (!cancelled) setMessages(hist);
      } catch (e) {
        console.warn("[AiController] history load failed", e);
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  // ── Voice helpers ─────────────────────────────────────────────────────────

  function stopAllAudio() {
    window.speechSynthesis?.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setSpeakingId(null);
  }

  function speakBrowser(text: string, id: string) {
    if (!window.speechSynthesis) return;
    const utt = new SpeechSynthesisUtterance(stripMarkdown(text));
    utt.lang = "en-US";
    const voice = pickVoice(voicesRef.current, "en-US");
    if (voice) utt.voice = voice;
    utt.rate = 0.9;
    setSpeakingId(id);
    utt.onend = () => setSpeakingId(null);
    utt.onerror = () => setSpeakingId(null);
    window.speechSynthesis.speak(utt);
  }

  function playReply(text: string, id: string) {
    stopAllAudio();
    const url = `${BASE_URL}/tts/stream?text=${encodeURIComponent(stripMarkdown(text))}&lang=en`;
    const audio = new Audio(url);
    audioRef.current = audio;
    setSpeakingId(id);
    audio.onended = () => { setSpeakingId(null); audioRef.current = null; };
    audio.onerror = () => { audioRef.current = null; speakBrowser(text, id); };
    audio.play().catch(() => { audioRef.current = null; speakBrowser(text, id); });
  }

  function handleSpeak(msgId: string, content: string) {
    if (speakingId === msgId) { stopAllAudio(); return; }
    playReply(content, msgId);
  }

  function toggleVoiceMode() {
    stopAllAudio();
    stopListening();
    setVoiceMode((v) => !v);
  }

  function startListening() {
    setMicError(null);
    const SpeechRecognitionCtor = getSpeechRecognition();
    if (!SpeechRecognitionCtor) {
      setMicError("Voice input not supported. Please use Chrome or Edge.");
      return;
    }
    stopListening();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = new SpeechRecognitionCtor() as any;
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const transcript = (e.results[0]?.[0]?.transcript as string) ?? "";
      setListening(false);
      if (transcript) {
        setInput(transcript);
        void send(transcript);
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      setListening(false);
      if (e.error === "not-allowed" || e.error === "permission-denied") {
        setMicError("Microphone access denied. Allow microphone in your browser settings.");
      } else if (e.error === "no-speech") {
        setMicError("No speech detected. Try again.");
      } else {
        setMicError("Mic error: " + e.error);
      }
    };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch (err) {
      setListening(false);
      setMicError("Could not start microphone. Try again.");
      console.error("[Mic] rec.start() threw:", err);
    }
  }

  function stopListening() {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setListening(false);
  }

  // ── Send ──────────────────────────────────────────────────────────────────

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || sending) return;
    setError(null);
    setMicError(null);
    setMessages((m) => [...m, { role: "teacher", content: msg }]);
    setInput("");
    setSending(true);
    try {
      const { reply, artifacts } = await sendTeacherChat(msg);
      const msgId = `ai-${Date.now()}`;
      setMessages((m) => [...m, { role: "assistant", content: reply, artifacts, id: msgId }]);
      if (voiceMode && reply) playReply(reply, msgId);
    } catch (e) {
      console.error("[AiController] send failed", e);
      setError("The controller failed to respond. Try again in a moment.");
    } finally {
      setSending(false);
    }
  };

  const empty = !loadingHistory && messages.length === 0;

  return (
    <div className="flex h-[calc(100dvh-13rem)] flex-col rounded-2xl border border-border bg-card/60 shadow-card">
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-primary">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <div className="font-display text-sm font-bold">AI Controller</div>
            <div className="text-xs text-muted-foreground">
              Ask it to check weak topics, make slides & questions, or assign tasks.
            </div>
          </div>
        </div>
        <button
          onClick={toggleVoiceMode}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            voiceMode
              ? "bg-primary text-primary-foreground"
              : "bg-muted/60 text-muted-foreground hover:text-foreground",
          )}
          aria-label={voiceMode ? "Switch to text mode" : "Switch to voice mode"}
        >
          {voiceMode ? (
            <><Volume2 className="h-3.5 w-3.5" />Voice</>
          ) : (
            <><MessageSquare className="h-3.5 w-3.5" />Text</>
          )}
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {loadingHistory && (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {empty && (
          <div className="mx-auto max-w-xl pt-6 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gradient-primary">
              <Sparkles className="h-6 w-6 text-primary-foreground" />
            </div>
            <h3 className="mt-3 font-display text-lg font-bold">Run your class from one chat</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              I know who's weak at what and what you've assigned. Tell me what you need.
            </p>
            <div className="mt-4 grid gap-2 text-left">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => void send(s)}
                  className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground transition hover:border-primary/50 hover:bg-card/80"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => {
          const msgId = m.id ?? String(i);
          const isSpeaking = speakingId === msgId;
          return (
            <div
              key={msgId}
              className={cn("flex", m.role === "teacher" ? "justify-end" : "justify-start")}
            >
              <div className={cn("flex flex-col gap-1", m.role === "teacher" ? "items-end" : "items-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                    m.role === "teacher"
                      ? "rounded-br-md bg-primary text-primary-foreground"
                      : "rounded-bl-md bg-muted/60 text-foreground",
                    isSpeaking && "ring-2 ring-primary/50",
                  )}
                >
                  <span className="whitespace-pre-wrap">{m.content}</span>
                  {m.artifacts?.map((a, j) => (
                    <ArtifactCard
                      key={j}
                      a={a}
                      onOpenLesson={openLesson}
                      loading={!!a.lesson_id && loadingLessonId === a.lesson_id}
                    />
                  ))}
                </div>
                {m.role === "assistant" && (
                  <button
                    onClick={() => handleSpeak(msgId, m.content)}
                    className={cn(
                      "flex items-center gap-1 rounded-full px-2 py-1 text-xs transition-colors",
                      isSpeaking
                        ? "bg-primary/20 text-primary"
                        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                    )}
                    aria-label={isSpeaking ? "Stop" : "Listen"}
                  >
                    {isSpeaking ? (
                      <><VolumeX className="h-3.5 w-3.5" />Stop</>
                    ) : (
                      <><Volume2 className="h-3.5 w-3.5" />Listen</>
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md bg-muted/60 px-4 py-2.5 text-sm text-muted-foreground">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              Working on it…
            </div>
          </div>
        )}
      </div>

      {(error || micError) && (
        <div className="px-4 pb-1 text-xs text-destructive">{error ?? micError}</div>
      )}

      <div className="flex items-center gap-2 border-t border-border/60 p-3">
        <button
          onClick={listening ? stopListening : startListening}
          disabled={sending}
          title={listening ? "Tap to stop" : "Speak to AI Controller"}
          className={cn(
            "grid h-11 w-11 shrink-0 place-items-center rounded-2xl transition-colors",
            listening
              ? "animate-pulse bg-destructive text-destructive-foreground"
              : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
          aria-label={listening ? "Stop listening" : "Speak"}
        >
          {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>

        <Input
          value={input}
          onChange={(e) => { setInput(e.target.value); setMicError(null); }}
          placeholder={
            listening
              ? "Listening…"
              : "e.g. Quiz the weak students on Kinematics and assign it"
          }
          disabled={sending || listening}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          className="h-11 rounded-2xl"
        />
        <Button
          onClick={() => void send(input)}
          disabled={sending || !input.trim()}
          size="icon"
          className="h-11 w-11 shrink-0 rounded-2xl bg-gradient-primary"
          aria-label="Send"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>

      <LessonSlideDeck
        open={!!previewLesson}
        onClose={() => setPreviewLesson(null)}
        lesson={previewLesson}
        subject={previewMeta?.subject || ""}
        topic={previewMeta?.topic || ""}
      />
    </div>
  );
}
