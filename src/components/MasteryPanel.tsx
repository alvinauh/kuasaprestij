import { useState, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, Play, TrendingUp, CheckCircle2, Circle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MasteryMapResult, MasteryEntry } from "@/services/api";

interface Props {
  data: MasteryMapResult;
  isBM?: boolean;
}

function subjectPct(topics: MasteryEntry[]) {
  if (!topics.length) return 0;
  return Math.round((topics.reduce((s, t) => s + t.mastery_score, 0) / topics.length) * 100);
}

function statusColor(status: MasteryEntry["status"], pct: number) {
  if (status === "complete") return "bg-emerald-400";
  if (pct >= 50) return "bg-indigo-400";
  if (pct > 0) return "bg-amber-400";
  return "bg-white/20";
}

function StatusIcon({ status, pct }: { status: MasteryEntry["status"]; pct: number }) {
  if (status === "complete") return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />;
  if (pct > 0) return <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />;
  return <Circle className="h-4 w-4 shrink-0 text-white/30" />;
}

function generateReport(data: MasteryMapResult, isBM: boolean): string {
  const subjects = Object.entries(data.mastery_map);
  if (!subjects.length) {
    return isBM
      ? "Belum ada data penguasaan. Mula menjawab soalan untuk melihat laporan anda!"
      : "No mastery data yet — start answering questions to see your report!";
  }

  const totalTopics = subjects.reduce((s, [, t]) => s + t.length, 0);
  const masteredTopics = subjects.reduce(
    (s, [, t]) => s + t.filter((x) => x.status === "complete").length,
    0,
  );
  const subjectScores = subjects.map(([name, topics]) => ({ name, pct: subjectPct(topics) }));
  const strongest = subjectScores.reduce((a, b) => (b.pct > a.pct ? b : a));
  const weakest = subjectScores.reduce((a, b) => (b.pct < a.pct ? b : a));
  const overall = Math.round((data.overall_progress ?? 0) * 100);

  if (isBM) {
    return `Anda telah menguasai ${masteredTopics} daripada ${totalTopics} topik merentasi ${subjects.length} mata pelajaran, dengan kemajuan keseluruhan ${overall}%. ${strongest.name} adalah kekuatan utama anda (${strongest.pct}%) — teruskan semangat itu! Tumpukan usaha lebih pada ${weakest.name} (${weakest.pct}%) untuk meningkatkan skor SPM anda.`;
  }
  return `You've mastered ${masteredTopics} of ${totalTopics} topics across ${subjects.length} subjects, with an overall progress of ${overall}%. ${strongest.name} is your strongest area at ${strongest.pct}% — keep it up! Focus more on ${weakest.name} (${weakest.pct}%) to boost your SPM score.`;
}

function SubjectCard({
  subject,
  topics,
  isBM,
  onPractice,
}: {
  subject: string;
  topics: MasteryEntry[];
  isBM: boolean;
  onPractice: (subject: string, topic: string) => void;
}) {
  const pct = subjectPct(topics);
  const mastered = topics.filter((t) => t.status === "complete").length;
  const defaultOpen = topics.some((t) => t.mastery_score > 0);
  const [open, setOpen] = useState(defaultOpen);

  const focusTopic = useMemo(
    () =>
      [...topics]
        .filter((t) => t.status !== "complete")
        .sort((a, b) => a.mastery_score - b.mastery_score)[0] ?? null,
    [topics],
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
      {/* Subject header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/5 transition"
      >
        <div className="flex items-center gap-3 min-w-0">
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-white/50" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-white/50" />
          )}
          <span className="truncate font-semibold text-sm">{subject}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:flex items-center gap-1.5">
            <div className="w-20 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className={cn("h-1.5 rounded-full transition-all", statusColor("started", pct))}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <span className="text-xs text-white/60 tabular-nums">{mastered}/{topics.length}</span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums",
              pct >= 80
                ? "bg-emerald-500/20 text-emerald-300"
                : pct >= 40
                  ? "bg-indigo-500/20 text-indigo-300"
                  : pct > 0
                    ? "bg-amber-500/20 text-amber-300"
                    : "bg-white/10 text-white/40",
            )}
          >
            {pct}%
          </span>
        </div>
      </button>

      {/* Topic rows */}
      {open && (
        <div className="border-t border-white/10">
          {topics.map((t) => {
            const tPct = Math.round(t.mastery_score * 100);
            return (
              <button
                key={t.topic}
                onClick={() => onPractice(subject, t.topic)}
                className="group flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/8 transition border-b border-white/5 last:border-0"
              >
                <StatusIcon status={t.status} pct={tPct} />
                <span className="flex-1 truncate text-sm text-white/80 group-hover:text-white transition">
                  {t.topic}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-16 h-1 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className={cn("h-1 rounded-full transition-all", statusColor(t.status, tPct))}
                      style={{ width: `${Math.max(tPct, tPct > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-[11px] tabular-nums text-white/50">{tPct}%</span>
                  <Play className="h-3 w-3 text-white/20 group-hover:text-primary transition" />
                </div>
              </button>
            );
          })}

          {/* Focus CTA */}
          {focusTopic && (
            <div className="border-t border-white/10 px-4 py-3">
              <button
                onClick={() => onPractice(subject, focusTopic.topic)}
                className="flex w-full items-center justify-between rounded-xl bg-primary/10 border border-primary/20 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/20 transition"
              >
                <span className="truncate">
                  {isBM ? "Latih: " : "Practice: "}{focusTopic.topic}
                </span>
                <Play className="h-4 w-4 shrink-0 ml-2" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function MasteryPanel({ data, isBM = false }: Props) {
  const navigate = useNavigate();
  const overall = Math.round((data.overall_progress ?? 0) * 100);
  const report = useMemo(() => generateReport(data, isBM), [data, isBM]);

  const subjects = Object.entries(data.mastery_map);

  function practiceThis(subject: string, topic: string) {
    sessionStorage.setItem("kp_practice_intent", JSON.stringify({ subject, topic }));
    void navigate({ to: "/" });
  }

  return (
    <div className="space-y-4">
      {/* Overall Report */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-emerald-300" />
          <h2 className="font-bold text-base">
            {isBM ? "Laporan Kemajuan" : "Progress Report"}
          </h2>
          <span
            className={cn(
              "ml-auto rounded-full px-3 py-1 text-xs font-bold tabular-nums",
              overall >= 70
                ? "bg-emerald-500/20 text-emerald-200"
                : overall >= 30
                  ? "bg-indigo-500/20 text-indigo-200"
                  : "bg-white/10 text-white/50",
            )}
          >
            {overall}% {isBM ? "keseluruhan" : "overall"}
          </span>
        </div>

        {/* Overall bar */}
        <div className="mb-4 h-2.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-2.5 rounded-full bg-gradient-to-r from-indigo-400 to-emerald-400 transition-all duration-700"
            style={{ width: `${overall}%` }}
          />
        </div>

        <p className="text-sm leading-relaxed text-white/70">{report}</p>
      </div>

      {/* Subject accordions */}
      {subjects.length === 0 ? (
        <p className="text-sm text-white/60 px-1">
          {isBM
            ? "Belum ada data penguasaan. Mula menjawab soalan!"
            : "No mastery data yet — start answering questions!"}
        </p>
      ) : (
        <div className="space-y-2">
          {subjects.map(([subject, topics]) => (
            <SubjectCard
              key={subject}
              subject={subject}
              topics={topics}
              isBM={isBM}
              onPractice={practiceThis}
            />
          ))}
        </div>
      )}
    </div>
  );
}
