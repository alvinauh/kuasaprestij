import { useState } from "react";
import { Loader2, X, Zap } from "lucide-react";
import { startSession, startLiveSession, type SessionResponse } from "@/services/api";

interface Props {
  studentId: string;
  classroomId: string;
  subject: string;
  topic: string;
  onSessionStarted: () => void;
  onClose: () => void;
}

export function ChallengeClassModal({
  studentId,
  classroomId,
  subject,
  topic,
  onSessionStarted,
  onClose,
}: Props) {
  const [step, setStep] = useState<"config" | "preview" | "starting">("config");
  const [customTopic, setCustomTopic] = useState(topic);
  const [generated, setGenerated] = useState<SessionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setStep("preview");
    setError(null);
    try {
      const res = await startSession(
        studentId,
        customTopic || topic,
        "KSSM",
        "English",
        subject,
        undefined,
        false,
        "mcq",
      );
      setGenerated(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate question");
      setStep("config");
    }
  };

  const launch = async () => {
    if (!generated) return;
    setStep("starting");
    try {
      await startLiveSession({
        classroom_id: classroomId,
        teacher_id: studentId,
        // /start_session never returns the answer key; the server reads it from the session.
        source_session_id: generated.session_id,
        question: generated.question,
        options: generated.options ?? null,
        question_type: generated.question_type ?? "mcq",
        subject: generated.subject ?? subject,
        topic: generated.topic ?? customTopic,
        object_lesson: generated.object_lesson ?? null,
      });
      onSessionStarted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start challenge");
      setStep("preview");
    }
  };

  const opts = generated?.options as Record<string, string> | null | undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-t-3xl bg-[#0f0825] p-5 text-white sm:rounded-3xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-400" />
            <span className="font-bold text-lg">Challenge Your Class</span>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-white/40 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-300 ring-1 ring-red-400/20">
            {error}
          </div>
        )}

        {step === "config" && (
          <div className="space-y-4">
            <p className="text-sm text-white/60">
              Generate a question on your current topic and broadcast it live to your classmates.
            </p>
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/50 uppercase tracking-wider">
                Topic
              </label>
              <input
                type="text"
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-amber-400/50 focus:outline-none"
                placeholder={topic}
              />
            </div>
            <button
              onClick={() => void generate()}
              className="w-full rounded-2xl bg-amber-500 py-3 text-sm font-bold text-black transition hover:bg-amber-400 active:scale-95"
            >
              Generate Question →
            </button>
          </div>
        )}

        {step === "preview" && !generated && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="h-7 w-7 animate-spin text-amber-400" />
            <p className="text-sm text-white/50">Generating question…</p>
          </div>
        )}

        {(step === "preview" || step === "starting") && generated && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-semibold leading-relaxed">{generated.question}</p>
            </div>
            {opts && (
              <div className="grid grid-cols-1 gap-2">
                {(["A", "B", "C", "D"] as const).filter((l) => opts[l]).map((l) => (
                  <div
                    key={l}
                    className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${
                      l === generated.correct
                        ? "border-green-400/40 bg-green-500/10 text-green-200"
                        : "border-white/10 text-white/70"
                    }`}
                  >
                    <span className="font-bold shrink-0">{l}.</span>
                    <span>{opts[l]}</span>
                    {l === generated.correct && (
                      <span className="ml-auto text-green-400 shrink-0">✓</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setGenerated(null); setStep("config"); }}
                disabled={step === "starting"}
                className="flex-1 rounded-2xl border border-white/15 py-3 text-sm font-semibold text-white/70 hover:text-white transition disabled:opacity-50"
              >
                Regenerate
              </button>
              <button
                onClick={() => void launch()}
                disabled={step === "starting"}
                className="flex-1 rounded-2xl bg-amber-500 py-3 text-sm font-bold text-black transition hover:bg-amber-400 active:scale-95 disabled:opacity-60"
              >
                {step === "starting" ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Starting…
                  </span>
                ) : (
                  "⚡ Launch Challenge"
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
