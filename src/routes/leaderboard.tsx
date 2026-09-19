import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Trophy, Gamepad2, Loader2, ArrowLeft } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchLeaderboard,
  fetchSubjects,
  type LeaderboardEntry,
  type SubjectWithTopics,
} from "@/services/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "Class Leaderboard — Skor" },
      { name: "description", content: "See the top KSSM learners on Skor." },
    ],
  }),
  component: LeaderboardPage,
});

const ALL = "__all__";

function shortName(id: string, idx: number): string {
  if (!id) return `Student #${idx + 1}`;
  const tail = id.replace(/-/g, "").slice(-4).toUpperCase();
  return `Student #${tail}`;
}

function LeaderboardPage() {
  const { user } = useAuth();
  const [subject, setSubject] = useState<string>(ALL);
  const [subjects, setSubjects] = useState<SubjectWithTopics[]>([]);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchSubjects().then(setSubjects).catch(() => setSubjects([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async (initial: boolean) => {
      if (initial) setLoading(true);
      const res = await fetchLeaderboard(subject === ALL ? undefined : subject, 10);
      if (!cancelled) {
        setEntries(res.leaderboard);
        if (initial) setLoading(false);
      }
    };
    void load(true);
    const id = setInterval(() => void load(false), 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [subject]);

  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);
  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#1a0533_0%,#2d0a6e_100%)] text-foreground">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 pt-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/50 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <div className="flex items-center gap-2 font-display text-lg font-bold">
          <Trophy className="h-5 w-5 text-yellow-400" />
          Class Leaderboard 🏆
        </div>
        <div className="w-16" />
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-5 py-6">
        <div className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-widest text-primary-glow">
              Filter by subject
            </span>
            <Select value={subject} onValueChange={setSubject}>
              <SelectTrigger className="h-9 w-56">
                <SelectValue placeholder="All subjects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All subjects</SelectItem>
                {subjects.map((s) => (
                  <SelectItem key={`${s.curriculum}-${s.subject}-${s.form}`} value={s.subject}>
                    {s.display_label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 rounded-2xl border border-border/50 bg-card/50 px-4 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading leaderboard…
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-2xl border border-border/50 bg-card/50 px-4 py-6 text-center text-sm text-muted-foreground">
            No leaderboard data yet. Answer a few questions to get on the board!
          </div>
        ) : (
          <>
            {/* Podium */}
            <section className="grid grid-cols-3 gap-3">
              {[1, 0, 2].map((order) => {
                const e = podium[order];
                if (!e) return <div key={order} />;
                const isMe = user?.id && e.student_id === user.id;
                const heights = ["h-32", "h-40", "h-28"]; // silver, gold, bronze
                return (
                  <div key={e.student_id} className="flex flex-col items-center justify-end">
                    <div className="mb-1 text-2xl">{medals[order]}</div>
                    <div
                      className={cn(
                        "w-full rounded-t-2xl border border-border/60 px-2 py-3 text-center backdrop-blur",
                        heights[order],
                        order === 0
                          ? "bg-yellow-500/20 border-yellow-400/50"
                          : order === 1
                            ? "bg-zinc-300/15 border-zinc-200/40"
                            : "bg-amber-700/20 border-amber-500/40",
                        isMe && "ring-2 ring-primary",
                      )}
                    >
                      <div className="truncate text-xs font-semibold">
                        {shortName(e.student_id, order)}
                      </div>
                      <div className="mt-1 font-display text-xl font-bold">
                        {e.total_score}
                      </div>
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        {e.quiz_sessions} sessions
                      </div>
                      {e.game_wins > 0 && (
                        <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-200">
                          <Gamepad2 className="h-3 w-3" /> {e.game_wins}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </section>

            {/* List */}
            {rest.length > 0 && (
              <ul className="space-y-2">
                {rest.map((e, idx) => {
                  const isMe = user?.id && e.student_id === user.id;
                  return (
                    <li
                      key={e.student_id || idx}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border border-border/50 bg-card/50 px-4 py-3 backdrop-blur",
                        isMe && "border-primary bg-primary/15",
                      )}
                    >
                      <span className="w-6 text-center font-display text-base font-bold text-muted-foreground">
                        {e.rank}
                      </span>
                      <span className="flex-1 truncate text-sm font-semibold">
                        {shortName(e.student_id, idx + 3)}
                        {isMe && (
                          <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[10px] uppercase text-primary-foreground">
                            You
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {e.quiz_sessions} sessions
                      </span>
                      {e.game_wins > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-200">
                          <Gamepad2 className="h-3 w-3" /> {e.game_wins}
                        </span>
                      )}
                      <span className="font-display text-base font-bold tabular-nums">
                        {e.total_score}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}
