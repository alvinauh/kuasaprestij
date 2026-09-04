import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/lib/auth";
import { fetchLeaderboard, BASE_URL, type LeaderboardEntry } from "@/services/api";
import {
  Loader2,
  LogOut,
  Shield,
  Users,
  School,
  AlertTriangle,
  Trophy,
  ExternalLink,
  RefreshCw,
  Activity,
  Send,
  Zap,
  BookOpen,
  UserX,
  MessagesSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Fetch an /admin/* endpoint with the current user's Supabase access token.
 * The backend verifies the token resolves to a role='admin' user — the UI role
 * gate alone does not protect the API.
 */
async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Console — Skor" },
      { name: "description", content: "Administrator dashboard for managing users, classrooms, and system logs." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminConsole,
});

type Tab = "users" | "classrooms" | "errors" | "leaderboard" | "monitor" | "quality";

interface UserRow {
  id: string;
  full_name: string;
  role: AppRole;
  school: string | null;
  grade: string | null;
  created_at: string;
}

interface ClassroomRow {
  id: string;
  name: string;
  subject: string | null;
  invite_code: string;
  teacher_id: string;
  created_at: string;
  teacher_name?: string;
  member_count?: number;
}

interface ErrorRow {
  id: string;
  user_id: string | null;
  level: string;
  message: string;
  source: string | null;
  url: string | null;
  stack: string | null;
  created_at: string;
}

function AdminConsole() {
  const { profile, signOut, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("users");

  const unauthorized = !authLoading && profile?.role !== "admin";

  useEffect(() => {
    if (unauthorized) void navigate({ to: "/" });
  }, [unauthorized, navigate]);

  if (authLoading || unauthorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: typeof Users }[] = [
    { key: "users", label: "Users", icon: Users },
    { key: "classrooms", label: "Classrooms", icon: School },
    { key: "errors", label: "Error Log", icon: AlertTriangle },
    { key: "leaderboard", label: "Leaderboard", icon: Trophy },
    { key: "monitor", label: "Platform", icon: Activity },
    { key: "quality", label: "Feedback Quality", icon: MessagesSquare },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-destructive/15 text-destructive">
              <Shield className="h-5 w-5" />
            </span>
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight">Admin Console</h1>
              <p className="text-xs text-muted-foreground">
                Signed in as {profile?.full_name || "Administrator"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="https://lovable.dev"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Backend
            </a>
            <Link
              to="/"
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition"
            >
              Home
            </Link>
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
        <nav className="inline-flex flex-wrap rounded-full border border-border bg-card/60 p-1 text-sm">
          {tabs.map(({ key, label, icon: Icon }) => (
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

        {tab === "users" && <UsersPanel />}
        {tab === "classrooms" && <ClassroomsPanel />}
        {tab === "errors" && <ErrorsPanel />}
        {tab === "leaderboard" && <LeaderboardPanel />}
        {tab === "monitor" && <MonitorPanel />}
        {tab === "quality" && <FeedbackQualityPanel />}
      </main>
    </div>
  );
}

/* ---------------- Users ---------------- */

function UsersPanel() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, role, school, grade, created_at")
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setRows((data ?? []) as UserRow[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.full_name.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        (r.school ?? "").toLowerCase().includes(q),
    );
  }, [rows, query]);

  const changeRole = async (id: string, role: AppRole) => {
    setSavingId(id);
    const { error } = await supabase.rpc("admin_set_user_role", {
      _target_user: id,
      _new_role: role,
    });
    setSavingId(null);
    if (error) {
      alert(`Failed: ${error.message}`);
      return;
    }
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, role } : r)));
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">All users ({rows.length})</h2>
          <p className="text-sm text-muted-foreground">Change a user's role or review profiles.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, school, ID…"
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
          <button
            onClick={() => void load()}
            className="grid h-9 w-9 place-items-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground transition"
            aria-label="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading && (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading users…
        </div>
      )}
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      {!loading && !error && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">School</th>
                <th className="py-2 pr-3">Grade</th>
                <th className="py-2 pr-3">Role</th>
                <th className="py-2 pr-3">Joined</th>
                <th className="py-2 pr-3">ID</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b border-border/40">
                  <td className="py-2 pr-3 font-medium">{u.full_name || "—"}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{u.school || "—"}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{u.grade || "—"}</td>
                  <td className="py-2 pr-3">
                    <select
                      value={u.role}
                      disabled={savingId === u.id}
                      onChange={(e) => void changeRole(u.id, e.target.value as AppRole)}
                      className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                    >
                      <option value="student">student</option>
                      <option value="teacher">teacher</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-2 pr-3 font-mono text-[10px] text-muted-foreground">
                    {u.id.slice(0, 8)}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                    No users match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ---------------- Classrooms ---------------- */

function ClassroomsPanel() {
  const [rows, setRows] = useState<ClassroomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("classrooms")
      .select("id, name, subject, invite_code, teacher_id, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    const classrooms = (data ?? []) as ClassroomRow[];

    // Hydrate teacher names + member counts
    const teacherIds = Array.from(new Set(classrooms.map((c) => c.teacher_id)));
    const [{ data: profiles }, { data: members }] = await Promise.all([
      supabase.from("profiles").select("id, full_name").in("id", teacherIds.length ? teacherIds : ["00000000-0000-0000-0000-000000000000"]),
      supabase.from("classroom_members").select("classroom_id"),
    ]);
    const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name as string]));
    const countMap = new Map<string, number>();
    for (const m of (members ?? []) as { classroom_id: string }[]) {
      countMap.set(m.classroom_id, (countMap.get(m.classroom_id) ?? 0) + 1);
    }
    setRows(
      classrooms.map((c) => ({
        ...c,
        teacher_name: nameMap.get(c.teacher_id),
        member_count: countMap.get(c.id) ?? 0,
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const remove = async (id: string) => {
    if (!confirm("Delete this classroom permanently?")) return;
    const { error } = await supabase.from("classrooms").delete().eq("id", id);
    if (error) {
      alert(`Failed: ${error.message}`);
      return;
    }
    setRows((rs) => rs.filter((r) => r.id !== id));
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-card">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold">Classrooms ({rows.length})</h2>
          <p className="text-sm text-muted-foreground">All classrooms across all teachers.</p>
        </div>
        <button
          onClick={() => void load()}
          className="grid h-9 w-9 place-items-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground transition"
          aria-label="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {loading && (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading classrooms…
        </div>
      )}
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      {!loading && !error && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Subject</th>
                <th className="py-2 pr-3">Teacher</th>
                <th className="py-2 pr-3">Members</th>
                <th className="py-2 pr-3">Invite code</th>
                <th className="py-2 pr-3">Created</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-border/40">
                  <td className="py-2 pr-3 font-medium">{c.name}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{c.subject || "—"}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{c.teacher_name || c.teacher_id.slice(0, 8)}</td>
                  <td className="py-2 pr-3 tabular-nums">{c.member_count ?? 0}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{c.invite_code}</td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <button
                      onClick={() => void remove(c.id)}
                      className="rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 transition"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                    No classrooms yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ---------------- Errors ---------------- */

function ErrorsPanel() {
  const [rows, setRows] = useState<ErrorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("app_errors")
      .select("id, user_id, level, message, source, url, stack, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) setError(error.message);
    else setRows((data ?? []) as ErrorRow[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-card">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold">Error log ({rows.length})</h2>
          <p className="text-sm text-muted-foreground">Most recent 200 client-side errors.</p>
        </div>
        <button
          onClick={() => void load()}
          className="grid h-9 w-9 place-items-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground transition"
          aria-label="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {loading && (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading errors…
        </div>
      )}
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      {!loading && !error && (
        <ul className="mt-4 divide-y divide-border/60">
          {rows.map((r) => (
            <li key={r.id} className="py-3">
              <button
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                className="w-full text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                          r.level === "error"
                            ? "bg-destructive/15 text-destructive"
                            : r.level === "warn"
                              ? "bg-warning/15 text-warning"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        {r.level}
                      </span>
                      <span className="truncate text-sm font-medium">{r.message}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground truncate">
                      {r.source || "—"} · {r.url || "—"}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </span>
                </div>
              </button>
              {expanded === r.id && r.stack && (
                <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted/40 p-3 text-[11px] leading-snug">
                  {r.stack}
                </pre>
              )}
            </li>
          ))}
          {rows.length === 0 && (
            <li className="py-6 text-center text-sm text-muted-foreground">No errors logged.</li>
          )}
        </ul>
      )}
    </section>
  );
}

/* ---------------- Leaderboard ---------------- */

function LeaderboardPanel() {
  const [rows, setRows] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchLeaderboard(undefined, 50);
      setRows(r.leaderboard);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-card">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold">Leaderboard ({rows.length})</h2>
          <p className="text-sm text-muted-foreground">Top scoring students across the platform.</p>
        </div>
        <button
          onClick={() => void load()}
          className="grid h-9 w-9 place-items-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground transition"
          aria-label="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {loading && (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      {!loading && !error && (
        <ul className="mt-4 divide-y divide-border/60">
          {rows.map((s, i) => (
            <li key={s.student_id || i} className="flex items-center gap-3 py-2">
              <span className="w-6 text-center font-display text-sm font-bold text-muted-foreground">
                {s.rank}
              </span>
              <span className="flex-1 truncate font-mono text-xs">
                {(s.student_id || "").slice(0, 8)}
              </span>
              {s.game_wins > 0 && (
                <span className="text-xs text-muted-foreground">{s.game_wins} wins</span>
              )}
              <span className="font-display text-sm font-bold tabular-nums">{s.total_score}</span>
            </li>
          ))}
          {rows.length === 0 && (
            <li className="py-6 text-center text-sm text-muted-foreground">No data yet.</li>
          )}
        </ul>
      )}
    </section>
  );
}

/* ---------------- Platform Monitor ---------------- */

interface NodeStat {
  requests: number;
  errors: number;
  error_rate_pct: number;
  avg_ms: number;
  p50_ms: number;
  p95_ms: number;
}
interface MonitorData {
  last_5min: NodeStat;
  last_hour: NodeStat;
  nodes_last_hour: Record<string, NodeStat>;
  slowest_recent_spans: { node: string; label: string; ms: number }[];
  total_spans_last_hour: number;
  error?: string;
}
interface InsightsData {
  period_days: number;
  summary: {
    answers_today: number;
    correct_today: number;
    accuracy_today_pct: number;
    total_wrong_in_period: number;
    stuck_student_count: number;
    seed_gap_count: number;
  };
  worst_topics: { topic: string; total_errors: number; categories: Record<string, number> }[];
  stuck_students: { student_short: string; stuck_topic_count: number }[];
  seed_gaps: { topic: string; language: string; form_level: number }[];
  provider_health: { node_errors_24h: Record<string, number>; total_traces_24h: number };
}

function MonitorPanel() {
  const [monitor, setMonitor] = useState<MonitorData | null>(null);
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [digestSending, setDigestSending] = useState(false);
  const [digestMsg, setDigestMsg] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [m, i] = await Promise.all([
      adminFetch(`/admin/monitor`).then((r) => r.json()).catch((e) => ({ error: String(e) })),
      adminFetch(`/admin/insights?days=7`).then((r) => r.json()).catch(() => null),
    ]);
    setMonitor(m as MonitorData);
    setInsights(i as InsightsData);
    setLoading(false);
  };

  const sendDigest = async () => {
    setDigestSending(true);
    setDigestMsg(null);
    try {
      const r = await adminFetch(`/admin/digest`, { method: "POST" });
      const d = await r.json() as { sent: boolean; preview?: string; error?: string };
      setDigestMsg(d.sent ? "Digest sent to Telegram." : (d.error ?? "Not sent — check TELEGRAM_BOT_TOKEN in .env"));
    } catch {
      setDigestMsg("Request failed.");
    } finally {
      setDigestSending(false);
    }
  };

  useEffect(() => { void load(); }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading platform telemetry…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Platform Health</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={sendDigest}
            disabled={digestSending}
            className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition disabled:opacity-50"
          >
            {digestSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Send Telegram Digest
          </button>
          <button
            onClick={() => void load()}
            className="grid h-9 w-9 place-items-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground transition"
            aria-label="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>
      {digestMsg && <p className="text-sm text-muted-foreground">{digestMsg}</p>}

      {monitor?.error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {monitor.error}
        </div>
      ) : monitor && (
        <>
          {/* HTTP latency cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Req (5 min)", value: monitor.last_5min.requests },
              { label: "Errors (5 min)", value: monitor.last_5min.errors, warn: monitor.last_5min.errors > 0 },
              { label: "p50 latency (1 h)", value: `${monitor.last_hour.p50_ms} ms` },
              { label: "p95 latency (1 h)", value: `${monitor.last_hour.p95_ms} ms`, warn: monitor.last_hour.p95_ms > 5000 },
            ].map(({ label, value, warn }) => (
              <div key={label} className={cn("rounded-xl border bg-card p-4", warn ? "border-destructive/40" : "border-border")}>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className={cn("mt-1 text-2xl font-bold tabular-nums", warn ? "text-destructive" : "")}>{value}</p>
              </div>
            ))}
          </div>

          {/* Node breakdown */}
          {Object.keys(monitor.nodes_last_hour).length > 0 && (
            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-3 flex items-center gap-2">
                <Zap className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-semibold">Agent node latency (last hour)</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-4">Node</th>
                      <th className="py-2 pr-4">Calls</th>
                      <th className="py-2 pr-4">Errors</th>
                      <th className="py-2 pr-4">Avg ms</th>
                      <th className="py-2 pr-4">p50 ms</th>
                      <th className="py-2 pr-4">p95 ms</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(monitor.nodes_last_hour).map(([name, s]) => (
                      <tr key={name} className="border-b border-border/40">
                        <td className="py-2 pr-4 font-mono text-xs">{name}</td>
                        <td className="py-2 pr-4 tabular-nums">{s.requests}</td>
                        <td className={cn("py-2 pr-4 tabular-nums", s.errors > 0 ? "text-destructive font-semibold" : "text-muted-foreground")}>{s.errors}</td>
                        <td className="py-2 pr-4 tabular-nums text-muted-foreground">{s.avg_ms}</td>
                        <td className="py-2 pr-4 tabular-nums">{s.p50_ms}</td>
                        <td className={cn("py-2 pr-4 tabular-nums", s.p95_ms > 5000 ? "text-amber-500" : "")}>{s.p95_ms}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Slowest spans */}
          {monitor.slowest_recent_spans.length > 0 && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/5 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-600">Slowest recent spans</p>
              <ul className="space-y-1">
                {monitor.slowest_recent_spans.map((s, i) => (
                  <li key={i} className="flex items-center justify-between text-sm">
                    <span className="font-mono text-xs text-muted-foreground">{s.node} — {s.label}</span>
                    <span className="font-bold tabular-nums text-amber-600">{s.ms} ms</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* Insights */}
      {insights && (
        <div className="grid gap-4 sm:grid-cols-3">
          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold">Today's activity</h3>
            </div>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Answers</dt><dd className="font-semibold tabular-nums">{insights.summary.answers_today}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Accuracy</dt><dd className="font-semibold tabular-nums">{insights.summary.accuracy_today_pct}%</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Stuck students</dt><dd className={cn("font-semibold tabular-nums", insights.summary.stuck_student_count > 0 ? "text-amber-500" : "")}>{insights.summary.stuck_student_count}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Seed gaps</dt><dd className={cn("font-semibold tabular-nums", insights.summary.seed_gap_count > 0 ? "text-destructive" : "")}>{insights.summary.seed_gap_count}</dd></div>
            </dl>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold">Top problem topics (7d)</h3>
            </div>
            <ul className="space-y-1.5">
              {insights.worst_topics.slice(0, 5).map((t) => (
                <li key={t.topic} className="flex items-center justify-between text-sm">
                  <span className="truncate text-xs">{t.topic}</span>
                  <span className="ml-2 shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">{t.total_errors} err</span>
                </li>
              ))}
              {insights.worst_topics.length === 0 && <li className="text-xs text-muted-foreground">No errors logged.</li>}
            </ul>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <UserX className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold">Stuck students</h3>
            </div>
            <ul className="space-y-1.5">
              {insights.stuck_students.slice(0, 5).map((s) => (
                <li key={s.student_short} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-xs">{s.student_short}</span>
                  <span className="ml-2 shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600">{s.stuck_topic_count} topics</span>
                </li>
              ))}
              {insights.stuck_students.length === 0 && <li className="text-xs text-muted-foreground">No stuck students.</li>}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feedback Quality — dialogic-move breakdown of the generated teacher notes
// ---------------------------------------------------------------------------

interface FQCategory {
  code: string;
  label: string;
  desc: string;
  count: number;
  pct: number;
}
interface FQCoded {
  utterance: string;
  label: string;
  topic: string;
  error_category: string;
}
interface FQResult {
  scripts_analyzed: number;
  total_acts: number;
  coverage_pct: number;
  distribution: FQCategory[];
  underrepresented: string[];
  coded_sample: FQCoded[];
}

function FeedbackQualityPanel() {
  const [result, setResult] = useState<FQResult | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    const d = await adminFetch(`/admin/feedback_quality`)
      .then((r) => r.json())
      .catch(() => null);
    setResult((d?.result as FQResult) ?? null);
    setCreatedAt(d?.created_at ?? null);
    setLoading(false);
  };

  const run = async () => {
    setRunning(true);
    try {
      const d = await adminFetch(`/admin/feedback_quality/run`, { method: "POST" }).then((r) => r.json());
      setResult((d?.result as FQResult) ?? null);
      setCreatedAt(d?.created_at ?? null);
    } catch {
      /* surfaced by empty state */
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const maxPct = useMemo(
    () => Math.max(1, ...(result?.distribution ?? []).map((d) => d.pct)),
    [result],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Feedback Quality</h2>
          <p className="text-xs text-muted-foreground">
            Teaching-move breakdown of the AI-generated teacher intervention notes. High-value
            moves like <em>Invites Reasoning</em> indicate dialogically rich scaffolds; a large
            <em> Unclassified</em> share means the coding run under-covered.
          </p>
        </div>
        <button
          onClick={() => void run()}
          disabled={running}
          className="flex items-center gap-1.5 rounded-full bg-gradient-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground shadow-glow transition disabled:opacity-50"
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {running ? "Auditing…" : "Run audit"}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading last audit…
        </div>
      ) : !result ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          No audit yet. Click <span className="font-semibold text-foreground">Run audit</span> to
          analyze the current teacher intervention notes.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <FQStat label="Notes analyzed" value={String(result.scripts_analyzed)} />
            <FQStat label="Utterances coded" value={String(result.total_acts)} />
            <FQStat label="Coverage" value={`${result.coverage_pct}%`} />
            <FQStat
              label="Last run"
              value={createdAt ? new Date(createdAt).toLocaleString() : "—"}
            />
          </div>

          <section className="rounded-2xl border border-border bg-card p-6 shadow-card">
            <h3 className="mb-4 font-display text-sm font-semibold">Teaching-move distribution</h3>
            <div className="space-y-2.5">
              {result.distribution.map((d) => (
                <div key={d.code} className="flex items-center gap-3">
                  <div className="w-44 shrink-0 text-xs" title={d.desc}>
                    <span className={d.code === "unclassified" ? "text-muted-foreground italic" : "font-medium"}>
                      {d.label}
                    </span>
                  </div>
                  <div className="h-4 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        d.code === "unclassified" ? "bg-muted-foreground/40" : "bg-gradient-primary",
                      )}
                      style={{ width: `${(d.pct / maxPct) * 100}%` }}
                    />
                  </div>
                  <div className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {d.count} · {d.pct}%
                  </div>
                </div>
              ))}
            </div>
            {result.underrepresented.length > 0 && (
              <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
                <span className="font-semibold">Under-represented moves:</span>{" "}
                {result.underrepresented.join(", ")}. Consider revising the intervention-script
                prompt to include these.
              </p>
            )}
          </section>

          {result.coded_sample.length > 0 && (
            <section className="rounded-2xl border border-border bg-card p-6 shadow-card">
              <h3 className="mb-4 font-display text-sm font-semibold">Coded sample</h3>
              <ul className="space-y-2">
                {result.coded_sample.slice(0, 15).map((c, i) => (
                  <li key={i} className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        {c.label}
                      </span>
                      {c.topic && <span className="text-[11px] text-muted-foreground">{c.topic}</span>}
                    </div>
                    <p className="text-xs text-foreground/80">{c.utterance}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function FQStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-bold">{value}</div>
    </div>
  );
}
