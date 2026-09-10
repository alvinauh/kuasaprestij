import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Copy, Check, Users, ArrowLeft, X, AlertTriangle, Sparkles, Trash2, Pencil, Search, UserPlus } from "lucide-react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  generateAiTask,
  assignAiTask,
  fetchStudentDashboard,
  deriveAccommodations,
  getGoogleAuthUrl,
  getGoogleStatus,
  listGoogleCourses,
  importGoogleRoster,
  linkGoogleCourse,
  pushGradesToGoogle,
  disconnectGoogle,
  type GenerateTaskResult,
  type ConditionKey,
  type DeriveAccommodationsResult,
  type PaceProfileResult,
  type GoogleCourse,
  type ImportRosterResult,
} from "@/services/api";
import {
  ACCOMMODATION_GROUPS,
  DEFAULT_ACCOMMODATIONS,
  type AccommodationPrefs,
  type StudentPrefs,
} from "@/hooks/useStudentPrefs";

interface Classroom {
  id: string;
  name: string;
  subject: string | null;
  invite_code: string;
  created_at: string;
}

interface StudentRow {
  id: string;
  full_name: string;
  school: string | null;
  grade: string | null;
  joined_at: string;
  classroom_id: string;
  classroom_name: string;
}

export function ClassroomsPanel() {
  const { user } = useAuth();
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleClassroom, setGoogleClassroom] = useState<Classroom | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [addStudentClassroom, setAddStudentClassroom] = useState<Classroom | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<StudentRow | null>(null);
  const [editStudentRow, setEditStudentRow] = useState<StudentRow | null>(null);
  const [aiTaskStudent, setAiTaskStudent] = useState<{ student: StudentRow; subject: string | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Classroom | null>(null);
  const [deleting, setDeleting] = useState(false);

  const connectGoogle = async () => {
    setGoogleLoading(true);
    try {
      const url = await getGoogleAuthUrl();
      window.location.href = url;
    } catch {
      setGoogleLoading(false);
    }
  };

  const disconnectGoogleAccount = async () => {
    if (!confirm("Disconnect your Google Classroom account?")) return;
    await disconnectGoogle();
    setGoogleConnected(false);
  };

  const removeStudent = async (classroomId: string, studentId: string, studentName: string) => {
    if (!confirm(`Remove ${studentName} from this classroom?`)) return;
    const { error } = await supabase
      .from("classroom_members")
      .delete()
      .eq("classroom_id", classroomId)
      .eq("student_id", studentId);
    if (error) setError(error.message);
    else void load();
  };

  const handleDelete = async (cls: Classroom) => {
    setDeleting(true);
    const { error } = await supabase.from("classrooms").delete().eq("id", cls.id);
    setDeleting(false);
    if (error) {
      setError(error.message);
    } else {
      setConfirmDelete(null);
      void load();
    }
  };

  const load = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data: cls, error: e1 } = await supabase
        .from("classrooms")
        .select("id, name, subject, invite_code, created_at")
        .eq("teacher_id", user.id)
        .order("created_at", { ascending: false });
      if (e1) throw e1;
      const classroomsList = (cls ?? []) as Classroom[];
      setClassrooms(classroomsList);

      if (classroomsList.length === 0) {
        setStudents([]);
        return;
      }

      const ids = classroomsList.map((c) => c.id);
      const { data: members, error: e2 } = await supabase
        .from("classroom_members")
        .select("student_id, classroom_id, joined_at")
        .in("classroom_id", ids);
      if (e2) throw e2;

      const studentIds = Array.from(new Set((members ?? []).map((m) => m.student_id)));
      let profilesById: Record<
        string,
        { full_name: string; school: string | null; grade: string | null }
      > = {};
      if (studentIds.length > 0) {
        const { data: profs, error: e3 } = await supabase
          .from("profiles")
          .select("id, full_name, school, grade")
          .in("id", studentIds);
        if (e3) throw e3;
        profilesById = Object.fromEntries(
          (profs ?? []).map((p) => [
            p.id,
            { full_name: p.full_name, school: p.school, grade: p.grade },
          ]),
        );
      }
      const cMap = Object.fromEntries(classroomsList.map((c) => [c.id, c.name]));
      const rows: StudentRow[] = (members ?? []).map((m) => ({
        id: m.student_id,
        classroom_id: m.classroom_id,
        classroom_name: cMap[m.classroom_id] ?? "",
        joined_at: m.joined_at,
        full_name: profilesById[m.student_id]?.full_name ?? "Student",
        school: profilesById[m.student_id]?.school ?? null,
        grade: profilesById[m.student_id]?.grade ?? null,
      }));
      setStudents(rows);
    } catch (err) {
      const msg = err instanceof Error
        ? err.message
        : (err as { message?: string })?.message ?? "Failed to load classrooms";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    void getGoogleStatus().then((s) => setGoogleConnected(s.connected));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Handle Google OAuth redirect result
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("google_connected") === "1") {
      setGoogleConnected(true);
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("google_error")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Re-fetch when any student joins one of this teacher's classrooms
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("classrooms-panel-members")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "classroom_members" },
        () => { void load(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (selectedStudent) {
    return (
      <StudentDetail
        student={selectedStudent}
        onBack={() => setSelectedStudent(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold">My Classrooms</h2>
          <p className="text-sm text-muted-foreground">
            {classrooms.length} classroom{classrooms.length === 1 ? "" : "s"} •{" "}
            {students.length} student{students.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button
          onClick={() => setShowCreate(true)}
          className="rounded-xl bg-gradient-primary shadow-glow hover:opacity-95"
        >
          <Plus className="h-4 w-4" /> New classroom
        </Button>
      </div>

      {/* Google Classroom connection banner */}
      <div className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm",
        googleConnected
          ? "border-green-500/30 bg-green-500/5 text-green-700 dark:text-green-300"
          : "border-border bg-muted/30 text-muted-foreground",
      )}>
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
          </svg>
          {googleConnected
            ? "Google Classroom connected — you can import rosters and sync grades."
            : "Connect Google Classroom to import rosters and sync grades."}
        </div>
        {googleConnected ? (
          <button
            onClick={() => void disconnectGoogleAccount()}
            className="rounded-lg border border-current px-3 py-1 text-xs font-medium opacity-70 hover:opacity-100 transition"
          >
            Disconnect
          </button>
        ) : (
          <Button
            size="sm"
            onClick={() => void connectGoogle()}
            disabled={googleLoading}
            className="rounded-lg bg-white text-gray-800 border border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
          >
            {googleLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Connect Google"}
          </Button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading classrooms…
        </div>
      ) : classrooms.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center">
          <Users className="mx-auto h-8 w-8 text-muted-foreground" />
          <h3 className="mt-3 font-display text-lg font-semibold">
            No classrooms yet
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first classroom and share the invite link with students.
          </p>
          <Button
            onClick={() => setShowCreate(true)}
            className="mt-5 rounded-xl bg-gradient-primary shadow-glow hover:opacity-95"
          >
            <Plus className="h-4 w-4" /> New classroom
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {classrooms.map((cls) => {
            const roster = students.filter((s) => s.classroom_id === cls.id);
            return (
              <div
                key={cls.id}
                className="overflow-hidden rounded-2xl border border-border bg-card shadow-card"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/60 px-5 py-4">
                  <div>
                    <h3 className="font-display text-base font-semibold">{cls.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {cls.subject ?? "—"} • {roster.length} student
                      {roster.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAddStudentClassroom(cls)}
                      className="rounded-lg"
                    >
                      <UserPlus className="h-4 w-4" /> Add student
                    </Button>
                    {googleConnected && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setGoogleClassroom(cls)}
                        className="rounded-lg border-green-500/40 text-green-700 hover:bg-green-500/10 dark:text-green-300"
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
                        </svg>
                        Google
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDelete(cls)}
                      className="rounded-lg border-destructive/40 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {roster.length === 0 ? (
                  <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                    No students yet — share the invite link to get them in.
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-5 py-2 text-left font-medium">Name</th>
                        <th className="px-5 py-2 text-left font-medium">School</th>
                        <th className="px-5 py-2 text-left font-medium">Grade</th>
                        <th className="px-5 py-2 text-left font-medium">Joined</th>
                        <th className="px-5 py-2"></th>
                        <th className="px-5 py-2"></th>
                        <th className="px-5 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {roster.map((s) => (
                        <tr
                          key={`${s.classroom_id}:${s.id}`}
                          className="cursor-pointer border-t border-border/60 transition hover:bg-accent/30"
                          onClick={() => setSelectedStudent(s)}
                        >
                          <td className="px-5 py-3 font-medium">{s.full_name}</td>
                          <td className="px-5 py-3 text-muted-foreground">
                            {s.school ?? "—"}
                          </td>
                          <td className="px-5 py-3 text-muted-foreground">
                            {s.grade ?? "—"}
                          </td>
                          <td className="px-5 py-3 text-muted-foreground">
                            {new Date(s.joined_at).toLocaleDateString()}
                          </td>
                          <td className="px-3 py-3">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setAiTaskStudent({ student: s, subject: cls.subject });
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-violet-400/50 bg-violet-900/30 px-2.5 py-1.5 text-[11px] font-semibold text-violet-200 transition hover:bg-violet-800/50"
                            >
                              <Sparkles className="h-3 w-3" /> AI Task
                            </button>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setEditStudentRow(s); }}
                                className="inline-flex items-center rounded-md border border-border bg-card px-2 py-1.5 text-muted-foreground transition hover:text-foreground"
                                title="Edit school / grade"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); void removeStudent(s.classroom_id, s.id, s.full_name); }}
                                className="inline-flex items-center rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-destructive transition hover:bg-destructive/10"
                                title="Remove from classroom"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-right text-xs font-medium text-primary-glow">
                            View insights →
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      )}

      <CreateClassroomDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={() => {
          setShowCreate(false);
          void load();
        }}
      />
      <AddStudentDialog
        classroom={addStudentClassroom}
        onClose={() => setAddStudentClassroom(null)}
        onAdded={() => void load()}
      />
      <GoogleClassroomDialog
        classroom={googleClassroom}
        onClose={() => { setGoogleClassroom(null); void load(); }}
      />
      <EditStudentDialog
        student={editStudentRow}
        onClose={() => setEditStudentRow(null)}
        onSaved={() => { setEditStudentRow(null); void load(); }}
      />
      <AiTaskDialog
        student={aiTaskStudent?.student ?? null}
        classroomSubject={aiTaskStudent?.subject ?? null}
        onClose={() => setAiTaskStudent(null)}
      />

      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl">
            <h3 className="font-display text-lg font-semibold">Delete classroom?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">"{confirmDelete.name}"</span> and all
              its student memberships will be permanently deleted. This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setConfirmDelete(null)} disabled={deleting}>
                Cancel
              </Button>
              <Button
                onClick={() => handleDelete(confirmDelete)}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type GCTab = "link" | "import" | "grades";

function GoogleClassroomDialog({
  classroom,
  onClose,
}: {
  classroom: Classroom | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<GCTab>("link");
  const [courses, setCourses] = useState<GoogleCourse[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [linkedCourseId, setLinkedCourseId] = useState<string | null>(null);
  const [linkedCourseName, setLinkedCourseName] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [importResult, setImportResult] = useState<ImportRosterResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [gradeResult, setGradeResult] = useState<{ succeeded: number; failed: number } | null>(null);
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!classroom) return;
    setTab("link");
    setImportResult(null);
    setGradeResult(null);
    setError(null);

    // Load existing link from DB
    void import("@/integrations/supabase/client").then(({ supabase }) =>
      supabase
        .from("classroom_google_links")
        .select("google_course_id, google_course_name")
        .eq("classroom_id", classroom.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setLinkedCourseId(data.google_course_id);
            setLinkedCourseName(data.google_course_name);
            setTab("import");
          }
        })
    );

    // Fetch courses
    setCoursesLoading(true);
    void listGoogleCourses()
      .then(setCourses)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load courses"))
      .finally(() => setCoursesLoading(false));
  }, [classroom?.id]);

  const linkCourse = async (course: GoogleCourse) => {
    if (!classroom) return;
    setLinking(true);
    setError(null);
    try {
      await linkGoogleCourse(classroom.id, course.id, course.name);
      setLinkedCourseId(course.id);
      setLinkedCourseName(course.name);
      setTab("import");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to link");
    } finally {
      setLinking(false);
    }
  };

  const runImport = async () => {
    if (!classroom || !linkedCourseId) return;
    setImporting(true);
    setError(null);
    try {
      const result = await importGoogleRoster(linkedCourseId, classroom.id);
      setImportResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const runPushGrades = async () => {
    if (!classroom) return;
    setPushing(true);
    setError(null);
    try {
      const result = await pushGradesToGoogle(classroom.id);
      setGradeResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Grade push failed");
    } finally {
      setPushing(false);
    }
  };

  const gcTabs: { key: GCTab; label: string }[] = [
    { key: "link", label: "1 · Link course" },
    { key: "import", label: "2 · Import roster" },
    { key: "grades", label: "3 · Sync grades" },
  ];

  return (
    <Dialog open={!!classroom} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <svg className="h-5 w-5 text-green-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
            </svg>
            Google Classroom — {classroom?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 rounded-lg bg-muted/40 p-1 text-xs">
          {gcTabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex-1 rounded-md px-2 py-1.5 font-medium transition",
                tab === t.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {/* Tab: Link course */}
        {tab === "link" && (
          <div className="space-y-3">
            {linkedCourseId ? (
              <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3 text-sm">
                <p className="font-medium text-green-700 dark:text-green-300">
                  Linked to: {linkedCourseName ?? linkedCourseId}
                </p>
                <button
                  onClick={() => setTab("import")}
                  className="mt-1 text-xs underline text-green-600 dark:text-green-400"
                >
                  Proceed to import →
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Select a Google Classroom course to link to <strong>{classroom?.name}</strong>.
                </p>
                {coursesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading your Google courses…
                  </div>
                ) : courses.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No active Google Classroom courses found.
                  </p>
                ) : (
                  <ul className="max-h-56 overflow-y-auto divide-y divide-border rounded-lg border border-border">
                    {courses.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
                        <div>
                          <p className="text-sm font-medium">{c.name}</p>
                          {c.section && <p className="text-xs text-muted-foreground">{c.section}</p>}
                        </div>
                        <Button
                          size="sm"
                          disabled={linking}
                          onClick={() => void linkCourse(c)}
                          className="h-7 shrink-0 px-3 text-xs"
                        >
                          {linking ? <Loader2 className="h-3 w-3 animate-spin" /> : "Link"}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}

        {/* Tab: Import roster */}
        {tab === "import" && (
          <div className="space-y-4">
            {!linkedCourseId ? (
              <p className="text-sm text-muted-foreground">Link a course first.</p>
            ) : importResult ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-3 text-center">
                    <p className="text-2xl font-bold text-green-700 dark:text-green-300">{importResult.enrolled.length}</p>
                    <p className="text-xs text-muted-foreground">enrolled</p>
                  </div>
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-center">
                    <p className="text-2xl font-bold text-amber-600">{importResult.unmatched.length}</p>
                    <p className="text-xs text-muted-foreground">no account yet</p>
                  </div>
                </div>
                {importResult.unmatched.length > 0 && (
                  <div className="max-h-32 overflow-y-auto rounded-lg border border-border text-xs">
                    {importResult.unmatched.map((u) => (
                      <div key={u.email} className="flex items-center justify-between border-b border-border/60 px-3 py-1.5">
                        <span>{u.full_name || u.email}</span>
                        <span className="text-muted-foreground">{u.email}</span>
                      </div>
                    ))}
                  </div>
                )}
                {importResult.unmatched.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Unmatched students need to sign up to KuasaPrestij with the same Google email address.
                  </p>
                )}
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Import all students from <strong>{linkedCourseName}</strong> into this classroom.
                  Students without a KuasaPrestij account will be listed as unmatched.
                </p>
                <Button
                  onClick={() => void runImport()}
                  disabled={importing}
                  className="w-full bg-gradient-primary shadow-glow hover:opacity-95"
                >
                  {importing ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />Importing…</>
                  ) : (
                    "Import roster from Google Classroom"
                  )}
                </Button>
              </>
            )}
          </div>
        )}

        {/* Tab: Sync grades */}
        {tab === "grades" && (
          <div className="space-y-4">
            {!linkedCourseId ? (
              <p className="text-sm text-muted-foreground">Link a course first.</p>
            ) : gradeResult ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-3 text-center">
                    <p className="text-2xl font-bold text-green-700 dark:text-green-300">{gradeResult.succeeded}</p>
                    <p className="text-xs text-muted-foreground">grades posted</p>
                  </div>
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-center">
                    <p className="text-2xl font-bold text-amber-600">{gradeResult.failed}</p>
                    <p className="text-xs text-muted-foreground">skipped</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Grades appear in Google Classroom under "KuasaPrestij Progress" as a score out of 100.
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Post each student's current average mastery score (0–100) back to Google Classroom
                  as an assignment grade. An assignment called "KuasaPrestij Progress" is created
                  automatically if it doesn't exist.
                </p>
                <Button
                  onClick={() => void runPushGrades()}
                  disabled={pushing}
                  className="w-full bg-gradient-primary shadow-glow hover:opacity-95"
                >
                  {pushing ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />Syncing grades…</>
                  ) : (
                    "Sync mastery scores to Google Classroom"
                  )}
                </Button>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateClassroomDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!user || !name.trim()) return;
    setSubmitting(true);
    setError(null);
    const { error } = await supabase.from("classrooms").insert({
      teacher_id: user.id,
      name: name.trim(),
      subject: subject.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setName("");
    setSubject("");
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New classroom</DialogTitle>
          <DialogDescription>
            Give it a name (e.g. "Form 4 Bestari — Physics") and optionally a subject.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cls-name">Name</Label>
            <Input
              id="cls-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Form 4 Bestari"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cls-subject">Subject</Label>
            <Input
              id="cls-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Physics"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={submitting || !name.trim()}
            className="bg-gradient-primary shadow-glow hover:opacity-95"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface StudentSearchResult {
  id: string;
  full_name: string;
  school: string | null;
  grade: string | null;
}

function AddStudentDialog({
  classroom,
  onClose,
  onAdded,
}: {
  classroom: Classroom | null;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StudentSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inviteUrl = useMemo(() => {
    if (!classroom || typeof window === "undefined") return "";
    return `${window.location.origin}/login?invite=${classroom.invite_code}`;
  }, [classroom]);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    const timer = setTimeout(async () => {
      const { data } = await supabase.rpc("search_students_by_name", { _query: query.trim() });
      setResults((data ?? []) as StudentSearchResult[]);
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Reset when classroom changes
  useEffect(() => {
    setQuery("");
    setResults([]);
    setAddedIds(new Set());
    setError(null);
  }, [classroom?.id]);

  const addStudent = async (studentId: string) => {
    if (!classroom) return;
    setAdding(studentId);
    setError(null);
    const { error } = await supabase
      .from("classroom_members")
      .insert({ classroom_id: classroom.id, student_id: studentId });
    setAdding(null);
    if (error && !error.message.toLowerCase().includes("duplicate") && !error.message.toLowerCase().includes("unique")) {
      setError(error.message);
      return;
    }
    setAddedIds((prev) => new Set([...prev, studentId]));
    onAdded();
  };

  const copy = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <Dialog open={!!classroom} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add student to {classroom?.name}</DialogTitle>
          <DialogDescription>
            Search for a student by name and add them directly, or share the invite link.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Add by name
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type a student's name…"
                className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {searching && (
              <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Searching…
              </p>
            )}
            {results.length > 0 && (
              <ul className="mt-2 max-h-52 overflow-y-auto divide-y divide-border rounded-lg border border-border bg-background">
                {results.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{s.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.school ?? "—"} · {s.grade ?? "—"}
                      </p>
                    </div>
                    {addedIds.has(s.id) ? (
                      <span className="shrink-0 flex items-center gap-1 text-xs font-medium text-success">
                        <Check className="h-3.5 w-3.5" /> Added
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        disabled={adding === s.id}
                        onClick={() => void addStudent(s.id)}
                        className="h-7 shrink-0 px-3 text-xs"
                      >
                        {adding === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {query.trim().length >= 2 && !searching && results.length === 0 && (
              <p className="mt-2 text-xs text-muted-foreground">No students found for "{query}"</p>
            )}
            {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-card px-2 text-xs text-muted-foreground">or share invite link</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-background/60 px-3 py-2">
              <code className="flex-1 truncate text-xs">{inviteUrl}</code>
              <Button size="sm" variant="outline" onClick={copy} className="shrink-0">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Code: <code className="font-mono">{classroom?.invite_code}</code>
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditStudentDialog({
  student,
  onClose,
  onSaved,
}: {
  student: StudentRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [school, setSchool] = useState("");
  const [grade, setGrade] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (student) {
      setSchool(student.school ?? "");
      setGrade(student.grade ?? "");
      setError(null);
    }
  }, [student]);

  const save = async () => {
    if (!student) return;
    setSaving(true);
    setError(null);
    const { error } = await supabase.rpc("teacher_update_student_profile", {
      _student_id: student.id,
      _school: school.trim(),
      _grade: grade.trim(),
    });
    setSaving(false);
    if (error) { setError(error.message); return; }
    onSaved();
  };

  return (
    <Dialog open={!!student} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {student?.full_name}</DialogTitle>
          <DialogDescription>Update school and grade for this student.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="es-school">School</Label>
            <Input
              id="es-school"
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              placeholder="SMK Taman Melawati"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="es-grade">Grade / Form</Label>
            <Input
              id="es-grade"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              placeholder="Form 4"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => void save()}
            disabled={saving}
            className="bg-gradient-primary shadow-glow hover:opacity-95"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AiTaskDialog({
  student,
  classroomSubject,
  onClose,
}: {
  student: StudentRow | null;
  classroomSubject: string | null;
  onClose: () => void;
}) {
  const [topic, setTopic] = useState("");
  const [subject, setSubject] = useState(classroomSubject ?? "");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerateTaskResult | null>(null);
  const [instructions, setInstructions] = useState("");
  const [teacherNote, setTeacherNote] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTopic("");
    setSubject(classroomSubject ?? "");
    setGenerating(false);
    setResult(null);
    setInstructions("");
    setTeacherNote("");
    setAssigning(false);
    setDone(false);
    setError(null);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleGenerate = async () => {
    if (!student) return;
    setGenerating(true);
    setError(null);
    try {
      const r = await generateAiTask(student.id, topic, subject);
      setResult(r);
      setInstructions(r.instructions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate suggestion");
    } finally {
      setGenerating(false);
    }
  };

  const handleAssign = async () => {
    if (!student || !result) return;
    setAssigning(true);
    setError(null);
    try {
      await assignAiTask({
        student_id: student.id,
        subject: result.subject,
        topic: result.topic,
        task_type: result.task_type as "quiz" | "lesson" | "practice",
        instructions,
        teacher_note: teacherNote || undefined,
        error_context: result.error_context,
        priority_score: result.priority_score,
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to assign task");
    } finally {
      setAssigning(false);
    }
  };

  return (
    <Dialog open={!!student} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-400" />
            AI Task for {student?.full_name}
          </DialogTitle>
          <DialogDescription>
            AI picks the weakest topic based on this student's mastery and recent mistakes.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="py-6 text-center space-y-2">
            <Check className="mx-auto h-8 w-8 text-success" />
            <p className="font-medium">Task assigned!</p>
            <p className="text-sm text-muted-foreground">
              {student?.full_name} will see it in their Assigned Tasks.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ai-subject">Subject</Label>
                <Input
                  id="ai-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Physics"
                  disabled={!!result}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ai-topic">Topic (optional)</Label>
                <Input
                  id="ai-topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="AI picks weakest"
                  disabled={!!result}
                />
              </div>
            </div>

            {!result && (
              <>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button
                  onClick={handleGenerate}
                  disabled={generating || !subject.trim()}
                  className="w-full bg-violet-600 hover:bg-violet-500 text-white"
                >
                  {generating ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />Generating…</>
                  ) : (
                    <><Sparkles className="h-4 w-4 mr-2" />Generate AI Suggestion</>
                  )}
                </Button>
              </>
            )}

            {result && (
              <div className="space-y-3 rounded-xl border border-violet-400/40 bg-violet-950/30 p-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="rounded-full bg-violet-500/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-200">
                    {result.task_type}
                  </span>
                  <span className="text-sm font-semibold">{result.topic}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    Mastery: {Math.round((result.current_mastery ?? 0) * 100)}%
                  </span>
                </div>
                {result.teacher_tip && (
                  <div className="rounded-lg border border-amber-400/30 bg-amber-950/30 px-3 py-2">
                    <p className="text-xs font-medium text-amber-300">AI tip for teacher</p>
                    <p className="mt-0.5 text-xs text-amber-100">{result.teacher_tip}</p>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Instructions (editable)</Label>
                  <textarea
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ai-note">Teacher note (optional)</Label>
                  <Input
                    id="ai-note"
                    value={teacherNote}
                    onChange={(e) => setTeacherNote(e.target.value)}
                    placeholder="e.g. Focus on diagrams"
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {done ? "Close" : "Cancel"}
          </Button>
          {result && !done && (
            <Button
              onClick={handleAssign}
              disabled={assigning || !instructions.trim()}
              className="bg-violet-600 hover:bg-violet-500 text-white"
            >
              {assigning ? <Loader2 className="h-4 w-4 animate-spin" /> : "Assign Task →"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StudentDetail({
  student,
  onBack,
}: {
  student: StudentRow;
  onBack: () => void;
}) {
  const [radarData, setRadarData] = useState<{ subject: string; mastery: number }[]>([]);
  const [insights, setInsights] = useState<{ severity: string; text: string; topic: string; count: number }[]>([]);
  const [overallProgress, setOverallProgress] = useState<number | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setDetailLoading(true);
    void fetchStudentDashboard(student.id).then((data) => {
      if (cancelled) return;
      setOverallProgress(data.overall_progress);
      setRadarData(data.radar);
      setInsights(data.insights.slice(0, 5).map((g) => ({
        severity: g.count >= 3 ? "destructive" : "warning",
        text: g.root_cause || g.error_category || "Misconception detected",
        topic: g.topic,
        count: g.count,
      })));
    }).catch(() => {}).finally(() => {
      if (!cancelled) setDetailLoading(false);
    });
    return () => { cancelled = true; };
  }, [student.id]);

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to classrooms
      </button>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-6 shadow-card">
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-primary text-lg font-bold text-primary-foreground shadow-glow">
            {student.full_name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight">
              {student.full_name}
            </h2>
            <p className="text-sm text-muted-foreground">
              {student.classroom_name} • {student.school ?? "—"} •{" "}
              {student.grade ?? "—"}
            </p>
          </div>
        </div>
        {overallProgress !== null && (
          <div className="text-right">
            <p className="text-2xl font-bold">{Math.round(overallProgress * 100)}%</p>
            <p className="text-xs text-muted-foreground">overall curriculum</p>
          </div>
        )}
      </div>

      {detailLoading ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card/60 px-4 py-8 text-sm text-muted-foreground justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading student data…
        </div>
      ) : (
        <section className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3 rounded-2xl border border-border bg-card p-6 shadow-card">
            <h3 className="font-display text-lg font-semibold">Mastery radar</h3>
            <p className="text-sm text-muted-foreground">
              Average mastery per subject — only started subjects shown.
            </p>
            {radarData.length === 0 ? (
              <p className="mt-8 text-center text-sm text-muted-foreground">No activity yet for this student.</p>
            ) : (
              <div className="mt-4 h-[340px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} outerRadius="78%">
                    <PolarGrid stroke="oklch(0.30 0.03 280)" />
                    <PolarAngleAxis
                      dataKey="subject"
                      tick={{ fill: "oklch(0.85 0.02 280)", fontSize: 11, fontWeight: 500 }}
                    />
                    <PolarRadiusAxis
                      angle={90}
                      domain={[0, 100]}
                      tick={{ fill: "oklch(0.55 0.02 280)", fontSize: 10 }}
                      stroke="oklch(0.30 0.03 280)"
                    />
                    <Radar
                      name="Mastery"
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
            )}
          </div>

          <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6 shadow-card">
            <h3 className="font-display text-lg font-semibold">Recurring errors</h3>
            {insights.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">No repeated errors found — great work!</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {insights.map((i, idx) => (
                  <li
                    key={idx}
                    className={cn(
                      "rounded-xl border p-4",
                      i.severity === "destructive"
                        ? "border-destructive/40 bg-destructive/5"
                        : "border-warning/40 bg-warning/5",
                    )}
                  >
                    <p className="text-sm font-medium leading-snug">{i.text}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <p className="text-xs text-muted-foreground">{i.topic}</p>
                      <span className="text-xs text-muted-foreground">· {i.count}×</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      <TeacherAccommodationsCard studentId={student.id} studentName={student.full_name} />
    </div>
  );
}

const CONDITION_OPTIONS: { key: ConditionKey; label: string }[] = [
  { key: "adhd", label: "ADHD" },
  { key: "dyslexia", label: "Dyslexia" },
  { key: "autism", label: "Autism spectrum" },
  { key: "dyscalculia", label: "Dyscalculia" },
  { key: "anxiety", label: "Anxiety" },
  { key: "low_working_memory", label: "Low working memory" },
  { key: "other", label: "Other" },
];
const SEVERITY_OPTIONS: { key: "mild" | "moderate" | "significant"; label: string }[] = [
  { key: "mild", label: "Mild" },
  { key: "moderate", label: "Moderate" },
  { key: "significant", label: "Significant" },
];

function paceSummary(p: PaceProfileResult): string {
  const parts = [
    `${p.session_length} questions per block`,
    p.break_cadence > 0 ? `break every ${p.break_cadence}` : "no scheduled breaks",
    `${p.difficulty_ramp} difficulty ramp`,
    p.time_limits === "off" ? "no timers" : p.time_limits === "extended" ? "extra time" : "normal timers",
    p.feedback_style === "paused_explanation" ? "pause & explain feedback" : "instant feedback",
  ];
  return parts.join(" · ");
}

/**
 * Teacher-facing support planner. The teacher enters the student's KNOWN condition(s) —
 * the app NEVER infers them — and the backend derives an evidence-based accommodation +
 * pace profile (deterministic baseline, LLM-refined when notes are given). Manual
 * fine-tuning stays available as an advanced override.
 */
function TeacherAccommodationsCard({
  studentId,
  studentName,
}: {
  studentId: string;
  studentName: string;
}) {
  const [prefs, setPrefs] = useState<Partial<StudentPrefs> | null>(null);
  const [conditions, setConditions] = useState<Set<ConditionKey>>(new Set());
  const [severity, setSeverity] = useState<"mild" | "moderate" | "significant">("mild");
  const [notes, setNotes] = useState("");
  const [derived, setDerived] = useState<DeriveAccommodationsResult | null>(null);
  const [acc, setAcc] = useState<AccommodationPrefs>(DEFAULT_ACCOMMODATIONS);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void supabase
      .from("profiles")
      .select("preferences")
      .eq("id", studentId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { setError(error.message); setLoading(false); return; }
        const p = (data?.preferences ?? {}) as Partial<StudentPrefs> & {
          condition_profile?: { conditions?: ConditionKey[]; severity?: string; notes?: string; derived_by?: string };
          pace_profile?: PaceProfileResult;
        };
        setPrefs(p);
        setAcc({ ...DEFAULT_ACCOMMODATIONS, ...(p.accommodations ?? {}) });
        const cp = p.condition_profile;
        if (cp) {
          setConditions(new Set(cp.conditions ?? []));
          if (cp.severity === "mild" || cp.severity === "moderate" || cp.severity === "significant") setSeverity(cp.severity);
          setNotes(cp.notes ?? "");
          if (p.pace_profile) {
            setDerived({
              student_id: studentId,
              accommodations: (p.accommodations ?? {}) as Record<string, boolean>,
              pace_profile: p.pace_profile,
              rationale: "",
              derived_by: (cp.derived_by === "ai" ? "ai" : "rules"),
            });
          }
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [studentId]);

  const toggleCondition = (key: ConditionKey) => {
    setConditions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const result = await deriveAccommodations({
        student_id: studentId,
        conditions: Array.from(conditions),
        severity,
        notes: notes.trim() || undefined,
      });
      setDerived(result);
      setAcc({ ...DEFAULT_ACCOMMODATIONS, ...(result.accommodations as Partial<AccommodationPrefs>) });
      setPrefs((prev) => ({ ...(prev ?? {}), accommodations: result.accommodations as unknown as AccommodationPrefs }));
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1600);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate plan");
    } finally {
      setGenerating(false);
    }
  };

  // Advanced manual override — writes a single flag directly (RLS-allowed UPDATE).
  const toggleFlag = async (key: keyof AccommodationPrefs, value: boolean) => {
    const nextAcc = { ...acc, [key]: value };
    setAcc(nextAcc);
    const nextPrefs = { ...(prefs ?? {}), accommodations: nextAcc };
    const { error } = await supabase
      .from("profiles")
      .update({ preferences: nextPrefs as unknown as Json })
      .eq("id", studentId);
    if (error) { setAcc(acc); setError(error.message); return; }
    setPrefs(nextPrefs);
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-lg font-semibold">Learning support plan</h3>
          <p className="text-sm text-muted-foreground">
            Tell us what {studentName} needs support with — we'll set the right supports and adapt the pace.
            You're recording a known need, not a diagnosis.
          </p>
        </div>
        {savedFlash && <span className="text-xs font-medium text-success">✓ Saved</span>}
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          {/* Condition picker */}
          <div>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
              Condition(s)
            </div>
            <div className="flex flex-wrap gap-2">
              {CONDITION_OPTIONS.map(({ key, label }) => {
                const active = conditions.has(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleCondition(key)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm transition",
                      active
                        ? "border-primary bg-primary/15 text-primary font-semibold"
                        : "border-border bg-card/60 text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Severity */}
          <div>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
              Level of support
            </div>
            <div className="flex gap-2">
              {SEVERITY_OPTIONS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSeverity(key)}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition",
                    severity === key
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card/60 text-muted-foreground hover:border-primary/40",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="acc-notes" className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
              Notes (optional — helps tailor the plan)
            </Label>
            <textarea
              id="acc-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Strong reader but freezes under time pressure"
              className="mt-1.5 w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <Button
            onClick={generate}
            disabled={generating || conditions.size === 0}
            className="w-full bg-gradient-primary shadow-glow hover:opacity-95"
          >
            {generating ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />Building plan…</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-2" />Generate support plan</>
            )}
          </Button>

          {/* Derived plan preview */}
          {derived && (
            <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                  {derived.derived_by === "ai" ? "AI-tailored" : "Evidence-based"}
                </span>
                <span className="text-sm font-semibold">Active plan</span>
              </div>
              {derived.rationale && (
                <p className="text-xs text-muted-foreground">{derived.rationale}</p>
              )}
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">Pace</div>
                <p className="text-sm">{paceSummary(derived.pace_profile)}</p>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">Supports on</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {ACCOMMODATION_GROUPS.flatMap((g) => g.items)
                    .filter((i) => acc[i.key])
                    .map((i) => (
                      <span key={i.key} className="rounded-md bg-card px-2 py-0.5 text-xs border border-border">
                        {i.label}
                      </span>
                    ))}
                  {ACCOMMODATION_GROUPS.flatMap((g) => g.items).every((i) => !acc[i.key]) && (
                    <span className="text-xs text-muted-foreground">None</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Advanced manual override */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-xs font-medium text-primary hover:underline"
            >
              {showAdvanced ? "Hide advanced" : "Advanced: fine-tune individual supports"}
            </button>
            {showAdvanced && (
              <div className="mt-3 grid gap-4 sm:grid-cols-3">
                {ACCOMMODATION_GROUPS.map(({ group, items }) => (
                  <div key={group}>
                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">{group}</div>
                    <div className="rounded-xl border border-border bg-card/60 overflow-hidden divide-y divide-border">
                      {items.map(({ key, label, hint }) => (
                        <div key={key} className="flex items-center justify-between gap-2 px-3 py-2.5">
                          <div className="pr-2">
                            <div className="text-sm font-medium">{label}</div>
                            <div className="text-xs text-muted-foreground">{hint}</div>
                          </div>
                          <Switch
                            checked={acc[key]}
                            onCheckedChange={(v) => void toggleFlag(key, v)}
                            aria-label={`${label} for ${studentName}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
