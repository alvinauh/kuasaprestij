import { useEffect, useState } from "react";
import { Target, BookOpen, Sparkles, School, ClipboardList, LayoutDashboard, ChevronDown } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { setViewAsStudent } from "@/lib/viewAs";
import {
  fetchDiagnosticProgress,
  fetchAssignmentsForStudent,
  fetchStudentAiTasks,
  isStudentInAnyClass,
  fetchSubjects,
  startAiTask,
  type DiagnosticProgress,
  type Assignment,
  type AiTask,
  type SubjectWithTopics,
} from "@/services/api";

export type StudyMode = "diagnostic" | "free_practice" | "join_class" | "assignments";

interface Props {
  studentId: string;
  formLevel: number;
  initialMode?: StudyMode | null;
  onStart: (mode: StudyMode) => void;
  onFreePractice?: (subject: string, topic: string) => void;
  onJoinClass?: (code: string) => Promise<void>;
  onStartAssignment?: (assignment: Assignment) => void;
}

export function StudyModeSelect({
  studentId,
  formLevel,
  initialMode,
  onStart,
  onFreePractice,
  onJoinClass,
  onStartAssignment,
}: Props) {
  const { lang } = useI18n();
  const isMs = lang === "ms";
  const navigate = useNavigate();
  const { profile } = useAuth();
  // Teachers/admins only reach this screen via "view as student"; they own
  // classes rather than belong to them, so the student task list is always empty.
  const isTeacherPreview = profile?.role === "teacher" || profile?.role === "admin";
  const [progress, setProgress] = useState<DiagnosticProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<StudyMode | null>(initialMode ?? null);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [aiTasks, setAiTasks] = useState<AiTask[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [inClass, setInClass] = useState(false);
  // Free Practice subject/topic picker
  const [fpSubjects, setFpSubjects] = useState<SubjectWithTopics[]>([]);
  const [fpSubjectsLoading, setFpSubjectsLoading] = useState(false);
  const [fpSubject, setFpSubject] = useState<string>("");
  const [fpTopic, setFpTopic] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchDiagnosticProgress(studentId, formLevel).then((p) => {
      if (cancelled) return;
      setProgress(p);
      setLoading(false);
      if (!initialMode && p && !p.diagnostic_complete && p.questions_answered > 0) {
        setSelected("diagnostic");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [studentId, formLevel, initialMode]);

  useEffect(() => {
    if (selected !== "assignments" || isTeacherPreview) return;
    setAssignmentsLoading(true);
    void Promise.all([
      fetchAssignmentsForStudent(studentId),
      fetchStudentAiTasks(studentId),
      isStudentInAnyClass(studentId),
    ]).then(([cls, ai, member]) => {
      setAssignments(cls);
      setAiTasks(ai);
      setInClass(member);
    }).finally(() => setAssignmentsLoading(false));
  }, [selected, studentId, isTeacherPreview]);

  useEffect(() => {
    if (selected !== "free_practice" || fpSubjects.length > 0) return;
    setFpSubjectsLoading(true);
    void fetchSubjects(formLevel)
      .then((s) => { setFpSubjects(s); if (s.length > 0) setFpSubject(s[0].subject); })
      .finally(() => setFpSubjectsLoading(false));
  }, [selected, formLevel, fpSubjects.length]);

  useEffect(() => {
    if (!fpSubject) return;
    const subj = fpSubjects.find((s) => s.subject === fpSubject);
    setFpTopic(subj?.topics?.[0] ?? "");
  }, [fpSubject, fpSubjects]);

  const answered = progress?.questions_answered ?? 0;
  const total = progress?.total ?? 10;
  const complete = !!progress?.diagnostic_complete;
  const inProgress = !complete && answered > 0 && answered < total;
  const fresh = !complete && answered === 0;

  return (
    <div className="relative min-h-[100dvh] bg-[linear-gradient(180deg,#1a0533_0%,#2d0a6e_100%)] text-foreground overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,oklch(0.65_0.24_295/0.35),transparent_60%)]" />
      <main className="relative z-10 mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center gap-6 px-4 py-10">
        <div className="flex items-center justify-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-primary shadow-glow">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-display text-xl font-bold tracking-tight">Skor</span>
        </div>

        <div className="rounded-2xl border border-indigo-400/40 bg-[#1a0e3f]/80 p-6 backdrop-blur shadow-glow">
          <h1 className="text-center font-display text-2xl font-bold text-white">
            {isMs ? "Bagaimana anda ingin belajar hari ini?" : "How do you want to study today?"}
          </h1>

          <div className="mt-6 flex flex-col gap-3">
            {/* Diagnostic */}
            <button
              type="button"
              onClick={() => onStart("diagnostic")}
              className={cn(
                "rounded-xl border-2 p-5 text-left transition",
                selected === "diagnostic"
                  ? "border-white ring-2 ring-white bg-indigo-500/20"
                  : "border-indigo-400 bg-indigo-900/30 hover:bg-indigo-800/40",
              )}
            >
              <div className="flex items-start gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-indigo-500/30">
                  <Target className="h-6 w-6 text-indigo-200" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-lg font-bold text-white">
                      {isMs ? "Ujian Diagnostik" : "Diagnostic Test"}
                    </h2>
                    {fresh && (
                      <span className="rounded-full bg-yellow-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-yellow-950">
                        {isMs ? "Disyorkan" : "Recommended"}
                      </span>
                    )}
                  </div>
                  {loading ? (
                    <p className="mt-1 text-sm text-indigo-200/60">
                      {isMs ? "Menyemak kemajuan anda…" : "Checking your progress…"}
                    </p>
                  ) : complete ? (
                    <p className="mt-1 text-sm text-indigo-100">
                      {isMs
                        ? "✅ Selesai! Ketuk untuk ulang atau lihat Jurulatih Belajar anda."
                        : "✅ Completed! Tap to retake or view your Study Coach."}
                    </p>
                  ) : inProgress ? (
                    <>
                      <p className="mt-1 text-sm text-indigo-100">
                        {isMs ? `Sambung — ${answered}/${total} selesai` : `Resume — ${answered}/${total} done`}
                      </p>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-indigo-800">
                        <div
                          className="h-full rounded-full bg-indigo-300 transition-all"
                          style={{ width: `${(answered / Math.max(1, total)) * 100}%` }}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="mt-1 text-sm text-indigo-100">
                        {isMs ? `${total} soalan merentas semua subjek anda` : `${total} questions across all your subjects`}
                      </p>
                      <p className="mt-0.5 text-xs text-indigo-200/80">
                        {isMs ? "Buka laporan Jurulatih AI anda selepas tamat" : "Unlock your AI Study Coach report when done"}
                      </p>
                    </>
                  )}
                </div>
              </div>
            </button>

            {/* Dashboard shortcut */}
            <button
              type="button"
              onClick={() => void navigate({ to: "/dashboard" })}
              className="rounded-xl border-2 border-indigo-400 bg-indigo-900/30 p-5 text-left transition hover:bg-indigo-800/40"
            >
              <div className="flex items-start gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-indigo-500/30">
                  <LayoutDashboard className="h-6 w-6 text-indigo-200" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-lg font-bold text-white">
                    {isMs ? "Papan Pemuka" : "Dashboard"}
                  </h2>
                  <p className="mt-1 text-sm text-indigo-100">
                    {isMs
                      ? "Semak skor, streak, dan muat turun pek luar talian"
                      : "Check scores, streaks, and download offline pack"}
                  </p>
                </div>
              </div>
            </button>

            {/* Free practice */}
            <button
              type="button"
              onClick={() => setSelected("free_practice")}
              className={cn(
                "rounded-xl border-2 p-5 text-left transition",
                selected === "free_practice"
                  ? "border-white ring-2 ring-white bg-indigo-500/20"
                  : "border-indigo-400 bg-indigo-900/30 hover:bg-indigo-800/40",
              )}
            >
              <div className="flex items-start gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-indigo-500/30">
                  <BookOpen className="h-6 w-6 text-indigo-200" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-lg font-bold text-white">
                    {isMs ? "Latihan Bebas" : "Free Practice"}
                  </h2>
                  <p className="mt-1 text-sm text-indigo-100">
                    {isMs ? "Pilih mana-mana subjek dan topik untuk berlatih" : "Pick any subject and topic to practise"}
                  </p>
                </div>
              </div>

              {/* Inline subject/topic picker — expands when Free Practice is selected */}
              {selected === "free_practice" && (
                <div className="mt-4 space-y-3" onClick={(e) => e.stopPropagation()}>
                  {fpSubjectsLoading ? (
                    <p className="text-xs text-indigo-200/60 text-center py-2">
                      {isMs ? "Memuatkan subjek…" : "Loading subjects…"}
                    </p>
                  ) : (
                    <>
                      {/* Subject selector */}
                      <div className="relative">
                        <label className="mb-1 block text-[10px] uppercase tracking-widest text-indigo-300/70">
                          {isMs ? "Subjek" : "Subject"}
                        </label>
                        <div className="relative">
                          <select
                            value={fpSubject}
                            onChange={(e) => setFpSubject(e.target.value)}
                            className="w-full appearance-none rounded-xl border border-indigo-400/50 bg-indigo-950/60 px-4 py-2.5 pr-8 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                          >
                            {fpSubjects.map((s) => (
                              <option key={s.subject} value={s.subject} className="bg-indigo-950">
                                {s.display_label}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-300/60" />
                        </div>
                      </div>

                      {/* Topic selector */}
                      {fpSubject && (
                        <div>
                          <label className="mb-1 block text-[10px] uppercase tracking-widest text-indigo-300/70">
                            {isMs ? "Topik" : "Topic"}
                          </label>
                          <div className="relative">
                            <select
                              value={fpTopic}
                              onChange={(e) => setFpTopic(e.target.value)}
                              className="w-full appearance-none rounded-xl border border-indigo-400/50 bg-indigo-950/60 px-4 py-2.5 pr-8 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            >
                              {(fpSubjects.find((s) => s.subject === fpSubject)?.topics ?? []).map((t) => (
                                <option key={t} value={t} className="bg-indigo-950">{t}</option>
                              ))}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-300/60" />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </button>

            {/* Assigned Tasks */}
            <button
              type="button"
              onClick={() => setSelected("assignments")}
              className={cn(
                "rounded-xl border-2 p-5 text-left transition",
                selected === "assignments"
                  ? "border-white ring-2 ring-white bg-indigo-500/20"
                  : "border-indigo-400 bg-indigo-900/30 hover:bg-indigo-800/40",
              )}
            >
              <div className="flex items-start gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-indigo-500/30">
                  <ClipboardList className="h-6 w-6 text-indigo-200" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-lg font-bold text-white">
                    {isMs ? "Tugasan Diberi" : "Assigned Tasks"}
                  </h2>
                  <p className="mt-1 text-sm text-indigo-100">
                    {isMs ? "Tugasan dari guru anda" : "Tasks from your teacher"}
                  </p>
                </div>
              </div>
            </button>

            {/* Join Class */}
            <button
              type="button"
              onClick={() => setSelected("join_class")}
              className={cn(
                "rounded-xl border-2 p-5 text-left transition",
                selected === "join_class"
                  ? "border-white ring-2 ring-white bg-indigo-500/20"
                  : "border-indigo-400 bg-indigo-900/30 hover:bg-indigo-800/40",
              )}
            >
              <div className="flex items-start gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-indigo-500/30">
                  <School className="h-6 w-6 text-indigo-200" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-lg font-bold text-white">
                    {isMs ? "Sertai Kelas" : "Join Class"}
                  </h2>
                  <p className="mt-1 text-sm text-indigo-100">
                    {isMs ? "Masukkan kod jemputan guru anda" : "Enter your teacher's invite code"}
                  </p>
                </div>
              </div>
            </button>
          </div>

          {selected === "join_class" && (
            <div className="mt-3">
              <Input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder={isMs ? "Kod jemputan" : "Invite code"}
                className="h-12 rounded-xl border-indigo-400/60 bg-indigo-900/40 text-center text-lg font-bold uppercase tracking-widest text-white placeholder:text-indigo-300/60 focus-visible:ring-white"
                maxLength={16}
              />
            </div>
          )}

          {selected === "assignments" && (
            <div className="mt-3 space-y-2 max-h-72 overflow-auto rounded-xl border border-indigo-400/40 bg-indigo-950/40 p-2">
              {isTeacherPreview ? (
                <div className="space-y-3 p-3 text-center">
                  <p className="text-sm text-indigo-100">
                    {isMs
                      ? "Anda sedang melihat sebagai pelajar. Tugasan anda ada di Papan Guru → Tugasan Diberi."
                      : "You're previewing as a student. Your tasks are in Teacher view → Assigned Tasks."}
                  </p>
                  <Button
                    type="button"
                    onClick={() => {
                      setViewAsStudent(false);
                      void navigate({ to: "/teacher", search: { tab: "assignments" } });
                    }}
                    className="w-full rounded-xl bg-indigo-500 font-bold text-white hover:bg-indigo-400"
                  >
                    <LayoutDashboard className="mr-2 h-4 w-4" />
                    {isMs ? "Buka Tugasan Diberi di Papan Guru" : "Open Assigned Tasks in Teacher view"}
                  </Button>
                </div>
              ) : assignmentsLoading ? (
                <p className="p-3 text-center text-sm text-indigo-200/80">
                  {isMs ? "Memuatkan tugasan…" : "Loading tasks…"}
                </p>
              ) : assignments.length === 0 && aiTasks.length === 0 ? (
                <p className="p-3 text-center text-sm text-indigo-200/80">
                  {inClass
                    ? (isMs ? "Belum ada tugasan daripada guru anda." : "No tasks from your teacher yet.")
                    : (isMs ? "Tiada tugasan lagi. Sertai kelas dahulu." : "No tasks yet. Join a class first.")}
                </p>
              ) : (
                <>
                  {assignments.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => onStartAssignment?.(a)}
                      className="w-full rounded-lg border border-indigo-400/40 bg-indigo-900/40 p-3 text-left text-white hover:bg-indigo-800/50 transition"
                    >
                      <div className="font-semibold text-sm">{a.title}</div>
                      <div className="mt-0.5 text-xs text-indigo-200/80">
                        {[a.subject, a.topic, a.form_level && `Form ${a.form_level}`]
                          .filter(Boolean)
                          .join(" · ") || "Practice"}
                      </div>
                      {a.instructions && (
                        <div className="mt-1 text-xs text-indigo-100/90 line-clamp-2">
                          {a.instructions}
                        </div>
                      )}
                      {a.due_at && (
                        <div className="mt-1 text-[10px] uppercase tracking-wider text-yellow-300">
                          Due {new Date(a.due_at).toLocaleDateString()}
                        </div>
                      )}
                    </button>
                  ))}
                  {aiTasks.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        void startAiTask(t.id);
                        // A lesson task with a generated deck opens the slide deck
                        // (deck + tutor + practice CTA live on the lesson page).
                        if (t.task_type === "lesson" && t.lesson_id) {
                          void navigate({
                            to: "/lesson/$lessonId",
                            params: { lessonId: t.lesson_id },
                            search: {
                              taskId: t.id,
                              subject: t.subject,
                              topic: t.topic,
                            },
                          });
                          return;
                        }
                        // A quiz the teacher sent from Command Centre plays its exact questions.
                        if (t.task_type === "quiz" && t.quiz_id) {
                          void navigate({
                            to: "/assigned-quiz/$quizId",
                            params: { quizId: t.quiz_id },
                            search: { taskId: t.id },
                          });
                          return;
                        }
                        onStartAssignment?.({
                          id: t.id,
                          classroom_id: "",
                          teacher_id: "",
                          title: `${t.task_type === "lesson" ? "📖" : t.task_type === "practice" ? "🎯" : "✏️"} ${t.topic}`,
                          instructions: t.instructions,
                          subject: t.subject,
                          topic: t.topic,
                          form_level: null,
                          question_type: t.task_type === "lesson" ? "mcq" : t.task_type,
                          due_at: t.due_at ?? null,
                          created_at: t.assigned_at,
                        });
                      }}
                      className="w-full rounded-lg border border-violet-400/50 bg-violet-900/30 p-3 text-left text-white hover:bg-violet-800/40 transition"
                    >
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-violet-500/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-200">
                          AI Task
                        </span>
                        <span className="font-semibold text-sm">{t.topic}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-indigo-200/80">{t.subject}</div>
                      {t.instructions && (
                        <div className="mt-1 text-xs text-indigo-100/90 line-clamp-2">
                          {t.instructions}
                        </div>
                      )}
                      {t.due_at && (
                        <div className="mt-1 text-[10px] uppercase tracking-wider text-yellow-300">
                          Due {new Date(t.due_at).toLocaleDateString()}
                        </div>
                      )}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}

          <Button
            onClick={() => {
              if (selected === "join_class") {
                if (!joinCode.trim() || !onJoinClass) return;
                setJoining(true);
                void onJoinClass(joinCode.trim()).finally(() => {
                  setJoining(false);
                  setJoinCode("");
                  setSelected(null);
                });
              } else if (selected === "assignments") {
                return;
              } else if (selected === "free_practice") {
                if (onFreePractice && fpSubject && fpTopic) {
                  onFreePractice(fpSubject, fpTopic);
                } else {
                  onStart(selected);
                }
              } else if (selected) {
                onStart(selected);
              }
            }}
            disabled={
              !selected ||
              (selected === "join_class" && !joinCode.trim()) ||
              (selected === "free_practice" && fpSubjectsLoading) ||
              selected === "assignments" ||
              joining
            }
            className="mt-6 h-14 w-full rounded-xl bg-indigo-500 text-base font-bold text-white shadow-glow hover:bg-indigo-400 disabled:opacity-50"
          >
            {joining
              ? (isMs ? "Menyertai…" : "Joining…")
              : selected === "join_class"
                ? (isMs ? "Sertai Kelas →" : "Join Class →")
                : selected === "assignments"
                  ? (isMs ? "Pilih tugasan di atas" : "Pick a task above")
                  : (isMs ? "Jom Mulakan →" : "Let's Go →")}
          </Button>
        </div>
      </main>
    </div>
  );
}
