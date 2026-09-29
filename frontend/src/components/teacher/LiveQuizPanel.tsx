import { useEffect, useRef, useState } from "react";
import { Loader2, X, Trophy, Radio, StopCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  startSession,
  startLiveSession,
  endLiveSession,
  type SessionResponse,
  type LiveSession,
  type LiveAnswer,
} from "@/services/api";

interface Props {
  classroomId: string;
  classroomName: string;
  classroomSubject: string | null;
  teacherId: string;
  onClose: () => void;
}

const LETTER_COLOR: Record<string, string> = {
  A: "bg-red-500/20 border-red-400/50 text-red-100",
  B: "bg-blue-500/20 border-blue-400/50 text-blue-100",
  C: "bg-amber-500/20 border-amber-400/50 text-amber-100",
  D: "bg-emerald-500/20 border-emerald-400/50 text-emerald-100",
};

export function LiveQuizPanel({ classroomId, classroomName, classroomSubject, teacherId, onClose }: Props) {
  const [step, setStep] = useState<"config" | "preview" | "live">("config");
  const [topic, setTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedSession, setGeneratedSession] = useState<SessionResponse | null>(null);
  const [liveSession, setLiveSession] = useState<LiveSession | null>(null);
  const [leaderboard, setLeaderboard] = useState<LiveAnswer[]>([]);
  const [ending, setEnding] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const generateQuestion = async () => {
    if (!topic.trim()) return;
    setGenerating(true);
    try {
      const sess = await startSession(
        teacherId,
        topic.trim(),
        "KSSM",
        "ms",
        classroomSubject ?? "Mathematics",
        undefined,
        false,
        "mcq",
        4,
      );
      setGeneratedSession(sess);
      setStep("preview");
    } catch {
      alert("Failed to generate question. Try again.");
    } finally {
      setGenerating(false);
    }
  };

  const broadcast = async () => {
    if (!generatedSession) return;
    try {
      const live = await startLiveSession({
        classroom_id: classroomId,
        teacher_id: teacherId,
        question: generatedSession.question,
        options: generatedSession.options,
        correct_answer: generatedSession.correct ?? "",
        question_type: generatedSession.question_type ?? "mcq",
        subject: generatedSession.subject ?? classroomSubject ?? undefined,
        topic: generatedSession.topic ?? topic,
        object_lesson: generatedSession.object_lesson ?? undefined,
      });
      setLiveSession(live);
      setStep("live");
    } catch {
      alert("Failed to broadcast. Try again.");
    }
  };

  // Subscribe to live answers via Supabase Realtime
  useEffect(() => {
    if (step !== "live" || !liveSession) return;
    const channel = supabase
      .channel(`live-answers-${liveSession.id}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "classroom_live_answers", filter: `live_session_id=eq.${liveSession.id}` },
        (payload: { new: LiveAnswer }) => {
          const ans = payload.new;
          setLeaderboard((prev) => {
            if (prev.some((a) => a.student_id === ans.student_id)) return prev;
            return [...prev, ans].sort((a, b) =>
              new Date(a.answered_at).getTime() - new Date(b.answered_at).getTime()
            );
          });
        },
      )
      .subscribe();
    channelRef.current = channel;
    return () => { void supabase.removeChannel(channel); };
  }, [step, liveSession]);

  const endSession = async () => {
    if (!liveSession) return;
    setEnding(true);
    try {
      const { leaderboard: final } = await endLiveSession(liveSession.id);
      setLeaderboard(final);
      setLiveSession(null);
      setStep("config");
      setTopic("");
      setGeneratedSession(null);
    } finally {
      setEnding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm p-4 pt-12 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#1a0533] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-amber-400" />
            <span className="font-semibold text-white">Live Quiz — {classroomName}</span>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-white/50 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Step 1: Config */}
          {step === "config" && (
            <>
              <p className="text-sm text-white/60">
                Generate a question and broadcast it live to all students in this classroom.
              </p>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-white/50">
                  Topic
                </label>
                <input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. Quadratic Functions"
                  className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 focus:border-amber-400/60 focus:outline-none"
                />
              </div>
              <Button
                onClick={() => void generateQuestion()}
                disabled={!topic.trim() || generating}
                className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 font-bold text-white hover:opacity-90"
              >
                {generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</> : "Generate Question"}
              </Button>
            </>
          )}

          {/* Step 2: Preview */}
          {step === "preview" && generatedSession && (
            <>
              {generatedSession.object_lesson && (
                <div className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-200/80 ring-1 ring-amber-400/20">
                  <span className="mr-1 font-semibold text-amber-300">🌏 Situasi:</span>
                  {generatedSession.object_lesson}
                </div>
              )}
              <p className="text-base font-semibold text-white leading-relaxed">{generatedSession.question}</p>
              <div className="grid grid-cols-2 gap-2">
                {(["A", "B", "C", "D"] as const).map((letter) => (
                  <div key={letter} className={`rounded-xl border px-3 py-2 text-sm ${LETTER_COLOR[letter]}`}>
                    <span className="mr-1.5 font-bold">{letter}.</span>{generatedSession.options[letter]}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("config")} className="flex-1 rounded-xl border-white/20 text-white hover:bg-white/10">
                  Regenerate
                </Button>
                <Button onClick={() => void broadcast()} className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 font-bold text-white hover:opacity-90">
                  <Radio className="h-4 w-4" /> Broadcast to Class
                </Button>
              </div>
            </>
          )}

          {/* Step 3: Live leaderboard */}
          {step === "live" && liveSession && (
            <>
              <div className="flex items-center gap-2 rounded-xl bg-green-500/10 px-4 py-2.5 ring-1 ring-green-400/30">
                <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-sm font-semibold text-green-300">Broadcasting live to class</span>
              </div>
              <p className="text-sm text-white/80 leading-snug">{liveSession.question}</p>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/40 px-1">
                  <Trophy className="h-3.5 w-3.5" />
                  <span>Live Results ({leaderboard.length} answered)</span>
                </div>
                {leaderboard.length === 0 ? (
                  <p className="text-center py-6 text-sm text-white/30">Waiting for students to answer…</p>
                ) : (
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {leaderboard.map((row, i) => (
                      <div key={row.student_id} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${row.is_correct ? "bg-green-500/10 ring-1 ring-green-400/20" : "bg-white/5"}`}>
                        <span className="w-6 text-center font-bold text-white/40 text-xs">#{i + 1}</span>
                        <span className="flex-1 font-medium text-white">{row.student_name ?? "Student"}</span>
                        <span className={row.is_correct ? "font-bold text-green-400" : "text-red-400"}>
                          {row.is_correct ? "✓" : "✗"} {row.answer}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Button
                onClick={() => void endSession()}
                disabled={ending}
                className="w-full rounded-xl bg-red-600/80 font-bold text-white hover:bg-red-600"
              >
                {ending ? <Loader2 className="h-4 w-4 animate-spin" /> : <StopCircle className="h-4 w-4" />}
                End Session
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
