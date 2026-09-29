import { useEffect, useRef, useState } from "react";
import { Loader2, Trophy, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { submitLiveAnswer, type LiveSession, type LiveAnswer } from "@/services/api";

type Letter = "A" | "B" | "C" | "D";
const LETTERS: Letter[] = ["A", "B", "C", "D"];
const LETTER_STYLE: Record<Letter, string> = {
  A: "border-red-400/60 bg-red-500/10 text-red-100",
  B: "border-blue-400/60 bg-blue-500/10 text-blue-100",
  C: "border-amber-400/60 bg-amber-500/10 text-amber-100",
  D: "border-emerald-400/60 bg-emerald-500/10 text-emerald-100",
};

interface Props {
  session: LiveSession;
  studentId: string;
  studentName?: string;
  onClose: () => void;
}

export function LiveQuizView({ session, studentId, studentName, onClose }: Props) {
  const [selected, setSelected] = useState<Letter | null>(null);
  const [result, setResult] = useState<{ is_correct: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LiveAnswer[]>([]);
  const [sessionEnded, setSessionEnded] = useState(session.status === "complete");
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const sessionChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Subscribe to live answers for leaderboard
  useEffect(() => {
    const ch = supabase
      .channel(`live-lb-${session.id}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "classroom_live_answers", filter: `live_session_id=eq.${session.id}` },
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
    channelRef.current = ch;
    return () => { void supabase.removeChannel(ch); };
  }, [session.id]);

  // Detect when teacher ends the session
  useEffect(() => {
    const ch = supabase
      .channel(`live-sess-${session.id}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event: "UPDATE", schema: "public", table: "classroom_live_sessions", filter: `id=eq.${session.id}` },
        (payload: { new: LiveSession }) => {
          if (payload.new.status === "complete") {
            setSessionEnded(true);
          }
        },
      )
      .subscribe();
    sessionChannelRef.current = ch;
    return () => { void supabase.removeChannel(ch); };
  }, [session.id]);

  const submit = async (letter: Letter) => {
    if (selected || submitting) return;
    setSelected(letter);
    setSubmitting(true);
    try {
      const res = await submitLiveAnswer({
        live_session_id: session.id,
        student_id: studentId,
        student_name: studentName,
        answer: letter,
      });
      setResult(res);
    } catch {
      setResult(null);
    } finally {
      setSubmitting(false);
    }
  };

  const opts = session.options as { A: string; B: string; C: string; D: string } | null;
  const myRank = result
    ? leaderboard.findIndex((a) => a.student_id === studentId) + 1
    : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0f0825] text-white overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-red-400 animate-pulse" />
          <span className="text-xs font-semibold uppercase tracking-wider text-white/60">
            {sessionEnded ? "Session Ended" : "Live Quiz"}
          </span>
        </div>
        <button onClick={onClose} className="rounded-lg p-1 text-white/40 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 p-4 space-y-4 max-w-lg mx-auto w-full">
        {/* Object lesson */}
        {session.object_lesson && (
          <div className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-200/80 ring-1 ring-amber-400/20">
            <span className="mr-1 font-semibold text-amber-300">🌏</span>
            {session.object_lesson}
          </div>
        )}

        {/* Question */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-base font-semibold leading-relaxed">{session.question}</p>
        </div>

        {/* Options */}
        {opts && !sessionEnded && (
          <div className="grid grid-cols-1 gap-2.5">
            {LETTERS.map((letter) => (
              <button
                key={letter}
                type="button"
                disabled={!!selected || submitting || sessionEnded}
                onClick={() => void submit(letter)}
                className={[
                  "flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm font-medium text-left transition active:scale-[0.98]",
                  selected === letter
                    ? result?.is_correct
                      ? "border-green-400 bg-green-500/20 text-green-100"
                      : "border-red-400 bg-red-500/20 text-red-100"
                    : selected
                    ? "opacity-50 " + LETTER_STYLE[letter]
                    : LETTER_STYLE[letter] + " hover:opacity-90",
                ].join(" ")}
              >
                <span className="font-black text-xs mt-0.5 shrink-0">{letter}</span>
                <span>{opts[letter]}</span>
                {selected === letter && submitting && (
                  <Loader2 className="ml-auto h-4 w-4 animate-spin shrink-0" />
                )}
              </button>
            ))}
          </div>
        )}

        {/* Instant verdict */}
        {result && (
          <div className={`rounded-2xl p-4 text-center font-bold text-lg ${result.is_correct ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"}`}>
            {result.is_correct ? "✓ Correct!" : "✗ Wrong"}
            {myRank && myRank <= 3 && result.is_correct && (
              <div className="text-sm font-medium mt-1 text-white/70">
                #{myRank} {myRank === 1 ? "🥇 First!" : myRank === 2 ? "🥈" : "🥉"}
              </div>
            )}
          </div>
        )}

        {/* Leaderboard */}
        {leaderboard.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/40 px-1">
              <Trophy className="h-3.5 w-3.5" />
              <span>Leaderboard</span>
            </div>
            {leaderboard.map((row, i) => (
              <div
                key={row.student_id}
                className={[
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm",
                  row.student_id === studentId ? "ring-1 ring-amber-400/40 bg-amber-500/10" : "bg-white/5",
                  row.is_correct ? "ring-1 ring-green-400/20" : "",
                ].join(" ")}
              >
                <span className="w-6 text-center font-bold text-white/40 text-xs">#{i + 1}</span>
                <span className="flex-1 font-medium truncate">
                  {row.student_name ?? "Student"}
                  {row.student_id === studentId && " (you)"}
                </span>
                <span className={row.is_correct ? "font-bold text-green-400" : "text-red-400"}>
                  {row.is_correct ? "✓" : "✗"}
                </span>
              </div>
            ))}
          </div>
        )}

        {sessionEnded && (
          <div className="rounded-2xl bg-white/5 p-4 text-center text-sm text-white/50">
            The teacher has ended this session.
          </div>
        )}
      </div>
    </div>
  );
}
