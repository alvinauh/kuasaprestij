import { useEffect, useRef, useState } from "react";
import { Loader2, MessageCircle, MessageSquare, Mic, MicOff, Send, Volume2, VolumeX, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  BASE_URL,
  fetchChatHistory,
  fetchChatHistoryBySession,
  sendChatMessage,
  type ChatMessage,
  type TutorQuestionContext,
} from "@/services/api";

interface Props {
  open: boolean;
  onClose: () => void;
  studentId: string;
  lessonId?: string | null;
  questionContext?: TutorQuestionContext;
  /** UI language ("en" | "ms") — used as TTS fallback for content subjects */
  language?: "en" | "ms" | string;
}

const VOICE_MODE_KEY = "kp_tutor_voice_mode";

function getSpeechRecognition() {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null;
}

/**
 * Derive Web-Speech-API lang tag from the question subject or UI language.
 * The backend already maps subjects → neural voice; this is only for the
 * fallback browser TTS and for speech recognition input.
 */
function resolveSpeechLang(subject: string | undefined, uiLang: string): string {
  const s = (subject || "").toLowerCase();
  if (s.includes("melayu") || s.includes("malaysia")) return "ms-MY";
  if (s.includes("cina") || s.includes("chinese") || s.includes("mandarin")) return "zh-CN";
  if (s.includes("english") || s.includes("inggeris")) return "en-US";
  // content subject → follow UI language
  const l = uiLang.toLowerCase();
  if (l === "ms" || l.includes("melayu")) return "ms-MY";
  return "en-US";
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

export function TutorChatDrawer({ open, onClose, studentId, lessonId, questionContext, language = "en" }: Props) {
  const isMs = language === "ms";
  const isZh = language === "zh";
  const speechLang = resolveSpeechLang(questionContext?.subject, language);
  // BM recognition also handles English code-switching well in Chrome, so default
  // Malaysian students (EN or MS UI) to ms-MY; Chinese UI gets zh-CN.
  const inputLang = isZh ? "zh-CN" : "ms-MY";

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [voiceMode, setVoiceMode] = useState<boolean>(
    () => localStorage.getItem(VOICE_MODE_KEY) === "true"
  );
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const sessionId = questionContext?.session_id;

  // Cache TTS voices (browser loads them async via voiceschanged)
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

  useEffect(() => {
    if (!open) return;
    if (!lessonId && !sessionId) {
      setMessages([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoadingHistory(true);
    setError(null);
    (async () => {
      try {
        const list = lessonId
          ? await fetchChatHistory(lessonId, studentId)
          : await fetchChatHistoryBySession(sessionId!, studentId);
        if (!cancelled) setMessages(list);
      } catch (e) {
        if (!cancelled) {
          console.warn("[Tutor] history load failed", e);
          setMessages([]);
        }
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, lessonId, studentId, sessionId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    if (!open) {
      stopAllAudio();
      stopListening();
    }
  }, [open]);

  function stopAllAudio() {
    window.speechSynthesis?.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setSpeakingId(null);
  }

  /** Stream TTS from /tts/stream (Kokoro EN/BM, edge-tts ZH). Falls back to browser TTS. */
  function playReply(text: string, id: string, ttsLang?: string) {
    stopAllAudio();
    const lang = ttsLang ?? (speechLang.startsWith("ms") ? "ms" : speechLang.startsWith("zh") ? "zh" : "en");
    const url = `${BASE_URL}/tts/stream?text=${encodeURIComponent(stripMarkdown(text))}&lang=${lang}`;
    const audio = new Audio(url);
    audioRef.current = audio;
    setSpeakingId(id);
    audio.onended = () => { setSpeakingId(null); audioRef.current = null; };
    audio.onerror = () => {
      audioRef.current = null;
      speakBrowser(text, id);
    };
    audio.play().catch(() => {
      audioRef.current = null;
      speakBrowser(text, id);
    });
  }

  function speakBrowser(text: string, id: string) {
    if (!window.speechSynthesis) return;
    const utt = new SpeechSynthesisUtterance(stripMarkdown(text));
    utt.lang = speechLang;
    const voice = pickVoice(voicesRef.current, speechLang);
    if (voice) utt.voice = voice;
    utt.rate = 0.9;
    setSpeakingId(id);
    utt.onend = () => setSpeakingId(null);
    utt.onerror = () => setSpeakingId(null);
    window.speechSynthesis.speak(utt);
  }

  function toggleVoiceMode() {
    stopAllAudio();
    stopListening();
    setVoiceMode((v) => !v);
  }

  function handleSpeak(msgId: string, content: string, ttsLang?: string) {
    if (speakingId === msgId) {
      stopAllAudio();
      return;
    }
    playReply(content, msgId, ttsLang);
  }

  function startListening() {
    setMicError(null);
    const SpeechRecognitionCtor = getSpeechRecognition();
    if (!SpeechRecognitionCtor) {
      setMicError(isMs
        ? "Pelayar anda tidak menyokong input suara. Sila guna Chrome atau Edge."
        : "Voice input not supported. Please use Chrome or Edge.");
      return;
    }
    stopListening();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = new SpeechRecognitionCtor() as any;
    rec.lang = inputLang;
    rec.continuous = false;
    rec.interimResults = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const transcript = (e.results[0]?.[0]?.transcript as string) ?? "";
      setListening(false);
      if (transcript) {
        setInput(transcript);
        handleSend(transcript);
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      setListening(false);
      if (e.error === "not-allowed" || e.error === "permission-denied") {
        setMicError(isMs
          ? "Akses mikrofon ditolak. Benarkan mikrofon dalam tetapan pelayar anda."
          : "Microphone access denied. Allow microphone in your browser settings.");
      } else if (e.error === "no-speech") {
        setMicError(isMs ? "Tiada suara dikesan. Cuba lagi." : "No speech detected. Try again.");
      } else {
        setMicError(isMs ? "Ralat mikrofon: " + e.error : "Mic error: " + e.error);
      }
    };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch (err) {
      setListening(false);
      setMicError(isMs
        ? "Tidak dapat memulakan mikrofon. Cuba lagi."
        : "Could not start microphone. Try again.");
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

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || sending) return;
    setError(null);
    const optimistic: ChatMessage = {
      id: `tmp-${Date.now()}`,
      role: "student",
      content: text,
      created_at: new Date().toISOString(),
    };
    const priorTurns = messages;
    setMessages((m) => [...m, optimistic]);
    setInput("");
    setSending(true);
    try {
      const { reply, tts_lang, message } = await sendChatMessage(
        studentId,
        lessonId,
        text,
        questionContext,
        priorTurns,
        language,
      );
      const msgId = `tutor-${Date.now()}`;
      const tutorMsg: ChatMessage = message ?? {
        id: msgId,
        role: "tutor",
        content: reply || (isMs ? "(Tiada balasan)" : "(No reply)"),
        created_at: new Date().toISOString(),
      };
      if (!tutorMsg.id) tutorMsg.id = msgId;
      setMessages((m) => [...m, tutorMsg]);
      if (voiceMode && tutorMsg.content) {
        playReply(tutorMsg.content, tutorMsg.id!, tts_lang);
      }
    } catch (e) {
      console.error("[Tutor] send failed", e);
      setError(isMs ? "Gagal menghantar mesej." : "Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <SheetContent
        side="bottom"
        className="h-[80dvh] rounded-t-3xl border-t-2 border-primary/40 bg-card/95 backdrop-blur-xl p-0 flex flex-col"
      >
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border/60 text-left">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 font-display text-xl">
              <MessageCircle className="h-5 w-5 text-primary-glow" />
              {isMs ? "Tanya Tutor" : "Ask Tutor"}
            </SheetTitle>
            <div className="flex items-center gap-2">
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
                  <><Volume2 className="h-3.5 w-3.5" />{isMs ? "Suara" : "Voice"}</>
                ) : (
                  <><MessageSquare className="h-3.5 w-3.5" />{isMs ? "Teks" : "Text"}</>
                )}
              </button>
              <button
                onClick={onClose}
                className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted/40"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </SheetHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {loadingHistory ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-10">
              {isMs
                ? "Tiada mesej lagi. Tanya tutor apa-apa tentang soalan ini."
                : "No messages yet. Ask the tutor anything about this question."}
            </div>
          ) : (
            messages.map((m, i) => {
              const msgId = m.id ?? String(i);
              const isSpeaking = speakingId === msgId;
              return (
                <div
                  key={msgId}
                  className={cn("flex", m.role === "student" ? "justify-end" : "justify-start")}
                >
                  <div className={cn("flex flex-col gap-1", m.role === "student" ? "items-end" : "items-start")}>
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                        m.role === "student"
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-muted/60 text-foreground rounded-bl-md",
                        isSpeaking && "ring-2 ring-primary/50",
                      )}
                    >
                      {m.content}
                    </div>
                    {m.role === "tutor" && (
                      <button
                        onClick={() => handleSpeak(msgId, m.content)}
                        className={cn(
                          "flex items-center gap-1 text-xs px-2 py-1 rounded-full transition-colors",
                          isSpeaking
                            ? "bg-primary/20 text-primary"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
                        )}
                        aria-label={isSpeaking ? "Stop" : "Listen"}
                      >
                        {isSpeaking ? (
                          <><VolumeX className="h-3.5 w-3.5" />{isMs ? "Berhenti" : "Stop"}</>
                        ) : (
                          <><Volume2 className="h-3.5 w-3.5" />{isMs ? "Dengar" : "Listen"}</>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
          {sending && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md bg-muted/60 px-4 py-2.5 text-sm text-muted-foreground">
                <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
                {isMs ? "Tutor sedang menaip..." : "Tutor is typing..."}
              </div>
            </div>
          )}
        </div>

        {(error || micError) && (
          <div className="px-4 pb-2 text-xs text-destructive">{error ?? micError}</div>
        )}

        <div className="border-t border-border/60 p-3 flex items-center gap-2">
          <button
            onClick={listening ? stopListening : startListening}
            disabled={sending}
            title={
              listening
                ? (isMs ? "Ketik untuk berhenti" : "Tap to stop")
                : (isMs ? "Bercakap kepada tutor" : "Speak to tutor")
            }
            className={cn(
              "grid h-11 w-11 place-items-center rounded-2xl shrink-0 transition-colors",
              listening
                ? "bg-destructive text-destructive-foreground animate-pulse"
                : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
            aria-label={listening ? (isMs ? "Berhenti mendengar" : "Stop listening") : (isMs ? "Bercakap" : "Speak")}
          >
            {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>

          <Input
            value={input}
            onChange={(e) => { setInput(e.target.value); setMicError(null); }}
            placeholder={
              listening
                ? (isMs ? "Mendengar..." : "Listening...")
                : (isMs ? "Tulis atau bercakap..." : "Type or speak...")
            }
            disabled={sending || listening}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            className="h-11 rounded-2xl"
          />
          <Button
            onClick={() => void handleSend()}
            disabled={sending || !input.trim()}
            size="icon"
            className="h-11 w-11 rounded-2xl bg-gradient-primary shrink-0"
            aria-label="Send"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
