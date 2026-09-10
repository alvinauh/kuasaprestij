import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Flame,
  Trophy,
  Target,
  Sparkles,
  TrendingUp,
  Loader2,
  LogOut,
  MessageSquareHeart,
  AlertTriangle,
  ArrowRight,
  GraduationCap,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { setViewAsStudent } from "@/lib/viewAs";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import {
  fetchLeaderboard,
  fetchTeacherInsights,
  fetchDiagnosticStatus,
  fetchStudentCoach,
  fetchMasteryMap,
  type LeaderboardEntry,
  type FlaggedStudent,
  type RecentAlert,
  type DiagnosticStatus,
  type StudentCoachResponse,
  type MasteryMapResult,
} from "@/services/api";
import { cn } from "@/lib/utils";
import { useStudentPrefs } from "@/hooks/useStudentPrefs";
import { StudentSettingsSheet } from "@/components/StudentSettingsSheet";
import { ProfileBanner } from "@/components/ProfileBanner";
import { MasteryPanel } from "@/components/MasteryPanel";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "My Dashboard — Skor" },
      { name: "description", content: "Your scores, streaks, and the latest feedback from your teachers." },
    ],
  }),
  component: StudentDashboard,
});

const FALLBACK_ID = "00000000-0000-0000-0000-000000000001";

function StudentDashboard() {
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const { lang } = useI18n();
  const isBM = lang === "ms";
  const { prefs } = useStudentPrefs();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const studentId = user?.id ?? FALLBACK_ID;

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [flagged, setFlagged] = useState<FlaggedStudent[]>([]);
  const [alerts, setAlerts] = useState<RecentAlert[]>([]);
  const [diagnostic, setDiagnostic] = useState<DiagnosticStatus | null>(null);
  const [coach, setCoach] = useState<StudentCoachResponse | null>(null);
  const [masteryMap, setMasteryMap] = useState<MasteryMapResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      void navigate({ to: "/login" });
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchLeaderboard(undefined, 50).catch(() => ({ leaderboard: [], subject: null })),
      fetchTeacherInsights().catch(() => null),
      fetchDiagnosticStatus(studentId).catch(() => null),
      fetchStudentCoach(studentId).catch(() => null),
      fetchMasteryMap(studentId).catch(() => null),
    ]).then(([lb, ins, diag, c, mm]) => {
      if (cancelled) return;
      setLeaderboard(lb.leaderboard);
      setFlagged((ins?.flagged_students ?? []).filter((f) => f.student_id === studentId));
      setAlerts(ins?.recent_alerts ?? []);
      setDiagnostic(diag);
      setCoach(c);
      setMasteryMap(mm);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, studentId, navigate]);

  const myEntry = useMemo(
    () => leaderboard.find((e) => e.student_id === studentId),
    [leaderboard, studentId],
  );
  const totalScore = myEntry?.total_score ?? 0;
  const rank = myEntry?.rank;
  const gameWins = myEntry?.game_wins ?? 0;
  const streak = gameWins; // proxy: consecutive wins as visible streak

  const narrative = coach && "narrative" in coach ? coach.narrative : null;

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0118]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#0a0118_0%,#130328_60%,#0a0118_100%)] text-white">
      {/* Aurora background orbs */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true" data-nonessential>
        <div className="animate-aurora-drift absolute -left-40 -top-40 h-[600px] w-[600px] rounded-full bg-indigo-600/40 blur-[120px]" />
        <div className="animate-aurora-drift-2 absolute -right-20 top-1/4 h-[500px] w-[500px] rounded-full bg-fuchsia-600/35 blur-[100px]" />
        <div className="animate-aurora-drift-3 absolute bottom-0 left-1/3 h-[450px] w-[450px] rounded-full bg-violet-700/30 blur-[90px]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-white/[0.07] bg-black/30 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-bold leading-tight">
                {isBM ? "Papan Pemuka Saya" : "My Dashboard"}
              </div>
              <div className="text-[11px] text-white/60">
                {profile?.full_name ?? (isBM ? "Pelajar" : "Student")}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            {(profile?.role === "teacher" || profile?.role === "admin") && (
              <Button
                size="sm"
                onClick={() => {
                  setViewAsStudent(false);
                  void navigate({ to: "/teacher" });
                }}
                className="bg-primary/15 text-primary-glow hover:bg-primary/25"
              >
                {isBM ? "Papan Guru" : "Teacher view"}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSettingsOpen(true)}
              aria-label="Personalize"
              className="grid h-9 w-9 place-items-center rounded-full border border-white/20 bg-white/5 hover:bg-white/10 transition"
            >
              <span className="text-lg leading-none">{prefs.avatar}</span>
            </Button>
            <Link to="/">
              <Button size="sm" className="bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white">
                {isBM ? "Mula Kuiz" : "Start Quiz"}
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
            <Button size="sm" variant="ghost" onClick={() => void signOut().then(() => navigate({ to: "/login" }))}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Profile Banner */}
      <div className="relative z-10 mx-auto max-w-6xl px-4 pt-4">
        <div className="overflow-hidden rounded-2xl">
          <ProfileBanner
            banner={prefs.banner}
            avatar={prefs.avatar}
            name={profile?.full_name ?? user?.email?.split("@")[0] ?? "Student"}
          />
        </div>
      </div>

      <main className="relative z-10 mx-auto max-w-6xl space-y-6 px-4 py-8">
        {/* Welcome hero */}
        <section className="animate-fade-slide-up">
          <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">
            <span className="text-white/40">{isBM ? "Selamat datang, " : "Hey, "}</span>
            <span className="text-gradient-primary">{profile?.full_name?.split(" ")[0] ?? (isBM ? "Pelajar" : "Student")} 👋</span>
          </h1>
          <p className="mt-1 text-sm text-white/40">
            {isBM ? "Semak kemajuan dan terus belajar hari ini." : "Here's your progress at a glance. Keep it up."}
          </p>
        </section>

        {/* Bento stats grid */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {/* Hero card — Total Score spans 2 cols on desktop */}
          <div className="col-span-2 md:col-span-1 animate-fade-slide-up" style={{ animationDelay: "60ms" }}>
            <StatCard
              icon={<Trophy className="h-5 w-5 text-amber-300" />}
              label={isBM ? "Jumlah Skor" : "Total Score"}
              value={loading ? null : totalScore.toLocaleString()}
              accent="amber"
              hero
            />
          </div>
          <div className="animate-fade-slide-up" style={{ animationDelay: "120ms" }}>
            <StatCard
              icon={<Flame className="h-5 w-5 text-rose-300" />}
              label={isBM ? "Streak" : "Win Streak"}
              value={loading ? null : String(streak)}
              accent="rose"
            />
          </div>
          <div className="animate-fade-slide-up" style={{ animationDelay: "180ms" }}>
            <StatCard
              icon={<TrendingUp className="h-5 w-5 text-indigo-300" />}
              label={isBM ? "Kedudukan" : "Rank"}
              value={loading ? null : rank ? `#${rank}` : "—"}
              accent="indigo"
            />
          </div>
          <div className="col-span-2 md:col-span-3 animate-fade-slide-up" style={{ animationDelay: "240ms" }}>
            <StatCard
              icon={<Target className="h-5 w-5 text-emerald-300" />}
              label={isBM ? "Soalan Dijawab Hari Ini" : "Questions Answered Today"}
              value={loading ? null : String(diagnostic?.questions_answered ?? 0)}
              accent="emerald"
              wide
            />
          </div>
        </section>

        {/* Teacher Feedback */}
        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-5 backdrop-blur-xl animate-fade-slide-up" style={{ animationDelay: "300ms" }}>
          <div className="mb-4 flex items-center gap-2">
            <MessageSquareHeart className="h-5 w-5 text-fuchsia-300" />
            <h2 className="text-lg font-bold">
              {isBM ? "Maklum Balas Terkini dari Guru" : "Latest Teacher Feedback"}
            </h2>
          </div>

          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full bg-white/10" />
              <Skeleton className="h-20 w-full bg-white/10" />
            </div>
          ) : flagged.length === 0 && !narrative ? (
            <p className="text-sm text-white/60">
              {isBM
                ? "Belum ada maklum balas. Teruskan menjawab soalan untuk mendapat panduan daripada guru anda."
                : "No feedback yet. Keep practicing — your teacher's notes will appear here as they review your progress."}
            </p>
          ) : (
            <div className="space-y-3">
              {narrative && (
                <div className="rounded-xl border border-fuchsia-400/30 bg-gradient-to-br from-fuchsia-500/10 to-indigo-500/10 p-4">
                  <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-fuchsia-300">
                    <Sparkles className="h-3.5 w-3.5" />
                    {isBM ? "Jurulatih Pembelajaran" : "Study Coach"}
                  </div>
                  <p className="text-sm leading-relaxed text-white/90">{narrative.greeting}</p>
                  {narrative.next_step && (
                    <p className="mt-2 text-sm text-white/70">
                      <span className="font-semibold text-white/90">{isBM ? "Langkah seterusnya: " : "Next step: "}</span>
                      {narrative.next_step}
                    </p>
                  )}
                </div>
              )}

              {flagged.map((f, i) => (
                <div
                  key={`${f.topic}-${i}`}
                  className="rounded-xl border border-amber-400/30 bg-amber-500/5 p-4"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge className="bg-amber-500/20 text-amber-200 hover:bg-amber-500/20">{f.topic}</Badge>
                    <span className="text-xs text-white/60">{f.error_category}</span>
                  </div>
                  <p className="text-sm leading-relaxed text-white/90">
                    <span className="font-semibold text-amber-200">
                      {isBM ? "Nota guru: " : "Teacher's note: "}
                    </span>
                    {f.intervention_script}
                  </p>
                  {f.suggested_activity && (
                    <p className="mt-2 text-xs text-white/60">
                      <span className="font-semibold">{isBM ? "Cadangan: " : "Try this: "}</span>
                      {f.suggested_activity}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Mastery map — per-subject topic progress */}
        {/* Mastery Panel */}
        <section>
          <h2 className="mb-3 text-lg font-bold">{isBM ? "Peta Penguasaan" : "Mastery Map"}</h2>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full bg-white/10" />
              <Skeleton className="h-16 w-full bg-white/10" />
              <Skeleton className="h-16 w-full bg-white/10" />
            </div>
          ) : masteryMap ? (
            <MasteryPanel data={masteryMap} isBM={isBM} />
          ) : null}
        </section>

        {/* Two-column: alerts + leaderboard preview */}
        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-5 backdrop-blur-xl animate-fade-slide-up" style={{ animationDelay: "380ms" }}>
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-300" />
              <h3 className="font-bold">{isBM ? "Topik untuk Diberi Perhatian" : "Topics to Watch"}</h3>
            </div>
            {loading ? (
              <Skeleton className="h-24 w-full bg-white/10" />
            ) : alerts.length === 0 ? (
              <p className="text-sm text-white/60">{isBM ? "Tiada amaran." : "No alerts right now."}</p>
            ) : (
              <ul className="space-y-2">
                {alerts.slice(0, 5).map((a, i) => (
                  <li key={i} className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{a.topic ?? a.diagnostic_tag ?? "—"}</span>
                      {a.category && <Badge variant="secondary" className="text-[10px]">{a.category}</Badge>}
                    </div>
                    {a.observation && <p className="mt-1 text-xs text-white/70">{a.observation}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-5 backdrop-blur-xl animate-fade-slide-up" style={{ animationDelay: "460ms" }}>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-300" />
                <h3 className="font-bold">{isBM ? "Papan Pendahulu" : "Leaderboard"}</h3>
              </div>
              <Link to="/leaderboard" className="text-xs text-indigo-300 hover:underline">
                {isBM ? "Lihat semua" : "View all"}
              </Link>
            </div>
            {loading ? (
              <Skeleton className="h-32 w-full bg-white/10" />
            ) : leaderboard.length === 0 ? (
              <p className="text-sm text-white/60">{isBM ? "Belum ada data." : "No leaderboard data yet."}</p>
            ) : (
              <ol className="space-y-1.5">
                {leaderboard.slice(0, 5).map((e) => {
                  const me = e.student_id === studentId;
                  const medal = e.rank === 1 ? "🥇" : e.rank === 2 ? "🥈" : e.rank === 3 ? "🥉" : null;
                  return (
                    <li
                      key={e.student_id}
                      className={cn(
                        "flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition-colors duration-150",
                        me
                          ? "border border-indigo-400/30 bg-indigo-500/15 ring-1 ring-inset ring-indigo-400/10"
                          : "bg-white/[0.03] hover:bg-white/[0.06]",
                      )}
                    >
                      <span className="flex items-center gap-2.5">
                        <span className="w-7 text-center text-base leading-none">
                          {medal ?? <span className="text-[11px] font-bold text-white/40">#{e.rank}</span>}
                        </span>
                        <span className={cn("truncate", me && "font-semibold text-indigo-200")}>
                          {me ? (isBM ? "Anda" : "You") : e.student_id.slice(0, 8)}
                        </span>
                      </span>
                      <span className="font-bold tabular-nums text-gradient-gold">{e.total_score.toLocaleString()}</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </section>
      </main>

      <StudentSettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

const ACCENT_STYLES = {
  amber:  { bg: "from-amber-500/25 to-orange-600/10",  border: "border-amber-400/30",  glow: "bg-amber-400",   icon: "bg-amber-500/20 ring-amber-400/40",  text: "text-gradient-gold"    },
  rose:   { bg: "from-rose-500/25 to-pink-600/10",     border: "border-rose-400/30",   glow: "bg-rose-400",    icon: "bg-rose-500/20 ring-rose-400/40",    text: "text-gradient-rose"    },
  indigo: { bg: "from-indigo-500/25 to-violet-600/10", border: "border-indigo-400/30", glow: "bg-indigo-400",  icon: "bg-indigo-500/20 ring-indigo-400/40", text: "text-gradient-primary" },
  emerald:{ bg: "from-emerald-500/20 to-teal-600/10",  border: "border-emerald-400/30",glow: "bg-emerald-400", icon: "bg-emerald-500/20 ring-emerald-400/40",text: "text-gradient-emerald" },
} as const;

function StatCard({
  icon,
  label,
  value,
  accent,
  hero = false,
  wide = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  accent: keyof typeof ACCENT_STYLES;
  hero?: boolean;
  wide?: boolean;
}) {
  const s = ACCENT_STYLES[accent];
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-gradient-to-br p-5 backdrop-blur-xl",
        "transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_40px_-8px_rgba(0,0,0,0.5)]",
        s.bg, s.border,
        hero && "md:p-7",
        wide && "flex items-center gap-6",
      )}
    >
      {/* Decorative glow blob top-right */}
      <div className={cn("pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-30 blur-2xl transition-opacity duration-300 group-hover:opacity-60 animate-glow-breathe", s.glow)} />

      {/* Icon */}
      <div className={cn("inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1", s.icon, wide ? "mb-0" : "mb-3")}>
        {icon}
      </div>

      <div className={wide ? "flex-1" : undefined}>
        {/* Value */}
        {value === null ? (
          <Skeleton className={cn("bg-white/15", hero ? "h-12 w-28" : "h-9 w-16")} />
        ) : (
          <div className={cn("font-extrabold leading-none tracking-tight", s.text, hero ? "text-5xl md:text-6xl" : wide ? "text-3xl" : "text-4xl")}>
            {value}
          </div>
        )}
        {/* Label */}
        <div className={cn("font-semibold uppercase tracking-widest text-white/50", hero ? "mt-3 text-xs" : "mt-2 text-[11px]")}>{label}</div>
      </div>
    </div>
  );
}
