import { useEffect, useState, useCallback } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BookOpen,
  Loader2,
  Search,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  FileText,
  ListChecks,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { BASE_URL } from "@/services/api";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/library")({
  head: () => ({
    meta: [
      { title: "Content Library — Skor" },
      { name: "description", content: "Browse all past questions and slides generated for you." },
    ],
  }),
  component: ContentLibrary,
});

interface QuestionRow {
  topic?: string;
  subject?: string;
  language?: string;
  form_level?: number;
  question_text?: string;
  question_type?: string;
  options_json?: unknown;
  correct_answer?: string;
  is_correct?: boolean;
  created_at?: string;
  // anchor fields (teacher/admin)
  question_bank?: Array<{ question: string; options?: string[]; answer?: string; kbat_level?: string }>;
  mnemonic_lyrics?: string;
}

interface SlideRow {
  id: string;
  topic?: string;
  subject?: string;
  form_level?: number;
  language?: string;
  title?: string;
  created_at?: string;
}

interface LibraryData {
  questions: QuestionRow[];
  slides: SlideRow[];
  role: string;
}

async function fetchLibrary(params: { search?: string; subject?: string }): Promise<LibraryData> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const qs = new URLSearchParams({ limit: "80" });
  if (params.search) qs.set("search", params.search);
  if (params.subject) qs.set("subject", params.subject);
  const res = await fetch(`${BASE_URL}/content_library?${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

function ContentLibrary() {
  const { profile } = useAuth();
  const [data, setData] = useState<LibraryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [activeTab, setActiveTab] = useState<"questions" | "slides">("questions");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Debounce search input by 400 ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchLibrary({ search: debouncedSearch || undefined, subject: subjectFilter || undefined })
      .then(setData)
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => setLoading(false));
  }, [debouncedSearch, subjectFilter]);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const backTo = profile?.role === "student" ? "/" : "/teacher";
  const backLabel = profile?.role === "student" ? "Dashboard" : "Teacher Dashboard";

  const questions = data?.questions ?? [];
  const slides = data?.slides ?? [];
  const isTeacherOrAdmin = data?.role === "teacher" || data?.role === "admin";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link
            to={backTo}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Link>
          <div className="flex flex-1 items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary shrink-0" />
            <h1 className="font-display text-base font-bold sm:text-lg">Content Library</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by topic, subject, or question…"
              className="w-full rounded-xl border border-border bg-card/60 py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <input
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            placeholder="Filter by subject"
            className="rounded-xl border border-border bg-card/60 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 sm:w-48"
          />
        </div>

        {/* Tabs */}
        <nav className="inline-flex rounded-full border border-border bg-card/60 p-1 text-sm">
          {(["questions", "slides"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={cn(
                "flex items-center gap-2 rounded-full px-4 py-1.5 font-medium transition",
                activeTab === t
                  ? "bg-gradient-primary text-primary-foreground shadow-glow"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "questions" ? <ListChecks className="h-4 w-4 shrink-0" /> : <FileText className="h-4 w-4 shrink-0" />}
              {t === "questions" ? `Questions (${questions.length})` : `Slides (${slides.length})`}
            </button>
          ))}
        </nav>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading content…
          </div>
        )}
        {error && !loading && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && !error && activeTab === "questions" && (
          questions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No questions found.</p>
          ) : (
            <div className="space-y-2">
              {isTeacherOrAdmin
                ? /* Teacher/admin: anchor rows with question_bank array */
                  questions.map((row, i) => {
                    const bank = Array.isArray(row.question_bank) ? row.question_bank : [];
                    const key = `q-${i}`;
                    const open = expanded.has(key);
                    return (
                      <div
                        key={key}
                        className="rounded-xl border border-border bg-card/60"
                      >
                        <button
                          onClick={() => toggleExpand(key)}
                          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{row.topic || "—"}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {row.subject} · {row.language} · Form {row.form_level} · {bank.length} question{bank.length !== 1 ? "s" : ""}
                            </p>
                          </div>
                          {open ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                        </button>
                        {open && (
                          <div className="divide-y divide-border border-t border-border">
                            {bank.length === 0 && (
                              <p className="px-4 py-3 text-xs text-muted-foreground">No questions cached yet.</p>
                            )}
                            {bank.map((q, qi) => (
                              <div key={qi} className="px-4 py-3 text-sm">
                                <p className="font-medium">{qi + 1}. {q.question}</p>
                                {Array.isArray(q.options) && q.options.length > 0 && (
                                  <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                                    {q.options.map((opt, oi) => (
                                      <li key={oi} className={cn("flex items-center gap-1", opt === q.answer && "text-green-400 font-medium")}>
                                        {opt === q.answer && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                                        {opt}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                                {q.answer && !Array.isArray(q.options) && (
                                  <p className="mt-1 text-xs text-green-400">Answer: {q.answer}</p>
                                )}
                                {q.kbat_level && (
                                  <span className="mt-1.5 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                                    {q.kbat_level}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                : /* Student: individual question rows from event_logs */
                  questions.map((row, i) => {
                    const key = `q-${i}`;
                    const open = expanded.has(key);
                    const opts = Array.isArray(row.options_json) ? row.options_json as string[] : [];
                    return (
                      <div key={key} className="rounded-xl border border-border bg-card/60">
                        <button
                          onClick={() => toggleExpand(key)}
                          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-sm font-medium">{row.question_text}</p>
                            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{row.topic}</span>
                              {row.subject && <span>· {row.subject}</span>}
                              {row.is_correct != null && (
                                row.is_correct
                                  ? <CheckCircle2 className="h-3 w-3 text-green-400" />
                                  : <XCircle className="h-3 w-3 text-destructive" />
                              )}
                            </div>
                          </div>
                          {open ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                        </button>
                        {open && (
                          <div className="border-t border-border px-4 py-3 text-sm">
                            {opts.length > 0 && (
                              <ul className="space-y-1 text-xs text-muted-foreground">
                                {opts.map((opt, oi) => (
                                  <li key={oi} className={cn("flex items-center gap-1", opt === row.correct_answer && "text-green-400 font-medium")}>
                                    {opt === row.correct_answer && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                                    {opt}
                                  </li>
                                ))}
                              </ul>
                            )}
                            {row.correct_answer && opts.length === 0 && (
                              <p className="text-xs text-green-400">Answer: {row.correct_answer}</p>
                            )}
                            {row.created_at && (
                              <p className="mt-2 text-[11px] text-muted-foreground">
                                {new Date(row.created_at).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
              }
            </div>
          )
        )}

        {!loading && !error && activeTab === "slides" && (
          slides.length === 0 ? (
            <p className="text-sm text-muted-foreground">No slides found.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {slides.map((slide) => (
                <Link
                  key={slide.id}
                  to="/lesson/$lessonId"
                  params={{ lessonId: slide.id }}
                  className="group rounded-xl border border-border bg-card/60 px-4 py-3 transition hover:border-primary/40 hover:bg-card"
                >
                  <p className="line-clamp-1 text-sm font-semibold group-hover:text-primary">
                    {slide.title || slide.topic || "Untitled Lesson"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {slide.subject}
                    {slide.form_level ? ` · Form ${slide.form_level}` : ""}
                    {slide.language ? ` · ${slide.language}` : ""}
                  </p>
                  {slide.created_at && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      {new Date(slide.created_at).toLocaleDateString()}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          )
        )}
      </main>
    </div>
  );
}
