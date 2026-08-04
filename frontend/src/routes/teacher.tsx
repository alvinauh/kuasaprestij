import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import {
  Users,
  Target,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Loader2,
  LogOut,
  LayoutDashboard,
  School,
  Trophy,
  Gamepad2,
  ClipboardList,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { useI18n } from "@/lib/i18n";
import { setViewAsStudent } from "@/lib/viewAs";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import {
  fetchTeacherInsights,
  fetchLeaderboard,
  generateAiTask,
  generateDifferentiatedPlan,
  type ClassMasteryItem,
  type LeaderboardEntry,
  type FlaggedStudent,
  type MisconceptionCluster,
  type GenerateTaskResult,
  type StudentDiagnostic,
  type DifferentiatedGroup,
  type DifferentiatedPlanResult,
} from "@/services/api";
import { ClassroomsPanel } from "@/components/teacher/ClassroomsPanel";
import { AssignmentsPanel } from "@/components/teacher/AssignmentsPanel";
import { AiControllerPanel } from "@/components/teacher/AiControllerPanel";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/teacher")({
  head: () => ({
    meta: [
      { title: "Teacher Dashboard — Skor" },
      { name: "description", content: "Track class mastery, diagnostic insights, and common misconceptions across the KSSM syllabus." },
      { property: "og:title", content: "Skor Teacher Dashboard" },
      { property: "og:description", content: "Real-time analytics on student mastery." },
    ],
  }),
  component: TeacherDashboard,
});

function TeacherDashboard() {
  const { t, lang } = useI18n();
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  // Landing on the teacher dashboard means they're back in teacher mode — clear
  // the "view as student" swap so the student routes bounce them here again.
  useEffect(() => {
    setViewAsStudent(false);
  }, []);

  const [tab, setTab] = useState<"ai" | "insights" | "classrooms" | "assignments">("ai");
  const [classMastery, setClassMastery] = useState<ClassMasteryItem[]>([]);
const [activeStudents, setActiveStudents] = useState<string>("-");
  const [classAverageMastery, setClassAverageMastery] = useState<string>("-");
  const [weakestTopic, setWeakestTopic] = useState<string>("-");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topStudents, setTopStudents] = useState<LeaderboardEntry[]>([]);
  const [flaggedStudents, setFlaggedStudents] = useState<FlaggedStudent[]>([]);
  const [misconceptionClusters, setMisconceptionClusters] = useState<MisconceptionCluster[]>([]);
  const [studentDiagnostics, setStudentDiagnostics] = useState<StudentDiagnostic[]>([]);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [taskResults, setTaskResults] = useState<Record<string, GenerateTaskResult>>({});
  const [generatingPlan, setGeneratingPlan] = useState<string | null>(null);
  const [planResults, setPlanResults] = useState<Record<string, DifferentiatedPlanResult>>({});

  const unauthorized = !!profile && profile.role !== "teacher" && profile.role !== "admin";

  useEffect(() => {
    void fetchLeaderboard(undefined, 5).then((r) => setTopStudents(r.leaderboard)).catch(() => undefined);
  }, []);

  // Server-side enforced via RLS; this is a UX guard for non-teachers.
  useEffect(() => {
    if (unauthorized) {
      void navigate({ to: "/" });
    }
  }, [unauthorized, navigate]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const load = (initial: boolean) => {
      if (initial) setLoading(true);
      fetchTeacherInsights()
        .then((data) => {
          if (cancelled) return;
          setError(null);
          setClassMastery(Array.isArray(data?.class_mastery) ? data.class_mastery : []);
          setActiveStudents(
            typeof data?.active_students === "number" ? String(data.active_students) : "-",
          );
          setClassAverageMastery(
            typeof data?.class_average_mastery === "number"
              ? `${data.class_average_mastery}%`
              : "-",
          );
          setWeakestTopic(
            typeof data?.weakest_topic === "string" && data.weakest_topic.trim().length > 0
              ? data.weakest_topic
              : "-",
          );
          setFlaggedStudents(Array.isArray(data?.flagged_students) ? data.flagged_students : []);
          setMisconceptionClusters(Array.isArray(data?.misconception_clusters) ? data.misconception_clusters : []);
          setStudentDiagnostics(Array.isArray(data?.student_diagnostics) ? data.student_diagnostics : []);
          // Names come pre-resolved from the API (backend uses the service-role
          // key). We do NOT fetch profiles client-side: RLS (profiles_select_own)
          // only lets a user read their OWN row, so a teacher would get nothing.
        })
        .catch((err) => {
          if (cancelled || !initial) return;
          console.error("[Skor] fetchTeacherInsights failed", err);
          const status = (err && (err.status ?? err.statusCode)) as number | undefined;
          const msg = String(err?.message ?? "");
          if (status === 403 || /permission|rls|forbidden/i.test(msg)) {
            setError("You don't have permission to view this information.");
          } else {
            setError("Couldn't load live insights.");
          }
        })
        .finally(() => {
          if (!cancelled && initial) setLoading(false);
        });
    };

    load(true);
    // Auto-refresh every 10s so newly answered questions appear live.
    timer = setInterval(() => load(false), 10000);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const masteryData = (classMastery ?? []).map((m) => ({
    subject: m?.subject ?? "",
    mastery: m?.mastery ?? 0,
    fullMark: 100,
  }));



  const handleGenerateIntervention = async (topic: string, studentId: string, subject: string) => {
    if (!studentId) return;
    setGeneratingFor(studentId);
    try {
      const result = await generateAiTask(studentId, topic, subject);
      setTaskResults((prev) => ({ ...prev, [studentId]: result }));
    } catch (e) {
      console.error("[Skor] Failed to generate intervention:", e);
    } finally {
      setGeneratingFor(null);
    }
  };

  const handleGenerateDifferentiatedPlan = async (cluster: MisconceptionCluster) => {
    setGeneratingPlan(cluster.error_category);
    try {
      const result = await generateDifferentiatedPlan({
        error_category: cluster.error_category,
        topics_affected: cluster.topics_affected,
        student_diagnostics: studentDiagnostics,
      });
      setPlanResults((prev) => ({ ...prev, [cluster.error_category]: result }));
    } catch (e) {
      console.error("[Skor] generateDifferentiatedPlan failed:", e);
    } finally {
      setGeneratingPlan(null);
    }
  };

  if (unauthorized) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight">{t.teacherDashboard}</h1>
              <p className="text-xs text-muted-foreground">{t.schoolMeta}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Link
              to="/"
              onClick={() => setViewAsStudent(true)}
              className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-primary-glow hover:bg-card/80 transition"
              aria-label="Switch to the student view"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {lang === "ms" ? "Lihat sebagai pelajar" : lang === "zh" ? "以学生身份查看" : "View as student"}
            </Link>
            <Link
              to="/leaderboard"
              className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-yellow-500 hover:text-yellow-400 transition"
              aria-label="Leaderboard"
            >
              <Trophy className="h-4 w-4" />
            </Link>
            <span className="rounded-full bg-success/15 px-3 py-1 text-xs font-medium text-success">● {t.live}</span>
            {profile?.full_name && (
              <span className="hidden sm:block text-sm font-medium text-foreground">
                {profile.full_name}
              </span>
            )}
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-primary text-sm font-semibold text-primary-foreground">
              {profile?.full_name
                ? profile.full_name.split(" ").slice(0, 2).map((w) => w[0].toUpperCase()).join("")
                : "?"}
            </div>
            <button
              onClick={() => void signOut()}
              className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground transition"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <nav className="inline-flex rounded-full border border-border bg-card/60 p-1 text-sm">
          {([
            { key: "ai", label: "AI Controller", icon: Sparkles },
            { key: "insights", label: "Insights", icon: LayoutDashboard },
            { key: "classrooms", label: "My Classrooms", icon: School },
            { key: "assignments", label: "Assigned Tasks", icon: ClipboardList },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "flex items-center gap-2 rounded-full px-4 py-1.5 font-medium transition",
                tab === key
                  ? "bg-gradient-primary text-primary-foreground shadow-glow"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>

        {tab === "ai" ? (
          <AiControllerPanel />
        ) : tab === "classrooms" ? (
          <ClassroomsPanel />
        ) : tab === "assignments" ? (
          <AssignmentsPanel />
        ) : (
        <>
        {loading && (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading live class insights…
          </div>
        )}
        {error && !loading && (
          <div className="rounded-xl border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-warning">
            {error}
          </div>
        )}
        {/* Class pulse — leads with the single biggest blocker so a teacher can act
            in one glance + one tap, instead of scanning the patterns panel below. */}
        {(() => {
          const top = [...misconceptionClusters].sort(
            (a, b) => b.student_count - a.student_count,
          )[0];
          if (!top) return null;
          return (
            <ClassPulseBanner
              cluster={top}
              busy={generatingPlan === top.error_category}
              done={planResults[top.error_category]}
              onAssign={() => void handleGenerateDifferentiatedPlan(top)}
            />
          );
        })()}
        <section className="grid gap-4 md:grid-cols-3">
          <KpiCard
            icon={<Users className="h-5 w-5" />}
            label={t.activeStudents}
            value={activeStudents}
            delta={t.todayDelta}
            trend="up"
            accent="primary"
          />
          <KpiCard
            icon={<Target className="h-5 w-5" />}
            label={t.classAverageMastery}
            value={classAverageMastery}
            delta={t.weekDelta}
            trend="up"
            accent="success"
          />
          <KpiCard
            icon={<AlertTriangle className="h-5 w-5" />}
            label={t.weakestTopic}
            value={weakestTopic}
            delta={t.masteryShort}
            trend="down"
            accent="destructive"
          />
        </section>

        {/* Mastery radar + Class-wide misconception patterns */}
        <section className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3 rounded-2xl border border-border bg-card p-6 shadow-card">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold">{t.classMasteryTitle}</h2>
                <p className="text-sm text-muted-foreground">{t.classMasterySub}</p>
              </div>
              <span className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">{t.last7Days}</span>
            </div>
            <div className="mt-4 h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={masteryData} outerRadius="78%">
                  <PolarGrid stroke="oklch(0.30 0.03 280)" />
                  <PolarAngleAxis
                    dataKey="subject"
                    tick={{ fill: "oklch(0.85 0.02 280)", fontSize: 12, fontWeight: 500 }}
                  />
                  <PolarRadiusAxis
                    angle={90}
                    domain={[0, 100]}
                    tick={{ fill: "oklch(0.55 0.02 280)", fontSize: 10 }}
                    stroke="oklch(0.30 0.03 280)"
                  />
                  <Radar
                    name={t.masteryLabel}
                    dataKey="mastery"
                    stroke="oklch(0.65 0.28 300)"
                    fill="oklch(0.65 0.28 300)"
                    fillOpacity={0.45}
                    strokeWidth={2}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "oklch(0.20 0.025 280)",
                      border: "1px solid oklch(0.30 0.03 280)",
                      borderRadius: 12,
                      color: "oklch(0.98 0.005 280)",
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6 shadow-card flex flex-col gap-4">
            <div>
              <h2 className="font-display text-lg font-semibold">Class-Wide Patterns</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Expand a pattern to see differentiated groups</p>
            </div>
            {misconceptionClusters.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recurring class-wide patterns yet.</p>
            ) : (
              <ul className="space-y-2">
                {misconceptionClusters.map((cluster, idx) => (
                  <MisconceptionClusterCard
                    key={idx}
                    cluster={cluster}
                    studentDiagnostics={studentDiagnostics}
                    generatingPlan={generatingPlan}
                    planResult={planResults[cluster.error_category]}
                    onGenerate={handleGenerateDifferentiatedPlan}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Per-student diagnostic insights */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-lg font-semibold">Diagnostic Insights — By Student</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Students with recurring errors, grouped by individual — worst topic shown first
              </p>
            </div>
            <span className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
              {studentDiagnostics.length} student{studentDiagnostics.length !== 1 ? "s" : ""}
            </span>
          </div>
          {studentDiagnostics.length === 0 ? (
            <p className="text-sm text-muted-foreground">No students with recurring errors yet.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {studentDiagnostics.map((student) => (
                <StudentDiagnosticCard
                  key={student.student_id}
                  student={student}
                  generatingFor={generatingFor}
                  taskResult={taskResults[student.student_id]}
                  onGenerate={(sid, topic, subject) => void handleGenerateIntervention(topic, sid, subject)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              <h2 className="font-display text-lg font-semibold">Top 5 Students</h2>
            </div>
            <Link
              to="/leaderboard"
              className="text-xs font-semibold text-primary hover:underline"
            >
              View full leaderboard →
            </Link>
          </div>
          {topStudents.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No leaderboard data yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border/60">
              {topStudents.map((s, i) => {
                const tail = (s.student_id || "").replace(/-/g, "").slice(-4).toUpperCase();
                return (
                  <li key={s.student_id || i} className="flex items-center gap-3 py-2.5">
                    <span className="w-5 text-center font-display text-sm font-bold text-muted-foreground">
                      {s.rank}
                    </span>
                    <span className="flex-1 truncate text-sm font-medium">
                      {s.student_name || `Student #${tail || (i + 1)}`}
                    </span>
                    {s.game_wins > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-600">
                        <Gamepad2 className="h-3 w-3" /> {s.game_wins}
                      </span>
                    )}
                    <span className="font-display text-sm font-bold tabular-nums">
                      {s.total_score}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        </>
        )}
      </main>
    </div>
  );
}

function StudentDiagnosticCard({
  student,
  generatingFor,
  taskResult,
  onGenerate,
}: {
  student: StudentDiagnostic;
  generatingFor: string | null;
  taskResult?: GenerateTaskResult;
  onGenerate: (studentId: string, topic: string, subject: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const initials = student.student_name
    ? student.student_name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")
    : (student.student_id || "").slice(0, 2).toUpperCase();
  const displayName = student.student_name ?? `Student ${(student.student_id || "").slice(0, 8).toUpperCase()}`;
  const topTopic = student.topics[0];

  return (
    <div className="rounded-xl border border-border bg-background/40 overflow-hidden">
      <button
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-accent/20 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-primary text-sm font-bold text-primary-foreground shadow-glow">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {student.topics.length} topic{student.topics.length !== 1 ? "s" : ""} struggling · {student.dominant_error}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold text-destructive">
            {student.total_errors} errors
          </span>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/60">
          {/* Topic breakdown */}
          <div className="pt-3 space-y-1.5">
            {student.topics.map((t, idx) => (
              <div key={idx} className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="h-1.5 w-1.5 rounded-full bg-destructive shrink-0" />
                  <span className="truncate font-medium text-foreground">{t.topic}</span>
                  <span className="truncate text-muted-foreground hidden sm:block">
                    {t.subject || <span className="italic">no subject</span>} · {t.error_category}
                  </span>
                </div>
                <span className="shrink-0 text-muted-foreground">{t.wrong_count}×</span>
              </div>
            ))}
          </div>

          {/* Root cause of worst topic */}
          <div className="rounded-lg border border-border/60 bg-card p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Why they're stuck</p>
            {topTopic?.root_cause
              ? <p className="text-xs text-foreground/80 leading-relaxed">{topTopic.root_cause}</p>
              : <p className="text-xs text-muted-foreground italic">No data — root cause will appear after the evaluator diagnoses a wrong answer.</p>
            }
          </div>

          {/* Intervention script */}
          <div className="rounded-lg border border-primary/20 bg-primary/10 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-primary-glow mb-1">💬 What to say</p>
            {student.intervention_script
              ? <p className="text-xs text-foreground/90 italic leading-relaxed">"{student.intervention_script}"</p>
              : <p className="text-xs text-muted-foreground italic">No data — script is generated when the student hits the error threshold (≥2 same mistake on the same topic).</p>
            }
          </div>

          {/* Suggested activity */}
          <div className="rounded-lg border border-success/20 bg-success/10 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-success mb-1">✏️ 5-min activity</p>
            {student.suggested_activity
              ? <p className="text-xs text-foreground/90 leading-relaxed">{student.suggested_activity}</p>
              : <p className="text-xs text-muted-foreground italic">No data — activity will be generated alongside the intervention script.</p>
            }
          </div>

          {/* Generated task result */}
          {taskResult && (
            <div className="rounded-lg border border-success/20 bg-success/10 p-3 space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-success">
                {taskResult.task_type === "lesson" ? "📖 Re-teach" : taskResult.task_type === "quiz" ? "✏️ Practice Quiz" : "🎯 Drilling"}
                {" "}· Mastery {Math.round((taskResult.current_mastery ?? 0) * 100)}%
              </p>
              <p className="text-xs text-foreground/90 leading-relaxed">{taskResult.instructions}</p>
              {taskResult.teacher_tip && (
                <p className="text-xs text-muted-foreground border-t border-border/40 pt-1.5 mt-1.5">
                  <span className="font-semibold">Tip: </span>{taskResult.teacher_tip}
                </p>
              )}
            </div>
          )}

          {/* Generate task button */}
          <button
            onClick={() => onGenerate(student.student_id, topTopic?.topic ?? "", topTopic?.subject ?? "")}
            disabled={!topTopic || generatingFor === student.student_id}
            className="w-full rounded-lg bg-gradient-primary py-2 text-xs font-semibold text-primary-foreground shadow-glow hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generatingFor === student.student_id
              ? "Generating…"
              : taskResult
                ? "Regenerate Task"
                : "Generate Personalised Task"}
          </button>
        </div>
      )}
    </div>
  );
}

const TIER_STATIC: Record<string, { label: string; color: string; bg: string; border: string; activity: string }> = {
  support: {
    label: "Support",
    color: "text-destructive",
    bg: "bg-destructive/10",
    border: "border-destructive/25",
    activity: "Teacher-led mini-lesson with worked examples",
  },
  core: {
    label: "Core",
    color: "text-warning",
    bg: "bg-warning/10",
    border: "border-warning/25",
    activity: "Structured pair practice with worksheet",
  },
  extension: {
    label: "Extension",
    color: "text-success",
    bg: "bg-success/10",
    border: "border-success/25",
    activity: "Independent application + peer teach-back",
  },
};

function MisconceptionClusterCard({
  cluster,
  studentDiagnostics,
  generatingPlan,
  planResult,
  onGenerate,
}: {
  cluster: MisconceptionCluster;
  studentDiagnostics: StudentDiagnostic[];
  generatingPlan: string | null;
  planResult?: DifferentiatedPlanResult;
  onGenerate: (cluster: MisconceptionCluster) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // Client-side tier split for display (backend re-computes for assignment)
  const relevant = studentDiagnostics.filter(
    (s) =>
      s.dominant_error === cluster.error_category ||
      s.topics.some((t) => t.error_category === cluster.error_category),
  );
  const sorted = [...relevant].sort((a, b) => b.total_errors - a.total_errors);
  const n = sorted.length || cluster.student_count;
  const third = Math.max(1, Math.floor(n / 3));
  const tierCounts = { support: third, core: third, extension: Math.max(0, n - third * 2) };

  const isGenerating = generatingPlan === cluster.error_category;

  return (
    <li className="rounded-xl border border-border/60 bg-background/40 overflow-hidden">
      <button
        className="w-full flex items-start justify-between gap-3 px-3 py-2.5 text-left hover:bg-accent/20 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">{cluster.error_category}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {cluster.topics_affected.slice(0, 2).join(", ")}
            {cluster.topics_affected.length > 2 ? ` +${cluster.topics_affected.length - 2}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold text-destructive">
            {cluster.student_count} student{cluster.student_count !== 1 ? "s" : ""}
          </span>
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", expanded && "rotate-180")} />
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-border/50">
          {/* Tier breakdown */}
          <div className="pt-3 space-y-2">
            {(["support", "core", "extension"] as const).map((tier) => {
              const meta = TIER_STATIC[tier];
              const group = planResult?.groups.find((g) => g.tier === tier);
              const count = group?.student_count ?? tierCounts[tier];
              const activity = group?.activity_suggestion ?? meta.activity;
              return (
                <div key={tier} className={cn("rounded-lg border px-3 py-2", meta.bg, meta.border)}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={cn("text-[10px] font-bold uppercase tracking-wider", meta.color)}>
                      {meta.label} Group
                    </span>
                    <span className="text-[10px] text-muted-foreground">{count} student{count !== 1 ? "s" : ""}</span>
                  </div>
                  <p className="text-xs text-foreground/80">{activity}</p>
                  {group?.instructions && (
                    <p className="text-xs text-foreground/70 mt-1 border-t border-border/30 pt-1 leading-relaxed">
                      {group.instructions}
                    </p>
                  )}
                  {group?.teacher_tip && (
                    <p className="text-[10px] text-muted-foreground mt-1 italic">
                      Tip: {group.teacher_tip}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Success banner after generation */}
          {planResult && (
            <div className="flex items-center gap-2 rounded-lg bg-success/10 border border-success/20 px-3 py-2">
              <span className="text-success text-xs font-semibold">
                ✅ {planResult.tasks_assigned} tasks assigned to students
              </span>
            </div>
          )}

          {/* Generate button */}
          <button
            onClick={() => onGenerate(cluster)}
            disabled={isGenerating}
            className="w-full rounded-lg bg-gradient-primary py-2 text-xs font-semibold text-primary-foreground shadow-glow hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isGenerating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isGenerating
              ? "Generating tasks…"
              : planResult
                ? "Regenerate & Reassign Tasks"
                : "Generate & Assign Tasks for All Groups"}
          </button>
        </div>
      )}
    </li>
  );
}

function ClassPulseBanner({
  cluster,
  busy,
  done,
  onAssign,
}: {
  cluster: MisconceptionCluster;
  busy: boolean;
  done?: DifferentiatedPlanResult;
  onAssign: () => void;
}) {
  const n = cluster.student_count;
  const topics = cluster.topics_affected.slice(0, 2).join(", ");
  const moreTopics = cluster.topics_affected.length > 2 ? ` +${cluster.topics_affected.length - 2}` : "";
  return (
    <section className="rounded-2xl border border-destructive/40 bg-gradient-to-r from-destructive/15 to-warning/10 p-5 shadow-card">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-destructive/20 text-destructive">
            <AlertTriangle className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-destructive">Class pulse — biggest blocker</p>
            <p className="mt-0.5 font-display text-lg font-bold leading-snug text-foreground">
              {n} student{n !== 1 ? "s" : ""} stuck on <span className="text-destructive">{cluster.error_category}</span>
            </p>
            {topics && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{topics}{moreTopics}</p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {done ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-success/15 px-3 py-2 text-xs font-semibold text-success">
              ✅ {done.tasks_assigned} task{done.tasks_assigned !== 1 ? "s" : ""} assigned
            </span>
          ) : (
            <button
              onClick={onAssign}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-glow transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {busy ? "Assigning…" : `Assign fix to all ${n}`}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function KpiCard({
  icon,
  label,
  value,
  delta,
  trend,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down";
  accent: "primary" | "success" | "destructive";
}) {
  const accentClasses =
    accent === "primary"
      ? "bg-primary/15 text-primary-glow"
      : accent === "success"
        ? "bg-success/15 text-success"
        : "bg-destructive/15 text-destructive";
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
      <div className="flex items-center justify-between">
        <span className={`grid h-10 w-10 place-items-center rounded-xl ${accentClasses}`}>{icon}</span>
        <span
          className={`flex items-center gap-1 text-xs font-medium ${
            trend === "up" ? "text-success" : "text-destructive"
          }`}
        >
          {trend === "up" ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          {delta}
        </span>
      </div>
      <div className="mt-4 text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-3xl font-bold tracking-tight">{value}</div>
    </div>
  );
}
